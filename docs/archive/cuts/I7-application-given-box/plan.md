# I7-application-given-box Plan — 应用文给定上下格式：解析抓取 → 渲染进答题框

Last synced: 2026-05-31 after 阿澈 PM grill (data confirmed against 重庆巴蜀卷). Source of truth for DEV.
Open review items: data-contract + parsing-reliability → PA before DEV. Then DEV → CR-lite → QA → RM.

## Cut Size

Medium。

Touches schema, data contract, product boundary, or teaching interpretation: **yes**。
新增 `PaperWritingTask.applicationGiven?: { top: string[]; bottom: string[] }`（数据契约扩展，
延续 ADR 0007 写作契约）；改 server splitter 应用文解析。**因此 DEV 前需 PA**（数据契约 +
解析可靠性）。

## Objective

I6 把写作 section 渲染成 A4 真卷，但**应用文**的"给定上下格式/标题"（如重庆卷 `Dear Chris,…
Yours, / Li Hua`，或某卷给定标题 `Welcome to Join…`）被混在情境提示里、渲染在答题框上方。本 cut
让导入器**可靠地把给定骨架从情境里分出来**、存成结构化字段，并渲染进答题框框内（上贴顶、下贴底、
中间留白），对照 `docs/product/exam-paper-format-reference/images/page-11-writing-start.jpeg`。

## Locked Product Decisions (PM grill, PO 黄学伟 全过 2026-05-31)

- **检测规则（含 MF1 守卫）**：候选 = 应用文内容**末尾连续的"整行无 CJK 字符"的行**；但**只有命中下列
  正向信号之一**才认定为给定骨架，否则 **fail-safe：不抓、整段留在情境、空框**（宁可不抓也不删错）：
  ① 候选首行是称呼 `Dear` / `To` / `Hi` / `Hello`（行首、大小写不敏感）；**或**
  ② 候选里含结束语词（见下方词表）；**或**
  ③ 候选恰为**单独一行的标题型**（1 行、无句末标点 `.`/`!`/`?`）。
  行内英文夹注（如 `(Open Day)`）不影响——按"整行无 CJK"判，夹注在中文行内不算候选。
- **上下切分**：在给定骨架里，**结束语**行及其后 = `bottom`，之前 = `top`。结束语词表：
  `Yours` / `Sincerely` / `Best` / `Best wishes` / `Regards` / `Yours sincerely` /
  `Yours faithfully` / `Cheers`（大小写不敏感，行首匹配）。无结束语（标题型）→ 全 `top`、`bottom` 空。
- **数据契约**：`PaperWritingTask.applicationGiven?: { top: string[]; bottom: string[] }`。无给定骨架
  时**不设该字段**（保持空框）。给定行**从情境段落里移走**，不再在 prompt 区重复渲染。
- **渲染**：答题框模型统一为 `answerBox { label, givenTop: string[], givenBottom: string[] }`。
  `givenTop` 贴顶（每行下留书写空间）、`givenBottom` 贴底（`margin-top:auto`）。
  续写迁移到此结构：`givenTop = 两段开头句`、`givenBottom = []`（行为不变）。

## Deferred / 不做

- 续写答题框的渲染行为变化（仅做模型字段迁移，视觉不变）。
- 答题框书写区精确尺寸 / 分页；写作范文 / 解析渲染。
- 非应用文 section 的任何解析 / 渲染。

## Must Do

### Step 1 — splitter：切出 applicationGiven

- `server/paper-import-ai/docxSplitter.mjs` `extractApplicationParagraphs`：返回 `{ paragraphs(情境),
  applicationGiven: {top, bottom} | null, error }`。按 Locked「检测规则（含 MF1 守卫）」切候选末尾纯英文
  行——命中正向信号才抓、否则 fail-safe 不抓——再按结束语词表分 top/bottom。
- `applicationGroup` 带上 `applicationGiven`（无给定时为 null/不设）。
- verify（MF2，5 形态 + 守卫）：① 信件骨架（重庆型 top+bottom）；② 标题型（仅 top）；③ 无给定（空框、
  字段不设）；④ **负向守卫**：情境合法地以一行英文结尾（无称呼/无结束语/非标题）→ **不被吃**、留在情境；
  ⑤ 称呼型但**无结束语**的信件（仅 `Dear …` 开头）→ 仍按守卫①命中、全 top。并断言：命中时情境段落已
  剔除给定行、行内英文夹注（`(Open Day)`）不误判。

### Step 2 — 数据契约 + packageBuilder

- `app/src/domain/paperAsset.ts`：`PaperWritingTask` 加 `applicationGiven?: { top: string[]; bottom: string[] }`。
- `server/paper-import-ai/packageBuilder.mjs`：写 `writingTasks[appTaskId].applicationGiven = group.applicationGiven`；
  应用文 passage 仅由情境段落构成（给定行已不在 paragraphs 里）。`answerBox` 块不变（label）。
