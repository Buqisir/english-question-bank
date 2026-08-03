# home-editorial — 找题页试卷行编辑化 + 展开态卷面目录化（DEV 执行契约）

- Cut line: **medium**; touches schema / data contract / product boundary /
  teaching interpretation: **no**（纯消费面 UI 重排，搜索/筛选/状态机零改动）。
- 来源：owner 2026-07-09 拍板（方向稿 artifact v2 全部通过；卷种标注选
  **C · 宋体墨字**，红章方案否决）。方向稿细节以本契约为准。
- 审美依据（本刀纪律，违者 CR 打回）：impeccable absolute bans——
  **side-stripe（>1px 彩色侧边条）与同构卡阵禁用**；product register——
  药丸只留给可点的筛选，元信息纯文本，字号对比 ≤1.2 一档；emil 处方——
  hover 显形 140ms 纯 opacity、按钮 :active scale(0.97)、
  `@media (hover:none)` 常显、`prefers-reduced-motion` 全退化。
  颜色/圆角/字号全取现有 DESIGN.md token，**零新增 hex**。

## Scope

允许修改的文件（白名单，出界即停）：

- `app/src/concierge/ConciergePaperRow.tsx`
- `app/src/concierge/ConciergeGroupCard.tsx`（重构为卷面目录行；文件名不改）
- `app/src/concierge/ConciergeDesk.tsx` —— 窄改授权：仅当展开态列表容器
  结构（grid→目录列表）需要外层配合时；不得动搜索/筛选/数据流。
- `app/src/App.css` —— 仅 concierge 相关选择器段（`.concierge-*`）。
- `scripts/verify-concierge-filters.mjs` / `verify-home-default-feed.mjs`
  —— 窄改授权：仅当现有断言引用被退役的卡片/行结构时同步修，
  并为新结构补 2-4 条轻量断言。

Forbidden：`useConciergeDesk.ts`、`conciergeSearch.ts`、`filters.ts`、
`aggregatePaperResults.ts`、`reason.ts`、`defaultFeed.ts`、
`paperSurfaceHref.ts`（逻辑层全部只读）；搜索框/思考模式/筛选药丸区
（顶部区域本刀不碰）；`server/**`、`domain/**`、其他页面/组件。

## 一、试卷列表行（ConciergePaperRow）

1. **年份列**：行首独立列（宽 ~64px 右对齐），`paper.year` 大一档
   （~24px）细字重（300）tabular-nums；卷名中不再重复年份（卷名显示用
   region + paperName，若 paperName 自带年份前缀按现有 formatTitle 逻辑
   去重，尽力而为，剩余重复记 Should Watch 不硬抠）。
2. **卷种标注（C · 宋体墨字）**：卷名后跟「真题」/「模拟」二字，
   `font-family: "Songti SC","SimSun",serif`，`ink-muted` 色，
   ~12.5px，letter-spacing 0.2em，无框无底色。数据源=现有真题/模拟
   字段（现状行里已渲染「真题」文本，复用同一来源）。
3. **题型串退役**：「完形填空·语法填空·…」五题型串删除，替换为
   「全卷 · N 篇章」（N=篇章数；若将来有残卷判定再显差异，本刀一律
   此格式）。`ink-faint`、tabular-nums。
4. **主题升位**：主题标签从药丸 chips 改为纯文本一行（`ink-muted`
   13px，`·` 分隔），置于卷名下方。药丸 chip 样式在行内退役。
5. **展开动作**：「展开题组」按钮退役，整行可点展开（现有
   expand/collapse 处理器复用）；行 hover/`:focus-within` 时行尾浮现
   「展开题组 ↓」/「收起 ↑」文字提示（teal、140ms opacity），
   `hover:none` 常显。行 hover 背景 `surface-2`。行保持键盘可达
   （button/role 语义 + 可见焦点环）。

## 二、展开态：九宫格卡阵 → 卷面目录（ConciergeGroupCard）

1. **结构**：网格卡阵退役。改为按「部分」分组的目录列表——
   - 组头：从 `group.section` 解析部分前缀（如「第三部分 语言运用」，
     取 `/` 前段或「第X部分」正则）；解析不出时该行归入无组头的
     平铺列表（不许崩、不许空）。组头样式：12px 600 `ink-faint`，
     下边框 `border-subtle`。
   - 每题组一行：`题组名（Reading A/完形填空…，现有标题字段） ·
     N 题（questionCount） · 一句摘要（现有 passage 摘要字段，单行
     ellipsis） · 主题（ink-faint 小字）`。行间 `border-subtle` 分隔。
2. **绿色收权**：`is-hit` 的绿底渐变+2px teal ::before 侧条**退役**
   （禁令项）。搜索命中语义改为：命中行正常墨色 + 现有推荐理由小字
   （如有），**非命中行整体 `ink-faint` 降灰**——信息不靠色条。
3. **操作悬浮显形**：每行 hover/`:focus-within` 浮现操作簇（右侧，
   `surface-2` 底遮住摘要尾部）：「加入草稿卷」（primary teal，三态
   文案与现逻辑一致）+「找类似」+「解析」（现有 paperSurfaceHref
   守卫）。**行本体点击 = 详情**（现有 onOpenDetail 通路不变）。
   `hover:none` 下操作簇常显紧凑版（摘要可隐藏）。按钮 :active
   scale(0.97)；暂不可组卷行整体降灰 + 状态文字（title 提示保留）。
4. **所有现有 handler 复用**：onAddToBasket / 找类似 / onOpenDetail /
   解析链接——只换呈现不换行为；data-ra-* 埋点属性如存在须保留。

## 三、随刀销账（07-03 critique 存量债，本刀文件面内）

- 新增/改动的 transition 全部纳入 `prefers-reduced-motion` 退化
  （concierge 段现有缺口一并补）。
- 目录行/试卷行键盘可达 + 可见焦点环（不用 rgba 0.08 那种隐形环）。

## 验收标准

- 列表页：无药丸元信息、无题型串；年份列+宋体卷种+主题文本行成立；
  行 hover 显形展开提示；对比度全过 4.5:1（ink-muted on surface-2 检查）。
- 展开态：目录分组正确（2026-i 真卷：阅读/语言运用/写作三组头）；
  一屏密度显著高于卡阵；无绿底/侧条；hover 操作簇三键可用且三态正确；
  行点击进详情不回归；找类似/解析通路不回归。
- 搜索命中场景：命中行墨色+理由、非命中降灰（用真搜索或 QA 夹具验证）。
- `node scripts/verify-concierge-filters.mjs`、
  `verify-home-default-feed.mjs` 绿（含新断言）；tsc 绿；
  `pnpm -C app run verify:all` 或 CI 绿。
- **真点浏览器 QA 必做**：找题页真库走一遍（默认 feed + 展开 2026-i +
  搜索命中 + 触屏仿真 + 键盘 Tab 走行），截图入
  `docs/cuts/home-editorial/qa/`。

## 第二轮 — 方向 C「开门见卷」（owner 2026-07-09 认可方向后追加）

> 第一轮（试卷行编辑化+目录化）已施工+CR APPROVE+主代理三笔收口
> （分支 e686d63）。owner 实测仍觉 AI 感，定位到页面上半身
> （居中大搜索框+AI 开关+三排筛选药丸=品类模板脸）与大数字年份列
> （重复数字=零信息高视觉重量）。方向 C 经 mock v4 认可。

### 审美章程（三把 skill 综合，违者 CR 打回）

- **签名唯一**：宋体「真题/模拟」是整页唯一的文化记号与唯一衬线；
  不新增任何强调色/装饰/图形记号。墨绿只出现在可点动作与选中态。
- **结构编码真相**：年份组头是真序列（带「N 套」真实计数）；除此
  之外不加编号/eyebrow/分割装饰。
- **好默认**：筛选默认收起；档案开屏即见。
- 动效按 emil 处方：hover 显形 140ms 纯 opacity、展开 200ms
  ease-out、:active scale(0.97)、hover:none 常显、reduced-motion
  全退化。零新增 hex。

### Scope（白名单）

- `app/src/concierge/ConciergeDesk.tsx`（本轮升为正式白名单：命令行
  重排/筛选折叠/年份分组都在这层；**搜索提交、思考模式、筛选逻辑的
  行为一行不改**，只动布局与呈现）
- `app/src/concierge/ConciergePaperRow.tsx`
- `app/src/App.css`（.concierge-* 段）
- `scripts/verify-home-default-feed.mjs` / `verify-concierge-filters.mjs`
  / `verify-search-thinking-toggle.mjs`（断言窄改+新结构轻量断言）

Forbidden 不变：useConciergeDesk.ts、conciergeSearch/filters/
aggregate/reason/defaultFeed/paperSurfaceHref（逻辑七件全只读）、
ConciergeGroupCard.tsx（第一轮成果，本轮不碰）、server/domain/
其他页面。

### 交互规格

1. **命令行**：页面顶部一行——搜索输入（占满）+ 思考模式紧凑开关
   （收进行内，说明句转 title/aria-describedby）+「筛选」按钮 +
   「34 套卷 · 278 篇章」计数（ink-faint）。大标题区/示例大留白退役；
   搜索提交、防抖、思考模式行为零改动。
2. **筛选折叠**：默认收起。点「筛选」展开现有三组 chip 行（chip 本体
   与计数、点击行为不变——药丸留给可点筛选正是形状纪律）；再点收起。
   有任何激活筛选时：收起态在命令行下方显示激活 chip（可单个移除，
   复用现有交互）+「筛选」按钮带激活计数。aria-expanded 齐。
3. **年份分组（feed 态）**：按 paper.year 降序分组，组头
   「2026」15px/650 + 「N 套」12px ink-faint，样式对齐展开态的
   `.concierge-group-index` 组头。行改方向 B 形：卷名打头（600）+
   宋体卷种 + 主题同行（ellipsis）+「全卷 · N 篇章」+ hover
   「展开题组 ↓」。**每行的年份列退役**。year 为 null 的卷归入
   尾部「其他」组。
4. **搜索命中态不分组**：variant='search' 时保持现有相关性排序的
   平铺列表与命中语义（相关性优先于年代，分组只属于翻卷场景）。
5. 不变量：行点击展开、展开态卷面目录（第一轮成果）、四条 handler
   通路、data-ra-* 埋点、键盘可达全部不回归。

### 验收标准

- 开屏（feed）：命令行一行 + 年份分组档案即见；无三排药丸、无大
  数字列；筛选可开合、激活筛选收起态可见可移除。
- 搜索/筛选行为与改造前完全一致（含思考模式），仅呈现变化。
- 三个 verify 脚本绿（含新断言）+ tsc 绿 + verify:all/CI 绿。
- 真点浏览器 QA：feed 分组、筛选开合+激活态、真搜索命中平铺、
  展开题组回归、触屏仿真、键盘走查。截图入 docs/cuts/home-editorial/qa/
  （c-round2-* 命名，用 Playwright page.screenshot 落盘，禁
  screencapture）。

## DEV 汇报要求

改动文件清单 / verify 摘要 / 浏览器 QA 状态+截图路径 /
Self-Review Blind Spots / 越界或契约冲突声明。
