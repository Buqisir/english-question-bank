# ADR-0015: 网站界面只做消费；难度维度下线到 UI 层

- Status: Accepted（2026-07-05，PM grill + owner 黄学伟拍板）
- 上游：产品原则「生产在后台 Agent、网站只做消费」（owner 2026-07-05）；
  ADR-0013（owner/member 两档 gate）；ADR-0008（primary vs derived）；
  ADR-0009（derived dimension store）

## 背景

题目详情视图（`QuestionGroupDetailView.tsx`，~1563 行）是 classic-retire
刀 2（PR #247）从经典模式**逐字搬来**的管理详情页，9 个 section、30+ 处
`isOwnerView` 门控，从没为「AI 找题看题」重设计。owner 在 eqbank.cc QA 时
质疑「详情的意义」，拍板产品原则：**内容的生产在后台 Agent，网站界面只做
消费（找题 → 看题 → 组卷 → 导出）**。

grill 前先侦察核实「生产早已全后台化」这个前提。硬结论：详情页 7 项
owner-only 能力里，只有 2 项有完整后台替身——导题入库（`import-pipeline`）
和话题标签（`topic-driver.mjs`）；给已入库题组补解析半覆盖；**编辑、删除、
AI 验证、难度标定的后台 CLI 全部零调用**。即天真版「全删」会真实移除能力
而后台无兜底。

难度维度另有历史：ADR-0008 早已把难度定性为「撒谎的假 `'medium'`」（对
组卷/分层撒谎），并判它是「deferred backfill 的 derived 维度」。owner
2026-07-05 判定当前难度模型不完善、想舍弃，要求全站下线。

## 决策

### 1. 「网站只消费」的靶子 = 禁「网站现场生产」，不是禁一切写

靶子是**把网站变成 AI 现场生产车间 / dashboard**的动作：在详情页现场
跑 AI 造解析、造话题标签、做难度标定、跑答案验证。这类动作从网站界面
删除，改由后台 Agent（`import-pipeline` / 出题 skill / backfill 脚本）完成。

**低频纠错运维**（改一个错字/错答案、删一个导错的题组）**不在禁止之列**。
它不是「生产」，是数据订正；无后台替身，为它造 driver 不划算。保留为
详情页的 owner-only 兜底（服务端本就 `ownerOnly`，member 服务端 403 兜底，
界面看不到）。

- 为什么不搬后台：`updateQuestionGroup` / `deleteQuestionGroup` 后台零调用，
  republish 是整卷版本 bump 非改单组；后台「改单组字段/删单组」driver 的
  收益 < 留一个 owner-only 按钮。
- 为什么不建独立「管理页」：编辑/删除就近留详情页足够；member 完全不需要
  管理功能（roadmap #1 个位数用户），独立管理台是虚假需求。

### 2. 详情视图删现场生产动作、回归看题页；READ 回填链路保留

删（owner-only 现场生产 + 全部 AI ops-trace 段）：各题型「跑 AI 解析/保存
解析」、「主题划分/绑定候选」、难度标定全套。

留（member 可见的消费内容）：passage、题目、选项、答案、**已存各题型解析**、
**答案对比统计 + AI 验证结果展示**、已绑定话题标签展示、加入草稿卷、返回。

关键切分：`openDetail` 把已存 parse/verify 从 `QuestionGroupDetail` 回填进
state（READ 路径，member 看解析靠它）**必须保留**；删的只是 `handle*` 里
现场调 AI 的 WRITE 路径。`verifyResult` 是回填态（reading 从
`readingVerifyResult`，其余从已存 parse 本地派生），不是纯现场态，故答案
对比展示留给 member。

### 3. 难度维度全站下线，但只删 UI/功能层，数据层不碰

删 UI/功能层：找题卡的难度 pill+dot、详情页难度全套、`EntryModal` 的难度
select、`App.tsx` 的难度 state/handler、前端 `difficultyCalibration.ts`
校正模块、引导用户按难度搜的示例文案。

数据层完全保留：`difficulty` 列（`NOT NULL`，写路径继续给默认值）、5 个
`ai_difficulty_score`/`teacher_difficulty`/… 列、`saveQuestionDifficultyRating`
路由（留但 UI 不调）、`readingDifficultyNormalizer` / `synonymDifficultyService`
（live reading-parse 仍依赖）、steward NL 搜索的 `difficultyLevels`
维度、schema / `v_question_group_cards` VIEW / `publisher.mjs`。

- 为什么不删数据层：难度是 ADR-0008 的 derived 维度，**可随时从 primary
  数据 idempotent backfill 重建**（ADR-0008 原话：真估计器建好后一个
  backfill 点亮全库）。删 UI 已达成「用户见不到不完善难度」；数据层删除是
  高风险单向 schema 迁移（`NOT NULL` 列 + 依赖 VIEW 重建 + 改 steward 冻结
  AI prompt + 拆 `readingDifficultyNormalizer` 与 live reading-parse 的纠缠
  + 可能丢已录入的老师评级），零当前收益（不完善的派生值躺 DB 不误导谁）。

### 4. 与 ADR-0013 的关系

ADR-0013 建立 owner/member 两档 gate：member 藏经典/管理面、owner 保留。
其决策 #2 保护过「开放模式 = owner 视角，本地 owner 日常策展不能瘫」。

本 ADR 在此基础上进一步收敛 **owner 自己在网站界面的生产动作**：owner 的
「策展/生产」（导题、解析、标签、难度）从「网站现场」移到「后台 Agent」，
网站界面（含 owner 视角）只留消费 + 低频纠错。ADR-0013 决策 #2 的「日常
策展」语境据此更新——它保护的是「开放模式不按 member 裁剪」，不是「owner
必须能在网站现场生产」。两者不冲突：本 ADR 删的是动作本身（不分角色），
不是按角色裁剪。

## 排除项

- 不删难度数据层（字段/schema/steward prompt/reading-parse 纠缠）——独立
  可选的 data-contract 刀，需要时走 PA + schema 迁移。
- 不退役 `AI Enhancement` 批量面板（import workbench 里另一个现场生产面，
  owner-only）——同原则另刀退役。
- 不为编辑/删除/难度/验证/补解析补后台 CLI driver——需要时再补。
- 不做难度体系重建（估计器/校正/画像）——owner「后面再做」。

## 后果

- 详情视图从 ~1563 行管理台瘦回看题页；`App.tsx` 连带删一批现场生产 +
  难度的 handler/state（classic-retire 刀 3 纯删范式，可逆）。
- 难度作为 derived 维度躺 DB（字段留、写路径给默认值），UI 全站不展示；
  将来难度体系重建一个 backfill 点亮全库，无需 re-import。
- 编辑/删除保留 owner-only 兜底（服务端已 `ownerOnly`）。
- verify 随动：`verify-classic-retire-2` 更新、`verify-h12b-difficulty-profile-grid`
  删、`verify-calibration-preview` 删、`verify-ci` 注册表同步。后端难度计算
  的 verify（h5j/h5k/h5h/h5i/h1g/owner-gate）不受影响（数据层不动）。
