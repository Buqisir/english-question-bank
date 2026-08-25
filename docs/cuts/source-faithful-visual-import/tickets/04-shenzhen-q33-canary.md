# 04 — Migrate Shenzhen Question 33 through exact Owner-confirmed media

Status: implemented
Blocked by: `01 — Bind visual candidates to exact Teacher Confirmation`; `03 — Render one Figure Option set across Screen, Print, and PDF`

Spec: `docs/cuts/source-faithful-visual-import/spec.md`

## What to build

Use Shenzhen first mock Reading D Question 33 as the first real canary for the
completed source-faithful Figure Option path. Preserve the existing 1380×220
strip as immutable source evidence, establish four source-position-bound Option
observations, and prepare coherent source-crop, vector-authored, and
reference-restored candidate sets at one fixed target-size intent.

Prepare the exact comparison state and stop for Owner visual confirmation. Only
after the Owner selects four exact candidate digests may the canary be migrated
locally. The resulting Canonical question has one literal stem, four stable
Figure Options, renderer-owned A–D labels, the existing source-backed answer,
and no detached whole-strip content or `[Fig.]` placeholder on any supported
surface.

## Acceptance criteria

- [x] The original full-width PNG remains byte-identical immutable source
      evidence and the comparison baseline; it is not admitted as Passage
      content after migration.
- [x] Four source observations bind source position to the existing A–D Option
      identities without using answer correctness to infer association.
- [x] The comparison package contains four source-crop baselines, one coherent
      vector-authored set, and one coherent reference-restored set, all shown at
      the same target image-box size, background, and renderer layout.
- [x] Each Option is checked independently for count, order, orientation,
      containment, connectivity, gaps, labels, dark/light regions, and every
      other source-authored relationship. Missing, added, swapped, relabeled,
      or topologically changed elements fail visual QA.
- [x] The implementing Agent prepares the exact service, paper, question focus,
      candidate comparison, Screen, Student/Teacher Print views, and PDF, then
      stops. It does not approve visual fidelity on the Owner's behalf.
- [x] Owner Confirmation selects four exact candidate digests, explicitly
      chooses the source-crop fallback, or leaves the canary unresolved. A mixed
      method is accepted only when each Option is individually reviewed and the
      combined set remains coherent at the shared target size.
- [x] After confirmation, Question 33 contains one typed stem, four
      renderer-owned labels, four Option-owned Figures, zero `[Fig.]` strings,
      and no Passage-level duplicate of the old strip.
- [x] The admitted `correctOptionId` and official answer remain unchanged; the
      canary is neither re-solved nor re-graded.
- [x] The four selected digests and Option associations remain identical in
      Screen, Student Print, Teacher Print, and PDF. Normal-size QA is the
      acceptance view; enlarged inspection is diagnostic only.
- [x] Each admitted asset contains the complete source-authored figure plus
      only source-backed internal whitespace/edge clearance. It contains no
      A–D label or renderer padding and receives no automatic edge trim or
      white-to-transparency rewrite. Asset portability does not override the
      canary's source-measured paper placement.
- [x] The canary uses the original PDF as its placement authority: A–D labels
      remain to the left of the figures, their source starts are preserved, and
      all four image positions and physical sizes come from page-4 XObject
      matrices shared unchanged by Screen, Student/Teacher Print, and PDF.
- [x] The page-4 text measurements are tracked as digest-bound evidence tied to
      the embedded source PDF digest. Source-measured rendering reproduces the
      admitted PDF matrices, including source-authored X/Y scaling, without any
      consumer-added crop or stretch.
- [x] Existing Shenzhen Reading A `framed_columns`, the application-writing
      lamp, all other questions, and all unrelated paper assets remain
      unchanged.
- [x] Focused canary and rendered-behavior checks, `pnpm -C app verify:paper`,
      one final `pnpm -C app verify:all`, one independent Standards review, and
      one independent Spec review are recorded. Every `SKIP` remains `SKIP`.
- [x] The result remains a draft PR at the Owner QA stop. No production
      publication, deployment, R2 mutation, release action, or content push is
      performed by this ticket.

