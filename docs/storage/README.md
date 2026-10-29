## Asset storage operations

The shared Python tool is vendored byte-for-byte in the active `arkodia-editor` and `arkodia-game` repos. A legacy-repo patch is retained separately because another session is moving `arkodia-archived` into a shared archive sandbox. Run the tool with Python 3.12+ from a repo root. Update and test both active copies together. No npm package or service credential is needed for audit, archive or cache operations.

```sh
python3 tools/asset-storage/assets.py audit --output "$HOME/reports/storage-audit.json"
python3 tools/asset-storage/assets.py push
python3 tools/asset-storage/assets.py verify --archive-only
python3 tools/asset-storage/assets.py pull --pattern 'public/assets/*'
python3 tools/asset-storage/assets.py prune --dry-run
python3 tools/asset-storage/assets.py prune --apply --pin-lock assets.lock.json
python3 tools/asset-storage/assets.py report --output "$HOME/reports/storage-report.json"
```

`push` captures tracked binary bytes into the private archive, deduplicated by full SHA-256. It never deletes source files, changes the Git index, rewrites history, or publishes licensed masters. It can read verified local LFS objects when a sparse checkout has only pointers. Hydrate missing LFS objects explicitly with `git lfs pull --include=...`.

The defaults are `$HOME/.local/share/arkodia-assets/archive` and `$HOME/.cache/arkodia-assets`. Set `ARKODIA_ASSET_ARCHIVE` / `ARKODIA_ASSET_CACHE` to use restored storage. The archive root is mode 0700. Different repos use the same digest keys. Other members must receive an authorized copy of the archive (including indexes), or use public Content API releases. A local archive is not an independent backup.

`assets.lock.json` pins the original source commit and checksum-verified JSON shards in `asset-lock/`. Entries contain `path`, `sha256`, `size`, `role` (`runtime`, `source`, `evidence`), and `source`. Archive source keys are always the digest under `objects/`; content sources pin an HTTPS origin and immutable release ID. Credentials never appear in a lock. Materialization preserves original relative paths and refuses to overwrite local edits or traverse symlinks outside the repo.

Runtime publication uses the existing API contract, not a new public asset endpoint:

```sh
python3 tools/asset-storage/assets.py publish \
  --origin https://content.arkodia.online \
  --token-file "$HOME/private/content.env.json" \
  --channel storage-editor --pattern 'public/assets/*'
```

Run publication from a trusted operator environment with the archive and author/publisher tokens. Only runtime assets up to 16 MiB are accepted. The tool uploads unique objects, publishes environment documents containing the asset references, verifies every public object, then changes the local lock. The dedicated `storage-*` channel does not replace gameplay channels. Archive ZIPs, videos, evidence and masters stay private; no automatic mass publish or size-limit increase. HTTP redirects are refused to prevent credential forwarding.

## CI and history

The workflow checks every commit in a PR or push, including binaries added and then deleted. The checker and policy come from the trusted base commit. A PR cannot add its own baseline exemptions. New/changed binary files require asset storage; new text files over 1 MiB and generated/cache directories are rejected. Fixture exceptions must be reviewed in the base policy and contain a matching SHA-256 with size at most 256 KiB. Baseline shards record legacy paths, Git object IDs, SHA-256, sizes and LFS status. Existing bytes may be converted to LFS pointers without a policy failure; introducing different bytes under the same path is rejected.

The first policy installation requires review because its parent has no policy. Protect the default branch and require the `Asset storage / policy` check through repository settings. Regenerating `audit --baseline` is an operator action, never an automatic CI step. The manifest and policy are split into shards so they also meet the 1 MiB limit.

The parallel task owns legacy cleanup and archiving. Do not rewrite or publish that repository from this task. This tool can preserve existing LFS bytes without another history rewrite. Editor/game history is retained. Untracking binaries later does not remove historical Git/LFS storage. Use partial clones and selective LFS fetches for code work.

## Capacity, retention and restore

The local cache is capped at 2 GiB with LRU eviction after materialization. Materialized files are independent copies, so cache eviction does not break an open editor. Use `prune --pin-lock` to keep a chosen working set in cache. A pinned set larger than the budget is reported as over budget. Prune defaults to a dry run, only removes cache objects and publisher part files older than seven days, and never touches masters, published objects, database rows or backups.

Bulk archive imports stop when the containing filesystem reaches 80% usage or lacks staging reserve. Reports warn at 70%. These filesystem percentages are not the organization's billing quota: check `fural-agent organization disk-usage` as well. The Content API boot supervisor writes `data/storage-report.json` at startup and daily; it reports persistent assets and archive sizes and never deletes release objects. Supervisor monitoring activates when those app files are deployed. Local `report` also counts backups, release staging, Git object storage and growth since the previous report.

Move to S3/R2 before further bulk imports at the stop threshold. Copy and verify every digest before switching the existing adapter; keep all immutable release keys. Sandbox persistence and a second directory on the same disk are not off-site backup.

For a restore drill, copy the archive/indexes into a separate directory, run `verify --archive-only`, then `pull` into an empty checkout and compare every checksum. Restore PostgreSQL and referenced objects together into a separate environment before switching traffic. Do not remove any original source or existing cleanup bundle until an independent backup and restore drill are verified.

## Migration safety

Editor runtime assets have been published and verified, retained in a private archive on another node, and untracked from Git. Build/dev hydrates their original paths from the pinned public release. The remaining evidence/master tracking is retained until its references and independent backup are verified. Existing Knowledge/review URLs must keep serving or be updated before evidence is removed. Never add broad ignore rules for whole asset folders while they still contain source JSON or scripts.

Content API restoration in this task rebuilds from Git with a new database at the user's request. Only content reconstructible from Git is republished with new IDs. Unpublished drafts and previous database-only release history are not recoverable without a backup. The deleted dev/runtime/wildlife sandboxes are not recreated.

Operator backup: `sh "$HOME/app/backup.sh"` inside the Content API sandbox captures SQL, immutable objects and role configuration in a private mode-0600 bundle, verifies objects, and restores SQL into an isolated database. Quiesce writes while it runs. Copy the bundle to independent storage and verify its checksum; never publish or attach it because it contains credentials.
