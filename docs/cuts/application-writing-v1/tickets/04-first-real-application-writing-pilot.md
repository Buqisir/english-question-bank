# 04 — 首篇真实应用文试点

Status: done
Blocked by: None — Tickets 02 and 03 are ancestors of the verified starting HEAD.

Spec: `docs/cuts/application-writing-v1/spec.md`
Fixed point: `4ed02871b2cd57872b3174c2aabfb781acfd3273`（完整独立审查的 implementation base）

## What to build

为已批准的 `paper-960d0f8d / group-960d0f8d-writing-application` 完成一条真实闭环：逐行核对完整题面，生成并独立复核 AI 参考范文，制作并复核现有 ReviewCard，忠实录入命题方配套答案卷中的参考范文，写入一份新的 `writing-analysis-v1.json`，并在真实浏览器中完成集成验证。

本票不再开发通用生成器、共享契约或通用 UI；它只消费 Tickets 01–03 的能力处理这一份已锁定资产。

## Locked pilot

```text
paperId: paper-960d0f8d
groupId: group-960d0f8d-writing-application
writingTaskId: wt-960d0f8d-application
```

原题：

```text
/Users/huangxuewei/Desktop/教学资料库/05_真题模拟与试卷库/各地模拟/2026年3月高三试卷/26年3月高三试卷/26.3重庆市巴蜀中学高三月考（七）英语试卷.docx
SHA-256: 960d0f8d6fddc3e6ccff22a15c9044170cb58f59a8b62f9870cf522df8cde25b
位置: 第四部分 写作，第一节
```

命题方配套范文：

```text
/Users/huangxuewei/Desktop/教学资料库/05_真题模拟与试卷库/各地模拟/2026年3月高三试卷/26年3月高三试卷/26.3重庆市巴蜀中学高三月考（七）英语答案解析.docx
SHA-256: cb59414336068de60c9949ee05e36182775e16d2930ec864975dcfd514bd402a
位置: 第四部分 写作，第一节（满分15分）【参考范文】
```

本 cut 中“官方范文”只指上述同卷命题方配套《英语参考答案》里的【参考范文】，不宣称为 NEEA 发布的全国高考官方范文。

## Scope

- 重新计算并核对两份源文件 SHA-256；任一不符立即停止。
- 使用 Ticket 02 adapter 从当前 paper asset 重建完整题面，并逐行对照原题：
  - 校报记者李华身份；
  - 上周五校园开放日与 Chris 的英语示范课；
  - 询问课程内容与亮点；
  - 征求出镜照片使用授权；
  - 80 词左右；
  - 可适当增加细节；
  - `Dear Chris,`
  - 给定开头；
  - `Yours,`
  - `Li Hua`
- 当前 asset 把“注意”部分第二项误编号为另一个 `(2)`；生成输入必须依据原题恢复清楚的“注意”结构，不得把编号噪音当内容要点。
- 使用附录 A 锁定 prompt 生成 `.model-answer.txt`，不得手写一篇来绕过生成路径。
- 运行 application 机器校验。
- 由与生成者不同的复核者执行 spec 十项内容复核；必须得到 `PASS` 且 findings 为空。
- 最多两轮自动修改；两轮后仍有实质争议，停止并交 owner。
- 按现有 ReviewCard 形状制作两点卡片，并由独立复核确认完整、准确、无 Markdown/换行污染。
- 从配套答案卷逐字录入 `officialModelAnswer`。只允许清除页眉页脚、强制换行和重复空格等版面噪音；不得润色、改词、纠错或借 AI 补写。
- 通过 Ticket 02 的 review gate 和 Ticket 01 的原子持久化写入：
  `app/public/paper-assets/paper-960d0f8d/latest/analyses/writing-analysis-v1.json`。
- QA 证据写入本 cut 的 `qa/`；模型原始回复和中间工作文件不进入 paper asset。
- 若该闭环构成 material release，只在 release 阶段按 AGENTS.md 将 `docs/STATUS.md` 更新至不超过五行；本票不得提前写发布成功。

## Forbidden

- 不复制 2022-i、2024-i 或任何历史 application 的 modelAnswer、ReviewCard 或 highlights。
- 不把 AI 内容、普通第三方参考答案或来源不明文本写成 `officialModelAnswer`。
- 不生成新的 highlights，不写 audit，不把 review findings 或模型原始回复写入 asset。
- 不修改基础 paper prompt、writing task、原题段落或 continuation 资产来掩盖 adapter 问题。
- 不回填其他 application。
- 不修改挑题态、PaperSurface、print、PDF、DOCX、export、生产配置或生产环境。
- 不合并、不部署、不修改 remote。

## Acceptance criteria

