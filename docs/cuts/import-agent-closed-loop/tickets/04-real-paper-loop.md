# 04 — 一套未见真实 NCK1 卷的完整人机闭环

Status: planned; requires owner source files and current authorization
Blocked by: `03-production-agent-identity.md`
Next on PASS: Owner issues a separate ship command if desired
Terminal: yes

Spec: `docs/cuts/import-agent-closed-loop/spec.md`

## What to build

用 Owner 新提供的一套未见真实 NCK1 源卷完整演练：Agent 材料化并提交；Owner
故意记录至少一个问题；Agent 从账号/API 读取、回复、修正并提交新 revision；Owner
验证关闭并认可；Agent accept、本地原子发布并完成受影响三面 canary；然后停下。

## Acceptance criteria

- [ ] 新卷不增加 paperId 共享代码特例。
- [ ] 问题、对话、`resolvesIssueIds`、Owner 验证和新 revision 全部留审计记录。
- [ ] approval 与本地 source/Candidate/visible/file/bundle digest 精确一致。
- [ ] 本地发布后 Screen、Student Print、Teacher Print 和 PDF 使用同一 Canonical
      Paper；学生版无答案，教师版含 45 个权威 active 答案。
- [ ] 流程停在 `ready_to_ship`；未收到之后单独的“上线 <paperId>”时不碰生产内容。

## Authorization boundary

本 ticket 的文档存在不等于授权导入或上线。启动需要 Owner 提供真实源文件；生产
push 仍需要本地发布和 QA 之后的另一条当前“上线 <paperId>”命令。
