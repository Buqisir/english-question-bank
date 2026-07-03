# Cut: ai-key-server-fallback — 服务端 key 兜底接通思考模式（器官移植第一刀·缩刃版）

cut size: medium; touches schema, data contract, product boundary, or teaching
interpretation: server API surface +1 只读端点（无 schema/DB 变更）；product
boundary = AI 检索从「手填 key 才可用」变为「服务端有 key 即默认可用」。

Status: plan committed, awaiting PA → PM compression → DEV.

## 背景（audit P0-1 残留 + P1-3）

体检结论：服务端 `.env` 有 `DEEPSEEK_API_KEY`，且 server 侧**全线已有**
`apiKey || DEEPSEEK_API_KEY` 兜底（steward / semantic-search / verify /
parse 都有，见下「链路事实」）。真正断点在前端：
`conciergeSearch.ts` `runConciergeSearch` 见 `!apiKey`（用户手填 key）就直接
走本地弱链路，根本不调 server。老师没在经典模式顶栏填过 key，就永远吃不到
思考模式（AI 真链路）。

叠加缺陷：steward 超时 6s（`DEFAULT_STEWARD_TIMEOUT_MS = 6000`），而思考
模式是 2 次**串行** DeepSeek 调用（plan → semantic-search），6s 几乎必超 →
静默回落本地，老师以为 AI 没用。

## 链路事实（2026-07-03 Explore 实核，file:line 当日为准）

- 前端 key：`App.tsx:873` `aiApiKey` state ⇌ `localStorage['ai-api-key']`；
  唯一输入 UI 在经典模式顶栏 `App.tsx:3322-3352`；AI 模式复用同一 state，
  无输入口。
- 思考模式调用链：`conciergeSearch.ts:1029` `runConciergeSearch` →（有 key
  时）`questionGroups.ts:746-761` `askQuestionBankSteward` → POST
  `/api/ai/question-bank-steward`（`server/ai-proxy/routes.mjs`）→
  `questionBankStewardService.mjs:397-431`（2 次串行 DeepSeek，兜底
  `:357/:406`）。前端**不直连** DeepSeek。
- server 兜底已存在：`server/api.mjs:2833` 读 env 注入 serverContext；
  steward/semantic/verify/parse 各服务 `apiKey || DEEPSEEK_API_KEY`。
- `.env` 在仓库根（`server/.env` 不存在）。
- 无 key 时前端文案：「没填 AI 密钥，先用本地题库帮你找。」
  （`conciergeSearch.ts:1054-1066`，fallbackReason `missing-api-key`）。

## 目标行为（契约）

1. **新端点** `GET /api/ai/status` → `{ serverKeyAvailable: boolean }`。
   - 加在 `server/ai-proxy/routes.mjs`（照现有 defineRoute 样板）；
     `serverContext` 注入 `Boolean(DEEPSEEK_API_KEY)`（api.mjs 顶层常量已
     有）。**绝不返回 key 本身或其任何片段。**
2. **前端闸门改判**：`runConciergeSearch` 的本地回退条件从 `!apiKey` 改为
   `!apiKey && !serverKeyAvailable`。`serverKeyAvailable` 为新增可选输入
   （`ConciergeSearchInput.serverKeyAvailable?: boolean`，缺省 false =
   现行为，向后兼容）。无手填 key 但 server 有 key 时照常调
   `doStewardCall`，apiKey 传空串（server 端 `||` 兜底接住）。
3. **状态获取**：`useConciergeDesk` mount 时 fetch 一次 `/api/ai/status`
   （新小模块 `app/src/services/aiStatus.ts`，走 `apiPath()`），存 state，
   传入 `runConciergeSearch`。fetch 失败/未返回前视为 `false`（现行为，
   诚实降级；本地 API 通常 ms 级返回，竞态可接受，不做 loading 门）。
4. **超时改实**：默认 `DEFAULT_STEWARD_TIMEOUT_MS` 6000 → 20000；
   thinkingMode 时 60000。`input.stewardTimeoutMs` 显式传入仍最高优先
   （测试用）。loading 态已有（「取题中…」/「正在为「X」找题…」），
   不新增 UI。
5. **顺手修**（同一调用点）：`useConciergeDesk.ts` `runSearch` 的
   useCallback 依赖数组补漏掉的 `input.thinkingMode`（现为陈旧闭包）。
6. **文案不动**：「没填 AI 密钥…」等三态诚实文案保持原样（现在只在
   双侧都无 key 时出现，语义仍真）；不改 UI 结构。

## Out of scope（边界——与上线路线图/器官移植的切线）

- **不移** Key 配置 UI 出经典模式（上线后 server 持 key 是主形态，用户手填
  key 会退化为 override；现在搬 UI 大概率白做——留给器官移植/上线路线图）。
- 不动经典模式各按钮的 key 闸（打标/校验/解析仍要求手填 key——它们在
  经典模式内，随器官移植处置）。
- 不动 AI 导题固定 server-key 的不一致（记录在案即可）。
- 不做 key 的多用户/配额/鉴权（上线路线图 L 刀）。
- 不动 `semanticSearchService.mjs:410` 的 thinking=off 日志 drift。
- 不动 PaperSurface/domain/schema/Adapter（契约文件零接触）。

## 验证计划

- 新 `scripts/verify-ai-server-key-fallback.mjs`（hermetic，禁 git show）：
  - conciergeSearch 闸门矩阵：无 key 无 server → local
    `missing-api-key`；无 key 有 server → 调 doStewardCall（apiKey=''）；
    有 key → 调 doStewardCall（不回归）；steward 报错 → `api-error`
    回退（不回归）。
  - 超时选择：default 20000 / thinking 60000 / 显式 stewardTimeoutMs 优先。
  - `/api/ai/status` 路由：注入 fake context 断言返回形状 + 布尔值跟随
    context，且响应体不含 key 字符串。
- **新脚本同刀挂进 `scripts/verify-ci.mjs` + `scripts/README.md` 登记**
  （2026-07-03 CI 事故硬规则）。
- 既有相邻脚本回归：`verify-c6a10-concierge-local-search.mjs`、
  `verify-restart1-local-search-intent.mjs`、`verify-concierge-desk.mjs`。
- 合并前全量 `pnpm -C app run verify:all` 或等 PR CI 绿（RM 闸）。

## 浏览器 QA（主 agent 亲自，不可让渡）

1. 清 `localStorage['ai-api-key']`，AI 模式搜自然语言（thinking off）→
   应走 steward（server 兜底），不出现「没填 AI 密钥」；server 日志见
   steward 调用。
2. thinking on 重搜 → loading 可见、不被 6s 掐死、返回 steward 结果。
3. 杀 API 进程重试 → 「管家暂时没连上…」诚实回退（刀⑧ QA 手法）。
4. 经典模式顶栏填假 key → 行为不回归（fake key 会被 server 优先使用而
   报错 → api-error 回退，属既有语义，确认文案诚实即可）。

## 风险与已知取舍

- **产品默认变化**：server 有 key 时，所有 AI 模式搜索默认吃 owner 的
  DeepSeek 余额（v4-flash，2 调用/次，量=单机单人，成本极低）。可逆；
  战报向 owner 明示，他可一票否决。
- 60s thinking 超时上限内老师盯 loading：已有 loading 文案；超时后诚实
  回退。若 QA 中体感差，CR/QA 可议下调。
- status 端点竞态（mount fetch 未返回就搜）：降级为现行为，无害。

## PA Follow-Up Decisions

（PA 后由 PM 压缩回填）
