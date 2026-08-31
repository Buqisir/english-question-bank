# Agent Import Contract (NCK1)

任意 Amp Project Orb 导一卷 NCK1 的**唯一进场文档**。先读完本文件再动手。
项目级 `importing-nck1-papers` skill 会在导题、继续某卷、审核返工、状态查询和
认可后上线准备任务中自动触发；Owner 不需要记命令。Agent 每次先运行只读
`review.mjs preflight <paperId>`，再从返回的唯一状态恢复。

所有新 NCK1 卷默认走统一入口，不再先判断格式①/②/③：

- 数据契约：`docs/product/nck1-paper-standard.md`（导题过程中不改；owner 拍板修订后以新文本为准）
- 统一入口：先运行 `node scripts/import-pipeline/universal-nck1.mjs preflight`，一次性确认 magick、ffmpeg、soffice、PDF 工具、unzip 的可执行与动态链接健康；处理中途禁止安装或升级依赖。`init` 也会先执行同一检查。对于一份试题 DOCX + 一份权威答案 DOCX，`materialize <paperId>` 用受测 producer 从不可变源生成并校验 `nck1-source-materialization-v1`；表格写语义网格，图标、条码、照片和图表按源提取配方生成媒体。随后 `verify` 派生 Candidate，`build` 生成 digest-bound Candidate 摘要；Agent 必须生产并验证 4× reading、seven、cloze、grammar、application、continuation 共九份教学分析，才可由 `review.mjs push` 上传绑定全部原始 bytes 和 `analysisDigest` 的不可变审核 revision。Owner 在 `/ops/?view=review` 真实 Screen/Print/PDF 审核并认可精确摘要后，Agent 停下；认可不公开。只有 Owner 后来在当前对话明确说“上线 <paperId>”，Agent 才用独立 shipping credential 调 `review.mjs promote`，由生产服务端从同一不可变 revision 原子发布这一卷。完整命令见 `scripts/import-pipeline/README.md`。
- 阅读 Word 细线框（框里只有能打的字和矩形表）：写成 Canonical `framed_columns`（nck1 §8）；观感见 `docs/product/exam-paper-format-standards.md` §3c。不要截整图当 Canonical 正文，不要为单卷改 CSS。下一卷步骤见 `docs/cuts/reading-framed-columns/spec.md`「下一卷怎么干」。
- 旧格式①/②/③脚本只保留已接入存量卷回退；新卷不得向旧脚本添加 `paperId`、CONTENT 登记或 shape association 特例。

导题审核使用独立 Review DB 与文件目录作为 QA 事实源；Candidate 不进入正式题库。
消费端网站不导题，`/ops/` 只做人工审核与 Agent 反馈，不运行 LLM。

## 开局（owner 只给这三样）

1. 完整源文件**绝对路径**，并标明 `question_source`、`official_answers` 或
   `question_and_answers`。正常导入至少一份完整试题源和一份权威答案源；若暂时只有题卷，
   走下述source-only暂存，不进入普通导入状态机。
2. 完整source set才分配`paperId`（真题如 `paper-2026-ii`；模拟卷如
   `paper-mock-gd-2026-m1`）。只有题卷时先使用通用`sourceSetId`，不为单卷造paperId特例。
3. 卷名与如实出处。

不匹配 `nck1-paper-standard.md` 固定 NCK1 九题组 → **停**。缺完整权威答案时只允许
source-only暂存后停；不得Materialize、上传Review、AI解题或发布。源载体和普通版式变化
不是新格式，也不新增格式刀。

```bash
node scripts/import-pipeline/universal-nck1.mjs preflight
node scripts/import-pipeline/universal-nck1.mjs init <paperId> \
  --paper-name '<卷名>' --provenance '<出处>' \
  --source question_source=/abs/questions.docx \
  --source official_answers=/abs/answers.pdf
```

若题卷和答案确实在同一个DOCX/PDF中，改用一个
`--source question_and_answers=/abs/paper-with-answers.pdf`。producer只在完整写作题后找到
恰好一个明确答案heading时拆分；无heading、双heading或位置不明返回
`NCK1_COMBINED_SOURCE_BOUNDARY_AMBIGUOUS`并停，禁止按“后半文件大概是答案”猜。

权威答案文件可以是纯答案键，也可以附带逐题详解/写作范文；两者都只生成同一套完整
21–65答案值。逐题详解和答案文件中的写作范文不进入Materialization、Candidate或教师版，
原文件bytes/digest仍作为Source Capture证据保留。只有ABCD而缺56–65文本答案仍不完整；
答案值与解释边界不清时必须停。听力原文继续按独立listening contract处理。

