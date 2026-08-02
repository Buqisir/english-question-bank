# 31a — Registered confirmation publisher-authority bridge

Status: implemented prerequisite; Ticket 31 remains unstarted.

## Decision

The public atomic publisher may admit only an exact
`registered-confirmed-canonical-admission-v1` evidence envelope for one of the
33 complete unpublished records pinned by migration manifest v2
(`sha256:9992329a6de0fa3dcbff9fea8a0d6d92b660f0e8049b7978ceb5ff0000610e41`).
The bridge resolves the authority from that immutable record; it never accepts
a caller-selected authority or source override.

The only compatible publisher authorities are the registered trusted DOCX v37,
historic legacy v41, and current legacy v42 chains. Admission byte-checks the
source, Candidate, Confirmation, and Canonical Paper against the record,
re-derives the confirmed Candidate from the pinned source, and gives the
unchanged atomic publisher an opaque in-process proof only after those checks.

## Boundaries

- This does not publish, retry, or otherwise start any Ticket 31 canary.
- It does not regenerate or restamp Ticket 26–30 artifacts, change renderer or
  schema meaning, or broaden authority selection beyond the pinned records.
- The existing transaction, journal, current-ref, retry, conflict, recovery,
  and rollback mechanisms remain the publisher implementation of record.

## Focused verification

`scripts/verify-paper-canonical-registered-confirmation-admission.mjs` proves
v41, v42, and rich-DOCX v37 public admission; source/candidate/confirmation/
canonical swaps, unknown authority bytes, tampering, self-proof, wrong-paper,
unconfirmed, incomplete, malformed, and source-override rejection; zero
durable writes on every rejection; idempotent retry; and pre-commit recovery.
