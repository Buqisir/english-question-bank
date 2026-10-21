import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { makeFixture } from '../../scripts/verify-nck1-source-materialization.mjs'
import { sha256, digestJson } from '../../shared/paper-canonical/stable.mjs'
import { SOURCE_INSTRUCTION_SLOTS } from '../../shared/paper-canonical/sourcePresentation.mjs'
import { importCanonicalCandidate, rederiveConfirmedCanonicalCandidate } from '../../shared/paper-canonical/compiler.mjs'
import { projectCanonicalPaper } from '../../shared/paper-canonical/projector.mjs'
import { consumerContractRefs } from '../../shared/paper-canonical/consumers.mjs'

export function makeDrawingAreaMaterialization({ drawing = true, longOpening = false, listening = true, labelFirst = false, structuredAnswerRegion = false } = {}) {
  const materialization = makeFixture({ listening, mixedTable: false })
  materialization.schemaVersion = drawing ? 'nck1-source-materialization-v5' : 'nck1-source-materialization-v4'
  const group = materialization.groups.find(item => item.slotId === 'writing.application')
  const source = structuredClone(group.blocks[0].source)
  const opening = 'This is my logo for World Smile Day activities.'
    + (longOpening ? ' The logo brings together our school community and invites every student to share kindness and friendship through meaningful activities.' : '')
  const signature = 'Li Hua from Class 2, Senior 3'
  group.blocks = group.blocks.slice(0, 4)
  for (const [id, text] of [['opening', opening], ...(drawing ? [['drawing-label', '作图处']] : []), ['signature', signature]]) {
    group.blocks.push({ kind: 'paragraph', blockId: `block:application-${id}`, role: 'body',
      content: [{ kind: 'text', text }], source: structuredClone(source) })
  }
  group.writingTask.givenSkeleton = [{ role: 'opening', text: opening }, { role: 'signature', text: signature }]
  if (drawing) group.writingTask.drawingArea = {
    placement: 'top_right', labelBlockRef: 'block:application-drawing-label', source,
  }
  if (drawing && labelFirst) {
    const index = group.blocks.findIndex(block => block.blockId === group.writingTask.drawingArea.labelBlockRef)
    group.blocks.unshift(...group.blocks.splice(index, 1))
  }
  if (structuredAnswerRegion) {
    materialization.documents.find(document => document.documentId === 'paper').pageCount = 9
    materialization.sourceCoverage.reviewedPages = Array.from({ length: 9 }, (_, i) => i + 1)
    materialization.sourceCoverage.visuals.push({
      visualId: 'visual:application-template', page: 9,
      region: { x: 0.087322, y: 0.743468, width: 0.832074, height: 0.150238 },
      disposition: 'structured_answer_region', targetId: group.groupId,
    })
    group.writingTask.drawingArea.source = {
      kind: 'page_region', documentId: 'paper', page: 9,
      region: { x: 0.75, y: 0.75, width: 0.12, height: 0.12 },
    }
    const label = group.blocks.find(block => block.blockId === group.writingTask.drawingArea.labelBlockRef)
    label.content[0].text = '（做图处）'
    label.source = structuredClone(group.writingTask.drawingArea.source)
  }
  materialization.sourcePresentation = {
    instructions: Object.keys(SOURCE_INSTRUCTION_SLOTS).filter(slotId => listening || !slotId.startsWith('listening.')).map(slotId => ({
      slotId, text: `Source direction for ${slotId}.`, source: structuredClone(source),
    })),
    listeningExample: listening ? { state: 'not_supplied', source: structuredClone(source) } : null,
  }
  return materialization
}

