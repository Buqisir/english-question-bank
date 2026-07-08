# surface-question-policy plan（medium，owner 验收三反馈）

owner 2026-07-08 验收 paper-browse 提出三处，病根两个，与刀⑤导出面
既有策略对齐。**本刀动 PaperSurface 本体**（护栏高危）→ 完整流程
（plan + DEV + fresh Opus CR），改动范围钉死如下。

## 1. PaperSurface 空题干策略（镜像刀⑤ print/docx 同策）

`PaperSurface.tsx` 题列表渲染（≈:653 PaperSurfaceQuestionItem）：
- 空题干（trim 后为空）+ **有选项** → 题号与选项渲染在**同一行**
  （真卷完形形态「41. A. xx B. xx C. xx D. xx」，参照
  print-renderer `.options-inline--numbered` 的做法）；
- 空题干 + **无选项** → **整行不渲染**（语法填空文后无内容，题号
  已在文中挖空上）。
- 策略只以「空题干」为触发：PI 分析面（cloze/I9 等）的题干是数字
  非空（其 adapter 未做数字题干抑制），不触发，交互零影响——DEV
  必须跑 verify-i9 / verify-paper-surface-host-interaction /
  verify-i15 / verify-i0e 证明。
- CSS 进 PaperSurface.css（token 化，行距/字号走现有 --ps-*）。

## 2. 应用文脚手架进答题框

960d0f8d / 2026-i 的应用文 passage.paragraphs 尾部含信件脚手架
（`Dear X,` … 开头句 … `Yours,` 落款名）。修：
`writingPageModel.mjs` 增脚手架抽取——从首个 /^Dear\b.*,?$/ 段起到
末尾为脚手架区，按 /^Yours\b/i 切上下两半，喂给答题框既有的
applicationGiven top/bottom 位；正文 textMap 构建前剔除这些段
（`writingPaperViewAdapter.ts` 或 model 内做，DEV 定位后择近处）。
仅 taskType=application 生效；抽不到（无 Dear 段）则维持现状空框。
框内脚手架排版：上半贴框顶左对齐，下半贴框底右对齐（信件格式），
CSS 在 writingPaperPage.css。

## 3. 语法 rail 假选项退役（施工中发现，追认入契约）

`grammarFillPaperViewAdapter.ts` 为带提示词的空造 `label:'prompt'` 假选项，
在空题干同行策略下渲成「56. prompt. hold」噪音行。提示词已随挖空渲在
文中（`__56__ (hold)`），rail 假选项退役（options 恒 []），语法填空
rail 行整体消失。消费方仅 browse 页 + harness 无解析兜底，两处同愿。

## Forbidden

- `shared/papersurface/**`（tokens/blankPattern 不动）；server/**；
  存储资产；导入管线；PI 分析面行为（上述 verify 证明）。
- PaperSurface 改动仅限题列表策略一处 + 配套 CSS，不碰挖空/textMap/
  交互 reducer。

## 验收

- 浏览器 QA（960d0f8d + 2026-i 双卷）：完形题号选项同行、语法文后
  无空行、应用文 Dear/Yours 在框内且正文不重复；PI 分析面（cloze/
  grammar）行为与改前一致（截图对照）。
- verify-paper-browse 扩断言；PaperSurface 系 verify 全绿
  （module-v1/tokens/host-interaction/i9/i10/i15/i0e/i6）；
  `verify:all` 绿。
- fresh Opus CR，重点：策略触发条件的边界（谁的题干可能为空）+
  脚手架抽取的误伤面（记叙文里出现 "Dear" 的正文？——仅
  application 任务生效已挡）。
