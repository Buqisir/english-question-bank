#!/usr/bin/env node

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import {
  canonicalAuthorityRef,
  resolveCanonicalAuthority,
  validateAuthorityClosure,
} from '../shared/paper-canonical/authority.mjs'
import { compileCanonicalPaper } from '../shared/paper-canonical/compiler.mjs'
import {
  projectCanonicalWritingChrome,
  projectCanonicalConsumerGroup,
} from '../shared/paper-canonical/consumerProjection.mjs'
import { projectCanonicalPaper } from '../shared/paper-canonical/projector.mjs'
import { digestJson } from '../shared/paper-canonical/stable.mjs'
import {
  buildCanonicalContinuationWritingConsumptionSurfaceData,
} from '../shared/paper-normalization/canonicalPaperGroupSurfaceAdapter.mjs'
import { consumerContractRefs } from '../shared/paper-canonical/consumers.mjs'
import { createDocxRenderer } from '../server/exports/docxRenderer.mjs'
import { buildPrintHtml } from '../server/print-renderer.mjs'
import {
  createFileSystemCanonicalPublicationStore,
  loadPaperForConsumption,
  publishCanonicalPaperPublication,
} from '../server/paper-canonical/publication.mjs'
import {
  makeApplicationWritingReferenceFixture,
} from '../test-fixtures/paper-canonical/applicationWritingReferenceFixture.mjs'
import {
  makeContinuationWritingReferenceFixture,
  makePollutedContinuationCapture,
} from '../test-fixtures/paper-canonical/continuationWritingReferenceFixture.mjs'

const persistActualArtifacts =
  process.env.EQB_PERSIST_ACTUAL_ARTIFACTS === '1'
const actualArtifactRoot = path.resolve(
  process.env.EQB_ACTUAL_ARTIFACT_ROOT
    || '.scratch/ticket-13-continuation-writing',
)
if (persistActualArtifacts) {
  mkdirSync(actualArtifactRoot, { recursive: true })
}
const docxRenderer = createDocxRenderer({
  groupTypeLabels: { writing: '写作' },
  optionalString: (value) => value == null ? '' : String(value),
})

const nck1WritingChrome = Object.freeze({
  part: '第四部分 写作（共两节，满分40分）',
  application: '第一节（满分15分）',
  continuation: '第二节（满分25分）',
})

function assertNck1WritingAuthority() {
  const authority = resolveCanonicalAuthority(canonicalAuthorityRef)
  assert.equal(authority.ok, true)
  const profile = authority.closure.profiles.get('nck1')
  const writingPart = profile.parts.find((part) => part.partId === 'writing')
  assert.ok(writingPart)
  assert.equal(writingPart.score, 40)
  assert.equal(writingPart.sections.length, 2)
  assert.deepEqual(
    writingPart.sections.map((section) => ({
      sectionId: section.sectionId,
      score: section.score,
      slots: section.slots.map((slot) => slot.slotId),
    })),
    [
      {
        sectionId: 'writing.application',
        score: 15,
        slots: ['writing.application'],
      },
      {
        sectionId: 'writing.continuation',
        score: 25,
        slots: ['writing.continuation'],
      },
    ],
  )
  assert.equal(
    profile.instructions[writingPart.titleInstructionRef].text,
    nck1WritingChrome.part,
  )
  assert.equal(
    profile.instructions[
      writingPart.sections[0].titleInstructionRef
    ].text,
    nck1WritingChrome.application,
  )
  assert.equal(
    profile.instructions[
      writingPart.sections[1].titleInstructionRef
    ].text,
    nck1WritingChrome.continuation,
  )

  const mutatedProfile = structuredClone(profile)
  const mutatedWritingPart = mutatedProfile.parts.find(
    (part) => part.partId === 'writing',
  )
  mutatedWritingPart.sections = [{
    sectionId: 'writing.tasks',
    ordinal: 1,
    titleInstructionRef: 'section.writing',
    score: 40,
    slots: mutatedWritingPart.sections.flatMap((section) => section.slots),
  }]
  mutatedProfile.instructions['section.writing'] = {
    instructionId: 'section.writing',
    placement: 'section_heading',
    text: 'Writing tasks',
  }
  const mutatedManifest = structuredClone(authority.closure.manifest)
  mutatedManifest.artifacts.find(
    (descriptor) => descriptor.id === 'profile-nck1',
  ).sha256 = digestJson(mutatedProfile)
  const validation = validateAuthorityClosure({
    manifest: mutatedManifest,
    artifacts: {
      ...authority.closure.artifacts,
      'profile-nck1': mutatedProfile,
    },
    schemas: authority.closure.schemas,
  })
  assert.equal(validation.ok, false)
  assert.equal(
    validation.issues.some(
      (issue) => issue.code === 'PROFILE_NCK1_WRITING_CHROME_INVALID',
    ),
    true,
  )
}

function assertZhejiangWritingChromeAuthority() {
  const authority = resolveCanonicalAuthority(canonicalAuthorityRef)
  assert.equal(authority.ok, true)
  const profile = authority.closure.profiles.get('zhejiang-legacy')
  assert.equal(profile.version, '3')
  assert.equal(
    profile.instructions['part.writing'].renderPolicy,
    'suppress',
  )
  assert.equal(
    profile.instructions['section.writing'].renderPolicy,
    'suppress',
  )

  const mutatedProfile = structuredClone(profile)
  mutatedProfile.instructions['part.writing'].renderPolicy = 'guess'
  const mutatedManifest = structuredClone(authority.closure.manifest)
  mutatedManifest.artifacts.find(
    (descriptor) => descriptor.id === 'profile-zhejiang-legacy',
  ).sha256 = digestJson(mutatedProfile)
  const validation = validateAuthorityClosure({
    manifest: mutatedManifest,
    artifacts: {
      ...authority.closure.artifacts,
      'profile-zhejiang-legacy': mutatedProfile,
    },
    schemas: authority.closure.schemas,
  })
  assert.equal(validation.ok, false)
  assert.equal(
    validation.issues.some(
      (issue) => issue.code === 'PROFILE_INSTRUCTION_INVALID',
    ),
    true,
  )
}

function readyConsumption(paperId) {
  const fixture = makeContinuationWritingReferenceFixture(paperId)
  const compilation = compileCanonicalPaper(fixture.request)
  assert.equal(compilation.disposition, 'ready')
  if (paperId === 'paper-2026-i') {
    const authority = resolveCanonicalAuthority(canonicalAuthorityRef)
    const profile = authority.closure.profiles.get('nck1')
    assert.deepEqual(
      compilation.artifacts.canonicalPaper.paperPlan.profileRef,
      {
        profileId: 'nck1',
        profileVersion: '3',
        profileDigest: digestJson(profile),
      },
    )
  } else if (paperId === 'paper-zj-2020-jul') {
    const authority = resolveCanonicalAuthority(canonicalAuthorityRef)
    const profile = authority.closure.profiles.get('zhejiang-legacy')
    assert.deepEqual(
      compilation.artifacts.canonicalPaper.paperPlan.profileRef,
      {
        profileId: 'zhejiang-legacy',
        profileVersion: '3',
        profileDigest: digestJson(profile),
      },
    )
  }
  const projected = projectCanonicalPaper({
    plan: compilation.artifacts.canonicalPaper.paperPlan,
    groups: compilation.artifacts.canonicalPaper.questionGroups,
    sourceCapture: compilation.artifacts.sourceCapture,
  })
  const occurrences = projected.nodes.filter(
    (node) =>
      node.kind === 'group'
      && node.familyContractId === 'continuation-writing',
  )
  assert.equal(occurrences.length, 1)
  return {
    disposition: 'ready',
    paperId,
    selections: [{
      mode: 'canonical',
      familyContractId: 'continuation-writing',
      groupIds: [occurrences[0].groupId],
      projectedOccurrences: occurrences,
    }],
  }
}

function readyWholeWritingConsumption(paperId) {
  const fixture = makeContinuationWritingReferenceFixture(paperId)
  const compilation = compileCanonicalPaper(fixture.request)
  assert.equal(compilation.disposition, 'ready')
  const projected = projectCanonicalPaper({
    plan: compilation.artifacts.canonicalPaper.paperPlan,
    groups: compilation.artifacts.canonicalPaper.questionGroups,
    sourceCapture: compilation.artifacts.sourceCapture,
  })
  const writingOccurrences = projected.nodes.filter(
    (node) =>
      node.kind === 'group'
      && [
        'application-writing',
        'continuation-writing',
      ].includes(node.familyContractId),
  )
  assert.deepEqual(
    writingOccurrences.map((occurrence) => occurrence.familyContractId),
    ['application-writing', 'continuation-writing'],
  )
  return {
    disposition: 'ready',
    paperId,
    selections: writingOccurrences.map((occurrence) => ({
      mode: 'canonical',
      familyContractId: occurrence.familyContractId,
      groupIds: [occurrence.groupId],
      projectedOccurrences: [occurrence],
    })),
  }
}

function makeIntegrityClosedNck1WritingFixture() {
  const application =
    makeApplicationWritingReferenceFixture('paper-2026-i')
  const continuation =
    makeContinuationWritingReferenceFixture('paper-2026-i')
  const source = structuredClone(continuation.source)
  source.groups = source.groups.filter(
    (group) => group.slotId !== 'writing.application',
  )
  const removedObservationIds = new Set([
    'observation:writing.application',
    'observation:group:writing.application:answer-region-empty',
    'observation:group:writing.application:word-count',
    'observation:group:writing.application:response',
  ])
  source.observations = source.observations.filter(
    (observation) => !removedObservationIds.has(observation.observationId),
  )
  const realGroupIdsBySlot = {
    'reading.a': 'group-2026-i-reading-a',
    'reading.b': 'group-2026-i-reading-b',
    'reading.c': 'group-2026-i-reading-c',
    'reading.d': 'group-2026-i-reading-d',
    'reading.seven-choices': 'group-2026-i-seven-choices',
    'language.cloze': 'group-2026-i-cloze',
    'language.grammar-fill': 'group-2026-i-grammar-fill',
  }
  for (const group of source.groups) {
    const realGroupId = realGroupIdsBySlot[group.slotId]
    if (!realGroupId) continue
    group.groupId = realGroupId
    if (group.variant.family === 'seven-choices') {
      group.variant.choiceOwnership.bankId = `bank:${realGroupId}`
    }
  }
  for (let pass = 0; pass < 3; pass += 1) {
    const byteLength =
      new TextEncoder().encode(JSON.stringify(source)).byteLength
    for (const observation of source.observations) {
      if (observation.documentInputKey === 'canonical_mapping') {
        observation.span.end = byteLength
      }
    }
  }
  const mappingBytes = new TextEncoder().encode(JSON.stringify(source))
  const continuationDocuments = continuation.request.evidence.documents.map(
    (document) => document.inputKey === 'canonical_mapping'
      ? { ...document, bytes: mappingBytes }
      : document,
  )
  const applicationDocuments = application.request.evidence.documents.filter(
    (document) => [
      'application_writing_capture',
      'application_writing_transcription',
    ].includes(document.inputKey),
  )
  const sourceAsset = continuationDocuments.find(
    (document) => document.inputKey === 'original_question_source',
  )?.bytes
  assert.ok(sourceAsset)
  return {
    paperId: 'paper-2026-i',
    sourceAsset,
    request: {
      authority: continuation.request.authority,
      evidence: {
        documents: [
          ...continuationDocuments,
          ...applicationDocuments,
        ],
      },
    },
  }
}

