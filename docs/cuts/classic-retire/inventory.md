# 经典模式功能盘点（退役刀前置侦察）

日期：2026-07-03。侦察：Sonnet Explore（~11 万 tok），PM 对全部关键坐标
sed 抽验通过。目的：roadmap 决策 6 拍板「AI 模式对所有人是唯一界面，
经典模式整体退役」，退役前提是策展/管理功能先接住——本文回答
「经典模式今天到底承载了什么」。

## 现状基线（M0-3 之后）

- member 已锁死 `homeMode='ai'`（App.tsx:822-828，无视 localStorage 残留），
  模式切换按钮 member 不渲染（App.tsx:3436-3451）。
- 服务端 41 条策展路由挂 `ownerOnly` 闸（M0-3，verify-owner-gate 7 断言）。
- **经典模式今天事实上就是 owner 的策展后台**。这刀 = owner 自己也不再
  用经典模式，策展功能搬新家。

## 经典模式承载物·按搬迁成本分三类

### A 类：独立全屏路由（本体不依赖经典首页，只差入口）

| 功能 | 路由状态 | 证据 |
|---|---|---|
| 整卷导入工作台 | `paperImportRouteActive` | App.tsx:776-780, 3394-3399 |
| AI 导题工作台 | `paperImportAiRouteActive` | App.tsx:781-785, 3400-3405 |

退役经典首页不伤它们，只需要在管理角落保留入口。

### B 类：topbar 按钮/弹窗（挂 isOwnerView，不挂 homeMode——AI 模式下今天就显示）

| 功能 | 触发 | 证据 |
|---|---|---|
| 导入资料弹窗 | `openImportPanel` | App.tsx:3388-3393, 1721-1725 |
| 给题库打主题标签 backfill | `handleBackfillTopicLabels` | App.tsx:3406-3417 |

这两个按钮正是 ui-blemish-list №1「topbar 按钮墙」的主体，收进管理
角落后自然消解。

### C 类：真正长在经典首页里的（退役刀的实体工作量）

| 功能 | 位置 | 证据 | 处置方向 |
|---|---|---|---|
| 题组详情页（编辑/AI 解析生成保存/话题标签生成绑定/难度评分/verify） | `viewMode='detail'`，约 1300 行 JSX | App.tsx:3912-5220 | **最大的一块**，见 proposal |
| 闭环面板（试卷闭环状态总览/数据体检/整卷题集生成） | `viewMode='workflow'` | App.tsx:3588-3818 | 搬管理角落 |
| 排版预览 | `viewMode='preview'`，保存题集后跳转 | App.tsx:1465, 3540 | 随 paper-sets 命运 |
| 经典列表+筛选 | `viewMode='list'` classic 分支 | App.tsx:3836+ | ConciergeDesk 已替代，退役 |
| 经典侧栏（保存题集/题集载入/预览/导出/题库管家聊天） | `<aside class="basket-panel">` | App.tsx:5221-5691 | 草稿卷工作台已对等（除 paper-sets），退役 |

## AI 模式的关键 gap

**ConciergeDesk 卡片只暴露「加入草稿卷」（onAdd），没有题组详情入口**
（ConciergeDesk.tsx:36；grep openEditEntry/handleVerify/handleGenerateTopicLabels
在 concierge/ 零匹配）。owner 的策展主流「找题→看详情→编辑/生成解析」
在 AI 模式断链——详情页必须先进 AI 模式，经典模式才能退。

题组详情的唯一入口是经典列表点击 `openDetail`（App.tsx:1473-1475）。

## paper-sets（题集）的角色确认

- 经典侧栏「保存题集/载入」（App.tsx:5561-5622）+ 闭环面板「生成/更新
  整卷题集」写的都是 paper-sets（POST/PUT owner-only，GET 开放）。
- **AI 模式端零消费**：grep paperSet/paper-sets 在 concierge/ 和
  features/draft-paper/ 无匹配。
- 即：paper-sets 是纯策展侧概念（导入→入库→题集→导出的闭环核对产物），
  与用户侧草稿卷（draft-papers）是两套东西。

## 不受影响（两模式通用，退役刀不碰）

- 草稿卷工作台（chip 入口，App.tsx:3336-3345）
- 个人空间（App.tsx:3346-3349）
- 服务端 41 条 ownerOnly 闸原样保留（管理角落照走这些 API）

## 附：疑似死路径

- 「新建题组」：`EntryModal` 只有 edit 模式可达（App.tsx:1727-1731 是
  唯一 `setEntryOpen(true)` 调用点，固定 mode='edit'）；全库无新建按钮。
  POST question-groups 路由存在但前端不可达。退役刀顺手确认后可清。
- 语法填空动词画像 backfill：只有服务端路由（verbProfileBackfillRoutes），
  前端无按钮——本来就是脚本驱动，不需要 UI 新家。
