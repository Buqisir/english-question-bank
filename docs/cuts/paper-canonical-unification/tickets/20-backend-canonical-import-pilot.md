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

Cloze Golden Geometry pre-QA repair closure (2026-07-29):
Manifest v18 adds the immutable `cloze-rhythm-v1` authority, its exact schema
and conformance fixture, Normalization Report v18, Publication v18, Screen
v18, and Print/PDF v19. Manifest v1-v17 and all earlier consumer, renderer,
family, evidence, source, and official-answer bytes remain immutable and
resolvable; the v18 projected-occurrence integrity digest is added only to
new v18 Cloze Consumption Plans, so exact old-v13 reload bytes remain
unchanged. Generated DOCX remains retired.

`qa/20-cloze-source-oracles-v1.json` independently binds the immutable
original-question PDF, canonical paper asset, official answers, and reviewed
Cloze Teacher analysis. `qa/20-cloze-golden-geometry-reference-measurements-v1.json`
binds the page-09 golden JPEG and records only dimensionless measurements:
vertical gaps use a local Latin baseline/font proxy, horizontal positions use
local em or usable-width ratios, and no JPEG pixel is mapped to CSS px, PDF
pt, or an inferred A4 scale.

`qa/20-cloze-observed-coverage-oracle-v1.json` publishes the complete
26-edge Cloze adjacency/alignment graph before renderer observation. Its six
exact bundles cover plain and lecture Screen, Student and Teacher Print HTML,
and Student and Teacher exact-A4 Chromium PDF. Required variants include
baseline, long/wrapped options, same-passage cross-page continuation,
choice-block pagination, and same/cross-page transition to the source-bound
following Grammar Fill section. Every bundle fails closed on a missing,
extra, duplicate, or wrong edge; the observed union must exactly equal the
independent oracle set.

The public proof binds the preceding Seven Choices Group identity; source
part/section/instruction chrome and order; four source paragraph identities;
all 15 Question/Blank pairs; 3.3em-class centered atomic blanks with
punctuation outside and zero phantom vertical space; passage and paragraph
rhythm; the passage-tail edge; Questions 41-55; fixed A/B/C/D origins with
104pt Print text-start pitch, stable label/text anchors, equal fixed tracks
and no distributed/hybrid shrink strategy; wrapped hanging continuations;
row atomicity and pagination; all 15 official Teacher answers and reviewed
explanations; and the following section identity. PDF text is reconciled
through page/baseline/x geometry where Poppler content-stream order differs
from visible line order, without weakening exact source-text checks.

Duplicate/missing/wrong Group identity, wrong Question/Blank joins, and
source option drift are poisoned before PaperBrowse or Print rendering. New
v18 Cloze Consumption Plans carry digest-bound projected occurrences, so a
post-loader text mutation is rejected before a public artifact exists. The
independent source/golden oracle remains outside the production projector,
DOM order, and renderer output; no failure is manufactured by changing a
post-render observation.

Focused verification passes canonical foundation/Publication,
admission/recovery, Cloze/Grammar publication and consumption, PaperBrowse
193/193, Continuation and Seven Choices/Reading regressions, Print renderer
92/92, generated-DOCX retirement, app typecheck/build, the official backend
pilot, `git diff --check`, and `pnpm -C app run verify:all`
115 PASS / 1 declared off-repo SKIP / 0 FAIL. The official
`--actual-artifacts` command writes the six public artifacts plus Cloze
baseline/wrapped/cross-page variants under
`.scratch/paper-canonical-ticket-20-qa/<exact-HEAD>/`; it does not start the
Owner-QA server. No Owner QA provisioning, Grammar Fill/Writing/Listening
implementation, Ticket 21, production/R2 action, unrelated lint repair, or
generated-DOCX output was performed.

Cloze focused-review Must Fix closure (2026-07-29):
The observed ledger is now populated only by edge measurements returned from
the real Screen, Print HTML, or exact-A4 PDF artifact assertion. Each required
bundle/variant resolves an explicit checked-in edge profile; its actual set
must exactly equal that independent profile, while every bundle union and the
complete public union still close the 26-edge authority exactly. PDF evidence
records source identities/text, baseline ratios, fixed x anchors, label/text
gaps, four-track origins, hanging continuations, row/page relations, and
Student/Teacher tail transitions from Poppler bbox geometry rather than
manufacturing expected edge IDs.

