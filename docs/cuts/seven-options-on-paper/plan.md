# seven-options-on-paper Plan — 七选五卷面渲染 A-G 选项池

## Cut Size

medium（owner 拍板，2026-07-08）。

Touches schema, data contract, product boundary, or teaching interpretation: yes —
`shared/papersurface/types.d.ts`（`PaperSurfaceProps` 新增字段）+
`app/src/shared-ui/papersurface/PaperSurface.tsx`（契约级文件，AGENTS.md 已
在本 cut 的派工文本里显式授权触碰其七选五渲染路径；`.claude/contract-unlock`
按 hook 约定临时创建，收工即删）。

## Objective

解析页（PI）左边卷面 + 整卷预览页，七选五题组当前只渲染带空正文，A-G 七个
候选句只活在右栏解析面板。owner 要求左边卷面在正文之后、从上往下正常渲染
A-G，纯展示、不参与任何交互，让卷面更接近真实高考卷排版。

## Locked Product Decisions

- 完全不参与交互：不可点击、无 `data-pi-*` / `data-paper-*` 锚点、不参与
  右栏联动。
- `optionBank` 为空/缺失时静默降级（不渲染该区块，不显示占位）。
- 排版跟随卷面现有 serif/字号/行距 token，不新造色值字号；版式语言参考
  导出面（DOCX 讲评版 `选项` 区块 + print-renderer 的 `.options-list`）
  ——单列、每项一行、`A. ` 前缀 + 正文。

## 硬契约（不得偏离；偏离 = CR 打回）

- C1 `PaperSurface` 收到非空 `optionBank` prop 时，在正文（所有 section）
  之后、原有的全局题目列表之前，渲染一个静态选项池区块：每项
  `<label>. <text>`，文档序（A→G）。
- C2 `optionBank` 为 `undefined` 或空数组时，不渲染该区块（无占位、无空
  容器）。
- C3 新区块不携带任何 `data-paper-*` / `data-pi-*` 锚点属性，不绑定
  `onClick`，不出现在 `onFocusIntent` 路径里。
- C4 解析页（`PaperIntelligencePaperSurfaceHarness.tsx`）与整卷预览页
  （`PaperBrowsePage.tsx`）两处 `<PaperSurface>` 挂载点，七选五题组都要
  喂上 `optionBank`（复用 `sevenChoicesSurfaceAdapter.ts` 已有的
  `model.options`，`{label, text, chain}` 结构结构兼容
  `PaperQuestionOption`，无需改 adapter 本身）。
- C5 其他题型（reading/cloze/grammarFill/writing）挂载点不传
  `optionBank`（或显式 `undefined`），渲染路径零变化。
- C6 详情页（`QuestionGroupDetailView.tsx`）不消费 `PaperSurface`（已核实
  ——该页有自己的渲染，不受本 cut 影响），不在本 cut 改动范围内。
- C7 右栏彩色标记 overlay（`pi-seven-clue-mark`，动态
  `getBoundingClientRect` 测位，只依赖 DOM 中在其之前的元素）不因新区块
  出现在正文*之后*而偏移——真机 QA 验证一条链的划线/标记位置。

## 侦察结论（为什么选这个缝）

- `PaperSurface.tsx`（`app/src/shared-ui/papersurface/PaperSurface.tsx`）
  是唯一同时被解析页 harness 与整卷预览页直接挂载的组件：
  - `PaperIntelligencePaperSurfaceHarness.tsx` 挂载一次（line ~1284）。
  - `PaperBrowsePage.tsx` 挂载一次，每题组一个 mount（line ~319）。
  - `QuestionGroupDetailView.tsx` **不**导入/挂载 `PaperSurface`（grep 确认
    零命中）——详情页有独立渲染路径，天然不受影响，标准
    `exam-paper-format-standards.md` §0「网站详情页语义完整即可、不要求
    仿真卷版式」的说法与代码事实一致。
  - 若改在 harness 层单题组视图渲染，整卷预览页（`PaperBrowsePage.tsx`
    直接挂 `<PaperSurface>`，不经过 harness 组件）不会继承，需要在两处
    分别写渲染逻辑，且未来两处排版会漂移。选 `PaperSurface` 缝可以让两个
    消费方零改动地继承同一套排版。
- 数据侧：`sevenChoicesSurfaceAdapter.ts` 的
  `buildSevenChoicesSurfaceModel` **已经**产出 `model.options:
  SevenChoicesOptionView[]`（`{label, text, chain}`），供右栏面板使用；
  `chain` 是右栏专属的解析链接，屏幕卷面新区块不需要它，但因为它是「多出
  的字段」而非缺字段，结构上兼容 `PaperQuestionOption`
  (`{label, text, translation?}`)，可以直接把 `model.options` 整个传给
  新 prop，不需要改 adapter、不需要新写一次 map。
- 单 mount = 单 section 的不变量：两个消费方（harness / PaperBrowsePage）
  的 `buildSevenChoicesSurfaceModel` 调用都只喂一个 `groupId`，产出的
  `textMap.paragraphs` 全部用同一个 section 常量（`'七选五'`）。因此新
  `optionBank` prop 放在 `PaperSurfaceProps` 顶层（不按 section 分桶）、
  在 `sections.map(...)` 循环结束后渲染一次，视觉上等价于「渲染在正文
  之后」，且不存在多 section 场景下重复渲染的风险（当前所有真实调用点都
  只有一个 section）。
