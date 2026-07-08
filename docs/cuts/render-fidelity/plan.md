# 刀⑤ 渲染保真（render-fidelity）plan

- Size: **large**（PaperSurface 高危 + 跨四面契约）→ PA 必挂（fresh Opus high）
- 权威：`docs/product/exam-paper-format-standards.md`（v2，owner 2026-07-08 终审）
  的「执行与迁移」节即本刀范围来源；数据契约见 nck1-paper-standard.md（本刀不碰）。
- 盘点依据：2026-07-08 四面实测盘点（本 plan 各 chunk 内的 file:line 均已核实）。

## 目标

四套渲染面（屏幕 PaperSurface / 写作页 / PDF 导出 / DOCX 导出）的排版数值
收拢到标准 v2 单一权威：token 单源化（关掉 Issue #30 Gate 2 欠了 52 天的门）、
补齐 PDF/DOCX 缺失的挖空样式与写作框、DOCX 补显式字体、字号回归 10.5pt 等比、
修 I10 句首挖空 bug、清 PaperSurfacePrototype 死码。

## 现状基线（已核实）

| 面 | 文件 | 字号 | 行距 | 边距 | 挖空 | 写作框 | 用 token |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 屏幕 PaperSurface | `app/src/shared-ui/papersurface/PaperSurface.css` | 16px | 1.85/1.7(token)+1.6硬编码 | padding 56px | ✅ | —（由写作页出） | ✅ |
| 写作页 | `app/src/features/paper-intelligence/writingPaperPage.css` | 16px | 1.6 | 56px | n/a | ✅(rem 制) | ❌（全硬编码） |
| PDF | `server/print-renderer.mjs` | 10.5pt | 1.6 | 20/18mm | ❌无 | ❌无 | ❌ |
| DOCX | `server/exports/docxRenderer.mjs` | 正文无 size（Word 默认） | — | 1134 twips≈20mm 四边 | ❌无 | ❌无 | ❌，且**无 rFonts** |

标准 v2 目标：正文 10.5pt（794px 屏下 ≈14px）、行距 18 磅固定（≈1.714）、
左右边距 24mm、上 ≈21mm、页脚页码距底 ≈17.5mm、英文 Times New Roman /
中文书宋族、部标题中黑 10.5pt 不放大。

## Chunks（每个独立可验收，A 先行，B/C 依赖 A，D/E 独立）

### Chunk A：token 单源化 + 屏幕两面归标

- `shared/papersurface/tokens.mjs`（+ `.d.ts`/`.d.mts` parity）扩充排版
  primitives：`paperFontSizePt: 10.5` / `paperFontSizePx: 14`、
  `paperLineHeight`（18pt 基准 ≈1.714，替代现 1.85/1.7 双值——**以标准为准，
  统一 1.714**）、`pageMarginX: 24mm`（794px 下 ≈91px）、`pageMarginTop≈21mm`、
  中英文字体栈拆分（英 Times 族 / 中宋体族 / 标题黑体族，映射见标准 §2）。
  删除或改写 `paperSurfaceServerCurrent` 设计注记（B1 时代「server 不动」
  条款随本刀作废）。
- `PaperSurface.css`：16px → `var(--ps-font-size)`(14px)；行距全部走 token
  （含 `.ps-option` 硬编码 1.6）；page padding 56px → 边距 token。
- `writingPaperPage.css`：全部硬编码值改为消费同一 token 源（import 或 CSS
  var 注入，跟 PaperSurface 同机制）；写作框保留，尺寸按标准 §8 mm 校准
  （应用文 ≈144×65mm、读后续写 ≈145×57mm，794px 等比换算）。
- `scripts/verify-paper-surface-tokens.mjs` 契约同步更新：删「server 不动」
  断言，加「四面消费同源」断言。
- 验收：`verify-paper-surface-module-v1` / `verify-i6-writing-render` /
  parity 脚本绿；浏览器截图确认 A4 纸面视觉（字号 14px、行距、边距）。

### Chunk B：PDF 导出归标（依赖 A）

- `server/print-renderer.mjs` import `shared/papersurface/tokens.mjs`：
  `@page` 边距 24mm 左右 / 21mm 上 / 页脚页码「英语试题 第X页(共Y页)」距底
  17.5mm（vivliostyle `@bottom-center`）；行距 18pt 固定；字体栈走 token。
- 补挖空样式：passage 文本渲染前做与 `PaperSurface.tsx` `paperBlankPattern`
  同源的替换（pattern 提到 shared 层复用，勿在 server 抄一份），输出下划线
  +居中题号；语法填空 `NN._____` 同理（复用 `grammarFillBlank.ts` pattern，
  必要时把两个 pattern 一起上移到 `shared/papersurface/`）。
- 补写作框：writing/continuation 题组输出边框答题框（标准 §8 尺寸 mm 值）。
- **挖空 pattern 契约钉死（PA F2）**：server 侧用 `paperBlankPattern`
  （`__NN__` / 双空格形态），**不是** I15 的 `grammarFillBlankPattern`
  （后者匹配 `NN._____`，与库内真存储形态不符）。verify 必须行为级：
  渲染真实 `paperAssetParagraphText(group)` payload 并清点 styled 挖空数，
  禁止合成样例充数（I10 假绿教训）。
