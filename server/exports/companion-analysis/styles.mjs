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
// Three levels only: part band → group heading with its answer line →
// question, whose number and answer open the first line of its explanation.
// Every other label is a bold run-in at body size, never a ruled sub-heading.
import { paperFontStack } from '../../../shared/papersurface/paperFonts.mjs'

export function companionAnalysisStyles({ houseMark, paginated }) {
  return `:root {
  --green: #596a58;
  --green-deep: #3b4e3d;
  --ink: #1e1e1c;
  --muted: #5d5d58;
  --line: #c6c6c0;
  --line-soft: #e4e4df;
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
  display: grid;
  grid-template-columns: 18mm 1fr;
  gap: 2mm;
  margin: 5mm 0 6mm;
}

.title-rule::before,
.title-rule::after {
  height: 0;
  border-top: 0.7pt solid var(--green);
  content: "";
}

.title-rule::after {
  border-color: var(--line);
  border-top-width: 0.35pt;
}

.answer-overview > h2 {
  margin: 0 0 2mm;
  font: 700 12pt/16.8pt var(--zh);
}

.answer-overview-section {
  display: grid;
  grid-template-columns: 20mm minmax(0, 1fr);
  gap: 2mm;
  padding: 1mm 0;
  border-top: 0.35pt solid var(--line);
  break-inside: avoid;
}

.answer-overview-section h3 {
  padding: 0.5mm 0;
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
  grid-template-columns: repeat(10, minmax(0, 1fr));
}

.answer-grid--text {
  grid-template-columns: repeat(5, minmax(0, 1fr));
}

.answer-cell {
  color: var(--green-deep);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.answer-grid .answer-cell {
  padding: 0.5mm 0.6mm 0.5mm 0;
  font: 700 var(--fs)/var(--lh) var(--en);
}

.answer-cell b {
  color: var(--muted);
  font-weight: 400;
}

.answer-grid .answer-cell b {
  display: inline-block;
  min-width: 5mm;
  text-align: right;
}

/* ---------- Body grid ---------- */

.analysis-body {
  column-count: 2;
  column-fill: auto;
  column-gap: calc(2 * var(--char));
  column-rule: 0.35pt solid var(--line);
  text-align: justify;
  /* Paged.js turns an implicit last-line alignment into "justify" on split
     fragments, which spreads every <br>-ended transcript line letter by
     letter. An explicit start keeps the last line ragged. */
  text-align-last: start;
}

[lang="en"],
.analysis-body [lang="en"],
.listening-source,
.listening-transcript .heading-lead,
.evidence-quote,
.continuation-evidence li,
.model-paragraph,
.model-signoff {
  /* English-led lines stay ragged-right: justifying a line with few word
     spaces letter-spaces its Chinese label (原 文) instead. */
  text-align: left;
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

/* Level 1: part band. */
.part-title {
  margin: 0 0 calc(var(--lh) / 2);
  padding: 0.8mm 0 0.6mm;
  border-top: 0.7pt solid var(--green);
  border-bottom: 0.35pt solid var(--green);
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
  margin: 0.6mm 0 calc(var(--lh) / 3);
  padding: 0.6mm 0;
  border-top: 0.35pt solid var(--line);
  border-bottom: 0.35pt solid var(--line);
  color: var(--muted);
  font: 400 var(--small)/var(--lh) var(--zh);
}

.group-key-answers {
  display: flex;
  flex-wrap: wrap;
  column-gap: 1.4mm;
  font-family: var(--en);
  font-size: var(--fs);
}

.group-key .answer-cell {
  max-width: 100%;
  overflow-wrap: anywhere;
}

.answer-separator {
  color: var(--muted);
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

.source-underline {
  text-decoration-line: underline;
  text-decoration-color: var(--green);
  text-decoration-thickness: 0.6pt;
  text-underline-offset: 1.6pt;
  text-decoration-skip-ink: auto;
}

.translation-marker {
  color: var(--green-deep);
  font: 700 var(--small)/1 var(--en);
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
  display: inline-block;
  min-width: 1.6em;
  margin-right: 0.3em;
  color: var(--ink);
  font: 700 11pt/var(--lh) var(--en);
  font-variant-numeric: tabular-nums;
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

.question-lead > .question-stem + p,
.question-lead > .question-stem + .listening-options {
  margin-top: 0.4mm;
}

.analysis-prose,
.evidence-quote,
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
  font: 700 11pt/var(--lh) var(--zh);
}

.review-card .group-title + h4 {
  margin-top: calc(var(--lh) / 2);
}

.review-group + .review-group,
.review-card > .heading-lead + .review-group {
  margin-top: calc(var(--lh) / 2);
}

.review-group > h5,
.route-paragraph h5 {
  margin: 0 0 0.4mm;
  color: var(--green-deep);
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
  padding: 0.6mm 0;
  border-bottom: 0.35pt solid var(--line-soft);
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
  text-align: left;
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
