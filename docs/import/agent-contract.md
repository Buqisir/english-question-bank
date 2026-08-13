# Agent Import Contract (NCK1)

任意本机 coding agent 导一卷 NCK1 的**唯一进场文档**。先读完本文件再动手。

机械步骤不要在本文件展开，按格式链到：

- 数据契约（只读，禁止改）：`docs/product/nck1-paper-standard.md`
- 格式②（PDF 试题卷 + 独立答案 PDF）逐步 how-to：`docs/import/agent-runbook.md`
- 格式①（DOCX 答案版）切卷 / 校验 / 打包工序：`scripts/import-pipeline/README.md` stages 1–5，以及 runbook 里与格式无关的门禁（`validate-one`、dry-run、`verify-publish-gate`、`verify-nck1`、`--publish` 纪律）。canonical 物化用 `scripts/import-pipeline/build-trusted-docx-canonical-request.mjs`，不要套用格式② PDF producer。

导题后台只读本契约的文件夹探针，不另建状态库。消费端网站不导题。

## 开局（owner 只给这三样）

1. 源文件**绝对路径**（已在本机磁盘；找卷不在范围）
2. `paperId`（如 `paper-2026-ii`）
3. 格式：**①** DOCX 答案版，或 **②** PDF 试题卷 + 独立答案 PDF

不匹配 `nck1-paper-standard.md` §2 白名单 → **停**。不要发明第三种格式。

## 单 writer

同一 `paperId` 同时只允许一个 writer。发现该目录已有另一会话在写 → 停，不要并行、不要抢写。多卷并行本契约不做产品化。

## 文件夹接口（agent ↔ 导题后台）

根目录：`scripts/import-pipeline/papers/<paperId>/`。后台只读下列探针。

| 信号 | 路径 | 含义 |
| --- | --- | --- |
| 离开 `queued` | `config.json` | 已开局 |
| 切卷 / 分析中 | `groups.json` + 7× `analyze-<key>-combined.txt` / `analysis-<key>.json` | key = `reading-a` `reading-b` `reading-c` `reading-d` `seven` `cloze` `grammar` |
| 答案复核过 | `signals/ai-answer-check.json` | AI Answer Transcription Check 已过 |
| 本地已 publish | `app/public/paper-assets/<paperId>/latest/`（目录存在） | **唯一**本地 publish 成功信号 |
| 卡死 | `signals/blocked.json` | 硬停；见原因码 |
| 要人裁决（非例行 QA） | `signals/help-needed.json` | 例如非记叙型续写、格式不在白名单 |
| 上线前 QA 已过 | `signals/qa-accepted.json` | 仅在 owner 说过 QA 通过之后写 |
| 已上线 | `signals/shipped.json` | 本机 ship 收据；见「上线」清单 |

`signals/` 下是小 JSON 收据，不要把答案表或全文写进去。

### 收据形状

`signals/ai-answer-check.json`：

```json
{ "ok": true, "checkedAt": "<ISO-8601>", "method": "source-markings-vs-answerKey" }
```

`signals/blocked.json`：

```json
{ "code": "canonical_unavailable", "at": "<ISO-8601>", "note": "<one line>" }
```

`signals/help-needed.json`：

```json
{ "question": "<owner must decide>", "at": "<ISO-8601>" }
```

`signals/qa-accepted.json`：

```json
{ "acceptedAt": "<ISO-8601>", "by": "owner" }
```

`signals/shipped.json`：

```json
{ "shippedAt": "<ISO-8601>", "command": "node scripts/pull-run-push.mjs push" }
```

已知 `blocked.json` 原因码：`canonical_unavailable`（格式① producer / compile 仍 fail-closed 时）、`gate_failed`（同一门禁自动修 2 次仍红）、`continuation_non_narrative`、`ship_failed`（整库 push 失败）。

## 六态

`queued` → `importing`（含 AI 答案复核）→ `awaiting_qa` → `ready_to_ship` → `shipped`，或任意步 `failed`。

后台按探针判定，不看进程 exit code：

| 状态 | 判定 |
| --- | --- |
| `queued` | 卷目录或源已在，尚无 `config.json` |
| `importing` | 有 `config.json`，尚无 `latest/`，无 `blocked.json` |
| `awaiting_qa` | 有 `latest/` 且有 `signals/ai-answer-check.json`，无 QA 收据、无 `shipped.json`、无 `blocked.json` |
| `ready_to_ship` | 上条 + `signals/qa-accepted.json` |
| `shipped` | 有 `signals/shipped.json` |
| `failed` | 有 `signals/blocked.json`（且未 shipped） |

`help-needed.json` 不是独立状态，叠在当前态上等人。

## 硬门禁

按格式跑，**不改** `nck1-paper-standard.md`，不绕闸。同一门禁最多自动修 **2** 次，仍红 → 写 `signals/blocked.json`（`gate_failed`）并停。

1. 切卷：格式① `node scripts/import-pipeline/01-split.mjs papers/<id>/config.json`；格式② `node scripts/import-pipeline/pdf-extract.mjs <paperId>`（先按 runbook 填 `CONTENT`）。
2. 7× `node scripts/import-pipeline/validate-one.mjs papers/<id>/config.json <key>`，key 同上。无子代理时**同一会话串行**写 7 组。禁止把别的 `paperId` 的分析 remap 当本卷交付。
3. **AI Answer Transcription Check**（必跑，替代人对答案）：对照源标记抄写，并与解析正确项一致。禁止 AI 解题当答案（标准 §3）。通过后写 `signals/ai-answer-check.json`。
4. 写作分析（新卷必交，见下节）。
5. **仅格式②**：按 runbook 做 canonical 物化（`build-canonical-request.mjs` + `canonicalRequestPath`）。不要手写 Canonical Paper。格式①本步跳过。
6. Dry-run：`node scripts/import-pipeline/02-publish.mjs papers/<id>/config.json`（**禁止** `--publish`）。
7. `node scripts/import-pipeline/verify-publish-gate.mjs <paperId>` → `"ok": true`。
8. `node scripts/import-pipeline/verify-nck1-standard.mjs <paperId>` PRE-PUBLISH → All green。
9. **格式①** 且 6–8 全绿：跑 trusted-DOCX producer，把 `config.canonicalRequestPath` 指到写出的 `canonical-import-request.json`：
   `node scripts/import-pipeline/build-trusted-docx-canonical-request.mjs <docxPath> --output-dir papers/<id>/canonical-evidence --expected-paper-id <paperId> --write`
   派生身份必须与开局 `paperId` 一致（全国一卷 `paper-YYYY-i`；浙江 1 月答案版 `paper-zj-YYYY-jan`）。不要手写 Canonical Paper，不要套用格式② PDF envelope。producer / compile 仍失败 → 写 `signals/blocked.json`，`code` = `canonical_unavailable`，停。**不得发明临时映射。**
10. 6–8 全绿且 `canonicalRequestPath` 可被 `loadCanonicalImportRequest` 加载：按 runbook 停本地 API → `--publish` → 重启 API →（格式②）`attach-paper-assets-extras` → POST `verify-nck1` → ledger。缺该 request 时不得把该卷当成已 publish。本地成功 **只** 以 `app/public/paper-assets/<id>/latest/` 为准。
11. 本地 publish 成功后 **停**。不替人点 QA，不自动 push，不跑 `scripts/pull-run-push.mjs`。

## 停点

- **不对答案（人）。** 答案随解析字段做全；托底是 AI Answer Transcription Check。
- **上线前 QA（人）必留。** Owner 在导题后台看 Screen / Student Print / Teacher Print 和门禁一行。不设 7 组解析必过抽检。Owner 说 QA 通过之后才写 `signals/qa-accepted.json`。
- **上线。** 本地 publish 后停。未 `ready_to_ship` 不得 push。导题后台无生产按钮。owner 必须**当前**另说「上线」之后，才按下一节清单执行。

## 上线

可执行清单（本身**不**跑 push、不连生产）：

```bash
node scripts/import-pipeline/ship-checklist.mjs check <paperId> --owner-said-ship
```

仅当该命令打印「允许」时，agent 才可以跑整库：

```bash
node scripts/pull-run-push.mjs push
```

不是单卷增量，不是 `deploy.sh`。导题后台只展示口令，不跑这条命令。

