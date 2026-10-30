#!/bin/sh
# Trusted operator only. Produces a mode-0600 bundle containing role credentials and SQLite snapshot.
set -eu
umask 077
cd "$HOME"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
name="content-$stamp"
stage="$HOME/private/backups/$name"
mkdir -p "$stage/assets"
cp private/content.env.json "$stage/content.env.json"
BACKUP_STAGE="$stage" python3 - <<'PY'
import hashlib, json, os, pathlib, sqlite3

home = pathlib.Path(os.environ['HOME'])
stage = pathlib.Path(os.environ['BACKUP_STAGE'])
live_db = home / 'data/content.db'
backup_db = stage / 'content.db'

with sqlite3.connect(live_db) as src, sqlite3.connect(backup_db) as dst:
    src.backup(dst)

def counts(db_path):
    with sqlite3.connect(db_path) as conn:
        cur = conn.cursor()
        drafts = cur.execute('SELECT count(*) FROM content_drafts').fetchone()[0]
        releases = cur.execute('SELECT count(*) FROM content_releases').fetchone()[0]
        assets = cur.execute('SELECT count(*) FROM content_assets').fetchone()[0]
        channels = cur.execute('SELECT count(*) FROM content_channels').fetchone()[0]
        rows = cur.execute('SELECT sha256, size FROM content_assets ORDER BY sha256').fetchall()
        digest = hashlib.md5(','.join(f'{sha}{size}' for sha, size in rows).encode()).hexdigest() if rows else None
        return {'drafts': drafts, 'releases': releases, 'assets': assets, 'channels': channels, 'assetDigest': digest}, rows

live_summary, rows = counts(live_db)
restored_summary, _ = counts(backup_db)
if live_summary != restored_summary:
    raise RuntimeError('SQLite backup count mismatch')

with (stage / 'assets.jsonl').open('w') as f:
    for sha, size in rows:
        f.write(json.dumps({'sha256': sha, 'size': size}) + '\n')
        p = home / 'data/assets' / sha
        if p.exists():
            b = p.read_bytes()
        else:
            with sqlite3.connect(live_db) as conn:
                row = conn.execute('SELECT data FROM content_asset_objects WHERE sha256=?', (sha,)).fetchone()
                if not row:
                    raise RuntimeError('Missing asset object: ' + sha)
                b = bytes(row[0])
        if len(b) != size or hashlib.sha256(b).hexdigest() != sha:
            raise RuntimeError('Object integrity failed: ' + sha)
        dest = stage / 'assets' / sha
        dest.write_bytes(b)
        os.chmod(dest, 0o600)

(stage / 'live-counts.json').write_text(json.dumps(live_summary) + '\n')
(stage / 'restored-counts.json').write_text(json.dumps(restored_summary) + '\n')
print(json.dumps({'verifiedBackupObjects': len(rows)}))
PY
archive="$HOME/private/backups/$name.tgz"
tar -czf "$archive" -C "$stage" content.db assets assets.jsonl content.env.json
chmod 600 "$archive"
cmp "$stage/live-counts.json" "$stage/restored-counts.json"
sha256sum "$archive" > "$archive.sha256"
cp "$stage/restored-counts.json" private/latest-backup-counts.json
printf '%s\n' "$name" > private/latest-backup-name.txt
printf 'Backup and isolated SQLite restore drill passed: %s\n' "$name"
cat "$stage/restored-counts.json"
