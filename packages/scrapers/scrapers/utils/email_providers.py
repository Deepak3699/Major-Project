"""
Paid email-enrichment provider adapters.

Each vendor adapter follows the same contract:
    async def enrich_via_<vendor>(full_name, company_domain, api_key) -> dict
Returns a subset of:
    {"hr_email", "hr_name", "hr_linkedin_url", "confidence", "source", "verified"}
or {} when nothing usable is found.

All adapters degrade safely: missing key / timeout / non-200 → {}. Never raises out.

Two top-level helpers:
    paid_email_waterfall  — cheapest-first cascade, stops at first hit.
    paid_reveal_contacts  — company-level HR/recruiter contact list.
"""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)
# Several vendors take the API key as a query param (Hunter v2 only); silence
# httpx's INFO request-URL logger so keys never land in our logs. Set at import
# regardless of import order.
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)

_TIMEOUT = 15.0


# ── vendor adapters ──────────────────────────────────────────────────────────

async def enrich_via_hunter(full_name: str, company_domain: str,
                            api_key: str | None) -> dict[str, Any]:
    """Hunter.io email-finder (single-email) + domain-search (contacts)."""
    if not api_key or not company_domain:
        return {}
    import httpx

    first, _, last = full_name.partition(" ")
    params = {"domain": company_domain, "api_key": api_key}
    if first:
        params["first_name"] = first
    if last:
        params["last_name"] = last

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            r = await client.get("https://api.hunter.io/v2/email-finder", params=params)
            if r.status_code != 200:
                return {}
            data = (r.json().get("data") or {})
            email = data.get("email", "")
            if not email:
                return {}
            return {
                "hr_email": email,
                "hr_name": full_name,
                "confidence": data.get("confidence", 0) * 100,
                "source": "hunter",
                # Hunter `type` is personal-vs-role, NOT deliverability. §6.3:
                # only call it verified when Hunter's own `verification` says so.
                "verified": str(data.get("verification", "")).lower() == "valid",
            }
    except Exception as e:  # noqa: BLE001
        logger.debug(f"hunter failed: {e}")
        return {}


async def enrich_via_apollo_io(full_name: str, company_domain: str,
                               api_key: str | None) -> dict[str, Any]:
    """Apollo.io people-search + email reveal."""
    if not api_key or not company_domain or not full_name:
        return {}
    import httpx

    headers = {"Content-Type": "application/json", "X-Api-Key": api_key}
    first, _, last = full_name.partition(" ")
    body = {
        "q": full_name,
        "organization_domains": [company_domain],
        "person_details": ["email", "phone_numbers"],
    }
    if first:
        body["first_name"] = first
    if last:
        body["last_name"] = last

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            r = await client.post("https://api.apollo.io/v1/people/search",
                                  json=body, headers=headers)
            if r.status_code != 200:
                return {}
            people = (r.json().get("people") or [])
            for p in people:
                email = p.get("email", "")
                if not email:
                    continue
                verified = p.get("email_verification") == "verified"
                conf = 90 if verified else 60
                return {
                    "hr_email": email,
                    "hr_name": p.get("name", full_name),
                    "hr_linkedin_url": p.get("linkedin_url", ""),
                    "hr_mobile": (p.get("phone_numbers") or [{}])[0].get("raw_number", "")
                        if p.get("phone_numbers") else "",
                    "confidence": conf,
                    "source": "apollo_io",
                    "verified": verified,
                }
            return {}
    except Exception as e:  # noqa: BLE001
        logger.debug(f"apollo_io failed: {e}")
        return {}


async def enrich_via_findymail(full_name: str, company_domain: str,
                               api_key: str | None) -> dict[str, Any]:
    """FindyMail email lookup (single-shot, cheap)."""
    if not api_key or not company_domain or not full_name:
        return {}
    import httpx

    first, _, last = full_name.partition(" ")
    params = {
        "api_token": api_key,
        "company_domain": company_domain,
        "first_name": first,
        "last_name": last or "",
    }

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            r = await client.get("https://api.findymail.com/search", params=params)
            if r.status_code != 200:
                return {}
            data = r.json().get("data") or {}
            email = data.get("email", "")
            if not email:
                return {}
            status = (data.get("status") or "").lower()
            return {
                "hr_email": email,
                "hr_name": full_name,
                "confidence": 85 if status == "safe" else 60,
                "source": "findymail",
                "verified": status == "safe",
            }
    except Exception as e:  # noqa: BLE001
        logger.debug(f"findymail failed: {e}")
        return {}


