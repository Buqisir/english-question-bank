# EQB Paper Canonical Unification Specification

Status: ready-for-agent
Decision frontier: owner scope amendment accepted; fresh to-tickets re-entry pending
Source authority: owner scope amendment plus the bound Wayfinder map and its linked closed resolutions

## Problem Statement

Teachers need one paper to preserve the same meaning, order, answers, answer
spaces, and question-family structure everywhere they consume it: PaperSurface,
Print HTML, and fixed-layout PDF. Today that promise is not enforceable. Source
evidence, normalization, paper-shape rules, family semantics, publication, and
renderer behavior are split across prose, source formats, hard-coded consumers,
and legacy assets. Existing green asset checks can therefore coexist with
visible failures such as drifting Cloze option columns and repeated Seven
Choices option banks.

The product also exposes generated DOCX as if it were a supported paper
surface, even though PDF is the only fixed-layout download EQB intends to
guarantee. Generated DOCX expands the public contract across buttons, client
calls, HTTP routes, renderer code, OOXML packaging, Consumer Contracts,
fixtures, LibreOffice conversion, and artifact QA. It also leaves an obsolete
DOCX-to-LibreOffice-to-PDF path that can be mistaken for the current PDF
capability even though draft-paper `/print-pdf` now generates PDF directly
through Chromium/Playwright. This output surface must be retired without
damaging DOCX as an immutable source-input format.

The current 33-paper `latest` corpus also contains multiple legitimate Paper
Format Profiles, source dialects, rich-content cases, writing shapes, and
known provenance gaps. Treating the corpus as one universal exam shape would
rewrite real paper meaning. Treating each renderer or importer as its own
authority would preserve the drift. The product needs a source-traceable,
renderer-neutral canonical backbone that fails closed when evidence is
missing, ambiguous, conflicting, or not representable.

This is high-risk work because it changes data contracts, source provenance,
whole-paper publication, PaperSurface consumption, Print/PDF output, public
export capability, and migration behavior. It must therefore be delivered in
bounded vertical slices with public-seam verification, actual rendered-artifact
evidence, independent review, and owner acceptance where the behavior is
visible.

## Solution

Introduce one executable authority closure and one pure whole-paper compiler
that turns immutable Source Capture evidence into either:

- one complete, renderer-neutral Canonical Paper Publication; or
- one explicit fail-closed result with a Source Capture and Normalization
  Report, but no partial Canonical Paper Plan, Canonical Question Group,
  semantic digest, publication, or store mutation.

A versioned Paper Format Profile owns each legitimate paper shape. A Canonical
Paper Plan binds one paper to one Profile and links active slots to
source-traceable Canonical Question Groups while closing deliberately inactive
source slots without inventing Groups. Each supported family has one closed
canonical variant behind a shared Group envelope. One shared semantic
projection feeds PaperSurface and Print/PDF; renderers translate that projection
but do not reconstruct paper semantics. The projection remains
renderer-neutral rather than becoming Screen- or PDF-shaped.

EQB supports exactly two output classes: Screen and Print/PDF. Print HTML is
the inspectable print representation, and Chromium/Playwright-generated PDF is
the sole fixed-layout downloadable artifact. The current draft-paper
`/print-pdf` direct-PDF route is the mainline and must not regress to DOCX
conversion. Generated DOCX is removed as a capability, not hidden: no button,
client call, HTTP route, draft/general export, renderer, OOXML packager,
DOCX Consumer Contract, DOCX-only fixture, OOXML gate, converted-PDF gate,
feature flag, placeholder, empty adapter, schema enum, or best-effort path
remains.

DOCX remains fully supported as an input source. Import file admission,
magic-byte validation, splitting, immutable Source Capture, embedded image and
shape extraction, and input-side LibreOffice use remain intact. A minimal
parse-only compatibility path is permitted only when a proved immutable
Publication still has to be read; it cannot generate DOCX or preserve a live
DOCX product capability.

Canonical artifacts are published as one immutable, integrity-closed
whole-paper unit. New imports become canonical-required only after every
required family implementation and inactive slot is available. The existing
33-paper `latest` corpus is then recaptured, compiled, reviewed, published,
rendered, and switched in fixed checkpoints. Legacy consumer interpretation is
retired family by family only after the complete fixed denominator passes.

