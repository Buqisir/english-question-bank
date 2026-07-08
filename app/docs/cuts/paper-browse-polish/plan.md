# paper-browse-polish plan（small-medium，owner 实测反馈修复）

owner 2026-07-08 实测 paper-960d0f8d 整卷页报三处，摸底钉出四病根
（file:line 见下）。**PaperSurface 本体继续零修改**。

1. **题号重复「56. 56」**：cloze/grammar 资产题干=纯数字，adapter 透传。
   修：`clozePaperViewAdapter.ts:56` / `grammarFillPaperViewAdapter.ts:57`
   题干为纯数字且==questionNo 时置空（防御式：trim 后 /^\d+$/）。
2. **旧格式挖空不染色**：960d0f8d 语法填空存 `NN._____(hint)`（I15 形态），
   browse 页 rail 模式只走 paperBlankPattern（`__NN__`）。修：展示层归一——
   `buildGrammarFillPaperView`（`grammarFillPaperViewAdapter.ts:100-107`
   喂 textMap 前）把 `NN._____(hint)` 转成 `__NN__ (hint)` 形态字符串
   （用 grammarFillBlankPattern 匹配替换；只改渲染输入，不碰存储）。
   cloze 同查同修（960d0f8d cloze 形态 DEV 实测确认）。
3. **写作 block 双渲（宽度/重复文本/answerBox 占位三症一病）**：
   `PaperBrowsePage.tsx:414-433` 顶层循环重复渲染已被
   `buildWritingPageModel`（`writingPageModel.mjs:32-49`）消费的
   instruction/answerBox block。修：页面构建渲染列表时预计算各写作组
   pageModel 消费的 block 下标区间，顶层循环跳过；写作卡容器
   `.pi-writing-page` 锁 `--ps-page-width`（794px）居中，与其他卡纸面
   同宽（`writingPaperPage.css`，只加宽度约束不动其余）。
4. **段首语双前缀守卫**：`writingPageModel.mjs` starter 拼接处，starter
   已带 `/^Paragraph \d+:/` 前缀则不再加（960d0f8d 存量数据带前缀）。
   存量 block 27 双前缀文本随修 3 不再显示；资产数据本身不动
   （数据购清另记账）。

Forbidden：`app/src/shared-ui/papersurface/**`、`shared/papersurface/**`、
server/**、存储资产、导入管线。

验收：`verify-paper-browse` 扩断言（数字题干抑制/旧格式挖空归一/写作
block 不双渲，真 960d0f8d + 2026-i 双资产锚定）；浏览器 QA 两套卷对照
截图；`verify:all` 绿。CR-lite（主代理）+ owner 复验。
