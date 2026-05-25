# PA Report — I0-E Seven Choices Analysis Entry

Date: 2026-05-26
Reviewer: Claude lite (小川)
Branch: main
Mode: PA-lite

---

## Verdict

**APPROVE WITH MUST FIX**

Direction is correct. Productizing the entry is the right next step now that the
七选五 surface works. Cut scope is well-contained. Two spec gaps must be resolved
before DEV starts; they are small decisions, not rework.

---

## Product Principle

Teacher opens the 九省卷 七选五 group card → clicks one button → lands on the
七选五 PaperSurface with blank 36 analysis open. No intermediate page. No manual
URL editing.

This cut adds one availability check and one card link. It does not change the
Surface, the JSON contract, the prompt, or the teaching interpretation. That
boundary is correct and must be held.

---

## Exact UX / Architecture Model

**Before:** 七选五解析 is only reachable by manually constructing a demo URL.

**After:** A `七选五解析` link appears on the 七选五 group card when the paper asset
and complete `seven-choices-analysis-v1.json` both exist. Clicking the link loads
`PaperSurface` with `groupId`, `questionId=q-2024-jslk-036`, and opens that chain.

**Gate logic (per goal.md):**
1. `paper-asset.json` exists and contains the group.
2. `analyses/seven-choices-analysis-v1.json` exists.
3. Every `questionId` in the group has an entry in `analysis.questions`.

**Availability module:** `server/search/paperSurfaceAvailability.mjs`.

**Card render:** `app/src/concierge/ConciergeGroupCard.tsx`.
Card is already a consumer: it renders a link when `hasPaperSurfaceAnalysis &&
paperSurfaceHref`. No JSON fetching in the card. No allowlist in the card.

**Chain open behavior:** The harness already opens a chain when `source=paper-asset`
and `questionId` matches a chain. The current `openSevenChoiceQuestionIds` init
(line 202) starts empty; the `useEffect` at line ~540 sets it to `[candidateId]`
when `questionId` is found in `sevenChoicesModel.chainsByQuestionId`. This works.

---

## Must Fix Before DEV

### MF-1 — `analysisOpen=1` is unresolved

**Problem:** goal.md specifies the entry URL includes `analysisOpen=1`:

```
view=paper-intelligence&source=paper-asset&paperId=...&surface=paper&groupId=...&questionId=...&analysisOpen=1
```

But `paperIntelligenceRoute.ts` does not parse `analysisOpen`, and the harness
does not read it. The harness already opens the correct chain when `questionId` is
present and matches a chain in `sevenChoicesModel` — the `analysisOpen` param is
vestigial as the spec stands.

**Risk:** If DEV adds `analysisOpen=1` to the URL without wiring parsing, the param
is dead. If DEV wires parsing, it requires touching the harness, which is a
grey-zone file and outside the cut boundary in goal.md.

**Resolution required before DEV starts** (PO decides):

Option A — Drop `analysisOpen=1` from the URL and the spec. Use `questionId`
presence as the signal for "open this chain." The harness already implements this.
No harness change needed.

Option B — Keep `analysisOpen=1` as a future-proof signal. DEV must add
`analysisOpen` parsing to `paperIntelligenceRoute.ts` and a conditional open in the
harness `useEffect`. This is a small but real harness change; expand the allowed
files list and add a browser QA case for direct-URL access without `analysisOpen=1`.

The current harness behavior supports Option A without any harness change. Option A
is the smaller cut. Both are valid product choices; neither is decided in goal.md.

---

### MF-2 — `paperSurfaceLabel` data contract is unspecified

**Problem:** goal.md says:

> Label field: search/API should provide `paperSurfaceLabel`; card renders the
> label it receives.

But:
- `paperSurfaceLabel` does not exist in the server API response.
- `ConciergeGroupCard.tsx` hardcodes the string `阅读解析` (line 166).
- There is no `paperSurfaceLabel` prop on the card type.

