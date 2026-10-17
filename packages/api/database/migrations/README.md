# Migrations
Incremental, forward-only DDL layered ON TOP of the declarative base in
../schema. Use this for changes to an ALREADY-DEPLOYED production database
(where you cannot re-run the whole schema). Every file MUST be idempotent
(IF NOT EXISTS / DROP-then-ADD) so a fresh DB (already provisioned from
../schema) and an older DB converge to the same state. node-pg-migrate discovers
this one flat directory; order by filename.
