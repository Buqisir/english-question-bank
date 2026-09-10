# 试卷字体候选调研

调研日期：2026-09-08。当前状态：Owner 已选定 **TeX Gyre Termes＋思源宋体**，
三端固定使用，不优先调用本机字体。下方候选表及比较过程保留为历史证据，
其中“未选定”描述的是当时状态，不再是待决事项。生产渲染器迁移尚未完成。

## 已确认的资产与授权记录

- 固定版本：TeX Gyre Termes 2.609；Source Han Serif CN 2.003。
- 仓库位置：`app/public/fonts/paper/`。`README.md` 记录官方下载地址、
  Adobe 固定 commit、适用许可、未修改字库及使用边界。
- 共六个原版字体文件：英文 Regular/Bold/Italic/BoldItalic，中文 Regular/Bold。
- 凭证为上游原始版权声明和许可证，不是购买式商业授权证书：Termes 保留
  GUST Font License、LPPL 1.3c、官方 README/manifest；思源保留完整 OFL 1.1。
- `SHA256SUMS` 校验字体、许可证及字体 CSS；`fonts.css` 无 `local()` 字体查找。
- `node scripts/verify-paper-font-assets.mjs --actual-artifacts`：PASS。
  Screen/Print 样张与现有生产 Paged.js/PDF 流程均实测六个字体面，CDP 检查
  实际 PostScript 名称及 custom-font 标识，排除系统字体冒充。输出 1 页 A4 PDF，
  截图与 PDF 栅格图均检查无明显缺字、裁切、重叠。
- `pnpm -C app build`：PASS；仍有既存的大 chunk 提示。
- 源目录、Git 暂存 blob、`app/dist/fonts/paper/` 的 12 项 SHA-256 均一致。
  上游许可自带 CRLF/尾随空格，局部 `.gitattributes` 保留原始字节，
  不为了格式检查改写许可原文。
- `pnpm -C app verify:changed -- --base-ref origin/main`：执行完成，**未通过**。
  分类 `unknown-fallback` 自动选择 `all`，耗时 828.9 秒，
  **169 PASS / 1 SKIP / 3 FAIL**。失败为既有本地数据问题：
  `verify-similar-v2` 不接受真库 `self_made`，`verify-paper-assets-consistency`
  的资产未入本地库，`verify-genre-truth` 的历史决策与本地 passage 集不一致。
  `verify-i16a-teaching-dimension-search` 因外部夹具缺失 SKIP，不计为通过。
  没有为使检查变绿而修改数据库、删除资产或放宽断言。
- 本次凭证下载包：`.amp/in/artifacts/selected-paper-fonts-and-licenses.zip`；
  包含字体、原始许可、README 与校验值。可视证据为同目录
  `selected-paper-fonts.png` 和 `selected-paper-fonts.pdf`。
- 以上是固定字体资产的验证，不等于所有题型已迁移，也不等于完整 Owner QA。
  下一步须更新运行时字体/度量绑定、加载失败处理、各题型三端渲染后再完成整体验收。

## 建议供 Owner 比选的三组

| 方案 | 英文 | 中文正文 | 取舍 |
| --- | --- | --- | --- |
| A，优先推荐 | Liberation Serif 2.1.5 | 思源宋体简中地区子集 | 英文以兼容 Times New Roman 文档布局为目标；迁移最保守，但不承诺与现有所有设备逐像素相同。 |
| B，Times 系备选 | TeX Gyre Termes 2.609 | 同上 | 基于 Nimbus Roman，适合 Times 风格排印；不把视觉接近等同于 Times New Roman 度量完全兼容。 |
| C，允许更明显观感变化 | Source Serif 4 | 同上 | 官方面向纸面和屏幕长文，支持 optical-size 系列；不是 Times 度量替代，须重新校准布局。样张使用静态正文 Regular。 |

中文统一使用思源宋体 CN 的 Regular/Bold 作对照，而不是同时变动中英字体，
以免混淆差异。这里的 CN 是大陆地区子集；SC 是默认简中字形的完整 Pan-CJK
语言版。它不是 Windows 宋体的精确复制。正式标题若保留黑体风格，还需配置
独立黑体通道；本样张的中文标题使用思源宋体 Bold，不是生产标题定稿。

Tinos 是额外的保守备选，官方明确称其与 Times New Roman 度量兼容。
Liberation 2.x 本身基于 Croscore；两者有共同来源，不应当作两套截然不同的
视觉方向。Source Han Serif 与 Noto Serif CJK 也来自同一 Adobe–Google
合作项目，不应只因品牌名不同就充当两套独立候选。

## 官方证据与授权

