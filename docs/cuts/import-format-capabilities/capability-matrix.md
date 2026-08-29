# 导题格式能力矩阵

Baseline: `main@4f0def1d05247e68a14a465aa8eb0da7672a0b17`（2026-08-29 live
`ls-remote` 复核）。状态定义见 `spec.md#capability-state-model`。

这不是“文件扩展名支持表”。每行只对该行写明的真实 shape 作结论。`manual` 表示 schema
可由人填写，不代表 producer 支持；`legacy` 表示旧 PaperAsset 路径存在 proof，不代表
Universal Source Materialization 已接通。

为保持可读性，一条逻辑行被拆成 A/B 两张表，并以稳定 ID 连接。A 表是层间表达，B 表是
交付与证据；同一 ID 的 A+B 合起来包含规定的全部字段。

## A. Capability path

| ID | 能力名称与真实输入形状 | 检测方式 | Source Capture 表达 | Materialization 表达 | Canonical / renderer 表达 | Screen 支持 | Print/PDF 支持 | Review QA 证据 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C01 | **文本层 PDF**：单栏、可靠文字层、标准 NCK1 顺序且无未处理视觉内容的独立题卷 PDF + 答案 PDF | Universal router按exact all-PDF source set选择 adapter；`pdftotext -bbox-layout`闭合 page/word bbox、顺序和简单表；`pdfimages -list`发现内嵌raster即拒绝；空页、重叠和多栏也拒绝 | immutable PDF bytes、digest、page count；每个 ordered item保存`page_region` | 自动生成9 groups、45 answers、paragraph/question/table与region；PDF review/receipt绑定producer+source digest | 与DOCX共用`produceNck1MaterializationFromStructures`，进入同一 Canonical blocks/Candidate | 同一 Candidate 可渲染 | 同一 shared print seam；Student/Teacher答案可见性不变 | 每段/题/答案有page+rect；语义表进入`sourceCoverage.visuals`并复用R02局部配对 |
| C02 | **DOCX 简单 NCK1 pair**：题卷 DOCX + 答案 DOCX + 确定性 PDF rendition；正文为顶层段落/简单表 | 读 OOXML `word/document.xml`，按顶层 `w:p`/`w:tbl` 顺序及固定 NCK1 heading/题号/选项/blank 模式检测 | 原 DOCX、答案 DOCX、rendition bytes/digest；段落 source index 与顺序 | 9 slots、45 answers、paragraph/table、`docx_part` locator、page coverage | 直接映射 Canonical family/rich blocks；不靠 PaperAsset 重建题意 | 支持简单文本/表 | 支持；与 Screen 同一 Candidate | revision 中有 DOCX/rendition/Materialization；局部源 locator 尚未并排 |
| C03 | **扫描 PDF / OCR**：无可靠文字层的扫描题卷/答案 | PDF text adapter能识别整页无文字层/部分页缺文字层并指向OCR workflow；仍无OCR engine、置信区间或人工确认sidecar | 保存immutable PDF bytes、digest、page count；失败保留page+full region | 产生`NCK1_PDF_TEXT_LAYER_MISSING`/`TEXT_COVERAGE_INCOMPLETE` review item；无OCR token/line/bbox/alternatives表达 | 无可信OCR输入，不能进入Canonical | 不支持 | 不支持 | 能明确定位需OCR页，尚不能并排审核OCR observation |
| C04 | **混合载体**：题卷 PDF + 答案 DOCX，或 DOCX/PDF/OCR 页混合 | `init`接受多source/role并为DOCX生成rendition；router只选择exact all-PDF或现有DOCX shape，mixed稳定拒绝 | manifest可同时列PDF/DOCX/rendition | schema可列多documents；没有通用分段来源合并规则 | 手工闭合可编译；producer不猜载体边界 | 手工Candidate可渲染 | 手工Candidate可渲染 | revision保存全部source files，但不能按block跳来源 |
| C05 | **听力文本与 timing**：1–20 题、答案、10 段听力文本，可有时序 | DOCX producer 按听力 section/题号/答案/10 段范围检测；timing 出现即要求 review | immutable question/answer source observations | `listening.state=captured`，20 questions/answers、10 transcript segments、timing array | 转成两个 `inactive_source` closure；明确 suppress，不产生 active Group | 不显示听力题/文本（设计如此） | 不显示（设计如此） | Materialization/源文件可读；无专用 transcript-source 对照 UI |
| C06 | **听力音频**：MP3/WAV 等原始附件与题卷共同到达 | Universal manifest/schema 不接受 audio document/media；generic inactive inventory 能接受 opaque captured audio | generic closure 可存 immutable audio digest/artifact ref | NCK1 Materialization 无 audio 字段 | generic `captured_uninterpreted` 可关闭为 inactive evidence；禁止 playback/active ref | 无播放（非本阶段目标） | 不输出 | `/ops/` revision manifest 当前不登记音频 role/播放器 |
| C07 | **有序图片页**：题卷或答案由一组 PNG/JPEG/WebP 整页图片组成 | Universal `mediaTypeFor` 只接受 PDF/DOCX；无 page-order manifest、图片页 probe 或试卷 OCR adapter | generic Source Capture 可存原 bytes/digest，但无一个 document 下的显式 page sequence | document media type不接受图片；不能生成 page locator/OCR observations | 无可信结构输入 | 不支持 | 不支持 | 只能在外部逐张看；`/ops/` 无图片页导航、局部 locator 或完整性提示 |
| C08 | **详解答案源**：每题答案后有解析，可能另含写作范文/听力原文 | carrier-neutral parser在“答案解析/答案详解/解析/详解”heading前抽答案键，另按既有contract抽写作范文与听力原文；DOCX与text-PDF都不提取客观题逐题详解 | 原答案文件 bytes保留；按 accepted policy 不为逐题详解创建 observation/source span | `answers[]` 只有 value+authority；writing可存 officialModelAnswer；逐题详解不投影 | 答案是权威；逐题详解不进入 Canonical 或教学分析 | Teacher只显示另行审核的 analysis，不显示源详解 | 同左；Student继续隐藏答案/解析 | synthetic PDF含“答案详解”与陷阱文本并断言不进入Materialization；原答案文件只作来源证据 |
| C09 | **纯答案键**：只有全部权威作答值，无逐题详解；可无写作范文 | DOCX `parseOfficialAnswers` 接受压缩 A–G ranges及56–65文本答案；缺值/冲突拒绝；没有 dedicated key-only end-to-end fixture | answer DOCX bytes、每组答案 paragraph locator | `answers[]` 足以闭合客观/填空答案；`officialModelAnswer` 可为 null；有听力时 transcript仍是独立必需 source | 正确答案可成为 authority；教师分析必须另行生成、按权威答案校验并人工审核 | 支持答案；分析完成后才满足 Owner QA | Teacher支持，Student隐藏；分析同左 | 当前可核答案 locator；与详解答案源使用同一 `answers[]`，无需第二套产品模型 |
| C10 | **尚无权威答案**：先找到完整题卷，答案文件暂缺 | Universal `initialize` 在写入前直接要求 authoritative answers；compiler也要求每题 official assertion | generic Capture理论可保存题卷，Universal路径没有 durable source-only record | 无答案时不能满足45 answers，不能 ready；当前也没有 awaiting-answers lifecycle | 禁止 AI 解题补答案，不能形成 Canonical authority | 不支持 | 不支持 | 当前无法进入 revision，只能仓库外记待办；没有后续答案与原question digest绑定 |
| C11 | **题卷与答案同文件**：一份DOCX/PDF先含完整题卷，后含详解或答案键 | Universal ingress接受`question_and_answers` role；DOCX/PDF producers都只选择独立`question_source`+`official_answers`并稳定拒绝combined role | 原合并文件bytes/digest可保存 | schema role可表达，但没有通用question/answer boundary adapter；手工可分别定位 | 边界闭合后仍应投影同一questions/answers，不建立combined Canonical | 手工Candidate可渲染 | 同左，Student不得泄漏文件后半答案 | 可打开整文件；无边界局部QA，也未证明student projection不从source直接泄漏 |
| T01 | **普通段落、源顺序与邻接**：DOCX 顶层`w:p`/`w:tbl`，或单栏PDF ordered text blocks | DOCX保留顶层sequence；PDF按page/y/x bbox排序、合并同一行碎片并识别简单表；重叠/并排歧义拒绝 | DOCX paragraph index/part selector；PDF page+normalized region | carrier-neutral ordered block stream，paragraph/table各有原carrier locator | ordered rich blocks；Canonical 是语义权威 | 按 block 顺序 | 按同一 block 顺序 | Screen可点group/question/block；PDF item可回放page/rect，DOCX仍缺自动rendition region |
| T02 | **题号、选项、blank**：标准 NCK1 21–65、ABCD/ABC、七选五 bank、完形/语法填空 | DOCX/PDF共用marker/sequence/cardinality与选项标签 parser；要求权威答案 | 段落、题目与答案各保留source locator | question identity、canonical/source number、options、blank refs、prompt、answer authority | family contracts + question/blank/option identity | 支持 | 支持且 Student/Teacher answer visibility 分离 | 可按question/group/block反馈；PDF synthetic证明45题page-region顺序可重放 |
| T03 | **页眉页脚、说明区、家具**：页码/校名/装订线/说明与正文并存 | DOCX universal extractor只读 body；legacy media extractor会枚举 header/footer shapes。body section headings 可识别；无通用 furniture classifier | 原字节保留；generic spans可表达；header/footer没有 universal observation | `sourceCoverage.visuals.disposition=furniture` 可手填；producer 不发现；body 外容器会拒绝 | 说明区若在 body 可成为 paragraph/instruction；家具不进入 Canonical | body 说明支持；家具不渲染 | 同左 | 只能打开源文件；家具无局部 inventory/确认控件 |
| T04 | **分栏/阅读细线框**：恰好两栏、栏内真段落/矩形表；及其它栏数 | PDF adapter能检测重复左右列并以`NCK1_PDF_MULTI_COLUMN_UNSUPPORTED`拒绝；仍不生产`framed_columns`；DOCX无universal detector | 可保存原源/visual proof；PDF失败含page+full region | schema/validator接受恰好2栏`framed_columns`；producer仍不生成 | Reading contract支持恰好2栏；只许paragraph/table、禁嵌套/figure/question | 两栏细线框共享样式 | 同一块，Print超高稳定拒绝 | PDF双栏负例有稳定region；已有framed-columns synthetic三面proof，尚无自动source-frame pairing |
| T05 | **答题框/写作区域**：应用文 skeleton、续写 starters、可写区域 | DOCX producer 检测 writing headings、word count、givens/starters；不测源框像素 | 文字/段落 locator | `writingTask` + ordered source blocks | Canonical answer-region/chrome 统一定义；不是从截图重建 | 支持语义答题区 | 支持 Student/Teacher Print/PDF | 可按 writing group/block 反馈；不承诺源框几何像素一致 |
| T06 | **跨页内容**：连续段落/题目跨 PDF 页；单一段落、表格或媒体本体跨页 | PDF adapter闭合全部页文字coverage并按page保持顺序；DOCX paragraph selector仍无页，多页rendition table仍需review | PDF item有page/region；DOCX保留part selector+rendition bytes但无映射 | 多页ordered items可表达；单block仍只有一个locator，跨页单体无复合locator | Canonical顺序可跨输出页；不保存来源分页语义 | 流式渲染 | renderer自己分页；`framed_columns`超页拒绝 | synthetic多页PDF证明题目顺序/表格region；空文字层页稳定拒绝，跨页单体仍未支持 |
| B01 | **普通表格**：非嵌套矩形网格、每格有文本、可有 header row/横向合并 | DOCX读`tblGrid`/rows/cells/`gridSpan`；PDF识别2–3行、2–4列、列起点稳定且宽度受限的简单文本网格；Materialization验证矩形覆盖 | DOCX table selector/cell paragraph indexes；PDF table page/region | `table`/row/cell identity，columnStart/columnSpan/rowSpan/role，ordered text/media_ref | rich table与semantic IDs；不会flatten成`[表:]` | HTML table | 同一semantic table；shared print CSS | DOCX mixed-table fixture；PDF 2x2 fixture保留semantic grid并产生exact source visual region |
| B02 | **合并单元格**：横向 `gridSpan` 与纵向 `vMerge` | extractor看见两者；producer只投影横向，纵向明确 review；validator/Canonical能表达 rowSpan | 原 OOXML/selector保留 | horizontal span 可生成；vertical span需人工且 producer fail closed | Canonical grid支持 columnSpan+rowSpan | 两种 span 都能渲染 | 两种 span 都能渲染 | synthetic Canonical mixed table proof；无 producer vertical fixture |
| B03 | **嵌套表格**：cell 内含第二个 `w:tbl` | extractor计数 `nestedTableCount`/`containsNestedTable` | 源 DOCX/outer selector保留 | producer报 review；schema没有 nested table cell block | Canonical table cell只含 text/media_ref；不支持 nested table | 不支持 | 不支持 | 可从原 DOCX人工查；没有局部 crop |
| B04 | **空单元格**：网格中真实存在的空白 cell | extractor能看到空 text；producer标记 review并写占位文字，不能 ready | 源 cell存在性在 OOXML 中；未投影成独立 cell locator | validator要求非空 ordered content，报 `MATERIALIZATION_TABLE_CELL_EMPTY` | Canonical当前不能区分“源确为空”与“漏提取” | 不支持诚实空格；占位 output不能 ready | 同左 | 原表可人工看；无 exact empty-cell issue target |
| B05 | **边框、对齐、列宽**：普通表格的可见关系属性 | DOCX extractor未解析 tbl/cell border、jc/vAlign、gridCol widths；PDF无 detector | 原字节保留但无 shape observation | 无字段 | 无共享 table presentation intent；renderer统一 100% fixed table、固定 border/padding/top align | 仅 EQB generic style | 同义但 Screen/Print border单位不同；不保源属性 | 无源-渲染属性对照 |
| B06 | **无法诚实结构化的复杂表/图形**：非矩形关系图、复杂流程组合 | 没有通用 classifier；人工必须先证明不是普通语义表 | source visual + crop recipe 可表达 | `content` media + `pdf_crop`/DOCX media；whole-page `visual_proof` 不可被引用为正文 | Reading `figure` 或 table-cell media；媒体不能反推题意 | figure/media支持 | figure/media支持 | 只能开源文件；需局部 crop pairing 才能审“为何不能语义化” |
| M01 | **照片、插图、图表、流程图**：正文中的不可结构化视觉 | Universal producer看见 DOCX drawing但只报 review；文本PDF能发现embedded raster并拒绝，但不能提取/关联，vector diagram仍无通用detector；legacy shape path需显式 association | embedded bytes或 PDF crop digest；legacy可枚举 shape | media kind只有 `figure/icon/barcode`，上述类型合并为 `figure`；extraction recipe可闭合 | Canonical `figure` block、immutable media identity | 支持同源 bytes | 支持同源 bytes | 源文件链接；没有自动 source crop ↔ figure 配对 |
| M02 | **图标、条码**：表格内图标、二维码/条形码、页眉编码 | 无 universal visual classifier；media kind可由人标 `icon`/`barcode` | bytes/digest/crop可保存 | `kind=icon|barcode`；按 accepted policy，正文相关为content、管理条码为furniture，歧义需人工 | icon可经 table `media_ref`；barcode policy尚未实现 | 当普通 image | 当普通 image | 无 content-vs-furniture确认控件；产品规则已定但检测/确认仍缺 |
| M03 | **原图裁剪与 provenance**：页码、源矩形、pixel、DPI、digest | manual `crop-pdf` 与 Review endpoint 共用 `rasterPdfRegion`；DOCX ZIP entry；legacy shape crop 144 DPI + 2pt padding | immutable source/media artifacts | PDF recipe有 page+normalized region+density；source visual可带optional normalized region；DOCX entry recipe无页/矩形 | adapter重放 recipe、核 digest/尺寸；拒绝 content SVG 未栅格化 | data URL 使用闭合 bytes | 同一 bytes | `/ops/` source card显示page/rect/target/digest；crop response带pixel dimensions headers；digest漂移拒绝 |
| M04 | **媒体版式关系**：block/inline、对齐、跨栏、相对正文宽度、边距 | 当前不检测 source layout relation | 原字节有事实但无 observation | 只有 figure block 或 table-cell `media_ref`；无 alignment/width ratio/margin/cross-column | 只有 block figure与cell inline；renderer用居中/max-width generic规则 | generic center/contain | generic center/contain | 无字段可对照，差异会被静默归一化 |
| M05 | **标题及前后正文关系**：图片题注、图前/图后段落 | ordered block stream保留 block邻接；producer不自动生成 figure/caption | block source locator可保邻接 | figure有 caption content；没有 caption role（学生正文 vs QA metadata） | Canonical surface type保留 caption/captionInlines | figure renderer忽略 caption、alt为空 | figure renderer忽略 caption、alt为空 | 无 caption可见性检查；这是已证实三面信息丢失 |
| V01 | **内容像素三面同源**：Canonical content media 已闭合 | adapter re-extracts and compares bytes/dimensions/digest | immutable media artifact | exact recipe + supplied bytes必须一一匹配 | consumption `mediaArtifacts` 将同一 encoded bytes投影 | 同一 encoded bytes | 同一 encoded bytes | revision finalize重编译 Candidate；现有 surface verifier检查 image load/count |
| V02 | **版式关系三面同源**：表/图比例、位置、留白、正文关系 | 只检测 framed_columns 和部分 semantic table geometry；媒体/表 style缺失 | 局部事实多未结构化 | 可表达 block order、table spans、2-column frame；不能表达大多数关系 | 已有关系由 shared adapter传递；缺失关系无法传递 | 对已表达部分支持 | 对已表达部分支持 | 没有 source local comparison，不能证明关系忠实 |
| V03 | **整页视觉证据不冒充正文**：full-page screenshot/rendition仅 QA | media `usage` 与 sourceCoverage disposition闭合 | 可作为 source document/`visual_proof` artifact | `visual_proof` 不允许被 content ref；content media必须恰好用一次 | Reading拒绝 flattened `[图:]` bridge，媒体必须闭合 | 不渲染 visual proof为正文 | 不渲染 visual proof为正文 | 当前只可手工打开；原则有 validator proof |
| R01 | **不可变真实表面审核**：同一 revision 的 Screen、两种 Print、PDF | finalize重推 Candidate/Consumption并绑定 producer/renderer/digests | revision保存 source/materialization/media files及摘要 | Review projection从 revision bytes重新 import/compile | Screen consumption + print consumption仅替换 consumer contract | 真实 `PaperBrowsePage` iframe | `buildPrintHtml`；PDF由同 HTML + Chromium | 支持 issue/reply/fix/approval 状态机；renderer drift会使认可失效 |
| R02 | **原卷局部 + 真实 Screen 并排与 locator跳转** | Screen click读取exact group/question/block/media identity，以target优先级精确匹配source visual；不做最近区域猜测 | revision内immutable PDF/rendition bytes、digest、page、optional region | `sourceCoverage.visuals`投影为`paired`或`unlocated`，不建第二套locator | Screen DOM的exact block/media ID与source target join；Canonical仍是语义权威 | 中间保留真实Screen，右栏显示原卷crop并可双向聚焦 | 切换Print/PDF时保留source card；点击定位回真实Screen | authenticated crop endpoint + card metadata + whole-source link；无region明确显示未配对 |
| R03 | **局部 overlay / 差异提示**：同定位源局部与渲染局部 | 无配准、diff、阈值/误报模型 | 无 renderer crop evidence | 无 | 无共享 comparison model | 无 | 无 | 缺失；应先完成 R02，再用教师任务验证是否值得做 |
| R04 | **问题绑定到题组/题/表格/媒体/源区域** | Screen click用closest exact DOM identity；source card从同一target带入page/rect | issue沿用groupId/questionId/blockId/page/normalized rect/surface，无新表 | Review projection提供visual target；issue仍不保存独立media/sourceVisual identity | table/figure有blockId；media click保留其所在block；cell/content node仍未进入issue model | group/question/block可绑定并可从source issue回放 | page可手填；source crop自动提交rect | table/figure/source region可双向回放；仍不能把issue精确绑定到cell/mediaId/sourceVisualId |
| R05 | **未知形状统一 fail closed**：未登记 container/table/media/layout/OCR | DOCX检测部分已知风险；PDF检测无文字层、缺页、embedded raster、多栏、重叠/并排顺序和source-set歧义；vector visual与OCR尚无完整adapter | source bytes保留；PDF失败保留document/page/region evidence | 稳定`MATERIALIZATION_*`、`NCK1_DOCX_*`与`NCK1_PDF_*` codes；仍无跨adapter总inventory | compiler不派生可用interpretation；未知rich block/media也拒绝 | 未进入ready则不渲染 | 未进入ready则不渲染 | producer review保存shape code与region；尚未自动变成`/ops/` source-region task |

