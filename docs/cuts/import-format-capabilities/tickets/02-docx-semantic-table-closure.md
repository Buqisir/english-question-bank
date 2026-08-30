# 02 — DOCX 表格语义闭合：纵向合并与真实空格

- Status: ready
- Blocked by: None（ticket 01 完成后可获得更好的视觉 QA，但不是代码依赖）
- Next on PASS: `05-table-presentation-intent.md`

- Spec: `docs/cuts/import-format-capabilities/spec.md`
- Matrix rows: B01–B04, R05

## Outcome

Universal DOCX producer 对非嵌套矩形表格稳定支持横向/纵向合并和源中真实空 cell；对
nested table、drawing cell、broken merge 分别给稳定 code，不再用一条宽泛 review code
和 `[Agent confirmation required]` 占位正文混在一起。

## Input and fixture

扩 `makeSyntheticNck1DocxFixture`，不加真实卷：一个 3×3 table，含一个 `gridSpan=2`、
一个跨两行 `vMerge`、一个确实存在但无文字/media的 cell。负例分别为 nested 1×1 table、
cell drawing、悬空 `vMerge continue`、重叠 span。

## Public seam

- 扩 `extractDocxDocumentStructure` 已有 table cell descriptors，不建 table wrapper。
- `tableBlock` 将 `vMerge restart/continue` 归约为已有 `rowSpan`；continue cell 不重复输出。
- Materialization table cell 的 ordered content 允许 `[]` 表示“源 cell 已确认存在且为空”；
  cell identity、geometry 与 table locator 仍是证据。缺 cell 仍是 rectangular failure，不能
  用 `[]` 填洞。
- Canonical rich table 和 shared surface adapter 保留 empty cell 与 rowSpan；Screen/
  Print/PDF 只画空 cell，不插入 placeholder。

## Fail closed

- `NCK1_DOCX_TABLE_NESTED_UNSUPPORTED`
- `NCK1_DOCX_TABLE_CELL_DRAWING_REVIEW_REQUIRED`
- `NCK1_DOCX_TABLE_VERTICAL_MERGE_INVALID`
- 继续使用 `MATERIALIZATION_TABLE_OVERLAP`, `MATERIALIZATION_TABLE_NOT_RECTANGULAR`,
  `MATERIALIZATION_TABLE_ROWSPAN_OVERFLOW`。

只有 immutable OOXML 明确存在的无文字、无 media、无 nested content cell 才能成为
empty content。解析异常或缺失 cell 绝不当“源为空”。

## Acceptance criteria

- [ ] fixture producer 输出 exact `columnSpan`, `rowSpan` 和 empty content，无占位正文。
- [ ] Canonical/Screen/Student Print/Teacher Print/PDF cell count、span 与 source grid一致。
- [ ] nested/drawing/broken merge 各自返回 source table selector + stable code，Candidate非ready。
- [ ] 简单表与无表 DOCX 输出 digest/顺序回归（行为性字段外不漂移）。
- [ ] 本票不解析边框、对齐、列宽，不添加 `paperId` 分支。

## Non-goals

嵌套表支持、任意 cell rich blocks、表格视觉样式、PDF table detection、整表截图 fallback。

## Verification

```bash
node scripts/verify-nck1-docx-materialization-producer.mjs
node scripts/verify-nck1-source-materialization.mjs
node scripts/verify-paper-canonical-mixed-table-media.mjs
node scripts/verify-paper-canonical-nck1-materialization-candidate.mjs
node scripts/verify-paper-canonical-ticket-33-shared-surface-proof.mjs
pnpm -C app verify:paper
pnpm -C app verify:all
```

共享 Paper contract 变更需一个真实但只读的 table Screen/Print/PDF proof 和独立
Standards/Spec review；不得用整表截图替代语义断言。
