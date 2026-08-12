# 真题导入管线 / Paper import pipeline

确定性切卷 + AI 解析 + 原子发布的离线工具。**离线、不在产品运行路径上**(手动跑来把真题导进库),所以它的 bug = 一次坏导入(被发布期校验 + QA 拦住),不是用户运行时 bug。

> 来历:本管线先在 `.scratch/import-pilot/`(gitignored)成型,#188 用它导了 12 套新课标真题、#190 用 `topic-driver` 点亮主题维度。本目录是从那个沼泽里**挑出的耐用子集,原样固化**(唯一改动:`gen-configs.mjs` 的 papers 路径从 cwd 字面量改成 import.meta 相对)。**`lib.mjs` 的格式启发式只在 2 种新课标格式上验证过**——导新格式的卷时按需硬化,别当它已通用。

## Agent 执行入口

任何 agent 要导一套新卷,先读 `docs/import/agent-contract.md`（唯一进场）。
机械 how-to 见 `docs/import/agent-runbook.md`；本 README 只是它引用的工序
参考,不重复讲工序。数据契约权威见 `docs/product/nck1-paper-standard.md`。

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
5. **`02-publish.mjs <config> [--publish]`** — 校验全组 → 打包(shipped `buildPaperImportAiPackageFiles`)→ **产包后改写 import-meta 出处**(sourceType/region/paperName/year/tags)→ `--publish` 走 shipped `publishPaperImportPackage` 入库。**未改任何契约代码**。

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

## 待办(productionization 续)

- `lib.mjs` 格式启发式(2020 双试卷、`Paragragh` 拼写、grammar Format-2 阈值、continuation starter 四策略)未通用 —— 导新格式时硬化 + 补 verify 锁。
- topic-label 的 taxonomy/normalize 簇仍在 `server/api.mjs`(#190 加了 4 个 export);后续抽进 `server/topic-labels/` 模块。
