# 02 — Compile confirmed Figure Options through the shared projection

Status: ready-for-agent
Blocked by: `01 — Bind visual candidates to exact Teacher Confirmation`

Spec: `docs/cuts/source-faithful-visual-import/spec.md`

## What to build

Extend the versioned Reading contract so one confirmed visual selection can
become Option-owned media without creating an Option-only registry. A Reading
question keeps its stable A–D Option identities and uses one closed homogeneous
mode: four non-empty literal-text Options or four Figure Options that each
reference exactly one immutable PNG owned by the same Canonical Question Group.

Carry the new shape through compilation and the shared renderer-neutral
projection. The projection resolves and verifies media once; downstream
consumers must not inspect manifests, parse placeholders, fall back to source
crops, or reconstruct semantic ownership.

## Acceptance criteria

- [ ] A versioned additive authority/schema successor admits a synthetic
      Reading question with four confirmed Figure Options while already
      published authorities remain readable under their original contracts.
- [ ] Each Figure Option retains its existing Option identity and A–D order and
      references exactly one same-group media item with immutable PNG bytes,
      digest, positive pixel dimensions, and source artifact identity.
- [ ] Each media item is placed exactly once by either its accepted Passage
      Figure location or one Figure Option; duplicate ownership and unplaced
      media fail closed.
- [ ] A question-level A–D set is either four non-empty literal Options or four
      Figure Options. Mixed modes, `[Fig.]`, arbitrary nested content, captions,
      multiple figures, and combined text-plus-figure Options fail closed.
- [ ] Missing or duplicate Option identities, incomplete sets, cross-group
      references, absent media, changed bytes, digest or dimension mismatches,
      unsupported MIME types, and unresolved ownership all fail before
      consumption.
- [ ] Source-map coverage and Canonical identities include the Option and its
      selected media without pretending generated content is deterministic
      source text.
- [ ] The shared projection exposes one renderer-neutral image-option set with
      resolved immutable media and neutral accessibility identity; it never
      exposes source crops, generation prompts, candidate alternatives, or
      answer hints.
- [ ] Existing literal-text Reading fixtures remain byte- and
      behavior-compatible. Passage Figure and `framed_columns` fixtures retain
      their current behavior.
- [ ] Seven Choices, Cloze, Grammar Fill, Application Writing, Continuation
      Writing, and every non-Reading family continue to reject Figure Options.
- [ ] A frozen generic fixture plus negative cases proves compilation,
      projection, identity stability, media closure, and all fail-closed edges
      independently of the Shenzhen canary.

## Verification

- Run the focused Canonical Reading contract, authority, compilation, and
  consumer-projection checks, including the full negative matrix.
- Run `pnpm -C app verify:paper`; report every `SKIP` literally.
- Verify existing published Reading, Passage Figure, and `framed_columns`
  fixtures still select their original authorities and behavior.

## Out of scope

- Screen, Student/Teacher Print HTML, or PDF layout for Figure Options.
- Any website import or image-generation UI.
- The Shenzhen Question 33 candidate assets or migration.
- Public SVG, mixed Option modes, captions, rich Option trees, or non-Reading
  Figure Options.

## Result

Implemented on `codex/sfvi-ticket-02` in the one-line Ticket 02 implementation
commit.

- Added scoped manifest v46 while keeping `canonicalAuthorityRef` at v36.
  Reading v2, `nck1-v14`, `zhejiang-legacy-v12`, `national-legacy-v4`, and
  additive Screen v38 / Print-PDF v39 Consumer Contracts form one exact
  authority closure; predecessor family, profile, authority, and Consumer
  Contract bytes remain unchanged.
- Figure Options compile and seal only through Ticket 01's exact Teacher
  Confirmation. The closed A-D text/Figure union, same-Group exact-once media
  ownership, PNG bytes/digest/IHDR dimensions, Option/media/source-map joins,
  and cross-Group ownership all fail closed before consumption.
- Shared projection emits a renderer-neutral `figure` Option with resolved
  immutable media and neutral Option identity. Reading v46 occurrence digests
  bind Option-to-media associations; source crops, prompts, candidates, and
  answer hints do not enter the Figure Option projection.
- Added frozen generic fixture and focused adversarial verifier:
  `node scripts/verify-paper-canonical-reading-option-figure.mjs` — PASS.
  Its matrix covers mixed/incomplete/placeholder/rich Options; duplicate,
  missing, unplaced, Passage+Option, Option+Option, and cross-Group media;
  MIME/bytes/digest/dimension/IHDR/source-map/confirmation drift; all
  non-Reading families; unresolved confirmation; and missing/swapped/tampered
  projected-occurrence/media artifacts.
- Compatibility checks — PASS: existing Reading publication (including Passage
  Figure), `framed_columns`, Seven Choices, Cloze/Grammar Fill, Application
  Writing, and Continuation Writing focused verifiers. The frozen literal
  Reading v36 Canonical Paper digest remains
  `sha256:435525747864b69e13a4cbe7e1fe9b40dc33e081c3c5e3f24c0d24496e499e07`.
- Paper pack: `pnpm -C app verify:paper` — overall FAIL with
  `PASS 77 / SKIP 0 / FAIL 1`. The sole failure is the same unrelated local-data
  coverage failure already recorded by Ticket 01:
  `scripts/verify-genre-truth.mjs` reports 18 database passages absent from its
  decisions artifact. Ticket 02 changes no database, genre-truth artifact, or
  production data. All Canonical Paper checks, including the new focused
  verifier, passed. Literal SKIP count: `SKIP 0`.
- `git diff --check` — PASS.
- Remaining work is intentionally outside this ticket: Screen/Print/PDF layout
  belongs to Ticket 03, and Shenzhen Q33 assets/migration belong to Ticket 04.
