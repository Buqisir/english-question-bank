# 16 — Disconnect generated-DOCX capability and prove direct Chromium PDF

Status: done
Blocked by: Tickets 01–15 completed accepted baseline
Next on PASS: independent review
Independent review PASS: owner QA
Owner QA PASS: `docs/cuts/paper-canonical-unification/tickets/17-delete-docx-output-implementation.md`
Terminal: no

## What to build

Remove every live generated-DOCX capability from the teacher-facing product
while preserving direct Chromium/Playwright PDF as the sole fixed-layout
download.

## Acceptance criteria

- [ ] No generated-DOCX control, client call, state path, draft/general export
      entry point, or live HTTP route remains reachable or discoverable.
- [ ] Every legitimate surviving PDF caller uses the supported Print/PDF seam;
      obsolete DOCX-to-LibreOffice-to-PDF behavior has no public caller.
- [ ] Draft-paper `/print-pdf` returns direct Chromium/Playwright PDF bytes
      without invoking DOCX generation or LibreOffice.
- [ ] Screen and Student/Teacher Print HTML/PDF behavior remain available with
      the accepted semantic, anchor, answer-visibility, and layout identity.
- [ ] Public route and UI behavior are the primary proof; source inventories
      are supporting evidence only and find no hidden flag, placeholder, empty
      adapter, or best-effort DOCX path.
- [ ] From the exact independently reviewed HEAD, the task provisions and
      opens the affected controls and direct-PDF artifacts with the canonical
      QA checklist, then pauses for owner verdict.
- [ ] Focused public-seam checks, ordinary Standards + Spec self-check,
      relevant app/server checks, full verify, and `git diff --check` pass.

## Superseded-ticket mapping

This owner-amended slice has no one-to-one predecessor. It absorbs the public
generated-DOCX capability and output-matrix portions formerly embedded in old
Tickets 18 and 64–71.

## Result

Commit: `3da1f82545549aedab91755b7b0cd8040a8c5d6d`; renderer-neutral Print contract fix `7098fa9974e1e152b4105b688007802eaf2afcf4`
Verify: `node scripts/verify-generated-docx-disconnected.mjs` — 28/28 PASS; `node scripts/verify-paper-export-flow.mjs && node scripts/verify-paper-export-payload.mjs && node scripts/verify-print-pdf-export-flow.mjs` — PASS; `pnpm -C app run build` — PASS; `node scripts/smoke-golden-path.mjs` — real-browser export menu and PDF download PASS; `pnpm -C app run verify:all` — 109 PASS / 1 declared SKIP / 0 FAIL; `git diff --check` — PASS
Notes: Removed generated-DOCX UI, client/state paths, and public routes; retired the obsolete DOCX-to-LibreOffice PDF route; kept Student/Teacher Screen and direct Chromium Print/PDF available through renderer-neutral Print contracts. Ticket 17 retains ownership of deleting the now-unreachable DOCX implementation.
