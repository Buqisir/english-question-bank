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
