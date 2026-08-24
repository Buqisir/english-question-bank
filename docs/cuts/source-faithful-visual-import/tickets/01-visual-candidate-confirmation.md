# 01 — Bind visual candidates to exact Teacher Confirmation

Status: ready-for-agent
Blocked by: None — can start immediately

Spec: `docs/cuts/source-faithful-visual-import/spec.md`

## What to build

Give the local NCK1 import Agent one source-faithful visual-candidate path. The
Agent classifies a known source object, preserves its exact source crop, records
one or more PNG candidates with their intended Passage or Option owner, and
hands a teacher a comparison package whose decision binds exact candidate
bytes. Rejecting every reconstruction and keeping the source crop must be a
normal successful decision; unresolved or changed evidence must stop canonical
admission rather than choosing a plausible-looking image automatically.

Keep this inside the existing Source Capture → Import Candidate → Teacher
Confirmation seam and the existing Agent Contract. Do not create another
runbook, status database, website import UI, or runtime model endpoint.

## Acceptance criteria

- [x] The Agent routing rule preserves paragraphs, real tables, and accepted
      `framed_columns` as structured content and sends only meaning-bearing
      pictorial or spatial objects through the Figure route.
- [x] Every visual observation binds immutable source evidence, Source Capture
      identity, source document/page and crop coordinates when applicable,
      exact digest, pixel dimensions, and one intended Passage or Option owner.
- [x] Every `source_crop`, `vector_authored`, or `reference_restored` candidate
      binds exact PNG bytes, digest, dimensions, reconstruction method, source
      observation, intended owner, and a source-truth checklist covering the
      meaning-bearing relationships visible in the source.
- [x] Editable vector material, prompts, model/tool identifiers, and export
      settings may remain reproducibility evidence, but none can substitute for
      the exact candidate PNG bytes reviewed by the teacher.
- [x] Teacher Confirmation selects an exact candidate digest for an exact
      observation and semantic owner. Changed bytes, digest, dimensions, MIME
      type, source evidence, or owner fail closed on a fresh re-derivation.
- [x] Rejecting candidates leaves an explicit unresolved visual issue and no
      Canonical media reference. Confirming the source crop uses the same
      exact-byte path as confirming a reconstruction.
- [x] Candidate generation neither infers an answer nor changes
      `correctOptionId`; accepting generated media does not misclassify it as a
      deterministic Transformation Record.
- [x] A frozen generic fixture proves exact selection and source-crop fallback;
      adversaries cover missing source evidence, swapped owners, changed bytes,
      changed dimensions, wrong digest, unsupported MIME type, and unconfirmed
      or rejected candidates.
- [x] The Agent Contract names this visual-routing and confirmation stop without
      adding a website-side production path.

## Verification

- Run the focused visual-candidate and Teacher Confirmation contract checks.
- Run `pnpm -C app verify:paper`; report every `SKIP` literally.
- Review the diff for accidental answer-authority, runtime-generation, website
  import, production, and unrelated paper-asset changes.

## Out of scope

- The public Figure Option Canonical shape or consumer projection.
- Screen, Print HTML, or PDF image-option layout.
- Shenzhen Question 33 candidate production or migration.
- Production publication, deployment, R2 mutation, or repository push.

## Result

Implemented in this commit.

- Added the backend-only `visual-import-candidate-v1` →
  `visual-teacher-confirmation-v1` seam with fresh Source Capture, PNG byte,
  digest, IHDR dimension, observation, and owner validation. Confirmation emits
  only exact confirmed selections or explicit unresolved issues; it never emits
  answer authority, Transformation Records, Canonical media, or publication.
- Added the frozen generic Passage/Reading Option fixture, all three candidate
  methods, exact reconstructed and source-crop selection, and adversaries for
  missing/changed evidence, owner/observation swaps, digest/dimension/MIME
  drift, malformed checklists, rejection, omission, and answer-field injection.
- Focused check:
  `node scripts/verify-paper-canonical-visual-candidate.mjs` — PASS.
- Changed-risk check: `pnpm -C app verify:changed` — overall FAIL with
  `PASS 143 / SKIP 1 / FAIL 1`. Literal SKIP limitation:
  `scripts/verify-i16a-teaching-dimension-search.mjs` was declared skipped and
  therefore not actually tested. The sole failure was the unrelated existing
  `scripts/verify-genre-truth.mjs`: the current local DB has 18 passages absent
  from its decisions artifact; Ticket 01 did not alter that DB or artifact.
- Paper pack: `pnpm -C app verify:paper` — overall FAIL with
  `PASS 76 / SKIP 0 / FAIL 1`; the same unrelated `verify-genre-truth.mjs`
  local-data coverage failure was the only failure. The new focused verifier
  and the other 75 Paper scripts passed.
- `git diff --check` — PASS.
- Remaining visual decisions: this generic contract admits no real paper media
  by itself. Shenzhen Q33 candidate production/Owner selection and the later
  Canonical/consumer handoff remain outside Ticket 01 and unresolved here.
