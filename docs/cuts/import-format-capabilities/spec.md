# 导题格式能力矩阵

- Status: active（tickets 01、03 已实现；真实 Owner QA 待办）
- Date: 2026-08-28
- Planning baseline: `main@4296c85b4d135a9fa532219e2cd9a467a6b7e31d`
- Matrix: `docs/cuts/import-format-capabilities/capability-matrix.md`
- Tickets: `docs/cuts/import-format-capabilities/tickets/`

## Problem

过去遇到陌生卷面时，工作容易被描述成“格式①/②/③之后再加一个格式”，或在
某一 `paperId` 上加派生与 CSS。这样能救一卷，但不能回答下面这些长期问题：

- 来源是文本层 PDF、DOCX、扫描 PDF、混合载体或听力附件时，哪一层真的支持？
- 表格、媒体、分栏、跨页、页眉页脚与正文邻接在哪一层被检测、保存和拒绝？
- Canonical、Screen、Student/Teacher Print 和 PDF 是否使用同一语义与布局意图？
- Owner 在 `/ops/` 看到的是源文件和真实渲染的可核对证据，还是两个无法定位的窗口？
- 一个尚未识别的形状会稳定失败，还是静默丢字、丢图或被猜成另一种形状？

当前代码已有强的 Canonical Paper、Source Materialization、共享 renderer 和不可变
Import Review revision，但各能力的覆盖不均：简单 DOCX 文本很成熟，PDF 自动
物化、OCR、表格视觉属性、媒体布局意图与局部源图审核仍有明显断点。缺少统一
登记表会让文档里的“支持”与实际 producer 的“支持”混在一起。

## User outcome

每遇到一种新卷面形状，Agent 先从矩阵找到最接近的通用能力；若缺失，则用最小
匿名 fixture、稳定失败码和公共 seam 补这一项。下一份同形状试卷只提供来源与
教师确认，不再修改 renderer、添加 `paperId` 分支或发明一个“格式编号”。

## Scope

本 cut 建立四样东西：

1. 有代码与测试证据的当前能力矩阵。
2. 统一的状态与失败关闭定义。
3. 按真实依赖拆分的可执行 tickets。
4. 新卷遇到陌生形状时的 wayfinder。

本 cut 最初只调查和写计划；Owner 启动某张 ticket 后，按 ticket 的公共 seam 实现并同步
矩阵。任何实现仍不得修改生产资产/数据，也不自动授权下一张 ticket 或发布。

## Source space: three independent axes

以后不要把“PDF 详解版”“图片无答案版”各自命名为新格式。一个 source set 只需登记
三个彼此独立的事实：

1. **题卷载体**：DOCX、文本层 PDF、扫描 PDF、显式排序的 PNG/JPEG/WebP 页、或这些
   载体的混合；听力音频是补充 artifact，不冒充分页题卷。
2. **答案形态**：`detailed`（答案 + 源详解/范文）、`key_only`（只有权威答案键）、
   `not_supplied`（尚未找到权威答案）。“答案键”必须覆盖该卷所有实际作答值，不是只
   收选择题 ABCD 而漏掉语法填空等答案。`detailed` 与 `key_only` 都只向下游提供权威
   答案值；逐题详解不提取、不结构化，也不进入教师版。
3. **包装关系**：题卷/答案分开、同一文件内合并、或多页 image bundle。包装只决定
   source role 与 locator，不改变 Canonical 题意。

这三个轴组合，而不产生新的 parser 身份。例如 question PDF + detailed answer PDF 与
question PDF + key-only answer PDF 共用 PDF carrier adapter，并生成同一种 `answers[]`；
前者多出的逐题详解只留在不可变原答案文件中，不另建数据模型。ordered image bundle
与扫描 PDF 共用 OCR page-observation seam。

