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

## 已知不在本次范围

<QA 中可能看到、但不属于本刀的已知问题,防误报;给指针>

- <相关 issue / data-health 指针>

## 结论

owner QA: <过 / 不过(哪一项)>;日期: <YYYY-MM-DD>

QA task stays open for the owner response. After `QA 完成`, it returns the one
copyable ship prompt. On failure, it returns one copyable fresh fix-ticket
prompt. It never creates either task.
