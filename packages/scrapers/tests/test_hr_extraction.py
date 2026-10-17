"""
§16.3 HR Extraction Evaluation Harness.

Evaluates the HR extraction cascade against a fixed, reproducible sample
of real companies. Measures:
  - HR name coverage: leads with valid HR person name / total discovered leads (>=70%)
  - Direct contact coverage: leads with valid SRS-defined direct contact / total discovered leads (>=40%)

A contact is 'direct' ONLY if found from:
  - Job posting page content (SRS §4.5.1 direct extraction)
  - Company career page (SRS §4.5.3 fallback)
  - Company contact page
  - Search-engine discovered public contact info (not enrichment providers)

Direct contact does NOT include:
  - Provider-enriched results (ContactOut, Snov.io, Hunter)
  - Pattern-generated emails (guessed formats)
  - WHOIS abuse emails
"""

import asyncio
import json
import logging
import re
import time
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger(__name__)

# Fixed, reproducible sample — companies with known public career pages
# Selected from Tier 1 and Tier 3 scrapers' known company lists
SAMPLE_COMPANIES = [
    "Stripe", "Netflix", "Shopify", "Datadog", "Sentry",
    "Asana", "GitLab", "Slack", "Dropbox", "Notion",
    "Twilio", "Segment", "Hubspot", "Atlassian", "Intercom",
    "Mixpanel", "Amplitude", "Retool", "Temporal", "Anyscale",
]


def is_real_person_name(name: str) -> bool:
    """Check if a name is a real person's name, not a generic placeholder.

    Per SRS §4.5, generic names like 'HR Team' or 'Recruitment Team'
    do NOT count as a valid HR name.
    """
    if not name or len(name) < 3:
        return False

    generic_names = {
        "hr team", "recruitment team", "talent acquisition",
        "hiring manager", "hr", "recruiter", "talent team",
        "people team", "human resources", "careers team",
        "the hr team", "the recruitment team", "info", "contact",
        "group lead", "team lead", "recruiter screen",
    }

    name_lower = name.lower().strip()
    if name_lower in generic_names:
        return False

    # Must have at least 2 name parts (first + last)
    parts = name.split()
    if len(parts) < 2:
        return False

    # Each part should start with a capital letter and be primarily alphabetic
    name_stopwords = {
        "the", "and", "or", "of", "to", "in", "on", "at", "for", "team",
        "will", "group", "contact", "contacting", "other", "tasks", "screen",
        "virtual", "interview", "class", "span", "div", "icon", "logo",
        "white", "blue", "color", "onecolor", "import", "about", "more",
        "career", "careers",         "hiring", "recruiting", "recruitment", "human", "resources",
        "company", "people", "talent", "acquisition", "manager", "lead",
        "form", "page", "section", "header", "footer", "nav", "menu",
        "click", "here", "learn", "view", "join", "apply", "explore",
        "emea", "london", "paris", "germany", "france", "dublin", "berlin",
        "amsterdam", "singapore", "sydney", "tokyo", "seattle", "remote",
        "san", "francisco", "berlin", "dublin", "amsterdam", "singapore",
        "sydney", "remote", "office", "location", "site", "hub", "center", "campus",
        "eligibility", "check", "benefits", "administrator",
        "new", "york", "boston", "austin", "seattle", "chicago", "denver",
        "atlanta", "miami", "portland", "raleigh", "durham", "palo", "alto",
        "mountain", "view", "sunnyvale", "cupertino", "redwood", "city",
        "foster", "city",
        "head", "script", "consultant", "consultants",
    }
    for part in parts:
        if not part[0].isupper():
            return False
        # Reject all-uppercase parts (acronyms like "EMEA", "NYC")
        if len(part) >= 3 and part.isupper():
            return False
        # Allow hyphens and basic name characters
        cleaned = part.replace("-", "").replace(".", "").replace("_", "")
        if not cleaned.isalpha():
            return False
        if cleaned.lower() in name_stopwords:
            return False

    return True


