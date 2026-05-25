#!/bin/sh
# scripts/strip-claude-mem-context.sh
#
# Git clean filter. Removes auto-appended <claude-mem-context>...</claude-mem-context>
# blocks (plus the leading blank lines that surround them) from a tracked file's
# content before it lands in the git object database.
#
# Trigger: the claude-mem plugin's PostToolUse hook (worker-service.cjs hook
# claude-code observation) appends a memory dump to AGENTS.md every time a tool
# runs in a Claude Code session. Without this filter the dump pollutes diffs
# and commits.
#
# Wiring (see docs/agents/local-environment.md for the full setup):
#
#   .gitattributes           AGENTS.md filter=claude-mem-strip
#   .git/config              [filter "claude-mem-strip"]
#                              clean = scripts/strip-claude-mem-context.sh
#                              required = false
#
# Reads file content from stdin, writes the cleaned content to stdout.
# Idempotent: a clean file passes through unchanged.

exec perl -0777 -pe '
  # Primary: hook appends "\n\n<block>...</block>" to a file that already ends
  # with one trailing newline, so we strip the leading "\n\n" plus the block,
  # restoring the original trailing structure exactly.
  s/\n\n<claude-mem-context>.*?<\/claude-mem-context>\s*\z//s;
  # Fallback: catch any stray block elsewhere (or with different surrounding
  # newlines if the hook behavior changes in a future plugin version).
  s/\n*<claude-mem-context>.*?<\/claude-mem-context>\n*//sg;
'