- 验收：`verify-print-renderer` / `verify-print-pdf-export-flow` 绿 +
  真 PDF 字节级冒烟（走现有 export flow 脚本）；一张含完形+语法填空+写作的
  卷导出 PDF 人工/截图核对挖空与写作框。

### Chunk C：DOCX 导出归标（依赖 A）

- `server/exports/docxRenderer.mjs`：
  - `run()` 增加 rFonts 输出，默认英 Times New Roman、中文 SimSun
    （`w:rFonts w:ascii/w:hAnsi="Times New Roman" w:eastAsia="宋体"`），
    标题走黑体族；**所有正文 run 显式 `size: 21`**（10.5pt 半点制）。
  - 页边距：左右 24mm=1361 twips、上 21mm=1191、下留页脚 17.5mm=992 口径；
    补页脚页码 part（现 `docxRenderer.mjs:563-566` TODO 处）。
  - 挖空样式：passage 行发出前做同源 pattern 替换 → 下划线 run + 题号；
    写作题组补边框答题框（单格表格实现即可）。
  - **范围钉死（PA F3）**：文件里有两个 sectPr builder（≈L571 / L755），
    边距/rFonts/页脚两处都要覆盖；「size 21」只扫学生卷面 body，教师
    解析区（同义替换/选项分析 ≈L289-379）不属试卷面，不动。
  - 挖空 verify 同 Chunk B 口径：真 payload 行为级清点。
- 验收：`verify-h5g-docx-renderer` / `verify-exam-export` 绿；LibreOffice
  转 PDF 冒烟确认字体/字号/挖空/写作框（repo 已有 LO 转换链路）。

### Chunk D：I10 句首挖空修复（独立）——**PA F1：暂缓，待 owner 拍板**

> PA 实证：真资产不复现。paper-2026-i（及全部 `papers/*/groups.json`）的
> 语法填空挖空存的都是 `__NN__ (hint)` 双侧下划线形态，句首也能正常渲染；
> 出 bug 的 2-空格 `  NN  ` 形态只在 I10 当年的合成 QA 数据里出现过
> （cut-note 确认已回退）。且真正修复位点在共享的 `segmentPaperText.mjs`
> （完形/七选五/阅读同用），风险面比 plan 原估大。
> **主代理建议：本刀剔除 D**，watch-ledger 继续挂账，触发条件改为
> 「真资产出现 2-空格句首挖空」。

- Bug：`PaperSurface.tsx:63` pattern 要求数字两侧都有定界符；分句把句首
  挖空的前导双空格切给了上一句 → 语法填空句首挖空渲染成裸数字。
  （实录：`docs/paper-surface-watch-ledger.md:158-192`）
- **Forbidden（红线，watch-ledger 明示）**：禁止用「句首仅尾定界符也算」
  的放宽 regex 修——会重开 I10 当年封死的误匹配面。
- 修法取 watch-ledger 首选路径：挖空匹配先于分句执行（或跨句保留前导
  定界符）。DEV 需给出误匹配面不扩大的论证 + 用 paper-2026-i 真数据回归。
- 验收：`verify-i10-blank-rendering` 扩一条句首 case（行为级）；
  paper-2026-i 语法填空 10/10 styled（原 8/10）。

### Chunk E：死码清理（独立）

- 删 `app/src/features/paper-intelligence/paperSurfacePrototype/`（854 行
  tsx + 462 行 css，无路由可达，仅自引用）+ `scripts/verify-paper-surface-prototype.mjs`
  （断言已失实）；同步 `scripts/verify-ci.mjs` / `scripts/README.md` 清单。
- 验收：`pnpm -C app run verify:all` 绿；grep 无残留引用。

## Forbidden（全刀）

- 不碰数据契约 / 导入管线 / 已入库内容（paper-2026-i 破折号归一是**另一把
  小刀**，见标准「执行与迁移」）。
- 不实现整页纵向撑满（标准明示有意简化，统一 18 磅）。
- 网站详情页（非试卷面）不改——保真分级只约束试卷面。
- 不动 nck1-paper-standard.md / exam-paper-format-standards.md 正文
  （标准修改须 owner 拍板）。
- Chunk D 禁用放宽 regex 修法（见上）。

## 验收（全刀）

- 四面数值与标准 v2 §1-§3 对表全过（截图/PDF/DOCX 三件套留档 cut-note）。
- `pnpm -C app run verify:all` + CI 全绿；新 verify 行为级优先。
- 屏幕字号 16→14px 属 owner 已拍板的回归（标准 v2「字号回归 10.5pt 等比」），
  但视觉变化明显，收官时截图给 owner 复核。

## 派工

| Chunk | 执行 | 备注 |
| --- | --- | --- |
| A | Sonnet DEV medium | 机械改 + 契约同步 |
| B | Sonnet DEV medium | pattern 上移注意别改行为 |
| C | Sonnet DEV medium | WordprocessingML 细节多但机械 |
| D | Sonnet DEV **high**（dev-hard） | 分句/定界符交界，易翻车 |
| E | 主代理直做或并入 A | 纯删除 |

CR：fresh Opus high，全刀一次冷读（chunk 合并后），重点 B/C 的 pattern
同源性与 D 的误匹配面论证。
