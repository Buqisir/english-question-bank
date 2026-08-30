# 06 — 扫描 PDF 的 OCR evidence 与 Agent 转写闭合

- Status: implemented at synthetic/public seam; Agent closure policy implemented; ordered-image
  real pre-review complete, scanned-PDF real QA pending
- Blocked by: `03-text-layer-pdf-materializer.md`, `01-source-region-review-pairing.md`
- Priority: P0, required by the image-pair release track
- Next on PASS: `09-ordered-image-source-bundle.md` has reused this seam and implemented the
  shared OCR evidence seam; mixed carriers remain later.

- Spec: `docs/cuts/import-format-capabilities/spec.md`
- Matrix rows: C03, T01–T04, T06, R02, R05

## Outcome

扫描题卷先产生可重放、可定位的OCR observations；Agent对照不可变原页闭合转写、顺序和
content-vs-furniture后，ordered items进入ticket 03的同一carrier-neutral parser。OCR文字、
阅读顺序或shape判断在闭合前不是Canonical权威；confidence和alternatives只作诊断，不是
清晰纯文字页的流程门禁。真正未识别块、顺序歧义或覆盖不闭合仍阻断Candidate。Owner只在
完整Candidate阶段做人类验收；历史`/ops/`逐页OCR确认保留作异常回退和旧revision兼容。
该seam同时服务ticket 09的原始图片页，不另建更宽松的OCR路径。

## Input and fixture

代码从完整但极短的anonymous synthetic NCK1 text PDF生成image-only PDF pair：

- 题卷共4页，覆盖标准9 groups/45 answers所需的heading、短段、题号、ABCD与blank；
- page 2另放一个tiny synthetic visual；
- 独立1页synthetic answer scan，只有短答案token、短写作范文和一个必须丢弃的详解陷阱。

fixture 保留 page raster digest，不含真实卷文字。OCR engine fixture 固定输出正例 token、
confidence、bbox；回归证明low-confidence alternatives只保留诊断，不阻断Agent闭合；负例
逐一修改order graph、visual classification、page coverage、raster digest或closure digest，
避免测试依赖在线服务或模型漂移。

## Public seam

- Source Capture 保存 immutable PDF 与逐页 raster recipe/digest；OCR sidecar只保存
  engine name/version、page、normalized bbox、text、confidence、alternatives 和 reading-order
  edges，不增加第二套 Canonical text model。
- `stage-ocr`列出原图page/region、OCR token和诊断信息；Agent closure绑定source digest、
  observation IDs与闭合后文本/顺序，源变化后自动失效。furniture region复用ticket 01 source
  crop + 真实Screen seam；旧的独立OCR revision仍可在`/ops/`核对异常内容，但不是默认步骤。
- 只有全部content regions已分类、文字/ordering已由Agent对照原页闭合且页coverage闭合，
  adapter 才输出 ticket 03 的 carrier-neutral ordered paragraph/table/question items。
- 修正evidence/closure后可在同一paper安全重产：只有receipt仍匹配同paper/schema、source
  digest确实变化、既有Review存在、output及receipt绑定media均未被Agent修改时，才清除旧的
  producer-owned output并重建；任何Agent改动一律拒绝覆盖。
- AI/OCR 可提出候选与差异，但只能服务“确认转写、顺序、content-vs-furniture”三个明确
  QA 任务；不得自动确认或用语言模型补写缺词。

## Detection and failure

- `NCK1_OCR_TEXT_LAYER_REQUIRED`：ticket 03 识别为 scan，必须显式转 OCR workflow。
- `NCK1_OCR_CONFIDENCE_REVIEW_REQUIRED`：仅兼容已finalize的历史OCR review revision；新流程不生成。
- `NCK1_OCR_READING_ORDER_AMBIGUOUS`：region graph不唯一。
- `NCK1_OCR_PAGE_COVERAGE_INCOMPLETE`：页面存在未分类 region 或 raster/source不闭合。
- `NCK1_OCR_VISUAL_CLASSIFICATION_REQUIRED`：图、表、正文或 furniture 无法确定。
- `NCK1_OCR_CONFIRMATION_STALE`：engine/source/observation digest 已变。

所有 code 都带 document/page/region；不允许静默删低置信 token、把 tiny image 当字符、按
最近 heading 猜 section，或对失败页回退为整页 Canonical screenshot。

## Acceptance criteria

- [x] 清晰页产生 deterministic observations；Agent未对照闭合时 Candidate 为 non-ready。
- [x] Agent closure sidecar后，同一 ordered-item parser生成标准 NCK1 identity 与 `page_region` locators。
- [x] 低confidence/alternatives仅诊断；顺序歧义、未分类tiny image与缺页返回稳定code/region。
- [x] 修改 raster 或 OCR output digest 后旧closure失效。
- [x] 修订closure或升级旧producer可安全重产未被Agent改过的output；改过output或media时
  稳定拒绝覆盖。
- [x] Screen/Student/Teacher Print/PDF只消费确认后的同一 Canonical；整页 raster不进入正文。
- [x] `/ops/` OCR revision可作为异常回退核对文字、顺序与visual classification；它不提供
  Candidate issue/approval/Screen/Print/PDF或shipping能力，也不是普通文字的Owner门禁。
- [ ] 一份真实但只读、非CQ8扫描pair完成source/Agent closure/Candidate三面proof。

## Non-goals

OCR confidence自动批准/否决、生成式补写、OCR engine在线评测、任意多栏布局、手写识别、图表内容理解、
AI重画、把 OCR confidence 写进 Canonical、真实版权试卷 fixture。

## Verification

```bash
node scripts/verify-nck1-pdf-materialization-producer.mjs
node scripts/verify-nck1-ocr-source-evidence.mjs
node scripts/verify-nck1-source-materialization.mjs
node scripts/verify-import-review-ocr-confirmation.mjs
node scripts/verify-import-review-source-pairing.mjs
node scripts/verify-import-paper-routing.mjs
pnpm -C app verify:import-paper
```

final需对一份真实但只读、非CQ8扫描源做source/OCR/Agent closure/三面proof与独立
Standards/Spec review；不得提交、导入或发布该真实卷。
