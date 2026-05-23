# H2 Goal — Workflow / Verify / CI Discipline

Status: Closed at H2-C.
Date: 2026-05-23

## Objective

Make the project workflow enforceable from repo files, so future agents can
start from documented truth instead of chat memory.

H2 is one **Goal**. It does not have to be one PR.
H2 closed after H2-A, H2-B, and H2-C. Do not add H2-D.

## Why H2 Exists

H1 closed server route ownership at H1-G. During H1 closeout, the remaining
housekeeping concerns were split into separate cuts:

- H2: workflow / verify / CI discipline
- H3: frontend component slimming
- H4: design tokens / UI consistency
- H5: server implementation extraction

H2 exists because the repo already has many useful process pieces, but they
need to become a repeatable operating system:

- cut docs and agent entrypoints should carry long context;
- verify scripts need a stable index and CI-facing entrypoint;
- CI installation needs a clear path and token/scope constraint;
- Cut Notes and watch items should not be optional memory;
- large goals must not silently become unreviewable single PRs.

## Current Baseline

Already present before H2 implementation starts:

- `.kiro/steering/cut-workflow-protocol.md`
- `docs/cuts/_templates/agent-entrypoint.md`
- `docs/cuts/_templates/cut-note.md`
- `docs/cuts/_templates/handoff.md`
- `scripts/README.md`
- `scripts/verify-ci.mjs`
- `docs/ci/verify-workflow-template.yml`
- `docs/code-style.md`
- `app/src/shared-ui/tokens.css`
- `scripts/verify-architecture-housekeeping.mjs`

H2 should tighten and enforce these pieces. Do not rebuild them from scratch
unless verification proves they are wrong.

## In Scope

- clarify repo-file handoff as a hard rule for multi-agent work;
- tighten PR size / runtime-file count guardrails;
- define when one Goal must split into multiple PRs;
- make Cut Note and watch-ledger expectations actionable;
- make PA / Big CR reports include useful cost / token metadata when available;
- keep `scripts/README.md` aligned with the stable verify suite;
- make `scripts/verify-ci.mjs` the stable local/CI entrypoint;
- document the GitHub Actions install path and workflow-scope caveat;
- add small static checks only when they prevent drift.

## Out Of Scope

H2 must not do the following:

- product features;
- server route extraction or server implementation extraction;
- Draft Paper / PaperSurface / My Space UI changes;
- frontend component slimming;
- broad design-token migration;
- database schema changes;
- PaperSurface renderer / anchor protocol changes;
- reading-analysis or paper-asset data changes.

If implementation needs any of the above, stop and open H3, H4, H5, or a
product cut instead.

## Recommended PR Plan

### H2-A — Workflow Rules

Make the human/agent workflow rules current and explicit.

Likely files:

- `.kiro/steering/cut-workflow-protocol.md`
- `docs/cuts/_templates/*`
- `docs/cuts/H2-workflow-verify-ci-discipline/*`

Required result:

- repo-file handoff rule is authoritative;
- large-cut Cut Notes have minimum fields;
- Should Watch items have a required destination;
- one Goal vs one PR distinction is explicit;
- CR-lite includes a short failure/attack-angle paragraph for large cuts.

### H2-B — Verify / CI Discipline

Make verification discoverable and stable.

Likely files:

- `scripts/README.md`
- `scripts/verify-ci.mjs`
- `scripts/verify-architecture-housekeeping.mjs`
- `docs/ci/verify-workflow-template.yml`
- `.github/workflows/verify.yml` only if a token with workflow scope is
  available and the owner explicitly approves installing the workflow.

Required result:

- `npm run verify:all` remains the stable app-local command;
- `scripts/README.md` names which scripts are CI-stable and which are cut-local;
- CI setup remains reproducible even if workflow install cannot happen yet;
- static verify catches drift in the workflow/verify docs.

### H2-C — Closeout Proof

Close H2 without turning it into a permanent process umbrella.

Likely files:

- `docs/cuts/H2-workflow-verify-ci-discipline/cut-note.md`
- `docs/cuts/H2-workflow-verify-ci-discipline/handoff.md`
- maybe a small watch ledger if H2 leaves follow-up risks

Required result:

- H2 says what changed, what did not change, and where H3/H4/H5 begin;
- future housekeeping does not keep adding H2-D/H2-E forever.

## Gates

For every H2 implementation PR:

- start from latest `main`;
- keep runtime changes narrow and named before DEV;
- run `git diff --check`;
- run the smallest relevant verify script;
- run `npm run verify:all` from `app/` if scripts, workflow, package scripts,
  or stable verify contracts changed;
- do not run browser QA unless visible UI changed;
- write CR / completion notes into repo files when they contain material
  decisions.

Big PA is not required for normal H2 work. Use external Big PA / Big CR only if:

- CI behavior changes in a way that could block all PRs;
- the PR exceeds the size gate;
- the workflow rules conflict with current practice;
- Codex cannot resolve a process decision without owner input.

## Completion Standard

H2 is complete when:

- future agents can start from
  `docs/cuts/H2-workflow-verify-ci-discipline/agent-entrypoint.md`;
- stable verify and CI expectations are documented and checked;
- Cut Note / handoff templates are usable without chat explanation;
- H2 has its own `cut-note.md`;
- H2 handoff routes remaining work to H3 / H4 / H5 instead of extending H2.

## Short Agent Prompt

Use this when starting the H2 Goal:

```text
Read docs/cuts/H2-workflow-verify-ci-discipline/agent-entrypoint.md.
Implement H2 Workflow / Verify / CI Discipline from the repo docs only.
Treat H2 as one Goal, not necessarily one PR. Start with H2-A unless the
entrypoint says another phase is active. Keep all substantive prompts, reports,
decisions, and handoffs in repo files. Do not touch product features, server
runtime behavior, frontend UI, PaperSurface, database schema, or paper data.
Run the relevant verify scripts and git diff --check before reporting.
```
