# draft-workbench-visual-unify — DEV 执行契约（已实现）

cut size: medium（纯前端视觉，逻辑零改动）。背景：设计评审（26/40，一致性
1/4）判定草稿卷工作台与站内设计系统割裂——`DraftPaperWorkbench.css`
（439 行）硬编码色值 55 处、`var()` 引用仅 1 处。权威依据：`DESIGN.md`
North Star（中性纸底/近黑墨/墨绿 #2C6E56 唯一签名强调）、Green-Pen Rule、
Flat-By-Default。

## 范围内文件

- `app/src/features/draft-paper/DraftPaperWorkbench.css`
- `app/src/features/draft-paper/DraftPaperWorkbench.tsx`
- `scripts/verify-draft-workbench-visual-unify.mjs`（新建）
- `scripts/verify-ci.mjs`（注册新脚本）
- `scripts/README.md`（注册新脚本）
- `scripts/verify-c8-draft-paper-render-model.mjs`（同步更新一处钉色断言，
  见下方「连带修改」）

未动：`app/src/shared-ui/tokens.css`、`App.css`、`shared/**`、其他
features、my-space。

## Token 映射表（本文件用到的每个 token 的语义依据）

来源：`app/src/shared-ui/tokens.css`（`--eqb-color-*` 原始值）+
`app/src/index.css`（`:root` 里给 App.css 用的别名 `--ink/--muted/
--surface/--surface-strong/--panel/--line/--line-strong/--accent`）。

