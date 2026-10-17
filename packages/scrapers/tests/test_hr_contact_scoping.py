"""HR contact scoping: one person belongs to one employer.

Regression guard for the contamination where 356/363 leads were attached to a
contact from an unrelated company. Two independent causes, both pinned here:

  1. The lookup passed '' (not NULL) for missing linkedin_url/personal_email and
     matched on `linkedin_url = $1 OR personal_email = $2`. Since '' = '' is TRUE
     in SQL, every lead without scraped contact details reused whichever stored
     contact also held empty strings.
  2. Even a genuine match was global, ignoring current_company_id, so a recruiter
     surfaced by search became the contact for many other employers' leads.

Runs against the real schema (conftest reloads packages/api/database/schema), so
the CHECK constraint and per-company unique indexes are exercised too.
"""
import uuid

import pytest

pytestmark = pytest.mark.asyncio


async def _company(conn, name):
    return await conn.fetchval(
        "INSERT INTO companies (name, domain) VALUES ($1,$2) RETURNING id",
        name, f"{uuid.uuid4().hex[:8]}.example",
    )


async def _contact(conn, company_id, email=None, linkedin=None, mobile=None, name="Real Recruiter"):
    return await conn.fetchval(
        "INSERT INTO hr_contacts (full_name, personal_email, linkedin_url, personal_mobile,"
        " current_company_id) VALUES ($1,$2,$3,$4,$5) RETURNING id",
        name, email, linkedin, mobile, company_id,
    )


class TestLocatorConstraint:
    async def test_contact_without_any_locator_is_rejected(self, db_pool):
        async with db_pool.acquire() as conn:
            co = await _company(conn, "Co A")
            with pytest.raises(Exception) as exc:
                await _contact(conn, co)  # no email/linkedin/mobile
            assert "hr_contacts_has_locator" in str(exc.value)

    async def test_empty_string_locator_is_rejected_not_stored(self, db_pool):
        """'' must not be storable: it is what made `'' = ''` cross-match."""
        async with db_pool.acquire() as conn:
            co = await _company(conn, "Co B")
            with pytest.raises(Exception) as exc:
                await _contact(conn, co, email="", linkedin="")
            assert "hr_contacts_has_locator" in str(exc.value)

    async def test_anonymised_row_may_have_no_locator(self, db_pool):
        """Retention blanks locators on purpose; the constraint must allow it."""
        async with db_pool.acquire() as conn:
            co = await _company(conn, "Co C")
            hc = await _contact(conn, co, email="a@corp.example")
            await conn.execute(
                "UPDATE hr_contacts SET full_name=NULL, personal_email=NULL,"
                " personal_mobile=NULL, linkedin_url=NULL,"
                " extraction_provenance=jsonb_build_object('retained_anonymised_at', now()::text)"
                " WHERE id=$1", hc,
            )
            row = await conn.fetchrow("SELECT personal_email FROM hr_contacts WHERE id=$1", hc)
            assert row["personal_email"] is None


class TestScopedReuse:
    async def _lookup(self, conn, company_id, linkedin, email):
        """Mirror of normalizer.py's find-or-create lookup."""
        return await conn.fetchrow(
            """SELECT id FROM hr_contacts
                WHERE current_company_id = $1
                  AND ((linkedin_url IS NOT NULL AND linkedin_url <> ''
                        AND linkedin_url = $2)
                    OR (personal_email IS NOT NULL AND personal_email <> ''
                        AND personal_email = $3))
                LIMIT 1""",
            company_id, linkedin, email,
        )

    async def test_blank_search_terms_match_nothing(self, db_pool):
        """The exact bug: two '' arguments used to hit any ''-valued row."""
        async with db_pool.acquire() as conn:
            co_a = await _company(conn, "Employer A")
            co_b = await _company(conn, "Employer B")
            # Employer B has a fully-populated contact.
            await _contact(conn, co_b, email="someone@b.example",
                           linkedin="https://www.linkedin.com/in/someone-b")
            found = await self._lookup(conn, co_a, "", "")
            assert found is None, "blank terms must never resolve a contact"

    async def test_one_linkedin_profile_cannot_serve_two_employers(self, db_pool):
        """hr_contacts.linkedin_url is globally UNIQUE, so a profile belongs to at
        most one contact row -- cross-company reuse via linkedin_url was never
        possible. It is the empty-string email path that caused the contamination,
        which the two tests above pin."""
        li = "https://www.linkedin.com/in/shared-recruiter"
        async with db_pool.acquire() as conn:
            co_a = await _company(conn, "Employer A")
            co_b = await _company(conn, "Employer B")
            hc_a = await _contact(conn, co_a, linkedin=li, name="A Recruiter")
            with pytest.raises(Exception) as exc:
                await _contact(conn, co_b, linkedin=li, name="B Recruiter")
            assert "hr_contacts_linkedin_url_key" in str(exc.value)

            # Within its own employer the profile resolves; elsewhere it does not.
            hit_a = await self._lookup(conn, co_a, li, "")
            hit_b = await self._lookup(conn, co_b, li, "")
            assert hit_a["id"] == hc_a
            assert hit_b is None

    async def test_per_company_unique_index_blocks_duplicate_within_employer(self, db_pool):
        async with db_pool.acquire() as conn:
            co = await _company(conn, "Employer A")
            em = f"dup@{uuid.uuid4().hex[:6]}.example"
            await _contact(conn, co, email=em)
            with pytest.raises(Exception) as exc:
                await _contact(conn, co, email=em.upper())  # case-insensitive
            assert "uq_hrcontacts_company_email" in str(exc.value)

    async def test_two_employers_may_each_hold_their_own_contact(self, db_pool):
        """Scoping must not over-restrict: different employers are independent."""
        async with db_pool.acquire() as conn:
            co_a = await _company(conn, "Employer A")
            co_b = await _company(conn, "Employer B")
            em = "shared-name@example"
            hc_a = await _contact(conn, co_a, email=em)
            hc_b = await _contact(conn, co_b, email=em)
            assert hc_a != hc_b
