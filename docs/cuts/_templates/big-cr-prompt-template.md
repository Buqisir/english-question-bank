# Big CR Prompt Template

Cut: `<CUT_ID>` — `<CUT_NAME>`
Review type: Big CR
PR: `<PR_NUMBER>` (`<HEAD_BRANCH>`)
Output: `docs/cuts/<CUT_DIR>/<OUTPUT_FILE>.md`

## Assignment

Act as CR only. Do not implement. Do not patch files.

Review the pushed PR against the accepted plan. Find bugs, scope leaks,
missing tests, stale assumptions, data-contract drift, and behavioral
regressions. Do not redesign the product during review.

## Must Read

Keep this list cut-specific and at most 5 files.

- `docs/cuts/<CUT_DIR>/agent-entrypoint.md`（仅当该文件存在）
- `docs/cuts/<CUT_DIR>/decisions.md`
- `docs/cuts/<CUT_DIR>/plan.md`
- `<CUT_SPECIFIC_FILE>`

## Background

Skim only if unfamiliar or not already loaded in this session.

- `AGENTS.md`
- `docs/steering/cut-workflow-protocol.md`
- `docs/steering/product-scope-discipline.md`
- `docs/agents/review-levels.md`
- `scripts/README.md`

## Review Focus

- `<FOCUS_1>`
- `<FOCUS_2>`
- `<FOCUS_3>`

## Forbidden-Scope Audit

If the PR includes a passing `verify-*-forbidden-scope.mjs` script or a
named verify script that explicitly checks forbidden scope, write:

```text
Covered by verify; spot-checked <N> files.
```

Then move on. Do not repeat the full forbidden-scope audit manually.

If no verify covers forbidden scope, do a focused manual audit and name
the files checked.

## Escalation Signals

If you cannot write a reliable report, stop and reply in chat:

```text
ESCALATION: <SIGNAL> — <one sentence explanation>
```

Signals:

- `CONTEXT INSUFFICIENT`: required reading file missing, empty, or
  unreadable.
- `BRANCH CONFLICT`: target branch / PR cannot be inspected because of
  local worktree or checkout state.
- `SPEC CONTRADICTS`: PM spec, decisions, ADR, or entrypoint disagree
  on a key point.
- `SCOPE UNCLEAR`: review focus asks a question the spec does not
  answer.

Do not write a partial Big CR report after an escalation.

## Output

Write the full report to:

```text
docs/cuts/<CUT_DIR>/<OUTPUT_FILE>.md
```

Worktree check before writing:

- Target repo root: `<ABSOLUTE_REPO_ROOT>`
- Target branch / PR: `<BRANCH_OR_PR>`
- Target absolute report path:
  `<ABSOLUTE_REPO_ROOT>/docs/cuts/<CUT_DIR>/<OUTPUT_FILE>.md`
- Before writing, confirm `pwd`, `git rev-parse --show-toplevel`, and
  branch. If they do not match the target repo root and target branch /
  PR, stop with `ESCALATION: BRANCH CONFLICT` instead of writing in a
  side worktree such as `.claude/worktrees/`.
- After writing, confirm the absolute report path and `git status --short`
  entry for the file.

Include:

- baseline reviewed
- verdict
- Must Fix
- Should Watch
- PA -> `plan.md` disposition checklist status, when a PA checklist
  exists
- prior / routine CR `Self-Review Blind Spots`, when a CR report exists
- verify / QA gaps
- scope notes
- recommendation

Before broad review, first inspect any PA -> `plan.md` disposition
checklist and any prior / routine CR `Self-Review Blind Spots`. Then continue with
normal risk-based Big CR.

If CR opens or changes decisions, state the required `decisions.md`
status update explicitly:

```text
Last synced: <date> after Big CR.
Open review items: <N> (see <report> §<section>)
```

## Chat Reply Format

After writing the repo file, reply in chat with only:

- Report path
- Absolute report path
- Git branch
- Git status entry for report file
- Verdict
- Must Fix count
- Should Watch count

If blocked, use one `ESCALATION:` line instead.
