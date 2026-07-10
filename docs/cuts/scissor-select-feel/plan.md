# scissor-select-feel — 整卷页剪刀线选中手感（one-sheet-paper 追刀）

- Cut line: small-medium; touches schema / data contract: no; PaperSurface:
  **no（零触碰）**; PA-lite 理由：纯视觉/交互层打磨（PaperBrowsePage + 其
  css），可逆，无契约面；四裁点 owner 已逐项拍板（2026-07-09，原型
  artifact 06547ca4 v1→v3，终选默认态已存档 v3）。
- 来源：owner 实测 one-sheet-paper（毛边⑤，merge 8388b4d）后两报障：
  ① hover 灰面难看；② 剪刀线把标准排版撑开、分割感重。
- 设计原则（本刀魂）：**线和选中态都是画在纸上的批注层，不许改写纸
  本身**——排版不动，灰面不上。

## 已拍板的设计（原型 v3 终选）

1. **排版零占位**：剪刀线退出布局流。卷面块间距回 16px 标准节奏
   （one-sheet 落地时的 20px 与线自带 `margin: 20px 24px 16px` 一并
   退役）；线画在块与块本来就有的间隙正中（overlay，`top: -gap/2`
   手法，随卡定位，不再是流内 div——流内零高度元素也会吃 flex gap
   槽位造成双倍间隙，必须彻底出流）。加不加线，纸的排版逐像素一致。
2. **静息线减墨**：`rgba(74,68,56,0.28)` → `rgba(74,68,56,0.18)`；
   左右缩进 24px 不变。静=铅笔参考线。
3. **hover = 纸条显影**（灰面退役：删除 `rgba(74,68,56,0.04)` 整卡
   背景与 12px 圆角）：
   - 选区罩：上下缘在块间隙正中（±gap/2），左右延伸到纸物理边缘
     （`± var(--ps-page-margin-x)`），**直角**；罩色
     `rgba(44, 110, 86, 0.02)`（teal-600「墨·淡」档，owner 终选）。
   - 边界虚线：罩上下缘各一条 1px dashed `rgba(44, 110, 86, 0.55)`，
     **通宽到纸边**（剪刀剪的是整张纸宽）；该单元自身的静息缩进线
     hover 时隐去，避免同位双线。
   - 合规注：选中态用墨绿=DESIGN.md 签名色本职（「当前选中」），
     色值全部取自 teal 梯子，单色相/绿笔原则不破。
4. **操作簇跟随滚动**：`.paper-browse-group-actions` 由绝对定位右上
   改 sticky（单元内跟随视口，高单元 hover 下半段时「加入」仍在手
   边）；`@media (hover: none)` 触屏常显路径行为照旧；实装须核
   z-index 层叠：讲评把手、右栏、七选五衔接句/阅读证据高亮覆盖层，
   互不遮挡。
5. **写作组沿用既有取舍**：CSS 兄弟选择器路径（`.pi-writing-section
   + *`）同步以上全部样式；整卡显影含其节标题行的已披露取舍不变，
   零碰 paper-intelligence。

## Scope

白名单：
- `app/src/features/paper-browse/PaperBrowsePage.tsx`（仅剪刀线 DOM
  从流内 div 迁为卡内 overlay、操作簇 rail 结构所需的最小重排；
  **不动**剪刀线语义判定 scissorPlan、数据加载、讲评态状态机、
  URL/popstate、scrollspy）
- `app/src/features/paper-browse/paperBrowsePage.css`
- `scripts/verify-paper-browse.mjs`（断言 44-52 随 DOM 位置窄改迁移；
  可选新增 hover 样式轻断言）

Forbidden：同 one-sheet-paper——`shared-ui/papersurface/**`、
`paper-intelligence/**`、server/print/export、App.tsx、domain。

## 不变量

one-sheet-paper 全部不变量继承：rail 贴左+scrollspy、讲评把手/右栏/
点题联动/显影层、窄屏抽屉、URL 契约深链锚定、draft chip、挑题态零
解析请求、print/PDF/DOCX 面零影响（本 css 只被整卷页引入）。
**剪刀线语义（九道线的位置）不变——本刀只改"怎么画"，不改"画在哪"。**

## 验收

- Playwright：
  - hover 单元 → 罩显影（computed bg = `rgba(44,110,86,0.02)`）+
    上下通宽虚线 + 该单元静息线隐去；移出即复原。
  - 非 hover 态排版与 16px 基准一致（无双 gap；截图对比）。
  - 高单元（阅读 B 类）滚至下半段 hover：「加入草稿卷」按钮在视口内
    且可点。
  - 触屏模拟（hover:none）：操作簇常显路径照旧。
  - 讲评态开启 + 七选五高亮/证据连线叠加下 hover：覆盖层无遮挡错位。
- `node scripts/verify-paper-browse.mjs` 全绿；`npm run verify:all` 全绿。
- QA 截图入 `docs/cuts/scissor-select-feel/qa/`。
