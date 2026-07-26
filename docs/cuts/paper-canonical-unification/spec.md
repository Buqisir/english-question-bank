# EQB 试卷 Canonical 大一统实施规范

Status: historical Wayfinder synthesis; not accepted for current dispatch
Decision fixed point: `19ffc7744c656b526f55934c8c73e245acf7323f`
Wayfinder map: `docs/cuts/paper-canonical-unification/wayfinder/map.md`
Current phase receipt:
`docs/cuts/paper-canonical-unification/phase-transition.md`

This draft and its original ticket set are retained as historical planning
evidence. Ticket 01 was completed and accepted from it; Tickets 02–29 are not
dispatchable unless a fresh explicit to-spec/to-tickets sequence supersedes or
re-approves them through the phase receipt.

## Outcome

Every currently supported high-school English paper family passes through one
source-traceable, renderer-neutral canonical backbone before Screen,
Print/PDF, or DOCX consumes it.

This cut is complete only when:

- one executable authority closure owns paper/profile/family/normalization/
  typography facts without duplicated rulings;
- new imports can publish only one complete Canonical Paper Publication or
  write nothing;
- all 33 frozen `latest` papers have source/answer/Profile closure, atomic
  canonical Publications, shared-loader selection, and actual
  Screen/Print-PDF/DOCX parity;
- every in-scope disposition queue is empty and all accepted corrections have
  Source Span or Transformation Record lineage;
- legacy consumer interpretation is retired in the accepted family order,
  only after its fixed denominator is fully canonical;
- all required independent review lineages, owner QA, release checks, merge,
  and `main` CI are complete.

## Decision authority

This spec is an implementation index, not a second store of the Wayfinder
answers. If a summary below is ambiguous, the linked closed resolution owns
the decision.

| Contract area | Closed authority |
| --- | --- |
| Current authority gaps | [审计现有试卷标准的权威、缺口与矛盾](wayfinder/tickets/01-audit-current-authorities.md) |
| Frozen corpus and failure census | [盘点全库 latest 资产与所有生产消费变体](wayfinder/tickets/02-census-assets-producers-consumers.md) |
| Human index, machine manifest, and six fact owners | [确定模块化试卷标准与机器权威结构](wayfinder/tickets/03-executable-standard-authority.md) |
| Immutable evidence, lineage, exact transformations, dispositions | [定义 Source Capture 与清洗留痕合同](wayfinder/tickets/04-source-capture-normalization-ledger.md) |
| Pure whole-paper compiler seam | [设计 canonical compilation 深模块接口](wayfinder/tickets/05-canonical-compilation-module-interface.md) |
| Profile, Plan, slots, and shared projection | [定义卷型模板与整卷装配单合同](wayfinder/tickets/06-paper-format-profile-and-plan.md) |
| Shared Group envelope and rich content | [定义题组通用 envelope 与 rich content nodes](wayfinder/tickets/07-rich-content-and-group-envelope.md) |
| Shared A–D placement plan | [定义 A–D 选项整组择形算法与金样卷 parity](wayfinder/tickets/07a-abcd-option-layout-selector.md) |
| Seven Choices variant | [定义七选五 canonical variant 与双卷 proof 合同](wayfinder/tickets/08-seven-choices-canonical-variant.md) |
| Reading variant | [定义阅读 canonical variant 与图表 proof 合同](wayfinder/tickets/09-reading-canonical-variant.md) |
| Application Writing variant | [定义应用文 canonical variant 与 given skeleton 合同](wayfinder/tickets/10-application-writing-canonical-variant.md) |
| Continuation Writing variant | [定义读后续写 canonical variant 与 starters 合同](wayfinder/tickets/11-continuation-writing-canonical-variant.md) |
| Listening inactive closure | [定义听力 raw/inactive 插槽与未来 activation seam](wayfinder/tickets/12-listening-raw-inactive-slot.md) |
| Publication, consumer selection, recovery | [定义原子 sidecar 发布、consumer selector 与回滚合同](wayfinder/tickets/13-atomic-sidecars-and-consumer-selector.md) |
| New-import order and hard gates | [制定新导入 hard gate 与逐题型竖切路线](wayfinder/tickets/14-new-import-rollout-and-gates.md) |
| 33-paper migration and retirement | [制定 33 套 latest 存量迁移与 legacy 退役计划](wayfinder/tickets/15-latest-migration-and-legacy-retirement.md) |

