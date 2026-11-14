# F 腮帮 × 三档眼睛 · 放进真实页面试穿（2026-11-14）

状态：对比稿 · 提案 · 单一来源。

Owner：「取 F，放进真实页面看看，那眼睛呢？眼睛的大小咋样？」这里把 F 的三档眼睛（1.00、1.10、1.20）和改之前的母版放进本地跑起来的真实页面，截图对比。

## 怎么换的

- 脚本：`scripts/brand/smile-tryon.mjs`。照 `scripts/component-inventory/rig.mjs` 起本地网站（临时数据库、测试数据、owner 账号，端口偏移 45），用无头浏览器打开真实页面，截图前用脚本把 `<img>` 的地址换成对比稿（data URL）。
- 源码、母版、`app/public/brand/` 都没改。换图只发生在无头浏览器里。
- 四列：
  - 「改之前的母版」：从提交 `9a4766de9` 读 `mascot/otter-head.svg` 和 `logo/mint/mark.svg`（Owner 已批准把母版改成 F，工作区的母版会变，所以不从工作区读）。这一列也走换图，不用网站正在发的文件，四列走同一条路。
  - 「F · 眼睛 1.00 / 1.10 / 1.20」：`../smile-F-with-eyes/svg/` 里的 `mark-F-eyes*.svg`、`head-F-eyes*.svg`。
- 已核对：基准列截图里是旧的脸斑（下沿平、两瓣圆），F 列是新的（两瓣往上收、中间缺口更深）；160px 截图逐像素比，基准和 F 1.00 有约一千个像素不同。
- 结束后只删了自己的临时数据 `.scratch/component-inventory/rigdata-45`。

## 图在哪

| 文件 | 内容 |
| --- | --- |
| `compare-in-pages.png` | **总图，手机上看这张**。每版一块：顶栏左段（放大 2 倍）、登录页左上角（放大 3 倍）、个人空间标题旁 160px 头像（原尺寸）。都是 2x 屏截图。 |
| `topbar-compare.png` | 顶栏 2x 屏：四版各一条整条顶栏（原尺寸）加标志 4 倍逐像素放大；最下面是 1x 屏现状一次。 |
| `topbar-strip-<版>-2x.png`、`topbar-mark-<版>-2x.png` | 上图的单张。 |
| `topbar-1x-current-strip.png`、`topbar-1x-current-mark.png` | 1x 屏现状：顶栏用的是逐格画的 `/brand/mark-32.png`。 |
| `login-compare.png` | 登录页左上角标志加字，四版，原尺寸和 4 倍放大。 |
| `login-page-<版>-2x.png` | 登录页整页（1440×900 视口，2x 屏）。 |
| `login-crop-<版>-2x.png` | 登录页左上角单张。 |
| `empty-large-compare.png` | 个人空间：空态里 88px 头像，加标题旁 160px 头像，四版。 |
| `empty-88-<版>-2x.png`、`large-160-<版>-2x.png` | 上图的单张。 |
| `shots.json` | 每张截图的位置（CSS 像素）、img 实际地址、页面底色。 |

`<版>` = `before`（改之前的母版）、`F-eyes1.00`、`F-eyes1.10`、`F-eyes1.20`。

### 个人空间这两处是临时试穿

- 现网个人空间空态没有獭獭，是 88px 的平涂图标插图（EmptyIllustration）。这里临时把它换成 88px 头像，只为看大小合不合适。
- 160px 头像是临时插在页面标题「个人空间 / 已保存的 PDF」左边的，底色就是页面本来的底色（`.my-space-page`，rgb(241, 245, 247)），旁边的字是页面上真实的标题。这不是改版方案，只是找一个能看清表情的尺寸：腮帮的差别在大约 96px 以下几乎看不出。

## 看到的（目测）

- 160px：F 比改之前的母版开心一些，像在微笑，嘴角那块往上收。三档眼睛里，1.00 和 1.10 几乎分不出；1.20 眼睛明显更「在」，表情更醒，还没到显得眼睛太大、显小孩气的地步。（目测）
- 88px 空态：F 的腮帮还看得出来，眼睛三档差别很小，1.20 稍微醒一点。（目测）
- 顶栏 2x（标志 32×20 的框，实际约 31×20）：原尺寸下四版几乎一样；4 倍放大才看得出 F 下沿往上收、1.20 眼睛多一两个像素。（目测）
- 登录页左上角（24×24 框里，约 24×15）：比顶栏还小，原尺寸下四版分不出；3、4 倍放大才看得出。（目测）
- 结论（目测）：小尺寸不影响选择，眼睛大小要看 160px 那张来定；从这几张看 1.20 比 1.00、1.10 更有精神。

## 没能展示的

- 1x 屏顶栏用的是逐格画的 `mark-32.png`；浏览器标签页图标 `favicon-16.png`、`favicon-32.png`、`favicon.ico` 也是逐格画的。这些是另画的像素版，F 还没覆盖，这次截图里 1x 顶栏只放了现状一次。
- 浏览器标签栏无头浏览器拍不到，没做示意。
- 全身形象、状态插图、登录页雾海里的海獭（`app/src/auth/login-otter.svg`）、直立、道具、日历、海藻等，各有自己的脸斑形状，这次没改也没试穿。
- App 图标 `mascot/app-icon.svg` 用的是和头像同一条脸斑路径，但这次没截（现网也没地方用它，桌面图标示意见以前的 eye-study）。

## 如果 F 定为母版，要改的文件（只列，没改）

在提交 `9a4766de9` 里搜头像脸斑那条路径（`m512 407.5c115 0 210.5 4 273.5 43…`）和雾白 `#F2FAF6`，再搜网站和手册里的引用。

**和头像同一条脸斑路径（可以直接换路径）**

- `design/brand-2026-10-13/mascot/otter-head.svg`
- `design/brand-2026-10-13/mascot/app-icon.svg`
- `design/brand-2026-10-13/logo/mint/mark.svg`
- `design/brand-2026-10-13/logo/mark.svg`
- `design/brand-2026-10-13/logo/mark-mono.svg`
- `app/public/brand/mark.svg`（顶栏 2x、登录页左上角；网站在用）
- `design/brand-2026-10-13/wordmark-2026-11-14/svg/lockup-*.svg`（24 张，标志加字的组合草图）

**逐格画的像素版（要重新一格一格画）**

- `design/brand-2026-10-13/logo/mint/mark-16.svg/.png`、`mark-32.svg/.png`
- `design/brand-2026-10-13/logo/mark-16.svg/.png`、`mark-32.svg/.png`、`mark-16-mono.svg/.png`、`mark-32-mono.svg/.png`
- `design/brand-2026-10-13/mascot/small/app-icon-16`、`app-icon-32`、`otter-head-16`、`otter-head-32`（各 .svg/.png）
- `app/public/brand/mark-32.png`（顶栏 1x；网站在用）
- `app/public/favicon-16.png`、`favicon-32.png`、`favicon.ico`（`app/index.html` 引用）

**有自己脸斑形状的（要不要跟着改，另定）**

- `design/brand-2026-10-13/mascot/variants/otter-head-line.svg`、`otter-head-mono.svg`
- `design/brand-2026-10-13/mascot/otter-front.svg`
- `design/brand-2026-10-13/mascot/states/`（peek-login、state-01～05）
- `design/brand-2026-10-13/mascot/upright/`（8 张）、`props/`（10 张）、`calendar/`（3 张）、`kelp/`（2 张）
- `design/brand-2026-10-13/mascot/motion/otter-motion.html`、`thinking-dive.html`
- `app/src/auth/login-otter.svg`（登录页雾海里的海獭；网站在用）

**引用这些文件、母版改了要重出的**

- `app/src/components/AppTopbar.tsx`、`app/src/auth/LoginPage.tsx`：只引用 `/brand/mark-32.png`、`/brand/mark.svg`，文件名不变就不用改代码。
- 视觉规范手册 `design/brand-2026-10-13/manual/src/*.jsx`：几乎每页都用 `../../logo/mint/mark.svg`（36 处），另有 `otter-head.svg`（6 处）、`app-icon.svg`、`small/*`、`logo/mark-mono.svg`、`mark-16/32*.png`、states、upright、props 等；按路径引用，改母版后要用 `scripts/brand/build-manual.mjs` 重出 PDF 和 `manual/build/png/`。
- `design/brand-2026-10-13/manual/src/assets/37FGTHMTRGF771ZN2D6AHJHCA6.svg`（和 `source-0.5/assets/` 同名一张）：「02 找题中」状态插图的副本。
- `app/dist/brand/mark.svg`：构建产物，重新构建就会跟上。
