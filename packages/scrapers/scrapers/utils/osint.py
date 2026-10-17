"""
OSINT contact-intelligence utilities — the "best-effort, multiple-fallback"
email discovery/verification layer for enrichment (SRS §4.5, §6.2).

Design goals (product correction: strongest possible OSINT stack, India-first,
never fabricate a contact as if verified):

  1. Email PATTERN GENERATION — generate the standard corporate address shapes
     from a person's name + a company's real email domain (the pattern actually
     observed at that company, when we can detect it, else common variants).
  2. MX VALIDATION — an address is worthless if the domain can't receive mail.
     Uses dnspython (already a transitive dep) — no new dependency.
  3. SMTP MAILFROM probe — optional, best-effort, never sends anything; treats
     timeouts/anti-bot as "unknown", never as "invalid" (avoids false negatives).
  4. Pattern DISCOVERY — learn the company's real format from already-known
     addresses (provenance from prior scrapes/enrichment) before guessing.

Every returned value carries a confidence score; the caller must never
overwrite a higher-confidence existing value with a lower-confidence guess
(§6.3 golden rule) — that guard lives in the enrichment worker, not here.
"""

from __future__ import annotations

import re
import asyncio
import logging
from typing import Any

logger = logging.getLogger(__name__)

try:
    import dns.resolver
    _DNS_AVAILABLE = True
except Exception:  # pragma: no cover - environment dependent
    dns = None
    _DNS_AVAILABLE = False


# ── 1. Email pattern generation ───────────────────────────────────────────────
# Common corporate formats, ordered by prevalence at Indian IT/services firms.
_PATTERNS = (
    "{first}.{last}",
    "{first}{last}",
    "{first}_{last}",
    "{first[0]}{last}",
    "{first}.{last[0]}",
    "{first}",
    "{first}.{middle}{last}",
)


def _name_parts(hr_name: str) -> dict[str, str]:
    """Split a display name into first/middle/last tokens, stripped of noise."""
    tokens = [re.sub(r"[^a-z]", "", t.lower()) for t in re.split(r"\s+", hr_name.strip())]
    tokens = [t for t in tokens if t]
    if not tokens:
        return {"first": "", "middle": "", "last": ""}
    if len(tokens) == 1:
        return {"first": tokens[0], "middle": "", "last": ""}
    if len(tokens) == 2:
        return {"first": tokens[0], "middle": "", "last": tokens[1]}
    return {"first": tokens[0], "middle": "".join(tokens[1:-1]), "last": tokens[-1]}


def _render(pattern: str, parts: dict[str, str]) -> str:
    first, middle, last = parts["first"], parts["middle"], parts["last"]
    # Guard against empty slices on very short names.
    fmt = {
        "first": first,
        "first[0]": first[:1],
        "last": last,
        "last[0]": last[:1],
        "middle": middle,
    }
    out = pattern
    out = out.replace("{first[0]}", fmt["first[0]"])
    out = out.replace("{last[0]}", fmt["last[0]"])
    out = out.replace("{first}", fmt["first"])
    out = out.replace("{middle}", fmt["middle"])
    out = out.replace("{last}", fmt["last"])
    return out


def generate_email_candidates(hr_name: str, domain: str) -> list[str]:
    """Return deduped candidate personal emails for hr_name@domain, best first."""
    parts = _name_parts(hr_name)
    if not domain or not (parts["first"] or parts["last"]):
        return []
    domain = domain.lower().lstrip("@").strip()
    seen: set[str] = set()
    out: list[str] = []
    for pat in _PATTERNS:
        local = _render(pat, parts)
        if not local or len(local) < 2:
            continue
        email = f"{local}@{domain}"
        if email not in seen:
            seen.add(email)
            out.append(email)
    return out


# ── 2 + 3. MX + SMTP validation ───────────────────────────────────────────────
async def validate_mx(domain: str) -> bool:
    """True if the mail domain has an MX (or an A record usable for mail)."""
    if not _DNS_AVAILABLE:
        # No dnspython → cannot verify; caller treats as "unknown"/low confidence.
        return False
    try:
        loop = asyncio.get_event_loop()

        def _lookup() -> bool:
            try:
                answers = dns.resolver.resolve(domain, "MX")
                return len(answers) > 0
            except dns.resolver.NoAnswer:
                return False
            except Exception:
                # A record fallback: some small domains accept mail on A.
                try:
                    return len(dns.resolver.resolve(domain, "A")) > 0
                except Exception:
                    return False

        return await asyncio.wait_for(loop.run_in_executor(None, _lookup), timeout=5)
    except Exception as e:
        logger.debug(f"MX lookup failed for {domain}: {e}")
        return False


