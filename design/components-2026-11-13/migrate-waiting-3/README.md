# 等待构件迁移 · 第三轮（2026-11-15，巳）

接第二轮（`../migrate-waiting-2/`）。做 Owner 2026-11-15「都听你的建议」定的三件事（DESIGN.md §5 Waiting 末条）。
没 commit、没 push；没跑 verify-* / smoke-*。`tsc -p tsconfig.app.json` 过，`pnpm build` 过，lint 65 错 / 12 警（和 HEAD 一样，第二轮记的也是 65 / 12）。

文件：`compare.png`（前后对照，元素截图拼的）、`diff.json`（前后实量数、登录键逐像素比较），共约 300KB。

## 1. Button 加一档胶囊大号 `size="pill"`，登录键换上

- **名字**：`size="pill"`（胶囊大号）。写在 `Button.tsx` 文件头和 `ButtonSize` 的注释里。
- **数值**（`button.css` `.eqb-button[data-size='pill']`）：

  | 项 | 原 `.login-submit` | 现在 | 来源 |
  |---|---|---|---|
  | 高 | 52 | 52 | 具名变量 `--eqb-button-pill-height`，注明出处 |
  | 圆角 | 999px | `--eqb-radius-pill` | token |
  | 字号 | 15 | 15 | 具名变量 `--eqb-button-pill-font-size`（字号阶梯没有 15） |
  | 字重 | 500 | 500 | 胶囊大号配填充时把 solid 的 600 改回 500（Explicit-Cascade 注释） |
  | 内衬 | 浏览器默认 1px 6px | 0 `--eqb-space-5` | 登录键在表单里撑满 400 宽，内衬不影响样子 |
  | 底 / 悬停底 | `--login-action` #29424D / `--login-action-hover` #3A5561 | `--eqb-color-action` / `-hover`（同值） | token，`tone="solid"` |
  | 字色 | #FFFFFF | `--eqb-color-paper`（同值） | token |
  | 影子 | `0 8px 24px rgb(27 43 51 / 0.18)` | 同 | 具名变量 `--eqb-button-pill-shadow`（只在配 solid / primary 时挂），四档高度里没有 |
  | 禁用 | 桌色底、次要灰字、去影子 | 同（Button 填充禁用样子 + 胶囊去影子一条） | 登录键现在不再用禁用，忙走 busy |
  | 焦点环、按下 0.97 | 2px 石板墨、offset 2 | 同（Button 本来就是） | |

  三个没有 token 的数记进了 `docs/design-gaps.md`。
- **登录键**（`auth/LoginPage.tsx`）：`<Button className="login-submit" type="submit" tone="solid" size="pill" busy={submitting}>登录</Button>`。
  类名 `login-submit` 留着，只给脚本认（`scenarios.mjs`、`smoke-golden-path.mjs`、`scripts/brand/*` 共 12 处用它点登录）。
- **换前换后实量**（`diff.json`，1440 宽，元素截图 2 倍）：

  | | 换前 | 换后 |
  |---|---|---|
  | 静止：宽 × 高 | 400 × 52 | 400 × 52 |
  | 静止：圆角 / 字号 / 字重 | 999px / 15 / 500 | 999px / 15 / 500 |
  | 静止：字墨位置（相对键左上） | x 185、y 16、30 × 19 | x 185、y 16、30 × 19 |
  | 静止、悬停两张图逐像素 | — | **0 个像素不同**（通道差最大 0） |
  | 忙：字 | 「登录中…」，字变宽到 58.7 | 「登录」不换（隐去），所以点 16px 在正中 |
  | 忙：底 / 影子 | 桌色底、次要灰字、无影子、`disabled` | 石板墨底、白点、影子照旧；`aria-busy` + `aria-disabled`，不是原生 disabled |
  | 忙：再点 | 原生禁用 | Button 拦掉（`preventDefault`），表单不再提交；两个输入框照旧禁用 |

- **删了的旧样式**（`auth/LoginPage.css`，换掉的五条，原位置留了一句注释）：`.login-submit`、`:hover`、`:active`、`:focus-visible`、`:disabled`；`.login-field input:disabled, .login-submit:disabled` 里去掉 `.login-submit`；减少动态效果里 `.login-submit { transition: none }` 去掉（现在走 Button 的：减少动态效果时只留颜色过渡、不缩）。
  `--login-action-hover` 现在没人用了，不是我建的，没删。

## 2. 「加入生词本」文字链：忙时字不换，字后跟小号所以点

`features/vocabulary-notebook/NotebookAddButton.tsx`，样子仍是 12px 淡墨文字链，不改成按键。

- 在等的两段（检查、加入）：字固定成静止时那句——检查出「词已在、语境没有」时是「＋ 加入此语境」，其余是「＋ 加入生词本」；
  **检查时还不知道是哪一种，按最常见的「＋ 加入生词本」写**；加入失败后点「加入失败，重试」，重试时字回到「＋ 加入生词本 / 此语境」再跟点。
  字后面 `InlineWaitDots size="sm"`（14px，自带 300ms 门槛）。字和点包在一个 span 里，键原有的 flex gap 3px 不落在它们之间（字和点之间不另加间距）。
