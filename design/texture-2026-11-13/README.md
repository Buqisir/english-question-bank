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

## 迁移第 12 条：空状态（2026-11-13，提案 · 单一来源）

照样张 [`empty-states-sample.html`](empty-states-sample.html) 写进代码。本地截图：[`empty-states-in-app.png`](empty-states-in-app.png)（本地测试数据，1280 宽，1 倍图；题库空是拦截题组接口拍的）。

- **共用组件**：`app/src/components/EmptyIllustration.tsx`，五张平涂插图，88 × 88，坐标取自图标。颜色三个角色写进 `tokens.css`：`--eqb-color-ill-deep / -mid / -paper`（目测）。
- **五处「还没东西」**：个人空间（公文包）、生词本（生词本）、听写（横线纸）、题库（P1）、草稿卷（草稿卷）。原来的 24/32px 图标换成插图；容器、按钮样式不动。
- **底色先不换（Owner 2026-11-13）**：个人空间、生词本、听写还是白卡片。白卡片上白纸看不见，所以这三处的「纸」降一档用页面底色 `--desk-page`，仍是平涂，不加描边（新定，提案 · 单一来源）。题库和草稿卷本来在桌色上，用白纸。
- **听写「词组」分成两种**：一个都没有 → 插图 + 「还没有词组。在看卷时把生词收进生词本，就能在这里组成词组。」；搜了没结果 → 一行灰字 + 行内「清除搜索和日期」。
- **听写「听写」**：文案改成「还没有听写。先到「词组」里选好单词。」，加「去选词组」按钮。
- **草稿卷**：「请先添加题组」改成样张那句，加「去找题」（回找题页）。导出时的报错「请先添加题组」在服务端，没动。
- **草稿卷的笔（Owner 2026-11-13 指出）**：起初照搬了线稿里纸在笔周围的断缝，白纸上挖出一个斜口，露出底色，看着像笔的浅影子。平涂时不照搬这道缝，纸画整张，笔直接盖在上面；样张同步改了。
- **加载时不闪**：听写两处等数据读完才出空状态，免得插图在加载时闪一下。
- **故意没动的**：听写「历史」（还没有记录）和「复习」（现在没有待复习，属于暂时没有）两处，样张只定了 5 处，没放插图；现在仍是图标 + 标题，待 Owner 定。搜了没结果、筛得太严那几处本来就是一行灰字。
- **和 DESIGN.md 不一致**：DESIGN.md §5 Empty states 写的是「桌色底加平涂插图」，Owner 说底色先不换。等 Owner 定是改规则还是改底色。

## 迁移第 10 条和提示条图标（2026-11-13）

改前改后：[`toggle-notice-before-after.png`](toggle-notice-before-after.png)（上：改前 1440 宽 1 倍图放大；下：改后 2 倍图）。

- **第 10 条「思考模式」开关**：盘点时记成「露在屏幕左边外」，再量一次发现没有被切：开关关着时轨道是桌色 + 最淡的线，和页面几乎一样，只看得见白色圆钮，像被切掉一半。轨道改用 `--eqb-color-border-strong` 平涂，边线去掉（目测）。开着的样子不变。
- **提示条图标**：`.concierge-notice` 前面加 16px `InfoCircle`，和字同色，顶对齐第一行（DESIGN.md §5 Notices）。

## 还没做的

- 要动结构的：提议和决定（DESIGN.md §5 Proposal → Decision）。
- 首页「搜索暂时连不上，你输入的内容还在。」还是红字。DESIGN.md §5 Notices 说报错用同样写法、只有会丢东西才上危险色；这句内容没丢，照规则该改成弱墨 + 图标。不在迁移清单里，等 Owner 定。
- 数值都是目测，待在真实设备上测量。
- 盲测（至少 5 位老师）还没做；做之前，「老师一眼分得出」这类说法只算提案 · 单一来源。
- 阅读分析、卷面智能、词汇几页本地数据跑不出来，读做分类和截图只看了源码，等线上入口补。
