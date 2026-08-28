# 10 — 详解版与纯答案键的统一 answer-value closure

- Status: planned
- Blocked by: None for DOCX；PDF/image分别复用tickets 03/09的carrier adapter
- Next on PASS: None

- Spec: `docs/cuts/import-format-capabilities/spec.md`
- Matrix rows: C08, C09, C11, R05

## Outcome

`detailed`与`key_only`不是两套产品模型。无论DOCX/PDF/图片，producer都只提取完整的
权威答案值并生成同一种Canonical answers。逐题详解不进入Materialization、Canonical、
Review projection或Teacher surface，也不单独提取保存；原答案文件只作为不可变来源证据。

## Input and fixture

两份最小synthetic answer DOCX，共用同一题卷：

- `detailed`：完整45项短答案，其中2项各带1句短解释，另有1个短写作范文；
- `key_only`：相同45项答案，无解释、无范文；
- 负例：漏一个语法填空答案、答案值与详解边界不唯一、任一详解token进入Candidate或
  Teacher surface。

后续PDF/image fixtures保持完全相同的answer-shape observations，只更换carrier locator。
另加一个题卷与答案同文件fixture；只有唯一、明确、可定位的answer-section boundary才允许
拆分，不能按页数或“后半文件大概是答案”猜测。

## Public seam

- 不新增`detailed|key_only`产品字段、source supplement或第二套答案模型；`answers[]`继续是
  唯一正确项authority。carrier adapter可在解析时识别答案区边界，但不向下游传详解内容。
- `key_only`必须闭合该卷所有实际作答值：NCK1 21–65，包含56–65文本答案；只有选择题
  ABCD而缺填空答案仍是incomplete source。写作官方范文可以`not_supplied`。
- `detailed`只在确定的答案区读取答案值；答案区之后的逐题详解不创建locator、digest或
  Canonical node。原答案document的bytes/digest仍按Source Capture规则保留，以证明答案出处。
- 教学分析仍按现有流程生成/审核；所有正确项必须等于`answers[]`，且不得读取、显示或
  冒充原答案文件中的逐题详解。
- 有听力题时，transcript/audio closure独立判断；纯答案键不允许伪造缺失听力原文。
- `question_and_answers`文件先在carrier层闭合question/answer regions，再进入同一answer-shape
  seam；Student surface只来自Canonical question blocks，绝不直接呈现合并source文件。

## Fail closed

复用`NCK1_DOCX_ANSWER_MISSING`, `NCK1_DOCX_ANSWER_CONFLICT`,
`NCK1_DOCX_ANSWER_RANGE_AMBIGUOUS`；新增`NCK1_ANSWER_VALUE_BOUNDARY_AMBIGUOUS`,
`NCK1_ANSWER_DETAIL_LEAK_DETECTED`, `NCK1_COMBINED_SOURCE_BOUNDARY_AMBIGUOUS`。

## Acceptance criteria

- [ ] 两份source产生完全相同的45项authority values，不新增answer disposition。
- [ ] key-only可形成Candidate，但九题组analysis完成前仍不能进入Owner QA/发布。
- [ ] detailed source的逐题详解不出现在Materialization、Canonical、Review projection或三面。
- [ ] combined source只在唯一boundary下成功；Student三面不含answer region source文本。
- [ ] 缺填空答案、答案冲突、答案边界不明、详解泄漏分别fail closed。
- [ ] Student始终不见答案/解析；Teacher只见权威答案与另行审核的教学分析。

## Non-goals

让AI补答案、强制源提供写作范文、提取或保存逐题详解、把详解直接发布、答案质量裁判、
逐个carrier复制answer parser、真实长篇解析fixture。

## Verification

```bash
node scripts/verify-nck1-docx-materialization-producer.mjs
node scripts/verify-nck1-answer-source-shapes.mjs
node scripts/verify-nck1-source-materialization.mjs
node scripts/verify-universal-nck1-candidate-surfaces.mjs paper-synthetic-answer-shapes
pnpm -C app verify:paper
pnpm -C app verify:all
```
