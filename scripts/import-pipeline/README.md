# 真题导入管线 / Paper import pipeline

确定性切卷 + AI 解析 + 原子发布的离线工具。**离线、不在产品运行路径上**(手动跑来把真题导进库),所以它的 bug = 一次坏导入(被发布期校验 + QA 拦住),不是用户运行时 bug。

> 来历:本管线先在 `.scratch/import-pilot/`(gitignored)成型,#188 用它导了 12 套新课标真题、#190 用 `topic-driver` 点亮主题维度。本目录是从那个沼泽里**挑出的耐用子集,原样固化**(唯一改动:`gen-configs.mjs` 的 papers 路径从 cwd 字面量改成 import.meta 相对)。**`lib.mjs` 的格式启发式只在 2 种新课标格式上验证过**——导新格式的卷时按需硬化,别当它已通用。

## Agent 执行入口

任何 agent 要导一套新卷,先读 `docs/import/agent-contract.md`（唯一进场）。
项目级 `importing-nck1-papers` skill 会自动匹配导题、继续某卷、审核返工、状态查询
和认可后本地发布任务。每次先运行：

```bash
node scripts/import-pipeline/review.mjs preflight <paperId>
```

该只读命令把本地 Source / Materialization / 收据与 Review API 当前 revision 合成
`materializing`、`awaiting_review`、`changes_requested`、`approved`、
`locally_published`、`ready_to_ship`、`shipped` 或 `failed`，并给出可审计的
`next.action`。Agent 据此恢复；Owner 无需记下面的机械命令。

新卷默认使用 `universal-nck1.mjs`,不再选择格式①/②/③；下列旧 stages
只用于已登记存量卷复现。

```bash
node scripts/import-pipeline/universal-nck1.mjs preflight
node scripts/import-pipeline/universal-nck1.mjs init <paperId> \
  --paper-name '<卷名>' --provenance '<出处>' \
  --source question_source=/abs/questions.pdf \
  --source official_answers=/abs/answers.docx
node scripts/import-pipeline/universal-nck1.mjs materialize <paperId>
node scripts/import-pipeline/universal-nck1.mjs verify <paperId>
node scripts/import-pipeline/universal-nck1.mjs build <paperId>
node scripts/import-pipeline/review.mjs verify-analyses <paperId>
QUESTION_BANK_IMPORT_OPS_ORIGIN=https://eqbank.cc \
QUESTION_BANK_IMPORT_OPS_AGENT_TOKEN='<secret>' \
  node scripts/import-pipeline/review.mjs push <paperId>
```

`preflight` 一次性启动 magick、ffmpeg、soffice、pdfinfo、pdftoppm、unzip，并在
macOS 检查 magick/ffmpeg 动态链接；失败就开工前停，中途不得安装或升级依赖。
`init` 也先执行同一检查，再复制并摘要绑定本地源，DOCX 同时生成确定性 PDF
rendition；源文件、Materialization 与 canonical evidence 均 gitignored。已知
NCK1 结构的试题 DOCX + 权威答案 DOCX 用 `materialize` 生成逐段 locator、九题组
骨架、答案与结构化复核清单。Agent 必须生产 4× reading、seven、cloze、grammar、
application、continuation 共九份教学分析；不确定的
section/题号/blank/答案/表格或视觉语义进入 `review.required` 并失败关闭，AI 禁止
解题补答案。producer receipt 绑定版本和 source digest；未变源直接 resume，检测到
Agent 已编辑输出时绝不覆盖。同一 paperId 仍单 writer；两份写作分析可并行纯读后
由该 writer 汇总。其他载体由 Agent 写统一
Materialization：DOCX 每个源 `<w:p>` 一对一保留为独立 paragraph block，禁止合并
相邻段落；阅读 A/B/C/D 等独立篇目标记不写入正文。表格为网格，图为原媒体
配方。应用文和读后续写按“题干/逐段材料 → 注意与词数、格式 → 框内给定内容”
保留源顺序；续写材料逐段映射，标题、称呼与两条开头语不并入正文。`verify` 会用
不可变 DOCX 源检查 paragraph block 未跨越段落边界，并拒绝写作注意块缺失、词数
冲突、续写材料合段或框内给定内容错位。媒体助手：

