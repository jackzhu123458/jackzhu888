#!/bin/bash
set -Eeuo pipefail

COZE_WORKSPACE_PATH="${COZE_WORKSPACE_PATH:-$(pwd)}"
cd "${COZE_WORKSPACE_PATH}"

echo "=== Build Step 1: Installing dependencies ==="
pnpm install 2>&1 || { echo "ERROR: pnpm install failed"; exit 1; }

echo "=== Build Step 2: Building Next.js project ==="
pnpm next build 2>&1 || { echo "ERROR: next build failed"; exit 1; }

echo "=== Build Step 3: Bundling server with tsup ==="
pnpm tsup src/server.ts --format cjs --platform node --target node20 --outDir dist --no-splitting --no-minify 2>&1 || { echo "ERROR: tsup build failed"; exit 1; }

echo "=== Build completed successfully ==="
