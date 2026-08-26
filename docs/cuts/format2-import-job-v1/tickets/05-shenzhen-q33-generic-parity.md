# 05 — Shenzhen Q33 generic parity and materializer retirement

Status: implemented
Blocked by: none; 04 — Shared rich whole-paper and active-consumer compatibility is implemented

## Primary parity sources

Use the Shenzhen Q33 source capture, Candidate, exact Teacher Confirmation,
layout/canary artifacts, and current whole-paper assets listed in the
[real parity frontier](../research/real-parity-frontier-2026-08-26.md). Tickets
03 and 04 close the shared source-fidelity and rich-content shapes before this
paper-specific data replay enters the frontier.

## What to build

Replay the already accepted Shenzhen Q33 visual result through the generic
Format 2 Import Job. Preserve the four exact source crops, their Option owners,
the original PDF physical placement, and the shared Screen/Print/PDF behavior.
Once parity is proved, retire the Q33-only Canonical materialization path so the
canary remains an oracle rather than a precedent for per-paper code.

## Allowed and forbidden scope

- Allowed: Q33 per-paper transcription/evidence, generic Job inputs, exact
  parity assertions, and retirement of the superseded Q33-only path after
  parity closes.
- Forbidden: new Q33-specific branches or verifiers, changed candidate bytes,
  new visual owner kinds, changed Reading Figure Option semantics, renderer
  CSS tuning, authority changes, or production publication.

## Acceptance criteria

- [x] The generic Job replays Q33 without invoking a Q33-specific materializer or selecting behavior from its paperId.
- [x] The four accepted source-crop digests, A–D owner associations, Canonical Option/media identities, and source PDF point geometry remain unchanged.
- [x] Verify the B08 boundary implemented by Ticket 03: paper, slot, group, question, Option, and media identities plus order, numbering, answers, owners, and source bindings remain stable. Compiler-owned block, inline, row, cell, blank, writing-task, and `bank` or `shared-bank` child identifiers may be newly derived when deterministic, unique, and internally closed; `semanticDigest` is recomputed from the replayed semantics rather than copied from the predecessor.
- [x] Normal Reading typography remains renderer text, including question numbers and A–D labels; no `[Fig.]` token or flattened four-option strip reaches any consumer.
- [x] Screen, Student Print, Teacher Print, and PDF consume the same four confirmed images and source layout intent without consumer-side recrop, stretch, or paper-specific offsets.
- [x] Student and Teacher answer behavior remains separated without changing the visual result.
- [x] Identical replay is idempotent and exact-source or confirmation mutation fails closed through the generic Job seam.
- [x] The legacy Q33-only materialization path is removed only after parity passes, leaving one supported route and no lost capability.
- [x] Narrow Q33 parity, generic Job, shared consumer, rendered-canary, and `git diff --check` checks pass. No per-paper authority bump, full suite, or separate review is added.

## Result

Commit: This implementation commit; the exact HEAD is recorded in the completion handoff.
Verify: PASS — Shenzhen Q33 generic replay/rendered canary, public Format 2 Job, Reading Option Figure contract, Canonical detail Screen consumer, transcription JSON/syntax, and `git diff --check`.
Notes: The v4 per-paper transcription reuses the accepted four source crops, all twelve historical reviewed candidates, and exact Confirmation through the generic rebind seam without duplicating candidate bytes. It retains the original Q33 placement matrices and historical measurement digest, publishes one rich whole-paper Canonical result, and stops at normal `owner_qa_required`. The old Q33-only Canonical materializer is removed after parity. No shared authority, renderer/CSS, production data, full suite, or separate review changed in this ticket.
