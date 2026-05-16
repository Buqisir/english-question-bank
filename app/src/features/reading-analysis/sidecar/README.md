# Reading Analysis Sidecar Samples

Hand-curated sidecar entries used by the Reading Analysis demo route and by
`scripts/reading-analysis-report.mjs`. The samples are deliberately picked to
cover four boundary cases of the current single-sentence quote matcher.

| groupId                                           | questionNo | case                | reason                                                                                                                  |
| ------------------------------------------------- | ---------: | ------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `g-9b30c735-6824-4897-a938-6d5c42bee39a`          |          1 | normal-hit          | quote 精确出现在单句中（jump on that bandwagon），既覆盖 stem 又覆盖正确/错误 option                                    |
| `g-150f444a-808d-4ae7-b129-4d54ea7b9489`          |          1 | normal-hit          | 整句 evidence + 句内子串 evidence + 一条 option 级别的 trap，全应命中                                                   |
| `g-d948a878-d4cb-46b8-938f-ff5adb78add9`          |          1 | cross-sentence      | 故意写成跨句 evidence；当前 selector 只支持单句 includes，预期 miss + reason = cross_sentence                            |
| `g-f99df5e8-5d1c-4193-8ed9-a53b7273cfa5`          |          1 | partial-quote       | quote 是一句中的小段（mid-sentence substring）；用来确认 includes 是否够用                                              |
| `g-775ad76c-8382-4acc-be18-7282f8555a38`          |          1 | same-sentence-multi | 同一句既是 stem evidence，又是某个错误 option 的 trap；selector 应该都保留并 emit warning + 'same_sentence_multi' diagnostic |

The report script (`scripts/reading-analysis-report.mjs`) iterates
`./index.json`, fetches each group's `QuestionGroupDetail`, runs the
selector, and writes `reports/reading-analysis-quote-coverage.md` with
hit/miss totals + per-group + per-miss breakdowns.

> 不要追求样本数量；增加新样本时优先覆盖现有 case 没覆盖到的边界（例如多重定位歧义、纯标点 quote、超长引文）。
