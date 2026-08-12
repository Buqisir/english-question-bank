# 导题 Agent 化

Status: accepted  
Accepted: 2026-08-12 by owner  
Wayfinder: `docs/cuts/import-agentization/wayfinder/map.md`  
Date: 2026-08-12

## Problem

导一套 NCK1 真题今天仍要一个人盯完整条 runbook。owner 要的是：任意本机
coding agent（以后主要跑 Grok）按一份标准契约独立导完一卷；自己只在导题
后台做上线前 QA，再说一次「上线」，内容才到 eqbank.cc 消费端。

## User outcome

源文件已在磁盘上时，owner 丢给 agent 三样东西（路径、`paperId`、格式①或②），
走开。回来时导题后台能看见进度；待 QA 时看 Screen / Print / 门禁绿灯；说
「上线」后 agent 跑现有整库 push。不对答案表，不在网站上导题，不接 LLM API。

## User stories

1. As owner，我要任意本地 agent 按同一份契约导一卷 NCK1，以便我不泡在 runbook 里。
2. As owner，我要导题后台只读文件夹就能看出卡在哪，以便只处理待 QA 和失败。
3. As owner，我要上线前自己看一眼卷面，以便错卷不上生产。
4. As owner，我要口头授权后才整库 push，以便生产变更仍是我点头，而不是后台偷推。

## Accepted decisions

### 范围

- 先收口现有 NCK1 整卷管线。新源格式（地方卷旧刀、模拟卷、单题组、扫描件）
  不在本 spec。
- 分析用本机 agent 会话，不用后台直连 LLM API。
- 网站只消费。导题后台不是网站导入 UI 的复活。
- 找卷不在范围内：从「源已在本机磁盘」起。
- 本 spec 定形态。契约文档、导题后台、canonical 物化、写作新合同合入 `main`
  都是后续实现。

### Agent 契约

- 唯一进场文档：`docs/import/agent-contract.md`（实现时写）。机械步骤链到
  `docs/import/agent-runbook.md` 与 `scripts/import-pipeline/README.md`。
- 开局信息：源绝对路径 + `paperId` + 格式①（DOCX 答案版）或②（PDF + 答案 PDF）。
- 同一 `paperId` 同时只一个 writer。多卷并行本 spec 不做产品化。
- 无子代理时允许同一会话串行写 7 组客观题分析。禁止把别的 `paperId` 分析
  remap 当本卷交付。
- 格式①在 canonical producer / 身份规则修好之前 **禁止 `--publish`**。停在
  dry-run + publish-gate 绿，写 `signals/blocked.json`（如
  `canonical_unavailable`）。不得发明临时映射。
- 硬门禁：按格式跑 `01-split` 或 `pdf-extract` → 7× `validate-one` →
  AI Answer Transcription Check →（格式②）canonical 物化 → dry-run →
  `verify-publish-gate` → publish 前 `verify-nck1` → `--publish` → post
  verify。同一门禁最多自动修 2 次，仍红则 blocked，不改标准、不绕闸。
- 完成信号禁止只看进程 exit code（缺 canonical 时 `--publish` 仍可能 exit 0）。
  本地 publish 成功以 `app/public/paper-assets/<id>/latest` 为准。

### 文件夹接口（agent ↔ 导题后台）

后台不另建状态库。读：

| 信号 | 路径 |
| --- | --- |
| 离开 queued | `scripts/import-pipeline/papers/<id>/config.json` |
| 切卷 / 分析中 | `groups.json` + 7× `analyze-*` / `analysis-*` |
| 答案复核过 | `papers/<id>/signals/ai-answer-check.json` |
| 本地已 publish | `app/public/paper-assets/<id>/latest` |
| 卡死 | `papers/<id>/signals/blocked.json` |
| 要人裁决（非例行 QA） | `papers/<id>/signals/help-needed.json` |
| 已上线 | 本机 ship 收据（实现时定文件名，建议 `signals/shipped.json`） |

### 状态

`queued` → `importing`（含 AI 答案复核）→ `awaiting_qa` → `ready_to_ship` →
`shipped`，或任意步 `failed`。

### 确认点

- **不对答案（人）。** 答案随解析字段做全。必跑 **AI Answer Transcription Check**：
  对照源标记抄写 / 与解析正确项一致。禁止 AI 解题当答案（`nck1-paper-standard.md`
  §3）。
