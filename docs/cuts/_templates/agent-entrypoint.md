# Agent Entrypoint Template

Cut:
Stage:
Owner:
Date:

## Current Objective

State the smallest current objective in one paragraph.

## Required Reading

- `AGENTS.md`
- `.kiro/steering/cut-workflow-protocol.md`
- `docs/agents/review-levels.md`
- Cut-specific PM / PA / CR docs:

## Source Of Truth

- Branch:
- Base commit:
- PR:
- Latest accepted artifact:

## Allowed Scope

- 

## Forbidden Scope

- 

## Output Required

Write the next artifact to:

```text
docs/cuts/<CUT>/<artifact>.md
```

Repo-file handoff rule:

- Put substantive PA / CR / DEV / QA / RM context in repo files, not chat.
- Chat should only route agents to this entrypoint and the expected output path.
- If a material decision was made in chat, copy it into `decisions.md`,
  `pm-spec.md`, `handoff.md`, or this entrypoint before the next agent acts.

Reply with only:

- report path
- verdict / status
- Must Fix count, if any
- Open PO Decisions count, if any
