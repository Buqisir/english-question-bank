import { embeddedPaperFontCss } from './paper-fonts.mjs'
import { paperSurfaceTokens } from '../shared/papersurface/tokens.mjs'
import { validateNck1SourceMaterialization } from '../shared/paper-canonical/nck1SourceMaterialization.mjs'
import { assertSourceReferences, sourceReferenceBlocks } from './paper-import/sourceReferences.mjs'
import { deriveNck1AnalyzedPackageBundle } from './paper-canonical/nck1AnalyzedPackageAdapter.mjs'
import { digestJson } from '../shared/paper-canonical/stable.mjs'
import { sourceReferenceFigurePresentation } from './paper-import/sourceReferencePresentation.mjs'

function assertAnswerSource(materialization, sourceInput) {
  if (materialization.documents) {
    const issues = validateNck1SourceMaterialization(materialization)
    if (issues.length) throw new Error(`Answer source is invalid: ${issues[0].code}`)
  } else {
    const derived = deriveNck1AnalyzedPackageBundle(sourceInput)
    if (derived.issues.length || digestJson(derived.materialization) !== digestJson(materialization)) {
      throw new Error('Answer source differs from the exact sealed analyzed package')
    }
  }
}

function escapeHtml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
}

function textHtml(value) {
  return escapeHtml(value).replaceAll('\n', '<br>')
}

function keyTable(answers, columns) {
  const rows = []
  for (let start = 0; start < answers.length; start += columns) {
    rows.push(`<tr>${answers.slice(start, start + columns).map(answer =>
      `<td><span class="answer-key"><span class="answer-number">${answer.canonicalNumber}.</span> <span class="answer-value" data-answer-number="${answer.canonicalNumber}">${textHtml(answer.value)}</span></span></td>`,
    ).join('')}</tr>`)
  }
  return `<table class="answer-keys answer-keys--${columns}"><tbody>${rows.join('')}</tbody></table>`
}

function rangeTable(groups) {
  return `<table class="answer-keys answer-ranges"><tbody><tr>${groups.map(answers => {
    const range = `${answers[0].canonicalNumber}-${answers.at(-1).canonicalNumber}`
    return `<td data-answer-range="${range}"><span class="answer-number">${range}</span> ${answers.map(answer =>
      `<span data-answer-number="${answer.canonicalNumber}" aria-label="第${answer.canonicalNumber}题 ${escapeHtml(answer.value)}">${textHtml(answer.value)}</span>`,
    ).join('')}</td>`
  }).join('')}</tr></tbody></table>`
}

function referenceNumber(number) {
  return ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'][number - 1] ?? ` ${number}`
}

