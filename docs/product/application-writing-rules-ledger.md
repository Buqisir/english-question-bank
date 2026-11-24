# Application Writing Rules Ledger

V4 (`prompts/application-writing-model-answer-v4.md`) keeps the prompt to a goal,
seven principles with reasons, and program-checked hard constraints. A rule that
forbids one specific failure enters the prompt only after that failure is
observed in our own generated output. This ledger records each candidate rule
and the evidence behind it, so the prompt does not collect patches nobody can
trace.

## States

- `watch`: seen in human or third-party essays, not yet in our output. Not in the
  prompt. Reviewers look for it in every trial.
- `active`: seen in our output. Written into the prompt as one sentence with its
  reason. Record the trial and the quote.
- `retired`: no longer needed (the principle now covers it, or it stopped
  appearing for two trials after removal). Removed from the prompt.

## Entries

| ID | Failure | State | Evidence | Since |
|---|---|---|---|---|
| L1 | Forced personification: objects given feelings or actions that add no meaning (a collection that "smiles", a decision that "knocks") | watch | Owner 2026-11-24: high-score human essays contain flaws we do not learn from; observed in third-party reference essays during review | 2026-11-24 |
| L2 | Awkward inversion used only to show a structure, where normal order reads better | watch | Same source as L1 | 2026-11-24 |
| L3 | Filler sublimation: a closing value line that could follow any essay and adds nothing the content supports | watch | Same source as L1; V3 doctrine already limits value to one layer | 2026-11-24 |
| L4 | Too many paragraphs, or a one-sentence body paragraph between longer ones | active (principle 8 and section 三) | Owner 2026-11-24 on the 2026 新课标Ⅰ trial: the V4 standard essay had 4 paragraphs with a one-sentence middle paragraph ("Study ranks second, …"); the advanced essay had 5. Owner: body text should be 3 or 4 paragraphs, middle paragraphs of similar weight; applies to all applied writing | 2026-11-24 |
| L5 | Invented shared history with the reader presented as fact (the advanced email recalls George reading a specific poem to the class) | watch | Round 2, 2021.1 八省联考 advanced essay; Owner did not flag it | 2026-11-24 |

## Not carried over from V3

V3 contained task-derived patch rules (for example a deadline rule written from one
past paper). V4 does not carry them. If a trial shows the failure they guarded
against, the rule comes back here as `active` with new evidence.

## Trials

| Date | Papers | Result | Notes |
|---|---|---|---|
| 2026-11-24 | 2026 新课标Ⅰ, 2026 新课标Ⅱ | Blind, V4 standard vs V3 live: Owner picked V4 on both (2 : 0) | Both outputs passed the hard-constraint validator on the first try. No ledger entry was observed. Owner rated the Ⅱ teaching page clear, transferable and with requirements separated from choices, and the Ⅱ advanced essay worth its extra words. Dimension boxes were not filled, so the result does not say which dimension decided it. |
| 2026-11-24 | 2020 新高考Ⅱ, 2021.1 浙江, 2021.1 八省联考 | Blind, V4 standard vs V3 generated with the production prompt: Owner picked V4 on all three (3 : 0; 5 : 0 over both rounds) | V4 passed hard checks first try on all three; V3 needed one word-count revision on two. Paragraph rule held: one V4 standard essay had a one-sentence middle paragraph (24 words, as long as its neighbour), flagged as a warning only. The 2026 新课标Ⅰ rewrite under principle 8 has 4 balanced paragraphs; Owner rated its advanced version worth the extra words. Cross-task trigram overlap of openings and closings across five tasks: 0. |
