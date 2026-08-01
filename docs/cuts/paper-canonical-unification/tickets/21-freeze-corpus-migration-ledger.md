# 21 — Freeze the 33-paper corpus and migration ledger

Status: done
Blocked by: Ticket 20 independent review PASS and owner QA acceptance
Next on PASS: `docs/cuts/paper-canonical-unification/tickets/22-full-corpus-zero-write-dry-run.md`
Terminal: no

## What to build

Freeze the exact 33-paper `latest` denominator and create a deterministic,
durable migration ledger without correcting, publishing, switching, or
rendering any paper.

## Acceptance criteria

- [x] The manifest binds every current path, byte length, SHA-256, tree digest,
      census fixed point, source role, Profile candidate, family count, and
      known anomaly id.
- [x] Recount is exactly 33 papers, 273 Groups, 1,530 objective Questions, and
      1,035 Question-owned A–D sets.
- [x] Filesystem versions, database refs, answer keys, extras, canonical
      sidecars, latest trees, Consumer Contract, and rollback state are
      recorded without inventing missing files.
- [x] Queue ids and stable ordering are deterministic and retain failed
      attempts, dispositions, recovery actions, and immutable evidence refs.
- [x] No full passages, answers, private data, credentials, or mutable source
      bytes are copied into the ledger.
- [x] Before/after state comparison proves zero mutation.
- [x] Focused census/ledger checks, ordinary Standards + Spec self-check, full
      verify, and `git diff --check` pass.

## Superseded-ticket mapping

Replaces old Ticket 19.

## Result

Commit: `16b8a54e1b46d254d6a8a097ec91fdae3b99bc09`; focused preflight closure `c953ab604077536468a45f86cf2fe24185034acc`
Verify: `node scripts/verify-paper-canonical-migration-ledger.mjs` PASS (wall-clock `0.32s`, clean-state); `node --check scripts/verify-paper-canonical-migration-ledger.mjs` PASS; `pnpm -C app run verify:all` = `PASS 115 / SKIP 1 / FAIL 0` (wall-clock `315.00s`); `git diff --check` PASS
Notes: Manifest/ledger freeze exactly 33 papers, 273 Groups, 1,530 objective Questions, and 1,035 Question-owned A–D sets. Zero-mutation state digest is `sha256:adf24d2edb0366a2a4286cabc3c661a5cee6f9d0c014f49e29e42174e48c9048` before and after. The ledger has 34 deterministic queue entries (corpus + 33 papers); no new test fixtures were added. Real defects caught and fixed: 2 (authority Profile/Consumer Contract raw-hash race; implicit dirty-worktree allowance in write mode); review Must Fix count: 2; rework cycles: 2. No correction, publication, latest switch, rendering, migration, compiler dry run, or Ticket 22 action occurred. Cost/quota was not exposed by the runtime.
