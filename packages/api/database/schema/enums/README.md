# Enums
Status vocabularies (pipeline_stage, email_status, whatsapp_status, role) are
modelled as TEXT + CHECK constraints, not native Postgres ENUMs, so they can be
extended without ALTER TYPE. The definitions live in ../constraints. This folder
is reserved for any future genuine CREATE TYPE ... AS ENUM objects.
