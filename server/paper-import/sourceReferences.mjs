import { readFileSync } from 'node:fs'
import Ajv from 'ajv/dist/2020.js'
import { digestJson, sha256 } from '../../shared/paper-canonical/stable.mjs'
import { extractDocxDocumentParagraphs, extractDocxDocumentStructure } from '../paper-canonical/docxSourceAdapter.mjs'
import { deriveNck1AnalyzedPackageBundle, parseStrictPackageJson } from '../paper-canonical/nck1AnalyzedPackageAdapter.mjs'
import { decodeSourceReferencePng, SOURCE_REFERENCE_IMAGE_LIMITS } from './sourceReferenceImages.mjs'
import { OCR_SOURCE_REFERENCES_PRODUCER_VERSION } from '../../scripts/import-pipeline/ocr-source-references-version.mjs'

export const SOURCE_REFERENCES_FILE = 'source-references-v1.json'
// Existing normalized-region containment precision, shared with admission.
export const SOURCE_REFERENCE_REGION_TOLERANCE = 0.000001
export const sourceReferencesSchema = JSON.parse(readFileSync(
  new URL('../../schemas/paper-import/source-references-v1.schema.json', import.meta.url), 'utf8',
))
export const structuredSourceReferencesSchema = JSON.parse(readFileSync(
  new URL('../../schemas/paper-import/source-references-v2.schema.json', import.meta.url), 'utf8',
))
export const figureSourceReferencesSchema = JSON.parse(readFileSync(
  new URL('../../schemas/paper-import/source-references-v3.schema.json', import.meta.url), 'utf8',
))
export const scoringFigureSourceReferencesSchema = JSON.parse(readFileSync(
  new URL('../../schemas/paper-import/source-references-v4.schema.json', import.meta.url), 'utf8',
))
export const exclusionSourceReferencesSchema = JSON.parse(readFileSync(
  new URL('../../schemas/paper-import/source-references-v5.schema.json', import.meta.url), 'utf8',
))
export const currentSourceReferencesSchema = JSON.parse(readFileSync(
  new URL('../../schemas/paper-import/source-references-capture-v22.schema.json', import.meta.url), 'utf8',
))
const ajv = new Ajv({ allErrors: true, strict: false })
const validateV1 = ajv.compile(sourceReferencesSchema)
const validateV2 = ajv.compile(structuredSourceReferencesSchema)
const validateV3 = ajv.compile(figureSourceReferencesSchema)
const validateV4 = ajv.compile(scoringFigureSourceReferencesSchema)
const validateV5 = ajv.compile(exclusionSourceReferencesSchema)
const validateCurrent = ajv.compile(currentSourceReferencesSchema)
// Integrity-only recognition of explicit v17 metadata on already sealed bytes.
// This never selects semantics: first admission separately requires v22, and
// legacy replay separately proves the persisted whole-sidecar commitment.
const validateDeclaredLegacy = ajv.compile({ ...currentSourceReferencesSchema,
  $id: 'source-references-sealed-v17',
  properties: { ...currentSourceReferencesSchema.properties,
    producerVersion: { const: 'ocr-source-references-producer-v17' } },
})
const validatePrevious = ajv.compile(JSON.parse(readFileSync(
  new URL('../../schemas/paper-import/source-references-capture-v18.schema.json', import.meta.url), 'utf8',
)))
const validateExplicitTitles = ajv.compile(JSON.parse(readFileSync(
  new URL('../../schemas/paper-import/source-references-capture-v19.schema.json', import.meta.url), 'utf8',
)))
const validateGivenTitles = ajv.compile(JSON.parse(readFileSync(
  new URL('../../schemas/paper-import/source-references-capture-v20.schema.json', import.meta.url), 'utf8',
)))
const validateComposedLabels = ajv.compile(JSON.parse(readFileSync(
  new URL('../../schemas/paper-import/source-references-capture-v21.schema.json', import.meta.url), 'utf8',
)))

