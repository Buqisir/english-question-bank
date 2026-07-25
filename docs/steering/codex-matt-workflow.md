# EQB × Matt development workflow

This is the practical guide for developing EQB with Matt Pocock's current
skills. It replaces the retired Auto-Next relay.

## The one picture

```text
small and clear
  └─ implement now → verify → review → commit → DONE

normal feature
  └─ grill-with-docs → to-spec → to-tickets
                         └─ fresh implement task per ticket
                         └─ owner QA when visible
                         └─ ship

huge and foggy
  └─ Wayfinder map
       └─ one fresh task per decision ticket
       └─ to-spec → to-tickets → implement
```

The owner opens every top-level task manually. An agent never creates the next
task.

## What “manual” means

Manual applies to the boundary between top-level tasks:

- no Auto-Next;
- no `create_thread` / fork / subagent successor;
- no long-lived coordinator waiting for later roles;
- one writer task at a time in a feature worktree;
- every completed task returns one copyable `Next`.

It does not disable the internal design of a Matt skill. `/research` may use a
background researcher. `/code-review` may use two independent reviewers for
Standards and Spec. Those workers finish inside the current skill and report
back to it. They never become the next ticket or phase.

## Skill attachment at the task boundary

When a new top-level task invokes a skill, its copyable block starts with the
complete Markdown attachment for the actual entry skill, followed by one blank
line. Implementation and fix tasks attach `$implement`; initial independent
reviews and focused re-reviews attach `$code-review`. Ask Matt, Wayfinder,
grilling, and other workflows attach their actual entry skill, not a proxy
skill or a downstream skill.

Only the entry skill is attached. TDD and ordinary Standards + Spec review
inside `$implement` do not receive separate attachments. A bare slash command,
bare `$skill-name`, or instruction to run an equivalent flow is not an
attachment.

Invocation availability and handoff referenceability are different checks. A
current task may claim that it invoked a skill only when that skill is in the
active catalog or the owner explicitly attached its `SKILL.md` in this task.
Being able to locate a file for a future handoff is not enough.

For an owner-created next top-level task, resolve the entry skill from an
owner-provided path or an existing global/project skill bridge. The attachment
is valid only when resolution yields one non-conflicting candidate whose
`SKILL.md` exists and is readable, whose path is a real absolute path, and
whose frontmatter `name` matches the requested skill. Multiple conflicting
candidates are ambiguous; report that ambiguity and do not guess. A skill with
`disable-model-invocation: true` can therefore remain explicit-only and still
be a valid verified handoff reference.

Referencing that skill in `Next` does not mean the current task invoked it and
does not authorize task creation. The owner still opens the next top-level task
and pastes the attachment-first block manually. Tracked examples use generic
absolute paths; real `Next` output uses the absolute path verified at that
time.

Report `SKILL UNAVAILABLE` only when a skill required for immediate invocation
is neither active nor owner-attached, or when a required handoff has no unique
verified real path. Do not report it merely because an otherwise verified
skill is explicit-only or absent from the automatic catalog. In a non-Codex
harness, explicitly declare `NATURAL-LANGUAGE FALLBACK` before following the
equivalent workflow in this document.

## Pick the entry point

| Situation | Entry |
| --- | --- |
| Small, clear, reversible | `/implement` now |
| Feature fits one planning context | `/grill-with-docs` |
| UI or state question needs something runnable | `/handoff` → `/prototype` → `/handoff` back |
| Multi-session build | `/to-spec` → `/to-tickets` |
| Huge and foggy | `/wayfinder` |
| Difficult bug | `/diagnosing-bugs` |
| Raw incoming issues | `/triage` |
| Codebase health | `/improve-codebase-architecture` |
| Unsure | `Ask Matt` |

## Planning thread

For a normal feature, keep `/grill-with-docs`, `/to-spec`, and `/to-tickets` in
one unbroken planning task while the context remains sharp.

During grilling:

- the agent finds code facts itself;
- the owner decides product and teaching questions;
- resolved domain terms go to `CONTEXT.md`;
- irreversible decisions become ADRs;
- a runnable uncertainty detours through a prototype;
- the planning task does not implement production code.

When the owner confirms shared understanding:

```text
把当前共识整理为 EQB 的 spec。不要重新拷问已经决定的问题。
```

After the spec:

```text
读取刚生成的 spec，把它切成 tracer-bullet tickets，写清 blocking edges。
每张票必须能在一个 fresh implementation task 内独立验收。
```

