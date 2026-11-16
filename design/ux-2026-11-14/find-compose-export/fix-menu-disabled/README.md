# 共用菜单：禁用项也能停焦点（Owner 2026-11-14 定的小事之一）

来由：`../fix-pdf-versions/README.md`「没验证的和风险 · 读屏」那条和末尾「Owner 2026-11-14 定的」——「改共用 `Menu`：禁用项也能停焦点，读屏用户方向键走得到置灰项、听得到原因；禁用项仍然不能选。这会影响所有菜单。」

## 改了什么

只改了两个文件，用到 Menu 的地方一处没动：

- `app/src/shared-ui/Menu.tsx`
  - ↑ ↓ Home End 在**全部项**之间走（以前只在可用项之间走），禁用项也会停。照 WAI-ARIA APG 菜单模式「禁用项可聚焦」的做法。
  - 新加首字母跳转（以前没有）：在菜单里按一个字，焦点跳到当前项之后、名字以这个字开头的下一项，到底绕回；字母不分大小写；找不到就不动。禁用项也算。空格不算（空格是选中）。
  - 打开时焦点仍落在第一个**可用**项。整个菜单都禁用时（空草稿卷的「导出」「PDF 版本」）落在第一项——以前这时焦点留在触发键上，方向键会去滚页面，滚动又把菜单关掉。
  - 禁用项仍是 `aria-disabled="true"`，没有加 `disabled` 属性（那个会让焦点到不了）。回车、空格、点击都不触发 `onSelect`，菜单不关（点击的拦法和以前一样，键盘按到按钮上也走同一个点击处理）。
  - 带小字（`description`）的项加了 `aria-labelledby`，只指名字那一段。以前按钮的名字取自全部文字，把小字也算进去了：读屏树里名字是「大字完整版 要有完整的两个听力题组」，描述又是「要有完整的两个听力题组」，原因会念两遍。现在名字是「大字完整版」，描述是原因。
  - 头注释改了两处（「跳过禁用项」那句、上一轮写的「禁用项照旧不进方向键」那句），按现在的行为写。
- `app/src/shared-ui/menu.css`：新加一条 `.eqb-menu-item[aria-disabled='true']:focus-visible`。焦点停在禁用项上时，焦点环和桌色底照现有 `:focus-visible` 全浓度画；字（以及跟着 currentColor 走的图标、勾）用 `--eqb-color-text-faint`，看起来仍然点不了。写了 Explicit-Cascade 注释：它覆盖整项 `opacity: 0.55`，因为整项变淡会把焦点环也变淡。带小字的禁用项原来的样子（名字 faint、小字 muted）不变。

没碰：shared-ui 下的其他文件、各页面里调用 Menu 的代码（DraftPaperWorkbench 等）、品牌、PaperSurface、打印、PDF 样式。

## 走查

脚本 `walk.mjs`（`WALK_MODE=before` / `after`），用 `scripts/component-inventory/rig.mjs` 起本地站（`INVENTORY_PORT_OFFSET=54`），1440×900，DPR 2，`reducedMotion: reduce`。记录在 `walk-before.json`、`walk-after.json`。

每个菜单的走法：焦点放在触发键上 → 回车打开 → 记焦点 → ↓ 走「项数 + 1」次 → Home → End → ↑ → 首字母跳转（CDP `Input.dispatchKeyEvent` 直接发一个 key 为这个汉字的按键）→ Home 后一路 ↓ 走到第一个禁用项 → 回车、空格（看菜单关没关、焦点在哪、有没有发非 GET 的 `/api/` 请求）→ 鼠标点禁用项 → Esc（看焦点是否回到触发键）→ 再开、Tab 关。每一步焦点项的 role / name / description / disabled / checked 用 CDP `Accessibility.getPartialAXTree` 量。

草稿卷放 2026 新课标Ⅰ卷阅读 A、C、D（测试库没有听力，也没有审过的答案），所以「PDF 版本」里大字完整版、纯答案版置灰。个人空间测试库里没有存过的 PDF，所以 `GET /api/my-space` 换成一条假数据，只走键盘、没点删除。

### PDF 版本（两个置灰项）按键顺序实测

项：大字完整版（禁）、大字无听力版（勾）、省纸版、纯答案版（禁）

| 按键 | 改之前焦点 | 改之后焦点（读屏树：name · description · disabled） |
| --- | --- | --- |
| 打开 | 大字无听力版 | 大字无听力版（checked=true） |
| ↓ | 省纸版 | 省纸版 |
| ↓ | 大字无听力版 | 纯答案版 · 选中的题组还没有审过的参考答案 · disabled |
| ↓ | 省纸版 | 大字完整版 · 要有完整的两个听力题组 · disabled |
| ↓ | 大字无听力版 | 大字无听力版 |
| ↓ | 省纸版 | 省纸版 |
| Home | 大字无听力版 | 大字完整版 · 要有完整的两个听力题组 · disabled |
| End | 省纸版 | 纯答案版 · 选中的题组还没有审过的参考答案 · disabled |
| ↑ | 大字无听力版 | 省纸版 |
| 首字「大」×2、「纯」、「省」 | 不动（没有首字母跳转） | 大字无听力版 → 大字完整版（disabled）→ 纯答案版（disabled）→ 省纸版 |

焦点在「大字完整版」上按回车、空格：菜单开着，焦点不动，版本键仍是「大字无听力版」，0 个改动请求。鼠标点：同样。Esc：菜单关，焦点回版本键。Tab：同样。

读屏树量到的焦点项（改之后）：`role=menuitemcheckbox`，`name=大字完整版`，`description=要有完整的两个听力题组`，`disabled=true`，`checked=false`。只做了上面那处 `aria-labelledby` 修正的中间那一轮里，name 还是「大字完整版 要有完整的两个听力题组」（小字被算进了名字），所以加了那处修正。

