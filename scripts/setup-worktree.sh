#!/usr/bin/env bash
# setup-worktree.sh — 给新开的 git worktree 一键预热环境。
#
# 背景：并行 DEV 每人一个 worktree（AGENTS.md 并行三硬条件之②），但全新
# checkout 没有依赖、没有 gitignored 的本地库，此前每个 DEV 都要即兴自装
# （有人还给 server/ 装出了不该存在的 pnpm-lock.yaml）。此脚本把预热收敛
# 成一条命令，幂等，可重复跑。
#
# 做三件事：
#   1. app/    → pnpm install --frozen-lockfile
#   2. server/ → npm ci（server 用的是 package-lock.json，不是 pnpm）
#   3. data/*.sqlite → 从主 checkout 复制（gitignored，本地只读用途；
#      主树找不到就跳过并提示，不视为失败——纯前端刀用不上库）
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

echo "[setup-worktree] app deps (pnpm, frozen lockfile)…"
pnpm -C app install --frozen-lockfile

echo "[setup-worktree] server deps (npm ci)…"
npm ci --prefix server

# 主 checkout 根 = git 公共目录（<main>/.git）的上一级。worktree 里
# --git-common-dir 指回主树，这比猜相对路径可靠。
common_dir="$(git rev-parse --path-format=absolute --git-common-dir)"
main_root="$(dirname "$common_dir")"

for db in question-bank.sqlite user-data.sqlite; do
  if [ -f "data/$db" ]; then
    echo "[setup-worktree] data/$db 已存在，跳过"
  elif [ -f "$main_root/data/$db" ]; then
    cp "$main_root/data/$db" "data/$db"
    echo "[setup-worktree] data/$db ← 已从主树复制"
  else
    echo "[setup-worktree] 主树没有 data/$db，跳过（纯前端任务可忽略）"
  fi
done

echo "[setup-worktree] done."
