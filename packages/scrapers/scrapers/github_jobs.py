"""
Tier 1: GitHub-maintained new-grad/internship job lists scraper.

Pre-flight verified:
  - SimplifyJobs/Summer2027-Internships: 46,413 stars, actively maintained (renamed from Summer2026)
  - pittcsc/Summer2026-Internships: 63 stars, last updated Jun 2026 (less active)
  - vanshb03/New-Grad-Jobs: repo NOT FOUND (404) — excluded per pre-flight

These repos maintain JSON or structured data (via `jsonn` in the list) that can be
parsed for job postings. The SimplifyJobs repo uses a structured JSON format embedded
in the README via a `json` HTML comment block.
"""

import json
import re
import asyncio
import aiohttp
import logging
from typing import Any

from .base import BaseScraper, ScraperError, now_iso
from .utils.fresher_classifier import is_fresher_role

logger = logging.getLogger(__name__)


class GitHubJobsScraper(BaseScraper):
    source_name = "github_jobs"
    tier = 1
    rate_limit_seconds = 2.0

    REPOS = [
        {
            "name": "SimplifyJobs/Summer2027-Internships",
            "json_url": "https://raw.githubusercontent.com/SimplifyJobs/Summer2027-Internships/dev/.github/scripts/listings.json",
        },
        {
            "name": "pittcsc/Summer2026-Internships",
            "json_url": "https://raw.githubusercontent.com/pittcsc/Summer2026-Internships/dev/README.md",
        },
    ]

    async def scrape(self) -> list[dict[str, Any]]:
        leads: list[dict[str, Any]] = []

        for repo in self.REPOS:
            repo_name = repo["name"]
            json_url = repo.get("json_url")

            if not json_url:
                continue

            try:
                async with aiohttp.ClientSession() as session:
                    headers = {
                        "User-Agent": "HireGen-LeadGen/1.0",
                        "Accept": "application/vnd.github.v3.raw",
                    }
                    async with session.get(json_url, headers=headers, timeout=aiohttp.ClientTimeout(total=30)) as resp:
                        if resp.status != 200:
                            self._logger.warning(f"GitHub {repo_name}: HTTP {resp.status}")
                            continue
                        content = await resp.text()

                if json_url.endswith(".json"):
                    data = json.loads(content)
                else:
                    # pittcsc README contains HTML with embedded job data
                    jobs = self._parse_readme_jobs(content)
                    data = {"items": jobs}

                if isinstance(data, dict) and "items" in data:
                    items = data["items"]
                elif isinstance(data, list):
                    items = data
                else:
                    items = [data] if isinstance(data, dict) else []

                for item in items:
                    if not isinstance(item, dict):
                        continue

                    job_title = item.get("title", "") or item.get("role", "")
                    if not job_title:
                        continue

                    company_name = item.get("company_name", "")

                    loc_list = item.get("locations")
                    if loc_list and isinstance(loc_list, list):
                        if loc_list and isinstance(loc_list[0], dict):
                            location = loc_list[0].get("location", "")
                        else:
                            location = str(loc_list[0]) if loc_list else ""
                    else:
                        location = ""
                    is_fresher = is_fresher_role(job_title, "", json.dumps(item).lower() + " " + location)

                    lead = {
                        "company_name": company_name,
                        "about_company": "",
                        "hr_name": item.get("recruiter_name", ""),
                        "hr_email": item.get("email", ""),
                        "company_email": item.get("company_email", ""),
                        "hr_mobile": "",
                        "company_mobile": "",
                        "hr_linkedin_url": item.get("recruiter_linkedin", ""),
                        "job_title": job_title,
                        "about_job": item.get("description", "") or item.get("about_job", ""),
                        "experience_required": "0-1 years" if is_fresher else "",
                        "salary_range": item.get("salary", ""),
                        "job_url": item.get("url", "") or item.get("apply_link", ""),
                        "source_site": f"github.com/{repo_name}",
                        "scraped_at": now_iso(),
                        "is_fresher": is_fresher,
                        "raw_payload": item,
                    }
                    leads.append(lead)

            except json.JSONDecodeError as e:
                self._logger.warning(f"GitHub {repo_name}: JSON parse error: {e}")
                continue
            except asyncio.TimeoutError:
                self._logger.warning(f"GitHub {repo_name}: timed out")
                continue
            except aiohttp.ClientError as e:
                self._logger.warning(f"GitHub {repo_name}: HTTP error: {e}")
                continue

        self._logger.info(f"GitHub jobs: scraped {len(leads)} raw leads")
        return leads

    def _parse_readme_jobs(self, content: str) -> list[dict[str, Any]]:
        """Parse pittcsc-style README for job entries in HTML table format."""
        jobs = []
        rows = re.findall(r'<tr>(.*?)</tr>', content, re.DOTALL)
        for row in rows:
            cells = re.findall(r'<t[dh][^>]*>(.*?)</t[dh]>', row, re.DOTALL)
            if len(cells) >= 3:
                jobs.append({
                    "title": re.sub(r'<[^>]+>', '', cells[1]).strip(),
                    "company_name": re.sub(r'<[^>]+>', '', cells[0]).strip(),
                    "locations": [{"location": re.sub(r'<[^>]+>', '', cells[2]).strip()}],
                    "url": re.search(r'href="([^"]+)"', cells[3]) and re.search(r'href="([^"]+)"', cells[3]).group(1) or "",
                })
        return jobs
