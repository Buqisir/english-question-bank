# 人工题源台账与 Agent 导题交接

Status: accepted
Accepted: 2026-08-30 by owner
Date: 2026-08-30

## Problem

Owner 能最快从公众号、小红书和教师群发现新模拟卷，但当前交接只存在于人脑、
聊天和本地文件夹。它不能稳定回答：这是什么卷、从哪里来、试题和权威答案是否
齐全、是否已经交给 Agent、哪个 Agent 正在处理、需要 Owner 补什么、最后进入了
哪个 `paperId`。

平台自动采集受限流与登录影响，且不能替代 Owner 对题源价值和权威答案的判断。
本轮选择 human-first：人负责发现和获取，后台台账负责私有保管、完整性与确定性
交接。

## User outcome

Owner 打开 `/ops/` 的“题源台账”，点击“添加题源”，填写试卷名和来源，上传本地
DOCX / PDF。只有试题时可先保存并显示“待补答案”；题目与权威答案齐全后点击
“保存并提交给 Agent”。submission 即使 webhook 暂时失败也保持 queued；本机
Agent 原子认领、下载并复核同一字节，再进入现有 NCK1 导题合同。需要判断时回到
“需我确认”；成功初始化后绑定 `paperId` 并跳转现有导题审核。

## Accepted interaction

已由 Owner 确认三张 Cut 0 比例稿：

- 空台账：第一动作只有“添加第一份题源”；
- 日常台账：按试卷、来源、原文件、状态、发现时间和下一步扫描；
- 添加抽屉：试卷、来源、文件三段；支持“题目与答案分开”或“同一文件”；
  “保存草稿”和“保存并提交给 Agent”分开。

视觉沿用 `/ops/` 中性工具台：#F6F6F4 背景、白面、近黑墨、小面积 #2C6E56，
小圆角、细边、无蓝紫、无 Emoji、无统计卡墙。桌面优先，窄屏抽屉全屏化、台账
允许结构化横向滚动。

## Data and state contract

同一 Import Ops DB / root 中新增独立上游结构：

- `source_intakes`：可变 Owner 台账实体；
- `source_intake_sources`：一个或多个来源证明；
- `source_intake_files`：私有、digest-bound 文件记录，旧 submission 使用过的字节
  永不被替换；
- `source_intake_submissions`：不可变 submitted snapshot 与 digest；
- `source_intake_events`：状态变化与通知结果；
- `source_intake_claims`：唯一 active claim、lease token、heartbeat 和过期时间。

台账展示状态：

```text
draft -> awaiting_answers -> ready_for_agent -> queued -> claimed
                                      ^              |        |
                                      |              v        v
                                      +--------- needs_owner   handed_off
```

- `draft`：还没有可用试题文件；
- `awaiting_answers`：有试题、缺权威答案；
- `ready_for_agent`：`question_and_answers`，或 `question_source` +
  `official_answers` 全部上传并校验；
- `queued`：不可变 submission 已创建，等待 claim；
- `claimed`：一个 Agent 持有未过期 lease；
- `needs_owner`：Agent 释放 claim 并返回结构化原因；Owner 修正后创建新 submission；
- `handed_off`：Agent 已用同一来源初始化现有导题流水线并绑定 `paperId`。

Draft 可变，submission 不可变。修订不会覆盖旧 snapshot 或旧文件字节。

## Auth and trust boundaries

- Owner API：list / create / update draft / register+upload file / submit / notify。
- member：所有题源 API 403。
- import_agent / Agent token：只可 list queue / claim / read claimed snapshot /
  download claimed bytes / heartbeat / needs-owner / handoff。
- Agent 下载后必须再次核对 `byteLength` 与 SHA-256；网页元数据是 untrusted data，
  不作为 Agent 指令。
- 上传仅接受 `.docx` 与 `.pdf`，每文件 ≤64 MiB、当前 active bundle ≤256 MiB；
  拒绝 traversal、重复 active role、错误 MIME / magic、长度或 digest、部分上传。
