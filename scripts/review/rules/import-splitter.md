# Import Splitter Rules

Use these rules when reviewing answer-version DOCX import, import-bundle draft generation, deterministic item splitting, option extraction, answer merging, or group-type inference.

## Scope

These rules apply to changes around:

- `normalizeDraftText`
- `findSectionHeadings`
- `findItemBlocks`
- `findStructuredExamItemBlocks`
- `cleanItemBlockText`
- `findOptionMarkers`
- `findLineOptionMarkers`
- `extractOptions`
- `extractLineOptions`
- `inferGroupType`
- `buildDraftGroup`
- `generateImportBundleDraft`

Do not apply reading-parse T-card rules unless the diff also changes DeepSeek reading-analysis logic.

## Required Outcome

Answer-version true-paper imports should split into stable exam units:

- reading: usually 4 groups, A-D
- seven_choices: 1 group, 5 questions, A-G options
- cloze: 1 group, usually 15 questions, A-D options
- grammar_cloze: 1 group, usually 10 blanks
- writing: 1-2 groups, kept as draft unless explicitly supported

Zhejiang papers may have reading A-C in older years and often have 2 writing groups. Do not fail those by assuming A-D or one writing task for every paper.

## Must Fail

Fail the change if it can clearly cause any of these regressions:

- 七选五 is classified as cloze because of `可以填入空白处`.
- 语法填空 is classified as cloze or reading because numbered blanks are treated as multiple-choice questions.
- 写作 sections are classified as reading/cloze because they contain numbered instructions.
- Reading passage titles like `A Few Tips...` are parsed as option `A`.
- Answer-analysis text or later section headings are left inside the previous group.
- Full-width question markers such as `（36）` are ignored while half-width `(36)` works.
- A real objective group with options is produced with zero options.
- Source-title warnings such as `来源口径提示` are treated as structural split failures.

## Heuristics

Prefer section-heading signals over weak lexical signals:

- `完形` in the section name -> cloze
- `语法` in the section name -> grammar_cloze
- `七选五` or `短文后的选项` -> seven_choices
- `写作`, `书面表达`, `应用文`, `续写`, `段落开头语` -> writing

Use weak heuristics only as fallbacks:

- 5 or more blanks plus 7 unique A-G line options -> seven_choices
- 15 or more scored markers -> cloze
- 1 or more line-start questions with enough options -> reading

## Option Extraction

Line option extraction should avoid false positives from normal English titles. It is acceptable to require `A.` / `A．` / `A、` style markers for line-based A-G options if current regression data shows `noOptGroups=0`.

Watch, but do not fail by default, for future DOCX files whose options are formatted as `A  Some text` without punctuation.

## Verification

After splitter changes, the caller should provide:

- `node --check server/api.mjs`
- a draft-regression run over answer-version bundles

Expected healthy regression shape:

- `warningBundles=0`, excluding source-mouth warnings only
- `noOptGroups=0` for reading/cloze objective groups
- Zhejiang 2023+ January papers split to reading, seven_choices, cloze, grammar_cloze, writing
- New Curriculum I/II papers split to reading, seven_choices, cloze, grammar_cloze, writing

Do not fail only because some writing groups have missing answers; writing is not the current objective-import target.
