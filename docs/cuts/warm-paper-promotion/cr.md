# warm-paper-promotion — fresh CR（冷读 diff）

审：`git diff main...HEAD`（排除 docs/cuts；DESIGN.md 计入交付物）。
CR 代理 Opus/high。验证退出码由流水线复核代理证实（vpb=0 tsc=0
verify:all=0），本 CR 不重跑全量，只审五项未证实事实。

改动 6 文件：`app/src/index.css`、`paperBrowsePage.css`、
`DraftPaperWorkbench.css`、`DESIGN.md`、两个 verify 脚本。

## verdict: APPROVE

零 Must Fix。token 转正逐值等价、零视觉面选择器作用域干净、workbench 无
tsx 改动、DESIGN.md 法条忠实 program.md、Forbidden 面零触碰、护栏重钉正确。
四条 Should Watch 全为低severity（不阻断 merge，留 QA/后续刀注意）。

---

## 五项审查逐条结论

### 1. token 转正是否纯等值 — 通过

10 处引用替换，逐个比对原 hex 与 token 值，全等：

| 原值 | token | token 定义值 | 等价 |
|---|---|---|---|
| `#f4f1ea` | `--paper-bg` | `#f4f1ea` | ✓ |
| `#4a4438` | `--paper-ink` | `#4a4438` | ✓ |
| `#2c2820` | `--paper-ink-strong` | `#2c2820` | ✓ |
| `#e6e2d7` | `--paper-border` | `#e6e2d7` | ✓ |
| `rgba(74,68,56,α)` | `rgba(var(--paper-ink-rgb),α)` | `74,68,56` = `#4a4438` | ✓ |
| `rgba(44,40,32,α)` | `rgba(var(--paper-ink-strong-rgb),α)` | `44,40,32` = `#2c2820` | ✓ |

hex→rgb 换算校验：`#4a4438`=(74,68,56)、`#2c2820`=(44,40,32)，DEV 的 `-rgb`
伴生 token 值正确。

- **漏收**：无。全文再 grep，`#f4f1ea/#4a4438/#2c2820/#e6e2d7` 及其
  rgba 形式（`74,68,56`/`44,40,32`）在 paperBrowsePage.css 已零残留。
- **错收**：无。剩余硬编码全是非暖纸系——中性灰
  `#6a6a64/#d8d8d2/#ededea/#e8e8e4`、纯白 `#ffffff`、近黑 `#1e1e1c`、
  黑影 `rgba(30,30,28,α)`（=`#1e1e1c`，与暖墨 ink 明确区分）、品牌墨绿系
  `#2c6e56/#1e4a3a/#eaf1ed/...`（similar-* 区块本身声明"不引入共享
  token"）。均按范围纪律原样留存，未新造 token、未改值。
- **顺手改值**：无。

### 2. 零视觉变化面（整卷/讲评）是否被 workbench 波及 — 通过

- 新 token 定义在 `index.css :root`，值与被替换的原 hex 逐一相等 →
  整卷/讲评页 computed style 前后应零差异（QA 截图 diff 仍需跑，属主代理
  验收项，非本 CR 能证）。
- 选择器作用域干净：paper-browse 改动全在 `.paper-browse-*`，workbench
  改动全在 `.draft-*`，两组无交叉；新 token 是纯新增全局变量，不影响任何
  未改文件的既有 var() 解析。

### 3. workbench tsx 是否越出 display-only — 通过（不适用）

diff 零 tsx 改动，`DraftPaperWorkbench.tsx` 未进入本刀。CSS 侧仅
`.draft-preview-desk` 背景 `--surface-strong`(#ededea 中性) →
`--paper-desk-bg`(#f4f1ea 暖)——这是 plan「工作台预览入暖」的**有意**视觉
变化（非零视觉面），且仍是 flat token 填充、无渐变，去渐变桌约束守住。
A4 纸面 Resting 阴影 `0 1px 2px rgba(30,30,28,.06)` 为既有值，本刀只加
注释确认，未改。

### 4. DESIGN.md 法条是否忠实 program.md — 通过

对照 program.md「割裂议题 grilling 落锤」五裁点原文：

- **色温法**：忠实。「纸页入暖（整卷/讲评/工作台预览=暖纸桌+暖纸），
  工具页中性」「my-space 微缩 A4 卡=暖纸卡浮中性页」均照录，措辞未变意。
- **命名法**：忠实。「对外统一个人空间／页题弃已保存的草稿卷／页内分区仍
  叫草稿卷／实施归卷宗柜刀」逐条对应。
- **删除法**：忠实（本刀确认既有条文，未重写），两档划分与 program 点 4
  一致。
- Paper 小节 + 色温法条明确标注"等值转正、零视觉变化、非新配色决策"，未把
  转正夸大为设计新增，符合范围纪律。

无私自演绎到与 program 相悖的程度。两处轻微 elaboration 见 Should Watch。

### 5. palette-hex 护栏 + Forbidden 面 — 通过

- **Forbidden 面零触碰**：diff 6 文件无一属 print/PDF/DOCX 导出样式或
  my-space；契约面干净。
- **护栏不回退**：新增 5 个 hex 全部落在 `index.css :root` token 定义里
  （新增色值走 token），无散落硬编码新增；verify:all 绿即护栏放行。
- **verify 脚本重钉正确**（plan Forbidden 显式豁免 verify 脚本，不越界）：
  - `verify-c8`：desk 断言 `--surface-strong`→`--paper-desk-bg`，仍校验
    "flat token 非 gradient"，去渐变守卫未削弱。
  - `verify-draft-workbench-visual-unify`：`#ffffff` 白名单 374→381。实测
    当前文件 `#ffffff` 恰在 L188/L381（L188=export-menu-trigger、
    L381=undo-toast），与注释所述 +7 行漂移（desk 注释 +4、a4-sheet 注释
    +3，均在 undo-toast 之上）一致；两处均为**既有** #ffffff，本刀未新增
    #ffffff，白名单未掩盖新违规。

---

## Should Watch（低severity，不阻断）

1. **[QA 必跑] 前后 computed-style / 截图 diff**：token 等值是代码层论证，
   整卷/讲评页零视觉变化的最终证据仍是主代理的浏览器 diff；本 CR 不能替代。
2. **DESIGN.md 色温法工具页枚举略超 program 字面**：新条文把工具页举例扩为
   「home/找题/admin/my-space/**解析页错误态**」。program 只列到 my-space。
   "解析页错误态" 是新增举例——与「工具页中性」原则不冲突，但需留意别与
   同段「readingAnalysis 整页暖系不整改（退役孤儿）」被读成矛盾（错误态 ≠
   readingAnalysis 暖系正文，二者是不同组件）。措辞可后续收紧，非本刀阻断项。
3. **DESIGN.md 颜色登记表 `paper-desk-bg: "#f4f1ea"` 写死字面值**，而
   index.css 定义为 `var(--paper-bg)`（复用）。二者解析同值、当前无害；若
   将来改 `--paper-bg`，登记表字面值会漂移，需同步。
4. **非暖纸中性硬编码未换 token**（如 `#ededea`=已有 `--surface-strong`）。
   plan 说"已有全局 token 就换用"，DEV 保守未换。这是有意收窄范围（避免在
   零视觉刀里扩面 + similar-* 区块自声明不引入共享 token），判为合理取舍，
   记账留待后续中性收编刀，不在本刀强求。

---

## 结论

纯 CSS token 收编 + display-only 预览暖化 + 文档法条，实现与 plan/program
一致，五项未证实事实全部审过。**APPROVE，可 merge**（待主代理 QA 截图 diff
+ owner 工作台观感 + main CI 三项验收，属流程既定裁决点，非代码缺陷）。
