# H2-A CR-Lite — Workflow Rules

Cut: H2 Workflow / Verify / CI Discipline
PR: pending
Reviewer: Codex
Date: 2026-05-23

## Changed Scope

- Updated the cut workflow protocol with watch-ledger routing, external review
  baseline/cost metadata, and CR-lite failure-angle requirements.
- Added templates for CR-lite reports, external review reports, and watch
  ledgers.
- Extended the agent-entrypoint and cut-note templates with Goal/PR split and
  token/cost/watch fields.
- Added static verification so these process artifacts cannot silently drift.

## Findings

- Must Fix: none.
- Should Watch: H2-A intentionally adds process templates. Future cuts should
  resist filling every template for small cuts; the protocol still says process
  is paced by risk.

## Verification Evidence

- Static verify: `node scripts/verify-architecture-housekeeping.mjs` — 32
  passed, 0 failed.
- Stable suite: `npm run verify:all` from `app/` — passed.
- Whitespace: `git diff --check` — clean.
- Browser QA: not run; this is docs / process / verify only.

## Failure / Attack Angle

A future agent could misuse H2-A by treating the new templates as mandatory
ceremony for every typo fix. That would violate the first principle of the
workflow protocol: review strength follows risk. The guardrail is already in
the protocol and goal doc: small cuts may keep CR-lite in the PR body, browser
QA is skipped for docs-only work, and Big PA / Big CR remain exception paths.

Another failure mode is false confidence from static verification: the new
checks prove the templates and key phrases exist, not that every future agent
will apply judgment well. Cut Notes and handoffs still need Codex RM discipline.

## Residual Risk

- The real GitHub Actions workflow is still not installed under
  `.github/workflows/verify.yml`; that remains H2-B and requires token /
  workflow-scope handling.
- H2-C still needs the final H2 cut note and handoff after the verify/CI slice.

## Recommendation

- APPROVE.
