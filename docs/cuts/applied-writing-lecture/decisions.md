# applied-writing-lecture · 已拍板决策（tracked 定本）

来源：wayfinder 地图 `.scratch/applied-writing-analysis/`（gitignored），
2026-07-20 四票 owner 逐项拍板。按 issue-tracker 纪律抄进 tracked 文件，
本文件是后续 agent 依赖的唯一定本。

## 1. 解析内容结构（讲评讲什么）

讲评流：审题 → 结构 → 范文 → 亮点（结构不单列，融进审题卡 + 范文标志）。
三块按讲评流排：

1. **审题卡**（照搬 owner 课堂通用审题卡，同术语）——**2026-07-21 DP-3
   owner QA 拍板已改为课堂真卡四节：基础五定 / 圈要点、编号 / 读者三问 /
   价值落点，取代下方本节原描述的六格，定本见 §6。** —— 需新字段
   `reviewCard`。
2. **范文 + 审题点讲解**：范文全文（现有 `modelAnswer`）；句上锚点讲评标注
   （每篇 1–5 个）——**2026-07-21 起显性字模按钮与图例已删除（见 §6 ③），
   锚句本身可点，点开在段落下方就地展开讲解条（含对应卡格内容）。**
   —— 需新字段 `reviewMarks`。
   验收口诀（课堂原话，也是重产 gate 标准）：**卡上每格能在范文里指出
   一句；范文每个标志指得回一格。指不回去 = 卡填空了或文跑题了。**
3. **亮点表达**：维持现状（`highlightExpressions`，约 5 条），不收紧、
   不重标。

**明确不要**：骨架块（审题卡落纸清单 + 标志已覆盖结构）；得分点／易错
点／评分档位块（批改诊断挂学生作文，不挂题库解析）。

术语真源在 owner 本机 `应用文写作指导` 项目（绝对路径仅 owner 机可读，
CI/远程不可依赖）；DEV 所需字段语义已全部落在本文件与 plan，无需外读。

## 2. 交互形态（owner 实点四案原型后拍板，B2 中选）

- **B2 框内翻页**：讲评态下答题框（`pi-writing-answer-box`）放大成解析
  区，框内一次只住一块，三块横向翻页——顶部页签（① 审题卡 / ② 范文·
  标志 / ③ 亮点）+ 底部胶囊小点点 + 横滑/拖拽/←→ 键；320ms ease-out
  滑动、框高随当前块过渡；范文以信件形态写进框里（Dear…Yours 之间）；
  标志讲解条内嵌对应卡格内容（跨页不用翻回）。
- 落选：A 题下展开、B 整框一次全装、C 右栏基线。
- **入口双手势都留**：点答题框本身、写作卡右上「解析」钮均可开；Esc 收起。
- **右栏保留，显组级概览**，不收起（避免跨题型滚动布局跳动）。
- 拍板件（含中选/落选就地标注）：本目录 `prototype.html`（快照自
  `design/applied-writing-lecture-prototype/index.html`）。

## 3. schema 处置与存量（数据契约级）

**v1 内增量可选字段，不升 v2**（同壳护住 16 组续写数据，零迁移；
`persistWritingAnalysisGroup` 按组 merge，重产一卷换一组）：

（2026-07-21 已被 §6 新 shape 取代）
```
writing.reviewCard = {
  genre: string             // 判型
  readerWant: string        // 读者·最想要的一句话
  readerChecklist: string[] // 读者·落纸清单
  tense: string             // 主时态
  points: string[]          // 要点编号
  value: string             // 价值落点
}
writing.reviewMarks = [   // 1–5 条
  { grid: 'genre'|'readerWant'|'tense'|'points'|'readerChecklist',
    text: string,          // 锚句，必须是 modelAnswer 子串（照抄 highlightExpressions 文本锚）
    note: string }         // 一句讲解
]
```

- 屏显字模映射在渲染层出：判→genre、读→readerWant、时→tense、
  点→points、清→readerChecklist；价值落点格无标志（真源如此，标志只有
  五种）。
