# Code Style

This document keeps repository conventions small and explicit so agents can
navigate the codebase without guessing.

## File Types

- App runtime code uses `.ts` and `.tsx`.
- Server runtime code uses `.mjs`.
- Script / verify code uses `.mjs`.
- Type declarations use `.d.ts`.
- Shared runtime modules that must stay plain JavaScript use `.mjs` plus a
  same-name `.d.ts`.
- Do not add new `.d.mts` files. Existing `.d.mts` files are legacy compatibility
  artifacts and should only change when a verify script proves declaration parity.

## Server Modules

`server/api.mjs` is legacy dispatch glue. New server behavior should live behind
deeper modules such as:

- `server/question-bank/`
- `server/paper-set/`
- `server/imports/`
- `server/paper-import/`
- `server/ai/`
- `server/exports/`
- `server/routes/`

The goal is locality: route dispatch should call modules; it should not own
domain logic, SQL mapping, export rendering, and import validation in the same
file.

## React Surface Modules

Large workbench and harness files should not keep growing by default.

- Extract data loading into hooks when the same component also owns rendering.
- Extract right-side panels before adding new panel states.
- Extract scroll / focus synchronization when more than one effect controls the
  same visible surface.

Do not extract pass-through components that make the interface as complex as the
implementation. A module earns its keep when it gives locality or leverage.

## CSS Tokens

Shared product colors, spacing, and font sizes start in:

```text
app/src/shared-ui/tokens.css
```

Feature CSS may still use local values while being migrated, but new repeated
colors should become tokens before being copied into a second feature file.

The current token layer intentionally stays small:

- background / desk / paper / border / text
- primary / danger / warning / success
- font sizes
- spacing

Do not build a full design system until repeated feature work needs it.

## Verify Scripts

Check `scripts/README.md` before choosing verify commands. Prefer the smallest
script that proves the current risk.

Use `node scripts/verify-ci.mjs` or `npm run verify:all` from `app/` for the
stable core suite. Cut-specific scripts remain available for focused review.
