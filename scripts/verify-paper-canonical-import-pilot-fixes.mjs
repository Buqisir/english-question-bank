#!/usr/bin/env node

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import {
  buildNck1CanonicalImportRequest,
} from '../server/paper-canonical/nck1SourceAdapter.mjs'
import {
  admitCanonicalPaperImport,
} from '../server/paper-canonical/publication.mjs'
import {
  compileCanonicalPaper,
  validateExactTransformationRecords,
} from '../shared/paper-canonical/compiler.mjs'
import {
  projectCanonicalPaper,
} from '../shared/paper-canonical/projector.mjs'
import {
  canonicalAuthorityRef,
  resolveCanonicalAuthority,
} from '../shared/paper-canonical/authority.mjs'
import {
  canonicalizeVisibleEnglishTypography,
} from '../shared/paper-canonical/visibleTypography.mjs'
import {
  replayCanonicalVisibleTypography,
} from '../shared/paper-canonical/visibleTypographyReplay.mjs'
import { buildPrintHtml } from '../server/print-renderer.mjs'
import { digestJson } from '../shared/paper-canonical/stable.mjs'
import {
  makeReviewedReadingSourceCapture,
} from '../test-fixtures/paper-canonical/readingReferenceFixture.mjs'
import {
  makeReadyCanonicalFixture,
} from '../test-fixtures/paper-canonical/foundationFixture.mjs'
import {
  projectAssetBlocksToCanonicalConsumption,
} from '../app/src/features/paper-browse/paperBrowseCanonicalAssetProjection.ts'

const repositoryRoot = path.resolve(import.meta.dirname, '..')
const packageDir = path.join(
  repositoryRoot,
  'test-fixtures/paper-import/paper-2026-i-canonical-pilot',
)
const paperId = 'paper-2026-i'
const visibleStructureOracle = JSON.parse(readFileSync(path.join(
  repositoryRoot,
  'docs/cuts/paper-canonical-unification/qa/20-visible-structure-profile-oracle-v1.json',
), 'utf8'))
const visibleTypographyOracle = JSON.parse(readFileSync(path.join(
  repositoryRoot,
  'docs/cuts/paper-canonical-unification/qa/20-visible-typography-source-oracle-v1.json',
), 'utf8'))

function sha256File(relativePath) {
  return `sha256:${createHash('sha256')
    .update(readFileSync(path.join(repositoryRoot, relativePath)))
    .digest('hex')}`
}

function bytes(fileName) {
  return readFileSync(path.join(packageDir, fileName))
}

function sourceBoundTypographyRequest(oracleCase) {
  const fixture = makeReadyCanonicalFixture()
  const binding = oracleCase.sourceBinding
  const group = fixture.source.groups.find(
    (candidate) => candidate.slotId === binding.slotId,
  )
  const inline = group?.content?.blocks
    .flatMap((block) => block.inlines || [])
    .find((candidate) => candidate.nodeId === binding.nodeId)
  assert.ok(inline, `source fixture carries ${binding.nodeId}`)
  inline.text = oracleCase.before
  for (let pass = 0; pass < 3; pass += 1) {
    const sourceBytes = new TextEncoder().encode(JSON.stringify(fixture.source))
    for (const observation of fixture.source.observations) {
      if (
        observation.documentInputKey === binding.documentInputKey
        && Number.isInteger(observation.span?.start)
        && Number.isInteger(observation.span?.end)
      ) {
        observation.span.end = sourceBytes.byteLength
      }
    }
  }
  const sourceAsset = new TextEncoder().encode(JSON.stringify(fixture.source))
  const sourceDocument = fixture.request.evidence.documents.find(
    (document) => document.inputKey === binding.documentInputKey,
  )
  assert.ok(sourceDocument, `request carries ${binding.documentInputKey}`)
  sourceDocument.bytes = sourceAsset
  return {
    request: fixture.request,
    sourceAsset,
  }
}

function buildPilotRequest(overrides = {}) {
  const paperAssetBytes =
    overrides.paperAssetBytes || bytes('paper-asset.json')
  const paperAsset = JSON.parse(paperAssetBytes)
  return buildNck1CanonicalImportRequest({
    paperId,
    paperAssetBytes,
    answerKeyBytes: bytes('answer-key.json'),
    sourcePdfBytes: bytes('paper.pdf'),
    answersPdfBytes: bytes('canonical-evidence/06-source_answers_pdf.pdf'),
    instructionEvidenceBytes: bytes(
      'canonical-evidence/03-continuation_writing_instruction_evidence.json',
    ),
    listeningQuestionsBytes: readFileSync(path.join(
      repositoryRoot,
      'app/public/paper-assets/paper-2026-i/latest/listening/questions.json',
    )),
    listeningAnswersBytes: readFileSync(path.join(
      repositoryRoot,
      'app/public/paper-assets/paper-2026-i/latest/listening/answers.json',
    )),
    listeningTranscriptBytes: readFileSync(path.join(
      repositoryRoot,
      'app/public/paper-assets/paper-2026-i/latest/listening/transcript.json',
    )),
    listeningInventoryBytes: readFileSync(path.join(
      repositoryRoot,
      'test-fixtures/paper-canonical/evidence/listening-source-inventory-paper-2026-i.json',
    )),
    sourceProvenanceBytes: bytes('import-meta.json'),
    readingSourceCaptureBytes: new TextEncoder().encode(JSON.stringify(
      makeReviewedReadingSourceCapture(paperAsset),
    )),
    grammarFillPromptSourceCaptureBytes: bytes(
      'reviewed-evidence/grammar-fill-prompt-source-capture.json',
    ),
    tableVisualProofBytes: readFileSync(path.join(
      repositoryRoot,
      'app/public/paper-assets/paper-2026-i/latest/figures/reading-a-table-1.png',
    )),
    applicationWritingCaptureBytes: readFileSync(path.join(
      repositoryRoot,
      'test-fixtures/paper-canonical/evidence/application-writing-paper-2026-i-corrected.json',
    )),
    applicationWritingTranscriptionBytes: readFileSync(path.join(
      repositoryRoot,
      'test-fixtures/paper-canonical/evidence/application-writing-transcription-paper-2026-i-corrected.json',
    )),
    continuationWritingCaptureBytes: readFileSync(path.join(
      repositoryRoot,
      'test-fixtures/paper-canonical/evidence/continuation-writing-paper-2026-i-v2.json',
    )),
    continuationWritingTranscriptionBytes: readFileSync(path.join(
      repositoryRoot,
      'test-fixtures/paper-canonical/evidence/continuation-writing-transcription-paper-2026-i-v2.json',
    )),
    ...overrides,
  })
}

