# paper-passage-letter — 阅读篇章居中 A/B/C/D（屏幕+PDF 面补齐）

- Cut line: small-medium; touches schema / data contract: no; touches
  PaperSurface（hook 硬保护契约面）: **yes——plan 授权 + unlock**；
  PA-lite 理由：纯渲染加法（零数据变更、零交互变更），DOCX 面已有同款
  行为作为对照真身（docxRenderer.mjs:622-626），回滚=revert。
- 来源：owner 2026-07-09 实测报毛边④（真题阅读每篇首行居中大写字母）。
- 标准依据：`docs/product/exam-paper-format-standards.md` §83-84
  「篇章标题 A/B/C/D：加粗居中，与上下正文各空一行」；§48 字体行
  「Times New Roman Bold 10.5pt（不放大），居中」。

## 目标

阅读理解（groupType reading）每篇文章正文前渲染**居中加粗的篇目字母**
（A/B/C/D），三个消费面对齐 DOCX 已有行为：

1. 屏幕 PaperSurface（详情/整卷/解析页共用）；
2. print-renderer（vivliostyle PDF 线）；
3. DOCX 面已有（不动，作为 parity 对照）。

**刻意不做**：篇内副标题（文章原标题）加粗居中——数据层 passage 只有
paragraphs，无法区分首段是否为标题（Reading A 广告体首行就不是标题），
盲目加粗首段会错。此项归导题管线数据轨（passage.title 字段补齐后另刀）。

## 派生规则（与 DOCX 完全一致）

字母从组标题尾字符推导：`/([A-D])$/.exec(group.title)`（"Reading A"→A）。
匹配不到→不渲染字母（零兜底发明）。非 reading 组不渲染。

## Scope

白名单：
- `app/src/shared-ui/papersurface/PaperSurface.tsx`（reading 组 passage
  渲染前插入字母行；样式走既有 class 体系新增一个类）
- `app/src/shared-ui/papersurface/` 相应 css（居中加粗 10.5pt 等比，
  屏幕面 14px 基准下按刀⑤ 等比换算；上下留白对齐「各空一行」）
- `server/print-renderer.mjs`（PDF 线同款字母行，10.5pt bold 居中）
- `scripts/verify-paper-browse.mjs` 或 `scripts/verify-render-fidelity*`
  相关脚本（挑最窄处加断言：真资产 paper-2026-i 四个 reading 组
  屏幕模型/print HTML 各含 A/B/C/D 字母行且居中样式挂上）

Forbidden：`server/exports/docxRenderer.mjs`（已正确，不动）、adapters、
domain、schema、asset 数据、其他题型渲染路径、面板组件。

## 验收标准

- 整卷页 paper-2026-i：Reading A-D 四篇文首各见居中加粗字母，与上下
  正文间距符合「各空一行」观感；七选五/完形/语法/写作组无字母。
- 详情页/解析页同款（PaperSurface 共用，自动继承，抽查一处）。
- 草稿卷导出 PDF（print-pdf）：含 reading 组时字母行出现且居中加粗；
  与 DOCX 导出对照 parity。
- tsc 绿；`pnpm -C app run verify:all` 绿（含新断言）。
- 真点浏览器 QA：整卷页截图（含字母）入 `docs/cuts/paper-passage-letter/`；
  print-pdf 实导一份目检。

## DEV 侦查后的 PM 裁定（2026-07-09，首派 DEV 环境事故撤回但侦查有效）

1. **屏幕面派生点**：PaperSurface 拿不到 group.title，但
   `paperAssetSurfaceAdapter` 给 reading 组的 `section` 恰好就是裸字母
   （"A"/"B"/"C"/"D"，其他题型均为中文节名、永不匹配 `/([A-D])$/`）。
   裁定：屏幕面在 PaperSurfaceSection 内对 `section` 应用同一正则派生，
   等价于 plan 原意，附代码注释说明。adapter/types 仍 Forbidden。
   样式复用 `--ps-font-size`（已是 10.5pt 等比 token）+ bold + 居中，
   上下留白 `calc(var(--ps-font-size) * var(--ps-line-height))`。
2. **购物车路径 sectionTitle 空洞**：draftPaperStore 两处 item 均
   硬编码 `sectionTitle: ''`，docxRenderer 按 sectionTitle 派生 →
   购物车组卷的 DOCX 可能本来就无字母（疑似既有缺口）。裁定：DEV 先
   起本地 server 实测确认；若确认，print-renderer 与 docxRenderer
   **同时**加同一最小 fallback（`…|| item.detail?.title`，reading 组
   detail.title 即 "Reading A"）——docxRenderer 为此从 Forbidden 局部
   放行**仅此一行 fallback**，保持四面 parity 而不是让 PDF 单面超前。
   若实测 DOCX 购物车路径本有字母，则维持原 Forbidden，print-renderer
   照抄其派生源。

## DEV 纪律

同 flow-panel 各刀：worktree 内施工（先 pwd 自证 + setup-worktree.sh，
禁 stash/禁主树路径/不 push 不开 PR），汇报=文件清单/verify 摘要/QA
截图/Blind Spots/越界声明。PaperSurface 属高危面：diff 保持最小加法，
严禁顺手重构。
