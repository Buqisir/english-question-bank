# 20 — Full-corpus compile-only dry run

Status: ready
Blocked by: 19 — Freeze corpus and durable migration ledger
Next on PASS: independent review
Independent review PASS: `docs/cuts/paper-canonical-unification/tickets/21-cloze-correction-batch-01.md`
Terminal: no

## What to build

Run one deterministic zero-write script over the frozen 33-paper denominator
to attempt source/answer/Profile closure, compile every paper, and populate
stable family queues without applying semantic corrections.

## Acceptance criteria

- [ ] All 33 frozen papers run through the public compiler in zero-write mode.
- [ ] `ready + needs_review + unsupported + incomplete_source +
      answer_conflict = 33` with no paper leaving the denominator.
- [ ] Question source, official-answer source, attachments, Profile, and
      inactive closure are separately closed or explicitly diagnosed.
- [ ] Config-only and asset-only cases retain their accepted in/out accounting.
- [ ] Database, assets, latest, versions, reports, refs, and journals are
      byte-for-byte unchanged.
- [ ] Stable queue IDs support the approved bounded correction batches without
      embedding mutable paths in later ticket prose.
- [ ] Focused compiler/ledger checks, ordinary Standards + Spec self-check,
      full verify, and `git diff --check` pass.

## Result

Commit:
Verify:
Notes:
