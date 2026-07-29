# 20 — Backend canonical import pilot on supported outputs

Status: done
Blocked by: 19 — Import recovery, retry, and rollback
Next on PASS: independent review
Independent review PASS: owner QA
Owner QA PASS: `docs/cuts/paper-canonical-unification/tickets/21-freeze-corpus-migration-ledger.md`
Terminal: no

## What to build

Run one local backend source package through capture, compile, atomic publish,
exact reload, supported rendered consumption, retry, and rollback using the
executable authority and public admission seam.

## Acceptance criteria

- [x] The backend agent/runbook names the exact capture, compiler, publisher,
      loader, recovery, and evidence boundaries.
- [x] One local source package completes dry run, successful publish, exact
      reload, retry, and rollback without an operator-only bypass.
- [x] The published paper produces checkable PaperSurface plain/lecture,
      Student/Teacher Print HTML, and direct Chromium PDF artifacts.
- [x] No DOCX, OOXML, or DOCX-converted-PDF artifact is generated or required.
- [x] Student/Teacher semantics and answer visibility agree with the accepted
      canonical contracts on every supported output.
- [x] No website import or normalization-review UI, production write, R2
      action, or historical-version compilation is added.
- [x] From the exact independently reviewed HEAD, the task provisions and
      opens the required page and supported artifacts with the canonical QA
      checklist, then pauses for owner verdict.
- [x] Focused checks, ordinary Standards + Spec self-check, app/server checks,
      full verify, and `git diff --check` pass.

## Superseded-ticket mapping

Replaces old Ticket 18 with its semantic, atomicity, recovery, and backend
pilot goals intact and its generated-DOCX artifact expectations removed.

## Result

Commit: `684d45813270e509551b1b4c2e86755f741e2fa6`;
`c8cd11cf1221fda3dbbe77d7a462b843b7c6595d`
Verify: canonical backend pilot, deterministic request reproduction, canonical
admission, recovery, source document types, DOCX source input, inactive
Listening zero occurrence, normalization import gate, Print renderer 92/92,
app build, architecture housekeeping 83/83, focused canonical behavior checks,
ordinary Standards + Spec self-review, and `git diff --check` PASS;
`pnpm -C app run verify:all` 113 PASS / 1 declared SKIP / 0 FAIL.
Notes: A real local PDF source package now reaches the public compiler and
atomic publisher, reloads exact canonical Screen and Print/PDF consumers,
survives restart/retry, and rolls back to the validated earlier publication.
Actual Chromium PDF evidence binds every active group, the native source table,
writing response boxes, CropBox geometry, answer visibility, and zero inactive
Listening occurrence. The HEAD-bound QA command and checklist are ready, but
this implementation task did not provision owner QA; provisioning remains
gated on independent review PASS. No production, R2, historical-version,
website-import UI, generated DOCX/OOXML, independent-review, owner-QA, or
Ticket 21 action was taken.

Focused review-fix commit:
`98384045cef3248d163f3d873910ea725d9134a7`.
Focused verify: source-bound import-pilot fixes, deterministic request
reproduction, public canonical admission/recovery/pilot, Reading publication,
inactive Listening closure and zero occurrence, the four directly affected
rendered consumers, PaperBrowse 198/198, app typecheck/build, and
`git diff --check` PASS; `pnpm -C app run verify:all`
114 PASS / 1 declared SKIP / 0 FAIL.
Focused notes: the pilot request now carries an empty registered source
envelope plus reviewed immutable Reading, Writing, and complete inactive
Listening evidence. Registered compiler adapters alone derive semantic Groups,
official assertions, exact Source Spans, Transformation Records, inactive-slot
closure, and Profile order. Missing active or Listening answers and any
Listening question/option/transcript/timing/audio evidence fail closed.
PaperBrowse rejects rendered non-Listening Groups outside the ready
Consumption Plan and has no canonical-required Reading/Writing raw fallback;
flattened table markers are never promoted to native table authority. The
non-blocking repeated-switch smell was not refactored. No owner QA or Ticket 21
action was taken.

