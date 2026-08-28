# 小导师调用缝与部署

Status: done
Claim: wayfinder-session-2026-08-13
Blocked by: None（`01` / `02` 已关闭）
Type: grilling
Map: `docs/cuts/deeptutor-integration/wayfinder/map.md`

## Premise change（票 02）

不再代理港大 FastAPI，也不另购 DeepTutor 专用机。缝是 eqbank.cc 浏览器
→ EQB server 上的小导师循环（DeepSeek，走现有 `completionRunner` 出站
单点）。港大 1.5.12 只留本机对照。

## Question

本票定调用缝与试点/转正部署，写进 spec：

1. **会话存在哪**：v1 只活在这次侧栏打开（关页即丢），还是写入
   `user-data` 可重开？记忆在 v1 是空位，持久会话不等于记忆。
2. **流式**：现有 DeepSeek 缝全是整段 JSON，仓库里没有 AI SSE。v1 先
   整段返回，流式后置？还是第一期就开流式？
3. **降级**：循环失败、日限额 429（全局、非 per-user、默认 500 次/日、
   只计 server key）、超时。侧栏如何表现？不得静默改走无工具闲聊。
4. **部署**：薄循环跑在现有 EQB server（`eqb-hk-1` 2C2G 装不下港大引擎，
   但跑得了薄循环）。试点是否先只本机，上生产另需 owner 授权？Mac 上的
   港大 DeepTutor 是否保留作对照机（只对照 chat 循环 / `prompt_blocks` /
   掌握状态机，Quiz 与前端不对照）？

事实（已查，不必再问）：

- AI 出站已有日限额与 429 文案「今天的 AI 额度用完了，明天自动恢复。」
- 浏览器只见 eqbank.cc：凭据留 server，与现有 `/api/ai/*` 同一纪律。
- 生产变更仍须 owner 当次授权；本票只定 spec 里的路线，不改生产。

## Resolution 记录

2026-08-13 grilling，owner 确认（按推荐）：

- **会话**：关侧栏/关页即丢，不写 `user-data`。记忆 v1 是空位，不做持久
  会话。
- **流式**：v1 整段返回；流式后置。
- **降级**：明确错误（额度用完 / 暂时无法回答），已在场题组还在；不改成
  无工具闲聊。限额走现有全局日限额（默认 500、只计 server key、非
  per-user）。
- **部署**：实现先本机；spec 写「转正跑 EQB server」。上生产另需 owner
  授权。Mac 港大 DeepTutor 1.5.12 留作对照机（只对照循环 /
  `prompt_blocks` / 掌握状态机）。
