"""
Tier 2: Apna.co scraper — India fresher/entry-level jobs.

Apna is a large India-first portal heavy on fresher/entry-level roles. Its job
feed is server-rendered into the Next.js RSC flight payload (self.__next_f),
so the structured data (org, salary, location, job id) is extracted from the
SSR HTML WITHOUT a browser. The escalating http_client is still used so a
curl_cffi TLS-impersonation request carries the realistic browser headers the
site expects; Playwright is only a fallback if the payload shape changes.

Extracts per SRS §4.4 schema.
"""

import json
import re
import logging
from typing import Any

from .base import BaseScraper, now_iso

logger = logging.getLogger(__name__)


class ApnaScraper(BaseScraper):
    source_name = "apna"
    tier = 2
    rate_limit_seconds = 2.0

    BASE = "https://apna.co"
    LIST_URL = "https://apna.co/jobs?fresher_jobs=true"

    # The escaped RSC flight payload holds one string per push; concatenate,
    # unescape, then pull job objects out of the flattened blob.
    _CHUNK = re.compile(r'self\.__next_f\.push\(\[1,"(.*?)"\]\)', re.S)
    _JOB = re.compile(
        r'"jobID":(\d+),"jobTitle":"(.*?)","jobOrganisationDetails":\{.*?'
        r'"organisationName":"(.*?)".*?"jobPublicURL":"(.*?)",'
        r'(?:null|"jobSalaryRangeDetails":\{(?:"salaryMax":(\d+),"salaryMin":(\d+)|null)\})?'
        r'.*?"jobCardAddress":"(.*?)"'
    )

    async def scrape(self) -> list[dict[str, Any]]:
        from .utils.http_client import fetch

        leads: list[dict[str, Any]] = []
        seen: set[str] = set()
        try:
            resp = await fetch(self.LIST_URL, timeout=30, min_engine="curl", max_engine="playwright")
            html = resp.text
        except Exception as e:  # noqa: BLE001
            self._logger.warning(f"Apna fetch failed: {e}")
            return leads

        blob = "".join(self._CHUNK.findall(html)).encode().decode("unicode_escape", "replace")
        for job_id, title, org, public_url, smax, smin, addr in self._JOB.findall(blob):
            title = title.strip()
            org = org.strip()
            if not title or job_id in seen:
                continue
            seen.add(job_id)

            job_url = self.BASE + public_url if public_url.startswith("/") else public_url
            salary = ""
            if smin and smax:
                # Apna salaries are annual INR; present as a LPA range.
                try:
                    salary = f"{int(smin) // 100000}-{int(smax) // 100000} LPA"
                except ValueError:
                    salary = ""
            # Apna has no experience field in the SSR payload; the fresher feed
            # + title heuristics drive classification (normalizer re-validates).
            from .utils.fresher_classifier import is_fresher_role
            is_fresher = is_fresher_role(title, "", (addr or "").lower() + " fresher entry level")

            leads.append({
                "company_name": org,
                "about_company": "",
                "hr_name": "",
                "hr_email": "",
                "company_email": "",
                "hr_mobile": "",
                "company_mobile": "",
                "hr_linkedin_url": "",
                "job_title": title[:120],
                "about_job": title,
                "experience_required": "0-1 years",
                "location": addr,
                "salary_range": salary,
                "job_url": job_url,
                "source_site": "apna.co",
                "scraped_at": now_iso(),
                "is_fresher": is_fresher,
                "raw_payload": {"jobID": job_id, "title": title, "org": org},
            })

        self._logger.info(f"Apna: scraped {len(leads)} raw leads")
        return leads
