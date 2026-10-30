#!/usr/bin/env bash
# Ship the active standalone Pixi runtime through supervised, checksummed releases.
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -n "$(git status --porcelain -- apps/runtime scripts/fural-deploy.sh scripts/deploy-runtime-artifacts.py)" ]; then
 echo 'Commit runtime source before deploying.' >&2
 exit 1
fi
npm --prefix apps/runtime ci --no-audit --no-fund
npm --prefix apps/runtime test
npm --prefix apps/runtime run build
rm -rf .deploy-runtime/dist
mkdir -p .deploy-runtime/dist/evidence
cp -R apps/runtime/dist/. .deploy-runtime/dist/
cp docs/runtime/evidence/*.json .deploy-runtime/dist/evidence/
if [ -d docs/runtime/parity ]; then cp docs/runtime/parity/*.json .deploy-runtime/dist/evidence/; fi
node -e 'const fs=require("fs"),cp=require("child_process");fs.writeFileSync(".deploy-runtime/dist/build.json",JSON.stringify({commit:cp.execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim(),application:"arkodia-pixi-runtime",contentAPI:"https://arkodia-content-api-arkodia.fural.space",channel:"stronghold-original"}))'
python3 scripts/deploy-runtime-artifacts.py
