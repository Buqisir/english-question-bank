# CR — reorder-suggest（排序建议消断篇）

Fresh CR，冷读，未参与实现。基线 `b0eb101`（plan commit）→ `6755d94`（impl+verify）。
逐条核对硬契约 / Forbidden / 验证覆盖 / scope。DEV 报告仅作输入。

## Verdict: APPROVE_WITH_MUST_FIX

实现主干干净：评估器纯函数独立成文件、依赖注入、零落库、GET 端点与 pagination 路由字节同款
auth/versionType/错误处理、前端安静卡 + 乐观应用 + 撤销快照按契约拉齐、Forbidden 零越界。
Phase A 16 断言全绿，evaluator 真值门槛（a3 可修 swap→归零并独立复验、a4 内在断→null）证得扎实。

但有一处 **Must Fix**：null 裁决从不进缓存，热路径上每次编辑都重跑最多 6 次真渲染，
直接违反 plan「结果按签名键控 LRU 缓存」契约。verify 只单次调用端点，未覆盖缓存命中，故漏网。

---

## Must Fix

### MF-1 — null 裁决缓存失效，热路径重复真渲染（draftPaperStore.mjs:301-307）

`reorderSuggestionCacheGet` 用 `if (!entry) return undefined` 判空。但 `proposeReorder`
在「无候选能归零」时返回 `null`，`reorderSuggestionCacheSet(cacheKey, null)` 存的就是 `null`。
下次取：`reorderSuggestionCache.get(key)` 返回 `null` → `!null === true` → 返回 `undefined`
→ 上游 `if (cached !== undefined)` 不成立 → 判为 miss → **重跑整个 dry-run（最多 6 次
~700-800ms 真 Chromium 渲染，约 5s）**。

- 影响面正好是**最贵又最常见**的路径：A4 卷任一无法靠重排消除的断篇（A4 每个边界都断，多数
  重排凑不齐归零）→ 永远 null → 每次调用全量重算。前端 effect 依赖 `pageBreakSuggestions`
  （每次 pagination fetch 都是新数组引用），**每次编辑都会重新拉一次**建议端点 → 服务端每次
  从头跑 6 次渲染。plan 明说「Zero-breakage or a cache hit both return fast with no dry-run
  at all」（store 注释自己写的）——null 这条从没 fast 过。
- 非 null（真有建议）的对象是 truthy，缓存正常；只有 null 漏缓存。
- 为什么 verify 没抓到：Phase B 只 GET 一次 reorder-suggestion，从不测第二次命中；且该 fixture
  返回 null，恰好走的就是这条漏缓存分支，但因只调一次而看不出。
- 修法（一行级）：改用 key 存在性判定，例如
  `if (!reorderSuggestionCache.has(key)) return undefined` 后再 `get`；上游 `cached !== undefined`
  逻辑不变即可正确返回缓存的 `null`。建议 verify 补一条「同签名第二次 GET 命中缓存（null 也命中）」
  断言防回归。

证据：`server/draft-paper/draftPaperStore.mjs:301-307`（get）/ `:308-315`（set）/ `:1280`
（`if (cached !== undefined)`）/ `:1290`（存 null）。

---

## Should Watch

### SW-1 — e2e 应用/撤销真点未实际执行（verify-reorder-suggest.mjs:441-485）

plan §4 明列 e2e：「卡渲染 → 点『调整顺序』→ PATCH 携新序 → 撤销 → 序还原」。脚本写了这段，
但整段裹在 `if (cardAppeared)` 逃生舱里。**本 CR 两次跑该 fixture 均无卡**（日志：「no
reorder-suggestion card rendered … click-flow assertions skipped」）——10 个等长 reading 组在
A4 下，任何重排都消不掉溢出断篇，proposeReorder 结构性返回 null，卡永不出现。于是应用/撤销这条
**门面交互从未被已执行的测试证过**，只有静态读码覆盖。Phase A 已充分证明 evaluator 真值门槛，
前端 apply/undo 逻辑本身直白；owner DP-3（生产实点 A3 断篇卷→看建议→应用→撤销）是真正兜底。
建议：把 Phase B fixture 改成能稳定出卡的形态（A3 模式，或让某组尺寸差异可被 swap 消除），
让 ⑦ 段真正跑起来，别让它成死代码。