async def enrich_via_prospeo(full_name: str, company_domain: str,
                             api_key: str | None) -> dict[str, Any]:
    """Prospeo.io email finder."""
    if not api_key or not company_domain or not full_name:
        return {}
    import httpx

    first, _, last = full_name.partition(" ")
    body = {
        "companyDomain": company_domain,
        "firstName": first,
        "lastName": last or "",
    }

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            r = await client.post(
                "https://api.prospeo.io/search/v1/email-finder",
                json=body,
                headers={"Authorization": f"Bearer {api_key}"},
            )
            if r.status_code != 200:
                return {}
            data = r.json()
            email = (data.get("email") or "")
            if not email:
                return {}
            return {
                "hr_email": email,
                "hr_name": full_name,
                "hr_linkedin_url": data.get("linkedin", ""),
                "confidence": 80 if data.get("status") == "verified" else 55,
                "source": "prospeo",
                "verified": data.get("status") == "verified",
            }
    except Exception as e:  # noqa: BLE001
        logger.debug(f"prospeo failed: {e}")
        return {}


async def enrich_via_lusha(full_name: str, company_domain: str,
                           api_key: str | None) -> dict[str, Any]:
    """Lusha people search."""
    if not api_key or not company_domain or not full_name:
        return {}
    import httpx

    first, _, last = full_name.partition(" ")
    body = {
        "full_name": full_name,
        "company_domain": company_domain,
        "first_name": first,
        "last_name": last or "",
    }

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            r = await client.post(
                "https://api.lusha.com/people/search",
                json=body,
                headers={"Api-Key": api_key, "Content-Type": "application/json"},
            )
            if r.status_code != 200:
                return {}
            results = r.json().get("data") or []
            for person in results:
                email = person.get("email", "")
                phone = person.get("phone", "")
                if not email and not phone:
                    continue
                return {
                    "hr_email": email,
                    "hr_name": person.get("fullName", full_name),
                    "hr_mobile": phone,
                    "hr_linkedin_url": person.get("linkedin", {}).get("publicUrl", "")
                        if isinstance(person.get("linkedin"), dict) else "",
                    "confidence": 75 if email else 50,
                    "source": "lusha",
                    "verified": bool(person.get("emailData", {}).get("isVerified"))
                        if person.get("emailData") else False,
                }
            return {}
    except Exception as e:  # noqa: BLE001
        logger.debug(f"lusha failed: {e}")
        return {}


async def enrich_via_rocketreach(full_name: str, company_domain: str,
                                 api_key: str | None) -> dict[str, Any]:
    """RocketReach profile lookup."""
    if not api_key or not company_domain or not full_name:
        return {}
    import httpx
    from base64 import b64encode

    # RocketReach uses Basic auth: public_key:private_key (we use api_key as both
    # for the simplified single-key case; adjust if you store pair separately).
    auth = b64encode(f"{api_key}:".encode()).decode()
    slug = f"{full_name.split()[0]}-{full_name.split()[-1] if len(full_name.split())>1 else ''}"

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            r = await client.get(
                f"https://api.rocketreach.co/v2/api/get_profile",
                params={"profile_slug": slug, "profile_domain": company_domain},
                headers={"Authorization": f"Basic {auth}"},
            )
            if r.status_code != 200:
                return {}
            profile = r.json().get("profile") or {}
            email = profile.get("email", "")
            if not email:
                return {}
            return {
                "hr_email": email,
                "hr_name": profile.get("name", full_name),
                "hr_linkedin_url": profile.get("linkedin_url", ""),
                "hr_mobile": profile.get("phone", ""),
                "confidence": 70,
                "source": "rocketreach",
                "verified": profile.get("email_status") == "verified",
            }
    except Exception as e:  # noqa: BLE001
        logger.debug(f"rocketreach failed: {e}")
        return {}


async def enrich_via_voila(full_name: str, company_domain: str,
                           api_key: str | None) -> dict[str, Any]:
    """Voila Norbert email finder."""
    if not api_key or not company_domain or not full_name:
        return {}
    import httpx

    first, _, last = full_name.partition(" ")
    params = {
        "api_key": api_key,
        "domain": company_domain,
        "first_name": first,
        "last_name": last or "",
    }

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            r = await client.get("https://api.norbert.io/v1/get", params=params)
            if r.status_code != 200:
                return {}
            data = r.json().get("data") or {}
            email = data.get("email", "")
            if not email:
                return {}
            return {
                "hr_email": email,
                "hr_name": f"{data.get('first_name', first)} {data.get('last_name', last)}".strip(),
                "confidence": 75,
                "source": "voila",
                "verified": data.get("status") == "safe_to_email",
            }
    except Exception as e:  # noqa: BLE001
        logger.debug(f"voila/norbert failed: {e}")
        return {}


