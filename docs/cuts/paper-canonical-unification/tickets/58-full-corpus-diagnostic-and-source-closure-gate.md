# 58 — Full-corpus diagnostic and source-closure gate

Status: ready
Blocked by: Tickets 42, 51, and 57 plus serial integration of the NCK1, national-legacy, and Zhejiang-legacy lanes
Next on PASS: independent review
Terminal: no
Model: gpt-5.6-terra
Effort: max
Independent review model: gpt-5.6-sol
Independent review effort: high
Parallel lane: join gate; sole owner of shared full-corpus accounting and route integration

## What to build

按固定顺序集成 Ticket 26 batch commit、NCK1 lane、national-legacy lane、Zhejiang-legacy lane，然后重跑 33-paper zero-write compiler。要求 33/33 source、official answer、Profile、family 与 inactive closure 有来源证明，所有 migration candidates ready，并关闭完整 accounting。

## Approved membership

- Frozen 33-paper `latest` denominator, including the completed Ticket 24 pilot paper.

## Measured/costed capacity

- Full-corpus high-risk aggregate closure.
- Consume the per-paper actual measurements produced by Tickets 25–57; do not replace them with 199 or one aggregate estimate.

## Integration and drift contract

1. Ticket 26 batch commit.
2. NCK1 lane.
3. National-legacy lane.
4. Zhejiang-legacy lane.
5. This join gate.

Before each lane merge, prove its fork base remains an ancestor, protected shared surfaces match the Ticket 26 base, and the lane's direct verifier passes on the new integration candidate. Any conflict, shared write, common-base drift, missing paper, or accounting mismatch fails closed.

## Superseded-ticket mapping

Old Ticket 32; Old Tickets 25–31 closure.

## Acceptance criteria

- [ ] All 33 papers are ready with no unresolved source-adapter or source-closure queue.
- [ ] Paper/Profile/family/disposition accounting closes exactly with no missing or duplicate member.
- [ ] The fixed serial integration order and non-overlapping lane surfaces are independently verified.
- [ ] Final full suite and high-risk independent Standards/Spec review pass.

## Result

Commit:
Verify:
Notes:
