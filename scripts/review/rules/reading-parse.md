# Reading Parse Rules

## T卡 (Synonym Difficulty Card)

**T2/T4 boundary**
- T2 = single-sentence synonym rewrite only
- T4 = answer requires information from two or more sentences
- If the correct option's two concepts map to two different sentences → must be T4, never T2
- If the model's own reason/boundaryCheck says multiple actions, multiple sentences, or multiple evidence points are compressed into one option, prefer T4 over T2.

**T6/T10 boundary**
- T6 = inferring a factual conclusion ("so we can infer that...")
- T10 = compressing concrete facts into an abstract concept label / property phrase (e.g. "low barrier to entry", "the cooperative nature of...")
- `surfaceQuestion.type === "abstract_phrase_summary"` → must force T10

**T2/T6 boundary**
- T2 = the original sentence already says the same thing; the student only recognizes another wording.
- T6 = the original text does not directly say it; the student must infer a conclusion from explicit clues.
- If the option depends on cross-sentence emotional, causal, or purpose inference, prefer T6 over T2.
- If a causal/result stem uses an option with an evaluative judgment word not present in the source, such as `improper`, `flawed`, or `wrong`, prefer T6 because the option adds an inferred judgment.
- If a `why difficult / why hard / why challenging` stem uses an option that names an underlying cause not directly stated in the source, such as `rooted in people's mind`, prefer T6 over T2.

**word_meaning → T3**
- `surfaceQuestion.type === "word_meaning"` → `cardId` must be T3 (unless T1)

**writing_technique / paragraph_function → T8**
- `surfaceQuestion.type === "writing_technique"` or `"paragraph_function"` → `cardId` must be T8
- These cases must keep `T7_T8` in `boundaryFlags`, even when the model already chose T8, because writing-technique labels are adjacent to example-function labels.

**surface type → stable T card**
- `paragraph_main_idea` / `passage_main_idea` → T5, except abstract title compression can force T10
- `author_purpose` with passage-level coverage → T5
- `inference_general` → T6
- `example_function` → T7
- `attitude_tone` → T9

**example_function scope**
- `example_function` is only for "why mention / illustrate by mentioning / what does this example show" questions.
- Mention/list signals include `mention`, `by mentioning`, `discuss`, `illustrate`, `show`, `cite`, `refer to`, `list`, and Chinese `提及/提到/引用/举例/例子/为了说明/用来说明`.
- Do not treat `purpose of the laws/policies/measures mentioned/listed/discussed` as `example_function`; that asks the entity's purpose, not the author's reason for mentioning it.
- If surface is corrected to `example_function`, accepted labels should also use `surfaceScope = "example"` and `answeringMove = "function_to_argument"`.
- `example_function` + T7 must keep `T7_T8` in `boundaryFlags`, even when the model already chose T7.
- Person/group purpose questions such as "what were X trying to do" should be `why_did` or `single_detail_normal`, not `example_function`.

**abstract title compression**
- A passage-title question whose correct option is an elliptical wh-question title (e.g. `Why the Rush?`) can be T10 rather than T5.
- Do not let the generic `passage_main_idea → T5` rule override this stronger T10 trigger.

**coverage_test scope**
- `answeringMove === "coverage_test"` + `scope === "paragraph"` → surface type should be `paragraph_main_idea`, not `single_detail_normal`.
- `answeringMove === "coverage_test"` + `scope === "passage"` → surface type should be `passage_main_idea`, not `single_detail_normal`.
- If `answeringMove === "coverage_test"` and scope is omitted, backend should infer scope from the original stem: paragraph/para → paragraph, title/text/passage/article → passage, otherwise paragraph.
- If the stem asks `author's purpose in writing the text/passage`, surface type should be `author_purpose`, not `passage_main_idea`.
- `paragraph_main_idea` / `passage_main_idea` / `author_purpose` with T5/T10 must keep `T5_T10` in `boundaryFlags` to preserve the main-idea vs abstract-compression boundary.

**multi_detail_learn_from scope**
- If `surfaceQuestion.type === "multi_detail_learn_from"` but the evidence and T card are single-point (`T1/T2/T3`), review queue should suggest `single_detail_normal`.

