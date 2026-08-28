# 导题 Agent 审核后发布闭环

Status: accepted
Accepted: 2026-08-28 by owner
Date: 2026-08-28

## Problem

通用 NCK1 入口已经能从不可变源材料派生 Candidate，网页导题后台也已经能让
Agent 上传修订版、Owner 复用真实 Screen / Print / PDF 提问题并认可。但认可后
仍缺少一条能直接消费通用 Candidate 的本地发布桥：旧 `02-publish.mjs` 依赖
`groups.json` 和多份教学分析，不能诚实地发布一份只有源材料、权威答案和
Teacher Confirmation 的通用卷。

因此当前流程会停在 `qa-accepted.json`，还不能形成“Agent 生产 → 网页 QA →
Agent 修正 → Owner 认可 → 本地发布 → 等待单独上线命令”的完整闭环。

## User outcome

Owner 在 `/ops/` 认可当前最新、无未决问题且摘要精确绑定的修订版后，Agent
可以运行一个明确的本地命令。命令再次核对源、Candidate、可见结构、文件清单、
网页认可和 Teacher Confirmation，然后通过现有原子 Paper publisher 生成
`paper-assets/<paperId>/latest`、数据库版本及 Canonical current ref。成功后状态为
`ready_to_ship`，但不部署；Owner 之后仍须另行说“上线 <paperId>”。

## Accepted decisions

### 状态与人机边界

目标状态顺序为：

```text
materializing -> awaiting_review <-> changes_requested -> approved
  -> locally_published -> ready_to_ship -> shipped
```

- `/ops/` 是 QA 事实源；Agent 以结构化 API 与独立 token 为主要机器协议。
- `import_agent` 真实网页账号用于查看待办、同面预览、回复和排障；自动化不靠
  浏览器抓取页面。
- Owner 认可只授权生成确认依据和本地发布，不授权生产部署。
- 本地发布成功后 Agent 必须停。生产仍要求 Owner 当前另说“上线 <paperId>”。
- v1 不在 `/ops/` 调 LLM，不加部署按钮、永久轮询/webhook、多 writer 或单卷
  PaperSurface 特例。

### 通用发布边界

采用一个原子 publisher、两个输入适配器：

1. 旧 package adapter 继续接收既有 `groups.json`、AnswerKey、Import Meta 和
   可选教学分析；行为保持兼容。
2. 通用 NCK1 adapter 直接接收已认可的 Source Materialization、Canonical
   request 与确定性兼容投影；不反向伪造旧分析包。

两者共用同一个私有原子发布协调器，统一管理版本号、不可变 `versions/vN`、
`latest`、数据库 `paper_asset_versions`、Canonical current ref、事务、回滚、重试
和崩溃恢复。不得另建第二套数据库/文件提交协议。

通用入口必须在第一次写入前完成：

- 本地 source、Candidate、visible structure、文件和 bundle digest 与当前网页认可
  精确一致；
- `qa-accepted.json`、web approval、Teacher Confirmation 和 Canonical request
  属于同一 revision；
- Canonical admission 成功；九个题组及 45 个 active 权威答案完整；
- Listening 明确 inactive / `not_supplied`；
- Canonical 消费可见结构与 Owner 实际审核的 projection 一致。

Canonical Paper 是语义权威。兼容 PaperAsset 只服务现有数据库和旧读取缝，不能
重建或改写已确认语义。

### 兼容元数据

通用 Source Materialization 不要求教学分析。发布时不得写空壳或伪造
reading/seven/cloze/grammar analysis 文件。

兼容元数据只允许确定且诚实的来源：

- `paperName` 和出处使用 `config.provenance`；
- `sourceType` 优先使用显式配置；否则 `paper-mock-*` 为“模拟题”，其他
  `paper-*` 为“真题”；
