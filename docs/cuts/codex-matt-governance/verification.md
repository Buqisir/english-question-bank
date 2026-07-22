# codex-matt-governance · verification

Date: 2026-07-22
Role: fresh non-implementing verification only; no CR, QA, RM, merge, or
implementation performed.

## Bound implementation

- DEV implementation commit:
  `113db39f8119536e27aa4344f4bfcdfdbd7d3365`
- DEV base: `3889d67099c6211daa5cbbb79cb93bf49e4e5cc6`
- Fetched `github/main` baseline:
  `e4ae78607411d265768a0253c5c63b5f3c0d726b`
- Verification activation commit:
  `2f9bb8d657328c5e1c9a949a9ea3c3e351ce21ff`
- The activation commit changes only this cut's entrypoint and plan stage field;
  it does not change the DEV implementation surfaces. Commands below therefore
  ran against the same application/rule content as the bound implementation.

## Scope and static evidence

| Check | Result | Evidence |
| --- | --- | --- |
| `git diff --check github/main...113db39f` | PASS | exit 0 |
| `git diff --name-only github/main...113db39f` | PASS | changed paths are the ratified current-rule/document surfaces plus this cut's pre-existing plan, PA, and entrypoint artifacts |
| `git diff --check 3889d67..113db39f` | PASS | exit 0 |
| exact-model authority sweep | PASS | outside historical cut records, only `docs/agents/model-routing.md` names concrete Sol/Terra IDs; current-rule files point to it |
| activation delta | PASS | `113db39f..2f9bb8d` contains only `agent-entrypoint.md` and `plan.md` stage metadata |

## Required command evidence

| Command | Exit | Result |
| --- | ---: | --- |
| `pnpm -C app exec tsc --noEmit` | 1 | FAIL: `tsc` command not found |
| `pnpm -C app run verify:all` | 1 | FAIL: preflight app build/typecheck exited 127 because `tsc` was not found |

The worktree has no `app/node_modules` directory. No dependency installation or
environment repair was attempted: this role is limited to verification evidence
and must not implement or alter workflow/tooling state.

## Handoff facts for fresh CR

This artifact records evidence only, not a review verdict. The fresh CR must
decide the effect of the failed required checks and cold-read the exact DEV
diff. One factual cross-file point worth checking: `AGENTS.md` now assigns
fresh verification after DEV in its dispatch map, while its retained Gates text
still says main-agent rerun is never delegable as a substitute for release
review. The CR should determine whether those statements have a coherent
authority boundary.

## Next action

Create exactly one fresh no-DEV-history CR successor under the recorded
write-held -> predecessor-final-release -> successor-activation lifecycle. It
must read `docs/agents/model-routing.md` and use the `Fresh CR / re-review /
RM` route (`gpt-5.6-sol`, `high`) before any CR work.

## Fix-DEV exact-head verification — 2026-07-22T16:42:37Z

Role: fresh non-implementing verification only. This section records evidence,
not a CR verdict.

### Bound heads and worktree

- Fix-DEV result commit verified: `49a3da95f72122ebaae8b80541f3a17cfd9b59e4`
- Fix-DEV predecessor-final release: `ada3c414797cdd0c1cb69e23aa8f0b0a571cbbc1`
- Verification activation commit: `1b1c1ace4bfaf50373af34e0054adf8f51d7ea7a`
- Worktree: `/Users/huangxuewei/.codex/worktrees/167f/english-question-bank`
- Status at command start: clean. The activation commit changes only the
  entrypoint machine record; application/current-rule content remains bound to
  the fix result.

### Required command evidence

| Command | Raw exit | Result | Note |
| --- | ---: | --- | --- |
| `git diff --check 7de7715..49a3da9` | 0 | PASS | Bounded fix delta has no whitespace errors. |
| `git diff --check github/main...HEAD` | 2 | FAIL | Existing `cr.md` lines 3-5 have trailing whitespace; this is within the plan-required full-range command. |
| `node scripts/verify-cut-artifacts.mjs docs/cuts/codex-matt-governance large` | 1 | FAIL | `cut-note.md` is absent/non-empty requirement not met. |
| `pnpm -C app exec tsc --noEmit` | 0 | PASS | Dependencies are available in this isolated worktree. |
| `pnpm -C app run verify:all` | 0 | PASS | Summary: PASS 84 / SKIP 1 / FAIL 0. |

### Contract and scope scans

- `git diff --name-only github/main...HEAD` listed only `AGENTS.md`, allowed
  current-rule/template/steering files, and this cut's tracked artifacts; no
  product/runtime, server, schema/data, workflow/script, skill/plugin/tracker,
  production, main-checkout, or applied-writing-lecture path appeared.
- Exact-model authority scan: concrete `gpt-5.6-sol` / `gpt-5.6-terra` route
  values occurred only in `docs/agents/model-routing.md`; current rule surfaces
  point there rather than reproducing a table.
- Direct-relay scan found the remaining `subagent` mentions describe the
  permitted negative boundary (a parent-owned subagent cannot satisfy a relay
  role) or historical/non-relay use; no current PA/DEV/verification/CR/QA/RM
  route was found that treats one as the relay successor.
- `docs/agents/model-routing.md` exists, resolving the newly added routing
  pointer.
- Live lifecycle smoke is **not fully green**: the entrypoint retains the old
  `DEV Dispatch` state `release-authorized`, while its top-level Current Stage
  still says the pre-fix CR/fix-DEV is ready-held and its Next Action still asks
  for that predecessor release. The current fix-DEV/verification records show
  the later relay, but these stale machine/current-stage statements prevent a
  single unambiguous live state.

### Evidence handoff

The application integration proof is green, but the plan-named full-range
whitespace check, large artifact gate, and live lifecycle smoke each have the
raw failures above. A fresh no-DEV-history formal re-review must decide their
effect against the plan and canonical CR contract; this verification task does
not repair or review them.
