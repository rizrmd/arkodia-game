#!/usr/bin/env bash
# Build and deploy only the Content API through supported sandbox operations.
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.local/bin:$HOME/.local/go/bin:$PATH"
test -z "$(git status --porcelain -- apps/content-api scripts/deploy-content-api.sh scripts/deploy-content-api.py)"
go test ./apps/content-api -count=1
mkdir -p .deploy-content-api
CGO_ENABLED=0 go build -trimpath -o .deploy-content-api/content-api ./apps/content-api
python3 scripts/deploy-content-api.py
