#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MODEL_DIR="${QWEN_MODEL_DIR:-$HOME/Models/local-llms/qwen}"
HF_ENDPOINT="${HF_ENDPOINT:-https://hf-mirror.com}"

mkdir -p "$MODEL_DIR"

download() {
  local repo="$1"
  local file="$2"
  local url="$HF_ENDPOINT/$repo/resolve/main/$file"
  local output="$MODEL_DIR/$file"

  echo "Downloading $file"
  curl \
    --fail \
    --location \
    --continue-at - \
    --retry 20 \
    --retry-delay 5 \
    --connect-timeout 30 \
    --output "$output" \
    "$url"
}

download "Qwen/Qwen3-8B-GGUF" "Qwen3-8B-Q4_K_M.gguf"

echo "Models ready in $MODEL_DIR"
