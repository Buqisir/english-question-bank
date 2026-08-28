# 10 — 详解版与纯答案键的统一 answer-source closure

- Status: planned
- Blocked by: None for DOCX；PDF/image分别复用tickets 03/09的carrier adapter
- Next on PASS: None

- Spec: `docs/cuts/import-format-capabilities/spec.md`
- Matrix rows: C08, C09, C11, R05

## Outcome

答案来源按内容事实标记为`detailed`或`key_only`，而不是按DOCX/PDF/图片另建格式。两者都从
唯一权威答案值生成Canonical answers；详解中的解释保留为source supplement，纯答案键则
明确记录“源未提供详解”，不把后续AI教学分析冒充源详解。

## Input and fixture

两份最小synthetic answer DOCX，共用同一题卷：

- `detailed`：完整45项短答案，其中2项各带1句短解释，另有1个短写作范文；
- `key_only`：相同45项答案，无解释、无范文；
- 负例：漏一个语法填空答案、答案键与详解正确项冲突、解释无法绑定题号、把AI生成文本
  标成source explanation。

后续PDF/image fixtures保持完全相同的answer-shape observations，只更换carrier locator。
另加一个题卷与答案同文件fixture；只有唯一、明确、可定位的answer-section boundary才允许
拆分，不能按页数或“后半文件大概是答案”猜测。

## Public seam

- 在现有Source Materialization answer source of truth增加`disposition=detailed|key_only`和
  coverage；`answers[]`仍是唯一正确项authority，不复制答案模型。
- `key_only`必须闭合该卷所有实际作答值：NCK1 21–65，包含56–65文本答案；只有选择题
  ABCD而缺填空答案仍是incomplete source。写作官方范文可以`not_supplied`。
- `detailed`逐题解释保留source locator与原文digest，作为九题组教学分析的source
  supplement/Review evidence。它不能覆盖冲突答案，也不自动进入学生版或教师版。
- 教学分析仍按现有流程生成/审核；所有正确项必须等于`answers[]`。UI明确标示“源详解”与
  “AI生成并审核的教学分析”，不能混称官方解析。
- 有听力题时，transcript/audio closure独立判断；纯答案键不允许伪造缺失听力原文。
- `question_and_answers`文件先在carrier层闭合question/answer regions，再进入同一answer-shape
  seam；Student surface只来自Canonical question blocks，绝不直接呈现合并source文件。

## Fail closed

复用`NCK1_DOCX_ANSWER_MISSING`, `NCK1_DOCX_ANSWER_CONFLICT`,
`NCK1_DOCX_ANSWER_RANGE_AMBIGUOUS`；新增`NCK1_ANSWER_SOURCE_DISPOSITION_AMBIGUOUS`,
`NCK1_SOURCE_EXPLANATION_TARGET_AMBIGUOUS`, `NCK1_SOURCE_EXPLANATION_ANSWER_CONFLICT`,
`NCK1_COMBINED_SOURCE_BOUNDARY_AMBIGUOUS`。

## Acceptance criteria

- [ ] 两份source产生相同45项authority values和不同、明确的answer disposition。
- [ ] key-only可形成Candidate，但九题组analysis完成前仍不能进入Owner QA/发布。
- [ ] detailed explanation逐题保留source locator；不自动替换Canonical答案或审核后analysis。
- [ ] combined source只在唯一boundary下成功；Student三面不含answer region source文本。
- [ ] 缺填空答案、答案冲突、无题号解释、伪造source provenance分别fail closed。
- [ ] Student始终不见答案/解析；Teacher能区分权威答案、源详解和审核后教学分析。

## Non-goals

让AI补答案、强制源提供写作范文、把详解全文直接发布、答案质量裁判、逐个carrier复制
answer parser、真实长篇解析fixture。

## Verification

```bash
node scripts/verify-nck1-docx-materialization-producer.mjs
node scripts/verify-nck1-answer-source-shapes.mjs
node scripts/verify-nck1-source-materialization.mjs
node scripts/verify-universal-nck1-candidate-surfaces.mjs paper-synthetic-answer-shapes
pnpm -C app verify:paper
pnpm -C app verify:all
```
