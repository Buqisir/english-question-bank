# 视觉规范手册 · 草案 0.5 · 源文件导出

导出日期：2026-11-14。只导出，没有改手册内容；Paper 里的任何东西都没有动。

## 出处

- Paper 文件：「全科题库品牌 · 海獭」（文件 ID `01M4RC9KH52FMSC8XM2HG52M7G`）
- 页：「主题 13 · 规范手册」（页 ID `p-E-0`），24 块画板：00–22 共 23 页，加「壳 · 内页模板（不导出）」。
- 成品 PDF 仍是同目录上一级的 `视觉规范手册-草案0.5.pdf`，本次没有动它。规则见 `BRAND.md` §3.5。

## 怎么导出的

都用 Paper Desktop 的本地 MCP 接口，只读：

| 产物 | 方式 |
| --- | --- |
| `NN-名字.jsx` | `get_jsx`，inline-styles 格式，不带节点 ID，不带画布坐标。每个文件第一行是注释，写明画板名和节点 ID；其余是 Paper 原样输出，未改动。所有位置、尺寸、字号、字重、行高、字距、颜色、边框、圆角都在内联样式里；布局以 flex 为主，少数元素用绝对定位。 |
| `png/NN-名字.png` | `export`，PNG，2x，3200×2264。第一次导出时部分画板里的图片还没加载出来（03、04、05、09–16、19–21 页图片缺失），所以每页又连导两次，两次字节数一致（16 页差 40 字节）后用第二次的结果。 |
| `text/NN-名字.md` | 从 JSX 里按元素先后顺序把所有文字节点抽出来，每个节点一段，`<br />` 处换行，HTML 实体还原。包括页眉、章名、标题、正文、标签、图注、页脚出处和页码。没有手工补写。 |
| 图 | JSX 里图都以 `backgroundImage: url(https://app.paper.design/file-assets/…)` 引用。逐个下载后，用 `git hash-object` 对照远端默认分支里的文件：字节完全相同的写出仓库路径；对不上的存进 `assets/`，文件名沿用 Paper 的素材 ID。 |

## 页面清单

画板尺寸全部是 1600×1132。

