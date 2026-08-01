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
the edited filenames alone.

Geometry and typography changes require actual Screen output and every
relevant Student/Teacher Print HTML and Chromium PDF artifact. Hash-only,
schema-only, or source-regex proof cannot replace those artifacts.

## Layer 3 — ticket closure

On the final candidate:

1. run the affected narrow checks;
2. run `pnpm -C app run verify:all` once on that final state;
3. pass every required independent review gate;
4. use Owner QA only when the work is user-visible.

If a post-review fix changes executable behavior or evidence, rerun the
affected narrow checks and one final full suite on the new final state before
advancing.

A one-line documentation or SHA identity repair instead uses direct
resolvability, link, and format checks plus the required focused re-review in
an existing independent-review lineage. It does not automatically trigger
unrelated renderer suites or the full application suite unless current
authority or actual impact requires them.

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
- required independent review and user-visible Owner QA.

Repeated prerequisite identity facts may be established once for one exact
candidate and shared by the scheduled groups that consume them. Any candidate
change invalidates that shared result. Keep integrated version, digest, and
authority checks inside behavioral or reproducibility verifiers even when the
same facts recur; consolidation changes scheduling, not coverage.

At closure, record or report test-group wall times when available, together
with the command, outcome, and any material environment limitation. Use those
measurements to refine later routing; do not turn a timing target into a skip.

The measurement snapshot that informed this policy is initiative evidence,
not general authority:
`docs/cuts/paper-canonical-unification/migration/testing-and-model-routing-measurements-2026-08-01.md`.
