import { cleanPaperTitle, orderedGroups, renderPaperTitle } from './companion-analysis/paper.mjs'
import { escapeHtml } from './companion-analysis/text.mjs'
import { renderAnswerOverview } from './companion-analysis/blocks.mjs'
import { renderListeningGroup } from './companion-analysis/listening.mjs'
import { renderReadingGroup } from './companion-analysis/reading.mjs'
import { renderSevenChoicesGroup } from './companion-analysis/sevenChoices.mjs'
import { renderClozeGroup } from './companion-analysis/cloze.mjs'
import { renderGrammarFillGroup } from './companion-analysis/grammarFill.mjs'
import { renderWritingGroup } from './companion-analysis/writing.mjs'
import { revisionAnalysisSource } from './companion-analysis/source.mjs'
import { companionAnalysisStyles } from './companion-analysis/styles.mjs'
import { embeddedPaperFontCss } from '../paper-fonts.mjs'

export { companionAnalysisFileName, loadCompanionAnalysisSource } from './companion-analysis/source.mjs'

const HOUSE_MARK = '獭石试题解析'

function renderGroup(input) {
  switch (input.group?.groupType) {
    case 'listening':
      return renderListeningGroup({ ...input, analysis: input.analyses.listening })
    case 'reading':
      if (!input.analyses.reading?.groups?.[input.group.groupId]) return ''
      return renderReadingGroup({ ...input, analysis: input.analyses.reading })
    case 'sevenChoices':
    case 'seven_choices':
      if (!input.analyses.sevenChoices?.groups?.[input.group.groupId]) return ''
      return renderSevenChoicesGroup({ ...input, analysis: input.analyses.sevenChoices })
    case 'cloze':
      if (!input.analyses.cloze?.groups?.[input.group.groupId]) return ''
      return renderClozeGroup({ ...input, analysis: input.analyses.cloze })
    case 'grammarFill':
    case 'grammar_cloze':
      if (!input.analyses.grammarFill?.groups?.[input.group.groupId]) return ''
      return renderGrammarFillGroup({ ...input, analysis: input.analyses.grammarFill })
    case 'writing':
    case 'continuation':
      return renderWritingGroup({ ...input, analysis: input.analyses.writing })
    default:
      return ''
  }
}

function renderAnalysisBody(parts, paperAsset, analyses, figuresByGroup, sourceReferencesByGroup, listeningSegmentOrder) {
  return parts.map((part) => {
    const partTitle = escapeHtml(part.title)
    let partHeading = `<h2 class="part-title">${partTitle}</h2>`
    const sections = part.sections.map((section) => {
      let sectionHeading = !figuresByGroup || section.groups.length > 1
        ? `<h2 class="section-title">${escapeHtml(section.title)}</h2>` : ''
      const groups = section.groups.map((entry) => {
        const html = renderGroup({
          ...entry,
          paperAsset,
          analyses,
          sourceReferencesByGroup,
          listeningSegmentOrder,
          figures: figuresByGroup?.get(entry.group.groupId) ?? (figuresByGroup ? [] : null),
          openingHeadings: partHeading + sectionHeading,
        })
        if (html) {
          partHeading = ''
          sectionHeading = ''
        }
        return html
      }).join('')
      if (!groups) return ''
      return `<section class="paper-section">${groups}</section>`
    }).filter(Boolean).join('')
    if (!sections) return ''
    return `<article class="paper-part" data-part-title="${partTitle}">${sections}</article>`
  }).filter(Boolean).join('')
}

export function buildCompanionAnalysisHtml(input) {
  const { paperAsset, analyses, figuresByGroup, sourceReferencesByGroup, listeningSegmentOrder } = input.projection ? revisionAnalysisSource(input.projection) : input
  if (!paperAsset?.paper?.paperId) throw new Error('paperAsset is required')
  const title = cleanPaperTitle(paperAsset.paper.title)
  const parts = orderedGroups(paperAsset)
  const answerOverview = renderAnswerOverview(parts)
  const analysisBody = renderAnalysisBody(parts, paperAsset, analyses || {}, figuresByGroup, sourceReferencesByGroup, listeningSegmentOrder)
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}｜配套解析</title>
<!-- Font data is browser CSS, not paged-media CSS. Keep it out of Paged.js's
     CSS-tree parser (24-bit offsets cannot address a full OTF bundle). -->
<style data-pagedjs-ignore>
${embeddedPaperFontCss()}
</style>
<style>
${companionAnalysisStyles({ houseMark: HOUSE_MARK, paginated: Boolean(input.projection) })}</style>
</head>
<body><!--
THESIS: A compact two-column teaching companion, not an answer key squeezed into the exam; it refuses the boxed worksheet and web-card stack.
OWN-WORLD: White A4, a stable two-column publisher grid, near-black book ink, low-saturation aged pine green, serif reading lanes, sans editorial hierarchy and hairline rules.
STORY: The teacher finds authoritative answers first, then scans each narrow column in exam order through one natural evidence chain per question and fuller writing guidance where the task needs it.
FIRST VIEWPORT: House mark, paper title, a short aged-green hairline and the complete objective answer overview; teaching continues below without a forced blank cover remainder.
FORM: Owner-pinned restrained publisher and modern teacher-handbook hybrid; seed owner-publisher-companion-v0.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
--><main>
  <section class="frontmatter">
    <p class="house-mark">${HOUSE_MARK}</p>
    <h1>${renderPaperTitle(title)}</h1>
    <div class="title-rule" aria-hidden="true"></div>
    <section class="answer-overview">
      <h2>答案速查</h2>
      ${answerOverview}
    </section>
  </section>
  <div class="analysis-body">${analysisBody}</div>
</main></body>
</html>`
}
