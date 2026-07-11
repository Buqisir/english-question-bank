---
name: 英语题库工作台
description: 老师备课用的英语题库与组卷工作台 — 中性纸底、近黑墨字、墨绿签名强调的专业工具台
colors:
  brand-teal: "#2C6E56"
  teal-50: "#EAF1ED"
  teal-100: "#CFE4DA"
  teal-200: "#A5CDBD"
  teal-400: "#5C9C83"
  teal-800: "#1E4A3A"
  teal-900: "#123020"
  bg: "#F6F6F4"
  surface: "#FFFFFF"
  surface-2: "#EDEDEA"
  ink: "#1E1E1C"
  ink-muted: "#6A6A64"
  ink-faint: "#9A9A93"
  border-subtle: "#E8E8E4"
  border: "#D8D8D2"
  border-strong: "#C6C6C0"
  success: "#059669"
  warning: "#d97706"
  danger: "#dc2626"
  paper-bg: "#f4f1ea"
  paper-desk-bg: "#f4f1ea"
  paper-ink: "#4a4438"
  paper-ink-strong: "#2c2820"
  paper-border: "#e6e2d7"
typography:
  ui:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "16px"
    lineHeight: 1.5
  paper:
    fontFamily: "'Times New Roman', Times, SimSun, 'Songti SC', STSong, serif"
    fontSize: "16px"
    lineHeight: 1.7
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
  display:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 600
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
  label:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 500
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  pill: "999px"
spacing:
  1: "4px"
  2: "8px"
  3: "12px"
  4: "16px"
  5: "24px"
components:
  button-primary:
    backgroundColor: "{colors.brand-teal}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "16px"
  chip:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "4px 12px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
---

# Design System: 英语题库工作台

## 1. Overview

**Creative North Star: "The Professional Instrument"（专业工具台）**

整个界面是一台安静、可信赖的专业工具。它的底是真中性的浅纸色（#F6F6F4，不偏冷 slate、不偏暖米），字是近黑的中性墨（#1E1E1C），线是中性灰（#D8D8D2），签名强调是一抹沉稳的墨绿（#2C6E56）。它追求的是 Linear / Figma 那种"消失在任务里"的工具质感——克制、精确、可信，但用墨绿这一笔带出知识感的签名，刻意远离通用 SaaS 的那种蓝。

配色策略是**克制（Restrained）**：中性色承载几乎整个表面，墨绿只作小面积签名强调（主操作、当前选中、链接、焦点），从不铺满、从不装饰。中性纸底 + 近黑墨 + 墨绿点睛，是一套精确、专业、有分寸的语言。

系统明确拒绝五种长相：**通用 SaaS 蓝**（#3b82f6 / #2563eb 那类冷 slate 蓝，是被淘汰的老经典模式，绝不再引入）、AI 生成的千篇一律感（紫色渐变、玻璃拟态、科技紫强调）、花哨的营销 SaaS 风（大渐变 banner、堆动效）、塞满的后台管理系统（信息过载的表格墙）、幼稚的教育 App（卡通、超大圆角、糖果配色）。

**Key Characteristics:**
- 中性浅纸底 + 近黑中性墨 + 中性灰线，整体安静、专业、精确
- 墨绿（#2C6E56）为唯一强调色相，小面积、签名般克制
- 克制配色：中性色占绝大多数表面，强调色 ≤10%
- 扁平为主，阴影克制；深度靠中性分层与细线，不靠投影
- 精细、克制的组件手感（薄边、低阴影、小圆角）
- 单一强调色相：只有墨绿，无蓝、无紫、无赭红红笔遗留

## 2. Colors

中性纸调铺底，墨绿作签名般的小面积强调，近黑墨保证可读。所有墨绿取自同一条明度均匀的色阶梯子（OKLCH 色相锁定 H≈166）。

### Brand（唯一强调色相）
- **Teal 墨绿 600** (#2C6E56): 主强调 — 主操作按钮、当前选中、链接、焦点环。系统的"签名"，小面积使用，绝不铺满或装饰。对白 6.05:1、对中性底 5.59:1，均过 AA。

### Teal Ramp（墨绿色阶，明度均匀、逐档 AA 验证）
- **50** (#EAF1ED): 选中浅态 / soft tint 浅底。
- **100** (#CFE4DA): tag 底 / 浅 hover。
- **200** (#A5CDBD): 选中态边 / 分隔强调。
- **400** (#5C9C83): 图标 / 次级强调。
- **600** (#2C6E56): 品牌主色（见上）。
- **800** (#1E4A3A): 深强调字（对中性底 9.26:1）。
- **900** (#123020): 最深 / 强调标题（对中性底 13.21:1）。

### Neutral（中性纸调，承载绝大多数表面）
- **Bg 底** (#F6F6F4): 主背景，真中性（chroma≈0），避开冷 slate 与暖米两个坑。
- **Surface 面** (#FFFFFF): 卡片、面板、输入框主面。
- **Surface-2 次层** (#EDEDEA): 嵌套区分、hover 中性态、次级面板。
- **Ink 正文墨** (#1E1E1C): 正文与标题，近黑中性，对底 15.4:1。
- **Muted Ink 弱墨** (#6A6A64): 次要说明文字 — 中性灰，对底 5.03:1，达 AA 才用于正文。
- **Faint Ink 极弱墨** (#9A9A93): 仅限非正文标注（占位、禁用、极次要标签），不可作正文。
- **Borders 边线** (#E8E8E4 subtle / #D8D8D2 / #C6C6C0 strong): 中性灰分隔与边框，按层级选强弱。

### Semantic（状态语义，独立于强调色相，不参与"墨绿签名"预算）
- **Success 成功** (#059669): 低难度指示 / 成功态。emerald，比品牌墨绿更亮，与之可区分。
- **Warning 提醒** (#d97706): 琥珀，提示态。
- **Danger 危险** (#dc2626): 红，错误 / 删除。

语义色取成熟的中性专业工具惯用值（与"专业工具台"方向自洽），非旧暖纸方向的暖化值。它们作 chip 底 / 边 / 图标 / 大字（≥3:1）合格；**作小正文文字对浅底仅约 3–4.5:1，是跨文件语义色统一 + AA 达标的既有债**，留待独立刀，不在配色刀内落地。

### Paper（暖纸系，色温法专属 token 家族 — 仅纸页壳，见下方 The Warm-Paper Boundary）
- **Paper Bg 纸页底** (#F4F1EA): 整卷/讲评页页基底暖米、工作台预览暖纸桌（`--paper-desk-bg` 复用同值）。
- **Paper Ink 暖墨** (#4A4438): 纸页壳次级正文/rail 项/答案行文字。
- **Paper Ink Strong 暖墨·强** (#2C2820): 纸页壳标题、选中态文字。
- **Paper Border 暖边** (#E6E2D7): 讲评栏面板边线。
- 收编自 paper-browse/讲评页历史暖色硬编码的**等值转正**（零视觉变化），不是新配色决策；实现见 `app/src/index.css` `--paper-*` 定义 + `paperBrowsePage.css` / `DraftPaperWorkbench.css` 引用。

### Named Rules

**The Green-Pen Rule（绿笔原则）.** 墨绿是签名，不是壁纸。强调色（墨绿任一档）合计占任一屏 ≤10%；它的稀有正是其分量所在。要铺面，铺中性，不铺墨绿。所有绿只取自上面这条色阶梯子（色相锁定 H≈166），**不掺任何别的色相的绿**（不掺青、不掺草绿、不掺 emerald 亮绿）。

**The True-Neutral Rule（中性底原则）.** 底与面是真中性（chroma≈0，#F6F6F4 / #FFFFFF / #EDEDEA），既不偏冷 slate 蓝，也不偏暖米黄。"温度"由墨绿签名、排版、留白和文案口吻承载，不由背景染色承载。（历史上的"配色锁定/禁改 token"铁律已随墨绿方向作废：token 现在是一套可维护的设计系统，改色是正当的设计决策，但**必须同步更新钉死颜色的 CI 断言**，否则回归护栏会误报。）

**The Warm-Paper Boundary / 色温法（暖纸边界，owner 拍板 2026-07-09，割裂议题 grilling 落锤 2026-07-10 改判——docs/cuts/draft-desk/program.md 关联决策）.** 病根是「纸不像纸」：纸页要读出"纸"的物理隐喻，工具页要读出"工具"的中性专业感——两套色温是设计意图，不是分裂事故。**纸页入暖**：整卷页 / 讲评页 / 工作台预览（桌 + A4 纸面）统一走 `--paper-*` token 家族（见上方 Paper 小节）；**工具页中性**：home / 找题 / admin / my-space / 解析页错误态等一切工具 chrome 仍走本文件的中性 token 体系 + 墨绿签名，无例外。纸页现存的暖色硬编码是**等值转正**为 `--paper-*` token（暖纸转正小刀，零视觉变化），不是新引入的颜色——新代码在纸页范围内可以直接用 `--paper-*`，在工具页范围内仍不得出现暖米色。`readingAnalysis.css` 整页暖系**不豁免也不整改**（owner 拍板 2026-07-10）：该页是待退役孤儿支（flow-panel 刀 3 挂账），随退役刀一并销账，不作为色温法的合法例外先例；my-space 微缩 A4 卡＝暖纸卡浮中性页（卡本身可暖，卡外的 my-space 页壳仍中性）。

**The Deletion-Cost Rule（成本定交互，owner 拍板 2026-07-10）.** 删除交互不追求全站同一形态，追求同一**规则**：**可恢复的删除**（对象还在库里/可轻易重建，如工作台移除题组）= 即删 + toast 撤销，不设确认弹窗（低成本操作的确认弹窗只会训练确认盲点）；**不可逆的删除**（永久删除 + 有陪葬物，如个人空间删卷及其 PDF）= 具名确认模态（alertdialog，标题写明删什么、陪葬什么）。两处现状（工作台即删撤销 / my-space 模态确认）均符合本规则，2026-07-10 审计 P1#9「双标」判定以本规则闭环——差异是故意的、由删除成本决定。若未来某面要从确认模态改为即删撤销，先做软删除/回收站兜底。

**The Personal-Space Naming Rule（命名法，owner 拍板 2026-07-10，割裂议题 grilling 落锤——docs/cuts/draft-desk/program.md 关联决策）.** 对外统一叫「个人空间」，页题弃用「已保存的草稿卷」；页内分区仍叫「草稿卷」（个人空间内部按草稿卷分组，不是同义重复）。本条只入条文——顶栏/页题/保存弹窗措辞的实施归卷宗柜刀。

**The Single-Hue Rule（单色相强调）.** 全站强调只有墨绿一个色相（OKLCH H≈166）。**禁止**引入：SaaS 蓝（#3b82f6 / #2563eb 及一切 slate/blue，H≈250，是被淘汰的老经典模式）、科技紫（#6366f1 靛紫及一切 purple/violet）、赭红暖金红笔（旧"批注卷子"方向的遗留强调）。墨绿不是蓝——蓝在 H≈250，墨绿在 H≈166，色相边界清晰。语义色（success 绿 / warning 琥珀 / danger 红）是独立的状态语义，各守其位，不算强调色、不受墨绿预算约束。功能性分类色板（数据语义：如七选五线索组 data-seven-color 五色系、卷面证据色）不算强调色，不受单色相约束；新增分类色板需 UI direction 批准（本条 2026-07-08，小川/owner 委托）。

## 3. Typography

**UI Font:** Inter（回退 system-ui / -apple-system / Segoe UI）
**Paper Font:** 'Times New Roman' / SimSun / 'Songti SC'（中英混排衬线，仅渲染卷面内容时用）
**Mono Font:** ui-monospace / SF Mono（代码、ID、技术字段）

**Character:** 工具侧是一套调校良好的无衬线（Inter），靠字重与字号拉层级，不做 display/body 配对。渲染真题/解析的卷面切换到中英混排衬线，给"卷子"的质感。两套字体各守一层。

### Hierarchy
- **Display 标题** (Inter, 600, 28px): 页面/区块主标题。固定 rem，不用 clamp 流体缩放。
- **Body 正文** (Inter, 400, 16px, 1.5): 工具侧正文与说明。
- **Label 标签** (Inter, 500, 12px): 字段名、chip、徽标、表头。
- **Paper Body 卷面正文** (衬线, 16px, 1.7): 题干、篇章、解析；行高更松，便于通读。

### Named Rules
**The Two-Font-Lanes Rule（双字道铁律）.** Inter 管工具界面，衬线只在渲染卷面内容时登场，绝不互换。工具里乱用衬线即为错；卷面正文用无衬线即丢质感。

## 4. Elevation

扁平为主，中性分层为辅，阴影克制。深度主要靠中性色的层叠（bg → surface → surface-2）和中性细线分隔表达，而不是投影。阴影只在两种时刻出现：静止态的极轻贴地阴影，和浮层（弹层/悬浮卡）的环境阴影。

### Shadow Vocabulary
- **Resting 贴地** (`box-shadow: 0 1px 2px rgba(30,30,28,0.06)`): 卡片/面板静止态的最轻交代，几乎不可见。
- **Floating 浮层** (`box-shadow: 0 8px 24px rgba(0,0,0,0.12)`): 弹层、悬浮卡、下拉。
- **Focus Ring 焦点环** (`box-shadow: 0 0 0 3px rgba(44,110,86,0.20)`): 键盘焦点与选中态，用墨绿签名，而非中性灰或蓝色辉光（单色相原则）。

### Named Rules
**The Flat-By-Default Rule（默认扁平）.** 表面静止时是平的；阴影只作为状态（悬浮、浮层、焦点）的回应出现，不作常驻装饰。

## 5. Components

### Buttons
- **Shape:** 小圆角（6px / `{rounded.md}`）。
- **Primary:** 墨绿底（#2C6E56）+ 白字（#FFFFFF，6.05:1），padding 8px 16px。主按钮用墨绿签名，宣告"当前主操作"。
- **Hover / Focus:** 悬浮压深一档（如 #1E4A3A / teal-800）；焦点用墨绿焦点环（`0 0 0 3px rgba(44,110,86,0.20)`）。
- **Secondary / Ghost:** 透明或 surface-2 底 + 中性细边 + ink 文字；用于次要操作。

### Chips（筛选/标签，找题主面的关键组件）
- **Style:** 胶囊形（999px）+ 中性底 + ink 文字 + 中性细边（#D8D8D2）。
- **State:** 选中态用墨绿边/底（teal-200 边 或 teal-50 底 + teal-800 字），未选中保持中性。承接结构化筛选能力，升级到深教学维度（考点/承上启下/题型/词性/主题），而不是浅的题型/年份/地区装饰 chip。

### Cards / Containers
- **Corner Style:** 8px（`{rounded.lg}`）。
- **Background:** Surface（#FFFFFF）或 surface-2（#EDEDEA）更深一层，按嵌套区分。
- **Shadow Strategy:** 默认贴地阴影（Resting），见 Elevation。
- **Border:** 中性细线（#D8D8D2），按层级可换 subtle/strong。
- **Internal Padding:** 16px（`{spacing.4}`）。

### Inputs / Fields
- **Style:** Surface 底 + 中性细边（#D8D8D2）+ 6px 圆角，padding 8px 12px。
- **Focus:** 墨绿边 + 墨绿焦点环，不挪动布局。
- **占位符:** 用 muted-ink #6A6A64 级别并验证达到 4.5:1，不用极弱墨 #9A9A93"显优雅"。

### Navigation
- **Style:** 中性工具外壳；当前项用墨绿强调（文字或下划），其余保持中性。手搓 `?view=` 路由，非 react-router。
- 注意现实：导航逻辑现塞在很大的 `App.tsx`，是重构痛点，但不属于配色范畴。

### Signature Component: ConciergeDesk AI 找题主面
产品的门面与灵魂面。owner 珍惜它"干净、简洁、AI 感"的外壳 — 那是资产，不能丢。问题是"空"不是"简洁"：要用**内容**（默认按来源卷分组的题库 feed）填空，用 **AI 口吻的筛选 chip** 收窄，chip 维度升级到深教学维度。中性 + 墨绿签名的外壳气质保持不变。

### Signature Component: PaperSurface 卷面
渲染真题/解析的纸面：卷面纸感、中英混排衬线、证据高亮（支持=绿 / 陷阱=琥珀，answer-evidence 语义色，锁定契约）。卷面是渲染考试内容的独立层，有自己的证据色系统，**不参与工具外壳的配色改造**（它由 `shared/papersurface/**` 契约护栏管辖）。

## 6. Do's and Don'ts

### Do:
- **Do** 让中性色（bg / surface / surface-2）承载绝大多数表面，墨绿只作 ≤10% 的小面积签名强调（The Green-Pen Rule）。
- **Do** 主按钮用墨绿底 + 白字（6.05:1），当前选中/链接/焦点用墨绿签名。
- **Do** 默认扁平，用中性分层 + 中性细线交代层次；阴影只回应状态。
- **Do** 让正文与占位符对比度 ≥ 4.5:1（WCAG AA 上线标准）；极弱墨 #9A9A93 只用于非正文。
- **Do** 所有绿取自同一条墨绿色阶梯子（H≈166），跨界面一致。
- **Do** 把筛选 chip 升级为真结构化的深教学维度（考点/承上启下/题型/词性/主题），让"内容是主角"。
- **Do** 给每个动效配 `prefers-reduced-motion` 退化；交互态 150–250ms。
- **Do** 改颜色 token 时同步更新钉死该颜色的 CI 断言（否则回归护栏误报）。

### Don't:
- **Don't** 引入任何蓝色强调（#3b82f6 / #2563eb 及一切 slate/blue）— 那是被淘汰的老经典模式（The Single-Hue Rule）。
- **Don't** 引入科技紫（#6366f1 靛紫及一切 purple/violet）作强调。
- **Don't** 让底或面偏冷 slate 或偏暖米 — 底是真中性（The True-Neutral Rule）。
- **Don't** 掺入别的色相的绿（青、草绿、emerald 亮绿）— 只用墨绿梯子里的绿。
- **Don't** 做成 **AI 生成的千篇一律感**：紫色渐变、玻璃拟态、一眼假的随手生成质感。
- **Don't** 做成 **花哨的营销 SaaS 风**：大渐变 banner、弹窗、堆动效、营销词。
- **Don't** 做成 **塞满的后台管理系统**：把筛选控件做成视觉主角的表单墙、信息过载的表格。
- **Don't** 做成 **幼稚的教育 App**：卡通、超大圆角、糖果配色。
- **Don't** 用 `border-left/right` 粗于 1px 的色条做卡片/列表/提示的强调（宜用整边/底色/前置图标）。
- **Don't** 在工具界面乱用衬线，或在卷面正文用无衬线（The Two-Font-Lanes Rule）。
- **Don't** 把"不空"做成"堆筛选控件" — 用内容（题库本身）填空，用 AI 口吻 chip 收窄（已验证的方向教训）。
