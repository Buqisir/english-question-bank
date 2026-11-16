# 色板外颜色收回（BRAND 第 59、69、72 条）· 2026-11-16

这次把网站里色板外的颜色改回色板或界面灰阶。用到的规则是 BRAND 第 72 条：选中、悬停、焦点环、链接和标签都用灰和墨，不用薄荷。

## 改了什么

| 位置 | 之前 | 之后 |
|---|---|---|
| 听写设置选中项文字 `.vocabulary-dictation-settings .is-selected` | #1e4a3a 深绿 | `--eqb-color-text` 墨 |
| 听词当前词 `.is-current` 和里面的 span、small | #1e4a3a 深绿 | `--eqb-color-text` 墨 |
| 相似篇章卡悬停描边 `.similar-rcard[data-fluid-hover-active]` | #a5cdbd 浅绿 | `--eqb-color-border-strong` 灰 |
| 找题追问条 `.concierge-clarification` | 薄荷半透明底和边 | `--desk-hover` 底、`--desk-border` 边（和桌面悬停一套） |
| 登录页左侧雾团 `.login-page::before` | #BFEFDB（色板外） | #C4ECDD 薄荷雾（雾色，只用在雾海场景） |

另外删掉了四组死样式，它们都写着色板外的薄荷半透明色，但没有组件在用（`app/src` 的 ts/tsx 里搜不到）：

- `.synonym-difficulty-*`（App.css）
- `.question-ai-*`（App.css）
- `.calibration-preview-*`（App.css）
- `.pi-option-block*`（paperIntelligence.css）

`scripts/verify-classic-retire-2.mjs` 只要求其中两个类名不出现在 TSX 里，删样式和它一致。

## 截图

- 登录页左下雾团：`before-login-left.png` → `after-login-left.png`。两张差别很小，雾团从偏蓝绿变成薄荷雾（目测）。
  算出来的颜色：之前 rgb(191, 239, 219)，之后 rgb(196, 236, 221)。
- 听写设置选中项：**没拍到**。演示环境没有听写数据，页面显示「没有找到这份听写练习」。
- 相似篇章卡悬停：**没拍到**。演示环境没有检索标注数据，显示「该篇暂无检索标注数据」。
- 听词当前词：**没拍到**，没有数据。
- 追问条：没拍到真实页面。改在登录后的首页里插一个带同类名的假元素，读出的颜色是：
  底 rgb(230, 237, 240)，边 rgb(220, 230, 235)，字 rgb(27, 43, 51)。

## 没改、要 Owner 定的

- 整卷浏览当前题的角标 `var(--eqb-color-primary)` 和题号 `var(--eqb-color-primary-text)`。
  - 来源：Owner 2026-08-04 的批注语法，`scripts/verify-paper-browse.mjs` 第 83 条断言要求正好用这两个变量。
  - 和第 72 条（选中态不用薄荷）冲突，要 Owner 选一边。
- `PaperSurface.css` 的 `--ps-active-rail #2C6E56`：PaperSurface 是不能动的文件。
- 打印样式里的 #1e4a3a：打印和 PDF 样式不能动。
  - vocabularyReviewPage.css 的 @media print 段，5 处；
  - vocabularyHandwriting.css，1 处。
- 讲义高亮的分类色、句子分析的绿色：这些是功能色，不算这次的范围。