Tickets 01–15 and their implementation, review, owner-QA, artifact evidence,
and commits remain completed historical results and are not reopened or
re-accepted. Tickets 16–71 are superseded as future route authority. Fresh
ticketing must preserve the completed baseline, replace only the unfinished
route, and leave implementation forbidden until the owner approves the new
granularity and its exact manifest digest.

### Supported output matrix

| Output class | Product contract | Required artifacts |
| --- | --- | --- |
| Screen | Supported | Real PaperSurface plain and lecture states |
| Print/PDF | Supported | Student/Teacher Print HTML and direct Chromium PDF |
| Generated DOCX | Retired | None; no live or dormant generation capability |
| User-converted PDF to Word | Not guaranteed | Outside EQB layout guarantees |

## User Stories

1. As a teacher, I want the same paper meaning on PaperSurface, Print HTML, and PDF, so that I can trust every output EQB guarantees.
2. As a teacher, I want Student Versions to hide answers and explanations on every surface, so that exported practice materials are safe to hand to students.
3. As a teacher, I want Teacher Versions to add answers and explanations without changing paper semantics or layout identity, so that my teaching copy remains aligned with the student copy.
4. As a teacher, I want Cloze A–D Options to keep stable columns across all rows, so that the exercise reads like a real exam paper rather than a drifting web grid.
5. As a teacher, I want each Seven Choices Question Group to show exactly one shared A–G bank, so that students do not see duplicated or nested banks.
6. As a teacher, I want Reading titles, paragraphs, tables, and Figures to remain in source order, so that visual and semantic evidence is not flattened or misplaced.
7. As a teacher, I want Application Writing fixed text to appear only when the source actually provides it, so that the product never invents a salutation, opening, closing, signature, or title.
8. As a teacher, I want Continuation Writing starters to match the real source and Profile, so that polluted legacy arrays or inferred starters never enter a paper.
9. As a teacher, I want writing response regions to occur once and in the same semantic place across Screen and Print/PDF, so that students receive the intended writing space.
10. As a teacher, I want Analysis to enrich a paper without changing its Questions, Options, answers, order, or canonical digest, so that teaching commentary never becomes answer authority.
11. As a teacher, I want historical paper families to retain their legitimate numbering, scoring, instructions, and section order, so that canonicalization does not rewrite them into one modern exam shape.
12. As a teacher, I want a paper with unsupported or ambiguous evidence to stop visibly instead of rendering a plausible-looking guess, so that I can review the real problem.
13. As an import operator, I want every Import File captured immutably with roles and digests, so that later normalization cannot erase what the source actually contained.
14. As an import operator, I want every canonical value to point directly to Source Spans or ordered Transformation Records, so that accepted corrections can be audited and replayed.
15. As an import operator, I want deterministic exact transformations separated from semantic-risk candidates, so that automation cannot silently change meaning.
16. As an import operator, I want missing source evidence reported as `incomplete_source`, so that the recovery action is to restore evidence rather than fabricate content.
17. As an import operator, I want clear but unrepresentable evidence reported as `unsupported`, so that the remedy is an approved contract extension rather than a nearest-match guess.
18. As an import operator, I want ambiguous boundaries, identities, markers, or Profiles reported as `needs_review`, so that a reviewer can make an explicit evidence-bound decision.
19. As an import operator, I want competing official-answer assertions reported as `answer_conflict`, so that Analysis, majority vote, or common sense cannot silently override provenance.
20. As an import operator, I want blocked compilation to write no version, database row, latest reference, or journal mutation, so that failed imports leave the published paper unchanged.
21. As an import operator, I want one complete ready Publication validated before the first store write, so that a new import can never be half canonical.
22. As a reviewer, I want every diagnostic to retain the exact evidence, authority version, and allowed recovery action, so that review decisions are bounded and reproducible.
23. As a reviewer, I want a correction to create a new Source Capture or explicit review decision rather than mutate existing evidence, so that history remains auditable.
24. As a reviewer, I want disposition queues to retain failed attempts until a new whole-paper compile is ready, so that blocked papers cannot disappear from completion accounting.
25. As a standards maintainer, I want one human index to point to one digest-closed machine manifest, so that documentation and executable behavior cannot become independent standards.
26. As a standards maintainer, I want Core Invariants, Paper Format Profiles, family contracts, Normalization Rules, source-format adapters, and renderer typography to own mutually exclusive facts, so that no rule has competing authorities.
27. As a standards maintainer, I want published authority artifacts to be versioned and immutable, so that an existing Publication can always resolve its exact contract closure.
28. As a paper-domain maintainer, I want each Canonical Paper Plan to be complete or absent, so that downstream consumers never infer missing slots or paper order.
29. As a paper-domain maintainer, I want active slots to bind exactly one Canonical Question Group and Inactive Source Slots to bind only closed source evidence, so that inactive listening is preserved without pretending to be an active website Group.
30. As a paper-domain maintainer, I want each Canonical Question Group to have exactly one option owner, so that shared banks and per-Question Options cannot be encoded simultaneously.
31. As a paper-domain maintainer, I want rich content limited to source-traceable paragraphs, rectangular tables, and Figures in v1, so that canonical semantics remain precise instead of becoming a universal document AST.
32. As a renderer maintainer, I want one shared renderer-neutral semantic projection for PaperSurface and Print/PDF, so that renderers cannot reinterpret source markers, banks, Profiles, numbering, scoring, or writing structure.
33. As a renderer maintainer, I want one A–D placement plan selected for the whole Option set, so that a late long Option cannot create a hybrid row.
34. As a renderer maintainer, I want dense A–D modes to use pinned typography and physical measurements, so that Screen and PDF choose the same four-column, two-by-two, or one-column mode.
35. As a renderer maintainer, I want unbreakable one-column overflow to fail closed, so that no renderer clips text, shrinks type, or writes a layout hint into canonical semantics.
36. As a consumer maintainer, I want one loader to validate an entire immutable Publication before exposing a Consumption Plan, so that corrupt or stale sidecars cannot leak through individually.
37. As a consumer maintainer, I want each family selected wholly canonical or through an explicit whole-family legacy capability, so that field-level and Group-level fallback cannot mix meanings.
38. As a consumer maintainer, I want retired legacy capabilities to fail hard when canonical data is unavailable, so that deleted interpretation cannot silently resurrect.
39. As a release operator, I want Publication writes to recover deterministically on either side of the database commit, so that crashes do not leave filesystem and database state divergent.
40. As a release operator, I want identical retries to be idempotent and digest conflicts to fail closed, so that recovery cannot publish different bytes under the same identity.
41. As a migration operator, I want one checked-in census to freeze all 33 `latest` inputs and their digests, so that papers cannot enter or leave the denominator silently.
42. As a migration operator, I want Profile assignment proven from source-backed whole-paper structure, so that current asset shape is a lead rather than authority.
43. As a migration operator, I want family queues cleared in the accepted order while whole-paper publication remains atomic, so that investigation can be incremental without partially switching a paper.
44. As a migration operator, I want canary papers to cover NCK1, national legacy, Zhejiang legacy, tables/Figures, inactive listening, mixed markers, and known negative cases, so that boundary risk is exercised before cohort rollout.
45. As a migration operator, I want every current `latest` paper to produce actual Screen, Print HTML, and Chromium PDF evidence before cutover, so that JSON parity cannot hide renderer failures.
46. As a migration operator, I want rollback to restore one validated prior Publication or one exact prior Consumer Contract, so that rollback never edits sidecars in place.
47. As a maintainer, I want legacy retirement to wait until the complete family denominator, queues, rendered artifacts, review, QA, and rollback proof are closed, so that deletion cannot hide missing coverage.
48. As the product owner, I want each high-risk slice independently reviewed against a fixed point, so that cross-cut contract mistakes are caught before the next slice.
49. As the product owner, I want each visible slice provisioned for real-click owner QA after review, so that product and visual acceptance uses the exact reviewed state.
50. As the product owner, I want the initiative to stop before production deployment and R2 backfill, so that repository release proof does not imply authorization to mutate production.
51. As a teacher, I want PDF to be the only fixed-layout download, so that EQB makes one clear layout promise it can actually verify.
52. As a teacher, I want draft-paper PDF to remain a direct Chromium result, so that retiring DOCX cannot silently downgrade PDF to office-suite conversion.
53. As a product maintainer, I want every generated-DOCX button, client call, and HTTP route removed, so that a retired capability cannot remain reachable or discoverable.
54. As a platform maintainer, I want generated-DOCX renderers, OOXML packaging, output contracts, fixtures, and converted-PDF checks deleted after callers are disconnected, so that unreachable implementation does not remain a shadow authority.
55. As an import operator, I want DOCX source admission, validation, splitting, Source Capture, and media extraction preserved, so that removing output support cannot break supported source ingestion.
56. As a migration operator, I want the full 33-paper compile dry run to remain zero-write, so that measured diagnostics cannot alter the frozen corpus or publication state.
57. As a planner, I want a hard measured-replan checkpoint after the full-corpus dry run, so that correction tickets are based on actual diagnostics rather than guessed volume.
58. As a planner, I want the first diagnostic cluster to be a costed pilot with review/fix budget inside about 150K context, so that later batch sizes reflect demonstrated work cost.
59. As a planner, I want canary and cohort sizes chosen from measured cost and risk, so that historical fixed batch guesses do not become accidental authority.
60. As the product owner, I want a complete old-ticket mapping and proposed total ticket count before publication, so that no replacement manifest is published without explicit granularity approval.