Legacy-selection focused fix commit:
`10520c3b11fdf706767c102229a818786846bf9d`.
Legacy-selection verify: the canonical import focused-fix public seam,
PaperBrowse 198/198, Seven Choices and Cloze/Grammar rendered-consumption
regressions, app `tsc -b`/build, `git diff --check`, and
`pnpm -C app run verify:all` 114 PASS / 1 declared SKIP / 0 FAIL.
Legacy-selection notes: checked-in Screen v12 still authorizes whole-family
legacy selection for Reading, Application Writing, and Continuation Writing.
PaperBrowse now renders those explicit `selection.mode=legacy` families while
canonical mode still rejects missing projection/raw fallback and the public
page boundary still rejects Plan-external Groups. The non-blocking duplicated
test helper and prior Repeated Switches smell were not refactored. No owner QA
or Ticket 21 action was taken.

Owner-QA provisioning repair commit:
`e8b2654017b57d51bfdb19d8eab2fce9d8fc7b4f`.
Provisioning repair verify: the registered HEAD-scoped QA artifact-server
regression, the official backend pilot and focused-fix verifiers, the real
`--actual-artifacts --qa-server` six-URL smoke with clean SIGINT shutdown, app
`tsc -b`/build, architecture housekeeping 83/83, and `git diff --check` PASS;
`pnpm -C app run verify:all` 115 PASS / 1 declared SKIP / 0 FAIL.
Ordinary repair self-review: Standards found 0 hard violations and one
non-blocking Possible Duplicated Code judgement in the independent artifact
expectations; Spec PASS with 0 findings / 0 Must Fix. The independent expected
values remain as the regression oracle rather than sharing the server
manifest.
Provisioning repair notes: the official QA command now serves only the
generated Student/Teacher Print HTML and direct Chromium PDF bytes from the
exact `.scratch/paper-canonical-ticket-20-qa/<HEAD>/` directory, prints exact
HTTP URLs for all four artifacts in addition to plain/lecture Screen, declares
the correct HTML/PDF content types, and returns 404 for unknown or traversal
paths. It reloads the four URLs against the generated bytes before reporting
ready and remains alive for owner QA. Canonical semantics and artifact
generation are unchanged. The automated smoke was stopped after verification;
no owner-QA provisioning, owner verdict, Ticket 21, production/R2 action, or
generated-DOCX output was performed.

Owner-QA Must Fix (2026-07-28): FAIL on the exact reviewed QA state because
Reading passages A–D omitted the centered passage letter at each passage
start. The accepted paper also requires the letter-to-passage spacing to
follow the golden geometry rather than an approximate web margin.

Owner-QA A4-normalization repair commits:
`994430318786b60d8d97b545e221c55508271367`;
`4fc782071cf5f9587bd850598888bf7ecabfcec1`;
`9fc2afdd4b7c5edf415ed6a6a0874196b642f58b`.
Exact digest-bound golden JPEG crops were measured with Tesseract 5.5.2 TSV
word boxes. A line baseline proxy is the median lower edge of ordinary-height
nearby Latin glyph boxes; every letter distance is divided by the local
baseline step before mapping to a renderer. The observed predecessor/letter/
following ratios are A `31/32` and `31/32`, B `62/31` and `32/31`, C `63/32`
and `32/32`, and D `62/31` and `31/31`. Renderer Typography v3 normalizes these
to heading-to-letter `1`, prior-content-to-letter `2`, and
letter-to-first-passage `1`, with golden ratio tolerance `±0.05`. No JPEG
pixel is treated as a CSS pixel or converted to a PDF point.

The mapping formula is `target = golden ratio × actual rendered body baseline
step`. Screen's computed 24px step yields heading `24±1.25px`, prior content
`48±1.25px`, and following passage `24±0.75px`. Exact A4 Chromium PDF's
measured 18pt step yields heading `18±1pt`, prior content `36±1pt`, and
following passage `18±0.5pt`; the current Print/PDF route uses its visible
per-group heading as the predecessor for A–D. The complete method, crop
digests, samples, formulas, tolerances, targets, and output adjustments are
recorded in
`qa/20-reading-passage-letter-reference-measurements.json`.

