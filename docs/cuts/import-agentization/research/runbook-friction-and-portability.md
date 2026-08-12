# 现行导题 runbook 摩擦与可移植性审计

Status: done  
Ticket: `docs/cuts/import-agentization/wayfinder/tickets/01-runbook-friction-and-portability-audit.md`  
Date: 2026-08-12  
Method: 只读追溯主源与脚本本体；不跑导入、不装依赖、不写生产。

本报告回答票中 5 问，为后续「任意 Agent 可导题」契约与本地审核后台提供**现状事实**。每条结论标注出处。

主源：

- `docs/import/agent-runbook.md`（现行执行契约）
- `scripts/import-pipeline/README.md` + `scripts/import-pipeline/**`
- `docs/import-ledger.md`
- `docs/product/nck1-paper-standard.md`
- `docs/cuts/nck1-import-runbook/{plan,cr}.md`
- `docs/cuts/I17-claude-driven-import/cut-note.md`
- `docs/cuts/paper-canonical-unification/research/latest-assets-producers-consumers-census.md`（导入后 canonical 层相关）

范围说明：票与 map 收口现有 **NCK1 整卷管线**；本报告以 runbook 的 **格式② PDF 试题卷 + 独立答案 PDF** 端到端为主（格式① DOCX 答案版见 README stages 1–5，runbook §0 明确不重述）。

---

## 1. 步骤图与状态落点

单卷端到端（格式②）按现行 `docs/import/agent-runbook.md` 编号，并补上文档前文的 **Canonical-required** 前置与步骤 8 后的 **genre-truth** 收尾。后台读进度时，应以文件夹/文件是否存在 + 下表「完成校验」为准。

### 1.1 流程图（逻辑顺序）

```text
§0 格式白名单
 → §1 config.json (+ 源 PDF 就位)
 → §2 直读 PDF 转录 → CONTENT[paperId] 写入 pdf-extract.mjs
 → §3 pdf-extract shape-gate → groups.json + analyze-*-combined.txt
 → §4 7× Opus 分析扇出 → analysis-*.json (+ validate-one)
 → §5 listening/ + figures/ staging
 → [Canonical] reviewed evidence + build-canonical-request → canonical-import-request.json
 → §6 dry-run 02-publish（无 --publish）
 → §6a verify-publish-gate
 → §7 verify-nck1-standard（PRE-PUBLISH）
 → §8 stop API → 02-publish --publish → restart API
 → genre-truth classify/apply（runbook §8 要求，独立脚本）
 → §9 attach-paper-assets-extras
 → §10 verify-nck1-standard（POST-PUBLISH）
 → §11 ledger 追加
 → §12 Owner browser QA（人，非 agent）
```

Canonical 块在 runbook 里写在 §0 之前的长前言（`docs/import/agent-runbook.md` L20–197），但执行上依赖 §3–§5 的 package/reviewed 材料；`02-publish.mjs --publish` **硬要求** `config.canonicalRequestPath`（`scripts/import-pipeline/02-publish.mjs` L256–258）。

### 1.2 逐步：产物 / 落点 / 完成校验

| # | 步骤 | 主要产物 | 落点 | 完成校验（命令或判定） |
| --- | --- | --- | --- | --- |
| 0 | 格式白名单 | 无文件；确认源匹配白名单②且答案 PDF 存在 | 源期望：`scripts/import-pipeline/papers/<paperId>/source/{paper.pdf,answers.pdf}` | 人工对照 `docs/product/nck1-paper-standard.md` §2；不匹配则 **stop**（runbook §0） |
| 1 | `config.json` | `config.json`（含 `docxPath`→PDF、`canonicalRequestPath`、provenance） | `scripts/import-pipeline/papers/<paperId>/config.json` | `node -e "…JSON.parse…config.json"` 解析成功，且源 PDF + envelope 证据文件在盘（runbook §1 Done when） |
| 2 | 直读 PDF 转录 | `CONTENT['<paperId>']` 登记表条目（6 组形状 + 客观题 answerKey）；≥300 DPI 答案逐格确认 | 写进 `scripts/import-pipeline/pdf-extract.mjs` 源码内 registry | 无独立脚本闸；Done when = CONTENT 齐 + 答案已对 ≥300 DPI 渲染（runbook §2） |
| 3 | Build + shape-gate | `groups.json`；7× `analyze-<key>-combined.txt`（reading-a/b/c/d, seven, cloze, grammar） | `papers/<paperId>/` | `node scripts/import-pipeline/pdf-extract.mjs <paperId>` 打印 `[DONE] All shape gates passed.`（runbook §3；脚本 `pdf-extract.mjs` L431） |
| 4 | AI 分析扇出 | 7× `analysis-<key>.json` | 同上 | 每键：`validate-one.mjs … <key>` PASS；主 agent 再跑一遍 7 键循环（runbook §4） |
| 5 | Listening + figures staging | `listening/{questions,answers,transcript}.json`；`figures/manifest.json` + PNG | `papers/<paperId>/listening/`、`…/figures/` | 三文件 + figures 有真内容（runbook §5）；placeholder 须与 `groups.json` 归一化后文本一致 |
| C | Canonical request 物化 | `canonical-import-request.json` + `canonical-evidence/*` 不可变证据文档 | 通常在 backend package / `papers/<paperId>/` 旁（runbook 前言命令）；config 用相对 `canonicalRequestPath` 指向 envelope | `build-canonical-request.mjs … --write`；可选无 `--write` 证明 byte-reproducible；再 `compileCanonicalPaper(loadCanonicalImportRequest(…))` disposition=`ready`（runbook L88–138） |
| 6 | Dry-run 打包 | 无持久写；控制台打印校正后 provenance | — | `02-publish.mjs <config>`（无 `--publish`）打印 `OK: <N> files`（标准 8）（runbook §6；`02-publish.mjs` L201） |
| 6a | Publish-time normalization gate | JSON 报告（stdout） | — | `verify-publish-gate.mjs <paperId>` → `"ok": true`、`blockingCount: 0`、supported groups `ready`（runbook §6a） |
| 7 | 标准预发布闸 | 控制台检查表 | 读 staging：`groups.json` + listening/figures | `verify-nck1-standard.mjs <paperId>` → `All green.` PRE-PUBLISH（runbook §7；脚本 L300） |
| 8 | Publish（仅本地 DB） | DB 行；`app/public/paper-assets/<paperId>/{versions/vN,latest}/**`（含 `paper-normalized-groups-v1.json` 等） | `data/question-bank.sqlite`；`app/public/paper-assets/<paperId>/` | 停 `:8787` → `02-publish.mjs … --publish` → `status: published` + `paperId: <id>` → `nohup` 重启 API（runbook §8；README 硬纪律） |
| 8g | Genre-truth | `discourse_type` 回填（经 classify/apply） | DB `passages`；审计产物在 `docs/cuts/r1-genre-truth/`（`genre-truth-classify.mjs` 头注释） | runbook §8：「发布新卷后」须跑 genre-truth 后才算 import-complete；无单行 Done when 命令绑进 verify-nck1 |
| 9 | Attach extras | 拷贝 listening/ + figures/ 进 published tree | `app/public/paper-assets/<paperId>/{latest,versions/vN}/` | `attach-paper-assets-extras.mjs <paperId>` → `Done. N folder-copy…`（runbook §9；脚本 L87） |
| 10 | 标准发布后闸 | 同 §7 + latest 下 listening/figures 存在 | 读 live `latest/` | 同 §7 命令，自动 POST-PUBLISH → `All green.`（runbook §10） |
| 11 | Ledger | 追加一条台账 | `docs/import-ledger.md` | 文件末尾有新 `## <paperId>` 条目（runbook §11） |
| 12 | Owner browser QA | 无管线产物 | 本地站点 | 人做；agent 只指向矩阵（runbook §12） |

**后台进度可读的关键落点（事实基础）：**

| 进度信号 | 路径 |
| --- | --- |
| 配置就绪 | `papers/<id>/config.json` |
| 切卷/shape 完成 | `papers/<id>/groups.json` + `analyze-*-combined.txt` |
| 分析完成 | `papers/<id>/analysis-*.json`（7 个） |
| 听力/图 staging | `papers/<id>/listening/*`、`papers/<id>/figures/*` |
| Canonical 就绪 | config 指向的 `canonical-import-request.json` + 证据目录 |
| 已发布 | `app/public/paper-assets/<id>/latest` 存在 |
| extras 已挂 | `…/latest/listening`、`…/latest/figures` |
| 台账 | `docs/import-ledger.md` 对应条目 |

