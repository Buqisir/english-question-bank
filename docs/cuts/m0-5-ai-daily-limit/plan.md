# M0-5 — AI 全局日限额（DEV 执行契约）

Cut size: medium；touches schema/data contract/product boundary/teaching
interpretation: **no**（纯加性，无 DB schema 变更，无迁移）。

**PA 降级理由（流程调优②，CR 必须复核此段）**：本刀不触碰任何不可逆
面——不改 DB schema、不改既有 API 语义（只加 429 分支与 status 字段）、
计数器是易失文件可整体删除回滚。错了回头成本 = revert 一个 PR。故不设
正式 PA，直接 plan → DEV → CR。

上游依据：`docs/cuts/launch-roadmap/roadmap.md` 决策 #5——统一 server
key + 全局日限额，触顶自动降级本地搜索；**不做 per-user 配额**。

## PM 拍板（本 plan 的裁决记录）

1. **口径 = 请求次数**：每次 DeepSeek 出站 HTTP 调用 +1（steward 一次
   搜索含 planning + semantic 两次出站就计 2，如实反映成本）。不按
   token（usage 现在未解析，作后续迭代）。
2. **只计 server key**：`keySource.source === 'env'` 的调用才计数、才受
   限。老师手填 key 的请求不计数、永不被拦。
3. **存储 = 内存计数 + 写穿 JSON 快照**，不进 SQLite（不动
   user_version 锚点；日计数是易失数据，文件形态够用且可整体删除）。
4. **日界 = 北京时间自然日**（UTC+8）。仓库现有日期逻辑全是 UTC，不可
   直接复用 `toISOString().slice(0,10)`。
5. **限额默认 500 次/日**，`.env` 可调（`AI_DAILY_REQUEST_LIMIT`）。

## 硬契约（不得偏离；偏离 = CR 打回）

- C1 **单点计数**：限额判断与计数必须发生在
  `server/ai-providers/completionRunner.mjs` 的 DeepSeek 出站单点
  （`callDeepSeekWithFallback` 入口或 `callDeepSeekCompletion` 发起
  fetch 之前），不得在 5 个服务层各自散装实现。本地 Qwen 分支
  （`callLocalQwenCompletion`）不计数、不受限。
- C2 **只拦 server key**：判断依据必须是「本次调用的 key 来源是 env」。
  现状 5 个服务在 completionRunner 之前就把
  `apiKey || DEEPSEEK_API_KEY` 合并掉了，runner 内已有
  `describeKeySource(apiKey)`（completionRunner.mjs:85，client/env 判
  别）——沿这个信号走。手填 key 请求在触顶后必须照常成功。
- C3 **触顶 = 类型化错误 → HTTP 429**：触顶时出站调用不得发出；抛可识
  别错误（错误 code 字符串 `ai-daily-limit-exceeded`），三个
  `/api/ai/*` POST 路由把它翻成 **429** + JSON 体（含该 code 与人话
  message）。绝不能把 429 混进现有 500 泛化错误。
- C4 **status 端点扩展**：`GET /api/ai/status` 响应在
  `serverKeyAvailable` 之外新增
  `dailyLimit: { limit, used, exceeded }`（数字、数字、布尔）。不泄漏
  key 任何片段（沿用现有 MF-3 纪律）。
- C5 **前端搜索类降级**：找题/管家链路在「无手填 key 且（server key 不
  可用 或 已触顶）」时走**现有**本地关键词降级路径
  （`rankByKeywords`），并用**现有**通知条（`.concierge-notice`）显示
  专门文案（人话，说明今日 AI 额度用完、已改用本地找题、明天恢复）。
  文案必须与「没填密钥」「管家没连上」两条现有文案可区分。
- C6 **verify 按钮专门文案**：verify-question-group 无本地兜底；前端
  `handleVerifyQuestionGroup` 收到 429/该 code 时显示专门错误文案（额
  度用完 + 可自己填 key 继续），不得显示泛化「验证失败」。
