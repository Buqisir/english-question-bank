# H2 Agent Entrypoint

Cut: H2 Workflow / Verify / CI Discipline
Stage: Closed. Do not add H2-D.
Owner: Codex by default
Date: 2026-05-23

## Current Objective

H2 is closed. It made the repo's workflow, verify, and CI discipline
enforceable from files. Future housekeeping must route to H3, H4, H5, or a new
named cut instead of extending H2.

## Required Reading

- `AGENTS.md`
- `.kiro/steering/cut-workflow-protocol.md`
- `docs/cuts/H1-architecture-housekeeping/handoff.md`
- `docs/cuts/H2-workflow-verify-ci-discipline/goal-h2-workflow-verify-ci.md`
- `docs/cuts/_templates/agent-entrypoint.md`
- `docs/cuts/_templates/cut-note.md`
- `docs/cuts/_templates/handoff.md`
- `scripts/README.md`
- `scripts/verify-ci.mjs`
- `docs/ci/verify-workflow-template.yml`

## Source Of Truth

- Base branch: `main`
- Current goal artifact:
  `docs/cuts/H2-workflow-verify-ci-discipline/goal-h2-workflow-verify-ci.md`
- Cut Note:
  `docs/cuts/H2-workflow-verify-ci-discipline/cut-note.md`
- Handoff:
  `docs/cuts/H2-workflow-verify-ci-discipline/handoff.md`
- H1 closeout:
  `docs/cuts/H1-architecture-housekeeping/cut-note.md`

## Allowed Scope

- workflow / cut protocol docs
- cut templates
- H2 cut docs
- verify script index
- stable verify entrypoint
- architecture-housekeeping verify checks
- CI workflow template or real workflow installation, if explicitly approved

## Forbidden Scope

- product features
- server API behavior
- server route / implementation extraction
- Draft Paper / PaperSurface / My Space UI
- design-token migration beyond process documentation
- database schema / migrations
- paper data / paper assets / reading analysis data
- `shared/papersurface/**`

## Output Required

No further H2 implementation artifact is expected. If new workflow / verify /
CI work is needed, start a new named cut or explicitly reopen H2 with PO
approval and a fresh entrypoint update.

Repo-file handoff rule:

- Put substantive PM / DEV / CR / QA / RM context in repo files, not chat.
- Chat should only route agents to this entrypoint and the expected output path.
- If a material decision is made in chat, copy it into a repo file before the
  next agent acts.

## Reply Format For External Agents

Reply with only:

- report path
- verdict / status
- Must Fix count, if any
- Open PO Decisions count, if any
