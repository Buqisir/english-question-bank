# H6 Handoff

Cut: H6 Collaboration Template Hardening
Last updated: 2026-05-23
Branch: `codex/h6-collaboration-template-hardening`
PR: pending

## Current Truth

- H6 accepts the collaboration critique as process infrastructure.
- Codex remains default daily PM / DEV / CR-lite / QA / RM.
- External PA / Big CR should start from templates in
  `docs/cuts/_templates/`.

## Completed

- Added PA / Big CR / decisions templates.
- Hardened entrypoint, external-review, handoff, and cut-note templates.
- Updated AGENTS, steering, PA persona, and architecture verify.
- Wrote H6 cut records.

## Still Open

- PR creation / merge.
- Adoption on next external PA / Big CR.

## Must Not Forget

- Do not force old closed cuts into the new template shape.
- Do not use H6 as excuse to add ceremony to small cuts.
- H3-B should resume after H6 lands.

## Things The Next Cut Must Know

1. Pattern: external prompt boilerplate should be filled from templates.
   - Evidence: H6 added PA and Big CR prompt templates.
   - Rule: fill cut-specific fields; do not hand-write repeated role /
     reading / output boilerplate.

2. Pattern: decision ledgers can be temporarily stale after review.
   - Evidence: H6 added `Last synced` and
     `Open items from external review`.
   - Rule: update decisions status in the same PR after PA / Big CR
     creates or resolves decisions.

3. Pattern: external agents need a safe stop signal.
   - Evidence: H6 added escalation signals to templates and PA persona.
   - Rule: accept `ESCALATION: ...` as the correct response when context
     is insufficient or contradictory.

## Verify / QA State

- `node scripts/verify-architecture-housekeeping.mjs` — 68 passed,
  0 failed.
- `npm run verify:all --prefix app` — passed.
- `git diff --check` — clean.
- Browser QA not applicable.

## Next Action

Open PR for H6, merge after CR/RM, then resume H3-B.
