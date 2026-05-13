#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

cleanup() {
  if [[ -n "${CHAT_PID:-}" ]]; then kill "$CHAT_PID" 2>/dev/null || true; fi
  if [[ -n "${EMBEDDING_PID:-}" ]]; then kill "$EMBEDDING_PID" 2>/dev/null || true; fi
  if [[ -n "${RERANKER_PID:-}" ]]; then kill "$RERANKER_PID" 2>/dev/null || true; fi
}
trap cleanup EXIT INT TERM

wait_for_service() {
  local url="$1"
  local label="$2"
  local attempt=0
  while (( attempt < 300 )); do
    if curl --fail --silent --output /dev/null "$url"; then
      return 0
    fi
    attempt=$((attempt + 1))
    sleep 1
  done

  echo "Timed out waiting for $label" >&2
  return 1
}

"$ROOT_DIR/scripts/qwen-local/start-chat.sh" &
CHAT_PID="$!"
wait_for_service "http://127.0.0.1:${QWEN_CHAT_PORT:-8791}/v1/models" "chat service"

"$ROOT_DIR/scripts/qwen-local/start-embedding.sh" &
EMBEDDING_PID="$!"

"$ROOT_DIR/scripts/qwen-local/start-reranker.sh" &
RERANKER_PID="$!"

echo "Qwen local services starting:"
echo "  chat:      http://127.0.0.1:${QWEN_CHAT_PORT:-8791}"
echo "  embedding: http://127.0.0.1:${QWEN_EMBEDDING_PORT:-8792}"
echo "  reranker:  http://127.0.0.1:${QWEN_RERANKER_PORT:-8793}"

wait