只有题卷时，先安全保留来源；图片页改用重复的
`--source-page question_source:<页码>=/abs/page.png`：

```bash
node scripts/import-pipeline/universal-nck1.mjs capture-source-only <sourceSetId> \
  --paper-name '<卷名>' --provenance '<题卷出处>' \
  --source question_source=/abs/questions.pdf
node scripts/import-pipeline/universal-nck1.mjs source-only-status <sourceSetId>
node scripts/import-pipeline/universal-nck1.mjs list-source-only
```

它写入gitignored `imports/source-only/`，保留原bytes、页序和digest，但不生成config、
Materialization、Candidate或Review revision。以后找到权威答案，再显式绑定status给出的
`questionSetDigest`并创建新的完整source set；旧`capture.json`和题卷bytes不修改：

```bash
node scripts/import-pipeline/universal-nck1.mjs attach-answers \
  <sourceSetId> <newPaperId> \
  --question-set-digest 'sha256:…' --answer-provenance '<答案出处>' \
  --source official_answers=/abs/answers.pdf
```

该命令只确认“调用方把这份答案绑定到哪份不可变题卷”，不猜答案是否属于该卷；新的
complete set仍必须通过正常Materialization、答案覆盖检查和Owner Review。

## 单 writer

同一 `paperId` 同时只允许一个 writer。发现该目录已有另一会话在写 → 停，不要并行、不要抢写。多卷并行本契约不做产品化。
应用文与续写的写作分析可以并行做纯读取，最后仍由该卷唯一 writer 汇总；不得以多 writer 绕过 Materialization、revision 或认可合同。

## Orb 算力边界

自动 source-intake worker 使用私有 Project Orb，并继承专用导题 Amp Project 的默认 Orb
规格；当前 plugin `createThread` 接口只选择 `executor: 'orb'`，不能逐任务传 `orbSize`。
扫描/部分文本层 PDF、有序图片页、逐页 raster/OCR evidence、媒体提取和多面渲染验证
使用默认 `a1.xxlarge` 的高算力 lane；原生 DOCX 和可靠文本层 PDF 属普通 lane。Agent
开工时记录 `os.availableParallelism()`；16 表示预期 16 核可用。少于 16 只作效率告警，
不得因此放宽内容门禁、转移已绑定 claim 或重复导入。

可并行的只有互不写同一状态、输出路径唯一的逐页读取/转换/复核工作；并发必须有界并
给 Agent 与系统工具留余量。Materialization、`verify`、`build`、revision、lease、handoff
和 promotion 继续由该卷唯一 writer 串行提交。CPU 只加速本地文档处理，不提高 AI
答案权威，也不替代扫描件逐页视觉复核。

## 文件夹接口（agent ↔ 导题后台）

根目录：`scripts/import-pipeline/papers/<paperId>/`。后台只读下列探针。