| 编号 | Paper 画板名 | 节点 ID | 源码 | 截图 | 文字 |
| --- | --- | --- | --- | --- | --- |
| 00 | 00 封面 | `MUB-0` | `00-封面.jsx` | `png/00-封面.png` | `text/00-封面.md` |
| 01 | 01 目录与怎么读 | `MUL-0` | `01-目录.jsx` | `png/01-目录.png` | `text/01-目录.md` |
| 02 | 02 品牌底层 · 北极星与性格 | `MX3-0` | `02-北极星与性格.jsx` | `png/02-北极星与性格.png` | `text/02-北极星与性格.md` |
| 03 | 03 品牌底层 · 形状、克制与反面 | `N15-0` | `03-形状-克制与反面.jsx` | `png/03-形状-克制与反面.png` | `text/03-形状-克制与反面.md` |
| 04 | 04 命名与标志 · 图形标志 | `N3D-0` | `04-图形标志.jsx` | `png/04-图形标志.png` | `text/04-图形标志.md` |
| 05 | 05 命名与标志 · 用法与禁止 | `N55-0` | `05-用法与禁止.jsx` | `png/05-用法与禁止.png` | `text/05-用法与禁止.md` |
| 06 | 06 颜色 · 五色与色阶 | `N79-0` | `06-五色与色阶.jsx` | `png/06-五色与色阶.png` | `text/06-五色与色阶.md` |
| 07 | 07 颜色 · 写字与搭配 | `NBM-0` | `07-写字与搭配.jsx` | `png/07-写字与搭配.png` | `text/07-写字与搭配.md` |
| 08 | 08 字体 · 三条字道 | `NGO-0` | `08-三条字道.jsx` | `png/08-三条字道.png` | `text/08-三条字道.md` |
| 09 | 09 图形语言 · 原语、石子、水和巨藻 | `NJR-0` | `09-原语-石子-水和巨藻.jsx` | `png/09-原语-石子-水和巨藻.png` | `text/09-原语-石子-水和巨藻.md` |
| 10 | 10 獭獭 · 设定与母版 | `NMH-0` | `10-设定与母版.jsx` | `png/10-设定与母版.png` | `text/10-设定与母版.md` |
| 11 | 11 獭獭 · 三视图与小尺寸 | `NQ6-0` | `11-三视图与小尺寸.jsx` | `png/11-三视图与小尺寸.png` | `text/11-三视图与小尺寸.md` |
| 12 | 12 獭獭 · 表情与状态 | `NUW-0` | `12-表情与状态.jsx` | `png/12-表情与状态.png` | `text/12-表情与状态.md` |
| 13 | 13 獭獭 · 道具与直立 | `NYA-0` | `13-道具与直立.jsx` | `png/13-道具与直立.png` | `text/13-道具与直立.md` |
| 14 | 14 獭獭 · 日历与动效 | `O3L-0` | `14-日历与动效.jsx` | `png/14-日历与动效.png` | `text/14-日历与动效.md` |
| 15 | 15 獭獭 · 场景与禁止项 | `O8B-0` | `15-场景与禁止项.jsx` | `png/15-场景与禁止项.png` | `text/15-场景与禁止项.md` |
| 16 | 16 界面视觉 · 不靠海獭 | `OC1-0` | `16-不靠海獭.jsx` | `png/16-不靠海獭.png` | `text/16-不靠海獭.md` |
| 17 | 17 界面视觉 · 插画体系 | `OI4-0` | `17-插画体系.jsx` | `png/17-插画体系.png` | `text/17-插画体系.md` |
| 18 | 18 界面视觉 · 中图 | `OLZ-0` | `18-中图.jsx` | `png/18-中图.png` | `text/18-中图.md` |
| 19 | 19 应用示例 · 登录页与空态 | `OO8-0` | `19-登录页与空态.jsx` | `png/19-登录页与空态.png` | `text/19-登录页与空态.md` |
| 20 | 20 应用示例 · 小尺寸与宣传 | `OQI-0` | `20-小尺寸与宣传.jsx` | `png/20-小尺寸与宣传.png` | `text/20-小尺寸与宣传.md` |
| 21 | 21 应用示例 · 3D 宣传版 | `OY6-0` | `21-3D-宣传版.jsx` | `png/21-3D-宣传版.png` | `text/21-3D-宣传版.md` |
| 22 | 22 附 · 还没做的 | `OSU-0` | `22-还没做的.jsx` | `png/22-还没做的.png` | `text/22-还没做的.md` |
| 模板 | 壳 · 内页模板（不导出） | `MZH-0` | `template.jsx` | `png/template.png` | `text/template.md` |

## 字体和字号

从 24 份 JSX 的内联样式里统计（次数是出现该样式的元素数）：

- Noto Serif SC（标题）：56 处，样式值 `"Noto Serif SC", system-ui, sans-serif`
- 苹方 Regular（正文）：507 处，样式值 `"PingFangSC-Regular", "PingFang SC", system-ui, sans-serif`
- 苹方 Semibold：283 处，样式值 `"PingFangSC-Semibold", "PingFang SC", system-ui, sans-serif`
- 苹方 Medium：107 处，样式值 `"PingFangSC-Medium", "PingFang SC", system-ui, sans-serif`
- Inter（数字、页码、英文标签）：170 处，样式值 `"Inter", system-ui, sans-serif`
- Times New Roman：6 处，样式值 `"TimesNewRomanPSMT", "Times New Roman", system-ui, sans-serif`
- Paper Mono：5 处，样式值 `"Paper Mono", ui-monospace, "SFMono-Regular", "SF Mono", "Menlo", "Consolas", "Liberation Mono", monospace`

字号（px：次数）：12：334，13：548，14：174，15：3，16：7，17：1，18：1，20：5，22：30，24：1，28：1，30：5，40：19，44：2，56：2，60：1，64：1，68：1，88：1。

Times New Roman 出现在 08 页（字道样张，例如 68px 的「Aa」）、16 页和 22 页；Paper Mono 出现在 08、10、01 页。它们是页面上的样字，手册版式本身用的是前五种。整个 Paper 文件还用到 Nunito、System Sans-Serif、System Monospace，但这一页里没有。

## 每页用到的图

- **00 封面**：
  - `3MXQDDP00SCRVWR1FJECWF3QPF.svg` → `design/brand-2026-10-13/illustration/promo/promo-wide-art.svg`
  - `6MPWQB3G33X8PPSKZ6S7CBPGQ5.svg` → `app/public/brand/mark.svg` 或 `design/brand-2026-10-13/logo/mint/mark.svg`
- **01 目录与怎么读**：
  - `6MPWQB3G33X8PPSKZ6S7CBPGQ5.svg` → `app/public/brand/mark.svg` 或 `design/brand-2026-10-13/logo/mint/mark.svg`
- **02 品牌底层 · 北极星与性格**：
  - `6MPWQB3G33X8PPSKZ6S7CBPGQ5.svg` → `app/public/brand/mark.svg` 或 `design/brand-2026-10-13/logo/mint/mark.svg`
  - `1AY5M1YFMNZG1K46AGRYKBV14B.png` → `design/brand-2026-10-13/evidence/dive-pair.png`
- **03 品牌底层 · 形状、克制与反面**：
  - `6MPWQB3G33X8PPSKZ6S7CBPGQ5.svg` → `app/public/brand/mark.svg` 或 `design/brand-2026-10-13/logo/mint/mark.svg`
  - `2CNZK4J463ZBEH8DYEJ6W2QRH5.svg` → `design/brand-2026-10-13/mascot/otter-front.svg`
  - `4PKFYA2JGZC3JTWWTMK6H5EY6X.svg` → `design/brand-2026-10-13/illustration/spot-paper.svg`
- **04 命名与标志 · 图形标志**：
  - `6MPWQB3G33X8PPSKZ6S7CBPGQ5.svg` → `app/public/brand/mark.svg` 或 `design/brand-2026-10-13/logo/mint/mark.svg`
  - `3SH1ZYDSE43E9C3W27NVPGR8RT.svg` → `design/brand-2026-10-13/mascot/otter-head.svg`
  - `5J17Y661GXY2VSMM94NE74AY7Z.svg` → `design/brand-2026-10-13/logo/mark-mono.svg`
  - `1N33BT589MWE73TR2ZSB4XSTRP.png` → `app/public/brand/mark-32.png` 或 `design/brand-2026-10-13/logo/mint/mark-32.png`
  - `6BHTWTS7RJ1MR165K12GKQMNBR.png` → `design/brand-2026-10-13/logo/mint/mark-16.png`
  - `6FRA4SRMVP1M04FYK1PG5GWHER.png` → `design/brand-2026-10-13/logo/mark-32-mono.png`
  - `75RJDR50BGAYZ3VZ1KZ8WYHBTP.png` → `design/brand-2026-10-13/logo/mark-16-mono.png`
- **05 命名与标志 · 用法与禁止**：
  - `6MPWQB3G33X8PPSKZ6S7CBPGQ5.svg` → `app/public/brand/mark.svg` 或 `design/brand-2026-10-13/logo/mint/mark.svg`
  - `7M3NF1ZR59N9XRRNBP2XC23RPK.png` → `design/brand-2026-10-13/evidence/logo-sheet.png`
  - `4AW6CDYBQ5DG9N5JE08XV2TN4V.svg` → `design/brand-2026-10-13/illustration/kelp-canopy.svg`
- **06 颜色 · 五色与色阶**：
  - `6MPWQB3G33X8PPSKZ6S7CBPGQ5.svg` → `app/public/brand/mark.svg` 或 `design/brand-2026-10-13/logo/mint/mark.svg`