出处：`docs/import/agent-runbook.md` §0–§12；`scripts/import-pipeline/README.md`「格式②」；`scripts/import-pipeline/{pdf-extract,verify-nck1-standard,attach-paper-assets-extras,02-publish,verify-publish-gate,build-canonical-request}.mjs`。

### 1.3 与历史首导卷的落差（进度建模须知）

首导 `paper-2026-i` 台账路径止于 verify POST-PUBLISH，**未**记载 `canonicalRequestPath` / `build-canonical-request`（`docs/import-ledger.md`）。现行 checked-in `papers/paper-2026-i/config.json` 仅有相对 `docxPath: "source/paper.pdf"`，**没有** `canonicalRequestPath` 字段——与现行 `02-publish.mjs`「`--publish` 必填 canonicalRequestPath」不一致。后台若只按 2026-07 台账步骤建模，会漏掉 canonical 硬门。

---

## 2. 摩擦证据（实际发生 / 写死的易错点）

逐条带来源路径。

1. **手工 PDF 转录是全流程最高耗时、最高注意力步骤**  
   Runbook 自承：勿为省 turn 赶抄；错一个选项字母或掉词比慢更糟。  
   出处：`docs/import/agent-runbook.md` §2、Known risk notes；`docs/product/nck1-paper-standard.md`「刀②回填」PDF 提取工序；`scripts/import-pipeline/pdf-extract.mjs` 头注释（手转录进 CONTENT，避免对新视觉布局逆向 regex）。

2. **答案正确性无自动闸；低分辨率读图曾导致假阳性误报（Q55 A/B）**  
   CR 用低 DPI 整页渲染把 Q55 的 B 读成 A；≥300 DPI 定点裁剪后撤销。随后 runbook 强制「≥300 DPI 逐格对源」。`verify-nck1-standard` 只**数** 45 个答案，不验对错。  
   出处：`docs/cuts/nck1-import-runbook/cr.md`（误报更正记录、Failure Angle、Self-Review）；`docs/import/agent-runbook.md` §2「Mandatory high-DPI answer cross-check」；`scripts/import-pipeline/verify-nck1-standard.mjs` 头注释 L26–29。

3. **首发 `--publish` 被 validator 硬拒 PDF（扩展名/魔数只认 DOCX）→ 返工改契约**  
   酸测试发现格式②在发布层无入口；C9 放宽为恰好 1 个源文档且 `.docx` 或 `.pdf`。  
   出处：`docs/cuts/nck1-import-runbook/plan.md` 修订 C9–C11；`docs/import-ledger.md` paper-2026-i（首发 validation_failed，commit `8cb5ba0`）。

4. **`docxPath` 绝对路径不可移植（生产同步崩溃）**  
   生产发布时本地绝对路径找不到源 → 包内空条目。已改为相对路径按 config 目录解析。  
   出处：`docs/import-ledger.md`「生产同步」段；`papers/paper-2026-i/config.json` note；`02-publish.mjs` L45–49。

5. **字段名 `docxPath` 指向 PDF / 资产键 `sources.docx` 存 PDF——命名遗留易犹豫**  
   Runbook Known risk + CR 观察。  
   出处：`docs/import/agent-runbook.md` §1 / Known notes；`docs/cuts/nck1-import-runbook/cr.md` 观察；census 亦记字段名冲突：`docs/cuts/paper-canonical-unification/research/latest-assets-producers-consumers-census.md` PDF path 行。

6. **步骤 8 Done-when 曾与脚本输出不一致（假「未完成」）**  
   成功路径只打 `status: published`，顶层无 `paperId`；台账与 CR SW2 记录陌生 agent 会误判。后修打印 `result.publish?.paperId`。  
   出处：`docs/import-ledger.md`；`docs/cuts/nck1-import-runbook/cr.md` SW2；现行 runbook §8 Done when。

