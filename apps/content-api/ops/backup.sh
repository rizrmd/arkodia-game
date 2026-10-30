#!/bin/sh
# Trusted operator only. Produces a mode-0600 bundle containing role credentials.
# Quiesce author/publisher writes during the dump and restore drill.
set -eu
umask 077
cd "$HOME"
export LD_LIBRARY_PATH="$HOME/.local/content-postgres/usr/lib"
pg="$HOME/.local/content-postgres/usr/libexec/postgresql18"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
name="content-$stamp"
stage="$HOME/private/backups/$name"
mkdir -p "$stage/assets"
"$pg/pg_dump" -h 127.0.0.1 -U content -d postgres -Fc -f "$stage/database.dump"
"$pg/psql" -h 127.0.0.1 -U content -d postgres -At -c 'SELECT json_build_object('\''sha256'\'',sha256,'\''size'\'',size) FROM content_assets ORDER BY sha256' > "$stage/assets.jsonl"
cp private/content.env.json "$stage/content.env.json"
BACKUP_STAGE="$stage" node --input-type=module <<'JS'
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
const stage=process.env.BACKUP_STAGE;
const rows=fs.readFileSync(path.join(stage,'assets.jsonl'),'utf8').split('\n').filter(Boolean).map(JSON.parse);
for(const e of rows){
 if(!/^[a-f0-9]{64}$/.test(e.sha256))throw Error('Invalid asset key');
 const b=fs.readFileSync(path.join(process.env.HOME,'data/assets',e.sha256));
 if(b.length!==e.size||createHash('sha256').update(b).digest('hex')!==e.sha256)throw Error('Object integrity failed');
 fs.writeFileSync(path.join(stage,'assets',e.sha256),b,{mode:0o600});
}
console.log(JSON.stringify({verifiedBackupObjects:rows.length}));
JS
archive="$HOME/private/backups/$name.tgz"
tar -czf "$archive" -C "$stage" database.dump assets assets.jsonl content.env.json
chmod 600 "$archive"
# Restore SQL into an isolated database; never overwrite the live database.
db="restorecheck_$(date -u +%s)"
"$pg/createdb" -h 127.0.0.1 -U content --template=template0 "$db"
"$pg/pg_restore" -h 127.0.0.1 -U content --exit-on-error --no-owner -d "$db" "$stage/database.dump"
query="SELECT json_build_object('drafts',(SELECT count(*) FROM content_drafts),'releases',(SELECT count(*) FROM content_releases),'assets',(SELECT count(*) FROM content_assets),'channels',(SELECT count(*) FROM content_channels),'assetDigest',(SELECT md5(string_agg(sha256||size::text,',' ORDER BY sha256)) FROM content_assets))"
"$pg/psql" -h 127.0.0.1 -U content -d postgres -At -c "$query" > "$stage/live-counts.json"
"$pg/psql" -h 127.0.0.1 -U content -d "$db" -At -c "$query" > "$stage/restored-counts.json"
cmp "$stage/live-counts.json" "$stage/restored-counts.json"
"$pg/dropdb" -h 127.0.0.1 -U content "$db"
sha256sum "$archive" > "$archive.sha256"
cp "$stage/restored-counts.json" private/latest-backup-counts.json
printf '%s\n' "$name" > private/latest-backup-name.txt
printf 'Backup and isolated database restore drill passed: %s\n' "$name"
cat "$stage/restored-counts.json"
