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
node -e 'const fs=require("fs"),cp=require("child_process");fs.writeFileSync(".deploy-runtime/dist/build.json",JSON.stringify({commit:cp.execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim(),application:"arkodia-pixi-runtime",contentAPI:"https://content.arkodia.online",channel:"runtime-demo"}))'
fural-agent sandboxes serve --name arkodia-runtime --slug arkodia-runtime --project PJ8758f22f61165f3d3215e454 --dir .deploy-runtime --cmd 'cd "$HOME"; exec node server.mjs' --port 3000
