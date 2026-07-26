# 27 — Retire Application Writing consumer legacy interpretation

Status: ready
Blocked by: 26 — Retire Reading consumer legacy interpretation
Next on PASS: `docs/cuts/paper-canonical-unification/tickets/28-retire-continuation-writing.md`
Terminal: no

## What to build

Retire and remove consumer-side Application Writing legacy interpretation
after re-proving all 24 Groups and nine Profile-backed N/A cases.

## Acceptance criteria

- [ ] Every applicable Application Group is canonical selected with source-
      backed prompt, word-count ruling, Given Skeleton none/present decision,
      one response region, and zero queue.
- [ ] Screen/Print-PDF/DOCX consume only canonical prompt/fixed-part/response
      facts; skeleton reconstruction, genre inference, regex detection,
      Analysis intrusion, allowlists, and field fallback are removed.
- [ ] Student/teacher actual artifacts preserve identical task semantics,
      fixed-part placement, response occurrence, and answer visibility.
- [ ] Missing/corrupt/stale canonical Application Writing is a hard failure
      with only accepted whole-release/prior-Publication rollback.
- [ ] Whole-corpus artifacts, recovery tests, full verify, and
      `git diff --check` pass with prior retirements intact.
- [ ] A fresh independent review lineage is green and provisioned Application
      Writing owner QA is accepted before the ticket is marked done.

## Out of scope

No Continuation retirement, source-adapter consolidation, production, or R2.

## Result

Commit:
Verify:
Notes:
