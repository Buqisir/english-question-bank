# 派工操作规程(Dispatch Protocols)

宪法 `AGENTS.md` Dispatch map 的操作细则。**派工时才读**(开流水线刀 /
并行刀 / worktree DEV 前),不在 session 必读税内。法条来历见
`docs/agents/case-law.md`。

## 例行刀 Workflow 三步流水线(固化 2026-07-11,owner 拍板)

例行刀默认走 Workflow 三步流水线:DEV → verify 复核 → fresh CR 脚本串行。

适用判据(三条**全**满足才走流水线):

1. plan 预写充分(DEV 拿到即可施工,无步间待定项);
2. 预期一次通过(低返工风险);
3. 不碰契约面 / 不可逆面。

硬纪律四条:

1. 每个 `agent()` 显式钉 model + effort(DEV=Sonnet/medium、
   verify=Sonnet/low、CR=Opus/high),严禁默认继承主代理档位;
2. 1:1 不扇出——每步单代理,不加验证票、评审票;
3. verify 复核代理是主代理亲跑的等价替身:回执必须带**原始退出码**;
   verify 红或工作树有残留即中止返回;
4. 主代理只出现在裁决点(MF 判定、QA、merge)。

契约面 / 高返工风险 / 需要步间判断的刀保留常规管线(主代理逐步编排)。
流水线 worktree 由主代理预建,并在三个 agent prompt 里传同一路径——脚本内
不用 `isolation:'worktree'`(那会给每个代理开独立副本,断掉流水线的文件
传递)。

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