```bash
node scripts/import-pipeline/universal-nck1.mjs extract-docx-media \
  <source.docx> <word/media/entry> <output> [--density 300]
node scripts/import-pipeline/universal-nck1.mjs crop-pdf \
  <source.pdf> <page> <x,y,width,height> <output.png> [--density 300]
```

SVG 内容媒体必须用固定 density 转 PNG；DOCX shape 先用 init 生成的 PDF
rendition，再按 `pdf_crop` 路径裁。`verify` 只派生 Candidate，`build` 只生成
Candidate 摘要和 `confirmed: false` 的 Teacher Confirmation 模板。`review.mjs
verify-analyses` 在 push 前校验九份输入及其确定性五份 Screen sidecar projection；
`push` 把不可变源、Candidate 与九份原始 analysis bytes 作为新 revision 上传到
`/ops/`。Owner 在真实
Screen/Print/PDF 上审核；Agent 用自己的 `import_agent` 网页待办箱或下列命令
读取、回复和提交修订：

单卷 Materialization 文件的 changed-file 路由使用
`pnpm -C app verify:import-paper`：它保留 schema/Candidate admission、权威答案与
digest、Screen、Student/Teacher Print、PDF、publication/recovery 的独立失败层，
不再误跑普通 feature pack。共享 producer/Canonical/renderer 或未知、混合变更仍
失败关闭到 `verify:all`。

```bash
node scripts/import-pipeline/review.mjs preflight <paperId>
node scripts/import-pipeline/review.mjs verify-analyses <paperId>
node scripts/import-pipeline/review.mjs status <paperId>
node scripts/import-pipeline/review.mjs reply <paperId> <issueId> --message '<回复>'
node scripts/import-pipeline/review.mjs push <paperId> --resolves <issueId>[,<issueId>]
node scripts/import-pipeline/review.mjs accept <paperId>
node scripts/import-pipeline/review.mjs publish <paperId>
```

`accept` 只在最新 revision 已由 Owner 认可时成功；它重新核对本地源、Candidate、
可见结构、`analysisDigest`、文件清单和 bundle digest，才写确认、Canonical
request 和摘要绑定 QA 收据。它不 publish、不部署。`publish` 再核对同一网页认可、
QA 收据、Teacher
Confirmation、Canonical request 与 AI 答案复核，然后通过共享原子 publisher 写
同版本 DB、五份 analysis sidecar、`versions/vN`、`latest` 和 Canonical current
ref；成功后写
`signals/locally-published.json` 并进入 `ready_to_ship`。同一认可与有效本地发布
收据重跑为 no-op。Agent 不代确认；`accept`、`publish` 和 Owner 网页认可都不构成
上线授权。

机械 how-to 见 `docs/import/agent-runbook.md`；本 README 只是它引用的工序
参考,不重复讲工序。数据契约权威见 `docs/product/nck1-paper-standard.md`。
格式③（试题 DOCX + 答案解析 DOCX）映射见该标准附录 A。切卷：
`node scripts/import-pipeline/03-split-docx-pair.mjs papers/<id>/config.json`。
canonical 物化：
`node scripts/import-pipeline/build-docx-pair-canonical-request.mjs <试题.docx> <答案解析.docx> --output-dir papers/<id>/canonical-evidence --expected-paper-id <paperId> --write`。
身份以开局 `paperId` 为准，不按标题派生。

## 已导入(13 套,paperId `paper-<year>-{i,ii}`)

2020–2025 全国新课标 Ⅰ+Ⅱ(12 套,DOCX 答案版格式)+ 2026 新课标 Ⅰ
(PDF 试题卷+独立答案 PDF 格式,首套见 `pdf-extract.mjs` + `docs/import-ledger.md`)。
每套 9 题组(reading a–d / cloze / grammar-fill / seven-choices / writing application+continuation),听力原料另存(`listening/` 原料区,不建题组)。

## 源 DOCX(off-repo,gitignored)

