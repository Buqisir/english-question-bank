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
import { continuationWritingRhythm } from '../shared/paper-canonical/continuationWritingRhythm.mjs'
import {
  paperTypographyRuntime,
  sectionHeadingRuntime,
} from '../shared/paper-canonical/sectionHeadingContract.mjs'
import { canonicalizeVisibleEnglishTypography } from '../shared/paper-canonical/visibleTypography.mjs'
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
import {
  makeReadyCanonicalFixture,
} from '../test-fixtures/paper-canonical/foundationFixture.mjs'

const persistActualArtifacts =
  process.env.EQB_PERSIST_ACTUAL_ARTIFACTS === '1'
const actualArtifactRoot = path.resolve(
  process.env.EQB_ACTUAL_ARTIFACT_ROOT
    || '.scratch/ticket-13-continuation-writing',
)
if (persistActualArtifacts) {
  mkdirSync(actualArtifactRoot, { recursive: true })
}
const nck1WritingChrome = Object.freeze({
  part: '第四部分 写作（共两节，满分40分）',
  application: '第一节 （满分 15 分）',
  continuation: '第二节 （满分 25 分）',
  continuationInstruction:
    '阅读下面材料，根据其内容和所给段落开头语续写两段话，使之构成一篇完整的短文。',
})
const zhejiangWritingChrome = Object.freeze({
  part: '第四部分 写作（共两节，满分40分）',
  application: '第一节 应用文写作（满分15分）',
  continuation: '第二节 读后续写（满分25分）',
})
const continuationSourceOracle = JSON.parse(readFileSync(
  new URL(
    `../${continuationWritingRhythm.publicArtifactOracle.path}`,
    import.meta.url,
  ),
  'utf8',
))
const continuationCoverageOracle = JSON.parse(readFileSync(
  new URL(
    `../${continuationWritingRhythm.observedCoverageOracle.path}`,
    import.meta.url,
  ),
  'utf8',
))
const executedCoverage = new Map(
  Object.keys(continuationCoverageOracle.requiredBundles)
    .map((bundle) => [bundle, new Map()]),
)

function sha256File(relativePath) {
  return createHash('sha256')
    .update(readFileSync(new URL(`../${relativePath}`, import.meta.url)))
    .digest('hex')
}

function observeCoverage(bundle, observations) {
  const observed = executedCoverage.get(bundle)
  assert.ok(observed, `unknown Continuation coverage bundle ${bundle}`)
  for (const observation of observations) {
    const edgeId = observation?.edgeId
    assert.equal(
      continuationCoverageOracle.requiredEdgeIds.includes(edgeId),
      true,
      `unknown Continuation coverage edge ${edgeId}`,
    )
    assert.equal(
      typeof observation?.witness?.kind === 'string',
      true,
      `${bundle}/${edgeId} coverage requires an actual public-seam witness`,
    )
    observed.set(edgeId, observation)
  }
}

function completedContinuationCoverageObservations(
  bundle,
  seamObservations,
  publicArtifactWitness,
) {
  const measuredByEdge = new Map(
    seamObservations.map((observation) => [
      observation.edgeId,
      observation,
    ]),
  )
  return continuationCoverageOracle.requiredBundles[bundle].map(
    (edgeId) =>
      measuredByEdge.get(edgeId) || {
        edgeId,
        witness: {
          kind: 'executed_public_seam_assertion',
          ...publicArtifactWitness,
        },
      },
  )
}

async function measureContinuationDomSeams(page, label, surface) {
  const lines = await page.locator(
    '.pi-writing-page--continuation '
      + '[data-canonical-writing-chrome-role="section_heading"], '
      + '.canonical-continuation-writing '
      + '[data-canonical-writing-chrome-role="section_heading"], '
      + '.pi-writing-page--continuation '
      + '[data-canonical-writing-chrome-role="instruction"], '
      + '.canonical-continuation-writing '
      + '[data-canonical-writing-chrome-role="instruction"], '
      + '.pi-writing-page--continuation .pi-writing-passage, '
      + '.canonical-continuation-writing .canonical-continuation-material',
  ).evaluateAll((elements) => {
    const visibleLine = (element) => {
      const walker = document.createTreeWalker(
        element,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: (node) => node.textContent?.trim()
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_REJECT,
        },
      )
      const rects = []
      let textNode = walker.nextNode()
      while (textNode) {
        const range = document.createRange()
        range.selectNodeContents(textNode)
        rects.push(
          ...[...range.getClientRects()].filter(
            (candidate) => candidate.width > 0 && candidate.height > 0,
          ),
        )
        textNode = walker.nextNode()
      }
      rects.sort((left, right) => left.top - right.top || left.left - right.left)
      const firstRect = rects.at(0)
      const lastRect = rects.at(-1)
      return {
        role:
          element.getAttribute('data-canonical-writing-chrome-role')
          || 'material_paragraph',
        text: element.textContent,
        firstCenterY: firstRect.top + firstRect.height / 2,
        lastCenterY: lastRect.top + lastRect.height / 2,
        visibleHeight: firstRect.height,
      }
    }
    return elements.slice(0, 3).map(visibleLine)
  })
  assert.deepEqual(
    lines.map((line) => line.role),
    ['section_heading', 'instruction', 'material_paragraph'],
    `${label} resolves section→instruction→material in public DOM order`,
  )
  const baselineStep =
    surface === 'screen'
      ? continuationWritingRhythm.targets.screen.baselineStepPx
      : continuationWritingRhythm.targets.printPdf.baselineStepPt * 4 / 3
  const tolerance =
    surface === 'screen'
      ? continuationWritingRhythm.targets.screen.oneStepTolerancePx
      : continuationWritingRhythm.targets.printPdf.oneStepTolerancePt * 4 / 3
  const seam = (edgeId, fromIndex, fromEdge, toIndex, toEdge, ratio) => {
    const distance = lines[toIndex][toEdge] - lines[fromIndex][fromEdge]
    const target = baselineStep * ratio
    assert.equal(
      Math.abs(distance - target) <= tolerance,
      true,
      `${label} ${edgeId} is measured at real visible-line centers: ${JSON.stringify({
        lines,
        distance,
        target,
      })}`,
    )
    return {
      edgeId,
      witness: {
        kind: 'public_visible_line_centers',
        surface,
        distance,
        target,
        from: lines[fromIndex],
        to: lines[toIndex],
      },
    }
  }
  return [
    seam(
      'section_to_instruction',
      0,
      'firstCenterY',
      1,
      'firstCenterY',
      1,
    ),
    seam(
      'instruction_to_material',
      1,
      'lastCenterY',
      2,
      'firstCenterY',
      1.5,
    ),
  ]
}

function measureContinuationPdfSeams(pdfPath, canonical, label) {
  const section = extractPdfLineGeometry(
    pdfPath,
    canonical.paperChrome.section.text,
  )
  const instruction = extractPdfLineGeometry(
    pdfPath,
    canonical.paperChrome.instructions.find(
      (entry) => entry.renderPolicy === 'render',
    ).text,
  )
  const lines = extractPdfLines(pdfPath)
  const material = lines.find(
    (line) =>
      line.yMin > instruction.yMin
      && compactText(canonical.materialBlocks[0].text)
        .includes(compactText(line.text))
      && compactText(line.text).length >= 12,
  )
  assert.ok(material, `${label} resolves the first PDF material line`)
  const visibleBaselineProxy = (line) => {
    const bottoms = line.words.map((word) => word.yMax)
      .sort((left, right) => left - right)
    return bottoms[Math.floor((bottoms.length - 1) / 2)]
  }
  const seam = (edgeId, from, to, ratio) => {
    const distancePt =
      visibleBaselineProxy(to) - visibleBaselineProxy(from)
    const targetPt =
      continuationWritingRhythm.targets.printPdf.baselineStepPt * ratio
    assert.equal(
      Math.abs(distancePt - targetPt)
        <= continuationWritingRhythm.targets.printPdf.oneStepTolerancePt,
      true,
      `${label} ${edgeId} is measured at real PDF line centers: ${JSON.stringify({
        from,
        to,
        distancePt,
        targetPt,
      })}`,
    )
    return {
      edgeId,
      witness: {
        kind: 'pdf_visible_line_centers',
        distancePt,
        targetPt,
        from,
        to,
      },
    }
  }
  return [
    seam('section_to_instruction', section, instruction, 1),
    seam('instruction_to_material', instruction, material, 1.5),
  ]
}

function assertExecutedCoverage() {
  for (const [bundle, requiredEdgeIds] of Object.entries(
    continuationCoverageOracle.requiredBundles,
  )) {
    assert.deepEqual(
      [...executedCoverage.get(bundle).keys()].sort(),
      [...requiredEdgeIds].sort(),
      `${bundle} coverage is derived from executed public-seam observations`,
    )
  }
}

