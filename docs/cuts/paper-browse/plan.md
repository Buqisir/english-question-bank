# 刀B 整卷预览页（paper-browse）plan

- Size: **medium**。**PA-lite**（降档理由：纯增量产品面——新路由新页面，
  不改 schema/数据契约/导出面；PaperSurface 本体零修改（其 dumb-renderer
  契约有 verify 硬护栏）；随时可整页回滚。CR 复核此降档。）
- 起因：owner 2026-07-08 拍板方向（对标新东方 we.xdf.cn 组卷器的操作逻辑，
  模仿不照抄）：**流式呈现 + 题组量子化操作**的挑题工作台，成卷 A4 预览
  留给现有草稿卷工作台/导出（两皮结构的第一皮）。
- 摸底（2026-07-08，file:line 均已核实）：无试卷列表路由；整卷顺序真相源
  = `paper-asset.json` `content.blocks`；PaperSurface 一 mount 一题组；
  `draftPaperButtonState` 状态机 + `basket-chip` 悬浮计数现成；
  App.tsx 路由 = searchParams + 状态旗 + 早退分支模式。

## 页面形状（v1）

**路由**：`?view=paper-browse&paperId=<id>[&focusGroupId=<gid>]`，App.tsx
按现有模式加 `openPaperBrowse(paperId, focusGroupId?)` + 早退分支
（参照 `openDraftPaperWorkbench` App.tsx:649-672 与 :761-771 分支）。

**入口（v1 唯一入口）**：详情页 action bar——当该题组有
`paperSurfaceHref`（即所属卷有 paper asset）时，加「看整卷」按钮
→ paper-browse 页并滚动定位到该题组。不做试卷列表页（库里有 asset 的卷
还少，列表等内容量上来另立刀）。

**页面结构**（三栏，参照现有工作台外壳/AppTopbar）：
- 中央：客户端 fetch `paper-assets/<paperId>/latest/paper-asset.json`
  （与 Harness 同源同方式），按 `content.blocks` 顺序流式渲染：
  - `partHeading`/`sectionHeading`/`instruction` → 标题/说明行；
  - `group` → **题组卡**：复用 Harness 的按题型 adapter
    （`buildPaperAssetSurfaceModel`/`buildSevenChoicesSurfaceModel`/
    `buildClozePaperView`/`buildGrammarFillPaperView`/
    `buildWritingPaperView`）喂 `<PaperSurface>`（read 形态，不接
    evidence/annotation 交互；`onFocusIntent` 空实现）。**PaperSurface
    文件零修改**——所有卡壳/行动栏归页面持有（tokens 契约护栏保持绿）。
  - 未知/不支持的 block 类型渲染占位行（如听力原料、图表），不崩。
  - 题号显示资产存储的原始题号（浏览的是原卷，不重编号；重编号是
    草稿卷工作台的职责）。
- 左侧：**目录 rail**——从 blocks 提取 部/节标题 + 题组（题号区间），
  点击 `scrollIntoView` 到对应卡（data-anchor，参照 Harness insight-rail
  的锚点模式 :1130-1157，但跨题组）。
- 题组卡行动栏：**「加入草稿卷」/「已在草稿卷」**（复用
  `draftPaperButtonState` + `addGroupsToBasket` 回调，从 App 传 props，
  与详情页同一套；groupId ↔ 按钮状态从 App 已加载的 questionGroups 查，
  查不到的组（未入检索库）按钮不出）。**不做移出**（移出归草稿卷工作台，
  职责分离）；**不做整卷加入**（现有产品原则：题组是最小加入单位，
  aggregatePaperResults.ts:8-11 注释明示，本刀遵守）。
- 悬浮草稿卷计数 chip：复用现有 `basket-chip`（App.tsx:915-924），
  本页壳里同样渲染。

## Forbidden

- `app/src/shared-ui/papersurface/**` 零修改（tokens/module-v1/
  host-interaction 护栏必须原样绿）。
- 不动 server/API/schema（纯前端消费现有静态资产与现有 draft API）；
  不动导出面、详情页解析区（刀A 正在施工，**两刀文件不相交**：刀A 在
  `features/question-detail/`，本刀不得碰该目录，入口按钮除外——
  「看整卷」按钮加在 `QuestionGroupDetailView.tsx` action bar（:207-220
  邻域），**只加一个按钮 + prop，不碰解析区**；若 DEV 判断冲突风险高，
  可改为 v1 入口放搜索结果 paper row，落报告说明）。
- 不做：试卷列表页、练习模式、移出草稿卷、整卷加入、听力/图表渲染
  （占位即可）、成卷 A4 预览切换（第二皮另刀）。

## 验收

- 行为级 verify（新脚本，挂 CI+README）：路由分支存在且早退顺序正确；
  页面组件按 blocks 顺序渲染（用真 paper-2026-i 资产喂组件级断言或
  E2E）；PaperSurface 文件 diff 为零（复用现有护栏跑绿即可）；
  member 视角「加入草稿卷」可见（与详情页同约定）。
- `verify-paper-intelligence-route-integration` /
  `verify-h1-router-skeleton` / draft 系 verify 全绿。
- 浏览器 QA：paper-2026-i 全卷滚动 + 目录跳转 + 加入草稿卷 + chip 计数
  截图，member/owner 双视角，收官交 owner。

## 派工

Sonnet DEV medium（worktree 隔离，与刀A 并行；文件面不相交，唯一交点
`QuestionGroupDetailView.tsx` 的入口按钮——刀B DEV 后合并者负责 rebase）
→ fresh Opus CR（含 PA-lite 降档复核）。
