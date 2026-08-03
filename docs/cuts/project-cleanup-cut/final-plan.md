# Project Cleanup Cut — 终稿

Status: final, owner-approved for serial execution
Baseline: worktree `wt-paper-canonical-unification-20260725`（以 Ticket 35 收口后的精确 HEAD 为固定点）
Prepared: 2026-08-03
Sources: `plan.md`（Sol）+ `review-xiaochuan.md`（Fable 5）+ owner 裁决
Execution authority: owner authorization in the source task on 2026-08-03;
execute the four cuts serially and pause only for an anomaly, scope expansion,
Owner QA verdict, or an unresolved destructive target

## 0. Owner 裁决记录（本终稿的边界，不再重议）

1. 采纳刀序修正：便宜减负先做，架构按真实需求拉动。
2. 拒绝数字配额与盲删："两分钟说不清就删"、"verifier ≤ 40"、
   "worktree ≤ 3"、"整体搬走 docs/cuts" 全部不执行。删除依据只能是风险
   判断（named failure），数量下降是结果，不是目标。
3. 分母统一为当前 worktree 实测：AGENTS.md 114 行、`docs/agents/` 535 行、
   `scripts/` 253 文件 / 143 个 `verify-*`、worktree 35 个、代码与脚本对
   `docs/cuts` 的活引用 208 处（含 `shared/paper-canonical/authority.mjs`、
   `server/api.mjs` 等运行时读取）。
4. CanonicalRendering 保留为一刀：Ticket 35 就是现成的真实需求拉动证据。
5. VersionedRenderContract 推迟：疑似新浅层，等下一次 shared renderer
   authority bump 真实发生时再裁。
6. 合并链精确为：Ticket 35 focused re-review PASS → Owner QA PASS →
   Ticket 36 pre-merge closeout 与最终候选检查 PASS → fast-forward main →
   `main` CI green → Ticket 36 DONE。
7. 流程义务清理并入第 1 刀，不单独立刀、不称"宪法改革"。删除标准为三条
   **同时成立**：当前仍实际强制、已被三入口风险路由取代、写不出独有
   named failure。不设行数目标，不预列候选清单（worktree 版 AGENTS.md
   已无 completion-exit 表格，勿引用 main 旧版内容做分母）。明确保留：
   一条独立 review lineage、exact preflight、单 worktree 写入、Owner QA。

Sol 计划第 2 节的七条安全底线、第 7 节"明确不做"全部继承，此处不重抄。

## 1. 刀序：四刀串行

四刀已获一次性批准，自动串行；每刀仍须独立可合并、独立可停。一刀若没有
净删除、没有减少 caller/test fan-out、也没有缩短一个真实工作流，就停下，
不因计划写了就硬做。仅异常、范围扩大、Owner QA 或无法确认的 destructive
target 需要回到 owner。

### 第 0 刀：收口在途状态

清理必须先有唯一基线。当前 main 与 unification 分支分叉 274 commit
（落后 0，可 fast-forward），35 个 worktree 无人认领清单。

实施：

- 按裁决 6 的顺序闭合并合并：Ticket 35 focused re-review PASS →
  Owner QA PASS → Ticket 36 pre-merge closeout 与最终候选检查 PASS →
  fast-forward `codex/paper-canonical-unification-20260725` 进 main →
  `main` CI green → Ticket 36 DONE；
- 逐个清点 35 个 worktree，**认领制而非配额**：owner 能说出在途用途的
  保留；分支已合并或 owner 确认废弃、且 worktree clean 的才执行
  `git worktree remove` + 删分支；不确定或含未保存内容的保留，不强删。
  完整认领/处置清单写进本 Cut 唯一执行记录，`docs/STATUS.md` 只保留五行内摘要；
- 不动任何产品代码、verifier 或文档。

验收：main 包含 canonical 全部工作且 CI 绿；完整清单中的每个存活 worktree
都有归属或明确的“待确认”，`STATUS.md` 仅记录摘要。

### 第 1 刀：验证套件与流程义务按 named failure 收编

目标：日常改动不再跑 120 项平铺全套；每个保留 verifier 与流程义务说得出
它独有拦截的真实故障。

实施（复用 Sol 第三刀的机制设计）：

- 接线三入口，禁止继续扩散：`verify:changed`（日常默认，按 diff 选
  pack）/ `verify:paper`（Paper 公共 seam pack）/ `verify:all`（高风险
  最终候选与 fallback）。复用现有 `scripts/lib/verifyScope.mjs` 与
  `verify-ci.mjs`，不新建编排框架；
- Sol 的五行风险矩阵（原子 UI 微调 / known-shape 试卷 addition / 普通局部
  功能 / shared renderer contract / auth-persistence-migration）原样写进
  `AGENTS.md` 作为路由依据；
- 对 143 个 verifier 逐个写一行 **named failure**（它独有拦截的真实故障，
  或它提供的独立检测层及其他层为何不足）与所属 pack。三类处置：
  - 写得出独有 named failure、有价值的独立检测层，或守护七条安全底线之一
    → 保留并注册；
  - 与另一个更早/更快检查捕获同一故障、或纯 pass-through/path-forward
    → 删除，git 为回滚；
  - **不确定 → 不删**：移出 `verify:changed`/`verify:paper` 日常路径，
    保留在 `verify:all`，标记 `quarantine`，第 3 刀结束时复审；期间是否
    拦到故障只是证据之一，沉默本身不是删除理由；
- 依赖 Screen/Print 镜像语义、需要 Interface test 才能安全替代的
  verifier，本刀**不删**，标记 `awaiting-rendering-cut`，留给第 2 刀；
- **流程义务清理（随风险矩阵写入 AGENTS.md 顺手完成，裁决 7）**：
  逐条盘点 `AGENTS.md` 与 `docs/agents/` 中当前仍实际强制的义务，
  三条同时成立才删——仍实际强制、已被三入口风险路由取代、写不出独有
  named failure。不预列候选、不设行数目标。明确保留：一条独立 review
  lineage、exact preflight、单 worktree 写入、Owner QA；
- 最终摘要区分产品行为失败 / 测试基础设施失败 / off-repo SKIP。

验收：

- 五种代表变更的必跑命令由 diff 稳定选择，未知 diff 保守升级为
  `verify:all`；
- 原子 UI 微调不触发 backend、Paper、authority 或全套；
- 每个注册 verifier 有一行 named failure 与入口；quarantine 与
  awaiting-rendering-cut 各有清单；
- 每条被删流程义务附一句话说明三条删除标准如何同时成立；review lineage、
  exact preflight、单 worktree 写入、Owner QA 原样在位；
- 不引用任何目标数量；报告删除数、保留数、quarantine 数即可。

### 第 2 刀：CanonicalRendering，由 Ticket 35 校准

目标与实施采纳 Sol 计划 3.3 节与"第一刀"原文：单一 Interface 接收
confirmed Canonical Paper + 公开模式 + resolved render contract，返回
renderer-neutral 的语义计划；Screen/Print adapter 消费同一计划，PDF 走
Print；paper identity、Student/Teacher visibility、provenance 剔除、
family/chrome/predecessor、writing block roles 收进计划一次推导。

在 Sol 原文之上增加一条校准要求：

- **以 Ticket 35 为验收用例**：重演该票的共享语义修复时，语义改动只定义在
  plan 实现与其 Interface test，Screen/Print 不再双写或各自重建语义。
  若修复真实改变 geometry/typography authority，仍允许并要求更新一个
  versioned render contract、fixture 与受影响的公共 seam 证据；目标是消除
  重复语义，不是假装 authority 不再变化；
