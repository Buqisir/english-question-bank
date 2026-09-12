---
name: 英语题库工作台
description: 老师备课用的英语题库与组卷工作台 — 软绿白纸底、墨黑动作、墨绿身份、卷子层不配色
colors:
  bg: "#F3F5F1"
  surface: "#FFFFFF"
  surface-2: "#E9ECE6"
  border-subtle: "#E3E6E0"
  border: "#D5D9D2"
  ink: "#1F1F1D"
  ink-muted: "#6B6E68"
  ink-faint: "#9A9D97"
  action: "#1F1F1D"
  action-hover: "#3A3A37"
  identity: "#2C6E56"
  success: "#059669"
  warning: "#d97706"
  danger: "#dc2626"
  paper-bg: "#f6f6f4"
  paper-desk-bg: "var(--eqb-color-bg)"
  paper-ink: "#4a4438"
  paper-ink-strong: "#2c2820"
  paper-border: "#e6e2d7"
  passage-reading: "#4199E3"
  passage-cloze: "#A07DE5"
  passage-seven: "#D86EB0"
  passage-grammar: "#E56E66"
  passage-writing: "#D77A03"
  passage-continuation: "#659B7B"
typography:
  ui:
    fontFamily: "Inter, 'PingFang SC', 'Hiragino Sans GB', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "14px"
    lineHeight: 1.5
  paper:
    fontFamily: "'Times New Roman', Times, SimSun, 'Songti SC', STSong, serif"
    fontSize: "16px"
    lineHeight: 1.7
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
  display:
    fontFamily: "Inter, 'PingFang SC', ui-sans-serif, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 600
  body:
    fontFamily: "Inter, 'PingFang SC', ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
  label:
    fontFamily: "Inter, 'PingFang SC', ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 500
rounded:
  badge: "4px"
  control: "8px"
  card: "12px"
  search: "16px"
  pill: "999px"
  circle: "50%"
spacing:
  1: "4px"
  2: "8px"
  3: "12px"
  4: "16px"
  5: "24px"
  6: "32px"
components:
  button-primary:
    backgroundColor: "{colors.action}"
    textColor: "{colors.surface}"
    rounded: "{rounded.circle}"
    padding: "0"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "16px"
  chip:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.pill}"
    padding: "0 12px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
---

# Design System: 英语题库工作台

## 1. Overview

**Creative North Star: 「安静、精密、有分量。动作用墨，身份用墨绿，其余不配色。」**

整个界面是一张有分量的书桌，不是搜索框漂在空白里。底是带极弱绿相的纸白（#F3F5F1），面是纯白卡片，字是近黑墨（#1F1F1D），线是软灰绿发丝。短动作（搜索圆钮、行上「+」、选中芯片）用墨黑填充；墨绿（#2C6E56）只做品牌点与头像，不再铺按钮、不再当选中色、不再当焦点环。卷子行不配色——没有值得标的痕迹就不标。

首页是日期流（最近入库 8 套），浏览是年份档案。内容是主角：老师一打开就能搜，也能直接翻最近入库的卷。

系统明确拒绝五种长相：**通用 SaaS 蓝**、AI 生成的千篇一律感（紫色渐变、玻璃拟态）、花哨的营销 SaaS 风、塞满的后台管理系统、幼稚的教育 App（卡通、超大圆角、糖果配色）。也拒绝把墨绿当主按钮、给模拟卷上色、在卷子层点「在草稿卷 / 已讲评」。

**Key Characteristics:**
- 软绿白纸底 + 近黑墨 + 发丝灰线，安静、精密、有分量
- 墨做动作：黑填充只给短标签或纯图标
- 墨绿只做身份：品牌点、头像
- 卷子层不配色；题型六色只留给篇章层
- 整块响应：hover 给整行着色，从不只改文字颜色
- 色必须有差事：没有差事的色点不出现

## 2. Colors

