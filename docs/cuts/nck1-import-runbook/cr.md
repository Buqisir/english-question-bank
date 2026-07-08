# CR — nck1-import-runbook (冷读复核)

**Reviewer**: fresh CR subagent (did not write this cut).
**Baseline**: `git diff main...HEAD`, branch `claude/nck1-import-runbook`, 5 commits
(`f3901ee` plan → `88a0053` DEV 主体 → `c1761bf` plan 修订 → `8cb5ba0` validator C9-C11 → `9bbe374` 发布产物).
**Recommendation**: **APPROVE with Should-Fix** — 无 Must Fix；SW1/SW2 为非阻塞文档/接线问题，建议随手修。

> **修订记录（2026-07-08，RM 裁决后）**：本报告初版曾以「Q55 答案 = A、与源不符」开出 MF1 并判 REQUEST CHANGES。
> RM 一手源证据反驳，经我用 pdftoppm 300 DPI 整页渲染 + 定点裁剪复核，**源答案 Q55 = B，与所有产物一致，MF1 系误报，已撤销**（详见文末「误报更正记录」）。

---

## Changed Scope（核对 diff 文件表，非报告转述）

- `server/paper-import/validator.mjs`（唯一 shipped 代码改动，+13/-5）— 契约文件，改前 unlock 已按纪律处理（见下）。
- `scripts/import-pipeline/`：新增 `pdf-extract.mjs`、`verify-nck1-standard.mjs`、
  `verify-source-doc-types.mjs`、`attach-paper-assets-extras.mjs`、`papers/paper-2026-i/**`；改 `02-publish.mjs`(+11)、`README.md`。
- `docs/`：新增 `import/agent-runbook.md`、`import-ledger.md`；改 `product/nck1-paper-standard.md`（仅开放项节）。
- 发布产物：`app/public/paper-assets/paper-2026-i/latest/**`（`versions/` 被 `.gitignore` 排除，未跟踪 ✓）。
- **Forbidden 核对（读 diff，非报告）**：`app/src/**` 零改动 ✓；`server/**` 仅 `validator.mjs`（契约放宽，plan 修订授权）✓；
  `scripts/verify-*.mjs`（现有）、`.github/workflows/**` 未碰 ✓；`lib.mjs` 零改动 ✓；
  `.claude/contract-unlock` 不在任何 commit、当前也不存在 ✓。

---

## Findings

### Must Fix

无。（初版 MF1「Q55 答案红线」已确认误报并撤销——见「误报更正记录」。）

### Should Fix / Should Watch（不 block 合并，建议一并处理）

**SW1 — `verify-source-doc-types.mjs` 是孤儿脚本，C9 行为断言未接任何闸**
`grep` 全仓：runbook、`verify-nck1-standard.mjs`、`verify-ci.mjs`、README 均不引用它。
脚本本身正确（真 import `../../server/paper-import/validator.mjs`，H1/H2/H3 三断言我重跑 3/3 PASS，
H3 确实断言伪造 `%PDF` 魔数被 `docx.invalidMagic` 拒——非字符串匹配、真跑校验路径），
但**没有任何 gate 或 runbook 步骤会再次运行它**，等于 C9 的回归保护只在手动那一次存在。
建议：runbook 加一步“validator PDF 源回归”或把三断言并入 `verify-nck1-standard.mjs`（C9 原文允许二选一）。
不 block 理由：C9 的行为本身已由该脚本一次性证明正确，且 validator 改动极小、无消费方形状变化；这是“保护未接线”而非“行为错误”。

**SW2 — runbook 步骤 8「Done when: … `paperId: <paperId>`」在成功路径上永远不满足**
`publishPaperImportPackage` 成功返回对象无顶层 `paperId`（`publisher.mjs:529-537`，paperId 嵌在 `result.publish` 内），
故 `02-publish.mjs:257` 的 `if (result.paperId)` 在成功时**从不触发**，成功路径只打 `status: published`。
台账（import-ledger.md 第 16 行）已记下此瑕疵并写“worth fixing in the script or amending the runbook”，
但脚本与 runbook 均未改——下一个照 runbook 的陌生 agent 会因看不到 `paperId:` 行而误判步骤没完成（正是台账担心的 false alarm）。
建议：改 runbook 步骤 8「Done when」措辞，或修 `02-publish.mjs` 成功分支打印 `result.publish?.paperId`。
（注：C10 只补了 `validation_failed` 分支的诊断，未触及此成功路径瑕疵。）
不 block 理由：发布本身成功、产物正确，仅是文档判定语与脚本输出不一致的自足性瑕疵。