| 信号 | 路径 | 含义 |
| --- | --- | --- |
| 进入 `materializing` | `config.json` | 已开局 |
| 教学分析中 | 4× `analysis-reading-{a,b,c,d}.json` + `analysis-seven.json` + `analysis-cloze.json` + `analysis-grammar.json` + `analysis-application.json` + `analysis-continuation.json` | 通用新卷九份全部是 `review.mjs push` 硬前置；原始 bytes 进入不可变 revision |
| 答案复核过 | `signals/ai-answer-check.json` | AI Answer Transcription Check 已过 |
| 卡死 | `signals/blocked.json` | 硬停；见原因码 |
| 要人裁决（非例行 QA） | `signals/help-needed.json` | 例如非记叙型续写、格式不在白名单 |
| 网页 QA 已过 | `signals/qa-accepted.json` | 仅由 `review.mjs accept` 按认可摘要写 |
| 旧本地 publish（兼容） | `signals/locally-published.json` + 同版本 `latest/` | 仅供离线验证/存量恢复；不再是 Review-backed 生产上线前置 |
| 已上线 | Review API `promotion.state=published` | 服务端绑定 approval/revision/digests/vN 的正式审计收据 |

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
{
  "schemaVersion": "web-import-review-qa-accepted-v1",
  "acceptedAt": "<ISO-8601>",
  "by": "<owner account>",
  "approvalId": "approval-…",
  "revisionId": "rev-…",
  "sourceDigest": "sha256:…",
  "candidateDigest": "sha256:…",
  "visibleStructureDigest": "sha256:…",
  "analysisDigest": "sha256:…",
  "bundleDigest": "sha256:…"
}
```

`signals/locally-published.json`：

```json
{
  "schemaVersion": "universal-nck1-local-publication-v1",
  "publishedAt": "<ISO-8601>",
  "approvalId": "approval-…",
  "revisionId": "rev-…",
  "sourceDigest": "sha256:…",
  "candidateDigest": "sha256:…",
  "visibleStructureDigest": "sha256:…",
  "analysisDigest": "sha256:…",
  "bundleDigest": "sha256:…",
  "assetVersion": 1,
  "versionName": "v1",
  "canonicalPublicationDigest": "sha256:…"
}
```

`signals/shipped.json`：

```json
{
  "schemaVersion": "nck1-import-shipped-v1",
  "paperId": "<paperId>",
  "shippedAt": "<ISO-8601>",
  "command": "node scripts/pull-run-push.mjs push <paperId> --owner-said-ship",
  "approvalId": "<approvalId>",
  "revisionId": "<revisionId>",
  "sourceDigest": "sha256:…",
  "candidateDigest": "sha256:…",
  "visibleStructureDigest": "sha256:…",
  "analysisDigest": "sha256:…",
  "bundleDigest": "sha256:…",
  "assetVersion": 1,
  "versionName": "v1",
  "canonicalPublicationDigest": "sha256:…"
}
```

已知 `blocked.json` 原因码：`source_incomplete`（统一材料化缺页、缺权威答案、冲突或不闭合）、`canonical_unavailable`（旧入口 producer / compile 仍 fail-closed 时）、`gate_failed`（同一门禁自动修 2 次仍红）、`continuation_non_narrative`、`ship_failed`（整库 push 失败）。

## 状态

线上权威状态：`materializing` → `awaiting_review` ↔ `changes_requested` →
`approved` →（Owner 另说“上线”）→ `publishing` → `published`，已知拒绝或
明确中止为 `failed`。`approved` 与 `published` 是两个不同人类决定。

下面的 `locally_published` / `ready_to_ship` / `shipped` 只描述旧本地探针兼容，
不授权、也不再驱动 Review-backed 生产上线。

`preflight` 合并本地文件探针与 Review API 当前 revision；不看进程 exit code，
也不把旧的本地认可收据当成当前认可：

| 状态 | 判定 |
| --- | --- |
| `materializing` | 尚未提交可审核 revision，继续不可变源、Materialization、Candidate 与答案复核 |
| `awaiting_review` | Review API 当前 revision 为 `awaiting_review` |
| `changes_requested` | Review API 当前 revision 有未决问题，或 renderer 已更新需重提 revision |
| `approved` | Review API 当前 revision 已认可；本地 QA 收据或本地发布尚未与其闭合 |
| `locally_published` | 当前认可已有精确本地发布收据，但 `latest` / 答案复核闭合不完整，停下检查 |
| `ready_to_ship` | 当前 web approval、`qa-accepted`、`locally-published`、同版本 `latest/`、SQLite published asset、Canonical current publication 和答案复核精确闭合 |
| `shipped` | `signals/shipped.json` 与当前 Review approval 和本地发布身份精确闭合 |
| `failed` | 有 `signals/blocked.json`、收据损坏，或进入审核阶段后未能核对 Review API |

`help-needed.json` 不是独立状态，叠在当前态上等人。

只读 preflight：

```bash
node scripts/import-pipeline/review.mjs preflight <paperId>
```

它返回 `state`、本地/Review 探针、`blockers` 和 `next.action`。它不上传 revision、
不 accept、不 publish、不取得 shipping guard，并固定返回
`production.pushAllowed: false`；上线授权只能来自 Owner 当前单独口令和后续 ship
promotion 命令。

## 硬门禁

新卷先走统一材料化缝。导题过程中**不改** `nck1-paper-standard.md` 来过闸（标准修订须 owner 另拍板后落档）。不绕闸。同一门禁最多自动修 **2** 次，仍红 → 写 `signals/blocked.json`（`gate_failed`）并停。

0. 先运行环境 `preflight`，再生成 `materialization/nck1-source-materialization-v1.json`。已知 NCK1 结构的 DOCX pair 运行 `node scripts/import-pipeline/universal-nck1.mjs materialize <paperId>`：producer 确定性解析段落、表格、题号、section、blank 与权威答案，生成逐段 locator、候选骨架和 `nck1-docx-materialization-review-v1.json`。它绝不解题补答案；语义不唯一时 `disposition` 为 `needs_agent_review`，只在 `review.required` 留结构化异常，Materialization `issues` 非空并失败关闭。Agent 审这些异常并生产全部九份教学分析，不再逐段从零建模。任何分析中的正确项只能抄自该 Materialization 的权威答案；AI 只解释，绝不解题补答案。producer receipt 绑定版本与全部 source digest；源未变时直接 resume，若 Agent 已编辑 Materialization 则标记 `agent_modified` 且不覆盖。源字节漂移必须新建 Source Capture。PDF 有文本层直接转录；扫描 PDF 先 OCR 后逐页视觉复核；其他载体按原规则处理。DOCX 正文每个源 `<w:p>` 必须一对一生成独立 `paragraph` block，并用指向该段的 `docx_part` locator；禁止把相邻段落合并，也不要把阅读 A/B/C/D 等独立篇目标记写进正文。两篇写作必须保留源顺序：题干 →（续写标题与逐段材料）→ 独立 `注意` 结构 → 框内给定标题/称呼或两条续写开头语；`注意` 保留源本来的组合段，或保留“注意：”及其后一个或多个编号段，不得为了统一视觉而合段；必须含词数且与 `wordCountTarget` 一致，源有答题格式或其他编号说明时一字不漏。续写 `material` 每项一对一对应一个源段落，给定标题、称呼和开头语不得混进题干或材料。DOCX 初始化时自动产生不可变 PDF rendition，形状绘图从 rendition 按页裁。语义表格必须为 `table`，整表截图只能作 `visual_proof`。当前媒体助手只允许确定性提取/裁剪；清晰图只裁准和摆准。未来低清图若启用AI辅助候选，必须保留原图、禁止擦水印，绑定原图/候选digest，经`/ops/`并排及overlay/闪烁逐项人工确认后，才可由三面共同引用同一候选；该确认gate实现前仍不得生成式重画。用 `universal-nck1.mjs extract-docx-media` 或 `crop-pdf` 确定性生成媒体。
1. `node scripts/import-pipeline/universal-nck1.mjs verify <paperId>`。缺页、缺答案、答案冲突、未闭合表格、重复/漂移媒体或 Materialization `issues` 非空均写 `signals/blocked.json` 并停。
2. `node scripts/import-pipeline/universal-nck1.mjs build <paperId>`，产生 digest-bound Candidate 摘要与 `confirmed: false` 的 Teacher Confirmation 模板。
3. 生成九份 staged analysis 后运行 `node scripts/import-pipeline/review.mjs verify-analyses <paperId>`。它复用现有 schema、adapter、validator，检查 4 组 reading/15 题、seven/cloze/grammar 的 question/blank closure、45 个权威 objective answer closure 和两份写作分析，并确定性投影 Screen 的 `reading-choice`、`seven-choices`、`cloze`、`grammar-fill`、`writing` 五份 sidecar。缺项、冲突或不完整一律失败关闭。
4. 设置 `QUESTION_BANK_IMPORT_OPS_ORIGIN` 与 Agent token，运行 `node scripts/import-pipeline/review.mjs push <paperId>`。push 会再次执行同一 analysis gate；不可变 bundle 绑定九份原始 bytes，manifest / bundle 绑定 `analysisDigest`。网页 revision finalize 后不可修改；Agent 停下等待 Owner 在 `/ops/` 真实 Screen 审核讲评。旧 revision 不会因后来补文件而获得 sidecar。
5. 有问题：Agent 用 `review.mjs status` 或自己的 `import_agent` 网页待办箱读取反馈并回复；修好 Materialization 或 analysis 后重新 `verify` / `build` / `verify-analyses`，再用 `review.mjs push <paperId> --resolves <issueId>[,<issueId>]` 提交新 revision。不得覆盖旧 revision。
6. Owner 在网页认可后，Review API 保存绑定 source/Candidate/visible structure/analysis/files/bundle 的 approval；Agent 停下。无需在 Orb 生成本地 QA/发布收据，且不得因认可自动上线。
7. 只有 Owner 后来在当前对话明确说 `上线 <paperId>`，才运行 `node scripts/import-pipeline/review.mjs promote <paperId> --owner-said-ship`。命令先用低权限 Agent token 读取最新认可，再用**只在本次上线动作中提供**的独立 ship token 请求生产服务。服务端从不可变 Review bytes 重建 Teacher Confirmation、Canonical request 与五份 sidecar，调用共享 publisher 原子写单卷正式 rows、Canonical current、`versions/vN`、`latest` 和媒体。不得从 Orb 上传整个 SQLite 或 broad assets。

`materialize`、`verify` 与 `build` 都不会创建认可、approve、publish 或 ship。Teacher Confirmation、不可变 Review revision、Owner 网页认可和上线口令边界保持不变。

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
10. 6–8 全绿且 `canonicalRequestPath` 可被 `loadCanonicalImportRequest` 加载：按 runbook 停本地 API → `--publish` → 重启 API →（格式②）`attach-paper-assets-extras` → POST `verify-nck1` → ledger。缺该 request 时不得把该卷当成已 publish。此处只描述存量入口复现；不得把它的 `latest/` 先发布顺序套到通用入口。
11. 本地 publish 成功后 **停**。不替人点 QA，不自动 push，不跑 `scripts/pull-run-push.mjs`。

## 停点

- **不对答案（人）。** 答案随解析字段做全；托底是 AI Answer Transcription Check。
- **网页 QA（人）必留。** Owner 在 `/ops/?view=review` 看复用现有 `PaperBrowsePage` / `PaperSurface` 的 Screen，包括九份 staged analysis 确定性投影出的完整讲评，以及共享 Canonical seam 生成的 Student Print / Teacher Print / PDF。AI-derived analysis 必须由 Owner 在真实 Screen 审核；出现“解析未发布”就是失败，不是可认可的 graceful success。问题绑定 revision 与语义对象；网页认可写服务端精确 approval，但不发布。
- **上线。** 网页认可后停。导题后台无生产按钮。Owner 必须**当前**另说「上线 <paperId>」之后，才按下一节执行服务端单卷 promotion。

## 上线

网页认可后仍然停下。只有 Owner 在**当前线程**直接说 `上线 <paperId>` 后，才可运行：

```bash
node scripts/import-pipeline/review.mjs promote <paperId> --owner-said-ship
```

运行时提供 `QUESTION_BANK_IMPORT_OPS_ORIGIN`、低权限
`QUESTION_BANK_IMPORT_OPS_AGENT_TOKEN`，以及只在本次明确上线动作中提供的独立
`QUESTION_BANK_IMPORT_OPS_SHIP_TOKEN`。两个 token 必须不同；日常 Project Orb Secret
只安装 Agent token，不能长期取得 ship token。命令先以 Agent token 读取当前最新
approval 并摊开 revision 与全部 digest，再以 ship token 请求 promotion。网页 Cookie、
Owner 网页会话、Agent token 都不能调用写入口。

### 硬前置

服务端在第一笔正式内容写入前，以 Review DB `BEGIN IMMEDIATE` 重新确认：最新 revision
仍是 renderer-current Candidate、已认可、无未决问题、所有不可变文件 bytes/digest
完整，并与请求的 approval/source/Candidate/visibleStructure/analysis/bundle identity
逐项一致。随后同一控制事务创建 shipping guard 与 `publishing` 回执。任何新 revision、
问题、重新认可或摘要漂移都失败关闭。

服务端 publisher 在任何 DB/asset 写入前，把目标 `assetVersion`、`versionName` 和
Canonical publication digest 写回 promotion。正式 question-bank rows、Canonical
current、五份 analysis、`versions/vN`、`latest` 和该卷媒体由既有 publisher 的
staging/journal/事务/补偿边界提交；不会上传或替换整库。成功后 Review 事务写
`published` 回执并释放 guard。R2 是下一次定时备份的独立灾备层，本回执不声称 R2
已经完成。

重试：只有同一 exact approval 的状态为 `failed` 或 `publishing`，且 Owner 当前另说
`重试上线 <paperId>`，才运行：

```bash
node scripts/import-pipeline/review.mjs promote <paperId> --owner-said-retry-ship
```

口令“上线”不能当“重试上线”。已提交但回执缺失时，服务端核验预先绑定的 vN 与
Canonical digest，直接补全同一回执，不创建 vN+1；pre-commit 失败则恢复旧 DB/current/
latest 并复用同一目标。已知 admission 失败记 `failed` 并解锁；未知异常保留
`publishing`+guard。

若无法自动恢复，确认旧进程不存在并人工检查生产 DB/current/latest 后，只有 Owner
当前明确说“解除上线锁”才可运行：

```bash
node scripts/import-pipeline/review.mjs release-ship-guard <paperId> <guardId> --owner-said-abort-ship
```

该命令用 ship token 将 active promotion 明确记为 `failed/ABORTED` 后解锁；不得为继续
导题而盲目执行。若正式内容其实已提交，后续 exact retry 会先核验同一 vN，再补
`published` 回执。

### 授权

QA 之后 Owner 必须另说“上线”（当前口头，不是历史聊天里的旧句）。导题后台只读
展示 `上线 paper-<id>` 或失败后的 `重试上线 paper-<id>`，永远没有执行按钮。没有
当前直接授权就不要运行 promotion。

`--owner-said-ship` / `--owner-said-retry-ship` 只表示 agent 已听到**这一次**口头授权。不得在 owner 没说时自行加上。

### 跑前必须摊开

1. 目标是生产 `eqbank.cc` 的 Review-backed 单卷 promotion；先读 go-live record。
2. 精确 `paperId`、approvalId、revisionId 与六个 digest。
3. 只改这一卷；不传 SQLite，不同步 broad assets，不包含 Orb 其他本地改动。
4. publisher 会写目标 vN、正式 rows、Canonical current、五份分析、latest 与媒体；旧
   immutable version 保留供 rollback。
5. R2 不同步完成；只会由生产现有定时任务在下一次快照覆盖。

### 收据

- `promotion.state=publishing`：guard 已持有；目标 vN 可能尚未写或正在恢复。
- `promotion.state=published`：精确 Review identity、vN、Canonical digest、五份分析 digest
  与时间已落 Review DB。
- `promotion.state=failed`：已知拒绝或明确 abort；重试仍需新 Owner 口令。

## 写作分析（新卷必交）

权威在本仓库。新卷必须按下面交稿，不要发明替代合同，也不要只改当前这一套。消费端讲评已能展示应用文 ReviewCard 与续写 `continuationAnalysis`；旧卷迁移仍是后续工作。

- **应用文**：先读 `docs/product/application-writing-doctrine-v1.md` 与 `prompts/application-writing-model-answer-v3.md`（agent 入口：`prompts/application-writing-agent-entrypoint.md`）。落盘 `modelAnswer` + 完整 ReviewCard（11 项：`form` `topic` `reader` `person` `tense` `type` 两个 `points` `readerWho` `readerCares` `readerWants` `value`）+ 源有则 `officialModelAnswer`。交际对象推演是生成决策，不新增 ReviewCard 字段。新卷不要求亮点。完整 payload 时点击答题框打开讲评：框内按顺序叠放「AI 参考范文」与可选「官方范文」，右栏只 ReviewCard。不新增 tab，不按 2022-i / 2024-i 白名单决定入口。
- **读后续写**：先读 `docs/product/continuation-writing-analysis-contract-v1.md` 与 `prompts/continuation-analysis-v1.md`。落盘 `continuationAnalysis` / `continuation-analysis-v1` 五段（`storyUnderstanding`、`continuationContract`、`narrativeDevelopment`、`languageAlignment`、`paragraphBlueprint`）+ `modelAnswer`。形状闸：`node scripts/verify-continuation-analysis-v1.mjs` 所锁的 schema（`schemas/paper-import/continuation-analysis-v1.schema.json`）。只覆盖记叙型；说明 / 议论型停，写 `signals/blocked.json`（`continuation_non_narrative`）或 `help-needed.json`。旧 `continuationDesign` 只认历史资产。

## 导题后台

生产同域入口 `/ops/`；本机同源壳为 `node import-ops/server.mjs`（默认
`http://127.0.0.1:8790/ops/`，代理到 `EQB_APP_ORIGIN`）。Owner 能提问题、验证
修复和认可；`import_agent` 真实服务账号能读取待办、查看同一表面和回复，但不能
关闭问题、认可或上线。页面只读展示 promotion 审计状态；无 LLM 动作、无生产按钮。

## 禁止

在消费端恢复导入动作或复制审核渲染器；后台直连 LLM API；从 Orb 上传/替换整库或 broad assets；导题时为过闸改 nck1 标准；格式①临时 canonical 映射；Review-backed 纸卷走 `pull-run-push push`；未获当前 Owner 口头「上线」/「重试上线」动生产；把 ship token 装成日常 worker secret；为下一道同类 Word 细线框改 PaperSurface / print-renderer。