- [x] 两份源文件 SHA-256 与本票记录精确一致。
- [x] adapter 输出包含原题全部背景、内容要点、注意事项、word count 和给定书信格式，并通过人工逐行核对。
- [x] AI 参考范文由附录 A prompt 生成，机器校验全部通过。
- [x] 独立内容复核 verdict 为 `PASS`，无 Must Fix。
- [x] ReviewCard 两个 points 与原题两个内容要点一一对应，其余字段完整合法。
- [x] `officialModelAnswer` 与配套答案卷范文逐词一致，所有版面规范化均有记录。
- [x] 新 asset 使用 `writing-analysis-v1`，application 不生产 highlights，且不含 audit/review/raw-response 字段。
- [x] 真实 paper 在讲评态左侧依次显示完整 AI 参考范文与官方范文，右侧只显示 ReviewCard。
- [x] 关闭讲评恢复普通答题框；窄屏与宽屏无截断、缩放或横向溢出。
- [x] 2022-i/2024-i、continuation、挑题态、student/print/PDF/DOCX/export 无回归。
- [x] focused checks、TypeScript、`verify:all` 和 `git diff --check` 全绿，或如实记录任何原始红门。
- [x] implementation task 提交一个干净 pilot commit，并返回完整 fresh `$code-review` handoff；review 无 Must Fix 后才进入 owner QA。

## Verification

```text
shasum -a 256 \
  '/Users/huangxuewei/Desktop/教学资料库/05_真题模拟与试卷库/各地模拟/2026年3月高三试卷/26年3月高三试卷/26.3重庆市巴蜀中学高三月考（七）英语试卷.docx' \
  '/Users/huangxuewei/Desktop/教学资料库/05_真题模拟与试卷库/各地模拟/2026年3月高三试卷/26年3月高三试卷/26.3重庆市巴蜀中学高三月考（七）英语答案解析.docx'
node docs/cuts/application-writing-v1/qa/verify-04-first-real-pilot.mjs
node docs/cuts/application-writing-v1/qa/verify-02-reviewed-workflow.mjs
node docs/cuts/application-writing-v1/qa/verify-03-data-driven-lecture.mjs
node scripts/verify-paper-browse.mjs
node scripts/verify-restart3-teacher-analysis.mjs
pnpm -C app exec tsc --noEmit
pnpm -C app run verify:all
git diff --check
```

使用 `qa-local-owner` 完成真实点击 agent browser QA，并保存宽屏与窄屏证据。不得以静态 fixture、SSR markup 或文件存在代替真实浏览器。

## Independent review and owner QA

本票 implementation commit 完成后，不得直接进入 owner QA。先新开一条完整范围的 fresh `$code-review` lineage：

- Fixed point：`4ed02871b2cd57872b3174c2aabfb781acfd3273`
- Expected HEAD：Ticket 04 的最终 implementation commit
- Standards + Spec：审查 Tickets 01–04 的完整 fixed-point diff
- 无 Must Fix 后立即进入 owner QA，不再另开第二条 full review

Owner QA checklist：

1. 打开 `paper-960d0f8d` 的 application 讲评，核对 AI 参考范文与官方范文标签、顺序和全文。
2. 将官方范文与配套答案 DOCX 逐段对照，确认没有改词或 AI 补写。
3. 核对右侧 ReviewCard 两个要点与原题一致，且没有 highlights 或额外 AI 面板。
4. 关闭讲评并切换 continuation，确认普通答题框和既有行为恢复。
5. 在宽屏 rail 与窄屏 drawer 各检查一次，无截断、缩放或横向溢出。

## Result

Commit: This commit; final HEAD is recorded in the completion handoff.
Verify: TDD red: Ticket 02 exit 1 (`94 !== 85`) and Ticket 04 exit 1 (`100 !== 90`); ordinary Spec review's opening-only fallback case also failed red with exit 1 (`Missing expected exception`). Final green: `node docs/cuts/application-writing-v1/qa/verify-02-reviewed-workflow.mjs` 30/30 (exit 0); `node docs/cuts/application-writing-v1/qa/verify-04-first-real-pilot.mjs` 8/8 (exit 0); `node docs/cuts/application-writing-v1/qa/verify-01-writing-contract.mjs` 29/29 (exit 0); `node docs/cuts/application-writing-v1/qa/verify-03-data-driven-lecture.mjs` 12/12 (exit 0); `pnpm -C app exec tsc --noEmit` (exit 0); `pnpm -C app run verify:all` PASS 84 / SKIP 1 / FAIL 0 (exit 0); `git diff --check` (exit 0).
Notes: Appendix A generation passed the machine gate at 90 student-written words after every given line, including the opening sentence, was deducted. Deleting that opening now fails the machine gate. Structured `applicationGiven`, the legacy title string, no-skeleton articles, instruction fallback, and group-passage fallback remain covered; an ambiguous opening-only fallback now fails closed for manual confirmation rather than reporting a precise count. Ordinary Standards review passed with no findings; ordinary Spec review's sole Must Fix was corrected and reverified. Independent content review and ReviewCard review passed with no findings. The official model answer is a recorded layout-only normalization of the locked answer DOCX. Real-click `qa-local-owner` QA passed at 1440×900 and 1000×800; evidence is under `docs/cuts/application-writing-v1/qa/`. The sole `verify:all` skip is its declared off-repo-fixture case. Owner QA remains gated on the focused re-review required by the completion handoff.
