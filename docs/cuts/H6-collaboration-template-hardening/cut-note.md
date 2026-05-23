# H6 Cut Note — Collaboration Template Hardening

Cut: H6 Collaboration Template Hardening
Start date: 2026-05-23
Merge date: pending
PA rounds: 0
Big CR rounds: 0
Must Fix count: 0
Token / cost notes: Codex-only local work; no external PA / Big CR cost.

## Shipped

- PA prompt template.
- Big CR prompt template.
- Decisions template with sync-status fields.
- Agent-entrypoint template with `Must Read` / `Background` and
  escalation signals.
- External-review template with decision-sync and forbidden-scope audit
  fields.
- Handoff template section for next-cut lessons.
- Cut-note template handoff link.
- Steering / AGENTS / PA persona updates for the accepted critique.
- Architecture housekeeping verify guards for the new collaboration
  infrastructure.

## Cut Or Moved

- No H3-B frontend extraction.
- No app / server / DB / schema changes.
- No GitHub Actions workflow installation.
- No bulk rewrite of older cut records.

## Wrong Assumptions Found

- High-quality hand-written prompts are still a process liability when
  the repeated boilerplate can drift.
- A decision ledger without sync status can look authoritative while it
  is temporarily stale after PA / Big CR.
- Required reading lists can waste external-review context when they do
  not separate cut-specific files from background process files.

## Rules That Prevented Rework

- Repo-file handoff rule turned the critique into templates and
  protocol updates instead of another chat-only agreement.
- Risk-paced review kept H6 docs-only; no browser QA or external PA was
  invented.
- Stable architecture verify now protects the collaboration files from
  silent drift.

## Verify And QA

- Static verify:
  - `node scripts/verify-architecture-housekeeping.mjs` — 68 passed,
    0 failed.
  - `npm run verify:all --prefix app` — passed.
  - `git diff --check` — clean.
- Browser QA:
  - Not applicable; docs / process / verify only.
- PO QA:
  - Owner accepted the critique direction before DEV.

## Watch / Follow-Up

- Watch ledger:
  - Not created; fewer than four watch items.
- Follow-up gates:
  - Use the PA / Big CR templates on the next external review.
  - Convert active cut entrypoints to `Must Read` / `Background` when
    they are next edited; do not churn closed cuts.

## Handoff

- Next-cut handoff:
  - `docs/cuts/H6-collaboration-template-hardening/handoff.md`

## Next Cut

- Return to H3-B Draft Paper Outline / My Space Dialog Locality unless
  the owner redirects.
