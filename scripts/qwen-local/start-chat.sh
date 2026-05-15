#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MODEL_DIR="${QWEN_MODEL_DIR:-$HOME/Models/local-llms/qwen}"
MODEL_PATH="${QWEN_CHAT_MODEL_PATH:-$MODEL_DIR/Qwen3-8B-Q4_K_M.gguf}"
PORT="${QWEN_CHAT_PORT:-8791}"
HOST="${QWEN_HOST:-127.0.0.1}"

echo "Note: local Qwen chat is legacy/manual for question-bank; default flows should use DeepSeek." >&2

if [[ ! -f "$MODEL_PATH" ]]; then
  echo "Missing model: $MODEL_PATH" >&2
  echo "Run: scripts/qwen-local/download-models.sh" >&2
  exit 1
fi

exec llama-server \
  --model "$MODEL_PATH" \
  --host "$HOST" \
  --port "$PORT" \
  --alias qwen3-8b-local \
  --ctx-size "${QWEN_CTX_SIZE:-8192}" \
  --gpu-layers "${QWEN_GPU_LAYERS:-auto}" \
  --parallel "${QWEN_PARALLEL:-1}" \
  --jinja
