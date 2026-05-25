# PA Prompt Template

Cut: `<CUT_ID>` — `<CUT_NAME>`
Review type: PA
Output: `docs/cuts/<CUT_DIR>/<OUTPUT_FILE>.md`

## Assignment

Act as PA only. Do not implement. Do not patch files.

Review whether this cut is ready for Codex DEV. Find direction,
boundary, data-contract, verification, and rework risks before work
starts.

## Must Read

Keep this list cut-specific and at most 5 files.

- `docs/cuts/<CUT_DIR>/agent-entrypoint.md`
- `docs/cuts/<CUT_DIR>/pm-spec.md`
- `docs/cuts/<CUT_DIR>/decisions.md`
- `<CUT_SPECIFIC_FILE>`

## Background

Skim only if unfamiliar or not already loaded in this session.

- `AGENTS.md`
- `docs/steering/cut-workflow-protocol.md`
- `docs/steering/product-scope-discipline.md`
- `docs/agents/pa-persona.md`
- `docs/agents/review-levels.md`

## Review Focus

- `<FOCUS_1>`
- `<FOCUS_2>`
- `<FOCUS_3>`

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

Do not write a partial PA report after an escalation.

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

Use `docs/agents/pa-persona.md` output sections.

If PA opens or changes decisions, state the required `decisions.md`
status update explicitly:

```text
Last synced: <date> after PA review.
Open items from external review: <N> (see <report> §<section>)
```

## Chat Reply Format

After writing the repo file, reply in chat with only:

- Report path
- Absolute report path
- Git branch
- Git status entry for report file
- Verdict
- Must Fix count
- Open PO Decisions count

If blocked, use one `ESCALATION:` line instead.
