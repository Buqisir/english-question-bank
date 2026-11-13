# 质感规范 · 2026-11-13

把品牌性格翻成全站的材料、高度和状态规则。规则本身写在 DESIGN.md，品牌依据写在 BRAND.md §5.5；这里放链接和迁移清单。

- **规范全文（草案）**：<https://claude.ai/artifact/EXyyjkRQx4pa5RBkLSpSXU> 。材料表、读和做、现状盘点、迁移清单、验证都在里面。
- **可点样张**：<https://claude.ai/artifact/MVjsACxgr8y1DRf1ddrmux> 。有样张、现状对照、盲测三种模式，可以切黑白、投影仪、关掉动效。
- **6px 圆角迁移清单**：[`radius-6px-migration.md`](radius-6px-migration.md)。

## 已经写进规则的（Owner 2026-11-13）

| 内容 | 写在哪 |
| --- | --- |
| 圆角去掉 6px，补三条细则 | DESIGN.md §5 Single-Radius-Family Rule；`scripts/verify-radius-family.mjs` |
| 四档高度和一种影子墨 | DESIGN.md §4；变量在 `app/src/shared-ui/tokens.css` |
| 提议和决定的具体做法 | DESIGN.md §5 Proposal → Decision |
| 提示条不用薄荷底 | DESIGN.md §5 Notices |
| 空状态平涂，不用纸纹 | DESIGN.md §5 Empty states；BRAND.md 第 86 条 |
| 讲解面板吸顶渐隐改用面板白 | DESIGN.md §2 Paper |

## 迁移第一批（2026-11-13，只改数值，不动结构）

对应规范全文「迁移清单」第 1–9、11、13 条（第 8、9 条原排在第二批，也只是改值，一起做了）。
改前改后对照：[`batch1-before-after.png`](batch1-before-after.png)（本地测试数据，1440 宽，2 倍图；两边同一份数据、同一个时刻，改前用 `git stash` 切回去拍）。

- **影子**：`tokens.css` 加了 `--elev-1/2/3`，删掉 `--eqb-shadow-floating`。界面上 57 处影子换成四档或 `none`；纸、选中的板、首页搜索用 e1，草稿丸、吸顶面板、气泡用 e2，菜单、弹窗、toast、抽屉用 e3。聚焦光圈和选中描边只换了影子墨，形状不变。
- **边线**：原来有边线的浮件换成 e1–e3 后，边线改 `transparent`，墨圈当唯一的边（26 条规则）。草稿丸没东西、去掉影子时，边线换回 `--desk-border`。
- **圆角**：79 处 6px 照 [`radius-6px-migration.md`](radius-6px-migration.md) 改成 4px 或 8px（77 处加 3 个 `--fh-radius` 变量，去掉打印那条）。
- **暖灰**：`#1E1E1C`、`#EDEDEA`、`rgba(30,30,28,…)`、`rgba(106,106,100,…)`、`#6A6A64` 换成桌面色阶（`--desk-ink`、`--desk-hover`、影子墨、`--desk-muted`）。骨架屏和行悬停是 `#EDEDEA`，一起换了。
- **玻璃**：`.group-card` 去掉 `backdrop-filter`，底本来就是不透明白。
- **提示条**：`.concierge-notice` 去掉薄荷底和边，和旁边的说明文字同样是一行 `--desk-muted`。
- **讲解页渐隐**：`.pi-seven-option-jump` 从 `#f7f1e6` 渐隐改成面板白渐隐。
- **极弱墨**：首页提交键空闲态、行尾箭头、行尾加入键从 `--eqb-color-text-faint` 改 `--desk-muted`（静止态控件至少用弱墨，DESIGN.md §5 同重法）。

故意没动的：

- 卷面：Sheet 纸影（`paperBrowsePage.css`、`vocabularyNotebook.css`、`QuestionGroupDetailView.css`、`writingPaperPage.css`、`.draft-a4-sheet`）和打印样式。`.draft-a4-sheet` 的 `rgba(30,30,28,…)` 由 `verify-draft-workbench-visual-unify` 锁着。
- 登录页两处影子只换了影子墨，形状不变（登录页是品牌时刻，迁移清单第 13 行）。
- `var(--x, #暖色)` 里的兜底值没换：变量都有定义，兜底不会生效。

## 还没做的

- 迁移清单第 10 条：「思考模式」开关在 1440 宽度下被切掉一半。这是布局问题，单独修。
- 迁移清单第 12 条：空状态统一成「桌色底 + 平涂插图」；插图这次不画。
- 要动结构的：提示条前的 16px 图标、提议和决定（DESIGN.md §5 Proposal → Decision）。
- 数值都是目测，待在真实设备上测量。
- 盲测（至少 5 位老师）还没做；做之前，「老师一眼分得出」这类说法只算提案 · 单一来源。
- 阅读分析、卷面智能、词汇几页本地数据跑不出来，读做分类和截图只看了源码，等线上入口补。
