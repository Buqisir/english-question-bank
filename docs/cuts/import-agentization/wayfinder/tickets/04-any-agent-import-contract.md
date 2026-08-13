# 「任意 Agent 可导题」的标准契约

Status: done
Claim: none
Blocked by: [01](01-runbook-friction-and-portability-audit.md), [03](03-pilot-import-with-grok.md)
Type: grilling
Map: `docs/cuts/import-agentization/wayfinder/map.md`

## Question

要让「随便一个 agent 进来都能导题」成立，agent 面向的契约长什么样？
基于票 01 的能力差距清单与票 03 的试点实据，与 owner 拷问定下：

1. **入口**：agent 从哪份文档进场（现有 runbook 改造？新的单一入口
   契约？），需要 owner 给它什么起始信息（源文件路径、paperId）。
2. **文件夹约定**：每步产物的落点与命名——后台靠读文件夹判断进度，
   这个约定就是 agent 与后台之间的接口。
3. **完成/求助信号**：agent 怎么声明「这步完成」「这里需要人」；两个
   人工确认点（答案核对、发布前 QA）在流程里怎么表达为 agent 的停点。
4. **门禁纪律**：哪些校验命令是 agent 必跑的硬门禁、失败重试的上限与
   上报方式。
5. **不依赖特定工具**：契约里哪些步骤必须改写成 agent 无关的形式
   （如 7 组分析扇出对没有子代理机制的 agent 怎么办）。

执行时用 `$grilling` + `$domain-modeling`；新词（如契约件、停点）随定
随写入 `CONTEXT.md`。

## Resolution

Owner 2026-08-12 接受。

1. **入口**：`docs/import/agent-contract.md`（待 spec 后写）为唯一进场文档，链到 runbook/README；开局只要源绝对路径 + `paperId` + 格式①/②。
2. **文件夹接口**：导题后台只读产物探针 + `papers/<id>/signals/`，不另建状态库。探针：`config.json`、`groups.json` + 7× analyze/analysis、`signals/ai-answer-check.json`、`paper-assets/<id>/latest`、`signals/blocked.json` / `help-needed.json`。本地 publish 成功以 `latest` 为准，禁止只看 exit code。
3. **停点**：agent 不停等人对答案；必跑 AI Answer Transcription Check；本地 publish 后停，等人在导题后台 QA。agent 不点 QA、不上生产。
4. **门禁**：split/`pdf-extract` → 7×`validate-one` → 答案复核 →（格式②）canonical → dry-run → `verify-publish-gate` → `verify-nck1` → `--publish` → post verify。同一门禁最多自动修 2 次，仍红则 `blocked.json`。格式①在 canonical producer 修好前禁止 `--publish`。
5. **无子代理**：允许串行写 7 组；禁止 remap 他卷分析当本卷交付。
6. **单 writer**：同一 `paperId` 同时只一个 agent 写。
7. **写作**：
   - 应用文跟工作树最新准则（同树 `wt-continuation-analysis-research-20260809`）：`docs/product/application-writing-doctrine-v1.md` + 生产 Prompt V3。落盘仍是 `modelAnswer` + 完整 `reviewCard`（11 项）+ 源有则 `officialModelAnswer`；**交际对象推演**（关系 / 对方已有行为 / 核心交际动作 / 关系风险 / 最小充分关系动作 / 顺序）是生成决策，**不新增 ReviewCard 字段**（准则 §3.3）。新卷不要求亮点。
   - 读后续写跟新 `continuationAnalysis` V1 五段 + `modelAnswer`；旧 `continuationDesign` 只认历史卷；说明/议论型停。新卷 `--publish` 必须写入 `writing-analysis-v1.json`；消费端已展示。
