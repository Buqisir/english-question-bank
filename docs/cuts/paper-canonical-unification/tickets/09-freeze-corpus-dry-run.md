# 09 — Freeze the 33-paper corpus and complete M0–M2 dry run

Status: ready
Blocked by: 08 — Canonical-required new-import hard gate
Next on PASS: `docs/cuts/paper-canonical-unification/tickets/10-clear-cloze-queue.md`
Terminal: no

## What to build

Create the checked-in, reproducible migration manifest and durable disposition
ledger for the current 33 `latest` papers. Complete M0 old-state capture, M1
source/answer/Profile closure attempt, and M2 compile-only dry run without
publishing or switching any current paper.

## Acceptance criteria

- [ ] The manifest binds every current `latest` path/length/sha256 and tree
      digest, the census fixed point, authority/compiler/Consumer Contract
      digests, source roles, Profile candidate, family counts, and known
      anomaly ids.
- [ ] Recount is exactly 33 papers, 273 Groups, 1530 objective Questions, and
      1035 A–D sets; config-only and asset-only cases remain correctly inside
      or outside the frozen denominator.
- [ ] Actual filesystem versions, SQLite published refs, answer keys, extras,
      canonical sidecars, latest tree, Consumer Contract, and rollback state
      are recorded without inventing missing version directories.
- [ ] Question source, official-answer source, attachments, and Profile are
      separately closed or explicitly diagnosed; `paper-asset-v1`,
      `answer-key.json`, import metadata, and Analysis remain migration leads.
- [ ] All 33 papers run through the public compiler in zero-write mode and
      satisfy `ready + needs_review + unsupported + incomplete_source +
      answer_conflict = 33`.
- [ ] Durable queue entries preserve safe ids/hashes/spans/diagnostics/
      recovery actions/attempts without full passages, answers, student data,
      or credentials.
- [ ] Before/after DB/assets/latest/version/journal comparison proves zero
      mutation for the full dry run.
- [ ] Focused census/compiler/ledger checks, app/server checks, full verify,
      and `git diff --check` pass.
- [ ] A fresh independent review lineage has no Must Fix before the ticket is
      marked done.

## Out of scope

No review-queue correction, Publication, paper switch, renderer acceptance,
legacy deletion, production, or R2 work.

## Result

Commit:
Verify:
Notes:
