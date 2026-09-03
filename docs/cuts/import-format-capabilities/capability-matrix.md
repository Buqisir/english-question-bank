# 导题格式能力矩阵

Baseline: `main@6989e2080a17cd77ca0325f414d14515fa7db14c`（2026-08-30 live
`ls-remote` 复核）；E25–E29另记录其后本地Ticket 09/11/10/04实现证据与真实只读图片卷
pre-review。状态定义见
`spec.md#capability-state-model`。

这不是“文件扩展名支持表”。每行只对该行写明的真实 shape 作结论。`manual` 表示 schema
可由人填写，不代表 producer 支持；`legacy` 表示旧 PaperAsset 路径存在 proof，不代表
Universal Source Materialization 已接通。

为保持可读性，一条逻辑行被拆成 A/B 两张表，并以稳定 ID 连接。A 表是层间表达，B 表是
交付与证据；同一 ID 的 A+B 合起来包含规定的全部字段。

## A. Capability path

| ID | 能力名称与真实输入形状 | 检测方式 | Source Capture 表达 | Materialization 表达 | Canonical / renderer 表达 | Screen 支持 | Print/PDF 支持 | Review QA 证据 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C01 | **文本层 PDF**：单栏、可靠文字层、标准 NCK1 顺序且无未处理视觉内容的独立题卷 PDF + 答案 PDF | Universal router按exact all-PDF source set选择 adapter；`pdftotext -bbox-layout`闭合 page/word bbox、顺序和简单表；`pdfimages -list`发现内嵌raster即拒绝；空页、重叠和多栏也拒绝 | immutable PDF bytes、digest、page count；每个 ordered item保存`page_region` | 自动生成9 groups、45 answers、paragraph/question/table与region；PDF review/receipt绑定producer+source digest | 与DOCX共用`produceNck1MaterializationFromStructures`，进入同一 Canonical blocks/Candidate | 同一 Candidate 可渲染 | 同一 shared print seam；Student/Teacher答案可见性不变 | 每段/题/答案有page+rect；语义表进入`sourceCoverage.visuals`并复用R02局部配对 |
| C02 | **DOCX 简单 NCK1 pair**：题卷 DOCX + 答案 DOCX + 确定性 PDF rendition；正文为顶层段落/简单表 | 读 OOXML `word/document.xml`，按顶层 `w:p`/`w:tbl` 顺序及已登记 NCK1 heading（含`语言运用`/`语言知识运用`）、题号、选项、blank 模式检测 | 原 DOCX、答案 DOCX、rendition bytes/digest；段落 source index 与顺序 | 9 slots、45 answers、paragraph/table、`docx_part` locator、page coverage | 直接映射 Canonical family/rich blocks；不靠 PaperAsset 重建题意 | 支持简单文本/表 | 支持；与 Screen 同一 Candidate | revision 中有 DOCX/rendition/Materialization；局部源 locator 尚未并排 |
| C03 | **扫描 PDF / OCR**：无可靠文字层的扫描题卷/答案 | PDF text adapter先识别scan；OCR seam重放每页144-DPI像素摘要，校验engine/version、bbox、confidence、alternatives与reading-order graph；repo不绑定某个生产OCR engine | immutable PDF bytes/digest/page count；sidecar保存逐页raster recipe/像素digest和normalized regions，不保存整页图副本 | versioned evidence + digest-bound Agent closure；闭合后的ordered paragraphs携带`page_region`并进入共用parser；confidence只作诊断且不进入Materialization | 全页覆盖、文字/顺序/visual classification由Agent对照原页闭合后生成同一Canonical；未识别块仍拒绝 | 闭合后支持同一Candidate | 闭合后复用同一shared Print/PDF；未闭合不渲染 | Owner只验完整Candidate与content visuals；独立识图前审覆盖原页、转写、绑定和三面。历史`/ops/` OCR revision保留作异常回退/兼容 |
| C04 | **混合载体**：题卷 PDF + 答案 DOCX，或 DOCX/PDF/OCR 页混合 | `init`接受多source/role并为DOCX生成rendition；router只选择exact all-PDF或现有DOCX shape，mixed稳定拒绝 | manifest可同时列PDF/DOCX/rendition | schema可列多documents；没有通用分段来源合并规则 | 手工闭合可编译；producer不猜载体边界 | 手工Candidate可渲染 | 手工Candidate可渲染 | revision保存全部source files，但不能按block跳来源 |
| C05 | **听力文本与 timing**：1–20 题、答案、10 段听力文本，可有时序 | DOCX producer 按听力 section/题号/答案/10 段范围检测；timing 出现即要求 review | immutable question/answer source observations | `listening.state=captured`，20 questions/answers、10 transcript segments、timing array | 转成两个 `inactive_source` closure；明确 suppress，不产生 active Group | 不显示听力题/文本（设计如此） | 不显示（设计如此） | Materialization/源文件可读；无专用 transcript-source 对照 UI |
| C06 | **听力音频**：MP3/WAV 等原始附件与题卷共同到达 | Universal manifest/schema 不接受 audio document/media；generic inactive inventory 能接受 opaque captured audio | generic closure 可存 immutable audio digest/artifact ref | NCK1 Materialization 无 audio 字段 | generic `captured_uninterpreted` 可关闭为 inactive evidence；禁止 playback/active ref | 无播放（非本阶段目标） | 不输出 | `/ops/` revision manifest 当前不登记音频 role/播放器 |
| C07 | **有序图片页**：题卷与答案各由显式有序的 PNG/JPEG/WebP 整页图片组成，首版限定清晰单栏标准NCK1 | `--source-page role:page=/abs/path`显式登记页号；magic bytes+ImageMagick核media type/dimensions；descriptor与raw artifacts逐页核digest、order、coverage | 一个image-bundle descriptor document + immutable raw page artifacts；每页保留path/mediaType/digest/bytes/pixel dimensions，不猜DPI；PDF rendition只供浏览 | 图片页复用C03同一OCR evidence/Agent closure和carrier-neutral parser；闭合后的文字有`page_region`，整页原图不进入正文/media | Agent对照原页闭合全部文字、源顺序与visual classification后生成同一Canonical；confidence不作门禁，正文图形仍fail closed | 闭合后由同一Candidate渲染，整页source图不冒充正文 | 同一Candidate进入Student/Teacher Print与PDF | 独立识图前审检查原页、转写、源绑定、Candidate和三面；Owner在Candidate做一次成卷验收。内容视觉/重建表仍需视觉QA |
| C08 | **详解答案源**：每题答案后有解析，可能另含写作范文/听力原文 | carrier-neutral parser允许答案文件以“答案与解析”heading开头；完整key之后的详解区停止读取，并能从行内解析marker前安全截取56–65文本值；明确写作heading内提取官方范文，边界歧义拒绝。DOCX/text-PDF及Agent闭合后的OCR/image observations共用该parser | 原答案文件 bytes/digest保留；不为逐题详解或评分说明创建下游内容节点；官方范文保留locator | `answers[]`只有value+authority；写作可有`officialModelAnswer`；听力原文仍走独立listening contract | 答案是唯一权威；源详解不进入Canonical或教学分析；官方范文Teacher-only | Teacher显示另行审核的analysis及官方范文 | Teacher Print/PDF同左；Student隐藏答案、分析与官方范文 | DOCX/PDF detailed fixtures和image shared-parser proof断言详解/评分token不进入Materialization/Candidate；Teacher三面显示范文且Student隐藏 |
| C09 | **纯答案键**：只有全部权威作答值，无逐题详解；可无写作范文 | shared `parseOfficialAnswers`接受压缩A–G ranges、逐题`21. A`及56–65文本答案；缺值、冲突或文本边界不明拒绝 | 原answer bytes/digest与每组答案carrier locator | 与C08生成完全相同的45项`answers[]`；`officialModelAnswer=null`；有听力时transcript仍是独立必需source | 正确答案成为authority；教学分析另行生成、按权威答案校验并人工审核 | 支持答案；分析完成后才满足Owner QA | Teacher支持，Student隐藏；分析同左 | dedicated DOCX/PDF key-only fixtures与detailed结果逐项比较45项值；公共Candidate preview通过 |
| C10 | **尚无权威答案**：先找到完整DOCX/PDF/显式图片题卷，答案文件暂缺 | `capture-source-only`只接受question role，复用carrier probe并核document/page digest；每次status/list重开复核capture identity；`attach-answers`要求exact `questionSetDigest` | gitignored `imports/source-only/<sourceSetId>/capture.json`保存原bytes、role、page order、digest、provenance、capture time与环境digest；独立`successor.json`不覆写旧capture | 状态固定`awaiting_authoritative_answers`；Materialization/verify/build显式拒绝。补答案只创建新的正常complete source set，旧题digest保持一致 | 补答案前无Canonical；禁止AI解题。complete successor仍走既有Materialization/Canonical authority，不从暂存记录重建题意 | 有意不支持；没有真实Candidate | 有意不支持；没有真实Candidate | source-only不上传revision；CLI可查看原文件与状态。Review push/accept/publish在任何API/DB动作前稳定拒绝；补答案后只审核新的complete successor |
| C11 | **题卷与答案同文件**：一份DOCX/PDF先含完整题卷，后含详解或答案键 | Universal ingress接受`question_and_answers`；shared splitter只接受完整写作题之后恰好一个明确答案heading。无heading、双heading或位置不合法稳定拒绝 | 原合并文件bytes/digest与原carrier locator保留 | splitter先形成question/answer ordered structures，再进入C08/C09同一parser；不建combined Canonical模型 | questions与45项answers投影普通Canonical；详解/范文不进入，answer region不成为Student blocks | 同一Candidate渲染；无source-file旁路 | 同一shared Print/PDF；Student不见answer region | dedicated DOCX/PDF combined正/负fixtures；真实Universal CLI以单个`question_and_answers` PDF完成materialize/verify/build与Candidate preview |
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
| M01 | **照片、插图、图表、流程图**：正文中的不可结构化视觉 | DOCX producer接受恰好一个image-only `wp:inline` PNG/JPEG/WebP paragraph或cell并读取relationship/extent；anchor、混合文字、多图拒绝。文本PDF发现embedded raster仍拒绝，不能自动提取/关联；vector diagram无通用detector | DOCX包内原bytes/digest、entry recipe、像素尺寸和presentation；PDF crop仍只能由已有manual/adapter seam声明 | v2 `media` + figure/table-cell `media_ref`；source与candidate artifacts独立，原图publication默认`source_crop` | Canonical `figure`/cell media；shared presentation只投影一次，不从图猜题意 | 受限DOCX媒体支持；PDF producer仍无 | 同一selected bytes和presentation进入Student/Teacher Print/PDF | `/ops/`按mediaId显示source/candidate与source visual；可从真实Screen media回局部证据，PDF自动关联仍缺 |
| M02 | **图标、条码**：表格内图标、二维码/条形码、页眉编码 | DOCX image-only table cell可确定性关联并保留为inline media，但仍没有通用icon/barcode或content-vs-furniture classifier | 原bytes/digest/entry和cell邻接可保存 | cell `media_ref`已由producer生成；当前自动kind仍为`figure`，人工schema可标`icon|barcode` | table cell media保持inline；barcode policy未自动化 | cell media按相对正文宽布局，不相对cell误放大 | 同一投影 | `/ops/`可绑定media/content node并回源局部；用途分类确认控件仍缺 |
| M03 | **原图裁剪与 provenance**：页码、源矩形、pixel、DPI、digest | manual `crop-pdf` 与 Review endpoint 共用 `rasterPdfRegion`；DOCX producer直接读ZIP relationship entry；legacy shape crop 144 DPI + 2pt padding | source/candidate各为immutable artifact；DOCX保存entry、digest、bytes、像素尺寸，PDF保存page/normalized region/density | adapter exact replay DOCX entry或PDF crop，核digest/type/dimensions；candidate独立核验，不能覆盖source proof | selected publication rendition引用一个闭合artifact；原图仍保留为Review证据 | 使用selected exact bytes | 同一selected exact bytes | source card显示page/rect/target/digest；媒体endpoint返回source/candidate exact bytes；任一digest漂移拒绝 |
| M04 | **媒体版式关系**：block/inline、对齐、跨栏、相对正文宽度、边距 | DOCX读取paragraph alignment、image extent、section正文宽和before/after spacing；只接受left/center/right、0–100%正文宽和有限spacing token；anchor/跨栏/异常spacing拒绝 | v2 source observation保存每个media的`presentation` | figure vs table-cell决定placement；共享`alignment`、`widthRatio`、`spacingBefore/After`，不存任意CSS | `decorateProjectedMediaPresentation`一次投影；Screen/Print仅翻译同一intent | block 40% left、60% center、cell 10%已实测；相对reading container宽 | 同样以reading container宽为基准进入两种Print/PDF | `/ops/`显示布局意图，receipt绑定presentation digest；PDF source layout尚不自动检测 |
| M05 | **标题及前后正文关系**：图片题注、图前/图后段落 | ordered block stream保留邻接；DOCX media paragraph进入原顺序，但producer仍不自动判定邻段是否题注 | block/source locator保邻接；presentation-bound v2 figure可声明学生可见caption，legacy caption仍视为provenance | figure caption为Canonical content；QA文件名/页码不借文字启发式升级 | consumer projection只让v2 presentation-bound caption进入学生内容，并保留content node identity | 学生可见caption渲染；legacy provenance隐藏 | 两种Print/PDF同Screen | 专项三面proof防caption丢失/metadata泄漏；自动caption检测仍缺 |
| M06 | **低清媒体分级处理**：照片/插图/图表/流程图/关键题图清晰、轻度模糊或确实无法辨认 | 不自动判清晰度或语义一致；publication显式选择原图→固定ImageMagick增强→有更早Owner receipt的AI候选 | 原图永久保留；candidate独立bytes/digest/type/dimensions；确定性候选另闭合tool/version/preset，AI候选闭合生成工具/版本/提示词摘要 | adapter核候选并重放固定`document-light-cleanup-v1`；`source_crop`时latent AI只进Review evidence；选AI需exact source/candidate/presentation receipt | Canonical只引用一个selected rendition，不接收未确认AI候选；原图仍是证据 | selected rendition进入Screen | 同一selected rendition进入两种Print/PDF | `/ops/`原图/候选并排+overlay+11项Owner checklist；单图确认与整卷认可分离；代码不假装自动判断内容一致/授权 |
| V01 | **发布媒体三面同一像素**：Canonical content media 已闭合 | adapter re-extracts source并核selected source/candidate bytes、dimensions、digest；确定性候选还exact replay | immutable source和candidate artifacts分别保存 | publication在source、deterministic、human-confirmed AI中只选一个；supplied bytes必须一一匹配 | consumption `mediaArtifacts` 将同一selected encoded bytes与presentation投影 | 同一selected encoded bytes | 同一selected encoded bytes | revision finalize重编译Candidate；真实Screen/Print/Chromium PDF检查image bytes/尺寸/布局；各表面不能自行增强 |
| V02 | **版式关系三面同源**：表/图比例、位置、留白、正文关系 | DOCX media已检测最小presentation；另有framed_columns和部分semantic table geometry；PDF媒体/表style仍缺 | DOCX媒体关系已结构化，其余局部事实仍不全 | 可表达media alignment/正文width ratio/有限spacing、block order、table spans、2-column frame | 一份shared adapter投影；缺失关系无法传递 | 对已表达部分支持 | 对已表达部分支持 | media presentation在真实三面测量；普通表格视觉与PDF source local comparison仍缺 |
| V03 | **整页视觉证据不冒充正文**：full-page screenshot/rendition仅 QA | media `usage` 与 sourceCoverage disposition闭合 | 可作为 source document/`visual_proof` artifact | `visual_proof` 不允许被 content ref；content media必须恰好用一次 | Reading拒绝 flattened `[图:]` bridge，媒体必须闭合 | 不渲染 visual proof为正文 | 不渲染 visual proof为正文 | 当前只可手工打开；原则有 validator proof |
| R01 | **不可变真实表面审核**：同一 revision 的 Screen、两种 Print、PDF | finalize重推 Candidate/Consumption并绑定 producer/renderer/digests | revision保存 source/materialization/media files及摘要 | Review projection从 revision bytes重新 import/compile | Screen consumption + print consumption仅替换 consumer contract | 真实 `PaperBrowsePage` iframe | `buildPrintHtml`；PDF由同 HTML + Chromium | 支持 issue/reply/fix/approval 状态机；renderer drift会使认可失效 |
| R02 | **原卷局部 + 真实 Screen 并排与 locator跳转** | Screen click读取exact group/question/block/media identity，以target优先级精确匹配source visual；不做最近区域猜测 | revision内immutable PDF或raw image page bytes、digest、page、optional region；rendition不替代图片权威 | `sourceCoverage.visuals`投影为`paired`或`unlocated`，不建第二套locator | Screen DOM的exact block/media ID与source target join；Canonical仍是语义权威 | 中间保留真实Screen，右栏显示原卷crop并可双向聚焦 | 切换Print/PDF时保留source card；点击定位回真实Screen | authenticated crop endpoint按media type从PDF或raw image重放；card显示metadata与whole-source link，无region明确显示未配对 |
| R03 | **局部 overlay / 差异提示**：同定位源局部与渲染局部，或媒体原图与候选 | 普通源局部↔renderer仍无配准/diff；AI媒体按exact media identity找到source/candidate | source/candidate exact bytes及digest，不保存renderer crop | media derivation投影包含两份immutable evidence与presentation | 不建自动相似度权威；比较只服务Owner确认任务 | `/ops/`提供媒体并排、overlay透明度与原/候选切换 | 普通排版仍无自动diff | AI候选比较和11项人工确认已支持；通用排版overlay/diff仍缺且非阻塞 |
| R04 | **问题绑定到题组/题/表格/媒体/源区域** | Screen click读取exact group/question/block/media/content-node DOM identity；source card从同一target带入page/rect，不猜nearest | issue保存groupId/questionId/blockId/mediaId/contentNodeId/page/normalized rect/surface | Review projection提供visual target与media identity；现有issue表扩字段，不建第二套模型 | table/figure有blockId，img有mediaId，inline media/caption保contentNodeId | 所列语义identity可绑定并从source issue回放 | page/rect随source issue保存；Print/PDF问题仍可用block/page | 真实`/ops/`浏览器实点inline icon，验证media/content node和source region提交/回放；cell尚无独立ID |
| R05 | **未知形状统一 fail closed**：未登记 container/table/media/layout/OCR | DOCX/PDF保留既有检测；image bundle另核页序、重复、类型、bytes与coverage；OCR核像素漂移、顺序图、visual classification和closure digest；confidence/竞争候选只作诊断 | source bytes保留；PDF/OCR/image失败都保留document/page/region evidence | 稳定`MATERIALIZATION_*`、`NCK1_DOCX_*`、`NCK1_PDF_*`、`NCK1_IMAGE_*`与`NCK1_OCR_*` codes；不建跨adapter巨型classifier | compiler不派生可用interpretation；只有Agent对照闭合后的OCR items可进入共用parser | 未进入ready则不渲染 | 未进入ready则不渲染 | 未识别块、顺序歧义与正文图形分类不明仍阻断；普通清晰文字不因confidence被送给Owner逐页确认；Candidate前另做独立视觉审查 |

