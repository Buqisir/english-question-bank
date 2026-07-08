# Cut: paper-row-browse-entry

## 需求（owner 拍板）

首页 Concierge 的来源卷行（ConciergePaperRow）目前只能展开题组逐个进入；
在行级加一个「看整卷」入口，跳到已有的整卷预览页（paper-browse）。

## 现成机制（复用，不新造）

- 整卷页路由：`?view=paper-browse&paperId=<id>[&focusGroupId=<gid>]`，由
  `App.tsx` 的 `openPaperBrowse(paperId, focusGroupId?)`（约 :701）打开。
- 详情页已有同款入口 `openPaperBrowseFromDetail`（App.tsx 约 :723）：从
  group 的 `paperSurfaceHref`（形如
  `?view=paper-intelligence&...&paperId=<id>&groupId=<gid>`）解析
  paperId。行级入口用同一解析方式，把 href→paperId 解析抽成小工具函数
  （`app/src/concierge/paperSurfaceHref.ts`）供两处共用。
- 数据：行的 `paper.groups`（`QuestionGroupCard`）已带
  `hasPaperSurfaceAnalysis` / `paperSurfaceHref`。

## 行为规格

1. 行右侧「展开题组/收起」按钮旁加次级按钮「看整卷」（文案与详情页一致）。
2. 可见性：取 bucket 内第一个 `hasPaperSurfaceAnalysis && paperSurfaceHref`
   能解析出 paperId 的 group；一个都没有就不渲染按钮——不出现禁用态。
3. 点击：`openPaperBrowse(paperId)`，不带 focusGroupId（从卷首看起）。
4. 接线：App.tsx → ConciergeDesk → ConciergePaperRow 按现有 `onOpenDetail`
   的 prop 传递路径同款新增 `onOpenPaperBrowse`，沿路都是可选 prop，
   feed/search 两个 variant 都通。
5. 样式：按钮复用行内现有 `.concierge-action` class（与「展开题组」同一
   quiet 次级样式），不新发明样式，无需 CSS 改动。

## 约束

- 只改 concierge 相关组件 + App.tsx 接线 + 对应 CSS；不动 paper-browse
  页本身、不动 features/paper-intelligence/**、不动 server。
- App.tsx 只做最小接线。

## 实现记录

- 新增 `app/src/concierge/paperSurfaceHref.ts`：`parsePaperIdFromHref(href)`
  工具函数，从 `paperSurfaceHref` 里取出 `paperId` 查询参数。App.tsx 的
  `openPaperBrowseFromDetail` 与 `ConciergePaperRow` 的行级判定共用此函数。
- `ConciergePaperRow.tsx`：新增 `findRowPaperId(paper)`，遍历
  `paper.groups`，取第一个 `hasPaperSurfaceAnalysis && paperSurfaceHref`
  能解析出 paperId 的 group；新增可选 prop `onOpenPaperBrowse`；仅当
  `rowPaperId` 非空时才渲染「看整卷」按钮（`.concierge-action` 样式，紧邻
  展开/收起按钮）。
- `ConciergeDesk.tsx`：新增可选 prop `onOpenPaperBrowse`，原样透传给两处
  `ConciergePaperRow`（search 结果列表 + feed 浏览列表）。
- `App.tsx`：`<ConciergeDesk>` 新增
  `onOpenPaperBrowse={(paperId) => openPaperBrowse(paperId)}`；
  `openPaperBrowseFromDetail` 内联的 href 解析改为调用共用的
  `parsePaperIdFromHref`（行为不变，仅去重复）。

## 验收结果

- `node scripts/verify-concierge-desk.mjs` — 250 passed, 0 failed。
- `node scripts/verify-c6a10-concierge-local-search.mjs` — 60 passed, 0 failed。
- `node scripts/verify-concierge-filters.mjs` — 33 passed, 0 failed。
- `pnpm -C app run verify:all` — 67/67 scripts passed。
- `pnpm -C app run build` — clean（tsc -b && vite build，无警告无报错）。

无偏离；未触碰 paper-browse 页本身 / features/paper-intelligence/** / server。
