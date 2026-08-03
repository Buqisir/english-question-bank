# Testing cadence

Test weight follows actual blast radius, irreversibility, and automation
authority. Run affected checks during development; do not use the full suite as
a ritual. `SKIP` is never `PASS`.

Use `pnpm -C app verify:changed` for the daily diff-selected pack,
`pnpm -C app verify:paper` for shared Canonical Paper/Print seams, and
`pnpm -C app verify:all` only for a final high-risk candidate or conservative
fallback. Inspect a route without running it with
`node scripts/verify-ci.mjs --plan-json --changed-file <path>`.

## Local and reversible

Run the affected build/typecheck and focused behavioral check. A UI
micro-change also gets real-click verification on the exact page and state,
plus Owner QA when visible. It does not trigger unrelated backend, paper,
print/PDF, or full-repository suites without a demonstrated dependency.

## Known-shape paper data addition

When accepted adapter, schema, publisher, and renderer behavior are unchanged,
require strict input validation, immutable source/candidate identity,
candidate-bound Teacher Confirmation, deterministic data checks, atomic
publication/reload behavior, and a light canary proportionate to the paper.
Do not require a full suite, independent code review, authority bump, or deep
per-paper Screen/Student/Teacher Print/PDF proof merely because another paper
was added. Discovery of a new content shape or shared-behavior change exits this
lane.

## High-risk shared behavior

Changes to shared schema/data contracts, auth/permissions/isolation,
persistence/migration, atomic publication, shared PaperSurface or
Screen/Print/PDF behavior, production configuration, or irreversible cross-cut
architecture require affected public-seam tests, one full suite on the final
candidate, and one independent Standards/Spec review. Renderer changes use
real affected Screen/Print/PDF output; static regex or hashes alone are not
visual proof.

## Release

Run missing release checks once on the final candidate or use current CI
evidence. Report commands, outcomes, observed wall time, and limitations
literally. Re-run only checks invalidated by a post-review change, and confirm
`main` CI after merge.
