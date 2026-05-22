# Verify Script Index

This directory contains many cut-specific verify scripts. Prefer the
smallest script that proves the current risk. Do not run every script
just to create confidence theater.

CI status: manual unless a workflow explicitly calls a script.

## Core data and import

| Script | Scope |
| --- | --- |
| `verify-paper-asset-v1.mjs` | `paper-asset-v1` fixture and source-faithfulness contract |
| `verify-c7-paper-import-contracts.mjs` | C7 schema / offline validator contracts |
| `verify-c7-paper-import-publish.mjs` | C7 publish atomicity and storage protocol |

## PaperSurface and Paper Intelligence

| Script | Scope |
| --- | --- |
| `verify-paper-surface-module-v1.mjs` | Shared PaperSurface module contract |
| `verify-paper-surface-host-interaction.mjs` | Host interaction reducer / state rules |
| `verify-paper-surface-mjs-declaration-parity.mjs` | `.mjs` declaration parity |
| `verify-paper-intelligence-paper-surface-harness.mjs` | Paper Intelligence harness contract |
| `verify-paper-intelligence-paper-surface-evidence.mjs` | Evidence-line behavior |
| `verify-paper-intelligence-paper-surface-insight.mjs` | Insight panel behavior |
| `verify-paper-intelligence-route-integration.mjs` | Paper Intelligence route integration |

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

| Script | Scope |
| --- | --- |
| `verify-basket-persistence.mjs` | Basket persistence |
| `verify-paper-draft.mjs` | Draft paper model / behavior |
| `verify-paper-blocks-numbering.mjs` | Paper block numbering |
| `verify-paper-layout-roundtrip.mjs` | Layout model roundtrip |
| `verify-paper-export-flow.mjs` | Export flow |
| `verify-paper-export-payload.mjs` | Export payload |
| `verify-exam-export.mjs` | Exam export |
| `verify-print-renderer.mjs` | Print renderer |
| `verify-print-pdf-export-flow.mjs` | Print PDF export flow |

## Concierge and reading-analysis legacy

| Script | Scope |
| --- | --- |
| `verify-concierge-desk.mjs` | Concierge desk behavior |
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
