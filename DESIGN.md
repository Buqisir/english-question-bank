---
name: 英语题库工作台
description: 一张熟悉而心爱的备课桌
# 色值是已验收的 Daydream 桌面色阶（§2）。全局 token 文件 app/src/shared-ui/tokens.css 仍是旧值，迁移现状见 §2。
colors:
  bg: "#F3F6F0"
  surface: "#FAFCF8"
  raised: "#FAFDF7"
  hover: "#E5EAE1"
  border: "#D5DACF"
  border-subtle: "#E3E8DF"
  ink: "#191D18"
  ink-muted: "#60665C"
  ink-faint: "#9A9D97"
  action: "#1F1F1D"
  action-hover: "#3A3A37"
  on-action: "#FFFFFF"
  identity: "#2C6E56"
  success: "#1FA062"
  warning: "#E8901A"
  warning-text: "#965A08"
  danger: "#dc2626"
  paper-bg: "#f6f6f4"
  paper-desk-bg: "var(--eqb-color-bg)"
  paper-ink: "#4a4438"
  paper-ink-strong: "#2c2820"
  paper-border: "#e6e2d7"
typography:
  ui:
    fontFamily: "Inter, 'PingFang SC', 'Hiragino Sans GB', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "14px"
    lineHeight: 1.5
  paper:
    fontFamily: "'EQB Termes', 'EQB Source Han Serif', serif"
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
    textColor: "{colors.on-action}"
    rounded: "{rounded.circle}"
    padding: "0"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "16px"
  chip:
    # 浏览芯片还是旧色值，没有随桌面色阶迁移（§5 Chips）。
    backgroundColor: "#FFFFFF"
    textColor: "#6B6E68"
    rounded: "{rounded.pill}"
    padding: "0 12px"
  input:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
---

# Design System: 英语题库工作台

本文件只管界面执行：token、组件、间距、字号、动效和文案格式。品牌（北极星、性格、语气、标志、颜色的差事、水獭和插画）见 [BRAND.md](BRAND.md)，产品（为谁、做什么、主线和边界）见 [PRODUCT.md](PRODUCT.md)。三份文件的分工是 Owner 2026-10-13 定的；旧条款逐条去了哪里，见清点表 `design/brand-2026-10-13/canon-audit.md`。

**效力.** 条款默认已定：和 Owner 原话对得上，或经过真实页面验收；现网在用的旧条款由 Owner 2026-10-13 整批确认。标「提案」的是 agent 的概括或推广，可以参照，不当铁律。条款和已验收的页面冲突时，以页面为准，再回来改条款。

**边界.** 视觉调整不改变内容正确性、无障碍、权限隔离、数据安全和删除确认规则，也不改变四款 PDF 的内容边界（三款题卷不含答案）。更新锁定旧外观的视觉断言时，保留行为与安全检查；不因视觉调整改变 Canonical Paper、分页和导出语义。

## 1. 北极星（已移到 BRAND.md）与页面验收

北极星「一张熟悉而心爱的备课桌」、产品感受与审美主张（包括「首页是归来」「好看是独立要求」）和设计验收问题，已移到 [BRAND.md](BRAND.md) §1.1 和 §1.8。本节只留界面执行要用的部分。

### 2026-09-15 具名规则的新位置

| 规则 | 现在在哪 |
| --- | --- |
| The Equal-Weight Rule（同重法） | §5 Icons |
| The Holes-Breathe Rule（挖空法） | 形体：BRAND.md §1.4；页面：§8 |
| The Round-From-Form Rule（圆自形体法） | 圆角家族：§5 Named Rules；圆润从哪来：BRAND.md §1.4。「不做吉祥物」已作废（Owner 2026-10-13） |
| The Just-Noticeable Rule（微妙法） | §5 Icons；「微妙、生动」：BRAND.md §1.4 |
| The Common-Form Rule（公认形法） | §5 Icons；「不加品牌点、品牌花纹」：BRAND.md §1.6 |
| The Supporting-Icon Rule（图标配角法） | §5 Icons |
| The No-Repeated-Status Rule（状态不逐行重复） | §9 |

### 配色与已验收范围（Owner 2026-09-07 起）

Owner 要求直接采用 Amp **Daydream**（“Faintly green, pleasantly elsewhere”）与 **Deadpan**（“Just greys. No comment”）两套参考，不另起泛化选色。依据最后纠正的 [Daydream 原图](https://ampcode.com/user-content/attachments/51b2d820a7b66d9badf5de059aaf1d803563cb7a50f34bb6a089acc45a902250-image.png) 与 [Deadpan 原图](https://ampcode.com/user-content/attachments/ea2dc3e2ef2cdcd590098e165f149518297e334ef3a5becb453070b014e52c2d-image.png)，不使用此前误发图区分两套配色。

本轮先实现 Daydream 方向。卡片内容面经 Owner 两次微调后确认：只比桌面白一点，不能退回纯白卡片的强对比。色值见 §2；这些是本项目已验收的色值，不冒称 Amp 官方 token。

- 首页保留搜索与明确的浏览筛选入口；最近上新默认四套已发布且具有完整卷面入口的卷。继续上次组卷由既有草稿卷入口承担，不重复增加「接着准备」。2026-09-15 起首页另有「接着做」和「今天翻到」两段，见 §5 ConciergeDesk。
- 保留原有部分/节层级、真实简介与主题；阅读目录用 A篇–D篇，删除可预期的题数与重复题型说明。缺少内容时不编造摘要、主题或就绪状态。
- 顶栏先移除绿色品牌标记，只留文字。当时的原话「品牌名未定，先移除绿色品牌标记，不另造 logo」已移到 BRAND.md §3.1 当背景；新标志按 BRAND.md 做，做好之前顶栏保持只有文字。
- 整卷讲评开关前后保持同一纸张尺寸；宽屏收起时居中，打开时左移，让出讲评栏。草稿页让纸张居中，桌面控件沿用相同语言，实际打印纸保持白色。
- 个人空间当前明确收纳已保存的 PDF；命名、收藏可编辑练习及文件夹管理是后续产品能力，不用假入口冒充已实现。
- 登录页使用同一桌面/内容面色阶，表单留足输入空间，保留真实账号登录与错误反馈，不改变认证行为。

Deadpan 尚未实现；切换入口与记忆方式尚未定案。采用两套配色的方向不等于主题切换已完成。

### 首页不摆未来入口

首页与导航只服务当前可用的教师任务，不提前摆满 PPT、伴学等未来入口或「即将上线」占位。推进顺序见 [PRODUCT.md](PRODUCT.md#产品演进与共用方向owner-2026-09-07)。

## 2. Colors

桌面色阶铺底，墨做短动作，墨绿只做身份。语义色与纸页 token 各自独立，不参与「墨 / 身份」预算。「色必须有差事」的总原则见 BRAND.md §1.5。

### Desk（桌面色阶，已验收）

变量写在 `app/src/App.css` 的 `--desk-*`：

| 角色 | 变量 | 值 | 对比度 |
| --- | --- | --- | --- |
| 桌面 | `--desk-page` | `#F3F6F0` | |
| 内容面（卡片、列表） | `--desk-surface` | `#FAFCF8` | |
| 输入 / 浮层 | `--desk-raised` | `#FAFDF7` | |
| 悬停 | `--desk-hover` | `#E5EAE1` | |
| 边框 | `--desk-border` | `#D5DACF` | |
| 分隔线 | `--desk-line` | `#E3E8DF` | |
| 正文 | `--desk-ink` | `#191D18` | 对桌面 15.65:1 |
| 次要文字 | `--desk-muted` | `#60665C` | 对桌面 5.42:1、对内容面 5.73:1、对悬停底 4.84:1，可写正文级次要文字 |

- **Faint Ink 极弱墨** (#9A9D97): 对桌面只有 2.52:1，不能写字，只给极次要的非文字图形。

**现状：两套 token 并存.** 桌面色阶目前作用在首页（含浏览）、个人空间、草稿卷工作台、登录页和登录加载页（见 `App.css` 里定义 `--desk-*` 的选择器）。整卷页、生词本、默写等其他页面仍用 `app/src/shared-ui/tokens.css` 的全局 `--eqb-color-*`，那是旧值：底 `#F3F5F1`、面 `#FFFFFF`、次层 `#E9ECE6`、边 `#E3E6E0` / `#D5D9D2`、正文 `#1F1F1D`、弱墨 `#6B6E68`（对旧底 4.72:1）。新页面用桌面色阶；把旧页面迁过来是单独的界面任务，要在真实页面上给 Owner 看过。

### Action（墨做动作）
- **Ink Action 墨动作** (#1F1F1D): 短标签或纯图标的填充：搜索提交圆钮、浏览行悬停「+」、选中筛选芯片。白字对它 16.51:1。
- **Action Hover** (#3A3A37): 墨填充的悬停态。**填充悬停变浅，不变深。**

### Identity（墨绿只做身份）
- **Identity 墨绿** (#2C6E56): 头像圆，白字对它 6.05:1。原来的「品牌圆点」在 2026-09-14 验收时已从顶栏移除。BRAND.md 提议把它叫作深竹青，和品牌主色竹青 `#3D8F70` 算同一条色阶（提案，BRAND.md §1.5）。不当主按钮、不当选中芯片、不当焦点环、不当链接色。

### Semantic（状态语义，不参与墨/身份预算）
- **Success 成功** (#1FA062): 对白 3.35:1。
- **Warning 提醒** (#E8901A): 对白 2.49:1，明度是 Owner 为讲评线色所定。写小字用 `--eqb-color-warning-text` (#965A08)，对白 5.58:1、对悬停底 4.57:1。
- **Danger 危险** (#dc2626): 对白 4.83:1。

**「色留量减」（2026-09-15）.** 语义色只落在线与字形：勾、答案字、卷面划线、连线、引用块 10% 淡底与连接点；不铺整张选项卡，不做标签药丸，引用块不加彩色侧条（见禁侧条原则）。讲评栏灰阶只用 `paper-ink-strong` / `ink` / `paper-ink-muted` 三档，字号只走 16 / 14 / 13 / 12（属于 §3 的整卷页 UI 字号，不受工具界面四级字号管）。

成功色和亮提醒色写小号正文时对浅底不达 AA，缺口记在 `docs/design-gaps.md`。

### Paper（纸页 token 家族 — 仅纸页壳）
- **Paper Bg 纸页底** (#F6F6F4): 整卷/讲评页页基底。
- **Paper Ink 暖墨** (#4A4438): 纸页壳次级正文/rail 项/答案行文字。
- **Paper Ink Strong 暖墨·强** (#2C2820): 纸页壳标题、选中态文字。
- **Paper Border 暖边** (#E6E2D7): 讲评栏面板边线。
- 本方向不改 `--paper-*` 字面值。工具页 chrome 走桌面色阶和墨，不得借用纸页 token。

### Named Rules

**The Ink-Action Rule（墨做动作）.** 黑填充只给短标签或纯图标控件：搜索提交、加入「+」、选中筛选芯片。长文案控件（草稿丸、次级按钮、导航项）保持安静白底或透明，不用墨填满。

**The Identity-Only Teal Rule（墨绿只做身份）.** 墨绿只出现在头像圆。不当主操作、不当选中态、不当焦点环、不当行上色点。品牌图形（标志、水獭、插画）的用色按 BRAND.md §1.5。

**The Uncolored-Paper-Row Rule（卷子层不配色）.** 卷子行不上色。没有值得标的痕迹就不标。唯一候选痕迹是篇章层的「在草稿卷」（题组已在当前草稿卷中），留到题组详情屏验证。真题用软底徽章（#E9ECE6、12px、圆角 4、无描边）；模拟不标。

**The Whole-Block Response Rule（整块响应）.** hover 给整行 / 整项铺悬停底（桌面色阶页面用 `--desk-hover`，未迁移页面用 `#E9ECE6`），从不只改文字颜色。

## 3. Typography

**UI Font:** Inter + PingFang SC（回退 Hiragino Sans GB / system-ui）
**Paper Font:** 'EQB Termes' / 'EQB Source Han Serif'（中英混排衬线，仅渲染卷面内容时用）
**Mono Font:** ui-monospace / SF Mono（代码、ID、技术字段）

**Character:** 工具侧是一套调校良好的无衬线，靠字重与字号拉层级，不做 display/body 配对。渲染真题/解析的卷面切换到中英混排衬线。两套字体各守一层。工具界面不用 Paper Mono（Owner 2026-10-13 看过真实页面对比后定）；字标和宣传标题用什么字属于品牌，见 BRAND.md §3.3。

### Hierarchy
- **Year / Section 年份与档案数字** (Inter, 600, 20px, letter-spacing -0.02em): 浏览年份组头。
- **Row Title 行题** (Inter, 500, 14px): 套卷名。
- **UI Body 界面正文** (Inter, 400, 14px, 1.5): 搜索输入、主说明。首页搜索输入是 16px，浏览的紧凑搜索是 13px。
- **UI Compact 紧凑** (Inter, 400, 13px): 导航、芯片、主题摘要、篇章数、草稿丸。
- **UI Label 标签** (Inter, 500, 12px): 日期组头、真题徽章、极次要标注。
- **Page Title 页题（已验收页面）**: 个人空间页题 26px（窄屏 23px）、分区标题 18px、文件名 15px；桌面色阶页面的顶栏标题 15px、导航 14px。
- **Paper Body 卷面正文** (衬线, 16px, 1.7): 题干、篇章、解析；行高更松，便于通读。
- **Paper-browse 角色字号**（卷面/浏览页 UI，与工具 chrome 分轨，本方向不改）：Compact Body 紧凑正文 14px。角色阶梯：28px Display / 16px Body / 14px Compact Body / 12px Label。

### Named Rules
**The Four-Step UI Type Ramp（工具界面四级字号）.** 控件、行、正文和标签只用 **12 / 13 / 14**，年份组头用 20。行题 14/500；年份组头 20/600。不得为局部组件现场发明 11 / 11.5 / 12.5 / 13.5 这类半档；要新档先记到 `docs/design-gaps.md`。卷面正文属于独立的 Paper Font 字道，不受这条规则改写。

页题和数字按上面「已验收页面」一行取。原来「工具界面没有任何字号超过 20px」一句和这些已验收页面冲突，已删除（清点表 D35）。新页面需要新的页题档时，在真实页面上请 Owner 定。

**The Two-Font-Lanes Rule（双字道铁律）.** Inter / PingFang 管工具界面，衬线只在渲染卷面内容时登场，绝不互换。工具里乱用衬线即为错；卷面正文用无衬线即丢质感。

- **例外（Owner 2026-09-23）：** 选区词典卡的英文词头、音标与词性缩写走卷面衬线字道，以呼应所摘卷面；中文释义、标签与控件仍走 UI 字道。

## 4. Elevation

表面带轻微实体感：发丝边、短而轻的阴影和细微的表面明度差建立层次，不追求彻底扁平，也不做厚重拟物（BRAND.md §1.1 感受与审美）。阴影只在静止贴地与浮层两档出现，外加整卷页的纸面。

### Shadow Vocabulary
- **Card 卡片** (`box-shadow: 0 0 0 1px rgba(30,30,28,0.05), 0 1px 2px rgba(30,30,28,0.06)`): 卡片的发丝 + 贴地。
- **Floating 浮层** (`box-shadow: 0 8px 24px rgba(0,0,0,0.12)`): 草稿丸、弹层、下拉。
- **Sheet 纸面** (`box-shadow: 0 1px 0 rgba(0,0,0,0.06), 0 12px 32px rgba(0,0,0,0.08)`): 整卷页里那张 A4 纸。一条贴地发丝 + 一层远而淡的漫射，让纸"搁在桌面上"而不是"浮在空中"。只给完整卷面用（看整卷、草稿卷预览），卡片和浮层不得借用。Owner 2026-09-15 列为标准。
- **Focus Ring 焦点环** (`outline: 2px solid #1F1F1D; outline-offset: 2px`): 键盘焦点走墨，不走墨绿，不走蓝辉光。

现网另有两处：首页和浏览的卷行列表卡只用 `0 0 0 1px var(--desk-border)` 一圈边，不加落影；首页搜索框用 `0 2px 3px rgba(25,29,24,0.06)` 一层极短的落影。

### Named Rules
**The Flat-By-Default Rule（默认扁平）.** 静止表面只用发丝边和极短的贴地阴影交代结构，不做装饰光晕；这就是上面说的轻微实体感。浮层阴影只回应离开文档流的物件。

## 5. Components

### Buttons
- **Shape:** 短动作圆钮 50%；次级/导航 8px。
- **Primary（短动作）:** 墨底（#1F1F1D）+ 白图标，悬停浅一档（#3A3A37）。用于搜索提交与行上「+」。
- **Long-text controls:** 白底或透明，不用墨填。草稿丸白底墨字 + 发丝边 + 浮层阴影。
- **Secondary / Ghost:** 平时无底无边，hover 才浮出悬停底，focus-visible 走墨焦点环。

### Chips（浏览筛选）
- **Size:** 高 28px，字 13px，胶囊 999px。
- **Unselected:** 白底 #FFFFFF + 边 #E3E6E0，字 #6B6E68；悬停底 #E9ECE6。这几个还是旧色值，没有随桌面色阶迁移。
- **Selected:** 墨底白字，边透明；悬停 #3A3A37。
- 芯片：全部 · 真题 · 模拟 · 库中实际出现的年份。必须真过滤。

### Cards / Rows
- **Card:** 12px 圆角，底是内容面 `--desk-surface`。首页和浏览的列表卡用一圈 1px `--desk-border` 边（§4）；未迁移页面仍是白底加 Card 发丝阴影。
- **Row:** 最小高度 48px；卷行内衬 10px 14px，首页行 12px 16px；行间 1px `--desk-line` 分隔。整行 hover 铺悬停底。
- **Title:** 14/500。首页行题前加 13px 弱墨年份；浏览行不加（年份组已标年）。
- **真题徽章:** 软底 #E9ECE6，12px，圆角 4，无描边。模拟不标。
- **主题摘要:** 13px 弱墨；没有就空着。
- **右侧:** 「N 篇章」13px 弱墨 + 弱 chevron。浏览行悬停时，chevron 左侧出现 32px 墨圆「+」（加入草稿卷）。
- **卷子层不配色。**

### Inputs / Fields
- **Hero search（首页）:** 高 54px，圆角 16px，底 `--desk-raised`，边 `--desk-border`，一层极短落影（§4）；输入字 16px；提交是嵌在右端的 32px 墨圆钮。
- **Compact search（浏览）:** 高 36px，宽 320px，圆角 12px，无落影；输入字 13px；右端是 28px 墨圆钮。
- **占位符:** 次要文字 `--desk-muted`（对桌面 5.42:1），不用极弱墨「显优雅」。
- **Focus:** 焦点环不挪动布局。搜索框用 2px `--desk-muted` 外环，其余控件走 §4 的墨焦点环。

### Navigation
- **Topbar:** 透明无底、无 border-bottom，不 sticky。品牌位目前只有文字标题（14px/600；桌面色阶页面 15px），做好标志之前保持只有文字（BRAND.md §3.1）。右侧导航为 16px EQB 图标 + 13px 文字（桌面色阶页面 14px、高 36px），激活项 `variant="fill"`，静止无填充，hover 浮出 8px 圆角底。头像为 28px 墨绿圆 + 12px/600 白色首字母。手搓 `?view=` 路由，非 react-router。
- **Draft pill:** 右下浮层，白底发丝边，13px，浮层阴影。

### Signature Component: ConciergeDesk AI 找题主面
产品的门面。首页从上到下三段（2026-09-15 起，`app/src/concierge/ConciergeDesk.tsx`、`ConciergeHomeSections.tsx`）：

1. **接着做**：当前草稿卷（里面有题组时）和最近打开过的篇章。有内容才出现。
2. **最近上新**：已发布、有完整卷面入口的卷。没有就不出现。
3. **今天翻到**：库里每天固定的一篇，让回来的老师有一样东西可读，不是控件。

段与段之间 32px，段内 8px；段标题 13px/500 弱墨，是结构不是内容。浏览是年份档案，用真过滤的芯片收窄。外壳干净但不空：用内容填空，不用控件填空。

### Signature Component: PaperSurface 卷面
渲染真题/解析的纸面：卷面纸感、中英混排衬线、证据高亮（支持=绿 / 陷阱=琥珀，answer-evidence 语义色，锁定契约）。卷面是渲染考试内容的独立层，有自己的证据色系统，**不参与工具外壳的配色改造**（它由 `shared/papersurface/**` 契约护栏管辖）；锚点契约为支持 = 10% 绿底 + 1.5px 绿实线，陷阱 = 10% 琥珀底 + 1.5px 琥珀点线。版式细则以 `docs/product/exam-paper-format-standards.md` 为准。

### Signature Component: Companion Analysis PDF 配套解析打印通道
版式记录已移到 `docs/product/companion-analysis-adaptation.md`「打印版式」。四款 PDF 合同里，这个入口不再供新产品使用（`docs/product/paper-pdf-products-v1.md`）。它的出版标记和签名色属于品牌，见 BRAND.md §1.6。

### Icons 图标

图标来自 `app/src/icons` 的 EQB 图标套件，理念和工艺见 `design/icon-system-2026-09-15/principles.md`、`craft-rules.md`。整套图标经 Owner 确认后落到代码，#497（2026-10-06）已用到全站。下面几条原是 §1 的 2026-09-15 具名规则。

**The Equal-Weight Rule（同重法）.** 图标 16px 用 2.25 描边、24px 起用 2.75（由 `app/src/icons` 的 `EqbIcon` 按尺寸决定，调用点不覆写）。提案：chevron 和控件线条也与旁边的中文同一视觉重量；静止态 chevron 至少用弱墨；不用极弱墨、1.5 描边或缩小尺寸「显优雅」。发丝分隔线与卡片边仍是 1px，那是结构线，不是语言线。

**The Common-Form Rule（公认形法）.** 通用动作（勾、叉、加、箭头、放大镜、齿轮、下载）用行业公认符号，原版比不过就用原版；领域对象（卷、版本、讲评、生词）用卷面原语：正文行、药丸空、折角纸、点、书签。题型不做图标，只用文字（Owner 2026-09-30）。语义明确永远排在特色前面；特色来自一套规则处处一致，不来自制造记号。不加品牌点、品牌花纹见 BRAND.md §1.6。

**The Just-Noticeable Rule（微妙法）.** 提案：一处细节取「刚好能看见」的尺寸：去掉它语义会变，放大它微妙会没，这时才是对的。适用于图标里的孔与点、徽章底色深浅、悬停明度差、阴影长度。凡是一眼就被看见的装饰，先怀疑它过大。

图标补充（Owner 2026-09-28）：**微妙、生动**是把对象最有表现力的特征放进熟悉的轮廓、比例和留白里。关系先于装饰，形态的收放也能传神；意义包括物性、姿态，以及可见的节奏、平衡与触感，不要求每一笔增加新功能。上面的「刚好能看见」在图标中指表达的分寸，不要求每个细节单独显眼，也不以改动幅度小为标准。一处表达重点允许多个几何参数协同，必要时可以重组形体；选稿后的保真校准再收窄变量。微妙不等于运动，不套用品牌点或统一断口，附加细节按收益与重量取舍。具体例证、方法与小尺寸验证见 [图标设计原则 §5](design/icon-system-2026-09-15/principles.md)；不改变既有工艺要求或自动重画已确认图标。

图标动效补充（Owner 2026-10-03）：操作反馈沿对象关系运动，复制前页抽出、播放分合、展开翻起、图钉针尖固定轻压。终态由真实操作结果驱动，沿用已选几何与全局动效 token，键盘即时切换并支持减少动态效果。入口和实现边界见 [图标状态动效](design/icon-system-2026-09-15/motion-rules.md)。

**The Supporting-Icon Rule（图标配角法）.** 借 Amp 的克制与位置感，不借它的细线：chrome 里的图标永远和文字并排、走 `currentColor`、不单独上色；只有短动作墨圆（搜索提交、加入「+」）允许纯图标。图标出现在需要指向的地方，不出现在只为「显得有设计」的地方。

### Interaction 交互

**The Deletion-Cost Rule（成本定交互，owner 拍板 2026-07-10）.** 删除交互不追求全站同一形态，追求同一**规则**：**可恢复的删除**（对象还在库里/可轻易重建，如工作台移除题组）= 即删 + toast 撤销，不设确认弹窗；**不可逆的删除**（永久删除 + 有陪葬物，如个人空间删卷及其 PDF）= 具名确认模态。若未来某面要从确认模态改为即删撤销，先做软删除/回收站兜底。

### Named Rules

**The Single-Radius-Family Rule（圆角单一家族，northstar 2026-09-03 改判）.** 全站圆角只取阶梯 **{4px badge / 8px control / 12px card / 16px hero search / 999px pill}**，外加两个结构值：`0`（直角）与 `50%`（仅圆形控件——头像、圆点、圆形按钮）。方向性 shorthand 各分量在族内即合法。同一视图内保持一个圆角家族。**禁止**为单个组件现场发明 5px / 6px / 7px / 10px 这类族外档（要新档走 `docs/design-gaps.md`，见 `docs/agents/ui-collaboration.md` 的禁止现场兜底）。机器守门：`scripts/verify-radius-family.mjs`（挂 CI）——允许家族为 {4, 8, 12, 16, 999, 0, 50%}。12 / 16 入族是本次授权的设计决策，不是回归。圆润从哪来（圆来自轮廓，不靠加大圆角）见 BRAND.md §1.4。

**The No Side-Stripe Rule（禁侧条原则）.** 工具界面与卷面讲评不得用超过 1px 的彩色左右边线充当通用的选中、引用或提示语法。纸面题目定位采用页边上下范围角标 + 题号强调；跨栏证据采用轻底纹 + 与虚线同位的连接点。结构性 1px 发丝线仍可用于真实分隔。

**The No-Emoji-Icon Rule（禁 Emoji 图标原则）.**（2026-09-15 更新图标来源）产品界面的按钮、导航、状态与提示不得用 Emoji 或 Unicode 象形字符代替图标。需要图标时统一使用 `app/src/icons` 的 EQB 图标套件（源 `design/icon-system-2026-09-15/icons-v3.mjs`，`pnpm -C app icons:generate` 重生成；缺字形先按 `principles.md` 画进源文件，不临时引 Lucide 或手写 SVG）；图标不增加信息时直接使用文字。试题原文、用户输入与导入材料属于内容真值，不因本规则改写。

## 6. Do's and Don'ts

各节已经写明的做法不在这里重复，本节只留没有别处可放的几条。反面参照（AI 生成的千篇一律感、花哨的营销 SaaS 风、塞满的后台管理系统、幼稚的教育 App）见 BRAND.md §1.7。

### Do:
- **Do** 让正文、次要文字和占位符的对比度 ≥ 4.5:1，大号或加粗文字 ≥ 3:1（WCAG 2.1 AA，PRODUCT.md 的无障碍目标）。各色值的对比度见 §2。
- **Do** 给每个动效配 `prefers-reduced-motion` 退化（App.css 全局重置已兜底）；时长走五档
  motion token（micro 80 / fast 120 / base 160 / slow 220 / entrance 260ms），曲线走
  `--ease-hover` / `--ease-out` / `--ease-in-out` 三 token，UI 动效不超过 300ms；签名时刻豁免需注释。

### Don't:
- **Don't** 引入任何蓝色强调（#3b82f6 / #2563eb 及一切 slate/blue）或科技紫作工具 chrome 的强调。品牌不新增色相，见 BRAND.md §1.5。

## 7. Agent Authoring Discipline（已移到 docs/agents）

本节原来是 agent 写 CSS 和 token 时的施工纪律，不是视觉规范，已移到 [docs/agents/ui-collaboration.md](docs/agents/ui-collaboration.md)「写 CSS 与 token 的纪律」：The No-Literal-Fallback Rule（禁止现场兜底）、The Explicit-Cascade Rule（覆盖顺序显式化），以及改颜色 token 时同步更新钉死该颜色的 CI 断言。缺口登记仍在 `docs/design-gaps.md`。原来的 The Generous-Whitespace Rule（留白法）并入 §8。

## 8. Spacing Rhythm（间距节奏法）

新面/新组件的间距**推导法**——让 DEV 在没有逐处标注的设计稿时也能自行推出数字，而不是现场猜。2026-10-13 起，原 §7 留白法和 §1 挖空法的页面部分也并入这里。

- **基础网格 4px**：gap / padding / margin 从 4 的倍数取（4 / 8 / 12 / 16 / 24 / 32），首选 frontmatter spacing 阶梯。
- **三步节奏**：组内元素间 **8px**（图标与文字、行内控件之间）→ 组与组之间 **16px**（日期组、芯片与搜索）→ 区块之间 **24–32px**。首页各段之间 32px、段内 8px。
- **块内紧、块间空**：胖线、紧排只在块内。提案：任何一块变密，它四周相应变空。
- **留白**：空态与低密度界面（浏览态组头、空态提示、卡片内部）允许且鼓励奢侈留白。留白是克制专业气质的一部分，不是「没做完」的信号，也不是后来者顺手填满的位置。要不空，用内容和结构去填，不用控件和说明文案去填，也不把筛选控件堆成主角。
- **首页特档**：顶栏到英雄搜索 **56px**。
- **卡片内衬** 随组件：卷行 10px 14px，首页行 12px 16px；紧凑搜索内衬更紧。
- **适用边界**：本法只管新面。存量 6 / 10 / 14px 半档值是历史沉积，不追改、自然更替；不设机器门。间距强依赖上下文，节奏是推导起点不是硬约束。偏离网格要说得出理由（光学修正、密度特例），说不出理由就回网格。

## 9. Voice & Content（文案法，design-canon-v2 2026-07-16，源 Geist Voice & Content，中文语境改写）

文案是设计的一部分：精确、不结巴、不客套。此前散装在判例里的文案裁决（卷名去结巴、「已移出」、诚实空态）在此收编成文。Geist 的英文排印惯例（Title Case、skip "please" 的直译）不搬，按中文语境改写。语气（像工具对同事说话）见 BRAND.md §1.3；本节只管格式。

- **动作 = 动词 + 宾语**：按钮、菜单项、确认模态主按钮写「下载 DOCX」「移出题组」「删除这份卷」；不写裸「确定」「OK」「提交」。具名确认模态的主按钮必须点名对象（与 §5 的删除成本法配套）。
- **错误 = 发生了什么 + 下一步**：「保存失败：网络已断开。检查连接后重试。」只报「操作失败」为错。
- **toast 点名具体变化，无「成功」、无句号**：「已移出阅读理解 B」「已加入草稿卷」；不写「操作成功！」。（判例：工作台「已移出」措辞，2026-07-14。）
- **进行态 = 动词 + 中 + 省略号**：「保存中…」「生成中…」；用省略号字符 `…`，不用三个句点。
- **空态指向第一动作，宁缺勿假**：空态写「还没有 X。做 Y 即可开始」；AI 结果为空就如实说空，不凑数填充（判例：AI 搜索诚实空态，trust-cracks 2026-07-14）。
- **数字与排印**：数量用阿拉伯数字（「3 份试卷」「N 题」）；中西文之间留一个空格（「共 8 页 · 双面 4 张 · A4」既有先例）；间隔号用 `·`。
- **不结巴**：标题、卷名、chip、标签不带冗余重复词（判例：卷名去结巴、月份形裸「3」，trust-cracks 2026-07-14）。
- **状态不逐行重复**（The No-Repeated-Status Rule，2026-09-15）：同一状态文案不在列表每行重复出现（如「完整卷面尚未就绪」八行八遍）。有该状态才显示对应入口或徽章，没有就什么都不显示；需要解释整组时在组头说一次。
- **界面用词：个人空间**（The Personal-Space Naming Rule，owner 拍板 2026-07-10）：对外统一叫「个人空间」，页题弃用「已保存的草稿卷」；页内分区仍叫「草稿卷」。
