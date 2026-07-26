# Atomic sidecars, consumer selector, and rollback contract

Status: accepted Wayfinder prototype answer
Scope: publication/selection contract only; no production schema, compiler,
publisher, DB, asset, Screen, Print/PDF, DOCX, rollout, migration, or release
change

## Question and verdict

Can additive Canonical Paper Plan, Canonical Question Group, provenance, and
Normalization Report artifacts be published and consumed without allowing
one paper occurrence to combine stale, incompatible, missing, or
partly-canonical facts?

**Verdict: yes.** Seal every `compileCanonicalPaper(...)` `ready` result into
one immutable, integrity-closed **Canonical Paper Publication**. A single deep
loader Module validates the complete publication before it selects any
family. It returns one precomputed whole-paper Consumption Plan in which each
family is either entirely canonical or an explicit whole-family legacy
fallback. Per-Group fallback, field fallback, renderer-local selection, and
fallback after projection begins are forbidden.

This extends the proven cloze/grammar publication journal and stale-sidecar
checks, but deliberately does not copy its Group allowlist or its
`normalize-on-read` compatibility branch. The current
`resolveCanonicalPrintGroup(...)` scans papers and selects one Group at a time;
that seam is too shallow for the whole-paper contract.

## One new domain term

A **Canonical Paper Publication** is one immutable, versioned,
integrity-closed set binding a single source paper asset instance to one
complete Canonical Paper Plan, its exact Canonical Question Groups, Source
Capture closure, Normalization Report, provenance/digests, and executable
authority closure. It is admitted or rejected as a whole.

“Publication” means this domain unit. “Sidecar” remains a storage shape for
its additive artifacts; no individual sidecar is independently publishable.

## Artifact ownership and package shape

The accepted semantic owners do not move:

- the Paper Format Profile owns reusable paper-family structure;
- the Canonical Paper Plan owns one paper's slots, order, numbering, scoring,
  instructions, answer regions, and completeness;
- each Canonical Question Group owns its family semantics, typed Source Map,
  source fingerprint, and semantic digest;
- the Source Capture owns immutable evidence identity;
- the Normalization Report owns direct lineage, Transformation Records,
  package-level diagnostics, and compilation disposition;
- the executable standard manifest owns exact Profile, family-contract,
  normalization-rule, and renderer-contract closure.

The publication adds integrity and compatibility bindings only. It does not
copy Plan facts, Group facts, source coordinates, Transformation Records, or
semantic digests into a second semantic owner.

One immutable paper version contains additive artifacts shaped like:

```text
versions/vN/
  paper-asset.json
  canonical/
    source-capture-v1.json
    canonical-paper-plan-v1.json
    canonical-question-groups-v1.json
    normalization-report-v1.json
    canonical-paper-publication-v1.json
```

The aggregate Groups artifact contains every Group referenced by the complete
Plan, sorted by stable `groupId` for serialization. Plan order remains in the
Plan. Source Maps, source fingerprints, and semantic digests stay inside the
accepted Group/Report contracts; there is no duplicate `digests.json` or
independently swappable provenance sidecar.

The publication manifest is the commit record for the set:

```ts
type Sha256 = `sha256:${string}`

type CanonicalPaperPublicationManifestV1 = Readonly<{
  schemaVersion: 'canonical-paper-publication-v1'
  paperId: string
  sourceAssetVersion: number
  sourceAssetDigest: Sha256

  authority: Readonly<{
    manifestId: string
    manifestVersion: string
    manifestDigest: Sha256
  }>

  artifacts: readonly Readonly<{
    role:
      | 'source_capture'
      | 'paper_plan'
      | 'question_groups'
      | 'normalization_report'
    schemaVersion: string
    relativePath: string
    byteLength: number
    sha256: Sha256
  }>[]

  publicationDigest: Sha256
}>
```

Manifest roles are closed and occur exactly once. Paths are normalized,
relative, inside the immutable version directory, and unique. The publication
digest is the stable digest of the manifest excluding `publicationDigest`;
artifact entries are sorted by `role`. Artifact byte digests protect storage
integrity. Existing source fingerprints and semantic digests retain their
separate evidence/meaning responsibilities.

The manifest is written last inside an unpublished staging directory, but
write order is not the atomicity mechanism. No public loader reads staging.
Atomic visibility comes from an immutable version-directory rename plus a
validated published reference.

## Exact version and compatibility closure

Every layer has an explicit immutable version:

- publication-manifest schema;
- source-capture, Plan, Groups, and Report schemas;
- exact root standard-manifest id/version/digest;
- Profile id/version/digest;
- each family-contract id/version/digest;
- normalization rules/Adapters recorded by the Report;
- shared projector contract;
- each Screen, Print/PDF, and DOCX Consumer Contract.

