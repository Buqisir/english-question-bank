# cr-4.md — 刀④ 主线审美打磨 冷读 CR

Branch: `restart-4-mainline-polish` @ `a6d5ca4`（rebased）· base `main=bc4743d`（= merge-base，干净）
Reviewer: fresh Opus CR（冷读，未参与 DEV）· 2026-07-02
Diff: `git diff main...github/restart-4-mainline-polish`（7 文件，+221/−38）

## Verdict: APPROVE

契约（plan.md 刀④ + 三铁律）全部满足；DEV 自报五点全部核实成立；两个既有 verify（229 + 44 断言）实跑绿；无 Must Fix。仅列 Should Watch（非阻塞，视觉走查/后续收口）。

---

## 三铁律核验

- **Color-Lock（token 值零改）**：PASS。`:root` 真身在 `app/src/index.css:3-13`，`--surface-strong:#f1f5f9` 等 slate 值**逐字未动**。App.css:5085-5092 只是在 `.app-shell.home-mode-ai` 作用域**新增**四个 token 重绑（slate→暖），契约明文允许「作用域内重绑」。既有暖 hex（`#B8323C`/`#C6A044`）均以同色相 rgba 复用，无一处改既有 hex 值、无新造色。
- **No-Blue**：PASS。diff 内零蓝色引入；焦点环用中性 `rgba(26,26,26,*)`，checkbox accent 用赭红 `#B8323C`。
- **Red-Pen ≤10%**：PASS。新增红仅 checkbox `accent-color:#B8323C`（契约 item 4 指定）+ clarification 边框同色相 rgba（原本就是红 side-stripe，换形不换色）。远低于阈值。

## DEV 自报五点裁决

1. **item 8 主动偏离（label 包 select + 移除 aria-label）——成立**。
   `DraftPaperWorkbench.tsx:421` 改为 `<label className="draft-recent-select-field"><span>最近草稿卷</span><select…></label>`。`<label>` 包裹表单控件时，label 文本内容即成为该控件的 accessible name——与被移除的 `aria-label="最近草稿卷"` 字面完全一致，无障碍语义被可见 label **等价覆盖**，且额外得到点击命中区。偏离比契约原方案（把「自动保存」状态指示器改名）更优：保住了 `.draft-save-status` 的真实语义（保存中/已保存/自动保存），消歧义落在相邻 select 上。裁决通过。

2. **MySpacePage 空态 CTA `onOpenDraft('')`——成立**。
   `MySpacePage.tsx:243` → `App.tsx:3249` `onOpenDraft` → `openDraftPaperWorkbench(draftPaperId)`。实现 `App.tsx:3100-3125`：`if (draftPaperId)` 为 falsy（`''`）走 else 分支 `url.searchParams.delete('draftPaperId')` + `draftPaperId: null`，即「不带 id 开工作台=新草稿卷」，不报错。行为符合「去组一份卷子」。裁决通过。

3. **ResizeObserver 预览缩放——成立，无泄漏/除零/首帧问题**。
   `DraftPaperWorkbench.tsx:191-204`。cleanup `observer.disconnect()` 覆盖卸载与 `previewHtml` 变化两条路径，无泄漏。`NATIVE_WIDTH_PX=794` 常量、`if(!containerWidth) return` 双重护栏，无除零/NaN。`previewScale` 初始 1 → 首帧 inline style `undefined`（≥1 分支不施 transform）→ mount 时 `updateScale()` 同步纠正。桌面容器 ≥794px 恒为 1，无 transform、零回归。`.draft-a4-sheet` 始终渲染故 ref 必挂。裁决通过。