async def enrich_via_clearbit(full_name: str, company_domain: str,
                              api_key: str | None) -> dict[str, Any]:
    """Clearbit Reveal / Enrichment API (person lookup)."""
    if not api_key or not company_domain or not full_name:
        return {}
    import httpx

    first, _, last = full_name.partition(" ")
    params = {
        "apiKey": api_key,
        "domain": company_domain,
        "firstName": first,
        "lastName": last or "",
    }

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            r = await client.get("https://person.clearbit.com/v2/people/find",
                                 params=params)
            if r.status_code != 200:
                return {}
            person = r.json()
            email = person.get("email", "")
            if not email:
                return {}
            return {
                "hr_email": email,
                "hr_name": f"{person.get('givenName', first)} {person.get('familyName', last)}".strip(),
                "hr_linkedin_url": (person.get("sites") or {}).get("linkedin", ""),
                "confidence": 80,
                "source": "clearbit",
                # Clearbit returns `email` as a plain string, so the old
                # `... else True` made EVERY hit "verified" (== 85 conf) and let
                # it clobber stored verified emails (§6.3). Default False; there
                # is no deliverability verdict here, so never claim one.
                "verified": False,
            }
    except Exception as e:  # noqa: BLE001
        logger.debug(f"clearbit failed: {e}")
        return {}


async def enrich_via_leadmagic(full_name: str, company_domain: str,
                               api_key: str | None) -> dict[str, Any]:
    """LeadMagic email finder."""
    if not api_key or not company_domain or not full_name:
        return {}
    import httpx

    first, _, last = full_name.partition(" ")
    body = {"domain": company_domain, "firstName": first, "lastName": last or ""}

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            r = await client.post(
                "https://api.leadmagic.io/v1/find-email",
                json=body,
                headers={"x-api-key": api_key, "Content-Type": "application/json"},
            )
            if r.status_code != 200:
                return {}
            data = r.json()
            email = data.get("email", "")
            if not email:
                return {}
            return {
                "hr_email": email,
                "hr_name": full_name,
                "confidence": 75 if data.get("status") == "verified" else 55,
                "source": "leadmagic",
                "verified": data.get("status") == "verified",
            }
    except Exception as e:  # noqa: BLE001
        logger.debug(f"leadmagic failed: {e}")
        return {}


async def enrich_via_icypeas(full_name: str, company_domain: str,
                             api_key: str | None) -> dict[str, Any]:
    """icypeas contact finder."""
    if not api_key or not company_domain or not full_name:
        return {}
    import httpx

    first, _, last = full_name.partition(" ")
    body = {
        "api_key": api_key,
        "domain": company_domain,
        "first_name": first,
        "last_name": last or "",
    }

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            r = await client.post(
                "https://www.icypeas.com/api/contact_finder",
                json=body,
            )
            if r.status_code != 200:
                return {}
            data = r.json()
            email = data.get("email", "")
            if not email:
                return {}
            return {
                "hr_email": email,
                "hr_name": full_name,
                "hr_linkedin_url": data.get("linkedin", ""),
                "confidence": 70,
                "source": "icypeas",
                "verified": data.get("deliverability") == "valid",
            }
    except Exception as e:  # noqa: BLE001
        logger.debug(f"icypeas failed: {e}")
        return {}


async def enrich_via_bsg(full_name: str, company_domain: str,
                         api_key: str | None) -> dict[str, Any]:
    """The Browser Scan (BSG) email finder."""
    if not api_key or not company_domain or not full_name:
        return {}
    import httpx

    first, _, last = full_name.partition(" ")
    body = {
        "firstName": first,
        "lastName": last or "",
        "domain": company_domain,
    }

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            r = await client.post(
                "https://api.thebrowserdns.io/api/v3/email",
                json=body,
                headers={"Authorization": f"Bearer {api_key}"},
            )
            if r.status_code != 200:
                return {}
            data = r.json().get("data") or r.json()
            email = data.get("email", "")
            if not email:
                return {}
            return {
                "hr_email": email,
                "hr_name": full_name,
                "confidence": 70 if data.get("status") in ("found", "verified") else 50,
                "source": "bsg",
                "verified": data.get("status") == "verified",
            }
    except Exception as e:  # noqa: BLE001
        logger.debug(f"bsg failed: {e}")
        return {}


# ── waterfall / orchestration ───────────────────────────────────────────────

# Ordered by typical cost-per-result (cheapest/most-likely-first).
_WATERFALL = [
    ("hunter", enrich_via_hunter, "HUNTER_API_KEY"),
    ("apollo_io", enrich_via_apollo_io, "APOLLO_API_KEY"),
    ("findymail", enrich_via_findymail, "FINDYMAIL_API_KEY"),
    ("prospeo", enrich_via_prospeo, "PROSPEO_API_KEY"),
    ("lusha", enrich_via_lusha, "LUSHA_API_KEY"),
    ("rocketreach", enrich_via_rocketreach, "ROCKETREACH_API_KEY"),
    ("voila", enrich_via_voila, "NORBERT_API_KEY"),
    ("clearbit", enrich_via_clearbit, "CLEARBIT_API_KEY"),
    ("leadmagic", enrich_via_leadmagic, "LEADMAGIC_API_KEY"),
    ("icypeas", enrich_via_icypeas, "ICYPEAS_API_KEY"),
    ("bsg", enrich_via_bsg, "BSG_API_KEY"),
]

