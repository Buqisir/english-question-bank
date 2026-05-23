# H6 CR-Lite — Collaboration Template Hardening

Cut: H6 Collaboration Template Hardening
PR: pending
Reviewer: Codex
Date: 2026-05-23

## Changed Scope

- Added PA / Big CR / decisions templates.
- Hardened agent-entrypoint, external-review, handoff, and cut-note
  templates.
- Updated AGENTS, steering, and PA persona rules for repo-file context,
  layered reading, decisions sync, escalation signals, handoff, and
  forbidden-scope audit delegation.
- Extended architecture housekeeping verify to guard the new templates
  and protocol markers.
- Added H6 cut records.

## Findings

- Must Fix: none.
- Should Watch:
  - Existing cut entrypoints such as H3 still use the older Required
    Reading shape. Convert opportunistically when that cut is next
    edited; do not churn old records just for format parity.

## Verification Evidence

- Static verify:
  - `node scripts/verify-architecture-housekeeping.mjs` — 68 passed,
    0 failed.
  - `npm run verify:all --prefix app` — passed.
- Build:
  - Not run separately; stable verify was the relevant gate for this
    docs / process / verify cut.
- Browser QA:
  - Not applicable. No visible product UI changed.
- Other:
  - `git diff --check` — clean.

## Failure / Attack Angle

This change could fail if future agents treat the new templates as more
ceremony for every small cut. The protocol explicitly keeps small cuts
light and makes the new prompt templates useful mainly for external PA
and Big CR. Another risk is stale old cut files; H6 avoids bulk
rewriting them to reduce churn.

## Residual Risk

- Low. Runtime files are untouched.
- Main residual risk is adoption: future cuts must actually start from
  the templates instead of hand-writing prompt boilerplate.

## Recommendation

- APPROVE