软绿白纸铺底，墨黑做短动作，墨绿只做身份。语义色与纸页 token 独立，不参与「墨 / 身份」预算。

### Action（墨做动作）
- **Ink Action 墨动作** (#1F1F1D): 短标签或纯图标的填充——搜索提交圆钮、浏览行悬停「+」、选中筛选芯片。对白与对底均远超 AA。
- **Action Hover** (#3A3A37): 墨填充的悬停态。**填充悬停变浅，不变深。**

### Identity（墨绿只做身份）
- **Identity 墨绿** (#2C6E56): 品牌圆点、头像圆。对白 6.05:1。不当主按钮、不当选中芯片、不当焦点环、不当链接色。

### Neutral（纸调，承载绝大多数表面）
- **Bg 底** (#F3F5F1): 主背景，带极弱绿相的纸白。
- **Surface 面** (#FFFFFF): 卡片、搜索条、输入面。
- **Surface-2 次层** (#E9ECE6): 整行 hover、未选芯片悬停底、真题徽章软底。
- **Ink 正文墨** (#1F1F1D): 正文与标题，对底远超 AA。
- **Muted Ink 弱墨** (#6B6E68): 次要说明、日期标签、篇章数——对底 4.72:1，达 AA，可用于正文级次要文字。
- **Faint Ink 极弱墨** (#9A9D97): 仅限非正文（占位之外的极次要图标，如静止态 chevron）。不可作正文。
- **Borders 边线** (#E3E6E0 subtle / #D5D9D2): 未选芯片边、搜索条边、发丝分隔。

### Semantic（状态语义，不参与墨/身份预算）
- **Success 成功** (#059669)
- **Warning 提醒** (#d97706)
- **Danger 危险** (#dc2626)

语义色作 chip 底 / 边 / 图标 / 大字（≥3:1）合格；**作小正文文字对浅底仅约 3–4.5:1，是跨文件语义色统一 + AA 达标的既有债**，留待独立刀。

### Paper（纸页 token 家族 — 仅纸页壳）
- **Paper Bg 纸页底** (#F6F6F4): 整卷/讲评页页基底。
- **Paper Ink 暖墨** (#4A4438): 纸页壳次级正文/rail 项/答案行文字。
- **Paper Ink Strong 暖墨·强** (#2C2820): 纸页壳标题、选中态文字。
- **Paper Border 暖边** (#E6E2D7): 讲评栏面板边线。
- 本方向不改 `--paper-*` 字面值。工具页 chrome 走 bg / surface / ink，不得借用纸页 token。

### Passage types（题型六色 — 保留，尚未使用）
只许出现在篇章层行，卷子层不用：

| 题型 | 色 |
| --- | --- |
| 阅读 | #4199E3 |
| 完形 | #A07DE5 |
| 七选五 | #D86EB0 |
| 语法填空 | #E56E66 |
| 应用文 | #D77A03 |
| 读后续写 | #659B7B |

### Named Rules

**The Ink-Action Rule（墨做动作）.** 黑填充只给短标签或纯图标控件：搜索提交、加入「+」、选中筛选芯片。长文案控件（草稿丸、次级按钮、导航项）保持安静白底或透明，不用墨填满。

**The Identity-Only Teal Rule（墨绿只做身份）.** 墨绿只出现在品牌标记与头像。不当主操作、不当选中态、不当焦点环、不当行上色点。

**The Uncolored-Paper-Row Rule（卷子层不配色）.** 卷子行不上色。没有值得标的痕迹就不标。唯一候选痕迹是篇章层的「在草稿卷」（题组已在当前草稿卷中），留到题组详情屏验证。题型六色同样只在篇章层。真题用软底徽章（#E9ECE6、12px、圆角 4、无描边）；模拟不标。

**The Whole-Block Response Rule（整块响应）.** hover 给整行 / 整项铺 surface-2，从不只改文字颜色。

**The Color-Must-Earn-Its-Keep Rule（色必须有差事）.** 每一处非中性色都要能回答「它在帮老师做什么」。答不出就不上色。

**The Deletion-Cost Rule（成本定交互，owner 拍板 2026-07-10）.** 删除交互不追求全站同一形态，追求同一**规则**：**可恢复的删除**（对象还在库里/可轻易重建，如工作台移除题组）= 即删 + toast 撤销，不设确认弹窗；**不可逆的删除**（永久删除 + 有陪葬物，如个人空间删卷及其 PDF）= 具名确认模态。若未来某面要从确认模态改为即删撤销，先做软删除/回收站兜底。

**The Personal-Space Naming Rule（命名法，owner 拍板 2026-07-10）.** 对外统一叫「个人空间」，页题弃用「已保存的草稿卷」；页内分区仍叫「草稿卷」。

**The Warm-Paper Boundary（2026-08-28 修订：色温边界取消）.** 纸页页基底与工具页曾短暂分暖/中性；owner 实测后判定暖米过暖，`--paper-bg` 回到 #F6F6F4。北星方向的工具页底改为 #F3F5F1；纸页 `--paper-*` 字面值仍按上表保留。

## 3. Typography

**UI Font:** Inter + PingFang SC（回退 Hiragino Sans GB / system-ui）
**Paper Font:** 'Times New Roman' / SimSun / 'Songti SC'（中英混排衬线，仅渲染卷面内容时用）
**Mono Font:** ui-monospace / SF Mono（代码、ID、技术字段）

**Character:** 工具侧是一套调校良好的无衬线，靠字重与字号拉层级，不做 display/body 配对。渲染真题/解析的卷面切换到中英混排衬线。两套字体各守一层。工具界面 chrome **没有任何字号超过 20px**。

### Hierarchy
- **Year / Section 年份与档案数字** (Inter, 600, 20px, letter-spacing -0.02em): 浏览年份组头。
- **Row Title 行题** (Inter, 500, 14px): 套卷名。
- **UI Body 界面正文** (Inter, 400, 14px, 1.5): 搜索输入、主说明。
- **UI Compact 紧凑** (Inter, 400, 13px): 导航、芯片、主题摘要、篇章数、草稿丸。
- **UI Label 标签** (Inter, 500, 12px): 日期组头、真题徽章、极次要标注。
- **Paper Body 卷面正文** (衬线, 16px, 1.7): 题干、篇章、解析；行高更松，便于通读。
- **Paper-browse 角色字号**（卷面/浏览页 UI，与工具 chrome 分轨，本方向不改）：Compact Body 紧凑正文 14px。角色阶梯：28px Display / 16px Body / 14px Compact Body / 12px Label。

### Named Rules
**The Four-Step UI Type Ramp（工具界面四级字号）.** 工具界面只使用 **12 / 13 / 14 / 20**。行题 14/500；年份组头 20/600。不得为局部组件现场发明 11 / 15 / 16 / 18 / 21 / 28 等档。卷面正文属于独立的 Paper Font 字道，不受这条工具界面字号规则改写。

**The Two-Font-Lanes Rule（双字道铁律）.** Inter / PingFang 管工具界面，衬线只在渲染卷面内容时登场，绝不互换。工具里乱用衬线即为错；卷面正文用无衬线即丢质感。

## 4. Elevation

扁平为主。卡片用发丝阴影代替实线边；行内分隔线保留。阴影只在静止贴地与浮层两档出现。

### Shadow Vocabulary
- **Card 卡片** (`box-shadow: 0 0 0 1px rgba(30,30,28,0.05), 0 1px 2px rgba(30,30,28,0.06)`): 套卷卡片的发丝 + 贴地。
- **Floating 浮层** (`box-shadow: 0 8px 24px rgba(0,0,0,0.12)`): 草稿丸、弹层、下拉。
- **Focus Ring 焦点环** (`outline: 2px solid #1F1F1D; outline-offset: 2px`): 键盘焦点走墨，不走墨绿，不走蓝辉光。

### Named Rules
**The Flat-By-Default Rule（默认扁平）.** 表面静止时是平的；卡片的发丝阴影是结构交代，不是装饰光晕。浮层阴影只回应离开文档流的物件。

## 5. Components

### Buttons
- **Shape:** 短动作圆钮 50%；次级/导航 8px。
- **Primary（短动作）:** 墨底（#1F1F1D）+ 白图标，悬停浅一档（#3A3A37）。用于搜索提交与行上「+」。
- **Long-text controls:** 白底或透明，不用墨填。草稿丸白底墨字 + 发丝边 + 浮层阴影。
- **Secondary / Ghost:** 平时无底无边，hover 才浮出 surface-2，focus-visible 走墨焦点环。

### Chips（浏览筛选）
- **Size:** 高 28px，字 13px，胶囊 999px。
- **Unselected:** 透明底 + 边 #E3E6E0，字弱墨；悬停底 #E9ECE6。
- **Selected:** 墨底白字，边透明；悬停 #3A3A37。
- 芯片：全部 · 真题 · 模拟 · 库中实际出现的年份。必须真过滤。

### Cards / Rows
- **Card:** 12px 圆角，白底，发丝阴影（见 Elevation）。
- **Row:** 最小高度 48px，内衬 10px 14px，行间发丝分隔。整行 hover #E9ECE6。
- **Title:** 14/500。首页行题前加 13px 弱墨年份；浏览行不加（年份组已标年）。
- **真题徽章:** 软底 #E9ECE6，12px，圆角 4，无描边。模拟不标。
- **主题摘要:** 13px 弱墨；没有就空着。
- **右侧:** 「N 篇章」13px 弱墨 + 弱 chevron。浏览行悬停时，chevron 左侧出现 32px 墨圆「+」（加入草稿卷）。
- **卷子层不配色。**

### Inputs / Fields
- **Hero search（首页）:** 高 44px，圆角 16px，白底，提交是嵌在右端的墨圆钮。
- **Compact search（浏览）:** 高 36px，圆角 12px，同样的右端圆钮。
- **占位符:** 弱墨 #6B6E68（4.72:1），不用极弱墨「显优雅」。
- **Focus:** 墨焦点环，不挪动布局。

### Navigation
- **Topbar:** 透明无底、无 border-bottom。品牌 = 小墨绿圆点 + 14px/600 标题。右侧导航为图标 + 13px 文字，静止无填充，hover 浮出 8px 圆角底。头像为墨绿圆 + 首字母。手搓 `?view=` 路由，非 react-router。
- **Draft pill:** 右下浮层，白底发丝边，13px，浮层阴影。
- 注意现实：导航逻辑现塞在很大的 `App.tsx`，是重构痛点，但不属于本配色刀。

### Signature Component: ConciergeDesk AI 找题主面
产品的门面与灵魂面。首页是日期流，浏览是年份档案。外壳要干净，但不能空：用最近入库的套卷填空，用真过滤的芯片收窄。墨做动作、墨绿只做身份、卷子层不配色。

### Signature Component: PaperSurface 卷面
渲染真题/解析的纸面：卷面纸感、中英混排衬线、证据高亮（支持=绿 / 陷阱=琥珀，answer-evidence 语义色，锁定契约）。卷面是渲染考试内容的独立层，有自己的证据色系统，**不参与工具外壳的配色改造**（它由 `shared/papersurface/**` 契约护栏管辖）。

### Signature Component: Companion Analysis PDF 配套解析打印通道
可复用的教师解析出版面，与 PaperSurface 同属打印阅读系统但保持独立编排。固定为 A4 纵向；装订侧页边距镜像（内侧 21mm、外侧 17mm，上 17mm、下 19mm）。首张以紧凑卷名、出版标记和完整客观题答案速查起始，正文紧随其后进入固定双栏（栏距 8mm、中央 0.35pt 发丝线），不以固定封面高度或强制换页浪费首页下半页。正文按试卷顺序由左到右、由上到下连续展开。双栏借鉴成熟答案册的阅读效率，不复制机构标识、二维码、蓝色标题胶囊、文案或装饰性 trade dress；EQBANK 保持自己的墨绿出版身份。

- **色彩与线条：** 白纸、近黑正文、单一低饱和松烟绿签名（旧书封皮般沉静，不用鲜亮数字绿）；正文中的原文依据、衔接链和错项辨析都按出版物连续行文，不使用灰色或着色卡片。层级主要靠留白和 0.35pt / 0.7pt 发丝分隔线建立，不使用装饰性 chrome。
- **字体通道：** 中文阅读正文用衬线体，编辑层级、题号与标签用无衬线体，英文内容固定进入 Times 系衬线通道。双栏基础正文为 9pt / 13.6pt，范文为 9.2pt / 14.4pt；标题只通过无衬线字号、字重与间距逐级提升。
- **运行信息：** 后续页页眉持续显示 EQBANK 出版标记与当前部分，页脚持续显示卷名与页码；首页隐藏页眉，保留首张自身的出版标记。
- **内容边界：** 编排同一版本的教师可读答案与完整解析，包括材料级听力教学；公开导出读取已发布版本，Owner Review 使用鉴权的精确封存 revision。内部 facets、机器标签和退役教学字段不进入此打印通道。

### Named Rules

**The Single-Radius-Family Rule（圆角单一家族，northstar 2026-09-03 改判）.** 全站圆角只取阶梯 **{4px badge / 8px control / 12px card / 16px hero search / 999px pill}**，外加两个结构值：`0`（直角）与 `50%`（仅圆形控件——头像、圆点、圆形按钮）。方向性 shorthand 各分量在族内即合法。同一视图内保持一个圆角家族。**禁止**为单个组件现场发明 5px / 6px / 7px / 10px 这类族外档（要新档走 `docs/design-gaps.md`，见 §7 禁兜底法）。机器守门：`scripts/verify-radius-family.mjs`（挂 CI）——允许家族为 {4, 8, 12, 16, 999, 0, 50%}。12 / 16 入族是本次授权的设计决策，不是回归。

**The No Side-Stripe Rule（禁侧条原则）.** 工具界面与卷面讲评不得用超过 1px 的彩色左右边线充当通用的选中、引用或提示语法。纸面题目定位采用页边上下范围角标 + 题号强调；跨栏证据采用轻底纹 + 与虚线同位的连接点。结构性 1px 发丝线仍可用于真实分隔。

**The No-Emoji-Icon Rule（禁 Emoji 图标原则）.** 产品界面的按钮、导航、状态与提示不得用 Emoji 或 Unicode 象形字符代替图标。需要图标时统一使用项目既有的 Lucide 线性图标或正式 SVG；图标不增加信息时直接使用文字。试题原文、用户输入与导入材料属于内容真值，不因本规则改写。

## 6. Do's and Don'ts

### Do:
- **Do** 让纸白 / 白卡片 / surface-2 承载绝大多数表面；墨只做短动作，墨绿只做身份。
- **Do** 短动作按钮用墨底 + 白图标，悬停变浅到 #3A3A37。
- **Do** 整块响应：hover 铺整行，不单独改字色。
- **Do** 让正文与占位符对比度 ≥ 4.5:1（WCAG AA）；弱墨 #6B6E68 对底 4.72:1，可用；极弱墨 #9A9D97 只用于非正文。
- **Do** 首页按入库日期流、浏览按年份档案；行上只写「N 篇章」。
- **Do** 把筛选 chip 做成真过滤（全部 / 真题 / 模拟 / 年份），不要堆教学维度墙。
- **Do** 给每个动效配 `prefers-reduced-motion` 退化（App.css 全局重置已兜底）；时长走五档
  motion token（micro 80 / fast 120 / base 160 / slow 220 / entrance 260ms），曲线走
  `--ease-hover` / `--ease-out` / `--ease-in-out` 三 token，UI 动效不超过 300ms；签名时刻豁免需注释。
- **Do** 改颜色 token 时同步更新钉死该颜色的 CI 断言（否则回归护栏误报）。

### Don't:
- **Don't** 用墨绿填主按钮、选中芯片或焦点环（墨绿只做身份）。
- **Don't** 给卷子行上色，或在卷子层点「在草稿卷 / 已讲评 / 模拟」。
- **Don't** 引入任何蓝色强调（#3b82f6 / #2563eb 及一切 slate/blue）作工具 chrome。
- **Don't** 引入科技紫作强调。题型六色是篇章层保留色，不是工具强调。
- **Don't** 做成 **AI 生成的千篇一律感**：紫色渐变、玻璃拟态、一眼假的随手生成质感。
- **Don't** 做成 **花哨的营销 SaaS 风**：大渐变 banner、弹窗、堆动效、营销词。
- **Don't** 做成 **塞满的后台管理系统**：把筛选控件做成视觉主角的表单墙。
- **Don't** 做成 **幼稚的教育 App**：卡通、超大圆角、糖果配色。
- **Don't** 用 `border-left/right` 粗于 1px 的色条做卡片/列表/提示的强调。
- **Don't** 用 Emoji 或 Unicode 象形字符充当按钮、状态、导航或提示图标。
- **Don't** 在工具界面乱用衬线，或在卷面正文用无衬线（The Two-Font-Lanes Rule）。
- **Don't** 把「不空」做成「堆筛选控件」— 用内容（题库本身）填空。
- **Don't** 在工具 chrome 使用超过 20px 的字号。

## 7. Agent Authoring Discipline（agent 施工纪律，design-canon 立项 2026-07-14，出处：poolside / StyleX / vibe-designing-playbook 三址调研）

本节不是视觉规范，是 agent 写 CSS/token 时的行为纪律——防止「token 覆盖不到就现场编字面量」「叠加样式谁赢全靠猜」「把留白当缺陷填满」这三类会悄悄侵蚀设计系统的坏习惯。

**The No-Literal-Fallback Rule（禁止现场兜底）.** agent 遇到 token 体系覆盖不到的取值（既有 token 不合适、又没有对应新 token），**禁止**现场拼一个字面量颜色/间距/时长顶上。正确做法：显式记一条缺口到 `docs/design-gaps.md`（格式：日期 / 位置 / 想要的值 / 临时方案），攒批等 owner 拍板收编成正式 token 或既有 token 的扩展用法。临时方案本身仍要写清楚落在哪一行、用了什么权宜值，方便日后订正。

**The Explicit-Cascade Rule（覆盖顺序显式化）.** 同一元素上多个 class 叠加、容易产生覆盖冲突的组合样式，后写的那条样式规则必须在注释里说明「本条覆盖 X，因 Y」——写清楚覆盖了谁、为什么该它赢。这是 agent 写 CSS 的纪律条款，不做 lint/构建期强制，全靠自觉与 code review 抓。

**The Generous-Whitespace Rule（留白法）.** 空态与低密度界面（浏览态组头、空态提示、卡片内部）允许且鼓励奢侈留白——留白是克制专业气质的组成部分，不是「没做完」的信号，更不是后来者「顺手填满」的候选位。要不空，用内容和结构去填（见 §6 Don't 最后一条），不要用留白去填。

## 8. Spacing Rhythm（间距节奏法）

新面/新组件的间距**推导法**——让 DEV 在没有逐处标注的设计稿时也能自行推出数字，而不是现场猜：

- **基础网格 4px**：gap / padding / margin 从 4 的倍数取（4 / 8 / 12 / 16 / 24 / 32），首选 frontmatter spacing 阶梯。
- **三步节奏**：组内元素间 **8px**（图标与文字、行内控件之间）→ 组与组之间 **16px**（日期组、芯片与搜索）→ 区块之间 **24–32px**。
- **首页特档**：顶栏到英雄搜索 **56px**。
- **卡片内衬** 随组件：行 10px 14px；紧凑搜索内衬更紧。
- **适用边界**：本法只管新面。存量 6 / 10 / 14px 半档值是历史沉积，不追改、自然更替；不设机器门——间距强依赖上下文，节奏是推导起点不是硬约束。偏离网格要说得出理由（光学修正、密度特例），说不出理由就回网格。

## 9. Voice & Content（文案法，design-canon-v2 2026-07-16，源 Geist Voice & Content，中文语境改写）

文案是设计的一部分：精确、不结巴、不客套。此前散装在判例里的文案裁决（卷名去结巴、「已移出」、诚实空态）在此收编成文。Geist 的英文排印惯例（Title Case、skip "please" 的直译）不搬——按中文语境改写。

- **动作 = 动词 + 宾语**：按钮、菜单项、确认模态主按钮写「下载 DOCX」「移出题组」「删除这份卷」；不写裸「确定」「OK」「提交」。具名确认模态的主按钮必须点名对象（与 §2 The Deletion-Cost Rule 配套）。
- **错误 = 发生了什么 + 下一步**：「保存失败：网络已断开。检查连接后重试。」只报「操作失败」为错。
- **toast 点名具体变化，无「成功」、无句号**：「已移出阅读理解 B」「已加入草稿卷」；不写「操作成功！」。（判例：工作台「已移出」措辞，2026-07-14。）
- **进行态 = 动词 + 中 + 省略号**：「保存中…」「生成中…」；用省略号字符 `…`，不用三个句点。
- **空态指向第一动作，宁缺勿假**：空态写「还没有 X。做 Y 即可开始」；AI 结果为空就如实说空，不凑数填充（判例：AI 搜索诚实空态，trust-cracks 2026-07-14）。
- **数字与排印**：数量用阿拉伯数字（「3 份试卷」「N 题」）；中西文之间留一个空格（「共 8 页 · 双面 4 张 · A4」既有先例）；间隔号用 `·`。
- **不结巴**：标题、卷名、chip、标签不带冗余重复词（判例：卷名去结巴、月份形裸「3」，trust-cracks 2026-07-14）。
- **语气**：工具对同事说话——祈使直说，不堆「请」凑客气，不用营销级形容词（「强大的」「智能的」）。

## 已作废（2026-09-03）

本次北星方向由 owner 授予顶层权威，以下旧条文不再约束新面。历史文件与 git 仍可查，不在此复述全文。

- 「专业工具台」北星句，以及中性纸底 #F6F6F4 / 近黑 #1E1E1C / 线 #D8D8D2 的真中性底原则。
- The Green-Pen Rule：墨绿 ≤10% 签名强调、主按钮/选中/链接/焦点都用墨绿。
- The Single-Hue Rule：全站强调只有墨绿一个色相；teal ramp（50–900）作选中浅态 / tag / 焦点环。
- The Quiet-Chrome Rule 中「主操作 = 墨绿填充」与焦点环墨绿条款（次级按钮平时无底无边仍成立）。
- 工具界面四级字号 28 / 16 / 14 / 12；Display 28px；chrome 可用 16px body。
- 圆角单一家族 {4 / 6 / 8 / 999}——现改为 {4 / 8 / 12 / 16 / 999 / 0 / 50%}，12 与 16 为授权新档。
- 首页纯空白舞台（词标 + 大搜索 + 耳语，feed 只活在 `?view=browse`）。
- 行上「全卷 · N 篇章」、真题/模拟宋体墨字标注、卷种色点、模拟上色。
- 卡片实线边 + 仅 `0 1px 2px` 贴地、无发丝环的旧卡片阴影。
- teal-800 压深作主按钮 hover（墨填充改为悬停变浅）。