Screen and Print/PDF now bind each visible Reading `groupId` to exactly one
tagged predecessor. Screen observes the predecessor's real
`data-paper-browse-anchor`; Print scopes the tagged header inside the exact
enclosing canonical Group section; PDF propagates that observed Print
binding instead of copying an expected identity. The independent
source-asset-digest-bound group-to-anchor oracle lives in
`qa/20-reading-predecessor-oracles.json`, so the verifier does not duplicate
the producer's heading-selection algorithm. Missing, duplicate, wrong-page,
wrong-tagged-group, and wrong-structural-group attacks all fail closed.
PaperSurface still rejects incomplete blocks-plus-letter companions, and
canonical signatures, question order, placement, answers, A–D Option
coordinates, v1–v12 artifacts, and non-Reading zero-occurrence behavior remain
unchanged. Manifest v13, Screen v13, and Print-PDF v14 digest closure passes.

Repair verify: canonical foundation, Reading rendered behavior, backend pilot
and focused fixes, Print renderer 92/92, PaperBrowse 193/193, app
typecheck/build, actual plain/lecture Screen plus Student/Teacher exact A4
Chromium PDF geometry, `git diff --check`, and
`pnpm -C app run verify:all` 115 PASS / 1 declared SKIP / 0 FAIL.
Ordinary Standards focused self-review: 0 findings. Ordinary Spec focused
self-review: 0 findings. No owner-QA provisioning, owner verdict, Ticket 21,
production/R2, or generated-DOCX action was taken.

Second focused-review Must Fix closure commit:
`6b1a6f8bd1584ec5d190cfecea3d5430f5dabf0e`.
Fixed point: `2c99350ebd2dfb7141f17b3ae36c225ec485e53b`.
The checked-in old-v13 fixture is the exact byte-preserved
`b137ce5ac30268e1b2e25091b093beb26d2792ff` Publication, not a v14-derived
reconstruction. Its complete filesystem inventory and Screen/Print
Consumption Plans are digest-pinned, and the real filesystem store plus
`loadPaperForConsumption` reloads it through a byte-preserved historical v13
authority closure. Current v13/v3, prior evidence, and v14/v4 bytes remain
unchanged.

Student/Teacher exact-A4 PDFs now measure the complete Reading semantic-role
adjacency graph in PDF points. Independent source-bound oracles cover A-D,
one/two-line stems, one/two/four-row and wrapped options, question and
teacher-tail transitions, same/cross-page passage continuation, and same/
cross-page Reading-D-to-next-section boundaries. Every ratio edge has a real
same-page point measurement; declared same-page edges fail on cross-page
output, and explicit page-relation edges remain separate.

Focused verify: canonical foundation and Publication, backend pilot,
`--actual-artifacts`, rendered PDF visual inspection, app typecheck/build,
`git diff --check`, and `pnpm -C app run verify:all`
115 PASS / 1 declared SKIP / 0 FAIL. Ordinary Standards + Spec review found
four actionable verifier gaps; all four were fixed in this task, and both
focused re-reviews PASS with zero remaining finding. No Owner QA provisioning,
Ticket 21, other paper-family work, production/R2 action, or generated-DOCX
output was performed.

Seven Choices Golden Geometry closure (2026-07-29):
Manifest v15 adds the renderer-owned `seven-choices-rhythm-v1` authority,
Screen v15, and Print/PDF v16 without modifying any published v1-v14 artifact.
The exact golden page-08 JPEG bytes are bound at
`d567b57e7a9372511121abcefeb66bbe45f9db152a7d8037aff247844773fe57`.
All golden coordinates remain evidence-local: vertical distances are
normalized by the nearby Latin baseline step, while bank positions are
normalized by local em or usable-content width. No JPEG pixel is treated as a
CSS pixel or PDF point, and no scale is inferred from full-page A4.

