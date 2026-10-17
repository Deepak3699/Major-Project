# Track 2 — Source Expansion Design

## Rule (standing)
A new scraper requires: live `curl` proof of a public data endpoint,
`robots.txt`/terms clearance, fixture + live tests, corpus + `SCRAPER_MAP`
+ defaults wiring. Verdicts live in `docs/SOURCE_EVALUATION.md`.

## Implemented
- **BambooHR** (`scrapers/bamboohr.py`): list JSON, posting URL pattern
  verified, empty `about_job` kept honest. In defaults.
- **Personio** (`scrapers/personio.py`): XML via stdlib `xml.etree`,
  `yearsOfExperience` → experience, `0-` prefix counts as fresher. In defaults.
- **Fresher vocabulary**: walk-in/off-campus/apprentice/early-career/
  engineer-trainee/passout/any-graduate/final-year/year-cohorts/0-3yrs.
  Bare "GET" deliberately excluded (verb collision).
- **India normalization**: ATS board hosts can never become employer
  domains (was leaking `greenhouse.io`/`bamboohr.com`/… into OSINT lookups);
  corporate suffixes (`private limited`, `llp`, …); full state/UT coverage.

## Evaluated, not built (reasons in SOURCE_EVALUATION.md)
Terms/access: Quikr, Youth4Work, LinkedIn automation. Unverifiable:
Workable, Freshteam, Keka, Zoho Recruit, JobHai. Deferred sub-project:
NCS, Darwinbox (browser automation class).

## Testing
`test_bamboohr_personio.py` (live boards), classifier + normalization
tests, full suite 245/245. Workers restarted (bind-mount, live).
