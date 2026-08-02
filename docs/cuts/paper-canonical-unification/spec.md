# EQB Paper Canonical Unification Specification

Status: ready-for-agent
Decision frontier: proportionate-trust replacement route accepted and published
Source authority: owner authorization in delegated planning task from source thread `019fbe68-10d0-7371-9927-467af87c4d6c`

## Problem Statement

Teachers need one paper to mean the same thing on Screen, Print HTML, and PDF.
EQB already has a single canonical domain model, immutable source capture,
atomic publication, and shared consumers, but the unfinished migration route
made admission depend on universal field-level Source Span proof and repeated
the same code-level verification for every paper. That route treated each new
paper as if it changed the adapter, schema, publisher, and renderers.

This made ordinary data import disproportionately expensive without closing a
new risk. It also blurred the actual semantic trust point: deterministic code
can derive and validate an Import Candidate, but a teacher must confirm
ambiguous meaning before it becomes a Canonical Paper. The route must preserve
the hard guarantees that protect shared code and publication while removing
proof layers that duplicate an already accepted seam.

## Solution

Expose one deep canonical-import module at one external seam. Its first
operation accepts immutable source bytes plus bounded operator choices and
derives an Import Candidate and deterministic issues. Its second operation
accepts that candidate plus explicit Teacher Confirmation decisions and
returns either one complete Canonical Paper or unresolved issues. The adapter
derives all consumed semantics itself; caller-authored parsed semantics are
never authority.

Source Capture preserves the original Import File bytes, whole-file digest,
document roles, ordered observations, and any available Source Spans. Source
Spans remain valuable diagnostic and audit evidence, but are not a universal
per-field admission proof. No missing or ambiguous active content may be
fabricated. Teacher Confirmation is the semantic trust boundary and Canonical
Paper publication remains whole-paper and atomic.

An inactive, non-rendered slot may explicitly record `not_supplied` without
blocking unrelated current-surface readiness. This rule does not activate the
slot or invent content. Activating Listening later requires its own accepted
source/content contract and shared-code authority change.

Verification is proportionate to the change. A shared adapter, schema,
publication, or renderer behavior change requires authority versioning,
adversarial public-seam regression, one final full suite, and independent
Standards/Spec review. Importing another paper through an unchanged accepted
adapter is a data operation: bind source digest, run narrow deterministic
checks, obtain Teacher Confirmation, publish atomically, and perform a
risk-proportionate canary or public-surface check. It does not bump a manifest
or schema and does not require a fresh independent review or full suite per
paper.

Tickets 01–24 and their Git history remain completed evidence. The Ticket 25
commits through `76e068469071787ac24f76170e21020ff22a3fcf` are reusable partial
implementation evidence only; they are not a ready result and do not authorize
Ticket 26 or any lane. Ticket 25 is ready and unstarted; it is the next work
item under this spec.

## User Stories

