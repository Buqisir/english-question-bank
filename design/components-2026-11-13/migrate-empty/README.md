# 空状态换成共用构件 EmptyState（构件厂，2026-11-14）

清点里空状态有 3 种样子、8 处实拍（`../inventory.md`「空状态」、`../sheet-empty.png`）。这次把「还没东西」和「没找到」收成一个件 `app/src/shared-ui/EmptyState.tsx`（样子在 `emptyState.css`）：图 → 一句说明 → 可选的一个动作（`Button`）。

- 图只有两类：平涂插图（沿用 `components/EmptyIllustration` 的 kind），獭獭。
- 獭獭在类型上只开放 `'otter-sit'`（个人空间空态）和 `'not-found'`（找题没找到），依据 BRAND.md §7 第 118 条。别处要加獭獭得先改那一条。
- 「没找到」是一张卡片，卡片边就是水面（第 31 条），獭獭从卡片上沿露出水面以上的半身，水面条藏在卡片边后面。只有这一种是卡片，其余照 DESIGN.md §5 放在桌色上、不放白卡片。
- 獭獭不加动画（第 118 条「演完就停」），所以减少动态效果时也什么都不动。图是装饰，`aria-hidden`，读屏只读那句话和动作。
- 獭獭图照顶栏标志、默认头像的办法放进 app：从 `design/brand-2026-10-13/mascot/` 逐字节复制到 `app/public/brand/`，页面用 `<img src="/brand/…">`。`otter-sit.svg` ← `mascot/otter-sit.svg`；`otter-not-found.svg` ← `mascot/states/half-not-found.svg`（第 119 条摊手版）。品牌目录一个文件没改。

注：任务单里把 EmptyIllustration 叫「线稿插图」，它其实是平涂（DESIGN.md §5「不用线稿」，2026-11-13 迁移第 12 条已换成平涂），这次没动它。

## 换了哪些处

| 处 | 页面、时刻 | 图 | 动作 | 对照图 |
| --- | --- | --- | --- | --- |
| 找题没找到 | 首页搜一串乱码，本地题库没有匹配 | **獭獭 not-found**（卡片） | 「返回浏览全部 N 套卷」墨字键 | `compare-home-noresult.png` |
| 个人空间空态 | 个人空间没有文件 | **獭獭 otter-sit**（原来是平涂文件夹 archive） | 「去找题」主键 | `compare-my-space-empty.png` |
| 草稿卷空态（纸上） | 草稿卷还没有题组 | 插图 board-list | 「去找题」主键 | `compare-draft-empty.png` |
| 生词本空态 | 生词本还没有卷（清点 empty-03 外框 + empty-01 里面的字，算两处） | 插图 vocabulary-notebook | 「去找题」主键（原来是手写的按钮，换成 Button） | `compare-notebook-empty.png` |
| 单词复习「还没有词组」 | 词组页签空 | 插图 paper-lined | 无 | `compare-dictation-sets-empty.png` |
| 单词复习「还没有听写」 | 听写页签空（清点没拍到，同一写法一起换） | 插图 paper-lined | 「去选词组」主键（原来手写，换成 Button） | `compare-dictation-tasks-empty.png` |
| 题库一套卷都没有 | 首页题组列表为空（清点没拍到，同一写法一起换） | 插图 question-bank | 无 | `compare-home-empty-corpus.png` |

每张对照图上面一行 1440 宽、下面一行 390 宽，左 before 右 after。原图在 `before/`、`after/`（`<处>-<宽>.png` 整屏，`-crop.png` 框住空态），量出来的位置和实算样式在各自的 `measure.json`。

### 每处的 before / after

- **找题没找到**：before 是一行 13px 灰字「没找到匹配。可以换个说法，或」后面接一个下划线墨字链接「返回浏览全部 N 套卷」，高 30。after 是白底卡片（1px `--eqb-color-border` 边、12px 圆角，和下面结果列表的板一样，不投影），里面居中一句「没找到匹配。可以换个说法。」，下面一个墨字键「返回浏览全部 N 套卷」（`Button` strong、36 高）。话的意思没改：两条出路还是「换个说法」和「回去浏览」，只是第二条从行内链接变成卡片里的键；没加营销词，没加新动作。卡片 117.5 高；獭獭 128 宽，露出水面以上 146px，卡片上方留 146 + 24px。
- **个人空间空态**：before 是 88px 平涂文件夹。after 是坐石全身像 150 × 150（画出来约 144 高、112 宽），图下加 8px，石头到文字目测约 22px（插图那几处目测约 23px）。整块从 250 高变成 285.5 高；离上面标题 26px 不变。主键位置和样子不变。
- **草稿卷空态**：看不出差别。1440 宽完全一样；390 宽左右内边距从 20 变 24，说明折行位置变了（「…，题」换到下一行）。
- **生词本空态**：插图、字、键位置不变；内边距 36/20 → 24，因为 250 的最小高度把内容居中，高度不变。「去找题」原来是手写的主键（宽 71，内边距 16 但字体继承），现在是 Button 主键大号，宽 63，和个人空间、草稿卷的「去找题」一样宽。
- **单词复习两处**：间距从 32 变 24，最小高 220 不变；「还没有听写」原来内容撑到 231.5 高，现在 220（内边距小了）。「去选词组」换成 Button，宽 84 → 88。说明行宽从 24em 并成 26em。
- **题库一套卷都没有**：上下内边距从 48 变 24，整块从 214 高变成 167.5 高（目测比原来紧一点）。

## 没换的处和原因

| 处 | 原因 |
| --- | --- |
| 草稿卷左栏「从搜索结果添加题组。」（`draft-paper-rail-empty`，empty-01） | 同一屏纸上已经有一个带插图的空态；左栏 148 宽，再放一张图就一屏两处空态，不「安静」。它是一行提示，留着一行灰字。对照 `compare-draft-rail-empty.png`（before / after 一样）。 |
| 草稿卷「正在生成分页预览…」两处（`draft-a4-empty`，empty-02 的「加载中」） | 不是空态，是等待；之前已换成 `Notice kind="waiting"`。外面的 `.draft-a4-empty` 居中框留着，现在也给 EmptyState 当居中框。 |
| 草稿卷「先加题组，才能下载 PDF」（`draft-empty-export`） | 之前已换成 `Notice`，是提示行，不是空态。 |
| 「筛选条件太严格，没有匹配的结果 / 题库里没有匹配的卷」两行（`p.concierge-empty`）、单词复习「没有符合条件的词组」（`dictation-empty-line`） | 筛选筛空，不是「没东西」。EmptyIllustration 文件头就写着「搜了没结果、还没选、暂时没有只写一行灰字」；第 118 条也只给 AI 没找到放獭獭。留一行灰字加行内「清除筛选」。 |
| 个人空间出错态「个人空间读取失败」+「重新加载」 | 出错不是空态，照 Notice 那一套另说；它还用 `.my-space-empty-state` 排版，这一块 CSS 留着（只删了给空态文字用的那一条）。 |
| 个人空间「正在读取个人空间…」、生词本出错那行 | 等待和出错，不是空态。 |

## 删掉的旧 CSS

- `App.css`：`.concierge-feed-empty-corpus` 和 `div.concierge-feed-empty-corpus`（含 `p`）三条。`.concierge-empty` 改成 `p.concierge-empty`，只管还是段落的两行筛选提示，不碰卡片（卡片上 `concierge-empty` 类名留着，给 `smoke-concierge-stream`、`smoke-paper-draft-ui`、`smoke-golden-path` 认）。
- `DraftPaperWorkbench.css`：`.draft-a4-empty.is-blank` 和它的 `p` 两条。
- `MySpacePage.css`：`.my-space-empty-state .my-space-empty` 一条；加一条 `.eqb-empty-state.my-space-empty-placed`（离标题 26、至少 250 高，照原来）。
- `vocabularyNotebook.css`：`.notebook-empty-state`、`.notebook-empty-state .notebook-empty`、`.notebook-empty-cta`、`:focus-visible` 四条；加一条最小高 250。
- `vocabularyDictationWorkbench.css`：`.dictation-empty-state`、`h2`、`p`、`.is-blank`、`.is-blank p`、`.dictation-empty-cta`、`:focus-visible` 七条；去掉白框那条改成认 `.dictation-empty-state`（不再要 `.is-blank`）；加一条最小高 220。
- 新加的覆盖规则都写了 Explicit-Cascade 注释。

verify-* 里没有写死这些旧类名的断言（查过 `my-space-empty-cta`：它在出错态上，没动；`verify-home-default-feed` 第 8 条的正则还对得上）。按要求没有运行 verify-* 和 smoke-*。

## 「没找到」獭獭 110 宽和 128 宽（`compare-not-found-width.png`）

- 算的：摊手图 viewBox 宽 576，另外三张半身 494，高都是 715。110 宽时缩放 0.191（110/576），另外三张在 110 宽时是 0.223（110/494），头脸小约 14%；128 宽时 0.222，和另外三张差 0.2%，头脸一样大。
- 实测（测试站，`after/measure.json`）：110 宽时露出水面以上 125.7px，128 宽时 146.2px；卡片都是 117.5 高。1440 宽下獭獭头顶离上面「没填 AI 密钥…」那行约 56px（目测）。
- 感受（目测）：110 宽单看也成立，獭獭和卡片比例更收敛；但它是这一屏唯一的品牌图，第 119 条要的是和另外三张半身头脸一样大，110 宽时脸明显小一号、两只手显得往外伸得更开。128 宽脸和身子比例对了，摊手读得清楚。代价是獭獭露出的 146px 比卡片本身（117.5）还高，这一屏最先看到的是獭獭；但这一刻老师本来就停住了，往下就是两条出路，不抢（和品牌取证第 3 处的结论一样）。390 宽下 128 占屏宽约三分之一（128 / 390），还不挤。现在用 128。
- 品牌取证 README 第 5 条说旧合爪图左右不对称、建议往右挪 3px；摊手图左右手伸得差不多，按图框居中目测不偏，没挪。

## 缺的变量

tokens.css 没有这些，先写成 `emptyState.css` 文件头的局部变量，每个注明出处；缺口也记进了 `docs/design-gaps.md`（No-Literal-Fallback）。

| 局部变量 | 值 | 出处 | 候选正式名 |
| --- | --- | --- | --- |
| `--eqb-empty-otter-sit-size` | 150px | BRAND.md §4.7 空态 150 高；品牌取证第 5 处 | `--eqb-empty-art-otter-sit` |
| `--eqb-empty-otter-not-found-width` | 128px | 110 × 1.17（第 119 条） | `--eqb-empty-art-otter-half` |
| `--eqb-empty-text-measure` | 26em | 原来草稿卷空态的行宽 | `--eqb-measure-empty-text` |

另外：
- 说明文字 13px 借用 `--eqb-font-size-control`。它的注释写的是 DESIGN.md §3 的 UI Compact 档，用在控件；空态说明不是控件，但正好是这一档。若要分开，候选名 `--eqb-font-size-compact`。
- 平涂插图 88 × 88 还写在 `components/emptyIllustration.css` 里，没动。
- 「没找到」卡片上方留的高 = 獭獭宽 × 658 / 576（摊手图水面线 y=670 减 viewBox 顶 12，除以宽 576），是图本身的几何，写成 calc；卡片边线 1px 是发丝线。
- 各页给空态的最小高（个人空间、生词本 250，单词复习 220）和个人空间的 26px 上边距是原来的值，搬到 `.eqb-empty-state.<页>` 上，没新编。

## 要 Owner 定的

1. **「没找到」的出路键要不要更显眼**：现在是墨字透明底键（照原来的墨字链接，不抢首页唯一的主键）。如果想让老师更容易点到「返回浏览全部」，可以换成雾薄荷主键；这一屏现在没有别的主键。
2. **要不要加「放宽条件」这类动作**：没加。原来那行只有「换个说法」和「回去浏览」两条出路；AI 有结果时也可能有别的出路（比如关掉思考模式再搜），要加先定话。

## 怎么拍的

- 测试站：`INVENTORY_PORT_OFFSET=59`（网页 5358、接口 9971），默认四篇阅读的种子就够；1440 × 900 和 390 × 844，2 倍图，减少动态效果打开。
- `node scripts/component-inventory/empty-shots.mjs before|after`：自己起测试站。「没找到」搜一串乱码；题库空、个人空间空靠拦接口回空；草稿卷先删光题组；生词本和单词复习本来就空。after 另拍 110、128 两种宽（脚本里改 CSS 变量，不改代码）。
- `node scripts/component-inventory/empty-sheet.mjs`：拼对照图和样张 `../sheet-empty-new.png`（所有变体，左 1440 右 390）。
- before 在改代码前拍；after 在改完、`pnpm build` 通过后拍。
