# CR — home-editorial（找题页试卷行编辑化 + 展开态卷面目录化）

Fresh cold-read CR (medium 刀). Reviewer ≠ implementer.
Baseline `main` (f68651f) … `github/worktree-agent-a5554a34e1ab9421b` (9c6b6b7).

## Recommendation

**APPROVE** — no Must Fix. All findings are Should Watch (spec-conformant or
owner-QA-gated). Merge is safe.

## Changed Scope

`git diff --name-only main...HEAD` = exactly 4 files, all whitelisted:

- `app/src/App.css`（仅 `.concierge-*` 段）
- `app/src/concierge/ConciergeGroupCard.tsx`
- `app/src/concierge/ConciergePaperRow.tsx`
- `scripts/verify-home-default-feed.mjs`（Test 21/22 新增）

`ConciergeDesk.tsx` **未改**（DEV 自报属实——展开容器改造未需外层配合）。
Forbidden 逻辑层 7 文件（useConciergeDesk / conciergeSearch / filters /
aggregatePaperResults / reason / defaultFeed / paperSurfaceHref）**零改动**，
diff 文件名清单证实，Test 13 forbidden-scope guard 复跑绿。
`verify-concierge-filters.mjs` 未改（DOM 结构变了它仍绿，见下）。

## Verification Evidence（独立复跑，非抄 DEV 数字）

- `node scripts/verify-home-default-feed.mjs` → **44 passed, 0 failed**（含新 21/22）。
- `node scripts/verify-concierge-filters.mjs` → **33 passed, 0 failed**（未改脚本，
  结构变更后仍绿——确认聚合/筛选契约无回归）。
- `pnpm -C app exec tsc --noEmit` → **exit 0**。
- 已证实项不重跑（verify:all 70×3、build 绿，按任务约定信任）。

断言强度核实：
- Test 22 `!/concierge-group-card-li\.is-hit/` 是**有效负断言**——绿底渐变/侧条
  一旦复活即 fail，load-bearing。
- Test 21/22 其余为 source-grep 存在性断言（本文件 44 条全是 source-grep 惯例，
  UI 无法渲染）。属轻量、可被绕过（例如旧 groupType 串若与新串并存 Test 21 不抓），
  但符合 plan「补 2-4 条轻量断言」授权。见 Blind Spots。

## 正确性核实

- **`全卷 · N 篇章` 数据源**：`N = paper.hitCount`。读 `aggregatePaperResults.ts`
  确认 `hitCount` 与 `groups.length` 在同一循环自增，恒等；feed 变体下 = 全卷篇章数，
  **准确**。（search 变体见 Should Watch。）
- **section 解析兜底**：`parseSectionGroupLabel` 解析不出返回 null →
  `bucketGroupsBySection` 归入无组头 bucket，flat 平铺，**不崩不空**。第X部分正则
  含「十/百」可覆盖多部分卷。✅ 符合「解析不出不崩不空」。
- **行点击 = 详情不换行为**：`handleRowBodyClick` 用 `closest('button,a,...')` 排除
  内部控件，仅在 body 空白处 `onOpenDetail`；键盘走「详情」按钮（`.concierge-action`
  有 focus-visible 环）。四条 handler（onAdd / onSimilar / onOpenDetail / 解析链接）
  全保留。
- **paper 行展开**：▸ 按钮 `onClick=onTogglePaper` + `aria-expanded/controls/label`
  + focus 环齐全（keyboard 展开路径完好）；整行 `handleRowClick` 排除 button/a/detail。
- **data-ra-* 埋点**：解析 `<a>` 上 `data-ra-entry="group-card"` /
  `data-ra-group-id` **保留**。
- **Cut 6 auto-scroll**：`primaryHitRef` / `data-hit` / `data-primary-hit` 仍挂在内层
  `<li>`，展开滚动逻辑不回归。

## 审美纪律核实

- **零新增 hex**：diff 内全部 hex 逐个核对——`#1E1E1C #6A6A64 #9A9A93 #D8D8D2
  #EDEDEA #2C6E56` 均 baseline 既存；`#E8E8E4` baseline App.css 无但为 DESIGN.md
  line 18 `border-subtle` token（= `--eqb-color-border-subtle`），plan「组头/行间
  border-subtle」正当引用。**无违规**。
- **side-stripe / 绿底渐变退役彻底**：`.concierge-group-card-li.is-hit` 渐变 +
  2px teal `::before` 侧条整段删除，branch 内无残留（残余 `::before` 匹配均为无关
  的 thinking-toggle / meta-tag 分隔点）。
- **药丸只剩筛选区**：`.concierge-paper-topic-chip` / `.concierge-group-pill`
  （border-radius 999px）删除；consumption 区（4300–4660）无 999px 残留，999px 仅
  存于 filter/starter-chip 区（允许）。
- **hover 显形**：`.concierge-row-expand-hint` 与 `.concierge-group-row-actions`
  纯 `opacity 0→1` + `@media (hover:none){opacity:1}` 常显；`:active scale(0.97)`
  在 `.concierge-action`。reduced-motion 由全局 `*{transition-duration:0.01ms}`
  兜底（覆盖新 opacity 过渡）。✅ 全符合 emil 处方。

## Findings — Should Watch（均不阻塞合并）

1. **SR 丢年份（a11y，diff 引入的回归；建议 owner 取一行修）**
   `buildHeadline` 不再前置年份，年份列 `aria-hidden="true"`。结果：同名不同年卷
   （如 2025 vs 2026「广东深圳高三一模」）对屏幕阅读器**读音完全相同**，无法区分。
   baseline 的 aria-label 曾含「2026 年」。修法一行（年份并入 article aria-label 或
   去掉 year 的 aria-hidden）。**不阻塞**理由：本品为一对一单师工具，SR 非真实用户
   路径；plan 的 a11y 销账明确只涵盖「键盘可达 + 可见焦点环 + 对比度」（三项均达标）。
   由 owner 决定是否顺手修。

2. **search 变体「全卷 · N」语义偏差（plan 明令格式，非 DEV 缺陷）**
   聚合器只把命中题组放进 bucket，故 search 部分命中时 `hitCount` < 整卷篇章数，
   而文案写「全卷 · N 篇章」会低报。plan「一律此格式」是 owner 拍板，且行内仍保留
   `.concierge-paper-hitcount`「命中 N…」徽标消歧。feed（主浏览）下准确。存量语义
   瑕疵，非本刀回归。

3. **`is-dim` 非命中降灰路径结构性不可达（裁决 DEV 盲区 #1）**
   `hitContext.hitGroupIds` 恒含 bucket 内全部题组 → `isHit` 恒 true → `dimmed`
   恒 false → `.is-dim` CSS 永不生效。这非「现有数据不可达」而是**架构性不可达**
   （聚合器只由命中构桶）。plan 验收「非命中降灰（真搜索/夹具验证）」因此当前无法演示。
   **裁决：保留**——与本文件既有「scope 'paper'/'mixed' 保留分支」前瞻模式一致，
   Test 22 只断言 `dimmed?: boolean` 形状（无害）。但需知：该分支**无测试渲染**，
   将来若 search 真发出混合桶，降灰行为未经证明。

4. **年份去重 best-effort 的月份误剥（裁决 DEV 盲区 #2）**
   `stripLeadingYearToken` 对 "26.3 广东…" 短年匹配 "26" 后吃掉 "."，残留 "3 广东…"
   （月份 3 被留成孤字）。plan 明授权「尽力而为，剩余记 Should Watch 不硬抠」。个别
   卷名可能比保留 "26.3" 更怪，但在授权容差内。

5. **topic 落到「真题」标签（裁决 DEV 盲区 #3）**
   `buildTopicText` 无 topicLeaf 时 fallback `group.tags.find(isDisplayTag)`，
   "真题" 通过 isDisplayTag → 当作主题渲染。与退役旧 pill **同源同行为**，非回归。
   存量数据 quirk。

6. **section 非相邻同名会拆多组头**：`bucketGroupsBySection` 仅在 label 变化时开新桶，
   `[阅读,阅读,写作,阅读]` 产生两个「阅读」组头。真库通常按部分有序，不成问题；已在
   代码注释声明。轻量 Should Watch。

