# Project Cleanup Cut — 小川的审查与替代计划

Status: review, proposal-only
Reviewed plan: `docs/cuts/project-cleanup-cut/plan.md` (Sol)
Evidence base: main `19ffc774` + worktree `f9753974`
Prepared: 2026-08-03
Execution authority: none

## 结论先行

Sol 的诊断是对的，但他的药方会成为第 5 轮治理。

这个仓库的真实问题不是"哪些 verifier 该删"，而是**流程规模和产品规模严重倒挂**，
且已经形成"用治理来治理治理"的自我循环。Sol 的计划把最贵、最险的两刀架构重构
（CanonicalRendering、VersionedRenderContract）放在最便宜的减负刀前面，并要求
mutant 证明、deletion test、caller inventory、外部模型全量审计 143 个 verifier——
这套仪式本身就是它想删除的那种东西。

我的替代方案：**三刀，从便宜到贵，架构刀推迟到需求拉动**。每一刀独立可停，
第 0 刀今天就能做完。

## 1. 仓库现状（本次实测，不是转述）

产品代码 vs 流程配重：

| 类别 | 规模 |
| --- | --- |
| 产品代码（app + server + shared，不含 node_modules） | ~36,600 LOC |
| `scripts/`（147 文件，其中 verify-* 主仓 115 / worktree 143 个） | ~51,100 LOC |
| `docs/` 全部 markdown | ~78,300 行 |
| `docs/cuts/` 目录数 | ~140 个 |
| `verify:all` 平铺 verifier 数 | 120 |
| 挂在主仓上的 git worktree | **34 个**（其中 ~18 个是 canonical-unification 单票 codex worktree） |

**验证脚本比产品代码多 40%。文档是产品代码的 2 倍。** 这是一个 invite-only、
单主机、小用户量的在线产品——产品本身值得 80 分打磨，但流程现在配的是
20 人团队 + 不可信贡献者的 120 分企业级配置。

在途状态：

- `codex/paper-canonical-unification-20260725` 领先 main **274 个 commit**、
  落后 **0 个**（可以 fast-forward 合并），diff 为 1,297 文件 +426k/-11k
  （大头是不可变试卷资产与证据）。
- 只差 Ticket 35/36 的 owner QA 收口。

历史模式（这是最重要的证据）：

`docs/cuts/` 里已有 **至少 5 轮**"清理流程"的 cut：`process-slim`、
`process-tuning`、`codex-matt-governance`、`workflow-route-retire`（3 个
worktree）、H2/H7/H9/H10 系列，加上昨天的 deletion-first 改革（26 文件/4,004
行 → 22 文件/1,187 行）。**每一轮都成功了，每一轮之后流程又长回来了。**
Sol 的计划将是第 6 轮。如果不回答"为什么会反复长回来"，第 7 轮已经在路上。

为什么会长回来：多 agent 接力体系（spec → tickets → 每票新 worktree →
review lineage → handoff 模板 → completion exit → closeout 文档）让**每一次
改动都生产流程残留物**。Ticket 35 的连锁反应，一半是架构问题（Sol 说对了），
另一半是流程问题——manifest approval、历史 rederive、lineage 记录本身。
先删流程，架构的痛会小一半；反过来做，流程会把新架构再次淹没。

## 2. 对 Sol 计划的判定

### 保留（直接采纳）

- **第 2 节全部七条安全底线**。原子发布、fail closed、学生版不泄答案、
  Student/Teacher/Print/PDF 同源投影——一条不动。
- **第三刀的三入口设计**：`verify:changed` / `verify:paper` / `verify:all`，
  复用现有 `verifyScope.mjs` + `verify-ci.mjs`，不建新框架。这是全计划最好的部分。
- **第三刀的风险矩阵**（五种变更 × 检查强度）。可以原样抄进 AGENTS.md。
- **第 7 节"明确不做"** 全部保留。
- "清理 cut 自身不得新增治理文档、receipt、审批"这条元规则。

### 反对（三个结构性问题）

**问题一：刀序颠倒。** Sol 把 CanonicalRendering（第一刀）和
VersionedRenderContract（第二刀）放在测试减负（第三刀）和删除（第四刀）前面，
理由是"要先有 Interface test 才能删镜像测试"。逻辑自洽，但代价是：他最痛的
"一直在治理没在开发"，要等两个最重的架构工程完工才能缓解。而 120 个 verifier
里大量删除**不需要**新 Interface test 做替代——它们从未拦住过真实故障，
删了就是删了。便宜的解脱不应该排在昂贵的重构后面。

**问题二：用重流程删流程。** mutant 证明、deletion test、per-verifier named
failure、caller inventory、KEEP/DELETE/DEEPEN/SPLIT 全量分类 143 个
verifier、"每刀报告新增/删除/净变化/fan-out"——这是给删除行为建立的一套
新审批体系。按这套仪式走完四刀，token 和时间开销不会低于又做一个功能季度。
对一个 git 全程可回滚的仓库，删除的成本本来是接近零的。

**问题三：架构刀的收益是期货。** CanonicalRendering 统一 Screen/Print 的
291+381 行重复语义推导，收益只在"下一次改共享题型语义"时兑现。这个产品的
题型集合是相对封闭的（高考题型），共享语义的变更频率值得先观察再投资。
先把流程减负做完，如果之后一个月内真实开发仍被 Screen/Print 双改拖住，
再做这一刀——那时它是需求拉动的，范围也会更准。

## 3. 替代计划：三刀

原则：从便宜到贵；每刀一个 session 时间盒、独立可合并、独立可停；
删除的举证责任反转——**不是"证明可以删"，而是"证明必须留"**；git 是回滚机制，
不再为删除建证据链。

