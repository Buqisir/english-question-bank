# nck1-import-runbook Plan — 导题 runbook 固化 + 首导 2026 新课标 I 卷

## File Set(流程三改进③:声明本刀触碰的文件集)

新增:`docs/import/agent-runbook.md`、`docs/import-ledger.md`、
`scripts/import-pipeline/pdf-extract.mjs`(如需)、
`scripts/import-pipeline/verify-nck1-standard.mjs`、
`scripts/import-pipeline/papers/paper-2026-i/**`(source 已就位)、
本卷 paper-assets 产物、本目录文档。
可改:`scripts/import-pipeline/README.md`(指向 runbook)、
`scripts/import-pipeline/lib.mjs`(仅按需硬化 PDF 文本变体,改动须列报告)。
不碰:`app/src/**`、`server/**`(shipped 契约代码零改动)、
现有 `scripts/verify-*.mjs`、生产。

## Cut Size

medium。

Touches schema, data contract, product boundary, or teaching interpretation:
**yes — PA-lite 降格**:仅**纯增量** asset 原料区(`listening/`、
`figures/`,现无任何消费方读取)+ 离线管线文件;shipped 发布契约
代码零改动;教学解释已由 owner 终审的
`docs/product/nck1-paper-standard.md` 锁定,本刀是执行。降格理由
按 AGENTS 规则记于此,CR 须复核。

## Objective

把导题从「住在小川历史会话里的手艺」变成「任何模型的 agent 照文档
就能执行的工序」,并用它完成首个实战:导入 2026 新课标 I 卷
(PDF 试题 + 独立答案 PDF,含听力原料与 A 篇表格双存桥)。
验收的核心是酸测试:一个**未参与本刀开发的 fresh Sonnet agent**
只读 runbook 把卷导通,gate 全绿。

## Locked Product Decisions(均为 owner 2026-07-08 拍板,出处 nck1-paper-standard.md)

- 一切按《新课标一卷标准》v1 执行:结构/题号/分值表(§1)、洗卷
  规则(§2)、答案红线(§3)、听力原料条款(§4)、图文条款(§8)。
- 听力:四件套(题干/选项/答案/录音稿含时长语速表)存
  `listening/` 原料区,不建 DB 题组、不跑解析。
- A 篇赛程表走双存桥:拍平文本进 materialText + 整表截图进
  `figures/`。含表截图的该题组**不可组卷**的消费降级属刀④⑤范围,
  本刀只保证原料齐 + 在台账里标注。
- 台账:`docs/import-ledger.md`,每次导入追加一条(paperId/日期/
  源/gate 结果/警告/值得看的点),本卷是第一条。
- 解析扇出模型档位:切卷等机械活 Sonnet,题目解析 Opus
  (README 已验证的档位,写死进 runbook)。

## 硬契约(不得偏离;偏离 = CR 打回)

- C1 `docs/import/agent-runbook.md` 存在且自足:一个不了解本仓库
  历史的 agent 从「拿到源文件」到「发布入库 + 回填 + 台账 + 验证」
  全程只依赖该文档与其引用的标准/脚本。解析扇出不再 ad-hoc:每
  题型的解析派发模板(输入文件、prompt 要点、校验命令、重试规则)
  在 runbook 或其引用文件中固化。
- C2 `paper-2026-i` 完成导入:9 题组齐(reading×4 / seven_choices /
  cloze / grammar_cloze / writing×2),题号段、分值符合标准 §1,
  客观题 21–65 答案与 `source/answers.pdf` 一致。
- C3 听力原料区 `listening/` 齐全:1–20 题干+选项+答案+录音稿
  (含时长/语速表),JSON schema 由本刀定案并写回标准「开放项」。
- C4 A 篇表格双存:materialText 含拍平文本,`figures/` 含整表
  截图;figures 命名与关联记录格式定案并写回标准「开放项」。
- C5 新增 `verify-nck1-standard.mjs`:对给定 paperId 校验标准 §6
  全部条目(9 题组/题号段/分值/答案数量/听力原料非空/含图表篇
  figures 齐全),对 `paper-2026-i` 全绿;并纳入 runbook 必跑步骤。
- C6 酸测试:发布前由 fresh Sonnet agent(非写 runbook 的 DEV)
  按 runbook 独立走通全程;其卡壳点即 runbook 缺陷,修文档后
  重测,直至通过。酸测试记录(几轮、卡在哪)进完成报告。
- C7 台账 `docs/import-ledger.md` 建立并含 paper-2026-i 条目。
- C8 本地库直写纪律遵守(README 硬纪律:停 API → 发布 → 重启);
  **不碰生产**——生产同步方案在完成报告里给建议,由 PM 另拍。

