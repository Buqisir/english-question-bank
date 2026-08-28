# 02 — 自动导题 skill、状态机与恢复 preflight

Status: planned
Blocked by: `01-universal-approved-publish.md`
Next on PASS: `03-production-agent-identity.md`
Terminal: no

Spec: `docs/cuts/import-agent-closed-loop/spec.md`

## What to build

新增项目级导题 skill，使 Agent 识别到 NCK1 导题、审核反馈、继续某卷或本地发布
任务时自动使用，而不是等 Owner 点名 skill。每次先按 `paperId` 检查 source、
materialization、revision、approval、local publication 和 ship receipt，再从唯一正确
状态恢复。

同步 `agent-contract.md`、pipeline README 和 import-ops probe 到新状态顺序；Owner
无需记具体命令，但边界和可执行命令仍可审计。

## Acceptance criteria

- [ ] skill description 可自动匹配导题、返工、状态和本地发布请求。
- [ ] preflight 能区分 materializing、awaiting_review、changes_requested、approved、
      locally_published、ready_to_ship、shipped 和 failed。
- [ ] resume 不覆盖不可变 revision，不重复发布版本，不把旧 approval 当最新认可。
- [ ] Owner 未当前授权“上线”时，任何状态都不会触发生产 push。

## Out of scope

- 后台直连 LLM、永久轮询/webhook、多 writer。
- 生产账号或真实卷导入。
