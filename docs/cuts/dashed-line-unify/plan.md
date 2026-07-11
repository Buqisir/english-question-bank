# dashed-line-unify — 卷面虚线语义统一（owner 报障 2026-07-10）

- Cut size: **small-medium**（三件小事，但 ① 触 PaperSurface 契约面 →
  committed plan + 契约解锁 + CR-lite 从严）。touches schema/data: no。
- Owner 报障原话：七选五选项池被两条虚线包住（静息多余）、选中态虚线
  凭空出现；其他题型是"原本有线选中覆盖"。诊断（主代理 DOM 实测）：
  上线= PaperSurface v1（972dc27）遗留的 `.ps-section` 节尾虚线；
  下线= `page_break` 分页标记线；"凭空"=选中罩下缘在节末题组处无
  静息线对应。

## 三件事

1. **退役 `.ps-section` 节尾虚线（全局，屏幕面）**：删
   `border-bottom: 1px dashed var(--ps-rule)` 及其 `:last-child` 豁免
   （PaperSurface.css:114-124 一带），margin/padding 节奏保留（26px/
   18px 空白仍是节间距，只去线）。影响三挂载点：整卷页/讲评栏/解析页
   ——真题卷面无此线，去线=更像纸。print/DOCX 无此规则，零影响。
2. **整卷页退役分页标记线**：`.paper-browse-pagebreak` 不再画虚线
   （屏幕连续流无分页语义）；保留零高度锚元素避免动 TSX 结构（或视
   实现删渲染分支，取改动小者）。导出面分页纪律零触碰。
3. **节末题组补静息底界剪刀线（不变量落地）**：PaperBrowsePage 渲染
   时给「下一块不是 question_group 的题组」（节末/卷末）追加一条
   静息底界线（同 `.paper-browse-scissor-line` 样式，定位
   bottom: calc(--pb-block-gap / -2)），hover 时随既有规则同样隐去
   （选中罩下缘接管同位）。不变量：**静息虚线位置集合 == 选中虚线
   位置集合；虚线只有剪刀线一种身份**。

## Forbidden

- PaperSurface.css 只删上述一条规则族，不动其他；PaperSurface.tsx
  零触碰；adapter/domain/server/导出面零触碰。
- 剪刀线系统其余拍板参数（0.18 墨、24px 缩进、±gap/2 定位、罩色）不动。

## Verify / QA

- 既有 verify:all 全绿（module-v1 等断言若钉住被删规则则同刀更新）。
- 截图 QA：① 七选五静息=只剩顶部剪刀线一条+底界线一条，选项池无
  夹线；② 七选五/完形 hover=罩缘与静息线同位（对照截图）；③ 讲评栏
  与解析页卷面去节尾线后目检不破排版；④ 阅读组间共享线行为不变。
- 主代理直修（small 快路径 + CR-lite 冷读自查记录在 commit message），
  owner QA 终审。

## QA round 2 追记（2026-07-10，owner 拍板方案A）

owner QA 抓到 35cd609「写作例外」只做了半截：静息线撤了，但写作卡的
选中罩仍整卡显影——罩上缘在「第X部分 写作」标题上方，既与「剪走单元
从提示语起」的语义矛盾，又是一条静息无对应的选中缘（破本刀不变量）。
原型 `prototype-writing-cut.html` 三案对比（现状 / A 从提示语切 /
B 从节标题切），owner 拍板 **方案A**：

- 写作卡选中罩上缘下移到**提示起始线**（`.pi-writing-section` 下一
  兄弟的顶，即 pi-writing 既有内线），标题留素纸；标题区高度不定，
  由 PaperBrowsePage 量偏移写进 `--pb-writing-cut-top`（ResizeObserver
  跟重排），`::after` 用它画上缘；内线 hover 隐去（同位双线规避，
  one-sheet「整卡显影 + 内线不隐去」取舍作废）。
- 35cd609 写作例外撤销：切口明确下移后，标题上方的线不再有歧义
  （就是上一组底界），语法填空等前组的静息底线回归。
- 写作组自身同为剪走单元，底界一并记账（应用文底=第二节标题前、
  续写底=卷末；下一块按 findWritingBlockRange 的 range 之后算）。
  不变量全站成立。

QA：verify-paper-browse 184 绿 + tsc 干净 + 一次性 Playwright 实跑
13/13（960d0f8d 真卷：量高变量与实测同位 ±1px、罩缘在节标题下方、
hover 内线隐去、前组/写作组底线齐），截图 `qa-writing-cut-hover.png`。
