CREATE TABLE IF NOT EXISTS content_drafts (
 id TEXT PRIMARY KEY, kind TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision>0),
 document BLOB NOT NULL, updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS content_assets (
 sha256 TEXT PRIMARY KEY, size INTEGER NOT NULL, media_type TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS content_asset_objects (
 sha256 TEXT PRIMARY KEY, data BLOB NOT NULL,
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS content_releases (
 id TEXT PRIMARY KEY, manifest BLOB NOT NULL,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS content_release_documents (
 release_id TEXT NOT NULL REFERENCES content_releases(id), document_id TEXT NOT NULL,
 revision INTEGER NOT NULL, document BLOB NOT NULL, PRIMARY KEY(release_id,document_id)
);
CREATE TABLE IF NOT EXISTS content_release_assets (
 release_id TEXT NOT NULL REFERENCES content_releases(id), sha256 TEXT NOT NULL REFERENCES content_assets(sha256),
 PRIMARY KEY(release_id,sha256)
);
CREATE TABLE IF NOT EXISTS content_channels (
 name TEXT PRIMARY KEY, release_id TEXT NOT NULL REFERENCES content_releases(id)
);
-- Defense in depth: published snapshots and manifests cannot be changed or removed.
DROP TRIGGER IF EXISTS immutable_release_update;
CREATE TRIGGER immutable_release_update BEFORE UPDATE ON content_releases BEGIN
 SELECT RAISE(ABORT, 'published content is immutable');
END;
DROP TRIGGER IF EXISTS immutable_release_delete;
CREATE TRIGGER immutable_release_delete BEFORE DELETE ON content_releases BEGIN
 SELECT RAISE(ABORT, 'published content is immutable');
END;
DROP TRIGGER IF EXISTS immutable_document_update;
CREATE TRIGGER immutable_document_update BEFORE UPDATE ON content_release_documents BEGIN
 SELECT RAISE(ABORT, 'published content is immutable');
END;
DROP TRIGGER IF EXISTS immutable_document_delete;
CREATE TRIGGER immutable_document_delete BEFORE DELETE ON content_release_documents BEGIN
 SELECT RAISE(ABORT, 'published content is immutable');
END;
DROP TRIGGER IF EXISTS immutable_asset_update;
CREATE TRIGGER immutable_asset_update BEFORE UPDATE ON content_release_assets BEGIN
 SELECT RAISE(ABORT, 'published content is immutable');
END;
DROP TRIGGER IF EXISTS immutable_asset_delete;
CREATE TRIGGER immutable_asset_delete BEFORE DELETE ON content_release_assets BEGIN
 SELECT RAISE(ABORT, 'published content is immutable');
END;
CREATE TABLE IF NOT EXISTS content_idempotency (
 scope TEXT NOT NULL, key TEXT NOT NULL, request_hash TEXT NOT NULL,
 status INTEGER NOT NULL, headers BLOB NOT NULL, response BLOB NOT NULL,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), PRIMARY KEY(scope,key)
);
CREATE TABLE IF NOT EXISTS content_channel_events (
 sequence INTEGER PRIMARY KEY AUTOINCREMENT, channel TEXT NOT NULL, previous_release TEXT,
 release_id TEXT NOT NULL REFERENCES content_releases(id), action TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Authoring history shares the draft transaction and survives process restart.
CREATE TABLE IF NOT EXISTS content_authoring_history (
 document_id TEXT PRIMARY KEY REFERENCES content_drafts(id), body BLOB NOT NULL
);
CREATE TABLE IF NOT EXISTS content_authoring_events (
 document_id TEXT NOT NULL REFERENCES content_drafts(id), request_id TEXT NOT NULL,
 revision INTEGER NOT NULL, action TEXT NOT NULL, actor BLOB NOT NULL, label TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 PRIMARY KEY(document_id,request_id), UNIQUE(document_id,revision)
);
