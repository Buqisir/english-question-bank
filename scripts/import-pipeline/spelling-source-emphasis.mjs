import { loadNck1ReviewSource } from '../../server/import-review/revisionProjection.mjs'
import { resolveConfirmedNck1OcrEvidence } from '../../server/paper-import/nck1OcrSourceEvidence.mjs'
import { extractDocxParagraphEmphasis } from '../../server/paper-canonical/docxSourceAdapter.mjs'
import { resolveDocxParagraphSelector, sourceOrderedParagraphEntries } from '../../server/paper-canonical/nck1MaterializationAdapter.mjs'
import { digestJson, sha256 } from '../../shared/paper-canonical/stable.mjs'
import { resolveOcrQuestionTextEmphasis } from '../../server/paper-canonical/ocrQuestionTextEmphasis.mjs'

// Use the same confirmed paragraphs, clipping and original UTF-16 coordinates
// as the Candidate's source-emphasis mapping. Never locate text by search.
export function loadSpellingSourceEmphasis(paperDir, request) {
  const loaded = loadNck1ReviewSource(paperDir, { preparingSpelling: true })
  const { sourceInput, materialization: raw } = loaded
  if (sha256(sourceInput.materializationBytes) !== request.report.materializationSha256
    || digestJson(raw) !== digestJson(request.materialization)) {
    throw new Error('Spelling request differs from the source-emphasis materialization')
  }
  const documents = new Map(sourceInput.documents.map(document => [document.documentId, document]))
  const ocrParagraphs = new Map()
  let ocrStructures
  if (sourceInput.ocrSourceBytes) {
    const resolved = resolveConfirmedNck1OcrEvidence({
      paperId: raw.paperId,
      documents: raw.documents.map(document => ({ ...document, bytes: documents.get(document.documentId).bytes })),
      evidence: JSON.parse(new TextDecoder().decode(sourceInput.ocrSourceBytes.evidenceBytes)),
      confirmation: JSON.parse(new TextDecoder().decode(sourceInput.ocrSourceBytes.confirmationBytes)),
    })
    if (resolved.issues.length) throw new Error(resolved.issues[0].message)
    ocrStructures = resolved.structures
    for (const structure of resolved.structures.values()) {
      for (const paragraph of structure.paragraphs) {
        if (paragraph.sourceEmphasis) ocrParagraphs.set(digestJson(paragraph.sourceIndex), paragraph)
      }
    }
  }
  const result = new Map()
  const docxParagraphs = new Map()
  const clip = (pointer, ranges, offset, length) => {
    result.set(pointer, ranges.flatMap(range => {
      const start = Math.max(range.start - offset, 0)
      const end = Math.min(range.end - offset, length)
      return end > start ? [{ start, end, marks: range.marks }] : []
    }))
  }
  for (const [groupIndex, group] of raw.groups.entries()) {
    if (!['reading', 'application-writing', 'continuation-writing'].includes(group.family)) continue
    for (const { block, path } of sourceOrderedParagraphEntries(group.blocks, `/groups/${groupIndex}/blocks`)) {
      if (block.content.some(item => item.kind !== 'text')) continue
      let paragraph = ocrParagraphs.get(digestJson(block.source))
      let leading = 0
      let ranges = paragraph?.sourceEmphasis
      if (group.family === 'reading' && block.source.kind === 'docx_part' && block.source.part === 'word/document.xml') {
        const id = block.source.documentId
        if (!docxParagraphs.has(id)) docxParagraphs.set(id, extractDocxParagraphEmphasis(documents.get(id).bytes))
        const matches = resolveDocxParagraphSelector(block.source.selector, docxParagraphs.get(id))
        if (matches.length !== 1 || !matches[0].exact) throw new Error('Source emphasis needs one exact run-complete paragraph')
        paragraph = matches[0]
        ranges = paragraph.ranges
        leading = paragraph.text.length - paragraph.text.replace(/^\p{Zs}+/u, '').length
      }
      if (!ranges?.length) continue
      const text = block.content.map(item => item.text).join('')
      const expected = paragraph.text.slice(leading)
      if ((leading || block.source.kind === 'docx_part' ? expected.replace(/\p{Zs}+$/u, '') : expected) !== text) {
        throw new Error('Source emphasis paragraph cannot map to literal text')
      }
      let offset = leading
      const pointer = path.replace(/\[(\d+)\]/gu, '/$1').replaceAll('.', '/')
      for (const [index, item] of block.content.entries()) {
        clip(`${pointer}/content/${index}/text`, ranges, offset, item.text.length)
        offset += item.text.length
      }
    }
    for (const [index, question] of group.questions.entries()) {
      if (raw.schemaVersion === 'nck1-source-materialization-v11' && group.family === 'reading'
        && question.options.every(option => !option.figure)) {
        const mapped = resolveOcrQuestionTextEmphasis(question, ocrStructures?.get(question.source.documentId))
        for (const target of mapped.targets) {
          const field = target.key === 'stem' ? 'stem' : `options/${target.key.split(':')[1]}/text`
          result.set(`/groups/${groupIndex}/questions/${index}/${field}`, target.ranges)
        }
        continue
      }
      const paragraph = ocrParagraphs.get(digestJson(question.source))
      if (!paragraph?.sourceEmphasis?.length) continue
      const prefix = paragraph.text.match(/^\s*\d+[.．、]\s*/u)?.[0]
      if (prefix === undefined || paragraph.text.slice(prefix.length, prefix.length + question.stem.length) !== question.stem) {
        throw new Error('OCR emphasis stem cannot map to literal text')
      }
      clip(`/groups/${groupIndex}/questions/${index}/stem`, paragraph.sourceEmphasis, prefix.length, question.stem.length)
    }
  }
  return result
}

export function crossesSourceEmphasis(correction, ranges) {
  const start = correction.start
  const end = start + correction.before.length
  return ranges.some(range => {
    if (end <= range.start || start >= range.end) return false
    if (start >= range.start && end <= range.end) return false
    return true
  })
}