- **上线前 QA（人）必留。** 看 Screen 预览、Student/Teacher Print、门禁绿灯一行。
  不设 7 组解析必过抽检。
- Agent 在本地 publish 后停。不替人点 QA，不自动 push。

### 写作分析（新卷必交）

权威稿目前在工作树 `wt-continuation-analysis-research-20260809`，尚未合入
`main`。导题跟新合同；持久化 / UI / 旧资产迁移是后续实现。

- **应用文**：`docs/product/application-writing-doctrine-v1.md` + Prompt V3。
  落盘 `modelAnswer` + 完整 ReviewCard（11 项）+ 源有则 `officialModelAnswer`。
  交际对象推演是生成决策，不新增 ReviewCard 字段。新卷不要求亮点。
- **读后续写**：`continuationAnalysis` / `continuation-analysis-v1` 五段
  （`storyUnderstanding`、`continuationContract`、`narrativeDevelopment`、
  `languageAlignment`、`paragraphBlueprint`）+ `modelAnswer`。只覆盖记叙型；
  说明 / 议论型停并 blocked。旧 `continuationDesign` 只认历史资产。

### 导题后台

- 正式名：**导题后台**。Owner-only 本机 Web，与消费端 `app/` 运行时分离。
- 实现落在**独立本地目录**，不进消费端 `app/`。技术栈本 spec 不锁。
- 首页：待 QA、失败、最近导入。不做统计仪表盘。
- 详情：文件探针、QA 入口、失败原因。无答案表。无生产按钮。
- 可上线后只展示口令，例如：`上线 paper-<id>`。
- 共识形态（抛弃式）：`docs/cuts/import-agentization/prototypes/import-ops-console.html`

### 上线

- 命令：`node scripts/pull-run-push.mjs push`。整份 `question-bank.sqlite`
  替换 + `app/public/paper-assets/` 加性同步。不是单卷增量，不是
  `deploy.sh`（那条管代码）。
- 硬前置：该卷 `ready_to_ship`。ledger 只提示不挡。
- 授权：QA 之后 owner 必须另说「上线」。跑前 agent 摊开：目标机、整库替换、
  本机其他未上线改动会一并上去、SQLite 有远端 `.bak.<stamp>`、assets 无自动回滚。
- 失败：`signals/blocked.json` 原因码 `ship_failed`。生产服务可能停在
  stopped，先拉起再谈重试。重试仍要口头「重试上线」。
- 推错：SQLite 人工用 bak 退；assets 人工覆盖或删远端目录。无产品化撤销按钮。
- 动生产前读 `docs/cuts/launch-deploy/go-live-record.md`，且必须有当前
  owner 授权（`AGENTS.md`）。

## Test seams

- Agent 契约：给定源 + paperId + 格式，产物落点与 signals 可文件探针；格式①
  无 canonical 时不得出现 `latest`；remap 他卷分析不得算完成。
- 导题后台：只读上述探针即可区分六态；无上线按钮。
- 上线：未 `ready_to_ship` 时 agent 拒绝 push；失败留下 `ship_failed`。

## Out of scope

- 找卷、网站消费端改动、恢复网站导入 UI、后台 LLM API、单卷增量传输、
  一键回滚产品、多 agent 写锁、说明/议论型续写、把写作新合同在本 cut 合入
  `main`。

## QA

- 导题后台可见行为：实现后按 `docs/agents/owner-qa-handoff-template.md` 做
  精确页 Owner QA。
- 上线：每次生产 push 仍要当前口头授权 + go-live-record。

## 执行切片（spec 接受后，不在本图内做）

1. 写 `docs/import/agent-contract.md`，并把格式① canonical 缺口标成实现票。
2. 最小导题后台：独立目录、读文件夹显示六态、待 QA 详情（Screen/Print 入口）。
3. 写作新合同合入 `main` 并接到契约必交（应用文 V3 / 续写 `continuationAnalysis`）。
4. 格式① canonical 物化或身份规则，使 DOCX 答案版可 `--publish`。
5. ship 收据 + agent 上线确认清单（仍无后台按钮）。

## Open questions

无。雾区见 wayfinder map「Not yet specified」，不挡本 spec 接受。