function referenceSection(group, kind, starters = [], labelOverride = null, namespace = null) {
  const section = group[kind]
  const label = labelOverride ?? (kind === 'essays'
    ? group.taskType === 'application' ? '第一节（满分15分）' : '第二节（满分25分）'
    : `${group.taskType === 'application' ? '应用文' : '读后续写'}源评分参考`)
  // A source label may already contain the section heading. Split only its
  // visual lines, retaining all original characters under the source marker.
  const sectionPrefix = value => value?.match(/^(\s*第[一二]节\s*[（(][^）)]*[）)]\s*)([\s\S]+)$/u)
  const heading = kind === 'essays' && sectionPrefix(section.entries[0]?.sourceLabel)
    ? '' : `<h3 class="writing-section">${label}</h3>`
  let joinedHeading = false
  const content = section.state === 'not_supplied'
    ? '<p class="source-absent">源未提供。</p>'
    : section.entries.map((entry, index) => {
      const prefix = sectionPrefix(entry.sourceLabel)
      const sourceLabel = prefix
        ? `<span class="writing-section-source">${textHtml(prefix[1])}</span><span>${textHtml(prefix[2])}</span>`
        : textHtml(entry.sourceLabel ?? (kind === 'essays'
          ? `参考范文${section.entries.length > 1 ? referenceNumber(index + 1) : ''}`
          : `源参考${section.entries.length > 1 ? ` ${index + 1}` : ''}`))
      const labelHtml = `<h3 class="reference-label" data-reference-label="${escapeHtml(entry.referenceId)}">${sourceLabel}</h3>`
      const blocks = sourceReferenceBlocks(entry)
      const paragraphs = blocks.map(block => {
        if (block.kind === 'table') {
          return `<table class="reference-table" data-reference-table="${escapeHtml(block.tableId)}"><tbody>${block.rows.map(row =>
            `<tr>${row.map(cell => `<td data-reference-cell="${escapeHtml(cell.cellId)}">${textHtml(cell.text)}</td>`).join('')}</tr>`,
          ).join('')}</tbody></table>`
        }
        const { paragraph } = block
        // Emphasize only a source-bound starter actually present in the essay;
        // do not prepend paragraph numbers or invent missing starter text.
        const starter = kind === 'essays' && paragraph.role === 'body'
          ? starters.map(value => value.replace(/^Paragraph\s+\d+\s*:\s*/iu, ''))
            .find(value => value && paragraph.text.startsWith(value)) : null
        const prose = starter ? `<em class="continuation-starter">${textHtml(starter)}</em>${textHtml(paragraph.text.slice(starter.length))}` : textHtml(paragraph.text)
        const figures = kind === 'essays' ? sourceReferenceFigurePresentation(entry, paragraph.paragraphId, namespace)
          .map(figure => `<figure class="reference-figure" id="${figure.domId}" data-reference-figure="${escapeHtml(figure.figureId)}"><img alt="" src="${figure.dataUrl}" style="width:${figure.widthMm}mm;height:${figure.heightMm}mm"></figure>`).join('') : ''
        return `<p class="reference-paragraph reference-paragraph--${paragraph.role}" data-reference-paragraph="${escapeHtml(paragraph.paragraphId)}">${prose}</p>${figures}`
      })
      // Keep the section, source label and first source paragraph together.
      // The rest of a long essay can still flow onto subsequent pages.
      const keepOpening = blocks[0]?.paragraph?.role === 'salutation'
        || (kind === 'essays' && blocks[0]?.kind === 'paragraph')
      const sectionHeading = keepOpening && index === 0 ? heading : ''
      if (sectionHeading) joinedHeading = true
      const opening = keepOpening
        ? `<div class="reference-opening">${sectionHeading}${labelHtml}${paragraphs.shift()}</div>` : labelHtml
      return `<article data-source-reference="${escapeHtml(entry.referenceId)}">
${opening}
${paragraphs.join('\n')}
</article>`
    }).join('\n')
  return `<section data-answer-section="${kind}" data-group-id="${escapeHtml(group.groupId)}">${joinedHeading ? '' : heading}${content}</section>`
}

// Independent source-reference booklet. It never reads teacher HTML or analyses.
// Owner accepted reference-v2; source approval is a separate boundary.
export function buildAnswerOnlyHtml({
  paperName, materialization, sourceReferences, sourceDigest, candidateDigest,
  includeScoring = false, sourceDocuments = null, sourceInput = null,
}) {
  if (typeof paperName !== 'string' || !paperName.trim()) throw new Error('Owner-provided paper name is required')
  assertAnswerSource(materialization, sourceInput)
  assertSourceReferences({ sidecar: sourceReferences, materialization, sourceDigest, candidateDigest, sourceDocuments, sourceInput })
  const answers = [...materialization.answers].sort((a, b) => a.canonicalNumber - b.canonicalNumber)
  const listening = materialization.listening
  const slice = (first, last) => answers.filter(answer => answer.canonicalNumber >= first && answer.canonicalNumber <= last)
  const listeningAnswers = listening.state === 'captured'
    ? [...listening.answers].sort((a, b) => a.canonicalNumber - b.canonicalNumber) : []
  const keys = `${listening.state === 'captured' ? `<section data-answer-section="keys">
<h2>第一部分　听力（共两节，满分30分）</h2>
${rangeTable([0, 5, 10, 15].map(start => listeningAnswers.slice(start, start + 5)))}</section>` : ''}
<section data-answer-section="keys"><h2>第二部分　阅读理解（共两节，满分50分）</h2>
<h3 class="key-section">第一节（共15小题；每小题2.5分，满分37.5分）</h3>
${rangeTable([[21, 23], [24, 27], [28, 31], [32, 35]].map(([first, last]) => slice(first, last)))}
<h3 class="key-section">第二节（共5小题；每小题2.5分，满分12.5分）</h3>
${rangeTable([slice(36, 40)])}</section>
<section data-answer-section="keys"><h2>第三部分　语言运用（共两节，满分30分）</h2>
<h3 class="key-section">第一节（共15小题；每小题1分，满分15分）</h3>
${rangeTable([[41, 45], [46, 50], [51, 55]].map(([first, last]) => slice(first, last)))}
<h3 class="key-section">第二节（共10小题；每小题1.5分，满分15分）</h3>
${keyTable(slice(56, 65), 5)}</section>`
  const referencesByGroup = new Map(sourceReferences.groups.map(group => [group.groupId, group]))
  const groups = materialization.groups.filter(group => group.writingTask)
  const references = `<h2>第四部分　写作（共两节，满分40分）</h2>`
    + groups.map(group => referenceSection(referencesByGroup.get(group.groupId), 'essays', group.writingTask.starters,
      null, [materialization.paperId, sourceDigest, candidateDigest])).join('\n')
    + (includeScoring ? groups.map(group => referenceSection(referencesByGroup.get(group.groupId), 'scoring')).join('\n') : '')
  const transcripts = listening.state === 'captured'
    ? `<section data-answer-section="transcripts" aria-label="听力原文"><h2>听力原文</h2>${listening.transcript.map((segment, index) =>
      `<article data-transcript-segment="${escapeHtml(segment.segmentId)}"><h3 class="transcript-label">Text ${index + 1}</h3><p class="transcript">${textHtml(segment.text)}</p></article>`,
    ).join('\n')}</section>`
    : ''
  return answerDocument(paperName, `${keys}${references}${transcripts}`)
}