function withoutOfficialAnswer(questionId) {
  const paperAsset = JSON.parse(bytes('paper-asset.json'))
  const answerKey = JSON.parse(bytes('answer-key.json'))
  delete paperAsset.answerKey.answers[questionId]
  delete answerKey.answers[questionId]
  return buildPilotRequest({
    paperAssetBytes: Buffer.from(JSON.stringify(paperAsset)),
    answerKeyBytes: Buffer.from(JSON.stringify(answerKey)),
  })
}

const contradictoryPromptEvidence = JSON.parse(
  bytes('reviewed-evidence/grammar-fill-prompt-source-capture.json'),
)
const contradictoryUnpromptedRow = contradictoryPromptEvidence.rows.find(
  (row) => row.provision === 'source_proven_none',
)
contradictoryUnpromptedRow.prompt = 'contradictory-source-prompt'
const contradictoryPromptAdmission = admitCanonicalPaperImport({
  request: buildPilotRequest({
    grammarFillPromptSourceCaptureBytes: Buffer.from(
      JSON.stringify(contradictoryPromptEvidence),
    ),
  }),
  sourceAssetVersion: 1,
  sourceAsset: bytes('paper-asset.json'),
})
assert.equal(
  contradictoryPromptAdmission.ok,
  false,
  'admission rejects source_proven_none evidence that also carries prompt',
)
assert.equal(
  contradictoryPromptAdmission.diagnostics.some(
    (diagnostic) =>
      diagnostic.code === 'GRAMMAR_FILL_PROMPT_SOURCE_CAPTURE_INVALID',
  ),
  true,
  'admission reports the contradictory prompt evidence contract',
)

const missingAnswer = compileCanonicalPaper(
  withoutOfficialAnswer('q-2026-i-021'),
)
assert.equal(
  missingAnswer.disposition,
  'incomplete_source',
  'the compiler seam blocks a missing official answer instead of defaulting to A',
)
assert.equal(
  missingAnswer.artifacts.normalizationReport.diagnostics.some(
    (item) =>
      item.code === 'OFFICIAL_ANSWER_MISSING'
      || item.code === 'READING_QUESTION_EVIDENCE_INCOMPLETE',
  ),
  true,
  'the blocked result names missing official-answer evidence',
)

const listeningMediaTypes = [
  'application/vnd.eqb.listening-questions+json',
  'application/vnd.eqb.listening-answers+json',
  'application/vnd.eqb.listening-transcript+json',
  'application/vnd.eqb.listening-source-inventory+json',
]
const pilotRequest = buildPilotRequest()
const sourceEnvelopeDocument = pilotRequest.evidence.documents.find(
  (document) =>
    document.declared?.mediaType
      === 'application/vnd.eqb.canonical-fixture+json',
)
assert.ok(sourceEnvelopeDocument, 'pilot carries one registered source envelope')
const sourceEnvelope = JSON.parse(
  new TextDecoder().decode(sourceEnvelopeDocument.bytes),
)
for (const key of [
  'observations',
  'assertions',
  'groups',
  'transformations',
  'inactiveSourceClosures',
]) {
  assert.deepEqual(
    sourceEnvelope[key],
    [],
    `the source envelope does not preconstruct ${key}`,
  )
}
assert.deepEqual(
  sourceEnvelope.inactiveSlots,
  {},
  'the source envelope does not preclose inactive Listening',
)

const readingCaptureDocument = pilotRequest.evidence.documents.find(
  (document) => {
    if (document.declared?.mediaType !== 'application/json') return false
    try {
      return JSON.parse(new TextDecoder().decode(document.bytes))
        .schemaVersion === 'reading-source-capture-v1'
    } catch {
      return false
    }
  },
)
assert.ok(
  readingCaptureDocument,
  'the pilot carries reviewed structured Reading source evidence',
)
const withoutReadingCapture = structuredClone(pilotRequest)
withoutReadingCapture.evidence.documents =
  withoutReadingCapture.evidence.documents.filter(
    (document) => document.inputKey !== readingCaptureDocument.inputKey,
  )
