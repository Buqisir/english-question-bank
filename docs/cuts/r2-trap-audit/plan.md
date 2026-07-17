# r2-trap-audit — 干扰项机审 + 摘牌刀 plan

- Cut line: **medium**; touches schema / data contract: **yes——纯增量
  （trap 对象加 suspension 字段），按 dispatch map 降 PA-lite**。降档
  理由（CR 须复核）：① 方向 owner 当场拍板（2026-07-16「讲评不能
  虚假」+「听你的」，program.md R2 节重定向已入档）；② 增量字段 +
  显示门控，零现有字段改义，回滚 = revert；③ 数据批改仅作用于机判
  实锤项，改前有 scan-report 全量清单可审计。
- 上位档案：`docs/cuts/analysis-fields/program.md` R2 节（三段走：
  机审+摘牌 → owner 报量裁点 → 判例战役）。本刀只做第一段。
- 判例基础：trust-cracks 诚实空态 / reorder-suggest 宁缺勿假——
  **宁可不显示定性，不可显示假定性**。

## 数据事实（立刀时实测）

- trap 长在各卷 `app/public/paper-assets/<paperId>/latest/analyses/
  reading-choice-analysis-v1.json` 的 `questions.<qid>.optionAnalysis[]`
  （versions/ 下有历史版本）；`primaryType` 分类型异形子结构——
  `sourceLexicalTrap` 用 `sourceText/relationNote`，其余类型用
  `sourceQuote/explanation` 系（扫描器必须按类型适配，program 原文
  点名过）。全库账面 1395 条（2026-07-10 盘点），以扫描实数为准。
- 活消费方：`PaperAssetAnalysisPanel.tsx`（类型徽章 trapLabel +
  兼有/细分 + 证据行）、`server/draft-paper/analysisText.mjs`
  （`trap.explanation` 拼「干扰项：…」进讲评文本/DOCX）。

## 目标

① 1395 条 trap 全量机审出**返修清单 + 规模真相**；② 摘牌机制上线：
机判实锤贴错者当天不再对老师撒谎；③ 为第二段判例战役备好弹药
（边界样本分批清单）。

## Scope（按施工序）

1. **扫描器** `scripts/trap-audit-scan.mjs`（确定性，零 AI）。四类
   检查，每类输出独立计数与命中明细：
   - 野类型：`primaryType` 不在受控词表（词表以现行 schema/validator
     为准，`timeOrderReversal` 这类漏网单列）；
   - 标签-解释自相矛盾（机判子集）：判「无中生有」类但解释/关系注
     里含原文引证钩子（sourceQuote/sourceText 非空或解释文本含引号
     引原文——精确判据 DEV 按数据实况定义并在报告里写明判据原文）；
   - 分类型子结构完整性：五类 trap 各按其子 schema 查缺字段/空值；
   - 懒人桶引证泄漏：程序化可判的「无中生有」误用证据字段模式。
   - 产出：`docs/cuts/r2-trap-audit/scan-report.md`（人读：分类计数、
     566 条无中生有里实锤贴错占比、判据原文）+ `scan-findings.json`
     （机读：逐条 paperId/qid/optionIndex/checkId，驱动第 3 步与
     第二段战役）。
   - **扫描器只读不改数据**；报告数字必须可由 findings.json 复算。
2. **摘牌机制（数据契约，纯增量）**：trap 对象加可选字段
   `suspension: { level: 'badge' | 'row', reason: <checkId>,
   suspendedAt: <date> }`。两档语义：
   - `badge`（标签实锤贴错、解释仍可用）：讲评面板隐藏定性徽章与
     兼有/细分，解释文案照显；analysisText/DOCX 照用 explanation
     （它不引用类型标签，实测无虚假面）；
   - `row`（子结构坏死、无可用解释）：面板整行不显，analysisText
     跳过该项——宁缺。
   - 显示门控落点：`PaperAssetAnalysisPanel.tsx` + adapter 透传字段
     + `analysisText.mjs` 的 row 跳过。**不做任何「暂无定性」占位
     文案**——摘了就是干净不显，不解释给学生/老师看系统内情。
3. **机判实锤自动摘牌批**：按 findings.json 中「机器可证伪」子集
   （自相矛盾 + 子结构坏死 + 野类型）批量写 suspension 进 latest/
   analyses（**versions/ 历史版本不动**；若 paper-assets 版本纪律
   要求走新版本目录而非就地改 latest，以
   `verify-paper-assets-consistency.mjs` 与 nck1 标准的现行契约为准，
   冲突即停手上报）。边界存疑项**不摘**——待第二段 owner 判例。
