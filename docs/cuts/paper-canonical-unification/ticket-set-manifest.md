# Paper canonical unification guarded measured-replan ticket-set manifest

Status: published-awaiting-exact-manifest-digest-approval
Source phase: guarded `implementation → to-tickets → owner-approval`
Proposal peer: `019fbed5-9d38-7f91-883a-42320826c69b`
Proposal identity: peer `019fbed5-9d38-7f91-883a-42320826c69b`, final `item-9`
Publication peer: `019fbed5-9d38-7f91-883a-42320826c69b`
Publication source HEAD: `3a31ac860a9f9ca68b797f290d0f6dcd88c9c143`
Owner granularity approval record: `docs/cuts/paper-canonical-unification/measured-replan-79-owner-granularity-approval.md`
Owner granularity approval: “approve-ticket-granularity：批准总票数 79、Tickets 25–57 粒度、三 lane DAG、固定集成顺序及模型路由。”
Accepted spec: `docs/cuts/paper-canonical-unification/spec.md`
Accepted spec SHA-256: `c6cbbe778d94e1205612fa5ac535e2198020317b09064190fec1d0b6660d868b`
Total ticket count: 79
Preserved completed baseline: Tickets 01–23
Preserved fail-closed predecessor: Ticket 24
Replacement route: Tickets 25–79
Owner exact manifest-digest approval: pending
Implementation dispatch: forbidden

## Binding and lifecycle

Ticket 24's committed evidence measured 199 units for the approved 88-unit
pilot after complete immutable source enrollment. The old 4–5 paper,
266–328-unit source-adapter capacity assumption is therefore superseded.

The same explicit-only `$to-tickets` peer drafted and published this exact
replacement route. The owner approved the exact proposal granularity and DAG
before publication. That approval does not approve this manifest's not-yet
reported SHA-256. Ticket 25 and every parallel lane remain forbidden until a
distinct exact-digest approval is committed and all implementation gates pass.

The prior 53-ticket route remains immutable historical evidence at commit
`3a31ac860a9f9ca68b797f290d0f6dcd88c9c143`, manifest SHA-256
`9a595e744fbfaec289a9723ae90ede172d60dce3041c982b5377c05bb8f59377`.
Ticket 24 remains the predecessor; only its former successors 25–53 are
superseded.

## Capacity notation and fail-closed rule

- `B` is the exact Ticket 22 frozen-latest inspection baseline.
- `F` is the deterministic minimum after adding one digest-verified raw
  source under the current formula. It excludes complete structured captures,
  diagnostics, semantic review, and fixes.
- Ticket 24's 199 units is an observed warning threshold, not a universal
  estimate.
- Tickets 27–57 admit one paper each. A low result never admits another paper.
- Any required shared change, source/digest drift, unproved Profile,
  answer conflict, new diagnostic shape, or unsafe context cost fails closed.

## Parallel DAG and worktree contract

Ticket 25 and its independent review are serial. Ticket 26 is the sole Luna
Max ticket and runs one deterministic atomic batch script. After Ticket 26
PASS, exactly three semantic lanes may proceed in parallel:

1. NCK1 — Tickets 27–42.
2. national-legacy — Tickets 43–51.
3. Zhejiang-legacy — Tickets 52–57.

Each lane uses a distinct worktree and branch created from the exact Ticket 26
PASS commit. Each lane is serial internally and writes only paper-specific
candidates, captures, fixtures, verifiers and evidence. Lane workers may not
write shared compiler, adapter registry, authority versions, schemas,
migration ledger/manifest, phase receipt, tickets or this manifest.

Fixed integration order is Ticket 26 batch commit → NCK1 → national-legacy →
Zhejiang-legacy → Ticket 58. Before each merge, the fork base, protected
shared surfaces and direct verifier must be revalidated against the current
integration candidate. Drift or conflict fails closed; no automatic conflict
resolution is allowed. Ticket 58 is the sole join gate.

## Approved route

