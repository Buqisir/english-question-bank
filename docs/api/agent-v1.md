# Agent 只读 API v1

Owner 登录网站，打开「管理 → 数据维护 → Agent 口令」，填写名称和范围后新建。
明文只显示一次，请保存到 Agent 的私有环境变量，勿提交到代码库。Owner 可随时作废口令。

每次请求携带 `Authorization: Bearer <口令>`。只接受 GET，不接受登录 cookie。
正式（`published`）范围只读已发布卷；测试（`test`）范围另外读取每套最新待审 Candidate，
标为 `status: "awaiting_review"` 并带 `revision`。OCR 中间稿不提供。
所有范围都包含来源答案，不写入题库或教师个人数据。

| 接口 | 返回 |
| --- | --- |
| `GET /api/agent/v1/papers?type=real&year=2026` | `{papers:[{paperId,title,year,type,status,revision?,groupCount}]}` |
| `GET /api/agent/v1/papers/:paperId` | 卷信息与 `groups`，各组保留原文结构、题目、选项和 `answer` |
| `GET /api/agent/v1/groups?section=&type=&year=&limit=50&offset=0` | `{groups:[摘要],total,limit,offset}`，预览最多 80 字 |
| `GET /api/agent/v1/groups/:groupId` | 完整题组与 `paperId/paperTitle/status/revision?` |

`type` 为 `real`（真题）或 `mock`（模拟）；`section` 精确匹配返回的题型/部分名。
`limit` 为 1–200，默认 50；`offset` 默认为 0。
同套卷已发布又有待审时，列表两条均保留；详情默认返回已发布，
在卷或组详情追加 `?revision=<revision>` 可指定待审版本。正式口令访问待审版本返回 404。
原文沿用资产的 `passage`、`content`、共享选项或 `writingTask`，不展平为字符串。
来源答案缺失时 `answer` 为 `null`；未知年份/类型也为 `null`，不从卷名猜测。

```sh
export EQB_AGENT_TOKEN='在此填入刚创建的口令'
curl -H "Authorization: Bearer $EQB_AGENT_TOKEN" \
  'https://eqbank.cc/api/agent/v1/papers?type=mock&year=2026'
curl -H "Authorization: Bearer $EQB_AGENT_TOKEN" \
  'https://eqbank.cc/api/agent/v1/papers/paper-example'
curl -H "Authorization: Bearer $EQB_AGENT_TOKEN" \
  'https://eqbank.cc/api/agent/v1/groups?limit=10&offset=0'
curl -H "Authorization: Bearer $EQB_AGENT_TOKEN" \
  'https://eqbank.cc/api/agent/v1/groups/group-example'
```

每口令每进程每分钟最多 120 次，超限返回 429 与 `Retry-After`（秒）。
无效或作废口令返回 401；有效口令的非 GET 请求返回 405。
这些接口供服务端 Agent 使用，不提供额外浏览器跨域设置。
