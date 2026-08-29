# 09 — 有序题卷/答案图片 bundle

- Status: implemented on synthetic/public seams; real non-production Owner QA pending
- Blocked by: `01-source-region-review-pairing.md`, `06-scanned-pdf-ocr-evidence.md`
- Priority: P0, first business release capability
- Owner decision: `/ops/` OCR source comparison and human confirmation are in this ticket,
  not a later optional polish ticket
- Next on PASS: image-pair sources are eligible for a separate authorized real-paper import task

- Spec: `docs/cuts/import-format-capabilities/spec.md`
- Matrix rows: C07, C03, T01, T06, R02, R05

## Outcome

一组整页 PNG/JPEG/WebP 可以作为一个显式排序的 question 或 official-answer source document
进入 Universal intake。每页原始像素、顺序、尺寸和digest保留；文字识别复用 ticket 06 的
page-raster OCR seam，不把“图片卷”做成第二套 parser。这是第一项发布目标：题卷和答案
都只有图片时，也能经教师确认形成真实 Screen、Student/Teacher Print 与 PDF。

## Input and fixture

- question bundle：4张代码生成的 synthetic page images，混合 PNG/JPEG/lossless WebP；用最短token闭合
  标准NCK1的9个active slots和45项作答，只含清晰单栏文字、题号、选项与blank。
- answer bundle：1张synthetic compact answer-key image，完整覆盖45项作答值，包括56–65
  的短文本答案；不能只有选择题ABCD。
- 输入顺序显式写为 question page 1–4、answer page 1，不依赖文件名排序、EXIF时间或
  目录遍历顺序。
- 负例：漏页码、重复页码、digest漂移、不支持的GIF、两页被声明为同一页、低置信文字、
  多栏或无法分类的视觉形状。

## Public seam

- 扩现有 Universal source manifest，以一个 document + ordered `pages[]` 表达图片bundle；
  每页包含 page number、path、mediaType、sha256、byteLength、pixelWidth/pixelHeight，DPI只在
  源metadata可信时保留，不能推测。
- CLI使用显式页号，例如 `--source-page question_source:1=/abs/q-1.png`；多次参数组成一个
  source document。不得接受未排序目录glob。
- Source Capture把原图片作为immutable page artifacts。可生成确定性PDF rendition供整卷
  浏览，但OCR和source crop继续使用原图片像素，rendition不成为新权威。
- 每页直接进入ticket 06的raster observation/confirmation；确认后进入ticket 03的同一
  carrier-neutral ordered-item parser。
- `/ops/` 使用ticket 01配对真实Screen与原始图片region，并能逐页导航、显示missing page。
  同一页面必须呈现OCR observation文字、confidence/alternatives、source order和
  content-vs-furniture分类；教师可逐项改正文字、顺序和分类，确认记录复用ticket 06并绑定
  exact source/evidence/observation digests。流程分成两个不可混淆的revision：先在OCR revision
  并排核对原图与observations；Agent拉取确认后才生成Candidate revision，再按ticket 01
  并排审核原图局部与真实Screen。OCR确认不是试卷认可，也不能用于发布。

## Fail closed

`NCK1_IMAGE_BUNDLE_ORDER_INVALID`, `NCK1_IMAGE_PAGE_DUPLICATE`,
`NCK1_IMAGE_PAGE_DIGEST_MISMATCH`, `NCK1_IMAGE_MEDIA_TYPE_UNSUPPORTED`,
`NCK1_IMAGE_PAGE_COVERAGE_INCOMPLETE`。无答案bundle不在本票伪装成完整source set，转入
ticket 11的`awaiting_authoritative_answers`状态。

## Acceptance criteria

- [x] 正例逐页保留原bytes/digest/dimensions/order，并可重放同一source crop。
- [x] OCR observations与扫描PDF使用同一schema/confirmation/parser，无image-only题意模型。
- [x] page gap/duplicate/reorder/digest drift/unsupported type各自稳定拒绝。
- [x] 整页图片只作source page evidence；确认后的文字才结构化。首版无法诚实处理的正文图形
  保持fail closed，不伪装成media或家具。
- [x] Screen、Student/Teacher Print、PDF消费同一Canonical，不直接渲染整页source截图。
- [x] answer image闭合全部45项权威答案；漏掉56–65任一文本答案时Candidate non-ready。
- [x] `/ops/` 的OCR revision可逐页对照题卷/答案原图与observations，修改文字和顺序并确认
  content-vs-furniture；确认后才允许Agent生成下一张真实Screen Candidate revision。
- [x] `/ops/` 保存的确认能由ticket 06公共producer重放；源页、engine output或observation
  digest改变后旧确认失效，不允许UI另建宽松确认模型。
- [ ] 一份真实、只读、非CQ8图片pair完成OCR revision→Candidate Screen revision的Owner QA。

## Non-goals

目录名猜页序、相册管理、图片增强/美化、AI重画、OCR自动确认、手写识别、从社交平台自动下载、
真实版权图片fixture、无答案发布、首版多栏/复杂图形/复杂表格。遇到这些形状必须带源区域
fail closed，不能为了抢先发布而猜测。

## Verification

```bash
node scripts/verify-universal-nck1-image-source-bundle.mjs
node scripts/verify-nck1-ocr-source-evidence.mjs
node scripts/verify-import-review-ocr-confirmation.mjs
node scripts/verify-import-review-source-pairing.mjs
node import-ops/verify.mjs
pnpm -C app verify:paper
pnpm -C app verify:all
```

`verify-universal-nck1-image-source-bundle.mjs`内部会运行真实Screen、Student/Teacher Print与
PDF verifier，输出写入临时目录后清理。仓库fixture只用synthetic pages；真实图片卷只可做
非CQ8、非生产、只读smoke proof，不提交仓库。
