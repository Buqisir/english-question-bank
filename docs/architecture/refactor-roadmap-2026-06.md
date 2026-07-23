# Refactor Roadmap — api.mjs / App.tsx Decomposition (2026-06)

Status: Historical technical record — non-authoritative.
This is a compact inventory of technical decisions and unresolved candidates,
not a work queue. If a candidate is revived, the owner opens a new top-level
task under `docs/steering/codex-matt-workflow.md` after checking
`docs/STATUS.md`.

## Architectural constraints

- Preserve API responses, status codes, database schema, prompts, AI-parse
  output, UI, PaperSurface, print rendering, and reading-analysis behavior.
- Prefer a deep module whose interface is smaller than the state it hides.
  File-size reduction alone is not a seam.
- Extracted server modules receive dependencies through `createX({ ... })` and
  never import `server/api.mjs`.
- Keep prompt constants byte-identical. Inject them across a seam instead of
  relocating or re-indenting them.
- Verification should invoke the extracted behavior and remain hermetic.

## Completed decisions

The June lane completed H4-A, H5-B through H5-L, H6-A, H10-A/B, H11-A PR1,
H11-B, H12-A, and H12-B PR1. Their detailed objectives, seams, and verification
evidence live in the matching cut records and git history.

Two reslices remain important technical context:

- H10-B separated dead-route removal from extraction of the three live
  AI-proxy routes so request IDs and error envelopes remained independently
  checkable.
- H12-B separated the self-contained `DifficultyProfileGrid` from the
  interleaved review/calibration controls.

## Genuinely unresolved candidates

### H12-B PR2 — `DifficultyReviewPanel`

The read-only review/calibration UI is interleaved with teacher controls and
mutators. Reconsider only if the controls sever cleanly through a narrow
interface while preserving the `totalQuestions` scoping and calibration
output.

### H11-A PR2 — `::1` host behavior

The paper-import clients and other request clients historically used different
host allowlists. Adding `::1` is a behavior change, not deduplication. It needs
an explicit product decision and focused network-host verification.

### H11-A PR3 — `cssAttr` deduplication

Unify only after proving all three implementations byte-identical. Treat any
escaping difference as behavior, not cleanup.

### Paper Intelligence report loader

The harness loader remains a plausible deep seam: four scalar states could
collapse into one load-result union that hides fetch sequencing. It remains
contract-sensitive because it assembles PaperSurface input, and the existing
`verify-c6a4` source assertions would need a deliberate update.

## Rejected seams

Do not re-propose these without new structural evidence:

- **Central question-group read hub**: too many callers and injected
  collaborators; the interface would carry nearly as much state as the body.
- **Paper-asset card/overlay builders**: four independent entry points and a
  coupled print-readiness contract make the split shallow.
- **Saved parse-result readers/writers**: readers and persistence owners are
  split across the composition root and tied to detail response shape.
- **Generic validators**: one-to-three-line helpers whose shared interface would
  equal their implementation.
- **Composition root / `serverContext`**: wiring is its purpose; relocating it
  only moves references.
- **Question-group CRUD and paper-set persistence**: SQL and transaction state
  would remain exposed through a wide factory boundary.
- **Prompt constant relocation**: high blast radius with no interface reduction.
- **`App.tsx` parse-handler and import-workbench state webs**: a hook would
  return more state and callbacks than it hides.
- **PaperSurface adapter consolidation**: same-named helpers diverge in
  text-map and paragraph-scoping behavior.
- **Type barrels and trivial leaf helpers**: import churn or pass-through
  abstraction without hidden complexity.

## Verification lessons

- Prompt interiors need direct byte/content assertions.
- Free-identifier review must be paired with stubbed invocation.
- Registered verifiers must not depend on a local branch ref.
- Move-equivalence checks should cover response envelopes and persisted payload
  shapes, not only successful process exit.