- 新 Interface test 接住同一故障后，同刀删除第 1 刀标记的
  `awaiting-rendering-cut` 镜像推导与 source-regex/浅 fixture 断言，
  不留双轨；
- 保留 Screen DOM、Print HTML、真实 PDF 的 media-specific geometry。

验收（Sol 原文 + 校准条）：

- Ticket 35 重演通过；
- Screen/Print 对同一 fixture 的语义 plan byte-equivalent；
- Student/Teacher 与 provenance mutants 在 plan Interface 被拒绝或正确投影；
- 代表性 Screen、Student/Teacher Print/PDF 成品无语义与视觉回归；
- diff 净删除，不许只把旧代码包进新函数。

### 第 3 刀：引用感知的文档归档与 quarantine 复审

目标：新 agent 默认只看到当前产品路径；历史可追溯但不参与日常理解。
**没有整体搬迁**。

实施：

- 先产出一份 `docs/cuts` 引用清单（当前实测 208 处代码/脚本引用）。
  三类处置：
  - **运行时读取的不是文档是数据**（canonical manifest/ledger、genre
    decisions、`authority.mjs` 与 `server/api.mjs` 所读路径等）：原地
    不动，本 cut 不迁移数据路径；
  - 零活引用且 cut 已完成的目录：逐目录 `rg <目录名>` 确认后移入
    `docs/archive/cuts/`，agent 入口与默认搜索排除 archive；
  - 有活引用的历史文档：先修引用或不动，禁止"搬走再补引用"；
- quarantine verifier 复审：期间拦过真实故障的转正注册；已证明重复、不可达
  或 pure pass-through 的删除；仍不确定的继续 quarantine，不因期间沉默删除；
- 本刀自身产出 ≤ 1 个执行记录文件，不新增治理文档体系。

验收：

- `rg` 默认结果不再把 superseded route 当成当前指令；
- 运行时读取路径全部原地未动，`verify:all` 与真实成品检查绿；
- 每条保留流程规则与 verifier 都有 named failure；
- 归档目录清单与引用修复清单可逐条回滚。

### 推迟项：VersionedRenderContract

不在本 Cut 执行。触发条件写进 `AGENTS.md` 一行：下一次 shared renderer
authority bump 真实发生时，先按 Sol 计划 3.4 节评估 resolver 是否真能
隐藏 authority/fixture/consumer/历史 replay 连锁，再决定做或永久不做。
届时若 CanonicalRendering 已落地，评估基础会比现在准确。

## 2. 防复发机制（原则，不是配额）

历史上已有至少 5 轮流程清理，每轮之后流程重新生长。根因是"新增无门槛、
删除有仪式"。本终稿把门槛做成对称的：

> **新增和保留 verifier、流程规则或治理文档，同一门槛：用一句话说明
> 它独有防止的真实故障，或它提供的独立检测层及其他层为何不足。
> 说不出，就不加、不留；不确定时先 quarantine，不武断删除。**

这条写进 `AGENTS.md`。不设数量上限；上限式规则本身就是会被绕过或
供奉的新治理。

## 3. 成功指标

- 五种代表工作流各有唯一、可预测的最小路径；日常改动默认不跑全套；
- Ticket 35 类型的共享语义修复只在 plan 定义一次，Screen/Print 不再双写；
  真实 geometry/typography authority 改动仍保留必要版本化与公共成品证据；
- 每个保留 verifier / 流程规则有 named failure；运行时数据路径零迁移；
- 七条安全底线对应的 mutants 全部仍被拦截；
- **接下来四周，git log 里产品 commit 多于流程 commit。**

## 4. 批准方式

Owner 已一次性批准本终稿及四刀串行执行。各刀不再重复等待批准；仅在异常、
范围扩大、Owner QA verdict，或无法确认的 destructive target 出现时暂停。
第 0 刀的 worktree/branch 删除只作用于已合并或 owner 已确认废弃且 clean 的
精确目标；不确定目标原地保留。
