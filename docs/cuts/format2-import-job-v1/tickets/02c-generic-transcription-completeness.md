# 02C — Generic transcription completeness

Status: ready-for-agent
Blocked by: 02B — Stable visual identities and exact prior-confirmation rebind

## What to build

Extend the versioned Format 2 transcription and public Job just enough to carry
four already-supported source semantics: a question PDF whose supplied content
starts at Reading and therefore closes inactive Listening as `not_supplied`,
existing contract-shaped Analysis sidecars, per-blank Grammar Fill prompt
provision, and Application Writing given-skeleton provision. Preserve v1 input
compatibility and keep every new choice source-bound and data-driven.

## Allowed and forbidden scope

- Allowed: one successor transcription schema, generic validation/adapter and
  publication plumbing, and focused public-Job regressions for these four
  semantics.
- Forbidden: per-paper branches or migrations, new Canonical authority or
  renderer behavior, new Analysis pedagogy, production mutation, and unrelated
  hardening or orchestration.

## Acceptance criteria

- [ ] A v2 transcription explicitly proves either complete Listening evidence
  or that the admitted question PDF starts at Reading; omission and mutation
  fail closed, while existing listening-complete v1 input remains accepted.
- [ ] Source-proven Listening absence compiles to the existing inactive
  `not_supplied` bindings without invented questions, answers, transcript, or
  audio evidence.
- [ ] Existing reviewed Analysis sidecar contracts can be carried as
  transcription data and published with the same atomic version; they remain
  pedagogical sidecars and never become Canonical authority.
- [ ] Every Grammar Fill blank preserves either its exact `source_prompt` or an
  affirmative `source_proven_none` observation.
- [ ] Application Writing preserves ordered source-provided title/skeleton
  parts or an affirmative proven absence, with matching Canonical observations.
- [ ] Exact question/answer source mutation invalidates downstream state, all
  four positive and adversarial public-Job cases pass, and v1 regressions stay
  green.
- [ ] The existing Format 2 Job verifier is extended; no new verifier, full
  suite, independent review, renderer/CSS, authority, or production action is
  added.

## Result

Commit:
Verify:
Notes:
