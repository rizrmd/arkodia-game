# Shared Content API

Go HTTP service for environment, base, character, animation, and VFX documents. No UI is shipped. The future Pixi editor uses the framework-independent TypeScript client in `packages/content-contracts/index.ts`; the game uses only the public release routes.

## Architecture

PostgreSQL stores revisioned drafts, asset metadata, immutable release manifests, complete document snapshots, and channel pointers. A publication transaction checks every selected revision, locks selected drafts, verifies object bytes against SHA-256, checks character animation references, inserts the complete release, then moves the channel pointer atomically. PostgreSQL triggers reject mutation/deletion of published rows. Published data remains readable after editing or deleting its source draft.

Objects use SHA-256 keys. The deployed adapter stores bytes in persistent `$HOME/data/assets`. The optional S3 adapter supports an existing S3/R2-compatible bucket using `S3_ENDPOINT` (host only), `S3_BUCKET`, `S3_ACCESS_KEY`, and `S3_SECRET_KEY`; TLS is on unless `S3_INSECURE=true`. It never invents provider credentials or creates buckets. Release-specific public asset URLs carry immutable CDN cache headers. Draft assets require authentication and cannot be fetched through a release that does not include them. Cloudflare is the deployed CDN; storage currently uses persistent sandbox disk, not R2.

## Document contract

Canonical schema: `packages/content-contracts/document.schema.json`, also served at `/contracts/document.schema.json`. Envelope fields: `schemaVersion: 1`, `kind`, `name`, `assets` (SHA-256 strings), and `data`. Environment/base data requires positive integer `width`, `height`, and `layers` with IDs and object arrays. Character data requires an `animations` map of names to animation document IDs. Animation/VFX data requires `fps`, `loop`, and sprite `frames` with an asset digest and integer rectangle. Frame assets must appear in the envelope's asset list. All listed assets must already exist. Character animation IDs must resolve to animation documents selected in the same release.

Scene objects and additional data fields are intentionally extensible v1 payloads for future editors; this service does not implement game mechanics validation, coordinate interpretation, or legacy save migration. Unknown envelope fields, unsupported kinds/versions, malformed frames, and missing assets fail validation. Documents are limited to 4 MiB, assets to 16 MiB, and releases to 1000 selected documents.

## Authentication and API

Editor requests require `Authorization: Bearer <CONTENT_API_TOKEN>`. The server requires at least 32 characters; deployment generates a cryptographically random 48-byte token stored with mode 0600 in `$HOME/private/content.env.json`. Do not embed it in a public game build. This is a service/editor administrator token, not per-user login or role-based authorization. A future editor should obtain it through a trusted operator/session boundary. Unauthenticated draft requests return 401 with `Cache-Control: no-store`.

| Method and path | Behavior |
|---|---|
| `GET /healthz` | Database readiness |
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

Errors are JSON `{error: code}`. Stale saves, deletes, or publish selections return 409; reload the draft and explicitly merge/retry rather than silently overwriting it. Publication serialization conflicts also return 409 and can be retried after reload. Schema/asset/reference failures return 422; missing resources return 404; missing delete precondition returns 428. Draft kinds cannot change under an existing ID. IDs/channels allow 1–100 ASCII letters, digits, `_` and `-`.

## Load → save → publish → game read

1. Upload binary assets with the editor token and retain their digests.
2. Create a document with revision 0, or load the latest draft first. Persist the revision returned by every save.
3. On 409, load again, show the user the competing change, and merge or explicitly retry using the newly loaded revision.
4. Publish the exact desired IDs and revisions to a channel, including referenced animation documents. This creates a new random release ID; it never edits an existing release.
5. The game fetches a channel pointer once, loads its manifest, and pins that release ID for the whole session. Fetch document and asset URLs from that manifest. No editor token is needed. The TypeScript client verifies document SHA-256.
6. To roll back, republish desired retained drafts as a new release/channel selection. Existing release URLs remain valid. There is no destructive release deletion API.

