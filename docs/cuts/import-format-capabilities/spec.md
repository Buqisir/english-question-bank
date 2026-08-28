# 导题格式能力矩阵

- Status: proposed
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

本阶段只调查和写计划，不修改 schema、producer、Canonical、renderer、Review DB、
应用代码、生产资产或试卷数据。

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

- **P0**：否则会静默丢内容/误判，或是所有后续视觉能力的共同 QA seam。
- **P1**：高频卷面且现有模型接近可用；补齐后能复用明显。
- **P2**：重要但依赖 P0/P1 的稳定输入，或当前以安全人工确认可继续。
- **P3**：低频/高复杂度、容易演化为大布局引擎；先保持 fail-closed。

推荐第一张票是 `01-source-region-review-pairing.md`。它不增加一种卷面格式，而是把现有
`sourceCoverage.visuals`、真实 Screen 和已有 issue page/rect seam 接通，为表格、媒体、
PDF 与 OCR 的每个后续 fixture 提供共同验收证据。

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

## True product decisions for Owner

以下决定会改变学生可见内容或 Canonical/presentation 边界，不能由实现者猜：

1. **条码/二维码默认归类**：学生输出应保留，还是默认当 source furniture 仅供 QA？
   在决定前逐个 fail closed，由教师确认 `content_media` 或 `furniture`。
2. **普通表格的视觉权威**：除合并、边框存在性、对齐和相对列宽外，是统一成 EQB
   考试表样式，还是要求逐项保留源边框线型/粗细与精确宽度？推荐 tickets 不做任意
   Word 表格样式引擎，需 Owner 确认最小忠实边界。
3. **媒体 caption 的含义**：源图题注是学生可见 Canonical content，还是只用于 QA/
   可访问性 metadata？当前 Canonical 有 caption，但 Screen/Print figure 都不呈现，
   因而必须先分清产品语义再修 renderer。

“第一版是否做 overlay/自动 diff”不是阻塞产品问题：本 spec 先做并排 locator，diff
延后；若后续实测表明并排不足，再以误报率和教师任务为依据开票。

## References

- `docs/import/agent-contract.md`
- `docs/product/nck1-paper-standard.md`
- `docs/product/exam-paper-format-standards.md`
- `docs/cuts/import-agent-closed-loop/spec.md`
- `docs/cuts/web-import-review/spec.md`
- `docs/cuts/reading-framed-columns/spec.md`