- **07 颜色 · 写字与搭配**：
  - `6MPWQB3G33X8PPSKZ6S7CBPGQ5.svg` → `app/public/brand/mark.svg` 或 `design/brand-2026-10-13/logo/mint/mark.svg`
- **08 字体 · 三条字道**：
  - `6MPWQB3G33X8PPSKZ6S7CBPGQ5.svg` → `app/public/brand/mark.svg` 或 `design/brand-2026-10-13/logo/mint/mark.svg`
- **09 图形语言 · 原语、石子、水和巨藻**：
  - `6MPWQB3G33X8PPSKZ6S7CBPGQ5.svg` → `app/public/brand/mark.svg` 或 `design/brand-2026-10-13/logo/mint/mark.svg`
  - `4PKFYA2JGZC3JTWWTMK6H5EY6X.svg` → `design/brand-2026-10-13/illustration/spot-paper.svg`
  - `1Q29YQGESPY5E3ZYM543HQXYB4.svg` → `design/brand-2026-10-13/mascot/states/state-01-idle.svg`
  - `4AW6CDYBQ5DG9N5JE08XV2TN4V.svg` → `design/brand-2026-10-13/illustration/kelp-canopy.svg`
  - `7KCGWJ5KWG0N78PQ2HK93WGFC6.svg` → 仅在 Paper：`assets/7KCGWJ5KWG0N78PQ2HK93WGFC6.svg`
  - `1TEDJ9VQG7300V4JZWAMBDYC4S.svg` → `design/brand-2026-10-13/illustration/kelp.svg`
  - `5EA4E0Z6HXQ2DQDEF4TX1EA863.svg` → 仅在 Paper：`assets/5EA4E0Z6HXQ2DQDEF4TX1EA863.svg`
- **10 獭獭 · 设定与母版**：
  - `6MPWQB3G33X8PPSKZ6S7CBPGQ5.svg` → `app/public/brand/mark.svg` 或 `design/brand-2026-10-13/logo/mint/mark.svg`
  - `2CNZK4J463ZBEH8DYEJ6W2QRH5.svg` → `design/brand-2026-10-13/mascot/otter-front.svg`
  - `3SH1ZYDSE43E9C3W27NVPGR8RT.svg` → `design/brand-2026-10-13/mascot/otter-head.svg`
  - `0XA37Q4EDCQEZ5B21758RG8MTP.svg` → `design/brand-2026-10-13/mascot/app-icon.svg`
- **11 獭獭 · 三视图与小尺寸**：
  - `6MPWQB3G33X8PPSKZ6S7CBPGQ5.svg` → `app/public/brand/mark.svg` 或 `design/brand-2026-10-13/logo/mint/mark.svg`
  - `4HH8FS099E2C27K4P7V1PVCPYC.svg` → `design/brand-2026-10-13/mascot/small/otter-head-16.svg`
  - `5VS0JN51VM85Z07M3DB9QHRTF6.svg` → `design/brand-2026-10-13/mascot/small/otter-head-32.svg`
  - `6X88ZX80D6YDW1A6MQDKWVXTTG.svg` → `design/brand-2026-10-13/mascot/small/app-icon-16.svg`
  - `2Z832RXAWC47X3F67X0T1M9E8J.svg` → `design/brand-2026-10-13/mascot/small/app-icon-32.svg`
- **12 獭獭 · 表情与状态**：
  - `6MPWQB3G33X8PPSKZ6S7CBPGQ5.svg` → `app/public/brand/mark.svg` 或 `design/brand-2026-10-13/logo/mint/mark.svg`
  - `1Q29YQGESPY5E3ZYM543HQXYB4.svg` → `design/brand-2026-10-13/mascot/states/state-01-idle.svg`
  - `54ZX78JG7B18AMRHRPY7436WGX.svg` → `design/brand-2026-10-13/mascot/states/state-02-searching.svg`
  - `3N3S1V8JBJAY41T1KBVG8VMZVG.svg` → `design/brand-2026-10-13/mascot/states/state-03-offer.svg`
  - `2RTQV0PZ7SVBQJ0ZDYPD2428QQ.svg` → `design/brand-2026-10-13/mascot/states/state-04-done.svg`
  - `0HQ9KMGDAESFY1K0HF22EVDMY4.svg` → `design/brand-2026-10-13/mascot/states/state-05-not-found.svg`
  - `24FE973A7ZRVTQRCYA17G5EQKD.svg` → `design/brand-2026-10-13/mascot/states/peek-login.svg`
- **13 獭獭 · 道具与直立**：
  - `6MPWQB3G33X8PPSKZ6S7CBPGQ5.svg` → `app/public/brand/mark.svg` 或 `design/brand-2026-10-13/logo/mint/mark.svg`
  - `5NNGZHXEEGCF10T96Q2T8WH6XT.svg` → `design/brand-2026-10-13/mascot/props/prop-en-card.svg`
  - `50F4596X3XDSVXHCA2NDP5AHNF.svg` → `design/brand-2026-10-13/mascot/props/prop-math-set-square.svg`
  - `7ETN43YJK1TJDNCQ8G0YS8J703.svg` → `design/brand-2026-10-13/mascot/props/prop-zh-brush.svg`
  - `4GH710690DPSBWH89TZEY6A3GF.svg` → `design/brand-2026-10-13/mascot/props/prop-geo-globe.svg`
  - `2SPA9PRH8EKY4132QB0GYRDNT0.svg` → `design/brand-2026-10-13/mascot/props/prop-phy-magnet.svg`
  - `1TJMJEEKJSQ0NK5VBW7XK92463.svg` → `design/brand-2026-10-13/mascot/props/prop-chem-flask.svg`
  - `50SEQ5KN6FWAPMHWVP47EBFANN.svg` → `design/brand-2026-10-13/mascot/props/prop-bio-leaf.svg`
  - `27V1ATD8VM6416ZG6XSSNNSPFA.svg` → `design/brand-2026-10-13/mascot/props/prop-his-scroll.svg`
  - `32GFC4KHH75KEYMAY0E67AYN35.svg` → `design/brand-2026-10-13/mascot/props/wear-scarf.svg`
  - `2B48JNS5RE24CF6JGD4HZQCPC0.svg` → `design/brand-2026-10-13/mascot/props/wear-cap.svg`
  - `2TF7A56HGNM2FM48AWBE7BVJ07.svg` → `design/brand-2026-10-13/mascot/upright/upright-01-hug-book.svg`
  - `0HC97SH5F6GCY4KPK7A06NWYYM.svg` → `design/brand-2026-10-13/mascot/upright/upright-02-backpack.svg`
  - `475JGWCGZ8ZQS1YS6SQTXJ0NAA.svg` → `design/brand-2026-10-13/mascot/upright/upright-03-wave.svg`
  - `7QAA6M1WZE16YEY2G5Z15PDRBM.svg` → `design/brand-2026-10-13/mascot/upright/upright-04-shell.svg`
  - `1C14327G0DBAVW9GDYZFCEBMQF.svg` → `design/brand-2026-10-13/mascot/upright/upright-05-wade-read.svg`
  - `3WTZ362E43A8PX8BTYB78BPAP5.svg` → `design/brand-2026-10-13/mascot/upright/upright-06-sit-read.svg`
  - `3K7KAGDNZG54XEPN5DQS7WHRBJ.svg` → `design/brand-2026-10-13/mascot/upright/upright-07-graduate.svg`
  - `0KV3EPNHWCR6FBQ845TAQV8JD6.svg` → `design/brand-2026-10-13/mascot/upright/upright-08-gift-stone.svg`