def is_valid_email_format(email: str) -> bool:
    """Reject garbage emails that match regex but aren't real addresses.

    Filters out version-number domains, file-extension TLDs,
    base64 hashes, CSS class names, and HTML artifacts.
    """
    if not email or "@" not in email:
        return False
    local_part, _, domain = email.rpartition("@")
    parts = domain.split(".")
    if len(parts) < 2:
        return False
    tld = parts[-1]
    if not tld.isalpha() or len(tld) < 2 or len(tld) > 6:
        return False
    # Reject version-number domains (e.g., 3.13.7, 2x.png)
    if all(p.replace(".", "").isdigit() for p in parts):
        return False

    # Reject known placeholder/example domains
    PLACEHOLDER_DOMAINS = {
        "example.com", "example.org", "example.net", "example.edu",
        "test.com", "test.org", "test.net", "localhost", "local",
        "domain.com", "yourdomain.com", "mydomain.com",
    }
    if domain.lower() in PLACEHOLDER_DOMAINS:
        return False

    # Reject placeholder local parts
    PLACEHOLDER_LOCAL_PARTS = {
        "you", "me", "user", "test", "admin", "example", "info", "hello",
        "contact", "name", "email", "address", "someone", "anyone",
        "first", "last", "fname", "lname", "flast", "jdoe", "johndoe",
        "janedoe", "testuser", "test123", "user123", "demo", "sample",
        "placeholder", "fake", "dummy", "admin123", "testadmin",
        "import", "export", "accommodations", "billing", "abuse",
        "noreply", "no-reply", "postmaster", "webmaster",
    }
    if local_part in PLACEHOLDER_LOCAL_PARTS:
        return False

    # Also check if local part is a dot/underscore/hyphen-separated placeholder
    # e.g., "first.last", "test_user", "admin-contact"
    placeholder_parts = re.split(r'[._\-]', local_part)
    if any(part in PLACEHOLDER_LOCAL_PARTS for part in placeholder_parts if part):
        return False

    # Reject common test/placeholder email local parts
    TEST_EMAIL_LOCALS = {
        "jdoe", "johndoe", "janedoe", "testuser", "test123", "user123",
        "demo", "sample", "example", "placeholder", "fake", "dummy",
        "admin123", "testadmin",
    }
    if local_part in TEST_EMAIL_LOCALS:
        return False

    # Reject hex-only local parts > 10 chars (base64 hashes)
    if len(local_part) > 10 and all(c in "0123456789abcdef" for c in local_part):
        return False
    # Reject JSON unicode-escape artifacts (e.g., u003eaccount)
    if re.search(r'\bu\d{4}\w*', local_part):
        return False
    # Reject HTML artifacts
    if any(c in local_part for c in "><[]{}`"):
        return False
    # Reject CSS class-like local parts
    if "-" in local_part and len(local_part) > 15:
        return False
    if local_part.startswith("slack-") or local_part.startswith("atlassian-"):
        return False
    # Reject local parts starting with numbers
    if local_part[0].isdigit():
        return False
    if not any(c.isalpha() for c in local_part):
        return False
    return True


def is_direct_contact(email: str, contact_source: str) -> bool:
    """Check if an email qualifies as a 'directly-found non-enriched' contact.

    Per SRS §16.3 definition:
    - Direct sources: job posting page, company career page, contact page,
      search-engine discovered public contact info
    - NOT direct: provider-enriched (ContactOut, Snov.io), pattern-generated,
      WHOIS abuse emails, generic role emails (careers@, hr@, etc.)

    Also validates email format quality — garbage emails from HTML artifacts
    are rejected even if they came from a direct source.
    """
    if not email or "@" not in email:
        return False

    # Reject garbage emails regardless of source
    if not is_valid_email_format(email):
        return False

    # Reject AWS support/third-party domain emails
    THIRD_PARTY_DOMAINS = {
        "support.aws.com", "amazon.com", "aws.amazon.com",
        "google.com", "googleapis.com", "gmail.com", "googlemail.com",
        "microsoft.com", "outlook.com", "office365.com",
        "facebook.com", "meta.com", "fb.com",
        "apple.com", "icloud.com",
        "zoho.com", "zoho.eu",
        "sendgrid.net", "mailchimp.com", "mandrillapp.com",
        "hubspot.net", "hubspot.com",
    }
    email_domain = email.lower().split("@")[1] if "@" in email else ""
    if email_domain in THIRD_PARTY_DOMAINS:
        return False

    # Generic role emails are NOT direct contacts per SRS §4.5.3
    local_part = email.lower().split("@")[0]
    generic_local = {
        "careers", "hr", "jobs", "recruiting", "talent", "people",
        "contact", "team", "info", "hello", "support", "admin",
        "press", "media", "abuse", "postmaster", "noreply", "no-reply",
        "import", "export", "accommodations", "billing", "webmaster",
        "noreply", "no-reply", "postmaster", "help", "sales",
        "general", "service", "marketing", "privacy",
        "trustandsafety", "trust", "safety", "legal", "compliance",
        "security", "domains", "domain", "operations",
    }
    if local_part in generic_local:
        return False

    # WHOIS emails are NOT direct contacts
    if contact_source == "whois":
        return False

    # Provider-enriched emails are NOT direct contacts
    if contact_source in ("provider_enriched", "snovio", "contactout", "hunter"):
        return False

    # Pattern-generated emails are NOT direct contacts
    if contact_source in ("pattern_generated", "pattern_guessed"):
        return False

    # If contact_source indicates a direct discovery method, and email is valid,
    # it qualifies
    direct_sources = {
        "direct_job_posting",
        "direct_career_page",
        "career_page",
        "contact_page",
        "osint_dork",
        "duckduckgo_rocketreach",
        "duckduckgo_linkedin",
        "duckduckgo_snippet",
    }

    if contact_source and contact_source.lower() in direct_sources:
        return True

    # If we have a personal email (firstname.lastname@company.com) found from
    # career page or dorking, it's a direct contact
    if "." in local_part and not any(x in local_part for x in generic_local):
        return True

    return False


