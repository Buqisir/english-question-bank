# 定义原子 sidecar 发布、consumer selector 与回滚合同

Status: closed
Type: prototype
Claim: claimed
Blocked by: 设计 canonical compilation 深模块接口; 定义卷型模板与整卷装配单合同; 定义题组通用 envelope 与 rich content nodes; 定义七选五 canonical variant 与双卷 proof 合同; 定义阅读 canonical variant 与图表 proof 合同; 定义应用文 canonical variant 与 given skeleton 合同; 定义读后续写 canonical variant 与 starters 合同; 定义听力 raw/inactive 插槽与未来 activation seam
Next on PASS: `docs/cuts/paper-canonical-unification/wayfinder/tickets/14-new-import-rollout-and-gates.md`
Terminal: no
Map: `docs/cuts/paper-canonical-unification/wayfinder/map.md`

## Question

How should additive Canonical Paper Plan, Canonical Question Groups, source maps/digests, and Normalization Report sidecars be versioned, validated, written, swapped, selected, and rolled back as one paper publication? Extend the proven cloze/grammar contract so a consumer either receives one complete compatible canonical package or an explicit whole-family legacy fallback—never a half-canonical mixture. Define stale/fingerprint/version rejection, retry behavior, DB/latest atomicity, capability retirement, and the public loader interface shared by Screen, Print/PDF, and DOCX.

## Resolution

[Prototype asset: Atomic sidecars, consumer selector, and rollback contract](../../prototypes/atomic-sidecars-and-consumer-selector.md)

Seal every `compileCanonicalPaper(...)` `ready` result as one immutable,
versioned, integrity-closed **Canonical Paper Publication**. One
`canonical-paper-publication-v1` manifest binds the exact source asset
id/version/digest, executable manifest closure, and byte digest/length/schema
of the Source Capture, complete Canonical Paper Plan, complete aggregate
Canonical Question Groups, and Normalization Report artifacts. Existing
Group/Report contracts retain semantic/source-map/fingerprint ownership; the
publication adds integrity bindings rather than duplicating those facts.

A single deep `loadPaperForConsumption(request, store)` Module is shared by
Screen, Print/PDF, and DOCX. It resolves one exact checked-in Consumer
Contract, reads one immutable version through a filesystem/SQLite or browser
HTTP Adapter, validates the entire publication and cross-artifact closure,
then emits one precomputed whole-paper Consumption Plan. Each family is
entirely canonical or one explicit whole-family legacy projection. Missing,
stale, hash-mismatched, version-incompatible, or semantically invalid package
state exposes no partial canonical artifacts; one incompatible Group moves
its whole family to legacy. Group-level/field-level fallback, renderer-local
selection, `canonical ?? legacy`, and fallback after projection/render begins
are forbidden.

Publication writes reuse and strengthen the proven version-directory,
latest-swap journal, and SQLite recovery discipline. The publisher stages all
artifacts, writes the manifest last, reopens through the whole-package
validator, atomically renames one immutable `versions/vN`, then journals the
complete latest/ref swap inside the SQLite transaction. SQLite committed
publication state is recovery authority: pre-commit failure restores the
previous latest and deletes the uncommitted version; post-commit recovery
finalizes the target. This is recoverable observational atomicity rather than
an impossible claim that filesystem rename and SQLite commit are one syscall.
Canonical consumers resolve one published ref and load immutable version
paths; they never assemble separately fetched mutable `latest` sidecars.

Retry identity is `paperId + sourceAssetVersion + publicationDigest`.
Identical committed retries are idempotent; interrupted attempts recover
before reusing the same next version; occupied versions with another digest
fail conflict. A loader discards all bytes and retries one complete load on a
transient DB/latest-ref disagreement; persistent disagreement is explicitly
unavailable rather than a per-file or stale-version fallback.

Rollback has three explicit forms: restore a checked-in exact Consumer
Contract/whole-family legacy capability, repoint DB/latest to a validated
immutable prior publication through the same journal, or publish a corrected
new Source Capture/canonical version. Sidecars are never edited in place.
Legacy capability is a shared Consumer Contract fact,
`available | retired`, not a runtime flag or renderer allowlist. After later
migration evidence retires a family, incompatibility becomes a hard failure;
the loader cannot silently resurrect removed compatibility code.

The prototype exercised 14 observations covering complete canonical
selection, missing/stale/corrupt/unknown-authority rejection, whole-family
fallback, one-Group family drift, retired legacy, pointer disagreement,
post-selection projection failure, and both sides of crash recovery. All
passed. `CONTEXT.md` now records Canonical Paper Publication as the
admitted-or-rejected whole; sidecar remains its storage form.

Recorded verification:

- `node --check .scratch/wayfinder-13-atomic-sidecars/logic.mjs` — exit 0
  before throwaway deletion.
- `node --check .scratch/wayfinder-13-atomic-sidecars/tui.mjs` — exit 0 before
  throwaway deletion.
- `node .scratch/wayfinder-13-atomic-sidecars/tui.mjs --all` — 14 observations,
  `RESULT PASS`, before throwaway deletion.
- `git diff --check`.

No Fog graduates and no new ticket is required. Rollout order/gates, corpus
thresholds, migration batching, production/R2 mechanics, historical
`versions/vN`, actual legacy deletion, QA pages, and implementation slicing
remain with the already-charted successor tickets.