### 修订(2026-07-08,酸测试第 1 轮发现,PM 拍板)

酸测试实证:`server/paper-import/validator.mjs` 写死「必须且只能
1 个 DOCX(PK 魔数)」,格式② PDF 源在 `--publish` 被硬拒——
owner 已拍板的白名单格式②在契约层无入口。增补:

- C9 validator 扩展(**最小增量**):源文档仍恰好 1 个,类型放宽为
  `.docx`(PK 魔数)**或** `.pdf`(`%PDF` 魔数),各查各的魔数;
  其余全部校验、错误信封、DB/资产写入路径一字不动。行为断言
  进 `verify-nck1-standard.mjs` 或新 verify(起真模块验两种源
  + 一种伪造魔数被拒),不改现有 verify-*.mjs。
- C10 `02-publish.mjs` 发布失败时打印 validator 的
  blockingIssues/rejectedFiles 详情(酸测试实证的诊断盲区)。
- C11 runbook 步骤 1/8 同步修正(「不查扩展名」的误导句删除,
  写清发布链路的校验点);酸测试重跑步骤 8-11 直至全绿。

File Set 相应扩大:`server/paper-import/validator.mjs`(契约文件,
改前 `touch .claude/contract-unlock`,commit 后删除)、
`scripts/import-pipeline/02-publish.mjs`。PA-lite 降格理由更新:
C9 为纯增量放宽(新增可接受源类型 + 同等强度魔数校验),发布
产物形状与所有消费方零变化;CR 必须专项复核此降格。

## 参考实现(可偏离,偏离须在完成报告里说明)

- PDF → 文本:优先 agent 直读 PDF 产出结构化文本喂
  `lib.mjs` 切卷(官方「第X部分/第X节」变体已支持);如需脚本化
  提取可引入 `pdfjs-dist`(唯一预批新依赖,装在 server 或
  scripts 层,不进 app bundle)。
- 表格截图 / 图裁取:playwright(app 依赖已有)渲染 PDF 页面后
  区域裁图,或 macOS `sips`;择简单者,工序写进 runbook。
- 独立答案注入:参考 `zj-inject-answers.mjs` 先例。
- 写作节:答案 PDF 的评分细则 + 下水文按 §3 存卷级资产附件,
  文件约定定案后写回标准「开放项」。
- runbook 结构建议:前置检查(白名单/答案在场)→ 切卷 → 解析
  扇出(模板)→ 校验 → 原料区(听力/figures)→ 发布(含停 API
  纪律)→ verify-nck1-standard → 台账 → 收尾。每步给「做完了」
  的判定命令。
- 解析扇出的产物校验沿用 `validate-one.mjs`;发布走
  `02-publish.mjs`,不新造发布路径。

## Forbidden

- `app/src/**`、`server/**`(含 shipped 契约代码;PA-lite 降格
  的前提就是零产品代码改动)。
- 现有 `scripts/verify-*.mjs`、`.github/workflows/**`。
- 生产服务器与生产 DB;`.env.qa`。
- AI 做题充当答案(标准 §3 红线);答案只认 `source/answers.pdf`。

## Suggested Files

- `docs/import/agent-runbook.md`(新,核心交付)
- `docs/import-ledger.md`(新)
- `scripts/import-pipeline/verify-nck1-standard.mjs`(新)
- `scripts/import-pipeline/pdf-extract.mjs`(按需)
- `docs/product/nck1-paper-standard.md`(仅「开放项」定案回填)

## Verification

- C1/C6: 酸测试通过记录(fresh Sonnet、轮次、卡壳点、最终全绿)。
- C2–C5: `node scripts/import-pipeline/verify-nck1-standard.mjs paper-2026-i`
  全绿;答案抽查(21–65 与 answers.pdf 对照表进完成报告)。
- C7: 台账文件存在且含首条。
- C8: `git diff main --stat -- app/src server` 为空;完成报告含
  发布前后 API 停启记录。

## Browser QA Matrix

导入后 owner 在本地站点抽查:找到 paper-2026-i 的 A 篇 → 详情
文字正常;组卷加入 B/C/D 篇 → A4 预览正常。(A 篇含表,消费
降级属刀④⑤,本刀不改前端,故 A 篇现状展示为拍平文本属预期。)

## DEV Readiness

- 源文件已就位:`scripts/import-pipeline/papers/paper-2026-i/source/`
  (paper.pdf / answers.pdf)。
- 标准已拍板(nck1-paper-standard.md),管线/文档全部在 repo。
- 无阻塞,可立即开始。酸测试需第二个 fresh agent,由 PM 在 DEV
  交付 runbook 后派出。
