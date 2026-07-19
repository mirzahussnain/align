-- Runs once, when the data volume is first created.
--
-- pgvector is enabled up front so it is present the day embeddings are added,
-- rather than discovering mid-feature that the local database can't hold them.
-- Neon has this extension available too, so enabling it here does not put local
-- ahead of where production can follow.
CREATE EXTENSION IF NOT EXISTS vector;

-- Prisma's `cuid()` runs in the application, not the database, so no uuid
-- extension is needed. pg_trgm earns its place separately: fuzzy matching on
-- company and job titles is the obvious next thing the sponsor lookup wants.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