There is no “latest compatible schema,” semver range, permissive unknown
field, or renderer-selected parser. A checked-in, versioned Consumer Contract
lists exact publication/Plan/Group schema versions, authority manifest
digests, projector version, and family-contract versions it can consume. The
loader resolves that contract by exact id/version/digest; callers cannot pass
an ad hoc capability object that silently widens support.

An additive field that changes a closed schema requires a new schema version.
A semantic family change requires a new family-contract version and a
compatible Profile version where slot semantics change. Old immutable
publications keep their old refs.

## Whole-publication validation

The loader admits canonical consumption only after one validation pass proves
all of the following:

1. DB/current published ref and the mirrored `latest` publication ref identify
   the same `paperId`, source asset version, immutable version, and publication
   digest.
2. The source asset exists at that immutable version and its id, version, and
   byte digest match the manifest.
3. The publication schema is known and closed; all four artifact roles exist
   exactly once; every path, length, and byte digest matches.
4. Every artifact passes its exact runtime schema.
5. The authority manifest id/version/digest is recognized by the Consumer
   Contract; the complete referenced standard closure is available and
   digest-valid.
6. Source Capture and Normalization Report identify the same evidence closure;
   the Report disposition is `ready`.
7. The Plan is `complete`, uses one exact Profile, and its active Group refs
   equal the complete Groups artifact set. No extra, missing, duplicate, or
   cross-paper Group exists.
8. Every Plan slot, Group family-contract ref, Group source fingerprint,
   semantic digest, Source Map target, media digest, and Transformation Record
   ref passes cross-artifact semantic conformance.
9. The selected Consumer Contract can consume the shared projection contract
   and can either consume or explicitly fall back for every active family.

Schema validity is necessary but not sufficient. Failure at any step rejects
the whole canonical publication before any family projection is returned.

## One deep public loader seam

Screen, Print/PDF, and DOCX use the same Module interface:

```ts
type ConsumerContractRef = Readonly<{
  id: 'screen' | 'print_pdf' | 'docx'
  version: string
  digest: Sha256
}>

type PaperConsumptionRequest = Readonly<{
  paperId: string
  version?: `v${number}`
  consumerContract: ConsumerContractRef
}>

type FamilyConsumptionSelection =
  | Readonly<{
      mode: 'canonical'
      familyContractId: string
      groupIds: readonly string[]
      projectedOccurrences: readonly ProjectedCanonicalGroupOccurrence[]
    }>
  | Readonly<{
      mode: 'legacy'
      familyContractId: string
      groupIds: readonly string[]
      projectedOccurrences: readonly ProjectedLegacyFamilyOccurrence[]
      diagnostic: PublicationDiagnostic
    }>

type PaperConsumptionResult =
  | Readonly<{
      disposition: 'ready'
      paperId: string
      sourceAssetVersion: number
      publicationDigest?: Sha256
      selections: readonly FamilyConsumptionSelection[]
      diagnostics: readonly PublicationDiagnostic[]
    }>
  | Readonly<{
      disposition: 'retryable_unavailable' | 'incompatible' | 'not_found'
      diagnostics: readonly PublicationDiagnostic[]
      selections?: never
    }>

interface PaperPublicationStore {
  readPublishedRef(paperId: string, version?: `v${number}`):
    Promise<PublishedPaperRef | null>
  readVersionArtifact(ref: PublishedPaperRef, relativePath: string):
    Promise<Uint8Array>
  readLegacyPaper(ref: PublishedPaperRef): Promise<LegacyPaperAsset>
}

declare function loadPaperForConsumption(
  request: PaperConsumptionRequest,
  store: PaperPublicationStore,
): Promise<PaperConsumptionResult>
```

The storage port is a real seam: server filesystem/SQLite and browser HTTP are
different Adapters, while tests use an in-memory Adapter. The loader owns
manifest parsing, exact capability resolution, full-package validation,
retry, selection, the call to `projectCanonicalPaper(...)`, legacy-family
Adapter dispatch, and diagnostics. Renderer Adapters receive only the
returned Consumption Plan and own typography/surface emission.

The Interface deliberately does not expose raw sidecar paths, validators,
family allowlists, per-Group selectors, source-format Adapters, fallback
callbacks, or “try canonical” methods. Deleting this Module would force
version, integrity, capability, retry, fallback, and diagnostic logic back
into all three consumers; that is the depth it earns.

## Selector invariants: canonical package or whole-family legacy

Selection occurs once, after whole-publication validation and before any
renderer output:

1. A valid publication is the prerequisite for every canonical selection.
   Missing or invalid artifacts cannot leave “the valid Groups” available.