assert.equal(
  compileCanonicalPaper(withoutReadingCapture).disposition,
  'incomplete_source',
  'flattened paper-asset marker text cannot replace structured Reading evidence',
)
const readyPilot = compileCanonicalPaper(pilotRequest)
assert.equal(
  readyPilot.disposition,
  'ready',
  JSON.stringify(readyPilot.artifacts.normalizationReport.diagnostics, null, 2),
)
const projectedPilot = projectCanonicalPaper({
  plan: readyPilot.artifacts.canonicalPaper.paperPlan,
  groups: readyPilot.artifacts.canonicalPaper.questionGroups,
  sourceCapture: readyPilot.artifacts.sourceCapture,
  authorityClosure: resolveCanonicalAuthority(canonicalAuthorityRef).closure,
})
const projectedChrome = projectedPilot.nodes.filter(
  (node) => node.kind === 'part'
    || node.kind === 'section'
    || node.kind === 'instruction',
)
const projectedVisibleStructure = projectedPilot.nodes.flatMap((node) => {
  if (
    node.kind === 'part'
    || node.kind === 'section'
    || node.kind === 'instruction'
  ) return [node]
  if (node.kind === 'group') {
    return [{
      kind: node.kind,
      slotId: node.slotId,
      groupId: node.groupId,
      familyContractId: node.familyContractId,
    }]
  }
  return []
})
assert.equal(
  digestJson(JSON.parse(readFileSync(path.join(
    repositoryRoot,
    visibleStructureOracle.sourceProfile.path,
  ), 'utf8'))),
  visibleStructureOracle.sourceProfile.sha256,
  'the independent visible-structure oracle binds immutable Profile v10',
)
assert.deepEqual(
  projectedVisibleStructure,
  visibleStructureOracle.nodes,
  'the public projector matches the independently checked exact Profile node list',
)
assert.equal(
  digestJson(projectedVisibleStructure),
  visibleStructureOracle.visibleStructureDigest,
  'the public projector matches the independent Profile node digest',
)
assert.equal(
  projectedChrome.some((node) =>
    node.partId === 'listening'
    || node.sectionId === 'listening.dialogues'
    || node.instructionId === 'part.listening'
    || node.instructionId === 'section.listening'),
  false,
  'inactive Listening contributes zero visible chrome',
)
assert.deepEqual(
  projectedChrome.slice(0, 6),
  [
    {
      kind: 'part',
      partId: 'reading',
      instructionId: 'part.reading',
    },
    {
      kind: 'instruction',
      instructionId: 'part.reading',
      placement: 'part_heading',
      text: '第二部分 阅读（共两节，满分50分）',
      renderPolicy: 'render',
    },
    {
      kind: 'section',
      sectionId: 'reading.choice',
      instructionId: 'section.reading-choice',
    },
    {
      kind: 'instruction',
      instructionId: 'section.reading-choice',
      placement: 'section_heading',
      text: '第一节 （共 15 小题；每小题 2.5 分，满分 37.5 分）',
      renderPolicy: 'render',
    },
    {
      kind: 'instruction',
      instructionId: 'reading.choice.prompt',
      placement: 'group_instruction',
      text: '阅读下列短文，从每题所给的A、B、C、D 四个选项中选出最佳选项。',
      renderPolicy: 'render',
    },
    {
      kind: 'section',
      sectionId: 'reading.seven-choices',
      instructionId: 'section.seven-choices',
    },
  ],
  'the public projection begins with exact Reading hierarchy and instruction',
)
const sevenChoicesChrome = projectedChrome.slice(6, 8)
assert.deepEqual(
  sevenChoicesChrome.map((node) => node.text).filter(Boolean),
  [
    '第二节 （共 5 小题；每小题 2.5 分，满分 12.5 分）',
    '阅读下面短文，从短文后的选项中选出可以填入空白处的最佳选项。选项中有两项为多余选项。',
  ],
  'Seven Choices keeps its complete section title and visible instruction',
)
const continuationProjection = projectedPilot.nodes.find(
  (node) =>
    node.kind === 'group'
    && node.familyContractId === 'continuation-writing',
)
const continuationVisibleText = continuationProjection.material.blocks
  .flatMap((block) => block.inlines.map((inline) => inline.text))
  .join(' ')
assert.equal(
  continuationVisibleText.includes('ditch (沟).'),
  true,
  'visible canonical typography uses a half-width gloss with adjacent punctuation',
)
for (const expected of ['didn’t', 'Emily’s']) {
  assert.equal(
    continuationVisibleText.includes(expected),
    true,
    `visible canonical typography uses the registered curly apostrophe in ${expected}`,
  )
}
assert.equal(
  canonicalizeVisibleEnglishTypography("you're"),
  'you’re',
  'the registered exact rule covers English contractions without broad punctuation normalization',
)
assert.equal(
  canonicalizeVisibleEnglishTypography('这是（中文）说明。'),
  '这是（中文）说明。',
  'ordinary Chinese prose keeps full-width parentheses byte-for-visible-text',
)
assert.equal(
  canonicalizeVisibleEnglishTypography('ditch （沟）.'),
  'ditch (沟).',
  'an English-token-adjacent Chinese gloss uses canonical half-width parentheses',
)
assert.equal(
  canonicalizeVisibleEnglishTypography('ditch(沟) .'),
  'ditch(沟).',
  'an English-token-adjacent ASCII gloss removes source-layout punctuation spacing',
)
for (const binding of visibleTypographyOracle.immutableSourceBindings) {
  assert.equal(
    sha256File(binding.path),
    binding.sha256,
    `the independent typography oracle binds immutable source ${binding.path}`,
  )
}
for (const oracleCase of visibleTypographyOracle.cases) {
  assert.equal(digestJson(oracleCase.before), oracleCase.beforeDigest)
  assert.equal(digestJson(oracleCase.after), oracleCase.afterDigest)
  assert.equal(
    canonicalizeVisibleEnglishTypography(oracleCase.before),
    oracleCase.after,
    `the producer matches the fixed ${oracleCase.caseId} expectation`,
  )
  assert.equal(
    replayCanonicalVisibleTypography(oracleCase.before),
    oracleCase.after,
    `the independent scanner matches the fixed ${oracleCase.caseId} expectation`,
  )
}
const sourceBoundTypographyCase = visibleTypographyOracle.cases.find(
  (oracleCase) =>
    oracleCase.caseId === 'english-token-adjacent-ascii-gloss-punctuation',
)
assert.ok(
  sourceBoundTypographyCase?.sourceBinding,
  'the exact v2 domain edge has one fixed source binding',
)
const sourceBoundTypography = sourceBoundTypographyRequest(
  sourceBoundTypographyCase,
)
const sourceBoundTypographyCompilation = compileCanonicalPaper(
  sourceBoundTypography.request,
)
assert.equal(
  sourceBoundTypographyCompilation.disposition,
  'ready',
  JSON.stringify(
    sourceBoundTypographyCompilation.artifacts.normalizationReport.diagnostics,
    null,
    2,
  ),
)
const sourceBoundTypographyRecord =
  sourceBoundTypographyCompilation.artifacts.normalizationReport
    .transformationRecords.find(
      (record) =>
        record.operation === 'canonical_visible_typography'
        && record.before === sourceBoundTypographyCase.before,
    )
