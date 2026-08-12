# Agent Import Contract (NCK1)

任意本机 coding agent 导一卷 NCK1 的**唯一进场文档**。先读完本文件再动手。

机械步骤不要在本文件展开，按格式链到：

- 数据契约（只读，禁止改）：`docs/product/nck1-paper-standard.md`
- 格式②（PDF 试题卷 + 独立答案 PDF）逐步 how-to：`docs/import/agent-runbook.md`
- 格式①（DOCX 答案版）切卷 / 校验 / 打包工序：`scripts/import-pipeline/README.md` stages 1–5，以及 runbook 里与格式无关的门禁（`validate-one`、dry-run、`verify-publish-gate`、`verify-nck1`、`--publish` 纪律）

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
| 已上线 | `signals/shipped.json` | 本机 ship 收据；上线清单见后续切片，本契约只定文件名 |

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

已知 `blocked.json` 原因码：`canonical_unavailable`（格式①在 canonical 物化修好前）、`gate_failed`（同一门禁自动修 2 次仍红）、`continuation_non_narrative`、`ship_failed`（上线失败；本切片不跑上线）。

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
5. **仅格式②**：按 runbook 做 canonical 物化（`build-canonical-request.mjs` + `canonicalRequestPath`）。不要手写 Canonical Paper。
6. Dry-run：`node scripts/import-pipeline/02-publish.mjs papers/<id>/config.json`（**禁止** `--publish`）。
7. `node scripts/import-pipeline/verify-publish-gate.mjs <paperId>` → `"ok": true`。
8. `node scripts/import-pipeline/verify-nck1-standard.mjs <paperId>` PRE-PUBLISH → All green。
9. **格式① 到此必须停。禁止 `--publish`。** 即使 dry-run / publish-gate 绿，缺 canonical 时 `--publish` 仍可能 exit 0。写 `signals/blocked.json`，`code` = `canonical_unavailable`。缺口实现票：`docs/cuts/import-agentization/tickets/01-format-1-canonical-materialization.md`。**不得发明临时映射。**
10. **仅格式②** 且 6–8 全绿：按 runbook 停本地 API → `--publish` → 重启 API → `attach-paper-assets-extras` → POST `verify-nck1` → ledger。本地成功 **只** 以 `app/public/paper-assets/<id>/latest/` 为准。
11. 本地 publish 成功后 **停**。不替人点 QA，不自动 push，不跑 `scripts/pull-run-push.mjs`。

## 停点

- **不对答案（人）。** 答案随解析字段做全；托底是 AI Answer Transcription Check。
- **上线前 QA（人）必留。** Owner 在导题后台看 Screen / Student Print / Teacher Print 和门禁一行。不设 7 组解析必过抽检。Owner 说 QA 通过之后才写 `signals/qa-accepted.json`。
- **上线。** 本切片不做。未 `ready_to_ship` 不得 push。导题后台无生产按钮。owner 必须另说「上线」；命令是整库 `node scripts/pull-run-push.mjs push`，不是单卷增量，也不是 `deploy.sh`。动生产前读 `docs/cuts/launch-deploy/go-live-record.md`，且必须有**当前**口头授权。

## 写作分析（新卷必交）

跟新合同。权威稿目前在工作树 `wt-continuation-analysis-research-20260809`，**尚未合入 `main`**。禁止为了导题把那棵树合进 `main`。持久化 / UI / 旧资产迁移是后续切片。本卷仍须按下面字段交稿；生成准则文件若本树没有，读那棵工作树，不要发明替代合同。

- **应用文**：`docs/product/application-writing-doctrine-v1.md` + Prompt V3。落盘 `modelAnswer` + 完整 ReviewCard（11 项：`form` `topic` `reader` `person` `tense` `type` 两个 `points` `readerWho` `readerCares` `readerWants` `value`）+ 源有则 `officialModelAnswer`。交际对象推演是生成决策，不新增 ReviewCard 字段。新卷不要求亮点。
- **读后续写**：`continuationAnalysis` / `continuation-analysis-v1` 五段（`storyUnderstanding`、`continuationContract`、`narrativeDevelopment`、`languageAlignment`、`paragraphBlueprint`）+ `modelAnswer`。只覆盖记叙型；说明 / 议论型停，写 `signals/blocked.json`（`continuation_non_narrative`）或 `help-needed.json`。旧 `continuationDesign` 只认历史资产。

## 导题后台

本机只读面，与消费端 `app/` 分离：`import-ops/`（`node import-ops/server.mjs`，默认 `http://127.0.0.1:8790`）。无对答案 UI，无生产按钮，不跑 pull-run-push。

## 禁止

网站消费端改动；恢复网站导入 UI；后台直连 LLM API；单卷增量传输；改 nck1 标准；格式①临时 canonical 映射；未获当前 owner 授权动生产。