## Implementation Decisions

- The canonical standard uses one human-readable index, one versioned
  digest-closed machine manifest, and six mutually exclusive fact owners:
  Core Invariants, Paper Format Profiles, per-family Canonical Contracts,
  Normalization Rules, source-format adapters, and renderer typography.
  Schema validity is necessary but not sufficient; one semantic conformance
  verifier closes cross-artifact references, ownership, versions, digests, and
  compatibility.
- The supported output matrix is a product contract, not a feature flag:
  Screen and Print/PDF are supported; generated DOCX is retired. Consumer
  authority, schemas, registries, APIs, UI, fixtures, and verification must
  express only the supported matrix.
- PDF is the only fixed-layout download. The current draft-paper `/print-pdf`
  path generates PDF directly with Chromium/Playwright and is the mainline to
  preserve. Every legitimate caller of an older public PDF path must migrate
  to the current Print/PDF seam; an old DOCX-to-LibreOffice-to-PDF path with no
  caller is deleted.
- Generated DOCX retirement is capability removal. It includes user controls,
  client services and state, HTTP output routes, draft and general export
  flows, DOCX renderer code, OOXML packaging, output-side LibreOffice
  conversion, DOCX Consumer Contracts and authority refs, DOCX-only schemas or
  enums, fixtures, OOXML checks, and DOCX-converted-PDF checks. No dormant
  feature flag, hidden route, empty adapter, placeholder, or best-effort
  output is retained.
