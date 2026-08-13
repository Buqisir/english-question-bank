# 导题 Agent 化 — Wayfinder Map

Status: closed

## Destination

一份 accepted `docs/cuts/import-agentization/spec.md`：定下「导题 Agent 化」
的完整形态——任意本地 coding agent 会话都能按
标准契约独立导一卷 NCK1 试卷、产物落到约定文件夹；一个 owner-only 的本地
**导题后台**只负责看进度和上线前 QA；owner 口头「上线」后 agent 用现有
整库 push 把内容送到生产消费端。spec 被 owner 接受即到达目的地；后台与契约
的具体实现是 spec 之后的执行工作，不在本图内。

## Notes

- Owner 已定方向（本图 charting 轮拷问锁定，2026-08-12）：
  - 范围先收口现有 NCK1 整卷管线（`docs/import/agent-runbook.md`），新源
    格式进雾区。
  - **AI 分析用 agent 会话跑，不用 API**：owner 本机 coding agent
    进本仓库干活，导完题产物落对应文件夹即算导题完成；不做后台直连 LLM
    API 的方案，也不调研 API 计费。
  - 管理后台 = 本地 Web 管理站，与消费端网站代码/运行时分离；不是网站
    导入 UI 的复活——「后端产管线、网站只消费」边界不变。
  - 人工确认（票 05，2026-08-12）：不要人工对答案——答案随解析字段做全，
    另由 **AI Answer Transcription Check** 对照源抄写/一致性（非解题；
    nck1 §3 不变）。**上线前 QA 仍要人看**（Screen/Print）。正式面名
    **导题后台**（已入 `CONTEXT.md`）。
  - 上线：charting 原「后台真按钮」已修订（票 07，2026-08-12）——导题后台
    无生产按钮；QA 后再由 owner 口头授权，agent 跑现有
    `pull-run-push.mjs push`（整库）。本机后台没有别人。
  - 量级：追热度的话一两百套/年——排除「每卷占一个人全程注意力」的现状。
- 现状事实：仓库目前没有任何管理后台/admin 面，后台从零起；部署侧已有
  `scripts/deploy.sh` / `pull-run-push.mjs` / `deploy-remote.sh` 等脚本。
- 每张票执行时参考 `$grilling` 与 `$domain-modeling`；原型票用 `$prototype`；
  涉及产品/视觉决定先读 `docs/steering/README.md` 相关条目；动生产需 owner
  明确授权，先读 `docs/cuts/launch-deploy/go-live-record.md`。
- 答案硬红线不变（`docs/product/nck1-paper-standard.md` §3）：AI 解题结果
  永不入库；转录是「抄写」不是「解题」。

## Decisions so far

<!-- 每张关闭的票一行：标题链接 + 一句话答案 -->

- [现行导题 runbook 摩擦与可移植性审计](tickets/01-runbook-friction-and-portability-audit.md)
  — 单卷是 §0–§12 + Canonical 物化 + genre-truth，进度可靠文件探针读
  （`papers/<id>/`、canonical envelope、`paper-assets/<id>/latest`、ledger）；
  实证摩擦集中在手工转录、低 DPI 误读、placeholder 归一化、扇出重试；无
  子代理/无视觉的 agent 会卡在转录/分析扇出/裁图三处；shape-gate 到
  publish/verify/ledger 的机械链今天即可一键化；「任意 Agent」缺无子代理
  编排合同、人工停点状态机、统一完成信号与可 publish 范例 config。
- [内容上线链路审计](tickets/02-content-deploy-path-audit.md) — 内容上线 =
  `pull-run-push.mjs push`（整库 SQLite 替换 + paper-assets 加性 rsync，无
  单卷增量；R2 只是备份、deploy 脚本只管代码）；脚本自带 manifest/完整性/
  原子换库保护；SQLite 可靠 `.bak`+R2 退、assets 无自动回滚；按钮化缺凭据
  约定、本机执行与失败呈现，确认弹层须明示「生产整库 push」授权。
- [试点：Grok 按现行管线导一卷](tickets/03-pilot-import-with-grok.md) —
  临时 id `paper-pilot-2025-zj-jan`（2025 浙 1 月答案版，owner 认新课标语义）
  本地跑到 publish 前：split/答案源对照复核/7×validate/dry-run/publish-gate
  绿；**未入库**——`canonicalRequestPath` 硬门与格式① DOCX 身份/PDF
  producer 不匹配。摩擦：费用表伪大题→空段落而 shape-gate 仍绿；grammar
  粘连/弯引号；无听力撞 verify-nck1；无子代理扇出（多组 remap）。约
  2.5–3.5h、owner 注意力 0。证据
  `research/pilot-grok-2025-zj-jan.md`。
- [导题后台信息架构](tickets/05-console-information-architecture.md) —
  面名**导题后台**；人对答案取消，改 AI Answer Transcription Check；上线前
  QA 仍人工。六态 `queued/importing/awaiting_qa/ready_to_ship/shipped/failed`；
  QA 看 Screen+Print+门禁绿灯；首页待办（待 QA/失败）+ 最近导入。
- [任意 Agent 导题契约](tickets/04-any-agent-import-contract.md) —
  入口 `docs/import/agent-contract.md`；开局源路径+paperId+格式；后台只读
  文件夹+`signals/`；单卷单 writer；无子代理可串行、禁 remap；格式①未修好
  canonical 前禁止 publish。写作：应用文跟 doctrine v1 / Prompt V3（交际对象
  推演不新增 ReviewCard 字段）；读后续写跟 `continuationAnalysis` V1。
- [上线语义](tickets/07-deploy-button-semantics.md) — 整库
  `pull-run-push.mjs push`；硬前置 `ready_to_ship`；导题后台无生产按钮；
  owner 口头「上线」后 agent 执行；失败写 `ship_failed`；SQLite 有 bak、
  assets 无自动回滚。
- [导题后台原型](tickets/06-console-prototype.md) — 抛弃式 HTML 被接受；
  实现时独立本地目录、不进消费端 `app/`；无对答案、无上线按钮。
- [起草并接受 spec](tickets/08-draft-and-accept-spec.md) —
  owner 2026-08-12 接受 `docs/cuts/import-agentization/spec.md`。图 closed。

## Not yet specified

- 格式① DOCX 的 canonical 物化路径：契约已写死「修好前禁止 publish」；
  producer/身份规则是 spec 之后的实现票。
- 新源格式的 Agent 化：地方卷、模拟卷、单题组、扫描件——等 NCK1 管线
  Agent 化收口后才问得精确。
- 收件箱去重与格式白名单细则：`queued` 已定，实现时补。
- 机械步骤的自动化收编：写入 agent-contract 实现票。
- 分析质量抽检：不设上线前必过解析抽检；从零解析质量另议。
- 续写/应用文新合同：权威在 `docs/import/agent-contract.md`；新卷
  `--publish` 写入 `writing-analysis-v1.json`。

## Out of scope

- 找卷/获取源材料：图从「源文件已在本机磁盘」起步，去哪找卷是 owner
  自己的事。
- 网站消费端的任何改动、恢复网站导入 UI：产品边界明令保留。
- 后台直连 LLM API 跑分析：owner 明确用 agent 会话，不用 API。
- spec 接受后的具体实现与上线：由后续 cut/ticket 执行，本图只定形态与
  范围。
