# 导题格式能力矩阵

Baseline: `main@4296c85b4d135a9fa532219e2cd9a467a6b7e31d`（2026-08-28 live
`ls-remote` 复核）。状态定义见 `spec.md#capability-state-model`。

这不是“文件扩展名支持表”。每行只对该行写明的真实 shape 作结论。`manual` 表示 schema
可由人填写，不代表 producer 支持；`legacy` 表示旧 PaperAsset 路径存在 proof，不代表
Universal Source Materialization 已接通。

为保持可读性，一条逻辑行被拆成 A/B 两张表，并以稳定 ID 连接。A 表是层间表达，B 表是
交付与证据；同一 ID 的 A+B 合起来包含规定的全部字段。

## A. Capability path

| ID | 能力名称与真实输入形状 | 检测方式 | Source Capture 表达 | Materialization 表达 | Canonical / renderer 表达 | Screen 支持 | Print/PDF 支持 | Review QA 证据 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C01 | **文本层 PDF**：单栏、可复制文字的完整题卷/答案 PDF | `init` 只识别 `%PDF` 与页数；没有导题 PDF text producer。现有 `pdftotext` 只用于 verifier/个别历史脚本 | immutable PDF bytes、digest、page count；generic Source Capture 可存 `page_region` | schema 可手工写 paragraph/question/table + `page_region`；无自动物化 | 手工闭合后可进入现有 Canonical blocks | 手工 Candidate 可渲染 | 同左，shared print seam 可渲染 | 可打开整份源 PDF；没有源局部—Screen 配对 |
| C02 | **DOCX 简单 NCK1 pair**：题卷 DOCX + 答案 DOCX + 确定性 PDF rendition；正文为顶层段落/简单表 | 读 OOXML `word/document.xml`，按顶层 `w:p`/`w:tbl` 顺序及固定 NCK1 heading/题号/选项/blank 模式检测 | 原 DOCX、答案 DOCX、rendition bytes/digest；段落 source index 与顺序 | 9 slots、45 answers、paragraph/table、`docx_part` locator、page coverage | 直接映射 Canonical family/rich blocks；不靠 PaperAsset 重建题意 | 支持简单文本/表 | 支持；与 Screen 同一 Candidate | revision 中有 DOCX/rendition/Materialization；局部源 locator 尚未并排 |
| C03 | **扫描 PDF / OCR**：无可靠文字层的扫描题卷/答案 | Paper import 无 OCR probe、engine、置信区间或低置信拒绝；词汇项目脚本不是试卷 adapter | 只能保存 PDF bytes；没有页图/OCR observation contract | 无 OCR token/line/bbox/alternatives/confirmation 表达 | 无可信输入，不能进入 Canonical | 不支持 | 不支持 | 只能人工打开整卷；没有 OCR evidence sidecar |
| C04 | **混合载体**：题卷 PDF + 答案 DOCX，或 DOCX/PDF/OCR 页混合 | `init` 接受多 source 和 role，DOCX 会生成 rendition；`materialize` 无 adapter router，始终调用 DOCX producer | manifest 可同时列 PDF/DOCX/rendition | schema 可列多 documents；producer 要求恰好一个 question DOCX + 一个 answer DOCX + rendition | 手工闭合可编译；没有通用分段来源合并规则 | 手工 Candidate 可渲染 | 手工 Candidate 可渲染 | revision 保存全部 source files，但不能按 block 跳来源 |
| C05 | **听力文本与 timing**：1–20 题、答案、10 段听力文本，可有时序 | DOCX producer 按听力 section/题号/答案/10 段范围检测；timing 出现即要求 review | immutable question/answer source observations | `listening.state=captured`，20 questions/answers、10 transcript segments、timing array | 转成两个 `inactive_source` closure；明确 suppress，不产生 active Group | 不显示听力题/文本（设计如此） | 不显示（设计如此） | Materialization/源文件可读；无专用 transcript-source 对照 UI |
| C06 | **听力音频**：MP3/WAV 等原始附件与题卷共同到达 | Universal manifest/schema 不接受 audio document/media；generic inactive inventory 能接受 opaque captured audio | legacy/general closure 可存 immutable audio digest/artifact ref | NCK1 Materialization 无 audio 字段 | generic `captured_uninterpreted` 可关闭为 inactive evidence；禁止 playback/active ref | 无播放（非本阶段目标） | 不输出 | `/ops/` revision manifest 当前不登记音频 role/播放器 |
| T01 | **普通段落、源顺序与邻接**：DOCX 顶层连续 `w:p`/`w:tbl` | `extractDocxDocumentStructure` 保留顶层 sequence；adapter 重开源字节校验一段一 `w:p` 且 index 单调 | paragraph source index、DOCX part/selector、ordered observations/spans | ordered block stream，paragraph/table 各有 locator | ordered rich blocks；Canonical 是语义权威 | 按 block 顺序 | 按同一 block 顺序 | Screen 可点 group/question/block；源侧尚不能自动滚到 `w:p`/rendition region |
| T02 | **题号、选项、blank**：标准 NCK1 21–65、ABCD/ABC、七选五 bank、完形/语法填空 | marker/sequence/cardinality 与选项标签 regex；要求权威答案 | 段落与答案 source locators | question identity、canonical/source number、options、blank refs、prompt、answer authority | family contracts + question/blank/option identity | 支持 | 支持且 Student/Teacher answer visibility 分离 | 可按 question/group/block 反馈；真实 Screen 点击回填 ID |
| T03 | **页眉页脚、说明区、家具**：页码/校名/装订线/说明与正文并存 | DOCX universal extractor只读 body；legacy media extractor会枚举 header/footer shapes。body section headings 可识别；无通用 furniture classifier | 原字节保留；generic spans可表达；header/footer没有 universal observation | `sourceCoverage.visuals.disposition=furniture` 可手填；producer 不发现；body 外容器会拒绝 | 说明区若在 body 可成为 paragraph/instruction；家具不进入 Canonical | body 说明支持；家具不渲染 | 同左 | 只能打开源文件；家具无局部 inventory/确认控件 |
| T04 | **分栏/阅读细线框**：恰好两栏、栏内真段落/矩形表；及其它栏数 | 无 universal PDF/DOCX detector；现有真卷由 paper-specific successor 显式派生 | 可保存原源/visual proof；没有通用栏 observation | schema/validator 接受恰好 2 栏 `framed_columns`；producer 不生成 | Reading contract 支持恰好 2 栏；只许 paragraph/table、禁嵌套/figure/question | 两栏细线框共享样式 | 同一块，Print 超高稳定拒绝 | 有 synthetic 三面 proof；`/ops/` 无源框局部配对 |
| T05 | **答题框/写作区域**：应用文 skeleton、续写 starters、可写区域 | DOCX producer 检测 writing headings、word count、givens/starters；不测源框像素 | 文字/段落 locator | `writingTask` + ordered source blocks | Canonical answer-region/chrome 统一定义；不是从截图重建 | 支持语义答题区 | 支持 Student/Teacher Print/PDF | 可按 writing group/block 反馈；不承诺源框几何像素一致 |
| T06 | **跨页内容**：段落、表格、媒体跨 PDF 页或 DOCX rendition 页 | PDF page count 有；DOCX paragraph selector无页。多页 rendition 中 table page 无法自动定位并要求 review | PDF 可用 page/region span；DOCX 保留 part selector + rendition bytes，但无映射 | page locator 可表达；单 block 只有一个 locator；表跨页/段落跨页无复合 locator | Canonical 顺序可跨输出页；不保存来源分页语义 | 流式渲染 | renderer 自己分页；`framed_columns` 超页拒绝 | issue 可填输出页；不能从 source page range 跳 block |
| B01 | **普通表格**：非嵌套矩形网格、每格有文本、可有 header row/横向合并 | DOCX 读 `tblGrid`/rows/cells/`gridSpan`；Materialization 验证矩形覆盖、重叠与 overflow | table selector、cell 段落 indexes保留在 extractor结果 | `table`/row/cell identity，columnStart/columnSpan/rowSpan/role，ordered text/media_ref | rich table 与 semantic IDs；不会 flatten 成 `[表:]` | HTML table | 同一 semantic table；shared print CSS | mixed-table fixture；源局部还不能并排 |
| B02 | **合并单元格**：横向 `gridSpan` 与纵向 `vMerge` | extractor看见两者；producer只投影横向，纵向明确 review；validator/Canonical能表达 rowSpan | 原 OOXML/selector保留 | horizontal span 可生成；vertical span需人工且 producer fail closed | Canonical grid支持 columnSpan+rowSpan | 两种 span 都能渲染 | 两种 span 都能渲染 | synthetic Canonical mixed table proof；无 producer vertical fixture |
| B03 | **嵌套表格**：cell 内含第二个 `w:tbl` | extractor计数 `nestedTableCount`/`containsNestedTable` | 源 DOCX/outer selector保留 | producer报 review；schema没有 nested table cell block | Canonical table cell只含 text/media_ref；不支持 nested table | 不支持 | 不支持 | 可从原 DOCX人工查；没有局部 crop |
| B04 | **空单元格**：网格中真实存在的空白 cell | extractor能看到空 text；producer标记 review并写占位文字，不能 ready | 源 cell存在性在 OOXML 中；未投影成独立 cell locator | validator要求非空 ordered content，报 `MATERIALIZATION_TABLE_CELL_EMPTY` | Canonical当前不能区分“源确为空”与“漏提取” | 不支持诚实空格；占位 output不能 ready | 同左 | 原表可人工看；无 exact empty-cell issue target |
| B05 | **边框、对齐、列宽**：普通表格的可见关系属性 | DOCX extractor未解析 tbl/cell border、jc/vAlign、gridCol widths；PDF无 detector | 原字节保留但无 shape observation | 无字段 | 无共享 table presentation intent；renderer统一 100% fixed table、固定 border/padding/top align | 仅 EQB generic style | 同义但 Screen/Print border单位不同；不保源属性 | 无源-渲染属性对照 |
| B06 | **无法诚实结构化的复杂表/图形**：非矩形关系图、复杂流程组合 | 没有通用 classifier；人工必须先证明不是普通语义表 | source visual + crop recipe 可表达 | `content` media + `pdf_crop`/DOCX media；whole-page `visual_proof` 不可被引用为正文 | Reading `figure` 或 table-cell media；媒体不能反推题意 | figure/media支持 | figure/media支持 | 只能开源文件；需局部 crop pairing 才能审“为何不能语义化” |
| M01 | **照片、插图、图表、流程图**：正文中的不可结构化视觉 | Universal producer看见 DOCX drawing但只报 review；PDF无 detector；legacy shape path需显式 association | embedded bytes或 PDF crop digest；legacy可枚举 shape | media kind只有 `figure/icon/barcode`，上述类型合并为 `figure`；extraction recipe可闭合 | Canonical `figure` block、immutable media identity | 支持同源 bytes | 支持同源 bytes | 源文件链接；没有自动 source crop ↔ figure 配对 |
| M02 | **图标、条码**：表格内图标、二维码/条形码、页眉编码 | 无 universal visual classifier；media kind可由人标 `icon`/`barcode` | bytes/digest/crop可保存 | `kind=icon|barcode`；content/furniture语义需人工 | icon可经 table `media_ref`；barcode无专门 renderer policy | 当普通 image | 当普通 image | 无 content-vs-furniture确认控件；需 Owner 产品决定 |
| M03 | **原图裁剪与 provenance**：页码、源矩形、pixel、DPI、digest | manual `crop-pdf` 300 DPI；DOCX ZIP entry；legacy shape crop 144 DPI + 2pt padding | immutable source/media artifacts | PDF recipe有 page+normalized region+density；DOCX entry recipe无页/矩形；有 pixel dimensions/digest，无码值摘要字段 | adapter重放 recipe、核 digest/尺寸；拒绝 content SVG 未栅格化 | data URL 使用闭合 bytes | 同一 bytes | revision携带源与media；UI不展示 recipe/rect/dimensions/digest摘要 |
| M04 | **媒体版式关系**：block/inline、对齐、跨栏、相对正文宽度、边距 | 当前不检测 source layout relation | 原字节有事实但无 observation | 只有 figure block 或 table-cell `media_ref`；无 alignment/width ratio/margin/cross-column | 只有 block figure与cell inline；renderer用居中/max-width generic规则 | generic center/contain | generic center/contain | 无字段可对照，差异会被静默归一化 |
| M05 | **标题及前后正文关系**：图片题注、图前/图后段落 | ordered block stream保留 block邻接；producer不自动生成 figure/caption | block source locator可保邻接 | figure有 caption content；没有 caption role（学生正文 vs QA metadata） | Canonical surface type保留 caption/captionInlines | figure renderer忽略 caption、alt为空 | figure renderer忽略 caption、alt为空 | 无 caption可见性检查；这是已证实三面信息丢失 |
| V01 | **内容像素三面同源**：Canonical content media 已闭合 | adapter re-extracts and compares bytes/dimensions/digest | immutable media artifact | exact recipe + supplied bytes必须一一匹配 | consumption `mediaArtifacts` 将同一 encoded bytes投影 | 同一 encoded bytes | 同一 encoded bytes | revision finalize重编译 Candidate；现有 surface verifier检查 image load/count |
| V02 | **版式关系三面同源**：表/图比例、位置、留白、正文关系 | 只检测 framed_columns 和部分 semantic table geometry；媒体/表 style缺失 | 局部事实多未结构化 | 可表达 block order、table spans、2-column frame；不能表达大多数关系 | 已有关系由 shared adapter传递；缺失关系无法传递 | 对已表达部分支持 | 对已表达部分支持 | 没有 source local comparison，不能证明关系忠实 |
| V03 | **整页视觉证据不冒充正文**：full-page screenshot/rendition仅 QA | media `usage` 与 sourceCoverage disposition闭合 | 可作为 source document/`visual_proof` artifact | `visual_proof` 不允许被 content ref；content media必须恰好用一次 | Reading拒绝 flattened `[图:]` bridge，媒体必须闭合 | 不渲染 visual proof为正文 | 不渲染 visual proof为正文 | 当前只可手工打开；原则有 validator proof |
| R01 | **不可变真实表面审核**：同一 revision 的 Screen、两种 Print、PDF | finalize重推 Candidate/Consumption并绑定 producer/renderer/digests | revision保存 source/materialization/media files及摘要 | Review projection从 revision bytes重新 import/compile | Screen consumption + print consumption仅替换 consumer contract | 真实 `PaperBrowsePage` iframe | `buildPrintHtml`；PDF由同 HTML + Chromium | 支持 issue/reply/fix/approval 状态机；renderer drift会使认可失效 |
| R02 | **原卷局部 + 真实 Screen 并排与 locator跳转** | 当前无从 Screen target 到 sourceCoverage visual/locator 的 join | 源 files存在；visual只有page/targetId，无region | block locator与sourceCoverage分散存在 | Screen DOM有 group/question/block IDs | 当前只显示单个真实 Screen frame | 切换到 Print/PDF，不与源并排 | 左栏源文件新窗口；没有局部 crop、配对、跳转或“未配对”状态 |
| R03 | **局部 overlay / 差异提示**：同定位源局部与渲染局部 | 无配准、diff、阈值/误报模型 | 无 renderer crop evidence | 无 | 无共享 comparison model | 无 | 无 | 缺失；应先完成 R02，再用教师任务验证是否值得做 |
| R04 | **问题绑定到题组/题/表格/媒体/源区域** | Screen click用 closest DOM identity；手填 page | issue存 groupId/questionId/blockId/page/normalized rect/surface | 不读取 Materialization target identity做完整校验 | table/figure都有 blockId；cell/media/content node未进入 issue model | group/question/block可绑定 | page可手填；rect API可存但 UI不采集 | 表格可按block；figure可按block；不能精确绑定cell/mediaId/sourceVisualId，也不双向回放 |
| R05 | **未知形状统一 fail closed**：未登记 container/table/media/layout/OCR | DOCX对部分已知风险检测；schema/Canonical closed unions；PDF/OCR没有shape detector | source bytes通常仍保留 | 多个稳定 `MATERIALIZATION_*`/`NCK1_DOCX_*` code；但无统一 unknown-shape inventory+region | compiler拒绝未知 rich block和未闭合 media | 未进入ready则不渲染 | 未进入ready则不渲染 | issue可人工记录；producer review code不自动成为 `/ops/` source-region task |