function makeIntegrityClosedZhejiangWritingFixture() {
  const continuation =
    makeContinuationWritingReferenceFixture('paper-zj-2020-jul')
  const groupIdsBySlot = {
    'reading.a': 'group-zj-2020-jul-reading-a',
    'reading.b': 'group-zj-2020-jul-reading-b',
    'reading.c': 'group-zj-2020-jul-reading-c',
    'reading.seven-choices': 'group-zj-2020-jul-seven-choices',
    'language.cloze': 'group-zj-2020-jul-cloze',
    'language.grammar-fill': 'group-zj-2020-jul-grammar-fill',
    'writing.application': 'group-zj-2020-jul-writing-application',
  }
  let sourceJson = JSON.stringify(continuation.source)
  for (const group of continuation.source.groups) {
    const realGroupId = groupIdsBySlot[group.slotId]
    assert.ok(realGroupId, `missing real Zhejiang Group for ${group.slotId}`)
    sourceJson = sourceJson.replaceAll(group.groupId, realGroupId)
  }
  const source = JSON.parse(sourceJson)
  for (let pass = 0; pass < 3; pass += 1) {
    const byteLength =
      new TextEncoder().encode(JSON.stringify(source)).byteLength
    for (const observation of source.observations) {
      if (observation.documentInputKey === 'canonical_mapping') {
        observation.span.end = byteLength
      }
    }
  }
  const mappingBytes = new TextEncoder().encode(JSON.stringify(source))
  const documents = continuation.request.evidence.documents.map(
    (document) => document.inputKey === 'canonical_mapping'
      ? { ...document, bytes: mappingBytes }
      : document,
  )
  const sourceAsset = documents.find(
    (document) => document.inputKey === 'original_question_source',
  )?.bytes
  assert.ok(sourceAsset)
  return {
    paperId: 'paper-zj-2020-jul',
    sourceAsset,
    request: {
      authority: continuation.request.authority,
      evidence: { documents },
    },
  }
}

async function loadIntegrityClosedWritingConsumptions(fixture) {
  const compilation = compileCanonicalPaper(fixture.request)
  assert.equal(compilation.disposition, 'ready')
  assert.deepEqual(
    compilation.artifacts.canonicalPaper.paperPlan.slotBindings
      .filter((binding) => binding.slotId.startsWith('writing.'))
      .map((binding) => ({
        slotId: binding.slotId,
        state: binding.state,
        groupId: binding.groupRef?.groupId,
      })),
    [
      {
        slotId: 'writing.application',
        state: 'bound',
        groupId: `group-${fixture.paperId.replace(/^paper-/, '')}-writing-application`,
      },
      {
        slotId: 'writing.continuation',
        state: 'bound',
        groupId: `group-${fixture.paperId.replace(/^paper-/, '')}-writing-continuation`,
      },
    ],
  )
  const rootDir = mkdtempSync(path.join(
    tmpdir(),
    'eqb-integrity-closed-writing-',
  ))
  const db = new DatabaseSync(path.join(rootDir, 'publication.sqlite'))
  try {
    assert.equal(
      publishCanonicalPaperPublication({
        rootDir,
        db,
        compilation,
        sourceAssetVersion: 1,
        sourceAsset: fixture.sourceAsset,
      }).status,
      'published',
    )
    const store = createFileSystemCanonicalPublicationStore({ rootDir, db })
    const consumptions = {}
    for (const [surface, consumerContract] of Object.entries({
      screen: consumerContractRefs.screen,
      printPdf: consumerContractRefs.print_pdf,
      docx: consumerContractRefs.docx,
    })) {
      const consumption = await loadPaperForConsumption({
        paperId: fixture.paperId,
        consumerContract,
      }, store)
      assert.equal(consumption.disposition, 'ready')
      for (const familyContractId of [
        'application-writing',
        'continuation-writing',
      ]) {
        const selection = consumption.selections.find(
          (candidate) =>
            candidate.familyContractId === familyContractId,
        )
        assert.equal(selection.mode, 'canonical')
        assert.equal(selection.groupIds.length, 1)
        assert.equal(selection.projectedOccurrences.length, 1)
      }
      consumptions[surface] = consumption
    }
    return consumptions
  } finally {
    db.close()
    rmSync(rootDir, { recursive: true, force: true })
  }
}

function applicationGroup(consumption) {
  const selection = consumption.selections.find(
    (candidate) => candidate.familyContractId === 'application-writing',
  )
  assert.equal(selection.mode, 'canonical')
  assert.equal(selection.groupIds.length, 1)
  return projectCanonicalConsumerGroup({
    consumption,
    familyContractId: 'application-writing',
    groupId: selection.groupIds[0],
  })
}

function continuationGroup(consumption) {
  const selection = consumption.selections.find(
    (candidate) => candidate.familyContractId === 'continuation-writing',
  )
  assert.equal(selection.mode, 'canonical')
  assert.equal(selection.groupIds.length, 1)
  return projectCanonicalConsumerGroup({
    consumption,
    familyContractId: 'continuation-writing',
    groupId: selection.groupIds[0],
  })
}

function poisonedApplicationExportItem(canonical) {
  return {
    detail: {
      id: canonical.groupId,
      paperId: canonical.paperId,
      title: 'POISONED LEGACY APPLICATION TITLE',
      source: 'POISONED LEGACY APPLICATION SOURCE',
      groupType: 'writing',
      passage: {
        title: 'POISONED LEGACY APPLICATION PASSAGE',
        materialText: 'POISONED LEGACY APPLICATION MATERIAL',
      },
      writingTask: {
        taskType: 'continuation',
        applicationGiven: {
          top: ['POISONED LEGACY APPLICATION TOP'],
          bottom: ['POISONED LEGACY APPLICATION BOTTOM'],
        },
      },
      analysis: {
        prompt: 'FORGED ANALYSIS APPLICATION PROMPT',
      },
      supplement: {
        prompt: 'FORGED SUPPLEMENT APPLICATION PROMPT',
      },
      questions: [],
    },
    score: 15,
    sectionTitle: 'POISONED LEGACY APPLICATION SECTION',
    note: 'POISONED LEGACY APPLICATION INSTRUCTION',
  }
}

function poisonedExportItem(canonical, legacyTaskVariant = 'poisoned') {
  const item = {
    detail: {
      id: canonical.groupId,
      paperId: canonical.paperId,
      title: 'POISONED LEGACY CONTINUATION TITLE',
      source: 'POISONED LEGACY CONTINUATION SOURCE',
      groupType: 'writing',
      passage: {
        title: 'POISONED LEGACY CONTINUATION PASSAGE',
        materialText:
          'POISONED LEGACY MATERIAL\nParagraph 1: INVENTED PREFIX\nParagraph 2: INVENTED PREFIX',
      },
      writingTask: {
        taskType: 'application',
        continuationStarters: [
          'POISONED LEGACY STARTER ONE',
          'POISONED LEGACY STARTER TWO',
          'POISONED LEGACY STARTER THREE',
        ],
      },
      analysis: {
        continuationStarters: ['FORGED ANALYSIS ONE', 'FORGED ANALYSIS TWO'],
        instructions: ['FORGED ANALYSIS INSTRUCTION'],
      },
      supplement: {
        continuationStarters: [
          'FORGED SUPPLEMENT ONE',
          'FORGED SUPPLEMENT TWO',
        ],
      },
      questions: [],
    },
    score: 25,
    sectionTitle: 'POISONED LEGACY CONTINUATION SECTION',
    note: 'POISONED LEGACY CONTINUATION INSTRUCTION',
  }
  if (legacyTaskVariant === 'absent') {
    delete item.detail.writingTask.taskType
  }
  return item
}

function bookmarkName(kind, value) {
  return `${kind}_${createHash('sha256').update(`${kind}:${value}`)
    .digest('hex').slice(0, 24)}`
}

function compactText(value) {
  return String(value).replaceAll(/\s/g, '')
}

function decodeXmlText(value) {
  return String(value)
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&')
}

function extractDocxVisibleParagraphText(documentXml) {
  return [...String(documentXml).matchAll(
    /<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g,
  )]
    .map((paragraphMatch) =>
      [...paragraphMatch[1].matchAll(
        /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g,
      )]
        .map((textMatch) => decodeXmlText(textMatch[1]))
        .join(''))
    .filter(Boolean)
    .join('\n')
}

function assertNck1WritingHeadingCounts(renderedText, label) {
  const compact = compactText(renderedText)
  for (const heading of Object.values(nck1WritingChrome)) {
    assert.equal(
      compact.split(compactText(heading)).length - 1,
      1,
      `${label} contains ${heading} exactly once`,
    )
  }
  assert.equal(
    compact.includes('POISONEDLEGACY'),
    false,
    `${label} rejects competing legacy writing chrome`,
  )
}

function assertNoRendererLocalWritingGroupHeading(renderedText, label) {
  const compact = compactText(renderedText)
  for (const heading of ['一、写作', '二、写作']) {
    assert.equal(
      compact.includes(heading),
      false,
      `${label} suppresses renderer-local ${heading} when canonical paperChrome is present`,
    )
  }
}

function countCompactText(renderedText, expectedText) {
  return compactText(renderedText)
    .split(compactText(expectedText)).length - 1
}

function assertZhejiangWholeWritingVisibleText(
  renderedText,
  application,
  continuation,
  label,
) {
  const compact = compactText(renderedText)
  for (const heading of ['Writing', 'Writing tasks']) {
    assert.equal(
      compact.split(compactText(heading)).length - 1,
      0,
      `${label} suppresses source-unproven ${heading}`,
    )
  }
  for (const block of [
    ...application.promptBlocks,
    ...continuation.materialBlocks,
  ]) {
    assert.equal(
      countCompactText(renderedText, block.text),
      1,
      `${label} contains ${block.nodeId} exactly once`,
    )
  }
  for (const poisonedText of [
    'POISONED LEGACY',
    'FORGED ANALYSIS',
    'FORGED SUPPLEMENT',
  ]) {
    assert.equal(
      compact.includes(compactText(poisonedText)),
      false,
      `${label} rejects ${poisonedText} as writing authority: ${
        renderedText.split('\n')
          .filter((line) => line.includes(poisonedText))
          .join(' | ')
      }`,
    )
  }
}

