# 05 — 普通表格的最小视觉意图

- Status: planned
- Blocked by: `02-docx-semantic-table-closure.md`, `01-source-region-review-pairing.md`, Owner确认表格视觉权威边界
- Next on PASS: None

- Spec: `docs/cuts/import-format-capabilities/spec.md`
- Matrix rows: B05, V02

## Outcome

在普通语义表不变的前提下，保留影响理解的边框存在性、相对列宽和cell对齐，并通过
shared projection进入Screen/Print/PDF。不实现完整Word表格样式或整页像素复制。

## Input and fixture

一个3列表：相对宽1:2:1、header横向居中/body左对齐、vertical middle/top、完整grid；
再各做`outer_only`与`none`边框。负例为虚线/双线/不一致cell line style及无法归一的
absolute width。所有文字为单token synthetic。

## Public seam

在已有table/cell上增加一个renderer-neutral presentation object，最小枚举建议：

- table `borderModel: grid | outer_only | none`
- table `columnWidthRatios: positive integer[]`（约分后的相对值，不存page pixels）
- cell `horizontalAlign: left | center | right`
- cell `verticalAlign: top | middle | bottom`

DOCX extractor从`tblBorders`, `tblGrid/gridCol`, `jc`, `vAlign`检测；Materialization和
Canonical只保存该枚举。shared adapter投影一次；Screen/Print把同一token映射为CSS。

## Fail closed

未知/冲突线型、宽度缺失导致比例不可信、merged cell对齐冲突返回
`NCK1_DOCX_TABLE_PRESENTATION_UNSUPPORTED`或
`NCK1_DOCX_TABLE_PRESENTATION_AMBIGUOUS`并带table selector。不得默默
改成100% grid后声称“忠实”。若Owner选择EQB统一样式，则同样需记录teacher-confirmed
normalization，而不是丢掉源差异。

## Acceptance criteria

- [ ] table semantics/digest identity不由presentation反推或改变。
- [ ] 三面的border model、列宽比例与对齐来自同一projection，允许px/pt单位差。
- [ ] merged/empty cells与ticket 02组合仍闭合。
- [ ] `/ops/` source crop与Screen能并排核四项意图。
- [ ] 不支持样式稳定拒绝；无per-paper CSS或任意style string。

## Non-goals

线条颜色/阴影/底纹/任意粗细、逐像素列宽、Word theme、nested table、整表截图。

## Verification

```bash
node scripts/verify-nck1-docx-materialization-producer.mjs
node scripts/verify-paper-canonical-mixed-table-media.mjs
node scripts/verify-paper-canonical-table-presentation.mjs
node scripts/verify-import-review-source-pairing.mjs
pnpm -C app verify:paper
pnpm -C app verify:all
```

final需真实但只读普通表Screen/Print/PDF/source pairing proof和独立Standards/Spec review。