The linked research and prototype assets remain design evidence. Production
code must implement their selected contracts, not depend on prototype code or
turn research observations into authority.

## Canonical architecture

### One executable standard closure

`docs/product/exam-paper-format-standards.md` becomes the sole human index and
points to one current `standards/paper-canonical/manifest-v1.json`. The
manifest binds exact versions and digests for:

- Core Invariants;
- NCK1, Zhejiang legacy, and national legacy Paper Format Profiles;
- per-family Canonical Contracts;
- Normalization Rules;
- Renderer Typography Rules;
- their schemas, pure rule implementations, fixtures, and semantic
  conformance verifier.

Core, Profile, Family, Normalization, Source Adapter, and Renderer Typography
facts have mutually exclusive ownership. Callers may not rebuild a second
standard from docs, private constants, source format, renderer behavior, or
Analysis.

### One immutable evidence compiler

The only public semantic entry point is the pure
`compileCanonicalPaper(request)`. Its request supplies immutable source
documents/roles, explicit operator assertions, optional prior review
decisions, and one exact authority-manifest closure. It does not accept
Profile, family, parser, dialect, renderer, storage, caller-mode, or Analysis
choices.

The compiler privately:

1. creates Source Capture observations and pre-normalization Source Spans;
2. resolves the exact authority closure and source-format adapters;
3. applies only registered, exact, ordered Transformation Records;
4. assembles one complete Canonical Paper Plan and every required Canonical
   Question Group;
5. verifies cross-artifact semantic conformance;
6. emits a Normalization Report, source maps, fingerprints, and semantic
   digests.

Only `disposition: ready` exposes the complete Plan and Groups.
`needs_review`, `unsupported`, `incomplete_source`, and `answer_conflict`
expose Source Capture plus Normalization Report and no Plan, Group, semantic
digest, partial publication, or store mutation.

### Renderer-neutral Plan and Groups

A versioned Paper Format Profile exclusively owns paper parts, sections,
ordered slots, numbering, scoring, standard instructions, answer regions, and
completeness. A complete Canonical Paper Plan binds one Profile to one paper:
each active slot references exactly one Group, while required
`inactive_source` slots reference closed source slices and no Group.

`CanonicalQuestionGroupArtifactV1` is a closed shared envelope with
family-discriminated variants, source maps, stable identities, ordered
semantic content, and exactly one choice owner: `none`, `per_question`, or
`shared_bank`. Ordered paragraph, rectangular semantic table, and
source-linked Figure are the only v1 rich-content blocks.

`projectCanonicalPaper(...)` is the shared semantic seam for all current
renderers. Renderers may translate the resulting semantic and placement
plans, but may not parse source markers, infer profiles, reconstruct banks,
tables, figures, skeletons, starters, numbering, scoring, or answers.

### Atomic Publication and consumption

One immutable Canonical Paper Publication binds the exact source asset,
authority closure, Source Capture, complete Plan, complete Groups, and
Normalization Report by schema, byte length, and digest.

`loadPaperForConsumption(request, store)` validates one immutable publication
and one checked-in Consumer Contract before emitting a whole-paper
Consumption Plan. Selection is whole-family canonical or an explicit
whole-family legacy capability while that capability remains `available`.
Group/field fallback, `canonical ?? legacy`, renderer-local selection, and
fallback after projection begins are forbidden.

Publication uses stage → manifest-last → reopen/validate → immutable version
rename → journaled SQLite/latest-ref transaction → exact committed reload.
Pre-commit failure restores the old state; post-commit recovery completes the
target publication; identical retry is idempotent; digest conflict fails
closed.

## Family contracts

- **Cloze / Grammar Fill reference**: move the existing protocol evidence
  behind the whole-paper compiler and shared projector. Remove proof-only
  allowlists, compatibility normalization, and renderer-local fallback before
  treating the pattern as reusable.
- **A–D choices**: `layoutAbcdOptionSet(optionSet)` emits one logical 4-column,
  2×2, or 1-column placement for the whole A–D set using pinned shaping and
  integer twips. All renderers translate the same plan; layout never enters
  canonical semantics or semantic digest.