async def smtp_probe(email: str, timeout: float = 5.0) -> str:
    """Best-effort SMTP RCPT probe. Returns 'valid' | 'invalid' | 'unknown'.

    NEVER sends mail. Many providers disable VRFY/RCPT to strangers and answer
    with a generic 250; a connection error or timeout is 'unknown', not
    'invalid' — so this never produces a false negative that would drop a real
    contact.
    """
    import smtplib

    domain = email.split("@")[-1]
    try:
        loop = asyncio.get_event_loop()

        def _probe() -> str:
            try:
                with smtplib.SMTP(timeout=timeout) as s:
                    s.connect(domain, 25)
                    s.helo("hiregen.local")
                    s.mail("check@hiregen.local")
                    code, _ = s.rcpt(email)
                    if code == 250:
                        return "valid"
                    if code in (550, 551, 553):
                        return "invalid"
                    return "unknown"
            except Exception:
                # Blocked/no-port-25 (common in cloud/CI) → unknown, not invalid.
                return "unknown"

        return await asyncio.wait_for(loop.run_in_executor(None, _probe), timeout=timeout + 2)
    except Exception:
        return "unknown"


# ── 4. Pattern discovery from known company emails ────────────────────────────
def infer_pattern_from_sample(sample_email: str, domain: str,
                              first: str, last: str) -> str | None:
    """Given one real address at the company and a known name, infer the local
    format so future guesses match reality (highest-confidence OSINT heuristic).
    """
    if not sample_email or "@" not in sample_email:
        return None
    local = sample_email.split("@")[0].lower()
    first, last = first.lower(), last.lower()
    if not first:
        return None
    candidate_formats = {
        f"{first}.{last}": "{first}.{last}",
        f"{first}{last}": "{first}{last}",
        f"{first}_{last}": "{first}_{last}",
        f"{first[0]}{last}": "{first[0]}{last}",
        f"{first}.{last[0]}": "{first}.{last[0]}",
        f"{first}": "{first}",
    }
    return candidate_formats.get(local)


async def osint_find_email(
    hr_name: str,
    company_domain: str,
    known_company_emails: list[str] | None = None,
    verify: bool = True,
) -> dict[str, Any]:
    """Full OSINT email-finding cascade for one HR contact.

    Returns {email, confidence, method}. Confidence tiers:
      0.80  pattern inferred from a real company address + MX valid
      0.70  most-common pattern + MX valid + SMTP 'valid'
      0.50  most-common pattern + MX valid (SMTP unknown/invalid)
      0.00  nothing MX-resolvable
    """
    result = {"email": "", "confidence": 0.0, "method": ""}
    domain = (company_domain or "").lower().strip()
    if not domain or not hr_name:
        return result

    parts = _name_parts(hr_name)

    # 4 → learn the real format first, if a known company email is available.
    candidates: list[str] = []
    inferred = None
    for sample in (known_company_emails or []):
        if sample.endswith(f"@{domain}"):
            s_local = sample.split("@")[0]
            # infer using the sample's own name tokens if we can align them
            inferred = infer_pattern_from_sample(sample, domain, parts["first"], parts["last"])
            if inferred:
                candidates = [f"{_render(inferred, parts)}@{domain}"]
                break

    if not candidates:
        candidates = generate_email_candidates(hr_name, domain)

    for cand in candidates:
        mx_ok = (await validate_mx(domain)) if verify else True
        if not mx_ok:
            continue
        if verify:
            probe = await smtp_probe(cand)
        else:
            probe = "unknown"
        if inferred:
            conf = 0.80 if probe != "invalid" else 0.65
            method = "osint_inferred_pattern"
        elif probe == "valid":
            conf, method = 0.70, "osint_pattern_smtp_valid"
        else:
            conf, method = 0.50, "osint_pattern_mx_valid"
        return {"email": cand, "confidence": conf, "method": method}

    # MX never resolved for any candidate → no high-confidence answer.
    return result
