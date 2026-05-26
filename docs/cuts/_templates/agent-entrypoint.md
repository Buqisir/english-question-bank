# Agent Entrypoint Template

Cut:
Stage:
Owner:
Date:

## Current Objective

State the smallest current objective in one paragraph.

## Prerequisites (check before acting)

Run these checks before reading or writing the next artifact:

- For medium / large cuts, `docs/cuts/<CUT>/plan.md` must exist and be
  non-empty before PA / DEV / CR / QA / RM agents act.
- Before DEV starts, `docs/cuts/<CUT>/plan.md` must already be committed
  to the repo.
- If this entrypoint depends on a prior artifact such as `pa.md`,
  `cr.md`, `cut-note.md`, `decisions.md`, or an ADR, that file must
  exist and be non-empty.

If a required prerequisite is missing, stop and reply:

```text
ESCALATION: CONTEXT INSUFFICIENT — required prerequisite missing or empty: <path>
```

## Must Read

Keep this list cut-specific and at most 5 files.

- `docs/cuts/<CUT>/plan.md`
- `docs/cuts/<CUT>/decisions.md`
- Cut-specific ADR / contract:

## Background

Skim only if unfamiliar or not already loaded in this session.

- `AGENTS.md`
- `docs/steering/cut-workflow-protocol.md`
- `docs/steering/product-scope-discipline.md`
- `docs/agents/review-levels.md`
- `docs/agents/pa-persona.md` for external PA only
- `scripts/README.md`

## Source Of Truth

- Branch:
- Base commit:
- PR:
- Latest accepted artifact:

## Goal / PR Split

- Goal:
- Current PR slice:
- Explicitly not in this PR:

## Allowed Scope

- 

## Forbidden Scope

- 

## Output Required

Write the next artifact to:

```text
docs/cuts/<CUT>/<artifact>.md
```

Worktree check for external agents:

- Target repo root: `<ABSOLUTE_REPO_ROOT>`
- Target branch / PR: `<BRANCH_OR_PR>`
- Target absolute path:
  `<ABSOLUTE_REPO_ROOT>/docs/cuts/<CUT>/<artifact>.md`
- Before writing, confirm `pwd`, `git rev-parse --show-toplevel`, and
  branch. If they do not match the target repo root and target branch /
  PR, stop with `ESCALATION: BRANCH CONFLICT`.
- After writing, confirm the absolute artifact path and
  `git status --short` entry for the file.

Repo-file handoff rule:

- Put substantive PA / CR / DEV / QA / RM context in repo files, not chat.
- Chat should only route agents to this entrypoint and the expected output path.
- If a material decision was made in chat, copy it into `decisions.md`,
  `pm-spec.md`, `handoff.md`, or this entrypoint before the next agent acts.

Escalation signals:

- `CONTEXT INSUFFICIENT` — required reading file missing, empty, or
  unreadable.
- `BRANCH CONFLICT` — target branch / PR cannot be inspected because of
  local worktree or checkout state.
- `SPEC CONTRADICTS` — PM spec, decisions, ADR, or entrypoint disagree
  on a key point.
- `SCOPE UNCLEAR` — task asks a question the spec does not answer.

Reply with `ESCALATION: <SIGNAL> — <one sentence explanation>` before
writing a partial artifact.

Chat reply format after writing the repo file:

- report path
- verdict / status
- Must Fix count, if any
- Open PO Decisions count, if any
