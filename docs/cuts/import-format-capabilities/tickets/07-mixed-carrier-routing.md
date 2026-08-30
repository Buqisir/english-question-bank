# 07 — 混合载体的精确 adapter routing

- Status: planned
- Blocked by: `03-text-layer-pdf-materializer.md`, `06-scanned-pdf-ocr-evidence.md`
- Next on PASS: None

- Spec: `docs/cuts/import-format-capabilities/spec.md`
- Matrix rows: C04, T01, T06, R05

## Outcome

Universal materialize按 source role、document 和 page 的已检测 shape精确选择现有
DOCX、PDF-text 或 OCR adapter，并将结果合入一条 ordered-item stream。router只组合已经
supported 的能力；不自己解析正文、不解决语义冲突，也不把未支持页送给“最像”的adapter。

## Input and fixture

三组短 synthetic source sets：

1. question text PDF + official-answer DOCX；
2. question DOCX + official-answer text PDF；
3. question PDF 的 page 1 为文本层、page 2 为 scan + official-answer DOCX。

负例各只引入一种风险：同页文字/OCR区域重叠、页未被任何adapter认领、一个page被重复
认领、两个答案源互相冲突。每页只有短token，不含真实试卷内容。

## Public seam

- 扩现有 Universal source manifest/Materialization documents，不创建 parallel mixed schema。
- source-set planner先确定唯一 authoritative question coverage 和 official-answer source；每个
  document/page/region必须被恰好一个已支持 adapter认领，且记录 adapter id/version。
- DOCX 以顶层 ordered items为最小单元；PDF 以 page/region为最小单元。只有同一 PDF 内
  text/scan page可逐页路由；不得把重叠 adapter output按字符串相似度去重。
- router合并 carrier-neutral ordered items，并保留每项原始 locator与source role；ticket 03
  的 parser是唯一 section/question grouping seam。
- authoritative answers仍由 `init` 的 source role保证；AI/OCR不能生成或裁决答案。

## Detection and failure

- `NCK1_SOURCE_ROUTE_COVERAGE_INCOMPLETE`：source page/required role 无 adapter owner。
- `NCK1_SOURCE_ROUTE_OVERLAP`：一个 region被多个 adapter认领。
- `NCK1_SOURCE_ROUTE_ORDER_AMBIGUOUS`：跨 adapter邻接不唯一。
- `NCK1_SOURCE_ROLE_CONFLICT`：问题/答案 authority 不唯一或互相冲突。
- `NCK1_SOURCE_ADAPTER_UNSUPPORTED`：检测到的 carrier/shape没有 registered adapter。

任一失败使整个 Candidate non-ready并保留所有已捕获 source evidence；不得发布部分试卷、
按 manifest 顺序猜权威、回退 DOCX rendition或选择“错误较少”的adapter。

## Acceptance criteria

- [ ] 三组正例从 public CLI 产生同一 NCK1 slot/cardinality contract和完整 per-item locator。
- [ ] 每个 source region有且仅有一个 adapter id/version；合并顺序可从source evidence重放。
- [ ] overlap、gap、order ambiguity和answer conflict各有稳定 code及局部 evidence。
- [ ] DOCX-only/PDF-only/OCR-only既有 verifier保持不变，router不复制其 parser。
- [ ] 同一 Candidate进入真实 Screen、两种 Print 与 PDF；Review能跳回正确载体/页/区域。

## Non-goals

自动判断哪个答案“更对”、字符串 fuzzy merge、跨卷拼题、任意 MIME、通用工作流引擎、
paperId source precedence、OCR 自动确认、真实试卷 fixture。

## Verification

```bash
node scripts/verify-nck1-docx-materialization-producer.mjs
node scripts/verify-nck1-pdf-materialization-producer.mjs
node scripts/verify-nck1-ocr-source-evidence.mjs
node scripts/verify-universal-nck1-mixed-carrier-routing.mjs
node scripts/verify-nck1-source-materialization.mjs
node scripts/verify-universal-nck1-candidate-surfaces.mjs paper-synthetic-mixed-carrier
pnpm -C app verify:paper
pnpm -C app verify:all
```

final需三种 source set各一份真实但只读、非CQ8 smoke proof与独立 Standards/Spec review；
不得 materialize/publish真实数据。