export function parseSourceReferencesBytes(bytes) {
  const buffer = Buffer.from(bytes)
  const sidecar = JSON.parse(buffer.toString('utf8'))
  if (['source-references-v3', 'source-references-v4', 'source-references-v5'].includes(sidecar?.schemaVersion) && buffer.byteLength > SOURCE_REFERENCE_IMAGE_LIMITS.jsonBytes) {
    throw Object.assign(new Error('Source-reference JSON exceeds 16 MiB'), { code: 'SOURCE_REFERENCES_FIGURE_LIMIT' })
  }
  return sidecar
}

// v1 paragraphs and v2 scoring blocks share one ordered render/QA path.
// v3 essay figures stay separate; v4 scoring figures are ordered blocks.
export function sourceReferenceBlocks(entry) {
  return entry.blocks ?? entry.paragraphs.map(paragraph => ({ kind: 'paragraph', paragraph }))
}

// One inventory for admission, integrity budgets and published consumers.
export function sourceReferenceFigures(sidecar) {
  return sidecar?.groups.flatMap(group => ['essays', 'scoring'].flatMap(kind =>
    group[kind].entries.flatMap(entry => [
      ...(entry.figures ?? []).map(figure => ({ figure, entry, group, kind })),
      ...(entry.blocks ?? []).filter(block => block.kind === 'figure')
        .map(figure => ({ figure, entry, group, kind })),
    ]))) ?? []
}

// Preparing never infers absence or converts legacy/AI modelAnswer into source.
export function prepareSourceReferences({ materialization, sourceDigest, candidateDigest, structuredScoring = false }) {
  return {
    schemaVersion: structuredScoring ? 'source-references-v2' : 'source-references-v1',
    producerVersion: OCR_SOURCE_REFERENCES_PRODUCER_VERSION,
    paperId: materialization.paperId,
    sourceDigest,
    candidateDigest,
    materializationDigest: digestJson(materialization),
    groups: materialization.groups.filter(group => group.writingTask).map(group => ({
      groupId: group.groupId,
      taskType: group.writingTask.taskType,
      essays: { state: 'unprocessed', evidence: [], entries: [] },
      scoring: { state: 'unprocessed', evidence: [], entries: [] },
    })),
  }
}