### 硬前置

该卷必须是 `ready_to_ship`：`app/public/paper-assets/<id>/latest/` + `signals/ai-answer-check.json` + `signals/qa-accepted.json`，且没有挡住的 `blocked.json`。ledger 只提示不挡。未 `ready_to_ship` → 清单拒绝，**不得** push。

重试：仅当 `blocked.json` 的 `code` 为 `ship_failed`，上列三件仍在，且 owner **当前**口头说「重试上线」：

```bash
node scripts/import-pipeline/ship-checklist.mjs check <paperId> --owner-said-retry-ship
```

口令「上线」不能当重试。生产服务可能停在 stopped，先拉起再谈重试。

### 授权

QA 之后 owner 必须另说「上线」（当前口头，不是历史聊天里的旧句）。导题后台可上线时只展示口令，例如 `上线 paper-<id>`；`ship_failed` 时展示 `重试上线 paper-<id>`。没有当前口头授权就不要跑 push。

`--owner-said-ship` / `--owner-said-retry-ship` 只表示 agent 已听到**这一次**口头授权。不得在 owner 没说时自行加上。

### 跑前必须摊开（对 owner 复述；清单也会打印）

1. 目标机：生产 eqbank.cc（`EQB_REMOTE`；远端仓库默认 `/opt/eqb/english-question-bank`）。先读 `docs/cuts/launch-deploy/go-live-record.md`。
2. 整份 `data/question-bank.sqlite` 替换；`app/public/paper-assets/` 加性同步。
3. 本机其他未上线改动会一并上去。
4. SQLite 远端会留下 `.bak.<stamp>`；推错人工用 bak 退。
5. assets 无自动回滚；推错人工覆盖或删远端目录。
6. 中途失败时生产服务可能停在 stopped。

### 收据

- 成功：`node scripts/import-pipeline/ship-checklist.mjs record-shipped <paperId>` → `signals/shipped.json`
- 失败：`node scripts/import-pipeline/ship-checklist.mjs record-failed <paperId>` → `signals/blocked.json`，`code` = `ship_failed`

## 写作分析（新卷必交）

权威在本仓库。持久化到消费端资产 / UI / 旧卷迁移仍是后续工作；新卷必须按下面交稿，不要发明替代合同。

- **应用文**：先读 `docs/product/application-writing-doctrine-v1.md` 与 `prompts/application-writing-model-answer-v3.md`（agent 入口：`prompts/application-writing-agent-entrypoint.md`）。落盘 `modelAnswer` + 完整 ReviewCard（11 项：`form` `topic` `reader` `person` `tense` `type` 两个 `points` `readerWho` `readerCares` `readerWants` `value`）+ 源有则 `officialModelAnswer`。交际对象推演是生成决策，不新增 ReviewCard 字段。新卷不要求亮点。
- **读后续写**：先读 `docs/product/continuation-writing-analysis-contract-v1.md` 与 `prompts/continuation-analysis-v1.md`。落盘 `continuationAnalysis` / `continuation-analysis-v1` 五段（`storyUnderstanding`、`continuationContract`、`narrativeDevelopment`、`languageAlignment`、`paragraphBlueprint`）+ `modelAnswer`。形状闸：`node scripts/verify-continuation-analysis-v1.mjs` 所锁的 schema（`schemas/paper-import/continuation-analysis-v1.schema.json`）。只覆盖记叙型；说明 / 议论型停，写 `signals/blocked.json`（`continuation_non_narrative`）或 `help-needed.json`。旧 `continuationDesign` 只认历史资产。

## 导题后台

本机只读面，与消费端 `app/` 分离：`import-ops/`（`node import-ops/server.mjs`，默认 `http://127.0.0.1:8790`）。无对答案 UI，无生产按钮，不跑 pull-run-push。可上线后只展示口令（`上线 paper-<id>`）；`ship_failed` 时展示 `重试上线 paper-<id>`。

## 禁止

网站消费端改动；恢复网站导入 UI；后台直连 LLM API；单卷增量传输；改 nck1 标准；格式①临时 canonical 映射；清单未允许时跑 `pull-run-push`；未获当前 owner 口头「上线」/「重试上线」动生产。