- C7 **计数器持久化 fail-soft**：快照文件读写失败不得影响 AI 主流程
  （try/catch 吞掉，沿 verify-audit.log 先例哲学）；文件损坏/缺失时从
  0 开始。文件放 `server/logs/`（懒建目录）。
- C8 **跨日归零**：日界按北京时间；跨日后首次请求自动归零重计。
- C9 **行为断言 verify**（流程调优⑤）：新增
  `scripts/verify-ai-daily-limit.mjs`，起服打真 API 断言（不是源码正则
  断言），登记进 `scripts/README.md` 并加入 `scripts/verify-ci.mjs`
  （housekeeping guard 会查）。最少覆盖：
  1. 限额设小（env 注入）→ 连打 semantic-search 至触顶 → 断言 429 +
     code；
  2. 触顶后带手填 key 的请求不被拦（mock fetchImpl，沿现有
     verify-h5h/h5i 的 mock 套路）；
  3. `/api/ai/status` 返回 dailyLimit 三字段且 exceeded 翻转；
  4. 快照文件写入 + 重启进程后 used 读回不丢；
  5. 伪造昨日 dayKey 的快照 → 请求后归零重计。
- C10 **既有行为零回归**：未触顶时三端点行为逐字节不变；
  `pnpm -C app run verify:all` 全绿。本刀不新增任何用户表查询
  （M0-4 Follow-up Gate 自动满足——DEV 若发现需要查用户表，停下来上
  报，不得自行加）。

## 参考实现（可偏离，偏离须在完成报告里说明）

- 计数器模块建议独立小文件（如
  `server/ai-providers/dailyLimitCounter.mjs`）：
  `{ dayKey, count }` 内存态；`increment()` 同步 +1 后写穿
  `server/logs/ai-daily-usage.json`；`isExceeded()`；启动懒读回。
  单进程 Node 同步递增，无并发问题。
- 北京日界工具：`new Date(Date.now() + 8*3600e3).toISOString().slice(0,10)`。
- `usingServerKey` 信号传递：runner 内 `describeKeySource` 已在算
  client/env，判断放 runner 内即可，不必改 5 个服务的签名。
- 限额读取：`process.env.AI_DAILY_REQUEST_LIMIT`，非法/缺失回落 500；
  `0` 视为不限（本地开发方便）。计数照常进行（status 好看真实用量），
  只是不拦。
- 前端 `aiStatus.ts` 的 `fetchAiStatus()` 返回值从 boolean 改为小对象
  `{ serverKeyAvailable, dailyLimitExceeded }`；调用方（找题/管家入
  口）随之传参。fail-soft 语义保持：拿不到 status 时视为
  `{ false, false }`。
- steward 半途触顶（第 1 次出站过、第 2 次被拦）会落进现有 catch 降级
  分支——可接受；若能识别 429 换专门文案更好，不强求。
- 通知条文案建议：「今天的 AI 额度用完了，先用本地题库帮你找，明天自动
  恢复。」verify 文案建议：「今天的 AI 额度用完了。可以在设置里填自己
  的 API Key 继续使用 AI 解析。」
- `.env.example` 若存在则补 `AI_DAILY_REQUEST_LIMIT` 注释行。

## Forbidden（本刀不碰）

- 任何 DB schema / 迁移 / user_version。
- per-user 配额、token 计量、用量报表。
- `server/ai-providers/chatCompletions.mjs` / `deepseek.mjs`（未接入的
  平行传输路径，死代码，不顺手改）。
- 经典模式、权限门（ownerOnly 划分维持现状——三个 /api/ai/* 保持
  member-reachable，这正是限额存在的理由）。
- summary / topic-labels 两条 AI 链路的**前端**（它们经同一 runner 自
  动被计数/被拦，服务端行为即足够；owner-only 工具的 UI 文案不做）。

## 验收

1. `node scripts/verify-ai-daily-limit.mjs` 绿（C9 五条全覆盖）。
2. `pnpm -C app run verify:all` 绿。
3. 完成报告列：changed files、每条硬契约的落点（file:line）、参考实现
   偏离清单、C9 五断言的输出摘要。
