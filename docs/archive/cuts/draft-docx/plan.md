# draft-docx Plan — 草稿卷工作台 DOCX 出口（学生版/教师版）

## Cut Size

small-medium；touches schema / data contract / product boundary / teaching
interpretation: **no**（纯增量 API 端点 + 复用现成渲染能力 + 一个菜单项；
无迁移无语义变更）。PA 不设（launch-deploy 挂账原文即「server 能力现成，
small cut」，方向无悬念）；fresh CR 冷读。

## Objective

草稿卷工作台的导出下拉新增「下载 DOCX」（随现有 学生版/教师版 开关），
复用整卷 docxRenderer 全链路。出处：launch-deploy 挂账
（STATUS「DOCX/讲义版接 Draft Paper 工作台」）；owner 2026-07-14「发车」。

## 关键事实（侦察已证，DEV 直接用）

- server 整卷 DOCX 链路齐全：`server/exports/docxRenderer.mjs`
  （`createDocxRenderer` → `buildDocumentXml`/`writeDocxPackage`）+
  `exportImplementation.mjs:171 exportDocx` + 整卷端点
  `POST /api/exports/docx`（exportRoutes.mjs:27）。api.mjs:3584 已实例化。
- 草稿卷侧输入组装器现成：`draftPaperStore.mjs:453
  buildDraftPaperExportInput(draftPaper, {versionType, printStyle,
  questionNumberStart})` 返回与 `ExportDocxInput` 完全一致的形状（含
  blocks/items），现在只喂 buildPrintHtml（:531）。
- 工作台出口区：`DraftPaperWorkbench.tsx` 导出下拉 :950-997（现有三项：
  下载 PDF :962 / 浏览器打印 :973 / 保存到个人空间 :984），版本开关
  :932-948（state `versionType`）。PDF 服务函数
  `services/draftPapers.ts:189 downloadDraftPaperPdf`。

## 硬契约（不得偏离；偏离 = CR 打回）

- **server**：`POST /api/draft-papers/:id/docx`，body `{ versionType }`，
  挂 `server/draft-paper/draftPaperRoutes.mjs`；鉴权/归属/错误语义与同
  文件 `POST .../print-pdf`（:266）完全同款。实现 =
  `buildDraftPaperExportInput`（printStyle 维持既有默认 `'exam'`）→ 复用
  现成 exportDocx / buildDocumentXml+writeDocxPackage 链路（接线跟
  api.mjs 现有装配惯例走，禁止在路由里自建 renderer 实例）。响应头
  （Content-Type / Content-Disposition 文件名）沿整卷 `/api/exports/docx`
  惯例。
- **FE**：导出下拉新增一项「下载 DOCX（学生版/教师版随开关）」，紧随
  下载 PDF 项；`services/draftPapers.ts` 加 `downloadDraftPaperDocx`
  镜像 `downloadDraftPaperPdf`（URL/错误处理/下载触发同款）。
- **printStyle `'handout'` 不接**：docxRenderer.mjs:957-965 既有决策
  （handout 分支接真 caller 前需自己的 numbering-parity pass）本刀尊重；
  「讲义」教学需求由 teacher 版（含答案解析）覆盖。
- 权限语义零新增：能导 PDF 的人就能导 DOCX。
- 无新增依赖。

## Forbidden

- `docxRenderer.mjs` / `exportImplementation.mjs` / `exportRoutes.mjs`
  内部零改动（只消费不改）；整卷四端点不动。
- 草稿卷 pagination / print-html / print-pdf（paged.js 链路）不动；
  `buildDraftPaperExportInput` 本体不改（只调用）。
- domain / schema / *Adapter / PaperSurface / print-export 样式不动。
- **并行边界（与 fixture-move 刀同期施工，钉死）**：本刀对
  `scripts/verify-ci.mjs` 与 `scripts/README.md` 只做**追加自己一行**；
  不触碰任何既有 verify 脚本、不碰 `app/public/paper-assets/**`、
  不碰 `scripts/fixtures/**`。

## Verification

- 新 `scripts/verify-draft-paper-docx.mjs`（行为断言优先）：临时库 seed
  草稿卷（参照 smoke-c8 / smoke-golden-path 的 temp-DB 模式；**端口用
  9895，勿用 9897-9899/5187-5189**——与其他 smoke 及并行刀错开）→ 起 API →
  POST `/api/draft-papers/:id/docx` 两个 versionType → 断言 ①响应为
  PK zip（DOCX magic）②document.xml 含题干/大题头 marker ③teacher 版
  含解析 marker、student 版不含 ④404/归属错误路径。同刀注册
  `scripts/verify-ci.mjs` + `scripts/README.md`（housekeeping guard）。
- narrow：`node scripts/verify-draft-paper-docx.mjs`、
  `node scripts/verify-c8-draft-paper-contracts.mjs`
- full：`pnpm -C app run verify:all`
- 浏览器自验：工作台导出下拉出现新项、点击真下载（headless 断
  Content-Disposition 即可）。

## DEV Readiness

workspace：worktree `/Users/huangxuewei/Projects/wt-docx-draft`（已建好，
依赖已装）；断点锚 wip commit；完成报告按 dev-completion-protocol。

## 裁决点清单

- [x] DP-1 立刀授权（owner「发车」2026-07-14；本 plan 即记录）
- [x] DP-2 CR verdict 处置（APPROVE 0MF/2SW：error-copy 连锁判正当收下、handout 无断言挂 watch）+ 复核全绿（2026-07-14）
- [ ] DP-3 owner 生产实导一份 DOCX 打开看（部署后）
