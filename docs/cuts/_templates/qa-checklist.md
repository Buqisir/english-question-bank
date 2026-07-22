# <CUT_ID> Owner QA 对照单

Deploy: <本地 dev / 生产 URL + commit>
账号: <qa-owner / owner 本人 / member 视角>
预计用时: ≤5 分钟

目的:把 owner QA 从"自由探索"变成"对照验收"。只列本刀改动面,3-5 项,
每项一个动作一个预期。

## 对照项

| # | 操作 | 预期 | 过 / 不过 | 备注 |
| --- | --- | --- | --- | --- |
| 1 |  |  |  |  |
| 2 |  |  |  |  |
| 3 |  |  |  |  |

## 已知不在本刀范围

<QA 中可能看到、但不属于本刀的已知问题,防误报;给指针>

- <watch ledger / data-health 项指针>

## 结论

owner QA: <过 / 不过(哪一项)>;日期: <YYYY-MM-DD>

Auto-Next pause: QA pass records the tested exact commit then dispatches fresh
RM; a failure records the item then dispatches fresh fix DEV. A QA pass never
carries to a new head.