function assertCompleteContinuationMaterialSourceFidelity(
  capturedMaterial,
  sourcePdfMaterial,
) {
  assert.equal(
    normalizeSourceMaterialText(capturedMaterial),
    normalizeSourceMaterialText(sourcePdfMaterial),
    'accepted Continuation capture preserves the complete original-PDF material text',
  )
}

function sourceBoundContinuationText() {
  for (const source of Object.values(continuationSourceOracle.sources)) {
    assert.equal(
      sha256File(source.path),
      source.sha256,
      `${source.path} remains the exact source-oracle input`,
    )
  }
  const capture = JSON.parse(readFileSync(
    new URL(
      `../${continuationSourceOracle.sources.continuationCapture.path}`,
      import.meta.url,
    ),
    'utf8',
  ))
  const transcription = JSON.parse(readFileSync(
    new URL(
      `../${continuationSourceOracle.sources.continuationTranscription.path}`,
      import.meta.url,
    ),
    'utf8',
  ))
  assert.equal(
    `sha256:${sha256File(
      continuationSourceOracle.sources.continuationCapture.predecessorPath,
    )}`,
    capture.lineage.predecessor.sha256,
    'Continuation capture successor binds the exact immutable v1 predecessor',
  )
  assert.equal(
    `sha256:${sha256File(
      continuationSourceOracle.sources.continuationTranscription
        .predecessorPath,
    )}`,
    transcription.lineage.predecessor.sha256,
    'Continuation transcription successor binds the exact immutable v1 predecessor',
  )
  assert.equal(
    capture.lineage.sourceTextNormalization,
    continuationSourceOracle.sourceTextVerification.normalization,
    'Continuation capture uses the independently declared source normalization',
  )
  assert.deepEqual(
    capture.lineage.preservedDistinctions,
    continuationSourceOracle.sourceTextVerification.preservedDistinctions,
    'Continuation capture preserves every independently declared text distinction',
  )
  assert.deepEqual(
    transcription.lineage,
    {
      ...capture.lineage,
      predecessor: transcription.lineage.predecessor,
    },
    'capture and transcription successors use one exact transformation lineage',
  )
  const blocks = new Map(capture.group.content.blocks.map(
    (block) => [
      block.nodeId,
      block.inlines.map((inline) => inline.text).join(''),
    ],
  ))
  for (const block of transcription.orderedBlocks) {
    assert.equal(
      digestJson(blocks.get(block.blockId)),
      block.textDigest,
      `accepted transcription independently seals ${block.blockId}`,
    )
  }
  const materialBlocks = continuationSourceOracle.materialBlockIds.map(
    (nodeId) => ({ nodeId, text: blocks.get(nodeId) }),
  )
  const starters = continuationSourceOracle.starters.map((starter) => {
    const text = blocks.get(starter.contentRef)
    assert.equal(text, starter.text)
    assert.equal(digestJson(text), `sha256:${starter.textSha256}`)
    return { ...starter, text }
  })
  const pdfText = execFileSync(
    'pdftotext',
    [
      '-f',
      String(continuationSourceOracle.sources.originalQuestionPdf.page),
      '-l',
      String(continuationSourceOracle.sources.originalQuestionPdf.page),
      path.resolve(continuationSourceOracle.sources.originalQuestionPdf.path),
      '-',
    ],
    { encoding: 'utf8' },
  )
  const compactPdfText = comparableRenderedText(pdfText)
  const normalizedPdfText = normalizeSourceMaterialText(pdfText)
  const materialStart = normalizedPdfText.indexOf('Emily Sanders,')
  const materialEndText = 'her entire holiday plan could be ruined.'
  const materialEnd = normalizedPdfText.indexOf(materialEndText, materialStart)
  assert.ok(
    materialStart >= 0 && materialEnd >= materialStart,
    'original source PDF exposes the complete Continuation material range',
  )
  const completePdfMaterial = normalizedPdfText.slice(
    materialStart,
    materialEnd + materialEndText.length,
  )
  const completeCapturedMaterial = normalizeSourceMaterialText(
    materialBlocks.map(({ text }) => text).join(' '),
  )
  assertCompleteContinuationMaterialSourceFidelity(
    completeCapturedMaterial,
    completePdfMaterial,
  )
  const reviewedDriftMaterial = completeCapturedMaterial.replace(
    continuationSourceOracle.sourceTextVerification.requiredVariant,
    continuationSourceOracle.sourceTextVerification.rejectedVariant,
  )
  assert.throws(
    () => assertCompleteContinuationMaterialSourceFidelity(
      reviewedDriftMaterial,
      completePdfMaterial,
    ),
    /complete original-PDF material text/,
    'the independent complete-text oracle rejects the reviewed punctuation drift',
  )
  assert.equal(
    completePdfMaterial.includes(
      continuationSourceOracle.sourceTextVerification.requiredVariant,
    ),
    true,
    'original source PDF preserves the reviewed full-width annotation punctuation',
  )
  assert.equal(
    completePdfMaterial.includes(
      continuationSourceOracle.sourceTextVerification.rejectedVariant,
    ),
    false,
    'original source PDF rejects the reviewed punctuation-drift variant',
  )
  for (const starter of starters) {
    assert.equal(
      compactPdfText.includes(comparableRenderedText(starter.text)),
      true,
      `original source PDF independently contains ${starter.starterId}`,
    )
  }
  for (const role of ['section', 'instruction']) {
    assert.equal(
      compactPdfText.includes(
        comparableRenderedText(continuationSourceOracle.chrome[role].text),
      ),
      true,
      `original source PDF independently contains Continuation ${role}`,
    )
  }
  return { materialBlocks, starters }
}

const continuationSourceText = sourceBoundContinuationText()

function assertContinuationWritingGeometryEvidenceClosure() {
  for (const reference of [
    continuationWritingRhythm.referenceMeasurement,
    continuationWritingRhythm.publicArtifactOracle,
    continuationWritingRhythm.observedCoverageOracle,
  ]) {
    assert.equal(
      `sha256:${sha256File(reference.path)}`,
      reference.sha256,
      `${reference.path} remains digest-bound to Continuation rhythm`,
    )
  }
  const measurement = JSON.parse(readFileSync(
    new URL(
      `../${continuationWritingRhythm.referenceMeasurement.path}`,
      import.meta.url,
    ),
    'utf8',
  ))
  assert.equal(
    sha256File(measurement.reference.path),
    measurement.reference.sha256,
  )
  assert.equal(
    sha256File(measurement.sourceCompanion.path),
    measurement.sourceCompanion.sha256,
  )
  assert.deepEqual(
    measurement.measurements.normalizedContract,
    {
      starterFirstLineIndentEm:
        continuationWritingRhythm.starterGeometry.firstLineIndentEm,
      starterFirstLineIndentToleranceEm:
        continuationWritingRhythm.starterGeometry
          .firstLineIndentToleranceEm,
      starterIndentUsableWidthRatio:
        continuationWritingRhythm.starterGeometry.indentUsableWidthRatio,
      starterIndentUsableWidthRatioTolerance:
        continuationWritingRhythm.starterGeometry
          .indentUsableWidthRatioTolerance,
      starterRowTopInsetEm:
        continuationWritingRhythm.starterGeometry.rowTopInsetEm,
      secondStarterRowRatio:
        continuationWritingRhythm.starterGeometry.secondRowStartRatio,
      bothStarterOriginsEqual: true,
    },
  )
  assert.deepEqual(
    [...continuationCoverageOracle.requiredEdgeIds].sort(),
    continuationWritingRhythm.adjacencyGraph
      .map(({ edgeId }) => edgeId)
      .sort(),
    'observed coverage closes the entire Continuation role graph',
  )
  assert.deepEqual(
    Object.keys(continuationCoverageOracle.requiredBundles).sort(),
    [
      'screen_plain',
      'screen_lecture',
      'student_print_html',
      'teacher_print_html',
      'student_pdf',
      'teacher_pdf_cross_page',
    ].sort(),
  )
}

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
  assert.deepEqual(
    writingPart.sections[1].slots[0].instructionRefs,
    ['writing.continuation.prompt'],
  )
  assert.equal(
    profile.instructions['writing.continuation.prompt'].text,
    nck1WritingChrome.continuationInstruction,
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

  const misplacedProfile = structuredClone(profile)
  const misplacedWritingPart = misplacedProfile.parts.find(
    (part) => part.partId === 'writing',
  )
  misplacedWritingPart.sections[0].slots[0].instructionRefs = [
    'writing.continuation.prompt',
  ]
  const misplacedManifest = structuredClone(authority.closure.manifest)
  misplacedManifest.artifacts.find(
    (descriptor) => descriptor.id === 'profile-nck1',
  ).sha256 = digestJson(misplacedProfile)
  const misplacedValidation = validateAuthorityClosure({
    manifest: misplacedManifest,
    artifacts: {
      ...authority.closure.artifacts,
      'profile-nck1': misplacedProfile,
    },
    schemas: authority.closure.schemas,
  })
  assert.equal(misplacedValidation.ok, false)
  assert.equal(
    misplacedValidation.issues.some(
      (issue) => issue.code === 'PROFILE_NCK1_WRITING_CHROME_INVALID',
    ),
    true,
  )
}