| Ticket | Title | Blocked by | What it delivers | Membership | Capacity | Model route | Lane | Old mapping |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 25 | Generic DOCX source-adapter seam and NCK1 proof | Ticket 24 committed fail-closed result and owner exact manifest-digest approval | 建立真实 DOCX → immutable Source Capture 通用 seam，并使 `paper-2025-i` zero-write compile ready。该票独占所有 shared compiler、adapter registry、schema 和 authority-version writes；它不迁移或发布这张纸。 | paper-2025-i | B67/F80. | gpt-5.6-terra / max | serial shared seam; no lane may start before its review PASS | Old Ticket 30 / cluster F; shared replacement for Old Tickets 25–31. |
| 26 | Deterministic remaining-source materialization | Ticket 25 independent review PASS | 用一个 deterministic, replayable, atomic batch script 为其余 31 张纸生成 byte-bound source candidates。该票只做 byte copy/binding、digest、descriptor、candidate generation 和机械 verifier；不宣称 Profile、official answer、source-span boundary 或 canonical readiness。 | paper-2020-bing, paper-2020-i, paper-2020-ii, paper-2020-jia, paper-2021-i, paper-2021-ii, paper-2021-jia, paper-2021-yi, paper-2022-i, paper-2022-ii, paper-2022-jia, paper-2022-yi, paper-2023-i, paper-2023-ii, paper-2023-jia, paper-2023-yi, paper-2024-i, paper-2024-ii, paper-2024-jia, paper-2025-ii, paper-960d0f8d, paper-zj-2020-jan, paper-zj-2020-jul, paper-zj-2021-jan, paper-zj-2021-jun, paper-zj-2022-jan, paper-zj-2022-jun, paper-zj-2023-jan, paper-zj-2024-jan, paper-zj-2025-jan, paper-zj-2026-jan | 31 papers; B2043/F2244; 940,273 raw bytes; atomic fail. | gpt-5.6-luna / max | serial mechanical expand before the three semantic lanes | Old Tickets 25–31 shared mechanical expand. |
| 27 | NCK1 closure — `paper-2020-ii` | 26 | 该纸 source、Profile、official answers、family evidence和 inactive slots 全闭合并 zero-write compile ready。 只创建新的 immutable evidence或显式 review decision；不迁移、不发布、不改历史 bytes。 | paper-2020-ii | B67/F73. | gpt-5.6-terra / high | NCK1; separate worktree from the exact Ticket 26 PASS commit; serial inside this lane | Old Ticket 29 / cluster E. |
| 28 | NCK1 closure — `paper-2021-i` | 27 | 该纸 source、Profile、official answers、family evidence和 inactive slots 全闭合并 zero-write compile ready。 只创建新的 immutable evidence或显式 review decision；不迁移、不发布、不改历史 bytes。 | paper-2021-i | B67/F72. | gpt-5.6-terra / high | NCK1; separate worktree from the exact Ticket 26 PASS commit; serial inside this lane | Old Ticket 30 / cluster F. |
| 29 | NCK1 closure — `paper-2023-ii` | 28 | 该纸 source、Profile、official answers、family evidence和 inactive slots 全闭合并 zero-write compile ready。 只创建新的 immutable evidence或显式 review decision；不迁移、不发布、不改历史 bytes。 | paper-2023-ii | B68/F73. | gpt-5.6-terra / high | NCK1; separate worktree from the exact Ticket 26 PASS commit; serial inside this lane | Old Ticket 27 / cluster C. |
| 30 | NCK1 closure — `paper-2024-i` | 29 | 该纸 source、Profile、official answers、family evidence和 inactive slots 全闭合并 zero-write compile ready。 只创建新的 immutable evidence或显式 review decision；不迁移、不发布、不改历史 bytes。 | paper-2024-i | B67/F73. | gpt-5.6-terra / high | NCK1; separate worktree from the exact Ticket 26 PASS commit; serial inside this lane | Old Ticket 29 / cluster E. |
| 31 | NCK1 closure — `paper-2023-i` | 30 | 该纸 source、Profile、official answers、family evidence和 inactive slots 全闭合并 zero-write compile ready，关闭已知 source anomaly。 只创建新的 immutable evidence或显式 review decision；不迁移、不发布、不改历史 bytes。 | paper-2023-i | B67/F73. | gpt-5.6-terra / high | NCK1; separate worktree from the exact Ticket 26 PASS commit; serial inside this lane | Old Ticket 28 / cluster D. |
| 32 | NCK1 closure — `paper-2024-ii` | 31 | 该纸 source、Profile、official answers、family evidence和 inactive slots 全闭合并 zero-write compile ready。 只创建新的 immutable evidence或显式 review decision；不迁移、不发布、不改历史 bytes。 | paper-2024-ii | B68/F74. | gpt-5.6-terra / high | NCK1; separate worktree from the exact Ticket 26 PASS commit; serial inside this lane | Old Ticket 28 / cluster D. |
| 33 | NCK1 closure — `paper-2025-ii` | 32 | 该纸 source、Profile、official answers、family evidence和 inactive slots 全闭合并 zero-write compile ready。 只创建新的 immutable evidence或显式 review decision；不迁移、不发布、不改历史 bytes。 | paper-2025-ii | B68/F74. | gpt-5.6-terra / high | NCK1; separate worktree from the exact Ticket 26 PASS commit; serial inside this lane | Old Ticket 29 / cluster E. |
| 34 | NCK1 closure — `paper-zj-2025-jan` | 33 | 该纸 source、Profile、official answers、family evidence和 inactive slots 全闭合并 zero-write compile ready。 只创建新的 immutable evidence或显式 review decision；不迁移、不发布、不改历史 bytes。 | paper-zj-2025-jan | B68/F73. | gpt-5.6-terra / high | NCK1; separate worktree from the exact Ticket 26 PASS commit; serial inside this lane | Old Ticket 26 / cluster B. |
| 35 | NCK1 closure — `paper-zj-2026-jan` | 34 | 该纸 source、Profile、official answers、family evidence和 inactive slots 全闭合并 zero-write compile ready。 只创建新的 immutable evidence或显式 review decision；不迁移、不发布、不改历史 bytes。 | paper-zj-2026-jan | B68/F73. | gpt-5.6-terra / high | NCK1; separate worktree from the exact Ticket 26 PASS commit; serial inside this lane | Old Ticket 27 / cluster C. |
| 36 | NCK1 closure — `paper-zj-2024-jan` | 35 | 该纸 source、Profile、official answers、family evidence和 inactive slots 全闭合并 zero-write compile ready。 只创建新的 immutable evidence或显式 review decision；不迁移、不发布、不改历史 bytes。 | paper-zj-2024-jan | B68/F73. | gpt-5.6-terra / high | NCK1; separate worktree from the exact Ticket 26 PASS commit; serial inside this lane | Old Ticket 31 / cluster G. |
| 37 | NCK1 closure — `paper-2020-i` | 36 | 该纸 source、Profile、official answers、family evidence和 inactive slots 全闭合并 zero-write compile ready，处理多个 source-bound marker anomalies。 只创建新的 immutable evidence或显式 review decision；不迁移、不发布、不改历史 bytes。 | paper-2020-i | B67/F73. | gpt-5.6-terra / high | NCK1; separate worktree from the exact Ticket 26 PASS commit; serial inside this lane | Old Ticket 28 / cluster D. |
| 38 | NCK1 mixed-marker outlier — `paper-960d0f8d` | 37 | 以已匹配 digest 的原始 DOCX 关闭 local ordinal 与 mixed-marker dialect，并完成 source、Profile、official answers、family evidence和 inactive-slot zero-write readiness。 只创建新的 immutable evidence或显式 review decision；不迁移、不发布、不改历史 bytes。 | paper-960d0f8d | B69/F79. | gpt-5.6-terra / max | NCK1; separate worktree from the exact Ticket 26 PASS commit; serial inside this lane | Old Ticket 25 / cluster A. |
| 39 | NCK1 closure — `paper-2021-ii` | 38 | 该纸 source、Profile、official answers、family evidence和 inactive slots 全闭合并 zero-write compile ready。 只创建新的 immutable evidence或显式 review decision；不迁移、不发布、不改历史 bytes。 | paper-2021-ii | B67/F73. | gpt-5.6-terra / high | NCK1; separate worktree from the exact Ticket 26 PASS commit; serial inside this lane | Old Ticket 31 / cluster G. |
| 40 | NCK1 closure — `paper-2022-i` | 39 | 该纸 source、Profile、official answers、family evidence和 inactive slots 全闭合并 zero-write compile ready。 只创建新的 immutable evidence或显式 review decision；不迁移、不发布、不改历史 bytes。 | paper-2022-i | B68/F74. | gpt-5.6-terra / high | NCK1; separate worktree from the exact Ticket 26 PASS commit; serial inside this lane | Old Ticket 26 / cluster B. |
| 41 | NCK1 closure — `paper-2022-ii` | 40 | 该纸 source、Profile、official answers、family evidence和 inactive slots 全闭合并 zero-write compile ready。 只创建新的 immutable evidence或显式 review decision；不迁移、不发布、不改历史 bytes。 | paper-2022-ii | B67/F73. | gpt-5.6-terra / high | NCK1; separate worktree from the exact Ticket 26 PASS commit; serial inside this lane | Old Ticket 25 / cluster A. |
| 42 | NCK1 closure — `paper-zj-2023-jan` | 41 | 该纸 source、Profile、official answers、family evidence和 inactive slots 全闭合并 zero-write compile ready，完成 NCK1 lane。 只创建新的 immutable evidence或显式 review decision；不迁移、不发布、不改历史 bytes。 | paper-zj-2023-jan | B68/F74. | gpt-5.6-terra / high | NCK1; separate worktree from the exact Ticket 26 PASS commit; serial inside this lane | Old Ticket 30 / cluster F. |
| 43 | National-legacy seam — `paper-2024-jia` | 26 | 证明首张 national-legacy source/Profile seam，覆盖 325,178-byte rich DOCX，并完成该纸 zero-write readiness。 只创建新的 immutable evidence或显式 review decision；不迁移、不发布、不改历史 bytes。 | paper-2024-jia | B63/F87. | gpt-5.6-terra / max | national-legacy; separate worktree from the exact Ticket 26 PASS commit; serial inside this lane | Old Ticket 28 / cluster D. |
| 44 | National-legacy closure — `paper-2020-bing` | 43 | 该纸 source、Profile、official answers、family evidence和 inactive slots 全闭合并 zero-write compile ready。 只创建新的 immutable evidence或显式 review decision；不迁移、不发布、不改历史 bytes。 | paper-2020-bing | B63/F68. | gpt-5.6-terra / high | national-legacy; separate worktree from the exact Ticket 26 PASS commit; serial inside this lane | Old Ticket 27 / cluster C. |
| 45 | National-legacy closure — `paper-2020-jia` | 44 | 该纸 source、Profile、official answers、family evidence和 inactive slots 全闭合并 zero-write compile ready。 只创建新的 immutable evidence或显式 review decision；不迁移、不发布、不改历史 bytes。 | paper-2020-jia | B64/F70. | gpt-5.6-terra / high | national-legacy; separate worktree from the exact Ticket 26 PASS commit; serial inside this lane | Old Ticket 26 / cluster B. |
| 46 | National-legacy closure — `paper-2021-jia` | 45 | 该纸 source、Profile、official answers、family evidence和 inactive slots 全闭合并 zero-write compile ready。 只创建新的 immutable evidence或显式 review decision；不迁移、不发布、不改历史 bytes。 | paper-2021-jia | B62/F67. | gpt-5.6-terra / high | national-legacy; separate worktree from the exact Ticket 26 PASS commit; serial inside this lane | Old Ticket 29 / cluster E. |
| 47 | National-legacy closure — `paper-2021-yi` | 46 | 该纸 source、Profile、official answers、family evidence和 inactive slots 全闭合并 zero-write compile ready。 只创建新的 immutable evidence或显式 review decision；不迁移、不发布、不改历史 bytes。 | paper-2021-yi | B63/F69. | gpt-5.6-terra / high | national-legacy; separate worktree from the exact Ticket 26 PASS commit; serial inside this lane | Old Ticket 28 / cluster D. |
| 48 | National-legacy closure — `paper-2022-jia` | 47 | 该纸 source、Profile、official answers、family evidence和 inactive slots 全闭合并 zero-write compile ready。 只创建新的 immutable evidence或显式 review decision；不迁移、不发布、不改历史 bytes。 | paper-2022-jia | B63/F69. | gpt-5.6-terra / high | national-legacy; separate worktree from the exact Ticket 26 PASS commit; serial inside this lane | Old Ticket 29 / cluster E. |
| 49 | National-legacy closure — `paper-2022-yi` | 48 | 该纸 source、Profile、official answers、family evidence和 inactive slots 全闭合并 zero-write compile ready。 只创建新的 immutable evidence或显式 review decision；不迁移、不发布、不改历史 bytes。 | paper-2022-yi | B63/F69. | gpt-5.6-terra / high | national-legacy; separate worktree from the exact Ticket 26 PASS commit; serial inside this lane | Old Ticket 30 / cluster F. |
| 50 | National-legacy closure — `paper-2023-jia` | 49 | 该纸 source、Profile、official answers、family evidence和 inactive slots 全闭合并 zero-write compile ready。 只创建新的 immutable evidence或显式 review decision；不迁移、不发布、不改历史 bytes。 | paper-2023-jia | B63/F69. | gpt-5.6-terra / high | national-legacy; separate worktree from the exact Ticket 26 PASS commit; serial inside this lane | Old Ticket 27 / cluster C. |
| 51 | National-legacy closure — `paper-2023-yi` | 50 | 该纸 source、Profile、official answers、family evidence和 inactive slots 全闭合并 zero-write compile ready，完成 national-legacy lane。 只创建新的 immutable evidence或显式 review decision；不迁移、不发布、不改历史 bytes。 | paper-2023-yi | B62/F68. | gpt-5.6-terra / high | national-legacy; separate worktree from the exact Ticket 26 PASS commit; serial inside this lane | Old Ticket 30 / cluster F. |
| 52 | Zhejiang-legacy seam — `paper-zj-2020-jan` | 26 | 证明首张 Zhejiang dual-session/Profile source seam，并完成该纸 zero-write readiness。 只创建新的 immutable evidence或显式 review decision；不迁移、不发布、不改历史 bytes。 | paper-zj-2020-jan | B66/F72. | gpt-5.6-terra / max | Zhejiang-legacy; separate worktree from the exact Ticket 26 PASS commit; serial inside this lane | Old Ticket 31 / cluster G. |
| 53 | Zhejiang-legacy closure — `paper-zj-2021-jan` | 52 | 该纸 source、Profile、official answers、family evidence和 inactive slots 全闭合并 zero-write compile ready。 只创建新的 immutable evidence或显式 review decision；不迁移、不发布、不改历史 bytes。 | paper-zj-2021-jan | B66/F72. | gpt-5.6-terra / high | Zhejiang-legacy; separate worktree from the exact Ticket 26 PASS commit; serial inside this lane | Old Ticket 26 / cluster B. |
| 54 | Zhejiang-legacy closure — `paper-zj-2020-jul` | 53 | 该纸 source、Profile、official answers、family evidence和 inactive slots 全闭合并 zero-write compile ready。 只创建新的 immutable evidence或显式 review decision；不迁移、不发布、不改历史 bytes。 | paper-zj-2020-jul | B66/F72. | gpt-5.6-terra / high | Zhejiang-legacy; separate worktree from the exact Ticket 26 PASS commit; serial inside this lane | Old Ticket 25 / cluster A. |
| 55 | Zhejiang-legacy closure — `paper-zj-2022-jan` | 54 | 该纸 source、Profile、official answers、family evidence和 inactive slots 全闭合并 zero-write compile ready。 只创建新的 immutable evidence或显式 review decision；不迁移、不发布、不改历史 bytes。 | paper-zj-2022-jan | B66/F72. | gpt-5.6-terra / high | Zhejiang-legacy; separate worktree from the exact Ticket 26 PASS commit; serial inside this lane | Old Ticket 27 / cluster C. |
| 56 | Zhejiang-legacy closure — `paper-zj-2021-jun` | 55 | 该纸 source、Profile、official answers、family evidence和 inactive slots 全闭合并 zero-write compile ready。 只创建新的 immutable evidence或显式 review decision；不迁移、不发布、不改历史 bytes。 | paper-zj-2021-jun | B65/F71. | gpt-5.6-terra / high | Zhejiang-legacy; separate worktree from the exact Ticket 26 PASS commit; serial inside this lane | Old Ticket 25 / cluster A. |
| 57 | Zhejiang-legacy closure — `paper-zj-2022-jun` | 56 | 该纸 source、Profile、official answers、family evidence和 inactive slots 全闭合并 zero-write compile ready，完成 Zhejiang-legacy lane。 只创建新的 immutable evidence或显式 review decision；不迁移、不发布、不改历史 bytes。 | paper-zj-2022-jun | B66/F72. | gpt-5.6-terra / high | Zhejiang-legacy; separate worktree from the exact Ticket 26 PASS commit; serial inside this lane | Old Ticket 31 / cluster G. |
| 58 | Full-corpus diagnostic and source-closure gate | Tickets 42, 51, and 57 plus serial integration of the NCK1, national-legacy, and Zhejiang-legacy lanes | 按固定顺序集成 Ticket 26 batch commit、NCK1 lane、national-legacy lane、Zhejiang-legacy lane，然后重跑 33-paper zero-write compiler。要求 33/33 source、official answer、Profile、family 与 inactive closure 有来源证明，所有 migration candidates ready，并关闭完整 accounting。 | Frozen 33-paper latest denominator, including the completed Ticket 24 pilot paper. | Full-corpus high-risk aggregate closure. | gpt-5.6-terra / max | join gate; sole owner of shared full-corpus accounting and route integration | Old Ticket 32; Old Tickets 25–31 closure. |
| 59 | Boundary canary 1 — local/outlier package | Ticket 58 independent review PASS | 原子迁移 `paper-960d0f8d`，完成 exact reload、Screen/Print/PDF、retry 与 rollback。 | paper-960d0f8d | One paper / 69 Ticket 22 baseline units; migration cost must be measured on the exact candidate. | gpt-5.6-terra / max | none; downstream route is serial | Old Ticket 33; historical Old Tickets 51–54. |
| 60 | Boundary canary 2 — national II | 59 | 原子迁移 `paper-2025-ii`，闭合相同 public seams 与 rollback。 | paper-2025-ii | One paper / 68 Ticket 22 baseline units; migration cost must be measured on the exact candidate. | gpt-5.6-terra / max | none; downstream route is serial | Old Ticket 34; historical Old Tickets 51–54. |
| 61 | Boundary canary 3 — seven-document low-cost shape | 60 | 原子迁移 `paper-2023-yi`，闭合相同 public seams 与 rollback。 | paper-2023-yi | One paper / 62 Ticket 22 baseline units; migration cost must be measured on the exact candidate. | gpt-5.6-terra / max | none; downstream route is serial | Old Ticket 35; historical Old Tickets 51–54. |
| 62 | Boundary canary 4 — Zhejiang dual-session shape | 61 | 原子迁移 `paper-zj-2022-jun`，闭合相同 public seams 与 rollback；汇总四个 boundary canaries。 | paper-zj-2022-jun | One paper / 66 Ticket 22 baseline units; migration cost must be measured on the exact candidate. | gpt-5.6-terra / max | none; downstream route is serial | Old Ticket 36; historical Old Tickets 51–54. |
| 63 | Measured migration cohort A | Ticket 62 independent review PASS | 逐纸 atomic publish、reload、Screen/Print/PDF、retry 与 rollback。 | paper-2022-i, paper-zj-2026-jan, paper-zj-2021-jan, paper-2020-jia, paper-2021-jia | 5 papers / 328 Ticket 22 baseline units; actual migration cost remains measured per paper. | gpt-5.6-terra / max | none; downstream route is serial | Old Ticket 37; historical Old Tickets 55–62. |
| 64 | Measured migration cohort B | 63 | 逐纸 atomic publish、reload、Screen/Print/PDF、retry 与 rollback。 | paper-2023-ii, paper-2020-i, paper-2023-i, paper-2020-bing, paper-2022-yi | 5 papers / 328 Ticket 22 baseline units; actual migration cost remains measured per paper. | gpt-5.6-terra / max | none; downstream route is serial | Old Ticket 38; historical Old Tickets 55–62. |
| 65 | Measured migration cohort C | 64 | 逐纸 atomic publish、reload、Screen/Print/PDF、retry 与 rollback。 | paper-2024-ii, paper-2020-ii, paper-2024-i, paper-2021-yi, paper-2023-jia | 5 papers / 328 Ticket 22 baseline units; actual migration cost remains measured per paper. | gpt-5.6-terra / max | none; downstream route is serial | Old Ticket 39; historical Old Tickets 55–62. |
| 66 | Measured migration cohort D | 65 | 逐纸 atomic publish、reload、Screen/Print/PDF、retry 与 rollback。 | paper-zj-2023-jan, paper-2021-i, paper-2025-i, paper-2022-jia, paper-2024-jia | 5 papers / 328 Ticket 22 baseline units; actual migration cost remains measured per paper. | gpt-5.6-terra / max | none; downstream route is serial | Old Ticket 40; historical Old Tickets 55–62. |
| 67 | Measured migration cohort E | 66 | 逐纸 atomic publish、reload、Screen/Print/PDF、retry 与 rollback。 | paper-zj-2024-jan, paper-2021-ii, paper-zj-2020-jan, paper-zj-2022-jan | 4 papers / 267 Ticket 22 baseline units; actual migration cost remains measured per paper. | gpt-5.6-terra / max | none; downstream route is serial | Old Ticket 41; historical Old Tickets 55–62. |
| 68 | Measured migration cohort F | 67 | 逐纸 atomic publish、reload、Screen/Print/PDF、retry 与 rollback，完成剩余 28-paper migration。 | paper-zj-2025-jan, paper-2022-ii, paper-zj-2020-jul, paper-zj-2021-jun | 4 papers / 266 Ticket 22 baseline units; actual migration cost remains measured per paper. | gpt-5.6-terra / max | none; downstream route is serial | Old Ticket 42; historical Old Tickets 55–62. |
| 69 | Full-corpus semantic, accounting, recovery and rollback closure | 68 | 关闭 33 papers / 273 Groups / 1,530 objective Questions / 1,035 A–D sets；证明无漏纸、重复 current、孤立 publication/journal，且 recovery 与 rollback 可重演。 | Frozen 33-paper denominator | Full-corpus high-risk aggregate; no fixed per-paper estimate. | gpt-5.6-terra / max | none; downstream route is serial | Old Ticket 43; historical Old Tickets 63–64. |
| 70 | Full-corpus Screen artifact closure | 69 | 汇总并独立验证 33-paper plain/lecture Screen 语义、答案可见性与 family coverage；不以 renderer 自报值自证。 | Frozen 33-paper denominator | 33-paper real Screen artifact closure. | gpt-5.6-terra / max | none; downstream route is serial | Old Ticket 44; historical Old Tickets 63–64 Screen. |
| 71 | Full-corpus Print/PDF artifact closure | 70 | 汇总并验证 Student/Teacher Print HTML 与 direct Chromium PDF 的 A4、语义、答案边界、分页和 rollback artifact proof。 | Frozen 33-paper denominator | 33-paper Student/Teacher Print HTML and direct-PDF closure. | gpt-5.6-terra / max | none; downstream route is serial | Old Ticket 45; historical Old Tickets 63–64 Print/PDF. |
| 72 | Retire Cloze legacy path | Ticket 71 independent review PASS | 先证明 canonical-only public behavior，再删除 Cloze legacy selection/fallback，并保留 rollback 证据。 | Cloze complete frozen denominator | One family retirement after full-corpus closure. | gpt-5.6-terra / high | none; downstream route is serial | Old Ticket 46; historical Old Ticket 65. |
| 73 | Retire Grammar Fill legacy path | 72 | 以相同顺序退休 Grammar Fill legacy selection/fallback，并保留 rollback 证据。 | Grammar Fill complete frozen denominator | One family retirement after full-corpus closure. | gpt-5.6-terra / high | none; downstream route is serial | Old Ticket 47; historical Old Ticket 66. |
| 74 | Retire Seven Choices legacy path | 73 | 以相同顺序退休 Seven Choices legacy selection/fallback，并保留 rollback 证据。 | Seven Choices complete frozen denominator | One family retirement after full-corpus closure. | gpt-5.6-terra / high | none; downstream route is serial | Old Ticket 48; historical Old Ticket 67. |
| 75 | Retire Reading legacy path | 74 | 以相同顺序退休 Reading legacy selection/fallback，并保留 rollback 证据。 | Reading complete frozen denominator | One family retirement after full-corpus closure. | gpt-5.6-terra / high | none; downstream route is serial | Old Ticket 49; historical Old Ticket 68. |
| 76 | Retire Application Writing legacy path | 75 | 以相同顺序退休 Application Writing legacy selection/fallback，并保留 rollback 证据。 | Application Writing complete frozen denominator | One family retirement after full-corpus closure. | gpt-5.6-terra / high | none; downstream route is serial | Old Ticket 50; historical Old Ticket 69. |
| 77 | Retire Continuation Writing legacy path | 76 | 最后退休 Continuation Writing；证明六 family 无 fallback/legacy selection，并完成 final legacy-retirement closure。 | Continuation Writing complete frozen denominator | One family retirement plus final six-family aggregate closure. | gpt-5.6-terra / high | none; downstream route is serial | Old Ticket 51; historical Old Ticket 70. |
| 78 | Post-retirement Owner QA | Ticket 77 independent review PASS | 从 exact reviewed HEAD provision 并打开完整可点击状态；真实检查 Screen、Student/Teacher Print/PDF、family transitions 与 legacy absence，并停在 owner verdict。 | Exact reviewed 33-paper post-retirement state | Full Screen/Print/PDF Owner QA provisioning. | gpt-5.6-terra / max | none; downstream route is serial | Old Ticket 52; historical Old Tickets 63–70 cross-cut Owner QA. |
| 79 | Repository-only release closeout | Ticket 78 Owner QA PASS | 完成 suite/CI、release receipts、≤5 行 STATUS 更新和 repository closeout；明确排除 production deploy、DB/config mutation、R2 sync/backfill。 | Repository-only release state | Repository closeout only; production remains out of scope. | gpt-5.6-terra / high | none; downstream route is serial | Old Ticket 53; historical Old Ticket 71. |

