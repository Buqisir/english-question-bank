# draft-desk-a — 刀A 备课桌骨架（DEV 执行契约）

cut size: medium; touches schema/data contract/product boundary/teaching interpretation: no
（product-surface 可逆重构，无 PA；fresh Opus CR + 浏览器 QA 必做）

Program: `docs/cuts/draft-desk/program.md` 刀A。原型拍板 2026-07-11
（`prototype.html` 本目录，owner 逐裁点过）：

- **裁点 0：目录 rail 贴右**（owner 改判 program 原文的"贴左"，已过）。
  理由入档：现网工作台列表本在右、调序动线终点是右上「导出 PDF」、
  滚轮/滚动条在右。整卷页 rail 仍在左——读=左导航、改=右工具，
  分侧是语义不是分裂。
- **裁点 1：调整动作贴纸**。悬停纸上题组块，右缘浮出 上移/下移/移除
  （+前置分页切换）小操作条；rail 纯目录：点击滚到题组 + 拖拽排序。
- **裁点 2：分页建议=安静标注**。虚线夹一句灰字躺在块间（原型样式），
  点击应用前置分页（现有 suggestion→togglePageBreak 能力平移，不丢）。
  完整换页销交互归刀C，本刀只做这个安静形态。

## 目标形态（以 prototype.html 为准）

1. 工具 chrome（AppTopbar + draft-toolbar）保持中性不动。
2. 主体改为暖纸桌满幅：`grid-template-columns: minmax(0,1fr) 224px`
   （纸列 + 右 rail），桌底 `var(--paper-desk-bg)`，删除现
   `draft-preview-desk` 的卡片边框感（桌不是卡）。
3. 右 rail = 整卷页目录语言（参照 `paperBrowsePage.css` 的
   `.paper-browse-rail-item` 族：暖墨、无边框、hover 洗底、active 加深），
   sticky。每项：汉字大题序号 + 题组标题 + N 题；hover 露拖拽 grip；
   保留现有 HTML5 拖拽排序与 moveItemTo 逻辑（双通道：拖拽在 rail，
   上移/下移在贴纸操作条）。现 `DraftPaperOutline` 面板形态退役。
4. 纸居中 max 820px；页数徽标「共 N 页 · 双面 M 张 · A4」常驻纸顶
   （M = ceil(N/2)；N 从预览分页脚本取真值，见技术约束）。
5. scrollspy：滚纸面 rail 跟随高亮，点 rail 平滑滚到题组。
6. 分页建议安静标注渲染在纸内块间（样式照原型 `.break-hint`），
   点击应用；outline 面板里的建议按钮区随面板退役。
7. 删除题组仍走即删 + toast 撤销（Deletion-Cost Rule，不改）。
8. 「保存到个人空间」弹窗措辞已合规（复核即可，不改）。
9. 窄屏（<900px）：rail 退化隐藏，纸单列（现有窄屏行为不倒退）。

## 技术约束（预侦察结论，DEV 必读）

- 预览 iframe 是 **srcDoc 同源**：父页可直接访问 `contentDocument`，
  不需要 postMessage 协议。scrollspy / 贴纸操作条定位 / 页数读取都
  走直接 DOM 访问；操作条本体渲染在父层（overlay 定位），事件回调
  直接调用现有 handler（moveItemTo / deleteItem / onTogglePageBreak），
  **不改这些 handler 的签名与 reducer/state 契约**。
- `draftPaperPreviewHtml.ts` 的分页脚本会把 `.question-group` 拍平
  （flatten）再分页——组边界在分页后溶解。本刀需在拍平时给子节点
  打 `data-group-id` 标记（或保留组首锚点元素），供 scrollspy 与
  操作条识别组范围。该文件只改**屏显预览包装**；print/DOCX 导出的
  printHtml 生成路径不碰。
- iframe 需改为随内容自适应高度（读 contentDocument scrollHeight），
  让桌面滚动承载翻页；页数由分页脚本产出后父层读取。
- 遮挡/懒加载下的滚动沉降教训见 lecture-rail-scroll-fix（STATUS
  2026-07-11 条）：程序化 smooth 滚动要防 rAF 冻结与内容推移，必要
  时用沉降巡检收尾。

## 文件面

- `app/src/features/draft-paper/DraftPaperWorkbench.tsx`（布局重构 +
  overlay 操作条；不动数据获取/URL state/保存逻辑）
- `app/src/features/draft-paper/DraftPaperWorkbench.css`
- `app/src/features/draft-paper/DraftPaperOutline.tsx`（退役或改写为
  rail 组件；也可新建 `DraftPaperRail.tsx` + 删旧）
- `app/src/features/draft-paper/draftPaperPreviewHtml.ts`（组标记 +
  页数上报；仅预览包装）

## Forbidden

- `shared/papersurface/**`、`server/**`、domain/schema/Adapter、
  print/DOCX 导出管线、verify 基建（除非断言与本刀重构直接冲突，
  冲突时同刀更新并在回执注明）。
- 不加新依赖；不引入 localStorage-only 持久化；不改题组数据契约。
- 工具页范围内不得出现暖米色（色温法：暖只在桌+纸）。

## Verify（DEV 自证 + 主代理复跑）

- `npx tsc --noEmit`（app）
- `node scripts/verify-paper-draft.mjs`、
  `node scripts/verify-c8-draft-paper-contracts.mjs`
- `pnpm -C app run verify:all`
- 浏览器 QA（qa-local-owner 实点，证据入 `qa/`）：rail 点击滚动 +
  scrollspy 高亮、拖拽排序落库、贴纸操作条三键、分页建议点击生效、
  页数徽标随增删题组变化、删除撤销 toast、窄屏单列。

## 收口

worktree 施工（先跑 `bash scripts/setup-worktree.sh`），实现完成打
checkpoint commit（`wip(draft-desk-a): impl complete, pre-QA`）。
与 dossier-cabinet 并行：文件面零交集已核（该刀只碰 my-space 两文件
+ 其 verify 脚本），收口串行，后合并者 rebase。
