# dossier-cabinet — 卷宗柜（my-space 编辑刀，DEV 执行契约）

cut size: medium; touches schema/data contract/product boundary/teaching interpretation: no
（纯前端展示重构，无 API/schema 变更，无 PA；fresh Opus CR + 浏览器 QA 必做）

Program: `docs/cuts/draft-desk/program.md` 并行刀「卷宗柜」。原型拍板
2026-07-11（`prototype.html` 本目录，owner 三条全过）：

1. **删除弹窗措辞升级**：交互已达标（自建 alertdialog，program 里
   "原生 confirm 升级"一条已被先行解决，无需重做），只升措辞——
   标题「删除草稿卷 PDF」；正文「删除「{title}」？PDF 文件会一并
   删除，此操作不可恢复。原草稿不受影响。」；确认键「删除 PDF」
   （动词+宾语），取消在前确认在后。
2. **命名法落地**：页题 h1「个人空间」+「共 N 份」；分区头「草稿卷」
   （副文「导出保存的 PDF 成品」）；「已保存的草稿卷」页题退役。
   顶栏与保存弹窗已合规（复核即可）。
3. **月度档案分组 + 微缩 A4 卡**（默认按月，owner 过）。

## 目标形态（以 prototype.html 为准）

- **分组**：按 `generatedAt` 月份降序客户端分组，组头沿用首页年份
  档案语言（`concierge-feed-year-head` 的"真序列+真计数"节奏）：
  「2026 年 7 月 · N 份」。无日期的落尾组「其他」。文件夹筛选 chips
  保留在分组之上，筛选后组内计数如实变化。
- **微缩 A4 卡**：卡=暖纸微缩卷面浮在中性页壳上（色温法唯一合法
  例外，DESIGN.md 色温法条文已预留）。缩略图长宽比照原型
  （210/260），暖纸底 + `--paper-border` 边；内容为**示意版式**
  （owner 拍板：真渲染后置）——真实标题（衬线居中）+ 姓名/班级/成绩
  占位行 + 中性占位线条；**不虚构大题头文字**（artifact 元数据没有
  题组结构，不编）。hover 抬起（Floating 档阴影 + translateY(-2px)，
  gated `@media (hover:hover) and (pointer:fine)`，reduced-motion 退化）。
- 卡下：标题一行截断、meta（M月D日 · N 页）、学生 chip（有则显）、
  操作行「下载 PDF」（primary 小键）/「打开原草稿」（ghost）/
  「删除」（quiet danger，靠右）。
- 空状态、加载态、错误态文案与行为保持现状（`describeError` 契约
  不动，verify-error-copy-mainline 在守）。

## 技术约束

- 页壳一切 chrome 仍走 `--eqb-*` 中性 token；只有微缩卡本体可用
  `--paper-*` token。**禁止硬编码色值 hex**——
  `verify-my-space-shelf.mjs` 的空 allowlist 断言必须继续成立。
- `verify-my-space-shelf.mjs` 钉了旧网格 `minmax(280px, 1fr)` 等旧
  形态断言：本刀**同刀更新**该脚本断言到新卷宗柜形态（新网格
  `minmax(200px,1fr)`、alertdialog 仍在、无 window.confirm、token-only
  不变），并保持 `scripts/README.md` 描述同步。该脚本已在
  verify-ci 列表，勿动挂载。
- 客户端分组，不改 `fetchMySpace` API 形状与后端。

## 文件面

- `app/src/features/my-space/MySpacePage.tsx`
- `app/src/features/my-space/MySpacePage.css`
- `scripts/verify-my-space-shelf.mjs`（断言随形态更新）+
  `scripts/README.md` 对应行

## Forbidden

- `server/**`、API 契约、DraftPaperWorkbench（与 draft-desk-a 并行
  施工，严禁越界）、shared/papersurface/**、其余 verify 脚本。
- 不加依赖；不引入分类色板；工具页壳不得出现暖米色（卡内除外）。

## Verify（DEV 自证 + 主代理复跑）

- `npx tsc --noEmit`（app）
- `node scripts/verify-my-space-shelf.mjs`（更新后）、
  `node scripts/verify-error-copy-mainline.mjs`
- `pnpm -C app run verify:all`
- 浏览器 QA（qa-local-owner 实点，证据入 `qa/`）：月分组头与计数、
  文件夹筛选后分组如实、微缩卡 hover 抬起、下载/打开原草稿可用、
  删除弹窗新措辞 + Esc/取消/确认路径、空状态、窄屏网格收列。

## 收口

worktree 施工（先跑 `bash scripts/setup-worktree.sh`），实现完成打
checkpoint commit（`wip(dossier-cabinet): impl complete, pre-QA`）。
与 draft-desk-a 并行：文件面零交集已核，收口串行，后合并者 rebase。
