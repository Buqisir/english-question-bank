# CR 评审 — 刀 2「题组详情进 AI 模式」

评审：fresh Opus CR，cold-read committed diff `main...HEAD`（code commits
7d69602 / a810d85 / 2c0ecd8），工作树干净，branch
`cut/classic-retire-2-detail-view`。所有断言均自跑复核，未采信 DEV 战报数字。

## 裁决：APPROVE

抽取忠实、门控真闭合、三处入口全穿、验证可真失败、禁区零触碰、typecheck +
build + verify-owner-gate + 两个新/改脚本全绿。0 Must Fix，2 Should Watch（均
不阻塞）。

---

## Changed Scope（自 diff 文件清单核实）

- `app/src/features/question-detail/QuestionGroupDetailView.tsx`（+1548，新组件）
- `app/src/features/question-detail/detailHelpers.ts`（+92，单一定义纯函数）
- `app/src/App.tsx`（−1471：detail 分支抽走 + 5 个 useMemo/getParseSavedAt 移除）
- `app/src/concierge/{ConciergeDesk,ConciergePaperRow,ConciergeGroupCard}.tsx`
  （onOpenDetail 穿透 + 详情按钮）
- `scripts/verify-classic-retire-2.mjs`（新，已注册 verify-ci + README）
- `scripts/verify-h12b-difficulty-profile-grid.mjs`（render-site 重定位改动）

**Forbidden 全部未触碰**（diff 文件清单核实）：server/**、domain/schema/
*Adapter/PaperSurface、App.css、preview 分支、经典列表分支、viewMode/homeMode
状态机形态——零改动。`grep -i css/server/adapter/schema/domain/papersurface`
命中为空。

---

## 优先项逐条核验

### 1. 抽取忠实度（#1 风险）— 通过

对 `git show main:App.tsx` 抽出的原 3678–4934 块与新组件 return body 做
**归一化多集 diff**（剥缩进/空行/`isOwnerView` 门控 wrapper）：全部差异仅两类
——(a) 回调重命名（backToList→onBack、handleXxx→onXxx、updateDifficultyDraft→
onUpdateDifficultyDraft 等），(b) 新增 `isOwnerView &&` 门控前缀。**无内容行
丢失、无 wrapper 重排、无条件语句被改、无 state-setter 串号**。样本深挖了
reading/cloze/seven/grammar 四题型解析块 + 难度复核队列 + 校正报告 + 小题列表，
逐块结构一致。

### 2. MF-1 trace 门控 — 通过（真闭合）

5 处 AI 运维 trace 段全部包在 isOwnerView 内：topicLabelTrace(456)、
readingParseResult trace(562)、sevenChoicesParseResult trace(691)、
verifyResult trace(1432)、grammarParseResult trace(1513)。对 main 的
reading(3971)/seven(4094) trace 核实：原本裸 `{readingParseResult && (`，新版
改为 `{isOwnerView && readingParseResult && (`——真加了门。解析正文（题目翻译/
AI 解析/干扰项/同义替换/parsedCount/articleAnalysis）保持 member 可见，符合
plan。**未发现其他 keyFingerprint/keyMask/requestId/keySource/latency 泄漏给
member 的路径**（见 SW-1 唯一残留）。

### 3. MF-2 in-component 重算 + 单一定义 — 通过

5 个 `*ParseByQuestionNo`/`verifyByQuestionNo` + answerCompareStats 在组件内用
传入 parse/verify result 重算（215–258），依赖正确（各自 result）。
`getParseSavedAt` 及一众纯函数 → detailHelpers.ts 单一定义，App.tsx 反向 import
仅 `compactGroupMeta/compactPreview/getDifficultyDraftForQuestion`（各仍在
App.tsx 有用）。App.tsx **无死副本**（grep：0 处 function 定义残留，仅注释）。
App.tsx 对已迁走的 formatSavedAt/mapAiDifficultyScoreToFive/getParseSavedAt 等
**零引用**——不会编译断。`tsc --noEmit` EXIT 0，**无 TDZ**。

### 4. owner 门控完整性 — 通过

组件内所有触发 ownerOnly 路由的按钮/表单——编辑(287)、AI解析/verify(311)、
四题型保存解析（reading-ai-actions 全在 isOwnerView 内）、话题生成(396)/绑定
(427)、难度评分卡(1068)——**全部仅在 isOwnerView 内渲染**。member 可见回调仅
onBack（无 POST）与 onAddToBasket（draft-papers，member 开放，SW-3 认可）。
组件**零 useEffect/零 mount 副作用**（props-driven），不会在挂载时打 owner 路由。
`verify-owner-gate.mjs` 自跑 7 passed 0 failed：member 对 41 条 ownerOnly 路由
全 403、GET question-groups member 开放——API 面门控独立证实。

### 5. onOpenDetail 三点穿透（SW-4）— 通过

App(3455)→ConciergeDesk（两处 ConciergePaperRow：搜索结果 330 + 浏览 feed
372，均传 onOpenDetail）→ConciergePaperRow(244)→ConciergeGroupCard，卡片
详情按钮 `onOpenDetail && (...)` 可选渲染。ConciergeGroupCard 全仓仅
ConciergePaperRow 一处渲染，无遗漏路径。可选 prop 处理一致。

### 6. verify-h12b 改动 — narrowed-not-weakened

引入 `renderSiteSrc`：跟随 `<DifficultyProfileGrid>` 到实际渲染文件（现
QuestionGroupDetailView.tsx），"App.tsx 不再内联 maps" 的不变量仍钉 App.tsx。
import 路径正则从 `./workbench/...` 放宽到 `[./]+(?:workbench/detail/)?...`
以适配新文件的 `../../` 深路径——是相对路径的合法适配，非削弱：6 个 PROPS
的 render-prop 覆盖断言全保留，抽取回归仍会 fail。自跑 48 passed 0 failed。

### 7. defaultAiModel prop 偏差 — 合理

DEFAULT_AI_MODEL 是 App.tsx 模块级 const（DEEPSEEK_MODELS[0].value）；作
`defaultAiModel` prop 传入后组件内 `const DEFAULT_AI_MODEL = defaultAiModel`
别名，纯为保留 verbatim JSX（引用了 DEFAULT_AI_MODEL）而不引入 import。仅在
5 处 owner-gated trace 段做 model 兜底。可接受。

### openDetail reset 完整性 — 通过

openDetail(1336) 顶部把 verify/四题型 parse/topicLabel 全套 state 清零后再
fetch 回填；AI 模式进详情不会带上一组的 stale state。difficultyDrafts 由
App.tsx:1093–1106 useEffect（keyed selectedDetail?.id）按组重置，该 effect
留在 App.tsx（own 该 state），未被误搬（SW-6 排除）。

---

## Findings

### Must Fix

无。

### Should Watch（不阻塞本刀）

**SW-1｜非 reading verify 段的 `全量耗时`(totalLatencyMs) 未门控（原样搬运，
member 实际触达不到）。** QuestionGroupDetailView:1444 的
`{verifyResult.allApiCalled !== undefined && verifyResult.totalLatencyMs
!== undefined && (...全量耗时 ms...)}` 未包在 isOwnerView 内。核实：该段仅
`groupType !== 'reading'` 时渲染，而 member 的 verifyResult 来自
`buildClozeVerifyResult`/`buildSevenChoices...`/`buildGrammar...`（App.tsx
526–662）——三者**均只 set totalLatencyMs、不 set allApiCalled**，故条件恒
false，member 看不到。`allApiCalled` 仅 owner 实跑 verify（App.tsx:2280
setVerifyResult(result)）才有。→ **当前无 member 泄漏**，与 main 行为逐字一致
（原 4843 同样裸露）。之所以列 SW 而非无视：这是靠"build 函数恰好不填
allApiCalled"这一间接事实兜住的 latency 面，脆弱；若未来某人给 build 函数补上
allApiCalled，就会漏。MF-1 处置把其余 4 处 latency 都收进 isOwnerView 了，此处
为求彻底一致，**刀 3 或后续可顺手把这段也纳入 isOwnerView**（一行）。不阻塞：
不改也无现网泄漏。

**SW-2｜lint 未纳入 merge 门，本刀无新增 error。** app lint 在 main 上已带 39
errors（多文件历史债），非 verify-ci 门（preflight 只跑 build/typecheck）。本刀
QuestionGroupDetailView 的 3 处 `no-explicit-any`（774/800/915 的
`getReasonLabel(x as any)`）系从 App.tsx 原 detail 块 **1:1 搬运**（原块 grep
`as any` = 3），未新增 lint 债；App.tsx 侧唯一 lint 项是 difficultyDrafts effect
的 exhaustive-deps **warning**（非 error，pre-existing）。记录以备将来 lint 若
进门时知晓来源；本刀不处理。

---

## Self-Review Blind Spots

- **归一化 diff 的盲区**：我按"剥门控 wrapper + 剥缩进"做多集比对，能抓到内容
  行增删/条件改写，但**对 JSX 嵌套层级的错配（同样文本挂错父节点）不敏感**。
  我另行逐块通读了四题型解析 + 难度卡 + 校正报告确认层级，但未做 AST 级结构
  比对。若有极隐蔽的 wrapper 层级错位（视觉不塌、文本齐全），可能漏。build +
  tsc 绿仅证类型，不证 DOM 树等价。→ **owner QA 逐块对比改前改后是最终防线。**
- **member 视角运行时未由我实跑**：local open 模式 isOwnerView 恒 true，我
  无法在本地渲染 member 分支。MF-3 的 forced-auth 浏览器 QA（造 member 账号
  实点详情页，确认零写按钮 + 零 trace 段）**仍是 member 隐藏逻辑的唯一运行时
  证据**，源断言只证文本门控存在。此 QA 归 owner/orchestrator，未在本 CR 内
  完成。
- **SW-1 的 allApiCalled 兜底**：我核了三个 build 函数当前不填 allApiCalled，
  但未穷举所有 setVerifyResult 调用点是否有第三条 member 可达路径也填了它。
  逐点看过 openDetail 回填链（1384–1405 走 build 函数），判定 member 安全，但
  这是"当前代码恰好如此"的判断，非结构保证。

---

## Failure / Attack Angle

- **最可能的假绿**：verify-classic-retire-2 全是源正则断言。我实测把 reading
  trace 的 `isOwnerView &&` 摘掉后脚本 30 passed **1 failed**——门控断言能真
  失败，非 fake green。但正则断言**只认文本形状**：若 DEV 用了等价但不同措辞
  的门控（如 `!isMember &&`），脚本会误判 FAIL；反之若把整个 trace 段删掉，
  `readingParseResult trace` 断言也会 FAIL（因 Provider 行没了）——即它无法
  区分"删了"和"漏门控"，但两种都触发 FAIL，对本刀足够。
- **stale fallback**：openDetail 顶部全套 reset 到位，未见旧组数据残留路径。
- **未来误用**：SW-1 的 allApiCalled 是一颗定时按钮——后续给 build*VerifyResult
  补 allApiCalled 会让 member 看到 latency。已在 SW-1 点名。

---

## Verification Evidence（自跑）

- `tsc --noEmit -p app/tsconfig.json` → EXIT 0（无 TDZ/无编译断/无孤儿引用）
- `npm run build --prefix app` → BUILD OK（verify-ci preflight 等价）
- `node scripts/verify-classic-retire-2.mjs` → **31 passed, 0 failed**
- `node scripts/verify-h12b-difficulty-profile-grid.mjs` → **48 passed, 0 failed**
- `node scripts/verify-owner-gate.mjs` → **7 passed, 0 failed**（member 41 路由
  全 403 + GET question-groups member 开放）
- 回归实验：摘掉 reading trace 门控 → verify 由 31→30 passed / 1 failed，恢复
  后复绿（证断言可真失败）
- 归一化多集 diff（原 detail 块 vs 新组件 body）：68 差异行，全属回调重命名 +
  门控增加，零内容丢失
- 注册核实：verify-ci.mjs registry + README.md 均已登记新脚本（`| yes |`）

---

## Residual Risk

低。runtime 面唯一残点是 SW-1（当前无泄漏、结构脆弱），归后续一行清理。
member 隐藏逻辑的运行时证据依赖 owner forced-auth QA（MF-3 约定），CR 已确认
源门控齐备但无法本地实跑 member 视角。抽取忠实度已用归一化 diff + 逐块通读 +
tsc/build 三重兜住，剩余极隐蔽 JSX 层级错位风险交 owner 逐块 QA。

## Recommendation

**APPROVE**（0 Must Fix，2 Should Watch）。合并前置：orchestrator/owner 完成
MF-3 约定的 forced-auth member 浏览器 QA（member 详情页只读、零写按钮、零
trace 段；owner 详情页逐块与改前等价）。
