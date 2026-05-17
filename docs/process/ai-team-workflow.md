# AI Team Workflow

This document records the hard rules for how this project uses multiple AI agents. It is intentionally lightweight: enough structure to prevent drift, not enough ceremony to slow every small fix.

## Roles

- User / Founder: owns product direction, teaching judgment, merge decisions, and release acceptance.
- Local Codex: tech lead and release manager. It turns fuzzy goals into cuts, keeps architecture coherent, writes prompts, reads reviews, and runs local release checks.
- Plan Reviewer: second architect for large cuts. It reviews the plan before implementation and challenges scope, sequencing, data ownership, and UI direction.
- Kiro Coder: implementation engineer. It works on a feature branch, commits, pushes, and opens a PR. It does not push `main` and does not force push.
- PR Reviewer: senior code reviewer. It reviews the actual PR diff and returns `Must fix`, `Should watch`, and `Verdict`.
- Deep Reviewer: escalation reviewer for hard product architecture, difficulty systems, prompt/schema changes, and disagreements between Codex and the Plan Reviewer.

## Default Flow

1. User raises a goal, pain point, or product direction.
2. Local Codex classifies the work as one of:
   - Big cut: architecture, data model, cross-module UI, persistence, release-critical behavior.
   - Small cut: narrow fix, test hardening, copy tweak, CSS polish, verify update.
   - Release hygiene: build, smoke, stale script cleanup, docs/process cleanup.
   - No-op / discussion: product thinking only, no code.
3. Big cuts require a Cut Sheet and Plan Reviewer review before coding.
4. Local Codex turns the reviewed big cut into one or more small coder prompts.
5. Kiro Coder implements one small cut per branch/PR unless the prompt explicitly says otherwise.
6. PR Reviewer reviews the diff, not the intent. It must inspect the actual changed files.
7. Local Codex reads the review and decides:
   - `Must fix`: send a fix prompt by default.
   - `Should watch`: either defer with a reason or turn into a follow-up cut.
   - `PASS`: move to release checks.
8. Local Codex runs release-manager checks on local `main` or the exact PR branch as appropriate.
9. User merges only after Local Codex says `GO`, or explicitly accepts a documented `GO WITH WATCH`.

## Hard Rules

- A `Must fix` from PR Reviewer is treated as mandatory by default.
- Local Codex may override a `Must fix` only by writing the reason, risk, and follow-up plan, then asking the User to confirm.
- Plan Reviewer is required for big cuts, but not for every small cut.
- Small cuts can go directly from Codex prompt to Kiro Coder to PR Reviewer.
- Release Manager work must be mechanical: build, verify, smoke, manual key path, git clean. No vibes.
- Release Manager should not secretly implement product fixes. If release checks find a bug, create a fix cut.
- Kiro Coder prompts must include explicit non-goals. Out-of-scope discoveries go into the completion report, not into the same PR.
- No agent pushes `main`.
- No agent force-pushes unless the User explicitly authorizes it for a specific branch.
- Do not mix unrelated concerns in one branch. Process docs, prompt docs, UI features, and release fixes get separate branches.
- Keep static verify scripts close to the behavior they guard. If a feature changes, update or retire stale verify/smoke scripts in the same cut.

## When To Use Plan Reviewer

Use Plan Reviewer when the cut changes any of:

- Domain model or persistence.
- Cross-module state ownership.
- Route structure or product entry points.
- Teacher-facing workflow.
- Evidence/highlight/line visualization semantics.
- AI prompt/schema contracts.
- Difficulty or load-system definitions.
- Release gates and team process rules.

Skip Plan Reviewer for:

- One-file CSS or copy polish.
- Retiring stale smoke scripts.
- Adding missing static assertions after a reviewer already approved the direction.
- Mechanical fix rounds that directly address PR Reviewer `Must fix` items.

## Release Manager Checklist

Before `GO`, Local Codex reports:

- Current branch and commit hash.
- `git status -sb`.
- Build result.
- Relevant verify scripts and counts.
- Relevant smoke scripts and counts.
- Manual key path result for UI changes.
- Files changed and out-of-scope files untouched.
- Blockers.
- Watches.
- Final verdict: `NO-GO`, `GO WITH WATCH`, or `GO`.

If the environment cannot run build or smoke, the report must say exactly why and name the machine/tooling needed to clear the gate.

## PR Decision Record

For every non-trivial PR, Codex keeps a short decision in the PR description/comment or the chat:

- What changed.
- What was verified.
- PR Reviewer verdict.
- Must-fix handling.
- Watch items accepted.
- Merge decision.

Do not create a separate process file for every PR unless the decision changes architecture.

## Process Anti-Goals

- No weekly status bureaucracy.
- No risk registry unless a launch actually needs one.
- No role charter documents beyond this file.
- No Plan Reviewer for tiny fixes.
- No "AI agent consensus" requirement. Disagreement is useful; final technical decision belongs to Local Codex, final product decision belongs to the User.
