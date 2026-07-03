# M0-5 — AI 全局日限额 · CR 报告

- Cut: `cut/m0-5-ai-daily-limit` (PR #241)
- Baseline: `main@35ac884`
- Reviewer: 小川 (routine CR-lite, effort high), fresh session, reviewer ≠ implementer
- Verdict: **APPROVE** — 0 Must Fix

## Changed Scope

冷读 `git diff main...cut/m0-5-ai-daily-limit`（工作树 clean，无未提交改动）。13 文件：

- 服务端：`server/ai-providers/dailyLimitCounter.mjs`（新，120 行）、
  `server/ai-providers/completionRunner.mjs`（+38，单点闸）、
  `server/ai-proxy/routes.mjs`（+65，429 翻译 + status 扩展）、
  `server/api.mjs`（+22，counter 装配 + env 覆盖）
- 前端：`app/src/services/aiStatus.ts`（返回值 boolean → `AiStatus` 对象）、
  `app/src/services/questionGroups.ts`（`AiDailyLimitExceededError`）、
  `app/src/App.tsx`（verify 两处专门文案）、`concierge/conciergeSearch.ts`（C5 新分支）、
  `concierge/useConciergeDesk.ts`（探针传参）
- 验证：`scripts/verify-ai-daily-limit.mjs`（新，309 行）+ 登记进 `verify-ci.mjs` + `README.md`
- 文档：`plan.md`

Forbidden 列表核对（从 diff 文件名 + 增行内容，不采信报告口径）：
- DB schema / 迁移 / `user_version`：**零命中**
- `chatCompletions.mjs` / `deepseek.mjs`：**未触碰**
- per-user 配额 / token 计量 / 报表：无
- 权限门（ownerOnly）：未改，三个 `/api/ai/*` 仍 member-reachable（限额存在的前提）
- summary / topic-labels 前端：未碰（经同一 runner 自动被计数，服务端行为即足够）

## PA 降级复核（流程调优②）

降级理由：纯加性、无 schema、可整体回滚。**独立判断成立**：

- 无 DB schema / 迁移 / `user_version`（已从 diff 证实）。
- 既有 API 语义未改：三端点未触顶时逐字节不变（新增全在 `try/catch` 的
  catch 分支或 `if (dailyLimit)` 加性分支内）；`/api/ai/status` 的
  `dailyLimit` 字段是加性，旧只读 `serverKeyAvailable` 的消费方不受影响。
- 计数器是 `server/logs/ai-daily-usage.json` 易失文件，可整体删除；回滚 =
  revert 一个 PR。
- 本刀**未**触碰任何不可逆面。降级站得住，不构成 Must Fix。

## 硬契约 C1–C10 落点核对（file:line）

- **C1 单点计数**：`completionRunner.mjs:300-324` — `isDeepSeekCall` 判定
  后单点 gate；`callLocalQwenCompletion` 分支永不进 gate。✅
- **C2 只拦 server key**：`completionRunner.mjs:317`
  `usingServerKey = Boolean(DEEPSEEK_API_KEY) && context.apiKey === DEEPSEEK_API_KEY`。
  偏离已复核（见下）。手填 key（`sk-teacher-own-key` ≠ 环境 key）触顶后照常 200 —
  verify 断言 2 端到端证实。✅
- **C3 触顶 → 429**：`dailyLimitCounter.mjs:19-25`（类型化错误 + code +
  statusCode）；`routes.mjs:15-19`（`isAiDailyLimitError`）在三端点各自
  `catch` 内翻 429，绝不落进顶层 500。✅ 传播路径独立核对见下。
- **C4 status 扩展**：`routes.mjs:37-51` 加性输出 `dailyLimit:{limit,used,exceeded}`；
  `api.mjs` `serverContext.getAiDailyLimitStatus`。不泄漏 key。✅
- **C5 前端搜索类降级**：`conciergeSearch.ts:1144-1161` 新分支
  `!apiKey && dailyLimitExceeded` → `rankByKeywords` + `fallbackReason:'daily-limit-exceeded'`
  + 专门文案；排在 `missing-api-key`(1130) 之后，三条文案可区分。✅
- **C6 verify 按钮专门文案**：`questionGroups.ts:456-466`（429+code →
  `AiDailyLimitExceededError`）；`App.tsx:2422-2429` + `2482-2489`（两条 verify 链路都改）。✅
- **C7 fail-soft 持久化**：`dailyLimitCounter.mjs:37-59` 读写全包 try/catch，
  损坏/缺失从 0 起。✅
- **C8 跨日归零**：`beijingDayKey`（UTC+8）+ `rollDayIfNeeded`；verify 断言 5
  用 2000-01-01/count:100 快照证实归零到 1（非 101）。✅
- **C9 行为断言 verify**：`scripts/verify-ai-daily-limit.mjs` 起真服 + mock
  DeepSeek + 真 HTTP，五条全覆盖，已登记 verify-ci + README。**CR 重跑
  20/20 通过**（非采信报告数字）。✅
- **C10 零回归**：`pnpm -C app run verify:all` **CR 重跑 65 PASS / 0 FAIL**；
  concierge-desk 246/246 未回归；user-scope 50/50。未新增用户表查询（M0-4 gate 满足）。✅

## 两个偏离的独立风险复核

### 偏离 1 — C2 key 判定改用 `context.apiKey === DEEPSEEK_API_KEY` 恒等比较

理由成立且已从代码证实：5 个服务在 runner 之前均已 `String(apiKey || DEEPSEEK_API_KEY).trim()`
合并 key（`semanticSearchService.mjs:415`、`questionBankStewardService.mjs:413/357`、
verifyQuestionGroupService），到 runner 时 `context.apiKey` 恒为非空串，
`describeKeySource` 会一律判 'client'、永不触发 gate。恒等比较是合并后唯一可用信号。

失败面 = 假阴（漏计），非假阳（错拦真 key）：老师若恰好粘贴了与服务器完全相同的
key，会被误计入服务器配额 —— 概率可忽略，且最坏是少量误计，绝不会错误拦下真实老师 key。
可接受。见 Should Watch-1（trim 口径）为唯一残留观察点。

### 偏离 2 — `DEEPSEEK_API_URL` + 快照路径新增 env 可覆盖

`api.mjs:3011` `DEEPSEEK_API_URL = process.env.DEEPSEEK_API_URL || 真实端点`；
`api.mjs` 快照路径同理 `AI_DAILY_USAGE_SNAPSHOT_PATH || server/logs/...`。

SSRF/exfil 面判断：**不构成新攻击面**。该 URL 仅在模块加载时从 env 读一次，
运行时无任何请求体/query 能影响它（`completionRunner.mjs:117` 直接用常量）。要
"改向"必须已能设置服务器 env —— 即已占有单机自有服务器，超出本产品威胁模型。
且与既有 `LOCAL_QWEN_CHAT_API_URL` env 覆盖约定同构。生产不设该 env。可接受。

## 重点风险面结论

- **计数竞态**：`isExceeded()` 与 `increment()`（runner:319/322）背靠背同步调用，
  之间无 `await`；首个 `await` 在 line 327（真正出站）之后。单进程 Node 事件循环
  只在 await/IO 处切换 —— check-then-act **原子无缝隙**。确认无竞态。
- **steward 双出站计数**：plan 出站 +1，semantic 出站 +1，半途触顶时第二次
  `isExceeded` 抛错直穿到路由 → 429。plan 里"落进现有 catch 降级"的描述与实际
  代码不符（steward 服务对两处 runner 调用均**无** try/catch），但真实行为更干净
  （直接 429），非缺陷。
- **429 传播不被吞**：独立核对 `semanticSearchService.mjs:383-395` 的 try 仅带
  `finally`（关 DB）无 catch，runner 调用（:428）在 try 块之后；
  `questionBankStewardService.mjs` 对 :362 / :437 两处调用均无 catch。类型化错误
  从 runner 直穿服务层到路由层，路由 catch 只翻 429、其余 `throw error` 原样上抛。
  无误翻、无漏翻、无中途吞。
- **前端 fail-soft**：`aiStatus.ts` 返回结构变更仅 `useConciergeDesk` 一个消费方，
  已改齐；override 类型 `typeof fetchAiStatus` 强制新形状，无残留 boolean 调用方；
  JSON 解析用 `data.dailyLimit?.exceeded === true` 宽松处理，缺字段安全退 false。
- **快照 I/O 频率**：每次出站一次 `writeFileSync`（同步小 JSON）。单机部署、日限
  ~500 次量级，可接受；非高频路径。
- **M0-4 Follow-up Gate**：diff 增行无任何用户表 SQL，零命中，自动满足。

## Findings

### Must Fix

无。

### Should Watch（记录，不阻塞本刀）

- **SW-1（trim 口径）**：runner 比较 `context.apiKey === DEEPSEEK_API_KEY`，
  而服务层传入的是 `String(apiKey || DEEPSEEK_API_KEY).trim()`。若 `.env` 里
  `DEEPSEEK_API_KEY` 带首尾空白，`trim()` 后 ≠ 原始值 → 服务器 key 调用会被判为
  非服务器 key → 静默不计数/不受限。owner 的真实 key 无空白则无影响。未来若加
  env 校验可顺手 `.trim()` 归一。不阻塞。
- **SW-2（plan 文字与代码不符）**：plan §"参考实现" 称 steward 半途触顶会落进
  "现有 catch 降级分支"，但 steward 服务实际无此 catch，触顶直接 429。行为正确，
  仅 plan 描述滞后，记录以免后续 agent 被误导。

### Follow-up Gate

- 无新增。M0-4 用户隔离 gate 本刀已自动满足（零用户表查询新增）。

## Self-Review Blind Spots

- **浏览器 QA 未做**：本 CR 只验证服务端行为 + 前端类型/分支逻辑。C5 通知条
  真实渲染（`.concierge-notice` 文案是否落到该组件、`fallbackReason:'daily-limit-exceeded'`
  下游是否有专门样式分支）、C6 verify 按钮文案的真实显示，**需 PO/QA 在真库点一遍**。
  代码逻辑正确不等于视觉正确。
- **真实 DeepSeek 计数口径**：verify 用 mock DeepSeek，每次 fetch 计一次成立。但
  runner 内 `callDeepSeekWithFallback` 若含**重试**（`DEEPSEEK_HTTP_RETRY_COUNT`），
  一次逻辑调用可能多次 fetch —— 而 `increment()` 只在 gate 处每逻辑调用 +1，**不**
  随底层重试翻倍。这符合 PM "每次出站 HTTP +1" 的**逻辑**口径（PM 拍板 #1 措辞
  为"每次 DeepSeek 出站 HTTP 调用"，严格字面下重试也算出站）。我判定按逻辑调用计
  数是合理解读且更符合成本意图，但这是我的解读，非 plan 明文 —— 若 owner 认为重试
  也应计数，需澄清。当前实现不阻塞。
- **0=不限 语义**：`resolveDailyLimit` 把 `0` 视为不限但照常计数，verify 未专门
  覆盖 limit=0 分支（仅覆盖 limit=2/500）。逻辑简单（`isExceeded` 里 `resolvedLimit===0
  return false`），风险低，但无断言。

## Failure / Attack Angle

- **假绿角度**：若 verify 的 mock DeepSeek 从未被真正命中，429 断言可能是空转。
  已排除 —— 断言 1 有 `mock.callCount === 2`（触顶第 3 次不命中）、断言 2 有
  `callCount === 3`（手填 key 命中），mock 命中数被显式钉住，证明真走了出站路径。
- **stale fallback 角度**：旧的 boolean `fetchAiStatus` 若仍被某处消费，会静默错读。
  已排除 —— 全仓仅 `useConciergeDesk` 一个消费方，且 override 类型强制新形状。
- **未来 agent 误用**：`DEEPSEEK_API_URL` env 覆盖若被后续 agent 当成"可任意配置的
  代理入口"扩用，可能扩大攻击面。当前仅测试用途，注释已写明"Production always uses
  the real URL"。记录，非本刀问题。

## Residual Risk

低。服务端逻辑经真 HTTP + mock 端到端验证（20/20），全套 65/65 无回归，Forbidden
零触碰，PA 降级成立。残留在于前端视觉未经浏览器 QA（见 Blind Spots），以及 SW-1
的 trim 口径边角。均不阻塞合并。

## Recommendation

**APPROVE**（0 Must Fix）。建议合并前由 PO/QA 在真库点一遍 C5 通知条与 C6 verify
按钮文案的真实渲染（本刀 user-visible，按 review-levels L3 宜有一次 QA），但代码
契约层无阻塞项。
