# 04 — Universal media capture 与最小布局意图

- Status: partial implementation（DOCX direct embedded media、共享布局投影和媒体人工确认门禁已实现；PDF producer自动取图与普通表格图片fallback分类仍待后续）
- Blocked by: `01-source-region-review-pairing.md`（已实现）
- Next after the remaining gaps: `05-table-presentation-intent.md`

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

`NCK1_DOCX_MEDIA_ASSOCIATION_AMBIGUOUS`, `NCK1_DOCX_MEDIA_LAYOUT_UNSUPPORTED`,
`MATERIALIZATION_MEDIA_PRESENTATION_INVALID`, `MATERIALIZATION_MEDIA_PUBLICATION_INVALID`；
候选bytes另用`MATERIALIZATION_MEDIA_RENDITION_*`，确定性重放另用
`MATERIALIZATION_MEDIA_ENHANCEMENT_REPLAY_*`。Owner确认使用
`IMPORT_REVIEW_MEDIA_CHECKLIST_INCOMPLETE`, `IMPORT_REVIEW_MEDIA_IDENTITY_MISMATCH`,
`IMPORT_REVIEW_MEDIA_CONFIRMATION_REQUIRED`, `IMPORT_REVIEW_MEDIA_CONFIRMATION_STALE`。
跨栏/浮动/文本环绕以`NCK1_DOCX_MEDIA_LAYOUT_UNSUPPORTED`拒绝；图片与文字或多个图片的
归属不唯一以`NCK1_DOCX_MEDIA_ASSOCIATION_AMBIGUOUS`拒绝。水印或授权不明确时不能把图
送入 publication；技术增强不能把它转成“可授权”。普通表格图片fallback的专用classifier
和stable code尚未实现，因此这张ticket还不能标记完整PASS。

## Acceptance criteria

- [ ] DOCX embedded bytes和PDF crop均可exact replay；改一像素/digest/recipe失败。（DOCX及
  adapter已有PDF crop replay已通过；PDF producer尚不会自动发现、裁剪并关联正文图）
- [x] block order、alignment、widthRatio与spacing经一份projection进入三面；无per-surface inference。
- [x] table-cell icon保持inline；block figure不被renderer统一放大到100%。
- [ ] 可矩形化表的media fallback被拒绝；复杂图形crop仍允许。
- [x] `/ops/`可从真实figure/inline media回source crop并将问题绑定media/content node。
- [x] 源卷学生可见 caption三面一致；QA metadata不泄漏到学生输出。
- [x] 清晰图只裁剪，不生成；低清图证明确定性增强优先，AI 候选不覆盖原图。
- [x] AI 候选未经 exact human confirmation 不进入 Candidate；原图/候选任一 digest 或确认
  清单变化都会使确认失效。
- [x] 确认后的唯一 rendition 与同一 layout intent 进入 Screen、两种 Print 和 PDF；三面
  image digest 一致。
- [ ] 改错文字、数字、单位、箭头、图例、节点或曲线关系的候选均 fail closed；不得用
  候选擦水印或代替来源授权。（当前用11项Owner逐项确认门禁诚实fail closed，不声称代码
  能自动判断生成图的语义一致性；自动classifier也不能代替来源授权。）

## Implemented evidence and remaining gap

- Source Materialization v2与authority v48扩现有`media`，没有另建平行模型。
- DOCX producer只接受一个image-only inline PNG/JPEG/WebP paragraph或cell，直接读取包内
  原bytes、extent、正文宽、对齐与有限spacing；anchor、多栏/不一致section、题组外图片、
  混合文字、多图和不唯一关系拒绝。
- Materialization把source与candidate当独立immutable artifacts；确定性增强按固定
  ImageMagick recipe重放。`source_crop`选择时AI候选只供Review，不会偷换publication。
- Screen、两种Print和PDF共用一个presentation；相对宽度以阅读正文container为基准，
  包括table-cell media。学生可见caption显示，legacy provenance caption继续隐藏。
- `/ops/`支持原图/候选并排、overlay、11项清单和单图Owner receipt；下一revision选择AI
  candidate时必须引用更早revision的exact receipt，Agent不能伪造确认。
- **未完成**：text-layer PDF producer仍在遇embedded raster时fail closed；尚无自动局部
  crop/正文关联。也没有通用classifier证明一个图片不是可语义化普通表格。这两项继续
  保持`partial`，不以手工录入或一张真卷成功冒充supported。

## Non-goals

自动批准 AI 候选、用生成图补题意、任意Word wrapping/absolute layout、整页截图正文、
跨栏媒体、通用SVG runtime、听力音频、per-paper CSS、自动判断公开使用授权。

## Verification

```bash
node scripts/verify-paper-canonical-nck1-materialization-candidate.mjs
node scripts/verify-paper-canonical-mixed-table-media.mjs
node scripts/verify-nck1-docx-materialization-producer.mjs
node scripts/verify-import-review-source-pairing.mjs
node scripts/verify-import-review-media-derivation.mjs
pnpm -C app verify:paper
pnpm -C app verify:all
```

final需一个真实但只读的照片/图表Screen/Print/PDF/source pairing proof；若启用 AI 候选，
还需一次真实低清图的原图对照人工确认 proof 和独立 Standards/Spec review。legacy verifier
是回归，不可当Universal acceptance替代品。