All Cloze adversaries now enter before the public producer. The immutable
source D-option is repeated to exercise natural fixed-track wrapping; each
source D-option is repeated for choice-block pagination; an immutable source
passage sentence is appended for same-passage continuation; and producer
`page_break` blocks exercise the two family-boundary transitions. The
source-oracle bytes declare the exact identities, derivations, and repeat
counts. Screen receives the redigested v18 Consumption Plan at its public API
seam, while Print HTML/PDF receive the same redigested Plan and source-matched
detail input. No Cloze CSS is injected after producer output.

The Cloze-specific layout selector retains one 0/104/208/312pt A/B/C/D track
plan for soft-wrapping content and fails closed on hard breaks, unsupported
glyphs, or an overwide unbreakable token. Screen and Print keep label-plus-text
atomic and hang continuation lines at the text-start anchor; they never fall
back to one-column, two-by-two, distributed, or hybrid shrink layout for the
Cloze family.

New v18 Plans must carry the exact projected-occurrence digest set; deleting
it or mutating an occurrence is rejected before rendering. Print Cloze chrome
is read only from the immutable Publication-bound source asset version and
its bound digest. A poisoned mutable `latest` asset cannot affect output, and
a poisoned immutable version fails closed. Teacher HTML and PDF compare every
Question explanation to the independently reconstructed reviewed-analysis
text; an explanation poisoned before rendering is rejected by the oracle.

The no-envelope compatibility path now accepts only the exact byte-pinned
old-v13 Consumption Plan digest; deleting both v18 authority and occurrence
digests while poisoning source text fails closed. Old-v13 Screen and Print
plans retain their original bytes and still project the Cloze selection.
Teacher HTML and PDF require every answer line to equal the official-answer
text exactly, and a pre-producer answer poison is rejected.

PDF passage evidence excludes only measured non-body header/footer lines,
then asserts every remaining same-page internal passage step rather than
filtering to conforming samples. Inline-blank zero-space values are measured
from the real glyph-to-line baseline offset. Teacher row rhythm carries
non-empty observed ratios and A-D baseline deltas, and every same-page
Cloze-to-following-section transition is checked against its versioned
two-step authority before entering the ledger.

Focused red-green checks pass the backend pilot, A-D layout, Cloze/Grammar
publication and consumption, Print renderer 92/92, and PaperBrowse 193/193.
The complete exact-HEAD verification, official `--actual-artifacts` evidence,
exact-A4 inspection, full `verify:all`, cleanup, and final commit are recorded
by the focused review handoff. No Owner QA provisioning or out-of-scope family,
Ticket 21, production/R2, or generated-DOCX action was performed.

Cloze Golden Geometry failed-review Must Fix closure (2026-07-29):
Because the committed v1/v18 authority bytes are immutable, manifest v19 adds
the standards-compliant `cloze-rhythm-v2` successor without changing any
renderer value. Its schema closes the complete payload exactly, including all
26 edge fields, target tolerances, Golden Geometry/reference digests, fixed
four-track strategy and coordinates, blank geometry, and every renderer-owned
semantic. Conformance redigests the manifest descriptor after each payload
poison and rejects the named ratio, endpoint, tolerance, framework, reference,
alignment, missing, duplicate, and extra-field attacks, plus programmatic
deletion of every field and mutation of every leaf.

The Cloze projector now resolves the exact registered authority. Only the
byte-pinned old-v13 Consumption Plan digest may use the historical no-envelope
route; a current Plan carrying a real v17 authority reference with stripped
occurrence digests and a poisoned option is rejected at direct projection,
Screen, and Print seams without mutating the input. Exact old-v13 public reload
and byte shape remain accepted.