- DOCX input and DOCX output are separate responsibilities. Source-file
  whitelist and validation, splitter behavior, immutable Source Capture,
  embedded image and shape extraction, and input-side LibreOffice capability
  remain supported. Their tests must prove they do not depend on deleted
  output modules.
- The canonical projection remains renderer-neutral after DOCX output
  retirement. A future real DOCX product requirement would require a newly
  accepted Adapter against that seam; this amendment does not reserve a
  DOCX-specific interface.
- Existing immutable Publications may receive the smallest parse-only
  compatibility needed for proved reads. Compatibility cannot seal or publish
  new DOCX consumer authority, generate OOXML, or expose a DOCX output path.
- Authority changes that affect admission, semantics, paper shape,
  normalization, or renderer output create new immutable versions. A compiler
  invocation binds one exact authority closure; callers may not assemble
  "latest" pieces independently.
- `compileCanonicalPaper(request)` is the only public semantic compilation
  entry point. Its request contains immutable source documents and roles,
  operator assertions, optional prior review decisions, and one exact
  authority-manifest closure. It exposes no renderer, storage, UI, Analysis,
  source-dialect, parser, family, or Profile mode switch.
- The compiler privately captures evidence, resolves the authority closure,
  selects source-format and family adapters, applies only registered exact
  transformations, assembles the whole-paper Plan and Groups, and verifies
  semantic conformance.
- Compilation returns a whole-paper discriminated result. Only `ready`
  exposes a complete Canonical Paper Plan, all required Canonical Question
  Groups, source maps, and a semantic digest. `needs_review`, `unsupported`,
  `incomplete_source`, and `answer_conflict` expose Source Capture plus the
  Normalization Report and no partial canonical package.
- Source Capture preserves original bytes, digests, document roles,
  provenance, ordered observations, attachments, and pre-normalization Source
  Spans. It is immutable. Canonical text and structure are derived views and
  never overwrite the capture.
- Every changed canonical value or relationship requires an ordered exact
  Transformation Record with its rule version, input Source Spans, before and
  after state, target identity, and exactness proof. Heuristic or
  semantic-risk candidates remain diagnostics until an explicit review
  decision is supplied to a later compile.
