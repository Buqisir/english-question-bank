# applied-writing-lecture · Fresh CR（冷读 diff）

**Verdict: APPROVE**（无 Must Fix；4 条 Should Watch 交 PO / wayfinder 票 06）

Reviewer: fresh Opus，未参与实现。Baseline `main...HEAD`（fdfd868 / abaf2f3 /
e419ddb），worktree `/Users/huangxuewei/Projects/wt-applied-writing-lecture`，分支
`applied-writing-lecture`。

---

## Changed Scope

10 文件，全部落在 plan D1–D7 允许集：

- `schemas/paper-import/writing-analysis-v1.schema.json`（D1）
- `app/src/domain/paperAsset.ts`（D1 TS 镜像）
- `server/writing-analysis/writingAnalysisBackfillService.mjs`（D2 gate + persist 投影）
- `app/src/features/paper-browse/PaperBrowsePage.tsx`（D3 下架门 / D4 接线 / D5 右栏瘦身）
- `app/src/features/paper-browse/WritingAnswerBoxReview.tsx`（新增，D4 B2 carousel）
- `app/src/features/paper-intelligence/WritingPaperPage.tsx`（D4 宿主接线）
- `app/src/features/paper-intelligence/writingPaperPage.css`（D4 样式，全新类名）
- `scripts/verify-restart3-teacher-analysis.mjs`（D6 §6 gate 单测）
- `docs/cuts/applied-writing-lecture/qa/dp2-applied-writing-lecture.mjs`（D6 DP-2）
- `app/public/paper-assets/paper-2022-i/latest/analyses/writing-analysis-v1.json`（D7 试点）

**Forbidden 面零触碰（从 diff 文件表自证，非报告转述）**：`PaperSurface.tsx`、
`writingPageModel.mjs`/`PaperBlock` 联合、`print-renderer.mjs`、`docxRenderer.mjs`、
`verify-lecture-panel-css.mjs` 白名单、`pi-writing-continuation-*` 类、16 组续写数据
——均不在 diff 中。schema 仍是 v1，无迁移脚本。

---

## PA-lite 降档复核（plan 头部四条）——仍成立

1. **纯增量可选字段、零迁移**：`reviewCard`/`reviewMarks` 不进 schema `required`
   （schema:54-91），continuation 的 `if/then`（:93-99）未动；旧 22 组无字段的文件
   照常 parse，D3 门把它们判 `unavailable`（不是报错）。✅
2. **字段语义 owner 拍板**：TS 类型（paperAsset.ts:251-273）、gate（backfill:302-360）、
   渲染层字模映射（WritingAnswerBoxReview.tsx:44-59）三处与 decisions.md §3 逐字一致
   （grid 五值、价值落点无标志）。✅
3. **交互原型拍板**：B2 形态，三页签 + 点点 + 横滑/拖拽/←→ + 两级 Esc，对齐 prototype。✅
4. **落点零契约触碰**：见 Forbidden 复核 + 自评盲点②。✅

降档理由未被 diff 推翻，PA-lite 作为唯一 gate 成立。

---

## Findings

### Must Fix
无。

### Should Watch（不阻塞本次 merge）

- **SW1 · gate↔渲染归一化口径不一致（喂票 06）**。产线硬 gate 用
  `normalizeForSubstring`（backfill:44-51，折叠所有空白含换行、弯引号/破折号归一）
  判 `reviewMarks[].text` 是 `modelAnswer` 子串；前端 `renderLineWithMarks` 却用
  **原样** `line.indexOf(mark.text)` 在按 `\n` 切开的每一行内匹配（WritingAnswerBoxReview.tsx:286）。
  后果：一条 mark 若跨换行、或标点与 modelAnswer 原文形态不同，**能过 gate 却在范文页
  静默不渲染**——违背 decisions.md §2 验收口诀「范文每个标志指得回一格」，且无任何报错。
  当前 paper-2022-i 五条 mark 均为单行原样子串（已逐条核对，正常渲染），本次不触发。
  但 wayfinder 票 06 批量重产前应对齐两处口径（或把 gate 收紧为「行内原样子串」），
  否则口径漂移会随作者标点习惯零星漏标志。不阻塞本刀。
- **SW2 · 拖拽无 pointer capture / cancel 兜底**（WritingAnswerBoxReview.tsx:125-142）。
  未 `setPointerCapture`、无 `onPointerCancel/Leave`；指针在 viewport 外松开时
  `handlePointerUp` 不触发 → `dragRef` 卡住 + track 残留 inline transform，直到下次交互。
  与 prototype 行为持平（原型亦无 capture），纯 UX 毛刺；DP-2 未覆盖拖拽路径。
- **SW3 · onWheel 的 preventDefault 可能是 no-op**（WritingAnswerBoxReview.tsx:121）。
  React 把 wheel 作为 root 上的 passive 监听挂载，`event.preventDefault()` 大概率无效
  + 控制台告警，横向 wheel 翻页时底层页面可能仍滚动。翻页本身（`go()`）不受影响。
  DP-2 未覆盖 wheel。
