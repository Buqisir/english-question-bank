# draft-desk-b — plan.md（草稿卷「屏幕预览 ↔ 导出 PDF」分页 parity）

- cut size: **large**；touches: 出片引擎替换 + 预览架构（客户端分页 → 服务器唯一真源）+
  server 新基建（Chromium 实例池）。**schema 不动**。
- PA: formal PA done（`pa.md`，APPROVE WITH MUST FIX；7 MF + 2 PO 已拍）。不降 PA-lite。
- 方向: `decision.md`（路甲：服务器唯一真源；paged.js **单次渲染**同源出「分页活页面 + PDF」；每题叠按钮）。
- 基线: `github/main` @ 53fda0b。

## 裁决点清单（PM 断点锚）
1. **【DP-1｜步0 spike gating】** paged.js 四条硬验收：全过→引擎选定、继续步1；任一不过→**引擎翻案**，停，回 owner/PM 重议。主代理判定。
   **✅ 2026-07-12 判定：四条全过，引擎选定 paged.js（`spike-gate-dp1.md`；DEV 必读其「三个实操发现」）。**
2. **【DP-2｜步1-4 步间闸】** 每步 narrow verify + CR-lite 主代理复核绿才进下一步。
   **✅ 步1 过闸 2026-07-12**（PR #285 @ b0d9f34,CI 双绿,主代理亲手复跑 25+2+50 全绿;0 MF、5 挂账见 `cr-step1-lite.md`——其中 SW-A(figure 图)步2/4 必验、SW-D(export-flow verify 在 main 上就崩)步4 前置修。
   **✅ 步2 过闸 2026-07-12**（86cf1df,复跑 14+32+25 绿,SW-A 实锤已修/data URI 内联;0 MF、新挂账 SW-F/G/H 见 `cr-step2-lite.md`)。**✅ DP-title 拍板 2026-07-12(owner)**:Option B——title 入分页签名,改标题触发重排(loading 态兜住);修复随步3落地(一行改动 + verify 断言反转)。
   **✅ 步3 过闸 2026-07-12**(950c296+d32eb4e,主代理复跑 14+32+25+50+35+20+tsc 全绿,CI 双绿;0 MF、新挂账 SW-I 见 `cr-step3-lite.md`。CI 首跑抓到 error-copy 门计数过期,同刀修。DEV 真 Chrome QA 过含 SW-3 多页锚点与 DP-title 页脚实测)。
   **✅ 步4 过闸 2026-07-13**(8600564+c45f533+d32cf31,主代理复跑 12 本 verify+tsc 全绿,CI 双绿;0 MF、新挂账 SW-J/K 见 `cr-step4-lite.md`。CI 首跑抓到 e2e 缺 server 侧 chromium(playwright-core rev 各锁各的),已修——连续第二次 CI-only 捕获。三出口 parity 实证:PDF /Type /Page=7 与预览一致、打印 HTML 截获验明同源)。
3. **【DP-3｜终审】** 全 verify + 浏览器 QA matrix + owner 产品 QA（parity 肉眼 + 交互回归）。

## PO 决策（owner 2026-07-12）
- **PO-1 建议显示 = 延后**：本刀**不显示**分页建议（break-hint）；`pageBreakSuggestions` 字段保留但**暂不消费**；随后续「建议引擎改真分页衍生」刀恢复。（落 MF-5——明确带走，非静默丢）
- **PO-2 编辑手感 = 简单版**：布局编辑后预览显示「重新排版中…」loading 态 + debounce，**不做**本地瞬时假重排；QA 觉得卡再优化。（落 MF-4/SW-1）

## Must Do

### 步0 — paged.js gating spike（MF-1）【DP-1】
scratchpad 脚本：服务器端 headless Chromium 跑 **paged.js**，喂真实完整高考整卷（复用步 spike 那份 9 页卷）。四条**硬验收**：
- (a) 长阅读原文在**段落边界正确跨页**（对齐 `exam-paper-format-standards.md §3b`）
- (b) `@page @bottom-center counter(page)` 页脚/页码正确渲染（含 `addDraftFooterCss` 级联，SW-4）
- (c) 暖实例单次渲染 ≤ 延迟预算
- (d) 序列化的 paged.js DOM 塞进普通 iframe，**肉眼与 `page.pdf()` 分页一致**

任一不过 → 记录 fallback 降级路径，**停、回 owner/PM 重议引擎，不硬上**。不碰产品代码。

### 步1 — 服务器分页渲染器 + 实例池（MF-2/MF-6）
- 新 server 模块（`server/draft-paper/` 下）：**一个 Chromium page → run paged.js → 同一 page 序列化分页 DOM + `page.pdf()`**。锁死单次渲染：**禁止对未分片 HTML 直接 `page.pdf()`**。
- Chromium 常驻/池：launch / 崩溃重启 / 退出清理；渲染**串行队列**；冷启 fallback；**异步**（不再 `execFileSync` 阻塞事件循环）；写明延迟预算。
- `playwright-core` 提为 `server` **正式依赖**（显式一步）。
- 验收：确定性 verify（同输入 N 次页数+每题组落页一致）绿；perf verify（暖实例单卷 ≤ 预算、不阻塞事件循环）绿。

