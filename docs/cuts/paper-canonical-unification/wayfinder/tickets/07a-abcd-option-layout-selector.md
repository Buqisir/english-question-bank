# 定义 A–D 选项整组择形算法与金样卷 parity

Status: closed
Type: prototype
Claim: claimed
Blocked by: 盘点全库 latest 资产与所有生产消费变体; 确定模块化试卷标准与机器权威结构; 定义题组通用 envelope 与 rich content nodes
Next on PASS: `docs/cuts/paper-canonical-unification/wayfinder/tickets/08-seven-choices-canonical-variant.md`
Terminal: no
Map: `docs/cuts/paper-canonical-unification/wayfinder/map.md`

## Question

Using NEEA gold-reference page 4 questions 21–23, page 9 cloze, and the reproducible current-asset width census, what deterministic renderer-only selector should choose one layout for a complete per-question A–D option set: `four_columns` (`A B C D`), `two_by_two` (`A B` / `C D`, row-major), or `one_column` (`A` / `B` / `C` / `D`)? Prototype a small pure interface and representative Screen/Print, PDF, and DOCX projections that try modes densest-first against the target 10.5pt font, A4 content width, labels, indents, and gutters; raw character count or word count alone is not acceptable without corpus evidence. No four- or two-column candidate may rely on per-option wrapping, CSS auto-placement, or a late option falling into a hybrid extra row: if any option does not fit, the entire set moves to the next mode. Decide the conservative measurement method, cross-renderer determinism, safety margin, explicit line-break handling, and the fail-closed or hanging-indent policy when even one-column width is exceeded. The selector must consume canonical option content without storing layout in canonical semantics, must preserve cloze's tab-aligned four-column gold case, and must not govern Seven Choices A–G or listening A–C.

## Resolution

[Prototype verdict and runnable shell](../../prototypes/abcd-option-layout-selector/NOTES.md)

采用 renderer-typography deep module 的单一公开 interface
`layoutAbcdOptionSet(optionSet)`：它只接收 question-owned、严格 A/B/C/D 的
canonical option content，内部完成 pinned font shaping、fixed-point fit、
densest-first fallback 与 explicit placement plan；canonical semantics 不保存
mode/width，Screen/Print、PDF、DOCX 也不得重新测量或重选。A–G group bank 与
listening A–C 明确返回 `not_applicable`。

物理算法以 twip 为共同单位：A4 选项行 8764 twip，四列起点
`0/2080/4160/6240`，two-by-two 起点 `0/4020`，最小 gutter 420 twip，
每 track 再留 20 twip（1pt）安全量。四列与两列均要求整组四项在各自 track
单行 fit 且无 hard break；任一项失败则整组降级。one-column 用 420 twip
hanging indent，保留显式换行并只在合法 break opportunity 换行；可换行的
超宽内容继续用 one-column，单个不可分割片段仍超宽、字体闭包/字形缺失或
unsupported node 则 fail closed 为 `needs_review`，不得裁切、缩字或写回
canonical hint。

金样卷 page 4 q21/q22/q23 分别得到 `four_columns` / `one_column` /
`two_by_two`；page 9 十五行完形的 A/B/C/D 列最大 advance 全部保留
`four_columns`。用相同固定 tab 规则重算既有 1035-set Canvas census，结果为
641 / 330 / 64；570 个 cloze 为 565 / 5 / 0，`paper-2026-i` 的 15 个 cloze
全为四列。既有 corpus 仍无真实不可分割 full-width overflow，因此该分支只用
明确标注的 synthetic fail-closed fixture。

三类 projection 共用同一 logical placement signature：Screen/Print 使用显式
CSS grid row/column 且禁止 auto-flow，PDF 使用 `twip / 20` 的固定点位，DOCX
使用原生 tab stops 或 one-column hanging paragraphs。未来 conformance gate
须对 actual Screen/Print、PDF、DOCX 证明 mode/row/order parity、点位误差不超过
1pt、dense mode 零换行，以及 15 行 cloze 各列 x-spread 不超过 0.5pt。

Verify:

- `pnpm -C app run prototype:abcd-options -- --all` — 8/8 fixtures
  `matchesExpected: true`; every selected fixture
  `projectionParity: true`.
- `node --check docs/cuts/paper-canonical-unification/prototypes/abcd-option-layout-selector/selector-prototype.mjs`
- `jq empty app/package.json`
- `git diff --check`
