# 01 — 扩展应用文解析兼容契约

Status: ready
Blocked by: None

Spec: `docs/cuts/application-writing-v1/spec.md`
Fixed point: `4ed02871b2cd57872b3174c2aabfb781acfd3273`

## What to build

让一份新的 application Writing Analysis 在不生产亮点表达的情况下，也能携带可选的命题方配套范文，通过类型、JSON Schema、运行时校验与原子持久化完整往返；与此同时，历史 application 数据和 continuation 契约保持原样。

这是无法安全纵切的最小 expand-contract 前置。它只扩展共享兼容契约，不接生成器、UI 或真实试点。

## Scope

- application 保留 `modelAnswer` 既有语义，新增可选 `officialModelAnswer`。
- application 的 `highlightExpressions` 从必填放宽为可选；历史存在时必须原样保留。
- continuation 继续要求 `modelAnswer + continuationDesign + highlightExpressions`，并禁止 `officialModelAnswer` 与 `reviewCard`。
- `officialModelAnswer` 只接受规范化后非空的真实字符串；空字符串、纯空白或错误类型必须 fail closed。
- application 持久化投影允许 `modelAnswer + reviewCard + officialModelAnswer` 且无 highlights。
- 修改 application 的其他字段时，不得丢失已有 highlights、同卷其他 group、continuation 或 envelope meta。
- `audit`、内容复核报告、模型原始回复和未知工作字段不得进入 paper asset。
- 保持现有临时文件加原子 rename 写入纪律。

## Forbidden

- 不修改附录 A、生成 prompt、生成 builder 或 driver 工作文件协议。
- 不修改任何 UI、PaperSurface、挑题态、路由、打印、PDF、DOCX 或 export。
- 不写或迁移任何真实 `writing-analysis-v1.json` 资产。
- 不创建 `writing-analysis-v2`。
- 不改变 continuation 的校验、投影、词数 warning、词汇 gate 或可见行为。
- 不把写作解析接入数据库、搜索维度或整卷发布完整性门。

## Acceptance criteria

- [ ] TypeScript 能表达无 highlights 的 application，以及带/不带 `officialModelAnswer` 的 application。
- [ ] JSON Schema 按 task type 分支：新 application 无 highlights 可通过；历史 application 有 highlights 仍可通过。
- [ ] `officialModelAnswer` 缺省可通过；空字符串、纯空白、错误类型失败。
- [ ] continuation 缺 highlights 仍失败，带 `officialModelAnswer` 或 `reviewCard` 仍失败。
- [ ] application validator 不再要求新候选生产 highlights，但历史 highlights 出现时仍验证其既有形状。
- [ ] application 持久化可写入无 highlights 的新候选，并忠实保留可选官方范文的段落换行。
- [ ] 更新已有 application 时，历史 highlights 的对象、扩展字段和顺序逐项不变。
- [ ] 同 paper 的其他 group、continuation 和 envelope meta 不被覆盖。
- [ ] `audit`、review 结果、模型原始回复和未知工作字段不落盘。
- [ ] focused red-green fixture 证明旧 main 在新契约上为 red，完成后为 green。

## Verification

先运行 focused fixture，再运行相关现有门：

```text
node docs/cuts/application-writing-v1/qa/verify-01-writing-contract.mjs
node docs/cuts/applied-writing-lecture-v3/qa/verify-retained-01.mjs
node scripts/verify-restart3-teacher-analysis.mjs
pnpm -C app exec tsc --noEmit
pnpm -C app run verify:all
git diff --check
```

保留每条命令的原始退出码。任何红门都必须如实记录，不能把 focused green 报告成全门 green。

## Review and owner QA

- 本票是高风险 Schema、数据合同和持久化变更。
- `$implement` 在当前顶层任务内完成 TDD、普通 Standards + Spec review、修复和一个干净 commit。
- 本票单独完成不构成 merge authorization；完整 initiative 在 Ticket 04 提交后，从本票 fixed point 启动一条 fresh top-level `$code-review` lineage。
- Owner QA：本票不单独暂停 owner；真实可见验收统一在 Ticket 04 和完整独立审查之后进行。

## Result

Commit:
Verify:
Notes:
