# 产品名统一清点（工作名「獭石」）

提案 · 单一来源。只清点，没有改任何源码。

- 日期：2026-11-14
- 背景：Owner 今天定工作名「獭石」（tǎshí），拉丁写法 Tashi 仍是提案；商标未确认，只是工作名。吉祥物仍叫「獭獭」。
- 范围：找出仓库里「对外显示产品名字或代替名字的文字」的地方。本文只记录，没有改 `app/`、`server/`、`scripts/` 下任何文件，也没有动 PaperSurface、打印和 PDF 样式。
- 方法：在 `app/index.html`、`app/public/`、`app/src`、`server`、`shared`、`scripts`、`data` 和文档里用 `rg` 搜「题库」「英语题库」「EQBANK / EQBank / eqbank」「备考助手」「English Question Bank / question bank」「他石」「青玉案」「Touchstone」「Tashi」「獭石」等，再逐条看上下文判断用户看不看得到。下文数字都是 `rg` / `grep` 数出来的，除非标「目测」。

## 一句话结论

界面上现在实际显示的产品名是 **「英语题库工作台」**：浏览器标签（`app/index.html:8`）、首页和子页顶栏（`AppTopbar.tsx:128`、`:134`）、登录页左上角（`LoginPage.tsx:73`）都是这七个字。另外两个生词扫码页的顶部链接显示 **「EQBank」**，配套解析 PDF 的页眉和封面印 **「EQBANK 教师解析」**，登录页页脚和分享链接里有域名 **eqbank.cc**。「全科题库」「备考助手」「English Question Bank」「他石」「青玉案」在 `app/src` 和 `server` 的用户可见文字里一处都没有（数出来是 0）。

## 总表

「能不能现在改」三档：能 / 要等 Owner 定 / 属于打印和 PDF 不许动。「建议改成」只是建议。

### 1. 网站界面（12 行）

| # | 位置（文件:行号） | 现在显示的文字 | 用户在哪里看到 | 建议改成 | 能不能现在改 |
|---|---|---|---|---|---|
| U1 | `app/index.html:8` | `<title>英语题库工作台</title>` | 浏览器标签、书签、历史记录 | 獭石 或 獭石题库（见问题 Q1、Q4） | 要等 Owner 定 |
| U2 | `app/index.html:5-6`；`app/public/favicon-16.png`、`favicon-32.png`、`favicon.ico` | 只有图像，没有文字；没有 meta description、没有 manifest、没有 apple-touch-icon（数出来 0 处） | 浏览器标签小图标 | 不动（图标已是獭獭头，和名字无关） | 能（不用改） |
| U3 | `app/src/components/AppTopbar.tsx:128` | 英语题库工作台（`header.topbar .topbar-brand-title`，首页） | 首页顶栏左侧，图形标志右边 | 獭石 | 要等 Owner 定 |
| U4 | `app/src/components/AppTopbar.tsx:134` | 英语题库工作台（子页，后面接「· 卷名」） | 子页顶栏 | 獭石 | 要等 Owner 定 |
| U5 | `app/src/auth/LoginPage.tsx:73`（`:72` 标志图 `alt=""`） | 英语题库工作台（`.login-brand > span`） | 登录页左上角 | 獭石 | 要等 Owner 定 |
| U6 | `app/src/auth/LoginPage.tsx:111` | 账号需邀请开通 · eqbank.cc | 登录页页脚 | 不动（域名，见 Q3） | 要等 Owner 定 |
| U7 | `app/src/App.tsx:1105` | `aria-label="英语题库工作台"` | 读屏软件朗读主区域时 | 獭石 | 要等 Owner 定（和 U3 一起改） |
| U8 | `app/src/features/vocabulary-listen/VocabularyListenPage.tsx:333` | 链接文字「EQBank」，`aria-label="返回英语题库首页"` | 学生扫码打开的「扫码听音频」页顶部 | 文字：獭石；读屏：返回獭石首页 | 要等 Owner 定 |
| U9 | `app/src/features/vocabulary-dictation/VocabularyDictationPage.tsx:407` | 同 U8：「EQBank」/「返回英语题库首页」 | 学生扫码打开的听写页顶部 | 同 U8 | 要等 Owner 定 |
| U10 | `app/src/features/vocabulary-review/VocabularyReviewPage.tsx:91`、`:1143` | 复制到剪贴板的分享链接 `https://eqbank.cc/vocabulary/listen/…` | 老师粘贴到微信等处的链接 | 不动（域名，见 Q3） | 要等 Owner 定 |
| U11 | 「题库」作功能名（共 19 处，见下方明细） | 例：「题库还没有题目。先导入一套卷…」「正在连接本地题库…」「题组已从题库中移除」「给题库打主题标签」 | 空状态、加载提示、提示条、确认框、管理页按钮、读屏标签 | 不动：这里「题库」指题目仓库这个功能，不是产品名 | 能（建议不改） |
| U12 | 分享卡、Open Graph、邮件 | 没找到（`og:`、`navigator.share`、`sendMail`/`nodemailer`/`smtp` 都是 0 处） | — | — | — |

U11 明细（`app/src` 里「题库」出现在用户可见字符串中的位置，共 19 处）：

- `concierge/conciergeSearch.ts:1152`、`:1168`、`:1186`、`:1230`（找题助手提示「本地题库」，4 处）
- `concierge/ConciergeDesk.tsx:548`、`:559`、`:744`、`:964`、`:968`、`:972`（加载提示、读屏标签、空状态，6 处）
- `services/questionGroups.ts:471`、`:511`、`:525`（「题库 API 服务无法连接」等报错，3 处；可另议改成「后端服务」，与改名无关）
- `App.tsx:450`（删除确认框）、`App.tsx:1106`（读屏标签「题库」）
- `features/draft-paper/DraftPaperRail.tsx:270`（提示条）
- `features/question-detail/QuestionGroupDetailView.tsx:327`（报错）
- `features/admin/AdminWorkbench.tsx:28`、`:37`（管理页按钮和读屏标签）

`app/src` 另有 5 处「题库」/「英语题库工作台」只在代码注释里（`App.css:157`、`App.css:3795`、`concierge/clarificationCopy.ts:42-43`、`draft-paper/DraftPaperWorkbench.tsx:1793`），用户看不到，不计入。`shared-ui/tokens.css:19`、`:21` 的「獭獭」是吉祥物名，不动。

### 2. PDF 和打印（6 行，只记录，不许动）

| # | 位置（文件:行号） | 现在显示的文字 | 用户在哪里看到 | 建议改成 | 能不能现在改 |
|---|---|---|---|---|---|
| P1 | `server/exports/companionAnalysisRenderer.mjs:18`（定义 `HOUSE_MARK`） | EQBANK 教师解析 | 配套解析 PDF / HTML | 待定（见 Q3） | 属于打印和 PDF 不许动 |
| P2 | `server/exports/companionAnalysisRenderer.mjs:707` | `@page @top-left` 页眉「EQBANK 教师解析」 | 配套解析 PDF 每页左上角 | 待定（见 Q3） | 属于打印和 PDF 不许动 |
| P3 | `server/exports/companionAnalysisRenderer.mjs:1324` | 封面 `.house-mark`「EQBANK 教师解析」 | 配套解析第一页标题上方 | 待定（见 Q3） | 属于打印和 PDF 不许动 |
| P4 | 导出文件名：`server/exports/exportImplementation.mjs:196`、`:223`；`companionAnalysisRenderer.mjs:674`；`exportRoutes.mjs:34-35`、`:60-65`；前端兜底名 `services/questionGroups.ts:478`、`:493`、`:533`，`services/draftPapers.ts:248`，`draft-paper/DraftPaperWorkbench.tsx:1277`、`:1307`，`paper-browse/PaperBrowsePage.tsx:4113`，`services/vocabulary.ts:689-856`，`vocabulary-review/VocabularyReviewPage.tsx:1176-1177`，`vocabulary-dictation-workbench/VocabularyDictationWorkbench.tsx:752`、`:806`、`:881` | 「卷名-精排.pdf」「卷名-配套解析.pdf」「英语试题-….pdf」「英语草稿卷-….pdf」「生词合集.pdf」等 | 下载的文件名 | 不动：都不含产品名 | 属于打印和 PDF 不许动 |
| P5 | `<title>`：`server/print-renderer.mjs:2353`（「英语试题」兜底）、`server/answer-renderer.mjs:333`（「卷名 · 纯答案版」）、`companionAnalysisRenderer.mjs:687`（「卷名｜配套解析」） | 不含产品名 | 打开打印 HTML 时的标签 | 不动 | 属于打印和 PDF 不许动 |
| P6 | 生词打印纸二维码：`vocabulary-review/VocabularyReviewPage.tsx:1959`、`:2045-2046`；生词 PDF：`server/vocabulary/vocabularyPdfRenderer.mjs:15`（来源 `server/api.mjs:89`） | 二维码里编码的 `https://eqbank.cc/…`（纸面上不印成文字，目测） | 学生扫码后看到的网址 | 不动（域名，见 Q3） | 属于打印和 PDF 不许动 |

`server/print-renderer.mjs`、`server/answer-renderer.mjs`、PaperSurface 里没有「EQBANK」或其他产品名（数出来 0 处）。没有找到 PDF 元数据里写产品名的代码（`setCreator`/`setProducer`/`setAuthor`/`headerTemplate` 都是 0 处）。

### 3. 后端和脚本（用户可见，4 行）

| # | 位置（文件:行号） | 现在显示的文字 | 用户在哪里看到 | 建议改成 | 能不能现在改 |
|---|---|---|---|---|---|
| B1 | `server/search/questionBankStewardService.mjs:404` | 请输入想让题库管家查找的问题。 | 找题助手空输入时的报错 | 不动（「题库管家」是功能名） | 能（建议不改） |
| B2 | `server/ai-parse/synonymDifficultyService.mjs:583`、`server/question-bank/questionGroupRoutes.mjs:206` | 「题库本地……初判已停用……」（原文含第三方服务名，此处省略） | 管理/导入相关接口报错 | 不动（功能说明，不是产品名） | 能（建议不改） |
| B3 | 邮件 | 没找到发信代码（0 处） | — | — | — |
| B4 | `scripts/` | 53 个文件共 88 处「eqbank / 题库 / EQBANK」，其中 `verify-*` / `smoke-*` 16 个文件 31 处，其余 37 个文件 57 处；逐个看过文件名和上下文，都是导入管线、部署、配音生成、清点拍照等操作员工具，没有找到会到达老师或学生的字符串 | 只有操作员看到 | 不动 | 能（建议不改） |

验证脚本里没有断言「英语题库工作台」这几个字（`rg` 0 处），所以将来改顶栏/登录页字样不会直接碰到它们（推断，未运行）。

### 4. 内部标识（建议不动，9 行）

| # | 位置 | 现在的标识 | 说明 | 建议 | 能不能现在改 |
|---|---|---|---|---|---|
| I1 | 仓库名、`server/package.json:2`、`:6` | english-question-bank、english-question-bank-server | 包名和描述 | 内部标识，建议不动 | 能（建议不改） |
| I2 | `agent-mcp/package.json:2`、`ops-mcp/package.json:2` | eqb-agent-mcp、eqb-ops-mcp | 包名 | 内部标识，建议不动 | 能（建议不改） |
| I3 | 域名 eqbank.cc | `app/src`、`server`、`shared`、`scripts`、`deploy` 里共 63 处 | 部署、默认源站、分享链接 | 内部标识，建议不动（对外的部分见 U6、U10、P6、Q3） | 要等 Owner 定 |
| I4 | `server/api.mjs:79`、`:84` | `data/question-bank.sqlite`、`QUESTION_BANK_DB`、`QUESTION_BANK_IMPORT_OPS_DB` | 数据库文件和环境变量 | 内部标识，建议不动 | 能（建议不改） |
| I5 | 环境变量和常量 | `QUESTION_BANK_*` / `EQB_*` 共 142 个不同名字 | 配置和 CI | 内部标识，建议不动 | 能（建议不改） |
| I6 | `app/src` CSS 记号 | `--eqb-` 前缀 50 个不同记号，707 处引用 | 设计记号 | 内部标识，建议不动 | 能（建议不改） |
| I7 | `data/vocabulary/eqb-british-teacher-v1.json:4`、`eqb-british-cori-high-v1.json:4`；`scripts/vocabulary/*`、`build-gaokao-*.mjs` | 「EQBank 美式教师音」等 displayName、voice id `eqb-british-*`、研究页眉「EQBank visual study」 | 查过 `app/src` 不读这两个 displayName；只在数据和研究页里 | 内部标识，建议不动 | 能（建议不改） |
| I8 | `server/api.mjs:3029`、`:3174`，`server/search/semanticSearchService.mjs:59`，`questionBankStewardService.mjs:43`，`server/api.mjs:4158` | 发给模型的提示词「高中英语题库……」，启动日志「Question bank API listening」 | 不展示给用户 | 内部标识，建议不动 | 能（建议不改） |
| I9 | `scripts/build-paper-dictionary-audio.mjs:281` | User-Agent `EQBankDictionaryAudioMirror/1.0 (https://eqbank.cc; …)` | 一次性下载脚本对外请求头 | 内部标识，建议不动 | 能（建议不改） |

### 5. 文档和素材（按文件汇总条数）

数法：`grep -o` 按字面计数，区分大小写。「玉案」一列已减掉「青玉案」里包含的那部分。

| 文件 | 他石 | 青玉案 | 玉案（不含青玉案） | Touchstone | Tashi | 全科题库 | 英语题库 | 獭石 | EQBANK | eqbank | 备考助手 | 合计 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `BRAND.md` | 41 | 24 | 2 | 20 | 13 | 4 | 7 | 12 | 2 | 2 | 4 | 131 |
| `PRODUCT.md` | 0 | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 0 | 0 | 0 | 2 |
| `DESIGN.md` | 0 | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 0 | 0 | 0 | 2 |
| `README.md` | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 1 | 0 | 2 |
| `CONTEXT.md` | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 2 |
| `design/brand-2026-10-13/canon-audit.md` | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 1 | 0 | 0 | 2 |
| `design/brand-2026-10-13/illustration/promo/promo.html` | 0 | 0 | 0 | 0 | 0 | 0 | 3 | 0 | 0 | 0 | 0 | 3 |
| `design/brand-2026-10-13/illustration/promo-3d/promo-3d.html` | 0 | 0 | 0 | 0 | 0 | 0 | 3 | 0 | 0 | 0 | 0 | 3 |
| `design/brand-2026-10-13/mascot/motion/otter-motion.html` | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 1 |
| `design/brand-2026-10-13/naming-round-2026-11-14.md` | 9 | 28 | 23 | 0 | 1 | 0 | 0 | 7 | 0 | 0 | 0 | 68 |
| `design/brand-2026-10-13/trademark-agent-brief-2026-11-14.md` | 1 | 12 | 8 | 0 | 1 | 0 | 0 | 5 | 0 | 0 | 0 | 27 |
| `design/brand-2026-10-13/naming-fitting-2026-11-14/README.md` | 6 | 5 | 0 | 2 | 4 | 0 | 4 | 0 | 0 | 0 | 0 | 21 |

说明：

- 只扫了 `.md`、`.svg`、`.html`、`.json`、`.txt`；`design/brand-2026-10-13/` 下 `logo/`、`login/`、`manual/`、`mascot/`（除上表）里这些文件没有命中。`app/public/brand/mark.svg:2` 只在注释里提到「獭獭」，不算产品名。
- `naming-fitting-2026-11-14/fit-run.json` 是这次试穿脚本生成的记录，里面的名字是试穿参数，不计入。
- `docs/` 下另有 8 个 `.md` 提到「英语题库工作台」，属于历史记录，没逐个列。
- 「BRAND.md 里有 41 处『他石』」这类数字只说明出现次数，不代表每处都要改；哪些是历史记录、哪些是现行规定，要等改 BRAND.md 时逐条看。

### 各组条数

| 组 | 表格行数 | 备注 |
|---|---|---|
| 网站界面 | 12 | 其中真正显示产品名的 9 行（U1、U3–U10）；U11 合并了 19 处功能名「题库」 |
| PDF 和打印 | 6 | 含产品名或域名的 4 行（P1–P3 的 EQBANK、P6 的域名）；全部不许动 |
| 后端和脚本 | 4 | 没有找到显示产品名的用户可见字符串 |
| 内部标识 | 9 | 全部建议不动 |
| 文档和素材 | 12 个文件 | 合计 264 处（按上表数） |

## 要 Owner 定的问题

以下「建议」都只是建议，没有定。

- **Q1 界面上写「獭石」还是「獭石题库」？**
  建议：顶栏和登录页写「獭石」两个字。理由：现在的「英语题库工作台」是 7 个字，换成 2 个字后 390 宽手机顶栏更松（试穿图里两种宽度都没有截断）；「题库」已在空状态和提示里作功能名大量出现（U11，19 处），再放进产品名里会重复。需要解释是什么的场合（浏览器标签、搜索结果）可以加后缀，见 Q4。
- **Q2 拉丁写法用 Tashi 吗？**
  建议：在商标确认前，界面上不出现拉丁写法，只在内部文档里用 Tashi 作暂定写法。理由：拉丁写法还是提案；「Tashi」也是常见人名和藏语词，商标检索结果出来前先不上界面。
- **Q3 域名 eqbank.cc 和配套解析上的「EQBANK 教师解析」出版标记留不留？**
  建议：域名先留（已印在已发出的生词纸二维码里，换域名会让旧纸失效，需要另做跳转）；「EQBANK 教师解析」出版标记先留，等商标确认后和 PDF 产品一起走一次专门的打印改动。扫码页顶部的「EQBank」（U8、U9）可以和顶栏一起改成「獭石」，它们不是打印面。
- **Q4 浏览器标签标题怎么写？**
  建议：「獭石 · 英语备课」或「獭石 · 英语题库」这种「名字 · 说明」的格式，名字放前面。理由：标签窄时只露前几个字，名字在前能认出来；后半句给第一次打开的人一个说明。具体后半句要 Owner 选。
- **Q5 读屏标签（U7、U8、U9 的 aria-label）跟着改吗？**
  建议：跟顶栏同一次改，保持看到的和读出来的一致。
- **Q6 文档里的旧名字怎么处理？**
  建议：BRAND.md 里的「他石」「青玉案」「Touchstone」作为命名历史保留，只在现行规定段落把产品名换成「獭石（工作名）」；PRODUCT.md、DESIGN.md、README.md 各 1–2 处「英语题库（工作台）」等界面改名定了再一起改。

## 试穿图观察

- 命令：`node scripts/brand/name-fitting-shots.mjs "獭石/Tashi" "玉案/Yu'an"`，退出码 0，`fit-run.json` 里 `errors` 为空。
- 输出：`naming-fitting-2026-11-14/fit-獭石.png`（新建）、`fit-玉案.png`、`fit-all.png`、`fit-run.json`（后三个是覆盖重写）。
- 截图环境：这台机器没有 PingFang SC，中文退到 WenQuanYi Zen Hei（文泉驿正黑）；也没有 Paper Mono。所以下面的观察只代表这款回退字体在 Chromium 2 倍图下的样子，**和老师在苹果设备上看到的字形不同**，要在 Mac 上再看一次。
- 脚本记录的现状：顶栏和登录页品牌字都是 15px / 600，原文「英语题库工作台」宽 105px（1440 和 390 两种宽度都一样）。

观察（全部是目测）：

- **顶栏小字号（15px）**：「獭」能认出来，左边犬字旁和右边「赖」分得开；但「赖」右半「负」的几道横笔挤在一起，比旁边的「石」黑一块，两个字灰度不匀。「玉案」两个字灰度更平均，更清楚。另外文泉驿正黑没有粗体，600 字重看起来和常规差不多，两个名字都一样。
- **App 图标旁（11px 标签）**：「獭」是三处里最吃力的，笔画糊成一团，要凑近看才分得出结构；「石」很清楚。「玉案」在同字号下都能一眼认出。两个名字都没有被截断（`truncatedIconLabels` 为空）。拉丁写法「Tashi」比「Yu'an」更好认（撇号在小字号下很小）。
- **登录页（左上角原大，15px）**：和顶栏情况一样，能认，「獭」偏密；整页缩到 0.6 的小图里两个名字都看不清，那张不能用来判断。
- **和「玉案」比**：「獭」16 画，「玉」5 画、「案」10 画，小字号下「玉案」明显更清楚；「獭石」在 15px 能用，11px 偏糊。64px 字标草稿里「獭石」结构清楚，没有问题。
- 要补看的：在装有 PingFang SC 的 Mac 上重跑同一条命令，重点看 11px 图标标签和 15px 顶栏里的「獭」。
