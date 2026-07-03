# cr-2.md — 刀② 一个草稿卷（双面收敛 + 教师版出口）CR 冷读

Branch: `restart-2-one-draft-paper` (github, a253cf8) vs main 253581e
Reviewer: 阿澈-style fresh Opus CR (did not implement). Level: L4 (export/print/PDF path).

## Changed Scope

9 files, +149/−57. All inside plan ② allowed set:
- `server/draft-paper/draftPaperRoutes.mjs`, `draftPaperStore.mjs` — versionType 提参 + 枚举校验。
- `app/src/features/draft-paper/DraftPaperWorkbench.tsx` (+ .css) — 学生/教师切换 + refetch。
- `app/src/services/draftPapers.ts` — fetchDraftPaper / downloadDraftPaperPdf 带 versionType。
- `app/src/App.tsx` (+ .css) — 删 aiBasketDrawerOpen 死状态 + AI 浮动按钮改接 openDraftPaperWorkbench，旧抽屉 aside 改 classic-only。
- `scripts/verify-concierge-desk.mjs`, `verify-c8-draft-paper-render-model.mjs` — 断言随实现更新。

Forbidden scope clean（grep 确认）：print-renderer.mjs / docxRenderer.mjs / domain / schema / PaperSurface / PaperBlockCanvas / usePaperDraft / paper-set 均未触碰。渲染分支只透传参数（`buildPrintHtml` 的 `isTeacher` 门是既有逻辑，未改）。

## Findings

### Must Fix
无。核心正确性、答案泄漏、枚举校验、向后兼容均通过独立复核。

### Should Watch

1. **教师版预览在编辑后静默回退到学生版（不泄答案，方向安全）。**
   `versionType` 切换 → refetch printHtml（`DraftPaperWorkbench.tsx:151-164`）。但所有编辑路径
   （`persistItems` :194、rename :212、remove/restore :244/:281）用的是 `updateDraftPaper` /
   `restoreDraftPaperItem` 的服务端响应，服务端 store 这些 endpoint 一律 `getDraftPaper(db, id)`
   = 默认 `versionType='student'`（store :319/:425/:452/:515 全是 student）。
   后果：老师选「教师版」后，只要增删/改标题/拖题，`draftPaper.printHtml` 被学生版覆盖，
   **A4 预览 + 浏览器打印静默变回学生版**，而切换按钮仍高亮「教师版」。
   缓解：**PDF 下载（真正交付物）不受影响**——`downloadDraftPaperPdf(id, versionType)` 单独把
   versionType 传服务端，导出的 PDF 仍是教师版。所以是「预览骗人」而非「导出错版」，
   且回退方向是 teacher→student（安全方向，不会把答案漏进学生视图）。
   不列 Must Fix 理由：无答案泄漏、交付物正确、razor（本刀是「一个草稿卷最小正解」）。
   建议挂账：编辑后若 versionType==='teacher' 需重跑 refetch，或让编辑响应带 versionType。

2. **「保存到个人空间」始终学生版（Blind Spot #2，已核，可挂账）。**
   `saveToMySpace` → `saveDraftPaperToMySpace` → server `exportDraftPaperPdf(id, {preferRecent:true})`
   无 versionType = 学生版。UI 上 dialog 文件名输入框预填 `-学生卷.pdf`（:310，可见可编辑），
   与实际内容一致——不存在「文件名说教师版、内容却学生版」的误导。老师在「教师版」态点保存
   会存下学生版，但这是独立的「保存到个人空间」入口（不是版本化的「下载 PDF」按钮），
   文件名已明示学生卷。不误导用户、无泄漏 → 挂账合规，与 plan「明确不做」精神一致。

3. **draft `/print-html` 路由的 versionType 接线当前无前端调用。**
   `draftPaperRoutes.mjs` 给 `GET /:id/print-html` 加了 versionType（从 query 读），但前端无 caller
   （workbench 浏览器打印走内存 `draftPaper.printHtml`，classic 的 print-html 是另一个
   `/api/exports/print-html`）。接线本身正确、向后兼容、无害，只是 dead-ish。不阻塞。

## Self-Review Blind Spots（DEV 自报逐条裁决）

1. **删「收起草稿卷」断言 — 裁决：正确，不是弱化 live guard。**
   该 wording 是被移除的 AI 抽屉关闭按钮/backdrop 的 aria-label（plan §3「AI 模式不再挂载旧抽屉」
   要求移除）。App.tsx 现 0 处「收起草稿卷」（已验）。同 Test 14 保留的
   「加入草稿卷 present」(4 处仍在)、`aria-label="草稿卷" present`(1 处仍在) 两条断言仍运行且真。
   删除是随实现收敛，非绕过。

2. **保存到个人空间始终学生版 — 裁决：挂账合规。** 见 Should Watch #2，入口分离清晰、文件名明示，
   不误导 → 非 Must Fix。

3. **删 aiBasketDrawerOpen 死状态 + 旧抽屉改 classic-only — 裁决：classic 零回归，已 grep 全 caller。**
   `aiBasketDrawerOpen` 全仓 0 残留。`basket` 仍 56 处引用，全部落在 classic-only aside
   (`homeMode==='classic'` 包裹 :5166→:5636) 内或 PI 流；AI 模式下这些 `basket.length===0` 禁用的
   导出按钮不渲染。App.tsx 既有 `versionType` 态（来自 hook，main 上已 10 处）与 workbench 局部
   `versionType` 无碰撞，diff 未触碰它。tsc `--noEmit` EXIT 0。

4. **导出缓存签名纳入 versionType — 裁决：正确，缓存不串版本。**
   `draftPaperPrintSignature(draftPaper, versionType)` 把 versionType 写进签名（store :171-176），
   `exportDraftPaperPdf` 用 `normalizedVersionType` 算签名并比对 `recentDraftPdfExports`
   （:562-574）。学生版缓存签名 ≠ 教师版签名 → 不会 preferRecent 命中错版。且 mySpace 的
   preferRecent 路径默认 student，签名同为 student，自洽。

## Verification Evidence（独立重跑，非抄 DEV）

- `node scripts/verify-c8-draft-paper-render-model.mjs` → **31 passed, 0 failed**。
  更新的断言 `const html = buildDraftPrintHtml(draftPaper, { versionType: normalizedVersionType })`
  精确匹配 store 新写法——不是放松，是随实现同步（旧断言匹配无参调用，现真代码带参，
  断言若不改会 fail，故必须改，改后仍钉死具体形状）。
- `node scripts/verify-concierge-desk.mjs` → **229 passed, 0 failed**。
- `pnpm -C app run verify:all`（= verify-ci.mjs）→ **PASS 55 / SKIP 1 / FAIL 0**。
  唯一 SKIP 是 off-repo fixture (`verify-i16a`)，与本刀无关。
- `npx tsc --noEmit`（app）→ EXIT 0。verify-ci 亦含 `app build/typecheck`。
- 两个改动的 verify 脚本均在 `scripts/verify-ci.mjs`（:21/:23）注册——真门会跑，非手跑假绿。

## Failure / Attack Angle

- **最高级风险：学生版泄答案。** 已堵死。`print-renderer.mjs:34,77-84,106-108` 的答案/解析块
  全在 `isTeacher = versionType === 'teacher'` 门后；student 只渲染 stem+options。store
  `buildDraftPaperExportInput` 把 versionType 归一为 `teacher? 'teacher':'student'`
  （非 teacher 一律 student，无第三态旁路），全链 student→无答案、teacher→有答案。无泄漏。
- **print-pdf 从无 body 改读 JSON body 的破坏面。** `readJsonRouteBody` 空 body resolve `{}`
  （router/index.mjs:49），`input.versionType===undefined → 'student'`。唯一前端 caller
  `downloadDraftPaperPdf` 现带 body；mySpace 走 store 直调不经路由。旧无 body POST 也安全默认 student。
  非法值走 `requiredEnum` → 400。枚举校验风格与 exportImplementation.mjs:162 一致。
- **快速切换竞态。** refetch effect 用 `cancelled` cleanup（:158-160），React 先跑 cleanup 再跑
  下个 effect，被取代的 stale fetch 结果被丢——不会把旧版本 HTML 落到新版本状态。
- **残留旁路：** 编辑后教师预览回退学生版（Should Watch #1）——回退方向安全（不漏答案），
  但会误导老师以为预览=将导出的版本。这是本刀最真实的体验缺陷。

## Residual Risk

- 低。核心导出/PDF 正确且有 c8 verify 覆盖 render model；答案门是既有逻辑未改。
- 体验残留：教师预览编辑后回退（SW#1）、保存到个人空间只学生版（SW#2）——均不泄漏、
  不错导出，属挂账级。
- **浏览器 QA 必做（主 agent）：** ①AI 模式加入草稿卷→浮动按钮计数+1→点击直达工作台；
  ②同一草稿卷教师版 PDF 含答案/解析、学生版不含；③classic 旧抽屉四出口不回归；
  ④教师版切换后编辑一题，观察预览是否回退（确认 SW#1 的实际影响面，供是否即刻修的决策）。

## Recommendation

**APPROVE**（no Must Fix）。

diff 正确、在范围内、答案门无泄漏、枚举校验与缓存签名到位、forbidden scope 干净、
verify 独立重跑全绿且真门注册。两条 Should Watch（教师预览编辑后回退、保存到个人空间只学生版）
不泄漏、不错导出，符合本刀「最小正解 + 挂账」定位，不阻塞合并。
建议：合并前跑一遍浏览器 QA（尤其 SW#1 的编辑后回退），并把 SW#1 记入 follow-up ledger。
