# Writing import: zero-question groups, group-keyed analysis, six-family completeness

Status: accepted (PM grill 2026-05-29, PO 黄学伟)

Context: I5 adds writing import (应用文 application + 读后续写 continuation) to the AI
paper importer. Two contract decisions were made during the grill.

**1. A writing task is a Question Group with zero Questions, carrying a Writing Task.**
We rejected modelling the essay as a single Question. The system's answer-key,
answer-conflict, and analysis machinery is entirely Question-keyed; a writing
"Question" would have no options, no answer key, and no per-question analysis, and
would force writing-specific special-casing everywhere that machinery runs. Instead a
writing group has `groupType: 'writing'`, zero Questions, a prompt/material Passage,
and a Writing Task holding the writing-specific data (task type, word-count target,
continuation starters/material).

**2. Whole-paper publish enforces six-family completeness.** The importer ingests
only complete standard whole papers (PO-confirmed: "永远导一整张完整卷"), so publish
hard-blocks when any of the six families is missing — reading A-D, seven-choices,
cloze, grammar-fill, application, continuation. This is a parse-correctness guard, not
an obstacle, and supersedes the prior four-family contract that PR #157 had greened
`verify-i2` to.

Consequences:
- Future writing analysis (model answer, scoring guidance, AI feedback) attaches at the
  writing group / Writing Task level with **no `questionId`** — consistent with the
  "writing QA links have no questionId" behaviour already in the publisher. This is the
  irreversible part: writing analysis cannot be question-keyed, because writing groups
  have no Questions. Changing decision 1 later would require a data migration.
- `verify-i2`'s four-family "successful publish" fixture must move to six families (add
  application + continuation groups), mirroring `verify-i4`. Until then `verify-i2` is
  correctly red on the synced branch.
