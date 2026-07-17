# writing-box-starters Plan — 读后续写答题框内印段首语

## Cut Size

small-medium（走 cut-pipeline 流水线）。
Touches schema, data contract, product boundary, or teaching
interpretation: **数据契约仅加性**（detail 新增只读字段暴露 asset 既有
数据，零 schema/DB 改动）。出处：刀⑤ render-fidelity cut-note 新账第
2 条（owner 当时拍板"空框先行"，2026-07-16 owner 圈此刀跟进）。

## Objective

《试卷排版标准》§8：**读后续写的两个段首语印在框内（各段起笔位置），
学生续写于其后**。现状：数据在 asset（`content.writingTasks.<id>.
continuationStarters`，如 paper-2026-i 两句俱在），屏幕写作页已显示
（`writingPageModel.mjs:92`），但 print（PDF/整卷+草稿卷共用
`buildPrintHtml`）与 DOCX（整卷+草稿卷共用 `docxRenderer`）画的是
**空框**——数据没进渲染器的 detail。

## Locked Decisions（PM 已定，不重开）

1. **暴露点**：`server/api.mjs` `applyPaperAssetToQuestionGroupDetail`
   ——group 有 `writingTaskId` 且 asset `content.writingTasks` 命中时，
   detail 附加 `writingTask: { taskType, continuationStarters }`（只读、
   加性；无命中不附加，消费方全部可选链）。
2. **print 形态**（`renderWritingAnswerBox`）：续写框内两段起笔位置
   各印一句段首语——第一句贴框顶内衬，第二句在框高 50% 处；正文字体
   （Times 栈、10.5pt 对应 token），**句子原文照印，不加
   "Paragraph 1:" 前缀**（真卷形态）。框尺寸 145×57mm 不变，框不跨页
   规则不变。应用文框维持空框。
3. **DOCX 形态**（`docxRenderer` 写作框表格）：续写框由单格改**两行
   表格**（各 ≈28.5mm，合计维持 §8 总高），每行首段印一句段首语，
   字体/字号与正文 run 同标（rFonts Times / size 21）；应用文维持
   单格空框。行高用 `w:trHeight` 精确值，DEV 定 twips。
4. **学生版/教师版都印**：段首语是题面不是答案，双版本一致。
5. **兜底**：无 starters（缺数据/空数组）→ 维持现状空框，不抛错。
6. 草稿卷两出口（PDF 分页引擎 / draft DOCX）经共用渲染器自然获得，
   不单独写代码；但 verify 要证到。

## Scope（可改文件）

- `server/api.mjs`（仅 detail 组装函数加字段）
- `server/print-renderer.mjs`（renderWritingAnswerBox + 所需 CSS）
- `server/exports/docxRenderer.mjs`（写作框表格）
- `scripts/verify-print-renderer.mjs`、`scripts/verify-h5g-docx-renderer.mjs`
  （或 `verify-draft-paper-docx.mjs`，按断言归属选最贴的家）
- `docs/cuts/writing-box-starters/`（qa 证据）

## Forbidden

- 屏幕面：`PaperSurface.tsx` / 写作页 / 任何 `app/src`（屏幕已正确）
- schema / DB / migration；导入管线；`app/public/paper-assets/**` 数据
- `shared/papersurface/tokens.mjs`（够用，不加新 token）
- 排版标准文档本身

## Verification（pipeline verifyCmds 照抄）

- `node scripts/verify-print-renderer.mjs`（新增断言：①续写框含两句
  starter 文本且在 `.writing-answer-box` 内②应用文框仍空③无 starters
  兜底空框——负例先红后绿验牙）
- `node scripts/verify-h5g-docx-renderer.mjs`（新增断言：document.xml
  续写框表格含两句 starter、学生/教师双版本都有、应用文框无）
- `node scripts/verify-draft-paper-docx.mjs`
- `cd app && npx tsc --noEmit`（若 server 纯 .mjs 无类型面可跳）
- `pnpm -C app run verify:all`

## DP 裁决点清单

- [x] DP-1 立项（owner 2026-07-16「听你的建议」圈定本刀先行）
- [x] DP-2 流水线 verify 全绿（真实退出码）+ DEV 用 paper-2026-i 真
  asset 出 PDF/DOCX 样张入档 `docs/cuts/writing-box-starters/qa/`
- [ ] DP-3 owner 实卷目检（样张已入档 qa/，等 owner）——（渲染刀铁律，刀⑤教训）：PDF+DOCX 双版本看
  段首语位置/字体/不撞框/第二句 50% 处起笔