`~/Desktop/教学资料库/05_真题模拟与试卷库/高考真题/阅读解析与答案版/真题答案版/`。导**答案版**(不是解析版)。`gen-configs.mjs` 的 `DIR` 硬编码指这里、且文件名匹配规则专属 新课标——换卷源/格式要改它。

## 阶段(deterministic 部分在此;AI 解析扇出是 ad-hoc Workflow)

1. **`gen-configs.mjs`** — 扫源文件夹,为每套写 `papers/<paperId>/config.json`(`{docxPath, paperId, provenance}`)。
2. **`01-split.mjs <config>`** — 确定性切卷(`lib.mjs`):两种试卷格式(简化「一二三」答案版 + 官方「第X部分/第X节」);滤分值标注 `(N分)`;空标记 `__NN__`;标准重排 21–35/36–40/41–55/56–65。产 `papers/<id>/groups.json` + 每组 `analyze-<key>-combined.txt`(shape-gate 走 shipped `build*AnalysisMessages`)。
3. **解析扇出 = ad-hoc Workflow**(不在本目录;每次现写):一组一 agent,喂 `analyze-<key>-combined.txt`,产 `analysis-<key>.json`,用 `validate-one.mjs` 自校验 + 重试。
4. **`validate-one.mjs <config> <key>`** — 单组校验(注入 shipped `analyze*ImportCandidate`)。
5. **`02-publish.mjs <config> [--publish]`** — 校验全组 → 打包(shipped `buildPaperImportAiPackageFiles`)→ **产包后改写 import-meta 出处**(sourceType/region/paperName/year/tags)→ `--publish` 走 shipped `publishPaperImportPackage` 入库。格式③（以及任何已交出 `analysis-application.json` / `analysis-continuation.json` 的卷）在入库后把写作分析写入 `latest/analyses/writing-analysis-v1.json`；缺稿不得 `--publish`。`--publish` 前格式①须先跑 trusted-DOCX producer（见下），并把 `config.canonicalRequestPath` 指到产物。隔离根可用 `QUESTION_BANK_DB` / `QUESTION_BANK_PAPER_ASSET_ROOT`；默认仍是本机库与 `app/public/paper-assets/`。

格式① canonical 物化（dry-run / publish-gate / `verify-nck1` PRE 之后、`--publish` 之前）：

```bash
node scripts/import-pipeline/build-trusted-docx-canonical-request.mjs \
  <docxPath> \
  --output-dir scripts/import-pipeline/papers/<paperId>/canonical-evidence \
  --expected-paper-id <paperId> \
  --write
```

不要手写 Canonical Paper，不要套用格式② PDF envelope。同一命令去掉 `--write` 可证明 byte-reproducible。派生身份必须与开局 `paperId` 一致。

格式③ canonical 物化（dry-run / publish-gate / `verify-nck1` PRE 之后、`--publish` 之前）：

```bash
node scripts/import-pipeline/build-docx-pair-canonical-request.mjs \
  <试题.docx> \
  <答案解析.docx> \
  --output-dir scripts/import-pipeline/papers/<paperId>/canonical-evidence \
  --expected-paper-id <paperId> \
  --write
```

不要手写 Canonical Paper，不要套用格式①标题派生或格式② PDF envelope。开局 `paperId` 必填，且不得占用 `paper-YYYY-i` / `paper-zj-YYYY-jan`。

### 格式②:PDF 试题卷 + 独立答案 PDF(2026 起)

不走 `gen-configs.mjs`/`01-split.mjs`(那是 DOCX 答案版专属)。改用:

- **`pdf-extract.mjs <paperId>`** — 取代 `01-split.mjs` 的角色,但不复用
  `lib.mjs` 的正则切卷(源排版是全新的试题卷视觉约定,详见
  `docs/import/agent-runbook.md` §2 的理由)。改为读脚本内 `CONTENT` 登记表
  (agent 直读源 PDF 手工转录,一 paperId 一条目,先例同
  `zj-inject-answers.mjs` 的 `KEYS` 表)→ 组装候选结构 → 过同一套 shipped
  shape-gate(`build*AnalysisMessages`)→ 产 `groups.json` +
  `analyze-<key>-combined.txt`(与 `01-split.mjs` 产物同形状,下游
  `validate-one.mjs`/`02-publish.mjs` 零改动直接吃)。