7. **`[表: …]` placeholder 与 `normalizePassageText` 标点空格交互——实际改过一次 manifest**  
   冒号后被插入空格；manifest 必须用**归一化后**字符串。  
   出处：`docs/import-ledger.md` Warnings；`docs/import/agent-runbook.md` §5；`docs/product/nck1-paper-standard.md` §刀② figures 定案；`papers/paper-2026-i/figures/manifest.json`（`[表: fig-…]` 带空格）。

8. **`sips --cropOffset` 参数顺序易错（Y 后 X；help 文本误导）**  
   必须目视裁剪结果；playwright 为预批 fallback。  
   出处：`docs/import/agent-runbook.md` §5 与 Known risk notes（本条为 runbook 固化风险，ledger 未另记一次失败实例）。

9. **分析扇出常见 JSON/答案分支失败模式（需 ≤4 次重试）**  
   中文强调用 ASCII `"` 破 JSON；`that/which` 类 `/` 拼接 answerKey 须按 validator 分支匹配而非照抄斜杠。  
   出处：`docs/import/agent-runbook.md` §4 Retry rule。I17 批量：84 组中 4 组需 corrective retry（3 为 workflow 假阴、1 真重跑）。  
   出处：`docs/cuts/I17-claude-driven-import/cut-note.md` Verification。

10. **语法填空须 v2 schema + leaf facetKey；v1 现被硬拒**  
    出处：runbook §4 硬门；`server/paper-import/validator.mjs` allow-list（runbook 引用）。

11. **Listening/figures attach 是发布后非事务附加步**  
    忘记 attach 靠 POST-PUBLISH verify 抓；census 记「extras 非同一可观察零写/回滚边界」。  
    出处：`verify-nck1-standard.mjs` POST-PUBLISH 说明；`docs/cuts/paper-canonical-unification/research/latest-assets-producers-consumers-census.md` 结论 12。

12. **源卷字面瑕疵必须原样保留（语义保真），增加「看起来像错」的审核负担**  
    Reading D 重复「34.」；Sonder Lim/Lüm；Commune/Commane；听力 Jean Poteau vs Bottero 等。  
    出处：`docs/import-ledger.md` Warnings；runbook §2。

13. **本地发布写锁纪律：必须先杀 API，重启须 `nohup`**  
    裸 `&` 会在工具会话退出时被回收。  
    出处：`scripts/import-pipeline/README.md` 硬纪律；runbook §8。

14. **Canonical 证据/reviewed capture 层叠在旧 PDF 工序之上，首导台账路径未覆盖**  
    现行 publish 缺 `canonicalRequestPath` 即 fail；producer 还要求 `--instruction-evidence`、`--reviewed-evidence-dir`（含 Reading capture/table proof、Writing captures、Listening 1–20 等），Manifest 版本还钉死 application/continuation writing 文件名。从零 agent 若只跟「§1–§11 旧心智模型」会在 publish 卡死。  
    出处：runbook Canonical-required 前言；`02-publish.mjs` L256–258；`build-canonical-request.mjs` 选项与 Manifest 合同；对比 `docs/import-ledger.md` / `papers/paper-2026-i/config.json`。

15. **Genre-truth 被 runbook 标为 import-complete 条件，但未并入 §7/§10 绿闸**  
    classify 默认可走 DeepSeek API batch；与 map「分析用 agent 会话、不用 API」方向潜在冲突。  
    出处：runbook §8；`scripts/genre-truth-classify.mjs` 头注释。

---

## 3. 能力需求清单（含 Cursor 特有 / 换 Grok 等会卡点）