## B. Status, evidence and next work

| ID | 当前状态 | 已知失败码（代表性） | 现有代码与测试证据 | 所需最小 fixture | 下一步 ticket | 优先级及理由 |
| --- | --- | --- | --- | --- | --- | --- |
| C01 | `partial`（producer已实现；真实Owner QA待办） | `NCK1_PDF_TEXT_LAYER_MISSING`, `NCK1_PDF_TEXT_COVERAGE_INCOMPLETE`, `NCK1_PDF_VISUAL_REVIEW_REQUIRED`, `NCK1_PDF_READING_ORDER_AMBIGUOUS`, `NCK1_PDF_MULTI_COLUMN_UNSUPPORTED`, `NCK1_PDF_SOURCE_SET_AMBIGUOUS` | [E03](#e03-docx-producer), [E04](#e04-universal-source-cli), [E13](#e13-shared-surface-proof), [E23](#e23-text-layer-pdf-producer-proof) | 已有多页题卷+单页答案synthetic PDF pair；image-only/空页/embedded raster/双栏/重叠/无边框并排负例；仍需真实非生产QA | [06](tickets/06-scanned-pdf-ocr-evidence.md) 复用ordered-item contract | **P0 maintenance**：OCR与图片主线共同底座；不得放宽成任意PDF |
| C02 | `supported`（限定简单文本 shape） | `NCK1_DOCX_SOURCE_SET_AMBIGUOUS`, `NCK1_DOCX_SECTION_AMBIGUOUS`, `NCK1_DOCX_QUESTION_SEQUENCE_INCOMPLETE`, `NCK1_DOCX_ANSWER_MISSING` | [E02](#e02-docx-structure), [E03](#e03-docx-producer), [E11](#e11-docx-producer-proof) | 现有 tiny synthetic DOCX pair；继续保持无真实卷文本 | 保持 E11 回归；表/媒体走 02/04 | **P1 maintenance**：当前最成熟的 carrier，不需重写 |
| C03 | `fail-closed`（已检测，OCR未实现） | `NCK1_PDF_TEXT_LAYER_MISSING`, `NCK1_PDF_TEXT_COVERAGE_INCOMPLETE` | [E23](#e23-text-layer-pdf-producer-proof)；词汇OCR不属于本seam | 已有image-only/空文字页拒绝；下一步加清晰OCR行+低置信噪声+小图 | [06](tickets/06-scanned-pdf-ocr-evidence.md) | **P0**：不会再把scan误当text PDF，但仍完全不能导题 |
| C04 | `partial`（manifest可表达、producer拒绝） | `NCK1_DOCX_SOURCE_SET_AMBIGUOUS`, `NCK1_PDF_SOURCE_SET_AMBIGUOUS`, `source_incomplete` | [E03](#e03-docx-producer), [E04](#e04-universal-source-cli), [E23](#e23-text-layer-pdf-producer-proof) | 题卷1页text PDF + 答案1页DOCX；反向组合各一例 | [07](tickets/07-mixed-carrier-routing.md) | **P2**：manifest已能收，需等OCR adapter稳定后再合并路由 |
| C05 | `partial`（inactive closure supported） | `NCK1_DOCX_LISTENING_RANGES_AMBIGUOUS`, `NCK1_DOCX_LISTENING_TRANSCRIPT_AMBIGUOUS`, `MATERIALIZATION_LISTENING_TRANSCRIPT_COVERAGE_INVALID` | [E03](#e03-docx-producer), [E18](#e18-inactive-listening), [E10](#e10-materialization-contract-proof) | 20个短问题+10个短 transcript segment，无版权文本；timing有/无 | 保持 inactive regression；audio走 08 | **P2**：语义闭合安全，但无专用 Review UX且不激活播放 |
| C06 | `partial`（generic closure only） | `LISTENING_AUDIO_EVIDENCE_INCOMPLETE`, `LISTENING_ACTIVE_OR_AUDIO_REFERENCE_UNSUPPORTED`; Universal 无 audio-specific code | [E18](#e18-inactive-listening) | 1秒synthetic tone + closed digest + no-playback negative | [08](tickets/08-listening-audio-evidence.md) | **P2**：保全来源重要，但不阻塞非听力正文 |
| C07 | `missing` | ingress只有非结构化 `Source is not PDF or DOCX` error；无图片页 shape code | [E04](#e04-universal-source-cli), [E20](#e20-generic-source-capture) | 完整synthetic题卷/答案图片bundle + 显式顺序；漏页/重复页/低置信负例 | [09](tickets/09-ordered-image-source-bundle.md) | **P0，首批业务能力**：可覆盖难搜集、时效性高的来源；必须复用OCR并人工确认，不能把整页图直接发布 |
| C08 | `partial`（DOCX/text-PDF known heading） | `NCK1_DOCX_ANSWER_CONFLICT`, `NCK1_PDF_ANSWER_CONFLICT`, `NCK1_PDF_ANSWER_TABLE_REVIEW_REQUIRED`; 未知详解heading仍无独立boundary code | [E21](#e21-answer-source-shapes), [E23](#e23-text-layer-pdf-producer-proof) | 已有PDF完整短答案键后带synthetic“答案详解”陷阱；下一步补边界不明负例 | [10](tickets/10-answer-source-shape-closure.md) | **P1**：已证明已知heading只取答案；仍需统一未知边界拒绝与image carrier |
| C09 | `partial`（DOCX parser shape） | `NCK1_DOCX_ANSWER_RANGE_AMBIGUOUS`, `NCK1_DOCX_ANSWER_MISSING`, `MATERIALIZATION_ANSWERS_INCOMPLETE` | [E01](#e01-materialization-schema), [E11](#e11-docx-producer-proof), [E21](#e21-answer-source-shapes) | 全45项短 answer key，无解析/范文；漏1项与冲突负例 | [10](tickets/10-answer-source-shape-closure.md) | **P1**：这类来源足以确定正确答案；教学分析仍走独立生成与审核流程 |
| C10 | `missing`（安全拒绝但无durable intake） | ingress只有 prose error；compiler有 `OFFICIAL_ANSWER_MISSING` | [E04](#e04-universal-source-cli), [E20](#e20-generic-source-capture), [E21](#e21-answer-source-shapes) | 1页synthetic question-only DOCX/PDF；后续附同digest对应答案 | [11](tickets/11-source-only-awaiting-answers.md) | **P1**：辛苦搜到的卷不应丢失，但无答案绝不能进入发布链 |
| C11 | `partial`（ingress/schema only） | `NCK1_DOCX_SOURCE_SET_AMBIGUOUS`, `NCK1_PDF_SOURCE_SET_AMBIGUOUS`; 无combined-boundary code | [E01](#e01-materialization-schema), [E03](#e03-docx-producer), [E04](#e04-universal-source-cli), [E21](#e21-answer-source-shapes) | 一份synthetic file：题卷短token→明确答案heading→完整key；无heading/双heading负例 | [10](tickets/10-answer-source-shape-closure.md) | **P2**：包装常见但必须先证明边界，避免答案混进学生正文 |
| T01 | `partial`（DOCX supported；PDF待真实QA） | `NCK1_DOCX_CONTAINER_UNSUPPORTED`, `NCK1_PDF_READING_ORDER_AMBIGUOUS`, `NCK1_PDF_MULTI_COLUMN_UNSUPPORTED` | [E02](#e02-docx-structure), [E05](#e05-materialization-adapter), [E11](#e11-docx-producer-proof), [E23](#e23-text-layer-pdf-producer-proof) | DOCX 3段夹表；PDF多页ordered questions+table；重叠/双栏负例 | 继续E11/E23；OCR由06复用 | **P0 maintenance**：源顺序是所有邻接/布局的底座 |
| T02 | `partial`（DOCX supported；PDF待真实QA） | `NCK1_DOCX_QUESTION_NUMBER_AMBIGUOUS`, `NCK1_PDF_OPTIONS_AMBIGUOUS`, `NCK1_PDF_BLANK_SEQUENCE_INCOMPLETE`, carrier answer conflict/missing codes | [E03](#e03-docx-producer), [E11](#e11-docx-producer-proof), [E13](#e13-shared-surface-proof), [E23](#e23-text-layer-pdf-producer-proof) | 两载体均为45题synthetic；每个负例只破坏一个marker/shape | 维持共用parser回归 | **P0 maintenance**：内容语义主路径，不要被视觉work回归 |
| T03 | `partial` | `NCK1_DOCX_CONTAINER_UNSUPPORTED`, `NCK1_DOCX_VISUAL_REVIEW_REQUIRED`；无 furniture detector code | [E02](#e02-docx-structure), [E03](#e03-docx-producer), [E14](#e14-legacy-docx-media) | body说明+header页码+footer校名各一个短token | [01](tickets/01-source-region-review-pairing.md) 后另开 detector ticket | **P2**：先保留并可审，再决定哪些家具无需 Canonical |
| T04 | `partial`（PDF多栏已fail-closed） | `NCK1_PDF_MULTI_COLUMN_UNSUPPORTED`, `MATERIALIZATION_FRAMED_COLUMNS_INVALID`, `READING_FRAMED_COLUMNS_CHILD_UNSUPPORTED`, `CANONICAL_FRAMED_COLUMNS_EXCEEDS_PAGE` | [E19](#e19-framed-columns-proof), [E23](#e23-text-layer-pdf-producer-proof) | 已有PDF双栏拒绝与Canonical 2栏synthetic；另需真实频率证据再决定producer shape | 保持拒绝；有频率证据后另开窄票 | **P1**：下游成熟但producer不猜栏序；禁止通用任意栏引擎 |
| T05 | `supported`（语义答题区） | `NCK1_DOCX_WRITING_BOUNDARY_AMBIGUOUS`, `NCK1_DOCX_WRITING_SKELETON_AMBIGUOUS`, `MATERIALIZATION_WRITING_GIVENS_PLACEMENT_INVALID` | [E03](#e03-docx-producer), [E13](#e13-shared-surface-proof) | 2个short writing task，givens/starters/word count各一 | 维持共享 writing regression | **P1 maintenance**：已遵守“关系忠实而非像素框复刻” |
| T06 | `partial`（PDF ordered items implemented） | `NCK1_PDF_TEXT_COVERAGE_INCOMPLETE`, `NCK1_DOCX_TABLE_PAGE_REVIEW_REQUIRED`, `CANONICAL_FRAMED_COLUMNS_EXCEEDS_PAGE` | [E01](#e01-materialization-schema), [E09](#e09-print-renderer), [E23](#e23-text-layer-pdf-producer-proof) | 已有多页PDF顺序+表region、空页拒绝；仍需跨页单段/表负例 | OCR由06复用page contract；跨页单体另开窄票 | **P1**：连续items已闭合，复合locator仍缺 |
| B01 | `partial`（DOCX supported；PDF待真实QA） | `MATERIALIZATION_TABLE_INVALID`, `MATERIALIZATION_TABLE_OVERLAP`, `MATERIALIZATION_TABLE_NOT_RECTANGULAR`, `NCK1_PDF_READING_ORDER_AMBIGUOUS`, `READING_TABLE_INCOMPLETE` | [E01](#e01-materialization-schema), [E02](#e02-docx-structure), [E10](#e10-materialization-contract-proof), [E12](#e12-mixed-table-media-proof), [E23](#e23-text-layer-pdf-producer-proof) | DOCX 2x2+横向merge；PDF 2x2有边框正例、无边框并排负例 | [02](tickets/02-docx-semantic-table-closure.md) 扩DOCX边界；PDF复杂表保持拒绝 | **P0 maintenance**：高频且语义化优先 |
| B02 | `partial` | `NCK1_DOCX_TABLE_REVIEW_REQUIRED`, `MATERIALIZATION_TABLE_ROWSPAN_OVERFLOW` | [E02](#e02-docx-structure), [E03](#e03-docx-producer), [E12](#e12-mixed-table-media-proof) | 3x3表：一个gridSpan、一个vMerge；overlap负例 | [02](tickets/02-docx-semantic-table-closure.md) | **P1**：模型/renderer已支持，producer是最小断点 |
| B03 | `fail-closed` | `NCK1_DOCX_TABLE_REVIEW_REQUIRED`; Canonical无nested shape | [E02](#e02-docx-structure), [E03](#e03-docx-producer) | 1个outer cell含1x1 nested table | [02](tickets/02-docx-semantic-table-closure.md) 固化独立code，不实现嵌套 | **P3**：低频且容易变布局引擎，保持拒绝比猜测正确 |
| B04 | `fail-closed` | `NCK1_DOCX_TABLE_REVIEW_REQUIRED`, `MATERIALIZATION_TABLE_CELL_EMPTY` | [E01](#e01-materialization-schema), [E03](#e03-docx-producer) | 2x2表仅一个确认空cell；另一个“提取失败”负例 | [02](tickets/02-docx-semantic-table-closure.md) | **P1**：真实空格高频，当前占位文字不能诚实发布 |
| B05 | `missing` | 无稳定 presentation code | [E02](#e02-docx-structure), [E08](#e08-screen-renderer), [E09](#e09-print-renderer) | 3列表：1:2:1相对宽、header居中、body左对齐、外框+内线 | [05](tickets/05-table-presentation-intent.md) | **P1**：影响可读性，且可用少量离散意图解决；不做完整Word样式 |
| B06 | `partial` | `MATERIALIZATION_MEDIA_ITEM_INVALID`, `MATERIALIZATION_MEDIA_EXTRACTION_INVALID`, `READING_FIGURE_INCOMPLETE`; 无 classifier code | [E01](#e01-materialization-schema), [E05](#e05-materialization-adapter), [E06](#e06-reading-contract) | 一个非矩形流程关系图 + 一个可矩形化对照表（后者必须拒绝media fallback） | [04](tickets/04-media-layout-intent.md) | **P2**：允许诚实fallback，但必须防“表格截图化” |
| M01 | `partial` | `NCK1_DOCX_VISUAL_REVIEW_REQUIRED`, `NCK1_PDF_VISUAL_REVIEW_REQUIRED`, `MATERIALIZATION_MEDIA_ITEM_INVALID`, `MATERIALIZATION_MEDIA_EXTRACTION_INVALID`, `READING_FIGURE_INCOMPLETE` | [E03](#e03-docx-producer), [E05](#e05-materialization-adapter), [E06](#e06-reading-contract), [E14](#e14-legacy-docx-media), [E23](#e23-text-layer-pdf-producer-proof) | 已有2x2 synthetic PNG内嵌text PDF拒绝；另需同图DOCX + PDF crop与vector drawing ambiguity负例 | [04](tickets/04-media-layout-intent.md) | **P1**：raster已不再静默丢失，但像素闭合与placement仍未接入universal producer |
| M02 | `partial` | `MATERIALIZATION_SOURCE_VISUAL_TARGET_INVALID`; 无 content/furniture detector code | [E01](#e01-materialization-schema), [E10](#e10-materialization-contract-proof), [E12](#e12-mixed-table-media-proof) | 16x16 icon in cell + synthetic barcode分别位于正文/header；歧义位置负例 | [04](tickets/04-media-layout-intent.md) | **P2**：产品规则已定；还需通用检测和教师确认 |
| M03 | `partial`（Review proof supported） | `MATERIALIZATION_MEDIA_RECIPE_MISMATCH`, `MATERIALIZATION_SOURCE_VISUAL_REGION_INVALID`, `IMPORT_REVIEW_SOURCE_DIGEST_MISMATCH`, `IMPORT_REVIEW_SOURCE_LOCATOR_UNAVAILABLE` | [E04](#e04-universal-source-cli), [E05](#e05-materialization-adapter), [E16](#e16-review-projection-and-routes), [E22](#e22-source-region-pairing-proof) | 已有1页synthetic PDF table/icon crop；继续为media recipe保留改1px/density负例 | [04](tickets/04-media-layout-intent.md) | **P1**：原像素与Review局部已可证明；剩余是共享layout metadata |
| M04 | `missing` | 无稳定 layout-intent code | [E07](#e07-shared-surface-adapter), [E08](#e08-screen-renderer), [E09](#e09-print-renderer) | 同图三种shape：block 40%左对齐、cell inline、跨栏拒绝例 | [04](tickets/04-media-layout-intent.md) | **P1**：当前generic居中会显著改变正文关系 |
| M05 | `partial`（Canonical保留，renderer丢失） | 无 caption-loss code | [E07](#e07-shared-surface-adapter), [E08](#e08-screen-renderer), [E09](#e09-print-renderer) | figure前后各一段 + 学生可见caption + QA filename metadata | [04](tickets/04-media-layout-intent.md) | **P1**：产品规则已定；当前仍有明确跨层信息丢失 |
| V01 | `supported`（已闭合content media） | `MATERIALIZATION_SOURCE_MEDIA_SET_MISMATCH`, `MATERIALIZATION_MEDIA_RECIPE_MISMATCH`, `MATERIALIZATION_MEDIA_DIMENSIONS_MISMATCH`, `READING_MEDIA_PLACEMENT_INVALID` | [E05](#e05-materialization-adapter), [E12](#e12-mixed-table-media-proof), [E13](#e13-shared-surface-proof) | 1个tiny PNG；三面digest/自然尺寸/加载断言 | 维持 E12/E13 regression | **P0 maintenance**：禁止AI重画与表面分叉的核心门禁 |
| V02 | `partial` | 已表达部分用 rich contract code；缺失部分无code | [E06](#e06-reading-contract), [E07](#e07-shared-surface-adapter), [E19](#e19-framed-columns-proof) | 2栏+表+图的组合shape，断言单一projection | [04](tickets/04-media-layout-intent.md), [05](tickets/05-table-presentation-intent.md) | **P1**：实现“同一布局意图”的主线 |
| V03 | `supported` | `MATERIALIZATION_MEDIA_PLACEMENT_INVALID`, `READING_FLATTENED_BRIDGE_FORBIDDEN` | [E01](#e01-materialization-schema), [E06](#e06-reading-contract), [E10](#e10-materialization-contract-proof) | full-page `visual_proof` + 未引用正例；引用为body负例 | 保持 contract regression | **P0 maintenance**：防整页截图冒充正文 |
| R01 | `supported` | `IMPORT_REVIEW_BUNDLE_DIGEST_MISMATCH`, `IMPORT_REVIEW_REVISION_IMMUTABLE`, `IMPORT_REVIEW_STALE_REVISION`, `IMPORT_REVIEW_ISSUES_UNRESOLVED` | [E15](#e15-review-store), [E16](#e16-review-projection-and-routes), [E17](#e17-review-ui-proof) | 现有mock immutable revision bundle | 维持 `node import-ops/verify.mjs` | **P0 maintenance**：审核信任/权限/不可变性成熟，不应另造preview |
| R02 | `supported`（exact region-bearing visual） | `MATERIALIZATION_SOURCE_VISUAL_REGION_INVALID`, `IMPORT_REVIEW_SOURCE_VISUAL_NOT_FOUND`, `IMPORT_REVIEW_SOURCE_LOCATOR_UNAVAILABLE`, `IMPORT_REVIEW_SOURCE_DIGEST_MISMATCH` | [E15](#e15-review-store), [E16](#e16-review-projection-and-routes), [E17](#e17-review-ui-proof), [E22](#e22-source-region-pairing-proof) | verifier实时生成1页PDF、table/icon/unlocated visual并在authenticated `/ops/`实点 | 真实非生产Candidate做Owner QA；producer regions由03/06/09生成 | **P0 maintenance**：后续每个adapter都必须复用，不另造preview |
| R03 | `missing` | 无 | [E17](#e17-review-ui-proof)（证明当前单frame/文件链接） | 暂不做；需先收集R02真实QA误差样本 | R02完成并有教师证据后才开票 | **P3**：字体/重排噪声高，不先做自动diff |
| R04 | `partial`（block/source region supported） | `IMPORT_REVIEW_TARGET_REQUIRED`, `IMPORT_REVIEW_RECT_INVALID`, `IMPORT_REVIEW_PAGE_INVALID`, `IMPORT_REVIEW_SURFACE_INVALID` | [E15](#e15-review-store), [E17](#e17-review-ui-proof), [E22](#e22-source-region-pairing-proof) | 现有table/icon/source rectangle正例；后续补cell/content-node负例 | [04](tickets/04-media-layout-intent.md) 补精确media/content-node identity | **P1**：稳定block+source已闭合；细粒度identity不阻塞图片主线 |
| R05 | `partial`（DOCX/PDF adapters） | `MATERIALIZATION_BLOCK_UNSUPPORTED`, `NCK1_DOCX_CONTAINER_UNSUPPORTED`, `NCK1_PDF_TEXT_LAYER_MISSING`, `NCK1_PDF_VISUAL_REVIEW_REQUIRED`, `NCK1_PDF_READING_ORDER_AMBIGUOUS`, `NCK1_PDF_MULTI_COLUMN_UNSUPPORTED` 等 | [E01](#e01-materialization-schema), [E03](#e03-docx-producer), [E05](#e05-materialization-adapter), [E23](#e23-text-layer-pdf-producer-proof) | 每个ticket带一个unknown邻接shape；PDF六类负例均含page/region | 02/04/06/07/09/10/11分别补，不建第二套总模型 | **P0**：防静默丢失；按adapter局部关闭而非巨型classifier |

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
  `contentBlocks`, `listeningMaterialization`, `produceNck1MaterializationFromStructures`,
  `produceNck1DocxMaterialization`。其中 carrier-neutral parser 由 DOCX/PDF 共用。

### E04 Universal source CLI

- `scripts/import-pipeline/universal-nck1.mjs`：`initialize`, `materialize`, `extractDocxMedia`,
  `cropPdf`。`materialize` 进入按完整 source-set shape 选择的通用 job；`cropPdf` 固定使用
  确定性 PDF crop semantics。
- `scripts/import-pipeline/nck1-docx-materialize.mjs`：`selectProducer`,
  `runNck1MaterializationJobUnlocked`, `withPaperWriterLock`；保留旧 DOCX export alias。

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

- `server/import-review/revisionProjection.mjs`：`loadNck1ReviewSource`,
  `sourceVisualProjection`, `mediaArtifacts`, `buildConsumption`, `buildNck1ReviewProjection`,
  `printConsumption`。
- `server/import-review/importReviewRoutes.mjs`：`reviewPrintHtml`、revision-bound
  `/source-visuals/:visualId` 及 `/consumption`, `/asset`, `/print`, `/pdf`, `/files` routes。
- `server/paper-canonical/pdfRegionRaster.mjs`：`rasterPdfRegion`；Review、media recipe replay
  与 `universal-nck1 crop-pdf` 共用同一 normalized-region primitive。

### E17 Review UI proof

- `import-ops/public/app.js`：`filesHtml`, `surfaceUrl`, `surfaceStageHtml`, `screenTarget`,
  `selectedSourceVisual`, `sourceVisualHtml`, `applyScreenTarget`, `locateScreenTarget`,
  `sourceVisualForIssue`, `issueFormHtml`。
- `import-ops/verify.mjs`：immutable revision、issue workflow、`reviewRevision` real Screen、
  source page/rect persistence、shared Print/PDF、权限与 shipping boundary assertions。

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

### E21 Answer source shapes

- `schemas/paper-canonical/nck1-source-materialization-v1.schema.json`：`$defs.answer` 只闭合
  `questionId`, `canonicalNumber`, `value`, `authority`；`writingTask.officialModelAnswer` 可为空。
- `server/paper-import/nck1DocxMaterializationProducer.mjs`：`parseOfficialAnswers`,
  `isAnswerExplanationHeading`, `writingAnswerRanges`, `listeningMaterialization`,
  `activeAnswers`。普通答案在已知“答案解析/详解”heading前截止；写作范文/听力原文
  另行提取，客观题详解没有投影。
- `test-fixtures/paper-import/nck1-docx-materialization-v1/fixture.mjs`：`answerDocument` 含
  compressed answer ranges、56–65文本答案、写作范文与“答案解析”边界。
- `scripts/verify-nck1-docx-materialization-producer.mjs`：断言45项权威答案及只有
  `writing_analysis` 留在 Agent reasoning path。

### E22 Source-region pairing proof

- `scripts/verify-import-review-source-pairing.mjs`：运行时生成匿名1页PDF；验证authenticated
  PNG crop与metadata headers、unknown/unlocated/digest drift拒绝；真实浏览器打开`/ops/`，
  实点Screen table/icon/unlocated block，验证跨Print保留card、exact Screen回跳、source issue
  group/block/page/rect提交及刷新回放。

### E23 Text-layer PDF producer proof

- `server/paper-import/nck1PdfTextSourceAdapter.mjs`：`extractNck1PdfTextStructure`,
  `parsePages`, `embeddedRasterImagePages`, `mergeInlineBlockFragments`, `borderedTableBox`, `tableRuns`,
  `assertReadableLayout`；从 Poppler bbox 建 ordered paragraph/table 与`page_region`，简单表
  还需 raster border grid 证据；内嵌raster在尚不能保真提取时明确拒绝；无文字层、缺页、
  多栏、重叠或未闭合并排文字均带document/page/region stable failure。
- `server/paper-import/nck1PdfMaterializationProducer.mjs`：
  `produceNck1PdfMaterialization`, `nck1PdfProducerSourceDigest`；只接受 exact question PDF +
  official-answer PDF，并调用 E03 的 carrier-neutral parser。
- `test-fixtures/paper-import/nck1-pdf-materialization-v1/fixture.mjs`：运行时生成匿名多页题卷、
  单页答案、2x2表、“答案详解”陷阱和六类相邻负例（含2x2 synthetic PNG），不提交真实试卷。
- `scripts/verify-nck1-pdf-materialization-producer.mjs`：direct producer + public
  `universal-nck1 init/materialize/verify/build`；断言9 groups、45 answers、全部page-region、
  semantic table、详解排除、source order replay、stable failures和无可用partial interpretation。

## Conclusions from the matrix

- **最成熟**：限定形状的 DOCX（C02）和已闭合媒体的三面同像素路径（V01）；单栏文本层
  PDF producer已通过synthetic/public seam，但在真实非生产Owner QA前仍是`partial`。
  PDF已为每个item闭合page-region并复用同一Canonical surface contract。
- **最缺失**：扫描 PDF 已能被安全识别并拒绝，但 OCR 物化仍未实现（C03）；有序图片页
  （C07）仍没有 intake/OCR adapter，无答案来源（C10）也没有 durable source-only 暂存。
  视觉侧 R02 已闭合 exact source-region Review seam，另一个公共缺口是 M04：没有共享媒体
  布局意图。
- **首批发布目标**：先闭合题卷图片 + 答案图片的清晰单栏 shape（C07），复杂多栏、图形
  与表格继续 fail closed；发布速度不能以跳过 OCR 人工确认或 Canonical 三面回归为代价。
- **不要误报**：只有 exact、可靠文字层、单栏、标准 NCK1 的独立 PDF pair 已完成
  producer与synthetic proof，仍待真实Owner QA；混合载体、scan OCR、combined file与任意分栏仍不支持。legacy DOCX shape crop不等于
  Universal media producer；按 accepted policy，详解文件只贡献权威答案值，不进入
  Canonical/Teacher；Canonical能手工表达不等于检测能力supported。