export function validateSourceReferences({
  sidecar, materialization, sourceDigest, candidateDigest, requireComplete = true, sourceDocuments = null, sourceInput = null,
}) {
  const validateSchema = sidecar && Object.hasOwn(sidecar, 'producerVersion')
    ? sidecar.producerVersion === 'ocr-source-references-producer-v17' ? validateDeclaredLegacy
      : sidecar.producerVersion === 'ocr-source-references-producer-v18' ? validatePrevious
        : sidecar.producerVersion === 'ocr-source-references-producer-v19' ? validateExplicitTitles
          : sidecar.producerVersion === 'ocr-source-references-producer-v20' ? validateGivenTitles
            : sidecar.producerVersion === 'ocr-source-references-producer-v21' ? validateComposedLabels : validateCurrent
    : sidecar?.schemaVersion === 'source-references-v5' ? validateV5
    : sidecar?.schemaVersion === 'source-references-v4' ? validateV4
    : sidecar?.schemaVersion === 'source-references-v3' ? validateV3
    : sidecar?.schemaVersion === 'source-references-v2' ? validateV2 : validateV1
  if (!validateSchema(sidecar)) {
    if (sidecar?.schemaVersion === 'source-references-v3' && validateSchema.errors.some(error =>
      error.keyword === 'minItems' && error.instancePath.endsWith('/paragraphs'))) {
      return [{ code: 'SOURCE_REFERENCES_FIGURE_UNSUPPORTED', path: '$',
        message: 'Pure-image essay entries are unsupported; keep real text paragraphs and a same-entry afterParagraphId' }]
    }
    return validateSchema.errors.map(error => ({
      code: 'SOURCE_REFERENCES_SCHEMA_INVALID', path: error.instancePath, message: error.message,
    }))
  }
  const issues = []
  const issue = (code, path, message) => issues.push({ code, path, message })
  const figures = sourceReferenceFigures(sidecar).map(item => item.figure)
  if (['source-references-v3', 'source-references-v4', 'source-references-v5'].includes(sidecar.schemaVersion)
    && (figures.length > SOURCE_REFERENCE_IMAGE_LIMITS.sidecarFigures
      || figures.reduce((total, figure) => total + figure.raster.byteLength, 0) > SOURCE_REFERENCE_IMAGE_LIMITS.totalPngBytes
      || Buffer.byteLength(JSON.stringify(sidecar)) > SOURCE_REFERENCE_IMAGE_LIMITS.jsonBytes)) {
    return [{ code: 'SOURCE_REFERENCES_FIGURE_LIMIT', path: '$', message: 'Reference figures or sidecar exceed the admission limits' }]
  }
  for (const [key, expected] of Object.entries({
    paperId: materialization.paperId, sourceDigest, candidateDigest,
    materializationDigest: digestJson(materialization),
  })) {
    if (sidecar[key] !== expected) issue('SOURCE_REFERENCES_BINDING_STALE', `$.${key}`, `${key} disagrees with the exact source candidate`)
  }
  let documentInventory = materialization.documents
  if (!documentInventory) {
    try {
      const derived = deriveNck1AnalyzedPackageBundle(sourceInput)
      if (derived.issues.length || digestJson(derived.materialization) !== digestJson(materialization)) throw new Error('Package differs')
      documentInventory = sourceInput.members.map(member => ({ ...member,
        documentId: member.memberId, sha256: sha256(member.bytes) }))
      sourceDocuments = documentInventory
    } catch {
      issue('SOURCE_REFERENCES_SOURCE_INVALID', '$', 'Exact analyzed-package source evidence is required')
      return issues
    }
  }
  const documents = new Map(documentInventory.map(document => [document.documentId, document]))
  const writingGroups = materialization.groups.filter(group => group.writingTask)
  const owners = new Map(writingGroups.map(group => [group.groupId, group]))
  const actualSources = sourceDocuments && new Map(sourceDocuments.map(document => [document.documentId, document.bytes]))
  const sourceParagraphs = new Map()
  const sourceTables = new Map()
  const seenGroups = new Set()
  const seenIds = new Set()
  const seenFigureRegions = new Set()
  function unique(id, path) {
    if (seenIds.has(id)) issue('SOURCE_REFERENCES_ID_DUPLICATE', path, 'Reference, paragraph, figure, table and cell IDs must be globally unique')
    seenIds.add(id)
  }
  function sourceBinding(source, path, text = null) {
    const { locator, documentSha256 } = source
    const document = documents.get(locator.documentId)
    if (!document || !['official_answers', 'question_and_answers'].includes(document.role)
      || document.sha256 !== documentSha256) {
      issue('SOURCE_REFERENCES_SOURCE_INVALID', path, 'Reference must bind an exact answer-bearing source document, not a prompt or AI analysis')
      return
    }
    if (actualSources && (!actualSources.has(document.documentId)
      || sha256(actualSources.get(document.documentId)) !== document.sha256)) {
      issue('SOURCE_REFERENCES_SOURCE_BYTES_CHANGED', path, 'Reference source bytes changed or are unavailable')
      return
    }
    if (locator.kind === 'package_json_pointer') {
      try {
        if (!sourceInput || document.mediaType !== 'application/json') throw new Error('Not a package JSON member')
        const bytes = actualSources?.get(document.documentId)
        if (!bytes || sha256(bytes) !== document.sha256) throw new Error('Missing member bytes')
        let value = parseStrictPackageJson(bytes)
        if (locator.pointer !== '') {
          if (!locator.pointer.startsWith('/') || /~(?![01])/u.test(locator.pointer)) throw new Error('Invalid pointer')
          for (const encoded of locator.pointer.slice(1).split('/')) {
            const key = encoded.replace(/~1/g, '/').replace(/~0/g, '~')
            if (!value || typeof value !== 'object' || !Object.hasOwn(value, key)) throw new Error('Missing pointer')
            value = value[key]
          }
        }
        if (text !== null && value !== text) throw new Error('Text differs')
      } catch {
        issue('SOURCE_REFERENCES_TEXT_DISAGREES', path, 'Package references must replay the exact sealed official-answer member and pointer')
      }
    } else if (sourceInput && !materialization.documents) {
      issue('SOURCE_REFERENCES_LOCATION_INVALID', path, 'Analyzed-package references require JSON pointers')
    } else if (document.mediaType.includes('wordprocessingml') && locator.kind !== 'docx_part') {
      issue('SOURCE_REFERENCES_LOCATION_INVALID', path, 'Native DOCX references use replayable paragraph selectors, not unverifiable page regions')
    } else if (locator.kind === 'page_region') {
      const { x, y, width, height } = locator.region
      if (locator.page > document.pageCount || x + width > 1 || y + height > 1) {
        issue('SOURCE_REFERENCES_LOCATION_INVALID', path, 'Reference location is outside its source page')
      }
    } else if (!document.mediaType.includes('wordprocessingml')
      || locator.part !== 'word/document.xml') {
      issue('SOURCE_REFERENCES_LOCATION_INVALID', path, 'DOCX reference must locate its main source document')
    } else {
      const index = /^\(\/w:document\/w:body\/\/w:p\)\[([1-9][0-9]*)\]$/u.exec(locator.selector)?.[1]
      if (!index) {
        issue('SOURCE_REFERENCES_LOCATION_INVALID', path, 'DOCX reference needs a replayable main-document paragraph selector')
        return
      }
      if (!actualSources) return
      if (!sourceParagraphs.has(document.documentId)) sourceParagraphs.set(document.documentId,
        extractDocxDocumentParagraphs(actualSources.get(document.documentId)))
      const paragraph = sourceParagraphs.get(document.documentId)[Number(index) - 1]
      if (!paragraph || (text !== null && paragraph.text !== text)) {
        issue('SOURCE_REFERENCES_TEXT_DISAGREES', path, 'DOCX reference must replay the exact located source paragraph; no AI rewrite or wrong-paragraph substitution')
      }
    }
  }
  for (const [index, group] of sidecar.groups.entries()) {
    const path = `$.groups[${index}]`
    const owner = owners.get(group.groupId)
    if (!owner || owner.writingTask.taskType !== group.taskType) {
      issue('SOURCE_REFERENCES_GROUP_FOREIGN', path, 'Reference must belong to the exact Writing Task')
    }
    if (seenGroups.has(group.groupId)) issue('SOURCE_REFERENCES_GROUP_DUPLICATE', path, 'Writing group occurs more than once')
    seenGroups.add(group.groupId)
    for (const kind of ['essays', 'scoring']) {
      const section = group[kind]
      const sectionPath = `${path}.${kind}`
      if (section.state === 'unprocessed') {
        if (requireComplete) issue('SOURCE_REFERENCES_UNPROCESSED', sectionPath, 'Unprocessed is not source absence; finish source capture before exporting')
        if (section.entries.length || section.evidence.length) issue('SOURCE_REFERENCES_STATE_INVALID', sectionPath, 'Unprocessed sections do not claim captured content or absence evidence')
      } else if (section.state === 'not_supplied') {
        if (section.entries.length || !section.evidence.length) issue('SOURCE_REFERENCES_STATE_INVALID', sectionPath, 'Source absence needs review locators and no entries')
        const reviewed = new Set(section.evidence.map(source => source.locator.documentId))
        if ([...documents.values()].some(document => ['official_answers', 'question_and_answers'].includes(document.role)
          && !reviewed.has(document.documentId))) {
          issue('SOURCE_REFERENCES_ABSENCE_INCOMPLETE', sectionPath, 'Absence must cover every answer-bearing source document')
        }
      } else if (!section.entries.length || section.evidence.length) {
        issue('SOURCE_REFERENCES_STATE_INVALID', sectionPath, 'Captured sections need entries; sources belong to their paragraphs')
      }
      section.evidence.forEach((source, n) => sourceBinding(source, `${sectionPath}.evidence[${n}]`))
      for (const [n, entry] of section.entries.entries()) {
        const entryPath = `${sectionPath}.entries[${n}]`
        unique(entry.referenceId, `${entryPath}.referenceId`)
        if ((entry.sourceLabel === null) !== (entry.labelSource === null)) {
          issue('SOURCE_REFERENCES_LABEL_INVALID', entryPath, 'Source labels need their own locator; absent labels stay null')
        }
        if (entry.labelSource) sourceBinding(entry.labelSource, `${entryPath}.labelSource`, entry.sourceLabel)
        let previousAnchor = -1
        const entryFigures = [...(entry.figures ?? []), ...sourceReferenceBlocks(entry).filter(block => block.kind === 'figure')]
        if (entryFigures.length > SOURCE_REFERENCE_IMAGE_LIMITS.entryFigures) issue('SOURCE_REFERENCES_FIGURE_LIMIT', entryPath, 'At most four figures per entry')
        for (const [f, figure] of entryFigures.entries()) {
          const scoringFigure = kind === 'scoring' && ['source-references-v4', 'source-references-v5'].includes(sidecar.schemaVersion) && figure.kind === 'figure'
          const figurePath = scoringFigure ? `${entryPath}.blocks[${entry.blocks.indexOf(figure)}]` : `${entryPath}.figures[${f}]`
          unique(figure.figureId, `${figurePath}.figureId`)
          const anchor = (entry.paragraphs ?? []).findIndex(paragraph => paragraph.paragraphId === figure.afterParagraphId)
          if (section.state !== 'captured' || (!scoringFigure && (kind !== 'essays' || anchor < 0 || anchor < previousAnchor))) {
            issue('SOURCE_REFERENCES_FIGURE_ANCHOR_INVALID', figurePath,
              'Only captured essays support figures after surviving paragraphs in the same entry and nondecreasing order; before-first, image-only and cross-entry figures are unsupported')
          }
          previousAnchor = anchor
          const { locator } = figure.source
          const document = documents.get(locator.documentId)
          sourceBinding(figure.source, `${figurePath}.source`)
          if (document?.role !== 'official_answers' || document?.mediaType !== 'application/pdf') {
            issue('SOURCE_REFERENCES_FIGURE_SOURCE_INVALID', figurePath, 'Reference figures require a separate official_answers PDF')
          }
          // Neither changing regionId nor assigning another figureId permits
          // the same source crop to be printed twice.
          const regionKeys = [digestJson([locator.documentId, locator.page, locator.region]),
            digestJson([locator.documentId, locator.page, figure.sourceRegionId]),
            ...(['source-references-v4', 'source-references-v5'].includes(sidecar.schemaVersion)
              ? [digestJson([locator.documentId, figure.sourceRegionId])] : [])]
          if (regionKeys.some(key => seenFigureRegions.has(key))) {
            issue('SOURCE_REFERENCES_FIGURE_DUPLICATE', figurePath, 'A source figure region may occur only once')
          }
          regionKeys.forEach(key => seenFigureRegions.add(key))
          try { decodeSourceReferencePng(figure.raster) } catch (error) {
            issue(error.code, `${figurePath}.raster`, error.message)
          }
        }
        for (const [p, block] of sourceReferenceBlocks(entry).entries()) {
          const blockPath = entry.blocks ? `${entryPath}.blocks[${p}]` : `${entryPath}.paragraphs[${p}]`
          if (block.kind === 'paragraph') {
            unique(block.paragraph.paragraphId, `${blockPath}.paragraphId`)
            sourceBinding(block.paragraph.source, `${blockPath}.source`, block.paragraph.text)
            if (block.paragraph.continuationSources) {
              const { source, continuationSources, role, text } = block.paragraph
              if (kind !== 'scoring' && (kind !== 'essays' || role !== 'body')) {
                issue('SOURCE_REFERENCES_CONTINUATION_ROLE_INVALID', blockPath, 'Only essay body and scoring prose paragraphs may span source regions')
              }
              if (source.locator.kind !== 'page_region') {
                issue('SOURCE_REFERENCES_CONTINUATION_LOCATION_INVALID', `${blockPath}.source`, 'Continued paragraphs must start with a page region')
              }
              let previous = source
              for (const [c, continuation] of continuationSources.entries()) {
                const continuationPath = `${blockPath}.continuationSources[${c}]`
                sourceBinding(continuation, continuationPath, text)
                if (continuation.locator.documentId !== source.locator.documentId
                  || continuation.documentSha256 !== source.documentSha256) {
                  issue('SOURCE_REFERENCES_CONTINUATION_SOURCE_INVALID', continuationPath, 'All paragraph fragments must bind the same source document and SHA')
                }
                const before = previous.locator, after = continuation.locator
                const pageRegions = before.kind === 'page_region' && after.kind === 'page_region'
                const rightColumn = pageRegions && after.page === before.page
                  && after.region.x > before.region.x
                  && after.region.x >= before.region.x + before.region.width - SOURCE_REFERENCE_REGION_TOLERANCE
                if (!pageRegions || (after.page !== before.page + 1 && !rightColumn)) {
                  issue('SOURCE_REFERENCES_CONTINUATION_LOCATION_INVALID', continuationPath, 'Paragraph fragments must use consecutive pages or disjoint rightward regions on the same page')
                }
                previous = continuation
              }
            }
          } else if (block.kind === 'table') {
            unique(block.tableId, `${blockPath}.tableId`)
            if (block.rows.some(row => row.length !== block.rows[0].length)) {
              issue('SOURCE_REFERENCES_TABLE_INVALID', blockPath, 'Scoring tables must be rectangular; merged cells require a separate supported representation')
            }
            for (const [r, row] of block.rows.entries()) for (const [c, cell] of row.entries()) {
              const cellPath = `${blockPath}.rows[${r}][${c}]`
              unique(cell.cellId, `${cellPath}.cellId`)
              sourceBinding(cell.source, `${cellPath}.source`, cell.text)
            }
            const cells = block.rows.flat()
            const documentId = cells[0].source.locator.documentId
            if (cells.some(cell => cell.source.locator.documentId !== documentId)
              || new Set(cells.map(cell => digestJson(cell.source))).size !== cells.length) {
              issue('SOURCE_REFERENCES_TABLE_INVALID', blockPath, 'Table cells need distinct locations in one answer source')
            }
            const document = documents.get(documentId)
            const bytes = actualSources?.get(documentId)
            if (document?.mediaType.includes('wordprocessingml') && bytes && sha256(bytes) === document.sha256) {
              if (!sourceTables.has(documentId)) sourceTables.set(documentId, extractDocxDocumentStructure(bytes).tables)
              const matches = sourceTables.get(documentId).filter(table => !table.nestedTableCount
                && table.rows.length === block.rows.length && table.rows.every((row, r) =>
                  row.cells.length === block.rows[r].length && row.cells.every((cell, c) =>
                    cell.columnSpan === 1 && !cell.verticalMerge && !cell.containsDrawing
                    && !cell.containsNestedTable && cell.sourceParagraphIndexes.length === 1
                    && block.rows[r][c].source.locator.selector === `(/w:document/w:body//w:p)[${cell.sourceParagraphIndexes[0]}]`)))
              if (matches.length !== 1) issue('SOURCE_REFERENCES_TABLE_INVALID', blockPath,
                'Native scoring cells must replay one complete unmerged source table in row/column order; multi-paragraph cells are not yet supported')
            }
          }
        }
      }
    }
  }
  for (const owner of writingGroups) {
    if (!seenGroups.has(owner.groupId)) issue('SOURCE_REFERENCES_GROUP_MISSING', '$.groups', `Missing Writing Task: ${owner.groupId}`)
  }
  return issues
}

export function assertSourceReferences(input) {
  const issues = validateSourceReferences(input)
  if (issues.length) throw Object.assign(new Error(`${issues[0].code}: ${issues[0].message}`), { code: issues[0].code, issues })
}
