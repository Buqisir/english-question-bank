# I13 语法填空解析 · 第一刀「生成」— CR-lite (fresh-Opus cold-read)

**Verdict: APPROVE WITH MUST FIX (0 merge-blocking Must Fix; 1 Follow-up-Gate for the render slice)**

Reviewer: fresh-Opus CR, no DEV context. Branch `i13-grammar-fill-analysis`
tip `0adf0ee`, base `main`. `pwd`/toplevel/branch confirmed. Verifier + verify-ci
re-run; assertions read; verifier mutation-tested on a `/tmp` scratch copy of
`analyzeGrammarFill.mjs` (restored — tree clean at finish, only untracked
`.claude/launch.json` remains, correctly uncommitted).

The cut is a faithful I8 mirror. Generation core, persistence chain (validator +
storage), client data-plumbing, mandatory-publish guard, and the frozen 4-op
answer-match are all correct and proven. The single substantive finding is the
DEV-self-flagged normalization divergence (#2): it is a **REAL stored-data
consistency gap**, but it lands in the **render slice**, not this generation
slice — so it is a Follow-up-Gate, not a merge blocker. Reasoning below.

---

## Changed Scope

22 files. All inside plan.md Allowed Files except `scripts/README.md` (one
registry row for the new verifier — covered by the "Docs" allowed bucket / repo
convention that every verify script is documented there; benign). Forbidden
scope confirmed UNTOUCHED by file-list grep: no `schemas/**`, no
`paper-asset-v1`, no `docxSplitter` group-model edit, no other family's analysis
module (`analyzeCloze`/`analyzeSevenChoices`/`analyzeReading` unchanged), no
`app/public/paper-assets/**`, `.claude/launch.json` not staged.

Client TSX is data-plumbing only (new fetch wrapper, `gfAnalysisState`, publish
gate `gfAnalyzed`, threads `grammarFillAnalysis` at publish). No PaperSurface /
visual change, no `questionId=null` leak.

---

## Mutation-Test Results (verifier integrity — the cardinal check)

Each mutation applied to a scratch copy of
`server/paper-import-ai/analyzeGrammarFill.mjs`; `node
scripts/verify-i13-grammar-fill-analysis.mjs` re-run; scratch restored after each.

| # | Mutation | Expected RED case | Result | Verdict |
|---|----------|-------------------|--------|---------|
| a | C1 answer-match → stem (strip trailing `n`/`e`) + substring match | `C1: worn-for-wore fails (no stemming)` | **RED** (FAIL) | ✅ guard real |
| b | Remove `PARENT_FACET_KEYS` rejection (parent accepted by membership) | `C2: parent-as-leaf blocks` | green (still passes) | ⚠️ see note |
| c1 | Drop `blank_type`-match check | `C2: blank_type mismatch blocks` | **RED** (FAIL) | ✅ guard real |
| c2 | Drop evidence exact-substring check | `C3: evidence non-substring blocks` | **RED** (FAIL) | ✅ guard real |
| c3 | Drop blank-marker (`BLANK_MARKER_RE`) check | `SW-2: signalText with blank marker  56  blocks` | **RED** (FAIL) | ✅ guard real |
| d2 | Force `isRetryableAnalysisError` → always true | `C1: answer conflict does not retry (called exactly once)` | **RED** (FAIL) | ✅ guard real |

**Mutation (b) note — NOT a fake green.** Removing the explicit parent-node
guard does **not** let a parent key through: parents are absent from
`FACET_BLANK_TYPE`, so `expectedBlankType` becomes `undefined` and the
**blank_type-match check rejects** it (verified directly: throws `facetKey
"grammar-fill.given.verb" 的 blank_type 是 undefined…`). The verifier's
`/父节点|facetKey/` pattern still matches because the fallback message contains
the literal word `facetKey`. So the parent rejection is **double-guarded** and
behavior stays correct; only the verifier's *precision* is loose (it would not
detect deletion of the dedicated parent guard alone). Behavior is sound →
Should Watch, not Must Fix.

Mutation (a) is the load-bearing anti-fuzzy guard and it correctly reds — the
`worn`-for-`wore`✗ case genuinely fails when stemming is introduced.

---

## Findings

### Must Fix (blocks merge): NONE

### Follow-up Gate — render slice (was DEV blind-spot #2): evidence/passage byte divergence is REAL

**This is the #2 question and the answer is: REAL stored-data inconsistency, but
it manifests only at render — gate it on the render slice, do not block this
merge.**

Deciding evidence (by path, concrete):

- The grammar-fill group's `paragraphs[].text` is produced **once** at parse by
  `normalizePassageText(line)` (`docxSplitter.mjs:710`).
- The analyzer validates `evidence.signalText` against exactly that text:
  `passageText = group.paragraphs.map((p) => p.text).join('\n')`
  (`analyzeGrammarFill.mjs:234`). **Analyzer input = `normalizePassageText`
  output.**
- At PUBLISH, packageBuilder stores the passage as
  `normalizeGrammarFillText(p.text)` (`packageBuilder.mjs:525`) — an **additional
  transform applied AFTER** the analyzer validated. **Stored passage =
  `normalizeGrammarFillText(normalizePassageText(line))`.**

So `evidence.signalText` is validated as an exact substring of the *pre*-transform
text, but the *post*-transform text is what ships in the asset. Empirically
reproduced (both transforms imported/replicated):

```
RAW   : "The man,who lived here,was 56 (kind)."
PARSE : "The man, who lived here, was 56 (kind)."        ← analyzer validates here
STORED: "The man, who lived here, was  56  (kind) ."     ← shipped asset
DIVERGE: true
```
```
RAW   : "The result)was surprising."
PARSE : "The result)was surprising."                     ← analyzer validates here
STORED: "The result) was surprising."                    ← shipped asset
DIVERGE: true
```

`normalizeGrammarFillText` does several substring-altering ops the analyzer never
saw: blank-number double-spacing (`56`→`  56  `), `)X`→`) X` (space after closing
paren), `56(`→`56 (`, trailing-CJK strip. If a stored `evidence.signalText`
crosses any altered region, a render that uses plain `indexOf` (the exact I11 C1
failure mode — `kratos-memory "symbol normalization"`) will silently fail to
highlight. The blank-`56` region is partly protected by the evidence no-marker
rule, but `)X`→`) X` fires on ordinary prose parens and is **not** marker-guarded.

**Why this is NOT a Must Fix for *this* slice:** slice 1 ships zero render. The
stored data is self-consistent for everything this slice asserts (file exists on
disk, schema/blank-count correct). No consumer reads `signalText` against the
stored passage yet. DEV's "by design, analyzer runs on raw parsed text before
packaging" is accurate as a *description*, but the "by design" framing
understates that analyzer-input ≠ stored-passage — they are NOT the same bytes.

**Required render-slice disposition (Follow-up Gate, blocks the render cut):**
the render slice must EITHER (a) make the analyzer validate against
`normalizeGrammarFillText(normalizePassageText(...))` (the stored bytes) so
evidence is guaranteed to resolve, OR (b) have the render highlight tolerate the
divergence / re-derive offsets against the stored passage. Pick one and prove it
with a fixture whose passage actually changes under `normalizeGrammarFillText`
(the current i13 `FIXTURE_PASSAGE_TEXT` does not exercise this because the
package-build path never re-runs `validateGrammarFillShape`).

---

## Should Watch (non-blocking, do not absorb into this cut)

- **SW-A — verifier parent-as-leaf precision.** Per mutation (b): the parent
  guard is double-covered by blank_type, and the test pattern matches the
  fallback message. A future refactor that removes both guards would not be
  caught. Cheap render-slice hardening: assert the *specific* `父节点` message.
