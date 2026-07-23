# Refactor Handoff — api.mjs / App.tsx Decomposition (2026-06)

Status: Historical technical record — non-authoritative.
This document contains technical decisions and unresolved candidates only. It
does not route work. If an item is revived, the owner opens a new top-level task
under `docs/steering/codex-matt-workflow.md` after checking `docs/STATUS.md`.

## Completed lane

The June server-decomposition lane completed through H10-B. At its recorded
endpoint, `server/api.mjs` had fallen from 11,096 to 4,109 lines. The completed
cut inventory remains in git history and the per-cut records; it is not repeated
here.

`/api/ai/verify-trace` was intentionally retained. It is the read side of the
verify-audit JSONL contract and has two verifier consumers; deletion would make
that audit write-only.

## Genuinely unresolved

Only these candidates remained unresolved in the June analysis:

- **H12-B PR2 — `DifficultyReviewPanel`**: review and calibration controls were
  interleaved with `updateDifficultyDraft`,
  `handleSaveQuestionDifficulty`, and `computeCalibrationPreview`. Do not
  extract it unless the control boundary can be expressed without changing
  behavior.
- **H11-A PR2 — `::1` host unification**: adding `::1` changes behavior and
  requires a new explicit product decision.
- **H11-A PR3 — `cssAttr` deduplication**: proceed only if all three bodies are
  proven byte-identical.

The rejected shallow seams remain rejected unless new structural evidence
appears: the central read hub, generic CRUD SQL, type barrels, `App.tsx` state
webs, PaperSurface adapter consolidation, and trivial leaf-helper deduplication.

## Technical decisions that remain useful

1. **Prompt text is byte-sensitive.** Blanket indentation of template literals
   changes model input. Keep prompt interiors byte-identical and assert their
   content directly.
2. **Dependency analysis must include invocation.** Enumerating free identifiers
   is necessary but insufficient; call extracted code through stubs to catch
   missing call-time dependencies.
3. **Registered verifiers must be hermetic.** They may inspect working-tree
   files and fixtures, but must not depend on a local branch name such as
   `main`.
4. **Deep-module-or-skip.** An extraction is justified only when its interface
   is materially smaller than the state and complexity it hides.
5. **Factory seams point inward.** Extracted server modules receive dependencies
   through `createX({ ... })` and never import the composition root.

## Technical pointers

- Inventory and rejected-seam rationale:
  `docs/architecture/refactor-roadmap-2026-06.md`
- H5 plans:
  `docs/cuts/H5-server-implementation-extraction/`
- Stable verification registry: `scripts/verify-ci.mjs`
