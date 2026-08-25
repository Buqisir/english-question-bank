# 04 — paper-2026-i whole-paper parity and registry retirement

Status: ready-for-agent
Blocked by: 02 — Exact Confirmation resume to local awaiting_qa

## What to build

Move `paper-2026-i` from the shared Format② content registry into a validated
per-paper transcription artifact and replay the entire paper through the same
public Job. Prove its current source-backed structure, answers, listening,
writing, figures, Canonical semantics, atomic publication, reload, and
representative consumers in an isolated local store. Once parity is proved,
retire the migrated shared registry entry.

## Allowed and forbidden scope

- Allowed: `paper-2026-i` per-paper data/evidence, parity checks through the
  generic Job, isolated local publication proof, and removal of its superseded
  registry entry after parity closes.
- Forbidden: paperId branches, hand-authored replacement Canonical Paper,
  changed source meaning, changed shared renderer or authority, live database
  replacement, production publication, or unrelated historical migration.

## Acceptance criteria

- [ ] The complete existing Format② transcription moves to a versioned per-paper artifact without losing literal source quirks, provenance, or answer-source identity.
- [ ] The generic Job reproduces required group order and structure, complete objective-answer coverage, listening questions/answers/transcript, writing material and analyses, table/figure ownership, and current Canonical semantics.
- [ ] The replay reaches one atomic isolated local publication and exact committed reload without replacing the developer's live database or production data.
- [ ] Representative Screen, Student Print, Teacher Print, and PDF consumption remains semantically equivalent, including Student/Teacher answer separation.
- [ ] The shared Job implementation selects the paper through data identity, not a `paper-2026-i` conditional or a paper-specific verifier.
- [ ] Rerunning unchanged evidence is a proven no-op; changed source or answer identity invalidates downstream results.
- [ ] The legacy shared registry entry is removed only after parity passes, leaving the generic per-paper path as the sole supported Format② input.
- [ ] Narrow whole-paper parity, answer coverage, listening, figure, atomic reload, representative consumer, and `git diff --check` checks pass. No per-paper full suite or authority migration is added.

## Result

Commit:
Verify:
Notes:
