# 04 — Shared rich whole-paper and active-consumer compatibility

Status: implemented
Blocked by: none; Ticket 03 is implemented

## What to build

Close the remaining shared rich-content and active-consumer gaps before either
real parity paper migrates. Extend the generic trusted transcription/compiler
route for a real table nested inside `framed_columns`, exact Application and
Continuation source composition, and a source-backed Passage Figure caption.
Preserve current active consumer behavior through the Canonical Consumer
Interface or, only where that interface cannot yet project an accepted field,
one bounded read-only compatibility Adapter.

This ticket owns B04, B05, B06, and B10 from the
[real parity frontier](../research/real-parity-frontier-2026-08-26.md). It does
not contain Shenzhen, `paper-2026-i`, or Jining data and does not retire any
paper-specific path.

## Allowed and forbidden scope

- Allowed: generic validated rich-content transcription shapes, trusted
  adapter/compiler projection, Canonical Consumer Interface coverage, and at
  most one thin read-only compatibility Adapter for current active consumers.
- Active-consumer compatibility means Screen, Student Print, Teacher Print,
  PDF, Analysis, and current question listing, detail, search, similar-question,
  and figure behaviors remain semantically available from the published
  Canonical Paper and its approved sidecars.
- Unaffected historical assets remain supported under their immutable
  authority.
- Forbidden: exact byte/path recreation of standalone answer-key, import-meta,
  or Listening three-file public outputs; a legacy figures manifest for media
  already canonicalized; renderer/CSS changes; a write-capable
  compatibility route; paperId branches; per-paper data or retirement;
  production mutation; or unrelated historical migration.

## Owner-approved scoped authority exception

On 2026-08-26 the Owner approved one narrow Format 2 rich Candidate authority
successor because the executable v46 closure rejects the accepted modern
Continuation shape. The successor may combine the existing Reading Figure
capability with a new versioned modern Continuation family whose source capture
and transcription remain v2. Format 2 Job is the only caller that may bind this
exact digest-bound authority ref. Global `canonicalAuthorityRef`, production or
current authority, historical immutable authorities/assets, renderer/CSS, and
paper data remain unchanged. The choice is static and may not depend on
`paperId` or content.

This shared authority-contract exception expands the merger gate to
`pnpm -C app verify:paper`, one final `pnpm -C app verify:all`, and one
independent Standards/Spec review. Ticket 04 implementation runs only its
focused checks; the merger owns those final gates.

## Acceptance criteria

- [x] `framed_columns` can contain the accepted renderer-neutral real-table structure in exact declared source order, with complete row/cell ownership and fail-closed reference validation rather than a page screenshot or caller-authored Canonical subtree.
- [x] Application Writing preserves the exact source composition, including provided title/skeleton, prompt/notice references, and declared ordering, without adding adapter-authored visible evidence prose.
- [x] Continuation Writing preserves all source paragraph boundaries and current contract-shaped material instead of collapsing them into one paragraph or downgrading an accepted modern shape to `legacy_opaque`.
- [x] A Passage Figure may retain an exact non-empty source caption with stable figure ownership, source bindings, and normal shared consumption; omission or mutation fails closed when the source declares a caption.
- [x] Screen, Student Print, Teacher Print, PDF, Analysis, and question listing/detail/search/similar/figure behaviors obtain semantically equivalent data through the Canonical Consumer Interface or the single bounded read-only Adapter, with Student/Teacher answer separation intact.
- [x] The compatibility route neither reconstructs legacy public-extra bytes/paths nor breaks unaffected historical assets; migrated papers have one supported generic publication route after their later parity tickets retire the old inputs.
- [x] No consumer reconstructs paper meaning, no renderer changes or global authority advance occur, and no paper identity selects rich-content or compatibility behavior; only Format 2 Job binds the exact scoped successor ref.
- [x] Focused public Format 2 Job, rich Canonical compilation, active consumer/interface, historical-asset compatibility, schema/syntax, and `git diff --check` checks pass. Real-paper data and retirement remain downstream; merger additionally runs `verify:paper`, one final `verify:all`, and one independent Standards/Spec review.

## Result

Commit: This implementation commit; the exact HEAD is recorded in the completion handoff.
Verify: PASS — public Format 2 Job v1-v4, v49 authority closure, direct and rendered rich Canonical contracts, detail Screen, PaperBrowse, listing/detail routes, semantic search, similar, schema/syntax, and diff checks. Focused Adapter repair checks additionally cover exact Analysis receipt descriptors/bytes, cache-hit current-ref revalidation, source-asset-version drift, rollback invalidation, and pre-publication-to-publication snapshot visibility. The Canonical-only I16 Analysis assertions passed before its pre-existing off-repo corpus requirement caused the remainder of that verifier to report `SKIP`.
Notes: The only new authority is the exact digest-bound scoped Format 2 v49 Candidate successor. The single compatibility Adapter is immutable/read-only, skips unrelated current authorities, verifies each admitted Analysis file against the existing durable Job receipt before JSON use, revalidates DB/current-ref/runtime identity before every cache return, rejects provenance/sidecar/DB/Paper-Asset identity conflicts, exposes no write capability, and invents no topic, difficulty, explanation, or source score; its card uses only the existing documented 2.5 display default. Teaching-facet and similar operations obtain a current exact Adapter snapshot rather than retaining their first Canonical snapshot. `verify:paper`, final `verify:all`, and independent Standards/Spec review remain explicit merger-gate `SKIP` items for this implementation task.
