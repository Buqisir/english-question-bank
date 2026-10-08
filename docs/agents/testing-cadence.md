# Testing cadence

Test weight follows actual blast radius, irreversibility, and automation
authority. `SKIP` is never `PASS`.

## Before Ship

Until the Owner explicitly says Ship, do not run formal local automated
verify/regression suites by default. Iterate on implementation and review the
diff. Keep build/render work necessary for a usable preview and checks needed
for an explicit diagnostic request; neither requires a formal test pack.
Mark the candidate as awaiting acceptance, not verified. Inspect rendered
visual changes before claiming UI completion. This cadence does not waive
authorization or safety checks required for an authorized data/production
transaction.

Inspect a verification route without running it with
`node scripts/verify-ci.mjs --plan-json --changed-file <path>`.

## After Ship

Ship starts verification and delivery, not merge-before-test. Synchronize and
freeze the candidate, then complete missing affected local-only acceptance
once. Reuse covered checks from that candidate's natural CI, including required
Full/E2E. Do not stack focused, `verify:changed`, `verify:paper` and
`verify:all` runs merely to repeat coverage. The pack commands remain available
for explicit diagnostics or missing coverage, not routine development runs.

## Local and reversible

At acceptance, run affected build/typecheck or behavioral checks only where
current CI does not cover them. A UI micro-change also gets real-click
verification on the exact page and state, plus Owner QA when visible. It does
not trigger unrelated backend, paper, print/PDF, or full-repository suites
without a demonstrated dependency.

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
architecture require affected public-seam tests, Full/E2E on the final
candidate, and one independent Standards/Spec review at Ship. Reuse the exact
candidate's natural CI rather than duplicating its suite locally. Renderer
changes use real affected Screen/Print/PDF output; static regex or hashes alone
are not visual proof.

## Release

Report commands, outcomes, observed wall time, and limitations literally.
After a fix, rebase or base advance, re-run only local checks invalidated by
changes to their code, dependencies, fixtures or runtime/environment. Preserve
unaffected results and failed attempts; an environment fix affecting only a
few checks does not justify repeating the whole suite. If impact cannot be
bounded, broaden checks with a reason. Reuse unchanged builds and artifact
evidence only while their inputs and running implementation remain unchanged;
keep final outputs bound to the exact revision.

Remote gates are unchanged: each current PR head/base needs its natural
`verify` and `e2e` results, then the merged main commit needs its own natural
run. Shared/high/unknown risks require Full and all six E2Es remain fixed.
Old-head/base CI does not authorize a new candidate; local evidence reuse does
not waive these gates.
