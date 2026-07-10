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
