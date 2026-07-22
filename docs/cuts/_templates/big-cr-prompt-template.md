# Big CR Prompt Template

Cut: `<CUT_ID>` — `<CUT_NAME>`
Review type: Big CR
PR: `<PR_NUMBER>` (`<HEAD_BRANCH>`)
Output: `docs/cuts/<CUT_DIR>/cr.md`

## Assignment

Act as CR only. Do not implement. Do not patch files.

This is a fresh independently addressable no-DEV-history review task. It is not
a continuation, fork, handoff, or parent-owned subagent standing in for CR.

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
docs/cuts/<CUT_DIR>/cr.md
```

If a routine CR already wrote this canonical report, Big CR updates the same
file and preserves the prior findings and `Self-Review Blind Spots` before
adding its deeper review.

Worktree check before writing:

- Target repo root: `<ABSOLUTE_REPO_ROOT>`
- Target branch / PR: `<BRANCH_OR_PR>`
- Target absolute report path:
  `<ABSOLUTE_REPO_ROOT>/docs/cuts/<CUT_DIR>/cr.md`
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

## Relay Completion

After durable report writeback, record result commit, verdict, evidence pointer,
and exactly one unique next action in the entrypoint. Create at most one
independently addressable write-held successor, record its identity and prompt
digest, make the predecessor-final `release-authorized` commit, release that
exact head, and exit after the successor's activation acknowledgement. If human
QA is next, record `human-QA` and pause instead. On a named stop condition,
record `blocked` with the recovery action; do not improvise a second successor.