- **Seven Choices**: exactly five ordered Question/Blank pairs reference one
  group-owned A–G bank. Every rendered Group occurrence has one bank, seven
  Option anchors, and zero per-question choice sets.
- **Reading**: one ordered rich-content stream owns paragraphs, semantic
  headings, tables, and figures; Questions own exact A–D sets. Flattened
  table/figure bridges and marker reconstruction cannot qualify as ready.
- **Application Writing**: zero Questions/Blanks; one complete source-backed
  prompt and one response region. A Given Skeleton is either source-proven
  absent or ordered source-provided title/salutation/opening/closing/signature.
  Genre and background text never prove a skeleton.
- **Continuation Writing**: zero Questions/Blanks/options; one complete
  material stream and one response region. Current contracts are exactly
  two source starters or a Profile-compatible, source-proven plot-led zero
  starter case.
- **Listening**: current v1 has two required inactive source slots for q1–5
  and q6–20. Evidence closure includes questions, A–C options, official
  answers, ten transcript segments, supplied timing, and closed audio
  inventory; it emits zero Groups and zero current-surface occurrences.
- **Analysis**: joins canonical identities only as a supplement. It cannot
  construct, correct, admit, or alter canonical paper semantics or answers.

## Fixed corpus and proof accounting

The migration denominator is a checked-in, reproducible census of the 33
current `app/public/paper-assets/*/latest` trees at the implementation
checkpoint. It begins with 273 Groups, 1530 objective Questions, and 1035 A–D
sets. Filesystem/DB drift, byte drift, additions, deletions, or renames stop
the migration and require a new census; failures never leave the denominator.

The required family accounting is:

- Cloze: 33 Groups / 570 Questions;
- Grammar Fill: 33 Groups / 330 Questions;
- Seven Choices: 33 Groups / 165 Blanks / 33 shared A–G banks;
- Reading: 33 papers / 126 Groups / 465 Questions;
- Application Writing: 24 Groups, with nine exact Profile-backed N/A cases;
- Continuation Writing: 24 Groups, with nine exact Profile-backed N/A cases;
- Listening inactive: one paper / two slots / 20 answers / ten transcript
  segments;
- all objective answer joins: 1530/1530;
- all A–D placement sets: 1035/1035;
- all Group identities: 273/273.

Historical `versions/vN` and existing `latest` bytes are immutable inputs.
Corrections create a new Source Capture, explicit review decision, new
Transformation Records, and a new Publication.

## Blockers-first implementation and rollout

Tickets execute strictly in numerical order:

1. authority/evidence/compiler/Profile/Group/Publication/loader foundation;
2. Cloze/Grammar reference conformance and the shared A–D selector;
3. Seven Choices;
4. Reading;
5. Application Writing;
6. Continuation Writing;
7. Listening inactive closure;
8. canonical-required new-import admission;
9. frozen-corpus M0–M2 dry run;
10. M3 queue closure in the exact order Cloze → Grammar Fill → full-corpus
    A–D conformance → Seven Choices → Reading → Application Writing →
    Continuation Writing → Listening inactive;
11. four-paper M4–M5 canary;
12. remaining national legacy, Zhejiang legacy, then NCK1 M6 cohorts;
13. M7 full-corpus closure;
14. M8 legacy retirement in the exact order Cloze → Grammar Fill → Seven
    Choices → Reading → Application Writing → Continuation Writing;
15. release closeout.

Each ticket is a vertical behavior slice through source capture, compiler,
Publication, shared projector, all applicable consumers, and public
verification. A later ticket must not start until the current ticket is done,
including its required independent review lineage and owner QA.

New-import code may merge family by family, but its whole-paper admission latch
stays closed until every required family and inactive slot is available. Once
opened, `publishPaperImportPackage(...)` itself requires one complete ready
Publication before the first store write. A rollback may close canonical
import; it may never re-enable non-canonical new import.

Corpus publication and switching are always whole-paper atomic. Canary order
is `paper-2026-i`, `paper-960d0f8d`, `paper-2020-bing`, and
`paper-zj-2020-jul`; `paper-zj-2022-jun` remains a required blocked/corrected
negative proof. Remaining cohorts run national legacy, Zhejiang legacy, then
NCK1.

