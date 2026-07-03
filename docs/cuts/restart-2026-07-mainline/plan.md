# plan.md — 重启第一轮：主线两刀

cut size: medium ×2（两刀独立分支、串行合并）; touches schema: no /
data contract: 刀② touches server export params (additive, backward-compatible) /
product boundary: no / teaching interpretation: no

授权背景：owner 2026-07-02 全权委托（方向=主线体验打磨、UI 决定权=小川、
规模=体检+1-2 刀、流程=AGENTS.md 新 dispatch map）。体检见同目录 audit.md。

---

## 刀① 让老师用人话找到题（本地搜索质量）

Branch: `restart-1-local-search`
Scope: `app/src/concierge/conciergeSearch.ts`（主）、`app/src/concierge/reason.ts`、
`app/src/concierge/ConciergeGroupCard.tsx`（展示层小改）。
Forbidden: server/**、domain/schema/Adapter/PaperSurface、思考模式 LLM 链路
（questionBankStewardService / semanticSearchService 不动）。

### 改动

1. **tokenize 支持中文**（`conciergeSearch.ts:86`）：CJK 连写段额外产出
   bigram（如「生态主题」→「生态主题」+「生态」「态主」「主题」），配
   中文虚词 stopword 表（的/了/篇/题/找/一道/请 等）防噪。
2. **haystack 拆段 topic label**（`:114/:133`）：label 全路径串
   `人与自然-自然生态-生态环境` 额外按 `-` 拆段入 haystack，让「生态环境」
   「自然生态」可整词命中。
3. **加权排序替换等权计数**（`:161-168`）：topicLabel 命中 > 篇位/题型
   命中 > 地区/年份命中 > 其他字段。同分再 year DESC（保持现状作 tiebreak）。
4. **本地结构化 intent 解析**（新函数，同文件）：正则抽 年份 `20\d{2}`、
   篇位（A/B/C/D 篇、阅读C，已有 `extractReadingSectionLabel` 可复用）、
   题型（阅读/完形/七选五/语法填空/应用文/续写）、地区（浙江/全国甲乙丙/
   新课标I·II）。抽到的维度作硬过滤或强加权（篇位/题型=硬过滤，
   年份=强加权），主题词走 1-3 的软匹配。
5. **`highConfidenceLocalHits` 阈值重校**（`:258`）：配合新加权分重新校准
   ≥2 分闸门，避免弱命中直接短路。
6. **展示层**：ConciergeGroupCard/ConciergePaperRow 显示 topic label 末段
   chip（如「生态环境」）；`reason.ts` 理由文案人话化——
   「讲生态环境的 C 篇 · 2026 浙江」替代「匹配关键词：c、篇」。
   无 topic label 的组显示现有信息，不留空位。

### 验收（DEV 自测 + 主 agent 浏览器 QA）

- 「生态主题 C 篇」→ 前排全部是带生态系 label 的阅读 C（26 组池）。
- 「找一篇讲环境保护的阅读，中等难度，最好是近三年的」→ 非空，前排
  环保主题阅读，近三年优先。
- 「2025 浙江卷」「七选五」「全国甲卷 完形」→ 维度硬过滤正确。
- 纯英文/旧查询不回归（"reading C"、空查询、无 label 题组仍可被
  title/summary 命中）。
- 新增单测：tokenize CJK、intent 解析、加权排序 3 组 fixture
  （按 scripts/ 现有 verify 风格接入 verify-ci 或 app 侧测试，选轻的那个）。
- `pnpm -C app run verify:all` 绿（hermetic，禁 git show main:）。

### 明确不做（挂账 follow-up）

- topic label 覆盖率 46% → 回填是内容管线活，另立 cut。
- 思考模式 key 接线（服务端有 key 前端不知道）→ 另立 small cut。
- 难度维度（全库 medium 无区分度）→ 依赖 reading signals join，另立。

---

## 刀② 一个草稿卷（双面收敛最小正解 + 教师版出口）

Branch: `restart-2-one-draft-paper`
Scope: `server/draft-papers/draftPaperStore.mjs`、`server/draft-papers/
draftPaperRoutes.mjs`（或实际路由文件）、
`app/src/features/draft-paper/DraftPaperWorkbench.tsx`、
`app/src/App.tsx`（仅 AI 模式浮动按钮/抽屉挂载分支 + addToBasket 相关行）。
Forbidden: classic 模式的旧抽屉/PaperBlockCanvas/usePaperDraft 本体、
Paper Set 库、domain/schema、PaperSurface、print-renderer/docxRenderer
渲染逻辑本体（只透传参数，不改渲染分支）。

### 改动

1. **服务端提参**（audit-B §2）：`draftPaperStore.mjs:103-105` 的
   `versionType`/`printStyle`/文件名后缀 提为 `exportDraftPaperPdf` 入参
   （默认值保持 student/exam，向后兼容）；print-pdf route 接受
   `versionType`（student|teacher，requiredEnum 风格与
   exportImplementation.mjs:162 一致）。
2. **工作台教师版开关**：`DraftPaperWorkbench.tsx:402-413` 导出区加
   「学生版 / 教师版」切换（默认学生版），下载文件名 `-学生卷/-教师卷`；
   A4 预览随开关切换（预览链路若也写死 student，同步提参）。
3. **AI 模式浮动按钮改接 Draft Paper**（audit-B 方案 A1）：
   `App.tsx:5649-5667` 在 `homeMode==='ai'` 分支：计数读
   `draftPaper.items.length`，点击 `openDraftPaperWorkbench()`；
   AI 模式不再挂载旧抽屉（classic 模式完全不动）。
4. **文案**：AI 模式下与草稿卷相关的字样统一叫「草稿卷」，旧抽屉在
   classic 模式保持原样（不改名、不迁移，退役另立 cut）。

### 验收

- AI 模式：加入草稿卷 → 浮动按钮计数同步 +1 → 点击直达工作台 → 题在。
- 工作台：教师版导出 PDF 含答案/解析，学生版不含（对照同一草稿卷）。
- classic 模式回归：旧抽屉原样可用（学生/教师/DOCX 四出口不回归）。
- 单测/verify：export 参数枚举校验；`pnpm -C app run verify:all` +
  server 侧相关 verify 绿。

### 明确不做（挂账）

- DOCX/讲义版接入 Draft Paper 工作台（server 能力现成，另立 small cut）。
- 每题分值/小节标题/保存题集语义合并 → 独立产品决策（audit-B §4）。
- 旧抽屉/Paper Set 全面退役。

---

## 刀③ 教师版真解析（paper-assets join，第二轮追加 2026-07-03）

Branch: `restart-3-teacher-analysis`
Scope: `server/draft-paper/draftPaperStore.mjs`（注入点）、新增
`server/draft-paper/analysisText.mjs`（降级器）、`server/api.mjs`
`findPaperAssetGroup` 扩展（只加字段不改旧字段）、`server/print-renderer.mjs`
（存根隐藏 + 解析段样式微调）。
Forbidden: **不写 DB**（不回填 questions.explanation——解析是 display 层，
文件层为家，ADR-0008）；不动 publisher/导入管线；不动前端；writing 题型
明确排除（不进 print 逐题流）。

### 改动（勘探报告 docs 化，agent 输出已含 file:line）

1. **止血**：`print-renderer.mjs:79` 加 `isMetaStub()`（`/^paperId=.*assetVersion=/`），
   命中则整个【解析】块不渲染，【答案】保留。
2. **正解**：`analysisText.mjs` 提供 `loadGroupAnalysisTexts(items)`——
   每次导出先按 paperId 缓存 asset（避免每 item 全目录扫），按
   `group.groupType` 选 family 分析文件，逐题降级成纯中文文本：
   - reading: questionFocus + 正答 evidence quote + 错项 trap.explanation
   - cloze: correctFit.reason + distractorGlosses + teachingNote
   - grammar-fill: answer + reason + teachingNote
   - seven-choices: mechanismSignals relation + topicClues
   单题上限 ~600 字符截断（防单题占页）。
3. `buildDraftPrintHtml` 组装时 explanation 为空 → 用 asset 解析文本覆盖；
   asset 缺失/自造题 → 回落 DB → 存根被 1 兜底隐藏。

### 验收（勘探报告 §4 六条全过）

paper-zj-2026-jan 教师版四题型真解析零存根；无 asset 题组不露存根只留答案；
单题 ≤2/3 页；存根正则单测；findPaperAssetGroup 现有调用点回归绿；
缺 writing-analysis 的国家卷（paper-2024-jia）导出不报错。
新 verify 断言接入 verify-ci（hermetic）。

## 刀④ 主线审美打磨（critique 27/40 → 修 P0-1/P1×2/P2/P3×2）

Branch: `restart-4-mainline-polish`
Critique 快照: `.impeccable/critique/2026-07-03T06-01-35Z__app-src-concierge-conciergedesk-tsx.md`
UI 决定权=小川（owner 2026-07-02/03 两次确认）。铁律：**Color-Lock 配色
token 值零改**（只允许作用域内重绑/换绑既有暖值）/ No-Blue / Red-Pen ≤10%。
Scope: `app/src/App.css`（AI 模式作用域段）、`app/src/concierge/*`（Desk/
GroupCard/PaperRow 的 TSX+样式）、`app/src/features/my-space/MySpacePage.*`、
`app/src/features/draft-paper/DraftPaperWorkbench.*`（仅预览缩放+label 文案）。
Forbidden: `:root` 的 token **值**不改（重绑作用域可以）；经典模式视觉零变化；
`shared/papersurface/**`、print/export 样式不碰；conciergeSearch.ts 行为不碰
（那是刀⑤）。

### 改动清单

1. **[P0-1] AI 模式头部去 slate**：`.app-shell.home-mode-ai` 作用域内
   `.ghost-button`（及同链 slate 消费者）重绑暖 token：默认底 `#FAFAF7`、
   边 `#E5E3DC`、字 `#1A1A1A`、hover 底 `#F4F2EC`、active/选中沿用现有
   暖沙+赭石语义。`:root` 不动，经典模式像素级不变。顺带清主线卡片两处
   硬编码 side-stripe（App.css:4740/4774 —— 换成全边框或背景 tint，
   保留原 hex 色相）。
2. **[P1] CTA 层级**：结果卡「加入草稿卷」→ 墨色填充主按钮（`#1A1A1A`
   底/`#FFFDF8` 字/6px 圆角，即 DESIGN.md button-primary）；「已在草稿
   卷中」→ 弱化完成态（✓+muted）；「找类似」保持 ghost；「阅读解析」
   从下划线 a 统一成 ghost button 形态。同排三控件一种语言。
3. **[P1] 占位符对比**：`.concierge-intent-input::placeholder` →
   `#6B645C`（5.73:1）。检查同页其他 placeholder 一并达标。
4. **[P2] 思考模式开关质感**：checkbox `accent-color: #B8323C` + 尺寸
   16px + `:focus-visible` 焦点环 + label 右侧一句浅说明
   「用 AI 理解你的描述，更准但稍慢」。不做全自绘（护 a11y）。
5. **Loading 态**：提交按钮「…」→「取题中…」+ disabled（吸收速赢#5）。
6. **[P3] 个人空间空态引导**：加一句人话 + 「去组一份卷子」动作
   （openDraftPaperWorkbench 已有现成 handler 可调）。
7. **[P3] 移动端 A4 预览 scale-to-fit**：DraftPaperWorkbench 预览容器
   窄屏按宽缩放，不再横向裁切。只动 workbench 显示层 CSS。
8. **文案**：「自动保存」label → 「最近草稿卷」（消歧义）。

### 验收

- AI 模式首屏零 slate（computed style 抽查 6 个头部按钮）；经典模式
  截图对比零变化；desktop+mobile 两档截图走查。
- 结果卡主 CTA 一眼可辨；对比度全部 ≥4.5:1（preview_inspect 实测）。
- verify-concierge-desk.mjs 等既有断言绿（文案变更同步断言，只改字面
  不弱化行为断言）；verify:all 绿。
- 主 agent 浏览器 QA + 截图终审（UI 决定权收口）。

## 刀⑤ 诚实降级（P0-2，基线=main@51542ed 含刀①④）

Branch: `restart-5-honest-fallback`
Scope: `app/src/concierge/conciergeSearch.ts`、`clarificationCopy.ts`、
`ConciergeDesk.tsx`（通知条文案与状态）、`reason.ts`（弱匹配理由措辞）。
Forbidden: server/**、思考模式 LLM 链路本体、刀①的加权/硬过滤行为
（54 断言必须原样绿）、刀④的视觉样式。

### 改动

1. **弱匹配阈值**：本地排序分低于阈值（无 topicLabel/篇位/题型/地区任一
   实质命中，仅泛字段弱命中）→ 该结果标记 weak；全部 weak 或零命中 →
   返回空集，让真空态+起始 chip 呈现。乱码 query（"zzxqwqxyz 12345"）
   必须走到真空态。
2. **诚实文案分级**：通知条三态——精确匹配（现文案）/「没有精确匹配，
   以下是主题相近的题组」（结果全 weak 但仍展示时）/ 真空态（现有
   "没找到匹配"+chip）。weak 结果的推荐理由禁用「命中」措辞，改
   「可能相关」。
3. **阈值校准红线**：刀①验收的全部 query（生态环境/生态主题 C 篇/
   环保自然语言句/2025浙江卷/七选五/reading C）不得受影响——它们都有
   实质维度或 topic 命中，必须保持非 weak。
4. 新增断言（乱码→空集、weak 分级、红线 query 非 weak）进
   `verify-restart1-local-search-intent.mjs` 或新 §，注册保持不变。

### 验收

乱码查询→真空态可达；「随便找找看」类泛词→弱语气标识；刀① 54 断言
+新断言全绿；浏览器实测三态文案各出现一次。

## 流程

每刀：Sonnet DEV subagent（worktree、按本契约）→ 主 agent 收 diff
→ fresh Opus CR subagent 冷读 → 修 Must Fix → verify 绿 → 浏览器 QA
（主 agent）→ squash-merge。刀①先合，刀②rebase 后合（避免
verify-ci.mjs union 冲突教训）。RM 闸：
`node scripts/verify-cut-artifacts.mjs docs/cuts/restart-2026-07-mainline medium`。

## PA Follow-Up Decisions

PA-lite inline（medium、边界清晰、audit-A/B 两份独立 opus 诊断已当过
半个 PA）：正式 PA 跳过，理由记录于此。CR 不降级。
