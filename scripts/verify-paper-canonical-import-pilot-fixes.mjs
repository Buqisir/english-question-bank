#!/usr/bin/env node

import assert from 'node:assert/strict'
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
import { digestJson } from '../shared/paper-canonical/stable.mjs'
import {
  makeReviewedReadingSourceCapture,
} from '../test-fixtures/paper-canonical/readingReferenceFixture.mjs'
import {
  projectAssetBlocksToCanonicalConsumption,
} from '../app/src/features/paper-browse/paperBrowseCanonicalAssetProjection.ts'

const repositoryRoot = path.resolve(import.meta.dirname, '..')
const packageDir = path.join(
  repositoryRoot,
  'test-fixtures/paper-import/paper-2026-i-canonical-pilot',
)
const paperId = 'paper-2026-i'

function bytes(fileName) {
  return readFileSync(path.join(packageDir, fileName))
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
      text: '第一节（共15小题；每小题2.5分，满分37.5分）',
      renderPolicy: 'render',
    },
    {
      kind: 'instruction',
      instructionId: 'reading.choice.prompt',
      placement: 'group_instruction',
      text: '阅读下列短文，从每题所给的A、B、C、D四个选项中选出最佳选项。',
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
    '第二节（共5小题；每小题2.5分，满分12.5分）',
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
  visibleStructure: projectedPilot.nodes.flatMap((node) => {
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
  }),
  selections: [{
    mode: 'canonical',
    familyContractId: 'reading',
    groupIds: browseGroupIds,
  }],
}
const projectedBrowseAsset = projectAssetBlocksToCanonicalConsumption(
  browseAsset,
  browseConsumption,
)
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
    '第一节（共15小题；每小题2.5分，满分37.5分）',
    '阅读下列短文，从每题所给的A、B、C、D四个选项中选出最佳选项。',
    '第二节（共5小题；每小题2.5分，满分12.5分）',
  ],
  'PaperBrowse consumes public canonical chrome instead of source-layout accidents',
)
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