The planning task commits the spec and tickets, leaves the feature worktree
clean, then returns the exact first implementation prompt.

## Wayfinder

Use Wayfinder only when even the route to a spec is unclear.

Charting:

<!-- skill-required-handoff -->
```text
[$wayfinder](/absolute/path/to/wayfinder/SKILL.md)

Worktree: <absolute path>
Branch: <branch>
Expected HEAD: <commit>
Spec: not applicable
Ticket: not applicable
Fixed point: <commit>
Model: <model>
Effort: <low | medium | high | xhigh | max | ultra>
Prompt:
用附带的 Wayfinder skill 规划“<goal>”。只建立 map 和当前看得见的
decision tickets；不要同时解决 ticket。结束时给我唯一 Next。
```

Resolving:

<!-- skill-required-handoff -->
```text
[$wayfinder](/absolute/path/to/wayfinder/SKILL.md)

Worktree: <absolute path>
Branch: <branch>
Expected HEAD: <commit>
Spec: <exact map path>
Ticket: <exact decision ticket path>
Fixed point: <commit>
Model: <model>
Effort: <low | medium | high | xhigh | max | ultra>
Prompt:
继续这个 Wayfinder，解决指定的 frontier ticket。只解决这一张。
结束时更新 map，并给我唯一 Next。
```

One decision ticket equals one top-level task. When no open frontier or fog
remains, the next task synthesizes every closed decision into `spec.md`, then
creates implementation tickets. Wayfinder produces decisions, not production
code.

## Implementation

Each implementation ticket starts in a fresh top-level task against the same
sequential feature worktree:

<!-- skill-required-handoff -->
```text
[$implement](/absolute/path/to/implement/SKILL.md)

Worktree: <absolute path>
Branch: <branch>
Expected HEAD: <commit>
Spec: <exact spec path>
Ticket: <exact ticket path>
Fixed point: <commit>
Model: <model>
Effort: <low | medium | high | xhigh | max | ultra>
Prompt:
实现指定 ticket。先确认工作树干净且 HEAD 匹配，只做这张票。附带的
$implement skill 负责 TDD、相关验证、Standards + Spec review、修复和提交。
不要创建下一顶层任务；结束时给出唯一 Next。
```

`/implement` owns the complete ticket loop:

```text
understand → red/green vertical slices → relevant checks
→ Standards + Spec review → fix findings → commit
```

Do not bolt a standing PA, verification, CR, or RM relay onto every ticket.

## Independent review trigger

Open one fresh top-level `/code-review` task before shipping when the change
touches:

- schema or data-contract semantics;
- migrations, permissions, authentication, or persistence;
- PaperSurface anchors;
- print, PDF, DOCX, or export;
- production configuration;
- cross-cut architecture or an irreversible decision;
- repeated implementation failure or an explicit owner request.

Prompt:

<!-- skill-required-handoff -->
```text
[$code-review](/absolute/path/to/code-review/SKILL.md)

Worktree: <absolute path>
Branch: <branch>
Expected HEAD: <implementation HEAD>
Spec: <exact spec path>
Ticket: <completed ticket paths>
Fixed point: <implementation base>
Model: <model>
Effort: <low | medium | high | xhigh | max | ultra>
Prompt:
使用附带的 $code-review 运行 initial independent review，检查
<implementation base>...<implementation HEAD> 的 Standards 和 Spec。
只评审，不实现，不创建下一顶层任务；结束时给出唯一 Next。
```

The skill may use its bounded internal Standards and Spec reviewers. That is
review implementation, not task relay.

The first pass is the **Initial independent review**: `Fixed point` is the
implementation base and `Expected HEAD` is the implementation HEAD. If it
finds Must Fix defects, the fix task attaches `$implement`. The next
**Focused re-review** attaches `$code-review`, uses the previously reviewed
HEAD as `Fixed point`, and uses the new fix HEAD as `Expected HEAD`.

A focused re-review checks only the previous Must Fix findings, the current fix
diff, and direct regressions. It does not reopen the already reviewed history.
Only a concrete, substantive defect in or left by that fix diff that makes the
current implementation wrong, unsafe, or contrary to the accepted spec may
keep blocking. Wording, formatting, historical narrative, theoretical
boundaries, and unrelated improvements cannot be Must Fixes.

When no Must Fix remains, move immediately to owner QA or shipping. Do not open
another CR. “One fresh independent review” means one review lineage, not a
fresh full-range review after every fix.