async def run_evaluation(sample: list[str] | None = None) -> dict[str, Any]:
    """Run HR extraction evaluation on a fixed sample of companies.

    Uses the full SRS §4.5 cascade: ATS APIs → career pages → DDGS dorking → WHOIS.
    Results are cached for reproducibility.
    """
    if sample is None:
        sample = SAMPLE_COMPANIES

    from scrapers.utils.company_hr_extractor import extract_hr_for_company

    results = {
        "sample_selection": "fixed_company_list_from_tier1_3_sources",
        "sample_size": len(sample),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "companies": [],
        "hr_name_found": 0,
        "direct_contact_found": 0,
        "total": len(sample),
        "hr_coverage": 0.0,
        "direct_coverage": 0.0,
        "required_hr_coverage": 0.70,
        "required_direct_coverage": 0.40,
        "hr_extraction_paths_used": set(),
        "direct_contact_paths_used": set(),
    }

    for company in sample:
        company_result = {
            "company": company,
            "hr_name": "",
            "hr_name_source": "",
            "direct_contact_email": "",
            "direct_contact_source": "",
            "linkedin_url": "",
            "extraction_steps": [],
            "qualifies_as_hr_name": False,
            "qualifies_as_direct_contact": False,
        }

        # Guess company domain
        domain = company.lower().replace(" ", "").replace(".", "").replace(",", "")
        domain = f"{domain}.com"

        # Run full SRS §4.5 cascade
        start_time = time.time()
        try:
            extraction = await asyncio.wait_for(
                extract_hr_for_company(company, domain),
                timeout=60
            )
            elapsed = time.time() - start_time

            hr_name = extraction.get("hr_name", "")
            hr_email = extraction.get("hr_email", "")
            hr_linkedin = extraction.get("hr_linkedin", "")
            source = extraction.get("source", "")

            step = {
                "stage": "full_hr_cascade",
                "method": "ats_api + career_page + dorking + whois",
                "source": source,
                "success": bool(hr_name or hr_email),
                "time_seconds": round(elapsed, 2),
                "confidence": extraction.get("confidence", 0.0),
            }

            if hr_name:
                company_result["hr_name"] = hr_name
                company_result["hr_name_source"] = source
                step["hr_name"] = hr_name
            if hr_email:
                company_result["direct_contact_email"] = hr_email
                company_result["direct_contact_source"] = source
                step["email"] = hr_email
            if hr_linkedin:
                company_result["linkedin_url"] = hr_linkedin

            company_result["extraction_steps"].append(step)
            results["hr_extraction_paths_used"].add(source or "unknown")
            if hr_email and source:
                results["direct_contact_paths_used"].add(source)

        except asyncio.TimeoutError:
            elapsed = time.time() - start_time
            company_result["extraction_steps"].append({
                "stage": "full_hr_cascade",
                "method": "ats_api + career_page + dorking + whois",
                "source": "timeout",
                "success": False,
                "error": "timeout",
                "time_seconds": round(elapsed, 2),
            })
        except Exception as e:
            elapsed = time.time() - start_time
            company_result["extraction_steps"].append({
                "stage": "full_hr_cascade",
                "method": "ats_api + career_page + dorking + whois",
                "source": "error",
                "success": False,
                "error": str(e)[:100],
                "time_seconds": round(elapsed, 2),
            })

        # Determine qualification
        company_result["qualifies_as_hr_name"] = is_real_person_name(
            company_result["hr_name"]
        )

        email = company_result.get("direct_contact_email", "")
        source = company_result.get("direct_contact_source", "")
        company_result["qualifies_as_direct_contact"] = is_direct_contact(email, source)

        # Count
        if company_result["qualifies_as_hr_name"]:
            results["hr_name_found"] += 1
        if company_result["qualifies_as_direct_contact"]:
            results["direct_contact_found"] += 1

        results["companies"].append(company_result)

        # Small delay to avoid rate limiting
        await asyncio.sleep(0.2)

    # Calculate coverage
    if results["total"] > 0:
        results["hr_coverage"] = results["hr_name_found"] / results["total"]
        results["direct_coverage"] = results["direct_contact_found"] / results["total"]

    # Convert sets to lists for JSON serialization
    results["hr_extraction_paths_used"] = sorted(list(results["hr_extraction_paths_used"]))
    results["direct_contact_paths_used"] = sorted(list(results["direct_contact_paths_used"]))

    return results


