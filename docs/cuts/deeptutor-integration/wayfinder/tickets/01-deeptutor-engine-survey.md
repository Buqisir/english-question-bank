# DeepTutor 引擎实况调研

Status: done
Claim: wayfinder-charting-session-2026-08-12
Blocked by: None
Type: research
Map: `docs/cuts/deeptutor-integration/wayfinder/map.md`

## Question

只读主源（deeptutor.info 官方文档、GitHub 仓库源码/README/releases），回答
后续决定所依赖的引擎事实，写成
`docs/cuts/deeptutor-integration/research/deeptutor-engine-survey.md`：

1. **被后端驱动的接口**：HTTP/SSE API 与 CLI NDJSON 各自的能力面（会话
   管理、流式事件、`ask_user` 无 TTY 行为）、鉴权方式；哪条更适合 EQB
   server 代理调用。
2. **知识库喂数**：支持的文档格式与 ingest 粒度、增量更新/重建索引的代价、
   各检索引擎（LlamaIndex/GraphRAG/LightRAG/PageIndex/Obsidian）取舍；纯
   文本/Markdown 导出是否够用。
3. **MCP 路线**：它作为 MCP 客户端能否调用我们自建的「EQB 题库 MCP 服务」；
   MCP 工具在多用户/Partner 场景下的授权模型。
4. **多用户与隔离**：auth 开启后 per-user 工作区、memory 隔离、grant 模型，
   能否支撑「学生只读/受限访问」的形态。
5. **资源规格**：官方与社区的内存/CPU/磁盘要求（已知：建知识库 ≥4GB 空闲
   内存），给出「专用服务器最小规格」与「舒适规格」的建议，含 Docker 与
   源装两条路径。
6. **模型与中文**：DeepSeek（OpenAI 兼容）作为 LLM provider 的支持现状、
   embedding 选项、中文输出质量相关设置。
7. **许可与升级**：Apache 2.0 对我们的义务；版本迭代速度对集成面（API
   稳定性）的风险。

每条结论标注来源链接。不做安装、不写代码、不改本仓其他文件。

## Resolution

完整报告：[`../../research/deeptutor-engine-survey.md`](../../research/deeptutor-engine-survey.md)。要点：

1. **调用缝选 HTTP 面**：FastAPI 后端（:8001）有 OpenAPI 3.1 + JWT 鉴权；
   回合执行走 `WS /api/v1/ws`（`start_turn` → 流式事件 →
   `submit_user_reply` 回答 `ask_user`，支持取消/重生成/断线续订），另有
   SSE `execute-stream` 端点。CLI NDJSON 只适合试点脚本：进程内冷启动完整
   运行时，多用户下只操作 admin 工作区，不能当生产缝。官方 Agent Handoff
   文档与根 SKILL.md 明确支持被别的后端驱动。
2. **喂数**：Markdown/TXT 是一等格式，题库纯文本导出够用；`kb add` 按文档
   增量，重建写新 `version-N` 目录旧版保留；LlamaIndex 默认引擎开箱即用；
   PageIndex 是托管服务（数据出境），不建议默认用。
3. **MCP 可行但有关键约束**：支持 stdio/SSE/streamableHTTP；用户自配 MCP
   有 SSRF 防护（禁回环/私网），同机部署的 EQB 题库 MCP **必须 admin 在
   部署级 `mcp.json` 注册**；非 admin 用户 MCP 工具 deny-by-default 按
   工具名授权。
4. **多用户**：开 auth 后 per-user 工作区完全隔离、admin grants 白名单
   分配、API key 不下发、有审计日志；可支撑受限学生账号，但**无纯只读
   viewer 角色、无 per-user 用量配额**；PocketBase 必须留空。
5. **规格**：官方最低 4GB 空闲内存 + 2GB 磁盘，建 KB ≥4GB，MinerU 另需
   ≥20GB 磁盘。建议专用机最低 2 vCPU/4GB/20GB SSD、舒适 4 vCPU/8GB/40GB
   SSD；只发布 3782 端口，8001 留内网。现有 2 核/2GB 生产机确认装不下。
6. **模型与中文**：DeepSeek 是一等 LLM binding；embedding 需另选
   （SiliconFlow Qwen3-Embedding、DashScope、Jina 等 12 个 binding）；
   模型输出语言自 v1.5.10 是独立设置；UI 有完整中文本地化。
7. **许可与升级**：Apache 2.0 自托管+代理不产生开源义务；发版约每周
   2–3 个，`/api/v1` 有前缀但**无书面 API 稳定性承诺**——集成必须 pin
   版本，并以 `/openapi.json` 生成 typed client 做升级回归门。

**未能核实**（报告文末列明）：学生用量配额/限流机制；各 embedding 模型
中文效果；KB 重建定量耗时/费用；Docker 镜像体积与索引磁盘增长率；server
与 CLI 并发读写同一 `data/` 树的安全性。