- 导出面版式语言核对（真机跑 `buildPrintHtml` / 读 `docxRenderer.mjs`
  实测，非猜测）：
  - `server/print-renderer.mjs` 的 exam 密排样式对七选五每小题都重复输出
    整份 A-G（因为 `buildQuestionDetailsFromPaperAsset` 把
    `group.optionBank` 塞进每个小题自己的 `options`，且小题 `stem` 是
    题号本身导致命中非空 stem 分支）——是既有导出面行为，本 cut 不碰、
    不复刻这个重复。
  - `server/exports/docxRenderer.mjs` 的**讲评（handout）**样式对七选五
    有 `uniqueDocxOptions()` 去重 + 单独一个「选项」区块（passage 之后、
    5 个小题之前），单列、`A. ` 前缀——这是本 cut 抄的版式语言：单列、
    每项一行、字母句点前缀，不抄「选项」中文标题（screen 面没有这个惯例
    ，owner 需求也只提了 A-G 本身）。

## 参考实现（可偏离，偏离须在完成报告里说明）

- `shared/papersurface/types.d.ts`：`PaperSurfaceProps` 增加
  `readonly optionBank?: ReadonlyArray<PaperQuestionOption>`，紧跟在
  `questions` 字段后写注释说明「非 per-question，是一次性选项池，纯展示
  ，PaperSurface 不做任何交互绑定」。
- `PaperSurface.tsx`：
  - 顶层解构增加 `optionBank`。
  - 新增 `PaperSurfaceOptionBank({ options })` 函数组件，`<ol
    className="ps-option-bank">` + 每项 `<li className="ps-option-bank-
    item"><span className="ps-option-label">{label}.</span> <span
    className="ps-option-bank-text">{text}</span></li>`，无锚点属性、无
    onClick。
  - 在 `<article className="ps-page">` 内、`{sections.map(...)}` 之后、
    全局题目列表分支之前插入
    `{optionBank && optionBank.length > 0 && <PaperSurfaceOptionBank
    options={optionBank} />}`。
- `PaperSurface.css`：新增 `.ps-option-bank`（单列 flex，`padding-left`
  复用 `.ps-option-list` 现有的 22px 缩进值）、`.ps-option-bank-item`
  （复用 `--ps-font-size` / `--ps-line-height` token，`.ps-option-label`
  沿用既有加粗规则）。不新造颜色/字号字面量。
- `PaperBrowsePage.tsx` 的 `renderGroupBody`：
  `<PaperSurface ... optionBank={entry.kind === 'sevenChoices' ?
  entry.model.options : undefined} .../>`。
- `PaperIntelligencePaperSurfaceHarness.tsx` 的 `paperSurfaceEl`：
  `<PaperSurface ... optionBank={sevenChoicesModel?.options} .../>`。

## Forbidden

- `server/**`、`server/print-renderer.mjs`、`server/exports/**`（导出面
  一律不动）。
- `sevenChoicesSurfaceAdapter.ts` 内部逻辑（只读它已有的 `model.options`
  ，不改它的产出结构）。
- 其他题型（reading/cloze/grammarFill/writing）的渲染路径与 CSS 规则。
- `QuestionGroupDetailView.tsx`（未消费 PaperSurface，不在改动范围）。
- 已有的 anchor 协议 / focus intent 类型（`PaperSurfaceFocusIntent` 闭
  集不变）。
- `paper-assets/**` 数据本身、导入管线。

## Suggested Files

- `shared/papersurface/types.d.ts`
- `app/src/shared-ui/papersurface/PaperSurface.tsx`
- `app/src/shared-ui/papersurface/PaperSurface.css`
- `app/src/features/paper-browse/PaperBrowsePage.tsx`
- `app/src/features/paper-intelligence/PaperIntelligencePaperSurfaceHarness.tsx`
- `scripts/verify-paper-browse.mjs`

## Verification

- C1/C2/C3: `scripts/verify-paper-browse.mjs` 新增断言——
  - `PaperSurface.tsx` 源码：`optionBank` 出现在 props 解构 + 渲染条件
    `optionBank.length > 0`（正相关）；新区块 JSX 片段不包含
    `paperSurfaceAnchorAttrs` 调用、不包含 `onClick`。
  - 真实 fixture：`paper-2026-i` 的
    `content.groups['group-2026-i-seven-choices'].optionBank` 有 7 条
    A-G（证明「非空渲染」分支有真数据可触发）。
- C4/C5: `PaperBrowsePage.tsx` / `PaperIntelligencePaperSurfaceHarness.tsx`
  源码断言：`optionBank=` 出现在 `<PaperSurface` 调用里，且值来自
  `entry.model.options` / `sevenChoicesModel?.options`。
- C6: 源码断言 `QuestionGroupDetailView.tsx` 不 import `PaperSurface`
  （零命中）。
- 既有 86 项断言必须继续全绿（回归门槛）。
- `pnpm -C app run build`：TS 编译 + 生产构建必须干净（新 prop 结构
  兼容性由 tsc 把关）。
- 真机 QA（本 cut 唯一无法脚本化的契约 = C7）：见下表。

## Browser QA Matrix

| Case | Expected result |
| --- | --- |
| 解析页打开 paper-2026-i 七选五题组 | 左边正文后出现 A-G 七行，`A. `~`G. ` 前缀，字体/字号与正文一致 |
| 解析页展开一条链（点右栏任一 chain） | 正文内的信号高亮/标记位置不偏移，与改动前一致 |
| 整卷预览页打开 paper-2026-i，滚动到七选五题组 | 同样在正文后出现 A-G（因为共用同一个 PaperSurface 缝，应自动继承）|
| 其他题型（阅读/完形/语法填空/写作）任意打开一题 | 渲染与改动前逐像素一致，无 A-G 池残留 |

## DEV Readiness

- 全部步骤可立即开始，无前置阻塞。

## PA Follow-Up Decisions

不适用——medium 且非 schema/迁移/跨 cut 架构变更，owner 已在派工文本里
拍板方案方向，未走独立 PA 环节。