- **`verify-nck1-standard.mjs <paperId>`** — 标准 §6 全量校验(9 题组/题号段/
  分值前置条件/客观题答案数量/听力原料/figures 双存一致性),发布前后同一条
  命令自动识别模式。
- **`attach-paper-assets-extras.mjs <paperId>`** — 发布后把 staging 的
  `listening/`+`figures/` 拷进 `app/public/paper-assets/<id>/{latest,versions/vN}/`
  (纯文件拷贝,不碰 shipped 发布/回滚逻辑)。

完整流程(前置检查→…→台账)见 `docs/import/agent-runbook.md`,不在此重复。

## 派生维度 backfill(导入后)

- **`topic-driver.mjs list|list-unlabeled|build <id>|persist <id> <labelsJson>`** — 主题标签(#190)。`list-unlabeled` 圈出所有无标签题组(后续导入卷的回填范围;`list` 仍是当年 108 组的老口径);`build` 打印 `buildTopicLabelMessages` 的 messages(喂分析会话);`persist` normalize + `bindTopicLabelsToQuestionGroup` 落库。扇出同样用 ad-hoc Workflow(一组一 agent 自写结果文件)。
- **`persist-dir.mjs <dir>`** — 批量把 `labels-out/<groupId>.json` 落库。

## 硬纪律

- **发布/落库串行**:`02-publish --publish` 与 `topic persist` **直写 SQLite**(`data/question-bank.sqlite`)。批量前**先停 API** 释放写锁:`lsof -ti :8787 | xargs kill`;发完**重启 API 刷缓存**(直连发布不 invalidate 路由缓存):`nohup node --env-file-if-exists=.env server/api.mjs &`(别用裸 `node ... &`,工具退出会回收子进程)。
- **新格式先 `01-split` 便宜预检**(无 AI)再扇出解析,别盲批量产垃圾。
- **DB / 中间数据 gitignored**:`papers/<id>/` 只跟踪 `config.json`;`groups.json`/`full.txt`/`analyze-*`/`analysis-*`/`labels-out/` 是可再生产物,见本目录 `.gitignore`。

## 上线（内容，非代码）

通用入口 `review.mjs publish`（存量入口为 `--publish`）之后不要自动 push。可执行清单（本身不跑 push）：

```bash
node scripts/import-pipeline/ship-checklist.mjs check <paperId> --owner-said-ship
```

该清单继续使用 `QUESTION_BANK_IMPORT_OPS_ORIGIN` 与 Agent token，只读确认本地
QA 收据与 `locally-published.json` 仍是 Review 服务的当前最新认可，且对应同版本
`latest`；新 revision 会让旧收据失败关闭。仅当
打印「允许」、且 owner **当前**口头「上线」时，才跑整库
`node scripts/pull-run-push.mjs push <paperId> --owner-said-ship`。实际 push 会在
停生产服务前再次用 Agent token 读取当前 Review revision，再用独立
`QUESTION_BANK_IMPORT_OPS_SHIP_TOKEN` 事务性取得 shipping guard；两个 token 必须
不同，普通 Agent 账号/token 都不能取得 guard。若清单
之后出现新 revision，则不做任何生产修改。guard 持有到远端操作结束，期间 Review
服务拒绝新 revision 和会撤销认可的问题状态修改。不是单卷增量，不是 `deploy.sh`。
导题后台无按钮。详见 `docs/import/agent-contract.md` 上线。

## 待办(productionization 续)

- `lib.mjs` 格式启发式(2020 双试卷、`Paragragh` 拼写、grammar Format-2 阈值、continuation starter 四策略)未通用 —— 导新格式时硬化 + 补 verify 锁。
- topic-label 的 taxonomy/normalize 簇仍在 `server/api.mjs`(#190 加了 4 个 export);后续抽进 `server/topic-labels/` 模块。