// Assembly numbering is the question renderer's continuous item/question order.
// Source content is never synthesized into a new materialization or Writing Question.
export function buildAssembledAnswerOnlyHtml({ paperName, items, questionNumberStart = 1 }) {
  if (!Array.isArray(items) || !items.length || new Set(items.map(item => item.detail?.id)).size !== items.length) {
    throw new Error('答案版需要唯一的所选题组')
  }
  if (!Number.isSafeInteger(questionNumberStart) || questionNumberStart < 1) throw new Error('起始题号必须是正整数')
  const validated = new Set()
  const transcripts = new Map()
  let number = questionNumberStart
  const labels = { reading: '阅读理解', 'seven-choices': '七选五', cloze: '完形填空',
    'grammar-fill': '语法填空', application: '应用文', continuation: '读后续写', listening: '听力' }
  const content = items.map(({ detail, source, canonicalGroup }, index) => {
    if (!source) throw new Error('选中的题组没有同版本已审源参考答案；不能以教师卷替代')
    const { materialization, sourceReferences } = source
    if (detail.paperId !== materialization.paperId) throw new Error('选中的题组与答案源不属于同一卷')
    if (!validated.has(source)) {
      assertAnswerSource(materialization, source.sourceInput)
      assertSourceReferences({ ...source, sidecar: sourceReferences })
      validated.add(source)
    }
    const group = materialization.groups.find(group => group.groupId === detail.id)
    const listening = detail.groupType === 'listening'
    if (!group && !listening) throw new Error('答案源中缺少选中的题组')
    if (group?.writingTask) {
      if (!Array.isArray(detail.questions) || detail.questions.length) throw new Error('Writing Task 不能产生 Questions')
      const reference = sourceReferences.groups.find(reference => reference.groupId === group.groupId)
      return `<h2>第${index + 1}题组　${labels[group.writingTask.taskType]}</h2>`
        + referenceSection(reference, 'essays', group.writingTask.starters, '参考范文',
          [materialization.paperId, source.sourceDigest, source.candidateDigest])
    }
    if (listening && (materialization.listening.state !== 'captured' || canonicalGroup?.groupId !== detail.id
      || canonicalGroup.paperId !== materialization.paperId || canonicalGroup.groupType !== 'listening')) {
      throw new Error('听力题组需要精确 Canonical 归属')
    }
    const answers = listening ? materialization.listening.answers.map(answer => ({ ...answer,
      questionId: `question:listening:${answer.canonicalNumber}` })) : materialization.answers
    const byId = new Map(answers.map(answer => [answer.questionId, answer]))
    const expectedIds = listening ? canonicalGroup.questions.map(question => question.questionId)
      : group.questions.map(question => question.questionId)
    if (!Array.isArray(detail.questions) || !expectedIds.length || detail.questions.length !== expectedIds.length
      || detail.questions.some((question, i) => question.id !== expectedIds[i])) throw new Error('题组问题与精确答案源不一致')
    if (!Number.isSafeInteger(number + detail.questions.length - 1)) throw new Error('最终题号超出安全整数范围')
    const selected = detail.questions.map(question => {
      const answer = byId.get(question.id)
      if (!answer) throw new Error('选中的问题没有精确源答案')
      if (listening) for (const segment of materialization.listening.transcript) {
        if (segment.questionNumbers.includes(answer.canonicalNumber)) {
          transcripts.set(`${materialization.paperId}:${segment.segmentId}`, segment)
        }
      }
      return { ...answer, canonicalNumber: number++ }
    })
    const ranges = []
    for (let start = 0; start < selected.length; start += 5) ranges.push(selected.slice(start, start + 5))
    return `<section data-answer-section="keys" data-group-id="${escapeHtml(detail.id)}"><h2>第${index + 1}题组　${labels[listening ? 'listening' : group.family]}</h2>`
      + (group?.family === 'grammar-fill' ? keyTable(selected, 5) : rangeTable(ranges)) + '</section>'
  }).join('\n')
  const transcriptHtml = [...transcripts.values()].map((segment, index) =>
    `<article data-transcript-segment="${escapeHtml(segment.segmentId)}"><h3 class="transcript-label">Text ${index + 1}</h3><p class="transcript">${textHtml(segment.text)}</p></article>`,
  ).join('\n')
  return answerDocument(paperName, content + (transcriptHtml
    ? `<section data-answer-section="transcripts" aria-label="听力原文"><h2>听力原文</h2>${transcriptHtml}</section>` : ''))
}