PDF passage evidence derives its body seam from each measured page and the
versioned Print margins. It records every remaining body line, including
one-word lines, and every same-page internal step with exact source identity,
text digest, coordinates, and page relation; missing, duplicate, or unmeasured
steps fail closed. Official actual-artifact evidence records 220 body lines and
184 same-page internal steps. Student and Teacher PDFs remain exact A4
(`594.96 × 841.92 pt`), with 8 and 13 pages respectively.

Focused authority, historical publication, Cloze consumption, admission,
recovery, pilot, renderer, PaperBrowse, app typecheck/build, and Continuation
checks pass. The official `--actual-artifacts` pilot passes, and
`pnpm -C app run verify:all` reports 115 PASS / 1 declared off-repo SKIP /
0 FAIL. This bounded commit also passes `git diff --check`; its exact-HEAD
rerun and artifact path are reported in the focused review handoff. No Owner QA
provisioning or out-of-scope family, Ticket 21, production/R2, generated-DOCX,
or unrelated lint action was performed.

Grammar Fill Golden Geometry pre-QA repair closure (2026-07-29):
Manifest v20 adds the immutable `grammar-fill-rhythm-v1` authority, its exact
schema and conformance fixture, Normalization Report v20, Publication v20,
Screen v20, and Print/PDF v21. Manifest v1-v19, every earlier consumer,
renderer, family, schema, conformance, source, official-answer, analysis, and
evidence byte remain unchanged and resolvable. Exact historical v13 projection
remains byte-pinned and accepted; generated DOCX remains retired.

The independent source oracle binds the 2026-I original-question PDF
(`31a87069...`, page 10), versioned Paper Asset (`fe7feb2c...`), official
answers (`17502bb7...`), and reviewed Grammar Fill Teacher analysis
(`9d283190...`). The golden-reference record binds
`page-10-grammar-fill.jpeg` (`667e97aa...`) and uses only dimensionless
measurements: vertical distances are normalized by local Latin baseline/font
proxies and horizontal distances by em or usable-width ratios. No reference
pixel is converted to CSS px, PDF pt, or inferred A4 scale.

The checked-in independent coverage oracle publishes the complete 32-edge
Grammar Fill semantic-role graph before renderer observation. Its required
bundles are plain and lecture Screen, Student and Teacher Print HTML, and
Student and Teacher exact-A4 Chromium PDF. Actual variants cover baseline,
sentence-start, sentence-internal, line-end, wrapped-line, same-passage,
passage-cross-page, preceding Cloze-boundary, and same/cross-page Application
Writing transitions. Each bundle's observed edge set must exactly equal its
independent required set, and the public union must equal all 32 edges without
missing, extra, or duplicate observations. Every ledger row carries measured
DOM/PDF/source identities, source-text digests, ratios, x relations, or page
relations as applicable; PDF body evidence excludes only measured page/body
seams.

The public projection preserves the exact visible/source order of Questions
and Blanks 56-65. Every blank is a centered, no-dot, 3.3em-class atomic unit
with source spaces on both sides, punctuation outside, zero phantom vertical
space, and no line/page split. Prompted blanks bind the exact source prompts
`hold`, `frequent`, `be`, `necessity`, `draw`, `head`, and `cheap`; unprompted
58, 61, and 63 remain prompt-free. Prompt attachment and following-text
spacing are measured, and Screen/Print render no duplicate or detached prompt.

The shared public Print source-binding loader reopens the immutable Publication
Source Capture, versioned Paper Asset, official-answer artifact, and
digest-pinned reviewed analysis before rendering. Student artifacts omit
answers and explanations without phantom space. Teacher artifacts bind all ten
official answers and reviewed explanations, including same/cross-page
transition to the source-bound Application Writing heading. Source text,
Blank identity, Blank order, prompt text, prompt attachment, answer,
explanation, authority envelope, missing integrity, and stale digest are ten
independent pre-producer poison cases; every case rejects and records zero
public artifact.