- [Liberation 官方 README](https://github.com/liberationfonts/liberation-fonts/blob/main/README.md)：
  “aims to provide document layout compatibility as usage of Times New Roman,
  Arial, Courier New”。Regular、Bold、Italic、BoldItalic 完整；
  [2.x 许可证](https://github.com/liberationfonts/liberation-fonts/blob/main/LICENSE)
  为 SIL OFL 1.1。[ChangeLog](https://github.com/liberationfonts/liberation-fonts/blob/main/ChangeLog)
  记录 2.0 起基于 Croscore 1.21.0。
- [Termes 官方说明与下载](https://www.gust.org.pl/projects/e-foundry/tex-gyre/termes)：
  基于 URW Nimbus Roman No9 L，提供 regular/italic/bold/bold italic OTF。
  [GUST Font License](https://www.gust.org.pl/fonts/licenses/GUST-FONT-LICENSE.txt)
  按 LPPL 1.3c 或后继版本分发/修改，不是 OFL；不能写成所有候选同一许可。
- [Source Serif 官方说明](https://github.com/adobe-fonts/source-serif/wiki/Source-Serif-Readme)
  与[官方样张](https://adobe-fonts.github.io/source-serif/)：用于多字号长文，
  有 Caption、Small Text、正文、Subhead、Display 系列。
  [许可证](https://github.com/adobe-fonts/source-serif/blob/release/LICENSE.md)为 OFL 1.1；
  官方提供 TTF/OTF/WOFF2，而本次网页样张用静态 WOFF2/TrueType。
- [思源宋体项目说明](https://source.typekit.com/source-han-serif/)与
  [发行说明](https://github.com/adobe-fonts/source-han-serif/blob/release/README.md)：
  Adobe/Google 合作，提供地区字形与字重。
  [许可证](https://github.com/adobe-fonts/source-han-serif/blob/master/LICENSE.txt)为 OFL 1.1。
  样张使用官方 `SubsetOTF/CN/SourceHanSerifCN-{Regular,Bold}.otf`。
- [Tinos 官方描述](https://github.com/google/fonts/blob/main/ofl/tinos/DESCRIPTION.en_us.html)
  明确写 metrically compatible with Times New Roman；但描述末尾仍留有历史
  Apache 2.0 字样。当前 [metadata](https://github.com/google/fonts/blob/main/ofl/tinos/METADATA.pb)
  与[上游 README](https://github.com/googlefonts/tinos)写 OFL。若选 Tinos，
  必须按选定的实际发行文件及附带许可打包，不混用旧版本描述。

OFL 允许使用、嵌入和符合条件的再分发；需保留版权/许可，不能单独出售字体，
修改版需遵守 Reserved Font Name 等条款。不是“免费就没有授权要求”。
网页应自托管，PDF 使用同源文件；不依赖第三方字体 CDN。正式部署还需处理
中文文件体积、完整字符覆盖、缓存、字体加载完成时机以及实际 PDF 输出。

## 本次实际验证

- 原创同文样张三组均为 14px / 24px；打印为 10.5pt / 18pt。
- 浏览器 FontFaceSet 的 11 个正文/粗体/斜体字体面均为 loaded。
- Chromium `CSS.getPlatformFontsForNode` 确认三组英文实际为自定义加载的
  Liberation Serif、TeX Gyre Termes、Source Serif 4；中文实际为 Source Han Serif CN。
- 生成三页 A4 PDF（594.96 × 841.92 pt），并检查三页无缺字方框、重叠或裁切。
- 只证明此选型样张可显示/打印；未证明完整生产卷、所有浏览器或旧金样几何兼容。
  OTF/CFF 字体在本次 Chromium PDF 中出现 Type 3 记录，不能把 PDF 字体列表
  缺少家族名误判成未用该字体，也不能声称已经完成生产字体嵌入策略验证。
- 中文 Regular/Bold 原始 OTF 各约 12 MB；预览未做生产分片优化。

样张源与字体保留在本任务 `.scratch/font-research/`，字体文件附带许可证，
不进入生产资产。供 Owner 查看的是 `.amp/in/artifacts/font-candidates.png`
和 `font-candidates.pdf`；尚未选择任何方案。

## 新罗马基准补充

按 Owner 要求增加真正的 Times New Roman，而非系统 fallback。使用
[Core Fonts 原版 times32.exe](https://sourceforge.net/projects/corefonts/files/the%20fonts/final/times32.exe/download)
中的 2.82 版本；不是最新 Windows/Office 版本，不承诺与其逐像素相同。
[该发行包 EULA](https://corefonts.sourceforge.net/eula.htm)允许安装与使用，
规定再分发须完整保留原包与版权许可，不允许将其作为自有产品的一部分牟利。
本次只在隔离 Fontconfig 的浏览器进程加载，不全局安装，不作为 webfont
托管，不放入生产资产；原包、许可和复现脚本保留于 `.scratch/tnr-baseline/`。

- `node .scratch/tnr-baseline/render.mjs`：PASS。CDP 确认基准正文、粗体、
  斜体分别使用 TimesNewRomanPSMT、TimesNewRomanPS-BoldMT、
  TimesNewRomanPS-ItalicMT；三个候选也确认实际字体家族。
- 输出 `font-times-comparison.png`（四组同宽对照与放大字形）及
  `font-times-comparison.pdf`（4 页 A4），均位于 `.amp/in/artifacts/`。
- 截图与 PDF 已检查，无明显缺字、裁切或重叠。中文仍统一思源宋体，
  正文与放大字形分别统一字号，不用改变中文或字号掩盖英文差异。
- 此图中 Liberation 与新罗马正文换行接近；Source Serif 4 换行有可见变化。
  单一样张不能证明生产试卷几何兼容。Owner 仍未选定字体；Ship 仍暂停。
