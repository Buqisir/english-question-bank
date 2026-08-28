# DeepTutor 引擎实况调研（deeptutor-engine-survey）

调研日期：2026-08-12。主源：官方文档站 [deeptutor.info](https://deeptutor.info)、GitHub 仓库
[HKUDS/DeepTutor](https://github.com/HKUDS/DeepTutor)（README、源码 `main` 分支、releases、
CONTAINERIZATION.md、根 SKILL.md），以及旧版官方文档镜像
[hkuds-deeptutor-22.mintlify.app](https://hkuds-deeptutor-22.mintlify.app/troubleshooting/common-issues)。
调研时最新版本为 v1.5.11（2026-08-10）。每条结论附来源；标注「推断」的是本调研基于主源事实做的
工程判断，标注「未能核实」的是找不到主源依据的说法。

## TL;DR

- **接口**：DeepTutor 官方定位就是「被其他 agent/后端驱动」。给 EQB Node 后端代理，首选
  FastAPI HTTP 面（REST + WebSocket `/api/v1/ws` 流式回合 + 少量 SSE 端点），带 OpenAPI 3.1
  规范可生成 TS 客户端；CLI `--format json`（NDJSON）适合脚本试点，但每次调用都在进程内启动
  完整 Python 运行时，且多用户模式下 CLI 只操作 admin 工作区，不适合做长期服务缝。
- **喂数**：Markdown/纯文本是一等公民格式，题库导出成 MD/TXT 直接可用；`kb add` 支持按文档
  增量追加，重建索引写入新 `version-N` 目录、旧版本保留，不会中途毁掉可用索引。默认引擎
  LlamaIndex 开箱即用。
- **MCP**：DeepTutor 是成熟的 MCP 客户端（stdio/SSE/streamableHTTP），自建「EQB 题库 MCP 服务」
  完全可行；注意：跑在 localhost/内网的 MCP 服务必须由 **admin** 在部署级 `mcp.json` 注册
  （用户自配 MCP 有严格 SSRF 防护，禁止回环/内网地址）；多用户下非 admin 用户的 MCP 工具
  **默认全拒**，须逐个授权。
- **多用户**：开 auth 后每用户独立工作区（聊天/记忆/笔记/私有 KB），admin 通过 grants 白名单
  分配模型/KB/技能/工具，API key 永不下发；可以支撑「受限学生账号」，但没有纯只读浏览角色。
  PocketBase 集成只支持单用户，多用户部署必须留空。
- **生产机要多大**：官方最低要求 **4GB 空闲内存 + 2GB 空闲磁盘**（Python 3.11–3.13、Node 20+）；
  建 KB 是最耗内存操作，官方故障排查同样给 ≥4GB。现有 2 核/2GB 生产机**装不下**。
  推断建议：专用服务器**最低 2 vCPU / 4GB RAM / 20GB SSD**（Docker 单容器、只发布 3782 端口），
  **舒适 4 vCPU / 8GB RAM / 40GB SSD**；若启用 MinerU 解析再加 ≥20GB 磁盘。源装跑生产请用
  production build（v1.5.8 起默认），不要用 dev 模式。
- **模型与中文**：DeepSeek 是一等 LLM provider（`deepseek` binding）；DeepSeek 无 embedding，
  中英混合语料的现实选项是 SiliconFlow（Qwen3-Embedding）、阿里 DashScope、Jina、OpenAI 等；
  「模型输出语言」自 v1.5.10 起是独立设置（`interface.json: response_language`），UI 有完整中文
  本地化。
- **许可与升级**：Apache 2.0，自托管+后端代理不产生开源义务；发版节奏约每周 2 次，HTTP 面挂
  `/api/v1` 前缀并保留 legacy 端点，但**没有书面 API 稳定性承诺**——集成必须锁版本 + 升级回归。

---

## 1. 被后端驱动的接口

### HTTP 面（FastAPI，默认 :8001）

`deeptutor serve` 暴露 FastAPI 后端，完整 schema 可在运行时取 `GET /openapi.json`（OpenAPI 3.1）、
`/docs`（Swagger）、`/redoc`；官方文档直接给出用 `openapi-typescript` 生成 TS 客户端的命令。
（来源：[Server API](https://deeptutor.info/docs/cli/server-api/)）

- **回合执行**：统一 WebSocket `WS /api/v1/ws`（Web UI 同款），发送 `start_turn` 载荷
  （`content` / `capability` / `session_id` / `tools` / `knowledge_bases` / `language` / `config` /
  `notebook_references` / `history_references` / `attachments` / `skills`），流式返回与 CLI NDJSON
  同一事件族；客户端消息还支持 `subscribe_turn`、`subscribe_session`、`resume_from`、
  `cancel_turn`、`submit_user_reply`（用于回答 `ask_user`）、`regenerate`、`ping`。旧端点
  `WS /api/v1/chat` 仍在但官方建议新集成用 `/api/v1/ws`。
  （来源：[Server API](https://deeptutor.info/docs/cli/server-api/)）
- **SSE 端点**：`POST /api/v1/plugins/tools/{tool}/execute-stream`、
  `POST /api/v1/plugins/capabilities/{capability}/execute-stream`、
  `POST /api/v1/partners/{partner_id}/chat/execute-stream` 均以 `text/event-stream` 返回
  （源码：[plugins_api.py](https://github.com/HKUDS/DeepTutor/blob/main/deeptutor/api/routers/plugins_api.py)、
  [partners.py](https://github.com/HKUDS/DeepTutor/blob/main/deeptutor/api/routers/partners.py)）。
  v1.4.1 release 即以「an HTTP/SSE API for TutorBots」发布该能力
  （[v1.4.1](https://github.com/HKUDS/DeepTutor/releases/tag/v1.4.1)）。
- **REST**：sessions（列表/详情/改名/删除）、knowledge（建库/上传/重建索引/进度 WS）、notebook、
  memory（含 `POST /api/v1/memory/runs/start` 触发整理）、settings、partners、book、静态产物
  `GET /api/outputs/...`。（来源：[Server API](https://deeptutor.info/docs/cli/server-api/)）
- **鉴权**：`auth.json` 开启后，除 `/api/v1/auth/*` 外所有端点要求 JWT
  （`Authorization: Bearer` 或 `dt_token` cookie），登录 `POST /api/v1/auth/login`；关闭 auth 时
  鉴权依赖为 no-op。（来源：[Server API](https://deeptutor.info/docs/cli/server-api/)、
  [CONTAINERIZATION.md 安全说明](https://github.com/HKUDS/DeepTutor/blob/main/CONTAINERIZATION.md)）

### CLI NDJSON 面

`deeptutor run <capability> "<msg>" --format json` 每回合输出 NDJSON（一行一个事件）：
`stage_start` / `stage_end` / `content` / `thinking` / `progress` / `tool_call` / `tool_result` /
`error` / `done`；`done` 携带 `session_id` / `turn_id`，用 `--session <id>` 跨进程续会话。
capability 可取 `chat` / `deep_solve` / `deep_question` / `deep_research` / `visualize` /
`math_animator` / `mastery_path`。
（来源：[Command Reference](https://deeptutor.info/docs/cli/commands/)、
[根 SKILL.md](https://github.com/HKUDS/DeepTutor/blob/main/SKILL.md)）

- **`ask_user` 无 TTY 行为**：官方明确「runs are headless-safe：无 TTY 时 `ask_user` 自动以空回复
  放行，不会挂死」（[README CLI 节](https://github.com/HKUDS/DeepTutor#%EF%B8%8F-deeptutor-cli--agent-native-interface)）；
  源码验证：`deeptutor_cli/common.py` 中 stdin 非交互时打印
  “ask_user: stdin is not interactive — sending an empty reply so the turn can continue” 并提交空串
  （[common.py](https://github.com/HKUDS/DeepTutor/blob/main/deeptutor_cli/common.py)）。
- **CLI 不是 HTTP 客户端**：`deeptutor_cli` 直接 `from deeptutor.app import DeepTutorApp` 在进程内
  启动完整运行时（[common.py](https://github.com/HKUDS/DeepTutor/blob/main/deeptutor_cli/common.py)、
  [facade.py](https://github.com/HKUDS/DeepTutor/blob/main/deeptutor/app/facade.py)），即每次
  `deeptutor run` 都要冷启动 Python 运行时并直接读写 `data/` 树。
- **多用户局限**：官方文档写明「In a multi-user deployment this CLI operates the admin workspace」
  （[Command Reference · skill 节](https://deeptutor.info/docs/cli/commands/)）——CLI 面没有
  per-user 身份。

### 官方「被其他 agent 驱动」指引

- [Agent Handoff](https://deeptutor.info/docs/cli/agent-handoff/)：官方 playbook，含把
  `deeptutor run --format json` 包成 LangChain/AutoGen 工具的完整 Python 样例、逐行解析 NDJSON
  的消费者代码、session-handoff 链式调用模式。
- 仓库根 [SKILL.md](https://github.com/HKUDS/DeepTutor/blob/main/SKILL.md)：~150 行的「一次读完
  即可操作全表面」交接文档，官方建议直接交给 Claude Code / Codex 等工具型 LLM。

### 哪条更适合 EQB server 代理（推断）

**HTTP 面（WS + REST）**。理由：(a) CLI 每次调用冷启动整个 Python 运行时，作为 Node 常驻服务的
下游延迟与内存都不可控；(b) 多用户模式下 CLI 只有 admin 身份，无法映射 EQB 学生/教师账号；
(c) HTTP 面有 OpenAPI 规范、JWT 鉴权、`cancel_turn`/`submit_user_reply`/`regenerate` 等会话控制，
Node 端 `ws` 库直连即可把事件流转发给 eqbank.cc 前端。CLI NDJSON 适合 Mac 试点期的脚本验证与
一次性批处理（如批量生成题目）。

## 2. 知识库喂数

- **支持格式**：`kb create` 官方列表 PDF、DOCX、XLSX、PPTX、TXT、MD、HTML
  （[Command Reference](https://deeptutor.info/docs/cli/commands/)）；Web 上传口径为
  「PDFs, Office files, Markdown, text, code, or data」
  （[Knowledge Center](https://deeptutor.info/docs/explore/knowledge/)）；运行时权威列表可查
  `GET /api/v1/knowledge/supported-file-types`
  （[Server API](https://deeptutor.info/docs/cli/server-api/)）。**纯 Markdown/文本导出完全够用**，
  且内置 Text-only 解析器零依赖处理文本类文件；MinerU/Docling 等重型解析引擎只在 PDF/扫描件
  场景才需要。
- **ingest 粒度与增量**：按文档粒度。`kb add <name> --doc more.pdf` 增量追加，无需重建
  （[Command Reference](https://deeptutor.info/docs/cli/commands/)）；单个文档可从 KB 移除——
  包括解析失败卡在 error 态的文档——不必删库重建
  （[v1.5.1](https://github.com/HKUDS/DeepTutor/releases/tag/v1.5.1)、
  [Knowledge Center](https://deeptutor.info/docs/explore/knowledge/)）。
- **版本化索引**：重建索引写入新的扁平 `version-N` 目录（按 embedding 签名键控），旧版本保留，
  「工作中的索引绝不会在重建中途被毁」；重建只能从 Web UI 触发（Knowledge → Index versions →
  Re-index now），CLI 无此命令。换 embedding 模型后必须重建，否则维度不匹配。
  （来源：[Knowledge Center](https://deeptutor.info/docs/explore/knowledge/)、
  [Troubleshooting](https://deeptutor.info/docs/get-started/troubleshooting/)）
- **检索引擎取舍**（[Knowledge Center](https://deeptutor.info/docs/explore/knowledge/)，每 KB 绑定
  一个引擎）：
  - **LlamaIndex**（默认）：本地向量 + BM25 混合，开箱即用；大库检索走 FAISS 向量后端
    （[v1.4.12](https://github.com/HKUDS/DeepTutor/releases/tag/v1.4.12)）。
  - **PageIndex**：**托管服务**，vectorless 推理式检索、页级引用，需 API key——题库内容会发送到
    第三方云端，README 还带其付费订阅折扣码（[README](https://github.com/HKUDS/DeepTutor#-open-source-partners)），
    对学生数据/版权语料是数据出境点，慎选。
  - **GraphRAG**：本地知识图谱检索，`pip install 'deeptutor[graphrag]'`，官方标注「indexing 是
    LLM-heavy」——索引费用在 LLM API 调用上。
  - **LightRAG / LightRAG Server**：图+向量混合；Server 形态把检索外包给你自己运行的 LightRAG
    实例（HTTP 连接，无本地索引）。
  - **Obsidian**：链接现有 vault，就地读写、不上传不建索引，仅本地/自托管。
  - （另有 Tencent IMA 托管选项，同属外部服务。）
- **CLI `kb` 生命周期**：`list` / `info` / `create` / `add` / `search`（hybrid/vector/keyword 三种
  模式）/ `set-default` / `delete`（[Command Reference](https://deeptutor.info/docs/cli/commands/)）。
- **重建成本**：现行文档没有给出重建索引的定量成本数字；已知定性事实是「建 KB 是最耗内存操作，
  主机需 ≥4GB 空闲内存」（旧版官方故障排查，
  [mintlify 镜像](https://hkuds-deeptutor-22.mintlify.app/troubleshooting/common-issues)），embedding
  费用与语料量成正比、429 限流是 KB 卡 indexing 的常见原因
  （[Troubleshooting](https://deeptutor.info/docs/get-started/troubleshooting/)）。

## 3. MCP 路线

- **可以接自建 MCP 服务**。DeepTutor 是 MCP 客户端：服务器条目支持 `stdio` / `sse` /
  `streamableHttp` 三种 transport（省略 `type` 时自动判定：有 `command` ⇒ stdio；URL 以 `/sse`
  结尾 ⇒ sse；否则 streamableHttp），支持 `headers` 静态凭证、opt-in OAuth 2.1（`auth: "oauth"`）、
  `tool_timeout`、`enabled_tools`/`disabled_tools` 白名单；工具在模型视角命名空间化为
  `mcp_<server>_<tool>`。
  （源码：[services/mcp/config.py](https://github.com/HKUDS/DeepTutor/blob/main/deeptutor/services/mcp/config.py)、
  [user_config.py](https://github.com/HKUDS/DeepTutor/blob/main/deeptutor/services/mcp/user_config.py)）
- **两层配置存储**：部署级 `settings/mcp.json` 由 **admin 独有**、全体账号共享；个人级
  「MCP Services」商店（v1.5.7 引入，[v1.5.7](https://github.com/HKUDS/DeepTutor/releases/tag/v1.5.7)）
  存于 `data/system/user-mcp/<owner>.json`（放在 exec 沙箱挂载不到的分支），**仅允许远程
  transport（stdio 一律拒绝）**、每人上限 8 个服务器。
  （源码：[user_config.py](https://github.com/HKUDS/DeepTutor/blob/main/deeptutor/services/mcp/user_config.py)）
- **SSRF 防护决定注册路径**：admin 的部署级服务器允许 localhost/内网目标（只封链路本地/云元数据
  段）；**用户自配服务器额外封禁回环、10/8、172.16/12、192.168/16、CGNAT 等全部私网段**，且
  连接时重新校验（防 DNS 换绑）。
  （源码：[services/mcp/network.py](https://github.com/HKUDS/DeepTutor/blob/main/deeptutor/services/mcp/network.py)）
  ⇒ EQB 题库 MCP 服务若与 DeepTutor 同机/同内网部署，**必须由 admin 注册**。
- **多用户授权模型**：非 admin 用户的 MCP 工具 **deny-by-default**——grant 里没写 `mcp_tools`
  就一个都列不出、也加载不了，须 admin 按工具名逐个授予；admin 自身不受限。该行为自 v1.4.10
  起（[v1.4.10](https://github.com/HKUDS/DeepTutor/releases/tag/v1.4.10)）。
  （源码：[multi_user/tool_access.py](https://github.com/HKUDS/DeepTutor/blob/main/deeptutor/multi_user/tool_access.py)、
  [grants.py](https://github.com/HKUDS/DeepTutor/blob/main/deeptutor/multi_user/grants.py)；
  文档：[Multi-User Deployment](https://deeptutor.info/docs/get-started/multi-user/)）
- **Partner 作用域**：Partner 是合成用户（synthetic scope），其 MCP 白名单由 owner 作用域的
  `mcp_tools_filter` / `enabled_tools` 通过 context metadata 传入 chat pipeline，与真人用户的
  grant 机制并行。
  （源码：[tool_access.py 模块注释](https://github.com/HKUDS/DeepTutor/blob/main/deeptutor/multi_user/tool_access.py)）

## 4. 多用户与隔离

（主源：[Multi-User Deployment](https://deeptutor.info/docs/get-started/multi-user/)、
[README Multi-User 节](https://github.com/HKUDS/DeepTutor#-explore-deeptutor)）

- **开启方式**：`data/user/settings/auth.json` 置 `enabled: true` 并重启；**第一个注册者成为
  admin**，此后 `/register` 自动关闭，后续账号由 admin 在 `/admin/users` 邀请制创建。
- **per-user 隔离**：每用户 `data/users/<uid>/` 下有自己的 `chat_history.db`、memory、notebooks、
  私有 KB，「默认互不共享」；admin 分配的 KB/技能以**只读**形态出现（带 “Assigned by admin”
  徽章）。设置页对普通用户脱敏：只见主题/语言/被授予模型摘要，API key、base URL 永不返回。
- **grant 模型**：`data/system/grants/<uid>.json`，admin 为每人挑选可用 LLM、KB、技能、Partner，
  并可把系统工具、MCP 工具、CLI 应用收窄为白名单、单独关闭代码执行；grant 只携带逻辑 ID，
  「API keys never cross the grant boundary」；无 LLM 授权的回合直接拒绝（不静默回落到 admin 的
  key）。全部变更进审计日志 `data/system/audit/usage.jsonl`。
- **学生只读/受限访问可行性（推断）**：可以做「受限使用账号」——学生只拿到指定模型 + 只读题库
  KB，MCP/CLI/代码执行默认全关；但**没有**「只读浏览、不产生对话」的 viewer 角色，学生账号
  本质仍是能发起回合（消耗 LLM token）的完整聊天账号。配额/计费限制未见文档支持（见文末
  「未能核实」）。
- **PocketBase 注意**：官方明文「PocketBase 模式仅单用户」——默认 schema 的 `users` 无 `role`
  字段，所有登录都解析为普通用户、无法产生 admin；多用户部署必须让 `integrations.pocketbase_url`
  留空，用默认 JSON/SQLite 后端。
- **其他注意**：首用户提升 admin 由进程内 `threading.Lock` 保护，官方建议单进程部署（多 worker
  需离线预置 admin）；HTTPS 跨站部署需 `cookie_secure: true` + 精确 `cors_origins`。

## 5. 资源规格

### 官方数字

| 项目 | 数字 | 来源 |
| --- | --- | --- |
| 最低内存 | **4 GB 空闲** | [Get Started · Minimum requirements](https://deeptutor.info/docs/get-started/) |
| 最低磁盘 | **2 GB 空闲** | 同上 |
| 运行时 | Python 3.11–3.13；Node 20+（PyPI 装）/ 22 LTS（源装，与 CI/Docker 一致） | 同上 |
| 建 KB 内存 | 「建 KB 是最耗内存操作，主机 ≥4GB 空闲内存；Docker 需 `--memory="4g"`」 | 旧版官方故障排查（[mintlify 镜像](https://hkuds-deeptutor-22.mintlify.app/troubleshooting/common-issues)；现行 troubleshooting 页已无此定量条目） |
| MinerU 解析（可选） | ≥20 GB 空闲磁盘（官方指引）：安装 2–4 GB + 首次解析懒下载 1–2 GB 模型 + 缓存 | 应用内设置文案（源码 [MinerUEngineSettings.tsx](https://github.com/HKUDS/DeepTutor/blob/main/web/components/settings/MinerUEngineSettings.tsx)） |

### 内存行为的重要背景

- v1.5.7 及之前，**源装 dev 模式**的 Next.js dev server 堆无上限（Next 取总内存的 50% 当堆），
  实测涨过 14GB 才崩；v1.5.8 起源装默认改跑 production build、dev 堆钳制 4GB 且按容器 cgroup
  限额取值、后端 LLM 客户端与索引缓存改为有界
  （[v1.5.8 release](https://github.com/HKUDS/DeepTutor/releases/tag/v1.5.8)、
  [v1.5.8 详情](https://github.com/HKUDS/DeepTutor/blob/main/assets/releases/past_releases/ver1-5-8.md)）。
- v1.5.11 在 Settings 增加实时内存占用显示，LightRAG 索引移出事件循环
  （[v1.5.11](https://github.com/HKUDS/DeepTutor/releases/tag/v1.5.11)）。
- 后端首次启动约 30s（拉模型元数据），Docker healthcheck 可能短暂 flap
  （[Troubleshooting](https://deeptutor.info/docs/get-started/troubleshooting/)）。

### 端口拓扑

单容器/单机内 FastAPI 后端 `:8001` + Next.js 前端 `:3782`；**只需发布 3782**——浏览器只与前端
origin 通信，`web/proxy.ts` 在容器内把 `/api/*`、`/ws/*` 服务器侧转发给后端；反向代理（Caddy/
nginx）指向 3782 即可，无需配置 API base。发布 8001 是可选项，仅供 curl/脚本直连 API——**EQB
Node 后端 server-to-server 调用时，把 8001 绑定在 loopback/内网发布即可，不必暴露公网**。
（来源：[CONTAINERIZATION.md](https://github.com/HKUDS/DeepTutor/blob/main/CONTAINERIZATION.md)、
[Multi-User · Caddyfile](https://deeptutor.info/docs/get-started/multi-user/)）

### 规格建议（推断，基于上表官方数字）

| 档位 | 规格 | 说明 |
| --- | --- | --- |
| 现有生产机 | 2 核 / 2GB | **不满足官方 4GB 最低线**，建 KB 必 OOM，排除 |
| 最低可用 | 2 vCPU / 4GB RAM / 20GB SSD | Docker 单容器（`ghcr.io/hkuds/deeptutor:latest`），Text-only/markitdown 解析，KB 构建与服务共存时内存吃紧，建议错峰建库 |
| 舒适 | 4 vCPU / 8GB RAM / 40GB SSD | 多用户 + 常态建库 + EQB Node 同机反代都有余量 |
| 若用 MinerU | 上述基础上磁盘 +20GB | 官方指引（仅 PDF 扫描件需要，题库 MD 喂数用不到） |

Docker 与源装两条路径的**稳态**内存相近（同一套 FastAPI + Next production server）；差别在
(a) 源装需完整 Node 22 + npm 依赖树与一次前端构建，磁盘与首启成本更高，(b) v1.5.8 之前的源装
dev 模式是内存事故来源——生产一律用 Docker 镜像或 PyPI 包 production 模式。GraphRAG/LightRAG
的索引成本主要落在 LLM API 调用费而非本机 CPU/GPU（[Knowledge Center](https://deeptutor.info/docs/explore/knowledge/)
标注 GraphRAG「indexing is LLM-heavy」）。

## 6. 模型与中文

- **DeepSeek LLM**：一等 provider，binding `deepseek`，默认 base URL `https://api.deepseek.com`
  （[Provider Configuration](https://deeptutor.info/docs/get-started/providers/)）；Get Started 页
  也把 DeepSeek 列入受支持 key 清单（[Get Started](https://deeptutor.info/docs/get-started/)）。
  另有 `custom`（任意 OpenAI 兼容端点）兜底。v1.4.11 起所有云端 OpenAI 兼容 provider 走原生
  tool calling（[v1.4.11](https://github.com/HKUDS/DeepTutor/releases/tag/v1.4.11)）。
- **Embedding（DeepSeek 无此产品）**：官方 binding 共 12 个：OpenAI（text-embedding-3-large）、
  Gemini、Azure OpenAI、Cohere、Jina（jina-embeddings-v3）、Ollama（本地 nomic-embed-text）、
  vLLM/LM Studio、**SiliconFlow（Qwen/Qwen3-Embedding-8B，4096 维）**、
  **阿里 DashScope（qwen3-vl-embedding，2560 维）**、OpenRouter、custom（任意 OpenAI 兼容）、
  custom_openai_sdk（[Provider Configuration](https://deeptutor.info/docs/get-started/providers/)）。
  对中英混合题库语料，国内可直连的现实选项是 SiliconFlow / DashScope（Qwen 系 embedding），
  国际线是 OpenAI / Jina / Gemini——注意官方只列 binding，**未提供各 embedding 模型中文效果的
  评测数据**。`EMBEDDING_HOST` 必须填完整 embeddings 端点 URL 而非 base URL
  （[Troubleshooting](https://deeptutor.info/docs/get-started/troubleshooting/)）。
  换 embedding 模型必须重建 KB 索引（见第 2 节）。
- **模型输出语言**：v1.5.10 起「model output language」独立成设置
  （[v1.5.10](https://github.com/HKUDS/DeepTutor/releases/tag/v1.5.10)），存于
  `interface.json: response_language`，与 UI 语言分离（源码
  [interface_settings.py](https://github.com/HKUDS/DeepTutor/blob/main/deeptutor/services/settings/interface_settings.py)
  的 `get_response_language()`）；CLI/API 每回合还可传 `--language` / `language` 覆盖
  （[Command Reference](https://deeptutor.info/docs/cli/commands/)）。
- **中文 i18n 事实**：v0.6.0「full Chinese localization」、v1.0.0-beta.3「full Chinese i18n」
  （[README Releases](https://github.com/HKUDS/DeepTutor#-releases)）；仓库存在
  `web/locales/zh/app.json` 全量中文文案；UI 语言归一化目前支持 en/zh 两值（源码
  [interface_settings.py](https://github.com/HKUDS/DeepTutor/blob/main/deeptutor/services/settings/interface_settings.py)）。
  v1.5.6 修复过「非英语语言塌缩成中文」的 bug（[v1.5.6](https://github.com/HKUDS/DeepTutor/releases/tag/v1.5.6)），
  说明多语言输出路径被积极维护。团队为 HKU 数据智能实验室，官方社群含飞书/微信群
  （[README Community](https://github.com/HKUDS/DeepTutor#-community)）。

## 7. 许可与升级风险

- **许可**：Apache License 2.0（[LICENSE](https://github.com/HKUDS/DeepTutor/blob/main/LICENSE)）。
  对「自托管 + EQB 后端调用」的形态：无 copyleft，**不要求开源 EQB 代码**；义务只在**再分发**
  DeepTutor 本体或修改版时触发（保留 LICENSE/NOTICE、声明修改）；附带专利授权；不得使用其
  商标。仓库另有 [THIRD_PARTY_NOTICES.md](https://github.com/HKUDS/DeepTutor/blob/main/THIRD_PARTY_NOTICES.md)
  记录第三方素材。修改源码自用不产生公开义务（Apache 2.0 §4 只约束 redistribution）。
- **发版节奏**：官方 README releases 列表显示 2026-07-26（v1.5.5）至 2026-08-10（v1.5.11）
  16 天内发了 7 个版本（≈每周 2–3 个）；自 2025-12-29 首发以来约 8 个月发了 40+ 个版本，且
  经历过一次「~200k 行的 agent-native 架构重写」（v1.0.0-beta.1）和多用户目录布局迁移
  （pre-v1.5 `multi-user/` → `data/`，自动迁移）。
  （[README Releases](https://github.com/HKUDS/DeepTutor#-releases)、
  [Multi-User · Workspace layout](https://deeptutor.info/docs/get-started/multi-user/)）
- **API 稳定性**：HTTP 面统一挂 `/api/v1` 前缀，OpenAPI 随服务发布；实践上保留 legacy 端点
  （`WS /api/v1/chat`、chat-session 别名路由）而非直接删除
  （[Server API](https://deeptutor.info/docs/cli/server-api/)）。但**文档没有任何书面的 API 版本化
  策略或兼容性承诺**；Server API 页自述「for the exhaustive, always-current schema」要以运行中
  实例的 `/openapi.json` 为准，且有「当前 API 没有专门的 KB search 路由」这类仍在挪动的表面；
  Codex OAuth 等能力被明确标注 experimental（[README Settings 节](https://github.com/HKUDS/DeepTutor#-explore-deeptutor)）。
- **对策（推断）**：生产锁定 Docker tag（GHCR `:latest` 会周更，应 pin 到具体版本）或 PyPI
  精确版本；EQB 侧用 `/openapi.json` 生成的 typed client + 一组针对所用端点的合同测试作为升级门；
  升级按官方节奏批量跟进（例如每月一次），不追周更。

## 对后续决定的直接影响

- **喂数形态（KB 导出 vs MCP vs 混合）→ 建议混合**。题库导出纯 Markdown/TXT 即可直接
  `kb create/add`（格式一等公民、增量追加、单文档可删、version-N 重建安全），适合「按册/按专题
  的静态语料底座」；MCP 路线可行且是「实时查题/查学生上下文」的正确缝——但 EQB MCP 服务须由
  admin 注册（用户自配封内网），学生侧 MCP 工具默认全拒、需逐工具授权，授权面天然可控。
  PageIndex 是托管服务，题库数据会出境到第三方，不建议默认启用。
- **调用缝（HTTP/SSE 代理 vs CLI）→ HTTP 面**。Node 后端经 `POST /api/v1/auth/login` 拿 JWT，
  走 `WS /api/v1/ws`（`start_turn` → 流式事件 → `submit_user_reply` 处理 `ask_user`），REST 管
  sessions/KB/memory；`8001` 只对内网/loopback 发布。CLI NDJSON（`--format json`、headless 下
  `ask_user` 自动空回复）留作 Mac 试点脚本与批量出题工具，不做生产缝——它每次冷启动完整
  Python 运行时且多用户下只有 admin 身份。
- **部署规格 → 现有 2 核/2GB 生产机装不下**（官方最低 4GB 空闲内存）。试点在 Mac 上按 PyPI/
  Docker 路径即可；生产另购：最低 2 vCPU/4GB/20GB SSD，舒适 4 vCPU/8GB/40GB SSD（MinerU 再
  +20GB 磁盘，题库 MD 喂数用不到）。Docker 单容器 + 反代指向 3782 + 持久化整棵 `data/` 树 +
  auth 开启 + PocketBase 留空，是与多用户/审计要求匹配的形态。

## 未能核实的说法

- **学生用量配额/限流**：grants 只覆盖资源与工具白名单，未在文档或源码中找到 per-user token
  配额或速率限制机制——「学生账号会消耗多少 LLM 费用」需要 EQB 代理层自行控制。
- **各 embedding 模型对中文语料的实际效果**：官方只列 binding 与维度，无中文评测数据。
- **KB 重建索引的定量耗时/费用**：无官方数字，只有「建 KB ≥4GB 空闲内存」「indexing 是
  LLM-heavy（GraphRAG）」等定性说法。
- **Docker 镜像体积与 KB 磁盘增长率**：官方只给「2GB 空闲磁盘」最低线，未公布镜像大小与
  每千文档索引磁盘占用。
- **两个进程（server + CLI）并发读写同一 `data/` 树是否安全**：文档未说明，源码未审到锁机制，
  按不安全对待（试点期避免 server 运行时并发跑 CLI 写操作）。