- **14 獭獭 · 日历与动效**：
  - `6MPWQB3G33X8PPSKZ6S7CBPGQ5.svg` → `app/public/brand/mark.svg` 或 `design/brand-2026-10-13/logo/mint/mark.svg`
  - `21JG9ZX1CR0Z1DJV1B6VES1QYT.svg` → `design/brand-2026-10-13/mascot/kelp/otter-kelp-wrap.svg`
  - `0HC97SH5F6GCY4KPK7A06NWYYM.svg` → `design/brand-2026-10-13/mascot/upright/upright-02-backpack.svg`
  - `0KV3EPNHWCR6FBQ845TAQV8JD6.svg` → `design/brand-2026-10-13/mascot/upright/upright-08-gift-stone.svg`
  - `2TF7A56HGNM2FM48AWBE7BVJ07.svg` → `design/brand-2026-10-13/mascot/upright/upright-01-hug-book.svg`
  - `3K7KAGDNZG54XEPN5DQS7WHRBJ.svg` → `design/brand-2026-10-13/mascot/upright/upright-07-graduate.svg`
  - `32GFC4KHH75KEYMAY0E67AYN35.svg` → `design/brand-2026-10-13/mascot/props/wear-scarf.svg`
  - `3WTZ362E43A8PX8BTYB78BPAP5.svg` → `design/brand-2026-10-13/mascot/upright/upright-06-sit-read.svg`
  - `24FE973A7ZRVTQRCYA17G5EQKD.svg` → `design/brand-2026-10-13/mascot/states/peek-login.svg`
  - `7X595YGRDEQWPAAWJKP04QDSTM.svg` → `design/brand-2026-10-13/mascot/calendar/peek-login-cap.svg`
  - `6G1DHCTQ67SVWNGWYA6NJAZDP1.svg` → `design/brand-2026-10-13/mascot/calendar/peek-login-scarf.svg`
  - `03FRWKSXT2QQR0QHH1WHFYM9FR.svg` → `design/brand-2026-10-13/mascot/calendar/peek-login-gift.svg`
  - `54ZX78JG7B18AMRHRPY7436WGX.svg` → `design/brand-2026-10-13/mascot/states/state-02-searching.svg`
  - `37FGTHMTRGF771ZN2D6AHJHCA6.svg` → 仅在 Paper：`assets/37FGTHMTRGF771ZN2D6AHJHCA6.svg`
- **15 獭獭 · 场景与禁止项**：
  - `6MPWQB3G33X8PPSKZ6S7CBPGQ5.svg` → `app/public/brand/mark.svg` 或 `design/brand-2026-10-13/logo/mint/mark.svg`
  - `21JG9ZX1CR0Z1DJV1B6VES1QYT.svg` → `design/brand-2026-10-13/mascot/kelp/otter-kelp-wrap.svg`
  - `4J85G6ZDN5PH9ZMJ98TXZ4V71V.svg` → `design/brand-2026-10-13/mascot/kelp/otter-dive.svg`
