# Ticket Completion Report Template

```text
Result: PASS | BLOCKED
Ticket: <path>
Commit: <hash>
Changed: <short file list>
Verify: <command: exit code; command: exit code>
Browser QA: required | passed | pending | not applicable
Risks: none | <short list>
```

Use verify summaries only. No raw command logs or implementation diary.

End with exactly one of:

A result-only final message is invalid. If the next task implements or fixes an
implementation ticket, attach `$implement` as the entry skill. Initial
independent review and focused re-review tasks attach `$code-review`. Only the
entry skill is attached; `$implement` owns TDD, relevant checks, ordinary
Standards + Spec review, fixes, and commit.

For a new top-level task, put the instruction to open the task outside the
fence. If the task invokes a skill, line one is its complete Markdown
attachment, followed by one blank line:

<!-- skill-required-handoff -->
```text
[$skill-name](/absolute/path/to/skill-name/SKILL.md)

Worktree: <absolute path>
Branch: <branch>
Expected HEAD: <commit>
Spec: <exact path | not applicable>
Ticket: <exact path | not applicable>
Fixed point: <commit | not applicable>
Model: <model>
Effort: <low | medium | high | xhigh | max | ultra>
Prompt:
<complete copyable prompt>
```

Do not confuse current-task invocation with handoff referenceability. Claim an
invocation only when the skill is active or owner-attached in this task. A
handoff may instead use an owner-provided path or an existing global/project
skill bridge, including an explicit-only skill with
`disable-model-invocation: true`, after verifying exactly one non-conflicting
real absolute, readable `SKILL.md` whose frontmatter `name` matches.

The handoff reference does not mean this task invoked the skill and does not
authorize creation of the next task. Report ambiguity rather than guessing.
Use `SKILL UNAVAILABLE` only when immediate invocation is required but the
skill is neither active nor attached, or no unique verified handoff path
exists. Preserve `NATURAL-LANGUAGE FALLBACK` for a declared non-Codex
equivalent. A slash command, bare skill name, or “equivalent flow” is not an
attachment. QA, `DONE`, and other no-skill exits omit the attachment.

Fill all applicable anchors for the task type. Use `not applicable` only when
an anchor genuinely does not apply. Repeat exact paths and commits; the owner
should not have to find or remember any artifact.

Normal defaults are `low`, `medium`, or `high`. `xhigh`, `max`, and `ultra`
require explicit owner direction and evidence that a lower effort was
inadequate.

```text
Next：等待人工 QA
Worktree: <absolute path>
Branch: <branch>
Expected HEAD: <commit>
Spec: <exact path | not applicable>
Ticket: <exact path | not applicable>
Fixed point: <commit | not applicable>
QA checklist: <inline 3-5 checks or exact path>
Prompt:
请按以上清单完成 owner QA。完成后回复“QA 完成”；若失败，逐条描述实际结果。
```

```text
Next：留在当前任务
Prompt:
<complete copyable prompt>
```

```text
DONE
```