The complete Seven Choices semantic-role graph covers the preserved
Reading-D boundary, optional part/subsection/meta chrome, source-bound passage
body (the source has no standalone passage title),
paragraph and wrapped-line rhythm, inline blank markers, optional bank heading,
one-line/wrapped A-G options, Student/Teacher tails, following sections, and
same/cross-page passage and bank continuation. Independent original-PDF and
official-answer oracles attack the real PaperBrowse, `buildPrintHtml`, and
paginated-PDF producer seams. Missing, duplicate, wrong, and synchronized-
drift inputs fail before a partial artifact or fail the independent public-
seam oracle; no post-render observation object is used as adversarial input.

The horizontal golden evidence classifies one option per full remaining-width
row track: A-G labels form one fixed origin cluster, text starts are
content-driven after the label glyph plus a fixed em gap, visible right bounds
remain content-driven, and there is no distributed or space-between
placement. The golden contains only one-line options, so hanging-indent
continuation is explicitly fixture-proved with short/long/wrapped adversarial
variants rather than claimed as a golden observation. The reusable
`golden-geometry-framework-v1.md` records both measurement axes but shares no
family values or strategy with later families.

Actual public artifacts pass for plain/lecture Screen, Student/Teacher Print
HTML, Student/Teacher exact-A4 Chromium PDF, and the wrapped/cross-page A-G
variant. Visual inspection confirms one A-G bank, stable label/text starts,
wrapped hanging indents, between-option page breaks, and the bank-to-next-
section transition. Every PDF variant has an A4 MediaBox and CropBox
(`594.96 × 841.92pt`). The generated browser/process group was closed, and no
matching verifier, Vite, QA-server, or Chromium process remains.

Closure verify: canonical foundation/Publication/admission/recovery, backend
pilot and focused fixes, Seven Choices and Reading publication/rendered
behavior, Continuation rendering, generated-DOCX retirement, app typecheck,
real `--actual-artifacts`, `git diff --check`, and
`pnpm -C app run verify:all` 115 PASS / 1 declared SKIP / 0 FAIL.
Renderer Typography v4 remains byte-identical at
`ee1b93188b883cbc5bde5d409eee22ebcf9d51748b483515cfd2d80a0924b4e4`;
its Reading vertical-rhythm evidence remains byte-identical at
`3827f696fe64ee3086cb7d0b08f9e5b6a94cf01022ac2d5343d81ee743643f35`.
Commit: this bounded Seven Choices closure commit (exact HEAD is reported in
the independent-review handoff). No Owner QA provisioning, independent review,
Ticket 21/Cloze/other-family work, production/R2 action, or generated-DOCX
output was performed.

Independent-review Must Fix closure (2026-07-29):
Manifest v16, `seven-choices-rhythm-v2`, Screen v16, and Print/PDF v17
supersede only the unexecutable v15 title claim. The immutable source PDF
carries no Seven Choices title, so current authority removes
`passage_title` and `passage_title_to_body`; the misleading
`para-2026-i-seven-title` identifier remains a source identity, not title
semantics. Manifest v1-v15, Reading Typography v4, and all prior evidence
bytes remain unchanged.

The focused verifier now derives visible passage, bank, and answer expectations
from the digest-bound original PDF and official-answer JSON. Real Screen and
Print producer attacks cover missing, duplicate, wrong, and synchronized-drift
inputs. Exact A4 PDFs close same/cross-page Reading-D, same/cross-page passage,
passage-to-bank, between-option bank pagination, Student/Teacher following
section edges, label-plus-text atomicity, and hanging indents. The complete
artifact set includes plain/lecture Screen, Student/Teacher Print HTML and
baseline PDFs, wrapped/between-option PDF, full cross-page role-graph PDF, and
Teacher tail cross-page PDF.

Focused-review 22-edge coverage closure (2026-07-29):
`qa/20-seven-choices-observed-coverage-oracle-v1.json` is a checked-in
authority/evidence oracle independent of the production projector and
renderer selection logic. It binds the immutable original-question PDF,
official-answer JSON, Seven Choices golden reference, and checked-in Reading
analysis bytes. Its edge-ID set exactly equals all 22
`seven-choices-rhythm-v2` authority edges; the verifier fails closed on any
missing, extra, duplicate, or wrong-bundle edge.

