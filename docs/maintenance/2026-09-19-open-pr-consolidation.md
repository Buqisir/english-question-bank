# Open PR consolidation — 2026-09-19

## Scope and fixed points

Owner request: inventory every open PR, distinguish obsolete/superseded work
from still-needed fixes, consolidate the latter, test, and open one review PR.
This does **not** authorize a main merge, deployment, production DB/R2 writes,
new CI authority, or accepting an old human-QA checkpoint.

Inventory: 14 open PRs at the start of this task. Baseline main:
`3d8d5e510e93c4d8db71904f1572859e80753630` (the merged #478).
Integration branch: `codex/consolidate-open-prs-20260919`.
The five live-fix PRs were three-way merged into this branch, **not main**;
their merged integration fixed point is
`ecf5d57629f9ecdf19de9b1ba8634525d8ec95a1`.
Original branches, comments and check histories are retained.

An old base alone is not proof that a change is obsolete. The decisions below
use the current implementation, PR diffs and the current architecture contract.
“Superseded route” does not mean every historical line was merged or accepted.

## Disposition ledger

| PR | Original head | Decision and evidence |
| --- | --- | --- |
| #289 | `5050b62cf53896a6519a7aaa35c3e9f22ba9b3e5` | Archive the old figure-option route, do not wholesale merge. Current #419 / `5458e8c7` integrated source-bound figure options into unified NCK1. The old branch proposes separate v46/v47/v48 authorities, renderer contracts and Q33 candidate machinery that cannot overwrite the current immutable contracts. Unique comparison assets and unaccepted visual QA stay in the original branch. |
| #290 | `6c47847d683d5a974ff42e003200537516d61c1f` | Archive the dependent Format 2 plan. Current `docs/import/agent-contract.md` and universal materialization are the entrypoint, not a new format-specific Job. This is not approval of the old implementation plan. |
| #291 | `c33d9f16853f44c4daf1ef02b863898a2a944e3a` | Archive the old stacked Format 2 implementation as superseded design, not as fully merged code. Its base was #289, not main; it changes 123 paths including old v49/v50 contracts, source/font/renderer and publication code. Current `6db5377a` universal source materialization and #470 / `16d6e993` public search metadata/layout review take precedence. Its unfinished real-paper canaries and Owner confirmations remain unaccepted. |
| #326 | `dc5b4eb306cfa8030fdf27d98809765232ca871a` | Already covered. Both analysis/import modes in current `.agents/setup` use `npm ci --no-audit --no-fund`. Do not replace that file with the older setup. Historical failed checks remain evidence, not current failures or passes. |
| #328 | `a726e62ead8f7b5fcdea379a78a9cb1af102512c` | Already covered by main history `18f01441`. Current `assertDeploymentCandidateStillCurrent` rechecks local HEAD, clean status and live main after the awaited authority read. Preserve that implementation and the separate host guard. |
| #330 | `ce3cf7fb164d855a56a91e3bcd6d7bc665980b88` | Superseded CI architecture. The earlier cumulative-risk/nightly implementation appears in main history (`3bc51c77`), but ADR-0026 / #460 now require the native Actions pair. Do not resurrect Amp/dual authority or the old workflow by merging the stale branch. |
| #351 | `2b63cda4a0b417c9be8b262cf71404dfface2e44` | Archive CI acceptance experiment, never merge. Current PR metadata has zero changed files. Retain the original negative/positive check evidence and branch. |
| #410 | `610ed8ee210a7e90ad6f9024275af5139ad51a24` | Archive deliberate negative CI sample, never merge. It includes intentional TS2322 in `app/src/ci-authority-gate-probe.ts` and stale CI changes; this is not a product fix. |
| #452 | `b0db18762a41f4c37487f27d0e4401080031aa97` | Integrate. Wire real single-paper publish to invalidate similar-question, teaching-facet and analysis-availability caches. Preserve idempotency and the existing promotion flow. |
| #453 | `22211a01d54f0b1864b672660f5cc9e1c2ee9bc2` | Integrate. Reject stencil image masks at the text-layer PDF gate; retain the real embedded-image fixture and expected public error code. |
| #454 | `fa9e1c8ac3898171950ee9277840861e37b11463` | Integrate. Reset both home sub-mode flags in the six MySpace/DraftPaper/PaperBrowse open/back callbacks; preserve newer main navigation and UI behavior. |
| #455 | `20c3a14e83b1d5d82b5dd535cd2781935dc7c586` | Integrate and strengthen the regression. Close the active browser after context creation failure, preserve the original error and cold/relaunch behavior. Add cleanup-close rejection checks and restore the exact stubbed module object. |
| #456 | `d5a07588d5a3a6272e212247191f6667786d5aa1` | Integrate. Normalize array/multipart content before considering reasoning fallback. Preserve existing string and empty-message behavior. |
| #458 | `0bf22b6adb33448c146e9be5737469942f5950f3` | Superseded route. It adds recovery/replay for the old Amp webhook controller. ADR-0026 explicitly removes that queue as a CI prerequisite. No replay, webhook activation or controller revival is part of this consolidation. |

## Old import work that is not silently accepted

The universal path supplies the current supported entrypoint. This ledger does
not assert that all experimental layout/source-fidelity features in #289/#291
are equivalent to it. Their bespoke schemas, image alternatives, font metrics,
per-paper transcription assets and pending human confirmations are not imported
into this review branch merely because they exist.

Any still-desired gap must be expressed against the current universal source
adapter and immutable Canonical contracts. In particular, reusing the same
versioned filenames for different authority bytes, reviving the format-specific
registration route, or copying a historical renderer over main is not a safe
conflict resolution. Historical Shenzhen/Jining QA cannot authorize publication
of a new candidate. Original branch SHAs above preserve that work for inspection.

## Verification and remaining merge gates

Before the production fixes were applied to an isolated main checkout, the new
home-route, Chromium-lifecycle and multipart-content regression checks failed.
After the fixes, focused checks passed. The first manual integration also passed
build, architecture registry checks, verification scheduler, PDF materialization,
draft pagination and universal publication. These are diagnostic results, not a
claim that an old PR's CI success applies to the final merged tree.

The GitHub integration tree is independently retrieved through the sandbox
bridge with exact head/base/run binding and authenticated archive hashes. Final
checks are recorded in the review PR with the tested Git tree and command exit
codes; test results must not be inferred from transport/build success.

The only CI-policy edit is registering the new lifecycle verifier in the
existing registry with its README row. No workflow, required-check setting,
secret, dependency lockfile, deployment file, data schema or Canonical authority
is changed. Because the registry and import/publication seams are touched,
request the existing Full pack and all six natural Actions E2Es. Do not repeat
Full locally merely to duplicate the natural PR run.

Independent Standards/Spec review and the current natural GitHub Actions
`verify` + `e2e` success remain required before any later main merge. Self-review
and focused sandbox passes do not substitute for those gates. No auto-merge is
enabled. Closing superseded review entries preserves their branches and evidence;
it does not mean all their changes were accepted or shipped.