assert.deepEqual(
  {
    before: sourceBoundTypographyRecord?.before,
    after: sourceBoundTypographyRecord?.after,
    outputDigest: sourceBoundTypographyRecord?.outputDigest,
  },
  {
    before: sourceBoundTypographyCase.before,
    after: sourceBoundTypographyCase.after,
    outputDigest: sourceBoundTypographyCase.afterDigest,
  },
  'the compiler emits the fixed exact-domain Transformation Record',
)
const sourceBoundObservation =
  sourceBoundTypographyCompilation.artifacts.sourceCapture.observations.find(
    (observation) =>
      sourceBoundTypographyRecord?.preconditions.sourceObservationIds.includes(
        observation.observationId,
      ),
  )
assert.deepEqual(
  sourceBoundObservation?.value,
  {
    nodeId: sourceBoundTypographyCase.sourceBinding.nodeId,
    text: sourceBoundTypographyCase.before,
  },
  'the Transformation Record is bound to the immutable source observation',
)
const sourceBoundAdmission = admitCanonicalPaperImport({
  request: sourceBoundTypography.request,
  sourceAssetVersion: 1,
  sourceAsset: sourceBoundTypography.sourceAsset,
})
assert.equal(
  sourceBoundAdmission.ok,
  true,
  JSON.stringify(sourceBoundAdmission.diagnostics || [], null, 2),
)
const sealedTypographyReportDescriptor =
  sourceBoundAdmission.sealed.manifest.artifacts.find(
    (artifact) => artifact.role === 'normalization_report',
  )
const sealedTypographyReport = JSON.parse(new TextDecoder().decode(
  sourceBoundAdmission.sealed.artifacts[
    sealedTypographyReportDescriptor.relativePath
  ],
))
assert.equal(
  sealedTypographyReport.transformationRecords.some(
      (record) =>
        record.before === sourceBoundTypographyCase.before
        && record.after === sourceBoundTypographyCase.after
        && record.outputDigest === sourceBoundTypographyCase.afterDigest,
    ),
  true,
  'the immutable publication preserves the exact-domain Transformation Record',
)
const synchronizedErrorRecords = structuredClone(
  sourceBoundTypographyCompilation.artifacts.normalizationReport
    .transformationRecords,
)
const synchronizedErrorRecord = synchronizedErrorRecords.find(
  (record) => record.recordId === sourceBoundTypographyRecord.recordId,
)
synchronizedErrorRecord.after = synchronizedErrorRecord.before
synchronizedErrorRecord.outputDigest = digestJson(
  synchronizedErrorRecord.after,
)
assert.equal(
  validateExactTransformationRecords(
    synchronizedErrorRecords,
    sourceBoundTypographyCompilation.artifacts.sourceCapture,
    resolveCanonicalAuthority(canonicalAuthorityRef).closure,
  ).diagnostics.some(
    (diagnostic) => diagnostic.code === 'TRANSFORMATION_CLOSURE_INVALID',
  ),
  true,
  'a synchronized digest-consistent producer error cannot self-prove against independent replay',
)
assert.equal(
  readyPilot.artifacts.normalizationReport.transformationRecords.some(
    (record) =>
      record.operation === 'canonical_visible_typography'
      && record.ruleId === 'canonical-visible-typography',
  ),
  true,
  'visible punctuation cleanup is backed by a registered exact Transformation Record',
)
const sevenChoicesGroup = readyPilot.artifacts.canonicalPaper.questionGroups
  .find((group) => group.contractRef.familyContractId === 'seven-choices')
