# Plan — AI 搜索加 thinking 可选开关（保持 Flash；不碰经典模式）

## Cut Size
**small**（用户可见的搜索行为 + 多层参数穿透）。schema/contract = no。1 session + CR-lite；无单独 PA（PA-lite 见下）。

## Objective
AI 模式的自然语言搜索（题库管家 / concierge steward）现在**写死 Flash + thinkingMode=false**。给它一个**可选的 thinking 开关**：开 = steward 的 DeepSeek 调用启用思考；关 = 现状（非思考）。**模型仍是 Flash**（owner: Flash 够了）。开关放 **AI 模式**，**经典模式一律不碰**（owner 迟早删它）。

## Code Reality (verified)
- 前端服务 `askQuestionBankSteward(message, apiKey)`（`app/src/services/questionGroups.ts:795`）请求体里**写死** `model:'deepseek-v4-flash'`、`thinkingMode:false`。
- `conciergeSearch.ts`：`doStewardCall(message, apiKey)` 两参；`runConciergeSearch(input)` 的 input 无 thinkingMode。
- `useConciergeDesk.ts`：search 路径调 runConciergeSearch，无 thinking。
- 后端路由 `api.mjs:10973`：`questionBankStewardSearch(input.message||input.query, input.apiKey, input.requestId)`——**丢掉了 input.thinkingMode**。
- `questionBankStewardSearch(query, apiKey, requestId)`（`api.mjs:10172`）内部：`planQuestionBankStewardSearch(query, key, requestId)` + `semanticSearchQuestionGroups(semanticQuery, key, id)`；两者**都没收 thinkingMode**；响应里 `thinkingMode:false` 写死。DeepSeek 选项构造在 `buildDeepSeekRequestOptions({...thinkingMode})`（`api.mjs:6278`，已支持）。
- 已有 `aiThinkingMode` state（`App.tsx:1064`，localStorage `'ai-thinking-mode'`，默认关）——**复用它**当搜索的 thinking 源（它本来给解析/导题用、在经典模式露出；经典要删，AI 模式补一个开关绑同一 state 即可）。

## Must Do
### 后端：把 thinkingMode 穿到 steward 的 DeepSeek 调用
- 路由 `api.mjs:10973`：传 `input.thinkingMode === true` 给 `questionBankStewardSearch(...)`。
- `questionBankStewardSearch(query, apiKey, requestId, thinkingMode = false)`：传给 `planQuestionBankStewardSearch(query, key, requestId, thinkingMode)` 与 `semanticSearchQuestionGroups(semanticQuery, key, id, thinkingMode)`；响应元数据 `thinkingMode: thinkingMode`（两处：clarification 分支 + 正常分支）。
- `planQuestionBankStewardSearch` / `semanticSearchQuestionGroups`：加 `thinkingMode` 形参，传入其 `buildDeepSeekRequestOptions`/DeepSeek 调用（model 保持各自现状=Flash，不改 model）。
- **模型不变**：只穿 thinkingMode，不动 model 默认。

### 前端：开关 + 参数穿透
- 服务 `askQuestionBankSteward(message, apiKey, thinkingMode = false)`：请求体 `thinkingMode` 用入参（`model` 仍 `'deepseek-v4-flash'`）。
- `conciergeSearch.ts`：`ConciergeSearchInput` 加 `thinkingMode?`，`doStewardCall(message, apiKey, thinkingMode)` 传下去（默认 false，回退路径不受影响）。
- `useConciergeDesk.ts`：入参加 `thinkingMode`，search 时带上。
- `App.tsx`：把 `aiThinkingMode` 传进 `useConciergeDesk`；在 **AI 模式 concierge 面**加一个 thinking 开关（复用现有 checkbox/switch 样式，绑 `aiThinkingMode`/`setAiThinkingMode` + 写 localStorage）。
- **ConciergeDesk.tsx**：渲染该开关（label 如「思考模式」/「推理」），靠近搜索框；**零配色改动**。

## Forbidden
- **不碰经典模式**任何 UI/逻辑（owner 迟早删）。
- **不改 model**（保持 Flash）；不改配色 token/hex。
- 不动回填 / cut A/B 代码；不动其它 AI 动作（解析/导题）的 thinking 行为。
- 不提交 `.env` / `app/public/paper-assets/**` / `.claude/launch.json`；禁止 `git add -A`。

## Verification
- 新 `scripts/verify-search-thinking-toggle.mjs`：源码断言——服务 `askQuestionBankSteward` 第三参 thinkingMode 进请求体（不再写死 false）；`questionBankStewardSearch` 形参含 thinkingMode 且传给 plan + semantic；steward 响应 thinkingMode 用变量。注册进 verify-ci + README。
- `node scripts/verify-search-thinking-toggle.mjs` 绿、`verify-ci` 绿、`npm run build --prefix app` 绿。
- 浏览器 QA（owner）：AI 模式出现 thinking 开关；开/关都能搜；开时搜索走思考（响应 thinkingMode=true / 延迟变长）。

## PA-lite notes
- 风险：steward 内部可能不止 plan+semantic 两处 DeepSeek 调用——DEV 要全量 grep `questionBankStewardSearch` 调用链里所有 DeepSeek/`buildDeepSeekRequestOptions` 点，确保都收到 thinkingMode（别漏一处导致"开了但没真思考"）。
- 风险：`aiThinkingMode` 复用——确认它不会因经典模式删除而丢（state 在 App 顶层、localStorage 持久，独立于经典 UI）。