## Development and tests

Go 1.25.3 or newer and PostgreSQL 18 are used by this deployment. Tests use a temporary schema in the supplied database, including concurrent HTTP saves and API/pool restart against the same persistent state.

```sh
TEST_DATABASE_URL='postgres://USER@localhost/DB?sslmode=disable' go test -v ./...
CGO_ENABLED=0 go build -trimpath -o bin/content-api ./apps/content-api
DATABASE_URL='postgres://...' CONTENT_API_TOKEN='...' PUBLIC_URL='https://content.example' ASSET_DIR='./data/assets' ./bin/content-api
```

`LISTEN_ADDR` defaults to `:3000`. `CORS_ORIGINS` is a comma-separated exact allowlist. The deployed values allow `https://arkodia.online` and `https://editor.arkodia.online`; CORS is not authentication. HTTP server deadlines, database pool limits, upload limits, and request context timeouts bound resource use.

## Deployment and operations

Dedicated existing sandbox: `CS4cff70216b6c6d7b499790b5`, slug `arkodia-content-api`. Boot runs `exec sh "$HOME/app/boot.sh"`; that execs the foreground Node supervisor. The supervisor starts PostgreSQL bound only to loopback with a private socket directory, waits for readiness, then starts the static Go binary. Local PostgreSQL trust is scoped to this isolated sandbox; no database TCP port is published. Both children receive termination signals and the supervisor exits if either fails. The platform supervises boot and restores it on sandbox power-on. Database memory is capped through conservative shared buffers, connection limits, and the API's six-connection pool.

Persistent paths:

- `$HOME/data/postgres`: PostgreSQL cluster; never remove/reinitialize during deployment.
- `$HOME/data/assets`: content-addressed object bytes.
- `$HOME/private/content.env.json`: generated editor token and optional runtime overrides.
- `$HOME/app`: replaceable executable and boot scripts.
- `$HOME/.local/content-postgres`: HOME-only PostgreSQL runtime installed from Alpine HTTPS packages using `ops/install-postgres.py`.

Deploy only the Content API artifacts, verify checksums, and atomically rename the new binary. Keep existing data/private directories. Configure the sandbox boot using `fural-agent sandboxes update ... --boot-script-file ...`, then run `sandboxes boot`. Do not restart the game sandbox. `ops/deploy.py` automates builds and checksum-verified file transfer through a temporary member HTTP route, configures the existing boot, and pushes task changes separately through normal git. It does not create a sandbox or use a host deployment bypass.

Domain routing binds `content.arkodia.online` port 3000 to this sandbox. Cloudflare's proxied CNAME points to the existing Fural ingress `arkodia-content-api-arkodia.fural.space`; credentials are used from the injected environment without logging them. Existing apex/game DNS and deployments are untouched.

Use `sandboxes logs <id> --name boot --lines 100` for startup errors and `GET /healthz` for readiness. If a process disappears unexpectedly, inspect `organization resource-incidents --limit 20` and the sandbox logs before restarting. Controlled verification: run `node "$HOME/app/verify-live.mjs" seed`, restart the sandbox with `fural-agent sandboxes restart`, wait for HTTPS health, then run `node "$HOME/app/verify-live.mjs" verify`. The script reads the token locally and prints only nonsensitive test evidence. The `acceptance` channel contains test fixtures, separate from production `stable` content.

Back up PostgreSQL using `pg_dump` plus the complete asset directory (or bucket), and securely back up the private runtime configuration. For a consistent restore, stop writes or capture a database snapshot before copying all referenced immutable asset keys. Restore to a separate database/object root and verify manifests before routing traffic. Sandbox persistence is not an off-site backup or high-availability database. No external backup provider is configured in this task.

Rotate the editor token by securely replacing `CONTENT_API_TOKEN` in the mode-0600 runtime JSON and booting again; distribute it only through trusted access. The deployed local adapter can later be switched to S3 after copying all existing digest-keyed objects and validating every published reference. Never switch to an empty bucket.