7. **QA 截图未落盘（裁决 DEV 盲区 #4）**
   plan 要求截图入 `docs/cuts/home-editorial/qa/`，该目录不存在。DEV 自报环境限制、
   QA 已在会话内做。CSS 里的 `.concierge-group-row-title` flex-shrink 修复注释
   （"Reading A 渲染成 2.5px" 只有真渲染才能发现）是**真做过浏览器 QA 的实证**，
   故非造假绿。**不阻塞**理由：owner 是 PO 且做最终产品 QA = 事实上的 QA 闸门。
   **建议合并前 owner 亲自过一遍**：默认 feed + 展开 2026-i（三组头）+ 搜索命中 +
   窄宽（标题不塌）+ 键盘 Tab 走行——本刀的版式正确性无法由 source-grep 断言证明。

## Self-Review Blind Spots（喂给未来 Big CR 先看）

- **Test 21/22 是 source-grep，非行为断言**。它们证明「字符串在源码里」，不证明
  「渲染后布局对」。本刀最大真实风险（flex 挤压、hover 遮罩覆盖、触屏紧凑版、
  滚动定位）**无自动化覆盖**，只有 DEV 的手工 QA（无截图）背书。这是本刀验证强度的
  真实天花板。
- **`@media (hover:none)` 紧凑版隐藏 summary + 操作簇转 static** 我未在真机/仿真验证
  布局不错位，仅读 CSS 推断。
- **reduced-motion 依赖全局 `*` 规则**兜新过渡——我确认了该规则存在且用 `!important`，
  但未实机验证 `:active scale(0.97)` 在 reduced-motion 下的观感（transform 非
  duration，全局规则不移除它；plan 未要求移除，判为可接受）。
- **对比度**我按 WCAG 公式手算：ink-muted `#6A6A64` on surface-2 `#EDEDEA` ≈
  4.64:1（过）、on white ≈ 5.44:1（过）；ink-faint `#9A9A93` ≈ 2.4–2.8:1（不过 4.5）
  但 DESIGN.md line 123/212 明文「极弱墨仅限非正文标注、不要求 4.5」，组头/元信息/
  topic 属此类，**合规**。未跑自动对比度工具，手算或有小数误差。

## Failure / Attack Angle

- **最可能的隐藏失败**：Test 21/22 全绿 + owner 只扫默认 feed 就合并，而 search 部分
  命中场景（"全卷 · N" 低报 + 降灰路径其实不可达）从未被真库验证——因为构造混合命中
  桶需要特定查询，日常 QA 碰不到。未来若有人依赖「非命中降灰」做搜索 UX，会发现它
  从不触发（死代码假象）。
- **未来 agent 误用**：`dimmed` prop + `.is-dim` CSS 看似活的搜索高亮机制，实为
  forward-compat 死分支；后续 DEV 可能误以为它在工作而基于它加逻辑。已在 finding #3
  点名。
- **回归伪装**：若有人重新引入 groupType 串（与新「全卷·N」并存），Test 21 不会 fail
  ——它只查新串存在，不查旧串消失。属正断言弱点。

---

# 第二轮 CR — 方向 C「开门见卷」（命令行 + 筛选折叠 + 年份分组档案）

Fresh cold-read（medium 刀，第二轮 delta only）。Reviewer ≠ implementer。
审 delta = `338b097` 单 commit（父 = merge `b486f61`；merge 带入的 main / flow-panel
改动不在本轮范围）。契约 = `plan.md`「第二轮 — 方向 C」+ 审美章程（打回制）。

## Recommendation

**APPROVE WITH MUST FIX** — 1 条 Must Fix（年份组头「N 套」计数在默认收起态失真，
违反打回制章程「真实计数」，开屏即见，有截图铁证）。其余为 Should Watch。行为零
回归、scope 未漂移、Forbidden 未触。Must Fix 修掉即可合并；PO 亦可显式豁免（见下）。

## Changed Scope（delta = 4 文件，全在白名单）

`git diff --stat 338b097^ 338b097`：

- `app/src/concierge/ConciergeDesk.tsx`（本轮升为正式白名单——命令行/筛选折叠/年份分组）
- `app/src/concierge/ConciergePaperRow.tsx`（year 列条件渲染 + `data-variant`）
- `app/src/App.css`（仅 `.concierge-*` 段 + `home-mode-ai` 命令行选择器）
- `scripts/verify-home-default-feed.mjs`（Test 23/24/25 新增）

