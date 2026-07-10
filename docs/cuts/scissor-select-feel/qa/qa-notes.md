# scissor-select-feel — QA 记录

日期：2026-07-09　执行：DEV 子代理（Sonnet）
本地 dev server：`QUESTION_BANK_API_PORT=8823 PORT=5223`，账号
`qa-local-owner`（本地库密码经
`node scripts/create-user.mjs --reset-password --username qa-local-owner
--password "QaLocal!2026"` 临时重置，仅影响本 worktree 复制出的本地
sqlite，不触碰生产，同 flow-panel 刀 1 的既有惯例）。

工具：Playwright（脚本临时拷贝到 `app/qa-scissor.mjs` 跑完即删，源件留在
本次会话 scratchpad，不入提交）。全程真开 `http://127.0.0.1:5223/?view=
paper-browse&paperId=paper-2026-i`，对 `paper-2026-i` 固定夹具逐条核对
`computed style` + 截图，不是纯目测。

## 验收逐项结果（全部 PASS）

1. **hover 显影 + 复原**（Reading A 卡）
   - 静息态：`.paper-browse-group-card::after`（选区罩）opacity = `0`；
     `.paper-browse-scissor-line`（静息剪刀线）opacity = `1`。
   - hover 后：罩 opacity → `1`，`background-color` =
     `rgba(44, 110, 86, 0.02)`，`border-top-color` =
     `rgba(44, 110, 86, 0.55)`（边界虚线色）；该单元自身的静息线同帧
     opacity → `0`（同位双线已避免）；罩左边界 computed `left` ≈
     `-91px`（等于 `--ps-page-margin-x` 取反，精确落在纸的物理边缘，不
     是文字栏边缘）。
   - 移出后（`mouseleave` + 鼠标挪到画布外）：罩 opacity 复原为 `0`。
   - 截图：`hover-band.png`（hover 态，含操作簇+边界虚线）、
     `rest-state.png`（静息态，无操作簇/无罩，只剩淡静息线）。

2. **非 hover 排版：16px 基准，无双 gap**
   - `.paper-browse-content` computed `gap` = `16px`。
   - 实测阅读 A→B→C→D 四张相邻题组卡（DOM 上紧邻、都带剪刀线 overlay）
     的视觉间距：`[16, 16, 16, 16]` px，逐一命中标准节奏——证明剪刀线
     从流内 div 迁到 overlay 后确实零占位，不再吃 flex gap 槽位造成双倍
     间隙（这是本刀的核心诉求）。
   - （note：部/节标题自身的 `margin`——如 part-heading 的 `24px 0 4px`
     ——是 one-sheet-paper 就已拍板的既有设计，不属于本刀改动范围，未
     纳入"必须=16px"的断言，只挑了真正相邻的题组卡对做零占位验证。）

3. **高单元（Reading B）hover 下半段：按钮在视口内且可点**
   - Reading B 卡高度 933px（> 700px 视口，满足"比一屏高"的测试前
     提）。滚动到只剩卡片下 200px 可见后 hover 卡内容，
     `.paper-browse-group-actions`（sticky rail）此时 computed
     `position: sticky`，按钮 `boundingBox` 落在 `[0, viewport.height]`
     内（`y:16, height:36` ⊂ `[0,700]`）；`elementFromPoint` 命中按钮本身
     （非被别的元素挡住）——不只是"看得见"，是真的可点。
   - 截图：`high-unit-sticky-actions.png`（滚到 Reading B 下半段 hover，
     按钮仍贴在视口顶部 16px，同时可见 B→C 间的边界虚线）。

4. **触屏模拟（`hover: none`）：操作簇常显路径照旧**
   - `viewport 390×844 + hasTouch + isMobile` 下 `matchMedia('(hover:
     none)').matches = true`；`.paper-browse-group-actions` computed
     `opacity: 1`、`position: static`（`@media (hover:none)` 覆盖规则
     生效，不是 sticky）。
   - 截图：`touch-actions.png`。

5. **讲评态 + 七选五高亮叠加下 hover：覆盖层无遮挡错位**
   - 打开 `&lecture=1`，`window.scrollTo` 到七选五题组卡（触发 scrollspy
     → `panelGroupId` 落到该组），讲评栏正确渲染「七选五解析」面板；点
     「全部显示」后 `.paper-browse-seven-clue-mark` 真实挂载 39 个高亮
     标记（不是空态 no-op）。
   - 此时 hover 该题组卡：`::after` 选区罩 opacity 仍正确 → `1`（讲评栏
     渲染不影响 hover 机制）；高亮标记的 `transform: translate(...)`
     全部是合法数值（无 `NaN`/`undefined`，证明覆盖层的坐标计算没被
     rail/band 改动带偏）。
   - 截图：`lecture-seven-choices-hover.png`（肉眼可见：衔接句高亮 + 操作
     簇 + 边界虚线三者共存，无遮挡错位）。

## 已知缺口 / 未覆盖

- 未单独截图验证"高单元 hover 上半段"（只做了下半段，因为下半段是
  plan 明确点名的风险场景——sticky 是否够手；上半段沿用 one-sheet-paper
  就已验证过的普通绝对定位手感，风险低，未重复截屏）。
- 讲评栏本身的三栏/抽屉响应式断点（<1200px）不在本刀 Scope 内（那是
  flow-panel 刀 1 的验收范围，已在
  `docs/cuts/flow-panel/qa/qa-notes.md` 里做过窄屏/触屏 Playwright 实测），
  本刀未重复验证，只确认了本刀改动（选中手感/剪刀线/操作簇）在讲评栏
  打开时不冲突。
