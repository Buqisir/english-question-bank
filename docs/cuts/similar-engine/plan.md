# similar-engine — 相似题引擎（E1，主打功能 program 第一刀）

- Cut line: medium; touches schema / data contract: **additive only**（新增
  只读 API endpoint，无 DB 变更）; PA-lite 理由：确定性只读检索层，可逆，
  配方权重为配置级；API 形状已在 program grilling 中拍板（种子数组）。
  CR 须复核此降级。
- 来源：`docs/cuts/similar-questions/program.md`（七问全落锤）。配方表、
  排除规则、"为什么相似"注解、零 AI、池子诚实——全部是已拍板决策，
  本 plan 只做工程化展开。

## API 契约

`POST /api/similar-questions`（登录态，与既有 API 同鉴权层）

请求：`{ seeds: [{ questionId: string }], limit?: number }`
- seeds 必须非空数组（v1 UI 单种子，契约收数组=错题簇预留；多种子时
  目标 facet 取并集，密度按并集计——仍确定性）。
- 种子解析失败（questionId 不存在/无 facet/writing 组）→ 400，错误信息
  说明原因（"写作题型暂不支持配相似"）。

响应：
```
{
  seedProfile: { groupType, facets: [...], topicLabels: [...] },
  results: [{
    groupId, paperId, title, sourceLabel,
    score,
    reasons: [{ kind: 'facet-density'|'secondary'|'topic-diff'|..., label }],
    matchedQuestionIds: [...]
  }],
  poolStats: { totalInPool, returned }   // 池子诚实
}
```

## 配方（program 拍板，实现为每题型一份配置对象，非分支硬编码）

硬池=同 groupType；排除：种子所在组、同 passage、同 source 卷。

| 题型 | 主序 | 次序 | 加分 |
|---|---|---|---|
| grammar_cloze | 考点 facetKey 密度 | 有/无提示词（blankType）匹配 | — |
| cloze | topic_label 重合 | discourse_type 匹配 | 种子错题 pos 密度 |
| seven_choices | roleFacet+positionFacet 密度 | mechanismFacet 匹配 | topic 重合 |
| reading | skill 密度 | 篇位 proxy（word_count 邻域+discourse） | topic **不同**加分 |

确定性平局裁决：年份新者先，再按 groupId 字典序。分数与 reasons 同源
（每个得分项必须能产出对应 reason chip，不允许"黑盒分"）。

## Scope

白名单：
- `server/search/similarQuestions.mjs`（新建：种子解析、配方打分、
  reasons 生成；**只读复用** `teachingFacets.mjs` 的 extract/index——
  若需新增最小 export 允许，逻辑零改动）
- `server/api.mjs`（route 接线 + store 注入，仿 teaching-facets 接法）
- `scripts/verify-similar-questions.mjs`（新建，行为级断言，注册进
  `scripts/verify-ci.mjs` 同刀完成——housekeeping guard 会查）
- `scripts/README.md`（新 verify 登记）

Forbidden：`app/**`（UI 归 E2/E3）、`data/**`（零 DB 变更）、
`server/search/teachingFacets.mjs` 逻辑改动、analyses 资产、
draft-paper、print/export、AI provider 线（本刀零 AI 是不变量）。

## 不变量

- 零 AI：全程不触 DeepSeek/日限额计数（verify 断言 dailyLimit used
  不变）。
- i16a 既有 endpoint `/api/teaching-facets` 行为零变化。
- 响应本地 <100ms 量级（内存索引，273 组池）。

## 验收（verify-similar-questions.mjs，真库真资产行为级）

1. 语法填空种子（取一真实非谓语空）→ top 结果的非谓语空密度 ≥ 尾部
   结果；reasons 含 facet-density chip；排除断言（不含种子组/同卷）。
2. 阅读种子（真实推断题）→ 结果全为 reading 组；含 skill 密度 reason；
   word_count 邻域排序生效（top 与种子词数差 < 尾部）。
3. 多种子（两道同组错题）→ 并集 facet 打分，返回确定性一致（跑两次
   结果逐字节相同）。
4. writing 种子 → 400 + 明确文案；空 seeds → 400。
5. poolStats.totalInPool 与真库同题型组数一致（减排除项）。
6. 全程 AI 日限额计数零增长。

## QA

引擎刀无 UI 面；QA=verify 全绿 + 一次真实 curl 演示存入
`docs/cuts/similar-engine/qa/`（请求/响应样本各一份，语法填空+阅读
两个种子）。