Forbidden 逻辑七件（useConciergeDesk / conciergeSearch / filters / aggregate /
reason / defaultFeed / paperSurfaceHref）+ `ConciergeGroupCard.tsx`（第一轮成果）
+ `verify-concierge-desk.mjs`（Forbidden 未改）**diff 文件名清单证实零改动**。

## Verification Evidence（独立复跑，非抄 DEV 数字；在 worktree@338b097 上跑）

- `node scripts/verify-home-default-feed.mjs` → **59 passed, 0 failed**（含新 23/24/25）
- `node scripts/verify-concierge-filters.mjs` → **33 passed, 0 failed**（未改脚本仍绿）
- `node scripts/verify-search-thinking-toggle.mjs` → **12 passed, 0 failed**
- `node scripts/verify-concierge-desk.mjs`（Forbidden 回归佐证）→ **250 passed, 0 failed**
- `npx tsc --noEmit`（app/）→ **exit 0**

新断言强度：Test 23/24/25 均本仓 source-grep 惯例（抓代码 shape，非渲染行为）。
**注意 Test 24 断言 `{yearGroup.papers.length} 套` 恰恰把 Must Fix 的错误计数固化**
——它证明「渲染了 papers.length」，不证明「papers.length 等于该年真实套数」。故本轮
verify 无法捕获下述 Must Fix。这是断言层的结构盲点，非造假绿，但需知其覆盖上限。

## 一、行为零回归核实（最高优先，逐轴过）

- **搜索提交 / 防抖 / 思考模式**：`intent-input` 的 onChange/onSubmit、`submit()`、
  `submitDisabled` 未动；思考模式 checkbox `onChange=onThinkingModeChange` 未动，仅把
  说明句从可见 `.concierge-thinking-hint` 改为 `visually-hidden` + `aria-describedby`
  + 容器 `title`（a11y 等价，行为不变）。`verify-search-thinking-toggle` 12 绿。✅
- **筛选逻辑**：`filters` state / `toggleFilter` / `applyConciergeFilters` /
  `filteredPaperResults` / `filteredQuestionGroups` 全未动。新增仅呈现层：`removeFilter`
  （单键 `delete`，复用同一 setFilters 语义）、`filterPanelExpanded`（纯门控）、
  `activeFilterEntries`（只读派生）。`verify-concierge-filters` 33 绿。✅
- **四条 handler + data-ra-* + 展开**：`ConciergePaperRow` delta 仅 (a) 把 year 列包进
  `variant !== 'feed' &&`，(b) 加 `data-variant={variant}`。onTogglePaper / onAdd /
  onSimilar / onOpenDetail 透传不变；年份分组 `<div>` 内 `<ul>` 逐行仍传全部 handler。✅
- **ConciergeDesk 只动布局层**（本轮重点审授权文件）：命令行是把原 `intent-bar` +
  `thinking-toggle` 包进 `.concierge-command-bar`；筛选面板加 `&& filterPanelExpanded`
  门控；feed `<ul>` 外包一层年份分组 `<div>`。**数据流 / 提交 / 状态机零改**。✅

## 二、年份分组正确性

- **降序 + null 末尾**：`buildDefaultFeed` 已按 `year DESC`、null(`-Infinity`) 排末尾
  （defaultFeed.ts 第 35-40 行确认）。`groupFeedByYear` 只做「相邻同年开新桶」，不重排
  不重桶——排序前提成立时分桶正确；null → 尾部「其他」组自然落位。✅
- **search variant 保持平铺 + 保留年份列**：年份分组 `<div>` 只包 feed 分支
  （`showFeed`）；search 结果走 `filteredPaperResults` 分支未改，仍平铺；`ConciergePaperRow`
  `variant !== 'feed'` 时保留年份列。✅ 符合 plan #4。
- **`data-variant` 绕 `verify-concierge-desk` 钉死 className 的裁决**：**可接受**。
  className 字面量 `` `concierge-paper-row${expanded ? ' is-expanded' : ''}` `` 原样保留，
  被钉死的断言不被削弱（250 绿佐证）；`data-variant` 是**附加** JSX 属性 + CSS attribute
  选择器门控，非「弱化/删除断言换绿」。属正当的加 hook 而非绕闸门。✅

## 三、审美章程遵守（打回制）