Legacy retirement starts only after M7 proves all 33 canonical selections,
zero queues, the complete actual-artifact matrix, independent review, owner
acceptance, and rollback evidence while every legacy capability is still
available. Each family retirement is separately reviewed and proven at its
exact HEAD. Removed compatibility code cannot be resurrected by runtime flag
or loader fallback.

## Verification contract

Every ticket runs the narrowest public-seam behavioral checks and
`git diff --check`. Contract/compiler work proves schema closure, semantic
conformance, determinism, input immutability, direct source-map coverage,
exact transformation replay, and all four blocked dispositions.

Every applicable visible ticket additionally proves:

- plain and lecture Screen via real clicks and computed layout;
- student and teacher Print HTML plus actual A4 PDF;
- student and teacher DOCX, inspected OOXML, and LibreOffice-converted actual
  PDF;
- one shared semantic/anchor/occurrence signature across all surfaces;
- student/teacher and Analysis independence;
- no clipping, duplicated bank, hidden answer leak, response-region drift,
  renderer reconstruction, or partial fallback.

A–D proofs use the accepted q21/q22/q23 4/1/2-column gold cases, the 15-row
Cloze proof, every corpus boundary mode, and explicit synthetic unbreakable
overflow. Dense modes do not wrap; surface point placement stays within 1pt
of the shared twip plan; Cloze same-column x-spread stays within 0.5pt.

Publication/import/migration tickets prove zero-write blocked outcomes,
forced failures on both sides of commit, recovery, retry identity, stale-load
rejection, prior-publication rollback, and byte-for-byte preservation of
unrelated state.

Before a ticket that changes data contracts, persistence, PaperSurface,
Print/PDF, DOCX, migration, or legacy selection is marked done, its exact
implementation range receives one fresh `$code-review` lineage. Must Fixes
are repaired and focused re-reviewed in that lineage. User-visible tickets
also provision `qa-local-owner` and receive owner acceptance under
`docs/agents/owner-qa-handoff-template.md`. Listening inactive requires no
invented UI QA; zero occurrence on actual whole-paper artifacts is its proof.

Each major checkpoint runs `pnpm -C app run verify:all` and preserves literal
`PASS / SKIP / FAIL`; an undeclared failure or unknown skip blocks progress.
The release ticket may consume current PR CI evidence but must prove a green
full suite, clean branch, required reviews and QA, merge, green `main` CI, and
the bounded `docs/STATUS.md` update.

## Out of scope and Fog disposition

No remaining Fog item can change this v1 interface, authority graph, local
rollout, 33-paper migration, verification, or release-candidate boundary:

- a stable `paper-asset-v2`, historical `versions/vN` on-demand compilation,
  active listening, new paper families, unsupported subjects, and expanded
  rich content require new versioned contracts and fail closed under v1;
- a normalization review console is optional operator UX; durable reports and
  explicit review decisions are sufficient for this cut, and website import
  UI remains forbidden;
- source splitter and `packageBuilder` consolidation occurs only after their
  capture/compatibility duties can be proven unused; it is not a hidden
  retirement criterion here;
- production HK deployment, R2 synchronization, and production backfill are a
  separate production-authorized cut. This initiative's release boundary is
  merged code plus checked-in canonical artifacts, green `main` CI, and
  `docs/STATUS.md`; it does not execute production commands or alter R2.

The prior Fog item “exact implementation-ticket slicing” is resolved by the
tracked tickets in this directory. No final Wayfinder decision ticket is
required.

## Explicit non-goals

- no in-place rewrite of Source Capture, existing `latest`, or historical
  `versions/vN`;
- no `paper-asset-v2` migration in this cut;
- no website import or normalization-review UI;
- no active listening Question Group, audio playback/timing model, renderer,
  or Analysis pipeline;
- no source/answer fabrication, majority-vote correction, regex cleanup of
  ambiguous markers, Profile guessing, or Analysis-based semantics;
- no paper/group allowlist, runtime canonical flag, field fallback, partial
  Publication, or renderer-local legacy resurrection;
- no production deployment, production DB write, production configuration
  change, or R2 mutation.
