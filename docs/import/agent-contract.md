# Agent Import Contract (NCK1)

任意本机 coding agent 导一卷 NCK1 的**唯一进场文档**。先读完本文件再动手。

所有新 NCK1 卷默认走统一入口，不再先判断格式①/②/③：

- 数据契约：`docs/product/nck1-paper-standard.md`（导题过程中不改；owner 拍板修订后以新文本为准）
- 统一入口：`node scripts/import-pipeline/universal-nck1.mjs init ...`。Agent 从不可变源生成并校验 `nck1-source-materialization-v1`；表格写语义网格，图标、条码、照片和图表按源提取配方生成媒体。随后 `verify` 派生 Candidate，`build` 只生成 digest-bound Candidate 摘要与未确认的 Teacher Confirmation 模板。完整命令见 `scripts/import-pipeline/README.md`。
- 阅读 Word 细线框（框里只有能打的字和矩形表）：写成 Canonical `framed_columns`（nck1 §8）；观感见 `docs/product/exam-paper-format-standards.md` §3c。不要截整图当 Canonical 正文，不要为单卷改 CSS。下一卷步骤见 `docs/cuts/reading-framed-columns/spec.md`「下一卷怎么干」。
- 旧格式①/②/③脚本只保留已接入存量卷回退；新卷不得向旧脚本添加 `paperId`、CONTENT 登记或 shape association 特例。

导题后台只读本契约的文件夹探针，不另建状态库。消费端网站不导题。

## 开局（owner 只给这三样）

1. 完整源文件**绝对路径**（PDF/DOCX 可混合；找卷不在范围），并标明 `question_source`、`official_answers` 或 `question_and_answers`。至少一份完整试题源和一份权威答案源。
2. `paperId`（真题如 `paper-2026-ii`；模拟卷如 `paper-mock-gd-2026-m1`）
3. 卷名与如实出处。

不匹配 `nck1-paper-standard.md` 固定 NCK1 九题组，或缺完整权威答案 → **停**。源载体和普通版式变化不是新格式，也不新增格式刀。

```bash
node scripts/import-pipeline/universal-nck1.mjs init <paperId> \
  --paper-name '<卷名>' --provenance '<出处>' \
  --source question_source=/abs/questions.docx \
  --source official_answers=/abs/answers.pdf
```

## 单 writer

同一 `paperId` 同时只允许一个 writer。发现该目录已有另一会话在写 → 停，不要并行、不要抢写。多卷并行本契约不做产品化。

## 文件夹接口（agent ↔ 导题后台）

根目录：`scripts/import-pipeline/papers/<paperId>/`。后台只读下列探针。

| 信号 | 路径 | 含义 |
| --- | --- | --- |
| 离开 `queued` | `config.json` | 已开局 |
| 切卷 / 分析中 | `groups.json` + 7× `analyze-<key>-combined.txt` / `analysis-<key>.json` | key = `reading-a` `reading-b` `reading-c` `reading-d` `seven` `cloze` `grammar` |
| 写作分析稿 | `analysis-application.json` + `analysis-continuation.json` | 新卷必交;格式③ `--publish` 硬前置 |
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

已知 `blocked.json` 原因码：`source_incomplete`（统一材料化缺页、缺权威答案、冲突或不闭合）、`canonical_unavailable`（旧入口 producer / compile 仍 fail-closed 时）、`gate_failed`（同一门禁自动修 2 次仍红）、`continuation_non_narrative`、`ship_failed`（整库 push 失败）。

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

新卷先走统一材料化缝。导题过程中**不改** `nck1-paper-standard.md` 来过闸（标准修订须 owner 另拍板后落档）。不绕闸。同一门禁最多自动修 **2** 次，仍红 → 写 `signals/blocked.json`（`gate_failed`）并停。

0. 生成 `materialization/nck1-source-materialization-v1.json`。PDF 有文本层直接转录；扫描 PDF 先 OCR 后逐页视觉复核；DOCX 直接读 XML/table/media。DOCX 正文每个源 `<w:p>` 必须一对一生成独立 `paragraph` block，并用指向该段的 `docx_part` locator；禁止把相邻段落合并，也不要把阅读 A/B/C/D 等独立篇目标记写进正文。两篇写作必须保留源顺序：题干 →（续写标题与逐段材料）→ 独立 `注意` 结构 → 框内给定标题/称呼或两条续写开头语；`注意` 保留源本来的组合段，或保留“注意：”及其后一个或多个编号段，不得为了统一视觉而合段；必须含词数且与 `wordCountTarget` 一致，源有答题格式或其他编号说明时一字不漏。续写 `material` 每项一对一对应一个源段落，给定标题、称呼和开头语不得混进题干或材料。DOCX 初始化时自动产生不可变 PDF rendition，形状绘图从 rendition 按页裁。语义表格必须为 `table`，整表截图只能作 `visual_proof`；真实图、图标、条码不得 AI 重画。用 `universal-nck1.mjs extract-docx-media` 或 `crop-pdf` 确定性生成媒体。
1. `node scripts/import-pipeline/universal-nck1.mjs verify <paperId>`。缺页、缺答案、答案冲突、未闭合表格、重复/漂移媒体或 Materialization `issues` 非空均写 `signals/blocked.json` 并停。
2. `node scripts/import-pipeline/universal-nck1.mjs build <paperId>`，产生 digest-bound Candidate 摘要与 `confirmed: false` 的 Teacher Confirmation 模板并停。只有教师在外部确认精确 source/candidate digest 后，可信边界才可生成 Canonical request；Agent 不得代确认，本步不发布。

以下旧格式编号步骤仅供已经登记的存量入口继续复现；新卷从分析、发布 dry-run 和 QA 公共门禁继续，不再执行旧切卷/producer：

1. 切卷：格式① `node scripts/import-pipeline/01-split.mjs papers/<id>/config.json`；格式② `node scripts/import-pipeline/pdf-extract.mjs <paperId>`（先按 runbook 填 `CONTENT`）；格式③ `node scripts/import-pipeline/03-split-docx-pair.mjs papers/<id>/config.json`（试题 DOCX + 答案解析 DOCX，从解析抄 `answerKey`）。
2. 7× `node scripts/import-pipeline/validate-one.mjs papers/<id>/config.json <key>`，key 同上。无子代理时**同一会话串行**写 7 组。禁止把别的 `paperId` 的分析 remap 当本卷交付。
3. **AI Answer Transcription Check**（必跑，替代人对答案）：对照源标记抄写，并与解析正确项一致。禁止 AI 解题当答案（标准 §3）。通过后写 `signals/ai-answer-check.json`。
4. 写作分析（新卷必交，见下节）。格式③缺这两份稿不得 `--publish`。
   `--publish` 成功后必须把它们写入 `latest/analyses/writing-analysis-v1.json`,
   不得只留在 `papers/` 或下一卷再丢。应用文卷面 chrome(注意块 + 框内给定
   标题、题干不粘词数)随格式③ producer 落地,见标准 §6 / 附录 A。
5. **仅格式②**：按 runbook 做 canonical 物化（`build-canonical-request.mjs` + `canonicalRequestPath`）。不要手写 Canonical Paper。格式① / 格式③本步跳过。
6. Dry-run：`node scripts/import-pipeline/02-publish.mjs papers/<id>/config.json`（**禁止** `--publish`）。
7. `node scripts/import-pipeline/verify-publish-gate.mjs <paperId>` → `"ok": true`。
8. `node scripts/import-pipeline/verify-nck1-standard.mjs <paperId>` PRE-PUBLISH → All green。
9. **格式①** 且 6–8 全绿：跑 trusted-DOCX producer，把 `config.canonicalRequestPath` 指到写出的 `canonical-import-request.json`：
   `node scripts/import-pipeline/build-trusted-docx-canonical-request.mjs <docxPath> --output-dir papers/<id>/canonical-evidence --expected-paper-id <paperId> --write`
   派生身份必须与开局 `paperId` 一致（全国一卷 `paper-YYYY-i`；浙江 1 月答案版 `paper-zj-YYYY-jan`）。不要手写 Canonical Paper，不要套用格式② PDF envelope。producer / compile 仍失败 → 写 `signals/blocked.json`，`code` = `canonical_unavailable`，停。**不得发明临时映射。**
   **格式③** 且 6–8 全绿：跑 DOCX-pair producer（开局 `paperId` 必填；不得占用 `paper-YYYY-i` / `paper-zj-YYYY-jan`）：
   `node scripts/import-pipeline/build-docx-pair-canonical-request.mjs <试题.docx> <答案解析.docx> --output-dir papers/<id>/canonical-evidence --expected-paper-id <paperId> --write`
   身份以开局 `paperId` 为准，不按标题派生。不要手写 Canonical Paper，不要套用格式① trusted-DOCX 或格式② PDF envelope。producer / compile 仍失败 → 写 `signals/blocked.json`，`code` = `canonical_unavailable`，停。
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

权威在本仓库。新卷必须按下面交稿，不要发明替代合同，也不要只改当前这一套。消费端讲评已能展示应用文 ReviewCard 与续写 `continuationAnalysis`；旧卷迁移仍是后续工作。

- **应用文**：先读 `docs/product/application-writing-doctrine-v1.md` 与 `prompts/application-writing-model-answer-v3.md`（agent 入口：`prompts/application-writing-agent-entrypoint.md`）。落盘 `modelAnswer` + 完整 ReviewCard（11 项：`form` `topic` `reader` `person` `tense` `type` 两个 `points` `readerWho` `readerCares` `readerWants` `value`）+ 源有则 `officialModelAnswer`。交际对象推演是生成决策，不新增 ReviewCard 字段。新卷不要求亮点。完整 payload 时点击答题框打开讲评：框内按顺序叠放「AI 参考范文」与可选「官方范文」，右栏只 ReviewCard。不新增 tab，不按 2022-i / 2024-i 白名单决定入口。
- **读后续写**：先读 `docs/product/continuation-writing-analysis-contract-v1.md` 与 `prompts/continuation-analysis-v1.md`。落盘 `continuationAnalysis` / `continuation-analysis-v1` 五段（`storyUnderstanding`、`continuationContract`、`narrativeDevelopment`、`languageAlignment`、`paragraphBlueprint`）+ `modelAnswer`。形状闸：`node scripts/verify-continuation-analysis-v1.mjs` 所锁的 schema（`schemas/paper-import/continuation-analysis-v1.schema.json`）。只覆盖记叙型；说明 / 议论型停，写 `signals/blocked.json`（`continuation_non_narrative`）或 `help-needed.json`。旧 `continuationDesign` 只认历史资产。

## 导题后台

本机只读面，与消费端 `app/` 分离：`import-ops/`（`node import-ops/server.mjs`，默认 `http://127.0.0.1:8790`）。无对答案 UI，无生产按钮，不跑 pull-run-push。可上线后只展示口令（`上线 paper-<id>`）；`ship_failed` 时展示 `重试上线 paper-<id>`。

## 禁止

网站消费端改动；恢复网站导入 UI；后台直连 LLM API；单卷增量传输；导题时为过闸改 nck1 标准；格式①临时 canonical 映射；清单未允许时跑 `pull-run-push`；未获当前 owner 口头「上线」/「重试上线」动生产；为下一道同类 Word 细线框改 PaperSurface / print-renderer。
