# 11 — 无答案来源的安全暂存

- Status: planned
- Blocked by: None for DOCX/PDF intake；图片source复用ticket 09
- Next on PASS: `10-answer-source-shape-closure.md` when an answer source is found

- Spec: `docs/cuts/import-format-capabilities/spec.md`
- Matrix rows: C10, C07, R05

## Outcome

Agent找到完整题卷但暂时没有权威答案时，可以把原source安全放入现有gitignored
`imports/` intake并得到digest-bound source-only record。状态明确为
`awaiting_authoritative_answers`；在补到权威答案前，任何Materialization Candidate、Review
approval、publication或AI补答案都不可发生。

## Input and fixture

- 一页synthetic question DOCX和一页synthetic question PDF，各自无答案。
- ticket 09完成后，增加两张显式排序的synthetic question images。
- 后续答案正例：一份与原question digest绑定的完整compact key。
- 负例：答案属于另一题卷、原题bytes改变、尝试直接materialize/publish、重复附答案。

## Public seam

- 给Universal CLI增加显式source-only intake mode；它继续运行source media probe并保存immutable
  bytes/digest，但写入`imports/`而非`scripts/import-pipeline/papers/`的可发布工作目录。
- record至少含sourceSetId、question documents/roles/digests、provenance、capture time、state和
  stable reason code；不含猜测答案、Canonical group或publication config。`imports/`继续
  gitignored，真实版权source不入仓库。
- 后续找到答案时，不修改旧record。创建新的complete source set，重用并复核question
  digest，加answer source digest，再走正常Universal init/materialize。
- 可列出pending source并查看原文件；无答案record不上传Import Review revision，因为没有
  可审核的真实Canonical Screen。

## Fail closed

`NCK1_AUTHORITATIVE_ANSWERS_AWAITED`, `NCK1_SOURCE_ONLY_MATERIALIZATION_FORBIDDEN`,
`NCK1_SOURCE_ONLY_PUBLICATION_FORBIDDEN`, `NCK1_ANSWER_ATTACHMENT_QUESTION_MISMATCH`,
`NCK1_ANSWER_ATTACHMENT_DUPLICATE`。任何source-only状态都不能被普通`source_incomplete`
重试逻辑误判成暂时失败后继续发布。

## Acceptance criteria

- [ ] question-only DOCX/PDF写入immutable source-only record并可按digest重开，原source不入Git。
- [ ] materialize/build/review-upload/publish对该record均稳定拒绝且没有partial Candidate。
- [ ] 补到匹配答案后创建新的complete source set；旧record与bytes保持不变并记录successor ref。
- [ ] 错卷答案、question drift、重复答案均拒绝。
- [ ] 全流程无AI answer generation；正确项只来自后来附加的权威答案源。

## Non-goals

联网搜答案、自动配卷、AI解题、生产爬虫、版权资料同步服务、把source-only卷展示给学生、
为暂存source分配paperId特例。

## Verification

```bash
node scripts/verify-universal-nck1-source-only-intake.mjs
node scripts/verify-universal-nck1-source-only-boundaries.mjs
git check-ignore imports/source-only-fixture
pnpm -C app verify:changed
```
