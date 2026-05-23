# H1 A+B Goal Plan

Status: ready to run after H1 planning PR #98.
Owner: Codex DEV / CR-lite / QA / RM.
Date: 2026-05-23

## Goal Prompt

```text
Implement H1-A and H1-B as a two-PR architecture sequence.

First build H1-A Router Skeleton only:
- start from latest main;
- implement server/router defineRoute, runRoutes, readJsonRouteBody;
- preserve the existing readJsonBody default maxBytes behavior;
- move at most the health-check route through the registry;
- add verify-h1-router-skeleton.mjs;
- run git diff --check, app npm run verify:all, app npm run build;
- perform Codex self-CR;
- stop for merge.

After H1-A merges, continue from latest main into H1-B:
- extract Draft Paper and My Space route dispatch;
- follow the helper boundaries locked in pm-spec.md and decisions.md;
- keep selectQuestionGroupCards, getQuestionGroupDetail, getDraftSearchContext, and isGroupPrintReady in server/api.mjs for H1-B;
- move only Draft Paper-owned helpers such as markCurrentDraftPaper, buildDraftPaperBlocks, buildDraftPaperExportInput, buildDraftPrintHtml, and estimateEnglishWords;
- preserve all API behavior, status codes, response JSON, error copy, print/PDF output, and My Space file guards;
- run C8 Draft Paper verify, C8 My Space verify, relevant smoke, app npm run verify:all, app npm run build;
- perform Codex self-CR;
- stop for review.

Do not combine H1-A and H1-B into one PR. If H1-B exceeds 2000 diff lines, split it into H1-B1 Draft Paper and H1-B2 My Space.
```

## Checkpoints

### PR 1: H1-A Router Skeleton

Must keep scope tiny:

- `server/router/*.mjs`
- `server/api.mjs`
- `scripts/verify-h1-router-skeleton.mjs`
- H1 docs only if clarifying a discovered boundary

Acceptance:

- router exports exactly `defineRoute`, `runRoutes`, `readJsonRouteBody`;
- no middleware, nested route groups, auth, framework dependency, or automatic
  response normalization;
- only health-check route may move;
- existing non-health routes remain behaviorally unchanged.

### PR 2: H1-B C8 Surface

Must preserve teacher-facing behavior:

- Draft Paper current/read-only behavior from PR #97;
- add-to-draft / reorder / page-break / restore flows;
- print HTML and PDF output;
- My Space folder/artifact APIs;
- static PDF download route;
- path traversal guards and staging-PDF cleanup.

H1-B split trigger:

- if diff exceeds 2000 lines, stop and split into H1-B1 Draft Paper and H1-B2
  My Space.

## Self-CR Requirements

Each PR final report must include:

- exact changed files;
- verify/build/smoke results;
- behavior-preservation notes;
- forbidden-scope confirmation;
- attacker's-eye paragraph: how this extraction could break routing, body-size
  limits, DB close behavior, cache ownership, file path safety, or response
  shape.

## Source Files To Read First

- `docs/cuts/H1-architecture-housekeeping/agent-entrypoint.md`
- `docs/cuts/H1-architecture-housekeeping/pm-spec.md`
- `docs/cuts/H1-architecture-housekeeping/decisions.md`
- `docs/cuts/H1-architecture-housekeeping/pa-review-opus.md`
- `.kiro/steering/cut-workflow-protocol.md`
- `docs/agents/review-levels.md`
