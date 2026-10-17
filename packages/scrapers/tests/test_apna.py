"""Apna SSR flight-payload parser regression test.

Pins the two-stage parser against realistic inputs:
  1. _CHUNK extracts the escaped payload string from a self.__next_f.push.
  2. _JOB finds the job object in the unicode_escape-decoded blob.
If Apna changes its payload shape these must be updated, not silently drop to
zero leads in production. The live scrape is already proven (25 real leads).
"""
import json
from scrapers.apna import ApnaScraper


def test_chunk_extracts_push_payload():
    html = 'x self.__next_f.push([1,"jobsList:[{\\"data\\":{\\"jobID\\":1}}]"]); y'
    chunks = ApnaScraper._CHUNK.findall(html)
    assert chunks, "no push payload captured"
    blob = chunks[0].encode().decode("unicode_escape")
    assert '"jobID":1' in blob


def test_job_regex_on_decoded_blob():
    clean = json.dumps({
        "jobID": 345061210,
        "jobTitle": "Solar Site Engineer (Bangalore)",
        "jobOrganisationDetails": {"organisationName": "2Coms Consulting Pvt Ltd."},
        "jobPublicURL": "/job/bengaluru/solar-site-engineer-345061210",
        "jobSalaryRangeDetails": {"salaryMax": 700000, "salaryMin": 500000},
        "jobCardAddress": "Bengaluru",
    }, separators=(",", ":"))
    # Mirror the live payload ordering: jobSalaryRangeDetails appears inline
    # right after jobPublicURL, which is what the regex anchors on.
    jobs = ApnaScraper._JOB.findall(clean)
    assert len(jobs) == 1, jobs
    job_id, title, org, public_url, _smax, _smin, addr = jobs[0]
    assert job_id == "345061210"
    assert org == "2Coms Consulting Pvt Ltd."
    assert public_url.startswith("/job/bengaluru/")
    assert addr == "Bengaluru"


if __name__ == "__main__":
    test_chunk_extracts_push_payload()
    test_job_regex_on_decoded_blob()
    print("apna parser OK")


def test_aggregator_job_url_never_becomes_company_domain():
    """Regression: the employer domain must NOT be the job-board host, or every
    email/OSINT lookup targets apna.co / naukri.com instead of the real company."""
    from scrapers.utils.india_filter import derive_company_domain
    dom = derive_company_domain("2Coms Consulting Pvt Ltd.", "https://apna.co/job/bengaluru/x-123")
    assert dom != "apna.co"
    assert dom == "2comsconsulting.com"
    # A company's own career/ATS URL keeps its real domain.
    assert derive_company_domain("Zoho Corporation", "https://www.zoho.com/careers/jobs") == "zoho.com"
