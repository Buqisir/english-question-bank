# 管理后台原型

Status: done
Claim: none
Blocked by: [05](05-console-information-architecture.md)
Type: prototype
Map: `docs/cuts/import-agentization/wayfinder/map.md`

## Question

按票 05 定下的信息架构，用 `$prototype` 做一个可点的粗糙本地原型
（队列页、单卷详情、答案核对视图、上线面板），给 owner 一个能上手反应
的东西，把「导完可见、没问题就上线」的体验敲实。原型是抛弃式的——只为
让 spec 里的后台章节有共识的具体形态，不是生产代码；产出链接为本票
资产，落位与技术栈的正式决定随原型体感一并记录。

## Resolution

Owner 2026-08-12 接受原型体感。

- 资产：`docs/cuts/import-agentization/prototypes/import-ops-console.html`（抛弃式）
- 形态：首页待办（待 QA / 失败）+ 最近导入；详情探针 + Screen/Print/门禁 QA；无对答案；无上线按钮，可上线后只显示要对 agent 说的口令。
- 落位：实现时独立本地目录，**不进消费端 `app/`**。本图不写生产代码。技术栈不由本 HTML 锁定。
