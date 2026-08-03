# detail-slim plan（small-medium：详情页瘦身成"决策速览卡"）

owner 2026-07-08 定位 + 确认（"答案对比那套我肯定不会再用了"）。
详情页生态位 = 无卷面语境的落地页，本职 = 三十秒判断"这题用不用"。
生产侧脚手架系 C2 时代遗留，ADR-0015 已把生产切到后台 agent，管线
verify 全面替代页面人工校对——本刀执行既有边界，非新决策。

## 删（QuestionGroupDetailView.tsx 内，连带 CSS/死代码）

- 答案对比框（showCompareBox / 待对比 / 状态未保存 一族）
- 答案对比汇总统计块
- AI 验证列表（verify-list 整节）
- 主题标签置信度百分比（owner-only 那个 %）
- 上述对应的 owner-only gate 代码若因此失去唯一用途，一并清
  （isOwnerView 本身保留——编辑/删除还用）。

## 留

- 题面/选项、答案行 + 分层解析（AnalysisDisclosure，刀A 成果不动）、
  主题标签（不带置信度）、加入草稿卷、看整卷、编辑/删除（owner）。

## 补（出口做全）

- 「看解析」直达口：该组有解析面可进时（参照搜索卡 阅读解析/完形解析
  等按钮的可用性判断逻辑），详情页 action bar 补同款直达按钮；无则不出。
  DEV 先查是否已存在，已存在则跳过此项并报告。

## Forbidden

- server/**（payload 不动，只是不渲染）；PaperSurface 系；搜索结果页；
  草稿卷；解析数据结构。
- 不动 AnalysisDisclosure 与分层结构。

## 验证

- `verify-classic-retire-2.mjs` 同步改削：删除对 compareBox/verify-list
  的存在性断言，改为「不存在」守卫（防回潮）；零 useState 断言保持。
- `verify-analysis-layering.mjs` 保持全绿（分层结构未动的证明）。
- 浏览器 QA：owner + member 双视角截图（qa-login.mjs 流程），确认删净、
  留全、出口可用。
- fresh Opus CR：重点删除的连带面（helpers/CSS/props 死码清净度）与
  member/owner gate 无意外变化。
