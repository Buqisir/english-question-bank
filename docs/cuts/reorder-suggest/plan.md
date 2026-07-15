# reorder-suggest（draft-desk 刀E：排序建议消断篇）

- cut size: **medium**; touches schema / data contract / product boundary /
  teaching interpretation: **no**（只增只读建议端点 + 前端安静卡；重排落库
  复用现有整卷 items PATCH；建议语义 owner 已逐裁点拍板）。
- **PA-lite**（降档理由）：方向已由议题2 grilling 六裁点 + 原型
  `docs/cuts/draft-desk/prototype-print-form-v2.html` owner 拍板完成
  （program.md:51-66），符合宪法「原型已 owner 逐裁点拍板的刀 formal PA
  默认降 PA-lite」。CR 复核此降档是否仍成立。

## 目标（owner 拍板约束，不得重开）

草稿卷工作台：当前分页有断篇时，给出**具名排序建议**（「把 X 和 Y 调换
顺序即可消除」），安静常驻卡 + 一键应用 + toast 撤销；**永不自动重排**；
判据随打印形态变（A4 每个页边界都断；A3 同面并排可见不算断）。建议必须
**真值验证过才亮**——候选序真排版一次确认断篇归零才出卡，宁缺勿假
（Super Teacher Boundary：不可信建议最忌讳）。

## 现状锚（侦察已核实，DEV 直接用）

- 断篇判据：`evaluatePageBreakAcrossPages`
  `server/draft-paper/draftPaperStore.mjs:126-137`；建议生成
  `derivePageBreakSuggestions` `:183-199`（吃已排好的 paginatedHtml，
  不自己排版）。
- 排版真源：`renderPaginatedPaper(printHtml)`
  `server/draft-paper/paginationRenderer.mjs:110`（暖实例 ~700-800ms/次）；
  `buildDraftPaginationPrintHtml(draftPaper, …)` `draftPaperStore.mjs:553`
  吃**内存对象不读库** → 无落库 dry-run 可行。
- 顺序持久化：`PATCH /api/draft-papers/:id { items:[{id,pageBreakBefore}] }`
  数组顺序即 order（`updateDraftPaper` `draftPaperStore.mjs:855-872`）；
  前端 `persistItems` `DraftPaperWorkbench.tsx:638-654`。
- 撤销模式：`removedItem` + 8s toast（`deleteItem`/`undoDelete`
  `DraftPaperWorkbench.tsx:751-787`，`.draft-undo-toast`）。
- 打印形态：`draft_papers.print_form`，`normalizePrintForm`
  `draftPaperStore.mjs:354`；**print_form 不进渲染签名**（判据换算便宜，
  verify-print-form 有源码断言，别破坏）。

## 施工契约

### 1. 服务器：候选评估器（唯一实质新逻辑）

`server/draft-paper/` 新增（建议独立文件 `reorderSuggestion.mjs`，从
draftPaperStore 引用纯函数，避免 store 再长胖）：

- `evaluateCandidateOrder(draftPaper, candidateItems, printForm)`：
  内存副本换 items 序 → `buildDraftPaginationPrintHtml` →
  `renderPaginatedPaper` → `applyPaginationDomContract` →
  `derivePageBreakSuggestions` → 返回该序的断篇建议数组。**全程零落库、
  零缓存写入**（不得污染 `draftPaginationCacheKey` 键控的正式缓存）。
- `buildReorderCandidates(items, brokenGroupIds)`：确定性候选集——对每个
  断篇组 B（按卷面顺序取前 2 个）：[与前一组对调, 与后一组对调, 移到
  卷首, 移到卷尾]；去重（与现序相同/彼此相同的候选丢弃）；**总量硬帽
  6**。pageBreakBefore 标志随 item 走，不清除不挪移。
- `proposeReorder(...)` 编排：当前分页（走现有缓存路径）断篇数为 0 →
  返回 null；否则逐候选 dry-run，**首个断篇归零的候选即早退**；无一
  归零 → null（部分改善不亮，v1 收紧档，放宽留后续）。结果
  `{ order: itemId[], move: { kind: 'swap'|'front'|'end', itemId,
  otherItemId? }, brokenGroupId }`。结果按
  `draftPaperId::printForm::分页签名` 键控 LRU（≤8）缓存，签名变即失效。

### 2. API

