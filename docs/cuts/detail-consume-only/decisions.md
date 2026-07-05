# detail-consume-only — Accepted Decisions

Last synced: 2026-07-05 after PM grill (owner 黄学伟 拍板全程).
Open review items: 0 (PA not yet run — PA may add items into `plan.md`
PA Follow-Up Decisions).

产品原则与边界的完整「为什么」见 `docs/adr/0015-web-surface-consume-only.md`。
本文件只记 grill 逐条拍板的结论，供 PA/DEV 快速对齐。

## D1 — 原则靶子：禁「网站现场生产」，留「低频纠错运维」

owner 拍板。「网站只消费」的靶子是「把网站变成 AI 现场生产车间」的动作
（跑 AI 造解析/标签/难度/验证），不是禁一切写。编辑/删除已入库题组属低频
纠错运维，**保留详情页 owner-only 兜底**，不搬后台、不建独立管理页。

## D2 — 详情视图：删现场生产、回归看题页

删 owner-only 现场生产动作（各题型跑解析/保存解析、主题划分/绑定、AI
ops-trace 段）。留 member 可见的消费内容（passage/题目/答案/已存解析/答案
对比 + AI 验证展示/已绑定话题标签展示/加入草稿卷/返回）。编辑、删除留
owner-only。**READ 回填链路（`openDetail` 灌已存 parse/verify）必须保留**，
只删 `handle*` 现场调 AI 的 WRITE 路径。

## D3 — 难度维度：全站下线，只删 UI/功能层，数据层不碰

owner 拍板：难度当前不完善、想舍弃，全站 UI 下线。**只删 UI/功能层**（找题
卡难度 pill+dot、详情难度全套、EntryModal 难度 select、App.tsx 难度
state/handler、`difficultyCalibration.ts`、引导按难度搜的示例文案）。**数据层
完全保留**（`difficulty` 及各难度列、难度路由、reading-parse 依赖的
normalizer/service、steward 难度维度、schema/VIEW/publisher）。理由：难度是
ADR-0008 的 derived 维度，可随时 backfill 重建；数据层删除高风险单向、牵连
live reading-parse、零当前收益。

## D4 — 难度含 hero 题组级徽标一并删（详情页范围内）

owner「跟难度相关的全部东西」从严执行：详情页范围内所有难度 UI 全删，
含 hero 的题组级难度徽标。ConciergeGroupCard 的难度展示也删（全站下线）。
找题时难度信息随卡片 pill 一起消失——owner 接受（难度不完善、不该展示）。

## D5 — steward NL 搜索难度维度：留后端，只删引导文案

server steward 自然语言搜索里的 `difficultyLevels` 维度**保留不碰**（改冻结
AI prompt 需 prompt 级重验，风险不值）。只删引导用户按难度搜的示例文案
（`ConciergeDesk` 提示、`clarificationCopy`）。用户不主动搜难度即基本不触发；
将来删数据层时一起清。

## 挂账（不在本刀，独立后续）

- AI Enhancement 批量面板（import workbench，owner-only，另一个现场生产面）
  → 同原则另刀退役。
- 难度数据层删除（schema 迁移 + steward prompt + reading-parse 解耦）
  → 可选 data-contract 刀，走 PA。
- 难度体系重建（估计器/校正/画像）→ owner「后面再做」。
- 补解析/验证/难度的后台 CLI driver → 需要时补。