- C7 validator / schema 若校验 writingTasks 字段，确认新增可选字段通过。

### Step 3 — 渲染：answerBox givenTop/givenBottom

- `writingPageModel.mjs`(+`.d.ts`/`.d.mts`)：`answerBox` 模型改为 `{ label, givenTop, givenBottom }`。
  续写：`givenTop = continuationStarters`、`givenBottom = []`。应用文：从 `task.applicationGiven` 取
  `top`/`bottom`（无则都空）。
- `WritingPaperPage.tsx` + `writingPaperPage.css`：框内 `givenTop` 贴顶（每行下留白）、`givenBottom`
  贴底。续写视觉保持不变。
- 扩 `verify-i6-writing-render.mjs` 或新增 `verify-i7`：应用文框含 top/bottom、续写框迁移后行为不变。

## Forbidden

- reading / 七选五 / 完形 / 语法填空的解析与渲染：不碰。
- `shared-ui/papersurface/PaperSurface` 内核、`shared/papersurface/**`：不改。
- 续写解析（`extractContinuationContent`）：不改（仅渲染层模型字段迁移）。
- 导出 / 打印路径：不碰。
- harness reducer / 状态 / 数据获取 / URL / 跨组件同步：不改。

## Suggested Files

- `server/paper-import-ai/docxSplitter.mjs`（Step 1）
- `app/src/domain/paperAsset.ts`、`server/paper-import-ai/packageBuilder.mjs`（Step 2）
- `app/src/features/paper-intelligence/writingPageModel.mjs` + `.d.ts/.d.mts`、`WritingPaperPage.tsx`、
  `writingPaperPage.css`（Step 3）
- `scripts/verify-i7-application-given.mjs`（新）或扩 `verify-i6`，注册进 `verify-ci` + README。

## Verification

- Step 1: splitter verify（3 形态 + 情境剔除 + 夹注不误判）。
- Step 2: `node scripts/verify-ci.mjs` 含 C7 package/validator；app typecheck。
- Step 3: 渲染模型 verify（应用文 top/bottom、续写迁移行为不变）。
- 端到端 browser QA：用 `paper-960d0f8d/versions/v1/raw` 的重庆 docx 重新跑 splitter 产出新 asset，
  应用文答题框内见 `Dear Chris,/I'm Li Hua…` 贴顶、`Yours,/Li Hua` 贴底、中间留白；情境区不再有这些行。

## Browser QA Matrix

| Case | Expected result |
| --- | --- |
| 重庆应用文（信件型） | 框内：上 `Dear Chris,`+开头句、下 `Yours,`/`Li Hua`、中间留白；情境区无这些行 |
| 标题型应用文（如 page-11） | 框内：标题贴顶、无下、留白 |
| 无给定的应用文 | 空框（字段不设），情境完整 |
| 读后续写 | 与 I6 一致（两段开头句进框），视觉不变（回归） |

## DEV Readiness

- Step 1 可立即开始（规则已锁、重庆数据已核）。
- Step 2 依赖 Step 1 的 `applicationGiven`。
- Step 3 依赖 Step 2 的 task 字段。
- **PA 先于 DEV**（数据契约 + 解析可靠性）。

## PA Follow-Up Decisions

PA verdict: **APPROVE WITH MUST FIX** (3 Must Fix)。PA 逐行对重庆卷验证启发式可切出正确 top/bottom，
并查清数据契约安全（`paper-asset-v1.schema.json` 的 `writingTasks` 是裸 `object`、`stripUnknownFields`
不递归，新字段不会被剥；validator 只跑上传的分析包、不跑 packageBuilder 直接产出的 asset）——**不强制
改 schema**，plan 的"可选字段安全"措辞成立。

| PA item | `pa.md` required disposition | `plan.md` handling | Status |
| --- | --- | --- | --- |
| `MF1` 裸"末尾纯英文=给定"会误删情境合法英文行 | 加正向信号 + fail-safe 默认不抓 | 已折进 Locked「检测规则（含 MF1 守卫）」：称呼/结束语/标题型三选一，否则不抓留情境（PO 全过 2026-05-31） | RESOLVED |
| `MF2` 3 fixture 只证 happy path | 加负向守卫 + 称呼型/无结束语信件 fixture | Step 1 verify 扩为：信件型、标题型、无给定(空框)、**负向守卫(情境合法尾英文行不被吃)**、**称呼型/无结束语信件**；并断言情境剔除 + 夹注不误判 | RESOLVED |
| `MF3` 续写迁移会让 verify-i6 旧 `givenLines` 断言失效 | 重断言 `givenTop===starters & givenBottom===[]`、保留 starter 折叠、`.d.ts`+`.d.mts` 同步、禁续写走 applicationGiven | Step 3 + verify：续写迁移到 `givenTop`、`givenBottom=[]`、视觉不变；同步两份声明；续写**不**经 `applicationGiven` | RESOLVED |