The actual-artifact evidence now carries a
`seven-choices-observed-coverage-ledger-v1` ledger with exact per-edge
identities, source-text digests, measured ratios or page relations, and
atomicity observations. Its six exact bundles close 12 plain Screen edges,
12 lecture Screen edges, 12 Student Print HTML edges, 15 Teacher Print HTML
edges, 17 Student exact-A4 PDF edges, and 20 Teacher exact-A4 PDF edges; their
union is exactly the independent 22-edge oracle. Source-bound variants cover
optional chrome and bank heading collapse, passage and paragraph transitions,
zero-extra-space inline blanks, one-line and wrapped options, label-plus-text
atomicity, same/cross-page passage and bank continuation, official-answer and
checked-in explanation tails, and Student/Teacher same/cross-page following
sections. Same-passage continuation uses a dedicated real Chromium artifact
so the adversary cannot corrupt unrelated paragraph-transition measurements.

All negative cases poison source or canonical-consumption inputs before the
real PaperBrowse or Print producer runs. Invalid duplicate, missing, wrong,
and Question/Blank or bank-option inputs expose zero/failed public artifacts;
a structurally valid synchronized text drift is rejected only by the
independent source oracle. No post-render observation object is mutated.
`passage_title` and `passage_title_to_body` remain retired; manifest v1-v15,
Reading Typography v4, prior evidence, original source bytes, and official
answer bytes remain unchanged.

Rendered visual inspection confirms the source-bound Student passage and A-G
bank, the Teacher bank/answer/explanation tail, and the following section are
unclipped on exact A4 pages with stable indentation and page footers.

Focused verification passes: backend pilot, official `--actual-artifacts`,
pilot focused fixes, Seven Choices publication/rendered behavior, import
admission/recovery, app typecheck/build, `git diff --check`, and
`pnpm -C app run verify:all` 115 PASS / 1 declared SKIP / 0 FAIL. The
standalone whole-app lint command still reports the repository's existing
34 errors and 4 warnings outside this bounded CSS/renderer/verifier change;
no lint-debt files were changed. No Owner QA provisioning, Ticket 21,
Cloze/other-family work, production/R2 action, or generated-DOCX output was
performed.

Renderer version-discipline Must Fix closure (2026-07-29):
Manifest v17 adds `seven-choices-rhythm-v3`, Screen v17, and Print/PDF v18.
The successor preserves all 22 v2 semantic edges and the no-passage-title
correction while binding the visible geometry adjustments introduced at
`8bdbdd93c9e331ba92e2e44991d8bddc22bf126b`. The renderer now consumes those
Screen and Print/PDF values from the v3 authority instead of owning unversioned
CSS or template literals.

The new v3 schema closes every geometry field and exact value.
`test-fixtures/paper-canonical/seven-choices-rhythm-v3-conformance.json`
proves the valid closure and independently attacks unknown, Screen-drifted,
and Print/PDF-drifted values through schema plus semantic validation.
Manifest v1-v16, Screen v1-v16, Print/PDF v1-v17, Renderer Typography v4,
Seven Choices Rhythm v1-v2, all prior conformance/evidence bytes, original
source bytes, official-answer bytes, and the v16 no-passage-title correction
remain unchanged.

Focused verification passes the versioned authority/conformance fixture,
canonical Publication, import admission/recovery, backend pilot and focused
fixes, Seven Choices publication/rendered behavior, Print renderer 92/92,
PaperBrowse 193/193, app typecheck/build, official `--actual-artifacts`,
exact-A4 visual inspection, `git diff --check`, resource cleanup, and
`pnpm -C app run verify:all` 115 PASS / 1 declared SKIP / 0 FAIL. The
successor closure commit is the exact HEAD reported in the focused re-review
handoff. No Owner QA provisioning, Ticket 21, Cloze/other-family work,
production/R2 action, unrelated lint repair, or generated-DOCX output was
performed.
