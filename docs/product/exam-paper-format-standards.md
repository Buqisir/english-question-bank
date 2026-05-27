# Exam Paper Formatting Standards

These are hard standards for teacher-authored or app-rendered English exam
papers. They apply across Reading, 七选五, 完形填空, 语法填空, writing tasks,
PaperSurface, print/export, and future paper-authoring workflows unless a
specific cut explicitly records an exception.

The visual reference set lives in:

```text
docs/product/exam-paper-format-reference/
```

## Import Normalization Principle

Imported real papers are not formatting authority.

When importing real or mock papers, preserve semantic content: original passage
text, question meaning, option content, answer keys, and writing prompts. But
normalize formatting toward Gaokao-style exam standards.

If a source paper is visually sloppy, inconsistent, or non-standard, the app
should not reproduce that sloppiness. It should repair spacing, punctuation,
blank style, option alignment, quote style, dash style, and answer-box layout
where doing so does not change meaning.

If normalization may change meaning, stop and surface the ambiguity for human
review.

## Global Typography

- Use English half-width punctuation in English text.
- After English punctuation, add one space. This includes punctuation after
  question-number dots and option-label dots, for example `21. ` and `A. `.
- English quotation marks and apostrophes must be English curly marks, not
  copied Chinese/full-width or straight marks from web text.
- English em dashes must use the correct English dash glyph, not three hyphens
  and not a Chinese dash.
- When adding a Chinese gloss for a word outside the curriculum, the Chinese
  text goes inside English parentheses. Add spaces around the parentheses so
  they do not stick to neighboring English words, for example
  `photosynthesis (光合作用) process`.
- Page breaks must protect readability. Avoid splitting a reading question so
  the stem is on one page and all options are on the next. Avoid splitting a
  cloze passage onto one page and its option block onto another when possible.

## Reading Choice

- Reading A-D option blocks align to the wh-word / stem text, not to the
  question number.
- If Reading options are short enough to use a two-line layout, align A/C in
  one vertical column and B/D in one vertical column.
- Guess-word and attitude questions often use one-word options, but each option
  functions as an elliptical sentence. Capitalize the first letter and end with
  a period.

## 七选五

- Seven-choices blanks use three spaces before and after the blank number.
- Punctuation placement depends on what was blanked:
  - If the blank removes a half sentence or heading, punctuation stays in the
    passage after the blank.
  - If all five blanks remove complete sentences, punctuation belongs in the
    A-G options. The passage blank should not carry duplicate punctuation.

## 完形填空

- Cloze blanks use two spaces before and after the blank number.
- A-D options should be aligned with keyboard Tab stops so every A, B, C, and D
  column lines up even when option lengths differ.

## 语法填空

- Grammar-fill blanks use two spaces before and after the blank number.
- Prompt words in parentheses should stay visually attached to the blank while
  preserving English spacing rules.

## Writing

- 应用文写作 and 读后续写 both use two answer boxes.
