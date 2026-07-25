# Handoff Template

Cut:
Last updated:
Branch:
PR:

## Current Truth

- 

## Completed

- 

## Still Open

- 

## Must Not Forget

- 

## Things The Next Cut Must Know

1. Pattern:
   - Evidence:
   - Rule:

## Verify / QA State

- 

## Next Action

Put the instruction to open the new top-level task outside the fence. The
copyable block below is attachment-first when the task invokes a skill:

This section is not an owner-QA handoff. Owner QA stays in the current task,
which must provision and open the page using
`docs/agents/owner-qa-handoff-template.md`; never use this template to defer QA
setup to a successor.

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
<one complete next step>
```