- **「挂出必有卡」两道门**：①产线 `validateWritingAnalysisCandidate`
  application 分支硬 gate（六格全非空；标志 1–5 条、grid 枚举、text 子串
  校验）；②前端渲染门——application 组无 `reviewCard` → 视同
  unavailable（「解析未发布」）。这道门即旧解析下架机制。
- **存量 22 组 application 解析 = 全套重产**（owner 拍板：范文也按审题
  卡工艺重写，不是补块）；过渡期旧解析下架，重做完一卷挂一卷。本刀带
  2–3 卷试点重产；其余 ~20 组走 wayfinder 票 06（独立于本刀）。
  16 组 continuation 数据原地不动。

## 4. 实现落点（侦察结论，全文见 `implementation-survey.md`）

- **宿主层 overlay，零契约触碰**：答题框本就住 `WritingPaperPage` chrome
  层，不在 PaperSurface 里；仿七选五衔接高亮覆盖层先例。不进 pageModel
  （会撞 `verify-analysis-layering.mjs` 零解析残留断言）。
- **四通道天然隔离**：打印/PDF/DOCX/学生版走服务端独立管线，从不渲
  React 树；唯一门控 `lectureOpen &&` 条件渲染。红线：不加 `PaperBlock`
  kind、不动两个服务端渲染器。
- **讲评态卷面是连续流**，放大无分页风险。
- 写作卷面现完全不可点，双手势全新接线，复用 `selectLectureQuestion`
  兜底分支，不动 PaperSurface intent 协议。

## 5. 本刀两个小板（PM 拍板 2026-07-20，CR 复核）

1. **白名单收账走「新类名，全批留续写刀」**：内嵌解析区用新类名
   `pi-writing-review-*`，不复用 13 个 HOOK_ONLY 白名单类。理由：B2
   信框内翻页的 DOM/样式形态与右栏面板完全不同，复用共用类会把无设计
   意图的 CSS 顺手穿到续写右栏面板（未经 QA 的半成品样式），且 8 出
   5 留使账目跨两刀纠缠。共用 8 类仍由 continuation 分支持有且零 CSS，
   stale 断言不触发；白名单本刀零变动，全批账留续写渲染刀。
2. **右栏组级概览瘦身为纯指引**：`WritingAnalysisPanel` 的 application
   全量渲染分支不再进右栏——概览只显组级标题 + 状态/指引（有卡：「解析
   在卷面答题框中打开」可点开；无卡：「解析未发布」）。理由：B2 已把
   全量解析搬进卷面，右栏再渲全量是重复（负空间纪律）；共用类仍由
   continuation 分支持有，不产死类。陷阱备忘：`pi-writing-section` 靠
   卷面同名类巧合过 verify 子串检查，动类名时别误伤。

## 6. Owner QA 拍板（2026-07-21，DP-3 首轮返工）

owner 对 DP-2 首轮实现验收后要求返工，逐条拍板如下（全部照做，不做别的）：

1. **审题卡改课堂通用真卡四节**：原 §1/§3 的六格（判型/读者两档变焦/
   主时态/要点编号/价值落点）作废，改为按 owner 课堂真卡四节重排——
   「基础五定」（文体/话题/读者/人称/主时态/判型，六个 label+值）、
   「圈要点、编号」（①②…，1–5 条）、「读者三问」（读者是谁？/他最关心
   什么？/他要什么具体信息？）、「价值落点」（一句话）。讲评态显填好版
   （值直接渲数据，非空态可点交互）。四节标题用小绿字。
2. **判型写详细**：`reviewCard.type` 不再是单字判型代号，要求写详细
   （如「描述类（邀请）」「描述类」），可带括注说明子类。
3. **范文页显性标志去掉，点开才解释**：句上的〔判〕〔读〕〔时〕〔点〕
   〔清〕字模按钮与图例/legend 全部删除。锚句本身可点，affordance 仅
   一条极淡虚线下划线（muted 绿，低调），无其他视觉标记。点锚句 → 在
   该句所在段落下方就地展开讲解条（note + 对应卡格内容，grid→卡格映射
   改为 type→判型、tense→主时态、points→圈要点、cares→他最关心什么、
   wants→他要什么具体信息）；再点或点别处收起。数据层 `reviewMarks`
   结构本身不变（text/note 仍为 modelAnswer 归一化子串锚点），只是屏显
   不再暴露字模。