If DEV adds this field to the server, they must also:
1. Add it to the `buildPaperSurfaceHref`/availability output shape.
2. Add it to the server API response serialization (`hasPaperSurfaceAnalysis`,
   `paperSurfaceHref`, `paperSurfaceLabel`).
3. Update `ConciergeGroupCard` to read the field instead of the hardcoded string.

This is straightforward but touches three files and changes the card's data contract.
It is NOT optional: if DEV ships a `七选五解析` link using the existing hardcoded
`阅读解析` label, the entry label is wrong.

**Resolution required before DEV starts** (PO decides):

Option A — Server provides `paperSurfaceLabel`; card renders what it receives;
fallback to empty / no link if field is absent. This is the goal spec and the cleaner
long-term model.

Option B — Card infers label from `group.groupType` client-side (`reading` →
`阅读解析`, `seven_choices` → `七选五解析`). Server does not add the field.
This keeps the server shape stable but puts label logic in the card, contradicting
the goal spec.

Option A is the goal. If the PO chooses Option B, update goal.md to reflect it.

---

## Should Watch

### SW-1 — `resolvePaperAssetReadPaths` resolves to reading analysis only

`storage.mjs` returns a fixed `analysisPath` pointing to
`analyses/reading-choice-analysis-v1.json`. DEV must NOT use `resolvePaperAssetReadPaths`
to load the 七选五 analysis. The seven-choices path is
`analyses/seven-choices-analysis-v1.json` in the same `analyses/` directory.

DEV should derive this path independently inside `paperSurfaceAvailability.mjs` (e.g.
`path.join(assetDir, 'analyses', 'seven-choices-analysis-v1.json')`). Do not add
a `sevenChoicesAnalysisPath` to `storage.mjs` unless there is a clear reuse case.
This does not block DEV but is a pit to fall into: if DEV calls
`resolvePaperAssetReadPaths` and checks `analysisPath`, the 七选五 gate will silently
always fail.

### SW-2 — Availability cache covers multiple analysis types after this cut

`paperSurfaceAvailability.mjs` has a single `availabilityByGroupIdCache`. After
extending to cover both reading and 七选五, the `invalidate()` call at line 265–266
of `api.mjs` still clears the whole cache. This is correct. Watch for any future
analysis file replacement that does not call `invalidate()`.

### SW-3 — `data-ra-entry` telemetry attribute is reading-specific

The existing card link uses `data-ra-entry="group-card"`. If there is a telemetry
pipeline or test that checks this attribute to track reading entry clicks, a
七选五 entry through the same attribute may mix signals. Not a blocker; log it
in `docs/paper-surface-watch-ledger.md` after DEV.

---

## Allowed Files

- `server/search/paperSurfaceAvailability.mjs` — extend gate for `sevenChoices` groups
- `server/api.mjs` — add `paperSurfaceLabel` to availability output (if MF-2 Option A)
- `app/src/concierge/ConciergeGroupCard.tsx` — use `paperSurfaceLabel` from group (if MF-2 Option A), or add groupType-based label (if Option B)
- `app/src/concierge/conciergeSearch.ts` — update type if `paperSurfaceLabel` is added
- `scripts/verify-i0e-seven-choices-entry.mjs` — new verifier
- `docs/cuts/I0-seven-choices-entry/` — PA / CR / cut-note files

If MF-1 Option B (add `analysisOpen` parsing):
- `app/src/features/paper-intelligence/paperIntelligenceRoute.ts` — add `analysisOpen` param
- `app/src/features/paper-intelligence/PaperIntelligencePaperSurfaceHarness.tsx` — conditional open

---

## Forbidden Files

All items from goal.md forbidden list, restated explicitly:

