# 04 — Universal media capture 与最小布局意图

- Status: planned
- Blocked by: `01-source-region-review-pairing.md`; caption输出还需 Owner 决定其产品语义
- Next on PASS: `05-table-presentation-intent.md`

- Spec: `docs/cuts/import-format-capabilities/spec.md`
- Matrix rows: B06, M01–M05, V01–V02, R04

## Outcome

Universal DOCX/PDF producer 能把不可结构化照片/插图/图表/流程图作为原像素 content
media捕获，并用一个最小 shared presentation intent 保存正文关系；Screen、两种 Print、
PDF 从同一投影渲染。能结构化的普通表不允许走整图 fallback。

## Input and fixture

- DOCX：一个 inline embedded PNG、一个 block drawing；各自前后只有一短段。
- PDF：同图的 normalized crop。
- 三个 layout cases：block width 40% left、block width 60% center、table-cell inline。
- 负例：跨栏绝对定位、shape association不唯一、用图片伪装可矩形化2×2表。
- caption fixture 等 Owner 选择“学生可见content”或“QA/accessibility metadata”后加入。

## Public seam

- 扩现有 Materialization `media` + `figure`/`media_ref`，不移植 legacy PaperAsset
  `shapeAssociations` 模型。DOCX direct embedded media读取 relationship与 source paragraph；
  需渲染裁图且关联模糊的 shape 保持 fail closed。
- 只在证据可确定时增加最小 presentation：placement(`block`/`table_cell` 已由block shape
  表达)、`alignment`(`left|center|right`)、`widthRatio`(正文宽比例)、有限 before/after
  spacing token。不得保存任意 CSS、absolute x/y 或 per-surface值。
- source page/region/pixel/density/digest沿用现有 extraction recipe和ticket 01 visual pairing。
- shared surface adapter投影一次；Screen和Print只做单位翻译。
- Review issue identity扩到已有 Canonical target vocabulary中的`contentNodeId`/`mediaId`，
  并与source visual region一起回放；不从图片内容猜target。

## Fail closed

`NCK1_DOCX_MEDIA_ASSOCIATION_AMBIGUOUS`, `MATERIALIZATION_MEDIA_LAYOUT_UNSUPPORTED`,
`MATERIALIZATION_MEDIA_LAYOUT_INVALID`, `MATERIALIZATION_STRUCTURABLE_TABLE_AS_MEDIA_FORBIDDEN`；
继续复用 recipe/digest/dimension与placement codes。跨栏/浮动/文本环绕不在v1枚举内即拒绝。

## Acceptance criteria

- [ ] DOCX embedded bytes和PDF crop均可exact replay；改一像素/digest/recipe失败。
- [ ] block order、alignment、widthRatio与spacing经一份projection进入三面；无per-surface inference。
- [ ] table-cell icon保持inline；block figure不被renderer统一放大到100%。
- [ ] 可矩形化表的media fallback被拒绝；复杂图形crop仍允许。
- [ ] `/ops/`可从真实figure/inline media回source crop并将问题绑定media/content node。
- [ ] caption按Owner决定三面一致；若尚未决定，本票不得顺手显示或删除caption。

## Non-goals

AI重画、图像内容识别题意、任意Word wrapping/absolute layout、整页截图正文、跨栏媒体、
通用SVG runtime、听力音频、per-paper CSS。

## Verification

```bash
node scripts/verify-paper-canonical-nck1-materialization-candidate.mjs
node scripts/verify-paper-canonical-mixed-table-media.mjs
node scripts/verify-docx-source-media-input.mjs
node scripts/verify-import-review-source-pairing.mjs
node scripts/verify-universal-nck1-candidate-surfaces.mjs paper-synthetic-media-layout
pnpm -C app verify:paper
pnpm -C app verify:all
```

final需一个真实但只读的照片/图表Screen/Print/PDF/source pairing proof和独立
Standards/Spec review；legacy verifier是回归，不可当Universal acceptance替代品。