### 观察（不需动作）

- 发布产物把 PDF 源存进 `paper-asset.json` 的 `sources.docx` 键（`validator.mjs:677`）——命名沿用 docx，
  仅存原始字节+sha256、无任何 docx 解包/解析（`storage.mjs:124` 原样落 `raw/<name>`）。纯命名遗留，非正确性问题。
- `verify-nck1-standard.mjs` C5 只**数**客观题答案数量（45），无法对 PDF 源校验答案**正确性**——机器不可及的固有限制，
  §3 因此把答案正确性押在人/CR 的源对照上。本次已由 CR 用 300 DPI 渲染对源逐题核对（45/45 全对，见证据）。

---

## 降格复核（PA-lite 专项，任务第 1 优先）

**验证 C9「最小增量」声称——逐行核 `validator.mjs` diff：**
- `classifyFile`：`.pdf → {kind:'pdf'}`（+1 行）、rejected 文案「.docx 和 .json」→「.docx、.pdf 和 .json」——纯扩表。
- 收集循环：`docxFiles.push({...file, kind})`——docx/pdf 都收进同一「源文档」桶，spread 保留 buffer/fileName，
  `docxFiles.length !== 1` 仍强制**恰好 1 个源文档**，不放宽“唯一性”。
- 魔数分支：pdf 查前 4 字节 `%PDF`，否则查前 2 字节 `PK`——各查各的、强度对等；错误码复用同一 `docx.invalidMagic`。
- `package.docxCount` 文案更新为「.docx 或 .pdf」。
- **写入路径（`normalized.sourceDocx`、`sources.docx`、sha256 校验、DB/资产落地）一字未改**（`validator.mjs:658-683`），
  publisher/storage 侧对源文档一律当不透明字节 blob，无 docx 专属解析。
- 结论：C9 确为纯增量放宽，产物形状与所有消费方零变化。
- **降格结论：认可此改动的 PA-lite 降格，不要求为 validator 改动升格补 PA。** 数据侧（45 题答案）经 CR 独立对源核对无误，
  降格前提「教学解释已锁定、本刀只执行」成立。

---

## Verification Evidence（自跑，非抄报告）

- `node scripts/import-pipeline/verify-source-doc-types.mjs` → **3/3 PASS**（H1 docx / H2 pdf / H3 伪造魔数被拒），退出 0。
- **答案逐题对源核对（pdftoppm 150–300 DPI 整页渲染 + 定点裁剪，非文本抽取）** vs `answer-key.json` + `listening/answers.json`：
  - 听力 1–20：全对 ✓
  - 阅读 21–40：全对 ✓
  - 完形 41–55：**全对（含 Q55 = B）** ✓
  - 语法 56–65：全对 ✓（`to be held / frequency / the / were / necessities / for / Drawn / that/which / heading / cheaper`）
  - 合计 45/45 与产物一致。
- 选项顺序核对：`paper.pdf` p.8 Q41–55 选项与 `pdf-extract.mjs` 登记表逐项一致。
- 标准文档 diff：仅替换「待刀②确认的开放项」节为「刀②回填：开放项定案」；§1–§8 正文（line 113 以上）未动语义 ✓。
- Forbidden / 契约纪律：见 Changed Scope（lib.mjs 零改、unlock 无残留、versions 未跟踪、app/src 零改）。

## Failure / Attack Angle

- **答案数量闸的盲区仍在**：`verify-nck1-standard.mjs` 只数答案个数、不校验对错——这道卷靠 CR 人肉对源兜住了，
  但下一套卷若无人做同等强度的源对照，一个抄错的答案会全绿通过。建议把“源对照抽查”写死进 runbook 的强制步骤，
  并要求完成报告贴高 DPI 对照图。
- **孤儿保护**（SW1）：C9 断言脚本没进任何闸，下一套卷改 validator 时无人会重跑它——保护形同不存在。
- **文档陷阱**（SW2）：步骤 8 不可满足的 Done-when 会让下一个陌生 agent 卡住或误判，削弱本刀核心交付（自足 runbook）。
- **换 DOCX 源走格式①**：runbook §0 把格式①指回 `README.md` stages 1-5、本 runbook 不重述；格式①的答案注入走
  `zj-inject-answers.mjs` 先例、`verify-nck1-standard` 是否覆盖 DOCX 源未在本刀实证（本刀只导了 PDF 卷）。

## Self-Review Blind Spots（喂后续 Big CR 优先看这些）

