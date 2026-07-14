# motion-press-exit — Fresh CR

冷读复核。CR agent 未参与实现，逐条对 `plan.md` 契约 + `emil-findings.md`
施工依据核账。DEV 的 `wip: impl complete` 报告当输入不当真相：verify、Forbidden、
scope、验证有效性全部亲自复核。

- 基线：main @ 5196bbe → HEAD 1857b9d（`git diff 5196bbe..HEAD`）
- 范围：18 文件，+410/-60。纯展示层（CSS + toast/modal 挂载态 TSX +
  两个 shared helper + 三个 verify 脚本重锚）。

## Verdict

**APPROVE** — 0 Must Fix / 4 Should Watch。

契约逐条成立，Forbidden 无一触碰，scope 零漂移，验证真green（我本地跑过，
非采信 DEV 报告）。剩余 4 项是 DP-2 浏览器 QA 该实证的观感点 + 测试耐久性
备注，均不阻断 merge。

## 硬契约核对（plan「Must Do」7 组）

| 契约 | 状态 | 证据 |
| --- | --- | --- |
| 1 按压反馈：两处半残 `:active` 补 base transform + 列出可按元素补 scale(0.97) | ✓ | concierge-action(App.css:3677)/command-filter-toggle(4232) base 补 transform；intent-submit(3311)/basket-chip(3877)/export-trigger/my-space 按钮新增 `:active:not(:disabled){scale(0.97)}`；全走 `--motion-fast + --ease-out`，无新值 |
| 2 弹层入退场：两模态 backdrop 淡入+dialog fade/scale、退出~120ms；两菜单入场+trigger origin；my-space 模态按钮补 transition | ✓ | draft/my-space 两模态走 `usePresence(...,120)` 保持挂载播 exit；backdrop opacity + dialog scale(0.97)，enter=motion-base/exit=motion-fast；导出菜单 origin=top-right、插入菜单=top-center；my-space confirm 按钮补 hover+press transition。用 mount-only keyframe（菜单，`{isOpen&&}` 全卸载）与 data-visible+presence（模态/toast，需播 exit）两制分治，选型正确 |
| 3 toast keyframe→transition，入退同轴、退出快于入场、可平滑重定向 | ✓ | draft-undo-toast/pi-toast 删 keyframe 改 `[data-visible]` transition，enter=motion-base/exit=motion-fast（退出快于入场✓）；`useToastPresence` 重触发 clearTimeout+swap-back，in-flight transition 重定向不 reset（Sonner 原则5，注释与实现一致） |
| 4 reduced-motion scroll helper，四处统一 | ✓ | 新增 `reducedMotionScroll.ts` 单一 helper；4 call site（PaperBrowsePage×2 / ConciergePaperRow / DraftPaperWorkbench）全改走 `scrollBehavior()`；PaperBrowsePage 原本内联的 matchMedia 分支被抽走后由 helper 复用，行为等价 |
| 5 一致性/性能小账 | ✓ | rail-item(500)/version-toggle(160)/form-toggle 补 transition；lecture-handle `right`→`translateX`（base 有 translateY(-50%)，open 叠 translateX(-380px)，合成器可动✓，<1200px 行为与旧 `right` 一致）；PaperSurface.css:366 硬编码 80ms→`--motion-micro`；detail-hero 降 motion-base、sections 撤入场 |
| 6 B 路 CSS 小账 | ✓ | intent-submit disabled 色 #9A9A93→#6A6A64（对比度修）；topbar-page-title 补 max-width:320px+既有 ellipsis；my-space 卡片名 h4→h3（见 SW-2）；`--mint-soft`(emerald)→`color-mix(accent/teal 8%)` |
| 7 reduced-motion 退化不破坏 | ✓ | 无新增 @media；新 transition/keyframe 天然被 App.css:4395 全局 `*` nuke 覆盖（见 SW-4） |

## Forbidden 核对（逐条，全部未碰）

- 搜索/推荐/URL 状态/卷名组合/rail 截断：**未动**。PaperBrowsePage 改动仅
  `behavior` 实参，逻辑分支不变。
- 纸面渲染管线 + iframe srcDoc + `draftPaperPreviewHtml.ts`：**未在 diff**
  （`git diff --stat` 确认，该文件仅被既有 import 行引用，未改）。
