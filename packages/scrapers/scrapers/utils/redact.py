"""PII redaction for logs.

Privacy / DPDP compliance: personal contact data (email, phone) must NEVER be
written in cleartext to application logs. Logs are frequently shipped to third
party aggregators and retained far longer than the records themselves, so the
masking is applied at the point of logging rather than trusting operators to
scrub the sink.

These helpers keep just enough of the value to debug ("*abc@cor***e") without
re-identifying a specific person. Deterministic and cheap.
"""
from __future__ import annotations

import re


def redact_email(email: str | None) -> str:
    """Mask an email, preserving local-domain hint for ops triage.

    ''/None -> '<none>'; a 5-char local part keeps its first char, the rest is
    masked, and the domain keeps its TLD only: 'john@corp.example' -> 'j***@***.example'.
    """
    if not email:
        return "<none>"
    email = str(email).strip()
    if "@" not in email:
        # not obviously an email; mask all but last 2 chars
        return email[:1] + "***"
    local, _, domain = email.partition("@")
    head = local[0] if local else ""
    masked_local = (head + "***") if head else "***"
    tld = domain.rsplit(".", 1)[-1] if "." in domain else domain
    return f"{masked_local}@***.{tld}"


def redact_phone(phone: str | None) -> str:
    """Mask a phone, keeping the last 2 digits of the subscriber number only.

    '+919876543210' -> '+91...210'; short/odd input is fully masked.
    """
    if not phone:
        return "<none>"
    s = re.sub(r"[^0-9+]", "", str(phone))
    digits = re.sub(r"\D", "", s)
    if len(digits) < 4:
        return "***"
    plus = "+" if s.startswith("+") else ""
    return f"{plus}***{digits[-2:]}"


def redact_url(url: str | None) -> str:
    """Keep scheme+host only, drop any path/query that can carry identifiers."""
    if not url:
        return "<none>"
    m = re.match(r"(https?://[^/]+)", str(url))
    return (m.group(1) + "/***") if m else "***"
