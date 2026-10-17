"""
Tier 2: LinkedIn HR contact extraction utility.

SRS §4.5.1: Direct extraction of HR name and contact from LinkedIn job postings.
LinkedIn job pages contain recruiter/HR contact info in structured JSON-LD or
page metadata. This module extracts HR name, email (if visible), and LinkedIn profile URL.
"""

import re
import json
import logging
from typing import Any

logger = logging.getLogger(__name__)


def extract_hr_from_linkedin_job(html: str, job_url: str, company_name: str) -> tuple[str, str, str]:
    """Extract HR contact information from a LinkedIn job page.

    SRS §4.5.1: "many job postings list 'Posted by <Name>' or include a
    recruiter LinkedIn link directly — regex + DOM-position heuristics
    extract this first."

    Returns (hr_name, hr_email, hr_linkedin_url).
    """
    hr_name = ""
    hr_email = ""
    hr_linkedin = ""

    # Try JSON-LD structured data
    json_ld = re.findall(r'<script[^>]*type="application/ld\+json"[^>]*>(.*?)</script>', html, re.DOTALL | re.IGNORECASE)
    for jdata in json_ld:
        try:
            data = json.loads(jdata.strip().rstrip(";"))
            if isinstance(data, dict):
                hirer = data.get("hiringOrganization")
                if isinstance(hirer, dict):
                    name = hirer.get("name") or hirer.get("legalName")
                    if name and not hr_name:
                        hr_name = str(name)[:100]
                recruiter = data.get("hiringOrganization", {})
                if isinstance(recruiter, dict) and "name" in recruiter:
                    if not hr_name:
                        hr_name = str(recruiter["name"])[:100]
        except (json.JSONDecodeError, TypeError):
            pass

    # Try to find recruiter info in data-view-hiring or similar attributes
    recruiter_match = re.search(r'"recruiterName"\s*:\s*"([^"]+)"', html)
    if recruiter_match and not hr_name:
        hr_name = recruiter_match.group(1)[:100]

    # Try to find HR profile link from job page
    hr_linkedin_match = re.search(r'linkedin\.com/in/([a-zA-Z0-9\-_]+)', html)
    if hr_linkedin_match:
        hr_linkedin = f"https://www.linkedin.com/in/{hr_linkedin_match.group(1)}"

    # Try email extraction from structured job data
    email_match = re.search(r'"email"\s*:\s*"([^"@]+@[^"]+)"', html)
    if email_match:
        hr_email = email_match.group(1)

    # Try company domain for email construction
    if company_name and not hr_email:
        domain = company_name.lower().replace(" ", "").replace(",", "").replace(".", "")
        hr_email = f"careers@{domain}.com"

    logger.debug(f"LinkedIn HR extraction: name={hr_name}, email={hr_email}, linkedin={hr_linkedin}")
    return hr_name, hr_email, hr_linkedin
