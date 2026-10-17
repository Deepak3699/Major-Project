# Seeds
Reference / demo data applied after schema + migrations. The admin account is
bootstrapped idempotently by packages/api/src/scripts/seedAdmin.ts (npm run
seed:admin, wired into ../..//up.sh), not a raw SQL seed, so it reuses the
application's password-hashing path.