- **零新增 hex**：delta CSS 全部 hex（`#1E1E1C #1E4A3A #2C6E56 #9A9A93 #C6C6C0
  #D8D8D2 #EDEDEA`）逐个核对——在 `338b097^` 的 App.css 中均已存在（16/4/15/8/26/… 处）。
  `rgba(44,110,86,α)` 是签名墨绿 `#2C6E56` 的 alpha 变体，用于可移除激活 chip（可点/
  选中态）——符合「墨绿只出现在可点动作与选中态」。**无新增 hex、无新增强调色**。✅
- **签名唯一 / 结构编码真相**：命令行未加第二个描边控件（filter toggle 仅一根 hairline，
  注释明确「不发明与搜索框竞争的第二个框」）；年份组头除「年 + N 套」外无 eyebrow/编号/
  装饰。✅（计数正确性见 Must Fix。）
- **筛选折叠 aria-expanded**：filter toggle `aria-expanded={filterPanelExpanded}` +
  `aria-controls={filterPanelId}`；面板 `id={filterPanelId}`。✅
- **reduced-motion**：新 `concierge-filter-panel-in`（200ms ease-out）+ 各 transition
  由全局 `@media (prefers-reduced-motion){*{animation-duration:.01ms!important;
  transition-duration:.01ms!important}}`（App.css:4080）兜底覆盖。✅

## 四、390px 命令行 flex-wrap 修复

`.concierge-command-bar { flex-wrap: wrap }` + `@media (max-width:640px)` 令
`.concierge-intent-bar { flex-basis:100% }`（搜索独占一行，toggle/筛选/计数换第二行）。
640 断点覆盖 390，沿用 `.concierge-paper-row` 既定断点。逻辑正确。✅（未实机测 390 布局，
仅读 CSS 推断——见 Blind Spots。）

## Findings

### Must Fix（阻塞合并，PO 可显式豁免）

**M1 — 年份组头「N 套」= 分页 slice 内可见套数，非该年真实总数（打回制章程违规）**
`visibleFeedByYear = groupFeedByYear(visibleFeed)`，而 `visibleFeed = feedExpanded ?
defaultFeed : defaultFeed.slice(0, 8)`。默认 `feedExpanded=false` → 收起态只取前 8 卷
分组 → **边界年份被拦腰截断，组头计数失真**。

铁证（`c-round2-01-feed-groups.png` 开屏截图）：`2026·3套` `2025·3套` `2024·2套`。
但库内 2024 实为 **4 套**（`v_question_group_cards` distinct paper_name：2026=3、
2025=3、2024=4、2023=5、2022=6、2021=6、2020=6）。前 8 卷 = 2026(3)+2025(3)+2024(2/4)，
故「2024·2套」少报 2 套；点「显示全部」后会跳成「2024·4套」——**自相矛盾即证伪**。

违反审美章程「**结构编码真相：年份组头是真序列（带「N 套」真实计数）**」（明文打回制），
且失真发生在「好默认：档案开屏即见」的首屏、本轮的招牌功能上。DEV 对命令行库存计数
特意用「全库常数」求真（注释「reads as a constant fact, not a moving count」），却在
组头计数引入了 slice 截断的失真——同一份真值意识没贯彻到组头。

修法（呈现层小改，任选）：
- (a) 组头「N 套」从**未 slice 的 `defaultFeed`** 分组取该年真实总数，行仍按 8 分页渲染
  （组头显真数、下方可能只列部分行 + 显示全部）；或
- (b) 翻卷场景**不按固定行数中途截断年份**（按年份组分页，收起态只展示前 N 个完整年份组）。
推荐 (b)，与「档案」心智更贴。

**PO 豁免路径**：若 owner 明确接受「N 套」语义 = 「本页可见套数」而非「该年总数」，可
豁免——但这与章程「真实计数」直接冲突，且开屏即见的「2024·2套」对熟悉自己题库的 owner
是错误信息，建议不豁免。owner 首轮 QA 截图虽过此屏，但错值「看着合理」正是 QA 会漏、CR
须抓的一类（owner 不会去逐年数）。

### Should Watch（不阻塞）

