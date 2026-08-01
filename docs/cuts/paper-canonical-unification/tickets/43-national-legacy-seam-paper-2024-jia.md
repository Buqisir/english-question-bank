# 43 — National-legacy seam — `paper-2024-jia`

Status: ready
Blocked by: 26
Next on PASS: `docs/cuts/paper-canonical-unification/tickets/44-national-legacy-closure-paper-2020-bing.md`
Terminal: no
Model: gpt-5.6-terra
Effort: max
Parallel lane: national-legacy; separate worktree from the exact Ticket 26 PASS commit; serial inside this lane

## What to build

证明首张 national-legacy source/Profile seam，覆盖 325,178-byte rich DOCX，并完成该纸 zero-write readiness。 只创建新的 immutable evidence或显式 review decision；不迁移、不发布、不改历史 bytes。

## Approved membership

- `paper-2024-jia`

## Measured/costed capacity

- B63/F87.
- One paper only.
- B is the exact Ticket 22 baseline; F is only the deterministic raw-source floor, not a complete estimate.
- Measure actual documents, bytes, units, diagnostics and risk. Ticket 24's observed 199 units is a warning threshold, not universal capacity.

## Parallel worktree and write-surface contract

- Write only this paper's candidates, captures, fixtures, verifier and evidence in the national-legacy worktree.
- Do not write shared compiler, adapter registry, authority versions, schemas, migration ledger/manifest, phase receipt, tickets, or ticket-set manifest.
- Do not consume another lane's unmerged work as authority.
- Shared-surface or common-base drift fails closed; do not auto-resolve conflicts or broaden this ticket.

## Fail-closed boundary

- Missing source, digest drift, unproved Profile, answer conflict, new diagnostic shape, actual work above the safe one-context bound, or any required shared change stops this ticket.
- A low measured result never authorizes a second paper.

## Superseded-ticket mapping

Old Ticket 28 / cluster D.

## Acceptance criteria

- [ ] The one approved paper reaches ready through the public zero-write compiler with exact source, Profile, official-answer, family and inactive-slot proof.
- [ ] Historical source, answer and Publication bytes remain unchanged and protected-state comparison is zero-write.
- [ ] Actual per-paper measurement and diagnostics are recorded without treating 199 as universal.
- [ ] The lane's direct checks and final ticket-closure suite pass.

## Result

Commit:
Verify:
Notes:
