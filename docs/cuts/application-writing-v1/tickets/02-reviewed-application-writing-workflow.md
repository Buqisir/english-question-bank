# 02 — 从完整题面到复核通过的应用文解析工作流

Status: done
Blocked by: None — Ticket 01 is complete in this worktree.

Spec: `docs/cuts/application-writing-v1/spec.md`
Fixed point: Ticket 01 completion commit (the final HEAD in its completion handoff)

## What to build

交付一条可独立验证的离线生产路径：从已保存的 application Writing Task 与题组 passage 重建完整题面，使用 spec 附录 A 的锁定 prompt 生成纯文本工作任务，对 `.model-answer.txt` 做机器校验，要求独立内容复核为 `PASS`，再从审核过的工作文件组装并持久化 application Writing Analysis。

这条路径不运行真实试点生成，不碰 UI；它只把可复用生产能力做完整。

## Scope

- 新建独立 prompt 文件，以 spec 附录 A 为逐字权威；builder 读取或引用该单一文件，不在 JS 中维护另一份语义副本。
- 新增纯 adapter `buildCompleteApplicationTaskText(...)`，从 Writing Task、word-count target、`applicationGiven` 和 group passage 重建全部背景、内容要点、注意事项与给定格式。
- 对 `applicationGiven` 缺失、骨架埋在 instruction 或 passage 的现有资产提供确定性 fallback。
- adapter 不能无损重建时必须以 `SPEC CONTRADICTS` 停止，不得静默删减题面；任何 `PaperWritingTask` schema 扩展都需要新的 owner 决策，不能在本票自行加入。
- application builder 的最终模型输出合同只能是纯英文成文；不再要求 JSON、audit 或 highlights。
- application 工作文件采用：
  - `<key>.model-answer.txt`
  - `<key>.review-card.json`
  - `<key>.official-model-answer.txt`（可选）
  - `<key>.review.json`
- application 专用机器校验覆盖：非空、无 JSON/Markdown 包装、给定字符串完整且顺序正确、骨架不重复、明显格式正确、词数规则可信。
- 无法可靠扣除给定骨架时必须转人工确认，不得伪造精确学生新增词数。
- review 文件严格使用 spec 的 `PASS | MUST_FIX` 形状；生成者与复核者必须分离。
- 最多允许两轮自动修改；两轮后仍有实质 Must Fix 必须停止并交 owner。
- 只有机器校验通过且 review verdict 为 `PASS`，driver 才能组装 application candidate 并调用 Ticket 01 的持久化契约。
- continuation 继续使用现有 `.out.json`、prompt、词汇 gate、校验和持久化路径。

## Forbidden

- 不压缩、改写或“优化”附录 A。
- 不让模型输出或持久化 audit、审题过程、评分、词数说明或 highlights。
- 不运行真实 `paper-960d0f8d` 的模型生成，不写任何真实 paper asset。
- 不修改 UI、PaperSurface、挑题态、打印、PDF、DOCX、export 或网站导题入口。
- 不修改 continuation prompt、candidate 形状、工作文件名或持久化行为。
- 不接生产模型服务、生产环境或生产配置。

## Acceptance criteria

- [ ] 自动校验证明独立 prompt 文件与 spec 附录 A 逐字一致，文末只追加完整题面占位内容。
- [ ] adapter 可从 applicationGiven、instruction 和 group passage 三种现实现状重建完整题面。
- [ ] adapter fixture 覆盖称呼、标题、给定开头、结尾、敬语、署名、word-count target 和无骨架文章。
- [ ] 题面存在无法恢复的信息时 fail closed，并输出可诊断的 `SPEC CONTRADICTS`。
- [ ] application `list` 产出的任务明确要求纯英文成文，不再要求 JSON、audit 或 highlights。
- [ ] application `persist` 读取 `.model-answer.txt` 等分离工作文件；旧 `.out.json` 不再是 application 新路径输入。
- [ ] JSON、Markdown、中文解释、遗漏或重复骨架、明显格式错误以及不合规词数均被机器校验拒绝。
- [ ] `.review.json` 缺失、形状非法或 verdict 为 `MUST_FIX` 时禁止持久化。
- [ ] 复核 PASS 后可组装无 highlights 的 application candidate，并由 Ticket 01 契约原子持久化。
- [ ] review、原始模型回复和工作文件内容不泄漏到 paper asset。
- [ ] continuation 的 list/persist fixture 与 fixed point 行为一致。
- [ ] focused red-green fixture 证明旧 main 的 JSON application 流程不满足本票，完成后整条新工作流 green。

## Verification

```text
node docs/cuts/application-writing-v1/qa/verify-02-reviewed-workflow.mjs
node scripts/verify-restart3-teacher-analysis.mjs
pnpm -C app exec tsc --noEmit
pnpm -C app run verify:all
git diff --check
```

若 focused verifier 需要运行 driver，只允许使用临时 fixture paper-assets 与任务专用临时目录；不得触碰真实资产或生产。

## Review and owner QA

- 本票涉及生成边界、内容复核门和持久化输入纪律，属于高风险行为合同。
- `$implement` 在本任务内完成 TDD、普通 review、修复和一个干净 commit。
- 本票单独完成不构成 merge authorization；完整 fresh `$code-review` 在 Ticket 04 后审查从 Ticket 01 fixed point 到最终 pilot HEAD 的完整范围。
- Owner QA：本票不生成真实内容，不单独暂停 owner；真实内容与浏览器 owner QA 统一由 Ticket 04 承担。

## Result

Commit: This commit; final HEAD is recorded in the completion handoff.
Verify: Focused verifier proved red before implementation (`ERR_MODULE_NOT_FOUND`, exit 1) and green after implementation (`27/27`, exit 0); teacher-analysis regression `130/130` (exit 0); `pnpm -C app exec tsc --noEmit` (exit 0); final `pnpm -C app run verify:all` `PASS 84 / SKIP 1 / FAIL 0` (exit 0; skip is the suite's declared absent off-repo fixture); `git diff --check` (exit 0).
Notes: Application now uses the Appendix A byte-for-byte prompt authority and separated pure-text/review work files. It fail-closes on invalid output, missing or non-PASS review, malformed task reconstruction, and missing or repeated given format; Ticket 01 remains the sole persistence projection. Existing string-title `applicationGiven` data and inline legacy letter skeletons are covered. Continuation retains its `.out.json`, prompt, vocab gate, validation, and persistence flow. No real model generation, real paper asset, UI, PaperSurface, print/PDF/DOCX/export, production configuration, or Tickets 03–04 work ran. Standards review passed; Spec review required two compatibility fixes, and focused re-review passed with no remaining Must Fix.