1. As a teacher, I want one confirmed Canonical Paper consumed by Screen, Print, and PDF, so that every supported surface preserves the same paper meaning.
2. As a teacher, I want to see deterministic issues before confirmation, so that I can resolve real ambiguity instead of reviewing invented content.
3. As a teacher, I want my explicit confirmation to be the semantic trust point, so that automation cannot silently decide uncertain paper meaning.
4. As a teacher, I want inactive Listening content recorded honestly when it was not supplied, so that missing non-rendered content does not block the paper I can currently use.
5. As a teacher, I want Listening activation to require its own future contract, so that an inactive placeholder cannot become rendered content by accident.
6. As an import operator, I want every Import File stored with exact bytes and a whole-file digest, so that later work remains bound to immutable evidence.
7. As an import operator, I want one adapter to derive semantics from source bytes, so that callers cannot submit authoritative parsed content.
8. As an import operator, I want deterministic parsing and validation to return stable issues, so that the same inputs reproduce the same candidate and diagnostics.
9. As an import operator, I want Source Spans retained when useful for diagnosis and audit, so that disputed derivations can be inspected without making spans a universal admission ritual.
10. As an import operator, I want unresolved active content or answer conflicts to block confirmation, so that no plausible-looking fabrication becomes canonical.
11. As an import operator, I want confirmation to produce one complete Canonical Paper or no Canonical Paper, so that partial canonical state cannot leak to consumers.
12. As a release operator, I want publication to be atomic, reloadable, retry-safe, and recoverable, so that failures cannot leave mixed current state.
13. As a renderer maintainer, I want Screen, Print, and PDF to consume one canonical semantic projection, so that renderers do not reconstruct source meaning independently.
14. As a module maintainer, I want one small external interface hiding parsing, validation, provenance, and confirmation mechanics, so that fixes stay local and callers remain simple.
15. As a module maintainer, I want adversarial tests at the public seam whenever shared behavior changes, so that caller forgery and synchronized adapter mistakes are rejected.
16. As a module maintainer, I want verification strength to scale with blast radius, irreversibility, and automation authority, so that safety work is spent where it changes risk.
17. As a migration operator, I want deterministic source materialization separated from semantic confirmation, so that byte-bound mechanical work can be replayed safely.
18. As a migration operator, I want independent paper-family lanes where write surfaces do not overlap, so that safe work can proceed in parallel and integrate deterministically.
19. As a migration operator, I want representative canaries before the remaining corpus, so that publication and recovery risk is observed before broad migration.
20. As a migration operator, I want ordinary papers imported in batches through the unchanged adapter, so that repeated code-level ceremonies do not dominate data work.
21. As a reviewer, I want shared-code changes versioned, fully tested once on the final candidate, and independently reviewed, so that high-blast-radius changes retain strong proof.
22. As a reviewer, I want data-only imports checked narrowly with exact digests and confirmation evidence, so that their proof matches their actual authority.
23. As the product owner, I want a real affected-surface canary for data-only migration and full Screen/Print/PDF proof only when shared renderer behavior changes, so that visible proof matches actual risk.
24. As the product owner, I want one post-retirement Owner QA checkpoint, so that product acceptance happens on the exact reviewed state.
25. As a maintainer, I want legacy selection retired only after the fixed corpus and supported surfaces are proven, so that deletion cannot hide missing coverage.
26. As a release operator, I want repository closeout to exclude production deployment, database/config mutation, and R2 backfill, so that repository proof does not imply production authority.

## Implementation Decisions

- Preserve the single canonical domain model: Source Capture, Import Candidate,
  Teacher Confirmation, Canonical Paper, Canonical Question Groups, and one
  renderer-neutral consumption projection.
- The canonical-import module is deep. Its external interface has two
  operations equivalent to
  `importCanonicalCandidate(sourceBytes, operatorChoices) -> candidate + issues`
  and
  `confirmCanonicalCandidate(candidate, teacherDecisions) -> Canonical Paper | unresolved issues`.
  Exact code names may follow repository conventions, but no caller may supply
  authoritative parsed semantics.
- `operatorChoices` contains only bounded choices required to locate or select
  source material. It cannot contain Questions, answers, Profile structure,
  canonical groups, or other consumed semantics.
- Deterministic parsing and validation produce an Import Candidate and stable
  issues without writes. Teacher Confirmation resolves semantic issues through
  explicit decisions bound to the candidate and Source Capture digests.
- Source Capture always retains raw Import File bytes and whole-file digest.
  Source Spans are diagnostic/audit data. A field may be admitted without a
  dedicated span when deterministic derivation plus confirmation closes the
  risk; missing or contradictory active meaning still fails closed.
- Writing has two trusted-depth modes: rich new imports remain strict; frozen
  legacy JSON uses a lossless opaque mode that retains every source block,
  inline, order, and span plus explicit task identity/type and word target,
  makes no rich role, response-boundary, absence, or author-only-scope claim,
  and follows the source stream with one product-owned generic response box.
