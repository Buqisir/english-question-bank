# 44 — National-legacy closure — `paper-2020-bing`

Status: ready
Blocked by: 43
Next on PASS: `docs/cuts/paper-canonical-unification/tickets/45-national-legacy-closure-paper-2020-jia.md`
Terminal: no
Model: gpt-5.6-terra
Effort: high
Parallel lane: national-legacy; separate worktree from the exact Ticket 26 PASS commit; serial inside this lane

## What to build

该纸 source、Profile、official answers、family evidence和 inactive slots 全闭合并 zero-write compile ready。 只创建新的 immutable evidence或显式 review decision；不迁移、不发布、不改历史 bytes。

## Approved membership

- `paper-2020-bing`

## Measured/costed capacity

- B63/F68.
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

Old Ticket 27 / cluster C.

## Acceptance criteria

- [ ] The one approved paper reaches ready through the public zero-write compiler with exact source, Profile, official-answer, family and inactive-slot proof.
- [ ] Historical source, answer and Publication bytes remain unchanged and protected-state comparison is zero-write.
- [ ] Actual per-paper measurement and diagnostics are recorded without treating 199 as universal.
- [ ] The lane's direct checks and final ticket-closure suite pass.

## Result

Commit:
Verify:
Notes:
