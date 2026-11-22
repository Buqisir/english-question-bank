// Print stylesheet for the teacher analysis PDF. `paginated` is true for
// revision projections, which Paged.js fragments into A4 pages.
//
// Base grid (基本版式, W3C clreq §7.1): A4, two columns of about 24 Han
// characters at 10pt with a two-character column gap; the type area is 177.8mm
// wide. Leading 15pt gives a line gap of 50% of the type size: the low end of
// clreq's 50–100% band, which clreq allows for short lines like these. 10pt is
// the largest size that keeps the 2025 新课标Ⅱ companion within the page count
// of the old 9pt layout (22 pages against 23).
//
// Fonts are the exam paper's own stack (shared/papersurface/paperFonts.mjs):
// TeX Gyre Termes for every Latin glyph, Source Han Serif CN for Chinese, so
// English reads the same in a quote, a transcript or a Chinese sentence and
// matches the paper the companion sits beside. Hierarchy comes from Bold, size
// and the pine-green signature, not a sans.
//
// Three levels only: part title → group heading with its answer line →
// question, whose number block and answer open the first line of its
// explanation. Every other label is a bold run-in at body size. No horizontal
// rules anywhere in the body (the column rule is the only line); clues are a
// tint, long-sentence chunks are bracketed. Each class belongs to one
// component in components.mjs, the spec in
// docs/product/companion-analysis-components.md.
import { paperFontStack } from '../../../shared/papersurface/paperFonts.mjs'