## B. Status, evidence and next work

| ID | 当前状态 | 已知失败码（代表性） | 现有代码与测试证据 | 所需最小 fixture | 下一步 ticket | 优先级及理由 |
| --- | --- | --- | --- | --- | --- | --- |
| C01 | `partial` | 高层仅 `source_incomplete`；无 PDF-text shape code | [E04](#e04-universal-source-cli), [E20](#e20-generic-source-capture)；搜索确认 paper import 无 PDF text producer | 2页 synthetic text PDF：heading+2段+4选项，另加双栏拒绝页 | [03](tickets/03-text-layer-pdf-materializer.md) | **P0**：init声称可收 PDF，但自动物化实际断路，最易形成误判 |
| C02 | `supported`（限定简单文本 shape） | `NCK1_DOCX_SOURCE_SET_AMBIGUOUS`, `NCK1_DOCX_SECTION_AMBIGUOUS`, `NCK1_DOCX_QUESTION_SEQUENCE_INCOMPLETE`, `NCK1_DOCX_ANSWER_MISSING` | [E02](#e02-docx-structure), [E03](#e03-docx-producer), [E11](#e11-docx-producer-proof) | 现有 tiny synthetic DOCX pair；继续保持无真实卷文本 | 保持 E11 回归；表/媒体走 02/04 | **P1 maintenance**：当前最成熟的 carrier，不需重写 |
| C03 | `missing` | 无试卷 OCR shape code | [E04](#e04-universal-source-cli)（不存在 OCR path）；词汇 OCR不属于本 seam | 2页 synthetic raster PDF：清晰行+低置信噪声+小图，答案独立页 | [06](tickets/06-scanned-pdf-ocr-evidence.md) | **P0**：完全缺失且静默人工风险高；先复用 03 的输出合同 |
| C04 | `partial` | `NCK1_DOCX_SOURCE_SET_AMBIGUOUS`, `source_incomplete` | [E03](#e03-docx-producer), [E04](#e04-universal-source-cli) | 题卷1页text PDF + 答案1页DOCX；反向组合各一例 | [07](tickets/07-mixed-carrier-routing.md) | **P2**：manifest已能收，需等各单载体 adapter稳定后路由 |
| C05 | `partial`（inactive closure supported） | `NCK1_DOCX_LISTENING_RANGES_AMBIGUOUS`, `NCK1_DOCX_LISTENING_TRANSCRIPT_AMBIGUOUS`, `MATERIALIZATION_LISTENING_TRANSCRIPT_COVERAGE_INVALID` | [E03](#e03-docx-producer), [E18](#e18-inactive-listening), [E10](#e10-materialization-contract-proof) | 20个短问题+10个短 transcript segment，无版权文本；timing有/无 | 保持 inactive regression；audio走 08 | **P2**：语义闭合安全，但无专用 Review UX且不激活播放 |
| C06 | `partial`（generic closure only） | `LISTENING_AUDIO_EVIDENCE_INCOMPLETE`, `LISTENING_ACTIVE_OR_AUDIO_REFERENCE_UNSUPPORTED`; Universal 无 audio-specific code | [E18](#e18-inactive-listening) | 1秒synthetic tone + closed digest + no-playback negative | [08](tickets/08-listening-audio-evidence.md) | **P2**：保全来源重要，但不阻塞非听力正文 |
| T01 | `supported`（DOCX） | `MATERIALIZATION_DOCX_PARAGRAPH_SOURCE_ORDER_INVALID`, `MATERIALIZATION_DOCX_PARAGRAPH_PLACEMENT_DUPLICATE`, `NCK1_DOCX_CONTAINER_UNSUPPORTED` | [E02](#e02-docx-structure), [E05](#e05-materialization-adapter), [E11](#e11-docx-producer-proof) | 3段中夹1表；空段保留source index；乱序负例 | 继续 E11；PDF版本走 03 | **P0 maintenance**：源顺序是所有邻接/布局的底座 |
| T02 | `supported`（标准 NCK1 DOCX） | `NCK1_DOCX_QUESTION_NUMBER_AMBIGUOUS`, `NCK1_DOCX_OPTIONS_AMBIGUOUS`, `NCK1_DOCX_BLANK_SEQUENCE_INCOMPLETE`, `NCK1_DOCX_ANSWER_CONFLICT` | [E03](#e03-docx-producer), [E11](#e11-docx-producer-proof), [E13](#e13-shared-surface-proof) | 现有45题 synthetic；每个负例只破坏一个marker | PDF版本走 03 | **P0 maintenance**：内容语义主路径，不要被视觉 work 回归 |
| T03 | `partial` | `NCK1_DOCX_CONTAINER_UNSUPPORTED`, `NCK1_DOCX_VISUAL_REVIEW_REQUIRED`；无 furniture detector code | [E02](#e02-docx-structure), [E03](#e03-docx-producer), [E14](#e14-legacy-docx-media) | body说明+header页码+footer校名各一个短token | [01](tickets/01-source-region-review-pairing.md) 后另开 detector ticket | **P2**：先保留并可审，再决定哪些家具无需 Canonical |
| T04 | `partial` | `MATERIALIZATION_FRAMED_COLUMNS_INVALID`, `READING_FRAMED_COLUMNS_CHILD_UNSUPPORTED`, `CANONICAL_FRAMED_COLUMNS_EXCEEDS_PAGE` | [E06](#e06-reading-contract), [E08](#e08-screen-renderer), [E09](#e09-print-renderer), [E19](#e19-framed-columns-proof) | 现有2栏synthetic；另加3栏/栏中figure/嵌套负例 | 03先检测单/多栏并对未知栏失败；后续有频率证据再扩 | **P1**：下游成熟，producer detection缺失；禁止通用任意栏引擎 |
| T05 | `supported`（语义答题区） | `NCK1_DOCX_WRITING_BOUNDARY_AMBIGUOUS`, `NCK1_DOCX_WRITING_SKELETON_AMBIGUOUS`, `MATERIALIZATION_WRITING_GIVENS_PLACEMENT_INVALID` | [E03](#e03-docx-producer), [E13](#e13-shared-surface-proof) | 2个short writing task，givens/starters/word count各一 | 维持共享 writing regression | **P1 maintenance**：已遵守“关系忠实而非像素框复刻” |
| T06 | `partial` | `NCK1_DOCX_TABLE_PAGE_REVIEW_REQUIRED`, `CANONICAL_FRAMED_COLUMNS_EXCEEDS_PAGE` | [E01](#e01-materialization-schema), [E03](#e03-docx-producer), [E09](#e09-print-renderer) | 2页PDF：段落跨页邻接；表在第2页；超高2栏负例 | [01](tickets/01-source-region-review-pairing.md), [03](tickets/03-text-layer-pdf-materializer.md) | **P1**：错误页会让视觉 QA 对错对象 |
| B01 | `supported`（语义shape） | `MATERIALIZATION_TABLE_INVALID`, `MATERIALIZATION_TABLE_OVERLAP`, `MATERIALIZATION_TABLE_NOT_RECTANGULAR`, `READING_TABLE_INCOMPLETE` | [E01](#e01-materialization-schema), [E02](#e02-docx-structure), [E10](#e10-materialization-contract-proof), [E12](#e12-mixed-table-media-proof) | 2x2表+header+横向merge；gap/overlap负例 | [02](tickets/02-docx-semantic-table-closure.md) 扩边界 | **P0 maintenance**：高频且语义化优先 |
| B02 | `partial` | `NCK1_DOCX_TABLE_REVIEW_REQUIRED`, `MATERIALIZATION_TABLE_ROWSPAN_OVERFLOW` | [E02](#e02-docx-structure), [E03](#e03-docx-producer), [E12](#e12-mixed-table-media-proof) | 3x3表：一个gridSpan、一个vMerge；overlap负例 | [02](tickets/02-docx-semantic-table-closure.md) | **P1**：模型/renderer已支持，producer是最小断点 |
| B03 | `fail-closed` | `NCK1_DOCX_TABLE_REVIEW_REQUIRED`; Canonical无nested shape | [E02](#e02-docx-structure), [E03](#e03-docx-producer) | 1个outer cell含1x1 nested table | [02](tickets/02-docx-semantic-table-closure.md) 固化独立code，不实现嵌套 | **P3**：低频且容易变布局引擎，保持拒绝比猜测正确 |
| B04 | `fail-closed` | `NCK1_DOCX_TABLE_REVIEW_REQUIRED`, `MATERIALIZATION_TABLE_CELL_EMPTY` | [E01](#e01-materialization-schema), [E03](#e03-docx-producer) | 2x2表仅一个确认空cell；另一个“提取失败”负例 | [02](tickets/02-docx-semantic-table-closure.md) | **P1**：真实空格高频，当前占位文字不能诚实发布 |
| B05 | `missing` | 无稳定 presentation code | [E02](#e02-docx-structure), [E08](#e08-screen-renderer), [E09](#e09-print-renderer) | 3列表：1:2:1相对宽、header居中、body左对齐、外框+内线 | [05](tickets/05-table-presentation-intent.md) | **P1**：影响可读性，且可用少量离散意图解决；不做完整Word样式 |
| B06 | `partial` | `MATERIALIZATION_MEDIA_ITEM_INVALID`, `MATERIALIZATION_MEDIA_EXTRACTION_INVALID`, `READING_FIGURE_INCOMPLETE`; 无 classifier code | [E01](#e01-materialization-schema), [E05](#e05-materialization-adapter), [E06](#e06-reading-contract) | 一个非矩形流程关系图 + 一个可矩形化对照表（后者必须拒绝media fallback） | [04](tickets/04-media-layout-intent.md) | **P2**：允许诚实fallback，但必须防“表格截图化” |
| M01 | `partial` | `NCK1_DOCX_VISUAL_REVIEW_REQUIRED`, `MATERIALIZATION_MEDIA_ITEM_INVALID`, `MATERIALIZATION_MEDIA_EXTRACTION_INVALID`, `READING_FIGURE_INCOMPLETE` | [E03](#e03-docx-producer), [E05](#e05-materialization-adapter), [E06](#e06-reading-contract), [E14](#e14-legacy-docx-media) | 32x24 synthetic PNG嵌DOCX + 同图PDF crop；drawing ambiguity负例 | [04](tickets/04-media-layout-intent.md) | **P1**：像素闭合已有，universal detection/placement是断点 |
| M02 | `partial` | `MATERIALIZATION_SOURCE_VISUAL_TARGET_INVALID`; 无 content/furniture decision code | [E01](#e01-materialization-schema), [E10](#e10-materialization-contract-proof), [E12](#e12-mixed-table-media-proof) | 16x16 icon in cell + synthetic barcode in header | [04](tickets/04-media-layout-intent.md)；barcode等Owner决定 | **P2**：图标常见；条码学生可见性是产品决定 |
| M03 | `partial` | `MATERIALIZATION_MEDIA_RECIPE_MISMATCH`, `MATERIALIZATION_MEDIA_RECIPE_UNAVAILABLE`, `MATERIALIZATION_MEDIA_DIMENSIONS_MISMATCH`, `MATERIALIZATION_CONTENT_MEDIA_TYPE_UNSUPPORTED` | [E04](#e04-universal-source-cli), [E05](#e05-materialization-adapter), [E14](#e14-legacy-docx-media) | 20x10 PNG：PDF crop和DOCX entry各一；改1px/digest/density负例 | [01](tickets/01-source-region-review-pairing.md), [04](tickets/04-media-layout-intent.md) | **P0**：原像素可证明；需把proof暴露给Review并补layout metadata |
| M04 | `missing` | 无稳定 layout-intent code | [E07](#e07-shared-surface-adapter), [E08](#e08-screen-renderer), [E09](#e09-print-renderer) | 同图三种shape：block 40%左对齐、cell inline、跨栏拒绝例 | [04](tickets/04-media-layout-intent.md) | **P1**：当前generic居中会显著改变正文关系 |
| M05 | `partial`（Canonical保留，renderer丢失） | 无 caption-loss code | [E07](#e07-shared-surface-adapter), [E08](#e08-screen-renderer), [E09](#e09-print-renderer) | figure前后各一段 + 3字caption；三面必须同语义 | [04](tickets/04-media-layout-intent.md)；先等Owner定caption语义 | **P1**：已存在明确跨层信息丢失 |
| V01 | `supported`（已闭合content media） | `MATERIALIZATION_SOURCE_MEDIA_SET_MISMATCH`, `MATERIALIZATION_MEDIA_RECIPE_MISMATCH`, `MATERIALIZATION_MEDIA_DIMENSIONS_MISMATCH`, `READING_MEDIA_PLACEMENT_INVALID` | [E05](#e05-materialization-adapter), [E12](#e12-mixed-table-media-proof), [E13](#e13-shared-surface-proof) | 1个tiny PNG；三面digest/自然尺寸/加载断言 | 维持 E12/E13 regression | **P0 maintenance**：禁止AI重画与表面分叉的核心门禁 |
| V02 | `partial` | 已表达部分用 rich contract code；缺失部分无code | [E06](#e06-reading-contract), [E07](#e07-shared-surface-adapter), [E19](#e19-framed-columns-proof) | 2栏+表+图的组合shape，断言单一projection | [04](tickets/04-media-layout-intent.md), [05](tickets/05-table-presentation-intent.md) | **P1**：实现“同一布局意图”的主线 |
| V03 | `supported` | `MATERIALIZATION_MEDIA_PLACEMENT_INVALID`, `READING_FLATTENED_BRIDGE_FORBIDDEN` | [E01](#e01-materialization-schema), [E06](#e06-reading-contract), [E10](#e10-materialization-contract-proof) | full-page `visual_proof` + 未引用正例；引用为body负例 | 保持 contract regression | **P0 maintenance**：防整页截图冒充正文 |
| R01 | `supported` | `IMPORT_REVIEW_BUNDLE_DIGEST_MISMATCH`, `IMPORT_REVIEW_REVISION_IMMUTABLE`, `IMPORT_REVIEW_STALE_REVISION`, `IMPORT_REVIEW_ISSUES_UNRESOLVED` | [E15](#e15-review-store), [E16](#e16-review-projection-and-routes), [E17](#e17-review-ui-proof) | 现有mock immutable revision bundle | 维持 `node import-ops/verify.mjs` | **P0 maintenance**：审核信任/权限/不可变性成熟，不应另造preview |
| R02 | `missing` | 无 pairing code；只有 `IMPORT_REVIEW_PATH_INVALID`/target validation | [E15](#e15-review-store), [E16](#e16-review-projection-and-routes), [E17](#e17-review-ui-proof) | 1页synthetic PDF含table+icon；visual region分别绑定block/media target | [01](tickets/01-source-region-review-pairing.md) | **P0，推荐第一票**：所有视觉能力共同QA seam，且可复用现有模型 |
| R03 | `missing` | 无 | [E17](#e17-review-ui-proof)（证明当前单frame/文件链接） | 暂不做；需先收集R02真实QA误差样本 | R02完成并有教师证据后才开票 | **P3**：字体/重排噪声高，不先做自动diff |
| R04 | `partial` | `IMPORT_REVIEW_TARGET_REQUIRED`, `IMPORT_REVIEW_RECT_INVALID`, `IMPORT_REVIEW_PAGE_INVALID`, `IMPORT_REVIEW_SURFACE_INVALID` | [E15](#e15-review-store), [E17](#e17-review-ui-proof) | Screen table/figure/cell/icon各一次点击；source crop rectangle一次 | [01](tickets/01-source-region-review-pairing.md) 先闭合block/source；04再补media/content-node | **P0**：反馈若不绑定对象，下个revision无法稳定复核 |
| R05 | `partial` | `MATERIALIZATION_BLOCK_UNSUPPORTED`, `NCK1_DOCX_CONTAINER_UNSUPPORTED`, `NCK1_DOCX_TABLE_REVIEW_REQUIRED`, `READING_BLOCK_INVALID` 等 | [E01](#e01-materialization-schema), [E03](#e03-docx-producer), [E05](#e05-materialization-adapter), [E06](#e06-reading-contract) | 每个ticket带一个unknown邻接shape；都必须含locator+stable code | 02/03/04/06/07分别补，不建第二套总模型 | **P0**：防静默丢失；按adapter局部关闭而非巨型classifier |

## Evidence catalog

下列引用给出精确文件和 symbol。只有直接代码或 verifier 被用来判定状态；产品文档只用于
解释预期边界。

### E01 Materialization schema

- `schemas/paper-canonical/nck1-source-materialization-v1.schema.json`：`$defs.locator`,
  `$defs.block`, `$defs.sourceVisual`, `$defs.media`, `sourceCoverage`, `listening`。
- `shared/paper-canonical/nck1SourceMaterialization.mjs`：`validateLocator`, `validateTable`,
  `validateBlocks`, `validateMedia`, `validateSourceCoverage`, `validateListening`,
  `validateNck1SourceMaterialization`。

### E02 DOCX structure

- `server/paper-canonical/docxSourceAdapter.mjs`：`extractDocxDocumentText`,
  `extractDocxDocumentParagraphs`, `extractDocxDocumentStructure`。

### E03 DOCX producer

- `server/paper-import/nck1DocxMaterializationProducer.mjs`：`paragraphBlock`, `tableBlock`,
  `contentBlocks`, `listeningMaterialization`, `produceNck1DocxMaterialization`。

### E04 Universal source CLI

- `scripts/import-pipeline/universal-nck1.mjs`：`initialize`, `materialize`, `extractDocxMedia`,
  `cropPdf`。`materialize` 无条件进入 DOCX job；`cropPdf` 固定使用确定性 PDF crop semantics。
- `scripts/import-pipeline/nck1-docx-materialize.mjs`：`runNck1DocxMaterializationJobUnlocked`,
  `withPaperWriterLock`。

### E05 Materialization adapter

- `server/paper-canonical/nck1MaterializationAdapter.mjs`：`reextractMedia`,
  `validateDocxParagraphBindings`, `validateBundle`, `canonicalBlock`, `deriveSource`,
  `deriveNck1MaterializationBundle`。

### E06 Reading contract

- `shared/paper-canonical/richContent.mjs`：`TOP_LEVEL_RICH_BLOCK_KINDS`,
  `readingCaptureHasUnregisteredBlock`, `collectRichContentTargets`。
- `shared/paper-canonical/reading.mjs`：`readingLeafBlockIssues`,
  `readingFramedColumnsIssues`, `validateReadingContract`。

### E07 Shared surface adapter

- `shared/paper-normalization/canonicalPaperGroupSurfaceAdapter.mjs`：
  `buildCanonicalReadingConsumptionSurfaceData`。
- `shared/paper-normalization/canonicalPaperGroupSurfaceAdapter.d.ts`：
  `CanonicalReadingSurfaceTableBlock`, `CanonicalReadingSurfaceFigureBlock`,
  `CanonicalReadingSurfaceFramedColumnsBlock`。

### E08 Screen renderer

- `app/src/shared-ui/papersurface/PaperSurface.tsx`：`renderCanonicalReadingInlines`,
  `CanonicalReadingTable`, `renderCanonicalReadingBlock`。
- `app/src/shared-ui/papersurface/PaperSurface.css`：`.ps-canonical-reading-table`,
  `.ps-canonical-reading-figure`, `.ps-canonical-reading-framed-columns`。

### E09 Print renderer

- `server/print-renderer.mjs`：`renderCanonicalInlineNodes`, `renderCanonicalReadingTable`,
  `renderCanonicalReadingBlock`, `assertFramedColumnsFitsPrintPage`, `buildPrintHtml`，及同文件
  `.canonical-reading-*` print CSS。

### E10 Materialization contract proof

- `scripts/verify-nck1-source-materialization.mjs`：`makeFixture`，覆盖九 slots、45 answers、
  listening、mixed table/media、page coverage 与 visual inventory 拒绝例。

### E11 DOCX producer proof

- `test-fixtures/paper-import/nck1-docx-materialization-v1/fixture.mjs`：
  `makeSyntheticNck1DocxFixture`。
- `scripts/verify-nck1-docx-materialization-producer.mjs`：简单 semantic table、paragraph
  locator/order、45 answers、listening timing review、digest-bound resume、single writer。

### E12 Mixed table media proof

- `scripts/verify-paper-canonical-mixed-table-media.mjs`。
- `scripts/verify-paper-canonical-nck1-materialization-candidate.mjs`。
- `test-fixtures/paper-canonical/mixedTableMediaFixture.mjs`：
  `makeMixedTableMediaCanonicalFixture`。

### E13 Shared surface proof

- `scripts/verify-universal-nck1-candidate-surfaces.mjs`：`candidateConsumption`,
  `projectGroups` 以及真实 Screen/Student/Teacher Print/PDF DOM、文本、表格与媒体断言。

### E14 Legacy DOCX media

- `server/paper-import/docxSourceMedia.mjs`：`resolveShapeAssociations`,
  `cropDocxShapesFromPdf`, `convertDocxShapesWithLibreOffice`, `captureDocxSourceMedia`。
- `scripts/verify-docx-source-media-input.mjs`：真实 FODT→DOCX、document/header shape、
  explicit association、144-DPI crop 与 Screen/Print proof。此证据是 legacy PaperAsset seam，
  **不是** Universal producer 支持。

### E15 Review store

- `server/import-review/importReviewStore.mjs`：`ensureShape`, `normalizeRect`, `createIssue`,
  `finalizeRevision`, `approveRevision`。

### E16 Review projection and routes

- `server/import-review/revisionProjection.mjs`：`loadNck1ReviewSource`, `mediaArtifacts`,
  `buildConsumption`, `buildNck1ReviewProjection`, `printConsumption`。
- `server/import-review/importReviewRoutes.mjs`：`reviewPrintHtml` 及
  `/consumption`, `/asset`, `/print`, `/pdf`, `/files` routes。

### E17 Review UI proof

- `import-ops/public/app.js`：`filesHtml`, `surfaceUrl`, `surfaceStageHtml`, `screenTarget`,
  `applyScreenTarget`, `issueFormHtml`。
- `import-ops/verify.mjs`：immutable revision、issue workflow、`reviewRevision` real Screen、
  shared Print/PDF、权限与 shipping boundary assertions。

### E18 Inactive listening

- `shared/paper-canonical/listeningInactive.mjs`：`validateInventory`,
  `rejectForbiddenActiveFields`, `appendListeningInactiveClosures`。
- `server/paper-canonical/nck1MaterializationAdapter.mjs`：`listeningClosure`。

### E19 Framed columns proof

- `scripts/verify-paper-canonical-framed-columns.mjs`。
- `scripts/verify-paper-canonical-framed-columns-rendered.mjs`。
- `test-fixtures/paper-canonical/framedColumnsFixture.mjs`。
- `shared/paper-canonical/paperMockSz2026M1ReadingAFramedColumns.mjs` 仅是历史 paper-specific
  successor 证据，不是推荐 producer 模式。

### E20 Generic Source Capture

- `schemas/paper-canonical/source-capture-v1.schema.json`。
- `shared/paper-canonical/compiler.mjs`：`buildSourceCapture`, `validateCapture`,
  `buildGroupArtifact`。

## Conclusions from the matrix

- **最成熟**：限定形状的 DOCX 简单文本路径（C02/T01/T02）和已闭合媒体的三面同像素
  路径（V01），都有 immutable bytes、稳定 locator/identity、Canonical 与真实 surface proof。
- **最缺失**：扫描 PDF/OCR（C03）没有试卷 adapter；文本层 PDF（C01）虽可 capture，
  自动 Materialization 也不存在。视觉侧最明显的公共缺口是 R02/M04：没有源局部—真实
  Screen 配对，也没有共享媒体布局意图。
- **不要误报**：`init` 能接收 PDF/混合载体不等于 `materialize` 支持；legacy DOCX shape
  crop 不等于 Universal media producer；Canonical 能手工表达不等于检测能力 supported。