### SW-2 — 前端每次 pagination 结果都重拉建议（DraftPaperWorkbench.tsx:428-445）

reorder effect 依赖 `pageBreakSuggestions`，而它每次 pagination fetch 都 `setPageBreakSuggestions`
成新数组引用（即便内容相同）→ effect 每次编辑都重新 fetch 建议端点。MF-1 修好后服务端会命中缓存
（含 null），代价可控；但客户端仍每次编辑发一次请求。安静无 spinner、requestId 有防串，可接受，
留观即可，不必现在动。

### SW-3 — PA-lite 降档 + 新 UI 元素的 owner 确认

plan 以「议题2 grilling 六裁点 + print-form-v2 原型 owner 拍板」为由降 PA-lite。原型拍的是
打印形态判据；本刀的**安静卡视觉 + 应用/撤销交互**是在其上新长出来的 UI。降档在方向层面成立
（重排语义、真值门槛、宁缺勿假都已逐裁点定），但卡的形态/文案/应用手感属新面，交由 owner DP-3
实点确认。非阻塞，登记在案。

---

## 已核验成立（不构成问题，留痕）

- **Forbidden 零越界**：未碰 `evaluatePageBreakAcrossPages`/`derivePageBreakSuggestions` 判据与
  措辞（diff 仅在 store :283、:1259 处新增，判据函数 82-210 行原样）；未改 pageBreakBefore 语义；
  无自动应用（apply 仅用户点击触发）；无部分改善（`if (suggestions.length === 0)` 严格只放归零）；
  无 domain/schema/新 DB 列（draftPapers.ts 只加本地 DTO 类型，非 domain）；**pagination GET 路径
  未加同步评估**——reorder 是独立路由+独立 store 方法，仅复用 pagination 缓存读，
  verify-draft-pagination-perf 预算不受影响；无后台轮询/定时器（effect 由 pagination 结果驱动，
  8s toast setTimeout 是撤销自消，同 removedItem 既有模式）。
- **零落库 / 不污染正式缓存**：`evaluateCandidateOrder` 全程内存副本 `{...draftPaper, items}`，
  从不调 `draftPaginationCacheSet`，`buildDraftPaginationPrintHtml` 只读内存对象。Phase B ③④
  实测：GET 前后 draft_papers/draft_paper_items 行快照字节一致；后续 pagination GET 仍 `reused:true`
  且 paginatedHtml 字节一致。
- **候选生成确定性 / 硬帽 6 / 去重 / 只取前 2 断组按当前位序**：Phase A ① 全绿；pageBreakBefore
  随 item splice 迁移不清除（① 断言 i3 flag 存活）。
- **端点契约同款**：reorder 路由 auth（`resolveDataUserId`）/ versionType（`versionTypeFromQuery`
  400 路径）/ 错误（`sendDraftMutationError`）与 pagination 路由逐行对齐；Phase B ⑥ 未知 id 404
  「Draft paper not found」parity 实测。
- **缓存键含 printForm 正确**：签名不含 printForm（判据换算便宜，既有契约），reorder 键
  `id::printForm::签名` 显式补上——printForm 切换裁决会变，键必须区分，成立。versionType 已在签名内，
  student/teacher 不串。
- **前端撤销边界**：moveItem/handleDrop/togglePageBreak/deleteItem/undoDelete 均首行
  `clearReorderUndo()`，快照过期即清，防回写脏序。快照取旧 items 引用（React 不可变，安全）。
- **守卫未被误伤**：verify-print-form / cache-trigger / a3-imposition / dom-contract 均未动其源；
  verify-draft-workbench-visual-unify 仅因 CSS +42 行顺移 #ffffff 白名单行号（440/697，无新 hex），
  本 CR 实跑 25 passed；tsc -b 通过；cache-trigger 14 passed。

## 亲跑记录

- `node scripts/verify-reorder-suggest.mjs` → **23 passed, 0 failed**（首跑因我上一次中断残留占用
  9898 端口误红，清端口后复跑纯绿）；其中 Phase B ⑦ 因本 fixture 无卡跳过（见 SW-1）。
- `node scripts/verify-draft-workbench-visual-unify.mjs` → 25 passed, 0 failed。
- `node scripts/verify-draft-pagination-cache-trigger.mjs` → 14 passed, 0 failed。
- `pnpm -C app exec tsc -b` → EXIT 0。