**adjective_summary → T10 by default**
- `surfaceQuestion.type === "adjective_summary"` means the correct option compresses concrete description into one or two adjective labels.
- If the stem asks `best describes / what does X think of / how does X view...` and the correct option is one or two adjective/property words, backend should correct surface type to `adjective_summary`.
- It must not be T2/T3/T4. Default to T10 because the student must map concrete evidence to an evaluative/property label.
- T6 is allowed only when the adjective is low-abstraction/objective, evidence is localized to 1-2 consecutive sentences, and the reason explicitly explains why it is an inferred concrete conclusion rather than an abstract label.
- Any `adjective_summary` case must add `T6_T10` and set `reviewNeeded = true`.

## Backend Normalization (server/api.mjs)

**`normalizeReadingSynonymDifficulty`**
- `word_meaning` → force T3 (verify not broken)
- `abstract_phrase_summary` → force T10, `reviewNeeded = true`, add `T6_T10` to boundaryFlags
- `writing_technique` / `paragraph_function` → force T8
- `writing_technique` / `paragraph_function` + T8 → add `T7_T8`
- `adjective_summary` → force T10 unless the model already returned T6/T10; always add `T6_T10` and `reviewNeeded = true`
- `T2` + cross-sentence source + reason/boundaryCheck self-describes multiple actions/evidence points → force T4
- `T2` + causal/result stem + option adds a missing judgment word → force T6
- `T2` + `why difficult / why hard / why challenging` stem + option adds an unstated underlying-cause phrase → force T6
- `paragraph_main_idea` / `passage_main_idea` → force T5 unless abstract title compression forces T10
- `paragraph_main_idea` / `passage_main_idea` / `author_purpose` + T5/T10 → add `T5_T10`
- `inference_general` → force T6
- `example_function` → force T7
- `example_function` + T7 → add `T7_T8`
- `attitude_tone` → force T9

**`normalizeReadingSurfaceQuestion`**
- `why_did` / `single_detail_normal` + explicit mention/list/example-function stem → correct surface type to `example_function`
- `example_function` + person/group purpose stem + no explicit mention/example-function signal → correct surface type to `why_did`
- `example_function` + `purpose of laws/policies/measures mentioned` → correct surface type to `why_did` and correct T7 to T2 when the evidence is a single-sentence purpose paraphrase.
- `single_detail_normal` + `coverage_test` + paragraph/passage scope → correct surface type to `paragraph_main_idea` / `passage_main_idea`
- If scope is blank in the previous rule, infer it from the original stem before correction.
- `passage_main_idea` + author's-purpose-in-writing stem → correct surface type to `author_purpose`
- `best describes / what does X think of` stem + one-or-two-word adjective/property correct option → correct surface type to `adjective_summary`
- `why_difficult / why_hard / why_challenging` stem → set `answeringMove = "minimal_inference"`

**`reviewNeeded` rules**
- T9 / T10 → always `true`
- `adjective_summary` → always `true`
- T6 / T8 with `confidence < 0.78` → `true`
- Other cards with `confidence < 0.72` → `true`
- Card was overridden by backend (forced T3 / T4 / T8 / T10) → `true`

**`finalScore` hard floor**
- T1 ≥ 1, T2 ≥ 2, T3/T4 ≥ 3, T5–T9 ≥ 4, T10 ≥ 7
- boundaryFlags non-empty → floor += 1 (max 10)
- Golden confirmation scripts must apply the same score floor, finalLabel, and SOLO level when a teacher corrects `cardId`.
- Golden confirmation scripts must allow card and surface corrections to be applied together when a teacher supplies both corrected fields.

**Valid enums only**
- `boundaryFlags`: T1_T2, T2_T6, T3_T6, T4_T6, T5_T10, T7_T8, T6_T9, T2_T4, T6_T10
- `mainBlockers`: vocab, syntax, distractor, abstraction, info_span, topic

**`distractorAnalysis.type`**
- Correct option → type `0`
- Wrong options → type `1`, `2`, or `3`

## Syntax
- `node --check server/api.mjs` must pass after any change to that file.