Focused authority, conformance, historical Publication/projection, source
binding, import admission/recovery, pilot, Print renderer 92/92, PaperBrowse,
app typecheck/build, official `--actual-artifacts`, and `git diff --check`
pass. The six public bundles and adversarial exact-A4 PDFs measure
`594.96 × 841.92 pt`; visual inspection confirms unclipped Student passage and
blanks, Teacher answer/explanation continuation, and the following Writing
section. `pnpm -C app run verify:all` reports 115 PASS / 1 declared off-repo
SKIP / 0 FAIL. The closure commit, exact-HEAD rerun, HEAD-scoped artifact path,
and independent Standards + Spec review verdict are reported in the fresh
review handoff. No Owner QA provisioning, Application/Continuation Writing
implementation, inactive Listening work, Ticket 21, production/R2 action,
unrelated lint repair, or generated-DOCX action was performed.

Grammar Fill Golden Geometry focused-review Must Fix closure (2026-07-30):
The first independent Standards + Spec review of `af64b7c5` found four bounded
proof defects: Screen retained renderer-local `24px` and `0.5em` truths;
golden v1 incorrectly classified Question 63 as prompted; the ledger selected
wrapped/line-end roles by content shape and recorded literal zero values; and
PDF body exclusion used fixed A4 ratios instead of artifact-measured seams.
Because Manifest v20, rhythm v1, its schemas/consumers, and the accepted v1
measurement were already committed, none of those bytes was rewritten.

Manifest v21 is the complete successor closure: `grammar-fill-rhythm-v2`, its
exact schema and conformance fixture, Normalization Report v21, Publication
v21, Screen v21, Print/PDF v22, migration record, current consumer/loader
registration, and immutable-request fixture all bind one digest-closed
authority. Screen now receives the rhythm-owned baseline and prompt gap as
CSS custom properties at both PaperSurface and PaperBrowse roots. Historical
v1-v20 authorities and consumers, including the exact v13 compatibility
route, remain resolvable; generated DOCX remains retired.

The preserved golden v1 bytes are referenced by corrected golden v2. Golden
v2 classifies prompted 56, 57, 59, 60, 62, 64, and 65 and unprompted 58, 61,
and 63, exactly matching the immutable source oracle and runtime authority.
Both focused authority verification and the official pilot now cross-check
those sets, so source/golden prompt-identity disagreement fails closed before
any producer or public rendering.

The source-bound adversary declares q56 as the wrapped Blank and q58 as the
line-end Blank. Its widths are expressed only as local em-class proxies:
40em for the q56/q58 paragraphs and 17em for the source-derived cross-page
continuation; no golden pixel is converted to CSS px, PDF pt, or A4 scale.
All six public bundles execute exact q56 and q58 identities. Student and
Teacher PDF passage-cross artifacts continue from pages 4→5 and 6→7,
respectively, and record `blank-2026-i-058` as the line-end Blank.

Same-passage Screen/Print-HTML evidence now records one actual adjacent
same-paragraph line pair, its DOM centers, local baseline ratio, and continuous
public-flow relation; it no longer declares a multi-page array to be same
page. Blank phantom height, unprompted prompt contribution, Student supplement
absence, answer/explanation counts, and poison artifact counts are computed
from DOM rectangles, queried node sets, and before/after directory listings.
The observed zero values are therefore measurements, not literals or oracle
bookkeeping.

Every PDF page derives its body seam from the actual first/last body lines and
the bottom-most measured footer line. The ledger records top/bottom seam
coordinates, first/last body centers, footer center, footer text, and footer
text digest; fixed `21/297` and `24/297` filters are removed. Required
observed sets still equal the independent 32-edge oracle exactly, and every
poison case records an actually empty artifact-name set before and after the
rejected producer call.

Focused authority/conformance, admission, recovery, historical Publication,
Grammar Fill surface/Print, Continuation regression, and generated-DOCX
retirement checks pass. The official actual-artifact pilot passes with six
public bundles, 32 closed edges, ten pre-producer poison rejections, and exact
A4 `594.96 × 841.92 pt` PDFs. Visual inspection confirms unclipped baseline
Student blanks, Teacher answer/explanation continuation, q58 line-end,
cross-page continuation, and the Application Writing transition. Full
`pnpm -C app run verify:all` reports 115 PASS / 1 declared off-repo SKIP /
0 FAIL, and `git diff --check` passes. No Owner QA, out-of-scope writing or
listening implementation, Ticket 21, production/R2, unrelated lint, or
generated-DOCX work was performed.
