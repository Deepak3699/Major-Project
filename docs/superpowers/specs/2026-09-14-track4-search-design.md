# Track 4 — Search Design

## Finding
Lead/company/job-title search was already trigram-indexed; contacts search
was not. No dedicated engine: at this scale ILIKE + GIN is the whole
requirement. Vector/semantic search stays deferred until a measured
latency/quality trigger (p95 filter latency > 500ms at >100k leads, or an
explicit semantic-duplicate requirement).

## Implemented
- Trigram GIN on `hr_contacts(full_name, personal_email)` (schema +
  migration `005_contacts_trgm_search`).
- Proof tests: all five indexes exist; planner uses the trigram index for
  `%term%` filters (`test_search_indexes.py`).