| 步骤 | Agent 需要的能力 | Cursor 特有或强依赖 | 换其他 coding agent（如 Grok）易卡点 |
| --- | --- | --- | --- |
| 0–1 | 读标准、写 JSON、路径约定 | 无 | 低；须理解 `docxPath` 名实不符 |
| 2 | **PDF 视觉/文本直读**；长文忠实转录；**≥300 DPI 渲染查看**（`pdftoppm`/`sips` 或等价）；长时注意力 | Cursor **Read 工具读 PDF/图** 曾被用于答案核对，但低 DPI 不可靠（CR 实证） | 无 PDF/图像视觉工具时只能靠 shell 渲 PNG 再读文件；无高 DPI 纪律会重蹈 Q55；上下文窗口不够时分段易丢题 |
| 3 | Shell + 修 CONTENT 迭代 | 无 | 低（纯 node） |
| 4 | **并行 7 子代理**、钉 **Opus**、读 combined prompt、写纯 JSON、自跑 validate、≤4 重试、主代理复查 | Cursor **Task/subagent 扇出** + 模型钉死 Opus | **无子代理机制**时只能串行 7 次长会话或外挂编排；无 Opus 档位时分析质量/门禁通过率未知（README/I17 钉 Opus）；无「主代理派生子代理」编排契约 |
| 5 | PDF 页渲、**目视定框**、macOS `sips` 裁剪、手写 listening JSON | 图像 Read 辅助定框 | 非 macOS 无 `sips`（需改用预批 playwright）；无视觉则裁图易失败 |
| C | 组装 reviewed evidence、跑 producer、理解 authority digest | 无（脚本为主） | **缺 reviewed-evidence 形状的逐步作者指南**时最易卡（runbook 列要求但无逐步模板文件） |
| 6–7, 6a, 9–10 | Shell、读失败码、修源重跑 | 无 | 低 |
| 8 | 杀端口、SQLite 写、nohup 守护 | 工具会话生命周期影响后台进程 | 任意 agent 都会踩「裸 `&` 被收」；需显式进程纪律 |
| 8g | 体裁五类判断 / 或调 DeepSeek | DeepSeek 路径依赖 API key | 与「纯 agent 会话、不用 API」策略冲突时需另契约 |
| 11 | 文档追加 | 无 | 低 |
| 12 | 浏览器真人 QA | — | 非 agent |

出处：runbook §2–§8、§4 派发模板；README「解析用 Opus」；`docs/cuts/nck1-import-runbook/cr.md` 低 DPI 教训；`docs/cuts/I17-claude-driven-import/cut-note.md` Workflow 扇出；map `docs/cuts/import-agentization/wayfinder/map.md`（Grok 会话、不用 API）。

---

## 4. 纯机械步骤（今天就可脚本化 / 一键化）

下列步骤**不含教学内容判断**（或判断已封装进 shipped validator），可用 shell/node 串成一键；失败应 fail-closed 停住。

| 候选 | 依据 | 备注 |
| --- | --- | --- |
| Shape-gate / 重建 groups | `pdf-extract.mjs` / DOCX 路径 `01-split.mjs` | 前提 CONTENT 或 DOCX 已备好 |
| 7× `validate-one` 循环 | runbook §4 复查循环 | 不生成分析，只验 |
| Dry-run `02-publish` | §6 | 零 DB 写 |
| `verify-publish-gate.mjs` | §6a | 零 DB 写 |
| `verify-nck1-standard.mjs` | §7/§10 | 含 S0 `verify-source-doc-types` 子进程 |
| `build-canonical-request.mjs`（在 reviewed 目录齐备时） | 前言 | 证据齐全后装配是机械的；**写证据不是** |
| 停 API → `--publish` → 重启 API | §8 + README | 可脚本化，但属状态变更，宜挂人工确认点之后 |
| `attach-paper-assets-extras.mjs` | §9 | 纯拷贝 |
| Ledger 追加模板行 | §11 | 字段可从 config/gate 输出填；「warnings 叙述」仍可能需人 |
| Temp cleanup / recovery helpers | runbook §8 rollback 段 | 已有 one-liner |

**今天不宜假装「一键」的（含判断或视觉）：** §2 转录与 ≥300 DPI 答案核对；§4 分析生成；§5 定框裁图与听力照抄；Canonical **reviewed** capture/transcription 撰写；§12 Owner QA；genre-truth 的 AI 分类（若保留 DeepSeek/模型判断）。

票中点名的 shape gate / dry-run / publish / attach / verify / ledger：**除 ledger 叙述字段与 publish 授权外，均可机械串接**——与 map「人工确认收敛为答案核对 + 发布前 QA」一致。

---

## 5. 「任意 Agent 可导题」当前缺的契约件（隐性前提清单）

现行 runbook 自称「自足」（`docs/import/agent-runbook.md` L3–6），但实际仍假设下列**未写成从零可执行契约**的前提：

