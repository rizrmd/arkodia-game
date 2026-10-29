CREATE TABLE IF NOT EXISTS content_drafts (
 id text PRIMARY KEY, kind text NOT NULL, revision bigint NOT NULL CHECK(revision>0),
 document jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS content_assets (
 sha256 text PRIMARY KEY, size bigint NOT NULL, media_type text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS content_releases (
 id text PRIMARY KEY, manifest jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS content_release_documents (
 release_id text NOT NULL REFERENCES content_releases(id), document_id text NOT NULL,
 revision bigint NOT NULL, document jsonb NOT NULL, PRIMARY KEY(release_id,document_id)
);
CREATE TABLE IF NOT EXISTS content_release_assets (
 release_id text NOT NULL REFERENCES content_releases(id), sha256 text NOT NULL REFERENCES content_assets(sha256), PRIMARY KEY(release_id,sha256)
);
CREATE TABLE IF NOT EXISTS content_channels (name text PRIMARY KEY, release_id text NOT NULL REFERENCES content_releases(id));
-- Defense in depth: published snapshots and manifests cannot be changed or removed.
CREATE OR REPLACE FUNCTION content_reject_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'published content is immutable'; END $$;
DROP TRIGGER IF EXISTS immutable_release ON content_releases;
CREATE TRIGGER immutable_release BEFORE UPDATE OR DELETE ON content_releases FOR EACH ROW EXECUTE FUNCTION content_reject_mutation();
DROP TRIGGER IF EXISTS immutable_document ON content_release_documents;
CREATE TRIGGER immutable_document BEFORE UPDATE OR DELETE ON content_release_documents FOR EACH ROW EXECUTE FUNCTION content_reject_mutation();
DROP TRIGGER IF EXISTS immutable_asset ON content_release_assets;
CREATE TRIGGER immutable_asset BEFORE UPDATE OR DELETE ON content_release_assets FOR EACH ROW EXECUTE FUNCTION content_reject_mutation();