- 点了不再触发、读屏念忙：照 `shared-ui/Button` 的 busy，挂 `aria-busy` + `aria-disabled`，onClick 里拦；不用原生 disabled（焦点不掉）。已加入以后仍是原生 disabled（没事可做了）。
- `selectionOverlay.css` 新加一条：在等时指针 `progress`、悬停不把字提到墨色（Explicit-Cascade 注释）。
- 实量（`diff.json`）：

  | | 换前 | 换后 |
  |---|---|---|
  | 静止 | 「＋ 加入生词本」75.4 × 17 | 同 |
  | 正在检查（1200ms） | 「正在检查…」58.4 × 17，原生禁用 | 「＋ 加入生词本」+ 14px 点，89.4 × 17；字墨宽 75.4 不变；`aria-busy` |
  | 正在加入（1200ms） | 「正在加入…」58.4 × 17 | 同上；字和点墨迹间距 2.8px |
  | 忙时再点一下，加入请求次数 | 1 → 1 | 1 → 1 |

## 3. 首页连库时的灰块（dataConnecting）：**没删，走得到**

第二轮说 `dataConnecting` 永远不为真，这轮删前核了一遍，**不成立**：

- `App.tsx:200` `dataStatus` 初值就是 `'loading'`，`fetchQuestionGroups()` 回来前一直是；「题库没连上」点「重试」（`retryQuestionGroups`）也会回到 `'loading'`。所以首页每次打开都有一段 `dataConnecting === true`。
- 那块灰块（`ConciergeDesk.tsx:796–809`）画在 `.concierge-list-surface` 里，列表面的条件是 `showListSurface || showFeed`。连库时 `showFeed` 为假，但 `showListSurface = browseActive || hasActiveFilters || state.kind !== 'empty'`：
  **浏览态（`/?view=browse`）或带 `f.*` 筛选的深链**，一打开 `showListSurface` 就是真的，灰块就出来。第一轮只看了纯首页（列表面不出），所以以为走不到。
- 实拍（`compare.png` 最后一格，换前换后都拍到）：`/?view=browse` 拦住 `/api/question-groups`，1200ms 时 `.concierge-skeleton-chip-row` 1 个、`.concierge-list-surface > .concierge-skeleton-feed` 1 个，六个胶囊灰块 + 三组灰行都在。

所以这轮**没删**任何代码，只列出引用，等 Owner 重新定。删前 grep 到的引用：

| 位置 | 是什么 |
|---|---|
| `app/src/concierge/ConciergeDesk.tsx:247` | `const dataConnecting = dataStatus === 'loading'` |
| `ConciergeDesk.tsx:639` | 搜索框提交键 `submitBusy={… \|\| dataConnecting}`（不是灰块，删灰块也要留） |
| `ConciergeDesk.tsx:722`、`:734` | 命令行下的提示行「正在连接本地题库，连上就能搜」（不是灰块，要留） |
| `ConciergeDesk.tsx:796–809` | 灰块本体：`.concierge-skeleton-chip-row` 六个胶囊 + `<SkeletonFeed />` |
| `ConciergeDesk.tsx:157` `SKELETON_CHIP_WIDTHS` | 只给上面那排胶囊用 |
| `ConciergeDesk.tsx:159` `SkeletonFeed` | 两处用：上面这块，和 `:938` 找题结果区的灰块（要留） |
| `App.css:4174` `.concierge-skeleton-chip-row` | 只给上面那排胶囊用 |
| `App.css:4186–4203` `.concierge-skeleton-feed`、`-group` | `SkeletonFeed` 的板，两处共用（要留） |
| `ConciergeDesk.css:15` | 注释里提到 `.concierge-skeleton-feed` |
| `scripts/component-inventory/waiting-shots.mjs:180–191`、`waiting2-shots.mjs:225,231` | 截图脚本数灰块个数 |
| `scripts/verify-concierge-desk.mjs:841–846`、`verify-home-default-feed.mjs:543` | 断言提示行 / 占位字（不碰灰块本体） |
| `scripts/smoke-concierge-stream.mjs:86`、`smoke-paper-draft-ui.mjs:223` | 认 `.concierge-data-loading` 提示行 |
| `design/components-2026-11-13/migrate-waiting*/README.md`、`migrate-chip-r2/README.md`、`data/*.json` | 记录 |

如果 Owner 仍要删：只删 `:796–809` 那块、`SKELETON_CHIP_WIDTHS`、`App.css` 的 `.concierge-skeleton-chip-row`；`SkeletonFeed`、`.concierge-skeleton-feed*`、提示行和 `submitBusy` 留着。删了以后浏览态冷启动时列表面是空白，只剩一行「正在连接本地题库」。没有 verify 断言直接认这块，不用改。

