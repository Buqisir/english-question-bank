# draft-docx CR — fresh 冷读

**Verdict: APPROVE（0 Must Fix / 2 Should Watch）**

冷读范围：`git diff b4e1a82(plan/merge-base)..HEAD(8fffe6e)`，9 文件 +331/-3。
两条 verify 亲自跑绿（下方证据）。DEV 报告未采信，逐条对着源码/实跑核对。

---

## 硬契约核对（全部成立）

1. **server 端点** `POST /api/draft-papers/:id/docx`，body `{ versionType }` ✓
   - `draftPaperRoutes.mjs:301` 新路由。versionType undefined→'student'，否则
     `requiredEnum(['student','teacher'])`——与同文件 print-pdf(:266) 逐字同款。
   - 鉴权/归属：`context.resolveDataUserId` + `decodeURIComponent(match[1])`，同款。
   - 错误语义：用 `sendDraftMutationError`（not-found→404 / else→400）。print-pdf 用
     bespoke handler（多一条 vivliostyle→503 分支），docx 无 vivliostyle 所以那条不适用；
     对**相关**用例（未知 id / 跨用户 → 404，校验错 → 400）行为等价。判为忠实等价，非偏离。

2. **复用现成链路，禁止自建 renderer** ✓
   - `api.mjs:63` 单例 `exportImplementation` 同时喂整卷路由(`:508 createExportRoutes`)
     和 draftPaperStore(`:479` 注入) + `serverContext.sendDocx=:501`。
     store 的 `exportDraftPaperDocx` 调 `exportImplementation.exportDocx(input)`——
     无新 renderer 实例。接线走 api.mjs post-hoc 装配惯例（同 draftPaperStore/resolveDataUserId）。

3. **printStyle 维持 'exam'，handout 不接** ✓
   - `exportDocx` 默认危险：`input.printStyle==='exam'?'exam':'handout'`（默认落 handout）。
     但 store 调 `buildDraftPaperExportInput(draftPaper,{versionType})` **不传 printStyle**，
     该函数默认 `printStyle='exam'`(`draftPaperStore.mjs:453`)→ 送入 'exam' → handout 分支
     确定不可达。docxRenderer.mjs handout numbering-parity 决策被尊重。

4. **FE 导出下拉新增「下载 DOCX」紧随 PDF** ✓
   - `DraftPaperWorkbench.tsx:987` 新按钮（FileText 图标），role=menuitem，
     disabled 条件同 PDF，走 `exportDocx()`→`downloadDraftPaperDocx`。
   - `services/draftPapers.ts:207 downloadDraftPaperDocx` 是 `downloadDraftPaperPdf` 逐字镜像
     （URL 换 /docx、错误串换文案、默认文件名换 .docx，其余 fetch/blob/x-file-name/downloadBlob 全同）。

5. **权限零新增** ✓ 能导 PDF 的人走同一 resolveDataUserId + 归属校验。
6. **无新增依赖** ✓ 仅新增 lucide 图标 import FileText。

## Forbidden 核对

- docxRenderer.mjs / exportImplementation.mjs / exportRoutes.mjs **零改动** ✓
  （diff --stat 未列此三文件）。
- draft 卷 pagination/print-html/print-pdf 链路不动、`buildDraftPaperExportInput` 本体不改 ✓
  （store diff 仅"新增" exportDraftPaperDocx + 注入参数 + 导出注册；PDF 函数/build 函数原样）。
- domain/schema/Adapter/PaperSurface/print-export 样式不动 ✓（改动文件清单无一命中）。
- 并行边界：verify-ci.mjs / README.md 均"只追加自己一行" ✓——见 SW-1。

## Verification 核对（不采信"测过了"）

亲跑 `node scripts/verify-draft-paper-docx.mjs` → **16 checks PASS**（端口 9895 合规）。
覆盖真实证明了风险，非空过：
- ①PK zip magic（student+teacher 各断）②document.xml 含题干 marker + 大题头「阅读理解」
- ③teacher 含「【解析】」+ 解析原文；student **不含**「【解析】」——真拆包 unzip document.xml 比对
- ④未知 id→404；**跨用户归属**：脚本真 seed 一份 user-other 拥有的 draft，断 bootstrap 用户拿到 404
  而非 DOCX——归属边界是实证的，不是形式。
- content-type=wordprocessingml + content-disposition 带 .docx 名，响应头沿整卷惯例。
亲跑 `node scripts/verify-error-copy-mainline.mjs` → **18 passed 0 failed**（守卫计数已同步，见 SW-1）。

---

## Should Watch

**SW-1｜`scripts/verify-error-copy-mainline.mjs` 被改动，字面触碰 Forbidden「不触碰任何既有 verify 脚本」**
- 事实：该守卫断言 DraftPaperWorkbench.tsx 的 describeError 调用点数(13→14)与 catch 块数(12→13)。
  FE 按本文件既有惯例给新按钮加 `describeError('导出 DOCX', error)` + try/catch，计数**必然**变化；
  不同步守卫则全量套件转红。DEV 已同步计数并加注释说明，实跑绿。
- 裁断：Forbidden 该句挂在「并行边界（与 fixture-move 同期）」标题下，本意是防与并行刀**碰撞**；
  此文件属 DraftPaperWorkbench 错误文案域，与 fixture-move（fixtures/paper-assets 域）无交集，
  **无碰撞风险**。判为 FE 契约强制的连锁更新 + 正确工程决策，非实质越界。
  仅提请主代理知悉此字面偏离——若严格解读该 Forbidden，此改动本应在立案时豁免登记。

**SW-2｜「handout 不接」硬契约仅靠 `buildDraftPaperExportInput` 默认值维系，verify 未直接钉**
- exportDocx 默认落 handout；docx 路径走 'exam' 全赖 `buildDraftPaperExportInput` 的
  `printStyle='exam'` 默认参数。verify 未对 printStyle 加显式断言。
- 当前由 Forbidden「buildDraftPaperExportInput 本体不改」兜底，可接受。
  若将来有刀改动该默认值，docx 会静默滑入 handout 分支且无断言拦截——届时需补一条断言。

## 证据

- 路由：`server/draft-paper/draftPaperRoutes.mjs:301`（对照 print-pdf `:266`）
- store：`server/draft-paper/draftPaperStore.mjs:1142 exportDraftPaperDocx`（对照 `:1122 exportDraftPaperPdf`）
- 装配：`server/api.mjs:479`(注入 exportImplementation) / `:501`(sendDocx post-hoc)
- exportDocx 单例源：`server/exports/exportImplementation.mjs:63`(create) / `:171 exportDocx` / `:67 sendDocx`
- printStyle 默认：`server/draft-paper/draftPaperStore.mjs:453`
- FE：`DraftPaperWorkbench.tsx:987` / `services/draftPapers.ts:207`
- 实跑：verify-draft-paper-docx 16/16 绿、verify-error-copy-mainline 18/0 绿（本 CR 会话内亲跑）
