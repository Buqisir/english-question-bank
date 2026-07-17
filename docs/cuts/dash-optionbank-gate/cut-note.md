# dash-optionbank-gate cut note（small，主代理直做 + CR-lite）

2026-07-16。出处：刀⑤ render-fidelity 新账第 1、4 条（owner 圈定
「①validator 守门 + ④破折号归一捆一把数据小刀」，执行顺序 owner
2026-07-16「听你的建议」拍板）。与 writing-box-starters 刀并行（文件面
零交集：本刀 paper-assets/validator/verify-c7，彼刀 server 渲染器）。

## ④ paper-2026-i 破折号归一（标准 v2 §7 + Import Normalization）

全量判例扫描 38 处（含 paper-asset.json 内嵌 analysis 副本与
analyses/*.json）：

- **22 处英文语境 → 「 – 」**：reading-a 赛程表 8 处「 — 」+
  reading-a/d 各 1 处 `--`（`together--spaces` / `inspired--than`）+
  q-021 解析 quote/targetText 12 处（正文与引用同步换，
  `passageBody.includes(quote)` 契约实测 0 断链）。
- **16 处中文讲评语境保留全角「—」**（「让步—转折」「提出研究—设计—
  数据—解释—结论」「总—分」等），合标准 §7 中文条款。

判定规律（可复用）：英文 em-dash 全部带两侧空格「 — 」，中文全部
不带空格——`' — '` 原文替换 + `[A-Za-z]--[A-Za-z]` 两处点名替换即
100% 精准，无需逐处人裁。

落点：asset 2 文件（paper-asset.json / reading-choice-analysis-v1.json）
+ 本地 DB passages 2 行（reading-a/d）；生产同步 SQL
`data/sql/normalize-2026-i-dashes.sql`（幂等，随下次部署执行）。

## ① 七选五 optionBank validator 守门

- `server/paper-import/validator.mjs` 新增
  `validateSevenChoicesOptionBank`：sevenChoices 组 optionBank 必须
  恰好 A-G 七句非空文本，缺/空/多 → blocking
  `sevenChoices.optionBankIncomplete`。
- `scripts/verify-c7-paper-import-contracts.mjs` 新增 4 断言
  （缺一句 blocking / 空文本 blocking，负例验牙），43/43 绿。
- nck1 标准 §6 增补条文**待 owner 拍板**（§7 变更纪律），拍板后另行
  commit。

## Verify

verify-c7 43/43 绿；verify:all 83 PASS / 1 FAIL——唯一 FAIL 为
`verify-r2-trap-audit` 的「versions/ 不存在」断言踩本机 gitignored
本地导入归档（07-08 遗留，主树本地跑必红、CI 恒绿），**与本刀无关**，
挂账见下。

## 挂账（新账）

1. **全库破折号归一批修候选**：扫描发现另 15 套卷共 ~120 处
   「 — 」/1 处 `--`（2021-i×4、2022-ii×7、2023-i×2、2023-ii×13、
   2024-i×23、2024-ii×6、2024-jia×13、2025-i×20、2025-ii×2、
   zj-2022-jan×2、zj-2022-jun×1、zj-2023-jan `--`×1、zj-2024-jan×8、
   zj-2025-jan×18、zj-2026-jan×9）。判定规律同上可直接复用，但动
   passage 文本会牵 R2 机审 quote 基线与 rulings 白名单，须单独立刀
   带 R2 基线复核，不随本刀捎带。
2. **verify-r2-trap-audit versions/ 断言环境脆**：本机存在 gitignored
   `paper-2026-i/versions/` 本地归档 → 主树本地 verify:all 恒 1 FAIL。
   候选修法：断言改「本刀 diff 未新增 versions/ 进 git」或跳过
   gitignored 路径。归 r2 刀挂账。
