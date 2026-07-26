# 18 — Complete M4–M5 canary migration

Status: ready
Blocked by: 17 — Clear Listening inactive queue
Next on PASS: `docs/cuts/paper-canonical-unification/tickets/19-national-legacy-cohort.md`
Terminal: no

## What to build

Recompile the four accepted canary papers after all M3 family queues are
clear, pass the whole-paper M4 prepublication gate, seal and switch one
Publication at a time, verify every actual surface, and complete a rollback
drill.

Canaries are `paper-2026-i`, `paper-960d0f8d`, `paper-2020-bing`, and
`paper-zj-2020-jul`.

## Acceptance criteria

- [ ] All M3 family queues are already zero and every correction has direct
      source lineage or an accepted exact Transformation Record.
- [ ] `paper-zj-2022-jun`'s polluted three-starter case remains a required
      blocked negative proof and is not relaxed to satisfy the canary.
- [ ] Each canary independently passes complete Plan/Groups/inactive closure,
      Publication integrity, public-loader reopen, atomic publish/swap, exact
      reload, and rollback/retry.
- [ ] Each canary's Screen plain/lecture, student/teacher Print HTML and actual
      PDF, student/teacher DOCX/OOXML and converted PDF share the accepted
      semantic/anchor/occurrence signature.
- [ ] Known table/Figure, media-type, marker, no-writing, and zero-starter
      boundaries are source-proven rather than inferred from legacy fields.
- [ ] A canary failure leaves that paper explicitly blocked and prevents the
      next cohort; no denominator or queue entry disappears.
- [ ] Focused migration/recovery/renderer checks, full verify, and
      `git diff --check` pass with complete evidence hashes.
- [ ] A fresh independent review lineage is green and the provisioned
      four-canary owner QA checklist is accepted before the ticket is done.

## Out of scope

No remaining 29-paper migration, full-corpus closure, legacy deletion,
historical versions, production, or R2 work.

## Result

Commit:
Verify:
Notes:
