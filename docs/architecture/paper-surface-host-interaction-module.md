# PaperSurface Host Interaction Module

Status: proposed architecture direction
Date: 2026-05-20
Scope: `surface=paper` Paper Intelligence harness only

## Problem

`PaperIntelligencePaperSurfaceHarness.tsx` is now a broad host module. It owns data loading, active question state, evidence state, insight rail state, Structure Brace state, viewport flags, scroll effects, DOM refs, and rendering. That made sense while PaperSurface cuts were small. After C3-C5b, the file has become a shallow module: the caller sees one JSX component, but the implementation contains several interaction rules that must be remembered together.

The risky rules are product rules, not visual details:

- Teacher question focus and evidence line focus are allowed to coexist with the Structure Brace.
- Insight passage changes clear Structure Brace state.
- Breakpoint and resize changes clear state rather than remeasure stale DOM.
- Structure rows may scroll without showing a brace at `<=1359px`.
- PaperSurface stays dumb; the host queries `data-paper-*` anchors.

When these rules live only as scattered effects and handlers, future agents can fix one symptom and accidentally break another.

## Direction

Create a deeper harness-owned module for PaperSurface host interaction. This module is not PaperSurface and does not change PaperSurface's renderer or data model.

The module should concentrate host state transitions behind a smaller interface:

- active teacher focus
- active evidence focus
- active passage structure target
- rail lock/detail state
- viewport mode
- reset/clear rules when one interaction changes another

The harness component should keep DOM measurement and rendering, but interaction decisions should move behind this seam.

## Non-Goals

- Do not move Paper Intelligence schema or adapter logic into this module.
- Do not make PaperSurface aware of Paper Intelligence.
- Do not introduce a global app state store.
- Do not change Structure Brace geometry in the same cut.
- Do not redesign the rail in the same cut.

## Candidate Module Shape

Suggested location:

```text
app/src/features/paper-intelligence/paperSurfaceHostInteraction.ts
```

The first implementation should be a reducer-style module rather than a hook. A reducer gives better test leverage: tests can exercise transitions without a browser or DOM.

The interface should be small enough that a test can express product rules in direct state transitions:

```text
initial state
dispatch open passage A
dispatch choose paragraph A-P2
dispatch resize
expect activeStructureTarget null
```

This is the seam. React effects, DOM refs, and scroll measurement remain adapters around it.

## Migration Slices

### Slice 1: State Transition Module

Move only interaction state and events:

- `activeQuestionId`
- `activeEvidenceId`
- `activeEvidenceKind`
- `activeInsightSection`
- `activeStructureTarget`
- `railLocked`
- `isStackedMode`
- `isWideDesktop`

Keep data loading and JSX in the harness.

Tests:

- opening a different insight section clears Structure Brace
- closing insight clears Structure Brace
- Esc closes detail before rail lock
- resize clears Structure Brace
- evidence focus does not clear Structure Brace

### Slice 2: Scroll Intent Derivation

Have the module emit plain scroll intents such as:

```text
scroll to section A
scroll to paragraph A-P2
scroll to evidence E123
```

The harness remains the adapter that performs DOM queries and `scrollIntoView`.

Tests:

- selecting Pn emits a paragraph scroll intent
- selecting 篇章 emits a passage scroll intent
- tight desktop still emits scroll intent even when brace is hidden

### Slice 3: View Model For Rail Detail

Move the "what rows/buttons are active" decision into a small view model. Rendering stays in `HarnessStructureRows`.

Tests:

- passage row and paragraph rows are mutually exclusive
- labels come from `passageStructure`
- no paragraph rows when no active insight section exists

## Why This Is Worth Doing

Locality:

- Product interaction rules live in one module instead of across handlers and effects.
- CR can review state rules without reading geometry code.
- Browser QA failures can be traced to either state, scroll adapter, or geometry.

Leverage:

- One reducer interface covers many behaviours.
- Tests become cheap and deterministic.
- Future cuts can add new paper orientation tools without editing scattered state transitions.

## When Not To Do It

Do not start this refactor inside a feature hotfix. The current harness works. This is an architecture cut best done after C5b is stable on `main`, with no concurrent visual redesign.

## Acceptance For The Architecture Cut

- No PaperSurface renderer changes.
- No adapter/data/report changes.
- Harness JSX remains visually identical.
- New reducer tests cover the transition rules above.
- Existing C5a/C5b verify scripts still pass.
- Browser QA should show no visual difference before/after.
