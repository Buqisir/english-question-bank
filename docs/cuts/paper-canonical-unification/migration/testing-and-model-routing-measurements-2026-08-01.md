# Testing and model-routing measurement snapshot — 2026-08-01

This is measured initiative evidence. It is not general policy, is not Ticket
23 replan input, is not route authority, and does not grant granularity
approval. It does not amend Ticket 22's independently reviewed measurement.
The general authorities are
`docs/agents/testing-cadence.md` and `docs/agents/model-routing.md`.

The snapshot records the owner-supplied inventory for this governance
update at source HEAD `873d7c89b6d45a8e40d75f312c24d68c339bfbc2`.
Ticket 22's reviewed semantic measurement remains
`docs/cuts/paper-canonical-unification/migration/full-corpus-zero-write-dry-run-v1.json`.

## Test inventory

- The inventory contained 2 preflight groups and 116 verifier groups. Verifier
  outcomes were 115 `PASS`, 1 `SKIP`, and 0 `FAIL`; recorded group wall times
  summed to 313.801 seconds.
- Canonical import pilot took 87.969 seconds and pilot QA server took 88.275
  seconds. Together they took 176.244 seconds, about 56.2% of the recorded sum.
- Build/typecheck took 2.126 seconds. Ticket 21's focused verifier took 0.32
  seconds; Ticket 22's dry run took 0.90 seconds.
- 23 verifiers contained 112 references to `paper-2026-i`. Separately, 35
  verifiers contained 457 source matches concerning version, hash, or
  authority.
- Ticket 21 and Ticket 22 repeated five prerequisite identity facts. No
  independent verifier was found that proved only version/hash identity with
  no behavioral or reproducibility obligation; recurring integrated checks
  therefore cannot simply be deleted.

## Model-routing trial

- Ticket 21 on Luna Max took 2,329.097 seconds.
- Ticket 22's initial Terra High implementation took 1,436.624 seconds; Terra
  implementation and fixes totaled 2,377.945 seconds.
- Three Sol Medium reviews totaled 922.254 seconds. They found five Must Fixes
  plus one remaining SHA identity defect before final `PASS`.
- Ticket 22's total observed top-level wall time was 3,300.199 seconds.

The tickets differed in scope, risk, and failure shape, so these observations
are not a controlled model comparison. Runtime billing, quota, and token-cost
data were unavailable; wall time is not provider cost.
