# trust-cracks — DP-3 owner 前台复核 + 打回补刀（2026-07-14）

## owner 发现（生产 8696eda，搜"量子对撞机"截图）

**打回**：诚实空态没修死——8 条硬凑降成 3 条（兜底追加确实退役），但
DeepSeek 无视重排 prompt「都不相关时返回空 rankings」的指令，仍返回
"最接近的" 3 条，reason 自招"非量子""不相关""非科技"。闹剧变小剧场，
但还在演。

## 根因与补刀（460ed4c + e2e 修复 9517085）

根因：把诚实通道做成"靠 LLM 自觉不返回"——**LLM 的凑数倾向压过省略
指令**（判例入 case-law，普适级已回流母版）。

补刀（`server/search/semanticSearchService.mjs`）：
- 重排契约加**显式 `relevant` 布尔**（规则 4 + JSON 示例），"主题接近但
  内容不相关"明文= false；
- `normalizeSemanticSearchRankings` 携带 relevant（缺省 true，旧形状与
  既有 stub 零变化）；
- 组装环 `relevant === false` **无条件丢弃**（先于分数地板）；
- `verify-h5h` +3 行为用例（混合榜单只留 true / 全 false 塌成诚实空 /
  prompt 契约在位），亲跑 87/0；verify:all PASS 78/0。

## 事故自省（判例已入 case-law 2026-07-14）

1. **CI watch 管道吞码**：merge run 实为 failure（e2e 断言未跟刀：详情
   button→link），`gh run watch --exit-status | tail` 吞掉退出码被报绿
   并部署。产品行为本身正确（e2e 是旧断言），未伤生产。修正：金路径
   e2e 断言跟刀（role link），亲跑 18/18；此后盯 CI 一律真码 +
   conclusion 双证。
2. **e2e 不在 verify:all 内**：金路径是 CI 独立 job，本地全绿 ≠ CI
   全绿——改用户可见交互时收口前 grep 金路径脚本。

## 生产机验双证（部署 9517085 后，qa-owner API 回放）

| 查询 | 结果 |
| --- | --- |
| "找一篇讲量子对撞机的阅读"（库里没有） | **matches: 0**，文案"目前没有找到稳定匹配，可以换一个主题、T卡或年份再试"，零自招条目 → 前端落诚实空态 + feed |
| "找一篇讲猫的行为的阅读"（库里有） | **matches: 1**，恰好 2024 全国甲卷 Reading B（猫行为说明文），理由"直接介绍猫的行为：喵叫、嗅觉、叼物"——relevant 闸零误杀 |

## owner 前台余项 → 已确认（2026-07-14）

owner 前台实点："中键和 toast 撤销没问题"。DP-3 全项通过，
trust-cracks 收口闭环（诚实空态经打回补刀后生产双证 + 中键 + toast）。