- `year` 优先使用显式配置，否则从 `paperId` 或卷名提取四位年份；仍缺失则失败；
- `region` 优先使用显式配置，否则使用完整出处字符串；
- tags 优先使用显式配置，否则只写 sourceType/year 这类事实标签；
- source 文件名与摘要取 manifest 中首个 `question_source` 或
  `question_and_answers` 文档。

不发明难度、主题、教学摘要或 AI 分析。

### 失败与恢复

- 任一认可/源/确认/Canonical 绑定漂移必须在第一次写入前失败，且零残留。
- commit 前故障必须回滚数据库、暂存目录、不可变版本和 `latest`。
- commit 后 consumer reload 中断允许同版本重试；恢复必须得到同一版本，不得
  产生第二个版本或混合 current state。
- PaperAsset、AnswerKey、DB version、Canonical ref、`versions/vN` 和 `latest`
  必须使用同一版本号。

## Milestones

1. **通用认可后本地发布**：实现统一原子发布核心、`review.mjs publish` 和故障
   验证。本 spec 当前只授权这一 milestone 的仓库内实现。
2. **自动导题 skill 与状态收口**：增加项目 skill，让 Agent 自动识别 NCK1
   导入任务，先做 resume/status preflight，再按新状态机执行。
3. **生产 Agent 身份**：在获得新的当前授权和 secret context 后，创建真实
   `import_agent` 账号与独立最小权限 token；不复用 Owner Cookie。
4. **未见真卷闭环 pilot**：在 Owner 提供源卷并单独授权后，完整演练提交、故意
   提问题、Agent 回复/返工、Owner 关闭/认可、本地发布和三面 canary；最后停在
   单独“上线”命令之前。

## Acceptance criteria

- [x] 已认可的通用 NCK1 revision 可由一个命令原子发布到本地正式资产和数据库。
- [x] 发布前重新核对所有认可摘要和确认依据；任一陈旧或篡改输入零写入失败。
- [x] 已发布卷保持九题组、45 个 active 权威答案和 inactive Listening closure。
- [x] Screen 与 Print consumers 可从 committed Canonical ref reload，visible digest
      等于网页实际认可的 projection。
- [x] 通用发布不产生伪造 analysis sidecar。
- [x] commit 前故障零残留；commit 后 reload 中断同版本恢复且重试幂等。
- [x] `qa-accepted`、本地发布、`ready_to_ship` 和 `shipped` 探针顺序清晰，旧的
      `latest` 先于 QA 的描述被移除。
- [ ] Agent skill 能在匹配任务时自动触发，并能从 paperId 恢复，而非要求 Owner
      背命令。
- [ ] 生产账号/token 和真实卷 pilot 只在后续当前授权下执行。

## Verification

这是共享 persistence / Canonical Paper publication 变更。开发中运行专门的通用
发布 verifier 与既有 publisher failure matrix；最终运行
`pnpm -C app verify:paper`、一次 `pnpm -C app verify:all`，并按
`reviewing-code` 对冻结的 in-scope patch 做一次独立 Standards / Spec review。
若本 ticket 不改 renderer，不额外制造逐像素视觉工作；真实卷 milestone 另做受影响
Screen、Student Print、Teacher Print 和 PDF canary。

## Out of scope

- 本轮创建或修改生产账号、token、Review DB、生产数据库或 R2。
- 本轮导入、认可、发布或上线任何真实试卷。
- `/ops/` 内运行 LLM、自动唤醒 Agent、部署按钮或自动生产发布。
- 永久轮询/webhook、多 writer 协调、单卷增量部署、一键回滚产品。
- 为满足旧 package validator 伪造教学分析，或让兼容 PaperAsset 成为语义权威。

## Tickets

1. `tickets/01-universal-approved-publish.md`
2. `tickets/02-import-skill-and-state.md`
3. `tickets/03-production-agent-identity.md`
4. `tickets/04-real-paper-loop.md`

## Open questions

无。生产身份所需凭证和真实 pilot 源文件在对应 ticket 启动时由 Owner 提供；它们
不阻塞 milestone 1。