## B. Status, evidence and next work

| ID | 当前状态 | 已知失败码（代表性） | 现有代码与测试证据 | 所需最小 fixture | 下一步 ticket | 优先级及理由 |
| --- | --- | --- | --- | --- | --- | --- |
| C01 | `partial`（producer已实现；真实Owner QA待办） | `NCK1_PDF_TEXT_LAYER_MISSING`, `NCK1_PDF_TEXT_COVERAGE_INCOMPLETE`, `NCK1_PDF_VISUAL_REVIEW_REQUIRED`, `NCK1_PDF_READING_ORDER_AMBIGUOUS`, `NCK1_PDF_MULTI_COLUMN_UNSUPPORTED`, `NCK1_PDF_SOURCE_SET_AMBIGUOUS` | [E03](#e03-docx-producer), [E04](#e04-universal-source-cli), [E13](#e13-shared-surface-proof), [E23](#e23-text-layer-pdf-producer-proof) | 已有多页题卷+单页答案synthetic PDF pair；image-only/空页/embedded raster/双栏/重叠/无边框并排负例；仍需真实非生产QA | [06](tickets/06-scanned-pdf-ocr-evidence.md) 复用ordered-item contract | **P0 maintenance**：OCR与图片主线共同底座；不得放宽成任意PDF |
| C02 | `supported`（限定简单文本 shape） | `NCK1_DOCX_SOURCE_SET_AMBIGUOUS`, `NCK1_DOCX_SECTION_AMBIGUOUS`, `NCK1_DOCX_QUESTION_SEQUENCE_INCOMPLETE`, `NCK1_DOCX_ANSWER_MISSING` | [E02](#e02-docx-structure), [E03](#e03-docx-producer), [E11](#e11-docx-producer-proof) | 现有 tiny synthetic DOCX pair；继续保持无真实卷文本 | 保持 E11 回归；表/媒体走 02/04 | **P1 maintenance**：当前最成熟的 carrier，不需重写 |
| C03 | `partial`（evidence/Agent closure/producer已实现；真实图片bundle已完成pre-review；生产engine、扫描PDF真实QA待办） | `NCK1_OCR_TEXT_LAYER_REQUIRED`, `NCK1_OCR_READING_ORDER_AMBIGUOUS`, `NCK1_OCR_PAGE_COVERAGE_INCOMPLETE`, `NCK1_OCR_VISUAL_CLASSIFICATION_REQUIRED`, `NCK1_OCR_CONFIRMATION_STALE`；`NCK1_OCR_CONFIDENCE_REVIEW_REQUIRED`仅历史兼容 | [E23](#e23-text-layer-pdf-producer-proof), [E24](#e24-scanned-pdf-ocr-evidence-proof), [E25](#e25-ordered-image-source-bundle-proof), [E26](#e26-ocr-web-review-and-confirmation-proof)；词汇OCR不属于本seam | 4页synthetic扫描题卷+1页答案；另有8页题卷+9页答案真实图片pair完成Agent closure、source locator与三面pre-review；回归证明低confidence/备选仅诊断，并覆盖closure修订后的安全重产、改字、调序、visual fail-closed与exact closure | 维持E24/E26；扫描PDF仍需另行真实QA；图片Candidate待Owner验收 | **P0 maintenance**：Agent闭合路径已实现；上线前仍需选定生产OCR engine，且Owner验收不能由pre-review替代 |
| C04 | `partial`（manifest可表达、producer拒绝） | `NCK1_DOCX_SOURCE_SET_AMBIGUOUS`, `NCK1_PDF_SOURCE_SET_AMBIGUOUS`, `source_incomplete` | [E03](#e03-docx-producer), [E04](#e04-universal-source-cli), [E23](#e23-text-layer-pdf-producer-proof) | 题卷1页text PDF + 答案1页DOCX；反向组合各一例 | [07](tickets/07-mixed-carrier-routing.md) | **P2**：manifest已能收，需等OCR adapter稳定后再合并路由 |
| C05 | `partial`（inactive closure supported） | `NCK1_DOCX_LISTENING_RANGES_AMBIGUOUS`, `NCK1_DOCX_LISTENING_TRANSCRIPT_AMBIGUOUS`, `MATERIALIZATION_LISTENING_TRANSCRIPT_COVERAGE_INVALID` | [E03](#e03-docx-producer), [E18](#e18-inactive-listening), [E10](#e10-materialization-contract-proof) | 20个短问题+10个短 transcript segment，无版权文本；timing有/无 | 保持 inactive regression；audio走 08 | **P2**：语义闭合安全，但无专用 Review UX且不激活播放 |
| C06 | `partial`（generic closure only） | `LISTENING_AUDIO_EVIDENCE_INCOMPLETE`, `LISTENING_ACTIVE_OR_AUDIO_REFERENCE_UNSUPPORTED`; Universal 无 audio-specific code | [E18](#e18-inactive-listening) | 1秒synthetic tone + closed digest + no-playback negative | [08](tickets/08-listening-audio-evidence.md) | **P2**：保全来源重要，但不阻塞非听力正文 |
| C07 | `partial`（显式图片bundle→Agent closure→Canonical三面与真实pre-review已实现；Owner验收、生产engine待办） | `NCK1_IMAGE_BUNDLE_ORDER_INVALID`, `NCK1_IMAGE_PAGE_DUPLICATE`, `NCK1_IMAGE_PAGE_DIGEST_MISMATCH`, `NCK1_IMAGE_MEDIA_TYPE_UNSUPPORTED`, `NCK1_IMAGE_PAGE_COVERAGE_INCOMPLETE`，及适用的`NCK1_OCR_*` | [E25](#e25-ordered-image-source-bundle-proof), [E26](#e26-ocr-web-review-and-confirmation-proof), [E27](#e27-source-only-awaiting-answers-proof), [E13](#e13-shared-surface-proof) | 已有4页题卷+1页答案synthetic pair及source-only lifecycle；另有8页题卷+9页答案真实只读pair完成页序/重复/质量、Agent closure、独立视觉前审、10个source crops、Screen与8页Student/11页Teacher PDF检查；本卷无正文媒体/图表/表格 | Owner在R7 Candidate做一次成卷验收；复杂媒体走04；无答案已由11安全暂存 | **P0，首批业务能力**：真实pre-review已闭合但Owner尚未验收；不得把本地QA误报成生产可发布 |
| C08 | `supported`（Agent闭合后的carrier-neutral answer observations） | `NCK1_ANSWER_VALUE_BOUNDARY_AMBIGUOUS`, `NCK1_ANSWER_DETAIL_LEAK_DETECTED`, `NCK1_ANSWER_WRITING_SAMPLE_BOUNDARY_AMBIGUOUS`, carrier answer conflict/table codes | [E21](#e21-answer-source-shapes), [E23](#e23-text-layer-pdf-producer-proof), [E25](#e25-ordered-image-source-bundle-proof), [E28](#e28-answer-shape-closure-proof) | DOCX/PDF detailed与key-only成对fixture；详解/评分token、官方写作范文及边界歧义负例 | 维持[10](tickets/10-answer-source-shape-closure.md)回归；真实图片仍走C07 QA | **P1 maintenance**：源详解不污染教师版，官方范文Teacher-only；未知边界不猜 |
| C09 | `supported`（45项完整key shape） | carrier `ANSWER_RANGE_AMBIGUOUS`/`ANSWER_MISSING`/`ANSWER_CONFLICT`, `NCK1_ANSWER_VALUE_BOUNDARY_AMBIGUOUS`, `MATERIALIZATION_ANSWERS_INCOMPLETE` | [E01](#e01-materialization-schema), [E11](#e11-docx-producer-proof), [E21](#e21-answer-source-shapes), [E28](#e28-answer-shape-closure-proof) | DOCX/PDF全45项key-only，与detailed逐项同值；漏1项、冲突及语法答案边界不明负例 | 维持[10](tickets/10-answer-source-shape-closure.md)回归 | **P1 maintenance**：权威答案足够；教学分析继续独立生成/审核 |
| C10 | `supported`（source-only生命周期；下游表面按设计禁止） | `NCK1_AUTHORITATIVE_ANSWERS_AWAITED`, `NCK1_SOURCE_ONLY_MATERIALIZATION_FORBIDDEN`, `NCK1_SOURCE_ONLY_PUBLICATION_FORBIDDEN`, `NCK1_ANSWER_ATTACHMENT_QUESTION_MISMATCH`, `NCK1_ANSWER_ATTACHMENT_DUPLICATE` | [E04](#e04-universal-source-cli), [E27](#e27-source-only-awaiting-answers-proof), [E25](#e25-ordered-image-source-bundle-proof) | 已有1页synthetic question-only DOCX/PDF、2张有序question images、后补compact-key PDF/answer image；wrong digest/question drift/duplicate/materialize/review/publish负例 | 维持E27；答案内容边界继续[10](tickets/10-answer-source-shape-closure.md) | **P1 maintenance**：辛苦搜到的卷可保留，但无答案记录永远不进入发布链 |
| C11 | `supported`（DOCX/text-PDF） | `NCK1_COMBINED_SOURCE_BOUNDARY_AMBIGUOUS`, carrier source-set/section/answer codes | [E01](#e01-materialization-schema), [E03](#e03-docx-producer), [E04](#e04-universal-source-cli), [E21](#e21-answer-source-shapes), [E28](#e28-answer-shape-closure-proof) | DOCX/PDF完整题卷→唯一答案heading→完整key/详解；无heading、双heading、模糊答案负例 | 维持[10](tickets/10-answer-source-shape-closure.md)回归；combined OCR/image需独立fixture后再声明 | **P2 maintenance**：包装已闭合，但只有明确边界才成功 |
| T01 | `partial`（DOCX supported；PDF/OCR/image待真实QA） | `NCK1_DOCX_CONTAINER_UNSUPPORTED`, `NCK1_PDF_READING_ORDER_AMBIGUOUS`, `NCK1_PDF_MULTI_COLUMN_UNSUPPORTED`, `NCK1_OCR_READING_ORDER_AMBIGUOUS` | [E02](#e02-docx-structure), [E05](#e05-materialization-adapter), [E11](#e11-docx-producer-proof), [E23](#e23-text-layer-pdf-producer-proof), [E24](#e24-scanned-pdf-ocr-evidence-proof), [E25](#e25-ordered-image-source-bundle-proof), [E26](#e26-ocr-web-review-and-confirmation-proof) | DOCX 3段夹表；text-PDF/OCR/image多页ordered questions；重叠/双栏/ambiguous graph负例 | 继续E11/E23–E26 | **P0 maintenance**：源顺序是所有邻接/布局的底座 |
| T02 | `partial`（DOCX supported；PDF待真实QA） | `NCK1_DOCX_QUESTION_NUMBER_AMBIGUOUS`, `NCK1_PDF_OPTIONS_AMBIGUOUS`, `NCK1_PDF_BLANK_SEQUENCE_INCOMPLETE`, carrier answer conflict/missing codes | [E03](#e03-docx-producer), [E11](#e11-docx-producer-proof), [E13](#e13-shared-surface-proof), [E23](#e23-text-layer-pdf-producer-proof) | 两载体均为45题synthetic；每个负例只破坏一个marker/shape | 维持共用parser回归 | **P0 maintenance**：内容语义主路径，不要被视觉work回归 |
| T03 | `partial` | `NCK1_DOCX_CONTAINER_UNSUPPORTED`, `NCK1_DOCX_VISUAL_REVIEW_REQUIRED`；无 furniture detector code | [E02](#e02-docx-structure), [E03](#e03-docx-producer), [E14](#e14-legacy-docx-media) | body说明+header页码+footer校名各一个短token | [01](tickets/01-source-region-review-pairing.md) 后另开 detector ticket | **P2**：先保留并可审，再决定哪些家具无需 Canonical |
| T04 | `partial`（PDF多栏已fail-closed） | `NCK1_PDF_MULTI_COLUMN_UNSUPPORTED`, `MATERIALIZATION_FRAMED_COLUMNS_INVALID`, `READING_FRAMED_COLUMNS_CHILD_UNSUPPORTED`, `CANONICAL_FRAMED_COLUMNS_EXCEEDS_PAGE` | [E19](#e19-framed-columns-proof), [E23](#e23-text-layer-pdf-producer-proof) | 已有PDF双栏拒绝与Canonical 2栏synthetic；另需真实频率证据再决定producer shape | 保持拒绝；有频率证据后另开窄票 | **P1**：下游成熟但producer不猜栏序；禁止通用任意栏引擎 |
| T05 | `supported`（语义答题区） | `NCK1_DOCX_WRITING_BOUNDARY_AMBIGUOUS`, `NCK1_DOCX_WRITING_SKELETON_AMBIGUOUS`, `MATERIALIZATION_WRITING_GIVENS_PLACEMENT_INVALID` | [E03](#e03-docx-producer), [E13](#e13-shared-surface-proof) | 2个short writing task，givens/starters/word count各一 | 维持共享 writing regression | **P1 maintenance**：已遵守“关系忠实而非像素框复刻” |
| T06 | `partial`（text-PDF/OCR/image ordered items implemented） | `NCK1_PDF_TEXT_COVERAGE_INCOMPLETE`, `NCK1_IMAGE_PAGE_COVERAGE_INCOMPLETE`, `NCK1_OCR_PAGE_COVERAGE_INCOMPLETE`, `NCK1_DOCX_TABLE_PAGE_REVIEW_REQUIRED`, `CANONICAL_FRAMED_COLUMNS_EXCEEDS_PAGE` | [E01](#e01-materialization-schema), [E09](#e09-print-renderer), [E23](#e23-text-layer-pdf-producer-proof), [E24](#e24-scanned-pdf-ocr-evidence-proof), [E25](#e25-ordered-image-source-bundle-proof) | 已有多页text-PDF/OCR/image顺序与漏页拒绝；仍需跨页单段/表负例 | 跨页单体另开窄票 | **P1**：连续items已闭合，复合locator仍缺 |
| B01 | `partial`（DOCX supported；PDF待真实QA） | `MATERIALIZATION_TABLE_INVALID`, `MATERIALIZATION_TABLE_OVERLAP`, `MATERIALIZATION_TABLE_NOT_RECTANGULAR`, `NCK1_PDF_READING_ORDER_AMBIGUOUS`, `READING_TABLE_INCOMPLETE` | [E01](#e01-materialization-schema), [E02](#e02-docx-structure), [E10](#e10-materialization-contract-proof), [E12](#e12-mixed-table-media-proof), [E23](#e23-text-layer-pdf-producer-proof) | DOCX 2x2+横向merge；PDF 2x2有边框正例、无边框并排负例 | [02](tickets/02-docx-semantic-table-closure.md) 扩DOCX边界；PDF复杂表保持拒绝 | **P0 maintenance**：高频且语义化优先 |
| B02 | `partial` | `NCK1_DOCX_TABLE_REVIEW_REQUIRED`, `MATERIALIZATION_TABLE_ROWSPAN_OVERFLOW` | [E02](#e02-docx-structure), [E03](#e03-docx-producer), [E12](#e12-mixed-table-media-proof) | 3x3表：一个gridSpan、一个vMerge；overlap负例 | [02](tickets/02-docx-semantic-table-closure.md) | **P1**：模型/renderer已支持，producer是最小断点 |
| B03 | `fail-closed` | `NCK1_DOCX_TABLE_REVIEW_REQUIRED`; Canonical无nested shape | [E02](#e02-docx-structure), [E03](#e03-docx-producer) | 1个outer cell含1x1 nested table | [02](tickets/02-docx-semantic-table-closure.md) 固化独立code，不实现嵌套 | **P3**：低频且容易变布局引擎，保持拒绝比猜测正确 |
| B04 | `fail-closed` | `NCK1_DOCX_TABLE_REVIEW_REQUIRED`, `MATERIALIZATION_TABLE_CELL_EMPTY` | [E01](#e01-materialization-schema), [E03](#e03-docx-producer) | 2x2表仅一个确认空cell；另一个“提取失败”负例 | [02](tickets/02-docx-semantic-table-closure.md) | **P1**：真实空格高频，当前占位文字不能诚实发布 |
| B05 | `missing` | 无稳定 presentation code | [E02](#e02-docx-structure), [E08](#e08-screen-renderer), [E09](#e09-print-renderer) | 3列表：1:2:1相对宽、header居中、body左对齐、外框+内线 | [05](tickets/05-table-presentation-intent.md) | **P1**：影响可读性，且可用少量离散意图解决；不做完整Word样式 |
| B06 | `partial`（复杂图可表达；structurable-table classifier仍缺） | `MATERIALIZATION_MEDIA_ITEM_INVALID`, `MATERIALIZATION_MEDIA_EXTRACTION_INVALID`, `READING_FIGURE_INCOMPLETE`; 无 classifier code | [E01](#e01-materialization-schema), [E05](#e05-materialization-adapter), [E06](#e06-reading-contract), [E29](#e29-source-bound-media-layout-and-review-proof) | 一个非矩形流程关系图 + 一个可矩形化对照表（后者必须拒绝media fallback） | 04的PDF/classifier follow-up | **P1 remaining**：普通表不能被截图化；这是Ticket 04未PASS的真实缺口 |
| M01 | `partial`（受限DOCX producer已支持；PDF producer仍fail-closed） | `NCK1_DOCX_MEDIA_ASSOCIATION_AMBIGUOUS`, `NCK1_DOCX_MEDIA_LAYOUT_UNSUPPORTED`, `NCK1_PDF_VISUAL_REVIEW_REQUIRED`, `MATERIALIZATION_MEDIA_RENDITION_*` | [E03](#e03-docx-producer), [E05](#e05-materialization-adapter), [E14](#e14-legacy-docx-media), [E23](#e23-text-layer-pdf-producer-proof), [E29](#e29-source-bound-media-layout-and-review-proof) | 已有DOCX block 40%/60%、cell 10%与anchor负例；另需PDF自动crop/邻接正负例 | 04的PDF producer follow-up | **P1 remaining**：DOCX像素与placement已闭合；PDF仍不能自动取图 |
| M02 | `partial`（DOCX cell media supported；用途分类未实现） | `NCK1_DOCX_MEDIA_ASSOCIATION_AMBIGUOUS`, `MATERIALIZATION_SOURCE_VISUAL_TARGET_INVALID`; 无 content/furniture classifier code | [E01](#e01-materialization-schema), [E12](#e12-mixed-table-media-proof), [E29](#e29-source-bound-media-layout-and-review-proof) | 已有table-cell synthetic media；仍需正文/页眉条码与歧义位置负例 | content/furniture classifier另开窄票 | **P2**：inline不再误放大；用途仍不能猜 |
| M03 | `partial`（DOCX producer与manual PDF recipe/review supported） | `MATERIALIZATION_MEDIA_RECIPE_MISMATCH`, `MATERIALIZATION_MEDIA_RENDITION_MISMATCH`, `MATERIALIZATION_SOURCE_VISUAL_REGION_INVALID`, `IMPORT_REVIEW_MEDIA_DIGEST_MISMATCH` | [E04](#e04-universal-source-cli), [E05](#e05-materialization-adapter), [E16](#e16-review-projection-and-routes), [E22](#e22-source-region-pairing-proof), [E29](#e29-source-bound-media-layout-and-review-proof) | 已有DOCX embedded bytes/digest drift和PDF crop replay；仍需PDF producer自动locator fixture | 04的PDF producer follow-up | **P1 remaining**：exact provenance已可证明，自动发现/关联仍缺 |
| M04 | `partial`（受限DOCX shape supported） | `NCK1_DOCX_MEDIA_LAYOUT_UNSUPPORTED`, `MATERIALIZATION_MEDIA_PRESENTATION_INVALID` | [E07](#e07-shared-surface-adapter), [E08](#e08-screen-renderer), [E09](#e09-print-renderer), [E29](#e29-source-bound-media-layout-and-review-proof) | 已有block 40% left、60% center、table-cell 10%和anchor拒绝 | 04的PDF producer follow-up；表格视觉走[05](tickets/05-table-presentation-intent.md) | **P1 maintenance**：DOCX主路径已消除三面各猜布局；PDF仍无intent输入 |
| M05 | `partial`（shared caption渲染支持；自动caption检测缺失） | `MATERIALIZATION_MEDIA_PRESENTATION_INVALID`; 无自动caption-role code | [E07](#e07-shared-surface-adapter), [E08](#e08-screen-renderer), [E09](#e09-print-renderer), [E29](#e29-source-bound-media-layout-and-review-proof) | 已有学生caption与legacy provenance metadata三面正负断言；仍需producer邻段caption检测 | caption detection另开窄票（有真实频率后） | **P1 maintenance**：跨层丢失已修，producer不能凭邻段猜题注 |
| M06 | `partial`（source-bound派生与Owner门禁已实现；不自动判清晰度/内容一致/授权） | `MATERIALIZATION_MEDIA_PUBLICATION_INVALID`, `MATERIALIZATION_MEDIA_RENDITION_*`, `MATERIALIZATION_MEDIA_ENHANCEMENT_REPLAY_*`, `IMPORT_REVIEW_MEDIA_CHECKLIST_INCOMPLETE`, `IMPORT_REVIEW_MEDIA_CONFIRMATION_REQUIRED`, `IMPORT_REVIEW_MEDIA_CONFIRMATION_STALE` | [E05](#e05-materialization-adapter), [E16](#e16-review-projection-and-routes), [E29](#e29-source-bound-media-layout-and-review-proof) | 已有synthetic原图、固定增强、AI candidate、digest/recipe/receipt drift；不在线生图或提交真题图 | 真实只读、非CQ8低清图Owner QA需另行授权；自动语义评分不规划 | **P1 maintenance**：现在能安全试候选但不能自动信任；水印/授权仍是独立人工边界 |
| V01 | `supported`（source、确定性和已确认AI selected media三面一致） | `MATERIALIZATION_SOURCE_MEDIA_SET_MISMATCH`, `MATERIALIZATION_MEDIA_RECIPE_MISMATCH`, `MATERIALIZATION_MEDIA_DIMENSIONS_MISMATCH`, `MATERIALIZATION_MEDIA_RENDITION_MISMATCH`, `READING_MEDIA_PLACEMENT_INVALID` | [E05](#e05-materialization-adapter), [E12](#e12-mixed-table-media-proof), [E13](#e13-shared-surface-proof), [E29](#e29-source-bound-media-layout-and-review-proof) | synthetic PNG source/candidate；真实Screen/Print/PDF digest/尺寸/加载断言 | 维持E12/E13/E29 | **P0 maintenance**：选定publication后各表面绝不分叉 |
| V02 | `partial`（媒体最小intent已闭合；表格/PDF仍缺） | `MATERIALIZATION_MEDIA_PRESENTATION_INVALID`及rich contract codes；未表达关系无code | [E06](#e06-reading-contract), [E07](#e07-shared-surface-adapter), [E19](#e19-framed-columns-proof), [E29](#e29-source-bound-media-layout-and-review-proof) | 已有三种media布局实测；仍需表格presentation和PDF media source fixture | [05](tickets/05-table-presentation-intent.md)与04的PDF follow-up | **P1**：媒体主线已共用一份intent；不要扩成通用布局引擎 |
| V03 | `supported` | `MATERIALIZATION_MEDIA_PLACEMENT_INVALID`, `READING_FLATTENED_BRIDGE_FORBIDDEN` | [E01](#e01-materialization-schema), [E06](#e06-reading-contract), [E10](#e10-materialization-contract-proof) | full-page `visual_proof` + 未引用正例；引用为body负例 | 保持 contract regression | **P0 maintenance**：防整页截图冒充正文 |
| R01 | `supported` | `IMPORT_REVIEW_BUNDLE_DIGEST_MISMATCH`, `IMPORT_REVIEW_REVISION_IMMUTABLE`, `IMPORT_REVIEW_STALE_REVISION`, `IMPORT_REVIEW_ISSUES_UNRESOLVED` | [E15](#e15-review-store), [E16](#e16-review-projection-and-routes), [E17](#e17-review-ui-proof) | 现有mock immutable revision bundle | 维持 `node import-ops/verify.mjs` | **P0 maintenance**：审核信任/权限/不可变性成熟，不应另造preview |
| R02 | `supported`（PDF与raw image exact region-bearing visual） | `MATERIALIZATION_SOURCE_VISUAL_REGION_INVALID`, `IMPORT_REVIEW_SOURCE_VISUAL_NOT_FOUND`, `IMPORT_REVIEW_SOURCE_LOCATOR_UNAVAILABLE`, `IMPORT_REVIEW_SOURCE_DIGEST_MISMATCH` | [E15](#e15-review-store), [E16](#e16-review-projection-and-routes), [E17](#e17-review-ui-proof), [E22](#e22-source-region-pairing-proof), [E25](#e25-ordered-image-source-bundle-proof) | verifier实时生成PDF+PNG，table/icon/image/unlocated visual并在authenticated `/ops/`实点 | 真实非生产Candidate做Owner QA | **P0 maintenance**：后续每个adapter都必须复用，不另造preview或从rendition取代原图 |
| R03 | `partial`（AI media compare supported；通用排版diff missing） | `IMPORT_REVIEW_MEDIA_RENDITION_NOT_FOUND`, `IMPORT_REVIEW_MEDIA_DIGEST_MISMATCH` | [E17](#e17-review-ui-proof), [E29](#e29-source-bound-media-layout-and-review-proof) | 已有原图/AI candidate并排、overlay/切换、11项清单真实浏览器fixture | 通用自动diff只在教师任务证明需要后另评估 | **P0 maintenance for AI / P3 generic**：生成式变化必须逐项核对，排版像素噪声不自动裁决 |
| R04 | `supported`（声明的group/question/block/media/content-node/source region identity） | `IMPORT_REVIEW_TARGET_REQUIRED`, `IMPORT_REVIEW_RECT_INVALID`, `IMPORT_REVIEW_PAGE_INVALID`, `IMPORT_REVIEW_SURFACE_INVALID` | [E15](#e15-review-store), [E17](#e17-review-ui-proof), [E22](#e22-source-region-pairing-proof), [E29](#e29-source-bound-media-layout-and-review-proof) | 已有table/inline icon/media content-node/source rectangle实点；无target负例 | 维持E22/E29；独立cell identity有真实需求后另开票 | **P0 maintenance**：问题能精确落到媒体和source region；不另建review模型 |
| R05 | `partial`（DOCX/PDF/OCR/image/source-only/answer-shape adapters） | `MATERIALIZATION_BLOCK_UNSUPPORTED`、carrier shape codes、全部`NCK1_IMAGE_*`/`NCK1_OCR_*`与source-only lifecycle codes、`NCK1_ANSWER_VALUE_BOUNDARY_AMBIGUOUS`, `NCK1_COMBINED_SOURCE_BOUNDARY_AMBIGUOUS`, `IMPORT_REVIEW_CANDIDATE_REQUIRED` | [E01](#e01-materialization-schema), [E03](#e03-docx-producer), [E05](#e05-materialization-adapter), [E23](#e23-text-layer-pdf-producer-proof), [E24](#e24-scanned-pdf-ocr-evidence-proof), [E25](#e25-ordered-image-source-bundle-proof), [E26](#e26-ocr-web-review-and-confirmation-proof), [E27](#e27-source-only-awaiting-answers-proof), [E28](#e28-answer-shape-closure-proof) | 每个ticket带一个unknown邻接shape；图片/OCR/answer-boundary失败无partial interpretation；source-only无Candidate/Review/Publication且question drift拒绝 | 02/04/07分别补；10已闭合，不建第二套总模型 | **P0**：防静默丢失；按adapter局部关闭而非巨型classifier |

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

- `scripts/import-pipeline/universal-nck1.mjs`：`initialize`, `stageOcr`, `confirmOcr`,
  `materialize`, `extractDocxMedia`, `cropPdf`。OCR sidecar immutable staging与确认均在同一
  single-writer lock内；`materialize` 进入按完整 source-set shape 选择的通用 job。
- `scripts/import-pipeline/nck1-docx-materialize.mjs`：`selectProducer`,
  `runNck1MaterializationJobUnlocked`, `withPaperWriterLock`；OCR确认可替换且仅可替换
  digest未改的non-ready producer output，Agent改过的输出仍拒绝覆盖。

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
- `scripts/import-pipeline/canonical-consumption-print-payload.mjs`与上述Review routes把
  source-authoritative `officialModelAnswer`显式带入Teacher Print/PDF consumption；
  `scripts/verify-universal-nck1-publish.mjs`通过真实Owner Review路由断言Teacher恰有两组
  official samples、Student为零，并同时断言Teacher 45项答案与Student零答案。
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
  `isAnswerExplanationHeading`, `splitNck1CombinedSourceStructure`, `listeningMaterialization`,
  `activeAnswers`。“答案与解析”可作为文件开头容器heading；完整21–65 key后的详解heading
  才停止读取。明确应用文/续写heading内的官方范文进入Teacher-only字段；客观题详解和
  评分说明没有投影，听力原文仍独立提取。
- `test-fixtures/paper-import/nck1-docx-materialization-v1/fixture.mjs`：`answerDocument` 含
  compressed answer ranges、56–65文本答案、写作范文与“答案解析”边界。
- `scripts/verify-nck1-docx-materialization-producer.mjs`：断言45项权威答案及只有
  `writing_analysis` 留在 Agent reasoning path。

### E22 Source-region pairing proof

- `scripts/verify-import-review-source-pairing.mjs`：运行时生成匿名1页PDF和raw PNG；验证
  authenticated crop与metadata headers、unknown/unlocated/digest drift拒绝；真实浏览器打开`/ops/`，
  实点Screen table/icon/unlocated block，验证跨Print保留card、exact Screen回跳、source issue
  group/block/page/rect提交及刷新回放。

### E23 Text-layer PDF producer proof

- `server/paper-import/nck1PdfTextSourceAdapter.mjs`：`extractNck1PdfTextStructure`,
  `parsePages`, `embeddedRasterImagePages`, `mergeInlineBlockFragments`, `borderedTableBox`, `tableRuns`,
  `assertReadableLayout`；从 Poppler bbox 建 ordered paragraph/table 与`page_region`，简单表
  还需 raster border grid 证据；内嵌raster在尚不能保真提取时明确拒绝；无文字层、缺页、
  多栏、重叠或未闭合并排文字均带document/page/region stable failure。
- `server/paper-import/nck1PdfMaterializationProducer.mjs`：
  `produceNck1PdfMaterialization`, `nck1PdfProducerSourceDigest`；接受exact question PDF +
  official-answer PDF或一个有明确边界的combined PDF，并调用E03的carrier-neutral parser。
- `test-fixtures/paper-import/nck1-pdf-materialization-v1/fixture.mjs`：运行时生成匿名多页题卷、
  单页答案、2x2表、“答案详解”陷阱和六类相邻负例（含2x2 synthetic PNG），不提交真实试卷。
- `scripts/verify-nck1-pdf-materialization-producer.mjs`：direct producer + public
  `universal-nck1 init/materialize/verify/build`；断言9 groups、45 answers、全部page-region、
  semantic table、详解排除、source order replay、stable failures和无可用partial interpretation。

### E24 Scanned-PDF OCR evidence proof

- `server/paper-import/nck1OcrSourceEvidence.mjs`：`captureNck1OcrPageRasters`,
  `buildNck1OcrSourceEvidence`, `validateNck1OcrSourceEvidence`,
  `resolveConfirmedNck1OcrEvidence`, `nck1OcrEvidenceDigest`；逐页重放immutable PDF像素，
  闭合engine/version、observation/region、confidence/alternatives、reading-order、页覆盖与
  source/evidence-bound Agent closure。confidence/alternatives只作诊断；闭合前不产生ordered paragraphs。
- `server/paper-import/nck1OcrMaterializationProducer.mjs`：
  `produceNck1OcrMaterialization`, `nck1OcrProducerSourceDigest`；接受exact扫描题卷+答案carrier
  或一个combined carrier，确认后调用E03同一splitter/parser，confidence/raster不进入Canonical。
- `test-fixtures/paper-import/nck1-ocr-evidence-v1/fixture.mjs`：从匿名synthetic text PDF生成
  4页题卷+1页答案的image-only PDF、固定engine observations与一个tiny furniture visual；
  不调用在线OCR，不提交真实试卷或整页raster。
- `scripts/verify-nck1-ocr-source-evidence.mjs`：direct producer + public
  `init/stage-ocr/materialize/confirm-ocr/materialize/verify/build`；证明未确认non-ready、确认后
  9 groups/45 answers/page-region、详解排除、低confidence/alternatives不阻断、顺序/visual/
  漏页/raster drift/旧closure stable failure且没有可用partial interpretation；还证明修订
  evidence/closure或升级旧producer后，只在receipt output及其media均未被Agent改动时安全
  重产，任何Agent修改都拒绝覆盖，并固定完形题source locator指向选项行而非passage blank。

### E25 Ordered-image source bundle proof

- `server/paper-import/nck1ImageSourceBundle.mjs`：`inspectNck1SourceImage`,
  `buildNck1ImageSourceBundle`, `parseNck1ImageSourceBundle`,
  `assertNck1ImageBundlePageArtifacts`, `nck1ImagePageRgba`, `cropNck1SourceImage`；按magic
  bytes核PNG/JPEG/WebP与像素尺寸，闭合显式页序、exact encoded bytes/digest、raw RGBA digest
  和原图region crop。
- `scripts/import-pipeline/universal-nck1.mjs`：`parseSourcePage`, `groupedSourcePages`,
  `initialize`, `capturedDocuments`；重复`--source-page role:page=path`生成两个image-bundle
  documents、immutable raw page artifacts和只供浏览的deterministic PDF renditions，不猜DPI。
- `server/paper-canonical/nck1MaterializationAdapter.mjs`：image bundle Source Capture分支把
  descriptor与逐页原图登记为不可变artifacts；整页图不进入Canonical正文或content media。
- `test-fixtures/paper-import/nck1-image-source-bundle-v1/fixture.mjs`与
  `scripts/verify-universal-nck1-image-source-bundle.mjs`：4页题卷+1页答案，混合
  PNG/JPEG/lossless WebP，闭合9 groups/45 answers；验证replay、gap/duplicate/GIF/digest drift、
  未确认non-ready及同一Candidate的真实Screen、Student/Teacher Print和PDF公共seam。
- `scripts/verify-import-review-source-pairing.mjs`：证明Candidate source crop可直接重放raw
  PNG权威页，不从PDF rendition反向裁图。
- 2026-08-30真实只读、非CQ8图片pair：8张题卷图与9张答案图均完整、有序、唯一、清晰；
  Agent closure后形成9 groups、45 active assertions及20项inactive listening closure，零content
  media。独立视觉前审对R7 Candidate的10个代表source locators逐一重放，包含首题、完形
  选项行、语法填空首尾段、两类写作instruction/story/notes/starters；真实Screen实点回源，
  Student/Teacher HTML与8/11页PDF逐页检查均闭合。真实bytes与长篇文本保持gitignored，
  Owner对R7的paper-level验收仍待办。

### E26 OCR web review and confirmation proof

- `server/import-review/revisionProjection.mjs`：`loadNck1OcrReviewSource`,
  `ocrReviewBundleFilePaths`, `buildNck1OcrReviewProjection`,
  `validateNck1OcrReviewConfirmation`, `buildImportReviewProjection`；从immutable图片bundle和
  OCR evidence建立pre-Canonical投影，并严格校验Owner确认覆盖与digests。
- `server/import-review/importReviewStore.mjs`：`ocrReviewBundleDigest`,
  `validateOcrReviewBundleManifest`, `reviewKind`, `confirmOcrRevision`；OCR revision独立于
  Candidate revision，禁止issue/approval/shipping seam，确认receipt不可变且可重放。
- `server/import-review/importReviewRoutes.mjs`：OCR raw page、Owner confirmation与Agent fetch
  routes；Screen/Print/PDF/source-visual Candidate endpoints遇OCR revision返回
  `IMPORT_REVIEW_CANDIDATE_REQUIRED`。
- `scripts/import-pipeline/review.mjs`：`pushOcrReview`, `pullOcrConfirmation`；Agent只上传
  source/evidence review bundle并拉取exact Owner confirmation，再由公共producer生成Candidate。
- `import-ops/public/app.js`：`initializeOcrDraft`, `orderedOcrObservations`,
  `ocrReviewStageHtml`, `buildOcrConfirmation`, `ocrReviewRailHtml`, `bindOcrReview`；逐页并排原图、
  region、文字、confidence/alternatives、顺序和content/furniture分类，正文图形保持阻断。
- `scripts/verify-import-review-ocr-confirmation.mjs`：匿名synthetic图片pair经authenticated
  `/ops/`真实浏览器实点改字、调序、切页、阻断未知visual、逐页核对并提交；同时验证旧确认、
  Candidate endpoints和shipping fail closed，以及Agent取回exact confirmation。

### E27 Source-only awaiting-answers proof

- `scripts/import-pipeline/nck1-source-only.mjs`：`makeNck1SourceOnlyCapture`,
  `readNck1SourceOnlyCapture`, `nck1QuestionSetDigest`, `writeNck1SourceOnlySuccessor`,
  `assertNotNck1SourceOnly`；关闭capture/successor digest、原题document/raw image page replay及
  Materialization/Review/Publication稳定边界。
- `scripts/import-pipeline/universal-nck1.mjs`：`captureSourceDocuments`, `captureSourceOnly`,
  `sourceOnlyStatus`, `listSourceOnly`, `attachAnswers`；DOCX/PDF/有序图片题卷共用现有capture
  helper，后补答案时复制并复核题卷identity，再创建普通complete source set。
- `scripts/import-pipeline/review.mjs`：所有Review command在网络、approval与DB seam前调用
  `assertNotNck1SourceOnly`；source-only publication返回独立稳定code。
- `test-fixtures/paper-import/nck1-source-only-v1/fixture.mjs`：最小匿名FODT→一页DOCX/PDF、
  compact key PDF、两张题卷图与一张答案图；不含真实卷或长原文。
- `scripts/verify-universal-nck1-source-only-intake.mjs`与
  `scripts/verify-universal-nck1-source-only-boundaries.mjs`：证明gitignore、原bytes/page order、
  status/list replay、无答案无Candidate/Review/Publication、wrong digest/question drift/duplicate
  拒绝，以及PDF和图片后补答案不覆写旧capture。

### E28 Answer-shape closure proof

- `server/paper-import/nck1DocxMaterializationProducer.mjs`：
  `splitNck1CombinedSourceStructure`, `parseOfficialAnswers`,
  `produceNck1MaterializationFromStructures`, `produceNck1DocxMaterialization`；详解、纯key和
  combined source共用唯一answer parser，写作`officialModelAnswer`固定为空。
- `server/paper-import/nck1PdfMaterializationProducer.mjs`：
  `produceNck1PdfMaterialization`；一个combined PDF走同一明确heading split。
- `server/paper-import/nck1OcrMaterializationProducer.mjs`：
  `produceNck1OcrMaterialization`；确认后的扫描PDF/image observations复用同一splitter/parser。
- `test-fixtures/paper-import/nck1-docx-materialization-v1/fixture.mjs`：
  `answerBlocks`, `combinedDocument`, `makeSyntheticNck1DocxFixture`。
- `test-fixtures/paper-import/nck1-pdf-materialization-v1/fixture.mjs`：
  `answerHtml`, `combinedHtml`, `makeSyntheticNck1PdfFixture`；额外answer shapes仅由专项回归按需生成。
- `scripts/verify-nck1-answer-source-shapes.mjs`：比较DOCX/PDF detailed与key-only的45项值；
  断言详解token/写作范文不进入Materialization或Candidate preview；无/双combined heading与
  模糊56–65答案边界无可用interpretation；再用真实Universal CLI从单个
  `question_and_answers` PDF完成`init/materialize/verify/build`。
- `scripts/verify-ci.mjs`的`registry.scripts`/`importPaperScripts`与
  `scripts/verify-import-paper-routing.mjs`把该回归保留为独立import failure layer。

### E29 Source-bound media layout and Review proof

- `schemas/paper-canonical/nck1-source-materialization-v2.schema.json`的`$defs.media`，以及
  `shared/paper-canonical/mediaPresentation.mjs`的`validateMediaPresentation`,
  `validateMediaPublication`, `mediaPresentationById`,
  `decorateProjectedMediaPresentation`：在现有Source Capture/media上关闭alignment、正文
  width ratio、有限spacing与source/deterministic/human-confirmed AI publication三级选择。
- `server/paper-canonical/docxSourceAdapter.mjs`的`embeddedParagraphMedia`,
  `paragraphPresentation`, `extractDocxDocumentStructure`和
  `server/paper-import/nck1DocxMaterializationProducer.mjs`的
  `prepareDocxEmbeddedMedia`, `produceNck1DocxMaterialization`：读取DOCX relationship、包内
  PNG/JPEG/WebP原bytes、`wp:inline` extent、正文宽、段落对齐/spacing；只有一个image-only
  paragraph/cell自动闭合，anchor、多栏/不一致section、题组外图片、混合文字、多图和模糊
  关联稳定拒绝。
- `server/paper-canonical/nck1MaterializationAdapter.mjs`的
  `replayDeterministicEnhancement`, `selectedMedia`, `reextractMedia`,
  `deriveNck1MaterializationBundle`：source/candidate独立immutable bytes，DOCX/PDF recipe exact
  replay，固定ImageMagick `document-light-cleanup-v1`重放，candidate digest/type/dimensions核验；
  `source_crop`时latent AI candidate只投影为Review evidence。
- `shared/paper-canonical/consumerProjection.mjs`的`resolveReadingMedia`与figure projection、
  `app/src/shared-ui/papersurface/PaperSurface.tsx`的`renderCanonicalReadingInlines`/
  `renderCanonicalReadingBlock`、`server/print-renderer.mjs`的
  `canonicalMediaPresentationAttributes`/`renderCanonicalReadingBlock`：Screen、两种Print和PDF
  使用同一selected bytes与presentation。两端CSS以reading container query width解释
  `widthRatio`；presentation-bound学生caption显示，legacy provenance caption继续隐藏。
- `server/import-review/revisionProjection.mjs`的`mediaDerivationProjection`,
  `buildNck1ReviewConsumption`，`server/import-review/importReviewStore.mjs`的
  `confirmMediaDerivation`, `assertSelectedMediaConfirmations`，及
  `server/import-review/importReviewRoutes.mjs`的media source/candidate routes：原图/候选exact
  bytes进入Review；Owner单图receipt绑定source、candidate、presentation与11项checklist；下一
  revision选择AI candidate必须引用更早revision的exact receipt，整卷approval仍独立。
- `import-ops/public/app.js`的`mediaDerivationSectionHtml`, `bindMediaReview`, `screenTarget`,
  `issueFormHtml`：`/ops/`提供原图/候选并排、overlay/切换、11项确认，并把问题绑定到
  `mediaId`/`contentNodeId`和已有source region。
- `test-fixtures/paper-import/nck1-docx-materialization-v1/fixture.mjs`与
  `scripts/verify-nck1-docx-materialization-producer.mjs`：synthetic block 40% left、block 60%
  center、table-cell 10%和anchor负例，无真实题图。
- `scripts/verify-import-review-media-derivation.mjs`：source-only、固定增强重放、candidate
  bytes/digest漂移、latent AI、Owner receipt gate、issue identity、真实Screen、Student/Teacher
  Print及Chromium PDF专项回归。
- `scripts/verify-import-review-source-pairing.mjs`：authenticated `/ops/`真实浏览器实点inline
  media，加载两份exact图片、调overlay、完成11项清单、提交Owner单图确认并回看receipt；同时
  验证media/content-node问题target和source visual pairing。

## Conclusions from the matrix

- **最成熟**：限定形状的 DOCX（C02）和已闭合媒体的三面同像素路径（V01）；单栏文本层
  PDF producer已通过synthetic/public seam，但在真实非生产Owner QA前仍是`partial`。
  PDF已为每个item闭合page-region并复用同一Canonical surface contract。
- **当前关键边界**：扫描PDF与有序图片页（C03/C07）的通用synthetic链路已经闭合到
  `/ops/`和同一Canonical三面；有序图片还完成了一次真实、只读、非CQ8 Agent closure与
  独立视觉前审，但Owner尚未验收R7，扫描PDF真实QA与生产OCR engine也仍缺，因此保持
  `partial`。无答案来源的durable source-only暂存（C10）与C08/C09/C11的
  统一答案shape边界均已闭合。M04共享媒体布局和M06低清媒体人工确认门禁现已对受限DOCX
  shape闭合；当前最重要媒体缺口变为PDF producer自动取局部图/正文关联，以及B06的
  “普通表格不能截图化”classifier。
- **首批发布目标**：题卷图片 + 答案图片的清晰单栏shape已通过首份真实pre-review；复杂
  多栏、正文图形与复杂表格继续fail closed。实际发布仍不能跳过Agent closure、Candidate
  Review或Canonical三面回归。
- **不要误报**：text-PDF与scan-OCR都只对exact、单栏、标准NCK1的独立pair或明确
  `question_and_answers`边界完成producer和synthetic proof，仍待真实Owner QA；图片页也只支持显式有序PNG/JPEG/WebP、清晰单栏、
  权威答案齐全且Agent对照闭合的shape进入Candidate。首份真实图片Candidate仍待Owner验收；无答案题卷现在只能安全暂存，仍不能
  Materialize、审核或发布；复杂正文图形、多栏、混合载体和边界不明的combined file仍不支持。
  OCR自动结果不能当权威，整页图片不能当Canonical正文。legacy DOCX shape crop
  不等于Universal media producer；按accepted policy，详解文件只贡献权威答案值，不进入
  Canonical/Teacher；低清图的AI候选门禁已实现但不会自动判断内容一致或来源授权，必须
  逐项Owner确认；PDF手工crop和Canonical能手工表达都不等于producer检测能力supported。