assert.ok(sevenChoicesGroup, 'pilot publishes canonical Seven Choices')
assert.equal(
  JSON.stringify(sevenChoicesGroup).includes('algorithms (算法),'),
  true,
  'the registered typography rule removes source-layout spacing before punctuation in Reading',
)
assert.equal(
  JSON.stringify(sevenChoicesGroup).includes('algorithms (算法) ,'),
  false,
  'source-layout spacing does not govern visible canonical Reading typography',
)
const poisonedTypographyRecords = structuredClone(
  readyPilot.artifacts.normalizationReport.transformationRecords,
)
const poisonedTypographyRecord = poisonedTypographyRecords.find(
  (record) =>
    record.operation === 'canonical_visible_typography'
    && record.before.includes('algorithms'),
)
assert.ok(
  poisonedTypographyRecord,
  'Seven Choices typography cleanup has one exact replayable record',
)
poisonedTypographyRecord.after = poisonedTypographyRecord.before
poisonedTypographyRecord.outputDigest = digestJson(
  poisonedTypographyRecord.after,
)
assert.equal(
  validateExactTransformationRecords(
    poisonedTypographyRecords,
    readyPilot.artifacts.sourceCapture,
    resolveCanonicalAuthority(canonicalAuthorityRef).closure,
  ).diagnostics.some(
    (diagnostic) => diagnostic.code === 'TRANSFORMATION_CLOSURE_INVALID',
  ),
  true,
  'a digest-consistent poisoned typography record fails independent exact replay',
)
assert.deepEqual(
  readyPilot.artifacts.canonicalPaper.questionGroups.map(
    (group) => group.identity.groupId,
  ),
  readyPilot.artifacts.canonicalPaper.paperPlan.slotBindings
    .filter((binding) => binding.state === 'bound')
    .map((binding) => binding.groupRef.groupId),
  'compiler output follows the closed Profile slot order, not adapter append order',
)
const readingA = readyPilot.artifacts.canonicalPaper.questionGroups.find(
  (group) => group.identity.groupId === 'group-2026-i-reading-a',
)
assert.ok(readingA, 'compiler derives Reading A behind the public seam')
assert.equal(
  JSON.stringify(readingA.content).includes('[表:'),
  false,
  'flattened table markers never enter ready canonical content',
)
const tableTargets = readingA.sourceMap.entries.filter(
  (entry) =>
    entry.target.kind === 'content_node'
    && (
      entry.target.id === 'table:reading-a:events'
      || entry.target.id.startsWith('row:reading-a:events:')
      || entry.target.id.startsWith('cell:reading-a:events:')
      || entry.target.id.startsWith('text:reading-a:events:')
    ),
)
assert.equal(tableTargets.length > 0, true, 'native table identities are mapped')
const spansById = new Map(
  readyPilot.artifacts.sourceCapture.sourceSpans.map(
    (span) => [span.sourceSpanId, span],
  ),
)
const recordsById = new Map(
  readyPilot.artifacts.normalizationReport.transformationRecords.map(
    (record) => [record.recordId, record],
  ),
)
for (const entry of tableTargets) {
  assert.equal(entry.sourceSpanRefs.length, 1)
  assert.equal(entry.transformationRecordIds.length, 1)
  const span = spansById.get(entry.sourceSpanRefs[0])
  assert.equal(span?.coordinate?.kind, 'page_region')
  assert.equal(span?.coordinate?.page, 4)
  assert.equal(
    span?.documentDigest,
    'sha256:31a87069e6d530afba9123eec0487adf45e52e0b98530af80b62476f169e4d0f',
    `${entry.target.id} binds the immutable question PDF`,
  )
  assert.ok(
    recordsById.has(entry.transformationRecordIds[0]),
    `${entry.target.id} binds an accepted Transformation Record`,
  )
}

const browseAsset = JSON.parse(bytes('paper-asset.json'))
const browseGroupIds = browseAsset.content.blocks.flatMap((block) =>
  block.type === 'group'
  && browseAsset.content.groups[block.groupId]?.groupType !== 'listening'
    ? [block.groupId]
    : [])
const browseConsumption = {
  disposition: 'ready',
  paperId,
  authorityRef: canonicalAuthorityRef,
  profileRef: readyPilot.artifacts.canonicalPaper.paperPlan.profileRef,
  visibleStructure: projectedVisibleStructure,
  selections: [
    ...projectedPilot.nodes
      .filter((node) => node.kind === 'group')
      .reduce((selections, occurrence) => {
        let selection = selections.find(
          (candidate) =>
            candidate.familyContractId === occurrence.familyContractId,
        )
        if (!selection) {
          selection = {
            mode: 'canonical',
            familyContractId: occurrence.familyContractId,
            groupIds: [],
            projectedOccurrences: [],
          }
          selections.push(selection)
        }
        selection.groupIds.push(occurrence.groupId)
        selection.projectedOccurrences.push(occurrence)
        return selections
      }, []),
  ],
}
browseConsumption.visibleStructureDigest = digestJson(
  browseConsumption.visibleStructure,
)
assert.deepEqual(
  browseConsumption.selections.flatMap((selection) => selection.groupIds),
  browseGroupIds,
  'focused Screen Consumption Plan closes every non-Listening Group in order',
)
const projectedBrowseAsset = projectAssetBlocksToCanonicalConsumption(
  browseAsset,
  browseConsumption,
)
const rawOwnerPoisonAsset = structuredClone(browseAsset)
for (const [index, block] of rawOwnerPoisonAsset.content.blocks.entries()) {
  if (block.type === 'partHeading') block.partId = `raw-part-${index}`
  if (block.type === 'sectionHeading') block.sectionId = `raw-section-${index}`
}
const rawOwnerMissingAsset = structuredClone(browseAsset)
rawOwnerMissingAsset.content.blocks =
  rawOwnerMissingAsset.content.blocks.filter(
    (block) =>
      block.type !== 'partHeading' && block.type !== 'sectionHeading',
  )
const rawOwnerReorderedAsset = structuredClone(browseAsset)
const rawOwnerHeadings = rawOwnerReorderedAsset.content.blocks.filter(
  (block) =>
    block.type === 'partHeading' || block.type === 'sectionHeading',
).reverse()
let rawOwnerHeadingIndex = 0
rawOwnerReorderedAsset.content.blocks =
  rawOwnerReorderedAsset.content.blocks.map((block) =>
    block.type === 'partHeading' || block.type === 'sectionHeading'
      ? rawOwnerHeadings[rawOwnerHeadingIndex++]
      : block)