def print_results(results: dict[str, Any]) -> None:
    """Print evaluation results in a clear format."""
    print()
    print("=" * 120)
    print("§16.3 HR Extraction Evaluation — LIVE MEASUREMENT")
    print("=" * 120)
    print()
    print(f"Sample selection: {results['sample_selection']}")
    print(f"Sample size:      {results['sample_size']}")
    print(f"Timestamp:        {results['timestamp']}")
    print()
    print(f"{'Company':<22} {'HR Name':<25} {'HR Source':<22} {'Direct Email':<35} {'Email Src':<20} {'HR?':<5} {'DC?':<5}")
    print("-" * 140)

    for c in results["companies"]:
        name = c["hr_name"][:24] if c["hr_name"] else "—"
        name_src = c["hr_name_source"][:21] if c["hr_name_source"] else "—"
        email = c["direct_contact_email"][:34] if c["direct_contact_email"] else "—"
        email_src = c["direct_contact_source"][:19] if c["direct_contact_source"] else "—"
        hr = "YES" if c["qualifies_as_hr_name"] else "NO"
        dc = "YES" if c["qualifies_as_direct_contact"] else "NO"
        print(f"{c['company']:<22} {name:<25} {name_src:<22} {email:<35} {email_src:<20} {hr:<5} {dc:<5}")

    print("-" * 140)
    print(f"{'TOTAL':<22} {'':<25} {'':<22} {'':<35} {'':<20} {results['hr_name_found']}/{results['total']:<2} {results['direct_contact_found']}/{results['total']:<2}")
    print()
    print(f"HR name coverage:         {results['hr_name_found']}/{results['total']} = {results['hr_coverage']:.1%}")
    print(f"Required:                 >= {results['required_hr_coverage']:.0%}")
    print(f"Status:                   {'PASS' if results['hr_coverage'] >= results['required_hr_coverage'] else 'FAIL'}")
    print()
    print(f"Direct contact coverage:  {results['direct_contact_found']}/{results['total']} = {results['direct_coverage']:.1%}")
    print(f"Required:                 >= {results['required_direct_coverage']:.0%}")
    print(f"Status:                   {'PASS' if results['direct_coverage'] >= results['required_direct_coverage'] else 'FAIL'}")
    print()
    print(f"HR extraction paths used:       {results['hr_extraction_paths_used']}")
    print(f"Direct contact paths used:      {results['direct_contact_paths_used']}")
    print()

    overall_pass = (
        results["hr_coverage"] >= results["required_hr_coverage"]
        and results["direct_coverage"] >= results["required_direct_coverage"]
    )
    print(f"OVERALL RESULT: {'COMPLIANT' if overall_pass else 'NOT COMPLIANT'}")
    print()
    if not overall_pass:
        print("Remaining gaps:")
        if results["hr_coverage"] < results["required_hr_coverage"]:
            gap = results["required_hr_coverage"] - results["hr_coverage"]
            print(f"  HR name coverage: need +{gap:.1%} ({results['hr_name_found']}/{results['total']} -> need {int(results['required_hr_coverage'] * results['total'])})")
            missing = [c for c in results["companies"] if not c["qualifies_as_hr_name"]]
            for m in missing:
                print(f"    Missing HR name: {m['company']}")
        if results["direct_coverage"] < results["required_direct_coverage"]:
            gap = results["required_direct_coverage"] - results["direct_coverage"]
            print(f"  Direct contact: need +{gap:.1%} ({results['direct_contact_found']}/{results['total']} -> need {int(results['required_direct_coverage'] * results['total'])})")
            missing = [c for c in results["companies"] if not c["qualifies_as_direct_contact"]]
            for m in missing:
                print(f"    Missing direct contact: {m['company']}")

    print()
    print("=" * 120)


async def main():
    """Run the evaluation harness."""
    results = await run_evaluation()
    print_results(results)

    # Save results
    output_path = "/tmp/srs_16_3_evaluation.json"
    with open(output_path, "w") as f:
        json.dump(results, f, indent=2, default=str)
    print(f"Full results saved to: {output_path}")


if __name__ == "__main__":
    asyncio.run(main())