无权威答案的 source 可进入不可变的 **source-only / awaiting answers** 暂存状态，避免
辛苦找到的图片卷丢失；但不得生成 ready Materialization、Canonical Candidate、Review
approval 或 publication，也不得由 AI 解题补答案。以后找到答案时建立新的完整 source-set
revision，绑定原 question digest，不能原地改写旧 capture。

## Architecture boundary

```text
immutable source bytes
        │
        ▼
┌────────────────┐ observations / spans / source order
│ Source Capture │──────────────────────────────────────┐
└───────┬────────┘                                      │
        ▼                                               │
┌─────────────────┐ deterministic interpretation       │
│ Materialization │── issue codes / review tasks ───────┤
└───────┬─────────┘                                     │
        ▼                                               ▼
┌─────────────────┐ human-confirmed meaning      ┌───────────────┐
│ Canonical Paper │─────────────────────────────▶│ Import Review │
└───────┬─────────┘                              │ source + real │
        │ one semantic and layout-intent stream  │ render proof  │
        ├──────────────┬──────────────┐           └───────────────┘
        ▼              ▼              ▼
     Screen      Student/Teacher     PDF
                    Print HTML
```

- **Source Capture** owns immutable bytes, digests, source observations, source spans and order.
  It does not decide question meaning.
- **Materialization** owns deterministic transcription and shape interpretation, source locators,
  media extraction recipes, page coverage and unresolved issues.
- **Canonical Paper** is the semantic authority. A media crop or layout hint cannot reconstruct
  an answer, question boundary or passage meaning.
- **Renderer projection** owns one shared, renderer-neutral layout intent. Screen and Print/PDF
  may translate units, but may not independently infer source layout.
- **Import Review** is the human trust boundary. AI-derived classification is only admissible when
  it names a teacher QA task, retains source evidence and awaits explicit confirmation.

## Accepted principles

### Shape, not paper

- 能力以可检测的通用 shape/adapter 表达；禁止 `paperId` 条件、单卷 CSS 或新的
  “格式④⑤⑥”。历史单卷 successor 只能当现状证据，不能当推荐模式。
- 先扩已有 source of truth：`sourceCoverage.visuals`、block/source locator、Canonical
  rich blocks、shared surface adapter、Import Review issue target。没有证明需要时不加
  wrapper、平行 schema 或第二套 preview model。
- 不提前设计通用排版引擎。先做高频、边界清晰、可检测且错误代价高的形状。

### Semantic structure before visual fallback

- 普通矩形表格优先成为语义 `table`；合并、空格、对齐与列宽各自关闭，不能用整表
  截图掩盖未识别单元格。
- 能诚实打字的正文必须结构化。只有无法诚实结构化的照片、插图、图表、流程图或
  复杂图形才成为 Canonical media crop。
- 整页截图只可作为 `visual_proof`/source evidence；不得成为 Canonical passage body。
- 条码、图标、页眉装饰等内容/家具归类不明时失败关闭，等待教师确认。

### Two kinds of fidelity

- **内容像素忠实**：进入 Canonical 的媒体必须来自源字节或确定性裁剪；保留 digest、
  像素尺寸和可重放 recipe。禁止 AI 重画。
- **版式关系忠实**：保留影响阅读或作答的比例、位置、留白、对齐、栏关系和前后正文
  邻接；由一个共享 layout-intent seam 投影到三面。
- 不承诺整页像素级复制 Word/PDF。字体栅格、分页细差和纯装饰可按考试格式标准归一化。

### Fail closed

- 未识别容器、丢失 source locator、重叠/缺格、模糊 shape association、未闭合媒体、
  OCR 低置信片段与未知布局关系必须产生稳定 code 和源区域；不得丢弃、补写或猜测。
- `needs_agent_review` 不是 `supported`。手工能修一卷也不是 producer 能力。
- 失败项在 Teacher Confirmation 前不可进入 ready Canonical Candidate。

### Safe evidence

- 真实试卷只读，用于一次性核查。仓库 fixture 使用最小、匿名化或 synthetic 文本、
  表格、媒体和音频形状；不提交完整版权试卷、长篇原文、账号或学生数据。