## Downstream obligations preserved

Tickets 58–79 shift the former Tickets 32–53 by exactly 26 numbers. Their
whole-paper semantic closure, Screen evidence, Student/Teacher Print HTML and
direct Chromium PDF evidence, recovery/retry/rollback, independent reviews,
Owner QA, ordered six-family legacy retirement, repository release closeout,
and production/R2 exclusions remain intact.

## Ticket publication SHA-256

| Ticket | SHA-256 |
| --- | --- |
| `docs/cuts/paper-canonical-unification/tickets/01-canonical-foundation.md` | `9e70c9e90fb4459dbc87b8d93181a15647aa3bb592c7a5388fe1710e56ae45e7` |
| `docs/cuts/paper-canonical-unification/tickets/02-route-authority-repair.md` | `04ce4fb192fee857f7170151283f83c63f0e650a70c189996ea0af608b55c19d` |
| `docs/cuts/paper-canonical-unification/tickets/03-cloze-grammar-canonical-publication.md` | `925ecfe91390903af0d9eedd497d8d01152a0deecfd8d8d0dacc5906d5a7b0d4` |
| `docs/cuts/paper-canonical-unification/tickets/04-shared-abcd-rendered-placement.md` | `16b5129c84e832337c4e2df5f3a39f8ec891846416aff7b94cc0141f89f67322` |
| `docs/cuts/paper-canonical-unification/tickets/05-cloze-grammar-canonical-consumption.md` | `55801572beb9f786da19d21e063a550a4a196fe9784dcc1190d67dc5b03819c5` |
| `docs/cuts/paper-canonical-unification/tickets/06-seven-choices-canonical-publication.md` | `a5dc27b0b2d06b0472b1aa0191c888226dc570d933130051c1a4e88d114749de` |
| `docs/cuts/paper-canonical-unification/tickets/07-seven-choices-rendered-behavior.md` | `c12880f871fc058ffa84aebcebae7ebf83445c2e9cd38733e5e98911ec46cc0f` |
| `docs/cuts/paper-canonical-unification/tickets/08-reading-canonical-publication.md` | `c116559d1a32a7e0f945734a8e28c853e178318c562af399818a508370b8bbf6` |
| `docs/cuts/paper-canonical-unification/tickets/09-reading-rendered-behavior.md` | `859f32b784a20e9fa14b3bc29f9ddc84ca4786a0fb402a933a1bfc57b02d0d9d` |
| `docs/cuts/paper-canonical-unification/tickets/10-application-writing-canonical-publication.md` | `1a6fa5adce51f15c8f68ad8c390531837f13877d5efec180ca7311cb07c7e833` |
| `docs/cuts/paper-canonical-unification/tickets/11-application-writing-rendered-behavior.md` | `284f12dd3a4eb511d5894be4d74ae3ab017edd4e4d0e5871c400f8a5e2e3db2d` |
| `docs/cuts/paper-canonical-unification/tickets/12-continuation-writing-canonical-publication.md` | `e2d28a7af7853e6d6af71a9725b44f7bbfce11e88480ba79906abdb530991abf` |
| `docs/cuts/paper-canonical-unification/tickets/13-continuation-writing-rendered-behavior.md` | `a8ceabbe8b0ceae7acdc4ca1b933ae3f4b71e999faf6e4146553c5af01578406` |
| `docs/cuts/paper-canonical-unification/tickets/14-listening-inactive-canonical-closure.md` | `d5836012a1b129319cbd4b0c75b3ee758401a0c9f5e1bb5b5fd9d4abfe7b177f` |
| `docs/cuts/paper-canonical-unification/tickets/15-listening-zero-occurrence-proof.md` | `e935b4dc172c92f9aa6458e70c60e65e5553a2d744d5ec09c63abd804b313439` |
| `docs/cuts/paper-canonical-unification/tickets/16-disconnect-generated-docx-capability.md` | `d9ae31b4ee66dcb273b909de651372ddf419df5ff177ef53171750e9b19c07ce` |
| `docs/cuts/paper-canonical-unification/tickets/17-delete-docx-output-implementation.md` | `7f5a548680805cc11229a51e116527b1f98b1020de53393b7206514da0b388bb` |
| `docs/cuts/paper-canonical-unification/tickets/18-atomic-canonical-import-admission.md` | `38b5b6f9f9384158635fac3b9464b14fcc3eefebb385f69cda51de7218a280e5` |
| `docs/cuts/paper-canonical-unification/tickets/19-import-recovery-retry-rollback.md` | `8c64afc35b5cd81e84a7ee92ad469b2f2ca21e07595b45697ce1bdbb93168aa6` |
| `docs/cuts/paper-canonical-unification/tickets/20-backend-canonical-import-pilot.md` | `f22ff0297edda9a3583a85556095afc262369062cb3ad713327b0a37c2a32cc8` |
| `docs/cuts/paper-canonical-unification/tickets/21-freeze-corpus-migration-ledger.md` | `92a62e7b6cf3834fc792cb186fc0655e7bcccea544fc3820b6646d63867eeff3` |
| `docs/cuts/paper-canonical-unification/tickets/22-full-corpus-zero-write-dry-run.md` | `5f1e175e1aea880a3f82db0f2812927f91d36feea13f915ca881cd5c4efdb103` |
| `docs/cuts/paper-canonical-unification/tickets/23-hard-measured-migration-replan.md` | `e29189f9b07716f2c31adae7d870f55c9db4cdd2edaa46863d11ab6914344a59` |
| `docs/cuts/paper-canonical-unification/tickets/24-costed-immutable-source-adapter-pilot.md` | `6ee03690b6b2ec483315242d6302995a6ec324fa798b2a8efeae6d692b81837c` |
| `docs/cuts/paper-canonical-unification/tickets/25-generic-docx-source-adapter-seam-and-nck1-proof.md` | `388b2f1cd7ac581a969ce539b7e7be083c8383a0dfc94efb3919c3aef950f014` |
| `docs/cuts/paper-canonical-unification/tickets/26-deterministic-remaining-source-materialization.md` | `47d4f31014418fe13672ee3065d1a95426622b4198e5a2d20a09825ff73b5d9c` |
| `docs/cuts/paper-canonical-unification/tickets/27-nck1-closure-paper-2020-ii.md` | `0bd2573bcf0a83b37a1564ce13af8b2a497f8778635f73ce1a53528b7ffaa73d` |
| `docs/cuts/paper-canonical-unification/tickets/28-nck1-closure-paper-2021-i.md` | `ba91ce7010e27d2fa224554956631483ed3d76ae8179d3f66476a1499c4f7ea0` |
| `docs/cuts/paper-canonical-unification/tickets/29-nck1-closure-paper-2023-ii.md` | `53700ad6332a90e54ddf1c6f0880f65c3511fab51425cd17505d968ea367048e` |
| `docs/cuts/paper-canonical-unification/tickets/30-nck1-closure-paper-2024-i.md` | `564d84156968f4247df20fc0628a9495a0e74c3e01c32ca019f27bf1be4d79aa` |
| `docs/cuts/paper-canonical-unification/tickets/31-nck1-closure-paper-2023-i.md` | `c41dea8895974bd108ccc5cbf10d7336bd1682c011daf49955656f3b155cfa60` |
| `docs/cuts/paper-canonical-unification/tickets/32-nck1-closure-paper-2024-ii.md` | `670d6fbc8d90792820a41944b991e9e948f1e03b31957c98e195ccc6f52c6e29` |
| `docs/cuts/paper-canonical-unification/tickets/33-nck1-closure-paper-2025-ii.md` | `be324a224d33f54b65d554bbbfe8fa820e87383e5593bf255fa5332ba1ce0079` |
| `docs/cuts/paper-canonical-unification/tickets/34-nck1-closure-paper-zj-2025-jan.md` | `b2cec0e9506b0bf656e6a3544425cd2fc65588acba5b02d57e5f11b6e2fd3aa0` |
| `docs/cuts/paper-canonical-unification/tickets/35-nck1-closure-paper-zj-2026-jan.md` | `d6b7e1c12d1822f9e7252cb99cb480d4d911b005a9dfa1823e9f4d9d0f5373b5` |
| `docs/cuts/paper-canonical-unification/tickets/36-nck1-closure-paper-zj-2024-jan.md` | `04199c80ce471e3509116c39e24aa0ec0ee9959811f0c17c049f2eeb5e21be53` |
| `docs/cuts/paper-canonical-unification/tickets/37-nck1-closure-paper-2020-i.md` | `7c40c5f5e2a4ee87f96d39346adc003341e81e43c1ec22b18232e3ba2e154e31` |
| `docs/cuts/paper-canonical-unification/tickets/38-nck1-mixed-marker-outlier-paper-960d0f8d.md` | `4302c01ce8d37c83f22be04deda7941f7a573dce886f211d717892f9fbc75193` |
| `docs/cuts/paper-canonical-unification/tickets/39-nck1-closure-paper-2021-ii.md` | `35d71560f62a7e08fdc0b2737a68da537033ee7ab81de85a31f04194a0f6c7cb` |
| `docs/cuts/paper-canonical-unification/tickets/40-nck1-closure-paper-2022-i.md` | `3d19071a43e3536fbceb84eae39d2cd9517cb8ce382a029b4da9c1924ea72dd6` |
| `docs/cuts/paper-canonical-unification/tickets/41-nck1-closure-paper-2022-ii.md` | `c5fb40d7aba0163d8c18926cb50e4cd67c5a071ab0a626a1b9b1834607393a41` |
| `docs/cuts/paper-canonical-unification/tickets/42-nck1-closure-paper-zj-2023-jan.md` | `b566dffabdb1c1afa343646301280a16a05d252184c61e132cf5487e46c18168` |
| `docs/cuts/paper-canonical-unification/tickets/43-national-legacy-seam-paper-2024-jia.md` | `2b6ab74669edfa02f83790a905af1ebaf9f07f02a3d72483584b1c0269c7584e` |
| `docs/cuts/paper-canonical-unification/tickets/44-national-legacy-closure-paper-2020-bing.md` | `ffed133d7e80a3578222844bc547d96389ec05f3f8038af59afef2521883fbaf` |
| `docs/cuts/paper-canonical-unification/tickets/45-national-legacy-closure-paper-2020-jia.md` | `12975f0644a9ece5d566162456e5b4d0b7da9a6ac21024c20f823c7159431efa` |
| `docs/cuts/paper-canonical-unification/tickets/46-national-legacy-closure-paper-2021-jia.md` | `e885fe61a5d3a4b6488442cca0307eb77de83b29fcb54c1ead7d5c649802c6aa` |
| `docs/cuts/paper-canonical-unification/tickets/47-national-legacy-closure-paper-2021-yi.md` | `d2be1f0298edeaaa6837d08f6ebe89c167a9a67a4b3319d69c23d976c9854d23` |
| `docs/cuts/paper-canonical-unification/tickets/48-national-legacy-closure-paper-2022-jia.md` | `c6bb023f85533c11cbffb90a20cc685fd530771ed6883af9af23f459ad407c4d` |
| `docs/cuts/paper-canonical-unification/tickets/49-national-legacy-closure-paper-2022-yi.md` | `d5eb18bd966ca323f12f7769c9cfddcf94198da3cd7e50ce25ffa95e6492e1b1` |
| `docs/cuts/paper-canonical-unification/tickets/50-national-legacy-closure-paper-2023-jia.md` | `023366dc5212339049a44c4c347099792c73287a2540bb9c37f44c8978b9287e` |
| `docs/cuts/paper-canonical-unification/tickets/51-national-legacy-closure-paper-2023-yi.md` | `bd209eb4f5ec2ef9d5cf5f8c27d5416f0bdb1114507d106c02313de60bdf9908` |
| `docs/cuts/paper-canonical-unification/tickets/52-zhejiang-legacy-seam-paper-zj-2020-jan.md` | `c54533f11aaa2af25244cbe78f06b758c4d8272a4cd3b4cfb8d9c6601fd6c12c` |
| `docs/cuts/paper-canonical-unification/tickets/53-zhejiang-legacy-closure-paper-zj-2021-jan.md` | `42c3f95f3260d88d5701481fd89db3ca8236c780597a24f2f07d9eaf37bf97a6` |
| `docs/cuts/paper-canonical-unification/tickets/54-zhejiang-legacy-closure-paper-zj-2020-jul.md` | `40ddf4441aa4e6047e7b5d9d39eba02e6b35e10998d55d013f8df85fab99e5da` |
| `docs/cuts/paper-canonical-unification/tickets/55-zhejiang-legacy-closure-paper-zj-2022-jan.md` | `5a000cc2204ed0cec11be06ad33ddd938a76ca78f7f924ec0141c8857de8c20b` |
| `docs/cuts/paper-canonical-unification/tickets/56-zhejiang-legacy-closure-paper-zj-2021-jun.md` | `e6c66b4f6f4fbd48ebea2793c57c16816e82497576a6111fcd95edd3a852e581` |
| `docs/cuts/paper-canonical-unification/tickets/57-zhejiang-legacy-closure-paper-zj-2022-jun.md` | `78d2ecce3564f2e0187b3337e13d26c99954599d8ca4945ec2451eeaa7a7c015` |
| `docs/cuts/paper-canonical-unification/tickets/58-full-corpus-diagnostic-and-source-closure-gate.md` | `82cbd60de92e7c3598268b024a91596acdac597cc89a357ea885948ee3ee46b4` |
| `docs/cuts/paper-canonical-unification/tickets/59-boundary-canary-local-outlier-package.md` | `43cf160c80ee7820120c286d249ffad3b8f5038984cd1bf960d314cdde473a98` |
| `docs/cuts/paper-canonical-unification/tickets/60-boundary-canary-national-ii.md` | `387a1b6475573f84b11b8d4e47168880f867d7b273e31e94f8f2d27ba3ae53be` |
| `docs/cuts/paper-canonical-unification/tickets/61-boundary-canary-seven-document-low-cost-shape.md` | `37813ccc3ff6a41f327a366eba63144767639e75e13a8e2995a9ac2440be9d58` |
| `docs/cuts/paper-canonical-unification/tickets/62-boundary-canary-zhejiang-dual-session-shape.md` | `f01c9d6fed843d8a189e1730879c38d872c128f68d7e0989315a6638c8632035` |
| `docs/cuts/paper-canonical-unification/tickets/63-measured-migration-cohort-a.md` | `c863b37c55c6e03d297617b7810b879a94fa7877e47e81826f8d6ea89fc5df15` |
| `docs/cuts/paper-canonical-unification/tickets/64-measured-migration-cohort-b.md` | `27c8d564cd3001812fc74008975aa8e6fdc127ab6d3a40305b9ea2f0b440ca56` |
| `docs/cuts/paper-canonical-unification/tickets/65-measured-migration-cohort-c.md` | `440dc4b8a2b4d5471402f044cfaf2e5bf02198a799e2ee6d557e2f219e5315b7` |
| `docs/cuts/paper-canonical-unification/tickets/66-measured-migration-cohort-d.md` | `07148c60a1249738d7dc2438955e7c19bcf7bc7edf1fc7c474fb619853fbb662` |
| `docs/cuts/paper-canonical-unification/tickets/67-measured-migration-cohort-e.md` | `ab11897252859c8acac5ce0a9aaf5893c23c29fe8f103f6ec35358833bac9c99` |
| `docs/cuts/paper-canonical-unification/tickets/68-measured-migration-cohort-f.md` | `fa4915643ffaf5f024812b9f5425040885b138acbe3c06186fa93b0d11ac0e94` |
| `docs/cuts/paper-canonical-unification/tickets/69-full-corpus-semantic-accounting-recovery-rollback-closure.md` | `0386265e5757200e2990c0472c9249a1d29df8214933b5df8337739306489edd` |
| `docs/cuts/paper-canonical-unification/tickets/70-full-corpus-screen-artifact-closure.md` | `123d7f52142572a6ecd5e9f9ae872950d600176fc691a31f06f85931afa59f30` |
| `docs/cuts/paper-canonical-unification/tickets/71-full-corpus-print-pdf-artifact-closure.md` | `dcb932285ace08a25490b1cbc2160d910db2be6baa21ddfa785deb218f54c042` |
| `docs/cuts/paper-canonical-unification/tickets/72-retire-cloze-legacy-path.md` | `7408cdacf5599da23a23eeaed21cf82d9d8988ce35f6fea8b7f8f5ed61b9e819` |
| `docs/cuts/paper-canonical-unification/tickets/73-retire-grammar-fill-legacy-path.md` | `719c3244c8e26594b8e68b57a2d619060d3c97de43a8e80c8a95dd673918f51b` |
| `docs/cuts/paper-canonical-unification/tickets/74-retire-seven-choices-legacy-path.md` | `0176100a27dffdb40f5964ac474e2aac49bfef87c3c7e1c7032e482edf333598` |
| `docs/cuts/paper-canonical-unification/tickets/75-retire-reading-legacy-path.md` | `ae65670e8fd3f9cad57e40f8e6538991de8acecf7b5ef32d9098d25477c51a61` |
| `docs/cuts/paper-canonical-unification/tickets/76-retire-application-writing-legacy-path.md` | `16645f66d71ef7b2a28a59b4793352610652d565008568a33bb389e8e7452926` |
| `docs/cuts/paper-canonical-unification/tickets/77-retire-continuation-writing-legacy-path.md` | `fa94b7e4f3d9aa64be98f78b82871b9051756e742e21d7ff79a6ec198460380f` |
| `docs/cuts/paper-canonical-unification/tickets/78-post-retirement-owner-qa.md` | `eb2736a02cb853dac826bd32ce837edcf684b4491296a4ccc174ccc66ec42448` |
| `docs/cuts/paper-canonical-unification/tickets/79-repository-only-release-closeout.md` | `1f706751cbc159acce734bd69d819eeed4ea7796a357f5d08172e2b5fc5276e7` |

## Publication boundary

This manifest publishes route authority only. It does not implement, dispatch,
open, fork, or begin Ticket 25 or any parallel lane.