export function companionAnalysisStyles({ houseMark, paginated }) {
  return `:root {
  --green: #596a58;
  --green-deep: #3b4e3d;
  --ink: #1e1e1c;
  --muted: #5d5d58;
  --line: #c6c6c0;
  --line-soft: #e4e4df;
  /* Clue tint: the pine green at about 17% on white. Prints as a pale grey on
     a monochrome laser, still visible, never a rule. */
  --tint: #e2e7df;
  --paper: #ffffff;
  --zh: ${paperFontStack};
  --en: ${paperFontStack};
  --fs: 10pt;
  --lh: 15pt;
  --small: 9pt;
  --char: 10pt;
}

@page {
  size: A4 portrait;
  margin: 17mm 14.2mm 18mm 18mm;

  @top-left {
    content: "${houseMark}";
    color: var(--green-deep);
    font: 700 8.5pt/1 var(--zh);
    letter-spacing: 0.04em;
    vertical-align: bottom;
    padding-bottom: 3.5mm;
  }

  @top-right {
    content: string(running-group, start);
    color: var(--ink);
    font: 700 8.5pt/1 var(--zh);
    vertical-align: bottom;
    padding-bottom: 3.5mm;
  }

  @bottom-left {
    content: string(paper-title);
    color: var(--muted);
    font: 400 8pt/1 var(--zh);
    vertical-align: top;
    padding-top: 3.5mm;
  }

  @bottom-right {
    content: counter(page);
    color: var(--ink);
    font: 700 9pt/1 var(--en);
    vertical-align: top;
    padding-top: 3.5mm;
  }
}

/* Mirrored for duplex: binding margin inside, running group and page number
   on the outer edge where a thumb flips. */
@page:left {
  margin: 17mm 18mm 18mm 14.2mm;

  @top-left {
    content: string(running-group, start);
    color: var(--ink);
    font: 700 8.5pt/1 var(--zh);
  }

  @top-right {
    content: "${houseMark}";
    color: var(--green-deep);
    font: 700 8.5pt/1 var(--zh);
    letter-spacing: 0.04em;
  }

  @bottom-left {
    content: counter(page);
    color: var(--ink);
    font: 700 9pt/1 var(--en);
  }

  @bottom-right {
    content: string(paper-title);
    color: var(--muted);
    font: 400 8pt/1 var(--zh);
  }
}

@page:first {
  @top-left { content: none; }
  @top-right { content: none; }
}

* {
  box-sizing: border-box;
}

html {
  background: var(--paper);
  color: var(--ink);
  font-family: var(--zh);
  font-size: var(--fs);
  line-height: var(--lh);
  font-kerning: normal;
  text-rendering: optimizeLegibility;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

body {
  margin: 0;
}

body::selection,
body *::selection {
  background: var(--line-soft);
  color: var(--ink);
}

p,
li,
dd {
  orphans: 2;
  widows: 2;
}

p {
  margin: 0;
}

b,
strong,
h1,
h2,
h3,
h4,
h5,
dt {
  font-weight: 700;
}

h1,
h2,
h3,
h4,
h5 {
  margin: 0;
  break-after: avoid;
}

[lang="en"] {
  font-family: var(--en);
}

/* ---------- First page ---------- */

.frontmatter {
  margin-bottom: 6mm;
}

.house-mark {
  margin: 0 0 4mm;
  color: var(--green-deep);
  font: 700 9pt/1 var(--zh);
  letter-spacing: 0.08em;
}

.frontmatter h1 {
  max-width: 150mm;
  color: var(--ink);
  font: 700 17pt/24pt var(--zh);
  string-set: paper-title content();
}

.frontmatter h1 span {
  white-space: nowrap;
}

.title-rule {
  width: 18mm;
  margin: 5mm 0 6mm;
  border-top: 0.7pt solid var(--green);
}

.answer-overview > h2 {
  margin: 0 0 2.4mm;
  font: 700 12pt/16.8pt var(--zh);
}

/* 答案速查 is a table without rules: the numbers sit on a pale band, five to
   a block as on the answer sheet, and the white gaps between cells are the
   table's lines. */
.answer-overview-section {
  display: grid;
  grid-template-columns: 17mm minmax(0, 1fr);
  column-gap: 2mm;
  margin-top: 2mm;
  break-inside: avoid;
}

.answer-overview-section h3 {
  padding-top: 0.6mm;
  color: var(--ink);
  font: 700 var(--fs)/var(--lh) var(--zh);
}

.answer-overview-section h3 small {
  display: block;
  color: var(--muted);
  font: 400 7.5pt/10pt var(--zh);
}

.answer-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1.6mm 2mm;
}

.answer-run {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  column-gap: 0.5mm;
}

.answer-grid--text {
  grid-template-columns: minmax(0, 1fr);
}

.answer-cell {
  color: var(--green-deep);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.answer-grid .answer-cell {
  display: flex;
  flex-direction: column;
  min-width: 0;
  text-align: center;
  text-align-last: center;
}

.answer-cell b {
  color: var(--muted);
  font-weight: 400;
}

.answer-grid .answer-cell b {
  border-radius: 1pt 1pt 0 0;
  background: var(--tint);
  color: var(--green-deep);
  font: 400 7.5pt/11pt var(--en);
  font-variant-numeric: tabular-nums;
}

.answer-grid .answer-cell > span {
  padding: 0.3mm 0.4mm 0;
  font: 700 11pt/15pt var(--en);
  overflow-wrap: break-word;
}

.answer-grid--text .answer-cell > span {
  font-size: var(--fs);
  line-height: var(--lh);
}

/* ---------- Body grid ---------- */

.analysis-body {
  column-count: 2;
  column-fill: auto;
  column-gap: calc(2 * var(--char));
  column-rule: 0.35pt solid var(--line);
  /* Ragged right everywhere (Owner 2026-11-21). Justified mixed lines spread
     the Chinese characters in front of an English word that does not fit;
     left-aligned, a line of fixed-width Chinese ends at most a character or
     two short. */
  text-align: start;
  /* Paged.js turns an implicit last-line alignment into "justify" on split
     fragments; an explicit start keeps every last line ragged. */
  text-align-last: start;
}

.paper-part {
  /* Paged.js clones the article on continuation pages. */
  string-set: running-section attr(data-part-title);
}

.paper-part + .paper-part {
  margin-top: var(--lh);
}

.heading-lead,
.continuation-grounded {
  break-inside: avoid;
}

/* Level 1: part title. Weight, colour and space set it off; no rules. */
.part-title {
  margin: 0 0 calc(var(--lh) / 3);
  color: var(--green-deep);
  font: 700 11pt/var(--lh) var(--zh);
}

.section-title {
  margin: 0 0 calc(var(--lh) / 3);
  color: var(--green-deep);
  font: 700 var(--fs)/var(--lh) var(--zh);
}

.paper-section + .paper-section,
.analysis-group + .analysis-group {
  margin-top: var(--lh);
}

/* Level 2: group heading and its answer line. */
.group-title {
  color: var(--ink);
  font: 700 12pt/var(--lh) var(--zh);
  string-set: running-group attr(data-running);
}

.group-heading {
  break-inside: avoid;
  break-after: avoid;
}

.group-key {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 2mm;
  margin: 0.4mm 0 calc(var(--lh) / 3);
  color: var(--muted);
  font: 400 var(--small)/var(--lh) var(--zh);
}

.group-key-answers {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(6.8em, 1fr));
  column-gap: 1em;
  font-family: var(--en);
  font-size: var(--fs);
}

/* Letter keys: five to a row, the answer-key grouping of 41–45, 46–50. */
.group-key-answers--letters {
  grid-template-columns: repeat(5, max-content);
  column-gap: 1.2em;
}

.group-key .answer-cell {
  max-width: 100%;
  overflow-wrap: anywhere;
}

/* Run-in labels: one style for every teaching label. */
.micro-heading,
.inline-label,
.overview .micro-heading {
  margin-right: 0.5em;
  color: var(--green-deep);
  font: 700 var(--fs)/var(--lh) var(--zh);
  white-space: nowrap;
}

/* Group-level teaching blocks: bold run-in heading, no rule. */
.overview,
.reading-discourse,
.full-translation,
.source-relationships,
.long-sentences {
  margin-top: calc(var(--lh) / 3);
}

.overview {
  break-inside: avoid;
}

.overview p {
  display: inline;
}

.reading-discourse h4,
.full-translation h4,
.source-relationships h4,
.long-sentences h4 {
  display: inline;
  margin-right: 0.5em;
  color: var(--green-deep);
  font: 700 var(--fs)/var(--lh) var(--zh);
}

.reading-discourse .heading-lead > h4 + p,
.full-translation .heading-lead > h4 + p,
.long-sentences .heading-lead > h4 + .long-sentence {
  display: inline;
}

.full-translation p {
  text-indent: 2em;
  white-space: pre-line;
}

.full-translation .heading-lead > h4 + p {
  text-indent: 0;
}

.source-relationships .heading-lead > h4 {
  display: block;
}

.source-relationships p + p,
.source-relationships .heading-lead + p {
  margin-top: 0.6mm;
}

/* Clue mark (class name kept from when it was an underline): a pale tint
   over the words, the way answer books shade an evidence sentence, so a
   passage full of clues does not become a page of lines. */
.source-underline {
  background: var(--tint);
  -webkit-box-decoration-break: clone;
  box-decoration-break: clone;
}

/* In a long sentence the marked chunks are its structure, not clues: square
   brackets around each, as grammar notes print them. */
.long-sentence-source .source-underline {
  background: none;
}

.long-sentence-source .source-underline::before,
.long-sentence-source .source-underline::after {
  color: var(--green);
  font-weight: 400;
}

.long-sentence-source .source-underline::before {
  content: "[";
}

.long-sentence-source .source-underline::after {
  content: "]";
}

/* The filled answer: bold, its number in front as on the exam paper. */
.answer-fill {
  font-weight: 700;
}

.blank-no {
  color: var(--green-deep);
  font: 700 var(--small)/1 var(--en);
  margin-right: 0.2em;
  white-space: nowrap;
}

/* A clue's number trails it, small and raised, so the blank numbers stay the
   only full-size numbers in the line. line-height 0 keeps the leading even. */
.clue-tail {
  white-space: nowrap;
}

.clue-no {
  color: var(--green-deep);
  font: 700 0.62em/0 var(--en);
  vertical-align: 0.5em;
  margin-left: 0.08em;
  white-space: nowrap;
}

.long-sentence {
  break-inside: avoid;
}

.long-sentences .heading-lead > h4 + .long-sentence {
  display: block;
}

.long-sentence + .long-sentence {
  margin-top: calc(var(--lh) / 3);
}

.long-sentence-related {
  color: var(--muted);
  font-size: var(--small);
}

/* Level 3: a question opens with number and answer on its first line. */
.question {
  margin-top: calc(var(--lh) / 2);
  break-inside: auto;
}

.question-lead {
  break-inside: avoid;
}

.question-heading {
  display: inline;
  margin-right: 0.4em;
}

.question-heading + p,
.question-heading + .evidence-quote {
  display: inline;
}

.question-number {
  /* The one filled shape on the page: a pine block with the number reversed
     out, so a teacher scanning a column finds question 47 by its block. One-
     and two-digit numbers get the same block, the figures centred in it.
     The figures sit on the text baseline at about the cap height of the
     answer letter beside them; the line box is cut to the figure height and
     the padding puts the same pine above and below them (Termes figures
     leave 0.29em more room under the line box than over it), so the block
     reaches only a little under the baseline instead of hanging below. */
  display: inline-block;
  box-sizing: border-box;
  min-width: 2em;
  margin-right: 0.4em;
  /* The two paddings add to 3.75pt, five CSS pixels, so every block snaps
     to the same height. */
  padding: 3.375pt 0.3em 0.375pt;
  border-radius: 1.5pt;
  background: var(--green-deep);
  color: var(--paper);
  text-align: center;
  /* The body sets text-align-last: start, which a one-line block inherits. */
  text-align-last: center;
  font: 700 10.5pt/7.5pt var(--en);
  font-variant-numeric: lining-nums tabular-nums;
  string-set: running-question content();
}

.question-answer {
  margin-right: 0.4em;
  color: var(--green-deep);
  font: 700 11pt/var(--lh) var(--en);
}

.answer-text {
  margin-right: 0.3em;
  color: var(--green-deep);
  font-weight: 700;
}

.question-heading small {
  margin-right: 0.4em;
  color: var(--muted);
  font-size: var(--small);
}

.question-stem {
  font-weight: 700;
}

/* Reading prints the English stem as on the paper, in body weight so the
   bold 定位词 inside it stands out, and the Chinese translation on its own
   line in muted ink. */
.question-stem--en {
  font-weight: 400;
}

.question-stem-zh {
  color: var(--muted);
}

.question-lead > .question-stem + p,
.question-lead > .question-stem + .listening-options {
  margin-top: 0.4mm;
}

.analysis-prose,
.evidence-quote,
.evidence-locate,
.evidence-paraphrase,
.distractor {
  margin-top: 0.6mm;
}

.listening-options {
  margin: 0.4mm 0 0;
  padding: 0;
  list-style: none;
}

/* Short options share a row, as on the exam paper; a long one keeps its own. */
.listening-options li {
  display: inline-block;
  max-width: 100%;
  margin-right: 1.5em;
  vertical-align: top;
}

.listening-options b {
  font-family: var(--en);
}

.evidence-quote {
  break-inside: avoid;
}

.evidence-quote p {
  display: inline;
}

/* 定位 written by the analysis: the stem's locating words in bold inside the
   quote, the answer on the clue tint, and, when the answer is not in the
   定位句, one line saying why, under the quote. */
.locate-cue {
  font-weight: 700;
}

/* The 定位 line: 「原词」 and the paragraph are muted; 「答案不在定位句，在前
   两句」 stays in body ink, since it is what sends the reader on from the
   定位句. */
.evidence-locate .locate-note {
  margin-left: 0.6em;
  color: var(--muted);
  white-space: nowrap;
}

/* Its own line, lined up with the words after 「定位」 (two characters plus
   the label's 0.5em gap). */
.evidence-locate .locate-where {
  display: block;
  padding-left: 2.5em;
}

/* The short line after the 定位 skeleton: body ink, on the same line,
   set off from the skeleton by a gap rather than a label. */
.evidence-locate .locate-find {
  margin-left: 0.9em;
}

.evidence-quote .evidence-bridge {
  display: block;
  color: var(--muted);
}

.locate-legend {
  margin-top: 0.6mm;
  color: var(--muted);
  font-size: var(--small);
}

.distractor {
  break-inside: avoid;
}

.distractor > div {
  display: contents;
}

/* The label runs in beside the first item instead of taking a line. */
.distractor > .micro-heading {
  float: left;
}

.distractor b {
  font-family: var(--en);
}

.reading-distractor-item,
.cloze-distractor-item {
  display: block;
}

/* Seven-choices: the blank in its context. */
.context-chain {
  margin: 0.4mm 0 0;
  break-inside: avoid;
}

.context-chain > div {
  display: grid;
  grid-template-columns: 2.6em 1fr;
  gap: 0.4em;
}

.context-chain span {
  color: var(--muted);
  font-size: var(--small);
}

.context-chain-answer span,
.context-chain-answer p {
  color: var(--green-deep);
  font-weight: 700;
}

/* Listening materials. */
.listening-material + .listening-material {
  margin-top: var(--lh);
}

.listening-material h4 {
  color: var(--ink);
  font: 700 var(--fs)/var(--lh) var(--zh);
}

.listening-topic {
  color: var(--muted);
  font-size: var(--small);
}

.listening-transcript,
.listening-translation {
  margin-top: calc(var(--lh) / 3);
}

.listening-transcript h5,
.listening-translation h5 {
  display: inline;
  margin-right: 0.5em;
  color: var(--green-deep);
  font: 700 var(--fs)/var(--lh) var(--zh);
}

.listening-transcript .heading-lead > h5 + p,
.listening-translation .heading-lead > h5 + p {
  display: inline;
}

/* Writing. */
.writing-block {
  margin-top: var(--lh);
}

.analysis-group--writing > .review-card:first-child {
  margin-top: 0;
}

.writing-block > h4,
.writing-block > .heading-lead > h4,
.model-essay > .heading-lead > h4 {
  margin: 0 0 calc(var(--lh) / 4);
  color: var(--green-deep);
  font: 700 var(--fs)/var(--lh) var(--zh);
}

.review-card .group-title + .review-group,
.review-group + .review-group,
.review-card > .heading-lead + .review-group {
  margin-top: calc(var(--lh) / 2);
}

.review-group > h5 {
  margin: 0 0 calc(var(--lh) / 4);
  color: var(--green-deep);
  font: 700 var(--fs)/var(--lh) var(--zh);
}

.route-paragraph h5 {
  margin: 0 0 0.4mm;
  color: var(--ink);
  font: 700 var(--fs)/var(--lh) var(--zh);
}

.review-facts,
.reader-facts,
.story-map {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  margin: 0;
}

.review-facts > div,
.reader-facts > div,
.story-map > div {
  display: grid;
  grid-template-columns: 5em 1fr;
  gap: 0.5em;
  padding: 0.4mm 0;
  break-inside: avoid;
}

dt {
  color: var(--muted);
  font-size: var(--fs);
}

dd {
  margin: 0;
}

.review-card dd span {
  display: block;
}

/* 读后续写原文理解: the row name runs in as a Label, like 干扰项辨析, so the
   story map is one level under 原文理解 instead of two. */
.story-map > div {
  clear: both;
}

.story-map dd > .route-paragraph:first-child {
  margin-top: 0;
}

.story-map dt {
  float: left;
  margin-right: 0.5em;
  color: var(--green-deep);
}

.continuation-evidence {
  margin: 0.4mm 0 0;
}

.review-points {
  margin: 0;
  padding-left: 1.5em;
}

.route-paragraph ul,
.continuation-section ul {
  margin: 0;
  padding-left: 1.5em;
}

.route-paragraph {
  margin-top: calc(var(--lh) / 2);
  break-inside: avoid;
}

.model-paragraph {
  font-family: var(--en);
  font-size: var(--fs);
  line-height: var(--lh);
}

.model-paragraph + .model-paragraph {
  text-indent: 0;
}

.model-essay + .model-essay {
  margin-top: var(--lh);
}

.model-paragraph + .model-paragraph,
.model-essay > .heading-lead + .model-paragraph,
.model-essay > .heading-lead + .model-signoff,
.model-paragraph + .model-signoff {
  margin-top: 1mm;
}

@media screen {
  html {
    background: #ededea;
  }

  body {
    width: 210mm;
    min-height: 297mm;
    margin: 12mm auto;
    padding: 17mm 14.2mm 18mm 18mm;
    background: var(--paper);
    box-shadow: 0 8px 24px rgba(30, 30, 28, 0.12);
  }
}

@media screen and (max-width: 210mm) {
  body {
    width: 100%;
    min-height: 0;
    margin: 0;
    padding: 16px;
    box-shadow: none;
  }

  .analysis-body {
    column-count: 1;
  }
}
${paginated ? `
/* Paged.js must fragment lengthy writing explanations inside a column. */
.story-map,
.story-map > div {
  display: block;
}
.story-map > div,
.continuation-section .route-paragraph {
  break-inside: auto;
}
.story-map dt {
  break-after: avoid;
}
.pagedjs_first_page .pagedjs_margin-top-left,
.pagedjs_first_page .pagedjs_margin-top-right {
  visibility: hidden;
}
` : ''}`
}
