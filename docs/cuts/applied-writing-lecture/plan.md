# applied-writing-lecture · plan（DEV 执行契约）

**cut size: medium；touches schema: yes（v1 增量可选字段）、data
contract: yes（additive）、product boundary: no、teaching
interpretation: no。**

**PA 档位：PA-lite（降档理由，CR 须复核是否仍成立）**：①schema 为纯
增量可选字段，必填约束由产线硬 gate 承担，不改既有字段语义、零迁移；
②内容结构与字段语义已 owner 逐问拍板（grilling ×2 票）；③交互形态已
owner 实点四案原型逐裁点拍板（AGENTS 2026-07-12 法条：原型逐裁点拍板
的刀 formal PA 默认降 PA-lite）；④实现落点已三路侦察，方案零契约触碰。
PA-lite 发现即本 plan 与 `decisions.md` 的约束条目，不另立 pa.md。

决策定本见 `decisions.md`；落点侦察全文见 `implementation-survey.md`；
交互拍板件见 `prototype.html`（B2 中选，含落选档就地标注）。

## 目标

讲评态下应用文（writing 组 `taskType: 'application'`）解析以 B2 形态
进卷面：答题框放大成解析区，框内三块横向翻页（审题卡六格 / 范文·标志 /
亮点）；配套 schema 增量字段、产线硬 gate、前端下架门（旧 22 组停显）、
右栏概览瘦身，并带 2–3 卷试点重产供 QA/PO 验收。

## 施工内容

### D1 schema 增量（契约文件，须 contract-unlock）

- `schemas/paper-import/writing-analysis-v1.schema.json`：application
  分支加 `reviewCard` / `reviewMarks` **可选**定义（形状见
  `decisions.md` §3；有定义才能挡错形状）。不升 v2、不加迁移。

### D2 产线硬 gate

- `server/writing-analysis/writingAnalysisBackfillService.mjs`
  `validateWritingAnalysisCandidate` application 分支：六格全非空；
  reviewMarks 1–5 条、`grid` 枚举五值、`text` 必须为 modelAnswer 子串，
  违者 throw。

### D3 前端下架门

- application 组无 `reviewCard` → 视同 unavailable（「解析未发布」）。
  即旧 22 组解析即刻停显；数据文件不删（护住同壳续写组）。

### D4 B2 内嵌解析区（宿主层 overlay）

- `WritingPaperPage.tsx`：答题框加 1 个 `data-paper-*` 锚点（现无锚，
  非契约）；「解析」钮与点答题框手势的 DOM 接线。
- `PaperBrowsePage.tsx` + 新 hook（如 `useWritingAnswerBoxOverlay`）：
  仿七选五覆盖层先例在 `.paper-browse-content` scroller 内渲绝对定位
  解析区；`lectureOpen &&` 门控（照抄讲评栏同款）；选中链复用
  `selectLectureQuestion` 兜底分支，不动 PaperSurface intent 协议。
- 交互按 `prototype.html` B2 案 1:1：三页签 + 胶囊小点点 + 横滑/拖拽/
  ←→ 键翻页，320ms ease-out，框高随当前块过渡；范文信件形态；标志
  〔判〕〔读〕〔时〕〔点〕〔清〕点/悬停亮讲解条（内嵌对应卡格内容）；
  双手势开、Esc 收。
- 样式入 `paperBrowsePage.css`（或就近样式文件），**全部用新类名
  `pi-writing-review-*`**（小板 1）；解析数据沿用现有 lectureOpen 懒加
  载 fetch，把 writing analysis 接进 overlay。

### D5 右栏组级概览瘦身（小板 2）

- application 分支不再渲全量解析：概览 = 组级标题 + 状态/指引（有卡可
  点开卷面解析；无卡「解析未发布」）。continuation 分支原样保留。
  注意 `pi-writing-section` 巧合命中问题（decisions.md §5）。

### D6 verify / 断言

- `scripts/verify-restart3-teacher-analysis.mjs`：断言跟进 missing-card
  → unavailable 路径。
- DP-2 级行为 QA 脚本入档 `docs/cuts/applied-writing-lecture/qa/`
  （行为契约可执行形态，可重跑）。
- `verify-lecture-panel-css.mjs` 白名单**零变动**（小板 1 推论），
  verify:all 全绿即证。

### D7 试点重产 2–3 卷

- 从 22 组里按审题卡工艺全套重产 2–3 卷（含原型用的 paper-2022-i），
  过 D2 硬 gate + vocab gate，供浏览器 QA 与 owner DP-3 抽检。验收口诀
  见 `decisions.md` §1。其余 ~20 组不在本刀（wayfinder 票 06）。

## Forbidden（禁改面）

- `PaperSurface.tsx` 及 intent 协议（本刀零触碰；答题框在 chrome 层）。
- `writingPageModel.mjs` / `PaperBlock` 联合类型（不加 analysisPanel
  block）。
- `print-renderer.mjs` / `docxRenderer.mjs` / 导出管线（四通道隔离靠
  不碰它们；学生版屏蔽即由此保证 + lectureOpen 门控）。
- 16 组 continuation 数据、`pi-writing-continuation-*` 类、
  `verify-lecture-panel-css.mjs` 白名单。
- schema 升 v2 / 迁移脚本。

## 裁决点清单（PM 断点锚）

- [x] DP-1 plan + decisions + prototype 快照 commit，PA-lite 备案（本次）
- [ ] DP-2 DEV 完成 → 主代理复核：narrow verify + tsc + worktree 内
      `verify:all` 全绿；浏览器 QA（qa-local-owner 实点 B2 主路径）
- [ ] DP-3 owner PO QA（对照单如下）+ 试点卷抽检 gate（格↔句互指口诀）
- [ ] DP-4 merge → main CI 绿 → STATUS 收官（含 token 账单）→
      contract-unlock 移除 → wayfinder 票 06（其余 ~20 组重产）解锁

## Owner QA 对照单（DP-3，≤5 分钟）

1. 讲评态打开含应用文的卷 → 点答题框：框放大成解析区，先见审题卡六格。
2. 页签/小点点/横滑/←→ 均能翻三块；框高跟随；Esc 收起后卷面复原。
3. 范文页：点〔判〕〔读〕〔时〕〔点〕〔清〕任一标志 → 讲解条含对应卡格
   内容；试点卷内容过格↔句互指口诀。
4. 右栏写作组概览只显标题+指引，不再渲全量解析；未重产的卷显
   「解析未发布」（卷面与右栏一致）。
5. 同卷导出打印/PDF/DOCX/学生版：完全无解析痕迹。

## 派工与档位

- DEV：Sonnet / medium，单 worktree（D1–D7 一把刀，量在 medium 上限；
  若 DEV 途中判定 gnarly 再升 dev-hard，不预升）。契约文件 D1 由
  orchestrator 开工时 `touch .claude/contract-unlock` 解锁，DP-4 移除。
- CR：fresh Opus / high 冷读 diff（schema 触碰 + 用户可见交互，不降
  CR-lite）；CR 首查 PA-lite 降档理由是否仍成立。
- QA：主代理浏览器 QA（DP-2）+ owner PO QA（DP-3，附对照单）。