## Verification

- Compare every candidate against the immutable source at one fixed physical
  target size before requesting Owner confirmation.
- After confirmation, run the focused canary contract and cross-surface checks
  and capture exact-page Screen, Student/Teacher Print, and PDF evidence.
- Run the shared Paper pack during work and the full repository suite once at
  the final shared-contract gate; retain independent Standards and Spec review
  findings literally.
- Use the Owner QA handoff template so the Owner does not reconstruct the test
  state.

## Out of scope

- Migrating any other historical Figure paper or Option set.
- Changing Shenzhen Reading A `framed_columns` or the application-writing lamp.
- Automatic visual scoring, model self-approval, or answer-based image
  selection.
- Public SVG, mixed Option modes, website import UI, production publication,
  deployment, R2 mutation, merge, or content push.

## Result

Implemented locally through Stop B and held at the exact-page Owner QA stop.
The PR remains draft; no production publication, deployment, R2 mutation,
release action, merge, or content push was performed.

### Stop B — exact source-crop migration

- Owner selected `source_crop` independently for A–D. The exact selected
  digests are A `sha256:033b4c7a56070f9ff6dc021f3a7ae4d61459f19bfaf7e10bf7328f2dc2c6c8b2`,
  B `sha256:7b07503f9a76b5323c0b20282b97794b04db99bc33da4ebdd5ca918e7124b126`,
  C `sha256:474e39a0690268135727b44d4c8e17c3bce7410ddc96013a5f048b7f166818de`,
  and D `sha256:5b97c34cb36ac51885c4e99fee05e557b2a51ccb2e3b2a9ebbf09dc6b5c38f8e`.
- The exact confirmation is
  `visual-candidates/q33/visual-teacher-confirmation-v1.json`, digest
  `sha256:7356ca553f2f75f8ded71c80b56d5033ec2e20bb54e575156cb0c6f2e054ea76`.
  It compiles the local canary digest
  `sha256:2f83bb97b8b0cec48070309f351edfe7f2c33af39b8591131ed285063aa0b526`.
- The canary has one literal Question 33 stem, four stable Option identities,
  four Option-owned PNGs, renderer-owned A–D labels, zero `[Fig.]`, and no
  detached whole-strip Passage Figure. Its source-backed answer remains D.
- Asset framing remains portable: an asset owns all source-authored
  figure pixels, source-backed internal whitespace, and only source-object edge
  clearance. It excludes question text, A–D labels, page margins, comparison
  padding, and renderer image-box whitespace. No automatic trim or
  white-to-alpha rewrite is allowed. For this canary, the original PDF owns
  normal-size physical placement through the source layout intent; renderers
  project it and retain only responsive overflow and pagination decisions.
- The source layout intent digest is
  `sha256:00510ed5e5b5300b3d6723ca8da6bb8fbec32181ca13e2ac29ef618d4cf9a95d`.
  Its tracked source-layout measurement digest is
  `sha256:dfb4bb796ca39f7b6381b8954642a8060cde36044dcd01eeae2433bb142ffffc`,
  bound to embedded source PDF digest
  `sha256:df0c4e0a0d1aee4557f122591e3b778d7b48f2f324d75dba120343bb00926c80`.
  Relative to the Question content box, the A–D label starts are 24pt, 144pt,
  264pt, and 360pt. The four exact image sizes are 20.52×51.48pt,
  24.60×51.96pt, 22.08×51.96pt, and 19.56×51.96pt.
- The same shared layout authority drives Screen, Student/Teacher Print, and
  PDF. Consumer Contract v3 binds an immutable v47 schema closure, while the
  v48 rendering authority binds the compatible Screen v39 and Print/PDF v40
  contracts without a digest cycle. The projected Q33 Question owns the
  digest-bound requirement, so deleting top-level intents fails closed.
  Track count and image-box aspect reach CSS from the translator instead of
  being independently hard-coded. Screen remains answer-free; Print/PDF
  carry Canonical `correctOptionId`, and a poisoned legacy answer cannot
  override the teacher answer.
