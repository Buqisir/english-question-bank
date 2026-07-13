# CR — print-form（fresh Opus 冷读，reviewer ≠ implementer）

Verdict: **APPROVE**（0 Must Fix / 3 Should Watch）
Baseline: `github/main` @ edcf777；分支 `print-form` @ c78659a（impl a659baa + 类型收正 c78659a）。

## Changed Scope（对照 diff 文件表核实）

- 运行时：`draftPaperStore.mjs`（判据/衍生纯函数 + 懒 ALTER + 记住上次 + 分页透传）、
  `draftPaperRoutes.mjs`（+1 additive 字段）、`DraftPaperWorkbench.tsx/.css`（卷头切换 +
  计数徽标随形态 + 安静建议徽标）、`draftPapers.ts`（service 类型 + printForm PATCH 入口）。
- 契约：`questionBank.ts` = **恰好**收口追授两处（`DraftPaperSummary.printForm` +
  `DraftPrintForm` 类型；`DraftPaper` 摘除死字段 `pageBreakSuggestions`），无越界。
- verify：新 `verify-print-form.mjs`（注册进 verify-ci.mjs + README）；c8-print-ready-gate /
  c8-render-model / error-copy-mainline / visual-unify 四本随字段增删诚实改断言。
- Forbidden 全部未触：`server/search/**`、`paper-browse/**`、`verify-similar/paper-browse`、
  `paginationRenderer/chromiumPool/paginationDomContract`、PDF/A3 拼版、生产库 —— diff 文件表零命中。

## PA-lite 降档复核：成立

纯追加列（懒 ALTER，student_label 先例可逆）+ additive API 字段 + 删死字段（零消费者，
grep 实证）+ 判据语义 owner 已拍板（议题2 六裁点 + 07-12 必答题）。未碰 print/PDF 渲染器或
DOM 契约本体 → 非 L4。runtime + user-visible 由本 CR + DP-2 QA 覆盖。降档理由已入 plan 头。

## 必查点核实

1. **A3 同面判据**（`evaluatePageBreakAcrossPages`）：数学正确。even→断 / odd→不断，
   逐 case 对齐 plan：p1/p3 奇→不断（同面并排）；p2(%4==2)→断「翻面」；p4(%4==0)→断「换张」；
   p5(%4==1)→不断；p6→翻面；p8→换张。偶数模4 必为0或2，奇数必为1或3，分支穷尽无漏。
   verify-print-form ②表 10 断言全覆盖且会因数学退化而 FAIL（真断言）。
2. **建议衍生**（`derivePageBreakSuggestions`/`extractGroupPageSpans`）：正确。
   - `.preview-page` 容器扫描 + 相邻起点切片 = 精确分页，已对照 paginationDomContract.mjs
     冻结契约（该类名 + 顶层兄弟结构确认）。
   - `<template>…</template>` 先剥离 → paged.js inert master copy（同 data-group-id，契约头注释
     确认）不会误判成真页。fixture 专门放了一个 template 副本断言其被排除，会 FAIL 若剥离失效。
   - 一组多断点只报第一个真断（`break`）：DEV 自报的简化。可接受——建议点击触发 pageBreakBefore
     PATCH → 签名变化 → 真重渲 → 该组不再跨页，多断组逐次收敛；单组跨 3+ 页本身罕见。
   - itemsByGroupId 只取 `!groupMissing`，与契约 data-group-id 出处同源；无 itemId 不入建议。
3. **print_form 不进签名**：源码断言（`draftPaperPaginationSignature.toString()` 无 printForm）
   + 行为断言（加/不加 printForm 字段签名相等）双证；缓存命中/未命中两路都从 paginatedHtml
   便宜重算 suggestions，缓存零失效。成立。
4. **记住上次**：`mostRecentPrintForm` 取该 user `status='active'` 且 `updated_at DESC LIMIT 1`；
   空库→undefined→'a4'；读取在 INSERT 之前，取的是上一份而非自身；NULL→normalize 'a4'。
   verify 覆盖首建默认 a4 + 切 a3 后新建继承 a3。同步 SQLite 无并发窗口。
5. **懒 ALTER 只读回退**：`ensurePrintFormColumn` 与 `ensureStudentLabelColumn` 结构逐字一致
   （PRAGMA 探列→ready；ALTER；catch readonly→短命 writable 连接 re-check→ALTER→finally close）。
   回退完整。
