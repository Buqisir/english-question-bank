# ui-p1-shell — CR (fresh cold read)

Reviewer: CR 子代理（fresh context）。Diff 范围 `git diff 09f6c47..17d25fa`（无未提交改动）。
改动面：`App.css`（+70/-33）、`App.tsx`（+2）、`AdminWorkbench.tsx`（+2/-2）、`adminWorkbench.css`（+7）。

## Verdict: **APPROVE**（0 Must Fix / 2 Should Watch）

五条逐一对 plan 符合、verify 复用、Forbidden 面零触碰均已冷核通过。裁定明确、纪律克制。

---

## 五条符合度核验（逐一对 plan）

**#1 焦点环** — 符合。单点 token `:root { --focus-ring: 2px solid var(--accent, #2C6E56) }`（App.css:6），
12 处 `outline: var(--focus-ring); outline-offset: 2px` 全部落地。`--accent` 经 index.css→`--eqb-color-primary`
解析，QA computed-style 实测 `rgb(44,110,86) solid 2px` + `offset 2px`，与 token 意图一致（fallback 冗余但无害）。
`.paper-canvas-block.selected`（2880，`0 0 0 2px var(--accent-glow)`）正当排除——点击选中态非 WCAG 2.4.7 焦点指示器。

**#2 窄屏顶栏** — 符合。780px 断点（App.css:2247）内 `flex:1`/`width:100%` 退役，改 `justify-content:flex-end`
+ `align-self:stretch`。全站仅此一处 narrow 断点触 `.topbar-actions`；base 规则（123）为 `flex-wrap:wrap` 无 width，
无别的窄屏回归路径。溢出折行右对齐与 plan「容不下则折行右对齐」一致。QA 760px 截图证实无整宽灰条/孤钮。

**#3 admin 脱 library-panel** — 符合，且已 grep 全部消费者确认无连带：脱类后 `library-panel` 唯一非 CSS 消费者
是 App.tsx:1095（题库 section），它位于 `{!adminRouteActive && (` 块内（1093）——故 `.app-shell.home-mode-ai .library-panel`
覆写规则（3749）仅作用于非 admin 路由的题库面板，admin 干净脱离、无共享样式被连带。`.admin-panel` 由 adminWorkbench.css
自接管宽度（`width:100% / max-width:1160px / min-width:0`）。主操作 ghost→primary-button 到位。

**#4 pill 路由态** — 符合。`{!adminRouteActive && (<button className="basket-chip">)}`（App.tsx:1175）。
`adminRouteActive` 定义于 233，全文 1080/1084/1093/1175 同一门控一致，pill 现与 `<main className="workbench">` 同门控对齐（此前漏）。

**#5 App.css 低对比暖灰** — 符合，裁定正当（见下）。

---

## DEV 自报的范围替换裁定 — 冷核结论：**正当**

① **规则精神 vs 字面**：审计 #13 点名的 `#8A8177/#8A8272/#6B6455` 确不在 App.css（全文零命中），属
paperBrowsePage.css / harness css（panels 刀独占）。DEV 改 App.css 内真实存在的 `#9A9A93`（2.83:1，比审计举例更差）
5 处——按 plan「App.css 范围内 <4.5:1 正文级小字统一升 #6A6A64」的精神执行，正当。

② **正文级 vs 非正文级**：DESIGN.md L123 定义 `#9A9A93` 极弱墨「仅限非正文标注（占位/禁用/极次要标签）」。
逐一核 5 处**未改**的 `#9A9A93`——全部是真 `:disabled`（3296/3642/3689/4411）或装饰 `·` 分隔符（3612）——
零误伤，无非正文级被误升。**5 处升档中：** `.concierge-group-section-head`（分组标题）不含糊属结构文字，升档明确正确；
`feed-year-count`/`command-count`/`group-row-topic`/`is-dim` 属计数/标签/降灰态——DEV 在此选 WCAG AA（可读信息文字须达 4.5:1）
优先于 DESIGN.md「极次要标签可用极弱墨」的许可，且 #6A6A64 仍为弱墨（保留层级），**非过度修改**。仅 SW-2 记一笔。

③ **panels 刀无漏网**：ui-p1-panels/plan.md 条目 8 明确覆盖「本刀独占文件内 <4.5:1 正文级小字升 #6A6A64」，
literal hex 所在文件（paperBrowsePage.css/harness）归其管辖。两刀边界严丝合缝，无孤儿。

---

## Should Watch（非阻塞）

**SW-1 — 两处 `:focus-visible` 未接入 token（DEV「12处全部」表述略夸大）。**
`.concierge-row:focus-visible`（App.css:3538）与 `.concierge-paper-row:focus-visible`（4529）仍用
`box-shadow: inset 0 0 0 3px rgba(44,110,86,0.35)`。这是键盘焦点指示器，在 #EDEDEA 底上合成对比 ≈1.5:1，
与审计 #1 同缺陷类（WCAG 2.4.7）。未阻塞原因：① plan #1 字面锚点是 0.20-alpha 系统性外发光按钮（已全清），
这两处是 0.35-inset 行级、不在字面清单；② 严重度低于按钮。**建议**：panels/后续 UI 扫尾一并接入 `--focus-ring`。
DEV QA note「12 处全部改用 outline token」措辞应校正——App.css 内 `:focus-visible` 仍有 2 处 box-shadow 残留。

**SW-2 — 计数/标签类升档与 DESIGN.md 弱墨层级的取舍。**
`feed-year-count`/`command-count`/`group-row-topic` 及 `is-dim` 降灰态原用极弱墨，符合 DESIGN.md L123「极次要标签」许可；
DEV 升 #6A6A64 是 WCAG-first 判断（可辩护、且保留弱墨层级）。若 owner 期望这些 meta 计数呈更淡的次要观感，可回看；
当前选择与审计 #13 + plan 契约一致，不阻塞。

---

## 复核确认（非发现，冷读已验）

- **既有 verify 无连锁**：无 test 文件断言 box-shadow/focus-ring（grep 零命中），焦点环改动不撞钉死断言。
  verify:all 73 passed/1 skip（预期 off-repo fixture）/0 fail、tsc exit 0（QA note 记录，范围纪律不重跑）。
- **Forbidden 面零触碰**：diff 仅 4 个 shell 独占源文件；panels 文件（paper-intelligence harness/QuestionGroupDetailView/
  ConciergeDesk/DraftPaperWorkbench/paperBrowsePage.css）、server/**、shared-ui/papersurface/** 全未动（git stat 证实）。
- **App.tsx 仅 1 处 TSX 改动**，符合 plan「悬浮加卷钮锚定/面板净空本刀不做」的边界。

## Self-Review Blind Spots（喂给 Big CR）

- 焦点环 token 只封装 `outline` 简写，未含 `outline-offset`；每处需手写 `outline-offset:2px`。panels 刀条目 9 复用时
  若漏写 offset，环会贴边——非本刀缺陷，但 token 契约不完整，Big CR 核 panels 接入时留意。
- SW-1 的两处 inset box-shadow 焦点环是全站焦点环治理的残口，Big CR 宜确认后续刀有归属，勿两刀都当「非我字面清单」漏掉。
