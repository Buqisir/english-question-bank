# I8 Cloze Analysis — Agent Entrypoint

You are implementing I8 (完形填空 AI 解析生成). Read these, in order:

1. `cloze-analysis-v1.contract.md` — the binding JSON + teaching-model spec.
2. `plan.md` — scope, Must Do steps, Forbidden, verification. Do not exceed the
   Forbidden boundary.
3. `decisions.md` — why the model is shaped this way (background).
4. `pa.md` — PA Must Fix items (once PA has run); honor them.

Closest working template — read before writing code:

- `server/paper-import-ai/analyzeSevenChoices.mjs` — the analyze-module pattern
  (build messages → provider call/retry → extract JSON → validate shape →
  exact-quote checks → retryable vs non-retryable errors). Mirror it.
- `prompts/seven-choices-analysis-v1.md` + `readApiPrompt()` — prompt-hardening
  (inline JSON only, verbatim quotes).
- `scripts/verify-i2-seven-choices-ai-import.mjs` — verifier pattern with stub
  providers.

Bindings you must not re-derive:

- Cloze group model from I3: `clozeGroup.questions[]` = `{ id, stem,
  options:{A,B,C,D}, answerKey, blankId }`; `paragraphs[]` carry inline
  `__41__` blanks; `blankIds[]` are blank-41…55. Analysis keys by questionId.
- Reuse `server/ai-providers/*` and `server/paper-import-ai/extractJson.mjs`.
  Do not duplicate provider or JSON-recovery code.
- Register `verify-i8-cloze-analysis.mjs` in `scripts/verify-ci.mjs` (prior
  I-series verifiers bit-rotted by being omitted from CI).

Out of scope for I8: render surface, entry gate, review UI, grammar-cloze,
schema changes, post-hoc re-analysis. Those are I9 or out of program.