- A Paper Format Profile exclusively owns reusable paper parts, sections,
  ordered slots, numbering, scoring, standard instructions, answer regions,
  and completeness. The accepted v1 set preserves distinct NCK1, Zhejiang
  legacy, and national legacy shapes.
- A Canonical Paper Plan is one complete paper-specific instantiation of one
  Profile. Each active slot binds exactly one Group; each required inactive
  slot binds a closed source slice and no Group. Group content, answers,
  Passages, Writing Tasks, rich content, Analysis, fonts, geometry, and
  pagination stay outside the Plan.
- `projectCanonicalPaper(...)` is the shared renderer-neutral semantic
  projection. PaperSurface and Print/PDF translate the same projected
  identities, order, semantics, anchors, answer regions, and placement plans.
  They do not parse source markers or infer paper facts.
- The shared Canonical Question Group envelope owns stable paper and Group
  identities, authority refs, ordered semantic content, Question/Blank refs,
  source maps, source fingerprint, semantic digest, and a closed
  family-discriminated variant.
- A Group has exactly one choice owner: `none`, `per_question`, or
  `shared_bank`. Common Questions do not carry an optional fallback option
  field. Array position is the sole intra-Group semantic order; display
  numbering remains in the Plan.
- V1 rich content is deliberately bounded to ordered paragraphs, rectangular
  semantic tables, and source-linked Figures, with literal text and semantic
  Blank refs inline. Placeholder media, flattened or nested tables,
  unresolved Figures, annotation nodes, and renderer geometry are not ready
  canonical content.
- `layoutAbcdOptionSet(optionSet)` is the one renderer-typography seam for
  Question-owned A–D sets. It uses pinned shaping and integer physical units,
  tries four columns, two-by-two, then one column for the whole set, preserves
  explicit breaks, and fails closed on unbreakable overflow. Screen/Print and
  PDF translate its single logical placement plan; layout is never
  persisted as canonical semantics or included in the semantic digest.
- Cloze and Grammar Fill remain the protocol reference only after their
  current compatibility normalization, allowlists, renderer-local fallback,
  and option-placement drift are brought behind the whole-paper compiler,
  projector, loader, and shared A–D selector.
- Seven Choices contains exactly five ordered Question/Blank pairs and one
  Group-owned A–G shared bank. Each answer joins by stable Option identity.
  Each rendered Group occurrence contains five pair anchors, seven Option
  anchors, one bank, and zero per-Question choice sets.
- Reading uses one ordered rich-content stream for paragraphs, semantic
  titles/subtitles, tables, and Figures. Reading Questions own exact A–D sets
  and official answer joins. Marker reconstruction, flattened table bridges,
  placeholder Figures, and Analysis-built structure cannot qualify as ready.
- Application Writing contains zero Questions and Blanks, one complete
  source-backed prompt, one `student_authored_only` word-count ruling, and one
  Plan-bound response occurrence. An Application Given Skeleton is either
  source-proven absent or an ordered set of source-provided title, salutation,
  opening, closing, and signature parts; genre and background text never
  prove it.
- Continuation Writing contains zero Questions, Blanks, and Options, one
  complete material stream, one `student_authored_only` word-count ruling,
  and one Plan-bound response occurrence. V1 accepts either exactly two
  ordered source starters or a Profile-compatible, source-proven plot-led
  zero-starter contract. Other or ambiguous shapes fail closed.
- Listening remains two required Inactive Source Slots covering questions
  1–5 and 6–20. Closure proves A–C Options, official answers, ten transcript
  segments, supplied timing when present, and a closed audio inventory. It
  emits no current Canonical Question Group and has zero current-surface
  occurrence. Active listening requires a future Profile version, family
  contract, compiler support, and separately accepted consumers.
- Analysis, Model Answers, Highlight Expressions, Continuation Design,
  ReviewCards, and generator audits are supplements. They may join stable
  canonical identities but cannot construct, correct, admit, digest, or alter
  paper semantics or official answers.
- One immutable Canonical Paper Publication binds an exact source asset,
  authority closure, Source Capture, complete Plan, complete Groups, and
  Normalization Report by schema, byte length, and digest. Additive sidecars
  are storage members of that unit and are not independently publishable.
- `loadPaperForConsumption(request, store)` validates one immutable
  Publication and one checked-in Consumer Contract before exposing one
  whole-paper Consumption Plan. Selection is whole-family canonical or one
  explicit whole-family legacy capability while that capability remains
  available. Group-level, field-level, renderer-local, and post-projection
  fallback are forbidden.
