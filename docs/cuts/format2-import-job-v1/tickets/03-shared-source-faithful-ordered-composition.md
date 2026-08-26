# 03 — Shared source-faithful ordered composition

Status: implemented
Blocked by: 02C — Generic transcription completeness (implemented)

## What to build

Close the source-fidelity gaps that keep the named real predecessors outside
the generic Format 2 Job. Extend only the versioned transcription schema,
validators, trusted source adapter, and compiler source-evidence input so they
can retain exact visual reproducibility, ordered source composition, complete
provenance/transformation maps, and exact Listening structured-document bytes
and digests.

This ticket owns B01, B02, B03, and B07 from the
[real parity frontier](../research/real-parity-frontier-2026-08-26.md) and is
the sole owner of shared schema/adapter implementation for the approved B08
identity boundary. Tickets 05–08 only verify that applied boundary; they do not
own or reimplement it. This ticket must prove the shared shapes without adding
Shenzhen, `paper-2026-i`, or Jining transcription data.

## Allowed and forbidden scope

- Allowed: a smallest compatible successor transcription schema, reuse of
  existing validators, source-evidence validation, trusted adapter/compiler
  plumbing, and focused public-Job regressions.
- A `source_crop` may carry the existing exact Visual Candidate
  `reproducibility {tool, exportSettings}` data so identical predecessor
  evidence produces identical Candidate bodies/digests and permits the
  existing exact prior-confirmation rebind.
- Source-backed ordered composition may name validated text units and blank
  references for Seven Choices, Cloze, and Grammar Fill. The adapter, not the
  caller, emits the existing renderer-neutral Canonical vocabulary.
- Provenance may bind content nodes, page regions, source spans, and explicit
  literal transformations such as a printed ordinal discrepancy to the exact
  admitted source.
- Listening evidence may retain exact structured-document bytes and their
  digests rather than reconstructing those bytes through JSON serialization.
- Existing Q33 predecessor artifacts may be used as read-only Candidate/rebind
  parity oracles. This ticket does not copy a Q33 transcription or change its
  materializer.
- Forbidden: consumer or renderer changes, paper-specific data, registry or
  materializer retirement, paperId branches, caller-authored Canonical blocks
  or inlines, a new authority layer, production mutation, or unrelated
  hardening.

## Identity boundary

- Preserve paper, slot, group, question, Option, and media identities across
  publication, together with order, numbering, answers, owner bindings, and
  source bindings.
- Compiler-owned block, inline, row, cell, blank, writing-task, and `bank` or
  `shared-bank` child identifiers need not reproduce predecessor strings. They
  must be deterministic, unique, and internally closed.
- Recompute `semanticDigest` from the successor Canonical semantics. Never copy
  a predecessor semantic digest into the new publication.

## Acceptance criteria

- [x] Exact `source_crop.reproducibility` data passes unchanged through the generic Job into the existing Candidate body, and mutation or removal changes the bound digest and invalidates exact prior-confirmation rebind.
- [x] A shared regression proves the accepted Q33 predecessor Candidate bodies/package digest can be reached through data and the existing exact rebind without a Q33 or paperId branch.
- [x] Seven Choices, Cloze, and Grammar Fill preserve source paragraph boundaries and interleaved blank order from validated references; missing, duplicate, cross-group, cross-question, or unknown ownership fails closed.
- [x] Each admitted content unit and explicit source transformation retains exact source-document, source-span, page-region, and provenance identity required by the real-parity ledger; no group-wide whole-PDF span substitutes for a more precise supplied fact.
- [x] Listening question, answer, and transcript structured documents retain their exact admitted bytes and digests through Candidate, Canonical source evidence, publication, and reload; mutation fails before publication.
- [x] Stable publication identities follow the approved boundary above, all compiler-owned identifiers are deterministic and internally closed, and the semantic digest is freshly derived from the resulting semantics.
- [x] Existing v1/v2 fixtures remain valid when the new fields are absent, while supplied successor fields are fully validated and digest-bound.
- [x] Focused public Format 2 Job, Visual Candidate/rebind, Canonical source-evidence, ordered-content, Listening identity, schema/syntax, and `git diff --check` checks pass. No paper-specific parity run, renderer check, full suite, or independent review belongs to this ticket.

## Result

Commit: This implementation commit; the exact HEAD is recorded in the completion handoff.
Verify: public Format 2 Job, Visual Candidate/exact rebind, Canonical publication, Reading Option Figure, Cloze/Grammar and Application/Continuation Writing publication, schema/syntax, and diff checks passed
Notes: exact ordinal transformations use the registered normalization contract; v3 Writing evidence uses validated page regions; compiler-owned v3 child identities are deterministic and source-address-independent; v1/v2 behavior remains on the legacy path; no consumer, renderer, authority, publication-protocol, paper-data, retirement, or production change
