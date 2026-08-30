# 06 — 扫描 PDF 的 OCR evidence 与人工确认

- Status: implemented at synthetic/public seam, including `/ops/` confirmation UX; real read-only QA pending
- Blocked by: `03-text-layer-pdf-materializer.md`, `01-source-region-review-pairing.md`
- Priority: P0, required by the image-pair release track
- Next on PASS: `09-ordered-image-source-bundle.md` has reused this seam and implemented the
  `/ops/` OCR confirmation UX; mixed carriers remain later.

- Spec: `docs/cuts/import-format-capabilities/spec.md`
- Matrix rows: C03, T01–T04, T06, R02, R05

## Outcome

扫描题卷先产生可重放、可定位、可由教师确认的 OCR observations；确认后的 ordered items
进入 ticket 03 的同一 carrier-neutral parser。OCR 文字、阅读顺序或 shape 判断在确认前
不是 Canonical 权威，任何低置信或覆盖不闭合的页都不能生成 ready Candidate。该 seam
同时服务 ticket 09 的原始图片页，图片发布不得另建更宽松的 OCR 路径。

## Input and fixture

代码从完整但极短的anonymous synthetic NCK1 text PDF生成image-only PDF pair：

- 题卷共4页，覆盖标准9 groups/45 answers所需的heading、短段、题号、ABCD与blank；
- page 2另放一个tiny synthetic visual；
- 独立1页synthetic answer scan，只有短答案token、短写作范文和一个必须丢弃的详解陷阱。

fixture 保留 page raster digest，不含真实卷文字。OCR engine fixture 固定输出正例 token、
confidence、bbox；负例逐一修改low-confidence alternatives、order graph、visual classification、
page coverage、raster digest或confirmation digest，避免测试依赖在线服务或模型漂移。

## Public seam

- Source Capture 保存 immutable PDF 与逐页 raster recipe/digest；OCR sidecar只保存
  engine name/version、page、normalized bbox、text、confidence、alternatives 和 reading-order
  edges，不增加第二套 Canonical text model。
- `stage-ocr`列出原图page/region、OCR token和未确认原因；人工确认记录绑定source digest、
  observation IDs与确认后文本/顺序，源变化后自动失效。确认后的furniture region复用ticket
  01 source crop + 真实Screen seam；pre-Canonical OCR token现可在独立OCR revision的`/ops/`
  界面核对，确认后由Agent拉取exact sidecar再生成独立Candidate revision。
- 只有全部 content regions 已分类、所有 promoted token/ordering 已确认且页 coverage 闭合，
  adapter 才输出 ticket 03 的 carrier-neutral ordered paragraph/table/question items。
- AI/OCR 可提出候选与差异，但只能服务“确认转写、顺序、content-vs-furniture”三个明确
  QA 任务；不得自动确认或用语言模型补写缺词。

## Detection and failure

- `NCK1_OCR_TEXT_LAYER_REQUIRED`：ticket 03 识别为 scan，必须显式转 OCR workflow。
- `NCK1_OCR_CONFIDENCE_REVIEW_REQUIRED`：任一 promoted token 低于登记阈值或有竞争候选。
- `NCK1_OCR_READING_ORDER_AMBIGUOUS`：region graph不唯一。
- `NCK1_OCR_PAGE_COVERAGE_INCOMPLETE`：页面存在未分类 region 或 raster/source不闭合。
- `NCK1_OCR_VISUAL_CLASSIFICATION_REQUIRED`：图、表、正文或 furniture 无法确定。
- `NCK1_OCR_CONFIRMATION_STALE`：engine/source/observation digest 已变。

所有 code 都带 document/page/region；不允许静默删低置信 token、把 tiny image 当字符、按
最近 heading 猜 section，或对失败页回退为整页 Canonical screenshot。

## Acceptance criteria

- [x] 清晰页产生 deterministic observations；未确认时 Candidate 为 non-ready。
- [x] 人工确认sidecar后，同一 ordered-item parser生成标准 NCK1 identity 与 `page_region` locators。
- [x] 低置信 glyph、顺序歧义、未分类 tiny image 与缺页分别返回稳定 code/region。
- [x] 修改 raster 或 OCR output digest 后旧确认失效。
- [x] Screen/Student/Teacher Print/PDF只消费确认后的同一 Canonical；整页 raster不进入正文。
- [x] `/ops/` 直接完成OCR observation文字、顺序与visual classification确认；OCR revision
  不提供Candidate issue/approval/Screen/Print/PDF或shipping能力。
- [ ] 一份真实但只读、非CQ8扫描pair完成source/OCR/确认/三面proof。

## Non-goals

自动批准、生成式纠错、OCR engine 在线评测、任意多栏布局、手写识别、图表内容理解、
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

final需对一份真实但只读、非CQ8扫描源做 source/OCR/确认/三面 proof 与独立
Standards/Spec review；不得提交、导入或发布该真实卷。
