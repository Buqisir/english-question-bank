# 04 — Universal media capture 与最小布局意图

- Status: planned
- Blocked by: `01-source-region-review-pairing.md`
- Next on PASS: `05-table-presentation-intent.md`

- Spec: `docs/cuts/import-format-capabilities/spec.md`
- Matrix rows: B06, M01–M06, V01–V02, R03–R04

## Outcome

Universal DOCX/PDF producer 能把不可结构化照片/插图/图表/流程图作为不可变 source
media捕获，并用一个最小 shared presentation intent 保存正文关系；Screen、两种 Print、
PDF 从同一投影渲染。清晰图只裁准、摆准；低清图先确定性增强，确实无法辨认时才允许
建立不覆盖原图的 AI 辅助重绘候选，并经原图对照与人工确认后成为唯一 publication
rendition。能结构化的普通表不允许走整图 fallback。

## Input and fixture

- DOCX：一个 inline embedded PNG、一个 block drawing；各自前后只有一短段。
- PDF：同图的 normalized crop。
- 三个 layout cases：block width 40% left、block width 60% center、table-cell inline。
- 负例：跨栏绝对定位、shape association不唯一、用图片伪装可矩形化2×2表。
- caption fixture 同时含一个源卷学生可见题注和一个文件名式 QA metadata；只显示前者。
- 低清 fixture 使用最小 synthetic 流程图：原图、确定性提亮/锐化候选、内容完全一致的
  AI 候选，以及各改错一个文字、数字、箭头、节点、图例的拒绝候选。测试只使用固定
  bytes，不在线调用生成模型，也不提交真实题图。

## Public seam

- 扩现有 Materialization `media` + `figure`/`media_ref`，不移植 legacy PaperAsset
  `shapeAssociations` 模型。DOCX direct embedded media读取 relationship与 source paragraph；
  需渲染裁图且关联模糊的 shape 保持 fail closed。
- 只在证据可确定时增加最小 presentation：placement(`block`/`table_cell` 已由block shape
  表达)、`alignment`(`left|center|right`)、`widthRatio`(正文宽比例)、有限 before/after
  spacing token。不得保存任意 CSS、absolute x/y 或 per-surface值。
- source page/region/pixel/density/digest沿用现有 extraction recipe和ticket 01 visual pairing。
- 原始 crop 永远是 immutable source evidence。确定性增强保存可重放 recipe；AI 候选另存
  immutable bytes，并绑定原图 digest、候选 digest、生成工具/版本/提示词摘要和人工确认
  receipt。先检查现有 media artifact/Review receipt 能否扩展，不建平行 media model。
- 发布前按三级顺序选择：`source_crop` → `deterministic_enhancement` →
  `human_confirmed_ai_candidate`。清晰原图禁止无理由升级；候选不得覆盖或替换 source proof。
- AI 候选只用于还原无法辨认的既有内容，不允许补题意、改数字/文字/关系、擦除水印或
  规避来源授权。无法逐项确认则保持 non-ready。
- shared surface adapter投影一次；Screen和Print只做单位翻译。
- Review issue identity扩到已有 Canonical target vocabulary中的`contentNodeId`/`mediaId`，
  并与source visual region一起回放；不从图片内容猜target。
- 原卷学生可见 caption作为 Canonical content随三面显示；来源页码、文件名与操作说明只在
  Review metadata显示。二者不得依赖文字内容启发式互换。
- `/ops/` 对 AI 候选必须提供原图/候选并排及 overlay 或闪烁切换，确认项至少覆盖文字、
  数字、单位、箭头连接、图例、颜色/线型、节点数/顺序、曲线高低/交点/比例。receipt
  同时绑定裁剪与最小 layout intent（长宽比、相对正文宽度、对齐、边距、跨栏、caption
  与前后正文/题目归属）。

## Fail closed

`NCK1_DOCX_MEDIA_ASSOCIATION_AMBIGUOUS`, `MATERIALIZATION_MEDIA_LAYOUT_UNSUPPORTED`,
`MATERIALIZATION_MEDIA_LAYOUT_INVALID`, `MATERIALIZATION_STRUCTURABLE_TABLE_AS_MEDIA_FORBIDDEN`；
继续复用 recipe/digest/dimension与placement codes。AI 候选至少新增 source-binding、
confirmation-required、stale-confirmation 三类稳定 code；跨栏/浮动/文本环绕不在v1枚举内
即拒绝。水印或授权不明确时不能把图送入 publication；技术增强不能把它转成“可授权”。

## Acceptance criteria

- [ ] DOCX embedded bytes和PDF crop均可exact replay；改一像素/digest/recipe失败。
- [ ] block order、alignment、widthRatio与spacing经一份projection进入三面；无per-surface inference。
- [ ] table-cell icon保持inline；block figure不被renderer统一放大到100%。
- [ ] 可矩形化表的media fallback被拒绝；复杂图形crop仍允许。
- [ ] `/ops/`可从真实figure/inline media回source crop并将问题绑定media/content node。
- [ ] 源卷学生可见 caption三面一致；QA metadata不泄漏到学生输出。
- [ ] 清晰图只裁剪，不生成；低清图证明确定性增强优先，AI 候选不覆盖原图。
- [ ] AI 候选未经 exact human confirmation 不进入 Candidate；原图/候选任一 digest 或确认
  清单变化都会使确认失效。
- [ ] 确认后的唯一 rendition 与同一 layout intent 进入 Screen、两种 Print 和 PDF；三面
  image digest 一致。
- [ ] 改错文字、数字、单位、箭头、图例、节点或曲线关系的候选均 fail closed；不得用
  候选擦水印或代替来源授权。

## Non-goals

自动批准 AI 候选、用生成图补题意、任意Word wrapping/absolute layout、整页截图正文、
跨栏媒体、通用SVG runtime、听力音频、per-paper CSS、自动判断公开使用授权。

## Verification

```bash
node scripts/verify-paper-canonical-nck1-materialization-candidate.mjs
node scripts/verify-paper-canonical-mixed-table-media.mjs
node scripts/verify-docx-source-media-input.mjs
node scripts/verify-import-review-source-pairing.mjs
node scripts/verify-import-review-media-derivation.mjs
node scripts/verify-universal-nck1-candidate-surfaces.mjs paper-synthetic-media-layout
pnpm -C app verify:paper
pnpm -C app verify:all
```

final需一个真实但只读的照片/图表Screen/Print/PDF/source pairing proof；若启用 AI 候选，
还需一次真实低清图的原图对照人工确认 proof 和独立 Standards/Spec review。legacy verifier
是回归，不可当Universal acceptance替代品。
