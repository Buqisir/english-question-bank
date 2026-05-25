# Local Environment Setup

One-time configuration each developer applies on their own machine after
cloning. None of these steps modify tracked repo state.

## claude-mem hook pollution: clean filter

If you run Claude Code or Codex CLI with the
[`claude-mem`](https://github.com/thedotmack/claude-mem) plugin installed,
its `PostToolUse` hook appends a memory dump
(`<claude-mem-context>...</claude-mem-context>`) to `AGENTS.md` after every
tool call. Without configuration, those blocks land in commits and pollute
diffs.

The repo ships a clean filter that strips the block during staging and during
diff comparison. The filter is **opt-in per machine** — you must register it
locally for it to do anything:

```bash
git config filter.claude-mem-strip.clean "scripts/strip-claude-mem-context.sh"
git config filter.claude-mem-strip.required false
```

`required = false` keeps the repo usable on machines that do not have `perl`
or that have not enabled the filter: git silently passes content through
instead of erroring.

### Verify it works

```bash
# After Claude Code has run a tool or two, AGENTS.md working tree usually has
# the appended block — but git should still consider the file clean:
wc -l AGENTS.md                      # often shows ~280+ lines (dirty)
git check-attr filter AGENTS.md      # AGENTS.md: filter: claude-mem-strip
git update-index --refresh -- AGENTS.md
git status --short                   # AGENTS.md should NOT appear
git diff AGENTS.md | wc -l           # 0
```

If `git status` keeps reporting AGENTS.md modified after the steps above:

- Re-check the filter is registered: `git config --get filter.claude-mem-strip.clean`
- Confirm `scripts/strip-claude-mem-context.sh` is executable: `ls -l scripts/strip-claude-mem-context.sh`
- Run the filter manually and diff against HEAD blob:
  `./scripts/strip-claude-mem-context.sh < AGENTS.md | diff - <(git show HEAD:AGENTS.md)`

### What the filter does not do

- It does not stop `claude-mem` from writing to `AGENTS.md`. The working tree
  file keeps growing on disk. The filter only ensures git sees the cleaned
  view. If the noisy working tree bothers you, occasionally run
  `git checkout HEAD -- AGENTS.md` to reset it, or disable the offending
  `claude-mem` hook in your local `~/.claude/settings.json`.
- It does not protect other tracked files. Only `AGENTS.md` is listed in
  `.gitattributes`. If a future hook pollutes another file, add that file to
  `.gitattributes` with the same filter.
- It is not a substitute for review — if you ever need to commit content that
  legitimately resembles a `<claude-mem-context>` block, the filter will eat
  it. Unlikely in practice, but be aware.

### Disabling claude-mem hooks (optional, more invasive)

If you would rather stop the hook entirely instead of filtering its output,
edit `~/.claude/settings.json` and remove or disable the `claude-mem` plugin
under `enabledPlugins`. This affects every project on your machine, not just
this one.
