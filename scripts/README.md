# Verify Script Index

This directory contains many cut-specific verify scripts. Prefer the
smallest script that proves the current risk. Do not run every script
just to create confidence theater.

Stable local/CI entrypoint: `npm run verify:all` from `app/`, which delegates
to `scripts/verify-ci.mjs`. It runs `git diff --check`, app
build/typecheck, then stable contract scripts. Install app dependencies with
`pnpm install --frozen-lockfile` from `app/` and server dependencies with
`npm ci` from `server/` before running it in a clean worktree. The GitHub
Actions template lives at `docs/ci/verify-workflow-template.yml`; installing it under
`.github/workflows/verify.yml` requires a token with workflow scope.
To inspect the stable verify registry without running it, use
`node scripts/verify-ci.mjs --list-json`.

Current install state: the workflow is not installed under `.github/workflows/`
because the available GitHub token has `repo` scope but not `workflow` scope.
See `docs/ci/verify-workflow-install.md`.

## Stable CI entrypoint

| Script | Scope | Runs in CI? |
| --- | --- | --- |
| `verify-ci.mjs` | Stable app build/typecheck plus core contracts used by GitHub Actions | yes |
| `verify-architecture-housekeeping.mjs` | Housekeeping guardrails: CI, code style, tokens, verify index | yes |
| `verify-h1-router-skeleton.mjs` | H1-A minimal route registry contract | yes |
| `verify-h1c-paper-import-routes.mjs` | H1-C Paper Import route extraction contract | yes |
| `verify-h1d-analysis-availability.mjs` | H1-D PaperSurface analysis availability owner contract | yes |
| `verify-i0e-seven-choices-entry.mjs` | I0-E 七选五 PaperSurface entry availability and label gate | yes |
| `verify-h1e-export-routes.mjs` | H1-E export route dispatch contract | yes |
| `verify-h5a-export-implementation.mjs` | H5-A export implementation extraction contract | yes |
| `verify-h1f-legacy-import-routes.mjs` | H1-F legacy import route dispatch contract | yes |
| `verify-h1g-question-group-routes.mjs` | H1-G question-group route dispatch contract | yes |

## Core data and import

| Script | Scope | Runs in CI? |
| --- | --- | --- |
| `verify-paper-asset-v1.mjs` | `paper-asset-v1` fixture and source-faithfulness contract | yes |
| `verify-c7-paper-import-contracts.mjs` | C7 schema / offline validator contracts | yes |
| `verify-c7-paper-import-publish.mjs` | C7 publish atomicity and storage protocol | yes |
| `verify-i1-paper-import-splitter.mjs` | I1 DOCX reading splitter endpoint and parser contract | no |
| `verify-i1-paper-import-route.mjs` | I1 owner-only `?view=paper-import-ai` parse / publish route | yes |
| `verify-i1-paper-import-analysis.mjs` | I1 owner-only analysis / publish endpoints, provider seam, JSON preview, and C7 package bridge contract | yes |
| `verify-i2-seven-choices-ai-import.mjs` | I2 七选五 AI 导题接入：splitter / analysis / package / route contracts | no |

## PaperSurface and Paper Intelligence

| Script | Scope | Runs in CI? |
| --- | --- | --- |
| `verify-paper-surface-module-v1.mjs` | Shared PaperSurface module contract; includes historical forbidden-scope checks | no |
| `verify-paper-surface-host-interaction.mjs` | Host interaction reducer run-form behavior and seam rules; includes cut-specific forbidden-scope checks | no |
| `verify-paper-surface-mjs-declaration-parity.mjs` | `.mjs` declaration parity | yes |
| `verify-paper-intelligence-paper-surface-harness.mjs` | Paper Intelligence harness contract | no |
| `verify-paper-intelligence-paper-surface-evidence.mjs` | Evidence-line behavior | no |
| `verify-paper-intelligence-paper-surface-insight.mjs` | Insight panel behavior | no |
| `verify-paper-intelligence-route-integration.mjs` | Paper Intelligence route integration | no |
| `verify-i0e-seven-choices-entry.mjs` | I0-E 七选五 PaperSurface entry availability and label gate | yes |

## C5 / C6 reading-analysis cuts

| Script | Scope |
| --- | --- |
| `verify-c5a-paragraph-structure-anchors.mjs` | Confirmed paragraph structure anchors |
| `verify-c5b-structure-brace.mjs` | Structure brace geometry and controls |
| `verify-c5b-po-qa-contract.mjs` | C5b PO QA contract |
| `verify-c6a-2-reading-a-analysis.mjs` | Reading A reviewed analysis |
| `verify-c6a3-reading-analysis-bridge.mjs` | Search card to PaperSurface route bridge |
| `verify-c6a4-paper-asset-analysis-loader.mjs` | Paper asset analysis loader |
| `verify-c6a5-search-entry-e2e.mjs` | Search entry end-to-end path |
| `verify-c6a6a-reading-b-analysis.mjs` | Reading B analysis data |
| `verify-c6a6b-open-reading-b-analysis-entry.mjs` | Reading B entry gate |
| `verify-c6a7-reading-c-analysis.mjs` | Reading C analysis data |
| `verify-c6a8-reading-d-analysis.mjs` | Reading D analysis data |
| `verify-c6a9-open-reading-cd-analysis-entry.mjs` | Reading C/D entry gate |
| `verify-c6a10-concierge-local-search.mjs` | Concierge local search |
| `verify-c6b1-option-anchored-analysis.mjs` | Option-anchored analysis panel |
| `verify-c6b2-analysis-entry-gate.mjs` | Data-driven analysis availability gate |

## Draft paper / export

| Script | Scope | Runs in CI? |
| --- | --- | --- |
| `verify-basket-persistence.mjs` | Basket persistence | yes |
| `verify-paper-draft.mjs` | Draft paper model / behavior | yes |
| `verify-concierge-desk.mjs` | Concierge desk behavior used by draft entry points | yes |
| `verify-c8-draft-paper-contracts.mjs` | C8 draft-paper API/search/workbench contract | yes |
| `verify-c8-my-space-contracts.mjs` | C8 PR B My Space storage/API/UI contract; cut-specific | no |
| `verify-c8-draft-paper-render-model.mjs` | C8 draft paper render model | yes |
| `verify-c8-print-ready-gate.mjs` | C8 print-ready gate | yes |
| `verify-paper-blocks-numbering.mjs` | Paper block numbering | no |
| `verify-paper-layout-roundtrip.mjs` | Layout model roundtrip | no |
| `verify-paper-export-flow.mjs` | Export flow | no |
| `verify-paper-export-payload.mjs` | Export payload | no |
| `verify-exam-export.mjs` | Exam export | no |
| `verify-print-renderer.mjs` | Print renderer | no |
| `verify-print-pdf-export-flow.mjs` | Print PDF export flow | no |

## Concierge and reading-analysis legacy

| Script | Scope |
| --- | --- |
| `verify-reading-analysis-route.mjs` | Legacy reading-analysis route |
| `verify-reading-analysis-selector.mjs` | Reading-analysis selector |
| `verify-reading-analysis-view-state.mjs` | Reading-analysis view state |
| `verify-reading-analysis-linking.mjs` | Reading-analysis linking |
| `verify-reading-analysis-annotation.mjs` | Reading-analysis annotation behavior |

## Miscellaneous / older Paper Intelligence cuts

| Script | Scope |
| --- | --- |
| `verify-dev-completion-report-contract.mjs` | External DEV completion report contract |
| `verify-calibration-preview.mjs` | Calibration preview |
| `verify-paper-intelligence-cut-d1.mjs` | Older Paper Intelligence D1 contract |
| `verify-paper-intelligence-preview.mjs` | Paper Intelligence preview |
| `verify-paper-intelligence-interactive-preview.mjs` | Interactive preview |
| `verify-paper-intelligence-evidence-audit.mjs` | Evidence audit |
| `verify-paper-surface-interaction-model-doc.mjs` | PaperSurface interaction model doc |
| `verify-paper-surface-prototype.mjs` | PaperSurface prototype |
| `verify-paper-surface-textmap-adapter-plan.mjs` | Text-map adapter plan |
| `verify-paper-surface-tokens.mjs` | Token contract |
