# CR — similar-passages-entry（E6）

- reviewer: fresh CR（冷读，独立会话，Opus）
- 审 diff: `git diff main...wt-similar-passages-entry`（worktree HEAD，无未提交残留）
- review level: medium（契约面 + 解部署门主体；对 verify-script 自改与三方类型对齐做了深读）

## Verdict: **APPROVE**（0 Must Fix / 4 Should Watch）

可合并。核心风险（domain 三方对齐、深链自愈、rail 联合态穷尽、verify 脚本无过度放松）
逐条实证通过。四条 SW 全是纯展示层的轻微文案/死码，非阻断。

---

## 复核结论（审查重点逐项）

### PA-lite 降档 — 成立
server/** 零改动（diff 确认无 forbidden 触点）；入口三场景形态走
owner 逐场景拍板原型（2026-07-15）；端点契约 E5 已 formal PA + fresh CR。
本刀无新后端契约、无新评分语义、无新产品面决策——降档理由仍立。

### DEV 自改的三个 verify 脚本 — 收紧，非放松
- `verify-classic-retire-2.mjs` / `verify-analysis-layering.mjs`：useState 计数
  1→3 仍是**精确等值**（任何未来新增 state 照样红）。且 classic-retire-2 额外
  按声明文本各钉一条（`similarPassagesOpen` / `similarPassagesRequest`）——比单纯
  改数字更严。实际 QuestionGroupDetailView 三处 useState（figuresState +
  两处 panel state）与计数吻合。
- `verify-classic-retire-2.mjs` 正则窗口 600→900：因每个 `<ConciergePaperRow/>`
  新增 5 个 prop 撑长（实测 ~775/816 字符），非贪婪 `{0,900}?\/>` 到自闭合
  `/>` 即止；断言仍锁"恰好 2 个渲染点"。窗口放宽是必要对齐，无误配风险。
- `verify-concierge-desk.mjs`：E3 的 `配相似 </a>` 深链断言改写为
  `相似篇章 </button>` toggle + `similarEligible`/`SIMILAR_SUPPORTED_GROUP_TYPES`
  门控——对齐本刀拍板行为，未丢关键约束。

### domain 类型三方对齐 — 一致
`questionBank.ts` ↔ `server/search/similarQuestions.mjs` ↔ reasons-chips-table.md：
- kind 联合 `topic-match|position-slot|authentic-source|facet-hit|verb-vector`
  与 server 全部 emit 点（L380/388/394/403/534/553/560/574/606）精确同集，v1 五值
  已全删。
- `SimilarPassageResult` = findSimilarPassages 返回逐字对齐（groupId/paperId
  string|null/title/sourceLabel/score/reasons；**无** matchedQuestionIds）。
- `SimilarPassagesSeedProfile` 仅 groupType+topicLabels（**无** facets，与 server
  L521 一致）。`notice: string|null`（L448/524）对齐。
- `SimilarQuestionsResponse`（小题）未结构性改动，仍含 matchedQuestionIds +
  seedProfile.facets，与 server L823-855 一致，无残留 bonus 字段。

### 深链自愈 — 完整，无 400 死路
PaperBrowsePage 深链 effect（L765-794）：四题型 gate 后按
`SIMILAR_PASSAGES_MODE_GROUP_TYPES`（cloze/sevenChoices）分流 →
`fetchSimilarPassages(groupId)`，reading/grammarFill 仍走 `/api/similar-questions`。
旧 `similar=1` 链接因此天然改指 passages，不再命中已下线的小题 400。
QA 脚本场景 ⑤ 对 cloze legacy 链断言 rail 头含「相似篇章」，实证自愈。
reading/grammarFill 小题路径零改动。

### rail 联合态 — 穷尽
`SimilarRailData` discriminated union（`kind: 'questions' | 'passages'`），
`toUnifiedResults` 两支都覆盖（passages 补 `matchedQuestionIds: []`），
`notice` 仅 passages 支读取；render 无遗漏分支。

### 新文案 — 无 v1 残余概念
`SIMILAR_RECIPE_SUMMARY` v2 整表：cloze/sevenChoices「同话题硬门槛→真题优先→
年份新优先」（正确略去仅 reading 计分的篇位）、reading/grammarFill 换 v2 小题
配方——无密度/词数/词性等 v1 残念。静态残留独立 grep 复核：tracked app/src
零 `facet-density|pos-density|topic-diff|'secondary'` 作 kind 用法（与 QA ⑥ 同结论）。

### scope / Forbidden — 守住
diff 无 server/shared.papersurface/schemas/*Adapter/grammarFillFacetRegistry 触点；
唯一契约文件 questionBank.ts 改动全在解锁的 similar 类型收账范围内；场景 2、
详情页重设计未染指。移除的 `onOpenPaperBrowseSimilar` / `openPaperBrowseSimilarFromDetail`
无残留引用；App.tsx 新传 `questionGroupById` / `onAddSimilarToBasket` 符号均在作用域内；
`<ConciergeGroupCard>` 唯一渲染点（ConciergePaperRow）已补全新必填 props。

---

## Should Watch（非阻断）

- **SW-1｜死码残留**：`app/src/concierge/paperSurfaceHref.ts:66`
  `buildPaperBrowseSimilarHref` 在 E3 深链退役后**已无任何调用方**。plan §4
  预留「若仍被讲评深链兜底引用则保留模块」——现已不被引用，宜删。无害，留着
  只是死导出。

- **SW-2｜passages 模式 seed-line 带题号**：
  `SimilarQuestionsRailView.tsx:116-117,132` 对 cloze/sevenChoices（篇章相似，
  组级）仍渲染「种子：<groupTitle · 第N题>」。篇章相似不绑单题，显示具体题号
  轻微误导。纯文案；owner 若在意可对 passages 模式只显组名。

- **SW-3｜诚实空态与池子条并列冗余**：`SimilarPassagesPanel.tsx` 的
  `.similar-pool-note` 在 ready 态恒渲染，故 notice（种子零话题标签）场景下会
  同时出现「该篇暂无话题标签…」+「库内同话题还剩 0 组」。rail view 同款行为
  （两面一致）。轻微噪音，非错误。

- **SW-4｜面板配方副标对非 reading 轻微夸大**：
  `SIMILAR_PASSAGES_RECIPE_SUMMARY = '同话题硬门槛 · 池内按篇位/真题优先排序'`
  四题型共用；篇位仅 reading 计分，cloze/sevenChoices/grammarFill 的「按篇位」
  属虚述（DEV 注释已自认该取舍）。纯展示副标；owner 若在意可对非 reading 去掉
  篇位一词。

---

## 未由本 CR 复跑（依 裁2 主代理亲跑）

- `pnpm -C app run typecheck` + `verify:all`：类型必填 props 缺失、契约 hard-guard
  由此覆盖，本 CR 未重跑（按任务约定只复核未证实项）。
- DP-2 行为脚本 6 项：脚本经读为真实浏览器验证（worktree 自持 sqlite + 真数据
  fixture，delta 断言抗重复运行），非 stub；建议 merge 前主代理跑一遍取原始退出码。

## SW 处置（PM，2026-07-15 当场收）

- SW-1 ✅ `buildPaperBrowseSimilarHref` 死码删除（+verify-paper-browse 旧注释、scripts/README 两行旧描述一并收）。
- SW-2 ✅ 篇章模式种子去题号——两处种子构造点（CTA 点击 / 深链 effect）`questionNo` 置 null。
- SW-3 不收：notice + 池子条双显两面一致，诚实冗余，不值一行分支。
- SW-4 ✅ 面板副标改单源 helper `similarPassagesRecipeSummary(groupType)`，篇位只在 reading 文案出现。
- 收账后复验：verify:all 78/1/0 exit 0 + DP-2 20 checks exit 0（主代理亲跑）。

## DP-3 现场打回与收账（2026-07-15，owner 旁观小川亲驱 Chrome）

- **打回**：搜索卡「相似篇章」面板 DOM 展开但人眼不可见——面板作为
  `.concierge-group-row`（横向 flex）第三子项被挤进右列，再被
  `position:absolute` 的 hover 动作浮层盖住。DP-2 的 DOM 断言（waitFor
  存在）对此全绿，正是"合成断言看得见、人眼看不见"的盲区；详情页/讲评
  rail 两处挂载无此问题。
- **修**：身体+动作条包进 `.concierge-group-row-line`（浮层锚到行内），
  row 转纵向，面板全宽落行下（App.css + ConciergeGroupCard.tsx）。
- **DP-2 收账**：③ 新增两条几何回归锚（面板宽 >80% 卡宽、面板位于动作
  行下方）；修 DEV 原稿 rootDir 硬编码已删 worktree 绝对路径（违反可
  重跑纪律，主树跑 MODULE_NOT_FOUND 实证）→ 改脚本自身位置推导。
- **复验**：主树 build exit 0 + verify:all 79/0/0 exit 0 + DP-2 22 checks
  exit 0（真实退出码，不经管道）。
- 现场过点：①详情页面板富态（截图）②完形讲评 CTA 改指篇章（含分层制
  活证：同篇位模拟题排在相邻篇位真题之上）③切卡自动收起 ④加入+toast+
  计数+1 ⑤similar=1 冷刷新自愈 + 语法填空空态诚实。