2. For each exact family contract in the Plan, all occurrences in that paper
   use one mode: `canonical` or `legacy`.
3. A family becomes canonical only when the Consumer Contract accepts the
   exact family-contract version/digest and the complete family projection
   passes conformance.
4. If one Group in a family is missing, stale, incompatible, or
   unprojectable, that entire family uses one explicit legacy-family Adapter
   when the Consumer Contract still declares it available.
5. Cross-family transition is allowed only through this precomputed
   Consumption Plan. For example, Reading may be wholly canonical while
   Seven Choices is wholly legacy; no Reading or Seven Choices Group chooses
   independently.
6. A legacy-family Adapter consumes the exact same immutable source-asset
   version and projects the entire family. It cannot borrow canonical
   paragraphs, Questions, Options, answer joins, numbering, or anchors.
7. A renderer cannot catch a canonical projection/render error and continue
   with legacy output. Failure after selection aborts that whole
   Screen/export occurrence as `incompatible`; it never downgrades after
   bytes or DOM have started.
8. Inactive Source Slots produce no family occurrence and are never a hidden
   legacy fallback.

This forbids all of the dangerous shapes:

```text
canonical paragraph + legacy Questions
canonical Questions + legacy option bank
canonical Plan numbering + reparsed raw marker identity inside one family
four canonical Reading Groups + one legacy Reading Group
Print canonical + fallback halfway through PDF/DOCX emission
```

## Rejection and fallback matrix

| Condition | Loader result |
| --- | --- |
| DB/current ref and latest ref disagree | discard all bytes and retry one complete load; persistent disagreement is `retryable_unavailable` |
| publication or required artifact missing, malformed, hash-mismatched, path-invalid, duplicated, or unknown-schema | reject the canonical publication; return all-family legacy only when every needed legacy Adapter is still available |
| source asset id/version/digest differs from publication | stale publication rejection; same-version all-family legacy if available |
| authority manifest id/version/digest unknown or incomplete | incompatible publication; same-version all-family legacy if available |
| Plan incomplete or Plan/Group set differs | whole-publication rejection; no partial canonical Groups |
| source fingerprint, semantic digest, Source Map, media, or Transformation Record closure mismatches | whole-publication rejection |
| one family version is unsupported by this Consumer Contract | that whole family is legacy if available; other families may remain canonical |
| one Group alone is incompatible | its whole family is legacy; never Group-only fallback |
| legacy Adapter has been retired | `incompatible`; never revive an untracked compatibility path |
| projection or renderer conformance fails after selection | abort the occurrence; no fallback |
| explicit historical version requested | load only that immutable version and validate it against the same Consumer Contract; never substitute current latest |

All legacy results include structured paper id, immutable source asset version,
family id, Consumer Contract ref, publication ref when present, and reason
code. “No canonical data found” is not a silent success.

## Write, swap, DB, and retry protocol

Filesystem rename and SQLite commit cannot form one literal transaction. The
contract therefore provides **recoverable observational atomicity** and fails
closed during disagreement rather than claiming impossible cross-resource
atomicity.

For a `compileCanonicalPaper(...)` `ready` result:

1. Recover any existing journal for this paper before choosing a version.
2. Build the legacy source asset and every canonical artifact in one
   paper-version staging directory. A blocked compiler result writes no
   version, DB row, current ref, or `latest`.
3. Stable-serialize artifacts, compute byte digests, write the publication
   manifest last, durably flush where the production filesystem requires it,
   and reopen the staging directory through the same whole-publication
   validator.
4. Atomically rename the validated staging directory to immutable
   `versions/vN`. Never overwrite an existing version directory.
5. Begin the SQLite transaction, insert the version/publication digest and
   domain rows, then prepare a `latest` mirror plus a small
   `canonical-paper-publication-ref-v1.json` that points to the immutable
   version and exact publication digest.
6. Write a durable latest-swap journal, rename old `latest` to a preserved
   previous directory, and rename the complete prepared latest directory into
   place.
7. Commit SQLite. SQLite publication state is the recovery authority.
8. Remove the previous latest directory and journal. Cleanup may be retried
   because both published version and current latest already identify the
   committed digest.

Canonical consumers never assemble a package from independently fetched
`latest` sidecars. They resolve the published ref once and read every artifact
from its immutable version path. The `latest` ref is an integrity mirror and
legacy compatibility surface, not a mutable canonical package directory.

Recovery is deterministic:

- crash/failure before SQLite commit: roll back SQLite, restore byte-preserved
  previous `latest`, delete the uncommitted immutable target version and
  staging, retain the previous publication;
- crash after SQLite commit: keep the target version/current ref, finish
  latest cleanup, and delete the journal;