4. **verify** `scripts/verify-r2-trap-audit.mjs`（注册 verify-ci +
   scripts/README.md 同刀原子）：latest 零野类型；每条 suspension 有
   合法 level/reason；被摘 badge 项在 adapter 输出中确无 trapLabel；
   row 项不进 analysisText 输出（行为断言：调真模块）；
   findings.json 与报告计数一致。
5. **DP-2 行为脚本**入档 `qa/`（三判例照守：rootDir 推导/几何断言/
   DP2_SCREENSHOTS 门控）：找一条被摘 badge 的题实点讲评面板——
   徽章不显、解释仍在；一条正常题徽章照显；DOCX 导出含正常干扰项行。
6. **文档**：program.md R2 节勾第一段；STATUS 由主代理收官时更新。

## Forbidden（出界即停）

- 不改任何 trap 的 `primaryType`/解释文本——**本刀只摘牌不改判**
  （改判是第二段判例战役的事）；
- versions/ 历史目录只读；
- 相似题引擎（server/search/**）零改动；
- 不新增「存疑」中间态展示——存疑项维持现状展示，待判例。

## 裁决点清单（PM 断点锚）

- [x] 裁0：owner 拍板方向（2026-07-16「讲评不能虚假」+「听你的」，
  program R2 重定向同日入档）。
- [x] 裁1：DEV 完成（含一次门控归属自纠返工），主代理 worktree 亲跑
  四命令真实退出码全 0（tsc / narrow 63 / verify:all 83-1-0 / DP-2 14）；
  versions/ 停手判断经事实核查成立（gitignored 本地产物，git 仅
  latest/，7ed780a 前例同）（2026-07-16）。
- [x] 裁2：fresh CR APPROVE with MF×1 / SW×3 / NTH×2（cr.md）。
  **MF-1 主代理当场收账**（59987e5）：7 条判据命中降述为「启发式
  上界」——正则不验证引号内容是否原文，CR 实证 1 假阳（zj-2020-jul
  q029 引选项自身文本）；摘牌批不动（摘牌=预防性撤销定性，保守而
  非虚假，裁4 逐条裁后误摘回牌）。SW-1=describeTrap 穷尽性守卫
  丢失、SW-2=row 档无真语料 DOM 证，均挂账。
- [ ] 裁3：merge + main CI 绿。
- [x] 裁4①③：owner 判例 8/8 落判（2026-07-16，审卷页 ruling-card.html
  当场裁；词钩 owner 定义 + CL-1~7 入 rulings.md）；**第二段战役当场
  收官**——机审真数不支持全量重分类，剩余懒人桶讲评撞到再报。落地刀
  r2-trap-rulings 同日收（merge 8179a5b，CR-2 APPROVE 0MF/3SW，主代理
  亲跑四命令全绿 + main CI 双证）：回牌 3 / 改判重铸 5（忠实度 CR 逐条
  核 + 引文防幻造实证）、机审吸收判例（R6 假阳修复 + adjudications
  白名单互指 rulings.md）、库内 suspension 归零。
- [x] 裁4②：owner DP-3（QA 表改版：回牌题徽章恢复、改判题显新标签、
  DOCX 正常）→ 拍板部署生产。
  - DP-3 owner 委托主代理亲验（2026-07-16「这些你能做的」）：数据层
    latest/ 8/8 判例落地 + 全库 suspension 0；讲评面浏览器亲眼 8/8
    （回牌 3 徽章恢复、改判 5 显新标签：词钩×3/对象错配/无中生有）；
    教师版 DOCX 导出 zip+XML+textutil 三重过、判例题组内容完整（
    【解析】=paperId 指针系 publisher.mjs 既有设计，非本刀回归）。
  - 部署（2026-07-16 owner「发」）：deploy-remote.sh 一键上产
    0387283——server FF pull c82643f→0387283、build 成、eqb+caddy
    active、health ok、eqbank.cc 200。retire 刀已先在产线（c82643f
    含 af21f7c），本批实上 R2 双刀。生产资产端点 401 系 enforced
    模式正常（未登录不放内容），部署完整性以 FF+build 为证。

## Verify（RM 闸口径）

`tsc` → `node scripts/verify-r2-trap-audit.mjs` →
`pnpm -C app run verify:all` → DP-2。全过 + main CI 绿后 RM。

## 账单

（收官时填。）
