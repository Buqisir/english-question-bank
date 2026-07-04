# PA 评审 — 刀 2「题组详情进 AI 模式」

评审：fresh Opus PA，un-anchored context，2026-07-03。基线核对：branch
`cut/classic-retire-2-detail-view` @ ac6ba88，工作树干净。plan.md 全部
file:line 声明已 sed/Read 抽验（详见证据段）。

## 裁决：GO-with-Must-Fix

计划方向正确、边界基本对、服务端零改动判断成立。抽取套路（props 驱动、
AdminWorkbench 先例）适配这块 1256 行 JSX 是合理的，不构成刀 3 返工陷阱
（见 SW-1）。但有 **3 个 Must Fix** 必须先落进 plan.md 才能开 DEV：一个是
**member 数据暴露真缺口**（AI key 指纹/call trace 会随已存解析漏给 member），
一个是 **props 清单不完整**（5 个 per-questionNo 派生 map + getParseSavedAt
漏列，DEV 照单抄会编译断），一个是 **member 门控只有 API 行为断言、前端隐藏
零覆盖**（当前 local 运行时 isOwnerView 恒 true，member 隐藏逻辑跑不到，
必须 forced-auth 浏览器 QA 兜底）。

PO 级未决问题：**1 个**（MF-1 的处置需 owner 一句话拍板是"隐藏 trace 块"
还是"trace 块整体 owner-only"）。低于 3，DEV 可在 PM 压缩后开工。

---

## Must Fix（阻塞 DEV）

### MF-1 member 数据暴露：AI key 指纹 / call trace / 耗时会随"已存解析展示"漏给 member

**风险（真缺口）。** plan 的边界规则是"展示已存数据=member 可见"。但已存
解析的展示块里内联着 AI 调用元数据 trace 段——不是新调用才有，是从
`detail.readingParseResult` 等已存 payload 回填后就渲染：

- 阅读 trace：App.tsx:3971–3982（`keySource` / `key 口令: keyFingerprint||keyMask`
  / `requestId` / `totalLatencyMs` / `provider`）
- 话题标签 trace：App.tsx:3867–3883（同上，`topicLabelTrace`）
- 七选五 trace：App.tsx:4096–4107
- verify trace：App.tsx:4833–4842
- 语法填空 trace：App.tsx:4908–4917

服务端确认这些字段**被整包持久化并原样回吐**：`getSavedReadingParseResult`
把 `...payload` 连同 `request_id` / `keyFingerprint`（api.mjs:970–984）塞进
detail GET 响应；GET /api/question-groups/:id 对 member 开放
（questionGroupRoutes.mjs:41–48，无 ownerOnly）。→ 一个已认证 member 打开
任何已存解析的题组，就能看到 owner 的 **AI key 指纹**、call trace requestId、
provider、耗时。这些是 AI 运维痕迹，不是"给同事的教研价值"，违反 Super
Teacher Boundary 的"不为'我们有数据'就展示数据"精神，且 key 指纹属敏感。

注意：`topicLabelTrace` / 各 parse 的 trace 段判断条件里，reading/七选五/verify
的 trace 是随 `readingParseResult`（已存回填）渲染，member 会看到；话题标签
`topicLabelTrace` 只在 handleGenerateTopicLabels 后 set（openDetail 里
`setTopicLabelTrace(null)`，1506），member 不触发生成 → 话题 trace 对 member
天然不显。**真正漏的是 reading/cloze-无/seven/grammar/verify 五处随已存解析
回填的 trace 段。**

**所需 plan.md 处置（PO 拍板，二选一，PM 压缩进 plan）：**
- 方案 A（PM 推荐，最小）：把这 5 处 trace 段（`ai-meta` / 各
  `Provider: … key 口令 … call trace …` 段）纳入 `isOwnerView` 门控，member
  隐藏——它们本就是 owner 运维视图，不是教研内容。解析正文（题目翻译/AI 解析/
  干扰项分析/同义替换/故事大意等）**保持 member 可见**（这才是核心价值）。
- 方案 B：整块解析展示对 member 只读但保留 trace（不推荐，暴露 key 指纹）。

plan.md 步骤 2 的 member-隐藏清单必须显式加一条："各题型已存解析的 AI trace
元数据段（provider/keySource/keyFingerprint/requestId/latency）= owner-only"。

### MF-2 props 清单不完整：5 个 per-questionNo 派生 map + getParseSavedAt 漏列

**风险（返工/编译断）。** plan 步骤 1 的 props 分组把 40 states/17 handlers
都点了名，但**详情分支实际读取的这些派生量一个没列**：

- `readingParseByQuestionNo` / `clozeParseByQuestionNo` /
  `sevenChoicesParseByQuestionNo` / `grammarParseByQuestionNo` /
  `verifyByQuestionNo`（App.tsx:1261–1293，5 个 useMemo），分支在
  4121/4224/4362/4366–4369 读。
- 模块级纯函数 `getParseSavedAt`（App.tsx:747），分支在 4374 调。
- 分支还直接调了一批模块级纯函数/常量：`mapAiDifficultyScoreToFive`、
  `computeCalibrationPreview`、`getReasonLabel`、`mainBlockerLabel`/`labelOf`、
  `getDisplayDifficulty`、`requiresDifficultyReason`、`teacherDifficultyLabel`、
  `difficultyOverrideReasonLabel`、`readingDistractorTypeLabel`、
  `compactPreview`、`DifficultyProfileGrid` 组件等。模块级的随 import 走即可，
  但 **5 个 useMemo 是组件级派生**，必须明确：要么作为 props 传入，要么在
  新组件内用传入的 parse 结果重算（它们只依赖 parse results，可重算）。

DEV 照现 plan 的 props 清单原样抄，会漏掉这 5 个 map → TS 编译报未定义。

**所需 plan.md 处置：** 步骤 1 props 清单补一条明确指令："5 个
`*ParseByQuestionNo` / `verifyByQuestionNo` useMemo 在新组件内**用传入的各
parse result 重算**（不新增 props，避免 props 面继续膨胀）；`getParseSavedAt`
及一众模块级纯函数/label 常量随 import 迁入或反向 import，单一定义。"

### MF-3 member 前端隐藏零行为覆盖：verify 只证了 API 面，隐藏逻辑当前运行时跑不到

**风险（验证不足）。** 本刀 member 真价值改动=前端**隐藏 owner 按钮**
（步骤 2）。但：
- `isOwnerView` 在 bootstrap-open 模式（当前 local 单人、无 auth）**恒为
  true**（AuthGate.tsx:25–29 注释 + App.tsx:832）。→ 现运行时里 member 隐藏
  分支**根本不执行**，普通浏览器 QA 看不到 member 视角。
- plan 步骤 4 的行为断言（member GET 200 / member POST parse 403）**只覆盖
  服务端闸**，而服务端本刀零改动、且这两条已被 `verify-owner-gate.mjs` 覆盖
  （该脚本建 owner+member 账号、cookie、断言 gated 路由 403 + allowed 面
  非 403）。→ plan 步骤 4 的行为断言与既有 verify-owner-gate **高度重复**，
  且**不覆盖本刀真正的新逻辑（前端 isOwnerView 隐藏）**。

**所需 plan.md 处置：**
- 步骤 4 明确：新脚本的 API 行为断言若与 verify-owner-gate 重叠则**不重复
  造轮子**，改为在新脚本里做**前端组件级断言**——`QuestionGroupDetailView`
  在 `isOwnerView={false}` 下不渲染编辑/生成/保存/绑定/难度按钮（可用
  render + 查询 DOM，或源断言这些按钮包在 isOwnerView 条件里）。
- 验收标准补一条：**forced-auth 模式浏览器 QA**（按 verify-owner-gate 造
  member 账号登录）实点验证 member 视角详情页只读、owner 视角逐块等价。
  纯 open-mode 本地 QA 不算数（Browser Verification 规则 + 三次真缺口教训）。

---

## Should Watch（不阻塞，DEV/CR 留意）

### SW-1 抽取套路 vs 刀 3 返工——不构成陷阱，但 props 面要按对象分组守住

props 驱动零 state 抽取（AdminWorkbench 先例，358 行 ~20 props）对这块
1256 行是**合理**的：状态与 handler 留 App.tsx，刀 3 删 homeMode/viewMode
状态机时，详情组件本身不含状态机、只被 openDetail 触发渲染，不受牵连。
前提是 props 按 plan 说的**分组成对象**（detail/verify/各 parse/topicLabel/
difficulty/回调组），不要摊平成 40 个扁平 prop——扁平会让刀 3 及后续维护
痛。CR 按此检查 props 面形态。

### SW-2 边界规则措辞不严谨，但兜底句救回来了

plan 步骤 2 主句"触发写操作（POST）=owner-only"**不准确**：draft-paper 路由
（draftPaperRoutes.mjs 全部无 ownerOnly）也是 POST 但 member 开放，"加入
草稿卷"正是走它。真规则是"触发 **ownerOnly 路由** 的按钮=owner-only"。plan
的兜底句"按其调用的 handler 是否打 ownerOnly 路由判定"已表达对了。建议 PM
压缩时把主句改成 ownerOnly 口径，避免 DEV 误把"加入草稿卷"也藏了。

### SW-3 addToBasket 有副作用（开草稿工作台），但对 member 合法

`addToBasket`（App.tsx:1409–1415）在"已在草稿卷中"时调
`openDraftPaperWorkbench`（不是 POST，是打开用户侧工作台），否则 POST
draft-papers（member 开放）。两条路径都 member-OK，plan 把"加入草稿卷"
列为 member 可见正确。仅提示 DEV：这个按钮不是纯展示，别误门控。

### SW-4 onOpenDetail 线程比 onSimilar 深一层

`onSimilar` 目前**在 ConciergeDesk 内部定义**（ConciergeDesk.tsx:334/376），
不从 App 传。`onOpenDetail` 需要 App→ConciergeDesk→ConciergePaperRow→
ConciergeGroupCard 全程穿（App 才有 openDetail）。且 **ConciergeGroupCard
在 ConciergeDesk 有两个渲染点（333、375）+ ConciergePaperRow 一处（239）**，
三处都要接 onOpenDetail，漏一处该入口在部分列表失效。CR 逐点核。

### SW-5 openDetail 是三入口共享，抽取后仍留 App.tsx（正确）

detail 有三个 openDetail 调用点：经典列表 3648、AI 增强面板"查看"6127、
本刀新增的 concierge 卡片。plan"openDetail 留 App.tsx"正确，三入口共用不
冲突。刀 3 删经典列表时 3648 那个入口一并走，6127 与新 concierge 入口保留。

### SW-6 difficultyDrafts 无跨组污染（原担心已排除）

openDetail 未直接 reset difficultyDrafts，但 App.tsx:1185–1200 的 useEffect
（keyed on `selectedDetail?.id`）在 selectedDetail 变化时重置
drafts/status/errors。故从 AI 模式进、切不同题组，drafts 会按组重置，无
staleness。该 effect 必须留 App.tsx（它 own 这批 state）。CR 确认 effect
未被误搬。

---

## 数据契约备注

- 本刀服务端零改动判断**成立**：GET /api/question-groups/:id 已 member 开放
  （questionGroupRoutes.mjs:41–48），16 条 AI 生成/保存 POST 逐条 ownerOnly
  （模块头注释 15–22 + 各路由 `{ ownerOnly: true }`）。member 打 parse POST
  必 403，无需改闸。
- **唯一数据契约风险是 MF-1 的响应体内容**：detail payload 把已存 parse 的
  trace 元数据（key 指纹/requestId/keySource/latency）原样回吐给 member。
  服务端不改（保持 owner 侧可用），**在前端展示层门控**即可（MF-1 方案 A）。
- detail payload 里 member 可见的其余字段核过：解析正文、话题标签、已存
  难度、答案/选项、passage 原文——都是教师/同事面价值，member（=同事教师，
  非学生）可见符合 proposal Q2-A。未发现 cost/额度/import provenance 之类
  另需遮蔽的字段（trace 是唯一一处）。

---

## Must Fix → plan.md 处置映射清单（Big CR 核此表闭环）

| Must Fix | plan.md 必须记录的处置 |
|---|---|
| MF-1 trace 元数据漏给 member | 步骤 2 member-隐藏清单显式加"各题型已存解析的 AI trace 段（provider/keySource/keyFingerprint/requestId/latency）owner-only"；`PA Follow-Up Decisions` 记 PO 选方案 A/B |
| MF-2 props 清单漏派生 map | 步骤 1 补指令："5 个 `*ParseByQuestionNo`/`verifyByQuestionNo` useMemo 在组件内用传入 parse result 重算，不新增 props；`getParseSavedAt` 等模块级纯函数/常量单一定义迁移" |
| MF-3 前端隐藏零覆盖 + open 模式跑不到 | 步骤 4 改为组件级 isOwnerView 隐藏断言（不重复 verify-owner-gate 的 API 断言）；验收标准加"forced-auth member 账号浏览器 QA 实点验证只读" |

## PO 决策（仅 1 个，低于 3 的开工闸）

1. **MF-1 处置口径**：trace 元数据段对 member 是"隐藏"（方案 A，推荐）还是
   "整块解析 owner-only"（方案 B）？PM 推荐 A：藏 trace、留解析正文，member
   仍得核心教研价值。owner 一句话即可，PM 压缩进 `PA Follow-Up Decisions`。