## QA and shipping

For a user-visible change, the current task prepares at most five owner checks
and waits:

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
请按下面清单完成 owner QA。完成后回复“QA 完成”；
若失败，逐条描述实际结果。
```

After QA succeeds, the owner manually starts the ship task:

```text
在 <worktree> 收口并发布当前 initiative。
确认工作树、提交和必要 review/QA 证据；运行缺失的 release checks，
推送/合并，确认 main CI，更新 STATUS。不要创建下一任务。
全部完成后回复 DONE。
```

The ship task is an action, not a persistent RM persona.

## Fresh task versus current task

Start a fresh top-level task for:

- each Wayfinder decision ticket;
- each implementation ticket;
- an independent high-risk review;
- shipping;
- a handoff caused by context degradation.

Stay in the current task for:

- one Wayfinder ticket's grilling rounds;
- `/grill-with-docs` → `/to-spec` → `/to-tickets`;
- one ticket's TDD and code-review loop;
- owner QA and the owner's `QA 完成` reply.

## Context stop signals

At the end of a phase, choose one path in this order:

1. enough smart context, or a simple remainder: continue the current task;
2. disposable context: clear and start clean;
3. crossing to another agent, directory, or colleague: `/handoff`;
4. bounded AFK work that needs no human input: use an internal worker that
   reports back to the current task;
5. valuable context, no boundary crossing, and continued human involvement:
   compact and continue the same ticket.

Treat the current context as degraded when the agent:

- asks a settled question again;
- forgets an explicit out-of-scope item;
- rereads the same files without producing new evidence;
- mixes tickets or roles;
- expands the process to compensate for confusion;
- spends more time narrating coordination than building the product.

Do not wait for a numeric token threshold. A subagent is never the next ticket
or phase.

## Existing work already in flight

Do not restart or re-document an active feature merely because the workflow
changed.

- Treat its accepted `plan.md` as the source spec.
- Keep completed PA/CR/verification artifacts as historical evidence.
- Ignore its `agent-entrypoint.md` for routing.
- Finish the current bounded implementation or QA step.
- At that boundary, return a manual `Next` for the remaining ticket/phase.
- Create new `tickets/` only when the remaining work genuinely needs more than
  one fresh implementation context.

For `applied-writing-lecture`, this means preserving the accepted decisions and
current implementation branch, then continuing the next unfinished slice in a
fresh manual task. Do not rerun Wayfinder or re-grill settled teaching/UI
decisions.

## Required `Next`

New top-level task:

Write the instruction to open a new task outside the fence. The copyable block
is attachment-first when it invokes a skill:

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
<complete prompt>
```

Fill all applicable anchors for the task type; do not mechanically demand an
irrelevant spec, ticket, or fixed point. Use `not applicable` only when it truly
does not apply, and repeat every relevant path/commit in the block so the owner
never has to find or remember an artifact. Normal effort defaults are
`low`/`medium`/`high`; `xhigh`/`max`/`ultra` require explicit owner direction
and lower-effort inadequacy evidence under `model-routing.md`.

A result-only final message is invalid. If the next task implements or fixes an
implementation ticket, attach `$implement`; initial independent review and
focused re-review tasks attach `$code-review`. Only the entry skill is
attached; `$implement` owns TDD, relevant checks, ordinary Standards + Spec
review, fixes, and commit.

Same task:

```text
Next：留在当前任务
Prompt:
<complete prompt>
```

Nothing remains:

```text
DONE
```

## Example: 应用文讲评渲染

1. Wayfinder decides who can see commentary, the teaching sequence, export
   boundaries, and pilot scope. Each decision is one fresh task.
2. A planning task synthesizes the decisions into `spec.md`: teacher
   commentary mode only; 审题 → 范文映射 → 亮点; browser host overlay only;
   excluded from print/PDF/DOCX; one pilot paper.
3. `/to-tickets` creates vertical slices such as published-card loading,
   answer-area/rail rendering, export exclusion, and pilot acceptance.
4. Each ticket runs in a fresh `/implement` task. The skill performs TDD,
   relevant verification, its two-axis code review, fixes, and commit.
5. Because export boundaries are involved, one fresh top-level `/code-review`
   checks the complete diff against the fixed point.
6. The owner performs the five-item browser QA in the same QA task.
7. A manually opened ship task merges, watches `main` CI, updates STATUS, and
   returns `DONE`.