- journal, DB, version directory, or publication digest that cannot be
  reconciled uniquely: stop publishing and loading with an explicit
  `publication_recovery_ambiguous` diagnostic; never choose the numerically
  highest directory.

Retry identity is `paperId + sourceAssetVersion + publicationDigest`:

- an already committed identical identity returns idempotent success;
- an interrupted uncommitted attempt is recovered first and may reuse the
  same next `vN`;
- an occupied version with another digest is a conflict and is never
  overwritten;
- compilation or validation retries start from immutable inputs and rebuild
  the whole package, not only the failed sidecar.

A loader seeing missing bytes or a DB/latest-ref mismatch during a concurrent
swap discards the entire attempt and rereads the published ref exactly once.
It does not retry individual files. A second mismatch is
`retryable_unavailable`, not legacy selection from an unproven version.

## Rollback and capability retirement

There are three explicit rollback operations:

1. **Consumer capability rollback** — deploy an older exact Consumer Contract
   or mark one family legacy-capable in the checked-in registry. The selector
   moves the whole family to its legacy Adapter; immutable publications do not
   change.
2. **Publication rollback** — atomically repoint DB/current and latest ref to
   one already-validated immutable prior version using the same journal and
   digest checks. Never copy or edit prior sidecars in place.
3. **Source/canonical correction** — compile and publish a new immutable
   version. A corrected Source Capture or semantic artifact is never a
   mutation of an old publication.

Legacy capability is a checked-in Consumer Contract fact:

```ts
type LegacyFamilyCapability = 'available' | 'retired'
```

It is not a request flag, environment toggle, DB bit, or renderer allowlist.
Retirement is family-wide across the shared loader. It becomes legal only
after later rollout/migration work proves every current `latest` publication
for that family, every active Screen/Print/PDF/DOCX Consumer Contract, actual
surface parity/anchors, required independent review, owner QA, full suite/CI,
and a tested rollback route. The migration ticket owns that evidence and the
actual deletion.

Once `retired`, an incompatible/missing family is `incompatible`; the loader
cannot resurrect removed compatibility code. Emergency rollback then requires
an explicit code deployment that restores the exact legacy Adapter/Consumer
Contract or a publication rollback to an exact package the deployed consumer
supports.

## Prototype result

The throwaway logic prototype separated the selector and publisher state
machine from its terminal shell:

```text
node .scratch/wayfinder-13-atomic-sidecars/tui.mjs --all
RESULT PASS
```

It exercised:

- complete publication → all canonical;
- missing sidecar, stale source version, bad artifact digest, and unknown
  authority → whole-publication rejection and explicit all-family legacy;
- unsupported Seven Choices capability → whole Seven Choices legacy;
- one of two Reading Groups on another contract version → whole Reading
  legacy, not one-Group fallback;
- retired Reading legacy plus incompatibility → hard unavailable;
- DB/latest disagreement → whole-load retry;
- projection failure after selection → hard unavailable, not downgrade;
- crash before DB commit → restore old latest and remove uncommitted version;
- crash after DB commit → finalize new latest and clean the journal.

The prototype reported 14 passing observations. Its code is deleted after this
answer is captured; this document and the ticket resolution are the durable
result.

## Rejected alternatives

1. **One sidecar file plus a `valid: true` field** — rejected because the
   flag can be stale and cannot integrity-close other files or authority refs.
2. **Per-Group loader with `canonical ?? legacy`** — rejected because it
   directly permits one family and one paper occurrence to mix modes.
3. **Renderer-owned capability checks** — rejected because Screen, Print/PDF,
   and DOCX would drift and repeat fallback logic.
4. **Fallback after a projection/render exception** — rejected because output
   may already contain canonical bytes/DOM, making the result half-canonical.
5. **Copy canonical sidecars into mutable `latest` and fetch them separately**
   — rejected because a swap between reads can combine versions. Resolve one
   ref, then read immutable version paths.
6. **A new runtime flag platform** — rejected. Exact checked-in Consumer
   Contracts and additive immutable publications already provide rollback.
7. **Mutate an old sidecar to repair it** — rejected. Corrections create a new
   Source Capture/compilation/publication version.
8. **Treat numerically highest disk version as recovery truth** — rejected.
   SQLite committed publication state and the journal are the recovery
   authority; ambiguity fails closed.

## Boundaries retained for later tickets

This answer fixes the package, write/swap, selection, retry, rollback, and
retirement contracts only. It does not choose rollout order, activation
cohorts, corpus thresholds, migration batching, production R2 mechanics,
historical `versions/vN` compilation, legacy deletion timing, QA pages, or
implementation-ticket slicing. The existing new-import rollout, all-`latest`
migration/legacy-retirement, and map-synthesis tickets continue to own those
questions. No Fog graduates and no new ticket is required.
