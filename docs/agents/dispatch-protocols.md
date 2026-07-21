# 派工操作规程(Dispatch Protocols)

宪法 `AGENTS.md` Dispatch map 的操作细则。**派工时才读**(开中大型刀 /
并行刀 / worktree DEV 前),不在 session 必读税内。法条来历见
`docs/agents/case-law.md`。

## 直接派工路由（owner 裁决 2026-07-21）

标准刀由 PM 逐阶段直接派工：读回执、作必要裁决、再派下一步。不要把
DEV / verify / CR 包进后台 Workflow，也不设置 verify agent 代位 PM 复核。

**路由决策卡（开刀 10 秒走完）：**

1. 单动作 small？→ PM 直接完成，或直接派一名 fresh DEV；PM 冷读 CR-lite
   收口。
2. medium / large？→ 先确认 committed `plan.md` 与预建 worktree；需要 PA
   时先派 fresh PA，然后直接派 fresh DEV。所有派工按 `AGENTS.md` 当前
   tier table 显式 pin model + effort。
3. PM 在 DEV worktree 亲跑计划规定的 narrow verify、`tsc` 与
   `pnpm -C app run verify:all`，确认真实退出码后，派 fresh CR；CR 将
   结论写入 `docs/cuts/<CUT>/cr.md`。
4. PM + RM 只在 fresh CR 的 `cr.md` 落盘后运行 artifact gate，再处理 merge、
   main CI 和 STATUS。
5. 批量跑批？→ 走第二适用类（小切片试跑 → 报量 → 全量分批落盘，见文末）。

**裁决点仍须显式列出。** 开刀时标出 PM / owner 需要读内容才能下的语义
判断；它们是 PM 的断点锚，裁决结论写入 cut artifact。merge / 生产操作、owner
QA / 拍板、Must Fix 处置永远由 PM 直接处理。

硬前提与边界：

- plan 预写充分仍是前提；不足先补 plan。探索刀或 owner 观感紧迭代刀，
  逐步直接派工并把新裁决落盘。
- 每个 subagent 按 `AGENTS.md` 当前 tier table 显式钉 model + effort，包含
  该角色的升级例外；严禁默认继承，也不做未经计划的并行扇出。
- PM 亲自消费 verify 的原始退出码；红码或工作树有残留即中止。
- 浏览器 QA 可由 DEV / QA 运行，但 owner 实点 QA 是裁决点。
- **DP-2 截图写盘用 `DP2_SCREENSHOTS=1` 门控**（2026-07-16 立）：截图像素
  不确定，复跑 DP-2 可能弄脏工作树。默认平跑；DEV 出档证据时才开一次环境变量。

**批量跑批**(第二适用类;真实场景 = analysis-fields R1/R2、数据健康
批修;R1/R2 首战后按实战修订本节)。**第零问:这批活需要 AI 吗?**
规则能写死 → 纯 node 脚本,零 token;单元要语义判断 → agent 扇出
(判据:单元独立 / 逻辑可预写 / 小切片试跑估成本再全量 / 产出分批落盘;
预估 >25 agent 或 >1.5M token 先报量);要判断力 → 判例裁决制
(机审初筛 + owner 裁边界)。

## 并行刀硬条件三条(固化 2026-07-08)

多把刀可并行施工,硬条件:

1. 派工前主代理核对文件面**零交集**;有交点必须在两边 plan 里钉死边界;
2. 每个 DEV 独立 git worktree,**严禁两个 DEV 共用一个工作目录**;
3. 施工并行、收口串行:CR → rebase → 合并 → CI 逐把收,后合并者负责
   rebase。

DEV prompt 中禁用 `git stash`(主树可能有他人未提交内容)。

## Worktree 纪律(血书 2026-07-09,两次实撞)

1. DEV 的一切操作(git / 编辑 / 构建 / verify)只许发生在自己的 worktree
   目录,动手前先 `pwd` 自证;**严禁对主仓库路径跑任何写命令**(含
   `git -C <主树>`)。
2. 主代理侧同款:**合并永远在主树执行**——在 worktree 里 merge 自己分支
   只会得到假成功。
3. DEV 直接用 worktree 自带分支干活,不必另建品牌分支;收口命名由主代理
   在 merge message 里处理。
4. **断点锚**:DEV 在实现完成、进入自验前先打一个 checkpoint commit(如
   `wip(<cut>): impl complete, pre-QA`)——会话中断后接手者凭它定位断点;
   最终收口 commit 照常。

worktree DEV 开工第一步跑 `bash scripts/setup-worktree.sh`(装 app/server
依赖 + 从主树复制 gitignored 本地库;幂等)。不要即兴自装——server 用 npm
不用 pnpm,装错会产出不该存在的 lockfile。

崩溃遗留的 locked worktree 处置:`git worktree unlock` → 抢救分支(续派
DEV 或合并)→ 收口后 `git worktree remove`。
