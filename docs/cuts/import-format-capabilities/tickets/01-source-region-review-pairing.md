# 01 — 源区域与真实 Screen 配对审核

- Status: implemented — automated verification PASS; real non-production Owner QA pending
- Blocked by: None
- Next on PASS: `03-text-layer-pdf-materializer.md`, then the 06 → 09 image release track
- Risk: shared Source Materialization + Import Review UI/API; no production mutation

- Spec: `docs/cuts/import-format-capabilities/spec.md`
- Matrix rows: M03, R02, R04, R05

## Outcome

Owner 在 `/ops/` 点击真实 Screen 的一个 Canonical table/figure/block 后，右栏立即显示
同一 revision 内不可变 source PDF/rendition 的局部图，包含页码、规范化矩形、目标 ID
和 source digest。Owner 可在看着这两个真实表面的同时记录问题；问题同时绑定现有
group/question/block identity 与 `surface=source`、source page/rect。

这是第一张推荐技术票，因为它给首批图片导题以及后续表格、媒体、PDF/OCR fixture提供
同一条可执行 QA seam。它不新增卷面格式，不复制 PaperSurface，也不改变 Canonical 题意。

## Input

一个最小 synthetic Review revision：

- 一页 question PDF，只有一个 2×2 表和一个 16×16 图标；短文字使用 `Alpha/Beta`。
- 一页 answer PDF，仅含四个 synthetic answer token。
- Source Materialization 已闭合一个 semantic table block 和一个 table-cell media ref。
- `sourceCoverage.visuals` 两项分别绑定 table `blockId` 与 icon `mediaId`，并带 source page
  与规范化 `region`。
- 同一个 Candidate 经现有 `PaperBrowsePage`、Student/Teacher Print 与 PDF projection。

fixture 由测试代码生成，不提交完整试卷或真实卷面截图。

## Public seam

只扩现有 source of truth：

1. `nck1-source-materialization-v1` 的 `sourceCoverage.visuals[]` 可携带一个规范化
   `region`。旧 revision 无 region 时仍可读取，但状态明确为 `unlocated`。
2. `buildNck1ReviewProjection` 从 Materialization 投影只读 `sourceVisuals`：
   `visualId`, `documentId`, `page`, `region`, `disposition`, `targetId`, source digest。
   不建立第二套 locator model。
3. Import Review 增加 revision-bound source-visual endpoint。它只从 revision 目录内已验证
   digest 的 question PDF/rendition 栅格化 region，不接收任意文件路径。
4. `/ops/` 继续使用真实 Screen iframe。`screenTarget` 取得 block identity 后，以
   `targetId` 选择 source visual；源局部在右栏问题表单上方显示，使 >1880px 的既有三栏
   layout 保持 Screen 宽度。在较窄 layout 中右栏按现有规则落到 Screen 下方。
5. issue 继续使用 `importReviewStore.createIssue` 已有 `surface`, `groupId`, `questionId`,
   `blockId`, `pageNumber`, `rect`；本票不新建平行 issue-target 表。

若需要复用 PDF region raster，移动 `nck1MaterializationAdapter.reextractMedia` 和
`universal-nck1 cropPdf` 已有的同一组 page/normalized-region/density semantics 到一个
共享低层 primitive；Review endpoint、recipe replay 和 CLI 必须调用同一实现，不复制
第三份 crop 算法，也不改变 `pdf_crop` recipe。

## What to build

### Contract and projection

- 为 source visual 增加可选 `region`，并验证它严格在 0..1 内。
- `semantic_table`/`content_media` 的 region 若存在，必须仍绑定 exact target；不得按页上
  最近元素猜 target。
- Review projection 只能引用 revision manifest 中 question-bearing PDF 或 DOCX 的
  deterministic PDF rendition；不得从正式 `paper-assets` 读取。
- projection 返回 pairing state：`paired` 或 `unlocated`。无 source visual、重复 target、
  digest/页码/region 无效均不近似配对。

### Review endpoint

- 路由只接受 `revisionId + visualId`，服务端从 projection 解析文件/page/region。
- 输出 PNG 与 metadata headers/JSON，至少包括 source digest、page、exact region、pixel
  dimensions；裁图可包含固定上下文 padding，但 exact region metadata 不变。
- 路径逃逸、未知 visual、无 region、非 PDF/rendition、source digest drift 全部失败关闭。

### `/ops/`