- `app/src/features/paper-intelligence/SevenChoicesAnalysisPanel.tsx` — Surface UI
- `app/src/features/paper-intelligence/useSevenChoicesPaperHighlights.ts` — Surface UI
- `app/src/features/paper-intelligence/sevenChoicesSurfaceAdapter.ts` — adapter
- `shared/papersurface/**` — shared renderer
- `prompts/seven-choices-analysis-v1.md` — analysis prompt
- `docs/cuts/I0-seven-choices-analysis-contract/seven-choices-analysis-v1.contract.md` — data contract
- `app/public/paper-assets/paper-2024-jslk-english/analyses/seven-choices-analysis-v1.json` — live fixture (verifier fixture copies are allowed separately)
- Any reading Surface UI file — no regression allowed

---

## Static Verify Requirements

The new `scripts/verify-i0e-seven-choices-entry.mjs` must assert:

1. Given the current paper asset and complete 七选五 analysis, the availability map
   contains `group-2024-jslk-seven-choices` with a non-null `href`.
2. The `href` contains `groupId=group-2024-jslk-seven-choices`,
   `questionId=q-2024-jslk-036`, `source=paper-asset`, and `surface=paper`.
3. If MF-1 Option A: `href` does NOT require `analysisOpen`. If Option B: `href`
   contains `analysisOpen=1`.
4. Given a fixture with an incomplete 七选五 analysis (missing one question entry),
   the availability map does NOT contain that group.
5. Given a fixture with a missing `seven-choices-analysis-v1.json`, availability is
   absent.
6. Reading group availability (reading A-D) is still present and correct.
7. `paperSurfaceLabel` for 七选五 group is `七选五解析`.
8. `paperSurfaceLabel` for reading group is `阅读解析`.

The verifier must not import live app code or hit the network. It should test the
availability module directly against fixture data.

---

## Browser QA Matrix

| # | Action | Expected |
|---|--------|----------|
| 1 | Search / browse to the 九省卷七选五 group card | `七选五解析` link is visible |
| 2 | Click `七选五解析` | PaperSurface opens, 七选五 group, blank 36 chain is open |
| 3 | Check left passage | Blank 36 highlights visible (amber color) |
| 4 | Navigate to a Reading D card | `阅读解析` link still visible (no regression) |
| 5 | Click Reading D `阅读解析` | Reading D PaperSurface opens correctly |
| 6 | Check at least one of Reading A/B/C | Entry still works |
| 7 | Remove `seven-choices-analysis-v1.json` from fixture dir | `七选五解析` link disappears on next server restart |
| 8 | (If MF-1 Option B) Access demo URL without `analysisOpen=1` | Chain is closed by default |

QA items 4-6 are regressions. They must pass before RM.

---

## DEV Readiness

| Criterion | Status |
|-----------|--------|
| Teacher action clear | ✅ Group card → `七选五解析` → Surface with chain open |
| Before/after behavior clear | ✅ |
| Cut boundary clear | ✅ |
| Allowed files listed | ✅ |
| Forbidden files listed | ✅ |
| Verify assertions specified | ✅ |
| Browser QA matrix | ✅ |
| PO decisions ≤ 3 | ✅ (2) |
| MF-1 resolved | ❌ Pending PO decision |
| MF-2 resolved | ❌ Pending PO decision |

**DEV must not start until MF-1 and MF-2 are resolved by PO and goal.md is updated.**
Both resolutions are small decisions; they do not require redesign.

---

## Open PO Decisions

### OPD-1 — `analysisOpen=1`: parse or drop?

See MF-1. Choose Option A (drop; `questionId` presence is the signal) or Option B
(keep; add parsing to route + harness). Update goal.md with the chosen URL shape and
expand allowed files if Option B.

### OPD-2 — `paperSurfaceLabel`: server-provided or card-inferred?

See MF-2. Choose Option A (server provides field, card renders it) or Option B (card
infers from `group.groupType`). Update goal.md with the chosen approach. If Option A,
specify whether the field is required or optional with fallback behavior.
