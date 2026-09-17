# Primary source data is import-gated; derived teaching dimensions are backfillable

> Product update recorded 2026-09-17: [public papers and personal analysis](../product/public-papers-personal-analysis.md)
> supersedes the target policy that every paper needs complete platform teaching explanations.
> Primary-data integrity and backfillable dimensions remain. The base-analysis publication gate
> described below is still implemented and must be explicitly migrated, not bypassed.

Status: accepted (PM grill 2026-06-03, PO 黄学伟)

Context: Ahead of importing whole exam papers in bulk, we needed to decide which
fields must be captured correctly at import time versus which can be added later.
The trigger was difficulty — stored as a hardcoded `'medium'` (`publisher.mjs:164`),
a value that lies to 组卷/分层. The grill produced a general rule rather than a
one-off difficulty decision.

Decision: classify every field into two tiers, and gate import only on the first.

**1. Primary source data — import-gated, permanent.** Passage text, question stems,
options, the official answer key, source provenance (year/region/paper), and the
original DOCX. These exist only in the source paper and cannot be reconstructed
later, so they must be captured faithfully at import. This tier is already solid and
atomic (ADR-0004 import atomicity, ADR-0005 versioned file protocol).

**2. Derived teaching dimensions — NOT import-gated, backfillable anytime.**
Difficulty, topic labels (三大主题语境), verb axes (时态/语态/主谓一致), vocabulary
load (超纲), genre/体裁, reading skill / T-cards, cloze/grammar facets, surface
question types — every dimension that is an AI or rule judgment *over* the primary
data. Because their inputs are all in the primary capture, they can be produced by
idempotent backfills at any time, across already-imported and future papers, with
**no re-import**. Reading difficulty already works this way (computed from captured
data), which is the existence proof.

A new teaching dimension defaults to **backfill**, not import-gate, unless it needs a
signal that the primary capture does not preserve.

Consequences:
- **Difficulty**: stop writing the fake `'medium'`; mark unrated. The real estimator
  is a deferred backfill cut — once built it lights up the whole bank in one idempotent
  run, no re-import.
- **Mass import is unblocked.** The only hard pre-import requirement is the primary
  tier, which is ready. Teaching dimensions can be designed and added on their own
  schedule (import the content now, enrich forever after). Topic labels (#181) and
  verb axes (#183) already follow this backfill shape.
- **This complements, not contradicts, ADR-0007.** ADR-0007 keeps the six-family base
  解析 publish-gated as a whole-paper parse-correctness guard. 0008 governs the
  *enrichment* layer beyond that base: those default to backfill. The base per-type
  解析 are grandfathered as a deliberate quality policy, not a counter-example.
- The recurring question "should this dimension gate import?" now has a default answer:
  no, unless it is primary or its input would otherwise be lost.