### 其他菜单

| 菜单 | 项（禁 = 禁用） | 改之前 | 改之后 |
| --- | --- | --- | --- |
| 草稿卷「导出」（有题组） | 下载 PDF、另存为 PDF…、保存 PDF 到个人空间，都可用 | ↓ 循环、Home、End、↑ 正常 | 一样；首字「保」跳到「保存 PDF 到个人空间」 |
| 题组「⋯」第一组 | 上移（禁）、下移、移除 | 打开落在下移；↓ 下移 ↔ 移除 | 打开仍落在下移；↓ 移除 → 上移（disabled）→ 下移；Home 到上移；回车、空格、点击上移：菜单不关，0 个改动请求 |
| 题组「⋯」最后一组 | 上移、下移（禁）、前置分页（勾选项）、移除 | 打开落在上移；↓ 跳过下移 | 打开落在上移；↓ 下移（disabled）→ 前置分页 → 移除 → 上移；在下移上回车、空格、点击：不关、不发请求 |
| 空草稿卷「导出」 | 三项全禁 | 打开后焦点留在触发键；方向键滚页面、菜单被滚动关掉（记录里两步「出错」就是这个） | 打开落在第一项「下载 PDF」（disabled）；↓ ↑ Home End 都在三项间走；回车、空格、点击不关、不发请求 |
| 空草稿卷「PDF 版本」 | 四项全禁，小字都是「草稿卷里还没有题组」 | 同上，焦点留在触发键 | 打开落在大字完整版；每项 name 是版本名，description 是「草稿卷里还没有题组」，disabled=true；勾在大字无听力版（checked=true） |
| 首页结果行「⋯」 | 相似篇章、详情（链接） | 正常 | 一样；首字「详」跳到详情 |
| 题组详情「更多操作」 | 编辑、删除 | 正常 | 一样；首字「删」跳到删除 |
| 个人空间行「⋯」（假数据） | 另存为…、删除文件 | 正常 | 一样；首字「删」跳到删除文件 |

没有禁用项的菜单，方向键、Home、End、Esc、Tab 的结果和改之前完全一样，只多了首字母跳转。所有菜单 Esc、Tab 后焦点都回到触发键。控制台只有两条 401，是登录前的请求，改之前也有。

### 截图（DPR 2，裁到触发键和菜单）

| 改之前 | 改之后 |
| --- | --- |
| `before-01-PDF版本-打开.png` | `after-01-PDF版本-打开.png`、`after-02-PDF版本-焦点在禁用项.png` |
| `before-02-导出-打开.png` | `after-03-导出-打开.png` |
| `before-03-题组⋯-第一组-打开.png` | `after-04-…-打开.png`、`after-05-题组⋯-第一组-焦点在禁用项.png` |
| `before-04-题组⋯-最后一组-打开.png` | `after-06-…-打开.png`、`after-07-题组⋯-最后一组-焦点在禁用项.png` |
| `before-05-空草稿-导出-打开.png`、`before-06-…-出错.png`（菜单已被滚动关掉） | `after-08-空草稿-导出-打开.png`、`after-09-…-焦点在禁用项.png` |
| `before-07-空草稿-PDF版本-打开.png`、`before-08-…-出错.png` | `after-10-空草稿-PDF版本-打开.png`、`after-11-…-焦点在禁用项.png` |
| `before-09-首页结果行⋯-打开.png` | `after-12-首页结果行⋯-打开.png` |
| `before-10-详情更多操作-打开.png` | `after-13-详情更多操作-打开.png` |
| `before-11-个人空间行⋯-打开.png` | `after-14-个人空间行⋯-打开.png` |

焦点在禁用项上的样子（`after-02`、`after-05`）：焦点环和桌色底与可用项一样，字是 faint 灰，图标也跟着变灰。

## 跑过的检查

- `cd app && npx tsc -b`：通过。
- `npx eslint src/shared-ui/Menu.tsx`：0 个问题（改之前也是 0），新增 0 个。CSS 没有 lint 配置。
- 上面的浏览器走查。

## 没验证的和风险

- **没用真读屏软件听过**（VoiceOver、NVDA、读屏手机都没有）。只量了 Chromium 的读屏树：disabled、name、description 都对。不同读屏念 `aria-disabled` 和 `aria-describedby` 的方式和顺序会不一样，有的设置下不念描述。
- 首字母跳转按的是名字的第一个字。菜单项全是中文，用中文输入法时按键先进输入法，发不出单个汉字的 keydown，所以对多数老师基本用不上；走查是用 CDP 直接发汉字按键模拟的。拼音首字母匹配要加拼音表，这次没做。拉丁字母开头的项（目前没有）可以直接用。
- 整个菜单都禁用时，焦点改为落在第一项（以前留在触发键）。这是行为变化，照 APG 做的，好处是读屏听得到每项为什么用不了，Esc、Tab 照常关。
- 鼠标悬停的滑动高亮（FluidHoverList）仍然不进禁用项，和以前一样。
- 窄屏（390 宽「⋯」面板里的 PDF 版本菜单）这次没走，键盘逻辑在同一个构件里，没有分支。
- 按要求没跑任何 `verify-*.mjs` / `smoke-*.mjs`。仓库里点菜单的脚本（`scripts/verify-a3-imposition.mjs`、`verify-draft-switch-mutations.mjs`、`scripts/component-inventory/decisions-*-shots.mjs`、`scripts/ux-walkthrough/find-compose-export.mjs`）用的是点击或按名字找项，没逐条核对有没有哪个依赖「↓ 跳过禁用项」或「带小字的项名字里含原因」。