`GET /api/draft-papers/:id/reorder-suggestion` →
`{ suggestion: {...} | null }`。auth / 用户隔离 / versionType 参数与现有
`GET /:id/pagination` 路由（`draftPaperRoutes.mjs:201-224`）完全同款。
**严禁把评估器塞进 pagination GET 路径**（verify-draft-pagination-perf
预算不得破）。

### 3. 前端（DraftPaperWorkbench.tsx，灰区 display+交互，本 plan 授权范围）

- 拉取策略：分页 fetch 返回且 `pageBreakSuggestions.length > 0` 时后台
  拉建议端点；返回 null 或断篇清零 → 不出卡/撤卡。无 spinner、无占位
  （安静：卡有则现，无则无）。
- 卡：卷级单卡，位置**卷头行之下、纸面之上**（原型 `.sugg.warn` 形态：
  左竖条 + 浅底 + 尾部行动链接）。文案 = 现有断篇 reason（前端已持有的
  `pageBreakSuggestions` 中 brokenGroupId 对应条目）+ 移动句（前端用
  自己的题组标题拼：swap →「把「A」和「B」调换顺序即可消除。」，
  front/end →「把「A」移到卷首/卷尾即可消除。」）+ 行动链接
  「调整顺序 →」。新 class `.draft-reorder-suggestion`，样式进
  DraftPaperWorkbench.css，遵守 DESIGN.md token（动效用现有五档 token）。
- 应用：快照当前 `draftPaper.items` 原数组 → 乐观 setDraftPaper 新序 →
  `persistItems(建议序)`（签名变自动触发重排+建议刷新，天然二次校验）→
  toast「顺序已调整 [撤销]」8s；撤销 = `persistItems(快照)`。复用
  undo-toast 组件模式，新状态位与 `removedItem` 并列。
- 边界：应用后发生任何其他 item 变更（删/增/上下移/换页销切换）→ 立即
  清掉重排撤销 toast（快照已过期，防止回写脏序）。

### 4. Verify（行为断言优先）

新 `scripts/verify-reorder-suggest.mjs`，同刀登记 `scripts/README.md` +
进 `scripts/verify-ci.mjs`（housekeeping guard 会查）：

- 评估器 dry-run 零落库（跑前后 DB 内容一致断言）、不污染正式分页缓存。
- 候选生成确定性 + 硬帽 6 + 与现序相同候选被剔除。
- 门槛断言：仅断篇归零候选出建议；构造 A3 fixture（对调可消断）断言
  建议命中且 move 正确；构造 A4 无解 fixture 断言返回 null（这是正确
  行为不是 bug）。
- 端点 shape + auth 隔离断言（同款路由测法）。
- e2e（headless，沿用 verify-a3-imposition e2e 段模式）：卡渲染 → 点
  「调整顺序」→ PATCH 携新序 → 撤销 → 序还原。

不许动的既有守卫（改动会撞精确断言）：verify-print-form（判据措辞 +
print_form 不进签名）、verify-draft-pagination-cache-trigger（reorder 必
改签名——应用路径依赖它触发重渲）、verify-a3-imposition（缝徽标无损）、
verify-draft-pagination-dom-contract。

## Forbidden

- A3 2-up 拼版 PDF 导出（2026-07-13 owner 拍板取消，判例在案）。
- 改 `evaluatePageBreakAcrossPages` / `derivePageBreakSuggestions` 的判据
  与措辞；改 pageBreakBefore 语义或替 owner 清除已设换页销。
- 自动应用重排（任何形式）；部分改善建议（v1 不做）。
- domain / schema / Adapter / PaperSurface / print·export styling；新增
  DB 列；pagination GET 路径加同步评估。
- 建议计算不设后台轮询/定时器——只由分页 fetch 结果驱动。

## 验证命令（流水线 verifyCmds 照抄）

1. `node scripts/verify-reorder-suggest.mjs`
2. `node scripts/verify-print-form.mjs`
3. `node scripts/verify-draft-pagination-cache-trigger.mjs`
4. `node scripts/verify-a3-imposition.mjs`
5. `pnpm -C app exec tsc -b`
6. `pnpm -C app run verify:all`

## 裁决点清单

- [x] plan 拍定并 commit（本文件；方向免议——原型拍板在案）
- [ ] 流水线收口：CR verdict + MF 处置（主代理）
- [ ] merge → main CI 绿（主代理）
- [ ] owner DP-3（生产实点：A3 断篇卷看建议→应用→撤销）
