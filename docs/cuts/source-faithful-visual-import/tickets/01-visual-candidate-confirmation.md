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

- [ ] The Agent routing rule preserves paragraphs, real tables, and accepted
      `framed_columns` as structured content and sends only meaning-bearing
      pictorial or spatial objects through the Figure route.
- [ ] Every visual observation binds immutable source evidence, Source Capture
      identity, source document/page and crop coordinates when applicable,
      exact digest, pixel dimensions, and one intended Passage or Option owner.
- [ ] Every `source_crop`, `vector_authored`, or `reference_restored` candidate
      binds exact PNG bytes, digest, dimensions, reconstruction method, source
      observation, intended owner, and a source-truth checklist covering the
      meaning-bearing relationships visible in the source.
- [ ] Editable vector material, prompts, model/tool identifiers, and export
      settings may remain reproducibility evidence, but none can substitute for
      the exact candidate PNG bytes reviewed by the teacher.
- [ ] Teacher Confirmation selects an exact candidate digest for an exact
      observation and semantic owner. Changed bytes, digest, dimensions, MIME
      type, source evidence, or owner fail closed on a fresh re-derivation.
- [ ] Rejecting candidates leaves an explicit unresolved visual issue and no
      Canonical media reference. Confirming the source crop uses the same
      exact-byte path as confirming a reconstruction.
- [ ] Candidate generation neither infers an answer nor changes
      `correctOptionId`; accepting generated media does not misclassify it as a
      deterministic Transformation Record.
- [ ] A frozen generic fixture proves exact selection and source-crop fallback;
      adversaries cover missing source evidence, swapped owners, changed bytes,
      changed dimensions, wrong digest, unsupported MIME type, and unconfirmed
      or rejected candidates.
- [ ] The Agent Contract names this visual-routing and confirmation stop without
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

Not started. Record the implementation commit, focused checks, limitations, and
remaining unresolved visual decisions here.
