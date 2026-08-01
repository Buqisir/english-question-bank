# 26 — Deterministic remaining-source materialization

Status: ready
Blocked by: Ticket 25 independent review PASS
Next on PASS: parallel frontier — Tickets 27, 43, and 52
Terminal: no
Model: gpt-5.6-luna
Effort: max
Parallel lane: serial mechanical expand before the three semantic lanes

## What to build

用一个 deterministic, replayable, atomic batch script 为其余 31 张纸生成 byte-bound source candidates。该票只做 byte copy/binding、digest、descriptor、candidate generation 和机械 verifier；不宣称 Profile、official answer、source-span boundary 或 canonical readiness。

## Approved membership

- `paper-2020-bing`
- `paper-2020-i`
- `paper-2020-ii`
- `paper-2020-jia`
- `paper-2021-i`
- `paper-2021-ii`
- `paper-2021-jia`
- `paper-2021-yi`
- `paper-2022-i`
- `paper-2022-ii`
- `paper-2022-jia`
- `paper-2022-yi`
- `paper-2023-i`
- `paper-2023-ii`
- `paper-2023-jia`
- `paper-2023-yi`
- `paper-2024-i`
- `paper-2024-ii`
- `paper-2024-jia`
- `paper-2025-ii`
- `paper-960d0f8d`
- `paper-zj-2020-jan`
- `paper-zj-2020-jul`
- `paper-zj-2021-jan`
- `paper-zj-2021-jun`
- `paper-zj-2022-jan`
- `paper-zj-2022-jun`
- `paper-zj-2023-jan`
- `paper-zj-2024-jan`
- `paper-zj-2025-jan`
- `paper-zj-2026-jan`

## Measured/costed capacity

- 31 papers; B2043/F2244; 940,273 raw bytes; atomic fail.
- B is the exact sum of Ticket 22 baselines.
- F is only the deterministic aggregate floor after one verified raw source document per paper.
- Record per-paper actual documents, bytes, units, diagnostics and risk; never collapse them into one universal estimate.

## Fail-closed boundary

- The batch either produces the complete exact 31-paper candidate set or commits none of it.
- No semantic assertion, review decision, Profile proof, answer authority, shared authority change, or paper readiness is allowed.
- Any source/digest mismatch, parser divergence, or need for a new shared seam stops the ticket.
- Prefer this one script over multiple agents for the mechanical work.

## Superseded-ticket mapping

Old Tickets 25–31 shared mechanical expand.

## Acceptance criteria

- [ ] All 31 approved source bytes match the frozen manifest digests.
- [ ] Candidate production is deterministic, replayable, per-paper measured, and atomic.
- [ ] Candidates make no semantic or readiness claim.
- [ ] Tickets 27, 43, and 52 become the only parallel frontier after PASS.

## Result

Commit:
Verify:
Notes:
