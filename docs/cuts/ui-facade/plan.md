# UI 门面刀 — plan.md（DEV 执行契约）

cut size: medium; touches schema, data contract, product boundary, or teaching
interpretation: **no**.

**PA 降级理由**（process-tuning：PA 按不可逆性触发）：纯可逆展示面打磨，
零 state/data-contract 改动，唯一的逻辑项（chip 计数联动）是纯派生
useMemo；不满足 PA 触发条件，降级为 plan 头部说明，CR 复核此判断。

**写法档位**：F1/F2 视觉细节为硬契约（UI 方向权在小川，已定死）；F3 为
参考实现（DEV 可在"分组呼吸感"意图内自行斟酌间距值）。

## 背景

三个面（AI 主页 / 草稿卷工作台 / 登录页）打磨到 80 分，不全面翻新。
品牌人格见 `PRODUCT.md` Brand Personality：温暖·可信·顺手；反面清单
（紫渐变/营销 SaaS/后台密集/幼稚教育 App）都不要。AI 模式已确立的暖色
词汇（App.css concierge 区已有的 hex 字面量，**零新 token**）：
暖纸白 `#FFFDF8`、暖边线 `#E5E3DC`、暖灰字 `#6B645C` / `#9A9180`、
墨黑 `#1A1A1A`、暖底 `#F4F2EC`、页面暖背景 `#FBFAF6`
（= `--eqb-color-bg-warm`，已存在的 token，只许引用不许改）。

## Forbidden（越线即停）

- `app/src/shared-ui/tokens.css` — 一个字都不改（配色 token 硬约束区）。
- `server/**`、domain / schema / `*Adapter.ts`、`shared/papersurface/**`、
  print / PDF / export 样式、verify 脚本、paper-assets。
- `DraftPaperWorkbench.tsx` 只许 display-only：不碰 reducer、状态契约、
  数据获取、URL state、adapter 输入输出、跨组件同步。
- `filters.ts` 的 `applyConciergeFilters` 语义不改（可新增纯函数）。
- 不改全局 `.primary-button`（蓝色系是经典模式的现役样式）。

## F1 登录页（硬契约）

文件：`app/src/auth/LoginPage.tsx`、`app/src/auth/LoginPage.css`。

1. 页面背景改暖：`.login-page` background 用
   `var(--eqb-color-bg-warm)`；卡片 `.login-card` background `#FFFDF8`、
   border `#E5E3DC`、border-radius 12px 保持、max-width 放宽到 384px、
   padding 40px 36px、阴影调柔（如 `0 12px 32px rgba(26, 22, 15, 0.06)`）。
2. 垂直位置略偏上：卡片视觉重心在 42% 高度附近（如
   `.login-page { align-items: flex-start; padding-top: 22vh }`，值可微调）。
3. 文案（人话、克制，照抄）：
   - eyebrow 保持 `English Question Bank`，颜色改暖灰 `#9A9180`；
   - `h1` 保持「英语题库工作台」，色 `#1A1A1A`；
   - h1 下新增一行 muted 副语（`#6B645C`，13px）：「输入账号，接着备课。」
   - 表单下新增一行 footer 提示（`#9A9180`，12px，居中）：
     「账号由馆主邀请开通。」
4. 提交按钮不再用全局 `.primary-button`：`.login-submit` 自带样式——
   墨黑底 `#1A1A1A`、字 `#FFFDF8`、radius 8px、高 40px、
   hover 提亮（如 `background: #333`）、disabled 降不透明度；
   从 JSX 的 className 里移除 `primary-button`。
5. 输入框：背景 `#FFFDF8`、border `#E5E3DC`、focus 态 border `#1A1A1A`
   + 无蓝色 glow（可用 `box-shadow: 0 0 0 3px rgba(26,26,26,0.08)`）。
6. 错误条保持现有 coral 语汇不动。

## F2 AI 主页（硬契约）

文件：`app/src/concierge/ConciergeDesk.tsx`、`app/src/concierge/filters.ts`
（仅新增纯函数）、`app/src/App.css`、`app/src/App.tsx`（仅第 3327 行文案）。

1. **chips 维度标签**：`.concierge-filter-row` 里每个维度行前加一个小
   muted 标签（`<span class="concierge-filter-dim-label">`）：题型 /
   年份 / 地区 / 来源。样式：11px、`#9A9180`、字重 500、固定最小宽
   （如 min-width 34px）、与 chips 基线对齐。整行结构改为
   `label + chips` 左对齐；四行整体仍收在 820px 列内且左缘对齐
   （即改掉现在的居中散排）。`aria-label` 保持现有英文 key 不变。
2. **chip 计数联动收窄**（上刀 CR SW-2）：
   - 契约：chip 的**选项全集**永远来自全语料（chips 不因筛选增减、
     不跳位）；每个维度 D 的 **count** 按「除 D 自身外的所有 active
     filters 筛后的语料」重算（标准 faceted count，保证已选维度自身
     各选项的 count 仍可比较）。
   - count 为 0 的 chip 保持可见可点，加 `is-zero` class 视觉降级
     （opacity 0.45）；点击后走既有的「筛选筛空 + 清除筛选」诚实空态，
     不需要新逻辑。
   - 实现落点：`filters.ts` 新增纯函数（如
     `buildFacetedFilterOptions(groups, filters)`），内部复用
     `applyConciergeFilters` 与 `buildFilterOptions` 的既有口径；
     `ConciergeDesk.tsx` 的 `filterOptions` useMemo 换用它。
     `buildFilterOptions` 本体不改（别的调用点不受影响）。
3. **kicker 文案**：`App.tsx:3327` 的
   `Local-first English Question Bank` → `English Question Bank`
   （上线定向，local-first 字样退役）。只改这一处；
   `PaperImportAiWorkbench.tsx:436` 不在本刀范围。
4. **feed 卡标题 tooltip**：`ConciergePaperRow.tsx` 的标题元素加
   `title={完整标题}`，解决截断不可读（display-only，一行改动）。

## F3 草稿卷工作台（参考实现）

文件：`app/src/workbench/DraftPaperWorkbench.tsx`（display-only）、
`app/src/App.css`。

意图：顶部工具栏「返回 ｜ 标题+自动保存 ｜ 最近草稿卷 ｜ 版本切换+导出+
个人空间」一排 8 个控件平铺，缺分组呼吸感。做法（DEV 斟酌具体值）：
- 用间距（或 1px 竖分隔线，色 `#E5E3DC`）把工具栏分成三组：
  导航（返回）/ 文档（标题、自动保存、最近草稿卷）/ 输出（学生版·
  教师版、导出、个人空间）；
- 不改任何控件的行为、顺序、DOM 事件；只动 className / wrapper div /
  CSS。若现有 DOM 结构已够用，纯 CSS 实现优先。

## 验证

1. `pnpm -C app run verify:all` 不劣化（本刀不新增 verify 脚本——纯视觉，
   行为断言由既有套件覆盖；chip faceted count 是纯函数，**新增单测**到
   filters 既有测试位置：至少覆盖「选 groupType 后 year counts 收窄」
   「选项全集不因筛选减少」「count 0 仍在」三条）。
2. DEV 自查：dev server 起来后三个面各截图确认无布局破坏；
   登录页用 `node scripts/create-user.mjs` 建临时账号强制 auth 态查看，
   查看完从 user-data.sqlite `DELETE FROM users` 还原 open mode
   （只动本地 dev 库，可逆）。
3. 浏览器 QA（主 agent 做）：三面真点截图 + chips 联动计数真点验证。

## 完成报告要求

短 verify 摘要、改动文件清单、三面截图结论、禁区确认、已知风险。
