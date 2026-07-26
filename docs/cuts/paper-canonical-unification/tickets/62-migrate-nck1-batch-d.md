# 62 — Migrate NCK1 batch D

Status: ready
Blocked by: 61 — Migrate NCK1 batch C
Next on PASS: independent review
Independent review PASS: owner QA
Owner QA PASS: `docs/cuts/paper-canonical-unification/tickets/63-full-corpus-semantic-accounting-closure.md`
Terminal: no

## What to build

Atomically migrate and artifact-verify `paper-zj-2023-jan`,
`paper-zj-2024-jan`, `paper-zj-2025-jan`, and `paper-zj-2026-jan`,
closing all 33 canonical selections.

## Acceptance criteria

- [ ] Each paper has source-backed NCK1 Profile and complete required slots.
- [ ] Compile, Publication, reopen, switch, exact reload, actual artifacts,
      retry, and rollback pass for all four.
- [ ] All remaining marker, heading, media, writing, answer, and Profile
      decisions are closed through accepted evidence.
- [ ] NCK1 remaining accounting is sixteen/sixteen and the frozen corpus is
      33/33 canonical-selected.
- [ ] From the exact reviewed HEAD, the task provisions and opens the NCK1
      Profile/risk-boundary page and artifacts with the canonical QA checklist;
      QA pauses for owner verdict.
- [ ] Focused batch checks, ordinary self-check, full verify, and
      `git diff --check` pass with durable hashes.

## Result

Commit:
Verify:
Notes:
