# 判例库(Case Law)

**血书元规则**:新硬法条须**真实事故**或 **owner 拍板**背书才入宪法
(`AGENTS.md`);预防性规则默认不进。修法时把叙事(日期、事故经过、账单
数字)移进本库,宪法正文只留法条最终形态。本库不在 session 必读税内——
查"这条规矩怎么来的"时才翻。

条目格式:日期 → 事故 / 出处 → **固化法条位置**。按日期倒序。

**回流纪律**:普适级判例(换个项目还会撞的:工具机制 / agent 天性 /
协作形态)在入本库的同时,回流母版
`~/.claude/skills/project-os/assets/case-law-universal.md`(仅本机;
该 skill 目录自带 git,回流后一行 commit)。项目特有判例不回流。

## 2026-07-17

- **删共享 CSS 误伤事故（lecture-css-restore 背书，owner 点头入宪
  2026-07-17）**：retire 刀删"疑似 harness 专用" CSS，未逐类核消费者，
  误杀五个活讲评面板的共用样式——组件裸奔上产，owner 报障后 941 行
  VERBATIM 复活 + 防回归 verify 进 CI。修法：**删任何共享 CSS/样式前，
  必须对每个将删类名做全仓类消费清单 sweep**（grep 生产者含
  ts/tsx/mjs/html，零生产者才删；撞名假阳性要人眼辨——同日 small-ledger
  刀实践即抓到 `paper-passage` 命中全是 paper-passage-letter 刀名撞名、
  `detail-message` 实为活类保留）。→ 固化 **AGENTS.md Gates** 一行；
  普适级（删除时低估共享面是 agent 天性），回流母版——**回流挂起**：
  执行时实核 `~/.claude/skills/project-os/` 已不在本机（全盘搜索零命
  中），母版去向待 owner 确认后补回流。

## 2026-07-14

- **CI watch 管道吞码事故（trust-cracks 收口实撞）**：主代理
  `gh run watch --exit-status | tail` 盯 merge CI——管道让 bash 退出码
  变成 tail 的 0，红 run 被报成绿，随即部署了 CI 红的提交（红因是 e2e
  断言未跟刀：详情 button→link，产品行为本身正确，万幸）。宪法本有
  「verify 亲跑不得管道吞码」，本案证明**同款纪律覆盖一切退出码消费**
  （CI watch / 部署脚本 / 任何 gate）：要么不接管道，要么 `pipestatus`
  取真码，且报绿前另读 `gh run view --json conclusion` 双证。→
  **Gates**「exit codes never piped through anything that swallows
  them」的 CI 侧同款；普适级，回流母版。
- **e2e 跟刀纪律（同案衍生）**：改交互元素的角色/语义（button→link）
  时，DEV/主代理都没想起金路径 e2e 不在 `verify:all` 里（它是 CI 独立
  job）——本地全绿 ≠ CI 全绿。改动用户可见交互时，收口前把
  `scripts/smoke-golden-path.mjs` 也过一遍 grep。→ **Gates** 提醒项。
- **LLM"自觉省略"不可依赖（trust-cracks DP-3 打回补刀）**：重排 prompt
  写明「都不相关时返回空 rankings」，生产实测 DeepSeek 仍返回"最接近
  的"3 条并在 reason 里自招"不相关"。修法：契约加**显式 relevant 布尔**
  （缺省 true 保兼容），服务端无条件丢 false——让诚实成为结构化字段，
  不是省略行为。生产双证：无关查询 0 条诚实文案 / 相关查询（猫）恰 1 条
  精准。→ 普适级（LLM 契约设计），回流母版。

## 2026-07-13