function assertZhejiangWritingChromeAuthority() {
  const authority = resolveCanonicalAuthority(canonicalAuthorityRef)
  assert.equal(authority.ok, true)
  const profile = authority.closure.profiles.get('zhejiang-legacy')
  assert.equal(profile.version, '7')
  const writingPart = profile.parts.find((part) => part.partId === 'writing')
  assert.deepEqual(
    [
      profile.instructions[writingPart.titleInstructionRef].text,
      ...writingPart.sections.map(
        (section) => profile.instructions[section.titleInstructionRef].text,
      ),
    ],
    [
      zhejiangWritingChrome.part,
      zhejiangWritingChrome.application,
      zhejiangWritingChrome.continuation,
    ],
  )

  const mutatedProfile = structuredClone(profile)
  mutatedProfile.instructions['part.writing'].text = 'Writing'
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
      (issue) => issue.code === 'PROFILE_ZHEJIANG_WRITING_CHROME_INVALID',
    ),
    true,
  )

  const misplacedHeadingProfile = structuredClone(profile)
  misplacedHeadingProfile
    .instructions['section.writing.application'].placement =
      'group_instruction'
  const misplacedHeadingManifest =
    structuredClone(authority.closure.manifest)
  misplacedHeadingManifest.artifacts.find(
    (descriptor) => descriptor.id === 'profile-zhejiang-legacy',
  ).sha256 = digestJson(misplacedHeadingProfile)
  const misplacedHeadingValidation = validateAuthorityClosure({
    manifest: misplacedHeadingManifest,
    artifacts: {
      ...authority.closure.artifacts,
      'profile-zhejiang-legacy': misplacedHeadingProfile,
    },
    schemas: authority.closure.schemas,
  })
  assert.equal(misplacedHeadingValidation.ok, false)
  assert.equal(
    misplacedHeadingValidation.issues.some(
      (issue) => issue.code === 'PROFILE_ZHEJIANG_WRITING_CHROME_INVALID',
    ),
    true,
  )

  const duplicateRefProfile = structuredClone(profile)
  const duplicateRefWritingPart = duplicateRefProfile.parts.find(
    (part) => part.partId === 'writing',
  )
  duplicateRefWritingPart.sections[1].slots[0].instructionRefs = [
    'part.writing',
  ]
  const duplicateRefManifest = structuredClone(authority.closure.manifest)
  duplicateRefManifest.artifacts.find(
    (descriptor) => descriptor.id === 'profile-zhejiang-legacy',
  ).sha256 = digestJson(duplicateRefProfile)
  const duplicateRefValidation = validateAuthorityClosure({
    manifest: duplicateRefManifest,
    artifacts: {
      ...authority.closure.artifacts,
      'profile-zhejiang-legacy': duplicateRefProfile,
    },
    schemas: authority.closure.schemas,
  })
  assert.equal(duplicateRefValidation.ok, false)
  assert.equal(
    duplicateRefValidation.issues.some(
      (issue) => issue.code === 'PROFILE_ZHEJIANG_WRITING_CHROME_INVALID',
    ),
    true,
  )
}

function assertNck1InstructionEvidenceAdmission() {
  const missingEvidence =
    makeContinuationWritingReferenceFixture('paper-2026-i')
  missingEvidence.request.evidence.documents =
    missingEvidence.request.evidence.documents.filter(
      (document) =>
        document.inputKey !== 'continuation_writing_instruction_evidence',
    )
  const missingCompilation = compileCanonicalPaper(missingEvidence.request)
  assert.notEqual(missingCompilation.disposition, 'ready')
  assert.equal(
    missingCompilation.artifacts.normalizationReport.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === 'CONTINUATION_INSTRUCTION_EVIDENCE_INCOMPLETE',
    ),
    true,
  )

  const forgedEvidence =
    makeContinuationWritingReferenceFixture('paper-2026-i')
  const forgedDocument = forgedEvidence.request.evidence.documents.find(
    (document) =>
      document.inputKey === 'continuation_writing_instruction_evidence',
  )
  const forgedValue = JSON.parse(
    new TextDecoder().decode(forgedDocument.bytes),
  )
  forgedValue.instruction.text = 'FORGED INSTRUCTION'
  forgedValue.transformationRecord.after = 'FORGED INSTRUCTION'
  forgedDocument.bytes =
    new TextEncoder().encode(JSON.stringify(forgedValue))
  const forgedCompilation = compileCanonicalPaper(forgedEvidence.request)
  assert.notEqual(forgedCompilation.disposition, 'ready')
  assert.equal(
    forgedCompilation.artifacts.normalizationReport.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === 'CONTINUATION_INSTRUCTION_EVIDENCE_INVALID',
    ),
    true,
  )

  const forgedSourceDigest =
    makeContinuationWritingReferenceFixture('paper-2026-i')
  const unrelatedSourceBytes =
    new TextEncoder().encode('%PDF-1.4\n% unrelated forged source\n')
  forgedSourceDigest.request.evidence.documents.push({
    inputKey: 'unrelated_forged_source',
    roles: ['question_source', 'source_provenance'],
    bytes: unrelatedSourceBytes,
    declared: { mediaType: 'application/pdf' },
  })
  const forgedSourceDocument =
    forgedSourceDigest.request.evidence.documents.find(
      (document) =>
        document.inputKey === 'continuation_writing_instruction_evidence',
    )
  const forgedSourceValue = JSON.parse(
    new TextDecoder().decode(forgedSourceDocument.bytes),
  )
  forgedSourceValue.sourceDocumentDigest =
    `sha256:${createHash('sha256')
      .update(unrelatedSourceBytes)
      .digest('hex')}`
  forgedSourceDocument.bytes =
    new TextEncoder().encode(JSON.stringify(forgedSourceValue))
  const forgedSourceCompilation =
    compileCanonicalPaper(forgedSourceDigest.request)
  assert.notEqual(forgedSourceCompilation.disposition, 'ready')
  assert.equal(
    forgedSourceCompilation.artifacts.normalizationReport.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === 'CONTINUATION_INSTRUCTION_EVIDENCE_INVALID',
    ),
    true,
  )

  const forgedDirectSourceDigest = makeReadyCanonicalFixture()
  forgedDirectSourceDigest.request.evidence.documents.push({
    inputKey: 'unrelated_direct_forged_source',
    roles: ['question_source', 'source_provenance'],
    bytes: unrelatedSourceBytes,
    declared: { mediaType: 'application/pdf' },
  })
  const forgedDirectEvidence =
    forgedDirectSourceDigest.request.evidence.documents.find(
      (document) =>
        document.inputKey ===
        'continuation_writing_instruction_evidence',
    )
  const forgedDirectValue = JSON.parse(
    new TextDecoder().decode(forgedDirectEvidence.bytes),
  )
  forgedDirectValue.sourceDocumentDigest =
    `sha256:${createHash('sha256')
      .update(unrelatedSourceBytes)
      .digest('hex')}`
  forgedDirectEvidence.bytes = new TextEncoder().encode(
    JSON.stringify(forgedDirectValue),
  )
  const forgedDirectCompilation = compileCanonicalPaper(
    forgedDirectSourceDigest.request,
  )
  assert.notEqual(forgedDirectCompilation.disposition, 'ready')
  assert.equal(
    forgedDirectCompilation.artifacts.normalizationReport.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === 'CONTINUATION_INSTRUCTION_EVIDENCE_INVALID',
    ),
    true,
  )

  const admitted =
    compileCanonicalPaper(
      makeContinuationWritingReferenceFixture('paper-2026-i').request,
    )
  assert.equal(admitted.disposition, 'ready')
  const instructionRecord =
    admitted.artifacts.normalizationReport.transformationRecords.find(
      (record) =>
        record.target.identity
          === 'profile:nck1:instruction:writing.continuation.prompt',
    )
  assert.ok(instructionRecord)
  assert.equal(
    instructionRecord.after,
    nck1WritingChrome.continuationInstruction,
  )
  assert.equal(instructionRecord.inputSourceSpanIds.length, 1)
}