- Screen 点击 table/figure/block 后，若 exact target 有 `paired` source visual，在右栏显示
  “原卷局部”，并保留中间真实 Screen。
- source visual 清单或已选 source card 提供“定位 Screen”；只用 exact `targetId` 调用既有
  `applyScreenTarget`，使中间 iframe 聚焦同一 block。target不可投影时显示 `unlocated`。
- source card 显示 page、target ID、digest short form；有一个打开整份 immutable source
  的显式链接。
- `unlocated` 显示“源区域未配对”，不得展示第一张图、整页截图或最近 target 作为替代。
- 从配对 source card 创建问题时，提交 `surface=source`, `pageNumber`, `rect`，同时保留
  Screen 点击得到的 group/question/block IDs。现有 API 已能存这些字段。
- 切到 Student/Teacher Print/PDF 后仍可查看已选 source card，但本票不做 Print DOM 点击
  选区；页码问题沿用现有手填 seam。

## Fail-closed behavior

至少使用稳定 code：

- `MATERIALIZATION_SOURCE_VISUAL_REGION_INVALID`：region 不在 source page 内。
- `IMPORT_REVIEW_SOURCE_VISUAL_NOT_FOUND`：revision/visual 不存在或不属于该 revision。
- `IMPORT_REVIEW_SOURCE_LOCATOR_UNAVAILABLE`：visual 是 `unlocated`，不得生成猜测 crop。
- `IMPORT_REVIEW_SOURCE_DIGEST_MISMATCH`：栅格化前 source bytes 不匹配 revision binding。
- 复用 `IMPORT_REVIEW_PATH_INVALID`、`IMPORT_REVIEW_RECT_INVALID`、
  `IMPORT_REVIEW_PAGE_INVALID`，不改它们语义。

重复 `targetId` 继续由 `MATERIALIZATION_SOURCE_VISUAL_TARGET_DUPLICATE` 拒绝。整页
`visual_proof` 不得自动配到 Canonical body。

## Acceptance criteria

- [x] synthetic revision 的 table block 点击后，右栏 source crop 页码/rect/target/digest 与
  Materialization 精确一致；中间 iframe 仍是 `reviewRevision` 真实 Screen。
- [x] 从 table source visual 点击“定位 Screen”后，真实 iframe 聚焦同一 exact block；无
  exact target时不跳最近元素。
- [x] icon 点击至少稳定回到其 table block 的 semantic target；本票不声称精确 mediaId
  issue binding，后者归 ticket 04。
- [x] 创建 source 问题后，Review DB 返回相同 group/block/page/rect；刷新后可回放相同 crop。
- [x] region/digest/visualId 任一篡改都返回相应 code，无 crop、无 fallback。
- [x] 无 region 的旧 revision 显示 `unlocated` 且仍能打开整份源文件；不伪装局部 proof。
- [x] Student/Teacher Print/PDF 路由与 approval/shipping 权限不变；页面仍无 deploy action。
- [x] source crop 只作 QA evidence，不进入 Canonical `content.blocks` 或 `mediaArtifacts`。

## Non-goals

- OCR、PDF text materialization、自动发现表/图/栏。
- 自动像素 diff、alpha overlay、OCR diff 或“相似区域”推荐。
- 新 preview renderer、修改 PaperSurface 布局、从 source crop 重建 Canonical。
- table cell/mediaId/sourceVisualId 的新 DB identity 列；先复用 block+source region。
- 改生产 DB、上传真实卷、认可/发布/deploy。

## Verification

During work:

```bash
node scripts/verify-nck1-source-materialization.mjs
node import-ops/verify.mjs
node scripts/verify-import-review-source-pairing.mjs
pnpm -C app verify:changed
```

新 verifier 必须实际启动 authenticated Review fixture、打开 `/ops/`，点击真实 Screen
table block，断言 source card metadata/PNG、提交 issue，再篡改 region/digest 跑拒绝例。
不能只 regex 检查 UI source。

Final gate（共享 Source Materialization/Review seam）：

```bash
pnpm -C app verify:paper
pnpm -C app verify:all
```

再做一个真实但只读的 Owner QA：在非 CQ8、非生产的 Candidate revision 上验证 source
局部与 Screen table/figure 配对；不认可、不发布。按 `docs/agents/owner-qa-handoff-template.md`
提供精确服务、账号、URL、revision 与首屏状态，并做一次独立 Standards/Spec review。