## verify 脚本（改了，没运行）

- `scripts/verify-icon-motion.mjs:285–289`：原来点之前等「加入生词本」、点之后等「正在加入」。现在检查时字也是「加入生词本」，点之前改等 `button:not([aria-busy])`（检查完了），点之后改等 `button[aria-busy="true"]`。
- 别的脚本都只用 `.login-submit` 点登录，类名留着，不用改；没有脚本认「登录中…」「正在检查…」。

## 截图怎么拍的

- 脚本：`scripts/component-inventory/waiting3-shots.mjs`（拍）、`waiting3-compare.mjs`（拼对照、出 diff.json、登录键逐像素比）。`INVENTORY_PORT_OFFSET=78`。
- 换前：没改代码时跑一次。**词典卡两步第一次没拍到**（脚本没抄卷面数据的两处补丁，卷面出不来，是脚本的错不是状态拍不到）；补上以后只重跑这两步一次（仍是换前代码）。这超了「换前一次」，如实写。换后跑一次，全拍到。
- 只拍元素；所以点停在第 1400ms、灰块呼吸停在半周期。登录请求、加入生词本请求拦下后最后 abort；查词典、检查生词本是假回包或拦下后 abort；题库列表拦下后放行（只读）。
- 没拍到：无。

## 看到的问题

1. **第 3 条的前提不成立**（见上）：浏览态和 `f.*` 深链冷启动时灰块是看得见的。
2. 登录键忙时所以点 16px，放在 400 × 52 的大键正中，偏小（目测）；Button 没给胶囊大号配大一档的点。
3. 「加入生词本」正在检查时字是满色的「＋ 加入生词本」，看着像能点（目测），只有指针变 `progress`。原来「正在检查…」是禁用的淡色。
4. 检查完如果是「已加入生词本」，字会从「＋ 加入生词本」跳成「已加入生词本」（原来从「正在检查…」跳，一样是跳）。
5. 登录键忙时 `aria-disabled` 而不是原生 disabled，键仍能拿焦点；两个输入框还是原生禁用（没动）。
6. tokens.css 圆角注释写「pill 只给标签类，有字的按钮不用」，和这档冲突；没改 tokens.css。

## 建议协调人改 DESIGN.md

- §5 Buttons 加一条「胶囊大号 `size="pill"`」：高 52、胶囊圆角、字 15 / 500、配填充带影子，只给登录键；写明是「胶囊只给标签类」的例外。
- §5 Waiting「还没做」去掉登录键、「加入生词本」两项，挪进「第三轮已做」。
- §5 Waiting「Owner 2026-11-15 定（都听你的建议）」那条里「首页连库那块走不到的灰块代码删掉」：改成「核了走得到（浏览态 / 筛选深链），没删，待 Owner 重定」。
- §2 / tokens 圆角那段（不在本轮可改范围）：pill 例外加一句。

## 请 Owner 定

1. **首页连库灰块删不删**：它在浏览态和筛选深链冷启动时会出。建议**不删**，改成走 `useDelayedBusy` 门槛（300ms 内连上就不闪），和找题结果区的灰块一致。
2. 登录键忙时所以点要不要大一档：建议先不加，看实景；如果嫌小，给 `pill` 配 20px 的点。
3. 「加入生词本」检查时要不要淡一点（照原来 0.55）：建议不淡，检查一般很快、300ms 内连点都不出；淡了反而一闪。
4. 胶囊大号的 15px 字和影子要不要收编成 token：建议先留具名变量，等第二处用到再收。

## 协调人复核



2026-11-15，看过对照图和改动：

- **登录键.** 静止、悬停逐像素一致，好。忙时原来变成桌色底「登录中…」，像坏了；现在深底、影子都在，正中三颗点，更稳。但 16px 的点放在 400 × 52 的键里偏小（目测同意巳的看法），交 Owner 看实景定要不要给胶囊大号配大一档的点。
- **加入生词本.** 字不换、点跟在后面，和「正在翻译」同一个样子，好。检查时字是满色，不变淡：检查多半 300ms 内就完，点都不出，变淡反而会闪，同意不淡。
- **首页连库灰块.** 卯说走不到，巳实拍证明走得到，没删是对的。我之前照卯的说法转告 Owner 是「死代码」，要更正。
- **DESIGN.md 已补:** §5 Buttons 胶囊大号、Single-Radius-Family 里登录键的例外、Waiting 第三轮已做、Owner 那条的「没删」。tokens.css 圆角注释和 `--login-action-hover` 留着，不是这轮建的。
- **Owner 重定后（协调人自己改）:** 首页连库灰块留着，改走 `useDelayedBusy` 门槛，连上就收；登录键里的所以点改 20px（`size="lg"`），换后实拍 `login-busy-lg.png`（只拍这一格，一次）。