| 原硬编码 | 新 token | 依据 |
| --- | --- | --- |
| `#EDEDEA`（page-level，shell/toolbar 语境） | `var(--surface)` (#F6F6F4) | D3：页基底对齐 `.app-shell` |
| `#EDEDEA`（嵌套层：`.draft-preview-desk` D8、`.draft-suggestions`） | `var(--surface-strong)` | DESIGN §2 Surface-2「嵌套区分」；这两处本来就是嵌套在 shell/outline-panel 内的次级面 |
| `#F6F6F4`（`.draft-toolbar`/`.draft-outline-panel`/`.draft-save-space-dialog`，均为浮在 shell 上的卡片） | `var(--panel)` (#FFFFFF) | DESIGN §5 Cards：卡片背景走 Surface(#FFFFFF)，对照 `.topbar` 的 `background: var(--panel)` |
| `#ffffff`（输入框/按钮/outline-item 背景） | `var(--panel)` | 同上，Inputs/Cards 规格 |
| `#1E1E1C` | `var(--ink)` | 正文墨 |
| `#6A6A64` | `var(--muted)` | 次要说明文字 |
| `#D8D8D2` | `var(--line)` | 对照 App.css 全文对 `#D8D8D2` 边框的既有 `var(--line)` 用法 |
| `#2C6E56` | `var(--accent)` | 墨绿签名 |
| `#d97706` / `.saving`/`.draft-warning`/`.has-break` 等 | `var(--eqb-color-warning)` | tokens.css 语义色（`--line`家族的别名只到 ink/muted/line/accent，语义色直接用 `--eqb-color-*`，与 App.css 同款写法一致） |
| `#059669` | `var(--eqb-color-success)` | 同上 |
| `#dc2626` | `var(--eqb-color-danger)` | 同上 |
| `rgba(217,119,6,0.08)`（`.is-group-missing` 底） | `color-mix(in srgb, var(--eqb-color-warning) 8%, transparent)` | tokens.css 的 `--eqb-color-warning-soft` 基色是 `#f59e0b` 不是 `#d97706`，直接换会偷换色相；`color-mix` 是本仓已用手法（`PaperSurface.css:188/197`），不算「自造 token」 |
| `rgba(217,119,6,0.16)`（`.draft-break-marker` 底） | `color-mix(in srgb, var(--eqb-color-warning) 16%, transparent)` | 同上 |

## 两处特批残留（plan 明确要求记录）

1. **`.draft-save-space-dialog` 弹窗阴影**：原 `rgba(0, 0, 0, 0.12)` 改为
   `rgba(30, 30, 28, 0.12)`（ink 系），保留 `0 8px 24px` 的 Floating 尺寸。
   注：此文件上一刀 `ui-token-sweep` 曾把这条阴影从超重的
   `0 18px 46px @0.22` 规整为 DESIGN.md 字面的 Floating
   `rgba(0,0,0,0.12)`；本刀按 owner 的新拍板把底色换成 ink 系三元组，
   两次改动不矛盾——都是「归入 Floating 档」，只是 owner 这次进一步要求
   连基色也 ink 化。
2. **`.draft-break-marker` 文字色**：原 `#92400e`（深琥珀，色板外）无对应
   深档 token（`tokens.css` 只有 `--eqb-color-warning` 一档 `#d97706`），
   按 plan 指示取 `var(--eqb-color-warning)`。视觉上比原深琥珀浅一档，
   对比度仍达标（琥珀底 16% 透明度 + 标准 warning 字色）。

## 额外一处偏离记录（disabled 文字色）

`.draft-export-menu-panel button:disabled` 原为 `#9A9A93`（DESIGN.md 的
Faint Ink，`占位/禁用/极次要标签` 合法场景）。`tokens.css` 目前没有对应
的 faint-ink CSS 变量（只到 `--eqb-color-text-muted`），且本刀不新造
token（红线）。鉴于本刀验收目标是「本文件 palette 硬编码为 0」且未把
这处列入两处特批清单，改用 `var(--muted)`（#6A6A64）。视觉上禁用文字
比原来稍深一档，非正文场景，可接受；如需要专门的 faint-ink token，需
另开一刀在 `tokens.css` 补一个变量（不在本刀改动范围）。

## D1 — A4 纸面阴影

`.draft-a4-sheet`：`box-shadow: none` → Resting 阴影
`box-shadow: 0 1px 2px rgba(30, 30, 28, 0.06)`（DESIGN §4）。`border: 0`
保留不动（阴影已足够交代边界，plan 未要求加边框）。

## D8 — 桌面渐变去除（与 D1 一并做）

`.draft-preview-desk` 的 `linear-gradient(#F6F6F4, #EDEDEA)` → 纯色
`var(--surface-strong)`（flat，DESIGN Flat-By-Default）。桌面在 shell
（现为 `var(--surface)`）内是一层嵌套次级面，用 EDEDEA 档合规；A4 纸面
自身的 Resting 阴影负责让纸从桌面上"浮"出来，不再需要渐变模拟深度。

**同步修改**：`scripts/verify-c8-draft-paper-render-model.mjs:213` 原本
逐字断言旧渐变字符串 `linear-gradient(180deg, #F6F6F4 0%, #EDEDEA
100%)`，属于「钉死颜色的 CI 断言」（DESIGN.md §2 已明确：改色是正当设计
决策，但必须同步更新这类断言，否则回归护栏误报）。已改为断言
`.draft-preview-desk { background: var(--surface-strong) }` 的语义等价
形式。

## D2 — 保存弹窗主按钮

复用 App.css 的全局 `.primary-button` 类（墨绿底 + 白字 + accent-glow
阴影，与登录页/「加入草稿卷」主按钮同一视觉家族），未新造等价样式。

- JSX：`<button type="submit" className="primary-button" ...>保存</button>`。
- CSS：`.draft-dialog-actions button` 通用幽灵样式选择器改为
  `.draft-dialog-actions button:not(.primary-button)`，避免类选择器
  specificity（`.draft-dialog-actions button` 是 class+tag 组合，原本
  会盖掉单独的 `.primary-button`）。「取消」按钮未加任何 class，继续走
  幽灵样式。

## D3 — 页基底

`.draft-workbench-shell` 的 `background: #EDEDEA` → `var(--surface)`
(#F6F6F4)，对齐 `App.css` 的 `.app-shell { background: var(--surface) }`。
`.draft-toolbar`（浮在 shell 上的卡片）改用 `var(--panel)`，对齐
`.topbar { background: var(--panel) }` 的既有参照写法——两者字面色值都
从 `#F6F6F4` 挪到语义更准确的位置，视觉上仍然是"页基底浅、卡片更浅（纯
白）"的层次。

## D4 — 全量 token 化

见上方 Token 映射表。整改后本文件 palette hex 硬编码数：**0**（白名单
豁免见下）。

**白名单（豁免的中性工具值，均为「强调色/深色背景上的白字」，与
`App.css` 的 `.primary-button { color: #ffffff }` 同一惯例，DESIGN.md
没有为这种「前景白字」定义专门 token）**：

- `.draft-version-toggle button.active { color: #ffffff }`（墨绿底白字）
- `.draft-export-menu-trigger { color: #ffffff }`（墨绿底白字）
- `.draft-undo-toast { color: #ffffff }`（近黑 ink 底白字）

## D5 — 导出菜单

原生 `<details>/<summary>` → 自定义浮层菜单：

- `.draft-export-menu`（`position: relative` 容器）包裹
  `.draft-export-menu-trigger`（按钮，`aria-haspopup`/`aria-expanded`）+
  条件渲染的 `.draft-export-menu-panel`（`role="menu"`，`position:
  absolute; right: 0; top: 100%`，右对齐锚定按钮右边缘，
  `max-width: calc(100vw - 32px)` 兜底防止极窄视口溢出）。
- Floating 阴影：`box-shadow: 0 8px 24px rgba(30, 30, 28, 0.12)`。
- Esc 关闭 + 点外关闭：`useEffect` 监听 `document` 的 `keydown`
  （`Escape`）与 `mousedown`（点击落在 `exportMenuRef` 容器外）。
- 菜单项点击后关闭菜单（新增行为，原生 `<details>` 不会自动关闭；这是
  浮层菜单的标准约定，不影响三个菜单项各自的业务逻辑——`exportPdf`/
  `browserPrint`/`openSpaceDialog` 调用与参数一字未改）。
- 三个菜单项的 `disabled` 判断条件保持原样。

## 真机 QA（本地 dev server，端口 8799/5199，qa-local 会话）

- 工作台整页：A4 纸面清晰浮出桌面（Resting 阴影可见），桌面/shell 层次
  由纯色区分，无渐变。
- 导出菜单展开：右对齐锚定在「导出」按钮下方，1483px 视口下完整落在
  视口内，无裁切；菜单为浮层卡片带阴影，非原生 `<details>` 三角展开。
- 保存到个人空间弹窗：「保存」墨绿实心白字（与登录页主按钮同色），
  「取消」保持幽灵灰边样式，两者权重区分明显。
- 与首页/顶栏对照：`.draft-toolbar` 白底细边与 `.topbar` 视觉家族一致；
  页面基底浅灰调与 `.app-shell` 一致。

## Verify

新增 `scripts/verify-draft-workbench-visual-unify.mjs`（已注册进
`scripts/verify-ci.mjs` + `scripts/README.md`）：

1. CSS 文件 palette hex 硬编码数 = 0（上方白名单三行，逐行核对确实是
   `#ffffff` 且未漂移）。
2. `.draft-a4-sheet` 有非 `none` 的 ink 系 `box-shadow`。
3. `.draft-workbench-shell` 背景走 `var(--surface)`。
4. TSX 不含 `<details`/`<summary` JSX 标签；导出菜单有
   `aria-expanded`、Escape 关闭、点外关闭、Floating 阴影、右对齐、
   viewport 宽度兜底。
5. 保存弹窗 submit 按钮带 `className="primary-button"`；幽灵按钮选择器
   显式排除 `.primary-button`。

`pnpm -C app run verify:all`：69 passed / 1 skipped（跳过项是既有的
`verify-i16a-teaching-dimension-search.mjs`，缺 off-repo fixture，与本刀
无关）/ 0 failed，含 app build/typecheck。
