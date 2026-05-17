# Project Memory

This file is the lightweight route map for future agents after context compaction. It is not a changelog and not a product spec. It records the stable coordination decisions and the current product route that should survive chat history loss.

Last updated: 2026-05-17

## Product North Star

Build a local-first English question-bank workbench for teachers.

The first usable product loop is:

1. Search or open a source paper.
2. Read the paper-level intelligence preview: "one paper, understand what to teach in 10 minutes".
3. Inspect passage-level loads, answer evidence, distractor evidence, and cross-column visual links.
4. Add a passage/question group to the Assembly Basket.
5. Return to the workbench and continue assembling a Paper Set.
6. Save/export teacher/student versions.

The product should feel like a teacher-owned material workbench, not a generic question marketplace.

## Current Big Route

The immediate roadmap is **Paper Intelligence -> Assembly Basket Bridge**.

Plan-reviewed split:

- Cut A: route/data bridge.
  - Bring Paper Intelligence route into `App` shell.
  - Add `PassageReport.questionGroupId?: string`.
  - Add bundled A-D sample question-group IDs and ensure they resolve locally.
  - Add props to `PaperIntelligencePreview`, but do not render a button yet.
- Cut B: add-to-basket button and basket persistence.
  - Passage header button states: `加入草稿卷`, `已加入`, `暂不可加入`, `题组未找到`.
  - Click adds the resolved question group to the Assembly Basket.
  - Basket persists across refresh with localStorage.
  - Do not persist to backend Paper Set automatically.
- Cut C: return-to-workbench navigation.
  - Top bar: `返回工作台`, `一张卷，10 分钟看懂讲哪里`, `草稿卷 N`.
  - Navigation should not reload the page.
  - Basket state must survive.

Important correction: for basket persistence, do not use a delayed debounce that creates a loss window. Basket state is important; persist immediately on basket item changes or with an effect that writes synchronously after React state commits.

## Stable Product Decisions

- The user is a teacher first; backend worker/reviewer views are secondary.
- Passage is the minimum meaningful add unit for Paper Intelligence -> Assembly Basket.
- Do not add single-question basket actions for this bridge.
- Do not add whole-paper one-click add in this MVP slice.
- Evidence/highlight/line visualization matters because it lets teachers trust and inspect analysis quickly.
- Paper Intelligence is read-only analysis. Editing/annotation is a separate workflow.
- Assembly Basket is an in-progress workspace state; Paper Set save is the formal durable database save.
- V0 stays local-first: no account, no cloud sync, no automatic backend write for basket.

## Stable Technical Seams

- `App.tsx` owns Assembly Basket and Paper Draft state.
- `PaperIntelligencePreview` should stay presentational and receive basket bridge props.
- Paper Intelligence must not import `usePaperDraft`, `QuestionGroupCard`, or backend APIs directly.
- `App` maps `questionGroupId` to real question groups.
- `questionGroupId` is the explicit bridge. Do not fuzzy-match by passage title, paper section, year, or text.
- `input.json` carries source passage bodies. `report.json` carries analysis and bridge metadata.
- Reading Analysis and Paper Intelligence are separate routes and should not share mutable sidecar state.

## Multi-Agent Workflow

Source of truth: `docs/process/ai-team-workflow.md`.

Short version:

1. User raises direction.
2. Local Codex classifies big cut / small cut / release hygiene / discussion.
3. Big cut gets a Cut Sheet and Plan Reviewer review.
4. Local Codex turns the reviewed cut into small Kiro coder prompts.
5. Kiro Coder implements one small branch/PR.
6. PR Reviewer reviews actual diff.
7. Local Codex decides fix/defer based on `Must fix` and `Should watch`.
8. Local Codex acts as Release Manager for local build/verify/smoke.
9. User merges.

Hard rule: `Must fix` defaults to must-fix. Overriding it requires written reason, risk, follow-up, and explicit user confirmation.

## Role Map

- User: Founder, product owner, teaching authority, final merge decision.
- Local Codex: tech lead, route coordinator, prompt writer, release manager.
- Plan Reviewer: second architect for big cuts.
- Kiro Coder: implementation engineer.
- PR Reviewer: senior reviewer of actual diffs.
- Deep Reviewer: escalation for hard architecture, prompt/schema, difficulty system, and unresolved disagreements.

## Release Gates

Before a release-style `GO`, report:

- current branch and commit hash
- `git status -sb`
- build result
- relevant verify script counts
- relevant smoke script counts
- manual UI path result when UI changed
- blockers and watches
- final verdict: `NO-GO`, `GO WITH WATCH`, or `GO`

If the environment cannot run build/smoke, say why and identify the machine/tooling needed. Do not fabricate smoke results.

## Recurring Pitfalls

- Do not mix process docs into product feature branches.
- Do not trust `origin` blindly; in this repo, `github` is the GitHub remote and `origin` may be a local path.
- Cloud agents often cannot run npm install, build, or Playwright smoke. Local Release Manager must confirm.
- Reviewers must review actual PR diff, not only the completion report.
- Retire or update stale smoke scripts when product IA changes.
- Do not let Paper Intelligence become an editor before the MVP read/add loop works.

## Current Process Docs

- `docs/process/ai-team-workflow.md`: hard workflow rules.
- `docs/process/cut-sheet-template.md`: template for big-cut planning before Plan Reviewer.
- `docs/process/project-memory.md`: this compaction-safe route map.
