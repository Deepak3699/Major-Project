import type { MigrationContext } from 'node-pg-migrate';

// Earlier connectors put the job title/summary in about_job, and duplicate
// ingestion never replaced a stale description. Recover the actual source body
// where it was retained in the raw public-source payload.
export const up = async (pgm: MigrationContext) => {
  const sql = [
    "WITH source_text AS (",
    "  SELECT jp.id,",
    "    btrim(regexp_replace(regexp_replace(COALESCE(",
    "      NULLIF(jp.raw_payload->>'description',''),",
    "      NULLIF(jp.raw_payload->>'descriptionPlain',''),",
    "      NULLIF(jp.raw_payload->>'description_plain',''),",
    "      NULLIF(jp.raw_payload->>'jobDescription',''),",
    "      NULLIF(jp.raw_payload->>'job_description',''),",
    "      NULLIF(jp.raw_payload->>'content',''),",
    "      NULLIF(jp.raw_payload->'job'->>'description',''),",
    "      NULLIF(jp.raw_payload->'job'->>'descriptionPlain',''),",
    "      NULLIF(jp.raw_payload->'job'->>'content',''),",
    "      NULLIF(jp.raw_payload->>'about_job',''),",
    "      ''",
    "    ), '<(br|/p|/div|/li|/h[1-6])[^>]*>', E'\\n', 'gi'), '<[^>]*>', ' ', 'g')) AS body,",
    "    regexp_replace(lower(COALESCE(jp.title,'')), '[^a-z0-9]+', ' ', 'g') AS title_key",
    "  FROM job_postings jp",
    "), usable AS (",
    "  SELECT id, btrim(regexp_replace(body, '[[:space:]]+', ' ', 'g')) AS body",
    "  FROM source_text",
    "  WHERE length(body) >= 80",
    "    AND regexp_replace(lower(body), '[^a-z0-9]+', ' ', 'g')",
    "        <> regexp_replace(lower(COALESCE(title_key,'')), '[[:space:]]+', ' ', 'g')",
    ")",
    "UPDATE job_postings jp",
    "   SET description = usable.body, about_job = usable.body, parser_version = '7'",
    "  FROM usable",
    " WHERE jp.id = usable.id",
    "   AND (jp.description IS DISTINCT FROM usable.body OR jp.about_job IS DISTINCT FROM usable.body)"
  ].join('\n');
  await pgm.sql(sql);
};

export const down = async (_pgm: MigrationContext) => {};
