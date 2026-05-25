# Claude Lite CR — I0-C

Cut: I0-C 七选五 prompt + external input + reviewed fixture + verify
Reviewer: Claude lite CR
Date: 2026-05-24

## Confirmed

- `pwd`: `/private/tmp/eqb-h9-merge-124`
- `git rev-parse --show-toplevel`: `/private/tmp/eqb-h9-merge-124`
- target report: `/private/tmp/eqb-h9-merge-124/docs/cuts/I0-seven-choices-analysis-prompt/claude-lite-cr.md`

## Verify Runs

```
node scripts/verify-i0c-seven-choices-analysis-v1.mjs --self-check
→ I0-C self-check passed.

node scripts/verify-i0c-seven-choices-analysis-v1.mjs
→ I0-C analysis verify passed: app/public/paper-assets/paper-2024-jslk-english/analyses/seven-choices-analysis-v1.json

git diff --check
→ (clean)
```

---

## Verdict: READY TO COMMIT

Must Fix: 0
Should Watch: 4

---

## Must Fix

None.

---

## Should Watch

**SW-1: `contextEvidence.afterQuote` includes blank placeholder numbers**

q36 `afterQuote` contains `"36 ,"` and q37 `afterQuote` contains `"37 ."` — the blank
marker appears inside the quoted passage text. The verifier accepts this because the
passage paragraphs in the paper-asset do contain those placeholder strings. Not
blocking, but future prompt iterations should clarify that `afterQuote` should capture
only the text after the blank, excluding the marker itself.

**SW-2: Groups object contains paper-asset fields rather than analysis fields**

The fixture's `groups["group-2024-jslk-seven-choices"]` entry is populated with
paper-asset metadata (`groupId`, `groupType`, `title`, `questionIds`, `blankIds`,
`optionBank`, `passageTitle`) rather than the I0-B contract's analysis fields
(`overview`, `discourseStructure`). The contract makes those analysis fields optional,
so this passes. Watch for accumulating paper-asset duplication in future analysis files
if the group entry grows.

**SW-3: q37 `roleFacet = seven-choices.role.summary` is debatable**

Option G ("Experts suggest increasing your running distance by no more than 10% each
week") introduces a new expert-sourced quantitative rule rather than restating the
paragraph. A `seven-choices.role.cohesion` + `primaryMechanismFacet:
seven-choices.cohesion.grammatical.logical-connector` classification is also
defensible (the sentence continues and concretises the advice). Not blocking for a
first reviewed sample; worth flagging for human review before this label is used as a
search training signal.

**SW-4: `meta.reviewedBy = "external-ai"` does not capture Codex cleaning**

The decisions.md records that the external AI returned a structurally non-conforming
file and Codex cleaned it into the contract shape. The fixture `meta.reviewedBy` field
still reads `"external-ai"`, which omits the Codex cleaning pass. Minor provenance
gap; not blocking for I0-C, but a future `reviewedBy` convention (e.g.
`"codex-cleaned"` or `"human"`) would improve traceability.

---

## Final Recommendation

Commit. Both verify passes are clean, `git diff --check` is clean, and scope is
strictly docs-only (prompt, external input document, reviewed fixture, verify script).
No app, server, runtime, or database changes are present. The four Should Watch items
are minor and do not affect contract compliance or verifier correctness.
