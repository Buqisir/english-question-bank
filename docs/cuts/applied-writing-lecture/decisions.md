# applied-writing-lecture · 已拍板决策（tracked 定本）

来源：wayfinder 地图 `.scratch/applied-writing-analysis/`（gitignored），
2026-07-20 四票 owner 逐项拍板。按 issue-tracker 纪律抄进 tracked 文件，
本文件是后续 agent 依赖的唯一定本。

## 1. 解析内容结构（讲评讲什么）

讲评流：审题 → 结构 → 范文 → 亮点（结构不单列，融进审题卡 + 范文标志）。
三块按讲评流排：

1. **审题卡六格**（照搬 owner 课堂通用审题卡，同术语）：判型／读者两档
   变焦（最想要的一句话 → 落纸清单）／主时态／要点编号／价值落点。
   —— 需新字段 `reviewCard`。
2. **范文 + 审题点标志**：范文全文（现有 `modelAnswer`）；句上打审题点
   标志〔判〕〔读〕〔时〕〔点〕〔清〕（每篇 1–5 个），点/悬停显对应卡格
   + 一句讲解。—— 需新字段 `reviewMarks`。
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
