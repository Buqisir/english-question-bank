# similar-rail — 讲评栏「配相似」UI（E2，主打功能第二刀）

- Cut line: medium; schema/contract: no（只读消费 E1 API）; PA-lite 理由：
  纯前端 UI 层，可逆，形态已经 owner 原型拍板（program Q6，
  `docs/cuts/similar-questions/prototype.html`）。CR 复核降级。
- 来源：program `docs/cuts/similar-questions/program.md` Q6 + E1 CR 两条
  硬交接（`docs/cuts/similar-engine/cr.md` SW-1/SW-2/SW-3）。
- 落点决策（对 program"讲评/解析面板"措辞的收窄，CR 请注意）：按钮落
  **讲评栏宿主 wrapper**（PaperBrowsePage `renderLectureAnalysisPanel`
  之下），**不进五个共享面板组件**——面板同时被老解析页 harness 复用，
  该宿主无草稿卷上下文且在退役轨道；独立解析页不加入口。详情页/
  concierge 归 E3。

## 已拍板设计（原型 + CR 交接的工程化）

1. **入口**：讲评栏当前题（`lectureSelection.questionId`）的解析下方
   「🔁 配相似」CTA（按原型：说明短语+墨绿主按钮）。无选中题时不渲染。
2. **右栏视图态**：讲评栏 body 新增一层态 `'analysis' | 'similar'`
   （现状只有开/合开关，无视图栈——本刀新增）。「← 返回解析」回切；
   Esc 关栏、把手、窄屏抽屉行为全部照旧。
3. **结果列表**（按 prototype.html）：种子行（题号+题型+配方一句话+
   已排除本卷）；结果卡=标题/来源行/reason chips/复选框，勾选墨绿亮边
   （teal-50 底+teal 边）；底栏=计数+「加入草稿卷」主按钮+toast；
   尾注=池子诚实（`poolStats`："库内同考点还剩 N 组"）。
4. **CR 硬交接处置**：
   - SW-1：**恒真 reason 不渲染**——UI 按 reason.kind 白名单渲染，
     体裁/discourse 类 kind（当前数据恒真）不进 chips；引擎响应照收
     不改（数据修复后放开）。
   - SW-2：`matchedQuestionIds` 可空——空集时 chips 退化为组级理由，
     不渲染"含 N 题"计数。
   - SW-3：thin 候选（`questionGroupById` 无卡）→ 复选框禁用 +
     title 提示「该卷未入库存，暂不能加入」；不隐藏（池子诚实）。
5. **加入草稿卷**：复用 `App.addGroupsToBasket` 乐观翻转链路
   （PaperBrowsePage 已持有全套 props，预期 App.tsx 零改动；确需最小
   接线时改动限一处并在汇报中说明）。加入成功 toast 后勾选清空，
   列表不关闭（可继续勾）。
6. **请求纪律**：相似请求仅在点击 CTA 时发（无预取）；loading 态在
   栏内；错误走 `errorMessageFromResponse` 统一文案+重试按钮。

## Scope

白名单：
- `app/src/services/similarQuestions.ts`（新建：`fetchSimilarQuestions`，
  plain fetch + cookie 鉴权，惯例同 draftPapers.ts）
- `app/src/domain/questionBank.ts`（响应类型，additive）
- `app/src/features/paper-browse/PaperBrowsePage.tsx`（CTA/视图态/接线）
- `app/src/features/paper-browse/paperBrowsePage.css`
- `app/src/features/paper-browse/SimilarQuestionsRailView.tsx`（新建，
  结果列表组件；样式并入 paperBrowsePage.css）
- `scripts/verify-paper-browse.mjs`（轻断言：视图态互斥/恒真 kind
  白名单/禁用态逻辑）

Forbidden：`paper-intelligence/**`（五共享面板+harness 零触碰）、
`server/**`（E1 契约已定，引擎零改动）、`question-detail/**`、
`concierge/**`（均 E3）、`draft-paper/**`、`App.tsx`（除第 5 条例外）。

## 不变量

讲评态既有交互零回归：点题联动/scrollspy/URL 契约（lecture/questionId
深链）/Esc/窄屏抽屉/显影层高亮。挑题态零解析请求、零相似请求。
剪刀线/选区罩（scissor-select-feel）零触碰。

## 验收（Playwright 全链路 + verify）

1. 讲评态选中一题 → CTA 出现 → 点击 → loading → 结果列表（种子行/
   reason chips/池子尾注）；恒真体裁 chip **不出现**（断言）。
2. 勾选 2 项 → 底栏「已选 2 篇」→ 加入草稿卷 → toast + draft chip 计数
   +2（乐观态即时）→ 勾选已清、列表仍在 → 返回解析回到原面板。
3. thin 候选（若真库存在）禁用态；不存在则构造断言逻辑层。
4. matchedQuestionIds 空集渲染不崩（组级理由退化）。
5. 深链 `lecture=1&questionId=…` 进入后直接点 CTA 可用；窄屏抽屉内
   全链路可用。
6. `node scripts/verify-paper-browse.mjs`、`npx tsc --noEmit`、
   `npm run verify:all` 真实退出码全绿。
7. QA 截图入 `docs/cuts/similar-rail/qa/`。
