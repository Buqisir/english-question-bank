# 03 — 文本层 PDF Materialization producer

- Status: ready
- Blocked by: None（可与 ticket 01 串行交付，以获得局部 Review proof）
- Priority: P0, carrier-neutral parser required by the image-pair release track
- Next on PASS: `06-scanned-pdf-ocr-evidence.md`; mixed carriers remain later

- Spec: `docs/cuts/import-format-capabilities/spec.md`
- Matrix rows: C01, T01–T04, T06, R05

## Outcome

`universal-nck1 materialize` 对“题卷与答案都是可靠文本层、单栏、标准 NCK1 顺序的
PDF”走通通用 producer；scan、双栏阅读顺序和文字层不完整时稳定拒绝，不调用 OCR，
不回退 DOCX producer，不手写单卷 Materialization。

## Input and fixture

测试代码生成最短合法 NCK1 PDF pair：保留 9 slots/45 non-listening answers 的 profile
cardinality，但每题/段只用短 synthetic token。题卷包含普通段落、题号、ABCD、blank、
一个简单表；答案 PDF 只含短答案 token。负例：同页双栏、文字层缺页、扫描页、bbox
重叠导致 reading order 不唯一。

## Public seam

- 为 PDF 建 carrier adapter，输出与 `extractDocxDocumentStructure` 等价的 carrier-neutral
  ordered paragraph/table/question items和 `page_region` locators。
- 先把 `nck1DocxMaterializationProducer` 中与 carrier 无关的 section/question/answer
  grouping 提取为单一 parser；DOCX 与 PDF 都调用它。先用现有 DOCX verifier证明重构不改
  行为，再启用 PDF adapter。
- 使用 Poppler bbox/word evidence（或仓库已选的一个确定性等价物）建立行与段；source
  page/region来自原文字 bbox union。不得只保存 flattened `pdftotext` 字符串。
- `universal-nck1 materialize` 按完整 source-set shape 选择 exact adapter；本票只接受
  question PDF + answer PDF，不处理 mixed source。
- 输出继续是 `nck1-source-materialization-v1` 与既有 Canonical seam。

## Detection and failure

- `NCK1_PDF_TEXT_LAYER_MISSING`：页无可靠文字对象。
- `NCK1_PDF_TEXT_COVERAGE_INCOMPLETE`：page/line coverage 与 source bytes不闭合。
- `NCK1_PDF_READING_ORDER_AMBIGUOUS`：bbox排序有多个可行顺序。
- `NCK1_PDF_MULTI_COLUMN_UNSUPPORTED`：检测到多栏但未登记通用shape。
- `NCK1_PDF_SOURCE_SET_AMBIGUOUS`：不是exact PDF pair。

任何一页失败都生成 page/region evidence 与 non-ready review item；不调用 OCR、不丢页、
不按最近 heading 猜 section。

## Acceptance criteria

- [ ] synthetic PDF pair经 public CLI materialize/verify/build产生9 groups、45 answers与每个
  paragraph/question的`page_region`；source order可重放。
- [ ] 同一 carrier-neutral parser 的 DOCX fixture仍全绿。
- [ ] scan/双栏/缺页/reading-order ambiguity各自 stable fail，无 partial ready Candidate。
- [ ] Screen/Student/Teacher Print/PDF消费同一 Candidate；answer visibility不变。
- [ ] source table优先 semantic table；本票不支持的PDF table layout必须fail closed，不能截图。

## Non-goals

OCR、混合载体、任意分栏、header/footer furniture自动分类、绝对坐标布局引擎、真实试卷
fixture、paperId parser。

## Verification

```bash
node scripts/verify-nck1-docx-materialization-producer.mjs
node scripts/verify-nck1-pdf-materialization-producer.mjs
node scripts/verify-nck1-source-materialization.mjs
node scripts/verify-universal-nck1-publish.mjs
node scripts/verify-universal-nck1-candidate-surfaces.mjs paper-synthetic-pdf-text
pnpm -C app verify:paper
pnpm -C app verify:all
```

final需真实但只读的非CQ8文本层PDF source-region/Screen/Print/PDF proof和独立
Standards/Spec review；不得导入或发布该真实卷。