const expectedProfileHeadingIdentities =
  visibleStructureOracle.nodes.flatMap((node) =>
    node.kind === 'part'
      ? [{ kind: 'part', id: node.partId }]
      : node.kind === 'section'
        ? [{ kind: 'section', id: node.sectionId }]
        : [])
for (const [caseId, attackedAsset] of [
  ['raw-heading-id-drift', rawOwnerPoisonAsset],
  ['raw-heading-missing', rawOwnerMissingAsset],
  ['raw-heading-reordered', rawOwnerReorderedAsset],
]) {
  const attackedProjection = projectAssetBlocksToCanonicalConsumption(
    attackedAsset,
    browseConsumption,
  )
  assert.deepEqual(
    attackedProjection.content.blocks.flatMap((block) =>
      block.type === 'partHeading'
        ? [{ kind: 'part', id: block.partId }]
        : block.type === 'sectionHeading'
          ? [{ kind: 'section', id: block.sectionId }]
          : []),
    expectedProfileHeadingIdentities,
    `PaperBrowse public projection keeps Profile node ownership for ${caseId}`,
  )
}
assert.deepEqual(
  projectedBrowseAsset.content.blocks
    .filter((block) =>
      block.type === 'partHeading'
      || block.type === 'sectionHeading'
      || block.type === 'instruction')
    .slice(0, 4)
    .map((block) => block.text),
  [
    '第二部分 阅读（共两节，满分50分）',
    '第一节 （共 15 小题；每小题 2.5 分，满分 37.5 分）',
    '阅读下列短文，从每题所给的A、B、C、D 四个选项中选出最佳选项。',
    '第二节 （共 5 小题；每小题 2.5 分，满分 12.5 分）',
  ],
  'PaperBrowse consumes public canonical chrome instead of source-layout accidents',
)
const unknownVisibleNodeConsumption = structuredClone(browseConsumption)
unknownVisibleNodeConsumption.visibleStructure.splice(3, 0, {
  kind: 'mystery',
})
const reorderedVisibleNodeConsumption = structuredClone(browseConsumption)
const partHeadingNode = reorderedVisibleNodeConsumption.visibleStructure[1]
reorderedVisibleNodeConsumption.visibleStructure[1] =
  reorderedVisibleNodeConsumption.visibleStructure[2]
reorderedVisibleNodeConsumption.visibleStructure[2] = partHeadingNode
const swappedGroupVisibleNodeConsumption = structuredClone(browseConsumption)
const readingAIndex =
  swappedGroupVisibleNodeConsumption.visibleStructure.findIndex(
    (node) => node.kind === 'group' && node.slotId === 'reading.a',
  )
const readingBIndex =
  swappedGroupVisibleNodeConsumption.visibleStructure.findIndex(
    (node) => node.kind === 'group' && node.slotId === 'reading.b',
  )
const readingAGroupNode =
  swappedGroupVisibleNodeConsumption.visibleStructure[readingAIndex]
swappedGroupVisibleNodeConsumption.visibleStructure[readingAIndex] =
  swappedGroupVisibleNodeConsumption.visibleStructure[readingBIndex]
swappedGroupVisibleNodeConsumption.visibleStructure[readingBIndex] =
  readingAGroupNode
const missingSevenHeadingConsumption = structuredClone(browseConsumption)
const sevenSectionIndex =
  missingSevenHeadingConsumption.visibleStructure.findIndex(
    (node) =>
      node.kind === 'section'
      && node.sectionId === 'reading.seven-choices',
  )
missingSevenHeadingConsumption.visibleStructure.splice(sevenSectionIndex, 2)
missingSevenHeadingConsumption.visibleStructureDigest = digestJson(
  missingSevenHeadingConsumption.visibleStructure,
)
const missingSevenInstructionConsumption = structuredClone(browseConsumption)
const sevenInstructionIndex =
  missingSevenInstructionConsumption.visibleStructure.findIndex(
    (node) =>
      node.kind === 'instruction'
      && node.instructionId === 'reading.seven-choices.prompt',
  )
missingSevenInstructionConsumption.visibleStructure.splice(
  sevenInstructionIndex,
  1,
)
missingSevenInstructionConsumption.visibleStructureDigest = digestJson(
  missingSevenInstructionConsumption.visibleStructure,
)
const wrongHeadingTextConsumption = structuredClone(browseConsumption)
const grammarHeading =
  wrongHeadingTextConsumption.visibleStructure.find(
    (node) =>
      node.kind === 'instruction'
      && node.instructionId === 'section.language.grammar-fill',
  )
grammarHeading.text = '第二节 错误标题'
wrongHeadingTextConsumption.visibleStructureDigest = digestJson(
  wrongHeadingTextConsumption.visibleStructure,
)
const synchronizedSectionDriftConsumption = structuredClone(browseConsumption)
const synchronizedSection =
  synchronizedSectionDriftConsumption.visibleStructure.find(
    (node) =>
      node.kind === 'section'
      && node.sectionId === 'language.grammar-fill',
  )
const synchronizedSectionHeading =
  synchronizedSectionDriftConsumption.visibleStructure.find(
    (node) =>
      node.kind === 'instruction'
      && node.instructionId === 'section.language.grammar-fill',
  )
synchronizedSection.sectionId = 'language.grammar-fill-drift'
synchronizedSection.instructionId = 'section.language.grammar-fill-drift'
synchronizedSectionHeading.instructionId =
  'section.language.grammar-fill-drift'
