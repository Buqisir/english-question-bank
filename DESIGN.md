---
name: 英语题库工作台
description: 老师备课用的英语题库与组卷工作台 — 暖色卷面、近黑墨、赭红与暖金的编辑感工具
colors:
  accent-oxblood: "#B8323C"
  accent-terracotta: "#B8732E"
  accent-coral: "#C97B5A"
  gold: "#C49B2A"
  gold-soft: "#C6A044"
  paper: "#FFFDF8"
  surface: "#FAFAF7"
  surface-warm: "#F4F2EC"
  surface-sand: "#EFEDE6"
  surface-deep: "#F0EBE0"
  ink: "#1A1A1A"
  ink-muted: "#6B645C"
  ink-faint: "#9A9180"
  border: "#E5E3DC"
  border-warm: "#DED9CF"
  border-strong: "#B8B0A0"
  success: "#4A9D7F"
  warning: "#D97706"
  danger: "#C4543E"
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
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  card:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "16px"
  chip:
    backgroundColor: "{colors.surface-warm}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "4px 12px"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
---

# Design System: 英语题库工作台

## 1. Overview

**Creative North Star: "The Teacher's Desk"（老师批注过的卷子）**

整个界面是一张铺在书桌上、被老师批注过的卷子。它的底是暖米白的纸（#FFFDF8），字是近黑的墨（#1A1A1A），线是暖沙色的（#E5E3DC），强调是红笔的赭红（#B8323C）和暖金（#C49B2A）。这不是隐喻拼贴 — 它就是 AI 模式（找题主面）现在真实的样子，也是产品要留下来的外壳。温度不靠卡通或糖果色，靠的是纸感、衬线、暖中性和红笔般克制的强调。

配色策略是**克制（Restrained）**：暖中性承载几乎整个表面，赭红与暖金只作小面积强调（主操作、当前选中、状态指示），从不铺满、从不装饰。近黑墨 + 暖纸 + 红笔，是一套编辑感、纸感、有人味的语言，刻意远离 SaaS 那种通用蓝。

系统明确拒绝五种长相：**通用 AI 蓝**（经典模式那套 slate 蓝正在被淘汰，不要再引入蓝色强调）、AI 生成的千篇一律感（紫色渐变、玻璃拟态）、花哨的营销 SaaS 风（大渐变 banner、堆动效）、塞满的后台管理系统（信息过载的表格墙）、幼稚的教育 App（卡通、超大圆角、糖果配色）。

**Key Characteristics:**
- 暖米白纸 + 近黑墨 + 暖沙线，整体编辑/纸感
- 赭红（#B8323C）为主强调，暖金（#C49B2A）为次，小面积、红笔般克制
- 克制配色：暖中性占绝大多数表面，强调色 ≤10%
- 扁平为主，阴影克制；深度靠暖色调分层与细线
- 精细、克制的组件手感（薄边、低阴影、小圆角）
- 无蓝：slate 蓝是待淘汰的经典模式遗留

## 2. Colors

暖中性纸调铺底，赭红与暖金作红笔般的小面积强调，近黑墨保证可读。

### Primary
- **Oxblood 赭红** (#B8323C): 主强调 — 强调文字、当前选中、关键指示。系统的"红笔"，小面积使用，绝不铺满或装饰。

### Secondary
- **Terracotta 赭石** (#B8732E) / **Coral 暖珊瑚** (#C97B5A): 次级暖强调，用于区分性的标记与高难度指示。
- **Gold 暖金** (#C49B2A) / **Soft Gold 软金** (#C6A044): 选中态边框、中等难度指示、点到为止的活动标记。

### Neutral（暖纸调，承载绝大多数表面）
- **Paper 卷面** (#FFFDF8): 主背景，整个 AI 模式的纸面。
- **Surface 层** (#FAFAF7 / #F4F2EC / #EFEDE6 / #F0EBE0): 由浅到深的暖中性分层，用于面板、卡片、嵌套区分。
- **Ink 正文墨** (#1A1A1A): 正文与标题，近黑暖调，保证对比度。
- **Muted Ink 弱墨** (#6B645C): 次要说明文字 — 已是暖中灰，对暖纸达到 4.5:1 才用于正文。
- **Faint Ink 极弱墨** (#9A9180): 仅限非正文标注（占位、禁用、极次要标签），不可作正文。
- **Borders 边线** (#E5E3DC / #DED9CF warm / #B8B0A0 strong): 暖沙色分隔与边框，按层级选强弱。

### Semantic
- **Success 成功** (#4A9D7F): 暖绿，低难度指示 / 成功态。
- **Warning 提醒** (#D97706): 琥珀，提示态。
- **Danger 危险** (#C4543E): 暖红，错误/删除；与赭红同系但更偏砖红，避免与主强调混淆。

### Named Rules
**The Color-Lock Rule（配色锁定铁律）.** 当前 AI 模式配色是 owner 反复确认的资产，**禁止改动任何颜色 token 或 concierge 写死的 hex**。任何重设计只动结构、层级、间距、行为，配色零改。这条优先于一切视觉偏好。

**The No-Blue Rule（无蓝铁律）.** slate 蓝（#3b82f6 / #2563eb）属于**正在被淘汰的经典模式**。AI 模式与一切新界面的强调色是赭红 + 暖金，**不要引入任何蓝色强调**。看到蓝，就是滑回经典模式。

**The Red-Pen Rule（红笔克制）.** 赭红与暖金是红笔，不是底色。强调色合计占任一屏 ≤10%；它们的稀有正是其分量所在。要铺面，铺暖中性，不铺强调。

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

扁平为主，暖色调分层为辅，阴影克制。深度主要靠暖中性的层叠（paper → surface → sand）和暖沙细线分隔表达，而不是投影。阴影只在两种时刻出现：静止态的极轻贴地阴影，和浮层（弹层/悬浮卡）的环境阴影。

### Shadow Vocabulary
- **Resting 贴地** (`box-shadow: 0 1px 2px rgba(26,26,26,0.06)`): 卡片/面板静止态的最轻交代，几乎不可见。
- **Floating 浮层** (`box-shadow: 0 8px 24px rgba(0,0,0,0.12)`): 弹层、悬浮卡、下拉。
- **Focus Ring 焦点环** (`box-shadow: 0 0 0 2px rgba(0,0,0,0.08)`): 键盘焦点与选中态。焦点环用中性墨色而非蓝色辉光（无蓝铁律）。

### Named Rules
**The Flat-By-Default Rule（默认扁平）.** 表面静止时是平的；阴影只作为状态（悬浮、浮层、焦点）的回应出现，不作常驻装饰。

## 5. Components

### Buttons
- **Shape:** 小圆角（6px / `{rounded.md}`）。
- **Primary:** 近黑墨底（#1A1A1A）+ 暖纸字（#FFFDF8），padding 8px 16px。主按钮用墨色而非强调色，把赭红留给"红笔"语义。
- **Hover / Focus:** 悬浮微调底色明度；焦点用中性焦点环（`0 0 0 2px rgba(0,0,0,0.08)`），不用蓝。
- **Secondary / Ghost:** 透明或 surface-warm 底 + 暖细边 + ink 文字；用于次要操作。

### Chips（筛选/标签，找题主面的关键组件）
- **Style:** 胶囊形（999px）+ surface-warm 底 + ink 文字 + 可选暖细边。
- **State:** 选中态用赭红或暖金边/底，未选中保持暖中性。承接经典模式的结构化筛选能力，将来升级到深教学维度（考点/承上启下/题型/词性/主题），而不是浅的题型/年份/地区装饰 chip。

### Cards / Containers
- **Corner Style:** 8px（`{rounded.lg}`）。
- **Background:** Paper（#FFFDF8）或更深一层暖中性，按嵌套区分。
- **Shadow Strategy:** 默认贴地阴影（Resting），见 Elevation。
- **Border:** 暖沙细线（#E5E3DC），按层级可换 warm/strong。
- **Internal Padding:** 16px（`{spacing.4}`）。

### Inputs / Fields
- **Style:** Paper 底 + 暖细边（#E5E3DC）+ 6px 圆角，padding 8px 12px。
- **Focus:** 中性焦点环，不挪动布局。
- **占位符:** 用 muted-ink #6B645C 级别并验证达到 4.5:1，不用极弱墨 #9A9180"显优雅"。

### Navigation
- **Style:** 暖纸工具外壳；当前项用赭红或暖金强调（文字或下划），其余保持暖中性。手搓 `?view=` 路由，非 react-router。
- 注意现实：导航逻辑现塞在 ~11000 行的 `App.tsx`，是重构痛点，但不属于配色范畴。

### Signature Component: ConciergeDesk AI 找题主面
产品的门面与灵魂面。owner 珍惜它"干净、简洁、AI 感"的暖色外壳 — 那是资产，不能丢。问题是"空"不是"简洁"：要用**内容**（默认按来源卷分组的题库 feed）填空，用 **AI 口吻的筛选 chip** 收窄，chip 维度升级到深教学维度。配色与外壳气质保持不变。

### Signature Component: PaperSurface 卷面
渲染真题/解析的纸面：暖卷面、中英混排衬线、暖金活动轨（#C6A044，点到为止）、暖墨与暖细线。是 North Star 里那张被批注的卷子。

## 6. Do's and Don'ts

### Do:
- **Do** 让暖中性（paper / surface / sand）承载绝大多数表面，赭红与暖金只作 ≤10% 的小面积强调（The Red-Pen Rule）。
- **Do** 主按钮用近黑墨底 + 暖纸字，把赭红留给"红笔"语义（强调/选中/状态）。
- **Do** 默认扁平，用暖色调分层 + 暖沙细线交代层次；阴影只回应状态。
- **Do** 让正文与占位符对比度 ≥ 4.5:1（WCAG AA 上线标准）；极弱墨 #9A9180 只用于非正文。
- **Do** 把筛选 chip 升级为真结构化的深教学维度（考点/承上启下/题型/词性/主题），让"内容是主角"。
- **Do** 给每个动效配 `prefers-reduced-motion` 退化；交互态 150–250ms。

### Don't:
- **Don't** 改动任何颜色 token 或 concierge 写死的 hex（The Color-Lock Rule）。重设计只动结构/层级/行为。
- **Don't** 引入任何蓝色强调（#3b82f6 / #2563eb）— 那是待淘汰的经典模式（The No-Blue Rule）。
- **Don't** 做成 **AI 生成的千篇一律感**：紫色渐变、玻璃拟态、一眼假的随手生成质感。
- **Don't** 做成 **花哨的营销 SaaS 风**：大渐变 banner、弹窗、堆动效、营销词。
- **Don't** 做成 **塞满的后台管理系统**：把筛选控件做成视觉主角的表单墙、信息过载的表格。
- **Don't** 做成 **幼稚的教育 App**：卡通、超大圆角、糖果配色。
- **Don't** 用 `border-left/right` 粗于 1px 的色条做卡片/列表/提示的强调（现 concierge 有此用法，宜逐步改为整边/底色/前置图标）。
- **Don't** 在工具界面乱用衬线，或在卷面正文用无衬线（The Two-Font-Lanes Rule）。
- **Don't** 把"不空"做成"堆筛选控件" — 用内容（题库本身）填空，用 AI 口吻 chip 收窄（已验证的方向教训）。