- 每项新能力至少有一个正例、一个边界拒绝例和一个公共 surface 断言。若改变共享
  Paper contract，按根 `AGENTS.md` 运行共享 renderer 门禁和真实三面 proof。

## Capability state model

矩阵只使用以下四个状态；状态描述的是“这一行明确写出的真实输入形状”，不是整个
文件类型的营销结论。

| State | Definition |
| --- | --- |
| `supported` | 通用 producer/adapter 可检测；Source Capture、Materialization、Canonical 和所有声明表面闭合；未知变体稳定拒绝；有匿名 fixture 和回归检测。 |
| `partial` | 至少一层可表达或已有 legacy/manual proof，但不是通用端到端能力，或某个声明表面丢失信息。 |
| `fail-closed` | 当前明确拒绝该形状并提供稳定 code/evidence；没有 ready Candidate。这是安全能力，不是渲染支持。 |
| `missing` | 当前导题路径既不可靠检测也不提供形状级稳定拒绝/表达；只能靠外部人工流程或根本不可完成。 |

状态升级必须同时更新矩阵行、fixture、失败码和 Review QA evidence。仅修改文档或让一份
真卷通过，不能把 `partial` 改成 `supported`。

## Capability registration contract

每一行必须登记：能力名称、真实输入形状、检测方式、Source Capture、Materialization、
Canonical/renderer、Screen、Print/PDF、Review evidence、当前状态、失败码、精确代码与
测试证据、最小 fixture、下一 ticket、优先级及理由。

新能力的最小交付顺序：

1. **Fixture first**：一个只含该 shape 的 synthetic source；无长正文。
2. **Detection**：从 immutable bytes 得到可重放 observation；不靠 `paperId`。
3. **Materialization**：复用既有 block/media/source locator；不能表达才提出最小字段。
4. **Failure**：至少一个相邻但不支持的形状返回稳定 code 和 locator。
5. **Canonical projection**：只传递语义和必要 layout intent，不从媒体猜题意。
6. **Shared surfaces**：Screen、Student/Teacher Print 与 PDF 对同一 projected shape 断言。
7. **Review proof**：Owner 能从真实 render 回到源页/区域并把问题绑定到语义对象。
8. **Matrix update**：证据合入后才升级状态。

## Review direction

第一阶段采用“局部源图 + 真实 Screen 并排 + 双向 locator 跳转”：

- `/ops/` 继续 iframe 现有 `PaperBrowsePage`，不复制 renderer。
- 源侧来自 revision 内不可变 PDF/rendition 和 `sourceCoverage.visuals`/block locator；
  显示页码、规范化矩形、目标 ID 与 digest。
- 点击真实 Screen 的 table/figure/block，选中对应源局部；从源局部记录问题时同时保存
  `surface=source`、页码/rect 和现有 group/question/block identity。
- 定位缺失时显示明确的“未配对”状态，不猜最近元素。

局部 alpha overlay、自动像素 diff 和 OCR 文字 diff 不是第一阶段验收项。两面不是同一
坐标系，且当前缺少稳定局部 locator；过早做 diff 会把字体、重排和分页噪声误报成内容
错误。等 locator 覆盖与布局意图稳定后，再用独立 ticket 评估差异提示。

## Priority model

- **P0**：否则会静默丢内容/误判，是后续视觉能力的共同 QA seam，或是 Owner 指定的
  首批业务发布能力。
- **P1**：高频卷面且现有模型接近可用；补齐后能复用明显。
- **P2**：重要但依赖 P0/P1 的稳定输入，或当前以安全人工确认可继续。
- **P3**：低频/高复杂度、容易演化为大布局引擎；先保持 fail-closed。

Owner 将“题卷图片 + 答案图片”定为首批发布能力，因为它能覆盖难搜集、时效性高的来源。
因此 C07/09 是 **P0 业务里程碑**；表格视觉、媒体细节、听力音频和混合载体不得抢占它的
实现顺序。