synchronizedSectionHeading.text = '同步改写且重算摘要的第二节'
synchronizedSectionDriftConsumption.visibleStructureDigest = digestJson(
  synchronizedSectionDriftConsumption.visibleStructure,
)
const staleProfileDowngradeConsumption = structuredClone(browseConsumption)
const staleNck1Profile = JSON.parse(readFileSync(path.join(
  repositoryRoot,
  'standards/paper-canonical/profiles/nck1-v9.json',
), 'utf8'))
staleProfileDowngradeConsumption.profileRef = {
  profileId: staleNck1Profile.profileId,
  profileVersion: staleNck1Profile.version,
  profileDigest: digestJson(staleNck1Profile),
}
for (const [caseId, poisonedConsumption] of [
  ['unknown-node', unknownVisibleNodeConsumption],
  ['reordered-heading', reorderedVisibleNodeConsumption],
  ['swapped-same-section-Group', swappedGroupVisibleNodeConsumption],
  ['missing-seven-heading', missingSevenHeadingConsumption],
  ['missing-seven-instruction', missingSevenInstructionConsumption],
  ['wrong-heading-text', wrongHeadingTextConsumption],
  ['synchronized-section-drift', synchronizedSectionDriftConsumption],
  ['stale-profile-downgrade', staleProfileDowngradeConsumption],
]) {
  assert.throws(
    () =>
      projectAssetBlocksToCanonicalConsumption(
        browseAsset,
        poisonedConsumption,
      ),
    { code: 'CANONICAL_CONSUMPTION_REJECTED' },
    `Screen rejects ${caseId} canonical visible structure`,
  )
  assert.throws(
    () =>
      buildPrintHtml({
        title: 'poisoned visible structure',
        versionType: 'student',
        printStyle: 'exam',
        items: [],
        blocks: [],
        questionNumberStart: 1,
        canonicalConsumption: poisonedConsumption,
      }),
    { code: 'CANONICAL_CONSUMPTION_REJECTED' },
    `Print HTML rejects ${caseId} canonical visible structure`,
  )
}
const planExternalAsset = structuredClone(browseAsset)
planExternalAsset.content.groups['group-plan-external'] = {
  groupId: 'group-plan-external',
  groupType: 'reading',
  questionIds: [],
  passage: { paragraphs: [] },
}
planExternalAsset.content.blocks.push({
  type: 'group',
  groupId: 'group-plan-external',
})
assert.throws(
  () =>
    projectAssetBlocksToCanonicalConsumption(
      planExternalAsset,
      browseConsumption,
    ),
  /outside the Consumption Plan/,
  'PaperBrowse rejects a non-Listening Group outside the whole-paper plan',
)

async function assertPaperBrowseSelectionModes() {
  const legacyCases = [
    {
      familyContractId: 'reading',
      groupIds: [
        'group-2026-i-reading-a',
        'group-2026-i-reading-b',
        'group-2026-i-reading-c',
        'group-2026-i-reading-d',
      ],
      expectedText: 'SoFi Stadium',
    },
    {
      familyContractId: 'application-writing',
      groupIds: ['group-2026-i-writing-application'],
      expectedText: '你校英文报”Opinion”栏目正在征稿',
    },
    {
      familyContractId: 'continuation-writing',
      groupIds: ['group-2026-i-writing-continuation'],
      expectedText: 'Emily Sanders, a 25-year-old from Detroit',
    },
  ]
  function assetForGroups(groupIds, { preserveNonGroupBlocks = false } = {}) {
    const selectedGroupIds = new Set(groupIds)
    const asset = structuredClone(browseAsset)
    asset.content.blocks = asset.content.blocks.filter(
      (block) =>
        (preserveNonGroupBlocks && block.type !== 'group')
        || (block.type === 'group' && selectedGroupIds.has(block.groupId)),
    )
    return asset
  }
  function consumptionForGroup(testCase, mode) {
    return {
      disposition: 'ready',
      paperId,
      selections: [{
        mode,
        familyContractId: testCase.familyContractId,
        groupIds: testCase.groupIds,
      }],
    }
  }
  const screenContract = JSON.parse(readFileSync(path.join(
    repositoryRoot,
    'standards/paper-canonical/consumers/screen-v15.json',
  )))
  for (const { familyContractId } of legacyCases) {
    assert.equal(
      screenContract.families.find(
        (family) => family.familyContractId === familyContractId,
      )?.legacyCapability,
      'available',
      `${familyContractId} legacy mode is authorized by the checked-in Screen contract`,
    )
  }

  const vite = await import('../app/node_modules/vite/dist/node/index.js')
  const viteServer = await vite.createServer({
    root: path.resolve('app'),
    server: { host: '127.0.0.1', port: 0 },
  })
  await viteServer.listen()
  const appUrl = viteServer.resolvedUrls?.local?.[0]
  assert.ok(appUrl)
  const playwright = await import('../app/node_modules/playwright/index.js')
  const browser = await playwright.default.chromium.launch({ headless: true })

  async function openPaperBrowse(asset, consumption) {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
    })
    await page.route(
      '**/api/paper-canonical/consumption?*',
      (route) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(consumption),
      }),
    )
    await page.route('**/paper-assets/**/paper-asset.json', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(asset),
      }))
    await page.route('**/paper-assets/**/analyses/**', (route) => {
      if (route.request().url().endsWith(
        '/analyses/reading-choice-analysis-v1.json',
      )) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: readFileSync(path.join(
            repositoryRoot,
            'app/public/paper-assets/paper-2026-i/latest/analyses/reading-choice-analysis-v1.json',
          )),
        })
      }
      return route.fulfill({ status: 404, body: '' })
    })
    await page.route('**/paper-assets/**/figures/**', (route) =>
      route.fulfill({ status: 404, body: '' }))
    const url = new URL('canonical-consumption-qa.html', appUrl)
    url.searchParams.set('paperId', paperId)
    await page.goto(url.href)
    return page
  }

  try {
    for (const testCase of legacyCases) {
      const legacyPage = await openPaperBrowse(
        assetForGroups(testCase.groupIds, {
          preserveNonGroupBlocks: testCase.familyContractId === 'reading',
        }),
        consumptionForGroup(testCase, 'legacy'),
      )
      try {
        await legacyPage.locator('.paper-browse-loading').waitFor({
          state: 'detached',
        })
        const legacyBodyText = await legacyPage.locator('body').innerText()
        assert.equal(
          legacyBodyText.includes(testCase.expectedText),
          true,
          `authorized ${testCase.familyContractId} legacy selection renders its retained source:\n${legacyBodyText}`,
        )
        assert.equal(
          await legacyPage.locator('.paper-browse-placeholder').count(),
          0,
          `authorized ${testCase.familyContractId} legacy selection renders through PaperBrowse`,
        )
        if (testCase.familyContractId === 'reading') {
          assert.equal(
            await legacyPage.locator(
              '[data-canonical-reading-rhythm-role],'
              + '[data-canonical-reading-chrome],'
              + '[data-canonical-reading-preceding-for],'
              + '[data-canonical-reading-following-for]',
            ).count(),
            0,
            'full-chrome legacy Reading receives no canonical rhythm attributes',
          )
        }
      } finally {
        await legacyPage.close()
      }

      const canonicalPage = await openPaperBrowse(
        assetForGroups(testCase.groupIds),
        consumptionForGroup(testCase, 'canonical'),
      )
      try {
        await canonicalPage.locator('.paper-browse-error').waitFor()
        assert.equal(
          (await canonicalPage.locator('body').innerText()).includes(
            testCase.expectedText,
          ),
          false,
          `${testCase.familyContractId} canonical mode never falls back to raw fields`,
        )
      } finally {
        await canonicalPage.close()
      }
    }

    const readingCase = legacyCases[0]
    const browserPlanExternalAsset = assetForGroups(readingCase.groupIds)
    browserPlanExternalAsset.content.groups['group-plan-external'] = {
      groupId: 'group-plan-external',
      groupType: 'reading',
      questionIds: [],
      passage: { paragraphs: [] },
    }
    browserPlanExternalAsset.content.blocks.push({
      type: 'group',
      groupId: 'group-plan-external',
    })
    const planExternalPage = await openPaperBrowse(
      browserPlanExternalAsset,
      consumptionForGroup(readingCase, 'legacy'),
    )
    try {
      await planExternalPage.locator('.paper-browse-error').waitFor()
      assert.match(
        await planExternalPage.locator('.paper-browse-error').innerText(),
        /outside the Consumption Plan/,
        'the PaperBrowse public seam rejects Plan-external Groups',
      )
    } finally {
      await planExternalPage.close()
    }
  } finally {
    await browser.close()
    await viteServer.close()
  }
}

