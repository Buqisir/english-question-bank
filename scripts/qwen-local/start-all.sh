#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

cat >&2 <<'EOF'
Note: question-bank no longer starts local embedding/reranker services.
This legacy helper now starts only Qwen chat for manual synonym-difficulty experiments.
Default question-bank flows use DeepSeek Flash + SQL/rules.
EOF

exec "$ROOT_DIR/scripts/qwen-local/start-chat.sh"
