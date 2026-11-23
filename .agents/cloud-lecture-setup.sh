#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

# Installs Node 24 and locked server dependencies without the OCR toolchain.
bash .agents/setup --analysis-only
export PATH="$HOME/.local/node-24/bin:$PATH"
CI=true pnpm -C app install --frozen-lockfile

# Frozen product validation uses pdfinfo. pdftoppm is also used to inspect the PDF.
if ! command -v pdfinfo >/dev/null || ! command -v pdftoppm >/dev/null; then
  apt-get update
  apt-get install -y --no-install-recommends poppler-utils
fi

# Export the same path in the authoring shell. The renderer uses the full
# Playwright-pinned Chromium from this cache, not Google Chrome for Testing.
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers}"
if ! node -e 'const { chromium } = require("./server/node_modules/playwright-core"); require("node:fs").accessSync(chromium.executablePath(), require("node:fs").constants.X_OK)'; then
  pnpm -C app exec playwright install --no-shell chromium
fi
