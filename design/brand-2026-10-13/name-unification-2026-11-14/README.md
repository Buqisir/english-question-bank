# 界面产品名换成「獭石」· 改前改后对照

状态：工作名和四条做法 Owner 已定（2026-11-14）；已在本地提交，没有推送。

- 日期：2026-11-14
- 依据：清点清单 `design/brand-2026-10-13/name-unification-2026-11-14.md` 的 U1、U3–U10，和 Owner 同意的四条做法：
  1. 顶栏和登录页品牌字只写「獭石」；
  2. 浏览器标签标题写「獭石 · 英语题库」；
  3. 商标确认前界面上不出现拉丁写法 Tashi，两个学生扫码页顶部链接的「EQBank」换成「獭石」；
  4. 域名 eqbank.cc 和 PDF 上的「EQBANK 教师解析」先不动。
- 拍照脚本：`node scripts/brand/name-unification-shots.mjs before|after`。用 `scripts/component-inventory/rig.mjs` 起临时数据库加 Vite 的本地网站（端口偏移 42），Chromium，1440×900 和 390×844 两种宽度，DPR 2，减弱动效。拍的是源码当时的样子，没有在截图前改 DOM。
- 扫码页的数据：脚本把仓库自带的校准课程导进这次临时的数据库，再走正常接口建学生、过两个词、生成固定生词组并公开分享（听生词页），用这个生词组建听写任务并分享（默写页）。只写临时数据库，不碰仓库里的数据库。

## 改了哪几处

只换文字，没有改任何样式（字号、字重、间距都没动）。

| 清单号 | 文件:行 | 改前 | 改后 |
|---|---|---|---|
| U1 | `app/index.html:8` | `<title>英语题库工作台</title>` | `<title>獭石 · 英语题库</title>` |
| U3 | `app/src/components/AppTopbar.tsx:128`（首页顶栏） | 英语题库工作台 | 獭石 |
| U4 | `app/src/components/AppTopbar.tsx:134`（子页顶栏） | 英语题库工作台 | 獭石 |
| U5 | `app/src/auth/LoginPage.tsx:73`（登录页左上角） | 英语题库工作台 | 獭石 |
| U7 | `app/src/App.tsx:1105`（主区域读屏名字） | `aria-label="英语题库工作台"` | `aria-label="獭石"` |
| U8 | `app/src/features/vocabulary-listen/VocabularyListenPage.tsx:333` | 链接文字「EQBank」，`aria-label="返回英语题库首页"` | 链接文字「獭石」，`aria-label="返回獭石首页"` |
| U9 | `app/src/features/vocabulary-dictation/VocabularyDictationPage.tsx:407` | 同 U8 | 同 U8 |

没改的清单项：U2（图标，不用改）、U6（登录页页脚 eqbank.cc，第 4 条）、U10（分享链接里的域名，第 4 条）、U11（「题库」作功能名）。

跟着查过、没有改的：

- `document.title`：`app/src` 里没有别处用代码设 `document.title`（`rg "document.title"` 只命中 `DraftPaperWorkbench.css:1104` 一句英文注释），所以只有 `index.html` 一处。
- 测试和脚本：在 `app/`、`server/`、`scripts/`、`tests/` 里搜「英语题库工作台」「EQBank」「返回英语题库首页」，没有任何断言或选择器依赖这几个字，所以没有跟着改的测试和脚本（0 处）。`scripts/` 里的「EQBank」都在 `scripts/vocabulary/*`、`scripts/build-paper-dictionary-audio.mjs`，是清单 I7、I9 的内部标识，没动。

## 对比图

`compare/` 下每张图左边是改前、右边是改后，共 12 张（数出来）。`before/`、`after/` 各 12 张原图（数出来），另各有一份 `shots.json`，记着每页的 `document.title`、品牌字原文、实算样式和框。

| 对比图 | 是什么 |
|---|---|
| `login-full-1440-compare.png`、`login-full-390-compare.png` | 登录页整页（没登录） |
| `login-brand-1440-compare.png`、`login-brand-390-compare.png` | 登录页左上角品牌字特写 |
| `home-topbar-1440-compare.png`、`home-topbar-390-compare.png` | 首页（找题台）顶栏 |
| `sub-topbar-1440-compare.png`、`sub-topbar-390-compare.png` | 子页顶栏，用整卷浏览页 `/?view=paper-browse&paperId=paper-2026-i`，品牌字后面接「· 整卷预览」 |
| `listen-top-1440-compare.png`、`listen-top-390-compare.png` | 学生扫码「扫码听音频」页顶部 |
| `dictation-top-1440-compare.png`、`dictation-top-390-compare.png` | 学生扫码「自动听写」页顶部 |

没有没拍到的图：改前改后两次都是拍了 12 张、没拍到 0 项、页面报错 0 条（脚本输出）。

`document.title`（脚本记录）：改前五个页面都是「英语题库工作台」；改后五个页面都是「獭石 · 英语题库」。两个扫码页也用同一个 `index.html`，所以标签标题一起变了。

## 量出来的变化（脚本记录，CSS 像素）

| 位置 | 实算字号/字重 | 改前宽 | 改后宽 | 两种宽度一样吗 |
|---|---|---|---|---|
| 首页顶栏品牌字 | 15px / 600 | 105 | 30 | 一样；左边起点不变（1440 在 x=332，390 在 x=64） |
| 登录页品牌字 | 15px / 600 | 105 | 30 | 一样；起点和高度（18）不变 |
| 子页顶栏品牌字 | 13px / 500 | 91 | 26 | 一样；整块「品牌字 · 页名」从 203 变成 138 |
| 扫码页顶部链接 | 16px / 750 | 59（高 20） | 31（高 22） | 一样；顶边从 y=18 变成 y=17 |

## 目测观察

- 顶栏（首页、子页）和登录页：换成两个字后只是品牌字变短，图形标志、品牌字的起点、右侧导航和头像的位置都没看出变化；390 宽子页顶栏里「返回找题 · 獭石 · 整卷预览」仍在一行，导航照旧折到下面两行（改前也是这样）。没有截断、没有重叠，没看到需要调样式的地方。
- 子页顶栏：品牌字变短后「· 整卷预览」跟着左移，品牌字和页名之间的距离不变（目测）。
- 扫码页：改前「EQBank」是拉丁字母，按 750 字重显示得很粗；改后「獭石」在这台机器上看起来接近常规字重，比原来淡（目测）。原因是这台机器没有 PingFang SC（`fc-list` 数出来 0 个），中文退到文泉驿正黑，它没有粗体。链接高度从 20 变成 22，顶边上移 1px，肉眼看不出。在装有 PingFang SC 的苹果设备上应该会显示成半粗体，要在 Mac 上再看一次。
- 和名字试穿时一样：15px 下「獭」能认，右半笔画偏密（目测，文泉驿正黑）。

## 检查结果

| 命令 | 结果 |
|---|---|
| `cd app && npx tsc -b --noEmit` | 退出码 0，没有输出 |
| `cd app && npx eslint` 改过的 5 个 `.tsx` | 退出码 1：6 个错误、3 个警告。逐条和 `HEAD` 版本比过（`git show HEAD:… \| npx eslint --stdin`），位置和规则完全一样，都是原来就有的（`App.tsx:266`；`VocabularyListenPage.tsx:89`、`:132`、`:163`；`VocabularyDictationPage.tsx:75`、`:103`、`:155`、`:173`、`:244`），这次改动没有新增。`AppTopbar.tsx`、`LoginPage.tsx` 没有问题。`index.html` 不在 eslint 范围里。 |
| `node --check scripts/brand/name-unification-shots.mjs` | 退出码 0 |
| `node scripts/component-inventory/static.mjs --check` | 退出码 0，「基线没有变多。」 |
| `git diff --check` | 退出码 0，没有输出 |

## 没做的和拿不准的

- 没做（按要求）：PaperSurface、打印、PDF、`server/exports/` 都没动；「EQBANK 教师解析」、eqbank.cc 没动；内部标识没动；BRAND.md、PRODUCT.md、DESIGN.md 和清点清单没动；没跑 `verify-*.mjs`、`smoke-*.mjs`；没提交。
- 扫码页加载时的过渡画面（`app/src/main.tsx` 里的 `PublicVocabularyBootShell`、`BootstrapError`）有一个读屏隐藏的「EQ」字块，像是图标，不是产品名，清单里也没列，没改。
- `import-ops/public/`（后台工作台）里有「英语题库」作标题和页头（`index.html:7`、`app.js:1025`、`source-intakes.js:350`、`owner-review.js:166`），不在清单的网站界面范围里，没改；要不要一起换名需要另定。
- `app/src/App.css:157` 注释里提到「英语题库工作台 · 卷名」，是历史说明，用户看不到，没改。
- 主区域读屏名字（U7）改成了「獭石」，和顶栏看到的一致；如果想让读屏多一点说明（比如「獭石 · 英语题库」），要另定。
- 扫码页链接的读屏文字改成「返回獭石首页」，链接目标还是 `/`（学生点开会到老师登录页），这次没动行为。
- 新脚本 `scripts/brand/name-unification-shots.mjs` 没跑 eslint（`app/` 的 eslint 配置管的是 `app/src`），只跑了 `node --check`。
- 这台机器的中文字体是文泉驿正黑，截图里的字形和字重和苹果设备上不同，扫码页那条观察要在 Mac 上补看。