- Canonical Paper is complete or absent. Publication validates in memory,
  stages, reopens, commits atomically, reloads exactly, and preserves the
  existing retry/recovery/rollback guarantees.
- An inactive, non-rendered slot may carry the explicit state `not_supplied`.
  It creates no Canonical Question Group and does not block unrelated
  current-surface readiness. Listening activation is outside this version.
- Screen, Student/Teacher Print HTML, and direct Chromium PDF consume the same
  confirmed Canonical Paper. Generated DOCX remains retired; DOCX remains a
  supported source input.
- Authority versions change only when shared adapter, schema, publication, or
  renderer behavior changes. Per-paper bytes, confirmation decisions, and
  publication identities are data provenance, not authority versions.
- Choose the least costly mechanism that closes the observed risk. Increase
  verification with blast radius, irreversibility, and automation authority.
  Prefer one deep module over mirrored validators, and do not add a framework
  or universal proof obligation when the accepted seam, deterministic
  validation, and Teacher Confirmation close the risk.
- The remaining route uses one serial shared-seam ticket, one deterministic
  source-materialization ticket, three independent family lanes, one ordered
  integration ticket, one canary publication/recovery ticket, one remaining-
  corpus migration ticket, one shared-surface proof ticket, one legacy-
  retirement ticket, Owner QA, and repository release closeout.
- Family lanes may run in parallel only from the same accepted base and only
  when their paper-specific Source Captures, candidates, confirmation records,
  and fixtures do not overlap. Shared modules, schemas, registries, authority
  files, migration ledgers, and product publication references remain serial.
- Ticket 25 starts directly from its completed Ticket 24 predecessor. It has no
  external governance, manifest/digest, receipt, or publication-task gate.

## Testing Decisions

- Test through the two-operation external seam. Tests provide immutable bytes
  and bounded choices, then observe candidate/issues or Canonical Paper/issues;
  they do not reach into parser internals.
- Shared adapter/schema changes require adversarial cases for caller-authored
  semantic forgery, digest drift, nondeterminism, missing active content,
  conflicting answers, stale candidates, fabricated inactive content, and
  confirmation against the wrong candidate.
- Shared publication changes require public fault injection for pre-commit and
  post-commit failures, exact retry, digest conflict, reload, and rollback.
- Shared renderer changes require real Screen, Student/Teacher Print HTML, and
  direct Chromium PDF evidence with answer-visibility and semantic parity.
- Each shared behavior change runs affected narrow checks, one full suite on
  its final candidate, and one independent Standards/Spec review lineage.
- A paper imported through unchanged accepted shared behavior runs digest and
  deterministic candidate checks, confirmation completeness, atomic publish
  and exact reload, plus canary/public-surface QA proportionate to its risk.
  It does not repeat authority versioning, the full suite, or independent code
  review solely because another paper was imported.
- The fixed 33-paper denominator, zero-write invariants, no-silent-fabrication
  cases, atomicity, recovery, and Student/Teacher visibility remain mandatory.
  Unchanged shared rendering uses a light affected-surface canary; deep
  Screen/Student/Teacher Print/PDF proof is required only for a shared renderer
  behavior change.

## Out of Scope

- Active Listening content, audio timing, website consumption, or rendering.
- A website import or normalization-review UI.
- Generated DOCX output or DOCX-converted PDF.
- Production deployment, production database/configuration mutation, R2
  synchronization, and production backfill.
- Historical `versions/vN` migration beyond preserving immutable evidence.
- New paper families or schema extensions discovered outside the frozen
  denominator; those require a separately accepted shared-authority change.

## Further Notes

The earlier Tickets 25–79 remain recoverable from Git and are summarized by
one non-dispatchable supersession record. No old unfinished ticket file remains
current route authority. The current map and Ticket 25 record the direct next
step; former manifest, approval, and phase artifacts are historical evidence.