### 第 0 刀：收口在途状态（今天，半天）

现在仓库没有"当前状态"——main 和 unification 分支各说各话，34 个 worktree
挂着。清理必须先有一个唯一基线，否则删的是快照不是仓库。

1. 完成 Ticket 35 的 owner QA（本来就差这一步），fast-forward 合并
   `codex/paper-canonical-unification-20260725` 进 main。落后 0 commit，
   合并没有冲突风险。
2. 逐个检查 34 个 worktree：分支已合并或明确废弃的，`git worktree remove`
   + 删分支；未合并且还要的（应该只剩个位数），列一张五行清单写进
   `docs/STATUS.md`。目标 34 → ≤ 3。
3. 不动任何产品代码。

验收：`git worktree list` ≤ 3 行；main 包含 canonical 全部工作；
`docs/STATUS.md` 五行内说清在途。

### 第 1 刀：验证套件白名单化 + 文档归档（一个 session）

**verifier：白名单保留，其余直接删。** 保留标准（满足其一）：

- build / lint / 单测入口；
- 守护第 2 节七条安全底线之一（答案泄露、原子发布、fail closed、
  Student/Teacher 可见性、user isolation）；
- 一个真实 import→confirm→publish→reload canary；
- 一个真实 Print/PDF 成品 canary；
- 过去 90 天内实际拦住过一次真实故障（git log / 记忆能说出那次故障）。

预期从 143 → **≤ 40**。判断规则：一个 verifier 的去留讨论超过 2 分钟，删。
不做 mutant 证明——git revert 一行就能恢复，错删的代价远低于逐个论证的代价。
Sol 第三刀的三入口 + 风险矩阵在删完后接上，pack 划分按剩下的 ≤40 个做，
半小时的事。

**文档：归档，不重写。** `docs/cuts/` 已完成的 cut（约 135 个目录）整体移入
`docs/archive/cuts/`，agent 入口与默认搜索排除 archive。不逐篇审读、不提炼、
不写迁移说明——移动目录是一条 `git mv`。

验收：`verify:all` 保留数 ≤ 40 且全绿；`rg` 默认结果不再命中已完成 cut；
本刀自身产出的文档 ≤ 1 个文件（就是执行记录，五行）。

### 第 2 刀：流程宪法减负 + 设硬上限（一个 session）

这是防第 7 轮复发的一刀，也是 Sol 计划完全没有的一刀。

**减负**：`AGENTS.md`（197 行）+ `docs/agents/`（1,081 行）收敛为一页规则，
core 是三档：

- 小而可逆 → 直接做，跑 `verify:changed`，commit；
- 用户可见 → 加一次 owner QA（保留现有 qa-local-owner 模板，它是好的）；
- 高风险清单（schema/auth/persistence/print-PDF/production）→ 加一次独立
  review + `verify:all`。

删掉的：deterministic completion exit 表格、handoff 模板接力、dispatch 协议、
model routing 编排（Sol/Terra/Luna 分工写在治理文档里这件事本身就是开销）、
review-levels 分级文书。多 agent 接力是为"owner 不在场的长链任务"设计的；
现在的实际工作方式是 owner 在场、单任务、单 worktree，接力协议是空转的。

**硬上限（写进 AGENTS.md，违反即为 bug）**：

- `AGENTS.md` + `docs/agents/` 合计 ≤ 300 行；
- 注册 verifier ≤ 40，新增一个必须删一个或说明它守哪条底线；
- 一个 cut 的过程文档 ≤ 3 个文件（spec、tickets、qa 各一）；
- 同时存在的 feature worktree ≤ 3；
- **清理类 cut 每季度 ≤ 1 次**。到达上限还想加，说明该删别的，不是该扩容。

验收：新 agent 冷启动读完全部规则 ≤ 5 分钟；一次原子 UI 微调从改动到
commit 只经过"改 → 目标页看 → commit + owner QA"三步。

### 架构刀：明确推迟，改为需求拉动

CanonicalRendering 和 VersionedRenderContract **不现在做**。替代规则写进
AGENTS.md 一行：

> 下一次真实功能需求需要同时修改 Screen 与 Print 的题型语义推导时，
> 先做 CanonicalRendering 统一（Sol 计划 3.3 节原文有效），再做该功能。

这样这一刀发生时有真实用例校准 Interface，且成本记在拉动它的功能头上。
VersionedRenderContract 同理，触发条件是"下一次 shared renderer authority
bump"。如果三个月都没被拉动，说明它们本来就不该做。

## 4. 明确不做

继承 Sol 第 7 节全部，另加：

- 不做 143 个 verifier 的逐个 KEEP/DELETE/DEEPEN/SPLIT 审计报告；
- 不为删除建立 mutant 证明、deletion test、caller inventory 仪式；
- 不在本次清理中启动任何深模块重构；
- 不产出新的治理文档体系——三刀合计新增文档 ≤ 3 个文件；
- 不动第 2 节七条安全底线对应的任何 verifier 与产品行为。

## 5. 成功指标（便宜、可一眼验证）

- `git worktree list` ≤ 3；
- 注册 verifier ≤ 40，`verify:all` 全绿；
- `AGENTS.md` + `docs/agents/` ≤ 300 行；
- 一次 UI 微调的完整路径 ≤ 3 步；
- **接下来四周，git log 里产品 commit 多于流程 commit**——这是 owner
  唯一真正关心的指标，其余都是代理。

## 6. 批准点

三刀各自独立批准即可开工，不需要整体批准。建议顺序：第 0 刀今天做
（它只是收口，不删任何东西）；第 1、2 刀各一个 session。
