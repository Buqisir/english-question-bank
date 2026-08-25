# 01 — Format② Job to exact Teacher Confirmation

Status: ready-for-agent
Blocked by: None — can start immediately

## What to build

Deliver the first complete half of the public Format 2 Import Job. Given one
question PDF, one independent answer PDF, one safe paperId, provenance, and a
versioned per-paper transcription, the Job captures exact sources, validates
the supported shapes, prepares source-crop-first visual candidates, and stops
durably at exact Teacher Confirmation. The caller receives one current result
with the lifecycle, stop reason, diagnostics, artifact identities, and exact
comparison entry point rather than a remembered sequence of scripts.

Prove the behavior with the compact synthetic Format② fixture from the spec.
It must exercise ordinary text, a real table, `framed_columns`, a Passage
Figure, one homogeneous Reading Figure Option set, objective answers,
listening material, and writing material without embedding a full real paper.

## Allowed and forbidden scope

- Allowed: the shared Format 2 Job seam, its versioned per-paper transcription
  input, durable stage results, synthetic evidence, and the local import
  console projection of the current stop.
- Reuse the accepted Source Capture, Candidate, visual Candidate, and Teacher
  Confirmation modules; do not reproduce their semantics in the coordinator.
- Forbidden: Canonical publication, final QA acceptance, production actions,
  website import UI, hosted model calls, a new status database, paperId
  branches, or changes to shared renderer meaning.

## Acceptance criteria

- [ ] One public start-or-continue operation accepts only supported source identities, paperId, provenance, per-paper transcription, and durable Job state; callers do not choose internal adapters, authority versions, commands, or storage paths.
- [ ] The per-paper artifact is schema-validated and represents the synthetic fixture without adding its identity or content to shared source code.
- [ ] Exact question and answer PDF bytes are captured before interpretation; a missing answer source, changed digest, unsafe paperId, unsupported format, or incomplete objective-answer coverage fails before Candidate admission.
- [ ] Official answers come only from the admitted answer PDF; model reasoning cannot become answer authority.
- [ ] Each visual observation retains exact source bytes or a page-region crop, PDF page/point geometry, one stable semantic owner, and a required `source_crop` candidate. Optional reconstructed methods appear only for a recorded legibility reason or explicit Owner request.
- [ ] Reading Figure Options remain a homogeneous A–D set; stems, question numbers, and labels remain renderer-owned text and are not flattened into the images.
- [ ] A valid run stops in durable `importing` state at exact Teacher Confirmation with zero Canonical publication and an exact normal-size comparison entry point.
- [ ] Repeating identical inputs reproduces the same Job and candidate-package identities; changing an upstream digest invalidates every dependent result.
- [ ] Rejected, missing, owner-mismatched, dimension-mismatched, or unsupported visual evidence remains unresolved with a stable diagnostic rather than being auto-approved or flattened.
- [ ] The local console shows only the concise stop reason, package identity, comparison entry point, and resume instruction; it does not expose full passages or answer contents.
- [ ] Focused public-Job behavioral checks, required lower-seam checks, and `git diff --check` pass. The final full repository gate remains Ticket 06 work.

## Result

Commit:
Verify:
Notes:
