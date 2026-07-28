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

import {
  canonicalAuthorityRef,
  resolveCanonicalAuthority,
  validateAuthorityClosure,
} from '../shared/paper-canonical/authority.mjs'
import { compileCanonicalPaper } from '../shared/paper-canonical/compiler.mjs'
import {
  projectCanonicalConsumerGroup,
} from '../shared/paper-canonical/consumerProjection.mjs'
import { projectCanonicalPaper } from '../shared/paper-canonical/projector.mjs'
import { digestJson } from '../shared/paper-canonical/stable.mjs'
import {
  buildCanonicalContinuationWritingConsumptionSurfaceData,
} from '../shared/paper-normalization/canonicalPaperGroupSurfaceAdapter.mjs'
import { createDocxRenderer } from '../server/exports/docxRenderer.mjs'
import { buildPrintHtml } from '../server/print-renderer.mjs'
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

function projectWritingOccurrence(fixture, familyContractId) {
  const compilation = compileCanonicalPaper(fixture.request)
  assert.equal(compilation.disposition, 'ready')
  const projected = projectCanonicalPaper({
    plan: compilation.artifacts.canonicalPaper.paperPlan,
    groups: compilation.artifacts.canonicalPaper.questionGroups,
    sourceCapture: compilation.artifacts.sourceCapture,
  })
  const occurrences = projected.nodes.filter(
    (node) =>
      node.kind === 'group'
      && node.familyContractId === familyContractId,
  )
  assert.equal(occurrences.length, 1)
  return {
    profileRef: compilation.artifacts.canonicalPaper.paperPlan.profileRef,
    occurrence: occurrences[0],
  }
}

function readyMixedNck1WritingConsumption() {
  const application = projectWritingOccurrence(
    makeApplicationWritingReferenceFixture('paper-2026-i'),
    'application-writing',
  )
  const continuation = projectWritingOccurrence(
    makeContinuationWritingReferenceFixture('paper-2026-i'),
    'continuation-writing',
  )
  assert.deepEqual(application.profileRef, continuation.profileRef)
  return {
    disposition: 'ready',
    paperId: 'paper-2026-i',
    selections: [
      {
        mode: 'legacy',
        familyContractId: 'reading',
        groupIds: [
          'group-2026-i-reading-a',
          'group-2026-i-reading-b',
          'group-2026-i-reading-c',
          'group-2026-i-reading-d',
        ],
        projectedOccurrences: [],
      },
      {
        mode: 'legacy',
        familyContractId: 'seven-choices',
        groupIds: ['group-2026-i-seven-choices'],
        projectedOccurrences: [],
      },
      {
        mode: 'legacy',
        familyContractId: 'cloze',
        groupIds: ['group-2026-i-cloze'],
        projectedOccurrences: [],
      },
      {
        mode: 'legacy',
        familyContractId: 'grammar-fill',
        groupIds: ['group-2026-i-grammar-fill'],
        projectedOccurrences: [],
      },
      {
        mode: 'canonical',
        familyContractId: 'application-writing',
        groupIds: [application.occurrence.groupId],
        projectedOccurrences: [application.occurrence],
      },
      {
        mode: 'canonical',
        familyContractId: 'continuation-writing',
        groupIds: [continuation.occurrence.groupId],
        projectedOccurrences: [continuation.occurrence],
      },
    ],
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
assertNck1WritingAuthority()
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
  cases.push({
    label: paperId === 'paper-2026-i' ? 'two-starter' : 'zero-starter',
    consumption,
    canonical,
    surface,
  })
}

assertPollutedProofBlocked()

const mixedWritingConsumption = readyMixedNck1WritingConsumption()
const mixedApplication = applicationGroup(mixedWritingConsumption)
const mixedContinuation = continuationGroup(mixedWritingConsumption)
const mixedWritingArgs = {
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
  canonicalConsumption: mixedWritingConsumption,
}
const mixedPrintHtml = buildPrintHtml(mixedWritingArgs)
assertNck1WritingHeadingCounts(mixedPrintHtml, 'whole-paper Print HTML')
const mixedDocxXml = docxRenderer.buildDocumentXml(mixedWritingArgs)
assertNck1WritingHeadingCounts(mixedDocxXml, 'whole-paper DOCX OOXML')
{
  const root = mkdtempSync(path.join(tmpdir(), 'eqb-writing-chrome-docx-'))
  try {
    const docxPath = path.join(root, 'whole-writing.docx')
    const pdfPath = path.join(root, 'whole-writing-converted.pdf')
    docxRenderer.writeDocxPackage({
      documentXml: mixedDocxXml,
      outputPath: docxPath,
      title: mixedWritingArgs.title,
    })
    const packagedXml = execFileSync(
      'unzip',
      ['-p', docxPath, 'word/document.xml'],
      { encoding: 'utf8' },
    )
    assertNck1WritingHeadingCounts(packagedXml, 'packaged DOCX OOXML')
    docxRenderer.convertDocxToPdf(docxPath, pdfPath)
    const convertedText = execFileSync(
      'pdftotext',
      ['-layout', pdfPath, '-'],
      { encoding: 'utf8' },
    )
    assertNck1WritingHeadingCounts(convertedText, 'DOCX-to-PDF')
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
    for (const instruction of [
      canonical.paperChrome.part,
      canonical.paperChrome.section,
      ...canonical.paperChrome.instructions,
    ]) {
      assert.equal(
        (html.match(new RegExp(
          `data-canonical-instruction-id="${instruction.instructionId}"`,
          'g',
        )) || []).length,
        1,
      )
    }
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
    assert.equal(
      xml.includes(bookmarkName(
        'canonical_semantic',
        canonical.semanticSignature,
      )),
      true,
    )
    for (const instruction of [
      canonical.paperChrome.part,
      canonical.paperChrome.section,
      ...canonical.paperChrome.instructions,
    ]) {
      assert.equal(
        xml.includes(bookmarkName(
          'canonical_instruction',
          instruction.instructionId,
        )),
        true,
      )
    }
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
      assert.equal(packagedXml, xml)
      docxRenderer.convertDocxToPdf(docxPath, pdfPath)
      assert.equal(readFileSync(pdfPath).subarray(0, 4).toString(), '%PDF')
      const convertedText = execFileSync(
        'pdftotext',
        ['-layout', pdfPath, '-'],
        { encoding: 'utf8' },
      )
      assertVisibleCanonicalText(convertedText, canonical)
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
          body: JSON.stringify(mixedWritingConsumption),
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
      url.searchParams.set('paperId', mixedWritingConsumption.paperId)
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
      const mixedScreenText = (
        await mixedWritingPages.allInnerTexts()
      ).join('\n')
      if (mixedScreenText.includes('POISONED LEGACY')) {
        throw new Error(
          `Authenticated whole-paper Screen exposed legacy chrome:\n${
            mixedScreenText.split('\n')
              .filter((line) => line.includes('POISONED LEGACY'))
              .join('\n')
          }`,
        )
      }
      assertNck1WritingHeadingCounts(
        mixedScreenText,
        'authenticated whole-paper Screen',
      )
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

    for (const { label, consumption, canonical } of cases) {
      const signatures = []
      for (const teacher of [false, true]) {
        const page = await browser.newPage({
          viewport: { width: 1280, height: 900 },
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
          [
            canonical.paperChrome.part.text,
            canonical.paperChrome.section.text,
            ...canonical.paperChrome.instructions.map(
              (instruction) => instruction.text,
            ),
          ],
        )
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
          [
            canonical.paperChrome.part.text,
            canonical.paperChrome.section.text,
            ...canonical.paperChrome.instructions.map(
              (instruction) => instruction.text,
            ),
          ],
        )
        assert.equal(
          await writingPage.locator('[data-writing-answer-supplement]').count(),
          0,
        )
        assertVisibleCanonicalText(await writingPage.innerText(), canonical)
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
