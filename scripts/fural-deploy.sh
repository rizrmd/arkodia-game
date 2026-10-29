#!/usr/bin/env bash
# Ships only the standalone runtime. The Content API and legacy deployment are untouched.
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -n "$(git status --porcelain -- apps/runtime scripts/fural-deploy.sh)" ]; then
  echo 'Commit runtime source before shipping so build metadata identifies deployed source.' >&2
  exit 1
fi
npm --prefix apps/runtime ci --no-audit --no-fund
npm --prefix apps/runtime test
npm --prefix apps/runtime run build
mkdir -p .deploy-runtime/dist
cp -R apps/runtime/dist/. .deploy-runtime/dist/
cp apps/runtime/ops/server.mjs .deploy-runtime/server.mjs
if [ -d docs/runtime/evidence ]; then
  mkdir -p .deploy-runtime/dist/evidence
  cp docs/runtime/evidence/* .deploy-runtime/dist/evidence/
fi
# Bulk evidence uses the supported streamed file transfer below. The serve
# routed-file reader can fail with unexpected EOF on multi-megabyte PNGs.
rm -rf .deploy-runtime/dist/evidence/stronghold
mkdir -p .deploy-runtime/dist/evidence/stronghold
cp docs/runtime/stronghold/evidence/*.json .deploy-runtime/dist/evidence/stronghold/
node -e 'const fs=require("fs"),cp=require("child_process");fs.writeFileSync(".deploy-runtime/dist/build.json",JSON.stringify({commit:cp.execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim(),application:"arkodia-pixi-runtime",contentAPI:"https://content.arkodia.online",channel:"stronghold-original"}))'
fural-agent sandboxes serve --name arkodia-runtime --slug arkodia-runtime --project PJ8758f22f61165f3d3215e454 --dir "$PWD/.deploy-runtime" --cmd 'cd "$HOME"; exec node server.mjs' --port 3000

# Evidence is an output artifact, separate from the application deployment above.
# A commit-scoped destination preserves earlier evidence and avoids overwriting peers.
source_member=$(fural-agent whoami | python3 -c 'import sys,json;print(json.load(sys.stdin)["user_id"])')
evidence_commit=$(git rev-parse HEAD)
for screenshot in docs/runtime/stronghold/evidence/*.png; do
  [ -f "$screenshot" ] || continue
  fural-agent organization home-files transfer --from-member "$source_member" \
    --from "projects/arkadia/repos/arkodia-game/$screenshot" \
    --to-custom-sandbox CSf41a869d5150ba8d8c7cc935 \
    --to "dist/evidence/stronghold/$evidence_commit/$(basename "$screenshot")"
done