- Focused Canonical contract, rendered behavior with actual artifacts, and Q33
  canary verifiers: PASS. The PDF proof extracts all four PDF image streams and
  compares decoded sRGB RGBA SHA-256 identities against the confirmed A–D
  source images, not dimensions alone: PASS.
- Final `pnpm -C app verify:paper`: `PASS 79 / SKIP 0 / FAIL 1`. The sole
  failure is the unrelated existing `scripts/verify-genre-truth.mjs`, whose
  current local DB has 18 passages not covered by its decisions artifact.
  Every Canonical Paper, Figure Option, Q33, Screen, Print, and PDF check in the
  pack passed.
- Final `pnpm -C app verify:all`: `PASS 145 / SKIP 1 / FAIL 2`. Literal SKIP:
  `scripts/verify-i16a-teaching-dimension-search.mjs` because its off-repo
  fixture is absent. The persistent unrelated FAIL is the same
  `scripts/verify-genre-truth.mjs`. The second FAIL was the unrelated
  `scripts/verify-vocabulary-rendered-behavior.mjs` 0.8-second playback timing
  assertion under full-suite load; its immediate isolated rerun passed 42/42.
  This ticket changes neither unrelated subsystem.
- Final independent Standards review: PASS with no remaining Must Fix. It
  verifies the historical comparison v47 authority, immutable schema v47,
  renderer v48, Consumer Contract v3, declaration accuracy, source-matrix
  semantics, and digest-bound measurement closure. Final independent Spec
  review: PASS; all earlier fail-closed, source-scaling, declaration, shared
  page-number, and measurement findings are closed with no scope mismatch.
- Exact Owner QA state: local Vite service, the Q33-focused Canonical Reading
  Screen route, Student/Teacher Print HTML, the two-page Student PDF, and the
  original-PDF-versus-final-PDF comparison are prepared under
  `output/playwright/source-faithful-visual-import-q33/` and `output/pdf/`.
  The fixed Screen URL is
  `http://127.0.0.1:4175/canonical-reading-qa.html?groupId=group-mock-sz-2026-m1-reading-d&fixture=q33-source-crop`.
  A final in-app-browser smoke against the fixed service confirms exactly one
  Question 33, one source-measured row, four source-measured Option items, four
  images, real A–D labels, neutral `Option A`–`Option D` alts, the four exact
  source width/height placements, zero `[Fig.]`, and zero browser error logs.

### Stop A — historical candidate receipt

The following receipt records the evidence that existed before the exact
Owner source-crop choice; its waiting/SKIP statements describe Stop A only and
are superseded by the Stop-B result above.

- Candidate package:
  `sha256:53d29f20c9bd6ad1b1c0138e030f679ebfad2cf945c7e85eb3bd5ed89881d7b8`.
- Successor visual Source Capture:
  `source-capture:3bc14ad0fcc859e6c350b` /
  `sha256:3bc14ad0fcc859e6c350b32dd86889fb993e761f865d1b2e9044427a6c798832`.
- Source XObjects were extracted with `/opt/homebrew/bin/pdfimages` 26.04.0,
  binary SHA-256
  `c3503fe7e90a0d99a501946338b20fa1f15dfbbcc8d546dae78826e6dc4f8bc7`.
  The candidate evidence records the exact extraction invocation and explicit
  `q33-000.jpg`–`q33-003.jpg` to A–D rename mapping.
- The two tracked 1380×220 strips remain byte-identical at
  `sha256:60f02d3ac7194ac22d52137f0e64801d348818548d3e385bf6200c025aa8702d`.
  The strip is immutable comparison evidence only.
- Four observations bind page-4 PDF XObjects 58–61 by left-to-right source
  placement, never by answer identity:
  - `observation:paper-mock-sz-2026-m1:q33:option:A` →
    `option:q-mock-sz-2026-m1-033:A`;
  - `observation:paper-mock-sz-2026-m1:q33:option:B` →
    `option:q-mock-sz-2026-m1-033:B`;
  - `observation:paper-mock-sz-2026-m1:q33:option:C` →
    `option:q-mock-sz-2026-m1-033:C`;
  - `observation:paper-mock-sz-2026-m1:q33:option:D` →
    `option:q-mock-sz-2026-m1-033:D`.