function assertZhejiangWholeWritingHtmlIdentity(
  html,
  application,
  continuation,
  label,
) {
  assertZhejiangWholeWritingVisibleText(
    html,
    application,
    continuation,
    label,
  )
  assert.equal(
    (html.match(/data-canonical-response-slot-id=/g) || []).length,
    2,
    `${label} contains two writing response regions`,
  )
  for (const canonical of [application, continuation]) {
    const attributePrefix =
      canonical.familyContractId === 'application-writing'
      ? 'data-canonical-application'
      : 'data-canonical-writing'
    assert.equal(
      (html.match(new RegExp(
        `data-canonical-response-slot-id="${canonical.answerRegion.responseSlotId}"`,
        'g',
      )) || []).length,
      1,
      `${label} contains ${canonical.answerRegion.responseSlotId} once`,
    )
    for (const [attribute, signature] of [
      [`${attributePrefix}-semantic-signature`, canonical.semanticSignature],
      [`${attributePrefix}-occurrence-signature`, canonical.occurrenceSignature],
    ]) {
      assert.equal(
        (html.match(new RegExp(`${attribute}="${signature}"`, 'g')) || [])
          .length,
        1,
        `${label} contains ${attribute} ${signature} once`,
      )
    }
  }
  assert.equal(
    (html.match(/data-canonical-instruction-id="/g) || []).length,
    0,
    `${label} contains no suppressed canonical chrome`,
  )
}

function assertZhejiangWholeWritingDocxIdentity(
  documentXml,
  application,
  continuation,
  label,
) {
  assertZhejiangWholeWritingVisibleText(
    extractDocxVisibleParagraphText(documentXml),
    application,
    continuation,
    label,
  )
  for (const canonical of [application, continuation]) {
    for (const [kind, value] of [
      ['canonical_response', canonical.answerRegion.responseSlotId],
      ['canonical_semantic', canonical.semanticSignature],
      ['canonical_occurrence', canonical.occurrenceSignature],
    ]) {
      const name = bookmarkName(kind, value)
      assert.equal(
        documentXml.split(name).length - 1,
        1,
        `${label} contains ${name} once`,
      )
    }
  }
  for (const instructionId of ['part.writing', 'section.writing']) {
    const name = bookmarkName('canonical_instruction', instructionId)
    assert.equal(
      documentXml.split(name).length - 1,
      0,
      `${label} omits suppressed chrome bookmark ${name}`,
    )
  }
}

function canonicalWritingChromeEntries(canonical) {
  return [
    [canonical.paperChrome.part, 'part_heading'],
    [canonical.paperChrome.section, 'section_heading'],
    ...canonical.paperChrome.instructions.map(
      (instruction) => [instruction, 'instruction'],
    ),
  ]
}

function assertCanonicalWritingChromeTextLines(renderedText, canonical, label) {
  const lines = String(renderedText)
    .split(/\r?\n/)
    .map(compactText)
    .filter(Boolean)
  for (const [instruction] of canonicalWritingChromeEntries(canonical)) {
    assert.equal(
      lines.filter((line) => line === compactText(instruction.text)).length,
      instruction.renderPolicy === 'render' ? 1 : 0,
      `${label} follows canonical paperChrome render policy for ${instruction.instructionId}`,
    )
  }
}

function assertCanonicalWritingChromeBookmarks(documentXml, canonical, label) {
  for (const [instruction] of canonicalWritingChromeEntries(canonical)) {
    const name = bookmarkName(
      'canonical_instruction',
      instruction.instructionId,
    )
    assert.equal(
      documentXml.split(name).length - 1,
      instruction.renderPolicy === 'render' ? 1 : 0,
      `${label} follows canonical paperChrome bookmark policy for ${instruction.instructionId}`,
    )
  }
}

function assertCanonicalWritingChromeHtmlStructure(html, canonical, label) {
  assert.equal(
    (html.match(/<div class="paper-header">/g) || []).length,
    0,
    `${label} must not add a visible document title above complete canonical writing chrome`,
  )
  for (const [instruction, role] of canonicalWritingChromeEntries(canonical)) {
    assert.equal(
      html.includes(
        `data-canonical-instruction-id="${instruction.instructionId}" data-canonical-writing-chrome-role="${role}"`,
      ),
      instruction.renderPolicy === 'render',
      `${label} follows canonical ${role} policy for ${instruction.instructionId}`,
    )
  }
}

function bookmarkedDocxParagraph(documentXml, instructionId) {
  const name = bookmarkName('canonical_instruction', instructionId)
  const start = documentXml.indexOf(`w:name="${name}"`)
  assert.notEqual(start, -1, `missing DOCX bookmark ${name}`)
  const paragraphStart = documentXml.indexOf('<w:p>', start)
  const paragraphEnd = documentXml.indexOf('</w:p>', paragraphStart)
  assert.notEqual(paragraphStart, -1, `missing DOCX paragraph for ${name}`)
  assert.notEqual(paragraphEnd, -1, `unterminated DOCX paragraph for ${name}`)
  return documentXml.slice(paragraphStart, paragraphEnd + '</w:p>'.length)
}

function assertCanonicalWritingChromeDocxStructure(
  documentXml,
  canonical,
  label,
) {
  const visibleLines = extractDocxVisibleParagraphText(documentXml)
    .split(/\r?\n/)
  assert.equal(
    visibleLines.includes(`Continuation ${label.split('/')[0]}`),
    false,
    `${label} must not add a visible document title above complete canonical writing chrome`,
  )
  assertCanonicalWritingChromeBookmarks(documentXml, canonical, label)
  if (
    canonical.paperChrome.part.renderPolicy === 'suppress'
    && canonical.paperChrome.section.renderPolicy === 'suppress'
  ) return
  const partParagraph = bookmarkedDocxParagraph(
    documentXml,
    canonical.paperChrome.part.instructionId,
  )
  assert.equal(partParagraph.includes('w:ascii="Arial"'), true)
  assert.equal(partParagraph.includes('w:eastAsia="黑体"'), true)
  assert.equal(partParagraph.includes('<w:b/>'), true)
  assert.equal(partParagraph.includes('<w:sz w:val="21"/>'), true)
  assert.equal(partParagraph.includes('<w:spacing w:after="240"/>'), true)
  assert.equal(partParagraph.includes('<w:ind'), false)

  const sectionParagraph = bookmarkedDocxParagraph(
    documentXml,
    canonical.paperChrome.section.instructionId,
  )
  assert.equal(sectionParagraph.includes('w:ascii="Times New Roman"'), true)
  assert.equal(sectionParagraph.includes('<w:b/>'), false)
  assert.equal(sectionParagraph.includes('<w:sz w:val="21"/>'), true)
  assert.equal(sectionParagraph.includes('<w:spacing w:after="180"/>'), true)
  assert.equal(sectionParagraph.includes('<w:ind w:left="420"/>'), true)
}

function extractPdfLines(pdfPath) {
  const xml = execFileSync(
    'pdftotext',
    ['-bbox-layout', pdfPath, '-'],
    { encoding: 'utf8' },
  )
  const matches = [...xml.matchAll(
    /<line xMin="([^"]+)" yMin="([^"]+)" xMax="([^"]+)" yMax="([^"]+)">([\s\S]*?)<\/line>/g,
  )]
  return matches.map((match) => {
    const words = [...match[5].matchAll(
      /<word xMin="([^"]+)" yMin="([^"]+)" xMax="([^"]+)" yMax="([^"]+)">([\s\S]*?)<\/word>/g,
    )].map((wordMatch) => ({
      xMin: Number(wordMatch[1]),
      yMin: Number(wordMatch[2]),
      xMax: Number(wordMatch[3]),
      yMax: Number(wordMatch[4]),
      text: decodeXmlText(wordMatch[5]),
    }))
    return {
      xMin: Number(match[1]),
      yMin: Number(match[2]),
      xMax: Number(match[3]),
      yMax: Number(match[4]),
      text: words.map((word) => word.text).join(' '),
      words,
    }
  })
}

function extractPdfLineGeometry(pdfPath, text) {
  const found = extractPdfLines(pdfPath).filter(
    (line) => compactText(line.text) === compactText(text),
  )
  assert.equal(found.length, 1, `${pdfPath} contains one visible line "${text}"`)
  return found[0]
}

function parsePgm(buffer) {
  let offset = 0
  const nextToken = () => {
    while (offset < buffer.length) {
      const byte = buffer[offset]
      if (byte === 35) {
        while (offset < buffer.length && buffer[offset] !== 10) offset += 1
      } else if (byte <= 32) {
        offset += 1
      } else {
        break
      }
    }
    const start = offset
    while (offset < buffer.length && buffer[offset] > 32) offset += 1
    return buffer.subarray(start, offset).toString()
  }
  assert.equal(nextToken(), 'P5')
  const width = Number(nextToken())
  const height = Number(nextToken())
  assert.equal(Number(nextToken()), 255)
  while (offset < buffer.length && buffer[offset] <= 32) offset += 1
  const pixels = buffer.subarray(offset)
  assert.equal(pixels.length, width * height)
  return { width, height, pixels }
}

function rasterInkMetric(raster) {
  let xMin = raster.width
  let yMin = raster.height
  let xMax = -1
  let yMax = -1
  let weightedInk = 0
  for (let y = 0; y < raster.height; y += 1) {
    for (let x = 0; x < raster.width; x += 1) {
      const darkness = (255 - raster.pixels[y * raster.width + x]) / 255
      weightedInk += darkness
      if (darkness < 0.08) continue
      xMin = Math.min(xMin, x)
      yMin = Math.min(yMin, y)
      xMax = Math.max(xMax, x)
      yMax = Math.max(yMax, y)
    }
  }
  assert.notEqual(xMax, -1, 'raster crop contains visible ink')
  const inkWidth = xMax - xMin + 1
  const inkHeight = yMax - yMin + 1
  return {
    inkWidth,
    inkHeight,
    inkPerHeight: Math.round(weightedInk / inkHeight * 1000) / 1000,
  }
}

function cropPgm(raster, box) {
  const xMin = Math.max(0, Math.floor(box.xMin))
  const yMin = Math.max(0, Math.floor(box.yMin))
  const xMax = Math.min(raster.width, Math.ceil(box.xMax))
  const yMax = Math.min(raster.height, Math.ceil(box.yMax))
  const width = xMax - xMin
  const height = yMax - yMin
  assert.ok(width > 0 && height > 0)
  const pixels = Buffer.alloc(width * height)
  for (let y = 0; y < height; y += 1) {
    raster.pixels.copy(
      pixels,
      y * width,
      (yMin + y) * raster.width + xMin,
      (yMin + y) * raster.width + xMax,
    )
  }
  return { width, height, pixels }
}

function pdfWritingChromeInk(pdfPath, canonical) {
  const root = mkdtempSync(path.join(tmpdir(), 'eqb-writing-ink-pdf-'))
  try {
    const prefix = path.join(root, 'page')
    execFileSync('pdftoppm', [
      '-f', '1',
      '-l', '1',
      '-r', '192',
      '-gray',
      '-singlefile',
      pdfPath,
      prefix,
    ])
    const page = parsePgm(readFileSync(`${prefix}.pgm`))
    const scale = 192 / 72
    const measure = (lineText) => {
      const line = extractPdfLineGeometry(pdfPath, lineText)
      return rasterInkMetric(cropPgm(page, {
        xMin: line.xMin * scale - 3,
        yMin: line.yMin * scale - 3,
        xMax: line.xMax * scale + 3,
        yMax: line.yMax * scale + 3,
      }))
    }
    return {
      part: measure(canonical.paperChrome.part.text),
      section: measure(canonical.paperChrome.section.text),
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

function pgmFromPng(png) {
  return parsePgm(execFileSync('ffmpeg', [
    '-hide_banner',
    '-loglevel', 'error',
    '-i', 'pipe:0',
    '-f', 'image2pipe',
    '-vcodec', 'pgm',
    'pipe:1',
  ], {
    input: png,
    maxBuffer: 10 * 1024 * 1024,
  }))
}

async function browserWritingChromeInk(page) {
  await page.evaluate(() => document.fonts.ready)
  const measure = async (role) => {
    const locator = page.locator(
      `[data-canonical-writing-chrome-role="${role}"]`,
    )
    const clip = await locator.evaluate((element) => {
      const text = element.firstChild
      if (!(text instanceof Text)) throw new Error('heading must own text')
      const range = document.createRange()
      range.setStart(text, 0)
      range.setEnd(text, text.length)
      const box = range.getBoundingClientRect()
      return {
        x: box.x - 2,
        y: box.y - 2,
        width: box.width + 4,
        height: box.height + 4,
      }
    })
    const png = await page.screenshot({ clip })
    return rasterInkMetric(pgmFromPng(png))
  }
  return {
    part: await measure('part_heading'),
    section: await measure('section_heading'),
  }
}

function assertWritingChromeRasterParity(metricsByChannel, label) {
  const entries = [...metricsByChannel.entries()]
  assert.deepEqual(
    entries.map(([channel]) => channel).sort(),
    ['docx-pdf', 'print-pdf', 'screen'],
    `${label} has all final-raster channels`,
  )
  for (const [channel, metrics] of entries) {
    for (const role of ['part', 'section']) {
      assert.ok(
        metrics[role].inkWidth > 0
          && metrics[role].inkHeight > 0
          && metrics[role].inkPerHeight > 0,
        `${label}/${channel} ${role} remains visible in the final raster`,
      )
    }
  }
  for (const role of ['part', 'section']) {
    const values = entries.map(
      ([, metrics]) =>
        metrics[role].inkWidth / metrics[role].inkHeight,
    )
    assert.ok(
      Math.max(...values) / Math.min(...values) <= 1.15,
      `${label} ${role} aspect ratio is materially consistent across final rasters: ${
        JSON.stringify(Object.fromEntries(entries))
      }`,
    )
  }
}

function assertCanonicalWritingChromePdfGeometry(pdfPath, canonical, label) {
  const part = extractPdfLineGeometry(pdfPath, canonical.paperChrome.part.text)
  const section = extractPdfLineGeometry(
    pdfPath,
    canonical.paperChrome.section.text,
  )
  assert.ok(
    Math.abs((section.xMin - part.xMin) - 21) <= 1,
    `${label} section heading keeps the canonical 2em/21pt indent`,
  )
  assert.ok(
    section.yMin - part.yMin >= 21
      && section.yMin - part.yMin <= 28,
    `${label} keeps the canonical part-to-section vertical rhythm`,
  )
  assert.ok(
    Math.abs((part.yMax - part.yMin) - (section.yMax - section.yMin)) <= 4.5,
    `${label} keeps part and section headings at the same 10.5pt tier`,
  )
}

async function canonicalWritingChromeBrowserLayout(page) {
  return page.locator('[data-canonical-writing-chrome-role]').evaluateAll(
    (elements) => {
      const metrics = elements.map((element) => {
        const style = getComputedStyle(element)
        const box = element.getBoundingClientRect()
        return {
          role: element.getAttribute('data-canonical-writing-chrome-role'),
          instructionId: element.getAttribute('data-canonical-instruction-id'),
          fontSizePt: Math.round(Number.parseFloat(style.fontSize) * 7.5) / 10,
          fontWeight: Number(style.fontWeight),
          fontFamily: style.fontFamily,
          x: box.x,
          y: box.y,
          height: box.height,
        }
      })
      const part = metrics.find((metric) => metric.role === 'part_heading')
      const section = metrics.find(
        (metric) => metric.role === 'section_heading',
      )
      return {
        roles: metrics.map((metric) => ({
          role: metric.role,
          instructionId: metric.instructionId,
          fontSizePt: metric.fontSizePt,
          fontWeight: metric.fontWeight,
          fontFamily: metric.fontFamily,
        })),
        sectionIndentPt:
          Math.round((section.x - part.x) * 7.5) / 10,
        partToSectionTopPt:
          Math.round((section.y - part.y) * 7.5) / 10,
      }
    },
  )
}

function assertVisibleCanonicalText(renderedText, canonical) {
  const compact = compactText(renderedText)
  assert.equal(compact.includes('POISONEDLEGACY'), false)
  assert.equal(compact.includes('FORGEDANALYSIS'), false)
  for (const block of canonical.materialBlocks) {
    assert.equal(
      compact.split(compactText(block.text)).length - 1,
      1,
      `material ${block.nodeId} must occur once`,
    )
  }
  for (const starter of canonical.answerRegion.starterLines) {
    assert.equal(
      compact.split(compactText(starter.text)).length - 1,
      1,
      `starter ${starter.starterId} must occur once`,
    )
  }
}

function assertPollutedProofBlocked() {
  const fixture = makeContinuationWritingReferenceFixture('paper-2026-i')
  const request = structuredClone(fixture.request)
  const captureDocument = request.evidence.documents.find(
    (document) => document.inputKey === 'continuation_writing_capture',
  )
  captureDocument.bytes = new TextEncoder().encode(
    JSON.stringify(makePollutedContinuationCapture()),
  )
  const blocked = compileCanonicalPaper(request)
  assert.notEqual(blocked.disposition, 'ready')
  assert.equal(Object.hasOwn(blocked.artifacts, 'canonicalPaper'), false)
}

const cases = []
const writingChromeRasterMetrics = new Map()

function recordWritingChromeRasterMetric(
  label,
  versionType,
  channel,
  metrics,
) {
  if (label !== 'two-starter') return
  const key = `${label}/${versionType}`
  const channels = writingChromeRasterMetrics.get(key) || new Map()
  channels.set(channel, metrics)
  writingChromeRasterMetrics.set(key, channels)
}

assertNck1WritingAuthority()
assertZhejiangWritingChromeAuthority()
for (const paperId of ['paper-2026-i', 'paper-zj-2020-jul']) {
  const consumption = readyConsumption(paperId)
  const selection = consumption.selections[0]
  const canonical = continuationGroup(consumption)
  assert.equal(canonical.groupType, 'continuation')
  assert.equal(canonical.questions.length, 0)
  assert.equal(canonical.wordCountRuling.countScope, 'student_authored_only')
  assert.equal(canonical.answerRegion.responseSlotId, 'writing.continuation')
  assert.equal(
    canonical.answerRegion.starterLines.length,
    paperId === 'paper-2026-i' ? 2 : 0,
  )
  if (paperId === 'paper-2026-i') {
    assert.equal(canonical.paperChrome.part.text, nck1WritingChrome.part)
    assert.equal(
      canonical.paperChrome.section.text,
      nck1WritingChrome.continuation,
    )
  }
  const surface =
    buildCanonicalContinuationWritingConsumptionSurfaceData({
      consumption,
      groupId: selection.groupIds[0],
    })
  assert.equal(surface.semanticDigest, canonical.semanticSignature)
  assert.equal(surface.occurrenceSignature, canonical.occurrenceSignature)
  assert.equal(
    surface.pageModel.blocks.filter((block) => block.kind === 'passage')
      .length,
    1,
  )
  assert.equal(
    surface.pageModel.blocks.filter((block) => block.kind === 'answerBox')
      .length,
    1,
  )
  if (paperId === 'paper-zj-2020-jul') {
    assert.equal(canonical.paperChrome.part.renderPolicy, 'suppress')
    assert.equal(canonical.paperChrome.section.renderPolicy, 'suppress')
    assert.equal(
      surface.pageModel.blocks.some(
        (block) =>
          block.kind === 'partHeading'
          || block.kind === 'sectionHeading',
      ),
      false,
      'source-unproven Zhejiang English writing chrome is suppressed at the canonical Screen seam',
    )
  }
  cases.push({
    label: paperId === 'paper-2026-i' ? 'two-starter' : 'zero-starter',
    consumption,
    canonical,
    surface,
  })
}

assertPollutedProofBlocked()

const zhejiangWholeWritingConsumption =
  readyWholeWritingConsumption('paper-zj-2020-jul')
const zhejiangWholeWritingGroupIds =
  zhejiangWholeWritingConsumption.selections.flatMap(
    (selection) => selection.groupIds,
  )
for (const groupId of zhejiangWholeWritingGroupIds) {
  assert.deepEqual(
    projectCanonicalWritingChrome({
      consumption: zhejiangWholeWritingConsumption,
      groupId,
      renderedGroupIds: zhejiangWholeWritingGroupIds,
    }),
    {
      part: null,
      section: null,
      instructions: [],
    },
    `complete Zhejiang v3 whole-writing chrome is suppressed for ${groupId}`,
  )
}
assert.throws(
  () => projectCanonicalWritingChrome({
    consumption: zhejiangWholeWritingConsumption,
    groupId: zhejiangWholeWritingGroupIds[0],
    renderedGroupIds: [...zhejiangWholeWritingGroupIds].reverse(),
  }),
  /Rendered canonical writing Group order is invalid/,
)
{
  const renderedChromeConsumption =
    structuredClone(zhejiangWholeWritingConsumption)
  for (const selection of renderedChromeConsumption.selections) {
    const occurrence = selection.projectedOccurrences[0]
    occurrence.paperChrome.part.renderPolicy = 'render'
    occurrence.paperChrome.section.renderPolicy = 'render'
  }
  const firstChrome = projectCanonicalWritingChrome({
    consumption: renderedChromeConsumption,
    groupId: zhejiangWholeWritingGroupIds[0],
    renderedGroupIds: zhejiangWholeWritingGroupIds,
  })
  assert.equal(firstChrome.part?.instructionId, 'part.writing')
  assert.equal(firstChrome.section?.instructionId, 'section.writing')
  const secondChrome = projectCanonicalWritingChrome({
    consumption: renderedChromeConsumption,
    groupId: zhejiangWholeWritingGroupIds[1],
    renderedGroupIds: zhejiangWholeWritingGroupIds,
  })
  assert.equal(secondChrome.part, null)
  assert.equal(secondChrome.section, null)
}
{
  const inconsistentConsumption =
    structuredClone(zhejiangWholeWritingConsumption)
  inconsistentConsumption.selections[1].projectedOccurrences[0]
    .paperChrome.part.text = 'POISONED INCONSISTENT PART'
  assert.throws(
    () => projectCanonicalWritingChrome({
      consumption: inconsistentConsumption,
      groupId: zhejiangWholeWritingGroupIds[0],
      renderedGroupIds: zhejiangWholeWritingGroupIds,
    }),
    /Canonical writing part writing is inconsistent/,
  )
}
{
  const inconsistentConsumption =
    structuredClone(zhejiangWholeWritingConsumption)
  inconsistentConsumption.selections[1].projectedOccurrences[0]
    .paperChrome.section.text = 'POISONED INCONSISTENT SECTION'
  assert.throws(
    () => projectCanonicalWritingChrome({
      consumption: inconsistentConsumption,
      groupId: zhejiangWholeWritingGroupIds[0],
      renderedGroupIds: zhejiangWholeWritingGroupIds,
    }),
    /Canonical writing section writing\.tasks is inconsistent/,
  )
}

const mixedWritingConsumptions =
  await loadIntegrityClosedWritingConsumptions(
    makeIntegrityClosedNck1WritingFixture(),
  )
const mixedApplication = applicationGroup(mixedWritingConsumptions.screen)
const mixedContinuation = continuationGroup(mixedWritingConsumptions.screen)
const zhejiangWritingConsumptions =
  await loadIntegrityClosedWritingConsumptions(
    makeIntegrityClosedZhejiangWritingFixture(),
  )
const zhejiangApplication = applicationGroup(
  zhejiangWritingConsumptions.screen,
)
const zhejiangContinuation = continuationGroup(
  zhejiangWritingConsumptions.screen,
)
const zhejiangWritingGroupIds = [
  zhejiangApplication.groupId,
  zhejiangContinuation.groupId,
]
for (const groupId of zhejiangWritingGroupIds) {
  assert.deepEqual(
    projectCanonicalWritingChrome({
      consumption: zhejiangWritingConsumptions.screen,
      groupId,
      renderedGroupIds: zhejiangWritingGroupIds,
    }),
    { part: null, section: null, instructions: [] },
  )
}
const mixedWritingBaseArgs = {
  title: 'NCK1 whole writing chrome regression',
  versionType: 'student',
  printStyle: 'exam',
  items: [
    poisonedApplicationExportItem(mixedApplication),
    poisonedExportItem(mixedContinuation),
  ],
  blocks: [
    {
      type: 'question_group',
      questionGroupId: mixedApplication.groupId,
      score: 15,
    },
    {
      type: 'question_group',
      questionGroupId: mixedContinuation.groupId,
      score: 25,
    },
  ],
  questionNumberStart: 1,
}
const zhejiangWritingBaseArgs = {
  title: 'Zhejiang v3 whole writing regression',
  versionType: 'student',
  printStyle: 'exam',
  items: [
    poisonedApplicationExportItem(zhejiangApplication),
    poisonedExportItem(zhejiangContinuation),
  ],
  blocks: [
    {
      type: 'question_group',
      questionGroupId: zhejiangApplication.groupId,
      score: 15,
    },
    {
      type: 'question_group',
      questionGroupId: zhejiangContinuation.groupId,
      score: 25,
    },
  ],
  questionNumberStart: 1,
}
const legacyWritingBaseArgs = {
  title: 'Legacy writing group heading regression',
  versionType: 'student',
  printStyle: 'exam',
  items: [poisonedExportItem(mixedContinuation)],
  blocks: [{
    type: 'question_group',
    questionGroupId: mixedContinuation.groupId,
    score: 25,
  }],
  questionNumberStart: 1,
}
const legacyPrintHtml = buildPrintHtml(legacyWritingBaseArgs)
assert.equal(
  compactText(legacyPrintHtml).includes('一、写作（每题25分）'),
  true,
  'legacy Print HTML preserves its renderer-local writing group heading',
)
const legacyDocxXml = docxRenderer.buildDocumentXml(legacyWritingBaseArgs)
assert.equal(
  compactText(legacyDocxXml).includes('一、写作（每题25分）'),
  true,
  'legacy DOCX preserves its renderer-local writing group heading',
)
const mixedPrintHtml = buildPrintHtml({
  ...mixedWritingBaseArgs,
  canonicalConsumption: mixedWritingConsumptions.printPdf,
})
assertNck1WritingHeadingCounts(mixedPrintHtml, 'whole-paper Print HTML')
assertNoRendererLocalWritingGroupHeading(
  mixedPrintHtml,
  'whole-paper Print HTML',
)
if (persistActualArtifacts) {
  writeFileSync(
    path.join(actualArtifactRoot, 'print-whole-writing-student.html'),
    mixedPrintHtml,
  )
}
const mixedDocxXml = docxRenderer.buildDocumentXml({
  ...mixedWritingBaseArgs,
  canonicalConsumption: mixedWritingConsumptions.docx,
})
assertNck1WritingHeadingCounts(mixedDocxXml, 'whole-paper DOCX OOXML')
assertNoRendererLocalWritingGroupHeading(
  mixedDocxXml,
  'whole-paper DOCX OOXML',
)
{
  const root = mkdtempSync(path.join(tmpdir(), 'eqb-writing-chrome-docx-'))
  try {
    const docxPath = path.join(root, 'whole-writing.docx')
    const pdfPath = path.join(root, 'whole-writing-converted.pdf')
    docxRenderer.writeDocxPackage({
      documentXml: mixedDocxXml,
      outputPath: docxPath,
      title: mixedWritingBaseArgs.title,
    })
    const packagedXml = execFileSync(
      'unzip',
      ['-p', docxPath, 'word/document.xml'],
      { encoding: 'utf8' },
    )
    assertNck1WritingHeadingCounts(packagedXml, 'packaged DOCX OOXML')
    assertNoRendererLocalWritingGroupHeading(
      packagedXml,
      'packaged DOCX OOXML',
    )
    docxRenderer.convertDocxToPdf(docxPath, pdfPath)
    const convertedText = execFileSync(
      'pdftotext',
      ['-layout', pdfPath, '-'],
      { encoding: 'utf8' },
    )
    assertNck1WritingHeadingCounts(convertedText, 'DOCX-to-PDF')
    assertNoRendererLocalWritingGroupHeading(
      convertedText,
      'DOCX-to-PDF',
    )
    if (persistActualArtifacts) {
      copyFileSync(
        docxPath,
        path.join(actualArtifactRoot, 'docx-whole-writing-student.docx'),
      )
      copyFileSync(
        pdfPath,
        path.join(
          actualArtifactRoot,
          'docx-whole-writing-student-converted.pdf',
        ),
      )
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

const zhejiangPrintHtml = buildPrintHtml({
  ...zhejiangWritingBaseArgs,
  canonicalConsumption: zhejiangWritingConsumptions.printPdf,
})
assertZhejiangWholeWritingHtmlIdentity(
  zhejiangPrintHtml,
  zhejiangApplication,
  zhejiangContinuation,
  'complete Zhejiang v3 Print HTML',
)
if (persistActualArtifacts) {
  writeFileSync(
    path.join(actualArtifactRoot, 'print-zhejiang-whole-writing-student.html'),
    zhejiangPrintHtml,
  )
}
const zhejiangDocxXml = docxRenderer.buildDocumentXml({
  ...zhejiangWritingBaseArgs,
  canonicalConsumption: zhejiangWritingConsumptions.docx,
})
assertZhejiangWholeWritingDocxIdentity(
  zhejiangDocxXml,
  zhejiangApplication,
  zhejiangContinuation,
  'complete Zhejiang v3 DOCX OOXML',
)
{
  const root = mkdtempSync(path.join(
    tmpdir(),
    'eqb-zhejiang-writing-chrome-docx-',
  ))
  try {
    const docxPath = path.join(root, 'zhejiang-whole-writing.docx')
    const pdfPath = path.join(root, 'zhejiang-whole-writing-converted.pdf')
    docxRenderer.writeDocxPackage({
      documentXml: zhejiangDocxXml,
      outputPath: docxPath,
      title: zhejiangWritingBaseArgs.title,
    })
    const packagedXml = execFileSync(
      'unzip',
      ['-p', docxPath, 'word/document.xml'],
      { encoding: 'utf8' },
    )
    assertZhejiangWholeWritingDocxIdentity(
      packagedXml,
      zhejiangApplication,
      zhejiangContinuation,
      'complete Zhejiang v3 packaged DOCX OOXML',
    )
    docxRenderer.convertDocxToPdf(docxPath, pdfPath)
    const convertedText = execFileSync(
      'pdftotext',
      ['-layout', pdfPath, '-'],
      { encoding: 'utf8' },
    )
    assertZhejiangWholeWritingVisibleText(
      convertedText,
      zhejiangApplication,
      zhejiangContinuation,
      'complete Zhejiang v3 DOCX-to-PDF',
    )
    if (persistActualArtifacts) {
      copyFileSync(
        docxPath,
        path.join(
          actualArtifactRoot,
          'docx-zhejiang-whole-writing-student.docx',
        ),
      )
      copyFileSync(
        pdfPath,
        path.join(
          actualArtifactRoot,
          'docx-zhejiang-whole-writing-student-converted.pdf',
        ),
      )
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

const printArtifacts = []
for (const { label, consumption, canonical } of cases) {
  for (const versionType of ['student', 'teacher']) {
    const html = buildPrintHtml({
      title: `Continuation ${label}`,
      versionType,
      printStyle: 'exam',
      items: [poisonedExportItem(
        canonical,
        label === 'two-starter' ? 'absent' : 'poisoned',
      )],
      blocks: [{
        type: 'question_group',
        questionGroupId: canonical.groupId,
        score: 25,
      }],
      questionNumberStart: 1,
      canonicalConsumption: consumption,
    })
    assert.equal(
      (html.match(/data-canonical-writing-semantic-signature=/g) || [])
        .length,
      1,
    )
    assert.equal(
      html.includes(
        `data-canonical-writing-semantic-signature="${canonical.semanticSignature}"`,
      ),
      true,
    )
    assert.equal(
      (html.match(/data-canonical-writing-occurrence-signature=/g) || [])
        .length,
      1,
    )
    assert.equal(
      html.includes(
        `data-canonical-writing-occurrence-signature="${canonical.occurrenceSignature}"`,
      ),
      true,
    )
    assertCanonicalWritingChromeHtmlStructure(
      html,
      canonical,
      `Print HTML ${label}/${versionType}`,
    )
    assert.equal(
      (html.match(/data-canonical-response-slot-id=/g) || []).length,
      1,
    )
    assert.equal(
      (html.match(/data-canonical-starter-id=/g) || []).length,
      canonical.answerRegion.starterLines.length,
    )
    assert.equal(
      html.includes('data-canonical-word-count-scope="student_authored_only"'),
      true,
    )
    assertVisibleCanonicalText(html, canonical)
    assertNoRendererLocalWritingGroupHeading(
      html,
      `Print HTML ${label}/${versionType}`,
    )
    printArtifacts.push({ label, versionType, html, canonical })
    if (persistActualArtifacts) {
      writeFileSync(
        path.join(actualArtifactRoot, `print-${label}-${versionType}.html`),
        html,
      )
    }
  }
}

for (const { label, consumption, canonical } of cases) {
  for (const versionType of ['student', 'teacher']) {
    const xml = docxRenderer.buildDocumentXml({
      title: `Continuation ${label}`,
      versionType,
      printStyle: 'exam',
      items: [poisonedExportItem(
        canonical,
        label === 'two-starter' ? 'absent' : 'poisoned',
      )],
      blocks: [{
        type: 'question_group',
        questionGroupId: canonical.groupId,
        score: 25,
      }],
      questionNumberStart: 1,
      canonicalConsumption: consumption,
    })
    assertVisibleCanonicalText(xml, canonical)
    assertNoRendererLocalWritingGroupHeading(
      xml,
      `DOCX OOXML ${label}/${versionType}`,
    )
    assertCanonicalWritingChromeDocxStructure(
      xml,
      canonical,
      `${label}/${versionType}`,
    )
    assert.equal(
      xml.includes(bookmarkName(
        'canonical_semantic',
        canonical.semanticSignature,
      )),
      true,
    )
    assertCanonicalWritingChromeBookmarks(
      xml,
      canonical,
      `DOCX OOXML ${label}/${versionType}`,
    )
    assert.equal(
      xml.includes(bookmarkName(
        'canonical_occurrence',
        canonical.occurrenceSignature,
      )),
      true,
    )
    assert.equal(
      xml.includes(bookmarkName(
        'canonical_response',
        canonical.answerRegion.responseSlotId,
      )),
      true,
    )
    assert.equal(
      xml.includes(bookmarkName(
        'canonical_word_ruling',
        canonical.wordCountRuling.authorityObservationRef,
      )),
      true,
    )
    assert.equal(
      (xml.match(/<w:tbl>/g) || []).length,
      canonical.answerRegion.starterLines.length === 2 ? 2 : 1,
      'Continuation owns one outer response table and an optional nested starter layout table',
    )
    assert.equal(
      (xml.match(/<w:cantSplit\/>/g) || []).length,
      1,
      'Continuation response owns one indivisible outer DOCX row',
    )
    for (const starter of canonical.answerRegion.starterLines) {
      assert.equal(
        xml.includes(bookmarkName('canonical_starter', starter.starterId)),
        true,
      )
    }
    const docxRoot = mkdtempSync(path.join(tmpdir(), 'eqb-continuation-docx-'))
    try {
      const docxPath = path.join(docxRoot, `${label}-${versionType}.docx`)
      const pdfPath = path.join(
        docxRoot,
        `${label}-${versionType}-converted.pdf`,
      )
      docxRenderer.writeDocxPackage({
        documentXml: xml,
        outputPath: docxPath,
        title: `Continuation ${label}`,
      })
      const packagedXml = execFileSync(
        'unzip',
        ['-p', docxPath, 'word/document.xml'],
        { encoding: 'utf8' },
      )
      assertNoRendererLocalWritingGroupHeading(
        packagedXml,
        `packaged DOCX OOXML ${label}/${versionType}`,
      )
      assertCanonicalWritingChromeBookmarks(
        packagedXml,
        canonical,
        `packaged DOCX OOXML ${label}/${versionType}`,
      )
      assertCanonicalWritingChromeTextLines(
        extractDocxVisibleParagraphText(packagedXml),
        canonical,
        `packaged DOCX OOXML visible text ${label}/${versionType}`,
      )
      assert.equal(packagedXml, xml)
      docxRenderer.convertDocxToPdf(docxPath, pdfPath)
      assert.equal(readFileSync(pdfPath).subarray(0, 4).toString(), '%PDF')
      const convertedText = execFileSync(
        'pdftotext',
        ['-layout', pdfPath, '-'],
        { encoding: 'utf8' },
      )
      assertVisibleCanonicalText(convertedText, canonical)
      assertNoRendererLocalWritingGroupHeading(
        convertedText,
        `DOCX-to-PDF ${label}/${versionType}`,
      )
      assertCanonicalWritingChromeTextLines(
        convertedText,
        canonical,
        `DOCX-to-PDF ${label}/${versionType}`,
      )
      assert.equal(
        convertedText.includes(`Continuation ${label}`),
        false,
        `DOCX-to-PDF ${label}/${versionType} suppresses the non-canonical visible title`,
      )
      if (label === 'two-starter') {
        assertCanonicalWritingChromePdfGeometry(
          pdfPath,
          canonical,
          `DOCX-to-PDF ${label}/${versionType}`,
        )
        recordWritingChromeRasterMetric(
          label,
          versionType,
          'docx-pdf',
          pdfWritingChromeInk(pdfPath, canonical),
        )
      }
      if (persistActualArtifacts) {
        copyFileSync(
          docxPath,
          path.join(actualArtifactRoot, `docx-${label}-${versionType}.docx`),
        )
        copyFileSync(
          pdfPath,
          path.join(
            actualArtifactRoot,
            `docx-${label}-${versionType}-converted.pdf`,
          ),
        )
      }
    } finally {
      rmSync(docxRoot, { recursive: true, force: true })
    }
  }
}

{
  const { consumption, canonical } = cases.find(
    ({ label }) => label === 'two-starter',
  )
  const dummy = {
    detail: {
      id: 'dummy-writing-boundary-group',
      paperId: 'dummy-writing-boundary-paper',
      title: 'Application task',
      source: 'boundary fixture',
      groupType: 'writing',
      passage: {
        title: '',
        materialText:
          'Filler paragraph with enough words to occupy one ordinary line.',
      },
      questions: [],
    },
    score: 15,
    sectionTitle: '',
    note: '',
  }
  const boundaryArgs = {
    title: 'Continuation boundary probe',
    versionType: 'student',
    printStyle: 'exam',
    items: [dummy, poisonedExportItem(canonical, 'absent')],
    blocks: [
      {
        type: 'question_group',
        questionGroupId: dummy.detail.id,
        score: 15,
      },
      {
        type: 'question_group',
        questionGroupId: canonical.groupId,
        score: 25,
      },
    ],
    questionNumberStart: 1,
    canonicalConsumption: consumption,
  }
  const root = mkdtempSync(path.join(
    tmpdir(),
    'eqb-continuation-docx-boundary-',
  ))
  try {
    const docxPath = path.join(root, 'boundary.docx')
    const pdfPath = path.join(root, 'boundary.pdf')
    const xml = docxRenderer.buildDocumentXml(boundaryArgs)
    docxRenderer.writeDocxPackage({
      documentXml: xml,
      outputPath: docxPath,
      title: boundaryArgs.title,
    })
    docxRenderer.convertDocxToPdf(docxPath, pdfPath)
    const pages = execFileSync(
      'pdftotext',
      ['-layout', pdfPath, '-'],
      { encoding: 'utf8' },
    ).split('\f')
    const starterPages = canonical.answerRegion.starterLines.map(
      (starter) =>
        pages.findIndex((pageText) => pageText.includes(starter.text)) + 1,
    )
    assert.ok(
      starterPages.every((pageNumber) => pageNumber > 0),
      'DOCX boundary PDF contains both canonical starter lines',
    )
    assert.equal(
      new Set(starterPages).size,
      1,
      'DOCX boundary PDF keeps both starter lines in one unsplit response box/page',
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

async function assertBrowserArtifacts() {
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
  const screenChromeLayouts = new Map()
  try {
    {
      const asset = JSON.parse(readFileSync(
        new URL(
          '../app/public/paper-assets/paper-2026-i/latest/paper-asset.json',
          import.meta.url,
        ),
        'utf8',
      ))
      const writingPartIndex = asset.content.blocks.findIndex(
        (block) =>
          block.type === 'partHeading'
          && block.partId === 'part-2026-i-writing',
      )
      assert.notEqual(writingPartIndex, -1)
      asset.content.blocks = asset.content.blocks.map((block, index) => {
        if (index < writingPartIndex) return block
        if (block.type === 'partHeading') {
          return { ...block, text: 'POISONED LEGACY WRITING PART' }
        }
        if (block.type === 'sectionHeading') {
          return { ...block, text: 'POISONED LEGACY WRITING SECTION' }
        }
        if (block.type === 'instruction') {
          return { ...block, text: 'POISONED LEGACY WRITING INSTRUCTION' }
        }
        return block
      })
      let authRequestCount = 0
      const page = await browser.newPage({
        viewport: { width: 1280, height: 900 },
      })
      await page.route('**/api/auth/me', (route) => {
        authRequestCount += 1
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            authRequired: true,
            user: {
              id: 'ticket-13-writing-chrome-owner',
              username: 'ticket-13-writing-chrome-owner',
              role: 'owner',
            },
          }),
        })
      })
      await page.route('**/api/question-groups', (route) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ questionGroups: [] }),
      }))
      await page.route('**/api/ai/status', (route) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          serverKeyAvailable: false,
          dailyLimit: { limit: 0, used: 0, exceeded: false },
        }),
      }))
      await page.route(
        '**/api/paper-canonical/consumption?*',
        (route) => route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mixedWritingConsumptions.screen),
        }),
      )
      await page.route('**/paper-assets/**/paper-asset.json', (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(asset),
        }))
      await page.route('**/paper-assets/**/analyses/**', (route) =>
        route.fulfill({ status: 404, body: '' }))
      await page.route('**/paper-assets/**/figures/**', (route) =>
        route.fulfill({ status: 404, body: '' }))
      const url = new URL('index.html', appUrl)
      url.searchParams.set('view', 'paper-browse')
      url.searchParams.set('paperId', mixedWritingConsumptions.screen.paperId)
      url.searchParams.set('focusGroupId', mixedApplication.groupId)
      await page.goto(url.href)
      const mixedContinuationResponse = page.locator(
        `[data-canonical-response-slot-id="${mixedContinuation.answerRegion.responseSlotId}"]`,
      )
      try {
        await mixedContinuationResponse.waitFor({ timeout: 10_000 })
      } catch (error) {
        throw new Error(
          `Authenticated whole-paper Screen did not mount both writing sections: ${
            await page.locator('body').innerText()
          }`,
          { cause: error },
        )
      }
      assert.ok(authRequestCount > 0)
      const mixedWritingPages = page.locator('[data-pi-writing-page]')
      assert.equal(await mixedWritingPages.count(), 2)
      const mixedVisiblePageText = await page.locator('body').innerText()
      const mixedRailText = await page.locator('.paper-browse-rail').innerText()
      const mixedScreenText = (
        await mixedWritingPages.allInnerTexts()
      ).join('\n')
      if (mixedVisiblePageText.includes('POISONED LEGACY')) {
        throw new Error(
          `Authenticated whole-paper Screen exposed legacy chrome:\n${
            mixedVisiblePageText.split('\n')
              .filter((line) => line.includes('POISONED LEGACY'))
              .join('\n')
          }`,
        )
      }
      for (const expectedChrome of [
        '写作',
        '满分40分',
        nck1WritingChrome.application,
        nck1WritingChrome.continuation,
      ]) {
        assert.equal(
          countCompactText(mixedRailText, expectedChrome),
          1,
          `authenticated whole-paper Screen navigation contains canonical ${expectedChrome} exactly once`,
        )
      }
      assertNck1WritingHeadingCounts(
        mixedScreenText,
        'authenticated whole-paper Screen',
      )
      assertNoRendererLocalWritingGroupHeading(
        mixedScreenText,
        'authenticated whole-paper Screen',
      )
      if (persistActualArtifacts) {
        await page.screenshot({
          path: path.join(
            actualArtifactRoot,
            'screen-whole-writing-student.png',
          ),
          fullPage: true,
        })
      }
      await page.close()
    }

    {
      const asset = JSON.parse(readFileSync(
        new URL(
          '../app/public/paper-assets/paper-zj-2020-jul/latest/paper-asset.json',
          import.meta.url,
        ),
        'utf8',
      ))
      const writingPartIndex = asset.content.blocks.findIndex(
        (block) =>
          block.type === 'partHeading'
          && block.partId === 'part-zj-2020-jul-writing',
      )
      assert.notEqual(writingPartIndex, -1)
      asset.content.blocks = asset.content.blocks.map((block, index) => {
        if (index < writingPartIndex) return block
        if (block.type === 'partHeading') {
          return { ...block, text: 'POISONED LEGACY WRITING PART' }
        }
        if (block.type === 'sectionHeading') {
          return { ...block, text: 'POISONED LEGACY WRITING SECTION' }
        }
        if (block.type === 'instruction') {
          return { ...block, text: 'POISONED LEGACY WRITING INSTRUCTION' }
        }
        return block
      })
      for (const groupId of zhejiangWritingGroupIds) {
        const group = asset.content.groups[groupId]
        assert.ok(group)
        group.title = 'POISONED LEGACY WRITING TITLE'
        group.source = 'POISONED LEGACY WRITING SOURCE'
        group.passage.paragraphs = [{
          paragraphId: `poisoned:${groupId}`,
          text: 'POISONED LEGACY WRITING MATERIAL',
        }]
        const writingTask = asset.content.writingTasks[group.writingTaskId]
        assert.ok(writingTask)
        writingTask.applicationGiven = {
          top: ['POISONED LEGACY APPLICATION TOP'],
          bottom: ['POISONED LEGACY APPLICATION BOTTOM'],
        }
        writingTask.continuationStarters = [
          'POISONED LEGACY STARTER ONE',
          'POISONED LEGACY STARTER TWO',
          'POISONED LEGACY STARTER THREE',
        ]
      }
      let analysisRequestCount = 0
      const page = await browser.newPage({
        viewport: { width: 1280, height: 900 },
      })
      await page.route('**/api/auth/me', (route) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          authRequired: true,
          user: {
            id: 'ticket-13-zhejiang-owner',
            username: 'ticket-13-zhejiang-owner',
            role: 'owner',
          },
        }),
      }))
      await page.route('**/api/question-groups', (route) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ questionGroups: [] }),
      }))
      await page.route('**/api/ai/status', (route) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          serverKeyAvailable: false,
          dailyLimit: { limit: 0, used: 0, exceeded: false },
        }),
      }))
      await page.route(
        '**/api/paper-canonical/consumption?*',
        (route) => route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(zhejiangWritingConsumptions.screen),
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
          '/analyses/writing-analysis-v1.json',
        )) {
          analysisRequestCount += 1
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              schemaVersion: 'writing-analysis-v1',
              paperId: zhejiangWritingConsumptions.screen.paperId,
              groups: 'FORGED ANALYSIS INVALID GROUPS',
              supplement: 'FORGED SUPPLEMENT AUTHORITY',
            }),
          })
        }
        return route.fulfill({ status: 404, body: '' })
      })
      await page.route('**/paper-assets/**/figures/**', (route) =>
        route.fulfill({ status: 404, body: '' }))
      const url = new URL('index.html', appUrl)
      url.searchParams.set('view', 'paper-browse')
      url.searchParams.set(
        'paperId',
        zhejiangWritingConsumptions.screen.paperId,
      )
      url.searchParams.set('focusGroupId', zhejiangApplication.groupId)
      url.searchParams.set('lecture', '1')
      await page.goto(url.href)
      const continuationResponse = page.locator(
        `[data-canonical-response-slot-id="${zhejiangContinuation.answerRegion.responseSlotId}"]`,
      )
      await continuationResponse.waitFor({ timeout: 10_000 })
      await page.locator('.paper-browse-lecture-empty')
        .filter({ hasText: '解析未发布' })
        .waitFor({ timeout: 10_000 })
      assert.equal(analysisRequestCount, 1)
      const writingPages = page.locator('[data-pi-writing-page]')
      assert.equal(await writingPages.count(), 2)
      const writingText = (await writingPages.allInnerTexts()).join('\n')
      const visiblePageText = await page.locator('body').innerText()
      const railText = await page.locator('.paper-browse-rail').innerText()
      assertZhejiangWholeWritingVisibleText(
        visiblePageText,
        zhejiangApplication,
        zhejiangContinuation,
        'authenticated complete Zhejiang v3 Screen',
      )
      assertZhejiangWholeWritingVisibleText(
        railText,
        { promptBlocks: [] },
        { materialBlocks: [] },
        'authenticated complete Zhejiang v3 Screen navigation',
      )
      assert.equal(
        await writingPages.locator('[data-canonical-response-slot-id]')
          .count(),
        2,
      )
      for (const canonical of [
        zhejiangApplication,
        zhejiangContinuation,
      ]) {
        const response = writingPages.locator(
          `[data-canonical-response-slot-id="${canonical.answerRegion.responseSlotId}"]`,
        )
        assert.equal(await response.count(), 1)
        assert.equal(
          await response.getAttribute(
            'data-canonical-writing-semantic-signature',
          ),
          canonical.semanticSignature,
        )
        assert.equal(
          await response.getAttribute(
            'data-canonical-writing-occurrence-signature',
          ),
          canonical.occurrenceSignature,
        )
      }
      assert.equal(
        await writingPages.locator(
          '[data-canonical-writing-chrome-role]',
        ).count(),
        0,
      )
      await page.locator('.paper-browse-lecture-handle').click()
      await page.locator('.paper-browse-lecture-handle')
        .waitFor({ state: 'visible' })
      assert.equal(
        await page.locator('.paper-browse-lecture-handle')
          .getAttribute('aria-expanded'),
        'false',
      )
      if (persistActualArtifacts) {
        await page.screenshot({
          path: path.join(
            actualArtifactRoot,
            'screen-zhejiang-whole-writing-student.png',
          ),
          fullPage: true,
        })
      }
      await page.close()
    }

    {
      const page = await browser.newPage()
      await page.setContent(mixedPrintHtml, { waitUntil: 'load' })
      const root = mkdtempSync(path.join(tmpdir(), 'eqb-writing-chrome-pdf-'))
      try {
        const pdfPath = path.join(root, 'whole-writing.pdf')
        await page.pdf({
          path: pdfPath,
          format: 'A4',
          printBackground: true,
          preferCSSPageSize: true,
        })
        const pdfText = execFileSync(
          'pdftotext',
          ['-layout', pdfPath, '-'],
          { encoding: 'utf8' },
        )
        assertNck1WritingHeadingCounts(pdfText, 'whole-paper Print PDF')
        assertNoRendererLocalWritingGroupHeading(
          pdfText,
          'whole-paper Print PDF',
        )
        if (persistActualArtifacts) {
          copyFileSync(
            pdfPath,
            path.join(actualArtifactRoot, 'print-whole-writing-student.pdf'),
          )
        }
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
      await page.close()
    }

    {
      const page = await browser.newPage()
      await page.setContent(zhejiangPrintHtml, { waitUntil: 'load' })
      const root = mkdtempSync(path.join(
        tmpdir(),
        'eqb-zhejiang-writing-chrome-pdf-',
      ))
      try {
        const pdfPath = path.join(root, 'zhejiang-whole-writing.pdf')
        await page.pdf({
          path: pdfPath,
          format: 'A4',
          printBackground: true,
          preferCSSPageSize: true,
        })
        const pdfText = execFileSync(
          'pdftotext',
          ['-layout', pdfPath, '-'],
          { encoding: 'utf8' },
        )
        assertZhejiangWholeWritingVisibleText(
          pdfText,
          zhejiangApplication,
          zhejiangContinuation,
          'complete Zhejiang v3 Print PDF',
        )
        if (persistActualArtifacts) {
          copyFileSync(
            pdfPath,
            path.join(
              actualArtifactRoot,
              'print-zhejiang-whole-writing-student.pdf',
            ),
          )
        }
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
      await page.close()
    }

    for (const { label, consumption, canonical } of cases) {
      const signatures = []
      for (const teacher of [false, true]) {
        const page = await browser.newPage({
          viewport: { width: 1280, height: 900 },
          deviceScaleFactor: 2,
        })
        await page.route(
          '**/qa/canonical-continuation-writing-consumption.json',
          (route) => route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(consumption),
          }),
        )
        const url = new URL('canonical-continuation-writing-qa.html', appUrl)
        url.searchParams.set('groupId', canonical.groupId)
        if (teacher) url.searchParams.set('teacher', '1')
        await page.goto(url.href)
        const response = page.locator(
          `[data-canonical-response-slot-id="${canonical.answerRegion.responseSlotId}"]`,
        )
        await response.waitFor()
        assert.equal(await response.count(), 1)
        assert.equal(
          await response.getAttribute(
            'data-canonical-writing-semantic-signature',
          ),
          canonical.semanticSignature,
        )
        assert.equal(
          await response.getAttribute(
            'data-canonical-writing-occurrence-signature',
          ),
          canonical.occurrenceSignature,
        )
        assert.equal(
          await page.locator('[data-canonical-continuation-material]')
            .count(),
          1,
        )
        assert.equal(
          await page.locator('[data-canonical-starter-id]').count(),
          canonical.answerRegion.starterLines.length,
        )
        assert.deepEqual(
          await page.locator(
            '.pi-writing-part, .pi-writing-section, .pi-writing-instruction',
          ).allInnerTexts(),
          canonicalWritingChromeEntries(canonical)
            .filter(([instruction]) => instruction.renderPolicy === 'render')
            .map(([instruction]) => instruction.text),
        )
        if (label === 'two-starter') {
          const chromeLayout =
            await canonicalWritingChromeBrowserLayout(page)
          assert.equal(chromeLayout.sectionIndentPt, 21)
          assert.equal(chromeLayout.partToSectionTopPt, 27)
          assert.equal(chromeLayout.roles[0].fontSizePt, 10.5)
          assert.ok(chromeLayout.roles[0].fontWeight >= 700)
          assert.equal(chromeLayout.roles[1].fontSizePt, 10.5)
          assert.ok(chromeLayout.roles[1].fontWeight <= 400)
          screenChromeLayouts.set(
            `${label}/${teacher ? 'teacher' : 'student'}`,
            chromeLayout,
          )
          recordWritingChromeRasterMetric(
            label,
            teacher ? 'teacher' : 'student',
            'screen',
            await browserWritingChromeInk(page),
          )
        } else {
          assert.equal(
            await page.locator(
              '[data-canonical-writing-chrome-role]',
            ).count(),
            0,
          )
        }
        const bodyText = await page.locator('body').innerText()
        assertVisibleCanonicalText(bodyText, canonical)
        assert.equal(
          bodyText.includes('TEACHER SUPPLEMENT — not paper semantics'),
          teacher,
        )
        const box = await response.boundingBox()
        assert.ok(box)
        assert.ok(Math.abs(box.width - (145 / 25.4 * 96)) <= 1)
        assert.ok(Math.abs(box.height - (57 / 25.4 * 96)) <= 1)
        signatures.push({
          semantic: await response.getAttribute(
            'data-canonical-writing-semantic-signature',
          ),
          occurrence: await response.getAttribute(
            'data-canonical-writing-occurrence-signature',
          ),
          response: await response.getAttribute(
            'data-canonical-response-slot-id',
          ),
          width: box.width,
          height: box.height,
        })
        if (persistActualArtifacts) {
          await page.screenshot({
            path: path.join(
              actualArtifactRoot,
              `screen-${label}-${teacher ? 'teacher' : 'student'}.png`,
            ),
            fullPage: true,
          })
        }
        await page.close()
      }
      assert.deepEqual(signatures[0], signatures[1])
    }

    for (const { label, consumption, canonical } of cases) {
      const asset = JSON.parse(readFileSync(
        new URL(
          `../app/public/paper-assets/${consumption.paperId}/latest/paper-asset.json`,
          import.meta.url,
        ),
        'utf8',
      ))
      const legacyGroup = asset.content.groups[canonical.groupId]
      asset.content.blocks = asset.content.blocks.filter(
        (block) =>
          block.type === 'group'
          && block.groupId === canonical.groupId,
      )
      legacyGroup.passage.paragraphs = [{
        paragraphId: 'poisoned-legacy-continuation',
        text:
          'POISONED LEGACY MATERIAL Paragraph 1: INVENTED PREFIX Paragraph 2: INVENTED PREFIX',
      }]
      asset.content.writingTasks[legacyGroup.writingTaskId]
        .continuationStarters = [
          'POISONED LEGACY STARTER ONE',
          'POISONED LEGACY STARTER TWO',
          'POISONED LEGACY STARTER THREE',
        ]
      const legacyTask = asset.content.writingTasks[legacyGroup.writingTaskId]
      if (label === 'two-starter') delete legacyTask.taskType
      else legacyTask.taskType = 'application'

      const analysisVariants = [
        {
          label: 'valid',
          payload: {
            schemaVersion: 'writing-analysis-v1',
            paperId: consumption.paperId,
            groups: {
              [canonical.groupId]: {
                writing: {
                  taskType: 'continuation',
                  modelAnswer: 'FORGED ANALYSIS MODEL ANSWER',
                  continuationDesign: {
                    theme: 'FORGED ANALYSIS THEME',
                    paragraphs: [
                      'FORGED ANALYSIS PARAGRAPH ONE',
                      'FORGED ANALYSIS PARAGRAPH TWO',
                    ],
                  },
                  highlightExpressions: [{
                    text: 'FORGED ANALYSIS EXPRESSION',
                    note: 'FORGED ANALYSIS NOTE',
                  }],
                },
              },
            },
          },
        },
        {
          label: 'invalid',
          payload: {
            schemaVersion: 'writing-analysis-v1',
            paperId: consumption.paperId,
            groups: {
              [canonical.groupId]: {
                writing: {
                  taskType: 'continuation',
                  modelAnswer: null,
                  continuationDesign: {
                    theme: 'FORGED ANALYSIS INVALID THEME',
                    paragraphs: ['FORGED ANALYSIS ONLY ONE PARAGRAPH'],
                  },
                  highlightExpressions: 'FORGED ANALYSIS INVALID EXPRESSIONS',
                },
              },
            },
          },
        },
      ]
      const productionSignatures = []
      for (const analysisVariant of analysisVariants) {
        let authRequestCount = 0
        let businessStateRequestCount = 0
        let writingAnalysisRequestCount = 0
        let mainEntryRequested = false
        const page = await browser.newPage({
          viewport: { width: 1280, height: 900 },
        })
        page.on('request', (request) => {
          if (new URL(request.url()).pathname === '/src/main.tsx') {
            mainEntryRequested = true
          }
        })
        await page.route('**/api/auth/me', (route) => {
          authRequestCount += 1
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              authRequired: true,
              user: {
                id: 'ticket-13-owner',
                username: 'ticket-13-owner',
                role: 'owner',
              },
            }),
          })
        })
        await page.route('**/api/question-groups', (route) => {
          businessStateRequestCount += 1
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ questionGroups: [] }),
          })
        })
        await page.route('**/api/ai/status', (route) =>
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              serverKeyAvailable: false,
              dailyLimit: { limit: 0, used: 0, exceeded: false },
            }),
          }))
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
            '/analyses/writing-analysis-v1.json',
          )) {
            writingAnalysisRequestCount += 1
            return route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify(analysisVariant.payload),
            })
          }
          return route.fulfill({ status: 404, body: '' })
        })
        await page.route('**/paper-assets/**/figures/**', (route) =>
          route.fulfill({ status: 404, body: '' }))
        const url = new URL('index.html', appUrl)
        url.searchParams.set('view', 'paper-browse')
        url.searchParams.set('paperId', consumption.paperId)
        url.searchParams.set('focusGroupId', canonical.groupId)
        url.searchParams.set('lecture', '1')
        await page.goto(url.href)
        const response = page.locator(
          `[data-canonical-response-slot-id="${canonical.answerRegion.responseSlotId}"]`,
        )
        try {
          await response.waitFor({ timeout: 10_000 })
        } catch (error) {
          throw new Error(
            `PaperBrowse did not mount canonical Continuation Writing (${label}/${analysisVariant.label}): ${
              await page.locator('body').innerText()
            }`,
            { cause: error },
          )
        }
        assert.equal(
          new URL(page.url()).pathname,
          '/index.html',
          'production PaperBrowse proof enters through index.html',
        )
        assert.equal(
          new URL(page.url()).searchParams.get('view'),
          'paper-browse',
          'production App route selects ?view=paper-browse',
        )
        assert.equal(
          mainEntryRequested,
          true,
          'index.html loads the production main.tsx entry',
        )
        assert.ok(
          authRequestCount > 0,
          'production AuthGate requests authenticated session state',
        )
        assert.ok(
          businessStateRequestCount > 0,
          'production App requests prepared question-group business state',
        )
        await page.locator('.topbar-username')
          .filter({ hasText: 'ticket-13-owner' })
          .waitFor()
        const writingPage = response.locator(
          'xpath=ancestor::*[@data-pi-writing-page]',
        )
        if (analysisVariant.label === 'valid') {
          await page.getByText('FORGED ANALYSIS THEME', { exact: true })
            .waitFor()
        } else {
          await page.locator('.paper-browse-lecture-empty')
            .filter({ hasText: '解析未发布' })
            .waitFor()
        }
        assert.equal(
          writingAnalysisRequestCount,
          1,
          'PaperBrowse lecture route fetches the present Analysis exactly once',
        )
        assert.equal(await response.count(), 1)
        assert.equal(
          await writingPage.locator('[data-canonical-continuation-material]')
            .count(),
          1,
        )
        assert.equal(
          await writingPage.locator('[data-canonical-response-slot-id]')
            .count(),
          1,
        )
        assert.deepEqual(
          await writingPage.locator('[data-canonical-starter-id]')
            .allInnerTexts(),
          canonical.answerRegion.starterLines.map((starter) => starter.text),
        )
        assert.deepEqual(
          await writingPage.locator(
            '.pi-writing-part, .pi-writing-section, .pi-writing-instruction',
          ).allInnerTexts(),
          canonicalWritingChromeEntries(canonical)
            .filter(([instruction]) => instruction.renderPolicy === 'render')
            .map(([instruction]) => instruction.text),
        )
        assert.equal(
          await writingPage.locator('[data-writing-answer-supplement]').count(),
          0,
        )
        assertVisibleCanonicalText(await writingPage.innerText(), canonical)
        assertNoRendererLocalWritingGroupHeading(
          await writingPage.innerText(),
          `authenticated Screen ${label}/${analysisVariant.label}`,
        )
        productionSignatures.push({
          semantic: await response.getAttribute(
            'data-canonical-writing-semantic-signature',
          ),
          occurrence: await response.getAttribute(
            'data-canonical-writing-occurrence-signature',
          ),
        })
        await page.close()
      }
      assert.deepEqual(productionSignatures[0], productionSignatures[1])
      assert.deepEqual(productionSignatures[0], {
        semantic: canonical.semanticSignature,
        occurrence: canonical.occurrenceSignature,
      })
    }

    for (const { label, versionType, html, canonical } of printArtifacts) {
      const page = await browser.newPage()
      await page.setContent(html, { waitUntil: 'load' })
      const response = page.locator(
        `[data-canonical-response-slot-id="${canonical.answerRegion.responseSlotId}"]`,
      )
      assert.equal(await response.count(), 1)
      const box = await response.boundingBox()
      assert.ok(box)
      assert.ok(Math.abs(box.width - (145 / 25.4 * 96)) <= 1)
      assert.ok(Math.abs(box.height - (57 / 25.4 * 96)) <= 1)
      if (label === 'two-starter') {
        const chromeLayout =
          await canonicalWritingChromeBrowserLayout(page)
        assert.deepEqual(
          chromeLayout,
          screenChromeLayouts.get(`${label}/${versionType}`),
          `Print HTML ${label}/${versionType} matches Screen paperChrome roles and geometry`,
        )
      } else {
        assert.equal(
          await page.locator(
            '[data-canonical-writing-chrome-role]',
          ).count(),
          0,
        )
      }
      const pdfRoot = mkdtempSync(path.join(tmpdir(), 'eqb-continuation-pdf-'))
      try {
        const pdfPath = path.join(pdfRoot, `${label}-${versionType}.pdf`)
        await page.pdf({
          path: pdfPath,
          format: 'A4',
          printBackground: true,
          preferCSSPageSize: true,
        })
        assert.equal(readFileSync(pdfPath).subarray(0, 4).toString(), '%PDF')
        const pdfText = execFileSync(
          'pdftotext',
          ['-layout', pdfPath, '-'],
          { encoding: 'utf8' },
        )
        assertVisibleCanonicalText(pdfText, canonical)
        assertNoRendererLocalWritingGroupHeading(
          pdfText,
          `Print PDF ${label}/${versionType}`,
        )
        assertCanonicalWritingChromeTextLines(
          pdfText,
          canonical,
          `Print PDF ${label}/${versionType}`,
        )
        assert.equal(
          pdfText.includes(`Continuation ${label}`),
          false,
          `Print PDF ${label}/${versionType} suppresses the non-canonical visible title`,
        )
        if (label === 'two-starter') {
          assertCanonicalWritingChromePdfGeometry(
            pdfPath,
            canonical,
            `Print PDF ${label}/${versionType}`,
          )
          recordWritingChromeRasterMetric(
            label,
            versionType,
            'print-pdf',
            pdfWritingChromeInk(pdfPath, canonical),
          )
          assertWritingChromeRasterParity(
            writingChromeRasterMetrics.get(`${label}/${versionType}`),
            `${label}/${versionType}`,
          )
        }
        if (persistActualArtifacts) {
          copyFileSync(
            pdfPath,
            path.join(
              actualArtifactRoot,
              `print-${label}-${versionType}.pdf`,
            ),
          )
        }
      } finally {
        rmSync(pdfRoot, { recursive: true, force: true })
      }
      await page.close()
    }
  } finally {
    await browser.close()
    await viteServer.close()
  }
}

await assertBrowserArtifacts()

console.log(
  'paper canonical Continuation Writing rendered behavior verification passed',
)
