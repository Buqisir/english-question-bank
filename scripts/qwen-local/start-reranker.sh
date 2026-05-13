#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MODEL_DIR="${QWEN_MODEL_DIR:-$ROOT_DIR/models/qwen}"
MODEL_PATH="${QWEN_RERANKER_MODEL_PATH:-$MODEL_DIR/Qwen3-Reranker-0.6B-Q4_K_M.gguf}"
PORT="${QWEN_RERANKER_PORT:-8793}"
HOST="${QWEN_HOST:-127.0.0.1}"

if [[ ! -f "$MODEL_PATH" ]]; then
  echo "Missing model: $MODEL_PATH" >&2
  echo "Run: scripts/qwen-local/download-models.sh" >&2
  exit 1
fi

exec llama-server \
  --model "$MODEL_PATH" \
  --host "$HOST" \
  --port "$PORT" \
  --alias qwen3-reranker-0.6b-local \
  --ctx-size "${QWEN_RERANKER_CTX_SIZE:-4096}" \
  --gpu-layers "${QWEN_RERANKER_GPU_LAYERS:-auto}" \
  --rerank \
  --pooling rank
