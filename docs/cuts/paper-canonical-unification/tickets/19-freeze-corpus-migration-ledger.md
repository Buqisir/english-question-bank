# 19 — Freeze corpus and durable migration ledger

Status: ready
Blocked by: Ticket 18 independent review PASS and owner QA acceptance
Next on PASS: `docs/cuts/paper-canonical-unification/tickets/20-full-corpus-compile-dry-run.md`
Terminal: no

## What to build

Freeze the exact 33-paper `latest` denominator and create a deterministic,
durable migration ledger without correcting, publishing, switching, or
rendering any paper.

## Acceptance criteria

- [ ] The manifest binds every current path, byte length, SHA-256, tree digest,
      census fixed point, source role, Profile candidate, family count, and
      known anomaly id.
- [ ] Recount is exactly 33 papers, 273 Groups, 1530 objective Questions, and
      1035 question-owned A–D sets.
- [ ] Filesystem versions, database refs, answer keys, extras, canonical
      sidecars, latest trees, Consumer Contract, and rollback state are
      recorded without inventing missing files.
- [ ] Queue ids and stable ordering are deterministic and retain failed
      attempts, dispositions, recovery actions, and immutable evidence refs.
- [ ] No full passages, answers, private data, credentials, or mutable source
      bytes are copied into the ledger.
- [ ] Before/after state comparison proves zero mutation.
- [ ] Focused census/ledger checks, ordinary Standards + Spec self-check, full
      verify, and `git diff --check` pass.

## Result

Commit:
Verify:
Notes:
