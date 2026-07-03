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

## 刀④ 主线审美打磨（critique 综合后补契约）

评估 A/B 双路已跑，综合报告与打磨清单见 critique 快照
（.impeccable/critique/）。UI 决定权=小川（owner 2026-07-02/03 两次确认，
含审美 skill 全权）。铁律：Color-Lock 配色零改 / No-Blue / Red-Pen ≤10%。

## 流程

每刀：Sonnet DEV subagent（worktree、按本契约）→ 主 agent 收 diff
→ fresh Opus CR subagent 冷读 → 修 Must Fix → verify 绿 → 浏览器 QA
（主 agent）→ squash-merge。刀①先合，刀②rebase 后合（避免
verify-ci.mjs union 冲突教训）。RM 闸：
`node scripts/verify-cut-artifacts.mjs docs/cuts/restart-2026-07-mainline medium`。

## PA Follow-Up Decisions

PA-lite inline（medium、边界清晰、audit-A/B 两份独立 opus 诊断已当过
半个 PA）：正式 PA 跳过，理由记录于此。CR 不降级。