# Registry for callers that want the adapter by name.
PROVIDERS: dict[str, Any] = {name: fn for name, fn, _ in _WATERFALL}


async def paid_email_waterfall(
    full_name: str,
    company_domain: str,
    api_keys: dict[str, str],
) -> dict[str, Any]:
    """Try vendors cheapest-first. Stops at the first usable email.

    api_keys: the per-user decrypted dict (keys match vendor slug or lowercased
    env name). We also check os.environ as a fallback.

    Returns the winning adapter's dict, plus a `credits` int = the number of
    billable vendor calls actually attempted on the way (so callers can log real
    spend — a waterfall may probe several vendors before one hits).
    """
    import os

    credits = 0
    for vendor, adapter, env_key in _WATERFALL:
        key = (api_keys.get(vendor) or api_keys.get(env_key.lower())
               or os.environ.get(env_key, ""))
        if not key:
            continue
        credits += 1
        result = await adapter(full_name, company_domain, key)
        if result.get("hr_email"):
            result["credits"] = credits
            return result
    return {}


async def paid_reveal_contacts(
    company_domain: str,
    api_keys: dict[str, str],
    *,
    max_contacts: int = 10,
    hr_filter: bool = True,
) -> list[dict[str, Any]]:
    """Return up to max_contacts {name,email,linkedin,title} for a company domain.

    Uses Hunter domain-search (free tier) and Apollo people-search. Falls through
    if neither key is available.
    """
    import os

    contacts: list[dict[str, Any]] = []
    if not company_domain:
        return contacts

    # Hunter domain-search
    hunter_key = (api_keys.get("hunter") or api_keys.get("hunter_api_key")
                  or os.environ.get("HUNTER_API_KEY", ""))
    if hunter_key and len(contacts) < max_contacts:
        try:
            import httpx
            async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
                r = await client.get(
                    "https://api.hunter.io/v2/domain-search",
                    params={"domain": company_domain, "api_key": hunter_key,
                            "type": "personal", "page_size": max_contacts},
                )
                if r.status_code == 200:
                    domain_data = (r.json().get("data") or {})
                    for em in domain_data.get("emails", []):
                        email = em.get("value", "")
                        if not email:
                            continue
                        title = f"{em.get('seniority', '')} {em.get('department', '')}".strip()
                        if hr_filter and title:
                            t = title.lower()
                            if not any(w in t for w in ("hr", "recruit", "talent",
                                                        "people", "hiring", "human")):
                                continue
                        contacts.append({
                            "name": f"{em.get('first_name', '')} {em.get('last_name', '')}".strip(),
                            "email": email,
                            "linkedin": em.get("linkedin", ""),
                            "title": title,
                        })
                        if len(contacts) >= max_contacts:
                            break
        except Exception as e:  # noqa: BLE001
            logger.debug(f"paid_reveal hunter domain-search failed: {e}")

    # Apollo people-search
    apollo_key = (api_keys.get("apollo_io") or api_keys.get("apollo_api_key")
                  or os.environ.get("APOLLO_API_KEY", ""))
    if apollo_key and len(contacts) < max_contacts:
        try:
            import httpx
            existing_emails = {c["email"] for c in contacts}
            async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
                r = await client.post(
                    "https://api.apollo.io/v1/people/search",
                    json={"organization_domains": [company_domain],
                          "person_details": ["email"],
                          "page": 1, "per_page": max_contacts},
                    headers={"X-Api-Key": apollo_key, "Content-Type": "application/json"},
                )
                if r.status_code == 200:
                    for p in (r.json().get("people") or []):
                        email = p.get("email", "")
                        if not email or email in existing_emails:
                            continue
                        title = p.get("title", "")
                        if hr_filter and title:
                            t = title.lower()
                            if not any(w in t for w in ("hr", "recruit", "talent",
                                                        "people", "hiring", "human")):
                                continue
                        contacts.append({
                            "name": p.get("name", ""),
                            "email": email,
                            "linkedin": p.get("linkedin_url", ""),
                            "title": title,
                        })
                        if len(contacts) >= max_contacts:
                            break
        except Exception as e:  # noqa: BLE001
            logger.debug(f"paid_reveal apollo search failed: {e}")

    return contacts[:max_contacts]