- **16 界面视觉 · 不靠海獭**：
  - `6MPWQB3G33X8PPSKZ6S7CBPGQ5.svg` → `app/public/brand/mark.svg` 或 `design/brand-2026-10-13/logo/mint/mark.svg`
  - `7PZMP06PNHC23MXXB4BD94KY3Z.svg` → 仅在 Paper：`assets/7PZMP06PNHC23MXXB4BD94KY3Z.svg`
  - `32FQTAFNKH73DTN19W5WZ9KR13.svg` → 仅在 Paper：`assets/32FQTAFNKH73DTN19W5WZ9KR13.svg`
  - `1W8MVDY631YBNN9ZDEAXRBKTP3.svg` → 仅在 Paper：`assets/1W8MVDY631YBNN9ZDEAXRBKTP3.svg`
  - `62SPT1Z1M1K1SZN18CAZF3JC7B.svg` → 仅在 Paper：`assets/62SPT1Z1M1K1SZN18CAZF3JC7B.svg`
  - `65MAKQ80CEYD8DT6QZXJWMDJY8.svg` → 仅在 Paper：`assets/65MAKQ80CEYD8DT6QZXJWMDJY8.svg`
  - `11MBDH99FPQWM2KAG3QJ6XW1RG.svg` → 仅在 Paper：`assets/11MBDH99FPQWM2KAG3QJ6XW1RG.svg`
  - `27AG8XXPW8TMS4Z76SWS1N07FT.svg` → 仅在 Paper：`assets/27AG8XXPW8TMS4Z76SWS1N07FT.svg`
  - `53NBTYSQZPG6W5Q8QDGGVYX68G.svg` → 仅在 Paper：`assets/53NBTYSQZPG6W5Q8QDGGVYX68G.svg`
  - `174K8HD2WRPN55Z7591VHQ1VC2.svg` → 仅在 Paper：`assets/174K8HD2WRPN55Z7591VHQ1VC2.svg`
  - `1B92JGMBTWN4F96M3D29BJ9W86.svg` → 仅在 Paper：`assets/1B92JGMBTWN4F96M3D29BJ9W86.svg`
  - `3F8GRGXEY0FQ55EK5STT1JHSCJ.svg` → 仅在 Paper：`assets/3F8GRGXEY0FQ55EK5STT1JHSCJ.svg`
  - `3SH1ZYDSE43E9C3W27NVPGR8RT.svg` → `design/brand-2026-10-13/mascot/otter-head.svg`
  - `2CNZK4J463ZBEH8DYEJ6W2QRH5.svg` → `design/brand-2026-10-13/mascot/otter-front.svg`
  - `4PKFYA2JGZC3JTWWTMK6H5EY6X.svg` → `design/brand-2026-10-13/illustration/spot-paper.svg`
- **17 界面视觉 · 插画体系**：
  - `6MPWQB3G33X8PPSKZ6S7CBPGQ5.svg` → `app/public/brand/mark.svg` 或 `design/brand-2026-10-13/logo/mint/mark.svg`
  - `4PKFYA2JGZC3JTWWTMK6H5EY6X.svg` → `design/brand-2026-10-13/illustration/spot-paper.svg`
  - `21JG9ZX1CR0Z1DJV1B6VES1QYT.svg` → `design/brand-2026-10-13/mascot/kelp/otter-kelp-wrap.svg`
- **18 界面视觉 · 中图**：
  - `6MPWQB3G33X8PPSKZ6S7CBPGQ5.svg` → `app/public/brand/mark.svg` 或 `design/brand-2026-10-13/logo/mint/mark.svg`
  - `38QZVEV57V09MX1SWY2PYE6TQH.svg` → `design/brand-2026-10-13/illustration/kelp-dive.svg`
  - `1VD2TYMFVWX6Z2740XEAKG9WE6.svg` → `design/brand-2026-10-13/illustration/kelp-forest.svg`
  - `4AW6CDYBQ5DG9N5JE08XV2TN4V.svg` → `design/brand-2026-10-13/illustration/kelp-canopy.svg`
- **19 应用示例 · 登录页与空态**：
  - `6MPWQB3G33X8PPSKZ6S7CBPGQ5.svg` → `app/public/brand/mark.svg` 或 `design/brand-2026-10-13/logo/mint/mark.svg`
  - `7TG46BQQP5R3QV4EE4TEB3TP57.png` → `design/brand-2026-10-13/evidence/login.png`
  - `5FW34NNWT4QQQ3E21HCADPSH9P.png` → `design/brand-2026-10-13/evidence/my-space-empty-kelp.png`
  - `7CC797ZE3DFTNM96EAPW8EB5J3.png` → `design/brand-2026-10-13/evidence/thinking-loading.png`
