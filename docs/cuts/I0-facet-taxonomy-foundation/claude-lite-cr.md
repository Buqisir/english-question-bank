# Claude Lite CR — I0-A Facet Taxonomy Foundation

Reviewer: Claude (lite CR)
Date: 2026-05-24
Cut: I0-A 七选五辅助检索 facet taxonomy foundation
Files reviewed:
- `docs/cuts/I0-facet-taxonomy-foundation/decisions.md`
- `docs/cuts/I0-facet-taxonomy-foundation/facet-taxonomy-draft.md`

---

## Verdict: APPROVE

**Must Fix: 0**
**Should Watch: 1**

---

## Must Fix

None.

---

## Should Watch

### SW-1 — Bridge mechanism rule wording is ambiguous

**File:** `decisions.md`, Cohesion Mechanism Rules section

**Current wording:**
> `role=bridge`: mechanisms are optional when the bridge uses reference, logic, topic-field recurrence, or synonym paraphrase.

**Risk:** A future implementer may read "optional *when* X" as "required when *not* X." That would invert the intent and impose a requirement on bridge blanks whose mechanism type falls outside the listed set.

**Intended meaning** (inferred from context): mechanisms are unconditionally optional for bridge; the listed types are what may be recorded *if* a mechanism is noted.

**Suggested rewording:**
> `role=bridge`: mechanisms are optional; if recorded, they are drawn from: reference, logic, topic-field recurrence, or synonym paraphrase.

No taxonomy keys or table rows are affected — this is a prose clarification only.

---

## Checklist Findings

| Check | Result |
| --- | --- |
| Docs-only scope — no DB tables, schema, runtime validators, routes, UI, or analysis JSON in this cut | ✅ Clean. `decisions.md` explicitly enumerates excluded artefacts. Future analysis contract notes are clearly labelled as out of I0-A scope. |
| Position, role, cohesion mechanism are independent dimensions | ✅ Clean. All three hang directly from the `seven-choices` root; `decisions.md` states position is not encoded as parent of role. |
| `seven-choices.cohesion.*` is mechanism namespace, not subtype of `role.cohesion` | ✅ Clean. Taxonomy table shows `parent_key` for `seven-choices.cohesion` is `seven-choices`, not `seven-choices.role`. `decisions.md` restates this explicitly. |
| Mechanism rules — required for `role=cohesion` | ✅ Clean. "one primary mechanism is required." |
| Mechanism rules — optional for `role=bridge` | ⚠ Technically correct but wording is ambiguous. See SW-1. |
| Mechanism rules — not used for `topic` / `summary` in v1 | ✅ Clean. "mechanisms are not attached in v1." |
| Facet keys are lowercase ASCII, dot-separated, max 4 levels | ✅ Clean. Deepest keys are level 4 (e.g., `seven-choices.cohesion.grammatical.referential-cohesion`). No uppercase, no non-ASCII characters. |
| Parent keys appear before child keys in the table | ✅ Clean. Full parent chain precedes every child row throughout the table. |
| Final key names: `topic-field-recurrence` and `referential-cohesion` (not old `topic-word-echo` / `pronoun-reference`) | ✅ Clean. Old names absent. Updated names present. |
| `topicClues` and `optionFit` are not facet keys | ✅ Clean. Both are labelled future analysis fields in `decisions.md` and do not appear in the taxonomy table. |
| Taxonomy ordering reflects PO teaching rule: position first, role second, mechanism as evidence dimension | ✅ Clean. Table ordering matches the teaching sequence. `decisions.md` cites the PO source document and Halliday-style basis. |

---

## Final Recommendation

Approve as-is. The cut is correctly scoped to docs only, the three facet dimensions are independent, the namespace is unambiguous, all key names are finalised, and no runtime artefacts have leaked in.

Address SW-1 (bridge mechanism wording) in the next editing pass on `decisions.md` — it is a one-line prose fix and does not affect the taxonomy table or any downstream consumer.
