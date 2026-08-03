# Emil 工艺评审证据表（Assessment C，2026-07-13，DEV 施工依据）

来源：impeccable critique 三路评审之 C（Emil Kowalski 框架），live getComputedStyle
实证 + 全量 CSS/TSX 扫描。路径相对 `app/src/`。

## 系统判定

motion-pass 的 token 词汇表正确（曲线/时长/reduced-motion 全对、零 ease-in、
零 transition:all），欠账集中在 token 没铺到的交互态：按压、退出、弹层入场。

## Before/After 全表

| Before | After | Why |
| --- | --- | --- |
| `.concierge-action` transition 只列 `background/border-color/color`（App.css:3641），而 `:active` scale 0.97（App.css:3661） | base transition 补 `transform var(--motion-fast) var(--ease-out)` | 按下/弹回均无缓动直接跳变（live 实证）；这是全站最高频主操作"加入草稿卷" |
| `.concierge-command-filter-toggle` 同病（App.css:4177 base 缺 transform；:active 在 4199） | 同上补 transform | 同样的 pop-without-ease |
| `.concierge-intent-submit`（搜索→，App.css:3271）完全没有 `:active` | `:active:not(:disabled) { transform: scale(0.97) }` + base transition 补 transform | 一天按几十次的搜索提交应确认"听到了" |
| `.draft-export-menu-trigger`（导出，DraftPaperWorkbench.css:184）、`.basket-chip`（App.css:3841）、`.my-space-card-primary/-danger`、模态确认钮——全无 `:active` | 一条共享 pressable 规则：`:active` scale(0.97)，base 含 `transform var(--motion-fast) var(--ease-out)` | 全站按压反馈仅 3 处 selector（live stylesheet 扫描实证）；不可见细节靠叠加 |
| `.draft-save-space-dialog` + `.draft-modal-backdrop` 零动画出现（DraftPaperWorkbench.css:579-607；live: anim none） | backdrop opacity 淡入 160ms；dialog `opacity 0 + scale(0.97)` → 1，`var(--motion-base) var(--ease-out)`，用 `@starting-style`（或 data-mounted 回退）；origin 保持 center（模态豁免） | 全屏压暗瞬间出现正是"jarring appearance"本尊；偶发频率 → 标准动画档 |
| `.my-space-confirm-dialog` + `.my-space-modal-backdrop` 同样裸弹（MySpacePage.css:356-380）；其 取消/删除 按钮完全无 transition（live 实证） | 同上入场配方；按钮补全站标准 hover/press transition | 破坏性确认弹窗瞬现削弱确认步骤本该营造的郑重感 |
| `.draft-export-menu-panel`（DraftPaperWorkbench.css:195）与 `.paper-insertion-menu`（App.css:3120）出现/消失均瞬时（live 实证） | 入场 `opacity 0 + translateY(-2px) + scale(0.98)`，`var(--motion-fast) var(--ease-out)`，`transform-origin` 贴 trigger 边（导出=top-right，插入=top-center） | 下拉菜单 150-250ms ease-out；篮子预览 popover（paperIntelligence.css:1069）已有 fade+offset，这两个是异类 |
| `.draft-undo-toast`：keyframe 入场（DraftPaperWorkbench.css:560,574），退出=瞬间卸载（MutationObserver 实证） | 改 transition 制（data-state 或 @starting-style+退出类）：入场 160ms 上滑+淡入，退出 ~120ms 同轴返回 | 空间一致性：从哪来回哪去；连续删除重触发时 keyframe 从零重播，transition 可平滑重定向（Sonner 原则5） |
| `.pi-toast` 同模式：keyframe 入场（paperIntelligence.css:924-943）、瞬间卸载 | 同上 transition 配方 | 同理；顺带统一两套 toast 的动效语法 |
| `.paper-browse-lecture-handle` transition `right`（paperBrowsePage.css:441） | `right` 静态化，`--open` 态改 `transform: translateX(-380px)` | `right` 是布局属性，380px 面板入场时逐帧 layout+paint；transform 走合成器 |
| `.draft-paper-rail-item:hover`（DraftPaperWorkbench.css:480）与 `.draft-version-toggle button` / `.draft-form-toggle`（DraftPaperWorkbench.css:152-176）无 transition，hover/选中段瞬跳 | `background var(--motion-fast) var(--ease-hover), color var(--motion-fast) var(--ease-hover)` | 全站其他 hover 都在 120-160ms 缓动，唯独这几处瞬跳；不一致让系统不再像系统 |
| `scrollToAnchor` 无条件 `behavior:'smooth'`（PaperBrowsePage.tsx:1116、ConciergePaperRow.tsx:240、DraftPaperWorkbench.tsx:535），而 PaperBrowsePage.tsx:1001-1006 已正确按 `prefers-reduced-motion` 分支 | 抽 `reduced ? 'auto' : 'smooth'` helper，四处统一走它 | JS 的 behavior 选项压过 CSS reduced-motion 覆盖，3/4 处 reduced-motion 用户仍被滚动动画 |
| `PaperSurface.css:366` 硬编码 `border-color 80ms ease` | `var(--motion-micro) var(--ease-hover)` | token 泄漏（越过了 verify-motion-tokens 白名单）；一处漂移招下一处 |
| `.detail-hero` + 每个 `.detail-section` 每次打开跑 fadeInUp 260ms 且无级联（App.css:2376,2379-2383 一带；live 实证） | hero-only 入场降到 `var(--motion-base)`(160ms)，sections 不入场 | 详情一天开几十次（高频档），整块 260ms 复读入场付了入场档成本、零级联收益 |

## B 路 CSS 小账（同刀顺清）

| 问题 | 位置 | 修法 |
| --- | --- | --- |
| 搜索提交钮对比度 2.4:1（#9a9a93 on #ededea） | `button.concierge-intent-submit` | 图标色升到 ink-muted #6A6A64 或更深，UI 组件需 ≥3:1 |
| topbar 页标题溢出容器 39px | `span.topbar-page-title`（paper-intelligence 视图） | max-width + ellipsis（或 min-width 让位） |
| 个人空间标题跳级 h2→h4 | MySpacePage：h2"草稿卷"下直接 h4 卡片名 | 卡片名改 h3（或调层级），样式不变 |
| `--mint-soft` = rgba(16,185,129,.08)（emerald #10B981）洗 ~10 处工具 chrome | App.css（如 .filter-bar-summary） | 换 teal 系等效软底（brand-teal α 或 teal-50 系），单色相法归队 |

## 明确不做（Emil 框架判定，勿顺手加）

- 行展开（▸）保持无动画——高频+高度变化，正确。
- PI chips 80ms micro 保持。
- 不引入 FLIP/spring/bounce/blur-masking——本工具无手势、无 crossfade 问题。
- rail 平滑滚动保持现状（settle-loop 已处理中断），只做 reduced-motion helper。