1. **编排者假设**：存在一个主会话会「Spawn 7 个钉 Opus 的子代理」、收集 PASS/FAIL、独立重跑 validate（§4）。无子代理的 agent 没有替代编排合同（票 04 将处理；此处仅记缺口）。
2. **模型档位假设**：分析必须 Opus；机械步 Sonnet——换 Grok-only 未验证（README、I17、runbook §4）。
3. **工具假设**：能直接读 PDF；能看 ≥300 DPI 图；macOS 上有 `pdftoppm`/`sips`（或会用 playwright fallback）。低 DPI Read 被明确禁止作为答案依据（CR + runbook）。
4. **源材料已就位假设**：`source/paper.pdf`+`answers.pdf` 已在约定目录；找卷不在范围（map Out of scope）。
5. **Canonical reviewed-evidence 作者指南缺失**：前言要求 `--reviewed-evidence-dir` 含 Reading/Writing/Listening 等 reviewed 文件与 `--instruction-evidence`，但**没有**逐步「如何从 PDF 产出这些 JSON」的 agent 模板；与 §2 CONTENT 转录工序并列存在第二套证据作者路径。
6. **Authority 新鲜度假设**：须复制**当前** `canonicalAuthorityRef`，禁止抄旧 envelope（runbook 前言）——从零 agent 需知道从哪读当前 digest。
7. **首导 config 与现行 publish 门不一致**：`paper-2026-i/config.json` 无 `canonicalRequestPath`，不能当「照抄即可 publish」的完整范例。
8. **重试与盯梢假设**：扇出失败由主 agent 读错修 JSON 再验（§4）；无「上报/停点」机器格式。
9. **答案人工确认点未结构化**：强制 ≥300 DPI 核对是文字纪律，不是文件夹状态机上的 `needs-human-answer-check` 信号（map 已定两点人工确认，契约未落地）。
10. **发布前 QA / Owner browser 矩阵**在 §12，明确「不是 runbook 的活」——任意 agent「导完」与「可上线」之间缺交接状态。
11. **Genre-truth / topic backfill** 等导入后维度：runbook 把 genre 算 import-complete，但路径/API/agent 会话策略未与「任意 Agent」对齐。
12. **格式① vs ② 双路径**：§0 把 DOCX 指回 README；「任意一卷」若源是 DOCX，契约入口分叉未在单一 checklist 收束。
13. **本地-only 与写锁**：假设 agent 知道停 8787、只用本地 SQLite、永不碰 `pull-run-push`/生产（AGENTS.md + runbook）——需在契约头复述为硬停点。
14. **完成信号不统一**：有的 Done when 是控制台字符串，有的是文件存在，有的是人眼——后台无法单靠一种探针。

这些是票 04「任意 Agent 可导题契约」与票 05 后台信息架构的直接输入；本报告不设计解法。

---

## 未能核实（只读边界）

- 未实际执行任何 import/publish/verify 命令；完成字符串以文档与脚本源码为准。
- 未打开 `paper-2026-i` 源 PDF 做独立答案抽查；答案摩擦引用 CR/ledger。
- 未枚举当前 Manifest 版本下 `reviewed-evidence-dir` 的完整文件清单与 schema 文件路径（仅据 runbook/`build-canonical-request.mjs` 选项与失败闭合描述）。
- 酸测试「fresh Sonnet 卡壳轮次」无独立完成报告文件（plan 要求记录；仓内仅见 plan/cr/ledger 间接痕迹）。
- 未验证非 macOS 上 playwright 裁图 fallback 的现行可运行性。
- DOCX 格式①端到端与现行 canonical-required publish 的交叉兼容未在本审计重跑证明。

---

## 对后续票的一句话指向

- **后台进度**：以 §1.2 落点表为探针模型，并显式加入 Canonical envelope 与 POST-attach。  
- **契约（票 04）**：优先补「无子代理编排」「reviewed-evidence 作者步骤」「人工停点状态」「与 paper-2026-i 范例对齐的可 publish config」。  
- **试点（票 03）**：用 Grok 实测 §2/§4/视觉三关的真实卡点，反哺上表「易卡点」列。
