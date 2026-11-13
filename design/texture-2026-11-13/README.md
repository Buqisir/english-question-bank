# 质感规范 · 2026-11-13

把品牌性格翻成全站的材料、高度和状态规则。规则本身写在 DESIGN.md，品牌依据写在 BRAND.md §5.5；这里放链接和迁移清单。

- **规范全文（草案）**：<https://claude.ai/artifact/EXyyjkRQx4pa5RBkLSpSXU> 。材料表、读和做、现状盘点、迁移清单、验证都在里面。
- **可点样张**：<https://claude.ai/artifact/MVjsACxgr8y1DRf1ddrmux> 。有样张、现状对照、盲测三种模式，可以切黑白、投影仪、关掉动效。
- **6px 圆角迁移清单**：[`radius-6px-migration.md`](radius-6px-migration.md)。

## 已经写进规则的（Owner 2026-11-13）

| 内容 | 写在哪 |
| --- | --- |
| 圆角去掉 6px，补三条细则 | DESIGN.md §5 Single-Radius-Family Rule；`scripts/verify-radius-family.mjs` |
| 四档高度和一种影子墨 | DESIGN.md §4；新值记在 `docs/design-gaps.md` |
| 提议和决定的具体做法 | DESIGN.md §5 Proposal → Decision |
| 提示条不用薄荷底 | DESIGN.md §5 Notices |
| 空状态平涂，不用纸纹 | DESIGN.md §5 Empty states；BRAND.md 第 86 条 |
| 讲解面板吸顶渐隐改用面板白 | DESIGN.md §2 Paper |

## 还没做的

- `app/` 的代码一行没改。迁移按规范全文「迁移清单」的三批走，另开任务。
- 数值都是目测，待在真实设备上测量。
- 盲测（至少 5 位老师）还没做；做之前，「老师一眼分得出」这类说法只算提案 · 单一来源。
- 阅读分析、卷面智能、词汇几页本地数据跑不出来，读做分类和截图只看了源码，等线上入口补。