- **SW-B — packageBuilder does not re-run `validateGrammarFillShape`.** Like
  cloze, the publish path only checks paperId/targetGroups on the analysis, not
  the full per-blank shape (facet membership, hint-consistency, evidence
  substring). The sibling fixtures (i1/i4/i8) exploit this — they ship
  `blankType:'no-hint'` for a `prompt`-bearing q56 and it publishes fine. A
  hand-edited or schema-drifted analysis could thus be published unvalidated.
  Mirrors cloze exactly; acceptable for this slice. The render slice that
  *consumes* facet/role/path should validate on read or at publish.
- **SW-C — fixture passage divergence not exercised.** `FIXTURE_PASSAGE_TEXT`
  has no `)X` or `,X` seams that diverge under `normalizeGrammarFillText`; the
  divergence in the Follow-up Gate is invisible to the current green. Add such a
  seam to the render-slice fixture.

---

## Self-Review Blind Spots (for a later Big CR)

- **Generation smoke not run** (needs AI quota — out of CR's reach). The whole
  validator path is proven only by stubbed providers. The real AI's evidence
  quotes against a *real* normalized passage are exactly where the #2 divergence
  would first bite — but again only matters at render. Big CR / PO smoke should
  confirm real `signalText` resolves against the **stored** passage, not just the
  parsed one.
- **`normalizeGrammarFillText` idempotency vs `normalizePassageText`** — I tested
  ~7 cases; the two share the space-after-punct rule (idempotent there) but I did
  not exhaustively characterize every divergence class. The two demonstrated
  classes are enough to establish the gate; a fuller enumeration belongs to the
  render-slice fix.
- **i2/i3/i5 sibling fixtures** — I read i1/i4/i8 in full and spot-confirmed the
  same minimal-analysis pattern; i2/i3/i5 verified green via verify-ci but I did
  not read each diff line-by-line. All six stay green post-update.

---

## Failure / Attack Angle

The dangerous fake-green here would be a C1 answer-match that quietly accepts a
wrong inflection (`worn` for `wore`) — mutation (a) proves the verifier catches
that, and the normalization is exactly the frozen 4 ops (trim → collapse-ws →
lowercase → split-`/`) with no punct-strip/stem/edit-distance
(`analyzeGrammarFill.mjs:111-122`). The second attack is a ship-a-hole: analysis
validates in memory but never lands on disk — mutation-equivalent is covered by
the on-disk `existsSync` assertions (versioned + latest), and the validator now
lifts `grammar-fill-analysis-v1` into the normalized bundle (else storage writes
nothing). The third, subtler trap is the normalization divergence: a future
render dev trusts "evidence is an exact substring" (true of parsed text, false of
stored text) and ships a plain-`indexOf` highlighter that silently no-ops — that
is the I11 repeat, now documented as a render-slice gate.

---

## Verification Evidence

- `node scripts/verify-i13-grammar-fill-analysis.mjs` → **PASSED: 124 checks**
  (re-run by CR, not copied).
- `node scripts/verify-ci.mjs` → **CI verify passed** (i1/i2/i3/i4/i5 + i8 green
  after mandatory-publish fixture updates; new script registered).
- 6 mutations applied to a scratch `analyzeGrammarFill.mjs`; 5 red as expected, 1
  (parent guard) explained as double-guarded correct behavior. Scratch restored;
  `git diff HEAD` empty.
- Persistence chain read directly: `validator.mjs` (schema set + normalized
  pass-through), `storage.mjs` (`sourceAssetVersion` re-stamp + versioned + latest
  write).

---

## Residual Risk

Low for this slice. The only real defect (evidence/stored-passage byte
divergence) is inert until a render consumer exists. It is recorded as a
render-slice Follow-up Gate with a concrete fix and a fixture requirement, so it
cannot silently slip into the next cut. Generation-smoke (real AI) remains the
one unproven path and is correctly PO/quota-gated.

## Recommendation

**APPROVE WITH MUST FIX** — but the Must Fix count for *merge* is **0**. Mergeable
as-is. The normalization divergence is a **Follow-up Gate that blocks the render
slice**, not this generation slice. Carry SW-A/B/C and the render gate into the
render cut's plan.