- **本次最大教训（记录以备复盘）**：CR 首轮用 Read 工具的**低分辨率整页 PDF 渲染**读答案，把 Q55 的 `B` 误读成 `A`，
  开出误报 MF1。根因：单字母答案在整页缩略渲染下极易混淆（尤其 A/B），而我未对该单点做定点高清复核就下 Must Fix。
  正确姿势（已补做）：对答案红线这类零容忍点，必须 `pdftoppm ≥300 DPI` 定点裁剪逐格确认，不能靠整页缩略图或文本抽取。
  → 建议把“答案对源核对须用高 DPI 定点渲染”写进 CR/runbook 的答案红线核查规程。
- 我只**抽查**转录忠实度的答案层与选项顺序层；**未逐字通读** B/C/D 篇 materialText、seven_choices 材料、
  cloze/grammar 段落文本与源 PDF 的全文一致性——题干/段落里仍可能有未捕获的转录漂移，留给 owner browser QA / Big CR。
- 听力 transcript 只看了 Text 9 结构与一段忠实度；1–20 全量对照未做（§4 原料不消费，风险低但未证）。
- figures 双存桥 `placeholderMarker` 与 `normalizePassageText` 输出一致性，我信 `verify-nck1-standard` 强校验，未独立复算。

## Residual Risk

validator 降格改动认可、45 题答案经源核对无误，可合并。SW1/SW2 为文档/闸接线问题，建议随手一并修，不单独 block。
全文转录忠实度（B/C/D 篇、听力全量）留给 owner browser QA 兜底；答案数量闸的盲区是长期软肋，建议后续把“源对照抽查”固化进 runbook。

## Recommendation

**APPROVE with Should-Fix** — 无 Must Fix。SW1（孤儿 verify 未接闸）、SW2（步骤 8 Done-when 不可满足）建议与本刀同批修，均不阻塞合并。
validator PDF 降格改动认可，无需升格补 PA。

---

## 误报更正记录（RM 裁决 2026-07-08，供流程复盘）

- **误报内容**：初版 CR 判 Q55 客观题答案 = A、与源不符，开 MF1（§3 答案红线），总结论 REQUEST CHANGES。
- **一手源证据**：RM 整页渲染读图，源 answers.pdf p.1 第三部分第一节明印 `55. B`；`pdf-extract.mjs:169`、
  `paper-asset.json`、`answer-key.json`、DEV 对照表四者一致均为 B；语义侧 Q55「I can ___ my small town roots to
  lead me...」B(trust) 为唯一通顺项。
- **CR 复核**：以 `pdftoppm -r 300` 整页渲染 + 定点裁剪逐格确认 51–55 行 → 清晰为 `51.A 52.B 53.D 54.C 55.B`；
  并把全部 45 题在 150–300 DPI 下重核，45/45 与产物一致。**确认源 = B，MF1 系误报。**
- **误报根因**：CR 首轮依赖 Read 工具的低分辨率整页 PDF 渲染读单字母答案，A/B 在缩略图下混淆；未对红线单点做高清定点复核。
  （RM 猜测的“文本抽取串列”非直接原因——CR 读的是渲染图而非文本层，但同属“分辨率/工具不可靠导致误读”一类。）
- **连带撤销**：初版对 DEV「45 题对照表未真对源」的指控一并撤销——对照表在 Q55 处与源一致，指控不成立。
- **教训固化建议**：答案红线核查必须用高 DPI 定点渲染逐格确认，禁止以整页缩略图/文本抽取作为开 Must Fix 的唯一依据。

## RM Disposition(主代理,2026-07-08)

- MF1(Q55 答案)裁决:RM 以整页视觉渲染重读源 answers.pdf p.1,
  实证 55=B 与产物一致;CR 以 ≥300 DPI 定点渲染复核后自行撤销
  MF1 并把 45 题全部高清重核(45/45 一致),误报根因(低分辨率
  读图)已记录在案。裁决过程:RM 出示一手证据 → CR 自行复核修订,
  未发生 PM 越权改判。
- SW1/SW2:已修(commit 4ef219e)——verify-source-doc-types 接入
  verify-nck1-standard 为 S0 检查(17/17,含故意改坏断言的布线
  验证);02-publish 成功路径 paperId 打印修复 + runbook Done-when
  同步;台账补记。
- CR 长期提醒(答案对错无自动闸)采纳:runbook 转录步骤已加
  「≥300 DPI 逐格对源确认」强制项(本 commit)。
- 降格复核:CR 维持认可 validator PA-lite 降格,不升格补 PA。
- 合并前置:PR CI 全绿(verify + e2e 两 job)。