- Publication follows stage, manifest-last, public-loader reopen, immutable
  version rename, journaled database/latest-ref transaction, and exact
  committed reload. Pre-commit failure restores the prior state; post-commit
  recovery completes the committed target; identical retry is idempotent;
  conflicting digest identity fails closed.
- Family implementation and new-import admission are separate gates. A family
  may become available after its complete vertical slice passes, but new
  import remains closed until every required family and Inactive Source Slot
  for the target Profile is available and the particular whole-paper compile
  is ready.
- The accepted vertical order is foundation; Cloze/Grammar reference
  conformance plus A–D selector; Seven Choices; Reading; Application Writing;
  Continuation Writing; listening inactive closure; generated-DOCX output
  retirement with Print/PDF non-regression; canonical-required new import;
  frozen-corpus measurement and diagnostics-driven migration;
  family-ordered legacy retirement; release closeout.
- Tickets 01–15 are the completed accepted baseline. Their product code,
  independent-review lineages, owner-QA verdicts, artifact evidence, and
  commits remain valid and must not be rewritten or re-accepted. Ticket 15's
  DOCX and DOCX-converted-PDF artifacts remain historical completion evidence
  only; they do not define the amended product contract.
- Existing Tickets 16–71 are superseded and non-dispatchable. Fresh ticketing
  replaces the unfinished route rather than editing those tickets into a
  second authority.
- The first new route item removes generated DOCX and proves current PDF
  non-regression. If caller blast radius makes one ticket unsafe, it may be
  split into at most two consecutive tickets: first disconnect every live
  capability, then delete all unreachable output implementation. Both must
  finish before canonical import admission begins.
- After DOCX output retirement, preserve the semantic goals of Atomic Import
  Admission, Recovery/Retry/Rollback, and Backend Pilot. The Backend Pilot
  verifies only Screen and Print/PDF.
- The migration denominator is one checked-in, reproducible freeze of the 33
  current `latest` trees: 273 Groups, 1,530 objective Questions, and 1,035
  Question-owned A–D sets at the accepted census. Input addition, deletion,
  rename, or byte drift stops the migration and requires a new census.
- Migration investigation may clear evidence and review queues by family, but
  compilation, publication, cutover, and rollback remain whole-paper atomic.
  Historical version trees and existing `latest` bytes are immutable inputs;
  corrections create new evidence and a new Publication.
- Migration checkpoints begin with a frozen 33-paper corpus and a full-corpus
  zero-write compile dry run. A hard measured-replan checkpoint follows the dry
  run. No CLZ-001, RD-001, or other full correction batch is pre-created before
  that measurement.
- After measured replanning, tickets are created only from actual diagnostics,
  clustered by shared recovery mechanism and family. The first cluster is a
  costed pilot. Each ticket stays within about 150K context while reserving
  enough context for review and fixes.
- The four boundary canaries and all remaining cohort sizes are selected from
  measured cost, diagnostic shape, and risk. Historical guessed batch sizes
  are not reused as authority.
- Full-corpus semantic and artifact closure, independent review, owner QA,
  family-by-family legacy retirement, and release closeout remain required.
  Their artifact matrix contains only Screen and Print/PDF.
- The output-matrix contraction changes no canonical semantic, Source Capture,
  official-answer provenance, Transformation Record, whole-paper Publication,
  loader, atomicity, recovery, retry, rollback, or family-by-family legacy
  retirement quality requirement.
- Legacy retirement order is Cloze, Grammar Fill, Seven Choices, Reading,
  Application Writing, then Continuation Writing. Each retirement waits for
  its complete denominator, zero unresolved queues, actual rendered-artifact
  parity, rollback proof, a clean independent review lineage, full-suite
  evidence, and required owner acceptance.
- The repository release boundary is merged code plus checked-in canonical
  artifacts, green main CI, and the bounded status update. It does not include
  production deployment, production database writes, R2 synchronization, or
  production backfill.

## Testing Decisions

- Tests assert external behavior at public seams. Source-regex, class-name,
  private-helper, and implementation-shape assertions are unacceptable when a
  public result can prove the same contract.
- The primary and highest semantic seam is
  `compileCanonicalPaper(request)`. It must prove deterministic output, input
  immutability, exact authority closure, complete ready output, direct
  source-map coverage, ordered Transformation Record replay, and all four
  blocked dispositions.