- **刀E（真 2-up A3 拼版 PDF 导出）取消**（owner 拍板）：owner 实际
  打印流程 = 排好 A4 → 打印对话框选 A3 +「一面两页」+ 短边翻转，驱动
  拼版无损且页序与 a3-imposition 预览模型一致。做真 2-up PDF 是重复
  劳动，还埋「驱动再拼一次变四页缩一面」的坑。定位定案：**预览管规划
  （断面可视化+缝徽标），驱动管执行**。复活条件仅一个：PDF 要发给
  打印店、owner 碰不到打印对话框。→ **Roadmap**「删掉一个工单比完成
  一个工单更好」的实证；开刀前先问 owner 实物工作流。

## 2026-07-12

- **前置踏实则后置降档**(owner 拍板"铺得踏实后面大概率不会错"):
  ①原型已 owner 逐裁点拍板的刀,formal PA 默认降 PA-lite(draft-desk
  系列实证:原型拍板流零方向事故);②流水线 verify 步含全套时即主代理
  复核本身,收口只盯 CI;③批量跑批加第零问"这批活需要 AI 吗"——纯
  规则活用 node 脚本零 token,扇出条文压缩、待 R1/R2 首战后按实修订。
  → Dispatch map / Gates / dispatch-protocols。
- **Workflow 路由入法**(owner 拍板;背书 = warm-paper 账单判例 + 官方
  文档核查:token 4-7x 是"多代理 vs 单代理"的膨胀、"大多数编码工作
  高度顺序依赖"官方原话、多 workflow 串联 + 阶段间拍板是官方姿势):
  同样的 agent 序列,常规管线每步派工/回执进主上下文且每次出场全会话
  重放;脚本化后主上下文只留发起 + 结果。→ dispatch-protocols
  「Workflow 路由:裁决点切段」+「批量机械扇出」。
- **push 用错 remote 名**:H10 收官 push `origin` 失败——本仓库 remote
  名是 `github`,且"几乎每个 agent 都犯过一次"(owner 证言,高频重复
  事故)。→ **Collaboration Workflow**「The remote is named `github`」。
  owner 同时拍板普适元规则:**环境事实只排查一次**——项目环境事实
  (remote 名、包管理器、run/build 命令、部署通道)第一次排查确认后,
  立刻固化进该项目的 agent 规则文件,下一个 agent 直接复用;已写入
  用户级 `~/.claude/CLAUDE.md` 编码纪律。

## 2026-07-11

- **记忆快照一天漂移**:主代理持久记忆存了"生产 e6644e2"状态快照,次日
  实况已是 50a71af——记忆存项目状态必漂。→ **Working memory**「记忆只存
  协作元知识,不存项目状态快照;唯一真源 `docs/STATUS.md`」。
- **协作流程复盘,owner 拍板五新法**(复盘范围与出处见
  `docs/cuts/H10-agents-constitution/plan.md`):①记忆不存快照(同上);
  ②commit message 一行摘要,裁决细节入 cut 目录 → **Context / Output
  Economy**;③medium/large 刀 plan.md 增「裁决点清单」= PM 层断点锚 →
  **Collaboration Workflow**;④owner QA 命中率降档 →
  `docs/agents/review-levels.md`「Hit-Rate Adaptive Depth」;⑤外脑绝对
  路径标注仅本机 → **AI 协作准则底座**。
- **Workflow 流水线首跑账单**(warm-paper-promotion,全账单
  `docs/cuts/warm-paper-promotion/pilot-token-bill.md`):三步脚本串行一次
  通过,子代理 241k tok / 13.4min、主代理仅头尾 2 次出场;对照 lecture-rail
  常规管线:子代理 4 轮 387k + 主代理步间出场 ≥6 次、每次全会话重放。
  **结论:省的全在主代理重放税——长 PM 会话是成本结构最大项,交接质量
  = 日常运行成本,不只是灾备。** → **Dispatch map**「例行刀默认 Workflow
  三步流水线」;也是「裁决点清单」法条的动机。

## 2026-07-10

- **draft-numbering 实际份量超 PA-lite 前提**(顺带修存量事务 bug 使刀体
  膨胀,CR 提醒"下不为例")。→ **Dispatch map**「PA-lite 降档理由写 plan
  头,CR 复核降档是否仍成立」。
- **命中率降档**(owner 拍板):评审深度跟实测命中率走,不跟焦虑走。→
  `docs/agents/review-levels.md`「Hit-Rate Adaptive Depth」。

## 2026-07-09

- **worktree 越界两撞**:①DEV 在主树 `checkout -b`,把主代理的提交带进
  野分支;②主代理在 worktree 里 merge 自己分支,得到 "Already up to
  date" 假成功。→ `docs/agents/dispatch-protocols.md`「Worktree 纪律」
  ①②(一切操作限本 worktree、pwd 自证、合并永远在主树)。
- **死机接续实证**:DEV 会话中断,接手者凭 checkpoint commit 定位断点,
  免通读全 diff 自证完整性。→ dispatch-protocols「断点锚」。
- **crash-resume 的 QA 脚本代价**:一次性 QA 脚本引用了另一会话的绝对
  scratchpad 路径 + 失效凭据,后继 DEV 花周期修脚本而非查问题。→
  **Browser Verification**「QA 脚本住 scratchpad、不跨会话引用绝对路径、
  不硬编码生产凭据」。
- **DEV 自报绿不实**(教训此前只活在会话记忆,当日成文):→ **Gates**
  「复核纪律:DEV self-reported green is never accepted」。

## 2026-07-08

- **双刀并行两轮实战**(#279/#280、surface-question-policy/detail-slim)
  + 刀⑤ B/C 两 DEV 共用一个工作目录撞车。→ dispatch-protocols「并行刀
  硬条件三条」。
- **setup-worktree 教训**:DEV 即兴自装依赖,server 误用 pnpm 产出不该
  存在的 lockfile。→ dispatch-protocols「开工第一步
  `bash scripts/setup-worktree.sh`(幂等)」。
- **主代理档位量表**(owner 拍板):日常 medium;High 触发必须主动提醒
  owner 换档,不得静默继续。→ **Tier / effort defaults**。
- **CR 范围纪律试跑**(#275/#276):CR 只复核未证实项,CI/verify 已证实
  的不重跑。→ **Dispatch map** CR-lite 条。

## 2026-07-07

- **空记忆接管实证**:harness auto-memory 不跨代理,接管者带空记忆到场,
  凭 repo 文件照常接管项目。→ **Working memory**「要过交接的决策只活在
  repo 文件」。
- **bypass 升级契约 hook**:owner 开启 bypassPermissions,契约 hook 由
  ask 升级为 deny(deny 语义在 bypass 下仍生效)。→ **UI Collaboration**
  hook 机制。

## 2026-07-03

- **11 连红 CI**:窄 verify 清单 + 没人盯 Actions,连红 11 轮才发现。→
  **Gates**「merge 前全套证绿 + merge 后盯 main CI」。
- **kratos-memory 降级**(owner 批):只读历史归档,不再是必查步骤。→
  **Working memory**。

## 2026-07-02

- **角色重写**(owner 授权):小川任 main-agent orchestrator,项目第一
  责任人全权;UI 方向/审美同日委任小川,owner 保 PO QA 与事后 veto。→
  **Roles** / **UI Collaboration**。

## 更早 / 无精确日期

- **浏览器真点击 QA 三次独立抓到 CR + verify 双漏的缺陷**。→ **Browser
  Verification**「user-visible 变更必须真点击 QA,静态 verify 过 ≠ 浏览器
  QA 过」。
- **qa-local-owner 惯例**原埋在 `docs/cuts/flow-panel/qa/qa-notes.md`,
  上升成文。→ **Browser Verification**。
- **2026-06 外部代理编制退役**:多外部代理规则移出指令预算,归档于
  `docs/agents/external-agents.md`(休眠;重新引入时从那激活)。
