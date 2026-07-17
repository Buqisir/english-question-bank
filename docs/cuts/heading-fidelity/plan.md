# heading-fidelity Plan — 部/节标题字号归一（刀⑤ SW-B 销账）

## Cut Size

small-medium（走 cut-pipeline 流水线）。
Touches schema, data contract, product boundary, or teaching
interpretation: no（纯渲染器排版归标，数据零改动）。出处：刀⑤
render-fidelity CR SW-B + 标准 v2 §2/§4；owner 圈定 2026-07-17。

## Objective

《试卷排版标准》§2/§4：**层级靠字重与缩进区分，一律不放大字号**——
部标题=中黑加粗左顶格 10.5pt、节标题=书宋常规缩进 2 字符 10.5pt、
篇章标题=Times Bold 居中 10.5pt、卷名=20pt（唯一放大项）。现状
（SW-B 实录）：print `.section-header` 12pt / h1 卷名 18pt；DOCX
section_header run size 24（12pt，两处 builder），篇章标题 size 22
（11pt）；且**部/节不分——节标题被错发黑体加粗**。

## Locked Decisions（PM 已定，不重开）

1. **部/节判定单源**：新建 `shared/papersurface/headingKind.mjs`，
   `headingKind(title)` 按文本判：`/^第[一二三四五六七八九十\d]+部分/`
   → `'part'`；`/^第[一二三四五六七八九十\d]+节/` → `'section'`；
   其余 → `'part'`（保守回落，现有合成标题全为「第X部分…」形态）。
   print/DOCX 双面共用此单源（blankPattern 先例）。
2. **print**：`.section-header` 拆两态——part：黑体栈 bold 10.5pt
   顶格；section：宋体栈 regular 10.5pt `padding-left: 21pt`（2 字符）。
   h1 卷名 → 20pt（标准唯一放大项），字体栈维持 heading 栈。
3. **DOCX**：section_header part → Hei bold `size: 21`；section →
   Song regular `size: 21` + `w:ind w:left="420"`；篇章标题 size 22
   → 21（Times bold 居中维持）；卷名如有 run 按 40（20pt）。两处
   builder（学生/教师版）同步。
4. **草稿卷大题头明确不动**：`.group-header`（「N、题型」11pt 练习单
   气质）及其 DOCX 对应 size 22 系 owner 2026-07-09 拍板 B 形态，
   不属于本刀（cr.md 注释已说明其与 .section-header 的字号区分逻辑
   会因本刀变化——注释同步更新，样式不动）。
5. **分页保护不变**：标题不落页尾（keepNext / break 规则维持）。
6. 屏幕面不动（asset partHeading/sectionHeading 屏幕自有消费链，
   不在 SW-B 账上）。

## Scope（可改文件）

- `shared/papersurface/headingKind.mjs`（新建）
- `server/print-renderer.mjs`（heading CSS + 渲染分支）
- `server/exports/docxRenderer.mjs`（两处 builder 的 heading run）
- `scripts/verify-print-renderer.mjs`、`scripts/verify-h5g-docx-renderer.mjs`
  （字号/字体/缩进锚断言，负例先红后绿）
- `docs/cuts/heading-fidelity/`（qa 证据）

## Forbidden

- `app/src/**`（屏幕面）、asset 数据、DB、schema、导入管线
- `.group-header` 草稿卷大题头样式（Locked 4）
- 写作框/挖空/页脚等刀⑤已归标面

## Verification（pipeline verifyCmds 照抄）

- `node scripts/verify-print-renderer.mjs`（新增断言：①part 标题
  10.5pt 黑体顶格②section 标题宋体常规带缩进③h1 20pt④无 12pt
  残留——负例验牙）
- `node scripts/verify-h5g-docx-renderer.mjs`（新增断言：part run
  sz 21 Hei bold / section run sz 21 Song 带 ind / 篇章标题 sz 21，
  学生教师双版本）
- `node scripts/verify-draft-paper-docx.mjs`（大题头未被误伤）
- `pnpm -C app run verify:all`

## DP 裁决点清单

- [x] DP-1 立项（owner 2026-07-17 圈定「③部标题字号归一」）
- [x] DP-2 流水线 verify 全绿（真实退出码）+ DEV 出 PDF/DOCX 样张
  （含 部+节+篇章标题 同框页）入档 `docs/cuts/heading-fidelity/qa/`
  （DEV 2026-07-17：verify-print-renderer 92/92、verify-h5g-docx-renderer
  148/148、verify-draft-paper-docx 16/16、`pnpm -C app run verify:all`
  83 pass/1 skip(off-repo fixture)/0 fail；样张见 qa/qa-notes.md）
- [ ] DP-3 owner 实卷目检（渲染刀铁律）：部/节字重缩进层级对不对眼、
  10.5pt 后标题会不会显得弱、卷名 20pt 观感