- **SW4 · Esc 处理器新增 INPUT/TEXTAREA early-return（交 PO）**（PaperBrowsePage.tsx:421）。
  这条改了讲评栏**既有** Esc 语义：以前焦点在输入框时 Esc 会关讲评栏，现在什么都不做。
  多半是刻意（不劫持输入框 Esc），但属于超出写作范围的既有行为变更，请 PO 确认可接受。

### Nice-to-have
- D4 锚点实现为 `data-pi-writing-answerbox`（WritingPaperPage.tsx:98），plan 措辞是
  `data-paper-*`；且该属性无任何 selector 引用（DP-2 走 class）。命名偏差 + 近乎死属性，
  无害。

---

## DEV 自评盲点六条 · 逐条结论

1. **paperAsset.ts 属 D1 范围？** 成立。这是 schema 的 TS 镜像，追加两个可选字段
   （additive、`?` 可选），不加它则消费方 TSX 无法通过类型检查——必要伴随件，非范围蔓延。
2. **B2 就地渲染 vs overlay 违背拍板本意？** 未违背。拍板本意（decisions.md §4）=
   「不进 PaperSurface / pageModel」，实现两者都零触碰，review 内容作为 prop 传进
   `WritingPaperPage` chrome 层就地渲染，自然高度、无几何计算——比 overlay 更简且无新风险。
   四通道隔离仍成立：`WritingAnswerBoxReview` 仅被 `PaperBrowsePage`（SPA）import，门控
   `lectureOpen && taskType==='application'`，服务端渲染器不 import 它。裁：可接受，是更优选择。
3. **§6 gate 单测放对文件 / 强度？** 是。测在 `verify-restart3`（已注册 verify-ci.mjs:74），
   `throwsOn` 真调 `validateWritingAnalysisCandidate`（非字符串匹配），覆盖缺卡 / 空格 /
   缺 marks / 超 5 条 / grid 越枚举 / text 非子串 + 正样例七例。gate 若被削弱这些会红。强度够。
4. **D7 单卷 fixture 走真产线 + 过硬 gate？** 是。`writing-analysis-driver.mjs:160-161`
   先 `validateWritingAnalysisCandidate` 再 `persistWritingAnalysisGroup`，persist 的
   `analysis.reviewCard.genre` 无独立兜底但被 validate 前置保护。committed 种子五条 mark
   逐条核对为单行原样子串、六格全非空，能过 gate 也能正常渲染。
5. **两级 Esc 语义。** 与 decisions.md §2「双手势开、Esc 收」+ prototype 一致：先收 B2、
   再关讲评栏。行为等价成立。附带的 INPUT/TEXTAREA early-return 是既有语义变更 → 见 SW4，
   已标 PO。
6. **lockedMarkIndex/hoverMarkIndex 双槽 vs 原型逐字移植。** 行为等价：`activeMarkIndex =
   locked ?? hover`（:93），click 锁定并再点同一个取消（:199），hover 仅在无锁定时预览
   （:197-198）——镜像 prototype `wireMarks()`。等价。

---

## Verification Evidence（CR 亲跑，非抄报告）

- `node scripts/verify-restart3-teacher-analysis.mjs` → **137 passed, 0 failed**；§6 七条
  gate 断言全绿且真调产线函数。
- `node scripts/verify-lecture-panel-css.mjs` → **all checks passed**；`HOOK_ONLY allowlist
  is not stale` 通过 → 自证小板 1：全新类名、白名单零变动、无死类。
- `npx tsc --noEmit`（app/）→ **exit 0**。
- `verify-restart3` 已在 `scripts/verify-ci.mjs:74` 注册 → 新 gate 真在 CI 跑，非手跑才绿。
- 新增 CSS 选择器全部 `pi-writing-review-*` 或 `pi-writing-answer-box--*` 修饰类；无白名单类
  复用，未碰 `pi-writing-section`。
- schema `reviewCard`/`reviewMarks` 不在 `required`，`grid` enum 五值与 `REVIEW_GRIDS`
  （backfill:28）及 TS `ReviewGrid`（paperAsset.ts:265）三方一致。

## Failure / Attack Angle

最可能的漏网路径是 **SW1**：gate 的「归一化子串」比前端「行内原样子串」宽松，未来重产者写
一条跨行或标点微异的 mark，会拿到「产线通过、卷面静默缺标志」的假绿——恰好绕过本刀「挂出必有
卡 / 每个标志指得回一格」的核心契约，且没有任何断言或报错拦得住（DP-2 只验现有种子的 ≥1 条 mark
渲染，不验「gate 接受的都能渲染」）。本刀数据不触发，但票 06 批量重产是它的引信。次要面为 SW3
的 passive wheel（功能降级非数据错）。四通道泄漏路径已被架构堵死（服务端渲染器不 import React 组件、
`lectureOpen` 门控、schema 无 v2/迁移），无导出侧攻击面。

## Residual Risk

低。数据契约纯增量、旧数据零影响、Forbidden 零触碰、gate 在 CI 强制、种子逐条核对。残留集中在
未来重产阶段的 gate↔渲染口径（SW1）与两处未被 DP-2 覆盖的手势降级（SW2/SW3），均不阻塞本次 merge。

## Recommendation

**APPROVE** — 无 Must Fix。SW1 请在 wayfinder 票 06 批量重产开工前处理；SW4 交 owner PO 确认。