4. **`.app-shell.home-mode-ai` 作用域重绑——无经典模式泄漏**。
   经典模式无 `home-mode-ai` 类，token 重绑与 `.ghost-button` scoped 规则**结构上不可能**触达经典模式；`:root` 零改动。specificity 提升（`.app-shell.home-mode-ai .ghost-button`）只在 AI 子树内覆盖，经典模式 `.ghost-button` 继续读 `:root` slate。`.concierge-*` 基类改动（border/radius/CTA 填充）为 AI 独有元素，经典模式无该 DOM。`@media reduced-motion` 内 `.concierge-action*` 虽未加 AI 前缀，但同理经典模式无此元素、且只置 `transition:none`，无害。裁决通过。

5. **零断言修改却全绿——正常，非绕过**。
   实跑 `verify-concierge-desk.mjs`（229 passed/0 failed）+ `verify-c8-draft-paper-contracts.mjs`（44 passed/0 failed）。抽查：
   - `verify-concierge-desk:709` `#9A9180` 断言锚定 `.concierge-data-loading`（diff **未触**），diff 改的是 `.concierge-intent-input::placeholder`（→`#6B645C`，item 3），无断言 pin placeholder 色。
   - `verify-c8:85` `card.includes('已在草稿卷中')` —— 新标签 `'✓ 已在草稿卷中'` 含该子串，仍过。
   - smoke 用 `.concierge-intent-submit` 类定位（未变）+ Playwright `getByRole({name})` 默认子串匹配，`'取题中…'`/`'✓ …'` 均不破锁。
   结论：DEV 改的视觉属性（placeholder 色、border-radius、side-stripe→全边框、CTA 墨填）本就不在既有断言覆盖面内——这是**正常的覆盖空缺**，不是 DEV 恰好绕过了本应更新的断言。无孤儿断言、无弱化行为断言。

## Should Watch（非阻塞）

- **SW-1｜`✓` 前缀标签在经典抽屉未同步**：`App.tsx:3839/3899` 经典模式抽屉仍为无 `✓` 的 `'已在草稿卷中'`。契约禁碰经典抽屉，故 DEV 只给 concierge 卡加 `✓` 是**遵守边界**，但造成 AI 卡片与经典抽屉同语义标签分叉。可接受；若后续统一视觉语言再收口。
- **SW-2｜移动端缩放的水平居中**：`transformOrigin:top left` 使 scaled iframe 靠左，`.draft-a4-sheet` 仍 `width:100%`，右侧留白（非裁切）。功能正确（不再横向裁切，达成 item 7），居中为纯视觉细节，交主 agent 移动端截图走查。
- **SW-3｜首帧闪动（极窄屏）**：媒体查询下 iframe 固定 `width:794px`，transform 施加前的一帧可能溢出，靠 `.draft-a4-sheet overflow:hidden` 裁住 + `updateScale()` 同步纠正。边界闪动可能但有界，非缺陷。
- **SW-4｜token 级联广于 `.ghost-button`**：AI 作用域重绑的四 token（`--surface-strong/--line/--line-strong/--ink`）会级联到 AI 子树**所有**消费者（非仅 ghost-button）。全部为 slate→暖迁移，与 P0-1「去 slate」意图一致，未见 AI 内需保持 slate 的元素。属契约授权的作用域重绑，记录以备大 CR。

## Self-Review Blind Spots（喂后续 Big CR）

- 未跑浏览器实测（smoke-c8 需活服务器 + Playwright，非 hermetic verify:all）——SW-2/SW-3 的实际视觉表现依赖主 agent 截图终审确认。
- 未对 AI 子树逐一枚举「哪些具体元素消费了被重绑的四 token」做穷举 computed-style 核对（契约验收要求 computed style 抽查 6 个头部按钮，属主 agent 浏览器 QA 收口）；CR 层已确认结构安全（经典模式不可能被触达），但 AI 内部逐元素观感由视觉走查裁定。
- 未验证 `verify:all` 全套（只跑了两个最相关的 concierge/c8 verify）；契约要求 `pnpm -C app run verify:all` 绿，建议合并前主 agent 跑全套确认无其他脚本因文案/类名变动回归。