function mutateJsonDocument(request, mediaType, mutate) {
  const candidate = structuredClone(request)
  const document = candidate.evidence.documents.find(
    (item) => item.declared?.mediaType === mediaType,
  )
  assert.ok(document, `fixture carries ${mediaType}`)
  const value = JSON.parse(new TextDecoder().decode(document.bytes))
  mutate(value)
  document.bytes = new TextEncoder().encode(JSON.stringify(value))
  return candidate
}

for (const mediaType of listeningMediaTypes) {
  assert.equal(
    pilotRequest.evidence.documents.some(
      (document) => document.declared?.mediaType === mediaType,
    ),
    true,
    `the source package carries real ${mediaType} evidence`,
  )
  const missingDocument = structuredClone(pilotRequest)
  missingDocument.evidence.documents =
    missingDocument.evidence.documents.filter(
      (document) => document.declared?.mediaType !== mediaType,
    )
  assert.equal(
    compileCanonicalPaper(missingDocument).disposition,
    'incomplete_source',
    `missing ${mediaType} evidence fails closed at the compiler seam`,
  )
}

const incompleteListeningCases = [
  {
    label: 'Question 1',
    mediaType: listeningMediaTypes[0],
    mutate: (value) => value.section1.questions.shift(),
  },
  {
    label: 'Question 1 option C',
    mediaType: listeningMediaTypes[0],
    mutate: (value) => delete value.section1.questions[0].options.C,
  },
  {
    label: 'Question 1 official answer',
    mediaType: listeningMediaTypes[1],
    mutate: (value) => delete value.answers['1'],
  },
  {
    label: 'Text 10 transcript segment',
    mediaType: listeningMediaTypes[2],
    mutate: (value) => value.texts.pop(),
  },
  {
    label: 'supplied timing table',
    mediaType: listeningMediaTypes[2],
    mutate: (value) => delete value.timingTable,
  },
  {
    label: 'closed audio inventory',
    mediaType: listeningMediaTypes[3],
    mutate: (value) => delete value.audio,
  },
]
for (const testCase of incompleteListeningCases) {
  const result = compileCanonicalPaper(
    mutateJsonDocument(
      pilotRequest,
      testCase.mediaType,
      testCase.mutate,
    ),
  )
  assert.equal(
    result.disposition,
    'incomplete_source',
    `missing ${testCase.label} evidence fails closed`,
  )
  assert.equal(
    result.artifacts.canonicalPaper == null,
    true,
    `missing ${testCase.label} evidence exposes no canonical paper`,
  )
}

await assertPaperBrowseSelectionModes()

console.log('PASS canonical import pilot focused review fixes')