技术票 `01-source-region-review-pairing.md` 已建立自动化可证的原图局部—真实 Screen
审核 seam，`03-text-layer-pdf-materializer.md` 已建立 PDF bbox adapter 与 DOCX/PDF 共用
ordered-item parser，`06-scanned-pdf-ocr-evidence.md` 已建立逐页像素摘要、OCR observations、
digest-bound人工确认及同一parser入口；三者仍需在首个非生产 Candidate 上做一次真实
Owner QA。图片经 OCR 后必须由教师对照原图与真实 Screen，不能为了抢先发布而跳过确认。
最短发布主线仍是 **01 → 03 → 06 → 09**。Owner已决定：OCR原图对照和人工确认控件必须
并入09，不延期为可选polish；但不因依赖已满足而自动启动09，也不授权实际发布真实试卷。

## Acceptance criteria for this roadmap

- [x] 对用户列出的来源、文本/版式、表格、媒体、原卷忠实和审核能力逐行盘点。
- [x] 每行状态由当前代码/测试证据支持，并区分 universal、manual 与 legacy-only。
- [x] 矩阵明确区分内容像素忠实、版式关系忠实和 source visual proof。
- [x] tickets 不包含 `paperId` 分支，不要求提交真实整卷，按技术依赖拆分。
- [x] 第一张 ticket 有输入、非目标、公共 seam、失败行为、fixture 和验证命令。
- [x] wayfinder 让后续 Agent 能记录 gap、补通用能力、回归并更新状态。

未来实现完成的总验收是：一个未见过的同形状 synthetic source 能通过对应 producer，
在 Canonical 形成同一语义/布局意图，在真实 Screen、两种 Print 和 PDF 呈现，并在
`/ops/` 从源局部定位与反馈；相邻未知 shape 返回稳定失败而不是近似成功。

## Out of scope

- 本阶段修改生产代码、schema、数据库、renderer、试卷资产或生产数据。
- 新增或发布一张真实试卷，处理 CQ8、Review revision、认可、上线或 R2。
- 通用任意栏数/任意绝对定位布局引擎。
- 整页像素级复刻、AI 重画媒体、AI 自动批准 OCR/内容归类。
- 听力播放 UI；本 roadmap 只讨论 inactive source closure 与原始音频证据。
- 以整页 screenshot 替代 Canonical 正文。

## Accepted Owner decisions

Owner 于 2026-08-28 接受以下默认规则：

1. **条码/二维码**：正文中且与题目有关的保留给学生；页眉页脚中的管理条码归为
   source furniture，不进入学生输出；位置/用途不明确时 fail closed，交教师确认。
2. **普通表格**：保留合并、边框存在性、对齐和相对列宽等影响理解/作答的关系；字体、
   线型粗细等表层细节统一为 EQB 考试样式，不做逐像素 Word 表格复刻。
3. **媒体 caption**：原卷中学生可见、帮助理解的题注是 Canonical content，三面都显示；
   文件名、来源页码和操作说明仅是 QA/accessibility metadata，不给学生看。
4. **答案源详解**：不成为教师版内容，也不单独提取或结构化保存；只读取权威答案值。
   原答案文件仍作为不可变 source evidence 保留，避免答案权威失去出处。写作官方范文
   与听力原文按既有独立 contract 处理，不视为逐题详解。

这些规则是通用 shape policy，不得通过 `paperId` 覆盖。

“第一版是否做 overlay/自动 diff”不是阻塞产品问题：本 spec 先做并排 locator，diff
延后；若后续实测表明并排不足，再以误报率和教师任务为依据开票。

## References

- `docs/import/agent-contract.md`
- `docs/product/nck1-paper-standard.md`
- `docs/product/exam-paper-format-standards.md`
- `docs/cuts/import-agent-closed-loop/spec.md`
- `docs/cuts/web-import-review/spec.md`
- `docs/cuts/reading-framed-columns/spec.md`