**SW1 — 双计数并存，筛选激活时可能认知摩擦（裁决 DEV 盲区 #2）**
命令行计数 `catalogPaperCount/GroupCount = buildDefaultFeed(questionGroups)` 恒为全库
常数（34 套·278 篇章），而 feed 引导句「题库里现有 {feedPaperCount} 套卷 · N 个篇章」
用**随筛选收窄**的 `defaultFeed`。无筛选时二者一致（截图均 34）；一旦激活筛选，命令行仍
显 34、引导句显收窄数 +「（已筛选）」。两处同形态计数（套卷·篇章）一处不动一处动，可能让
人一愣。「图书馆常数」设计意图合理（DEV 注释清楚），引导句的「（已筛选）」也消歧，故
**不误导到阻塞级**。建议：命令行计数措辞可加「全库」语义，或与引导句统一口径。另注：
`catalogFeed` 每次 `questionGroups` 变都全量 `buildDefaultFeed`（含 search 态），与
`defaultFeed` 并存两次聚合；33 卷规模无性能问题，仅记录。

**SW2 — 主题仍在卷名下方独立行，未按 plan round2 #3「主题同行」（裁决 DEV 盲区 #1）**
plan 第二轮 §3 明文「行改方向 B 形：卷名打头 + 宋体卷种 + **主题同行（ellipsis）**」，
但 `ConciergePaperRow` feed 版式未重构，主题仍渲染为卷名下方独立 `.concierge-paper-topics-line`
`<p>`（截图确认：「乡村振兴 · 积极的生活态度 · …」在卷名下一行）。DEV 自判「主题同行」
指第一轮已完成的去药丸化。**裁决：契约歧义，标注 PO**——round1 已把主题从药丸改纯文本行
（一种「同行/成行」解读）vs round2 §3 字面要求与卷名**同一行**（方向 B）。owner 开屏看的
就是这版式，其首轮 QA 截图已过；**若 owner 要真正同一行 = 一次呈现层返工**（改
ConciergePaperRow feed 布局，属 `.concierge-paper-*` 段小改，不碰逻辑）。非本轮阻塞。

**SW3 — activeFilterEntries 标签回退可能露原始码**
`activeFilterEntries` 用 `filterOptions[dim].find(v => v.value === String(filters[dim]))`
取中文 label。faceted 选项在该 dim 自身激活时可能不含选中值 → 回退 `String(filters[dim])`
（如 region 会显原始码而非中文名）。移除交互（`removeFilter`）不受影响，仅收起态 chip 文案
可能不美观。低频、非阻塞。

## Self-Review Blind Spots（喂给未来 Big CR 先看）

- **Test 23/24/25 全 source-grep**，证明代码 shape 不证明渲染。本轮真实风险（命令行
  390 挤压、筛选折叠展开位移、激活 chip 换行、年份组头版式）无自动化覆盖，靠 DEV 的
  21/21 QA 截图背书；我核了首屏截图（并借它抓到 M1），未逐张核完 9 张。
- **M1 的库内年份分布**我用 `data/question-bank.sqlite` 的 `v_question_group_cards`
  distinct paper_name 推算（33 卷，2024=4）。`aggregatePaperResults` 的 paper key 若与
  distinct paper_name 不完全一致，具体数字或有 ±1，但「slice 截断致边界年份少报」的
  结论与截图「2024·2套」直接吻合，不依赖精确分布。
- **catalogFeed 双聚合的性能**我判为 33 卷规模无虞，未实测；若将来题库涨到数千卷需复看。
- **筛选折叠 200ms 动画在 reduced-motion 下**我确认全局 `!important` 规则覆盖，未实机验证。

## Failure / Attack Angle

- **最可能的隐藏失败**（已命中 = M1）：verify 全绿 + owner 扫一眼首屏就合并，而组头
  「2024·2套」是错值——source-grep 断言反而把 `papers.length` 计数固化成「正确」，
  owner 不会逐年数卷，错值就此长期在开屏首帧误导。这正是「passes verify but still wrong」。
- **未来 agent 误用**：`catalogFeed`（全库常数）与 `defaultFeed`（随筛选）两个近义计数
  并存，后续 DEV 易混用错源；已在 SW1 点名。
- **绕闸门伪装**：`data-variant` 若被将来 DEV 当成「className 钉死后随便加行为门控的口子」
  滥用会侵蚀 verify-concierge-desk 的保护面——本轮用法合规（纯 CSS 呈现门控），但需盯住
  它不演变成第二条行为分支入口。