export function makeDrawingAreaSourceInput(options) {
  const materialization = makeDrawingAreaMaterialization(options)
  const documents = ['paper', 'answers'].map(documentId => {
    const bytes = new TextEncoder().encode(`%PDF-1.7 synthetic drawing-area ${documentId}`.padEnd(100, 'x'))
    Object.assign(materialization.documents.find(item => item.documentId === documentId), {
      sha256: sha256(bytes), byteLength: bytes.byteLength,
    })
    return { documentId, bytes }
  })
  if (options?.drawingDocx) {
    const bytes = execFileSync('python3', ['-c',
      'import io,sys,zipfile; b=io.BytesIO(); z=zipfile.ZipFile(b,"w"); z.writestr(zipfile.ZipInfo("word/document.xml",(2020,1,1,0,0,0)), \'<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>作图处</w:t></w:r></w:p></w:body></w:document>\'); z.close(); sys.stdout.buffer.write(b.getvalue())'])
    const documentId = 'drawing-docx'
    documents.push({ documentId, bytes })
    materialization.documents.push({ documentId, role: 'question_source',
      mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      sha256: sha256(bytes), byteLength: bytes.byteLength, pageCount: 1 })
    const group = materialization.groups.find(item => item.family === 'application-writing')
    const locator = { kind: 'docx_part', documentId, part: 'word/document.xml', selector: '//w:p[normalize-space(.)="作图处"]' }
    group.writingTask.drawingArea.source = locator
    group.blocks.find(block => block.blockId === group.writingTask.drawingArea.labelBlockRef).source = structuredClone(locator)
  }
  return { kind: 'nck1-source-materialization', materializationBytes: new TextEncoder().encode(JSON.stringify(materialization)),
    documents, media: [] }
}

export function makeDrawingAreaCompilation(options) {
  const sourceInput = makeDrawingAreaSourceInput(options)
  const imported = importCanonicalCandidate(sourceInput)
  assert.deepEqual(imported.issues, [])
  const confirmation = { schemaVersion: 'teacher-confirmation-v1',
    candidateDigest: imported.candidate.candidateDigest, sourceDigest: imported.candidate.source.sha256, confirmed: true }
  const confirmed = rederiveConfirmedCanonicalCandidate(imported.candidate, confirmation)
  assert(confirmed.compilation?.artifacts.canonicalPaper, JSON.stringify(confirmed.unresolvedIssues))
  // Exercise Canonical inline rendering directly; materialization text tokens
  // remain unchanged and do not acquire a new marks input capability.
  if (options?.labelMarks?.length) {
    const group = confirmed.compilation.artifacts.canonicalPaper.questionGroups.find(
      group => group.contractRef.familyContractId === 'application-writing',
    )
    const label = group.content.blocks.find(block => block.nodeId === group.variant.response.drawingArea.labelBlockRef)
    label.inlines[0].marks = [...options.labelMarks]
    const { sourceMap, sourceFingerprint, semanticDigest, ...semantic } = group
    group.semanticDigest = digestJson(semantic)
  }
  return { ...confirmed, sourceInput, imported, confirmation }
}

export function drawingAreaConsumption(compilation, consumerContractRef = consumerContractRefs.print_pdf) {
  const { paperPlan: plan, questionGroups: groups } = compilation.artifacts.canonicalPaper
  const projection = projectCanonicalPaper({ plan, groups, sourceCapture: compilation.artifacts.sourceCapture })
  const byFamily = new Map()
  for (const node of projection.nodes.filter(node => node.kind === 'group')) {
    const items = byFamily.get(node.familyContractId) || []
    items.push(node)
    byFamily.set(node.familyContractId, items)
  }
  const visibleStructure = projection.nodes.flatMap(node => {
    if (['part', 'section', 'instruction'].includes(node.kind)) return [node]
    if (node.kind !== 'group') return []
    return [{ kind: 'group', slotId: node.slotId, groupId: node.groupId, familyContractId: node.familyContractId }]
  })
  return { disposition: 'ready', paperId: plan.paperId, authorityRef: plan.authorityRef, consumerContractRef,
    profileRef: structuredClone(plan.profileRef),
    selections: [...byFamily].map(([familyContractId, occurrences]) => ({
      familyContractId, mode: 'canonical', groupIds: occurrences.map(node => node.groupId),
      projectedOccurrences: occurrences,
      projectedOccurrenceDigests: occurrences.map(node => ({ groupId: node.groupId, digest: digestJson(node) })),
    })),
    visibleStructure, visibleStructureDigest: digestJson(visibleStructure),
  }
}
