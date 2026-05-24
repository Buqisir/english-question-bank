# H5 Claude PA-lite Prompt — Server Implementation Extraction

Cut: H5 Server Implementation Extraction
Review type: PA-lite direction review
Output: `docs/cuts/H5-server-implementation-extraction/claude-review-opus.md`

## Assignment

Act as PA-lite only. Do not implement. Do not patch files.

Review whether H5 should proceed now, and if yes, which server implementation
cluster should be extracted first from `server/api.mjs`. Your job is to prevent
wrong-direction refactoring, shallow module churn, and behavior-risky extraction.

## Current State

H1 is complete. `server/api.mjs` still has about 11k lines, but:

- `server/router/index.mjs` exists with `defineRoute` / `runRoutes`.
- Seven route modules have already been extracted:
  - question-bank
  - exports
  - imports
  - paper-import
  - draft-paper
  - my-space
  - search
- These are thin shells: implementations such as DB queries, business logic,
  old import helpers, export helpers, and AI calls still remain in
  `server/api.mjs` as functions called through route context.

H5 is not asking whether to build a router. That is already done.

H5 goal: move implementations out of `server/api.mjs` into their owner modules.
PA question: which domain should be extracted first, and why?

## Must Read

- `docs/cuts/H5-server-implementation-extraction/agent-entrypoint.md`
- `docs/cuts/H1-architecture-housekeeping/handoff.md`
- `docs/cuts/H1-architecture-housekeeping/cut-note.md`
- `docs/cuts/H9-verify-ci-credibility-hardening/handoff.md`
- `server/api.mjs`

## Background

Skim only if unfamiliar or not already loaded in this session.

- `AGENTS.md`
- `.kiro/steering/cut-workflow-protocol.md`
- `docs/agents/pa-persona.md`
- `scripts/README.md`

## Review Focus

Answer these questions directly:

1. Should H5 proceed now, or should the team return to product work?
2. If H5 proceeds, which first slice is best?
   - Legacy import implementation
   - Export implementation
   - Question-group AI parse implementation
   - Other, only if clearly better
3. Which candidate should be forbidden as first slice, and why?
4. What is the behavior-preserving rollback boundary for the recommended slice?
5. Which existing verify scripts prove the recommended slice, and what small
   new verify guard is needed if existing scripts are not enough?

## Constraints

- Do not recommend route-shell extraction already completed by H1.
- Do not recommend broad cleanup just to reduce line count.
- Prefer a first slice that:
  - has an existing route-owner module;
  - has low product risk;
  - can be verified without browser QA;
  - does not touch schema, data contract, product boundary, or teaching
    interpretation;
  - reduces future CR cost for real product work.
- Treat question-group AI parse as higher risk unless you can argue otherwise,
  because it may touch teaching interpretation and AI output contracts.

## Output

Write the full report to:

```text
docs/cuts/H5-server-implementation-extraction/claude-review-opus.md
```

Use these sections:

1. Verdict
2. Recommended First Slice
3. Why Not The Other Slices
4. Must Fix Before DEV
5. Should Watch
6. Allowed / Forbidden Files
7. Verify Requirements
8. Rollback Boundary
9. Open PO Decisions

End with:

```text
Report path:
Verdict:
Recommended first slice:
Must Fix count:
Open PO Decisions count:
```

## Escalation Signals

If you cannot write a reliable report, stop and reply in chat:

```text
ESCALATION: <SIGNAL> — <one sentence explanation>
```

Signals:

- `CONTEXT INSUFFICIENT`: required reading file missing, empty, or unreadable.
- `BRANCH CONFLICT`: target branch or baseline cannot be inspected.
- `SPEC CONTRADICTS`: H1 docs, H5 entrypoint, or current server shape disagree.
- `SCOPE UNCLEAR`: review focus cannot be answered from the provided context.

Do not write a partial report after an escalation.

## Chat Reply Format

After writing the repo file, reply in chat with only:

- Report path
- Verdict
- Recommended first slice
- Must Fix count
- Open PO Decisions count