### 步2 — DOM 契约 + 缓存解耦（MF-3/MF-4）
- **分页 DOM 稳定契约**：保留 `.preview-page` 页容器 + 每题组 `data-group-id`。在**下游 wrapper** 位置性补 `data-group-id`（照抄客户端 `tagGroupSections` 顺序）、映射 paged.js 页容器到 `.preview-page`——**不改 `print-renderer.mjs`**（护 `verify-c8-forbidden-scope.mjs:60`）。
- 分页产物按 `draftPaperPrintSignature` 缓存，**仅布局编辑**（增删/reorder/toggle page_break）触发 render；**非布局编辑（标题/studentLabel/列表）绝不触发**。
  （**DP-title 拍板修订 2026-07-12**：title 因印在每页页脚，入签名、改标题**触发**重排；studentLabel/列表仍不触发。修复落步3。）
- 编辑刷新 UX = PO-2 简单版（loading + debounce）。
- 验收：DOM 契约 verify 绿；改标题不触发 render（QA）→ **DP-title 后修订：改标题触发重排，verify 断言随步3反转**。

### 步3 — 前端吃分页 HTML + 常驻叠按钮（MF-3/MF-5）
- iframe 换吃服务器分页 HTML；hover sticker → **常驻叠按钮**（每组一枚），复用 `computeGroupAnchorTop` 锚点数学；**卷子按钮与 rail 同一套操作逻辑**。
- 退役 `paginateA4Preview` / `buildA4PreviewHtml`（薄壳或删）。
- 建议显示 = PO-1 延后：本刀不注入 `.break-hint`，`pageBreakSuggestions` 不消费（字段保留）。
- 验收：交互回归 QA 全绿（hover/点按钮/scrollspy/rail 跳转/**多页锚点 SW-3**）。

### 步4 — PDF 换引擎收口 + Vivliostyle 草稿卷退役（MF-2/MF-7）
（**2026-07-12 主代理 xhigh 复审修订，owner 拍板**——原 Opus plan 两处升级：SW-5 由「迁移」改「退役」；浏览器打印并入。）
- `exportDraftPaperPdf` 改为消费 `getDraftPaperPagination()` 的 `pdfBytes`（同一次 paged.js 渲染的字节，parity 是构造保证）。**退役 `recentDraftPdfExports` 30s TTL 缓存与草稿线 `draftPaperPrintSignature`，不迁移**——SW-5 的真实关切（导出不重渲）被分页签名缓存满足得更好（预览过即命中、零渲染；TTL 反而过期强制重渲）；两套缓存=两个失效时机=DP-title 同族静默失真面，不留。老线磁盘路径 / `preferRecent` / My Space 存档（`saveMySpaceArtifact` 前置调用、artifact 删除时的缓存失效钩子）的交互由 DEV 逐一映射到新形态，报告说明。
- **浏览器打印换吃分页 HTML**（owner 拍板 2026-07-12 并入）：`printWindow.write(draftPaper.printHtml)` 改写分页 HTML——否则它是第三台分页引擎、最后一个 parity 洞（DP-1 验收 (d) 已证序列化分页 DOM 打印一致）。
- **前置修 SW-D**：`verify-print-pdf-export-flow.mjs` 在 main 上就崩（cloze fixture 缺挖空标记），先修 fixture 再开工；其断言对象随换线更新。
- **旧孤儿路由（`exportImplementation.mjs` paperAssembly Vivliostyle 线）不动**。
- 验收：`verify-print-pdf-export-flow`（修复后）绿 + parity 肉眼 QA 覆盖**三出口**（预览 / PDF / 浏览器打印）。

### 步5 — Forbidden/门复核 + 上线前置 + 终审【DP-3】
- 全 verify 绿（含既有门回归：`verify-c8-draft-paper-contracts` / `-render-model` / `-print-pdf-export-flow` / `-forbidden-scope`；render-model 门已随步3 同刀更新✅）。SW-E：forbidden-scope 门的过期 allowlist 处置（更新或明确历史门定位，不留静默红）。
- SW-B 拍定（预定答案，2026-07-12 复审）：三个 Chromium verify **挪进 e2e job**（它本就装浏览器，verify job 零新增安装成本）；实测后入 `verify-ci` 名单纪律照 housekeeping 守卫。
- **上线前置（2026-07-12 复审补漏——本地全绿≠HK 单机扛得住常驻浏览器）**：生产机 chromium 安装步入部署流程；常驻 Chromium 内存占用 vs 服务器规格实测；生产硬件暖延迟实测（预算 ≤1s，本地 ~700-800ms，SW-C 收口）；全部落 `docs/cuts/launch-deploy/go-live-record.md`。
- 浏览器 QA matrix（pa.md 8 场景）走完；owner 产品 QA。

## Forbidden（本刀不许动）
- `server/print-renderer.mjs`（优先不改，走下游 wrapper 补 id；若确需改则同刀改 `verify-c8-forbidden-scope.mjs` 并说明）
- `server/exports/exportImplementation.mjs`（旧 paperAssembly Vivliostyle 孤儿路由）
- schema（`draft_papers`/`draft_paper_items` 不加列）
- `buildPageBreakSuggestions` + `verify-c8-print-ready-gate.mjs` 魔法数字（建议引擎 = 后续刀）
- A4/A3 形态 / 同面判据 / 2-up 拼版（后续刀 / 刀E）

## Verify 要求
确定性 verify（MF-2）· DOM 契约 verify（MF-3）· perf verify（MF-6）· forbidden-scope 复核（MF-7）· 既有门全绿。新 verify 标 `yes` 的入 `verify-ci.mjs`（housekeeping 守卫）。

## 完成标准
步0–5 全过；`pnpm -C app run verify:all` 或 PR CI 全绿 + 合并后 main CI 绿；浏览器 QA matrix 全过；owner 产品 QA 过；`docs/STATUS.md` 更新（≤5 行 + token 账单）。
