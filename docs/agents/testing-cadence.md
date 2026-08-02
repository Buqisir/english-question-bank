# Testing cadence

This file is the single owner of general test scheduling. The cadence reforms
when proof runs; it does not delete safety coverage. A spec, ticket, or current
authority may require stricter proof. `SKIP` is never `PASS`, and missing
off-repository evidence remains explicitly unproved.

## Layer 1 — daily narrow red/green

Run the relevant build/typecheck step plus the directly affected focused
verifier and at most one direct family verifier. Target roughly 10–40 seconds
per loop. The target is a routing aid, not permission to omit an affected
check; report an observed overrun at closure.

Do not run `pnpm -C app run verify:all` during every local red/green loop.

## Layer 2 — pre-commit affected public seams

Run only the affected admission, recovery, and consumer seams. Select them
from actual impact, including shared producers and consumers, rather than from
the edited filenames alone. Affected-test selection follows dependencies and
public seams; edited-file and path filters are routing hints, never sole proof.

Maintain a small, auditable impact map from each shared producer or authority
through its consumers to the required verifiers and artifacts. Unknown, stale,
or cross-cut impact widens selection conservatively. Test weight follows the
concrete failure being prevented, blast radius, irreversibility, and automation
authority; raw elapsed time is measurement evidence, not the governing KPI.

Geometry and typography changes require actual Screen output and every
relevant Student/Teacher Print HTML and Chromium PDF artifact. Hash-only,
schema-only, or source-regex proof cannot replace those artifacts.
Visual baselines and artifacts are reusable only for the exact candidate in
the same pinned OS, browser, font, and rendering environment. Candidate or
environment drift invalidates reuse.

## Layer 3 — risk-tiered ticket closure

Every final candidate runs the affected narrow deterministic checks. Add the
least heavy mechanism that prevents each concrete remaining failure; remove a
step when deleting it does not measurably increase risk or a lighter existing
mechanism already closes that risk.

A shared adapter, schema, publication, or renderer behavior change runs
`pnpm -C app run verify:all` once on its final state and passes the required
independent Standards/Spec review lineage. The same final-suite and independent-
review control remains required for changes to authentication, permissions or
per-user isolation, persistence/migration behavior, production configuration,
atomic-publication behavior, or shared Screen/Print/PDF correctness when those
changes can affect users or durable data. A post-review executable fix reruns
affected narrow checks and one final full suite on the new final state.

Importing paper data through an unchanged accepted adapter, schema, publisher,
and renderer is a data closure, not a shared-behavior change. It requires exact
source/candidate/confirmation/publication identities, narrow deterministic
admission checks, Teacher Confirmation, atomic publication/reload/retry checks,
fixed-denominator accounting, and canary or public-surface QA proportionate to
the actual paper and publication risk. Ticket closure alone does not trigger
`verify:all`, an authority version bump, an independent dual-axis review, or
another approval/evidence layer that merely rechecks the same facts.
Any discovered need to change shared behavior fails closed and takes the shared-
change path above.

Owner QA remains required when the work is user-visible.

A one-line documentation or SHA identity repair uses direct resolvability,
link, and format checks. It uses a focused re-review only when repairing a
concrete Must Fix in an existing independent-review lineage; ordinary low-risk
prose does not create a review lineage or evidence approval chain. It does not
trigger unrelated renderer suites or the full application suite unless actual
impact requires them.

## Gates that remain mandatory

Place each proof at the earliest gate where it can prevent an invalid result,
and retain it at later gates required by current authority. In particular, do
not weaken or replace:

- sealed exact-candidate evidence;
- zero-write and state-integrity checks;
- candidate-forgery rejection;
- the real public compiler and answer-visibility boundaries;
- recovery and rollback proof;
- actual Screen, Student/Teacher Print HTML, and Chromium PDF evidence;
- risk-required independent review and user-visible Owner QA.

Repeated prerequisite identity facts may be established once for one exact
candidate and shared by the scheduled groups that consume them. Any candidate
change invalidates that shared result. Keep integrated version, digest, and
authority checks inside behavioral or reproducibility verifiers even when the
same facts recur; consolidation changes scheduling, not coverage.

Optimize only after profiling the critical path and slowest groups. Then remove
repeated setup, reuse exact-candidate prerequisite results, cache immutable
inputs, cancel superseded runs, and only then shard or parallelize isolated
tests. Never use concurrency to hide nondeterminism.

At closure, record or report the command, outcome, critical-path wall time, and
any material environment limitation. When repeated samples exist, measure
P50/P90 or an equivalent distribution. Also account for defect catches,
false or flaky failures, `SKIP`s, reruns, cache reuse, and fixture fan-out;
summed group time alone is not sufficient. Use those measurements to refine
later routing; do not turn a timing target into a skip.

Every flaky or quarantined test requires an explicit owner, reason, bounded
repair expectation, and non-`PASS` accounting state. Probabilistic or
ML-selected tests are not current policy; adopting them requires deterministic
impact mapping to first measure an insufficiency and then separate authority.

The measurement snapshot that informed this policy is initiative evidence,
not general authority:
`docs/cuts/paper-canonical-unification/migration/testing-and-model-routing-measurements-2026-08-01.md`.
Non-authoritative external background is recorded in
`docs/cuts/paper-canonical-unification/research/external-testing-practice-cross-check-2026-08-01.md`.