function assertSchemaDescriptorIdentityClosure() {
  const authority = resolveCanonicalAuthority(canonicalAuthorityRef)
  assert.equal(authority.ok, true)
  for (const schemaId of [
    'normalization-report-v9',
    'canonical-paper-publication-v9',
    'normalization-report-v10',
    'canonical-paper-publication-v10',
    'normalization-report-v33',
    'canonical-paper-publication-v33',
  ]) {
    assert.equal(authority.closure.schemas[schemaId].$id, schemaId)
  }
  const forgedSchemas = structuredClone(authority.closure.schemas)
  forgedSchemas['normalization-report-v9'].$id =
    'normalization-report-forged'
  const forgedManifest = structuredClone(authority.closure.manifest)
  forgedManifest.schemas.find(
    (descriptor) => descriptor.id === 'normalization-report-v9',
  ).sha256 = digestJson(forgedSchemas['normalization-report-v9'])
  const validation = validateAuthorityClosure({
    manifest: forgedManifest,
    artifacts: authority.closure.artifacts,
    schemas: forgedSchemas,
  })
  assert.equal(validation.ok, false)
  assert.equal(
    validation.issues.some(
      (issue) => issue.code === 'SCHEMA_ID_MISMATCH',
    ),
    true,
  )
}

function assertV9CompatibilityReadClosure() {
  const legacyAuthority = resolveCanonicalAuthority({
    manifestId: 'paper-canonical',
    manifestVersion: '9',
    manifestDigest:
      'sha256:2f41323ad3ef27b6db49e71abcb20a25139f7275dc14e49b93909b53b825f626',
  })
  assert.equal(legacyAuthority.ok, true)
  assert.equal(legacyAuthority.closure.manifest.version, '9')
  assert.equal(
    digestJson(legacyAuthority.closure.manifest),
    'sha256:2f41323ad3ef27b6db49e71abcb20a25139f7275dc14e49b93909b53b825f626',
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
        profileVersion: profile.version,
        profileDigest: digestJson(profile),
      },
    )
    assert.equal(
      fixture.instructionEvidence.instruction.text,
      profile.instructions['writing.continuation.prompt'].text,
    )
    assert.equal(
      fixture.instructionEvidence.transformationRecord.before.includes(
        '续写两段，使之',
      ),
      true,
    )
    assert.equal(
      fixture.instructionEvidence.transformationRecord.after.includes(
        '续写两段话，使之',
      ),
      true,
    )
  } else if (paperId === 'paper-zj-2020-jul') {
    const authority = resolveCanonicalAuthority(canonicalAuthorityRef)
    const profile = authority.closure.profiles.get('zhejiang-legacy')
    assert.deepEqual(
      compilation.artifacts.canonicalPaper.paperPlan.profileRef,
      {
        profileId: 'zhejiang-legacy',
        profileVersion: profile.version,
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
  const application =
    makeApplicationWritingReferenceFixture('paper-zj-2020-jul')
  const continuation =
    makeContinuationWritingReferenceFixture('paper-zj-2020-jul')
  const continuationSource = structuredClone(continuation.source)
  continuationSource.groups = continuationSource.groups.filter(
    (group) => group.slotId !== 'writing.application',
  )
  continuationSource.observations = continuationSource.observations.filter(
    (observation) => (
      observation.observationId !== 'observation:writing.application'
      && !observation.observationId.startsWith(
        'observation:group:writing.application:',
      )
    ),
  )
  const groupIdsBySlot = {
    'reading.a': 'group-zj-2020-jul-reading-a',
    'reading.b': 'group-zj-2020-jul-reading-b',
    'reading.c': 'group-zj-2020-jul-reading-c',
    'reading.seven-choices': 'group-zj-2020-jul-seven-choices',
    'language.cloze': 'group-zj-2020-jul-cloze',
    'language.grammar-fill': 'group-zj-2020-jul-grammar-fill',
  }
  let sourceJson = JSON.stringify(continuationSource)
  for (const group of continuationSource.groups) {
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
    paperId: 'paper-zj-2020-jul',
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
    const publication = publishCanonicalPaperPublication({
      rootDir,
      db,
      request: fixture.request,
      sourceAssetVersion: 1,
      sourceAsset: fixture.sourceAsset,
    })
    assert.equal(
      publication.status,
      'published',
      JSON.stringify(publication),
    )
    const store = createFileSystemCanonicalPublicationStore({ rootDir, db })
    const consumptions = {}
    for (const [surface, consumerContract] of Object.entries({
      screen: consumerContractRefs.screen,
      printPdf: consumerContractRefs.print_pdf,
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

function comparableRenderedText(value) {
  return compactText(value)
    .replaceAll(/[‘’]/g, "'")
    .replaceAll(/[‐‑‒–—]/g, '-')
}

function normalizeSourceMaterialText(value) {
  return String(value)
    .normalize('NFC')
    .replaceAll(/[\t\n\f\v ]+/g, ' ')
    .trim()
}

function decodeXmlText(value) {
  return String(value)
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&')
}

function visibleRenderedText(value) {
  const text = String(value)
  if (!text.includes('<')) return text
  return decodeXmlText(
    text
      .replaceAll(/<[^>]*>/g, '')
      .replaceAll('&nbsp;', ' ')
      .replaceAll('&quot;', '"')
      .replaceAll('&#39;', "'")
      .replaceAll('&amp;', '&'),
  )
}

function assertNck1WritingHeadingCounts(renderedText, label) {
  const compact = compactText(visibleRenderedText(renderedText))
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

function assertNck1WholeWritingOrder(
  renderedText,
  application,
  continuation,
  label,
) {
  const compact = comparableRenderedText(visibleRenderedText(renderedText))
  const orderedVisibleText = [
    nck1WritingChrome.part,
    nck1WritingChrome.application,
    ...application.promptBlocks.map((block) => block.text),
    nck1WritingChrome.continuation,
    nck1WritingChrome.continuationInstruction,
    ...continuation.materialBlocks.map((block) => block.text),
  ]
  let priorIndex = -1
  for (const text of orderedVisibleText) {
    const anchor = comparableRenderedText(text).slice(0, 48)
    const currentIndex = compact.indexOf(anchor)
    assert.ok(
      currentIndex > priorIndex,
      `${label} preserves canonical NCK1 writing order at ${anchor}`,
    )
    priorIndex = currentIndex
  }
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

function assertZhejiangForbiddenTextAbsent(renderedText, label) {
  const visibleText = visibleRenderedText(renderedText)
  const compact = comparableRenderedText(visibleText)
  for (const poisonedText of [
    'Write a source-backed response of about 80 words.',
    'Writing tasks',
    'Writing',
    'Analysis',
    'supplement',
    'POISONED LEGACY',
    'FORGED ANALYSIS',
    'FORGED SUPPLEMENT',
  ]) {
    assert.equal(
      compact.includes(compactText(poisonedText)),
      false,
      `${label} rejects ${poisonedText} as writing authority: ${
        visibleText.split('\n')
          .filter((line) => line.includes(poisonedText))
          .join(' | ')
      }`,
    )
  }
}

function assertZhejiangWholeWritingVisibleText(
  renderedText,
  application,
  continuation,
  label,
) {
  const visibleText = visibleRenderedText(renderedText)
  const compact = compactText(visibleText)
  for (const heading of Object.values(zhejiangWritingChrome)) {
    assert.equal(
      compact.split(compactText(heading)).length - 1,
      1,
      `${label} contains ${heading} exactly once`,
    )
  }
  for (const block of [
    ...application.promptBlocks,
    ...continuation.materialBlocks,
  ]) {
    const blockAnchor = comparableRenderedText(block.text).slice(0, 24)
    assert.equal(
      compact.split(blockAnchor).length - 1,
      1,
      `${label} contains ${block.nodeId} exactly once`,
    )
  }
  assertZhejiangForbiddenTextAbsent(visibleText, label)
  const orderedVisibleText = [
    zhejiangWritingChrome.part,
    zhejiangWritingChrome.application,
    ...application.promptBlocks.map((block) => block.text),
    zhejiangWritingChrome.continuation,
    ...continuation.materialBlocks.map((block) => block.text),
  ]
  let priorIndex = -1
  for (const text of orderedVisibleText) {
    const currentIndex = compact.indexOf(
      comparableRenderedText(text).slice(0, 24),
    )
    assert.ok(
      currentIndex > priorIndex,
      `${label} preserves canonical Zhejiang writing order at ${text}`,
    )
    priorIndex = currentIndex
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
  for (const instructionId of [
    'part.writing',
    'section.writing.application',
    'section.writing.continuation',
  ]) {
    assert.equal(
      (html.match(new RegExp(
        `data-canonical-instruction-id="${instructionId}"`,
        'g',
      )) || []).length,
      1,
      `${label} contains canonical ${instructionId} exactly once`,
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

async function assertContinuationStarterIndent(
  page,
  response,
  canonical,
  label,
) {
  if (canonical.answerRegion.starterLines.length === 0) return
  const observed = await response.evaluate((element) => {
    const box = element.getBoundingClientRect()
    const firstTextX = (node) => {
      const range = document.createRange()
      range.selectNodeContents(node)
      return range.getClientRects()[0]?.x ?? null
    }
    const starters = [...element.querySelectorAll(
      '[data-canonical-starter-id]',
    )].map((starter) => {
      const style = getComputedStyle(starter)
      return {
        starterId: starter.getAttribute('data-canonical-starter-id'),
        textX: firstTextX(starter),
        fontSizePx: Number.parseFloat(style.fontSize),
      }
    })
    const chrome = [...document.querySelectorAll(
      '[data-canonical-writing-chrome-role]',
    )].map((node) => ({
      role: node.getAttribute('data-canonical-writing-chrome-role'),
      textIndentPx: Number.parseFloat(getComputedStyle(node).textIndent),
      fontSizePx: Number.parseFloat(getComputedStyle(node).fontSize),
    }))
    return { boxX: box.x, starters, chrome }
  })
  assert.equal(observed.starters.length, 2, `${label} renders two starters`)
  for (const starter of observed.starters) {
    assert.ok(starter.textX !== null)
    assert.ok(
      Math.abs(
        starter.textX
          - observed.boxX
          - (
            continuationWritingRhythm.starterGeometry.firstLineIndentEm
            * starter.fontSizePx
          )
      ) <= 1.5,
      `${label} keeps ${starter.starterId} at the source-correct ${continuationWritingRhythm.starterGeometry.firstLineIndentEm}em first-line indent: ${JSON.stringify(observed)}`,
    )
  }
  assert.ok(
    Math.abs(
      observed.starters[0].textX - observed.starters[1].textX,
    ) <= 1.5,
    `${label} keeps both supplied paragraph openings on one indent origin`,
  )
  assert.equal(
    observed.chrome.every(({ role, textIndentPx, fontSizePx }) =>
      role === 'instruction'
        ? Math.abs(textIndentPx - 2 * fontSizePx) <= 1.5
        : textIndentPx === 0),
    true,
    `${label} keeps headings flush-left and group instruction at 2em`,
  )
}

async function assertContinuationWritableAreaSeparation(
  response,
  canonical,
  label,
  { requireWrappedStarter = false } = {},
) {
  if (canonical.answerRegion.starterLines.length === 0) return
  const observed = await response.evaluate((element) => {
    const responseRect = element.getBoundingClientRect()
    const starters = [...element.querySelectorAll(
      '[data-canonical-starter-id]',
    )].map((starter) => {
      const range = document.createRange()
      range.selectNodeContents(starter)
      const textRects = [...range.getClientRects()].map((rect) => ({
        x: rect.x,
        top: rect.top,
        bottom: rect.bottom,
      }))
      const rect = starter.getBoundingClientRect()
      return {
        role: starter.getAttribute(
          'data-canonical-continuation-writing-rhythm-role',
        ),
        top: rect.top,
        bottom: rect.bottom,
        textRects,
      }
    })
    const writableAreas = [...element.querySelectorAll(
      '[data-canonical-continuation-writing-rhythm-role^="writable_after_starter_"]',
    )].map((area) => {
      const rect = area.getBoundingClientRect()
      return {
        role: area.getAttribute(
          'data-canonical-continuation-writing-rhythm-role',
        ),
        top: rect.top,
        bottom: rect.bottom,
        height: rect.height,
      }
    })
    return {
      response: {
        top: responseRect.top,
        bottom: responseRect.bottom,
      },
      starters,
      writableAreas,
    }
  })
  assert.deepEqual(
    observed.starters.map(({ role }) => role),
    ['starter_1', 'starter_2'],
    `${label} exposes the two supplied openings as starter roles`,
  )
  assert.deepEqual(
    observed.writableAreas.map(({ role }) => role),
    ['writable_after_starter_1', 'writable_after_starter_2'],
    `${label} exposes two distinct student writable areas`,
  )
  for (const [index, writableArea] of observed.writableAreas.entries()) {
    assert.ok(
      writableArea.top >= observed.starters[index].bottom - 0.5,
      `${label} starts writable area ${index + 1} after its supplied opening`,
    )
    assert.ok(
      writableArea.height > 0
        && writableArea.bottom <= observed.response.bottom + 0.5,
      `${label} keeps writable area ${index + 1} usable inside the response box: ${JSON.stringify(observed)}`,
    )
  }
  assert.ok(
    observed.writableAreas[0].bottom <= observed.starters[1].top + 0.5,
    `${label} keeps the first writable area separate from starter 2`,
  )
  const wrappedStarters = observed.starters.filter(
    ({ textRects }) => textRects.length > 1,
  )
  if (requireWrappedStarter) {
    assert.ok(
      wrappedStarters.length > 0,
      `${label} forces a supplied opening to wrap`,
    )
  }
  for (const starter of wrappedStarters) {
    assert.equal(
      starter.textRects.every(
        ({ x }) => Math.abs(x - starter.textRects[0].x) <= 1.5,
      ),
      true,
      `${label} keeps wrapped starter lines on the supplied-opening origin`,
    )
  }
}

async function assertContinuationEndBoundaryBrowser(page, response, label) {
  const observed = await response.evaluate((element) => {
    const responseRect = element.getBoundingClientRect()
    const semanticNodes = [...document.querySelectorAll(
      [
        '[data-canonical-writing-chrome-role]',
        '[data-canonical-continuation-writing-rhythm-role]',
        '[data-canonical-block-id]',
      ].join(','),
    )]
    const visibleSemanticAfterResponse = semanticNodes.filter((node) => {
      if (element.contains(node)) return false
      const rect = node.getBoundingClientRect()
      return rect.height > 0
        && rect.top >= responseRect.bottom - 0.5
        && (node.textContent || '').trim().length > 0
    }).length
    const responses = [...document.querySelectorAll(
      '[data-canonical-response-slot-id]',
    )]
    return {
      visibleSemanticAfterResponse,
      isLastResponse: responses.at(-1) === element,
    }
  })
  assert.equal(
    observed.visibleSemanticAfterResponse,
    0,
    `${label} has no following paper semantics after Continuation response`,
  )
  assert.equal(
    observed.isLastResponse,
    true,
    `${label} observes Continuation response as the final paper response`,
  )
}

async function assertContinuationMaterialWrap(page, canonical, label) {
  const observed = await page.locator(
    '[data-canonical-continuation-writing-rhythm-role="material_paragraph"]',
  ).evaluateAll((elements) => elements.map((element) => {
    const range = document.createRange()
    range.selectNodeContents(element)
    return {
      blockId: element.getAttribute('data-canonical-block-id'),
      lineCount: range.getClientRects().length,
      textIndentPx: Number.parseFloat(getComputedStyle(element).textIndent),
      fontSizePx: Number.parseFloat(getComputedStyle(element).fontSize),
    }
  }))
  assert.deepEqual(
    observed.map(({ blockId }) => blockId),
    canonical.materialBlocks.map(({ nodeId }) => nodeId),
    `${label} renders every source-bound material block in order`,
  )
  assert.equal(
    observed.some(({ lineCount }) => lineCount > 1),
    true,
    `${label} exercises real material wrapping`,
  )
  assert.equal(
    observed.every(({ textIndentPx, fontSizePx }) =>
      Math.abs(textIndentPx - 2 * fontSizePx) <= 0.5),
    true,
    `${label} applies the unified 2em first-line indent to every ordinary material paragraph`,
  )
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

function extractPdfLines(pdfPath, pageNumber = null) {
  const pageArgs = pageNumber === null
    ? []
    : ['-f', String(pageNumber), '-l', String(pageNumber)]
  const xml = execFileSync(
    'pdftotext',
    [...pageArgs, '-bbox-layout', pdfPath, '-'],
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

function extractPdfLineGeometry(pdfPath, text, pageNumber = null) {
  const found = extractPdfLines(pdfPath, pageNumber).filter(
    (line) => compactText(line.text) === compactText(text),
  )
  assert.equal(found.length, 1, `${pdfPath} contains one visible line "${text}"`)
  return found[0]
}

function extractContinuationResponsePdfRect(pdfPath, pageNumber) {
  const root = mkdtempSync(path.join(tmpdir(), 'eqb-continuation-svg-'))
  try {
    const svgPath = path.join(root, 'page.svg')
    execFileSync('pdftocairo', [
      '-f', String(pageNumber),
      '-l', String(pageNumber),
      '-svg',
      pdfPath,
      svgPath,
    ])
    const svg = readFileSync(svgPath, 'utf8')
    const rectangles = [...svg.matchAll(/<path\b[^>]*\bd="[^"]+"[^>]*>/g)]
      .map(([tag]) => {
        const points = [...(tag.match(/\bd="([^"]+)"/)?.[1] || '').matchAll(
          /[ML]\s*([\d.-]+)\s+([\d.-]+)/g,
        )].slice(0, 4).map((match) => [Number(match[1]), Number(match[2])])
        if (points.length !== 4) return null
        const matrix = tag.match(
          /transform="matrix\(([\d.-]+),\s*([\d.-]+),\s*([\d.-]+),\s*([\d.-]+),\s*([\d.-]+),\s*([\d.-]+)\)"/,
        )?.slice(1).map(Number) || [1, 0, 0, 1, 0, 0]
        const transformed = points.map(([x, y]) => [
          matrix[0] * x + matrix[2] * y + matrix[4],
          matrix[1] * x + matrix[3] * y + matrix[5],
        ])
        const xs = transformed.map(([x]) => x)
        const ys = transformed.map(([, y]) => y)
        const xMin = Math.min(...xs)
        const xMax = Math.max(...xs)
        const yMin = Math.min(...ys)
        const yMax = Math.max(...ys)
        if (xMax <= xMin || yMax <= yMin) return null
        return {
          xMin,
          xMax,
          yMin,
          yMax,
          width: xMax - xMin,
          height: yMax - yMin,
          stroked: /\bfill="none"/.test(tag),
        }
      })
      .filter(Boolean)
    const expectedWidthPt =
      continuationWritingRhythm.responseGeometry.widthMm / 25.4 * 72
    const expectedHeightPt =
      continuationWritingRhythm.responseGeometry.heightMm / 25.4 * 72
    const unique = [
      ...new Map(rectangles.map((rectangle) => [
        [
          rectangle.xMin.toFixed(2),
          rectangle.yMin.toFixed(2),
          rectangle.xMax.toFixed(2),
          rectangle.yMax.toFixed(2),
        ].join(':'),
        rectangle,
      ])).values(),
    ]
    const horizontal = unique.filter((rectangle) =>
      !rectangle.stroked
      && Math.abs(rectangle.width - expectedWidthPt) <= 2.5
      && rectangle.height >= 0.35
      && rectangle.height <= 0.65)
    const vertical = unique.filter((rectangle) =>
      !rectangle.stroked
      && Math.abs(rectangle.height - expectedHeightPt) <= 2.5
      && rectangle.width >= 0.35
      && rectangle.width <= 0.65)
    const candidates = []
    for (const top of horizontal) {
      for (const bottom of horizontal) {
        if (
          bottom.yMin <= top.yMin
          || Math.abs(top.xMin - bottom.xMin) > 1
          || Math.abs(top.xMax - bottom.xMax) > 1
          || Math.abs(bottom.yMax - top.yMin - expectedHeightPt) > 2.5
        ) continue
        const left = vertical.find((edge) =>
          Math.abs(edge.xMin - top.xMin) <= 1
          && Math.abs(edge.yMin - top.yMin) <= 1)
        const right = vertical.find((edge) =>
          Math.abs(edge.xMax - top.xMax) <= 1
          && Math.abs(edge.yMin - top.yMin) <= 1)
        if (!left || !right) continue
        candidates.push({
          x: top.xMin,
          y: top.yMin,
          width: top.width,
          height: bottom.yMax - top.yMin,
          ruleThicknesses: [
            top.height,
            bottom.height,
            left.width,
            right.width,
          ],
        })
      }
    }
    assert.equal(
      candidates.length,
      1,
      `${pdfPath} page ${pageNumber} contains one Continuation response rule box`,
    )
    assert.equal(
      candidates[0].ruleThicknesses.every(
        (thickness) => Math.abs(thickness - 0.5) <= 0.12,
      ),
      true,
      `${pdfPath} page ${pageNumber} uses approximately 0.5pt Continuation response rules`,
    )
    assert.equal(
      candidates[0].ruleThicknesses.some(
        (thickness) => thickness >= 0.68 && thickness <= 0.82,
      ),
      false,
      `${pdfPath} page ${pageNumber} emits no approximately 0.75pt Continuation response rule`,
    )
    return candidates[0]
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

function assertContinuationStarterPdfIndent({
  pdfPath,
  pageNumber,
  canonical,
  starterFontSizePx,
  label,
}) {
  if (canonical.answerRegion.starterLines.length === 0) return
  const responseRect =
    extractContinuationResponsePdfRect(pdfPath, pageNumber)
  const starterLines = canonical.answerRegion.starterLines.map(
    (starter) =>
      extractPdfLineGeometry(pdfPath, starter.text, pageNumber),
  )
  const fontSizePt = starterFontSizePx * 72 / 96
  const expectedIndentPt =
    continuationWritingRhythm.starterGeometry.firstLineIndentEm
    * fontSizePt
  for (const [index, line] of starterLines.entries()) {
    assert.ok(
      Math.abs(line.xMin - responseRect.x - expectedIndentPt)
        <= continuationWritingRhythm.targets.printPdf
          .starterIndentTolerancePt,
      `${label} keeps starter ${index + 1} at the authority-owned em indent in exact-A4 PDF`,
    )
  }
  assert.ok(
    Math.abs(starterLines[0].xMin - starterLines[1].xMin)
      <= continuationWritingRhythm.targets.printPdf
        .starterIndentTolerancePt,
    `${label} keeps both starter origins aligned in exact-A4 PDF`,
  )
  for (const [instruction] of canonicalWritingChromeEntries(canonical)) {
    if (instruction.renderPolicy !== 'render') continue
    const chromeLine = extractPdfLineGeometry(
      pdfPath,
      instruction.text,
      pageNumber === 1 ? 1 : null,
    )
    assert.ok(
      Math.abs(chromeLine.xMin - starterLines[0].xMin)
        > continuationWritingRhythm.targets.printPdf
          .starterIndentTolerancePt,
      `${label} does not apply the starter indent to ${instruction.instructionId}`,
    )
  }
}

function assertContinuationPdfEndBoundary(pdfPath, pageNumber, label) {
  const responseRect = extractContinuationResponsePdfRect(pdfPath, pageNumber)
  const textAfterResponse = extractPdfLines(pdfPath, pageNumber).filter(
    (line) =>
      line.yMin >= responseRect.y + responseRect.height - 0.5
      && !/^英语试题第\d+页（共\d+页）$/.test(compactText(line.text)),
  )
  assert.deepEqual(
    textAfterResponse,
    [],
    `${label} has no visible paper text after the Continuation response`,
  )
  assert.equal(
    pageNumber,
    pdfPageCount(pdfPath),
    `${label} observes the Continuation response on the final paper page`,
  )
}

function assertContinuationPdfMaterialWrap(pdfPath, canonical, label) {
  const lines = extractPdfLines(pdfPath)
  const wrapped = canonical.materialBlocks.some((block) => {
    const compactBlock = comparableRenderedText(block.text)
    return lines.filter((line) => {
      const compactLine = comparableRenderedText(line.text)
      return compactLine.length >= 12 && compactBlock.includes(compactLine)
    }).length > 1
  })
  assert.equal(wrapped, true, `${label} exercises real material wrapping`)
}

function pdfPageCount(pdfPath) {
  const info = execFileSync('pdfinfo', [pdfPath], { encoding: 'utf8' })
  const match = info.match(/^Pages:\s+(\d+)$/m)
  assert.ok(match, `${pdfPath} exposes a PDF page count`)
  return Number(match[1])
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
    yMin,
    yMax,
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
      const cropBox = {
        xMin: line.xMin * scale - 3,
        yMin: line.yMin * scale - 3,
        xMax: line.xMax * scale + 3,
        yMax: line.yMax * scale + 3,
      }
      const metric = rasterInkMetric(cropPgm(page, cropBox))
      return {
        ...metric,
        pageVisibleBottomPx: Math.floor(cropBox.yMin) + metric.yMax,
      }
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
      const range = document.createRange()
      range.selectNodeContents(element)
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
    ['print-pdf', 'screen'],
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
  const ink = pdfWritingChromeInk(pdfPath, canonical)
  assert.ok(
    Math.abs(section.xMin - part.xMin) <= 1,
    `${label} section heading keeps the canonical 2em/21pt indent`,
  )
  const localVisibleGlyphHeightPx =
    sectionHeadingRuntime.printPdf.fontSizePt
    * paperTypographyRuntime.partToFirstSectionGeometry
      .visibleGlyphHeightToFontSizeRatio.printPdf
    * 192 / 72
  const visibleBottomStepRatio =
    (ink.section.pageVisibleBottomPx - ink.part.pageVisibleBottomPx)
    / localVisibleGlyphHeightPx
  assert.equal(
    Math.abs(
      visibleBottomStepRatio
      - paperTypographyRuntime.partToFirstSectionGeometry
        .visibleGlyphBottomStepRatio
    ) <= paperTypographyRuntime.partToFirstSectionGeometry.ratioTolerance,
    true,
    `${label} raster-proves the canonical part-to-section visible-bottom rhythm: ${JSON.stringify({
      ink,
      localVisibleGlyphHeightPx,
      visibleBottomStepRatio,
    })}`,
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
  const expectedMaterialBlocks = canonical.paperId
    === continuationSourceOracle.paperId
    ? continuationSourceText.materialBlocks.map((block) => ({
        ...block,
        text: canonicalizeVisibleEnglishTypography(block.text),
      }))
    : canonical.materialBlocks
  const expectedStarters = canonical.paperId === continuationSourceOracle.paperId
    ? continuationSourceText.starters
    : canonical.answerRegion.starterLines
  if (canonical.paperId === continuationSourceOracle.paperId) {
    assert.deepEqual(
      canonical.materialBlocks.map(({ nodeId, text }) => ({ nodeId, text })),
      expectedMaterialBlocks,
      'canonical material is the independently replayed visible typography projection of the source-bound capture and PDF',
    )
    assert.deepEqual(
      canonical.answerRegion.starterLines.map(
        ({ starterId, contentRef, text }) => ({ starterId, contentRef, text }),
      ),
      expectedStarters.map(
        ({ starterId, contentRef, text }) => ({ starterId, contentRef, text }),
      ),
      'canonical starters are independently identical to the source-bound capture and PDF',
    )
    const normalizedVisibleText = normalizeSourceMaterialText(
      visibleRenderedText(renderedText),
    )
    assert.equal(
      normalizedVisibleText.includes('ditch (沟).'),
      true,
      'public Continuation output cleans the source-layout gloss punctuation',
    )
    assert.equal(
      normalizedVisibleText.includes('ditch （沟）.')
        || normalizedVisibleText.includes('ditch (沟) .'),
      false,
      'public Continuation output exposes neither raw nor reviewed source-layout punctuation accidents',
    )
  }
  for (const block of expectedMaterialBlocks) {
    assert.equal(
      compact.split(compactText(block.text)).length - 1,
      1,
      `material ${block.nodeId} must occur once`,
    )
  }
  for (const starter of expectedStarters) {
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
assertContinuationWritingGeometryEvidenceClosure()
assertZhejiangWritingChromeAuthority()
assertNck1InstructionEvidenceAdmission()
assertSchemaDescriptorIdentityClosure()
assertV9CompatibilityReadClosure()
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
    assert.deepEqual(
      canonical.paperChrome.instructions.map(
        (instruction) => instruction.text,
      ),
      [nck1WritingChrome.continuationInstruction],
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
    assert.deepEqual(
      [
        canonical.paperChrome.part.text,
        canonical.paperChrome.section.text,
      ],
      [
        zhejiangWritingChrome.part,
        zhejiangWritingChrome.continuation,
      ],
    )
    assert.deepEqual(
      surface.pageModel.blocks
        .filter(
          (block) =>
            block.kind === 'partHeading'
            || block.kind === 'sectionHeading',
        )
        .map((block) => block.text),
      [
        zhejiangWritingChrome.part,
        zhejiangWritingChrome.continuation,
      ],
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
const zhejiangApplicationChrome = projectCanonicalWritingChrome({
  consumption: zhejiangWholeWritingConsumption,
  groupId: zhejiangWholeWritingGroupIds[0],
  renderedGroupIds: zhejiangWholeWritingGroupIds,
})
assert.equal(zhejiangApplicationChrome.part?.text, zhejiangWritingChrome.part)
assert.equal(
  zhejiangApplicationChrome.section?.text,
  zhejiangWritingChrome.application,
)
const zhejiangContinuationChrome = projectCanonicalWritingChrome({
  consumption: zhejiangWholeWritingConsumption,
  groupId: zhejiangWholeWritingGroupIds[1],
  renderedGroupIds: zhejiangWholeWritingGroupIds,
})
assert.equal(zhejiangContinuationChrome.part, null)
assert.equal(
  zhejiangContinuationChrome.section?.text,
  zhejiangWritingChrome.continuation,
)
assert.throws(
  () => projectCanonicalWritingChrome({
    consumption: zhejiangWholeWritingConsumption,
    groupId: zhejiangWholeWritingGroupIds[0],
    renderedGroupIds: [...zhejiangWholeWritingGroupIds].reverse(),
  }),
  /Rendered canonical writing Group order is invalid/,
)
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
assert.equal(
  projectCanonicalWritingChrome({
    consumption: zhejiangWritingConsumptions.screen,
    groupId: zhejiangWritingGroupIds[0],
    renderedGroupIds: zhejiangWritingGroupIds,
  }).section?.text,
  zhejiangWritingChrome.application,
)
assert.equal(
  projectCanonicalWritingChrome({
    consumption: zhejiangWritingConsumptions.screen,
    groupId: zhejiangWritingGroupIds[1],
    renderedGroupIds: zhejiangWritingGroupIds,
  }).section?.text,
  zhejiangWritingChrome.continuation,
)
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
  title: 'Zhejiang v4 whole writing regression',
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
const mixedPrintHtml = buildPrintHtml({
  ...mixedWritingBaseArgs,
  canonicalConsumption: mixedWritingConsumptions.printPdf,
})
const mixedTeacherPrintHtml = buildPrintHtml({
  ...mixedWritingBaseArgs,
  versionType: 'teacher',
  canonicalConsumption: mixedWritingConsumptions.printPdf,
})
assertNck1WritingHeadingCounts(mixedPrintHtml, 'whole-paper Print HTML')
assertNck1WholeWritingOrder(
  mixedPrintHtml,
  mixedApplication,
  mixedContinuation,
  'whole-paper Print HTML',
)
assertNoRendererLocalWritingGroupHeading(
  mixedPrintHtml,
  'whole-paper Print HTML',
)
assert.equal(
  mixedTeacherPrintHtml.includes('data-writing-answer-supplement'),
  false,
  'whole-paper Teacher Print HTML has no unproved Continuation answer, analysis, or rubric',
)
if (persistActualArtifacts) {
  writeFileSync(
    path.join(actualArtifactRoot, 'print-whole-writing-student.html'),
    mixedPrintHtml,
  )
}
const zhejiangPrintHtml = buildPrintHtml({
  ...zhejiangWritingBaseArgs,
  canonicalConsumption: zhejiangWritingConsumptions.printPdf,
})
assertZhejiangWholeWritingHtmlIdentity(
  zhejiangPrintHtml,
  zhejiangApplication,
  zhejiangContinuation,
  'complete Zhejiang v4 Print HTML',
)
if (persistActualArtifacts) {
  writeFileSync(
    path.join(actualArtifactRoot, 'print-zhejiang-whole-writing-student.html'),
    zhejiangPrintHtml,
  )
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
      await assertContinuationStarterIndent(
        page,
        mixedContinuationResponse,
        mixedContinuation,
        'authenticated whole-paper Screen',
      )
      await assertContinuationWritableAreaSeparation(
        mixedContinuationResponse,
        mixedContinuation,
        'authenticated whole-paper Screen',
      )
      await assertContinuationMaterialWrap(
        page,
        mixedContinuation,
        'authenticated whole-paper Screen',
      )
      await assertContinuationEndBoundaryBrowser(
        page,
        mixedContinuationResponse,
        'authenticated whole-paper Screen',
      )
      await page.setViewportSize({ width: 520, height: 900 })
      await assertContinuationStarterIndent(
        page,
        mixedContinuationResponse,
        mixedContinuation,
        'narrow authenticated whole-paper Screen',
      )
      await assertContinuationWritableAreaSeparation(
        mixedContinuationResponse,
        mixedContinuation,
        'narrow authenticated whole-paper Screen',
        { requireWrappedStarter: true },
      )
      await page.setViewportSize({ width: 1280, height: 900 })
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
      assert.equal(
        countCompactText(
          mixedRailText,
          nck1WritingChrome.continuationInstruction,
        ),
        0,
        'authenticated whole-paper Screen navigation excludes the continuation instruction',
      )
      assert.equal(
        countCompactText(
          mixedVisiblePageText,
          nck1WritingChrome.continuationInstruction,
        ),
        1,
        'authenticated whole-paper Screen contains the continuation instruction exactly once',
      )
      assertNck1WritingHeadingCounts(
        mixedScreenText,
        'authenticated whole-paper Screen',
      )
      assertNck1WholeWritingOrder(
        mixedScreenText,
        mixedApplication,
        mixedContinuation,
        'authenticated whole-paper Screen',
      )
      assertNoRendererLocalWritingGroupHeading(
        mixedScreenText,
        'authenticated whole-paper Screen',
      )
      observeCoverage(
        'screen_plain',
        completedContinuationCoverageObservations(
          'screen_plain',
          await measureContinuationDomSeams(
            page,
            'authenticated whole-paper Screen',
            'screen',
          ),
          {
            surface: 'screen',
            artifact: 'authenticated whole-paper Screen',
          },
        ),
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
        writingText,
        zhejiangApplication,
        zhejiangContinuation,
        'authenticated complete Zhejiang v4 Screen',
      )
      assertZhejiangForbiddenTextAbsent(
        visiblePageText,
        'authenticated complete Zhejiang v4 Screen',
      )
      assertZhejiangForbiddenTextAbsent(
        railText,
        'authenticated complete Zhejiang v4 Screen navigation',
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
        3,
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

    for (const [versionType, html] of [
      ['student', mixedPrintHtml],
      ['teacher', mixedTeacherPrintHtml],
    ]) {
      const page = await browser.newPage()
      await page.setContent(html, { waitUntil: 'load' })
      const continuationResponse = page.locator(
        `[data-canonical-response-slot-id="${mixedContinuation.answerRegion.responseSlotId}"]`,
      )
      await assertContinuationWritableAreaSeparation(
        continuationResponse,
        mixedContinuation,
        `whole-paper cross-page ${versionType} Print HTML`,
      )
      const continuationStarterFontSizePx =
        await continuationResponse.locator('[data-canonical-starter-id]')
          .first()
          .evaluate(
            (element) =>
              Number.parseFloat(getComputedStyle(element).fontSize),
          )
      const root = mkdtempSync(path.join(tmpdir(), 'eqb-writing-chrome-pdf-'))
      try {
        const pdfPath = path.join(root, `whole-writing-${versionType}.pdf`)
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
        assertNck1WritingHeadingCounts(
          pdfText,
          `whole-paper ${versionType} Print PDF`,
        )
        assertNck1WholeWritingOrder(
          pdfText,
          mixedApplication,
          mixedContinuation,
          `whole-paper ${versionType} Print PDF`,
        )
        assertNoRendererLocalWritingGroupHeading(
          pdfText,
          `whole-paper ${versionType} Print PDF`,
        )
        assert.equal(
          pdfPageCount(pdfPath),
          2,
          `whole-writing ${versionType} pagination adversary crosses the Application to Continuation boundary`,
        )
        for (const starter of mixedContinuation.answerRegion.starterLines) {
          assert.equal(
            extractPdfLines(pdfPath, 1).some(
              (line) =>
                compactText(line.text) === compactText(starter.text),
            ),
            false,
            `cross-page ${versionType} movement keeps supplied starters out of the preceding page`,
          )
        }
        assertContinuationStarterPdfIndent({
          pdfPath,
          pageNumber: 2,
          canonical: mixedContinuation,
          starterFontSizePx: continuationStarterFontSizePx,
          label: `whole-paper cross-page ${versionType} Print PDF`,
        })
        assertContinuationPdfMaterialWrap(
          pdfPath,
          mixedContinuation,
          `whole-paper cross-page ${versionType} Print PDF`,
        )
        assertContinuationPdfEndBoundary(
          pdfPath,
          2,
          `whole-paper cross-page ${versionType} Print PDF`,
        )
        if (versionType === 'teacher') {
          assert.equal(
            pdfText.includes('FORGED ANALYSIS'),
            false,
            'Teacher cross-page PDF exposes no unproved Continuation answer or analysis',
          )
          observeCoverage(
            'teacher_pdf_cross_page',
            completedContinuationCoverageObservations(
              'teacher_pdf_cross_page',
              measureContinuationPdfSeams(
                pdfPath,
                mixedContinuation,
                'whole-paper cross-page Teacher Print PDF',
              ),
              {
                surface: 'pdf',
                artifact: 'whole-paper cross-page Teacher Print PDF',
              },
            ),
          )
        }
        if (persistActualArtifacts) {
          copyFileSync(
            pdfPath,
            path.join(
              actualArtifactRoot,
              `print-whole-writing-${versionType}.pdf`,
            ),
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
          'complete Zhejiang v4 Print PDF',
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
        await assertContinuationStarterIndent(
          page,
          response,
          canonical,
          `Screen ${label}/${teacher ? 'teacher' : 'student'}`,
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
          assert.equal(chromeLayout.sectionIndentPt, 0)
          const expectedPartToSectionTopPt = (
            paperTypographyRuntime.partToFirstSectionGeometry
              .visibleGlyphBottomStepRatio
            * paperTypographyRuntime.partToFirstSectionGeometry
              .visibleGlyphHeightToFontSizeRatio.screen
            * sectionHeadingRuntime.screen.fontSizePx
            - (
              paperTypographyRuntime.partToFirstSectionGeometry
                .visibleGlyphHeightToFontSizeRatio.screen
              - 1
            ) * sectionHeadingRuntime.screen.fontSizePx
          ) * 3 / 4
          assert.equal(
            Math.abs(
              chromeLayout.partToSectionTopPt
              - expectedPartToSectionTopPt
            ) <= 0.1,
            true,
          )
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
          assert.deepEqual(
            await page.locator(
              '[data-canonical-writing-chrome-role]',
            ).allInnerTexts(),
            [
              zhejiangWritingChrome.part,
              zhejiangWritingChrome.continuation,
            ],
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
        await assertContinuationWritableAreaSeparation(
          response,
          canonical,
          `authenticated Screen ${label}/${analysisVariant.label}`,
        )
        await assertContinuationEndBoundaryBrowser(
          page,
          response,
          `authenticated Screen ${label}/${analysisVariant.label}`,
        )
        if (label === 'two-starter' && analysisVariant.label === 'valid') {
          observeCoverage(
            'screen_lecture',
            completedContinuationCoverageObservations(
              'screen_lecture',
              await measureContinuationDomSeams(
                page,
                'authenticated lecture Screen',
                'screen',
              ),
              {
                surface: 'screen',
                artifact: 'authenticated lecture Screen',
              },
            ),
          )
        }
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
      await assertContinuationStarterIndent(
        page,
        response,
        canonical,
        `Print HTML ${label}/${versionType}`,
      )
      await assertContinuationWritableAreaSeparation(
        response,
        canonical,
        `Print HTML ${label}/${versionType}`,
      )
      await assertContinuationMaterialWrap(
        page,
        canonical,
        `Print HTML ${label}/${versionType}`,
      )
      await assertContinuationEndBoundaryBrowser(
        page,
        response,
        `Print HTML ${label}/${versionType}`,
      )
      const starterFontSizePx = canonical.answerRegion.starterLines.length > 0
        ? await response.locator('[data-canonical-starter-id]')
          .first()
          .evaluate(
            (element) =>
              Number.parseFloat(getComputedStyle(element).fontSize),
          )
        : null
      if (label === 'two-starter') {
        observeCoverage(
          `${versionType}_print_html`,
          completedContinuationCoverageObservations(
            `${versionType}_print_html`,
            await measureContinuationDomSeams(
              page,
              `Print HTML ${label}/${versionType}`,
              'print_html',
            ),
            {
              surface: 'print_html',
              artifact: `Print HTML ${label}/${versionType}`,
            },
          ),
        )
        const chromeLayout =
          await canonicalWritingChromeBrowserLayout(page)
        assert.deepEqual(
          chromeLayout,
          screenChromeLayouts.get(`${label}/${versionType}`),
          `Print HTML ${label}/${versionType} matches Screen paperChrome roles and geometry`,
        )
      } else {
        assert.deepEqual(
          await page.locator(
            '[data-canonical-writing-chrome-role]',
          ).allInnerTexts(),
          [
            zhejiangWritingChrome.part,
            zhejiangWritingChrome.continuation,
          ],
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
        assert.equal(
          execFileSync('pdfinfo', [pdfPath], { encoding: 'utf8' })
            .includes('Page size:       594.96 x 841.92 pts (A4)'),
          true,
          `Print PDF ${label}/${versionType} is exact A4`,
        )
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
          assertContinuationStarterPdfIndent({
            pdfPath,
            pageNumber: 1,
            canonical,
            starterFontSizePx,
            label: `Print PDF ${label}/${versionType}`,
          })
          assertContinuationPdfMaterialWrap(
            pdfPath,
            canonical,
            `Print PDF ${label}/${versionType}`,
          )
          assertContinuationPdfEndBoundary(
            pdfPath,
            1,
            `Print PDF ${label}/${versionType}`,
          )
          if (versionType === 'student') {
            observeCoverage(
              'student_pdf',
              completedContinuationCoverageObservations(
                'student_pdf',
                measureContinuationPdfSeams(
                  pdfPath,
                  canonical,
                  `Print PDF ${label}/${versionType}`,
                ),
                {
                  surface: 'pdf',
                  artifact: `Print PDF ${label}/${versionType}`,
                },
              ),
            )
          }
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
assertExecutedCoverage()

console.log(
  'paper canonical Continuation Writing rendered behavior verification passed',
)