6. **类型收正**：printForm 并入 domain 真源；死字段 `pageBreakSuggestions` 全库仅剩注释/新
   pagination 响应字段/verify 断言，无别处消费；`WithForm` 交叉类型零残留（grep 实证）。

## Verification Evidence（本 CR 亲跑，非抄报告）

- `node scripts/verify-print-form.mjs` → **30 passed, 0 failed**
- `node scripts/verify-c8-print-ready-gate.mjs` → **31 passed, 0 failed**（启发式退役断言：
  buildPageBreakSuggestions/estimateEnglishWords 函数消失 + 600/700/1000 魔法数字零残留 +
  真判据函数在场——诚实换向，非放水）
- `node scripts/verify-c8-draft-paper-render-model.mjs` → **37 passed, 0 failed**（PO-1 从
  「NOT rendered」诚实反转为「安静徽标在场 + 复用现有 PATCH + 预览 iframe 仍无标注」）
- verify:all + tsc 由主代理亲跑全绿（1499 PASS / exit 0），本 CR 不复跑。

## Findings

### Must Fix
无。

### Should Watch（不阻断本刀）
- **SW-1 建议衍生对契约 HTML 是字符串正则耦合，且失配时静默降级**：
  `extractGroupPageSpans` 靠 `preview-page` 类名正则 + `<template>` 剥离，未走 DOM parse。
  对当前冻结契约正确，但契约若改页容器类名或不再用 `<template>` 包 master copy，衍生会**静默**
  返回空/错建议（不像 applyPaginationDomContract 那样 fail-loud）。契约在 Forbidden 且本刀不动，
  建议在 watch-ledger 记一条「契约-衍生耦合」，契约将来变更时同步复查此函数。
- **SW-2 多断点单组只报第一断**：DEV 自报简化，逐次 PATCH 收敛，非阻断（见必查点2）。
- **SW-3 切换后建议刷新依赖 PATCH 先于 400ms debounce 分页 GET 落库**：
  setPrintForm 立即发 PATCH，分页 effect 延 400ms 再取，服务端按 DB print_form 衍生。本地/常态
  下 PATCH 远早于 400ms → 无实感；PATCH 失败会乐观回滚 printForm 重触 effect 自愈。仅极端慢
  PATCH（>400ms 且成功）下有一次瞬态旧形态建议，非阻断。DP-2 实卷 QA 可顺带观察。

## Self-Review Blind Spots
- `verify-draft-workbench-visual-unify.mjs` 的 `#ffffff` 白名单行号从 {188,294,486} 重钉为
  {188,310,524}。这是脆弱的行号硬编码，我未逐行数 CSS 验证新行号精确落点；仅确认脚本绿 +
  新增 CSS 全用 token（无新 hex 字面量，color-mix/var 引用），故白名单只是位移非放水。
- 未跑真浏览器：卷头切换手感、徽标锚定位置、A3 实卷对折断篇观感属 DP-2/DP-3，不在本 CR 范围。

## Failure / Attack Angle
最可能的隐患不是判据数学（已穷尽验证），而是 **SW-1 的静默耦合**：未来某刀若微调
paginationDomContract 的输出外壳，衍生函数不会报错、只会安静地不再产建议，教师侧表现为
「跨页断篇建议无故消失」，且无红灯提示。缓解现状：契约本身 fail-loud 于结构失配 + 本刀
fixture 锁定了 `preview-page`/`data-group-id`/`<template>` 三点契约形状，任何契约面改动都会
先撞碎其自有 verify。真攻击面收敛为「改契约的人忘了同查此衍生函数」——靠 watch-ledger 兜。

## Residual Risk
低。additive schema 可逆、判据纯函数全表覆盖、死字段删除零消费者已证、Forbidden 零触、
收口追授精确。剩余风险落在 DP-2 浏览器 QA（视觉/手感）与 SW-1 的长期契约耦合观察。

## Recommendation
**APPROVE** — 无 Must Fix。SW-1..3 记录不阻断；建议 SW-1 入 watch-ledger。收口串行后
（engine-rewire 已合，rebase 已完成）可 merge，盯 main CI。
