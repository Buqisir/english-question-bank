# CR — H10-agents-constitution 零丢条审计

Commit b674b1b(parent plan 53cfc8a)。fresh Opus CR,冷读 diff。

## 结论

**APPROVE**(0 Must Fix,2 Should Watch)。

C1 零丢条:老 AGENTS.md(53cfc8a,469 行)逐节比对新宪法(330 行)+ 四份
指针目标 + case-law.md,**未发现被丢或被弱化到影响执行的现行法条**。所有
被删叙事(日期戳事故 / 账单 / "三次抓到"类)均在 case-law.md 有对应条目。

## Changed Scope

10 文件,全部落在 plan 允许面(AGENTS.md / docs/agents/ / docs/cuts/_templates/
+ 本 cut plan.md)。Forbidden 面(app/ server/ scripts/)零触碰(diff --name-only
证实)。

## 核对过的范围(声明)

- **逐节零丢条**:老文件九大节(Header / Current Operating Reality〔Roles /
  Dispatch map / Tier·effort / RM gate / Session reading〕/ Working memory /
  Product Posture / Project Steering / Context·Output Economy / Super Teacher /
  Browser Verification / Matt 外脑 / Collaboration Workflow / UI Collaboration /
  Agent skills)逐条追踪去处。指针化条目均**打开目标文档核实内容真实存在**:
  - Dispatch map 的流水线 / 并行 / worktree 细则 → dispatch-protocols.md 全文
    含四条硬纪律、并行三条、worktree 血书①-④、setup-worktree、locked worktree 处置。
  - UI 灰区 / 快路径 / 升级触发 / 分支流程 → ui-collaboration.md 全文含。
  - Hat contracts / 角色定义 → review-levels.md Roles(PO/PA/DEV/CR/QA/RM)+
    line 109 operating-reality 注,回填充分。
  - 命名规则(legacy goal.md 容忍、goal/loop 保留、artifact set)→
    _templates/README.md 含(line 25 / 53-54 / 22-31)。prototype.html 快照法条
    宪法本体保留(line 176-177),不依赖 README。
  - Findings 词表 / Self-Review Blind Spots → review-levels.md(line 94-101)。
  - completion report 要件 → 宪法内联保留(line 285-289)+ dev-completion-protocol.md 指针。
- **叙事迁移**:老文件 19 处日期戳 / 账单 / "三次" narrative 全部在 case-law.md
  找到对应条目(2026-07-02→07-11 + 「更早」段)。
- **C2**:AGENTS.md line 6 字面含 `single source of truth for agent rules`;
  verify-architecture-housekeeping.mjs 独立重跑 **exit=0,73/0**。
- **C3**:`Current Operating Reality` 节名保留(AGENTS.md:17);8 处引用未断——
  .claude/agents/{dev,dev-hard,cr-reviewer,pa-reviewer}.md、
  docs/agents/{pa-persona,cr-persona,review-levels}.md、
  docs/steering/cut-workflow-protocol.md 全部仍指向存在的节。
- **指针路径**:新 AGENTS.md 引用的 25 条路径全部真实存在(逐条 test -e 通过)。
- **五条新法边界**:①记忆不存快照(Working memory 115-118)②commit 一行摘要
  (Context/Economy 198-200)③裁决点清单(Collab 266-269 + plan.md 模板)④owner
  QA 降档(review-levels 83-92)⑤外脑绝对路径仅本机(Matt 237-238)——各有
  case-law 出处;宪法序言血书元规则(10-11)为 plan Locked Decisions 明列项,
  非夹带。**未发现第六条夹带新规则**。
- **交叉一致性**:review-levels owner-QA 降档段与 CR 降档段同法理(3 把零发现→
  抽查;1 命中→立即回升;L4/新面/不可逆 永不降),无矛盾。_templates/plan.md
  「裁决点清单」节位于 PA Follow-Up 之前,scope 限定 medium/large+步间裁决,
  与模板其余无冲突。

## Findings

### Must Fix
无。

### Should Watch(不阻塞合并)

- **SW1 — 精度条丢失:节间优先级裁决句**。老 AGENTS.md line 11-13
  "This section overrides any conflicting role or process text below and in the
  steering notes." 在新结构中无逐字去处。判定不阻塞的理由:(a) 新 header
  "single source of truth for agent rules" 已确立 AGENTS.md 对其它 entry 文件
  的优先级;(b) pa/cr-persona 仍以 `AGENTS.md "Current Operating Reality"` 为
  **authority** 引用,优先级语义在;(c) 新宪法反而显式把 tier-flow 判给
  protocol §2、gates 判给 review-levels,一刀切"COR 压过 steering"已与这些
  新的显式让渡部分抵触,故删除部分是与新架构自洽的,而非纯丢失。若 owner
  希望保留冲突兜底,补一句"conflicts resolve in favor of this file"即可,非本刀必须。

- **SW2 — 机制注脚丢失:status-archive 扫档方式**。老 line 133
  "the sweep itself is a queued tiny cut" 未迁移。规则本体(>两周条目 roll into
  docs/status-archive/)已保留(新 line 90),丢的只是"扫档动作 = 排一把小刀"
  的执行方式注脚。影响可忽略,补否随意。

## C4 独立表态(宪法 330 行 vs 目标 ≤180)

同意 plan 的 2026-07-12 修订判断:剩余体量基本为不可无损下放的现行法条。
逐块看,唯一体量偏大的候选是 UI Collaboration 的契约 hook 机制段(新 303-314,
约 12 行),理论上可下放 ui-collaboration.md;但 plan 明确判定 hook 机制为
**核心法条**(deny 语义 / bypass 生效 / unlock 流程)须留宪法本体,只下放灰区/
快路径——此判断合理(hook 是硬门,不是操作细则)。RM gate / 复核纪律 / Product
Posture launched / Roles 均为现行有效硬法,继续压只能删法条。**无显著可无损
下放块**,C4 偏离予以接受。

## Self-Review Blind Spots

- 我核实了"指针目标含该内容",但未穷举校验每份被指向文档内部与宪法本体的
  措辞是否存在细微语义漂移(如 dispatch-protocols 的判据表述与宪法一句话概括
  之间)。抽查一致,未见冲突,但非逐字 diff 级。
- Hat contracts 从老 AGENTS 的"每顶帽子职责逐条"压成 review-levels Roles +
  散落各节的描述。我判定回填充分,但 PM 帽的具体职责(grill/plan 压缩/Big CR/
  RM 闸)是跨文档拼合而非单点,未来若有人只读 review-levels 可能不如老 AGENTS
  集中——属可读性而非法条丢失。

## Failure / Attack Angle

本刀风险是"指针悬空"或"语义偷偷缩水"——已针对性防守:25 条路径全部 test -e
通过,四份指针目标全文读过确认承载法条。最可能的漏网是 SW1 类"精度条"在
压缩中蒸发;我逐节比对捕获了两处,均判非阻塞。无运行时 / 数据 / 导出面(纯
文档刀),不涉及 fake-green 或 gate 弱化。verify 独立重跑绿。

## Verification Evidence

- `node scripts/verify-architecture-housekeeping.mjs` → exit 0,73 passed / 0 failed(CR 亲跑)。
- `git diff 53cfc8a...b674b1b --name-only` → 10 文件,Forbidden 面零触碰。
- 25 条指针路径 test -e 全通过;C3 八处引用 grep 确认未断。

## Residual Risk

低。纯流程文档刀,无运行时面。残留仅 SW1/SW2 两条精度注脚,不影响任何 agent
的可执行行为。合并后建议照 plan 收口(main CI 绿 + STATUS ≤5 行)。
