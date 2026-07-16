# design-canon-v2 Plan — Geist 对照三条补法落 DESIGN.md（docs + 1 守门脚本）

## Cut Size

small-plus（docs 立法为主 + 1 个新 verify 守门脚本，零产品代码、零运行时
视觉变化）；touches schema / data contract / product boundary / teaching
interpretation: **no**。CR-lite（主代理冷读）。

## Objective

owner 已圈（2026-07-15）：读 vercel.com/design.md（Geist agent 可读设计
系统）对照我们 DESIGN.md，把三块可偷的收编成条文。出处：owner 提议对照
学习，小川三层评估（第一层验证=我们 repo-routed canon + verify 守门已
领先；第二层四块可偷；第三层不学清单）。

明确不学（评估第三层，记档不入宪）：暗色模式 / 冷灰审美 / P3 广色域 /
10 步色阶重构 / Title Case（英文排印惯例，中文语境无对应物）。

## 施工清单

1. **文案法立法（DESIGN.md 新 §9 Voice & Content）**：动作命名=动词+
   宾语（禁裸「确定/OK」具名化）、错误=发生了什么+下一步、toast 点名
   对象无「成功」无句号、进行态=「动词+中…」、空态指向第一动作+诚实
   空态（宁缺勿假）、阿拉伯数字+中西文空格、不结巴。把卷名去结巴/
   「已移出」/诚实空态三个散装判例收编成文，中文语境改写（Geist 的
   Title Case / please 类英文惯例不搬）。
2. **间距节奏法补数字（DESIGN.md 新 §8 Spacing Rhythm）**：4px 基础
   网格 + 三步节奏（组内 8 / 组间 16 / 区块 24，对齐暖桌通铺 24px
   先例）——**新面推导法**，存量 6/10/14px 半档值不追改（自然更替），
   不设机器门（间距强依赖上下文）。
3. **圆角单一家族纪律（DESIGN.md §5 Named Rule + 新守门脚本）**：
   圆角只取阶梯 {0, 4, 6, 8, 999px, 50%}（50% 限圆形控件；方向性
   shorthand 各分量在族内即合法）；每视图圆角家族一致。机器门落
   `scripts/verify-radius-family.mjs`（进 verify-ci + README）：全量
   app CSS border-radius 值须在族内，现存 32 处族外值（5/3/2/12/10/
   7px，clustered 在 PI 两文件 21 处 + readingAnalysis 4 处等）按
   文件×值 baseline 祖父化 ratchet——新增即红，清完自动收紧。
   注：STATUS 原文「进 impeccable detect」——实核 detect.mjs 是固定
   反模式检测器不吃项目规则且在 repo 外，机器门改落仓内 verify
   （对齐 verify-motion-tokens 先例），理由入档本行。

## Forbidden

- 零产品代码/运行时 CSS 改动（不做圆角/间距存量清理，不引入
  --radius-* token 化——那是另一刀）；
- 不重写 DESIGN.md 既有条款。

## Verification

- `node scripts/verify-radius-family.mjs` 正例绿 + 负例（临时塞一个
  族外值）红；
- `pnpm -C app run verify:all` 全绿（docs 不碰断言）+ main CI。

## 裁决点清单

- [x] DP-1 立项（owner 2026-07-15 圈账本详条；三条补法清单出自当日
  评估，owner 已阅）
- [x] DP-2 主代理 CR-lite 冷读 0MF + verify-radius-family 正例绿/负例
  双红（新文件族外值 & 祖父文件超 baseline 均咬人）+ housekeeping 73 +
  verify:all 82/0/0 真退出码（2026-07-16）
- [ ] DP-3 owner 过目三条新法条文（docs 刀无浏览器 QA；文案法措辞
  owner 有事后否决权）