- Exact candidate digests:

  | Option | `source_crop` | `vector_authored` | `reference_restored` |
  | --- | --- | --- | --- |
  | A | `sha256:033b4c7a56070f9ff6dc021f3a7ae4d61459f19bfaf7e10bf7328f2dc2c6c8b2` | `sha256:566a6eb58b7aaa8d6a04cd41dec94caa60ea11cf1cffce07e84ef75bdada86d3` | `sha256:457e4af4322582bdccddc86687fcb1a044cba35ee140d589937500a49c212c0d` |
  | B | `sha256:7b07503f9a76b5323c0b20282b97794b04db99bc33da4ebdd5ca918e7124b126` | `sha256:e613ce9761ffc6b054087952c6425bfe2f9098882c82325ee69c9b242231e796` | `sha256:90358084fa34af4aa2c38c7be178d2410fcc6e85904a885fc671ae2cb9a03603` |
  | C | `sha256:474e39a0690268135727b44d4c8e17c3bce7410ddc96013a5f048b7f166818de` | `sha256:3191a409a0f7065f26ce6ceb27d2afc1e6b1fa467a3e0449e7a9ea8463cb374c` | `sha256:b8728e6adc9a9fc65c9a72cf6487c6bbbb50f1a459e6177a2eb45f1eb8680995` |
  | D | `sha256:5b97c34cb36ac51885c4e99fee05e557b2a51ccb2e3b2a9ebbf09dc6b5c38f8e` | `sha256:53e5fe85a40515d1a1c893d57372f8e1ec080f6792335e808fc28d9301e7b5df` | `sha256:6efc93028120a2a117fa144ee23bebf0dcc3bdc415b8308cf8f89474c538765c` |

- The local comparison is
  `scripts/import-pipeline/papers/paper-mock-sz-2026-m1/visual-candidates/q33/comparison.html`.
  Serve the paper directory with
  `python3 -m http.server 4174 --bind 127.0.0.1 --directory scripts/import-pipeline/papers/paper-mock-sz-2026-m1`
  and open
  `http://127.0.0.1:4174/visual-candidates/q33/comparison.html`.
- All three rows use the Ticket 03 four-track layout and the same white
  96×60pt `contain` box with renderer-owned external A–D labels. The default
  exported confirmation has `decisions: []`; a smoke selection proved the
  export repeats package digest, observation, complete owner, and exact
  candidate digest, then the page was restored to unresolved.
- Agent visual findings remain literal and are not Owner acceptance:
  - vector A simplifies fine internal contours; vector B regularizes the two
    droplets and highlights; vector C omits source raster texture; vector D
    regularizes border and gap geometry;
  - reference-restored A materially invents/rearranges internal topology;
    B regularizes the central separation/highlights; C changes edge-light and
    texture; D regularizes gaps, border, and internal whitespace.
  - `source_crop` remains an equal-authority fallback for every Option.
- Focused Stop-A verifier: PASS. It freshly checks source/strip/XObject bytes
  and placements, all candidate PNG bytes/digests/IHDR dimensions, owners,
  package and confirmation mutations, Ticket 03 geometry, the independent
  per-Option checklist item, and unresolved no-Canonical behavior.
- Ticket 01 `verify-paper-canonical-visual-candidate.mjs`: PASS. Materializer
  rerun was byte-idempotent; staged diff check and protected strip/Canonical
  no-diff checks: PASS.
- Local comparison Playwright smoke and visual screenshot inspection: PASS.
- Historical Stop-A state: exact exported confirmation was still awaiting the
  Owner, so no candidate was selected or confirmed at that time.
- Historical Stop-A gate state: Canonical migration, Screen,
  Student/Teacher Print, PDF, rendered-behavior proof, full gates, and
  independent reviews were all `SKIP`. Stop B above supersedes this state.
- At Stop A, no Canonical artifact, publication ref, paper asset, answer
  identity, deployment, production data, or R2 object had changed.
