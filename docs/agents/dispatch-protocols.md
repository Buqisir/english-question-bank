# 派工操作规程(Dispatch Protocols)

宪法 `AGENTS.md` Dispatch map 的操作细则。**派工时才读**(开流水线刀 /
并行刀 / worktree DEV 前),不在 session 必读税内。法条来历见
`docs/agents/case-law.md`。

## Workflow 路由(固化 2026-07-11 流水线;升级为通用路由 2026-07-12,owner 拍板)

同样的活、同样的 agent 序列,两种执行方式:主代理逐步派(每步派工 +
回执进主上下文,且主代理每次出场全会话重放计费)vs 写成 Workflow 脚本
后台跑(主上下文只留发起 + 最终结果,中间回执落盘)。Workflow 省的是
**主代理重放税 + 上下文折损**(占用推迟 compaction);子代理工钱两边
一样(warm-paper 账单判例)。

**路由决策卡(开刀 10 秒走完):**

1. 单动作 small?→ 主代理直接干,完。
2. 步间有"要读内容才能下"的判断?→ 有:标裁决点切段,段内 ≥2 连续
   agent 步走脚本、单步直接派;全无 → 3。
3. 碰契约面 / 不可逆面?→ 是:常规管线;否 → 4。
4. plan 预写充分?→ 否:先补 plan;是 → 5。
5. 预建 worktree(`git worktree add ../wt-<cut> <branch>` → worktree 内
   `bash scripts/setup-worktree.sh`)→ **一行派工**:
   `Workflow({name:'cut-pipeline', args:{cut, worktree, verifyCmds, cr}})`
   ——标准脚本 `.claude/workflows/cut-pipeline.js`,四硬纪律、DEV/verify/
   CR 三 prompt、收口 schema、token 账单全部内置;该刀类已命中率降档时
   传 `cr:'lite'`(跳 CR 步,主代理自己冷读收口)。**verifyCmds 给全套**
   (narrow + `pnpm -C app run verify:all`):verify 步即主代理复核本身,
   收口不再本地重跑,只盯 main CI。
6. 批量跑批?→ 走第二适用类(小切片试跑 → 报量 → 全量分批落盘,见文末)。

**路由方法:裁决点切段。**开刀时列出步骤,标出哪几步之间需要主代理 /
owner 的**语义判断**(= 裁决点),其余为确定段:

- 零裁决点(例行刀)→ 整刀一个 Workflow:DEV → verify 复核 → fresh CR
  串行。
- 有裁决点 → 按裁决点切段:段内 ≥2 个连续 agent 步,该段进 Workflow;
  单步段直接 Agent 派工(为一步写脚本是纯开销)。裁决点永远回主代理,
  脚本以**中止返回**把裁决交回。
- 强制裁决点(任何脚本不得自动执行):merge / 生产操作、owner QA /
  拍板、Must Fix 处置。
- 判断能否进脚本的试金石:**这个判断能不能写成一行 if(退出码、schema
  字段)?能 → 进脚本当分支;不能(要读内容下判断)→ 裁决点。**

硬前提与边界:

- plan 预写充分仍是前提——不足先补 plan(脚本内 DEV 拿不到步间补充);
  真无法预写的探索刀 / owner 观感紧迭代刀,整刀常规管线。
- 契约面 / 不可逆面刀保留常规管线(契约锁 hook 对 workflow agent 同样
  生效,但解锁与收口必须主代理亲手)。
- 硬纪律四条不变:①每个 `agent()` 显式钉 model + effort(DEV=Sonnet/
  medium、verify=Sonnet/low、CR=Opus/high),严禁默认继承;②1:1 不
  扇出;③verify 复核代理回执带**原始退出码**,红或工作树有残留即中止;
  ④主代理只出现在裁决点。
- 浏览器 QA:headless(Playwright)段可进脚本;owner 实点 QA 是裁决点。
- session 关闭即丢 workflow 缓存(resume 仅同 session):长跑批设计成
  分批落盘,断点友好。
- 流水线 worktree 由主代理预建,并在各 agent prompt 里传同一路径——
  脚本内不用 `isolation:'worktree'`(那会给每个代理开独立副本,断掉
  流水线的文件传递)。
- **最终返回 schema 自带收口所需全部字段**(verdict、MF 列表、关键产物
  路径):省下的上下文别用事后读 journal 的方式还回去。中间细节落盘
  (journal / cut 目录),只在异常诊断时才读。

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