function answerDocument(paperName, content) {
  if (typeof paperName !== 'string' || !paperName.trim()) throw new Error('Owner-provided paper name is required')
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<title>${escapeHtml(paperName)} · 纯答案版</title>
<!-- Keep the full OTF bundle out of Paged.js's 24-bit CSS-tree offsets,
     as in the question print renderer. The browser still loads these faces. -->
<style data-pagedjs-ignore>
${embeddedPaperFontCss()}
</style><style>
@page{size:A4;margin:21mm 20mm 24mm;
@bottom-center{content:"英语参考答案　 第 " counter(page) " 页（共 " counter(pages) " 页）";font-family:${paperSurfaceTokens.paperFontStack};font-size:9pt}}
*{box-sizing:border-box}
body{margin:0;color:${paperSurfaceTokens.paperInk};font-family:${paperSurfaceTokens.paperFontStack};font-size:12pt;line-height:19.5pt;font-synthesis:none}
header{margin:0 0 19.5pt;break-inside:avoid;break-after:avoid}
.paper-name{font-size:18pt;line-height:27pt;font-weight:700;text-align:center;margin:0 0 8pt}
h1{font-size:20pt;line-height:27pt;font-weight:700;text-align:center;margin:0}
h2{font-size:12pt;line-height:19.5pt;font-weight:700;margin:6pt 0 0;break-after:avoid}
h3{font-size:12pt;line-height:19.5pt;font-weight:400;margin:0;break-after:avoid}
p{margin:0;orphans:2;widows:2;overflow-wrap:break-word}
.answer-keys{width:100%;border-collapse:collapse;table-layout:fixed;margin:0}
.answer-keys td{vertical-align:top;padding:0 8pt 0 0;overflow-wrap:anywhere}
.answer-keys tr{break-inside:avoid}
.answer-keys--5{table-layout:auto;--answer-content-width:170mm}
/* Override --5's auto layout only after measured overflow; 170mm is the A4
   content width after this booklet's two 20mm margins. */
.answer-keys--bounded{table-layout:fixed}
/* Separate the label from wrapping prose; 0.25em preserves the Termes space.
   break-word overrides td's anywhere so table sizing still respects whole words. */
.answer-key{display:flex;align-items:baseline;column-gap:0.25em}
.answer-key .answer-number{flex-shrink:0}
.answer-value{min-width:0;overflow-wrap:break-word}
.answer-ranges td{white-space:nowrap}
.answer-number{white-space:nowrap}
.writing-section,.writing-section-source{font-weight:400;display:block}
.writing-section,.writing-section-source,.reference-label{margin-top:6pt}
.reference-label{font-weight:700}
.reference-opening{break-inside:avoid;break-after:avoid}
.reference-paragraph--body{text-indent:2em;text-align:justify}
.reference-paragraph--title{text-align:center;font-weight:700;font-style:italic;margin:6pt 0}
.reference-paragraph--label{font-weight:700;break-after:avoid}
.reference-paragraph--salutation,.reference-paragraph--closing{break-after:avoid}
.reference-paragraph--closing,.reference-paragraph--signature{text-align:right}
.continuation-starter{text-decoration:underline;text-underline-offset:2pt}
.reference-table{width:100%;border-collapse:collapse;table-layout:auto;margin:6pt 0}
.reference-table td{border:0.35pt solid currentColor;padding:0 8pt;vertical-align:top;overflow-wrap:anywhere}
.reference-table tr{break-inside:avoid}
.reference-figure{margin:6pt 0;break-inside:avoid;page-break-inside:avoid}
.reference-figure img{display:block;max-width:100%;max-height:60mm;object-fit:contain;object-position:left center}
.source-absent{color:${paperSurfaceTokens.paperMuted}}
.transcript-label{font-weight:700;margin-top:13pt}
.transcript{white-space:normal}
</style></head><body data-pdf-edition="answerOnly" data-answer-layout="reference-v2">
<header><p class="paper-name">${escapeHtml(paperName)}</p><h1>英语学科　参考答案</h1></header>
${content}
</body></html>`
}