4. **选中/激活一律不变色**：锚句激活态不加任何背景色（唯一允许的激活
   指示是虚线↔实线下划线切换）；讲解条 `.pi-writing-review-marknote`
   底色从 `#faf7f0` 改白底（保留绿色左边线）；`.pi-writing-answer-box
   --clickable:hover` 从 `#fbfaf6` 改中性 `rgba(0,0,0,0.03)`；卡页六格
   的「卡↔文互指亮格」交互（原 `.pi-writing-review-cell--hot`）随四节
   重构一并撤除——卡页不再随范文页 activeMark 变色。
5. **§3 的 `reviewCard` 新 shape 定本**（取代 §3 代码块原六格 shape，
   schema 仍 v1、不升版）：

   ```
   writing.reviewCard = {
     form: string         // 基础五定·文体
     topic: string        // 基础五定·话题
     reader: string        // 基础五定·读者
     person: string        // 基础五定·人称
     tense: string          // 基础五定·主时态
     type: string           // 基础五定·判型（写详细，可带括注）
     points: string[]       // 圈要点、编号（①②…，1–5 条）
     readerWho: string      // 读者三问·读者是谁
     readerCares: string    // 读者三问·他最关心什么
     readerWants: string    // 读者三问·他要什么具体信息
     value: string          // 价值落点（一句话）
   }
   writing.reviewMarks[].grid: 'type' | 'tense' | 'points' | 'cares' | 'wants'
   ```

   两道「挂出必有卡」门同步改口：①`validateWritingAnalysisCandidate`
   application 分支硬 gate 改为 11 字段全非空校验（`points` 额外校验
   1–5 条非空字符串）+ `reviewMarks` grid 枚举改新五值；②前端渲染门
   （无 `reviewCard` → unavailable）判定逻辑不变，只是字段形状换了。

6. **两卷试点数据重灌**（paper-2022-i / paper-2024-i 的 application
   组）：`modelAnswer` / `highlightExpressions` 不动，`reviewMarks` 保留
   原 text/note、grid 按映射改写，`reviewCard` 整体替换为 owner 提供的
   课堂参考卡原文，走真产线 `runVocabGate` + `validateWritingAnalysisCandidate`
   + `persistWritingAnalysisGroup` 重新落盘（不手改 JSON）。

## 7. Owner QA 拍板（2026-07-21，DP-3 二轮「不合格」返工）

Owner 携两张截图判二轮 QA 不合格，四点拍板（commit `692be4c` +
右栏一笔）：

1. **选中彻底不变色（中性色也不要）**——收紧 §6.4：锚句激活连
   「虚线↔实线」切换也撤掉，样式恒定，点开与否只由讲解条的出现/消失
   表达。页签/锚句的 UA 蓝色 focus ring 同判（截图实锤），换品牌色
   细虚线且仅 `:focus-visible` 出现。
2. **范文按信件排版**——「格式不符合信件格式，太难看」根因：锚句
   `<button>` 的 UA `inline-block + text-align:center` 把每个锚句打成
   独立居中块，整封信碎掉。改行内流（`display:inline` +
   `text-align:inherit`），并按信件成形：称呼顶格、正文段首行缩进
   2em、结尾敬语+署名（末两行）右对齐（与卷面答题框 givenBottom 同
   惯例）。
3. **句子跳动 = bug 实锤**——hover 预览就地插入讲解条把文字顶开→
   鼠标脱离锚句→收起→再 hover 的抖动循环。删除 hover 预览整条通道，
   讲解条只认 click（§6.3「点开」语义收严为唯一入口）。
4. **右栏常驻审题卡**（owner 四选一拍板，取代 §5 小板 2 的「右栏只留
   一句指引」）：解析在讲评态下右栏固定渲染填好版审题卡四节（复用
   框内 renderCard，窄栏基础五定降 2 列），底部一行小字指引范文/亮点
   在卷面框内看；未发布卷右栏与 B2 同显「解析未发布」。落选档：讲解
   条镜像放大 / 右栏收起卷面加宽 / 常驻亮点表达。
