# H6 Dev Notes — Collaboration Template Hardening

Date: 2026-05-23
Status: implemented

## Scope

H6 accepts the external collaboration-system critique as a small process
hardening cut. It turns repeated hand-written collaboration prompts into
templates and adds guardrails for decision freshness, handoff survival,
escalation signals, and forbidden-scope review delegation.

## Changed

- Added `pa-prompt-template.md`.
- Added `big-cr-prompt-template.md`.
- Added `decisions.md` template with sync-status fields.
- Updated `agent-entrypoint.md` template with `Must Read` /
  `Background` reading layers and escalation signals.
- Updated `external-review-report.md` template with decision-sync and
  forbidden-scope audit fields.
- Updated `handoff.md` template with next-cut lesson structure.
- Updated `cut-note.md` template to link the handoff.
- Updated `AGENTS.md`, `.kiro/steering/README.md`,
  `.kiro/steering/cut-workflow-protocol.md`, and
  `docs/agents/pa-persona.md` with the new workflow rules.
- Updated `scripts/verify-architecture-housekeeping.mjs` so these
  process artifacts stay present and keyword-guarded.

## Accepted Critique Items

- PA / Big CR prompts are now template-based.
- Chat remains routing-only for medium / large multi-agent context.
- `decisions.md` gets `Last synced` and
  `Open items from external review`.
- Entry points split required reading into `Must Read` and
  `Background`.
- Large cuts require both Cut Note and handoff.
- Big CR can delegate covered forbidden-scope audit to verify.
- Chat reply format allows escalation signals instead of partial
  reports.
- Standard escalation signals are documented.

## Behavior

No product behavior changed. No runtime code changed.

## Verification

To run before reporting:

```bash
node scripts/verify-architecture-housekeeping.mjs
git diff --check
npm run verify:all --prefix app
```

Browser QA is not applicable because this is docs / process / verify
only.