- The shared projection seam is `projectCanonicalPaper(...)`. It must prove
  one semantic, anchor, order, answer-region, and occurrence signature for
  PaperSurface and Print/PDF without renderer reconstruction.
- The publication and consumption seam is the whole-package publisher plus
  `loadPaperForConsumption(...)`. It must prove complete validation,
  whole-family selection, stale/corrupt rejection, retired-legacy hard
  failure, no partial exposure, crash recovery, retry identity, and rollback.
- The A–D typography seam is `layoutAbcdOptionSet(...)`. It must prove shared
  mode, row, column, order, and physical placement across Screen/Print, actual
  PDF for the accepted four-column, two-by-two, and one-column gold
  cases, the 15-row Cloze case, corpus boundary cases, and a synthetic
  unbreakable overflow.
- Dense A–D modes must not wrap. Point placement must remain within 1pt of the
  shared physical plan, and the 15-row Cloze same-column spread must remain
  within 0.5pt. A mode mismatch, hybrid row, clipping, or type shrinking is a
  failure.
- Family tests use canonical-only invented or redacted fixtures with no
  legacy markers, fallback fields, or Analysis, plus the hash-bound real proof
  candidates selected by the Wayfinder decisions.
- Seven Choices tests count occurrences and stable anchors in actual
  PaperSurface and Print/PDF output. They must reject the reproduced
  fivefold A–G bank projection, any per-Blank choice layer, nested banks, and
  bank duplication across page breaks or teacher supplements.
- Reading tests cover prose-only and table/Figure-bearing Groups, all three
  A–D modes, heading ambiguity, missing media, native table geometry,
  Analysis independence, and rejection of the flattened-marker/placeholder
  bridge.
- Application Writing tests cover source-provided fixed parts,
  source-proven absence, complete prompt semantics, one response occurrence,
  bad fixed-part order, missing or conflicting word rulings, inferred
  skeleton rejection, and supplement intrusion.
- Continuation Writing tests cover exact two-starter and Profile-compatible
  plot-led zero-starter contracts, one response occurrence, polluted
  three-entry data, unproven empty starters, wrong Profile/cardinality, and
  supplement intrusion.
- Listening inactive tests prove complete 5+15 source closure, 20 official
  answers, ten transcript segments, supplied or demonstrably absent timing,
  closed no-audio or opaque-audio inventory, complete Plan participation,
  zero Groups, and zero occurrence on every supported current surface.
- Generated-DOCX retirement tests begin at public capability seams. They prove
  the absence of user controls, client calls, live HTTP routes, draft/general
  export entry points, consumer ids/contracts, schemas/enums, renderer and
  OOXML packaging entry points, output-side LibreOffice conversion, DOCX-only
  fixtures, OOXML checks, and converted-PDF checks. A source-regex inventory is
  supporting evidence, not a substitute for behavioral route and UI proof.
- PDF non-regression tests exercise the current Print/PDF seam and prove that
  draft `/print-pdf` still returns direct Chromium/Playwright PDF bytes without
  invoking DOCX generation or LibreOffice. Every surviving public PDF caller
  must resolve to that supported seam.
- DOCX input regression tests exercise the import whitelist, file/magic-byte
  validator, splitter, immutable Source Capture, embedded image/shape
  extraction, and required input-side LibreOffice path without importing any
  deleted output implementation.
- New-import tests call the public publisher and compare all relevant store
  state byte-for-byte before and after blocked results. No blocked case may
  create a database row, version, latest reference, published report, or swap
  journal entry.
- Publication failure tests inject faults before and after commit, simulate
  process restart, prove exact recovery authority, prove idempotent identical
  retry, reject conflicting retry, reject stale load, and restore a validated
  prior Publication.
- Migration tests freeze and recalculate the 33-paper denominator. Accounting
  must close across paper, Profile, family, disposition, Publication,
  rendered surface, and retirement views; a blocked paper never leaves the
  denominator.
- All 33 papers require automated actual-artifact verification: real-click
  plain and lecture PaperSurface state, Student and Teacher Print HTML and A4
  Chromium PDF. No DOCX, OOXML, or DOCX-converted-PDF artifact is generated.
  JSON-only parity is insufficient.
- Surface checks cover semantic and anchor parity, Student/Teacher answer
  visibility, duplicate banks, native table/Figure placement, response-region
  placement, pagination, clipping, and renderer independence from Analysis.
