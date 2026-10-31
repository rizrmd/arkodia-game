# Shared Content API

Go HTTP service for environment, base, character, animation, and VFX documents. No UI is shipped. The Pixi editor uses the framework-independent TypeScript client in `packages/content-contracts/index.ts`; the game uses only the public release routes.

## Architecture

SQLite (`github.com/ncruces/go-sqlite3`, pure-Go WebAssembly build without C/CGO) stores revisioned drafts, asset metadata and objects, immutable release manifests, complete document snapshots, idempotency records, and channel pointers in `$HOME/data/content.db` (WAL mode, `busy_timeout=10000`, `foreign_keys=ON`, `IMMEDIATE` serializable transactions). A publication transaction checks every selected revision, verifies object bytes against SHA-256, checks character animation and v2 dependency closures, inserts the complete release, then moves the channel pointer atomically. SQLite triggers reject mutation or deletion of published rows. Published data remains readable after editing or deleting its source draft.

Objects use SHA-256 keys. The default `SQLiteObjects` adapter persists asset bytes in `content_asset_objects` inside SQLite while optionally mirroring/reading fallback files in `$HOME/data/assets`. The optional S3 adapter supports an existing S3/R2-compatible bucket using `S3_ENDPOINT` (host only), `S3_BUCKET`, `S3_ACCESS_KEY`, and `S3_SECRET_KEY`; TLS is on unless `S3_INSECURE=true`. Release-specific public asset URLs carry immutable CDN cache headers. Draft assets require authentication and cannot be fetched through a release that does not include them.

## Document contract

Canonical schema: `packages/content-contracts/document.schema.json`, also served at `/contracts/document.schema.json`. Envelope fields: `schemaVersion: 1`, `kind`, `name`, `assets` (SHA-256 strings), and `data`. Environment/base data requires positive integer `width`, `height`, and `layers` with IDs and object arrays. Character data requires an `animations` map of names to animation document IDs. Animation/VFX data requires `fps`, `loop`, and sprite `frames` with an asset digest and integer rectangle. Frame assets must appear in the envelope's asset list. All listed assets must already exist. Character animation IDs must resolve to animation documents selected in the same release.

Scene objects and additional data fields are intentionally extensible v1 payloads; unknown envelope fields, unsupported kinds/versions, malformed frames, and missing assets fail validation. Documents are limited to 4 MiB, assets to 16 MiB, and releases to 1000 selected documents.

## Authentication and API

Editor requests require `Authorization: Bearer <CONTENT_API_TOKEN>`. The server requires at least 32 characters; deployment generates cryptographically random 48-byte tokens stored with mode 0600 in `$HOME/private/content.env.json`. Do not embed it in a public game build. Separate author/publisher role tokens are supported. Unauthenticated draft requests return 401 with `Cache-Control: no-store`.

| Method and path | Behavior |
|---|---|
| `GET /healthz` | SQLite database readiness |
| `GET /v1/drafts` | Authenticated list, sorted by ID, at most 1000 |
| `GET /v1/drafts/{id}` | Load document and revision; ETag is quoted revision |
| `PUT /v1/drafts/{id}` | Body `{revision, document}`; revision 0 creates, otherwise atomic compare-and-swap |
| `DELETE /v1/drafts/{id}` | Requires quoted revision header, e.g. `If-Match: "2"` |
| `POST /v1/assets` | Raw asset bytes; returns digest, size, detected MIME type and authenticated preview URL |
| `GET /v1/assets/{sha256}` | Authenticated asset preview |
| `POST /v1/releases` | Body `{channel, documents: [{id, revision}]}`; returns immutable manifest |
| `GET /v1/channels/{channel}` | Public pointer `{releaseId, manifestUrl}`; revalidate on every load |
| `GET /v1/releases/{release}` | Public immutable manifest |
| `GET /v1/releases/{release}/documents/{id}` | Public immutable document snapshot |
| `GET /v1/releases/{release}/assets/{sha256}` | Public asset only if included in this release |

Errors are JSON `{error: code}`. Stale saves, deletes, or publish selections return 409; reload the draft and explicitly merge/retry rather than silently overwriting it. Schema/asset/reference failures return 422; missing resources return 404; missing delete precondition returns 428. Draft kinds cannot change under an existing ID. IDs/channels allow 1–100 ASCII letters, digits, `_` and `-`.

## Development and tests

Go 1.26+ and `github.com/ncruces/go-sqlite3` are used (`CGO_ENABLED=0`). Tests automatically run against isolated temporary SQLite databases, including concurrent HTTP saves and full API/pool restart against the same persistent SQLite file.

```sh
go test -v ./...
CGO_ENABLED=0 go build -trimpath -o bin/content-api ./apps/content-api
SQLITE_PATH='./data/content.db' CONTENT_API_TOKEN='...' PUBLIC_URL='https://content.example' ASSET_DIR='./data/assets' ./bin/content-api
```

`LISTEN_ADDR` defaults to `:3000`. `CORS_ORIGINS` is a comma-separated exact allowlist. The deployed values allow `https://arkodia.online` and `https://editor.arkodia.online`.

## Deployment and operations

Dedicated existing sandbox: `CS4cff70216b6c6d7b499790b5`, slug `arkodia-content-api`. Boot runs `exec sh "$HOME/app/boot.sh"`; that execs the foreground Node supervisor (`supervise.mjs`), which starts the static Go binary backed by `$HOME/data/content.db`.

Persistent paths:

- `$HOME/data/content.db`: SQLite database (WAL mode); never remove or reinitialize during deployment.
- `$HOME/data/assets`: content-addressed object bytes.
- `$HOME/private/content.env.json`: generated editor/author/publisher tokens and optional runtime overrides.
- `$HOME/app`: replaceable executable and boot scripts.

Operator backup: `sh "$HOME/app/backup.sh"` inside the Content API sandbox captures an atomic online SQLite backup (`sqlite3.connect.backup`), immutable objects, and role configuration in a private mode-0600 bundle, verifies objects, and compares live and restored row/digest counts.

## v3 authoring projects

`schemaVersion: 3`, `kind: authoring-project` adds one editor-only aggregate per project with domain maps for objects, environments, bases, characters, animations, audio, VFX and catalog. The registry advertises v3 and `/contracts/v3/document.schema.json`. Entity data is extensible native JSON; explicit references and asset declarations are validated. Native gameplay/renderer semantics are not implied by acceptance of arbitrary entity data.

Create with revision 0 through the existing draft PUT. Subsequent changes use authenticated `POST /v1/drafts/{id}/transactions` with `{revision,groupId,label,actor:{userId,jobId?},action,unit?,operations?}` and a required Idempotency-Key. Actions are commit, validate, undo and redo; units are group (default) and operation. Commit/validate accept 1–256 meaningful `entity.put` or `entity.remove` operations. A put carries the complete `{id,name,data,assets,references}` entity. Final graph validation permits forward references within the same batch. Validate does not write the draft. The author role asserts actor identity; the authenticated editor backend must enforce human/project authorization.

`GET /v1/drafts/{id}/history` returns group labels, actors, operation labels, applied counts and Undo/Redo availability. Draft/history/audit/idempotent response are committed atomically in SQLite. History retains 50 groups. Step Undo must leave a valid graph. New edits discard redo; revision and group-ID checks prevent lost updates and duplicate operations. Generic PUT after creation, deletion, and release publication cannot bypass v3 authoring history. v1/v2 behavior remains available.

See the editor repository `docs/AUTHORING-BACKEND.md` for the backend tool registry, SDK, scoped asset access, native snapshot adapter and recoverable AI job lifecycle. No editor UI or production migration is included.