- **20 应用示例 · 小尺寸与宣传**：
  - `6MPWQB3G33X8PPSKZ6S7CBPGQ5.svg` → `app/public/brand/mark.svg` 或 `design/brand-2026-10-13/logo/mint/mark.svg`
  - `4SYHKPM1CG2EK93B6ZCAYRH2VY.png` → `design/brand-2026-10-13/illustration/promo/promo-wide.png`
  - `51205Z47EW8ZZEJE2KZ82P9BT6.png` → `design/brand-2026-10-13/illustration/promo/promo-tall.png`
  - `6DZASQ1AD6BYE3BRQVF38RX9W4.png` → `design/brand-2026-10-13/evidence/logo-real.png`
  - `73JAEG8VVY16REPPK59KVYD4ER.png` → `design/brand-2026-10-13/evidence/small-sizes-1x.png`
- **21 应用示例 · 3D 宣传版**：
  - `6MPWQB3G33X8PPSKZ6S7CBPGQ5.svg` → `app/public/brand/mark.svg` 或 `design/brand-2026-10-13/logo/mint/mark.svg`
  - `35Y2FR488WBEQAVE67N84W9RXP.png` → `design/brand-2026-10-13/illustration/promo-3d/promo-3d-splash.png`
  - `05PJDNNCD0EXKBVB7KA8MHHKSY.png` → `design/brand-2026-10-13/illustration/promo-3d/promo-3d-wide.png`
  - `5W5XV63C6KQA2X8HSEB64AQWPX.png` → `design/brand-2026-10-13/evidence/3d-mint-recolor.png`
- **22 附 · 还没做的**：
  - `6MPWQB3G33X8PPSKZ6S7CBPGQ5.svg` → `app/public/brand/mark.svg` 或 `design/brand-2026-10-13/logo/mint/mark.svg`
- **壳 · 内页模板（不导出）**：
  - `6MPWQB3G33X8PPSKZ6S7CBPGQ5.svg` → `app/public/brand/mark.svg` 或 `design/brand-2026-10-13/logo/mint/mark.svg`

共 74 个不同的图：60 个和仓库里的文件逐字节相同，14 个只在 Paper 里，已导出到 `assets/`：

- 11 个线性图标（24px 描边 2.75、16px 描边 2.25，墨色或白色）：齿轮、书签、放大镜、下载、加号、文件、日历等，同一个图标有 16px 和 24px 两份。它们是 EQB 图标套件画在页面上的样子，源在 `design/icon-system-2026-09-15/icons-v3.mjs`、`app/src/icons`，仓库里没有逐个的 SVG 文件，所以和仓库对不上。
- `37FGTHMTRGF771ZN2D6AHJHCA6.svg`：注释写「海獭状态 · 02 找题中」，内容和仓库现在的 `design/brand-2026-10-13/mascot/states/state-02-searching.svg` 不同，像是换色以前的版本。
- `5EA4E0Z6HXQ2DQDEF4TX1EA863.svg`、`7KCGWJ5KWG0N78PQ2HK93WGFC6.svg`：注释写「原语插画 · 巨藻」，和仓库的 `design/brand-2026-10-13/illustration/kelp.svg` 大小一样但第 3 行起有差别。

JSX 里还有 2 处内联 `<svg>`，随 JSX 一起保存，没有单独导出。

## 没导出的和要注意的

- **JSX 里的图片地址仍指向 Paper 的在线素材**（`app.paper.design/file-assets/…`）。没有替换成仓库路径，要离线用时按上面的对照表换。
- **图层名和节点 ID 没导出**：JSX 用的是不带节点 ID 的版本，Paper 里每个图层的名字、锁定和隐藏状态都不在里面。每块画板的节点 ID 记在上表和每个 JSX 文件的第一行。
- **Paper 专有的东西没有对应**：组件实例关系、导出设置、评论都没有导出。
- **JSX 是 Paper 对画板的转写，不是 Paper 的原生文件格式**。拿它在浏览器里渲染，因为字体回退和排版引擎不同，换行位置可能和 PNG 略有出入；对照以 PNG 为准。
- **没有核对 PDF 和现在的 Paper 是否一致**。BRAND.md §3.5 记的 0.5 版之后的改动（第 70、71 条换色），如果 Paper 里已经改了而 PDF 没重出，这里导出的是 Paper 当前的样子。
