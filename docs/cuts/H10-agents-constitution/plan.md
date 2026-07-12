# H10-agents-constitution Plan — AGENTS 宪法化拆分 + 判例库 + 交接/QA 模板件

## Cut Size

medium。

Touches schema, data contract, product boundary, or teaching interpretation: no。
纯流程文档面(AGENTS.md / docs/agents/ / docs/cuts/_templates/),零代码。

出处:2026-07-11 协作流程复盘,owner 拍板"现在就优化"。复盘全文结论:
交接成本=运行成本(Workflow 试点账单实证主代理重放税);AGENTS.md 沉积化;
PM 层交接无落点;评审/判例产物未复利化。

## Objective

把 AGENTS.md 从"法条+历史叙事混葬的沉积层"拆成:**宪法**(AGENTS.md 本体,
只写现行法条最终形态)+ **判例库**(docs/agents/case-law.md,每条=日期+事故+
固化法条指针)。同刀落地本次复盘 owner 拍板的五条新法 + 三件模板。

## Locked Product Decisions

- 判例叙事(日期戳、事故经过、账单数字)全部迁往 case-law.md,宪法只留法条。
- 宪法序言写入血书元规则:新硬法条须真实事故或 owner 拍板背书,预防性规则默认不进。
- 本次新法仅五条(均 owner 2026-07-11 拍板):①记忆不存项目状态快照,唯一真源
  STATUS.md;②commit message 一行摘要,裁决细节入 cut 目录文件;③medium/large 刀
  plan.md 增裁决点清单(PM 层断点锚);④owner QA 命中率降档(同类三把零发现降抽查);
  ⑤外脑绝对路径标注"仅本机"。不夹带其他新规则。
- 巡检 cron、restore 演练、project-os 蒸馏、AGENTS 以外的 steering 重写:不在本刀。

## 硬契约(不得偏离;偏离 = CR 打回)

- C1 **零丢条**:老 AGENTS.md(git show HEAD~n)中每条现行有效法条,在新结构
  (宪法本体,或宪法明确指针指向的文档)中有去处且语义不减弱;被删的只能是
  叙事/出处/重复(判例内容须在 case-law.md 找到)。
- C2 字面保留 `single source of truth for agent rules`
  (scripts/verify-architecture-housekeeping.mjs 断言)。
- C3 节名 `Current Operating Reality` 保留(被 .claude/agents/*.md ×4、
  pa/cr-persona、review-levels、cut-workflow-protocol 共 8 处引用,不翻新)。
- C4 宪法本体目标 ≤180 行(实际行数如实报告,不为凑数删法条)。
  **施工中修订(2026-07-12)**:零丢条约束下实测法条本体体量,宪法落地
  330 行(469 → 330,-30%;已二次下放 dispatch-protocols.md /
  ui-collaboration.md 并对 review-levels 去重)。180 不可达:产品法
  (Posture / Steering / Teacher ~95 行)与核心流程法(Current Operating
  Reality 95 行)均为现行有效法条,继续压只能删法条或玩排版。偏离
  交 CR 审计表态。
- C5 新增模板三件:_templates/plan.md 增"裁决点清单"节;新建 _templates/case-ruling.md、
  _templates/qa-checklist.md;_templates/README.md 登记。
- C6 review-levels.md「Hit-Rate Adaptive Depth」扩展 owner QA 降档段,标注 owner
  拍板 2026-07-11。

## Forbidden

- app/ server/ scripts/ 一律不碰(零代码刀)。
- docs/steering/、docs/agents/ persona 文件、cut-workflow-protocol.md 不改写
  (除非出现引用断裂,断裂修复仅限指针行)。
- 历史 cut 文档(docs/cuts/ 既有目录)不动。
- CLAUDE.md 不动(断言已满足)。

## Verification

- C2/整体:`node scripts/verify-architecture-housekeeping.mjs` 全绿(原始退出码)。
- 仪式:`node scripts/verify-cut-artifacts.mjs docs/cuts/H10-agents-constitution medium`。
- C1:fresh Opus CR(cr-reviewer)做**零丢条审计**——逐节对照老 AGENTS.md 与新
  宪法+case-law,列出任何被丢/被弱化的现行法条为 Must Fix;顺带核 C3 八处引用
  未断。产出 docs/cuts/H10-agents-constitution/cr.md。
- 收口:main CI 绿;STATUS.md 收官行 ≤5 行。

## 裁决点清单(主代理出场点;施工中勾选)

- [x] 拆分方案与五条新法范围(owner 拍板 2026-07-11"现在就优化")
- [ ] CR 零丢条审计结论处置(Must Fix 归零后才收口)
- [ ] STATUS 收官行 + 收口 commit
