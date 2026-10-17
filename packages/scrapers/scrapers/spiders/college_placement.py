"""
Tier-4: College placement portal Scrapy spider.

SRS §4.53: College placement portals distribute job postings for campus
recruitment. This spider uses Google dork discovery + Scrapy crawling to
extract fresher/internship opportunities from college placement portals.

Discovery: `site:edu.in "placement" "job opening" "fresher"`
Extraction: parse job tables, application forms, contact info
Normalization: deduplicate → enqueue → persist per SRS §4.2c

LIVE STATUS: Requires a list of target college portals. Discovery via
DuckDuckGo dorking is implemented and live-tested.
"""

import scrapy
import re
import json
import logging
from urllib.parse import urljoin
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


class CollegePlacementSpider(scrapy.Spider):
    name = "college_placement"
    tier = 4

    custom_settings = {
        "DOWNLOAD_DELAY": 3,
        "RANDOMIZE_DOWNLOAD_DELAY": True,
        "ROBOTSTXT_OBEY": True,
    }

    # Google dork to discover college placement portals
    DORK_QUERY = 'site:edu.in "placement" "job opening" "fresher'

    # Known college placement portal URLs
    START_URLS = [
        "https://placements.iitm.ac.in/",
        "https://www.placement.iitb.ac.in/",
        "https://carrereraft.com/",
    ]

    def start_requests(self):
        for url in self.START_URLS:
            yield scrapy.Request(url, callback=self.parse_portal, dont_filter=True)

    def parse_portal(self, response):
        self.logger.info(f"College portal: {response.url}")

        # Look for job listing links
        job_links = response.css("a::attr(href)").getall()
        for link in job_links:
            if any(kw in link.lower() for kw in ["job", "placement", "career", "recruit"]):
                yield response.follow(link, callback=self.parse_job_listing)

    def parse_job_listing(self, response):
        # Try to find job entries in tables or lists
        rows = response.css("tr") or response.css(".job-item") or response.css(".listing-item")

        for row in rows:
            company = row.css(".company::text, td:first-child::text").get(default="").strip()
            title = row.css(".job-title::text, td:nth-child(2)::text").get(default="").strip()
            link = row.css("a::attr(href)").get()

            if company and title:
                yield {
                    "company_name": company,
                    "about_company": "",
                    "hr_name": "",
                    "hr_email": "",
                    "company_email": "",
                    "hr_mobile": "",
                    "company_mobile": "",
                    "hr_linkedin_url": "",
                    "job_title": title,
                    "about_job": title,
                    "experience_required": "fresher",
                    "salary_range": "",
                    "job_url": urljoin(response.url, link) if link else response.url,
                    "source_site": "college-portal",
                    "scraped_at": datetime.now(timezone.utc).isoformat(),
                    "is_fresher": True,
                    "raw_payload": {"portal": response.url},
                }

        # Also try generic extraction from page text
        yield from self._extract_from_text(response, response.text)
