# CR — workbench-header-unify

Fresh CR，冷读 `7d54075`（wip impl，base `c26c5c5`）。DEV 完成报告作输入，未采信；
下述断言均亲验。

## Verdict

**APPROVE — 0 Must Fix / 3 Should Watch**

硬契约逐条成立，Forbidden 零越界，narrow + 相关 draft 契约 verify 亲跑全绿，
typecheck 干净。头部统一为解析页语言的 5 条 Locked Decision 与最终 v2.5 定值
（非被撤回的 v2.3 10px 暂定值）一致落地。剩余 SW 均非阻断，交 DP-2/DP-3 owner
实点收口即可发车。

## 硬契约核对（逐条）

1. **跟随条去掉（LD1）** — `.draft-toolbar` 整块（含 `position: sticky` +
   nav/doc/output group 簇）DOM 与 CSS 双退役。头部落 AppTopbar，AppTopbar
   本身从不 sticky。✓
2. **头部一行化 / 解析页语言（LD2）** — 卷名升入 `pageTitle` 位且 click-to-edit
   （hover 露 pencil、点开变 input、blur/Enter 提交走 `updateTitle`、Escape 取消）；
   学生/最近草稿卷/保存状态降进安静「⋯」菜单，三字段 handler 逐字保留（学生 blur
   保存、最近走原 pushState、保存状态实时显示）；学生版/教师版 + 导出移入头行右侧、
   置全局动作前、细分隔线。原 `.draft-toolbar` DOM 退役。✓
3. **暖桌通铺到顶（LD3）** — `.draft-preview-desk` 的 `margin-top: 18px` 删除，
   仅此一处。✓
4. **头-纸垂直节奏对齐解析页（LD4，v2.5 终值）** — desk `padding-top` 维持 24px
   （非 v2.3 撤回的 10px），desk 净改动只剩删 margin-top。与 `paper-browse-shell`
   的 `padding: 24px 24px 96px` 同值——**亲验属实**。✓
5. **分页信息条退役（LD5）** — `.draft-paper-meta-row` / `.draft-paper-meta` 整体
   退役；A4/A3 形态开关（`.draft-form-toggle`，逻辑零改）上头行紧邻版本切换；
   「共 N 页」真值文本迁至 rail 顶 `.draft-paper-rail-meta`（12px 暖墨 + tabular-nums
   保留）；窄屏 ≤980px A4/A3 与版本切换一并被「⋯」吸收、导出永远可见。✓
   - PO-1 建议徽标：核实退役的 meta-row 内**从无**该徽标（原 row 只含 meta 文本 +
     form toggle），建议徽标锚在 rail suggestion 区（L1196/1220/1279），未受影响、
     无迁移丢失。契约中「随迁不丢」一条为 moot。✓

- **AppTopbar 改动最小化** — `pageTitleEditable` + `onPageTitleChange` +
  `actionsSlot` 三枚全 opt-in；AppTopbar 只持未提交编辑缓冲，零草稿卷业务逻辑；
  home variant 分支（home-blank）逐字未动；其余页面不传新 prop → 渲染字节等价。✓
- **行为零丢失** — 标题编辑/学生标签/最近切换/保存状态/版本切换/导出四出口
  （PDF/DOCX/打印/存空间）只换容器不换 handler。`updateTitle` 仍收 string、
  仍 450ms debounce；`setPrintForm` 仍乐观翻转 + 失败回滚。✓
- **动效/颜色走 token** — 新增 `.draft-more-menu-*` / pencil / panel 全用
  `var(--motion-fast)` + `--ease-*` + `color-mix`；verify-motion-tokens 46/0 绿。✓
- **≤980px 退化** — `.draft-topbar-wide-toggle` 隐、`.draft-more-menu-narrow-controls`
  显，导出不受触碰。✓
- **解析页同构自查** — 未改解析页/paper-browse（Forbidden）；rail sticky
  `top:24px` + `max-height:calc(100vh-48px)` 与 `paper-browse-rail` 逐字对齐（亲验）。✓

## Forbidden 核对

`git diff --name-only c26c5c5 7d54075` = App.css / AppTopbar.tsx / DraftPaperRail.tsx /
DraftPaperWorkbench.{css,tsx} / plan.md / verify-draft-workbench-visual-unify.mjs。
`server/** · domain · schema · *Adapter · PaperSurface · print/export 渲染链 ·
解析页/整卷/主页文件 · AppTopbar home 分支 · 导出菜单内部逻辑` —— **零命中**。
纸列宽度未碰（`.draft-paper-col` max-width 不在 diff 内，与撤回纸宽 870 一致）。✓

## 验证覆盖审查（不采信「测过了」）

亲跑，非转述：
- `verify-draft-workbench-visual-unify.mjs` → 20/0 ✓
- `verify-motion-tokens.mjs` → 46/0 ✓
- `verify-print-form.mjs` → 30/0 ✓ ·  `verify-c8-draft-paper-contracts.mjs` → 50/0 ✓
- `app` `tsc --noEmit` → exit 0 ✓
- 全仓 grep 退役选择器（`.draft-toolbar` / `.draft-title-field` / `.draft-paper-meta`
  等）：无任何 verify 脚本对其做**结构断言**（student-field/error-copy/print-form 命中
  均为注释提及），故契约「改写 DOM 耦合断言（如有）」的「如有」为空集，无遗漏。✓

**覆盖盲区（见 SW-2）**：本刀对 visual-unify verify 的改动**仅**重钉 hex 白名单行号
（161/373/630），未新增任何断言证明 LD1–LD5。即静态套件**不**守护「非 sticky /
`.draft-toolbar` 已退役 / actionsSlot·⋯ 存在」——这几条的回归防线全靠 DP-2 浏览器
复核 + owner DP-3 实点，无自动化兜底。

## Should Watch

**SW-1 · 自动保存状态/错误只在「⋯」菜单内可见（owner 已锁但错误路径变隐蔽）**
`draft-save-status`（`保存中/已保存/error+saveError`）现仅渲染于 `moreMenuOpen` 面板内
（DraftPaperWorkbench.tsx:1097）。savedToast 只覆盖「保存到个人空间」，**不**覆盖
标题/学生/形态的 autosave。后果：标题自动保存**失败**时，用户不打开「⋯」就完全无提示
——比退役前工具条常驻可见有可发现性回退。LD2「保存状态实时显示」默认了菜单开着的语境，
错误态被这条掩盖。建议 DP-3 让 owner 亲历一次「断网存标题」看能否察觉；如需，考虑
错误态外溢一枚 toast（本刀不改，交 owner 判是否值得）。

**SW-2 · 静态套件不守护本刀核心契约（回归防线空缺）**
见上「覆盖盲区」。若日后有人误将 `.draft-toolbar` 或 sticky 改回，无脚本会红。可低成本
补 2–3 条断言（`.draft-toolbar` 选择器不存在 / DraftPaperWorkbench.tsx 传 `actionsSlot`
+ `pageTitleEditable` / desk 块无 `margin-top`）。非阻断，本刀 UI-only + owner 亲审可接受。

**SW-3 · 版本/形态切换在 DOM 中双挂 + 标题 Enter 双提交（均低危，仅记录）**
(a) `versionToggleControl`/`formToggleControl` 各在 DOM 渲染两份（宽行 + 窄屏面板），
各带 `role="group" aria-label`——重复 a11y landmark，靠 CSS 只显其一，功能无碍。
(b) 标题按 Enter：commit → setEditingTitle(false) → input 卸载触发 onBlur → commit 二次；
二次受 `next !== props.pageTitle` 守卫 + `updateTitle` debounce 清零，实测幂等无重复落库
（依赖 prop 时序，未见 bug）。两项均无需改，记录以备 owner 眼校。

## 证据锚点

- AppTopbar.tsx:36-49（opt-in props）/ 108-142（editable title）/ 146-152（actionsSlot + divider）
- DraftPaperWorkbench.tsx:265-282（⋯ dismiss effect）/ 921-1038（提取控件 + pagesMetaText）
  / 1040-1113（AppTopbar 接线 + ⋯ 菜单三字段）/ 1097-1098（save-status 仅菜单内）
- DraftPaperWorkbench.css:23-29（toolbar 退役注释）/ 213-274（more-menu + wide-toggle）
  / 295-306（desk 删 margin-top，padding 24px 留）/ 504-527（rail top:24px 对齐）
  / 739-751（≤980px 退化）
- App.css:97-159（editable/input/actions-page/divider）
- 对照 paperBrowsePage.css:33（shell padding 24px）/ 57-66（rail top:24px + max-height）