- DESIGN.md token 值 / 新增 CSS 变量：**零新增 CSS 变量**（`grep '^\+.*--[a-z]'`
  空），比契约允许的还干净；token 值未改。
- 依赖 / spring / FLIP / bounce / blur：**未加依赖**（package.json 不在 diff）；
  presence hook 是延迟卸载，非 spring/FLIP。
- server / schema / 生产：**未动**（仅 app/src + scripts/verify）。
- verify-motion-tokens 白名单重锚行号与最终 diff 一致（a3 9a1907a 判例）：
  **成立**——白名单 188/327/564→190/352/593，`grep -n '#ffffff'` 最终文件三处
  正是 190/352/593，逐行对齐。

## 验证有效性（不采信「测过了」，亲自跑 + 看覆盖）

- `pnpm -C app run verify:all` 本地实跑：**77 passed / 0 failed / 1 skip**。
  skip 是 `verify-i16a-teaching-dimension-search`（off-repo fixture 缺失，
  预存性 skip，非本刀引入）。
- `npx tsc --noEmit` 独立跑：**exit 0**。verify-ci 内 `app build/typecheck`
  step 也覆盖 tsc，typecheck 确在门内。
- 三个 verify 脚本改动是**诚实重锚不是放水**：reduced-motion 断言从「查
  pageSrc 内联 pattern」改成「查 helper 内 matchMedia 分支 **且** call site 用
  scrollBehavior()」——风险仍被证明（reduced-motion 分支存在 + 站点确实路由到
  helper），只是跟着代码搬了家。concierge 脚本同理新增读 helper 源做 &&
  双证。

## Should Watch

- **SW-1（DP-2 浏览器 QA 实证）enter 靠单 rAF 翻 data-visible**：
  `useToastPresence` 用 `requestAnimationFrame(()=>setVisible(true))` 单帧翻
  可见态触发 enter transition。首帧 `opacity:0` 若未被浏览器绘制就翻，个别
  浏览器可能塌陷起始帧 → 首次打开「跳」而非「渐入」（exit 不受影响，是对
  已绘制节点翻态）。DP-2 请肉眼过：撤销 toast / 保存 toast / pi-toast / 两模态 /
  两下拉的**首次打开** enter。若真塌陷，改双 rAF 即可。
- **SW-2 my-space h4→h3 命中的是 aria-hidden 节点**：改的 h3 在
  MySpacePage.tsx:246，其父 `.my-space-card-thumb`(244) 带 `aria-hidden="true"`，
  不进 a11y 树——heading outline（h1→h2→dialog h3）改前改后都不变。真正可见的
  卡片名是 `<p class="my-space-card-title">`(258)，本就不是 heading。findings
  的「h2→h4 跳级」担忧指向的是隐藏节点，此改无害但也没解决「卡名非 heading」
  的真语义缺口。无需动作，除非 owner 要真 heading。
- **SW-3 helper 路由的测试覆盖不均**：4 个 scroll call site 里，只有
  PaperBrowsePage 与 ConciergePaperRow 有专门断言查「站点用 scrollBehavior()」；
  DraftPaperWorkbench 的 `window.scrollTo({behavior:scrollBehavior()})` 无专属
  断言兜底。我已逐行读 diff 确认四处都改了，当下正确；备注是防未来回归时
  第 4 处静默漏改。
- **SW-4 新 toast/modal 的 reduced-motion 全押在全局 nuke**：pi-toast 原本自带
  的 `@media (prefers-reduced-motion){animation:none}` 被删，现在 pi-toast 与
  所有新 transition 的 reduced-motion 退化全靠 App.css:4395 的全局 `*`
  `transition-duration:0.01ms!important`。今天正确；但哪天有人把全局 nuke
  收窄/移除，这些会静默失去退化。属架构耦合提示，非本刀缺陷。

## 结论

例行零裁决点刀，施工严格照 findings 两表，无发明、无扩面、无 Forbidden
擦边。verify:all + tsc 亲验 green。放行 DP-2 浏览器 QA（重点盯 SW-1 首开 enter
与 reduced-motion 模拟）。
