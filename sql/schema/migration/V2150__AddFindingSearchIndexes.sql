-- Fleet-wide defect/remark search and the "this might be related" hint (#1230).
--
-- The search is a UNION of flight.defect and flight.remark filtered on
-- aircraft, kind, created_at and a free-text fragment; the related-findings
-- hint compares two descriptions for trigram similarity. Both need pg_trgm:
-- ILIKE '%fragment%' is unindexable without a GIN trigram index, and
-- similarity() comes from the same extension.
--
-- pg_trgm has been a *trusted* extension since PostgreSQL 13, so this needs no
-- superuser -- CREATE on the database is enough, which the Flyway role
-- (DO_POSTGRES_ADMIN_USER in the deploy workflows, `admin` locally and in CI)
-- has. Pinned to the public schema so the function calls in
-- finding-queries.ts can qualify it as public.similarity() rather than
-- depending on whatever search_path the pool happens to have.
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;

CREATE INDEX defect_description_trgm_idx
  ON flight.defect USING GIN (description public.gin_trgm_ops);

CREATE INDEX remark_description_trgm_idx
  ON flight.remark USING GIN (description public.gin_trgm_ops);

-- flight.remark already has remark_created_at_idx (V1900); flight.defect does
-- not, and the search's default ordering and date-range filter are both on
-- created_at.
CREATE INDEX defect_created_at_idx ON flight.defect (created_at);
