# 当前题、卷面焦点框、打印强调字改墨（2026-11-16）

Owner 2026-11-16：「行，三处都照你的建议改吧」（BRAND.md 第 123 条）。

| 地方 | 改前 | 改后 |
|---|---|---|
| 浏览页当前题，上下角标 | 深薄荷 `#2C6E56` | 墨 `--eqb-color-text`（rgb 27, 43, 51） |
| 浏览页当前题，题号 | 色板外深绿 `#1E4A3A` | 不另外着色，跟卷面正文同墨（rgb 17, 17, 17） |
| 卷面题干键的键盘焦点框（`--ps-active-rail`） | `#2C6E56` | 卷面墨 `--ps-ink`（rgb 17, 17, 17） |
| 打印 6 处强调字 | `#1E4A3A` | 打印正文墨 `#1E1E1C` |

数值是页面上实算出来的，在 `before.json` 和 `after.json`。

## 图

- `compare.png`：浏览页当前题（1440 和 390）、键盘焦点框（1440）改前改后并排。
- `before-active*.png` / `after-active*.png`：深链选中阅读 A 第 21 题、讲评打开时的当前题。
- `before-focus*.png` / `after-focus*.png`：用 Tab 走到当前题题干键时的焦点框。截图只截了焦点框左段，右边被截断，是截图范围的问题，不是页面。
- `before-print-sample.*` / `after-print-sample.*`：打印样张。

## 说明

- 卷面的当前题竖条在浏览页被角标盖住（浏览页自己的样式把竖条换成了角标），线上没有别的页面会选中当前题，所以 `--ps-active-rail` 改了以后，屏幕上实际变的只有焦点框。
- 打印样张不是真页面打印：本地网站没有生词数据，样张是把真的三份样式文件（tokens、过生词、手写）放进一个按组件结构写的最小页面，用打印媒体出的 PDF。图框底色在样张里没显示出来，和这次改的颜色无关。
- 截图用构件清点的本地网站（`scripts/component-inventory/rig.mjs`）。
- 改后 `verify-paper-browse` 247 项全过。

## 补：两张音频审听页（同日）

Owner：「审听页那两处也一起换成墨吧」。

- `scripts/vocabulary/audio-owner-qa/styles.css`：「通过」标记的字、「通过」键的字和边。
- `scripts/vocabulary/audio-repair-qa/styles.css`：「已选」标记的字、「选这一版」键的字和边、版本名后面「· 已选」的字。
- 深绿 `#1E4A3A` 和键上的深薄荷边都改成墨 `--eqb-color-text`（rgb 27, 43, 51）；淡绿底是成功色，没动。进度条、焦点框、正在听的那一版的边还是深薄荷，这次没动。
- 改完 `--eqb-color-primary-text` / `--eqb-color-primary-deep` 没人用了，从 `app/src/shared-ui/tokens.css` 删掉。
- 图在 `audio-qa/`：`compare.png` 左边改前、右边改后。也是样张，真样式文件加上按页面结构写的几个元素，不是真页面（审听页要本机的音频数据库才开得起来）。

## 补二：审听页剩下的深薄荷（同日）

Owner：「那几处深薄荷也一起改成墨吧」。

- 两张审听页的进度条、键盘焦点框：深薄荷 `#2C6E56` → 石板墨 `--eqb-color-action`（rgb 41, 66, 77），和网站里的进度条、焦点框同一个色。焦点框粗细 3px 没动。
- 修音页正在听的那一版（`.audio-choice[data-active="true"]`）的边：深薄荷 → 墨 `--eqb-color-text`，和「选这一版」键的边一致。淡绿底没动。
- 图在 `audio-qa-2/`：`compare.png` 左改前、右改后，上面是审听页，下面是修音页。焦点框是用 Tab 走到「下一条」键拍的。也是样张，不是真页面。
