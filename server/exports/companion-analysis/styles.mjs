// Print stylesheet for the teacher analysis PDF. `paginated` is true for
// revision projections, which Paged.js fragments into A4 pages.
export function companionAnalysisStyles({ houseMark, paginated }) {
  return `:root {
  --green: #596a58;
  --green-deep: #3b4e3d;
  --ink: #1e1e1c;
  --muted: #62625d;
  --line: #c6c6c0;
  --line-soft: #e8e8e4;
  --paper: #ffffff;
  --serif: "Noto Serif CJK SC", "Source Han Serif SC", "Songti SC", SimSun, serif;
  --sans: "Noto Sans CJK SC", "Source Han Sans SC", "Microsoft YaHei", sans-serif;
  --latin: "Times New Roman", "Noto Serif", Times, serif;
}

@page {
  size: A4 portrait;
  margin: 17mm 17mm 19mm 21mm;

  @top-left {
    content: "${houseMark}";
    color: var(--green-deep);
    font: 600 8pt/1 var(--sans);
    letter-spacing: 0.04em;
    vertical-align: bottom;
    padding-bottom: 3mm;
  }

  @top-right {
    content: string(running-section, first);
    color: var(--muted);
    font: 400 8pt/1 var(--sans);
    vertical-align: bottom;
    padding-bottom: 3mm;
  }

  @bottom-left {
    content: string(paper-title);
    color: var(--muted);
    font: 400 8pt/1 var(--sans);
    vertical-align: top;
    padding-top: 3mm;
  }

  @bottom-right {
    content: counter(page);
    color: var(--ink);
    font: 600 8pt/1 var(--sans);
    vertical-align: top;
    padding-top: 3mm;
  }
}

@page:left {
  margin: 17mm 21mm 19mm 17mm;
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
  font-family: var(--serif);
  font-size: 9pt;
  line-height: 13.6pt;
  hanging-punctuation: first allow-end last;
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
  orphans: 3;
  widows: 3;
}

p {
  margin: 0;
}

h4,
h5 {
  break-after: avoid;
}

[lang="en"] {
  font-family: var(--latin);
}

.frontmatter {
  margin-bottom: 8mm;
}

.house-mark {
  margin: 0 0 5mm;
  color: var(--green-deep);
  font: 600 9pt/1 var(--sans);
  letter-spacing: 0.08em;
}

.frontmatter h1 {
  margin: 0;
  max-width: 142mm;
  color: var(--ink);
  font: 700 18pt/24pt var(--sans);
  letter-spacing: -0.015em;
  string-set: paper-title content();
}

.frontmatter h1 span {
  white-space: nowrap;
}

.title-rule {
  display: grid;
  grid-template-columns: 18mm 1fr;
  gap: 2mm;
  margin: 8mm 0 11mm;
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
  margin: 0 0 3mm;
  font: 700 13pt/18pt var(--sans);
}

.answer-overview-section {
  display: grid;
  grid-template-columns: 19mm minmax(0, 1fr);
  gap: 2mm;
  padding: 0.8mm 0;
  border-top: 0.35pt solid var(--line);
  break-inside: avoid;
}

.answer-overview-section h3 {
  margin: 0;
  padding: 0.65mm 0;
  color: var(--muted);
  font: 600 8.5pt/10pt var(--sans);
}

.answer-overview-section h3 small {
  display: block;
  margin-top: 0.6mm;
  font: 400 7pt/9pt var(--sans);
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
  padding: 0.65mm 0.65mm 0.65mm 0;
  font: 700 8pt/10pt var(--sans);
}

.answer-cell b {
  color: var(--muted);
  font-weight: 500;
}

.answer-grid .answer-cell b {
  display: inline-block;
  min-width: 3.5mm;
  text-align: right;
}

.group-heading {
  break-inside: avoid;
  break-after: avoid;
}

.group-heading .group-title {
  margin-bottom: 1mm;
}

.group-key {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 2mm;
  margin: 0 0 3mm;
  padding: 1mm 0;
  border-top: 0.35pt solid var(--line);
  border-bottom: 0.35pt solid var(--line-soft);
  color: var(--muted);
  font: 600 8pt/11pt var(--sans);
}

.group-key-answers {
  display: flex;
  flex-wrap: wrap;
  column-gap: 1.2mm;
}

.group-key .answer-cell {
  max-width: 100%;
  overflow-wrap: anywhere;
}

.answer-separator {
  color: var(--muted);
}

.analysis-body {
  column-count: 2;
  column-fill: auto;
  column-gap: 8mm;
  column-rule: 0.35pt solid var(--line);
  text-align: left;
}

.paper-part {
  margin-top: 0;
  /* Paged.js clones the article on continuation pages. */
  string-set: running-section attr(data-part-title);
}

.paper-part + .paper-part {
  margin-top: 8mm;
}

.heading-lead,
.continuation-grounded {
  break-inside: avoid;
}

.part-title {
  width: fit-content;
  margin: 0 0 4mm;
  padding: 1.2mm 2.4mm 1mm;
  border: 0.35pt solid var(--green);
  border-radius: 2px;
  color: var(--green-deep);
  font: 700 10pt/13pt var(--sans);
  break-after: avoid;
}

.paper-section + .paper-section {
  margin-top: 7mm;
}

.section-title {
  margin: 0 0 3.5mm;
  color: var(--green-deep);
  font: 700 10.5pt/14pt var(--sans);
  break-after: avoid;
}

.analysis-group + .analysis-group {
  margin-top: 6mm;
}

.group-title {
  margin: 0 0 2.8mm;
  color: var(--ink);
  font: 700 10pt/14pt var(--sans);
  break-after: avoid;
}

.overview {
  display: grid;
  grid-template-columns: 14mm 1fr;
  gap: 2.5mm;
  margin: 0 0 3.5mm;
  padding: 2.2mm 0;
  border-top: 0.35pt solid var(--line);
  border-bottom: 0.35pt solid var(--line);
  break-inside: avoid;
}

.micro-heading {
  color: var(--green-deep);
  font: 600 8.5pt/12pt var(--sans);
  white-space: nowrap;
}

.source-underline {
  text-decoration-line: underline;
  text-decoration-color: var(--green);
  text-decoration-thickness: 0.55pt;
  text-underline-offset: 1.4pt;
  text-decoration-skip-ink: auto;
}

.reading-discourse,
.full-translation,
.source-relationships,
.long-sentences {
  margin-top: 5mm;
}

.reading-discourse h4,
.full-translation h4,
.source-relationships h4,
.long-sentences h4 {
  margin: 0 0 2mm;
  padding-bottom: 1.2mm;
  border-bottom: 0.35pt solid var(--line);
  color: var(--green-deep);
  font: 700 9.5pt/13pt var(--sans);
  break-after: avoid;
}

.long-sentence {
  padding-bottom: 2.4mm;
  break-inside: avoid;
}

.long-sentence p + p {
  margin-top: 1.2mm;
}

.long-sentence-related {
  color: var(--muted);
  font: 600 8.2pt/12pt var(--sans);
}

.long-sentence-source {
  color: var(--ink);
  font-size: 9.1pt;
  line-height: 14pt;
  text-align: left;
}

.inline-label {
  margin-right: 0.5em;
  color: var(--green-deep);
  font: 600 8.3pt/12pt var(--sans);
  white-space: nowrap;
}

.overview p,
.full-translation p,
.analysis-prose,
.distractor p {
  text-wrap: pretty;
}

.question {
  margin-top: 3.6mm;
  padding-top: 2.8mm;
  border-top: 0.35pt solid var(--line-soft);
  break-inside: auto;
}

.overview + .question,
.heading-lead:has(> .overview:last-child) + .question {
  margin-top: 0;
}

.full-translation {
  margin: 0 0 4mm;
}

.full-translation p {
  text-indent: 2em;
  text-wrap: pretty;
  white-space: pre-line;
}

.full-translation p + p,
.full-translation .heading-lead + p {
  margin-top: 0.8mm;
}

.translation-marker {
  font-family: var(--sans);
  font-size: 8.5pt;
  font-weight: 700;
  white-space: nowrap;
}

.question-heading {
  display: flex;
  align-items: baseline;
  gap: 2.2mm;
  margin-bottom: 1.5mm;
  font-family: var(--sans);
  break-after: avoid;
}

.question-lead {
  break-inside: avoid;
}

.question-number {
  min-width: 8mm;
  color: var(--ink);
  font-size: 10pt;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.question-answer {
  min-width: 6mm;
  color: var(--green-deep);
  font-size: 10pt;
  font-weight: 800;
}

.answer-text {
  color: var(--ink);
  font-size: 9pt;
  font-weight: 600;
}

.question-stem {
  margin-bottom: 1.5mm;
  font-weight: 600;
}

.listening-options {
  margin: 0 0 3mm;
  padding: 0;
  list-style: none;
}

.analysis-prose + .evidence-quote,
.analysis-prose + .distractor,
.question-lead:has(> .analysis-prose:last-child) + .evidence-quote,
.question-lead:has(> .analysis-prose:last-child) + .distractor,
.evidence-quote + .distractor {
  margin-top: 2.5mm;
}

.evidence-quote {
  break-inside: avoid;
}

.evidence-quote .micro-heading {
  margin-right: 2mm;
}

.evidence-quote p {
  display: inline;
  font-size: 9pt;
  line-height: 13.6pt;
}

.distractor--reading .micro-heading,
.distractor--cloze .micro-heading {
  display: block;
  margin-bottom: 0.8mm;
  break-after: avoid;
}

.reading-distractor-item + .reading-distractor-item,
.cloze-distractor-item + .cloze-distractor-item {
  margin-top: 0.8mm;
}

.distractor b {
  font-family: var(--sans);
  font-weight: 600;
}

.distractor {
  break-inside: avoid;
}

.context-chain {
  margin: 1mm 0 2.5mm;
  break-inside: avoid;
}

.context-chain > div {
  display: grid;
  grid-template-columns: 11mm 1fr;
  gap: 2mm;
}

.context-chain > div + div {
  margin-top: 0.8mm;
}

.context-chain span {
  color: var(--muted);
  font: 600 8.5pt/12pt var(--sans);
}

.context-chain-answer span,
.context-chain-answer p {
  color: var(--green-deep);
  font-weight: 600;
}

.writing-block {
  margin-top: 6mm;
}

.analysis-group--writing > .review-card:first-child {
  margin-top: 0;
}

.writing-block > h4,
.writing-block > .heading-lead > h4,
.model-essay > .heading-lead > h4 {
  margin: 0 0 3mm;
  padding-bottom: 2mm;
  border-bottom: 0.35pt solid var(--line);
  color: var(--ink);
  font: 700 10.5pt/15pt var(--sans);
  break-after: avoid;
}

.review-card .group-title + h4 {
  margin-top: 6mm;
}

.review-group + .review-group,
.review-card > .heading-lead + .review-group {
  margin-top: 4mm;
  padding-top: 3mm;
  border-top: 0.35pt solid var(--line-soft);
}

.review-group > h5 {
  margin: 0 0 1.5mm;
  color: var(--green-deep);
  font: 700 8.5pt/12pt var(--sans);
  break-after: avoid;
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
  grid-template-columns: 18mm 1fr;
  gap: 2mm;
  padding: 1.7mm 0;
  border-bottom: 0.35pt solid var(--line-soft);
  break-inside: avoid;
}

dt {
  color: var(--muted);
  font: 600 8.5pt/12pt var(--sans);
}

dd {
  margin: 0;
}

.review-card dd span {
  display: block;
}

.review-card dd span + span {
  margin-top: 0.8mm;
}

.review-points {
  margin: 0;
  padding-left: 5mm;
}

.review-points li + li {
  margin-top: 1mm;
}

.writing-points,
.review-value,
.selected-route,
.theme {
  margin-top: 4mm;
}

.writing-points ol,
.writing-points ul,
.route-paragraph ul {
  margin: 1.5mm 0 0;
  padding-left: 5mm;
}

.model-paragraph {
  font-family: var(--latin);
  font-size: 9.2pt;
  line-height: 14.4pt;
}

.model-essay + .model-essay,
.model-paragraph + .model-paragraph,
.model-essay > .heading-lead + .model-paragraph,
.model-essay > .heading-lead + .model-signoff,
.model-paragraph + .model-signoff {
  margin-top: 2.2mm;
}

.expressions ol {
  margin: 0;
  padding-left: 6mm;
}

.expressions li {
  padding: 2.2mm 0 2.7mm 1mm;
  border-bottom: 0.35pt solid var(--line-soft);
  break-inside: avoid;
}

.expressions li p {
  text-wrap: pretty;
}

.expression-text {
  margin-bottom: 1mm;
  color: var(--green-deep);
  font-weight: 600;
}

.route-paragraph {
  margin-top: 4mm;
  padding-bottom: 4mm;
  border-bottom: 0.35pt solid var(--line-soft);
  break-inside: avoid;
}

.route-paragraph h5 {
  margin: 0 0 1.5mm;
  color: var(--green-deep);
  font: 700 9pt/13pt var(--sans);
}

.route-paragraph p,
.route-paragraph li {
  text-wrap: pretty;
}

@media screen {
  html {
    background: #ededea;
  }

  body {
    width: 210mm;
    min-height: 297mm;
    margin: 12mm auto;
    padding: 17mm 17mm 19mm 21mm;
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

  .frontmatter {
    min-height: 0;
  }

  .frontmatter + .analysis-body {
    margin-top: 32px;
    break-before: auto;
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
  margin-bottom: 1mm;
  break-after: avoid;
}
.pagedjs_first_page .pagedjs_margin-top-left,
.pagedjs_first_page .pagedjs_margin-top-right {
  visibility: hidden;
}
` : ''}
`
}