- A visible vertical slice requires an independent review lineage against its
  implementation fixed point and real-click owner QA on the exact reviewed
  state. Owner QA covers only real Screen, Print HTML, and Chromium PDF.
  Listening inactive substitutes actual zero-occurrence artifacts on those
  supported outputs for invented UI QA.
- Each slice runs the narrowest focused behavioral checks, the relevant app
  build, `git diff --check`, and the full registered suite required by its
  risk. Literal `PASS`, declared `SKIP`, and `FAIL` accounting is preserved;
  an undeclared failure or unknown skip blocks advancement.
- Prior art is the accepted canonical-foundation behavioral suite, the
  existing paper-asset consistency and schema gates, the reviewed writing
  workflow fixtures, the current Screen/Print-PDF export verifiers, and the
  closed Wayfinder prototype observations. Prototype code is not production
  code and is not itself a passing implementation test.

## Out of Scope

- A stable `paper-asset-v2` replacement for the additive canonical
  Publication sidecars.
- On-demand canonical compilation of historical `versions/vN`; the first
  migration covers only the frozen current `latest` corpus.
- An active listening Canonical Question Group, audio timing/alignment model,
  playback, current-surface renderer, or listening Analysis pipeline.
- A website import UI or website normalization-review console. Content
  production and durable review remain backend/agent-operated.
- New paper families, unsupported question types, other subjects, or rich
  content beyond the accepted v1 paragraph/table/Figure contract.
- In-place modification of Source Capture, current `latest`, historical
  versions, published authority artifacts, or Canonical Paper Publications.
- Source or answer fabrication, Profile guessing, regex deletion of ambiguous
  markers, majority-vote answer correction, or Analysis-derived paper
  semantics.
- Paper/Group allowlists, runtime canonical flags, partial Publications,
  field fallback, Group fallback, renderer-local legacy selection, or
  resurrection of retired compatibility.
- Retirement, weakening, or redesign of DOCX source ingestion, including its
  whitelist, validator, splitter, Source Capture, embedded image/shape
  extraction, and input-side LibreOffice needs.
- Any generated-DOCX compatibility surface, hidden DOCX output route, feature
  flag, empty adapter, placeholder, best-effort output, or pre-reserved
  DOCX-specific interface.
- A future generated-DOCX product. A real future need must start a new product
  decision and new Adapter from the renderer-neutral projection.
- Layout guarantees for a Word document produced when a user independently
  converts an EQB PDF.
- Production deployment, HK host changes, production database writes,
  production configuration changes, R2 synchronization, or production
  backfill.

## Further Notes

- The durable decision source is the
  [bound Wayfinder map](wayfinder/map.md) and its linked closed resolutions.
  The [phase receipt](phase-transition.md) owns provenance, current route, and
  implementation gates. If this synthesis is ambiguous, those bound
  authorities control; historical handoffs and retired tickets do not.
- The accepted census begins at 33 `latest` papers, 273 Question Groups, 1,530
  objective Questions, and 1,035 A–D sets. Family closure includes 33 Cloze
  Groups / 570 Questions; 33 Grammar Fill Groups / 330 Questions; 33 Seven
  Choices Groups / 165 Blanks / 33 A–G banks; 126 Reading Groups / 465
  Questions; 24 Application Writing Tasks; 24 Continuation Writing Tasks; and
  one listening paper with two Inactive Source Slots.
- Tickets 01–15 remain accepted completed history. Their implementation,
  reviews, owner QA, commits, and exact artifacts are preserved; the DOCX
  evidence produced through Ticket 15 proves what those tickets completed at
  the time and is not a future product contract.
- Current Tickets 16–71 and their manifest are superseded as unexecuted route
  authority. They remain historical planning evidence until fresh ticketing
  publishes an owner-approved replacement; they may not coexist with the new
  route as dispatch authority.
- This amendment does not rerun Wayfinder, create a parallel initiative,
  approve ticket granularity, authorize product implementation, or dispatch
  Ticket 16.
- The only next phase after this accepted spec is a fresh `to-tickets` task.
  Before publishing any replacement ticket or manifest, that phase must show
  the owner every proposed Title, Blocked by edge, What it delivers statement,
  old-ticket mapping, and the proposed total ticket count, then wait for
  explicit approval. Only the approved set may be published and digest-bound
  to this spec. Implementation remains forbidden until the owner separately
  commits approval of the exact new manifest digest.