- 替换文件在新字节完整通过 digest / magic 后才原子切换为 active；失败或中断时
  保留上一份已验证文件与原状态，Owner 可重试或刷新回退。
- 私有源文件不由 `/ops/` 静态目录、`app/public`、PaperSurface 或普通下载路由提供。
- `init` 写入绑定 submission digest、`paperId` 与本地源文件身份的私有收据；
  `handoff` 复核收据和本地 workspace，并拒绝已被 Import Review 使用的 `paperId`。
- handoff 不是 Owner QA、local publish、ship 或 production authorization。

## Agent wakeup

- DB queued submission 是唯一事实源。
- 服务端可向私有 Amp capability URL 发送最小 payload：schema、event、
  `submissionId`、`submissionDigest`；不发送标题、来源文本、文件名或凭据。
- webhook best-effort；失败只记录非敏感 reason，Owner 可“再次通知 Agent”。
- Amp project plugin 校验 payload / 可选 HMAC，把固定仓库任务发送到稳定 Mac
  runner；payload 只作 submission lookup key，绝不拼成自由提示词。
- at-least-once delivery 由 DB 原子 claim / lease 去重。插件 handler 只创建线程，
  不在 30 秒 handler 内导题。
- 真实 webhook URL、secret、runner ID 和生产配置需独立当前授权后设置；仓库实现
  与 verifier 不注册外部 webhook。

## Delivery cuts

1. **规格与比例稿**：ADR、本 spec、三态比例稿和硬 DEV 约束。
2. **持久化与上传**：独立 store/routes、共享 digest upload helper、owner/agent auth。
3. **Owner UI**：`source-intakes.js/css`，`app.js` 只负责 view switch 与 Review tab。
4. **Agent bridge**：`source-intake.mjs` list/claim/download/heartbeat/needs-owner/handoff；
   下载物进入 gitignored intake inbox，再由现有 `universal-nck1.mjs init` 消费。
5. **Amp wakeup**：project-local durable webhook plugin 与私有配置说明；不注册真实 URL。
6. **验证与 Owner QA**：store/route/CLI verifier、现有 Import Ops verify、auth gate、
   浏览器空态/缺答案/完整提交/离线通知/needs-owner 状态。

## Acceptance criteria

- [x] Owner 能创建题源、记录来源并上传 digest-verified DOCX / PDF。
- [x] 只有试题时稳定显示 `awaiting_answers`，且不能提交 Agent。
- [x] 完整材料创建不可变 queued submission；后续 Draft 修改不能改变旧 snapshot。
- [x] member 403；Agent 权限限于 queue/claim/download/heartbeat/status/handoff。
- [x] 并发或重复 webhook 只有一个未过期 claim；lease 可 heartbeat，过期可重领。
- [x] webhook / runner 离线不丢队列，Owner 可再次通知。
- [x] Agent 下载重新验 digest，handoff 绑定合法且不冲突的 `paperId`。
- [x] `/ops/` 三个代表状态与确认稿一致，键盘、错误、上传重试和窄屏可用。
- [x] 现有 Import Review、PaperSurface、Print、PDF、local publish 与 ship 停点不变。

## Verification

这是 auth / persistence / private file / webhook seam：开发中运行 focused verifier、
`node import-ops/verify.mjs`、`node scripts/verify-auth-gate.mjs` 和真实 `/ops/` 浏览器
交互；最终运行 `pnpm -C app verify:all`，并对冻结 diff 做一次独立 Standards / Spec
review。若 full suite 中存在与本改动无关的既有失败，必须原样报告，不得改测试
制造绿色。

## Out of scope

- 公众号、小红书、教师群自动爬取或定时监控；
- 网站内 LLM、OCR、自动解题、自动补权威答案；
- 新 consumer/member 管理 UI、统计 dashboard；
- 自动 Review approval、local publish、production deploy、R2 mutation；
- 本轮注册真实 Amp webhook、写入 capability URL/secret、启动或修改共享 runner。
