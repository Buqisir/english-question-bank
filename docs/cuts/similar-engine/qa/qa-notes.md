# similar-engine (E1) — QA 记录

日期：2026-07-09　执行：DEV 子代理（Sonnet）

引擎刀无 UI 面（本 program 拆刀表 E2/E3 才是 UI），QA = 自验脚本全绿 +
两次真实 curl 演示（登录态、非 mock）。

## 环境

- 本地 dev server：`QUESTION_BANK_API_PORT=8791 node server/api.mjs`
  （本 worktree 自带的 gitignored sqlite 副本，不触碰生产）。
- 账号：`qa-local-owner`（密码经
  `node scripts/create-user.mjs --reset-password --username qa-local-owner
  --password 'QaLocal2026!'` 临时重置，仅影响本 worktree 复制出的本地
  sqlite，见 `docs/cuts/flow-panel/qa/qa-notes.md` 的既定手法）。
- 登录：`POST /api/auth/login` 拿 session cookie，后续请求带 `-b cookies.txt`。

## 请求 1：语法填空种子（非谓语空）

```
POST /api/similar-questions
Content-Type: application/json

{"seeds":[{"questionId":"q-zj-2022-jan-059"}],"limit":5}
```

种子 `q-zj-2022-jan-059` 的真实 facetKey 是
`grammar-fill.given.verb.non-finite`（浙江 2022 年 1 月卷语法填空第 4 空）。

响应见 `grammar-cloze-seed-response.json`：`seedProfile.groupType` =
`grammar_cloze`，5 条结果全部带 `facet-density`（同考点密度）+ `secondary`
（同为有提示词）reason chip，`matchedQuestionIds` 精确到具体空号；
`poolStats.totalInPool = 32`（33 卷 grammar_cloze 组减去种子自己所在卷）。

## 请求 2：阅读种子（推断题）

```
POST /api/similar-questions
Content-Type: application/json

{"seeds":[{"questionId":"q-zj-2022-jan-025"}],"limit":5}
```

种子 `q-zj-2022-jan-025` 的真实 `skill.primary` 是 `inference`（浙江 2022
年 1 月卷 Reading B 第 2 题）。

响应见 `reading-seed-response.json`：`seedProfile.groupType` = `reading`，
5 条结果全部是 reading 组，带 `facet-density`（小题题型密度）+
`position-proxy`（篇位相当：词数邻域+体裁）+ `topic-diff`（话题不同加分）
三层 reason chip；`poolStats.totalInPool = 127`。核对：教学维度索引（读
paper-assets，非 DB）里 reading 组共 130 个（比 DB 的 126 组多，说明有
几个 paper-asset 已解析但 DB 尚未同步齐全——与
`docs/import/data-health-sweep-2026-07-08.md` 记录的销账缺口一致，属已知
数据面差异，不是本刀引入的 bug；引擎按 plan.md 约定读 paper-assets 索引
作为硬池）。种子所在卷（浙江 2022 年 1 月）在 reading 组这一侧只有 3 篇
（reading-a/b/c），三篇同属一个"同 source 卷"，全部被排除（含种子自身），
130 − 3 = 127，与响应一致。

`scripts/verify-similar-questions.mjs` Criterion 5 对 grammar_cloze 池子
做了同样的独立重算并逐一断言相等（32 = 33 卷 grammar_cloze 组 − 种子自身
卷 1 组）；reading 池子排除逻辑与 grammar_cloze 完全同源（同一段代码），
上面的手工核对足以确认它正确。

## 结论

两次真实 curl 请求/响应均正常返回、字段齐全、reason chip 与分数同源、
排除规则生效。`node scripts/verify-similar-questions.mjs` 29 项全绿
（含真实 request/response 路由往返、AI 日限额零增长、poolStats 独立重算
比对）。
