#!/usr/bin/env node

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync, spawn } from 'node:child_process'
import {
  existsSync,
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import manifestV17 from '../standards/paper-canonical/manifest-v17.json' with { type: 'json' }
import { consumerContractRefs } from '../shared/paper-canonical/consumers.mjs'
import { canonicalAuthorityRef } from '../shared/paper-canonical/authority.mjs'
import {
  projectCanonicalConsumerGroup,
} from '../shared/paper-canonical/consumerProjection.mjs'
import {
  assertCanonicalReadingCompanion,
  readingPassageLetterGeometryForLetter,
  readingPassageLetterTypography,
} from '../shared/paper-canonical/readingPassageLetter.mjs'
import {
  sevenChoicesRhythm,
} from '../shared/paper-canonical/sevenChoicesRhythm.mjs'
import {
  clozeRhythm,
} from '../shared/paper-canonical/clozeRhythm.mjs'
import {
  grammarFillRhythm,
} from '../shared/paper-canonical/grammarFillRhythm.mjs'
import {
  grammarFillPublicGeometryFixtures,
} from '../shared/paper-canonical/grammarFillPublicGeometryFixtures.mjs'
import {
  applicationWritingRhythm,
} from '../shared/paper-canonical/applicationWritingRhythm.mjs'
import { digestJson } from '../shared/paper-canonical/stable.mjs'
import { loadCanonicalImportRequest } from '../server/paper-canonical/importRequest.mjs'
import {
  admitCanonicalPaperImport,
  createFileSystemCanonicalPublicationStore,
  loadPaperForConsumption,
} from '../server/paper-canonical/publication.mjs'
import {
  publishPaperImportPackage,
  rollbackPaperImportPublication,
} from '../server/paper-import/publisher.mjs'
import {
  readImportPackageFromDirectory,
  validatePaperImportPackage,
} from '../server/paper-import/validator.mjs'
import {
  runCanonicalImportPilotQaSession,
} from './lib/canonicalImportPilotQaArtifactServer.mjs'
import {
  renderPaginatedPaper,
} from '../server/draft-paper/paginationRenderer.mjs'
import { closeChromiumPool } from '../server/draft-paper/chromiumPool.mjs'
import { buildPrintHtml } from '../server/print-renderer.mjs'

const repositoryRoot = path.resolve(import.meta.dirname, '..')
const sourcePackageDir = path.join(
  repositoryRoot,
  'test-fixtures/paper-import/paper-2026-i-canonical-pilot',
)
const passageLetterReferencePath = path.join(
  repositoryRoot,
  'docs/cuts/paper-canonical-unification/qa/20-reading-vertical-rhythm-reference-measurements-v3.json',
)
const readingPredecessorOraclePath = path.join(
  repositoryRoot,
  'docs/cuts/paper-canonical-unification/qa/20-reading-predecessor-oracles.json',
)
const readingPdfRoleOraclePath = path.join(
  repositoryRoot,
  'docs/cuts/paper-canonical-unification/qa/20-reading-pdf-role-oracles.json',
)
const sevenChoicesPreservedReferencePath = path.join(
  repositoryRoot,
  'docs/cuts/paper-canonical-unification/qa/20-seven-choices-golden-geometry-reference-measurements-v1.json',
)
const sevenChoicesReferencePath = path.join(
  repositoryRoot,
  'docs/cuts/paper-canonical-unification/qa/20-seven-choices-golden-geometry-reference-measurements-v2.json',
)
const sevenChoicesSourceOraclePath = path.join(
  repositoryRoot,
  'docs/cuts/paper-canonical-unification/qa/20-seven-choices-source-oracles-v2.json',
)
const sevenChoicesCoverageOraclePath = path.join(
  repositoryRoot,
  'docs/cuts/paper-canonical-unification/qa/20-seven-choices-observed-coverage-oracle-v1.json',
)
const clozeReferencePath = path.join(
  repositoryRoot,
  'docs/cuts/paper-canonical-unification/qa/20-cloze-golden-geometry-reference-measurements-v1.json',
)
const clozeSourceOraclePath = path.join(
  repositoryRoot,
  'docs/cuts/paper-canonical-unification/qa/20-cloze-source-oracles-v1.json',
)
const clozeCoverageOraclePath = path.join(
  repositoryRoot,
  'docs/cuts/paper-canonical-unification/qa/20-cloze-observed-coverage-oracle-v1.json',
)
const grammarFillReferencePath = path.join(
  repositoryRoot,
  'docs/cuts/paper-canonical-unification/qa/20-grammar-fill-golden-geometry-reference-measurements-v2.json',
)
const grammarFillSourceOraclePath = path.join(
  repositoryRoot,
  'docs/cuts/paper-canonical-unification/qa/20-grammar-fill-source-oracles-v3.json',
)
const grammarFillPublicAdversaryOraclePath = path.join(
  repositoryRoot,
  'docs/cuts/paper-canonical-unification/qa/20-grammar-fill-public-adversaries-v3.json',
)
const grammarFillCoverageOraclePath = path.join(
  repositoryRoot,
  'docs/cuts/paper-canonical-unification/qa/20-grammar-fill-observed-coverage-oracle-v3.json',
)
const applicationWritingReferencePath = path.join(
  repositoryRoot,
  'docs/cuts/paper-canonical-unification/qa/20-application-writing-golden-geometry-reference-measurements-v1.json',
)
const applicationWritingSourceOraclePath = path.join(
  repositoryRoot,
  'docs/cuts/paper-canonical-unification/qa/20-application-writing-source-oracles-v1.json',
)
const applicationWritingCoverageOraclePath = path.join(
  repositoryRoot,
  'docs/cuts/paper-canonical-unification/qa/20-application-writing-observed-coverage-oracle-v1.json',
)
const paperId = 'paper-2026-i'
const provisionActualArtifacts = process.argv.includes('--actual-artifacts')
const keepQaServer = process.argv.includes('--qa-server')
const injectQaArtifactServerStartupFailure = process.argv.includes(
  '--inject-qa-artifact-server-startup-failure',
)

if (keepQaServer && !provisionActualArtifacts) {
  throw new Error('--qa-server requires --actual-artifacts')
}
if (injectQaArtifactServerStartupFailure && !keepQaServer) {
  throw new Error(
    '--inject-qa-artifact-server-startup-failure requires --qa-server',
  )
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function assertApplicationWritingReferenceEvidence() {
  const referenceBytes = readFileSync(applicationWritingReferencePath)
  const reference = JSON.parse(referenceBytes)
  const sourceOracleBytes = readFileSync(applicationWritingSourceOraclePath)
  const sourceOracle = JSON.parse(sourceOracleBytes)
  const coverageOracleBytes = readFileSync(applicationWritingCoverageOraclePath)
  const coverageOracle = JSON.parse(coverageOracleBytes)
  assert.equal(
    applicationWritingRhythm.referenceMeasurement.sha256,
    `sha256:${sha256(referenceBytes)}`,
    'Application Writing authority binds the exact dimensionless reference measurement',
  )
  assert.equal(
    applicationWritingRhythm.publicArtifactOracle.sha256,
    `sha256:${sha256(sourceOracleBytes)}`,
    'Application Writing authority binds the exact source oracle',
  )
  assert.equal(
    applicationWritingRhythm.observedCoverageOracle.sha256,
    `sha256:${sha256(coverageOracleBytes)}`,
    'Application Writing authority binds the exact public observed-coverage oracle',
  )
  const referenceImage = path.join(repositoryRoot, reference.reference.path)
  assert.equal(
    sha256(readFileSync(referenceImage)),
    reference.reference.sha256,
    'Application Writing reference measurement binds the exact page-11 JPEG bytes',
  )
  assert.equal(
    reference.reference.coordinateUse,
    'evidence_only_never_css_px_pdf_pt_or_a4_scale',
  )
  for (const source of Object.values(sourceOracle.sources)) {
    assert.equal(
      sha256(readFileSync(path.join(repositoryRoot, source.path))),
      source.sha256,
      `Application Writing source oracle binds ${source.path}`,
    )
  }
  assert.deepEqual(sourceOracle.applicationWriting.teacherTail, {
    referenceAnswer: 'absent_not_authorized',
    analysisOrRubric: 'absent_not_reviewed',
    requiredVisibleOccurrenceCount: 0,
  })
  return { reference, sourceOracle, coverageOracle }
}

function assertPassageLetterReferenceEvidence() {
  const evidenceBytes = readFileSync(passageLetterReferencePath)
  const evidence = JSON.parse(evidenceBytes)
  assert.equal(
    evidence.schemaVersion,
    'reading-vertical-rhythm-reference-measurements-v3',
  )
  assert.deepEqual(
    evidence.references.map((reference) => path.basename(reference.file)),
    [
      'page-03-reading-a-start.jpeg',
      'page-04-reading-a-b.jpeg',
      'page-05-reading-b-c.jpeg',
      'page-06-reading-c-d.jpeg',
      'page-07-reading-d.jpeg',
      'page-08-seven-choices.jpeg',
    ],
    'the vertical-rhythm oracle digest-binds the exact G03-G08 byte set',
  )
  assert.equal(
    readingPassageLetterTypography.referenceMeasurement.path,
    path.relative(repositoryRoot, passageLetterReferencePath),
    'Renderer Typography binds the measured Reading passage-letter evidence path',
  )
  assert.equal(
    readingPassageLetterTypography.referenceMeasurement.sha256,
    `sha256:${sha256(evidenceBytes)}`,
    'Renderer Typography binds the exact measured Reading passage-letter evidence digest',
  )
  assert.equal(readingPassageLetterTypography.lineHeightPt, 18)
  assert.equal(readingPassageLetterTypography.marginBeforePt, 0)
  assert.equal(readingPassageLetterTypography.marginAfterPt, 0)
  assert.deepEqual(
    readingPassageLetterGeometryForLetter('A', 'screen'),
    {
      precedingKind: 'reading_heading',
      referenceBaselineStepRatio: 1,
      referenceRatioTolerance: 0.05,
      screenBaselineStepPx: 24,
      screenTolerancePx: 1.25,
      screenBeforeAdjustmentPx: -16,
      pdfBaselineStepPt: 18,
      pdfTolerancePt: 1.5,
      pdfBeforeAdjustmentPt: -6.75,
    },
    'Renderer Typography maps the local Reading-heading ratio to actual Screen/PDF line steps',
  )
  assert.deepEqual(
    readingPassageLetterGeometryForLetter('B', 'screen'),
    {
      precedingKind: 'prior_question_tail',
      referenceBaselineStepRatio: 2,
      referenceRatioTolerance: 0.05,
      screenBaselineStepPx: 48,
      screenTolerancePx: 1.25,
      screenBeforeAdjustmentPx: 13,
      pdfBaselineStepPt: 36,
      pdfTolerancePt: 1.5,
      pdfBeforeAdjustmentPt: 18,
    },
    'Renderer Typography maps the previous question tail to the actual Screen 2x step',
  )
  assert.deepEqual(
    readingPassageLetterGeometryForLetter('B', 'print_pdf'),
    {
      precedingKind: 'prior_question_tail',
      referenceBaselineStepRatio: 2,
      referenceRatioTolerance: 0.05,
      screenBaselineStepPx: 48,
      screenTolerancePx: 1.25,
      screenBeforeAdjustmentPx: 13,
      pdfBaselineStepPt: 36,
      pdfTolerancePt: 1.5,
      pdfBeforeAdjustmentPt: 18,
    },
    'Print/PDF maps B-D from the previous question tail at the golden 2x step',
  )
  assert.deepEqual(
    readingPassageLetterTypography.verticalRhythm.semanticRoleClasses,
    {
      chrome: ['part_title', 'subsection', 'meta_instruction'],
      passageContent: [
        'passage_title',
        'passage_subtitle',
        'passage_body_line',
        'native_table_line',
      ],
      questionStem: ['question_stem_line'],
      optionLine: ['option_line'],
      teacherTail: ['answer_line', 'explanation_line'],
    },
    'Renderer Typography exposes one explicit semantic-role class graph',
  )
  assert.throws(
    () => assertCanonicalReadingCompanion({
      blocks: [{}],
      passageLetter: undefined,
    }),
    /Canonical Reading blocks and passage letter must be provided together/,
    'Canonical Reading companion rejects blocks without a passage letter',
  )
  assert.throws(
    () => assertCanonicalReadingCompanion({
      blocks: undefined,
      passageLetter: 'A',
    }),
    /Canonical Reading blocks and passage letter must be provided together/,
    'Canonical Reading companion rejects a passage letter without blocks',
  )
  const readme = readFileSync(
    path.join(
      repositoryRoot,
      'docs/product/exam-paper-format-reference/README.md',
    ),
    'utf8',
  )
  const graphById = new Map(
    evidence.normalizedContract.adjacencyGraph.map((edge) => [
      edge.edgeId,
      edge,
    ]),
  )
  assert.deepEqual(
    readingPassageLetterTypography.verticalRhythm.adjacencyGraph,
    evidence.normalizedContract.adjacencyGraph,
    'Renderer Typography binds the complete independent Reading rhythm graph',
  )
  assert.deepEqual(
    readingPassageLetterTypography.verticalRhythm.targets,
    {
      screen: {
        baselineStepPx: evidence.normalizedContract.screenBodyBaselineStepPx,
        oneStepTolerancePx: 1.25,
        twoStepTolerancePx: 1.5,
      },
      printPdf: {
        baselineStepPt: evidence.normalizedContract.pdfBodyBaselineStepPt,
        oneStepTolerancePt: 1.5,
        twoStepTolerancePt: 1.5,
      },
    },
    'Renderer Typography maps only dimensionless golden ratios to local Screen/PDF baselines',
  )
  assert.equal(
    evidence.authority.scaleBoundary.includes(
      'JPEG pixels are never treated as Screen CSS pixels or PDF points',
    ),
    true,
    'golden evidence forbids JPEG-to-renderer unit conversion',
  )
  assert.equal(
    evidence.toleranceDerivation.oneStepRoundedTolerance,
    evidence.tolerances.oneStepRatio,
  )
  assert.equal(
    evidence.toleranceDerivation.twoStepRoundedTolerance,
    evidence.tolerances.twoStepRatio,
  )
  for (const reference of evidence.references) {
    const bytes = readFileSync(path.join(repositoryRoot, reference.file))
    assert.equal(
      sha256(bytes),
      reference.sha256,
      `${reference.file} retains its accepted golden-reference digest`,
    )
    assert.equal(
      readme.includes(path.basename(reference.file)),
      true,
      `${reference.file} remains indexed by the accepted reference README`,
    )
    assert.equal(
      Number.isFinite(reference.localBaselineStepPx)
        && reference.localBaselineStepPx > 0,
      true,
      `${reference.file} records a page-local baseline only`,
    )
    for (const sample of reference.samples) {
      const edge = graphById.get(sample.edgeId)
      assert.ok(edge, `${reference.file} sample uses a declared semantic edge`)
      assert.equal(
        sample.from.role,
        edge.fromRole
          ?? evidence.normalizedContract.semanticRoleClasses[
            edge.fromClass
          ].find((role) => role === sample.from.role),
        `${reference.file} sample has the exact from-role`,
      )
      assert.equal(
        sample.to.role,
        edge.toRole
          ?? evidence.normalizedContract.semanticRoleClasses[
            edge.toClass
          ].find((role) => role === sample.to.role),
        `${reference.file} sample has the exact to-role`,
      )
      if (edge.pageRelation) {
        assert.equal(
          sample.pageRelation,
          edge.pageRelation,
          `${reference.file} ${sample.edgeId} retains the exact page relation`,
        )
        assert.deepEqual(
          sample.repeatForbiddenRoles ?? [],
          edge.repeatForbiddenRoles ?? [],
          `${reference.file} ${sample.edgeId} retains repeated-role prohibitions`,
        )
        continue
      }
      const ratioTolerance =
        edge.baselineStepRatio === 2
          ? evidence.tolerances.twoStepRatio
          : evidence.tolerances.oneStepRatio
      assert.equal(
        Math.abs(sample.baselineStepRatio - edge.baselineStepRatio)
          <= ratioTolerance,
        true,
        `${reference.file} ${sample.edgeId} retains its local dimensionless ratio`,
      )
      assert.equal(
        Math.abs(
          (sample.to.baselineProxyY - sample.from.baselineProxyY)
            / reference.localBaselineStepPx
            / (sample.stepCount ?? 1)
          - sample.baselineStepRatio,
        ) <= 0.000001,
        true,
        `${reference.file} ${sample.edgeId} ratio is derived from its exact semantic anchors`,
      )
    }
  }
  return {
    digest: sha256(evidenceBytes),
    evidence,
  }
}

function assertSevenChoicesReferenceEvidence() {
  const evidenceBytes = readFileSync(sevenChoicesReferencePath)
  const evidence = JSON.parse(evidenceBytes)
  const preservedBytes = readFileSync(sevenChoicesPreservedReferencePath)
  const preserved = JSON.parse(preservedBytes)
  assert.equal(
    evidence.schemaVersion,
    'seven-choices-golden-geometry-reference-measurements-v2',
  )
  assert.equal(
    canonicalAuthorityRef.manifestVersion,
    '26',
    'new Publications preserve Seven Choices inside the closed Application Writing successor authority',
  )
  assert.equal(
    consumerContractRefs.screen.version,
    '26',
    'Screen v26 binds the complete geometry authority closure',
  )
  assert.equal(
    consumerContractRefs.print_pdf.version,
    '27',
    'Print/PDF v27 binds the complete geometry authority closure',
  )
  assert.equal(
    sha256(preservedBytes),
    evidence.preservedGoldenMeasurement.sha256,
    'the correction preserves the immutable accepted v1 measurement bytes',
  )
  assert.equal(
    sevenChoicesSourceOracle.digest,
    evidence.sourceOracle.sha256,
    'the corrected authority binds the independent source PDF and answer oracle',
  )
  assert.equal(
    sevenChoicesRhythm.referenceMeasurement.path,
    path.relative(repositoryRoot, sevenChoicesReferencePath),
  )
  assert.equal(
    sevenChoicesRhythm.referenceMeasurement.sha256,
    `sha256:${sha256(evidenceBytes)}`,
    'Seven Choices rhythm authority binds the exact measured evidence bytes',
  )
  assert.deepEqual(
    sevenChoicesRhythm.semanticRoleClasses,
    evidence.normalizedContract.semanticRoleClasses,
    'Seven Choices exposes one explicit semantic-role class authority',
  )
  assert.deepEqual(
    sevenChoicesRhythm.semanticRoleClasses.passageContent,
    ['passage_body_line'],
    'Seven Choices authority does not invent a passage title absent from the source',
  )
  assert.deepEqual(
    sevenChoicesRhythm.adjacencyGraph.map((edge) => edge.edgeId),
    evidence.normalizedContract.adjacencyEdgeIds,
    'Seven Choices exposes the complete measured adjacency graph',
  )
  assert.equal(
    sevenChoicesRhythm.adjacencyGraph.some(
      (edge) => edge.edgeId === 'passage_title_to_body',
    ),
    false,
    'Seven Choices authority exposes no unexecutable title-to-body edge',
  )
  assert.deepEqual(
    sevenChoicesRhythm.targets,
    preserved.normalizedContract.targets,
    'Seven Choices maps only dimensionless ratios to local public-artifact baselines',
  )
  assert.deepEqual(
    sevenChoicesRhythm.goldenGeometryFramework,
    preserved.normalizedContract.framework,
    'Seven Choices binds the reusable two-dimensional Golden Geometry axes without sharing family values',
  )
  assert.deepEqual(
    sevenChoicesRhythm.horizontalBankGeometry,
    preserved.normalizedContract.horizontalBankGeometry,
    'Seven Choices binds its independently measured horizontal A-G strategy',
  )
  assert.equal(
    preserved.authority.scaleBoundary.includes(
      'JPEG pixels are never treated as Screen CSS pixels or PDF points',
    ),
    true,
    'Seven Choices golden evidence forbids JPEG-to-renderer unit conversion',
  )
  const goldenBytes = readFileSync(
    path.join(repositoryRoot, preserved.reference.file),
  )
  assert.equal(sha256(goldenBytes), preserved.reference.sha256)
  assert.equal(preserved.reference.pixelWidth, 866)
  assert.equal(preserved.reference.pixelHeight, 1161)
  assert.deepEqual(
    preserved.reference.horizontalBankMeasurements.clusters.labelLeftPx.values,
    [102, 102, 103, 102, 102, 102, 103],
    'the golden A-G bank exposes one repeated option-label x cluster',
  )
  assert.deepEqual(
    preserved.reference.horizontalBankMeasurements.clusters.textStartPx.values,
    [126, 121, 125, 126, 124, 121, 123],
    'the golden A-G text starts form a narrow content-driven label-width cluster',
  )
  assert.equal(
    preserved.normalizedContract.horizontalBankGeometry.strategy.distribution,
    'not_distributed_not_space_between',
    'varying right bounds cannot be misclassified as space-between',
  )
  assert.equal(
    preserved.normalizedContract.horizontalBankGeometry.strategy
      .goldenWrappedContinuationObservation,
    'unobserved_all_golden_options_are_one_line',
    'the digest-bound crop does not invent a wrapped-option measurement',
  )
  assert.equal(
    preserved.reference.file.endsWith('page-08-seven-choices.jpeg'),
    true,
    'Seven Choices ratios come only from the exact golden page-08 bytes',
  )
  const readingDependencyBytes = readFileSync(path.join(
    repositoryRoot,
    preserved.authority.readingBoundaryDependency.path,
  ))
  assert.equal(
    sha256(readingDependencyBytes),
    preserved.authority.readingBoundaryDependency.sha256,
    'Seven Choices preserves the exact established Reading-D boundary authority',
  )
  return {
    digest: sha256(evidenceBytes),
    evidence,
  }
}

function assertSevenChoicesCoverageOracle() {
  const bytes = readFileSync(sevenChoicesCoverageOraclePath)
  const oracle = JSON.parse(bytes)
  assert.equal(
    oracle.schemaVersion,
    'seven-choices-observed-coverage-oracle-v1',
  )
  for (const binding of Object.values(oracle.authorityBoundary).filter(
    (entry) => entry && typeof entry === 'object' && entry.path,
  )) {
    assert.equal(
      sha256(readFileSync(path.join(repositoryRoot, binding.path))),
      binding.sha256,
      `Seven Choices coverage oracle binds ${binding.path}`,
    )
  }
  assert.deepEqual(
    sevenChoicesRhythm.adjacencyGraph,
    oracle.edges,
    'the production authority edge graph exactly equals the independent checked-in evidence oracle',
  )
  assert.deepEqual(
    {
      readingBoundary:
        sevenChoicesRhythm.semanticRoleClasses.readingBoundary[0],
      chrome: sevenChoicesRhythm.semanticRoleClasses.chrome,
      passage: sevenChoicesRhythm.semanticRoleClasses.passageContent[0],
      inlineBlank: sevenChoicesRhythm.semanticRoleClasses.inlineBlank[0],
      bankHeading: sevenChoicesRhythm.semanticRoleClasses.bankHeading[0],
      bankOption: sevenChoicesRhythm.semanticRoleClasses.bankOption[0],
      answer: sevenChoicesRhythm.semanticRoleClasses.teacherTail[0],
      explanation: sevenChoicesRhythm.semanticRoleClasses.teacherTail[1],
      followingSection:
        sevenChoicesRhythm.semanticRoleClasses.followingSection[0],
    },
    oracle.authorityBoundary.expectedSourceRoles,
    'the production role classes exactly equal the independent checked-in evidence oracle',
  )
  let priorParagraphOffset = -1
  for (const paragraph of oracle.authorityBoundary.passageParagraphAnchors) {
    const start = normalizedVisibleText(sevenChoicesSourceOracle.passageText)
      .indexOf(normalizedVisibleText(paragraph.start))
    const end = normalizedVisibleText(sevenChoicesSourceOracle.passageText)
      .indexOf(normalizedVisibleText(paragraph.end), start)
    assert.equal(
      start > priorParagraphOffset && end >= start,
      true,
      `${paragraph.paragraphId} anchors independently into the immutable source PDF passage`,
    )
    priorParagraphOffset = end
  }
  assert.deepEqual(
    oracle.authorityBoundary.chromeAnchors.map(({ text }) =>
      normalizedVisibleText(text)),
    [
      sevenChoicesSourceOracle.oracle.sourceExtraction.sectionMarker,
      sevenChoicesSourceOracle.oracle.sourceExtraction.instructionMarker,
    ].map(normalizedVisibleText),
    'the independent chrome observations bind the immutable source PDF text',
  )
  assert.deepEqual(
    Object.values(
      oracle.authorityBoundary.teacherExplanationFixture.textsByQuestionNo,
    ).map((text) => text.match(/answer ([A-G])/u)?.[1]),
    sevenChoicesSourceOracle.answerLabels,
    'the non-semantic explanation fixture binds each official answer identity',
  )
  const officialAnswers = JSON.parse(readFileSync(path.join(
    repositoryRoot,
    sevenChoicesSourceOracle.oracle.sources.officialAnswers.path,
  )))
  const teacherBoundary = oracle.authorityBoundary.teacherReadingBoundary
  assert.equal(
    officialAnswers.answers[teacherBoundary.questionId]?.answer,
    teacherBoundary.answer,
    'the Teacher Reading-D boundary binds the immutable official answer',
  )
  const readingAnalysis = JSON.parse(readFileSync(path.join(
    repositoryRoot,
    oracle.authorityBoundary.readingAnalysis.path,
  )))
  assert.equal(
    readingAnalysis.questions[teacherBoundary.questionId]?.questionFocus,
    teacherBoundary.explanationText,
    'the Teacher Reading-D terminal explanation binds checked-in independent analysis evidence',
  )
  const edgeIds = oracle.edges.map((edge) => edge.edgeId)
  assert.equal(
    new Set(edgeIds).size,
    edgeIds.length,
    'the independent Seven Choices coverage oracle has no duplicate edge ID',
  )
  assert.deepEqual(
    [...new Set(oracle.requiredBundles.flatMap(
      (bundle) => bundle.expectedEdgeIds,
    ))].sort(),
    [...edgeIds].sort(),
    'the required public-surface bundles close exactly the independent 22-edge oracle set',
  )
  for (const bundle of oracle.requiredBundles) {
    assert.equal(
      new Set(bundle.expectedEdgeIds).size,
      bundle.expectedEdgeIds.length,
      `${bundle.bundleId} declares each expected edge exactly once`,
    )
    assert.equal(
      bundle.expectedEdgeIds.every((edgeId) => edgeIds.includes(edgeId)),
      true,
      `${bundle.bundleId} contains only independent oracle edge IDs`,
    )
  }
  return {
    digest: sha256(bytes),
    oracle,
  }
}

function sourcePdfPageText(pdfPath, pageNumber) {
  return execFileSync(
    'pdftotext',
    ['-f', String(pageNumber), '-l', String(pageNumber), '-layout', pdfPath, '-'],
    { encoding: 'utf8' },
  )
}

function independentClozeExplanationText(entry) {
  const parts = []
  if (entry?.correctFit?.reason) {
    parts.push(`正答依据：${entry.correctFit.reason}`)
  }
  const distractors = Array.isArray(entry?.distractorGlosses)
    ? entry.distractorGlosses
      .map((item) =>
        item?.optionLabel && item?.meaning
          ? `${item.optionLabel}. ${item.meaning}`
          : '')
      .filter(Boolean)
    : []
  if (distractors.length > 0) {
    parts.push(`干扰项：${distractors.join('　')}`)
  }
  if (entry?.teachingNote) {
    parts.push(`点拨：${entry.teachingNote}`)
  }
  return parts.join('\n')
}

function assertClozeSourceOracle() {
  const bytes = readFileSync(clozeSourceOraclePath)
  const oracle = JSON.parse(bytes)
  assert.equal(oracle.schemaVersion, 'cloze-source-oracles-v1')
  assert.equal(oracle.paperId, paperId)
  const questionPdfPath = path.join(
    repositoryRoot,
    oracle.sources.questionPdf.path,
  )
  const paperAssetPath = path.join(
    repositoryRoot,
    oracle.sources.paperAsset.path,
  )
  const answersPath = path.join(
    repositoryRoot,
    oracle.sources.officialAnswers.path,
  )
  const teacherAnalysisPath = path.join(
    repositoryRoot,
    oracle.sources.teacherAnalysis.path,
  )
  for (const [label, source, sourcePath] of [
    ['original question PDF', oracle.sources.questionPdf, questionPdfPath],
    ['paper asset', oracle.sources.paperAsset, paperAssetPath],
    ['official answers', oracle.sources.officialAnswers, answersPath],
    [
      'reviewed Teacher analysis',
      oracle.sources.teacherAnalysis,
      teacherAnalysisPath,
    ],
  ]) {
    assert.equal(
      sha256(readFileSync(sourcePath)),
      source.sha256,
      `Cloze source oracle binds the immutable ${label} bytes`,
    )
  }
  const clozePage = normalizedVisibleText(sourcePdfPageText(
    questionPdfPath,
    oracle.sources.questionPdf.clozePage,
  ))
  const followingPage = normalizedVisibleText(sourcePdfPageText(
    questionPdfPath,
    oracle.sources.questionPdf.grammarFillPage,
  ))
  for (const [label, haystack, marker] of [
    ['part', clozePage, oracle.sourceExtraction.partMarker],
    ['section', clozePage, oracle.sourceExtraction.sectionMarker],
    ['instruction', clozePage, oracle.sourceExtraction.instructionMarker],
    ['passage start', clozePage, oracle.sourceExtraction.passageStartMarker],
    ['passage end', clozePage, oracle.sourceExtraction.passageEndMarker],
    ['first choice', clozePage, oracle.sourceExtraction.firstChoiceMarker],
    ['last choice', clozePage, oracle.sourceExtraction.lastChoiceMarker],
    ['following Grammar Fill section', followingPage, oracle.sourceExtraction.followingSectionMarker],
  ]) {
    assert.equal(
      haystack.includes(normalizedVisibleText(marker)),
      true,
      `immutable source exposes the Cloze ${label} marker`,
    )
  }
  const paperAsset = JSON.parse(readFileSync(paperAssetPath, 'utf8'))
  const officialAnswers = JSON.parse(readFileSync(answersPath, 'utf8'))
  const teacherAnalysis = JSON.parse(
    readFileSync(teacherAnalysisPath, 'utf8'),
  )
  assert.equal(
    teacherAnalysis.schemaVersion,
    oracle.sources.teacherAnalysis.schemaVersion,
  )
  assert.equal(
    teacherAnalysis.meta?.reviewStatus,
    oracle.sources.teacherAnalysis.reviewStatus,
  )
  const group = paperAsset.content.groups[
    oracle.publicIdentities.cloze.groupId
  ]
  assert.ok(group, 'paper asset exposes the independently named Cloze Group')
  assert.equal(group.groupType, 'cloze')
  assert.deepEqual(
    group.questionIds,
    oracle.publicIdentities.cloze.questionIds,
    'Cloze question identity/order comes from the independent source oracle',
  )
  assert.deepEqual(
    group.blankIds,
    oracle.publicIdentities.cloze.blankIds,
    'Cloze blank identity/order comes from the independent source oracle',
  )
  assert.deepEqual(
    group.passage.paragraphs.map((paragraph) => paragraph.paragraphId),
    oracle.publicIdentities.cloze.paragraphIds,
    'Cloze paragraph identity/order comes from the independent source oracle',
  )
  const questionRows = group.questionIds.map((questionId, index) => {
    const question = paperAsset.content.questions[questionId]
    const expectedNo = oracle.sourceSemantics.questionNumbers[index]
    assert.equal(question.questionNo, expectedNo)
    assert.equal(question.blankId, group.blankIds[index])
    assert.deepEqual(
      question.options.map((option) => option.label),
      oracle.sourceSemantics.optionLabels,
      `Question ${expectedNo} retains fixed A/B/C/D source labels`,
    )
    const answer = officialAnswers.answers[questionId]
    assert.ok(answer, `official answers include ${questionId}`)
    assert.equal(answer.questionNo, expectedNo)
    assert.equal(
      oracle.sourceSemantics.optionLabels.includes(answer.answer),
      true,
      `${questionId} official answer resolves to its immutable A-D set`,
    )
    const reviewedAnalysis = teacherAnalysis.blanks?.[questionId]
    assert.ok(
      reviewedAnalysis,
      `reviewed Teacher analysis includes ${questionId}`,
    )
    const explanation = independentClozeExplanationText(reviewedAnalysis)
    assert.equal(
      explanation.length > 0,
      true,
      `reviewed Teacher analysis produces an independent explanation for ${questionId}`,
    )
    return {
      questionId,
      questionNo: expectedNo,
      blankId: question.blankId,
      options: question.options.map((option) => ({ ...option })),
      answer: answer.answer,
      explanation,
    }
  })
  const wrappedVariantRow = questionRows.find(
    (row) => row.questionId === oracle.variants.wrappedOption.questionId,
  )
  assert.equal(
    wrappedVariantRow?.options.some(
      (option) =>
        option.label === oracle.variants.wrappedOption.optionLabel,
    ),
    true,
    'wrapped-option adversary binds an immutable source Question/Option identity',
  )
  assert.equal(
    oracle.variants.passageCrossPage.sourceText,
    oracle.sourceExtraction.passageStartMarker,
    'cross-page adversary repeats only an immutable source passage sentence',
  )
  assert.equal(
    oracle.variants.choiceBlockCrossPage.optionLabel,
    'D',
    'choice-block adversary names one fixed source track',
  )
  return {
    digest: sha256(bytes),
    oracle,
    questionPdfPath,
    paperAsset,
    officialAnswers,
    teacherAnalysis,
    teacherAnalysisPath,
    questionRows,
  }
}

function assertClozeReferenceEvidence() {
  const bytes = readFileSync(clozeReferencePath)
  const evidence = JSON.parse(bytes)
  assert.equal(
    evidence.schemaVersion,
    'cloze-golden-geometry-reference-measurements-v1',
  )
  assert.equal(
    sha256(readFileSync(path.join(repositoryRoot, evidence.reference.file))),
    evidence.reference.sha256,
    'Cloze golden geometry binds the immutable family reference JPEG',
  )
  assert.match(
    evidence.measurementMethod.scaleBoundary,
    /No JPEG pixel is treated as a Screen CSS pixel or PDF point/,
  )
  assert.equal(
    clozeRhythm.referenceMeasurement.path,
    path.relative(repositoryRoot, clozeReferencePath),
  )
  assert.equal(
    clozeRhythm.referenceMeasurement.sha256,
    `sha256:${sha256(bytes)}`,
    'Cloze authority binds the exact checked-in normalized measurement bytes',
  )
  assert.equal(clozeRhythm.blankGeometry.widthEm, 3.3)
  assert.equal(clozeRhythm.blankGeometry.verticalSpaceContribution, 0)
  assert.deepEqual(
    clozeRhythm.horizontalChoiceGeometry.rendererMapping,
    {
      rowWidthPt: 438.2,
      questionLabelWidthPt: 21,
      columnStartsPt: [0, 104, 208, 312],
      columnOriginPitchPt: 104,
      columnWidthsPt: [104, 104, 104, 126.2],
      minimumGutterPt: 21,
    },
    'Cloze authority publishes the fixed four-track renderer mapping without a distributed or hybrid row',
  )
  return { digest: sha256(bytes), evidence }
}

function assertClozeCoverageOracle() {
  const bytes = readFileSync(clozeCoverageOraclePath)
  const oracle = JSON.parse(bytes)
  assert.equal(
    oracle.schemaVersion,
    'cloze-observed-coverage-oracle-v1',
  )
  for (const binding of [
    oracle.authorityBoundary.sourceOracle,
    oracle.authorityBoundary.goldenReference,
  ]) {
    assert.equal(
      sha256(readFileSync(path.join(repositoryRoot, binding.path))),
      binding.sha256,
      `Cloze coverage oracle binds ${binding.path}`,
    )
  }
  assert.deepEqual(
    clozeRhythm.adjacencyGraph,
    oracle.edges,
    'Cloze production authority edge graph exactly equals the independent checked-in oracle',
  )
  assert.deepEqual(
    {
      sevenChoicesBoundary:
        clozeRhythm.semanticRoleClasses.previousFamilyBoundary[0],
      chrome: clozeRhythm.semanticRoleClasses.chrome,
      passage: clozeRhythm.semanticRoleClasses.passageContent[0],
      inlineBlank: clozeRhythm.semanticRoleClasses.inlineBlank[0],
      choiceRow: clozeRhythm.semanticRoleClasses.choiceRow[0],
      choiceLabel: clozeRhythm.semanticRoleClasses.choiceLabel[0],
      choiceText: clozeRhythm.semanticRoleClasses.choiceText[0],
      answer: clozeRhythm.semanticRoleClasses.teacherTail[0],
      explanation: clozeRhythm.semanticRoleClasses.teacherTail[1],
      followingSection:
        clozeRhythm.semanticRoleClasses.followingSection[0],
    },
    oracle.authorityBoundary.expectedSourceRoles,
    'Cloze role identities exactly equal the independent public-artifact oracle',
  )
  const edgeIds = oracle.edges.map((edge) => edge.edgeId)
  assert.equal(new Set(edgeIds).size, edgeIds.length)
  assert.deepEqual(
    [...new Set(oracle.requiredBundles.flatMap(
      (bundle) => bundle.expectedEdgeIds,
    ))].sort(),
    [...edgeIds].sort(),
    'Cloze required bundles close exactly the independent 26-edge graph',
  )
  for (const bundle of oracle.requiredBundles) {
    assert.equal(new Set(bundle.variants).size, bundle.variants.length)
    assert.equal(
      bundle.expectedEdgeIds.every((edgeId) => edgeIds.includes(edgeId)),
      true,
      `${bundle.bundleId} contains only independent Cloze edge IDs`,
    )
  }
  const requiredVariantKeys = oracle.requiredBundles.flatMap((bundle) =>
    bundle.variants.map((variant) => `${bundle.bundleId}/${variant}`))
  assert.deepEqual(
    Object.keys(oracle.variantOracle.profileByBundleVariant).sort(),
    [...requiredVariantKeys].sort(),
    'Cloze variant oracle declares every required public variant exactly once',
  )
  for (const [variantKey, profileId] of Object.entries(
    oracle.variantOracle.profileByBundleVariant,
  )) {
    const profile = oracle.variantOracle.profiles[profileId]
    assert.equal(
      Array.isArray(profile) && profile.length > 0,
      true,
      `${variantKey} resolves an explicit independent edge profile`,
    )
    assert.equal(new Set(profile).size, profile.length)
    assert.equal(
      profile.every((edgeId) => edgeIds.includes(edgeId)),
      true,
      `${variantKey} contains only independent Cloze edge IDs`,
    )
  }
  return { digest: sha256(bytes), oracle }
}

function independentGrammarFillExplanationText(entry) {
  return [
    entry?.reason ? `【${entry.answer}】${entry.reason}` : '',
    entry?.teachingNote ? `点拨：${entry.teachingNote}` : '',
  ].filter(Boolean).join('\n')
}

function assertGrammarFillSourceOracle() {
  const bytes = readFileSync(grammarFillSourceOraclePath)
  const oracle = JSON.parse(bytes)
  assert.equal(oracle.schemaVersion, 'grammar-fill-source-oracles-v3')
  assert.equal(oracle.paperId, paperId)
  const sourcePaths = Object.fromEntries(
    Object.entries(oracle.sources).map(([key, source]) => [
      key,
      path.join(repositoryRoot, source.path),
    ]),
  )
  for (const [key, source] of Object.entries(oracle.sources)) {
    assert.equal(
      sha256(readFileSync(sourcePaths[key])),
      source.sha256,
      `Grammar Fill source oracle binds immutable ${key} bytes`,
    )
  }
  const pageText = normalizedVisibleText(sourcePdfPageText(
    sourcePaths.questionPdf,
    oracle.sources.questionPdf.grammarFillPage,
  ))
  const compactSourceText = (value) =>
    normalizedVisibleText(value)
      .replace(/__(\d+)__/gu, '$1')
      .replace(/\s+/gu, '')
  for (const marker of [
    oracle.publicVisibleChrome.section,
    oracle.publicVisibleChrome.instruction,
    oracle.publicVisibleChrome.followingPart,
  ]) {
    assert.equal(
      compactSourceText(pageText).includes(compactSourceText(marker)),
      true,
      `immutable source page exposes ${marker}`,
    )
  }
  const paperAsset = JSON.parse(readFileSync(sourcePaths.paperAsset, 'utf8'))
  const officialAnswers = JSON.parse(
    readFileSync(sourcePaths.officialAnswers, 'utf8'),
  )
  const teacherAnalysis = JSON.parse(
    readFileSync(sourcePaths.teacherAnalysis, 'utf8'),
  )
  assert.equal(
    teacherAnalysis.schemaVersion,
    oracle.sources.teacherAnalysis.schemaVersion,
  )
  assert.equal(
    teacherAnalysis.meta?.reviewStatus,
    oracle.sources.teacherAnalysis.reviewStatus,
  )
  const identity = oracle.publicIdentities.grammarFill
  const group = paperAsset.content.groups[identity.groupId]
  assert.equal(group?.groupType, 'grammarFill')
  assert.deepEqual(group.questionIds, identity.questionIds)
  assert.deepEqual(group.blankIds, identity.blankIds)
  assert.deepEqual(
    group.passage.paragraphs.map((paragraph) => paragraph.paragraphId),
    identity.paragraphIds,
  )
  assert.equal(
    compactSourceText(pageText).includes(compactSourceText(
      group.passage.paragraphs[0].text.slice(0, 80),
    )),
    true,
    'immutable source page exposes the Grammar Fill passage start',
  )
  assert.equal(
    compactSourceText(pageText).includes(compactSourceText(
      group.passage.paragraphs.at(-1).text.slice(-80),
    )),
    true,
    'immutable source page exposes the Grammar Fill passage end',
  )
  const rows = identity.questionIds.map((questionId, index) => {
    const question = paperAsset.content.questions[questionId]
    const blankId = identity.blankIds[index]
    const blank = paperAsset.content.blanks[blankId]
    const answer = officialAnswers.answers[questionId]
    const analysis = teacherAnalysis.blanks[questionId]
    assert.equal(question.questionNo, 56 + index)
    assert.equal(question.blankId, blankId)
    assert.equal(blank.questionId, questionId)
    assert.equal(blank.prompt ?? null, identity.prompts[questionId])
    assert.equal(answer.answer, identity.answers[questionId])
    assert.equal(analysis.blankId, blankId)
    assert.equal(analysis.hint ?? null, identity.prompts[questionId])
    assert.equal(
      typeof analysis.answer === 'string' && analysis.answer.length > 0,
      true,
      `${questionId} retains its independently reviewed analysis answer text`,
    )
    return {
      questionId,
      questionNo: question.questionNo,
      blankId,
      prompt: blank.prompt ?? null,
      answer: answer.answer,
      analysisAnswer: analysis.answer,
      explanation: independentGrammarFillExplanationText(analysis),
    }
  })
  assert.equal(
    rows.every((row) => row.explanation.length > 0),
    true,
    'every Grammar Fill answer has source-bound reviewed analysis text',
  )
  return {
    digest: sha256(bytes),
    oracle,
    paperAsset,
    officialAnswers,
    teacherAnalysis,
    teacherAnalysisPath: sourcePaths.teacherAnalysis,
    rows,
  }
}

function assertGrammarFillReferenceEvidence() {
  const bytes = readFileSync(grammarFillReferencePath)
  const evidence = JSON.parse(bytes)
  assert.equal(
    evidence.schemaVersion,
    'grammar-fill-golden-geometry-reference-measurements-v2',
  )
  assert.equal(
    sha256(readFileSync(path.join(repositoryRoot, evidence.reference.path))),
    evidence.reference.sha256,
    'Grammar Fill geometry binds the exact page-10 reference bytes',
  )
  assert.equal(
    evidence.reference.coordinateUse,
    'evidence_only_never_css_px_pdf_pt_or_a4_scale',
  )
  assert.equal(
    grammarFillRhythm.referenceMeasurement.path,
    path.relative(repositoryRoot, grammarFillReferencePath),
  )
  assert.equal(
    grammarFillRhythm.referenceMeasurement.sha256,
    sha256(bytes),
  )
  assert.equal(grammarFillRhythm.blankGeometry.widthEm, 3.3)
  assert.equal(grammarFillRhythm.promptGeometry.gapEm, 0.5)
  const promptedQuestionNos = grammarFillSourceOracle.rows.flatMap((row) =>
    row.prompt === null ? [] : [row.questionNo])
  const unpromptedQuestionNos = grammarFillSourceOracle.rows.flatMap((row) =>
    row.prompt === null ? [row.questionNo] : [])
  assert.deepEqual(
    evidence.observedGoldenVariants.prompted,
    promptedQuestionNos,
    'Grammar Fill golden prompted identities equal the immutable source set',
  )
  assert.deepEqual(
    evidence.observedGoldenVariants.unprompted,
    unpromptedQuestionNos,
    'Grammar Fill golden unprompted identities equal the immutable source set',
  )
  assert.equal(
    grammarFillRhythm.horizontalStrategy.blankWidthProxy,
    'em',
  )
  assert.equal(
    grammarFillRhythm.horizontalStrategy.paragraphWidthProxy,
    'usable_content_width',
  )
  return { digest: sha256(bytes), evidence }
}

function assertGrammarFillPublicAdversaryOracle() {
  const bytes = readFileSync(grammarFillPublicAdversaryOraclePath)
  const oracle = JSON.parse(bytes)
  assert.equal(
    oracle.schemaVersion,
    'grammar-fill-public-adversaries-v3',
  )
  assert.equal(oracle.paperId, paperId)
  assert.equal(
    oracle.authorityBoundary.sourceOracle,
    path.relative(repositoryRoot, grammarFillSourceOraclePath),
  )
  assert.equal(
    sha256(readFileSync(grammarFillSourceOraclePath)),
    oracle.authorityBoundary.sourceOracleSha256,
    'Grammar Fill public adversaries bind the independent source oracle bytes',
  )
  const geometryFixtureAuthorityPath = path.join(
    repositoryRoot,
    oracle.authorityBoundary.geometryFixtureAuthority,
  )
  assert.equal(
    sha256(readFileSync(geometryFixtureAuthorityPath)),
    oracle.authorityBoundary.geometryFixtureAuthoritySha256,
    'Grammar Fill public adversaries bind the geometry fixture authority bytes',
  )
  assert.equal(
    oracle.authorityBoundary.constructionBoundary,
    'canonical_consumption_and_print_blocks_before_public_producer',
  )
  assert.equal(oracle.authorityBoundary.renderMutation, 'forbidden')
  const wrapped = oracle.wrappedLineAndLineEnd
  const sourceIdentity =
    grammarFillSourceOracle.oracle.publicIdentities.grammarFill
  assert.equal(wrapped.sourceText, 'Daji')
  assert.equal(wrapped.wrappedQuestionId, sourceIdentity.questionIds[0])
  assert.equal(wrapped.wrappedBlankId, sourceIdentity.blankIds[0])
  assert.equal(wrapped.lineEndQuestionId, sourceIdentity.questionIds[2])
  assert.equal(wrapped.lineEndBlankId, sourceIdentity.blankIds[2])
  assert.equal(
    grammarFillPublicGeometryFixtures.variants[
      wrapped.screenGeometryVariantId
    ].surface,
    'screen',
  )
  assert.equal(Number.isInteger(wrapped.wrappedPrefixRepeats), true)
  assert.equal(
    grammarFillPublicGeometryFixtures.variants[
      wrapped.printHtmlGeometryVariantId
    ].surface,
    'print_html',
  )
  const passageCross = oracle.passageCrossPage
  assert.equal(
    passageCross.sourceText,
    grammarFillSourceOracle.oracle.variants.passageCrossPage.sourceText,
  )
  assert.equal(
    passageCross.paragraphId,
    sourceIdentity.paragraphIds.at(-1),
  )
  assert.equal(Number.isInteger(passageCross.repeatCount), true)
  assert.equal(
    grammarFillPublicGeometryFixtures.variants[
      passageCross.geometryVariantId
    ].surface,
    'print_pdf',
  )
  return { digest: sha256(bytes), oracle }
}

function assertGrammarFillCoverageOracle() {
  const bytes = readFileSync(grammarFillCoverageOraclePath)
  const oracle = JSON.parse(bytes)
  assert.equal(
    oracle.schemaVersion,
    'grammar-fill-observed-coverage-oracle-v3',
  )
  assert.equal(
    oracle.authorityBoundary.sourceOracle,
    path.relative(repositoryRoot, grammarFillSourceOraclePath),
  )
  assert.equal(
    oracle.authorityBoundary.goldenReference,
    path.relative(repositoryRoot, grammarFillReferencePath),
  )
  assert.deepEqual(
    grammarFillRhythm.adjacencyGraph,
    oracle.edges,
    'Grammar Fill production edge graph exactly equals the independent oracle',
  )
  assert.deepEqual(
    {
      previousFamily: grammarFillRhythm
        .semanticRoleClasses.previousFamilyBoundary[0],
      chrome: grammarFillRhythm.semanticRoleClasses.chrome,
      passage: grammarFillRhythm.semanticRoleClasses.passageContent[0],
      inlineBlank: grammarFillRhythm.semanticRoleClasses.inlineBlank[0],
      prompt: grammarFillRhythm.semanticRoleClasses.prompt[0],
      answer: grammarFillRhythm.semanticRoleClasses.teacherTail[0],
      explanation: grammarFillRhythm.semanticRoleClasses.teacherTail[1],
      followingSection:
        grammarFillRhythm.semanticRoleClasses.followingSection[0],
    },
    oracle.authorityBoundary.expectedSourceRoles,
  )
  const edgeIds = oracle.edges.map((edge) => edge.edgeId)
  assert.equal(new Set(edgeIds).size, edgeIds.length)
  assert.deepEqual(
    [...new Set(oracle.requiredBundles.flatMap(
      (bundle) => bundle.expectedEdgeIds,
    ))].sort(),
    [...edgeIds].sort(),
    'Grammar Fill required bundles close exactly the independent 32-edge graph',
  )
  for (const bundle of oracle.requiredBundles) {
    assert.equal(new Set(bundle.variants).size, bundle.variants.length)
    assert.equal(
      bundle.expectedEdgeIds.every((edgeId) => edgeIds.includes(edgeId)),
      true,
      `${bundle.bundleId} contains only independent Grammar Fill edges`,
    )
  }
  return { digest: sha256(bytes), oracle }
}

function assertSevenChoicesSourceOracle() {
  const bytes = readFileSync(sevenChoicesSourceOraclePath)
  const oracle = JSON.parse(bytes)
  assert.equal(oracle.schemaVersion, 'seven-choices-source-oracles-v2')
  assert.equal(oracle.paperId, paperId)
  const questionPdfPath = path.join(
    repositoryRoot,
    oracle.sources.questionPdf.path,
  )
  const answersPath = path.join(
    repositoryRoot,
    oracle.sources.officialAnswers.path,
  )
  assert.equal(
    sha256(readFileSync(questionPdfPath)),
    oracle.sources.questionPdf.sha256,
    'Seven Choices source oracle binds the immutable original-question PDF',
  )
  assert.equal(
    sha256(readFileSync(answersPath)),
    oracle.sources.officialAnswers.sha256,
    'Seven Choices source oracle binds the immutable official-answer source',
  )
  const readingPage = normalizedVisibleText(sourcePdfPageText(
    questionPdfPath,
    oracle.sources.questionPdf.readingBoundaryPage,
  ))
  const sevenPage = normalizedVisibleText(sourcePdfPageText(
    questionPdfPath,
    oracle.sources.questionPdf.sevenChoicesPage,
  ))
  const followingPage = normalizedVisibleText(sourcePdfPageText(
    questionPdfPath,
    oracle.sources.questionPdf.followingSectionPage,
  ))
  for (const [label, haystack, marker] of [
    ['Reading-D start', readingPage, oracle.sourceExtraction.readingBoundaryStartMarker],
    ['Reading-D tail', readingPage, oracle.sourceExtraction.readingBoundaryEndMarker],
    ['Seven Choices section', sevenPage, oracle.sourceExtraction.sectionMarker],
    ['Seven Choices instruction', sevenPage, oracle.sourceExtraction.instructionMarker],
    ['Seven Choices passage', sevenPage, oracle.sourceExtraction.passageStartMarker],
    ['Seven Choices bank start', sevenPage, oracle.sourceExtraction.bankStartMarker],
    ['Seven Choices bank end', sevenPage, oracle.sourceExtraction.bankEndMarker],
    ['following section', followingPage, oracle.sourceExtraction.followingSectionMarker],
  ]) {
    assert.equal(
      haystack.includes(normalizedVisibleText(marker)),
      true,
      `immutable source exposes the ${label} marker`,
    )
  }
  const normalizedPassageStart = normalizedVisibleText(
    oracle.sourceExtraction.passageStartMarker,
  )
  const normalizedBankStart = normalizedVisibleText(
    oracle.sourceExtraction.bankStartMarker,
  )
  const passageStart = sevenPage.indexOf(normalizedPassageStart)
  const bankStart = sevenPage.indexOf(normalizedBankStart)
  assert.equal(passageStart >= 0 && bankStart > passageStart, true)
  const normalizedInstruction = normalizedVisibleText(
    oracle.sourceExtraction.instructionMarker,
  )
  const instructionStart = sevenPage.indexOf(normalizedInstruction)
  assert.equal(instructionStart >= 0, true)
  assert.equal(
    sevenPage.slice(
      instructionStart + normalizedInstruction.length,
      passageStart,
    ).trim(),
    '',
    'the immutable source places body text directly after the instruction with no passage title',
  )
  const passageText = sevenPage.slice(passageStart, bankStart).trim()
  const normalizedBankEnd = normalizedVisibleText(
    oracle.sourceExtraction.bankEndMarker,
  )
  const bankEnd = sevenPage.indexOf(normalizedBankEnd, bankStart)
  assert.equal(bankEnd >= bankStart, true)
  const bankText = sevenPage.slice(
    bankStart,
    bankEnd + normalizedBankEnd.length,
  )
  const optionMatches = [...bankText.matchAll(/\b([A-G])\.\s+/g)]
  assert.deepEqual(
    optionMatches.map((match) => match[1]),
    oracle.sourceSemantics.optionLabels,
    'A-G text is parsed independently from the immutable source PDF',
  )
  const bankOptions = optionMatches.map((match, index) => ({
    label: match[1],
    text: bankText.slice(
      match.index + match[0].length,
      optionMatches[index + 1]?.index ?? bankText.length,
    ).trim(),
  }))
  const answers = JSON.parse(readFileSync(answersPath, 'utf8')).answers
  const answerLabels = oracle.sourceSemantics.answerQuestionNumbers.map(
    (questionNo) => {
      const answer = Object.values(answers).find(
        (candidate) => candidate.questionNo === questionNo,
      )
      assert.ok(answer, `official source includes answer ${questionNo}`)
      return answer.answer
    },
  )
  assert.equal(
    oracle.sourceSemantics.passageTitle,
    'absent',
    'the immutable source declares no Seven Choices passage title',
  )
  return {
    digest: sha256(bytes),
    oracle,
    questionPdfPath,
    readingPage,
    sevenPage,
    followingPage,
    passageText,
    passageTokens: sourceLexicalTokens(passageText),
    bankOptions,
    bankTokens: bankOptions.flatMap(({ label, text }) => [
      normalizedPdfToken(label),
      ...exactPdfTokens(text),
    ]),
    answerLabels,
  }
}

function assertReadingPredecessorOracle() {
  const oracle = JSON.parse(readFileSync(readingPredecessorOraclePath, 'utf8'))
  assert.equal(
    oracle.schemaVersion,
    'reading-rhythm-oracles-v2',
    'Reading predecessor oracle uses the reviewed schema',
  )
  assert.equal(oracle.paperId, paperId)
  const sourceAssetPath = path.join(repositoryRoot, oracle.sourceAsset.path)
  assert.equal(
    sha256(readFileSync(sourceAssetPath)),
    oracle.sourceAsset.sha256,
    'Reading predecessor oracle binds the exact pilot source asset',
  )
  for (const [consumerId, entries] of [
    ['screen', oracle.screen],
    ['print_pdf', oracle.printPdf],
  ]) {
    assert.equal(entries.length, 4)
    assert.equal(
      new Set(entries.map((entry) => entry.predecessorAnchorId)).size,
      entries.length,
      `Reading predecessor oracle has unique ${consumerId} structural anchors`,
    )
    assert.equal(
      new Set(entries.map((entry) => entry.groupId)).size,
      entries.length,
      `Reading predecessor oracle has unique ${consumerId} visible Groups`,
    )
    for (const [index, entry] of entries.entries()) {
      assert.equal(
        entry.predecessorRole,
        index === 0
          ? consumerId === 'screen' ? 'subsection' : 'part_title'
          : 'option_line',
        `${consumerId} oracle names the exact semantic predecessor role`,
      )
      assert.equal(
        entry.predecessorStructuralGroupId,
        index === 0 ? null : entries[index - 1].groupId,
        `${consumerId} B-D oracle binds the previous structural Group`,
      )
      assert.equal(
        entry.predecessorQuestionId,
        [null, 'q-2026-i-023', 'q-2026-i-027', 'q-2026-i-031'][index],
        `${consumerId} oracle carries an explicit question anchor`,
      )
      assert.equal(
        entry.predecessorOptionId,
        entry.predecessorQuestionId
          ? `option:${entry.predecessorQuestionId}:D`
          : null,
        `${consumerId} oracle carries the final visible option anchor`,
      )
    }
  }
  assert.equal(
    oracle.readingEnd.screenNextSectionVisibleText,
    '第二节 (共5小题；每小题2.5分，满分12.5分)',
  )
  assert.equal(
    oracle.readingEnd.printPdfNextSectionVisibleText,
    '第二部分 七选五',
  )
  return oracle
}

function assertReadingPdfRoleOracle() {
  const oracle = JSON.parse(readFileSync(readingPdfRoleOraclePath, 'utf8'))
  assert.equal(oracle.schemaVersion, 'reading-pdf-role-oracles-v1')
  assert.equal(oracle.paperId, paperId)
  assert.equal(
    sha256(readFileSync(path.join(repositoryRoot, oracle.sourceAsset.path))),
    oracle.sourceAsset.sha256,
    'Reading PDF role oracle binds the exact pilot source asset',
  )
  assert.deepEqual(
    oracle.readingGroups.map((group) => group.letter),
    ['A', 'B', 'C', 'D'],
    'Reading PDF role oracle binds A-D in source order',
  )
  assert.deepEqual(
    oracle.optionRowCases.map((entry) => entry.rowCount),
    [1, 2, 4],
    'Reading PDF role oracle selects exact one-, two-, and four-row cases',
  )
  assert.equal(
    oracle.exactA4Variant.oneLineStemLineCount,
    1,
    'Reading PDF role oracle pins an exact one-line stem case',
  )
  assert.equal(
    oracle.exactA4Variant.stemLineCount,
    2,
    'Reading PDF role oracle pins an exact two-line stem case',
  )
  return oracle
}

function snapshotTree(rootDir) {
  if (!existsSync(rootDir)) return []
  const entries = []
  function visit(dir, prefix = '') {
    for (const entry of readdirSync(dir, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))) {
      const relativePath = path.join(prefix, entry.name)
      if (entry.isDirectory()) {
        entries.push({ path: `${relativePath}/`, bytes: null })
        visit(path.join(dir, entry.name), relativePath)
      } else {
        entries.push({
          path: relativePath,
          bytes: readFileSync(path.join(dir, entry.name)).toString('base64'),
        })
      }
    }
  }
  visit(rootDir)
  return entries
}

function snapshotDatabase(db) {
  return db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
  ).all().map(({ name }) => ({
    name,
    rows: db.prepare(`SELECT * FROM "${name.replaceAll('"', '""')}"`).all(),
  }))
}

function currentPublication(db) {
  const row = db.prepare(
    `
    SELECT paper_id, version_name, source_asset_version, publication_digest
    FROM canonical_paper_publications
    WHERE paper_id = ? AND is_current = 1
    `,
  ).get(paperId)
  assert.ok(row, 'pilot has one current canonical Publication')
  return {
    paperId: row.paper_id,
    versionName: row.version_name,
    sourceAssetVersion: Number(row.source_asset_version),
    publicationDigest: row.publication_digest,
  }
}

async function exactReload({ db, paperAssetsDir, expectedVersion }) {
  const ref = currentPublication(db)
  assert.equal(ref.versionName, expectedVersion)
  const store = createFileSystemCanonicalPublicationStore({
    rootDir: paperAssetsDir,
    db,
  })
  const consumers = {}
  for (const [consumerId, consumerContract] of Object.entries(consumerContractRefs)) {
    consumers[consumerId] = await loadPaperForConsumption({
      paperId,
      consumerContract,
    }, store)
    assert.equal(consumers[consumerId].disposition, 'ready')
    assert.equal(
      consumers[consumerId].selections.every(
        (selection) => selection.mode === 'canonical',
      ),
      true,
    )
    const familyIds = consumers[consumerId].selections
      .map((selection) => selection.familyContractId)
      .sort()
    assert.deepEqual(familyIds, [
      'application-writing',
      'cloze',
      'continuation-writing',
      'grammar-fill',
      'reading',
      'seven-choices',
    ])
    assert.equal(
      consumers[consumerId].selections.some(
        (selection) =>
          selection.familyContractId === 'listening'
          || selection.groupIds.some((groupId) => groupId.includes('listening'))
          || selection.projectedOccurrences.some(
            (occurrence) => occurrence.groupType === 'listening',
          ),
      ),
      false,
      `${consumerId} exposes zero Listening occurrence`,
    )
    assertCanonicalPassageLetterProjection(consumers[consumerId])
  }
  assert.deepEqual(Object.keys(consumers).sort(), ['print_pdf', 'screen'])
  return { ref, consumers }
}

function normalizedConsumptionSemantics(consumption) {
  return consumption.selections.map((selection) => ({
    familyContractId: selection.familyContractId,
    mode: selection.mode,
    groupIds: [...selection.groupIds],
    projectedOccurrences: selection.groupIds.map((groupId) => {
      const occurrence = projectCanonicalConsumerGroup({
        consumption,
        familyContractId: selection.familyContractId,
        groupId,
      })
      return {
        groupId: occurrence.groupId,
        groupType: occurrence.groupType,
        passageLetter: occurrence.passageLetter,
        semanticSignature: occurrence.semanticSignature,
        occurrenceSignature: occurrence.occurrenceSignature,
        questions: (occurrence.questions || []).map((question) => ({
        questionId: question.questionId,
        correctOptionId: question.correctOptionId,
      })),
      }
    }),
  }))
}

function assertSupportedConsumerParity(consumers) {
  assert.deepEqual(
    normalizedConsumptionSemantics(consumers.screen),
    normalizedConsumptionSemantics(consumers.print_pdf),
    'Screen and Print/PDF consume one semantic projection',
  )
}

function assertCanonicalPassageLetterProjection(consumption) {
  const readingSelection = consumption.selections.find(
    (selection) => selection.familyContractId === 'reading',
  )
  assert.ok(readingSelection)
  assert.deepEqual(
    readingSelection.projectedOccurrences.map(
      (occurrence) => occurrence.slotId,
    ),
    ['reading.a', 'reading.b', 'reading.c', 'reading.d'],
  )
  assert.deepEqual(
    readingSelection.groupIds.map((groupId) =>
      projectCanonicalConsumerGroup({
        consumption,
        familyContractId: 'reading',
        groupId,
      }).passageLetter),
    ['A', 'B', 'C', 'D'],
    'the ready whole-paper Reading selection projects A/B/C/D from explicit slot identity',
  )
  for (const selection of consumption.selections.filter(
    (candidate) => candidate.familyContractId !== 'reading',
  )) {
    for (const groupId of selection.groupIds) {
      const group = projectCanonicalConsumerGroup({
        consumption,
        familyContractId: selection.familyContractId,
        groupId,
      })
      assert.equal(
        Object.hasOwn(group, 'passageLetter'),
        false,
        `${selection.familyContractId} ${groupId} projects no passage letter`,
      )
    }
  }
}

async function availablePort() {
  const net = await import('node:net')
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close((error) => {
        if (error) reject(error)
        else resolve(address.port)
      })
    })
  })
}

async function waitForHttp(url, child, timeoutMs = 20_000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (child.exitCode !== null) {
      throw new Error(
        `API exited before readiness (${child.exitCode}): ${child.output}`,
      )
    }
    try {
      const response = await fetch(url)
      if (response.status) return
    } catch {
      // Keep waiting for the local API process.
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`Timed out waiting for ${url}\n${child.output}`)
}

async function stopChild(child) {
  child.kill('SIGTERM')
  const closed = new Promise((resolve) => {
    if (child.exitCode !== null) resolve()
    else child.once('close', resolve)
  })
  const exited = await Promise.race([
    closed.then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 3_000)),
  ])
  if (!exited) {
    child.kill('SIGKILL')
    await closed
  }
}

function seedDraftRows(userDbPath, asset) {
  const userDb = new DatabaseSync(userDbPath)
  const draftPaperId = 'draft-canonical-import-pilot'
  const groups = expectedGroupOrder(asset)
    .map((groupId) => asset.content.groups[groupId])
  userDb.prepare(
    `
    INSERT INTO draft_papers (
      id, user_id, title, subject, status, current_marker,
      created_at, updated_at
    ) VALUES (?, 'local', ?, 'english', 'active', 1, datetime('now'), datetime('now'))
    `,
  ).run(draftPaperId, 'Canonical Import Pilot')
  const insertItem = userDb.prepare(
    `
    INSERT INTO draft_paper_items (
      id, draft_paper_id, group_id, source_paper_id, order_index,
      page_break_before, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 0, datetime('now'), datetime('now'))
    `,
  )
  groups.forEach((group, index) => {
    insertItem.run(
      `draft-canonical-import-pilot-${index + 1}`,
      draftPaperId,
      group.groupId,
      asset.paper.paperId,
      index + 1,
    )
  })
  userDb.close()
  return { draftPaperId, activeGroups: groups, firstGroup: groups[0] }
}

function readingPrintVariantItem(asset, groupId) {
  const group = asset.content.groups[groupId]
  return {
    detail: {
      id: groupId,
      paperId: asset.paper.paperId,
      title: group.title,
      source: asset.paper.title,
      groupType: 'reading',
      passage: {
        title: group.title,
        materialText: 'POISONED LEGACY READING VARIANT',
      },
      questions: group.questionIds.map((questionId) => ({
        id: questionId,
        questionNo: String(asset.content.questions[questionId].questionNo),
        stem: 'POISONED LEGACY STEM',
        answer: 'POISONED LEGACY ANSWER',
        explanation: '',
        options: [{ label: 'A', content: 'POISONED LEGACY OPTION' }],
      })),
    },
    score: 2.5,
    sectionTitle: '阅读理解',
    note: '',
  }
}

function sevenChoicesPrintVariantItem(asset) {
  const { groupId } =
    sevenChoicesSourceOracle.oracle.publicIdentities.sevenChoices
  const group = asset.content.groups[groupId]
  return {
    detail: {
      id: groupId,
      paperId: asset.paper.paperId,
      title: group.title,
      source: asset.paper.title,
      groupType: 'seven_choices',
      passage: {
        title: group.title,
        materialText: 'POISONED LEGACY SEVEN CHOICES VARIANT',
      },
      questions: group.questionIds.map((questionId) => ({
        id: questionId,
        questionNo: String(asset.content.questions[questionId].questionNo),
        stem: 'POISONED LEGACY STEM',
        answer: asset.answerKey.answers[questionId]?.answer || '',
        explanation:
          sevenChoicesCoverageOracle.oracle.authorityBoundary
            .teacherExplanationFixture.textsByQuestionNo[
              String(asset.content.questions[questionId].questionNo)
            ],
        options: [{ label: 'A', content: 'POISONED LEGACY OPTION' }],
      })),
    },
    score: 2.5,
    sectionTitle: '七选五',
    note: '',
  }
}

function clozePrintVariantItem(asset) {
  const { groupId } = clozeSourceOracle.oracle.publicIdentities.cloze
  const group = asset.content.groups[groupId]
  return {
    detail: {
      id: groupId,
      paperId: asset.paper.paperId,
      title: group.title,
      source: asset.paper.title,
      groupType: 'cloze',
      passage: {
        title: group.title,
        materialText: 'POISONED LEGACY CLOZE VARIANT',
      },
      questions: group.questionIds.map((questionId) => {
        const question = asset.content.questions[questionId]
        const sourceRow = clozeSourceOracle.questionRows.find(
          (row) => row.questionId === questionId,
        )
        const answer = sourceRow?.answer || ''
        return {
          id: questionId,
          questionNo: String(question.questionNo),
          stem: 'POISONED LEGACY STEM',
          answer,
          explanation: sourceRow?.explanation || '',
          options: [{ label: 'A', content: 'POISONED LEGACY OPTION' }],
        }
      }),
    },
    score: 1,
    sectionTitle: '完形填空',
    note: '',
  }
}

function grammarFillPrintVariantItem(asset) {
  const groupId =
    grammarFillSourceOracle.oracle.publicIdentities.grammarFill.groupId
  const group = asset.content.groups[groupId]
  return {
    detail: {
      id: groupId,
      paperId: asset.paper.paperId,
      title: group.title,
      source: asset.paper.title,
      groupType: 'grammar_cloze',
      passage: {
        title: group.title,
        materialText: 'POISONED LEGACY GRAMMAR FILL VARIANT',
      },
      questions: group.questionIds.map((questionId) => {
        const row = grammarFillSourceOracle.rows.find(
          (candidate) => candidate.questionId === questionId,
        )
        return {
          id: questionId,
          questionNo: String(asset.content.questions[questionId].questionNo),
          stem: '',
          answer: row.answer,
          explanation: row.explanation,
          options: [],
        }
      }),
    },
    score: 1.5,
    sectionTitle: '语法填空',
    note: '',
  }
}

function grammarFillChromeForPrint({ proofVariantId = null } = {}) {
  const groupId =
    grammarFillSourceOracle.oracle.publicIdentities.grammarFill.groupId
  const blocks = grammarFillSourceOracle.paperAsset.content.blocks
  const groupIndex = blocks.findIndex(
    (block) => block.type === 'group' && block.groupId === groupId,
  )
  assert.ok(groupIndex >= 2, 'Grammar Fill source chrome resolves its Group')
  const section = blocks[groupIndex - 2]
  const instruction = blocks[groupIndex - 1]
  const previousGroup = blocks.slice(0, groupIndex).findLast(
    (block) => block.type === 'group',
  )
  const partContext = blocks.slice(0, groupIndex).findLast(
    (block) => block.type === 'partHeading',
  )
  const followingPart = blocks.slice(groupIndex + 1).find(
    (block) => block.type === 'partHeading',
  )
  assert.equal(section.type, 'sectionHeading')
  assert.equal(instruction.type, 'instruction')
  assert.equal(previousGroup.type, 'group')
  assert.equal(partContext.type, 'partHeading')
  assert.equal(followingPart.type, 'partHeading')
  return {
    groupId,
    previousFamilyGroupId: previousGroup.groupId,
    partContext: {
      partId: partContext.partId,
      text: partContext.text,
    },
    section: {
      sectionId: section.sectionId,
      text: section.text,
    },
    instruction: { text: instruction.text },
    followingSection: {
      sectionId: followingPart.partId,
      text: followingPart.text,
    },
    sourceBinding: {
      paperId: grammarFillRhythm.publicArtifactOracle.paperId,
      sourceAssetVersion:
        grammarFillRhythm.publicArtifactOracle.sourceAssetVersion,
      groupId,
      projectedOccurrenceDigest:
        proofVariantId
          ? grammarFillRhythm.publicArtifactOracle
              .adversarialProjectedOccurrenceDigests[proofVariantId]
          : grammarFillRhythm.publicArtifactOracle
              .expectedProjectedOccurrenceDigest,
      ...(proofVariantId ? { proofVariantId } : {}),
      geometry: {
        blankWidthEm: grammarFillRhythm.blankGeometry.widthEm,
        promptGapEm: grammarFillRhythm.promptGeometry.gapEm,
        promptAttachment: grammarFillRhythm.promptGeometry.attachment,
      },
      sourceDigests: {
        paperAsset:
          `sha256:${grammarFillRhythm.publicArtifactOracle
            .sourceBindings.paperAsset.sha256}`,
        officialAnswers:
          `sha256:${grammarFillRhythm.publicArtifactOracle
            .sourceBindings.officialAnswers.sha256}`,
        teacherAnalysis:
          `sha256:${grammarFillRhythm.publicArtifactOracle
            .sourceBindings.teacherAnalysis.sha256}`,
      },
      questionSupplements: grammarFillSourceOracle.rows.map((row) => ({
        questionId: row.questionId,
        blankId: row.blankId,
        prompt: row.prompt,
        answer: row.answer,
        explanation: row.explanation,
      })),
    },
  }
}

function grammarFillChromeForConsumption(consumption) {
  const selection = consumption.selections.find(
    (candidate) => candidate.familyContractId === 'grammar-fill',
  )
  const projectedOccurrenceDigest =
    selection?.projectedOccurrenceDigests?.find(
      (candidate) =>
        candidate.groupId
          === grammarFillRhythm.publicArtifactOracle.grammarFill.groupId,
    )?.digest
  assert.equal(typeof projectedOccurrenceDigest, 'string')
  if (
    projectedOccurrenceDigest
      === grammarFillRhythm.publicArtifactOracle
        .expectedProjectedOccurrenceDigest
  ) {
    return grammarFillChromeForPrint()
  }
  const proofVariantId = Object.entries(
    grammarFillRhythm.publicArtifactOracle
      .adversarialProjectedOccurrenceDigests,
  ).find(([, digest]) => digest === projectedOccurrenceDigest)?.[0]
  assert.equal(
    typeof proofVariantId,
    'string',
    'Grammar Fill public adversary has an independently published occurrence digest',
  )
  return grammarFillChromeForPrint({ proofVariantId })
}

function clozeVariantConsumption(
  consumption,
  {
    wrappedOptionRepeats = 1,
    wrapEveryChoiceRow = false,
    passageTailRepeats = 0,
  } = {},
) {
  const variant = structuredClone(consumption)
  const selection = variant.selections.find(
    (candidate) => candidate.familyContractId === 'cloze',
  )
  assert.ok(selection, 'Cloze adversary resolves the canonical selection')
  const occurrence = selection.projectedOccurrences.find(
    (candidate) =>
      candidate.groupId
        === clozeSourceOracle.oracle.publicIdentities.cloze.groupId,
  )
  assert.ok(occurrence, 'Cloze adversary resolves the canonical occurrence')
  const repeatedOptionText = new Map()
  const repeatOption = (questionId, optionLabel, repeats) => {
    const sourceRow = clozeSourceOracle.questionRows.find(
      (row) => row.questionId === questionId,
    )
    const sourceOption = sourceRow?.options.find(
      (option) => option.label === optionLabel,
    )
    const choiceSet = occurrence.choices.sets.find(
      (candidate) => candidate.questionId === questionId,
    )
    const option = choiceSet?.options.find(
      (candidate) => candidate.label === optionLabel,
    )
    assert.ok(sourceOption && option && Array.isArray(option.content))
    const repeated = Array.from(
      { length: repeats },
      () => sourceOption.text,
    ).join(' ')
    assert.equal(
      option.content.length,
      1,
      `${questionId}:${optionLabel} has one immutable text node`,
    )
    option.content[0].text = repeated
    repeatedOptionText.set(`${questionId}:${optionLabel}`, repeated)
  }
  if (wrapEveryChoiceRow) {
    for (const row of clozeSourceOracle.questionRows) {
      repeatOption(
        row.questionId,
        clozeSourceOracle.oracle.variants.choiceBlockCrossPage.optionLabel,
        wrappedOptionRepeats,
      )
    }
  } else if (wrappedOptionRepeats > 1) {
    repeatOption(
      clozeSourceOracle.oracle.variants.wrappedOption.questionId,
      clozeSourceOracle.oracle.variants.wrappedOption.optionLabel,
      wrappedOptionRepeats,
    )
  }
  let appendedPassageText = ''
  if (passageTailRepeats > 0) {
    const sourcePhrase =
      clozeSourceOracle.oracle.variants.passageCrossPage.sourceText
    appendedPassageText = Array.from(
      { length: passageTailRepeats },
      () => sourcePhrase,
    ).join(' ')
    const finalBlock = occurrence.content.blocks.at(-1)
    const finalText = [...finalBlock.inlines].reverse().find(
      (inline) => inline.kind === 'text',
    )
    assert.ok(finalText, 'Cloze passage adversary resolves a final text node')
    finalText.text = `${finalText.text} ${appendedPassageText}`
  }
  selection.projectedOccurrenceDigests = selection.projectedOccurrences.map(
    (candidate) => ({
      groupId: candidate.groupId,
      digest: digestJson(candidate),
    }),
  )
  const expectedRows = clozeSourceOracle.questionRows.map((row) => ({
    ...row,
    options: row.options.map((option) => ({
      ...option,
      text:
        repeatedOptionText.get(`${row.questionId}:${option.label}`)
        ?? option.text,
    })),
  }))
  const expectedPassageTexts =
    clozeSourceOracle.paperAsset.content.groups[
      clozeSourceOracle.oracle.publicIdentities.cloze.groupId
    ].passage.paragraphs.map((paragraph, index, paragraphs) =>
      index === paragraphs.length - 1 && appendedPassageText
        ? `${paragraph.text} ${appendedPassageText}`
        : paragraph.text)
  return { consumption: variant, expectedRows, expectedPassageTexts }
}

function grammarFillVariantConsumption(
  consumption,
  {
    passageTailRepeats = 0,
    wrappedPrefixRepeats = 0,
  } = {},
) {
  const variant = structuredClone(consumption)
  const selection = variant.selections.find(
    (candidate) => candidate.familyContractId === 'grammar-fill',
  )
  assert.ok(
    selection,
    'Grammar Fill adversary resolves the canonical selection',
  )
  const groupId =
    grammarFillSourceOracle.oracle.publicIdentities.grammarFill.groupId
  const occurrence = selection.projectedOccurrences.find(
    (candidate) => candidate.groupId === groupId,
  )
  assert.ok(
    occurrence,
    'Grammar Fill adversary resolves the canonical occurrence',
  )
  let appendedPassageText = ''
  let wrappedPrefixText = ''
  const insertSourcePrefixBeforeBlank = ({
    questionId,
    sourcePhrase,
    repeatCount,
  }) => {
    const targetBlankId =
      grammarFillSourceOracle.rows.find(
        (row) => row.questionId === questionId,
      ).blankId
    const targetBlock = occurrence.content.blocks.find((block) =>
      block.inlines.some(
        (inline) =>
          inline.kind === 'blank_ref'
          && inline.blankId === targetBlankId,
      ))
    const blankIndex = targetBlock?.inlines.findIndex(
      (inline) =>
        inline.kind === 'blank_ref'
        && inline.blankId === targetBlankId,
    )
    const precedingText = blankIndex > 0
      ? targetBlock.inlines[blankIndex - 1]
      : null
    assert.equal(precedingText?.kind, 'text')
    const insertedText = Array.from(
      { length: repeatCount },
      () => sourcePhrase,
    ).join(' ')
    precedingText.text = `${precedingText.text} ${insertedText} `
    return { insertedText, targetBlankId }
  }
  if (wrappedPrefixRepeats > 0) {
    const targetQuestionId =
      grammarFillSourceOracle.oracle.variants.promptedQuestionId
    const inserted = insertSourcePrefixBeforeBlank({
      questionId: targetQuestionId,
      sourcePhrase:
        grammarFillPublicAdversaryOracle.oracle
          .wrappedLineAndLineEnd.sourceText,
      repeatCount: wrappedPrefixRepeats,
    })
    wrappedPrefixText = inserted.insertedText
  }
  if (passageTailRepeats > 0) {
    const sourcePhrase =
      grammarFillSourceOracle.oracle.variants.passageCrossPage.sourceText
    appendedPassageText = Array.from(
      { length: passageTailRepeats },
      () => sourcePhrase,
    ).join(' ')
    const finalBlock = occurrence.content.blocks.at(-1)
    const finalText = [...finalBlock.inlines].reverse().find(
      (inline) => inline.kind === 'text',
    )
    assert.ok(
      finalText,
      'Grammar Fill passage adversary resolves a source text node',
    )
    finalText.text = `${finalText.text} ${appendedPassageText}`
  }
  selection.projectedOccurrenceDigests = selection.projectedOccurrences.map(
    (candidate) => ({
      groupId: candidate.groupId,
      digest: digestJson(candidate),
    }),
  )
  const sourceParagraphs =
    grammarFillSourceOracle.paperAsset.content.groups[groupId]
      .passage.paragraphs
  const expectedPassageTexts = sourceParagraphs.map(
    (paragraph, index) => {
      let text = paragraph.text
      if (index === 0 && wrappedPrefixText) {
        text = text.replace(
          '__56__',
          `${wrappedPrefixText} __56__`,
        )
      }
      if (index === sourceParagraphs.length - 1 && appendedPassageText) {
        text = `${text} ${appendedPassageText}`
      }
      return text
    },
  )
  return { consumption: variant, expectedPassageTexts }
}

function attributeSignatures(html) {
  return [...html.matchAll(
    /data-canonical-[a-z-]*(?:semantic|occurrence)-signature="([^"]+)"/g,
  )].map((match) => match[1]).sort()
}

function canonicalAttributeValues(html, attributeName) {
  const pattern = new RegExp(`${attributeName}="([^"]+)"`, 'g')
  return [...html.matchAll(pattern)].map((match) => match[1]).sort()
}

function structuralArtifactIdentity(html) {
  return Object.fromEntries([
    'data-canonical-semantic-signature',
    'data-canonical-occurrence-signature',
    'data-canonical-application-semantic-signature',
    'data-canonical-application-occurrence-signature',
    'data-canonical-writing-semantic-signature',
    'data-canonical-writing-occurrence-signature',
    'data-canonical-group-id',
    'data-canonical-question-id',
    'data-canonical-blank-id',
    'data-canonical-option-id',
    'data-canonical-answer-region-ref',
    'data-canonical-response-slot-id',
    'data-canonical-placement-signature',
    'data-canonical-passage-letter',
  ].map((attributeName) => [
    attributeName,
    canonicalAttributeValues(html, attributeName),
  ]))
}

function assertPassageLetterMarkup(html, consumption, consumerId, label) {
  const expectedReading = expectedReadingPassageEntries(
    consumption,
    consumerId,
    consumerId === 'screen'
      ? readingPredecessorOracle.screen
      : readingPredecessorOracle.printPdf,
  )
  assert.deepEqual(
    canonicalAttributeValues(html, 'data-canonical-passage-letter'),
    expectedReading.map(({ letter }) => letter),
    `${label} renders A/B/C/D exactly once each`,
  )
  for (const { groupId, letter } of expectedReading) {
    const start = html.indexOf(`data-canonical-group-id="${groupId}"`)
      >= 0
      ? html.indexOf(`data-canonical-group-id="${groupId}"`)
      : html.indexOf(`data-paper-browse-anchor="${groupId}"`)
    assert.notEqual(start, -1, `${label} contains Reading Group ${groupId}`)
    const followingStarts = consumption.selections.flatMap(
      (selection) => selection.groupIds,
    ).map((candidate) => {
      const canonical = html.indexOf(
        `data-canonical-group-id="${candidate}"`,
        start + 1,
      )
      const screen = html.indexOf(
        `data-paper-browse-anchor="${candidate}"`,
        start + 1,
      )
      return [canonical, screen].filter((offset) => offset > start)
    }).flat()
    const end = followingStarts.length > 0
      ? Math.min(...followingStarts)
      : html.length
    assert.equal(
      countTextOccurrences(
        html.slice(start, end),
        `data-canonical-passage-letter="${letter}"`,
      ),
      1,
      `${label} renders ${letter} once inside ${groupId}`,
    )
  }
}

function expectedReadingPassageEntries(
  consumption,
  consumerId,
  oracleEntries,
) {
  const readingSelection = consumption.selections.find(
    (selection) => selection.familyContractId === 'reading',
  )
  return readingSelection.groupIds.map((groupId, index) => {
    const group = projectCanonicalConsumerGroup({
      consumption,
      familyContractId: 'reading',
      groupId,
    })
    const oracleEntry = oracleEntries[index]
    assert.equal(
      oracleEntry?.groupId,
      groupId,
      `${consumerId} oracle follows the canonical Reading group order`,
    )
    return {
      ...oracleEntry,
      groupId,
      letter: group.passageLetter,
      precedingKind:
        readingPassageLetterGeometryForLetter(
          group.passageLetter,
          consumerId,
        ).precedingKind,
      predecessorGroupId: oracleEntry.predecessorStructuralGroupId,
    }
  })
}

function exactPrintReadingPredecessorBindings(
  html,
  consumption,
  label,
  oracleEntries = readingPredecessorOracle.printPdf,
) {
  const expected = expectedReadingPassageEntries(
    consumption,
    'print_pdf',
    oracleEntries,
  )
  const matchingCloseIndex = (tagName, openingIndex) => {
    const tokenPattern = new RegExp(`<\\/?${tagName}\\b[^>]*>`, 'gi')
    tokenPattern.lastIndex = openingIndex
    let depth = 0
    for (let token = tokenPattern.exec(html); token; token = tokenPattern.exec(html)) {
      depth += token[0].startsWith('</') ? -1 : 1
      if (depth === 0) return token.index
    }
    return -1
  }
  const tags = [...html.matchAll(/<([a-z0-9]+)\b([^>]*)>/gi)].map(
    (match) => {
      const attrs = Object.fromEntries(
        [...match[2].matchAll(/([a-z0-9:-]+)="([^"]*)"/gi)]
          .map((attribute) => [attribute[1], attribute[2]]),
      )
      const close = matchingCloseIndex(match[1], match.index)
      return {
        tagName: match[1].toLowerCase(),
        attrs,
        index: match.index,
        visibleText: close < 0
          ? ''
          : normalizedVisibleText(
              html.slice(match.index + match[0].length, close)
                .replace(/<[^>]+>/g, ' '),
            ),
      }
    },
  )
  const readingSections = tags.filter(
    (tag) =>
      tag.tagName === 'section'
      && tag.attrs['data-canonical-group-id']?.includes('-reading-'),
  )
  const structuralGroupForTag = (tag) =>
    readingSections
      .filter((section) => section.index <= tag.index)
      .at(-1)?.attrs['data-canonical-group-id'] ?? null
  const observations = expected.map((entry, index) => {
    const visibleMatches = tags.filter(
      (tag) =>
        tag.attrs['data-canonical-reading-preceding-for'] === entry.groupId,
    )
    assert.equal(
      visibleMatches.length,
      1,
      `${label} exposes exactly one visible predecessor for ${entry.groupId}`,
    )
    const [visible] = visibleMatches
    const semanticMatches = index === 0
      ? visibleMatches
      : tags.filter(
          (tag) =>
            tag.attrs['data-canonical-reading-anchor-for'] === entry.groupId,
        )
    assert.equal(
      semanticMatches.length,
      1,
      `${label} exposes exactly one semantic option anchor for ${entry.groupId}`,
    )
    const [semantic] = semanticMatches
    return {
      precedingForGroupId: entry.groupId,
      precedingKind:
        visible.attrs['data-canonical-reading-preceding-kind'],
      predecessorRole:
        semantic.attrs['data-canonical-reading-rhythm-role'],
      visiblePredecessorRole:
        visible.attrs['data-canonical-reading-rhythm-role'],
      predecessorGroupId:
        index === 0 ? null : structuralGroupForTag(semantic),
      predecessorAnchorId:
        index === 0
          ? visible.attrs['data-canonical-reading-anchor-id']
          : structuralGroupForTag(semantic),
      predecessorQuestionId:
        semantic.attrs['data-canonical-reading-predecessor-question-id']
        ?? null,
      predecessorOptionId:
        semantic.attrs['data-canonical-reading-predecessor-option-id']
        ?? null,
      visibleText: visible.visibleText,
      predecessorPage: 'print-html',
      letterPage: 'print-html',
    }
  })
  assertExactTaggedPredecessorObservations(observations, expected, label)
  assertTaggedPredecessorAttacksFailClosed(observations, expected, label)
  return new Map(
    observations.map((observation) => [
      observation.precedingForGroupId,
      observation,
    ]),
  )
}

function assertExactTaggedPredecessorObservations(
  observations,
  expected,
  label,
) {
  for (const entry of expected) {
    const matches = observations.filter(
      (observation) => observation.precedingForGroupId === entry.groupId,
    )
    assert.equal(
      matches.length,
      1,
      `${label} requires exactly one tagged predecessor for ${entry.groupId}`,
    )
    const [observation] = matches
    assert.equal(observation.precedingKind, entry.precedingKind)
    assert.equal(
      observation.predecessorGroupId,
      entry.predecessorGroupId,
      `${label} binds ${entry.groupId} to the expected predecessor Group`,
    )
    assert.equal(
      observation.predecessorAnchorId,
      entry.predecessorAnchorId,
      `${label} binds ${entry.groupId} to the exact structural predecessor anchor`,
    )
    assert.equal(
      observation.predecessorRole,
      entry.predecessorRole,
      `${label} binds ${entry.groupId} to the exact semantic predecessor role`,
    )
    assert.equal(
      observation.predecessorQuestionId,
      entry.predecessorQuestionId,
      `${label} binds ${entry.groupId} to the previous final question`,
    )
    assert.equal(
      observation.predecessorOptionId,
      entry.predecessorOptionId,
      `${label} binds ${entry.groupId} to the previous final visible option`,
    )
    assert.equal(
      normalizedVisibleText(observation.visibleText).replaceAll(' ', ''),
      normalizedVisibleText(
        observation.visiblePredecessorRole === 'option_line'
          || entry.predecessorRole === 'subsection'
          ? entry.visibleText
          : observation.visibleText,
      ).replaceAll(' ', ''),
      `${label} uses the exact visible predecessor line where Student output exposes it`,
    )
    if (observation.pageRelation === 'next_page_transition') {
      assert.equal(
        observation.letterPage,
        observation.predecessorPage + 1,
        `${label} keeps ${entry.groupId}'s cross-page transition on adjacent pages`,
      )
    } else {
      assert.equal(
        observation.predecessorPage,
        observation.letterPage,
        `${label} keeps ${entry.groupId}'s predecessor and letter on one page`,
      )
    }
  }
  assert.equal(
    observations.length,
    expected.length,
    `${label} rejects predecessor tags for an unknown Reading Group`,
  )
}

function assertTaggedPredecessorAttacksFailClosed(
  observations,
  expected,
  label,
) {
  const [first, second] = observations
  assert.throws(
    () => assertExactTaggedPredecessorObservations(
      observations.slice(1),
      expected,
      label,
    ),
    /exactly one tagged predecessor/,
    `${label} rejects a missing tagged predecessor`,
  )
  assert.throws(
    () => assertExactTaggedPredecessorObservations(
      [...observations, { ...first }],
      expected,
      label,
    ),
    /exactly one tagged predecessor/,
    `${label} rejects a duplicate tagged predecessor`,
  )
  assert.throws(
    () => assertExactTaggedPredecessorObservations(
      observations.map((observation, index) =>
        index === 0
          ? { ...observation, predecessorPage: 'wrong-page' }
          : observation),
      expected,
      label,
    ),
    /one page/,
    `${label} rejects a predecessor on the wrong page`,
  )
  assert.throws(
    () => assertExactTaggedPredecessorObservations(
      observations.map((observation, index) =>
        index === 0
          ? {
              ...observation,
              precedingForGroupId: second.precedingForGroupId,
            }
          : observation),
      expected,
      label,
    ),
    /exactly one tagged predecessor/,
    `${label} rejects a predecessor tagged for the wrong Group`,
  )
  assert.throws(
    () => assertExactTaggedPredecessorObservations(
      observations.map((observation, index) =>
        index === 0
          ? {
              ...observation,
              predecessorAnchorId: second.predecessorAnchorId,
            }
          : observation),
      expected,
      label,
    ),
    /structural predecessor anchor/,
    `${label} rejects a predecessor structurally owned by the wrong Group`,
  )
  assert.throws(
    () => assertExactTaggedPredecessorObservations(
      observations.map((observation, index) =>
        index === 1
          ? { ...observation, predecessorRole: 'question_block' }
          : observation),
      expected,
      label,
    ),
    /semantic predecessor role/,
    `${label} rejects a predecessor with the wrong semantic role`,
  )
  assert.throws(
    () => assertExactTaggedPredecessorObservations(
      observations.map((observation, index) =>
        index === 1
          ? { ...observation, predecessorQuestionId: 'wrong-question' }
          : observation),
      expected,
      label,
    ),
    /previous final question/,
    `${label} rejects a predecessor from the wrong question line`,
  )
  assert.throws(
    () => assertExactTaggedPredecessorObservations(
      observations.map((observation, index) =>
        index === 1
          ? { ...observation, predecessorOptionId: 'wrong-option' }
          : observation),
      expected,
      label,
    ),
    /previous final visible option/,
    `${label} rejects a non-final option anchor`,
  )
}

async function measureScreenPassageLetterGeometry(
  page,
  consumption,
  label,
) {
  const expected = expectedReadingPassageEntries(
    consumption,
    'screen',
    readingPredecessorOracle.screen,
  )
  const measurements = []
  for (const [
    index,
    { groupId, letter },
  ] of expected.entries()) {
    const card = page.locator(
      `[data-paper-browse-anchor="${groupId}"]`,
    )
    const letterElement = card.locator(
      `[data-canonical-passage-letter="${letter}"]`,
    )
    assert.equal(
      await letterElement.count(),
      1,
      `${label} renders ${letter} once inside ${groupId}`,
    )
    const expectedGeometry =
      readingPassageLetterGeometryForLetter(letter, 'screen')
    const geometry = await letterElement.evaluate((element, context) => {
      const letterRect = element.getBoundingClientRect()
      const reading = element.nextElementSibling
      const firstText = reading?.querySelector(
        '[data-canonical-block-id] [data-canonical-content-node-id]',
      )?.firstChild
      if (!reading || !firstText) return null
      const readingRect = reading.getBoundingClientRect()
      const letterRange = document.createRange()
      letterRange.selectNodeContents(element)
      const letterTextRect = letterRange.getBoundingClientRect()
      const firstRange = document.createRange()
      firstRange.selectNodeContents(firstText)
      const firstTextRect = firstRange.getBoundingClientRect()
      const precedingMatches = document.querySelectorAll(
        `[data-canonical-reading-preceding-for="${context.groupId}"]`,
      )
      if (precedingMatches.length !== 1) return null
      const precedingElement = precedingMatches[0]
      if (!precedingElement) return null
      const precedingRange = document.createRange()
      precedingRange.selectNodeContents(precedingElement)
      const precedingTextRects = [...precedingRange.getClientRects()]
      const precedingInkBottom = Math.max(
        ...precedingTextRects.map((rect) => rect.bottom),
      )
      const style = getComputedStyle(element)
      const structuralAnchor = precedingElement.closest(
        '[data-paper-browse-anchor]',
      )
      const predecessorRole = precedingElement.getAttribute(
        'data-canonical-reading-rhythm-role',
      )
      return {
        letterCenterX: letterRect.x + letterRect.width / 2,
        readingCenterX: readingRect.x + readingRect.width / 2,
        letterTextTop: letterTextRect.top,
        letterTextBottom: letterTextRect.bottom,
        letterTextHeight: letterTextRect.height,
        firstTextTop: firstTextRect.top,
        precedingForGroupId: precedingElement.getAttribute(
          'data-canonical-reading-preceding-for',
        ),
        precedingKind: precedingElement.getAttribute(
          'data-canonical-reading-preceding-kind',
        ),
        predecessorRole,
        visiblePredecessorRole: predecessorRole,
        predecessorGroupId:
          predecessorRole === 'option_line'
            ? structuralAnchor?.getAttribute('data-paper-browse-anchor')
            : null,
        predecessorAnchorId: structuralAnchor?.getAttribute(
          'data-paper-browse-anchor',
        ),
        predecessorQuestionId: precedingElement.getAttribute(
          'data-canonical-reading-predecessor-question-id',
        ),
        predecessorOptionId: precedingElement.getAttribute(
          'data-canonical-reading-predecessor-option-id',
        ),
        visibleText: precedingElement.textContent,
        precedingInkBottom,
        precedingBaselineStepPx:
          letterTextRect.bottom - precedingInkBottom,
        fontSizePx: Number.parseFloat(style.fontSize),
        lineHeightPx: Number.parseFloat(style.lineHeight),
        fontWeight: Number.parseInt(style.fontWeight, 10),
        marginTopPx: Number.parseFloat(style.marginTop),
        marginBottomPx: Number.parseFloat(style.marginBottom),
        paddingTopPx: Number.parseFloat(style.paddingTop),
      }
    }, {
      groupId,
      precedingKind: expectedGeometry.precedingKind,
    })
    assert.ok(geometry, `${label} exposes ${groupId} passage-letter geometry`)
    assert.equal(geometry.precedingForGroupId, groupId)
    assert.equal(geometry.precedingKind, expectedGeometry.precedingKind)
    assert.equal(
      geometry.predecessorGroupId,
      expected[index].predecessorGroupId,
      `${label} binds ${groupId} to its exact visible predecessor Group`,
    )
    assert.equal(
      geometry.predecessorAnchorId,
      expected[index].predecessorAnchorId,
      `${label} binds ${groupId} to its exact visible predecessor anchor`,
    )
    assert.equal(
      geometry.predecessorRole,
      expected[index].predecessorRole,
      `${label} binds ${groupId} to the exact predecessor role`,
    )
    assert.equal(
      geometry.predecessorQuestionId,
      expected[index].predecessorQuestionId,
      `${label} binds ${groupId} to the previous final question`,
    )
    assert.equal(
      geometry.predecessorOptionId,
      expected[index].predecessorOptionId,
      `${label} binds ${groupId} to the previous final option`,
    )
    assert.equal(
      normalizedVisibleText(geometry.visibleText).replaceAll(' ', ''),
      normalizedVisibleText(expected[index].visibleText).replaceAll(' ', ''),
      `${label} binds ${groupId} to the exact visible line`,
    )
    const tolerances = passageLetterReference.evidence.tolerances
    assert.equal(
      Math.abs(geometry.letterCenterX - geometry.readingCenterX)
        <= tolerances.screenHorizontalCenterPx,
      true,
      `${label} ${letter} is horizontally centered in the Reading column`,
    )
    assert.equal(
      Math.abs(
        geometry.firstTextTop - geometry.letterTextTop
        - readingPassageLetterTypography.followingGeometry
          .screenBaselineStepPx,
      ) <= readingPassageLetterTypography.followingGeometry.screenTolerancePx,
      true,
      `${label} ${letter} and the first passage line use the ratio-mapped Screen baseline step`,
    )
    assert.equal(
      Math.abs(
        geometry.precedingBaselineStepPx
        - expectedGeometry.screenBaselineStepPx,
      ) <= expectedGeometry.screenTolerancePx,
      true,
      `${label} ${letter} retains the ratio-mapped preceding baseline step: ${JSON.stringify({
        actual: geometry.precedingBaselineStepPx,
        expected: expectedGeometry.screenBaselineStepPx,
      })}`,
    )
    assert.equal(geometry.fontWeight >= 700, true, `${label} ${letter} is bold`)
    assert.equal(
      geometry.marginTopPx,
      Math.min(expectedGeometry.screenBeforeAdjustmentPx, 0),
      `${label} ${letter} uses only its exact authority-bound top adjustment`,
    )
    assert.equal(geometry.marginBottomPx, 0, `${label} ${letter} has no approximate bottom margin`)
    assert.equal(
      geometry.paddingTopPx,
      Math.max(expectedGeometry.screenBeforeAdjustmentPx, 0),
      `${label} ${letter} uses only its exact authority-bound top padding`,
    )
    assert.equal(
      geometry.letterTextHeight >= geometry.fontSizePx
      && geometry.letterTextHeight <= geometry.lineHeightPx,
      true,
      `${label} ${letter} exposes a stable glyph box`,
    )
    measurements.push({
      groupId,
      letter,
      ...geometry,
      predecessorPage: 'screen-flow',
      letterPage: 'screen-flow',
    })
  }
  assertExactTaggedPredecessorObservations(measurements, expected, label)
  assertTaggedPredecessorAttacksFailClosed(measurements, expected, label)
  assert.equal(
    await page.locator('[data-canonical-passage-letter]').count(),
    4,
    `${label} renders no passage letters for non-Reading groups`,
  )
  return measurements
}

async function assertScreenReadingVerticalRhythm(
  page,
  consumption,
  label,
  {
    requireFullVariants = false,
    requireWrappedOption = false,
  } = {},
) {
  const readingSelection = consumption.selections.find(
    (selection) => selection.familyContractId === 'reading',
  )
  const measurements = await page.evaluate((groupIds) => {
    const lineBottoms = (element) => {
      const walker = document.createTreeWalker(
        element,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: (node) =>
            node.textContent?.trim()
              ? NodeFilter.FILTER_ACCEPT
              : NodeFilter.FILTER_REJECT,
        },
      )
      const bottoms = []
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const range = document.createRange()
        range.selectNodeContents(node)
        for (const rect of range.getClientRects()) {
          if (rect.width > 0 && rect.height > 0) bottoms.push(rect.bottom)
        }
      }
      return [...bottoms]
        .sort((left, right) => left - right)
        .reduce((lines, bottom) => {
          const prior = lines.at(-1)
          if (prior === undefined || Math.abs(bottom - prior) > 1) {
            lines.push(bottom)
          } else {
            lines[lines.length - 1] = Math.max(prior, bottom)
          }
          return lines
        }, [])
    }
    return groupIds.map((groupId) => {
      const card = document.querySelector(
        `[data-paper-browse-anchor="${groupId}"]`,
      )
      if (!card) return null
      const letter = card.querySelector(
        '[data-canonical-reading-rhythm-role="passage_letter"]',
      )
      const content = [...card.querySelectorAll(
        [
          '[data-canonical-reading-rhythm-role="passage_title"]',
          '[data-canonical-reading-rhythm-role="passage_subtitle"]',
          '[data-canonical-reading-rhythm-role="passage_body_line"]',
          '[data-canonical-reading-rhythm-role="native_table_line"]',
        ].join(','),
      )].map((element) => ({
        role: element.getAttribute('data-canonical-reading-rhythm-role'),
        lines: lineBottoms(element),
      }))
      const questions = [...card.querySelectorAll(
        '[data-canonical-reading-rhythm-role="question_block"]',
      )].map((question) => ({
        questionId: question.getAttribute('data-canonical-question-id'),
        stem: lineBottoms(question.querySelector(
          '[data-canonical-reading-rhythm-role="question_stem_line"]',
        )),
        options: [...question.querySelectorAll(
          '[data-canonical-reading-rhythm-role="option_line"]',
        )].map((option) => ({
          optionId: option.getAttribute('data-canonical-option-id'),
          lines: lineBottoms(option),
        })),
        placementMode: question.querySelector(
          '[data-canonical-placement-signature]',
        )?.className ?? '',
      }))
      return {
        groupId,
        letter: lineBottoms(letter),
        content,
        questions,
      }
    })
  }, readingSelection.groupIds)
  assert.equal(
    measurements.every(Boolean),
    true,
    `${label} exposes every Reading structural Group`,
  )
  const targets = readingPassageLetterTypography.verticalRhythm.targets.screen
  const assertStep = (actual, ratio, edgeId) => assert.equal(
    Math.abs(actual - targets.baselineStepPx * ratio)
      <= (ratio === 2
        ? targets.twoStepTolerancePx
        : targets.oneStepTolerancePx),
    true,
    `${label} ${edgeId} keeps ${ratio}x rhythm: ${JSON.stringify({
      actual,
      expected: targets.baselineStepPx * ratio,
    })}`,
  )
  const stemLineCounts = new Set()
  const optionRowCounts = new Set()
  const placementModes = new Set()
  let hasTitle = false
  let hasNoTitle = false
  let hasNativeTable = false
  let hasWrappedOption = false
  for (const group of measurements) {
    assert.equal(group.letter.length, 1, `${label} has one letter line`)
    assert.equal(group.content.length > 0, true, `${label} has Reading content`)
    hasTitle ||= group.content.some((entry) => entry.role === 'passage_title')
    hasNoTitle ||= !group.content.some(
      (entry) => entry.role === 'passage_title',
    )
    hasNativeTable ||= group.content.some(
      (entry) => entry.role === 'native_table_line',
    )
    assertStep(
      group.content[0].lines[0] - group.letter[0],
      1,
      'letter_to_first_content',
    )
    for (const entry of group.content) {
      assert.equal(entry.lines.length > 0, true, `${label} has no empty role`)
      for (let index = 1; index < entry.lines.length; index += 1) {
        assertStep(
          entry.lines[index] - entry.lines[index - 1],
          1,
          'passage_content_internal',
        )
      }
    }
    for (let index = 1; index < group.content.length; index += 1) {
      assertStep(
        group.content[index].lines[0]
          - group.content[index - 1].lines.at(-1),
        1,
        'passage_content_internal',
      )
    }
    const firstStem = group.questions[0]?.stem
    assert.equal(firstStem?.length > 0, true, `${label} has a first stem`)
    assertStep(
      firstStem[0] - group.content.at(-1).lines.at(-1),
      2,
      'passage_to_first_question',
    )
    for (const [questionIndex, question] of group.questions.entries()) {
      assert.equal(
        question.questionId,
        projectCanonicalConsumerGroup({
          consumption,
          familyContractId: 'reading',
          groupId: group.groupId,
        }).questions[questionIndex].questionId,
        `${label} keeps exact Question order`,
      )
      stemLineCounts.add(question.stem.length)
      for (let index = 1; index < question.stem.length; index += 1) {
        assertStep(
          question.stem[index] - question.stem[index - 1],
          1,
          'question_stem_internal',
        )
      }
      const optionLines = question.options.flatMap((option) => option.lines)
      const distinctOptionRows = [...optionLines]
        .sort((left, right) => left - right)
        .reduce((rows, bottom) => {
          if (rows.at(-1) === undefined || Math.abs(bottom - rows.at(-1)) > 1) {
            rows.push(bottom)
          }
          return rows
        }, [])
      optionRowCounts.add(distinctOptionRows.length)
      if (question.placementMode.includes('one_column')) {
        placementModes.add('one_column')
      } else if (question.placementMode.includes('two_by_two')) {
        placementModes.add('two_by_two')
      } else if (question.placementMode.includes('four_columns')) {
        placementModes.add('four_columns')
      }
      hasWrappedOption ||= question.options.some(
        (option) => option.lines.length > 1,
      )
      assertStep(
        distinctOptionRows[0] - question.stem.at(-1),
        1,
        'stem_to_options',
      )
      for (let index = 1; index < distinctOptionRows.length; index += 1) {
        assertStep(
          distinctOptionRows[index] - distinctOptionRows[index - 1],
          1,
          'option_line_internal',
        )
      }
      const nextQuestion = group.questions[questionIndex + 1]
      if (nextQuestion) {
        assertStep(
          nextQuestion.stem[0] - distinctOptionRows.at(-1),
          1,
          'question_to_next_question',
        )
      }
    }
  }
  assert.equal(hasTitle && hasNoTitle, true, `${label} covers title/no-title`)
  assert.equal(hasNativeTable, true, `${label} covers a native Reading table`)
  if (requireFullVariants) {
    assert.equal(
      stemLineCounts.has(1) && stemLineCounts.has(2),
      true,
      `${label} covers one- and two-line stems`,
    )
    assert.equal(
      [1, 2, 4].every((rowCount) => optionRowCounts.has(rowCount)),
      true,
      `${label} covers one-, two-, and four-row option layouts`,
    )
    assert.deepEqual(
      [...placementModes].sort(),
      ['four_columns', 'one_column', 'two_by_two'],
      `${label} covers every canonical ABCD placement mode`,
    )
  }
  if (requireWrappedOption) {
    assert.equal(
      hasWrappedOption,
      true,
      `${label} covers wrapped one-column options`,
    )
  }
  const chromeGeometry = await page.evaluate((firstGroupId) => {
    const firstCard = document.querySelector(
      `[data-paper-browse-anchor="${firstGroupId}"]`,
    )
    const roleElements = [...document.querySelectorAll(
      [
        '[data-canonical-reading-rhythm-role="part_title"]',
        '[data-canonical-reading-rhythm-role="subsection"]',
        '[data-canonical-reading-rhythm-role="meta_instruction"]',
      ].join(','),
    )].filter((element) =>
      firstCard
      && (element.compareDocumentPosition(firstCard)
        & Node.DOCUMENT_POSITION_FOLLOWING))
    const bottom = (element) => {
      const range = document.createRange()
      range.selectNodeContents(element)
      return Math.max(...[...range.getClientRects()].map((rect) => rect.bottom))
    }
    const letter = firstCard?.querySelector(
      '[data-canonical-reading-rhythm-role="passage_letter"]',
    )
    return {
      roles: roleElements.map((element) => ({
        role: element.getAttribute('data-canonical-reading-rhythm-role'),
        bottom: bottom(element),
      })),
      letterBottom: letter ? bottom(letter) : null,
    }
  }, readingSelection.groupIds[0])
  assert.equal(
    chromeGeometry.roles.length > 0,
    true,
    `${label} exposes Reading chrome`,
  )
  for (let index = 1; index < chromeGeometry.roles.length; index += 1) {
    assertStep(
      chromeGeometry.roles[index].bottom
        - chromeGeometry.roles[index - 1].bottom,
      1,
      'chrome_internal',
    )
  }
  assertStep(
    chromeGeometry.letterBottom - chromeGeometry.roles.at(-1).bottom,
    1,
    'chrome_to_a',
  )
  const ending = readingPredecessorOracle.readingEnd
  assert.equal(
    await page.locator(
      `[data-canonical-reading-following-for="${ending.groupId}"]`,
    ).count(),
    1,
    `${label} exposes exactly one post-Reading section anchor`,
  )
  const endGeometry = await page.evaluate((oracle) => {
    const option = document.querySelector(
      `[data-canonical-reading-before-section="${oracle.nextSectionId}"]`,
    )
    const section = document.querySelector(
      `[data-canonical-reading-following-for="${oracle.groupId}"]`,
    )
    const bottom = (element) => {
      const range = document.createRange()
      range.selectNodeContents(element)
      return Math.max(...[...range.getClientRects()].map((rect) => rect.bottom))
    }
    if (!option || !section) return null
    return {
      optionRole: option.getAttribute('data-canonical-reading-rhythm-role'),
      optionQuestionId: option.getAttribute(
        'data-canonical-reading-predecessor-question-id',
      ),
      optionId: option.getAttribute(
        'data-canonical-reading-predecessor-option-id',
      ),
      sectionRole: section.getAttribute(
        'data-canonical-reading-rhythm-role',
      ),
      sectionText: section.textContent?.trim(),
      step: bottom(section) - bottom(option),
    }
  }, ending)
  assert.ok(endGeometry, `${label} exposes the Reading D ending boundary`)
  assert.equal(endGeometry.optionRole, 'option_line')
  assert.equal(endGeometry.optionQuestionId, ending.predecessorQuestionId)
  assert.equal(endGeometry.optionId, ending.predecessorOptionId)
  assert.equal(endGeometry.sectionRole, ending.nextSectionRole)
  assert.equal(
    normalizedVisibleText(endGeometry.sectionText),
    normalizedVisibleText(ending.screenNextSectionVisibleText),
  )
  assertStep(endGeometry.step, 2, 'reading_to_next_section_same_page')
  return measurements
}

function sevenChoicesCoverageEdge(edgeId) {
  const edge = sevenChoicesCoverageOracle.oracle.edges.find(
    (candidate) => candidate.edgeId === edgeId,
  )
  assert.ok(edge, `independent Seven Choices oracle declares ${edgeId}`)
  return edge
}

function sevenChoicesTextDigest(value) {
  return sha256(Buffer.from(normalizedVisibleText(value || ''), 'utf8'))
}

function recordSevenChoicesEdge(
  recordCoverage,
  {
    bundleId,
    variant,
    edgeId,
    fromIdentity,
    toIdentity,
    fromText,
    toText,
    actualRatio = null,
    pageRelation = null,
    atomic = null,
  },
) {
  if (!recordCoverage) return
  const edge = sevenChoicesCoverageEdge(edgeId)
  if (edge.baselineStepRatio !== undefined) {
    assert.equal(
      Number.isFinite(actualRatio),
      true,
      `${bundleId}/${variant}/${edgeId} records an executable ratio`,
    )
  }
  if (edge.extraBaselineStepRatio !== undefined) {
    assert.equal(
      actualRatio,
      edge.extraBaselineStepRatio,
      `${bundleId}/${variant}/${edgeId} records zero extra baseline space`,
    )
  }
  if (edge.pageRelation) {
    assert.equal(
      pageRelation,
      edge.pageRelation,
      `${bundleId}/${variant}/${edgeId} records its exact page relation`,
    )
  }
  assert.equal(
    typeof fromIdentity === 'string' && fromIdentity.length > 0,
    true,
    `${bundleId}/${variant}/${edgeId} records its source-bound from identity`,
  )
  assert.equal(
    typeof toIdentity === 'string' && toIdentity.length > 0,
    true,
    `${bundleId}/${variant}/${edgeId} records its source-bound to identity`,
  )
  recordCoverage({
    bundleId,
    variant,
    edgeId,
    fromIdentity,
    toIdentity,
    fromTextDigest: sevenChoicesTextDigest(fromText),
    toTextDigest: sevenChoicesTextDigest(toText),
    ...(actualRatio === null ? {} : { actualRatio }),
    ...(pageRelation === null ? {} : { pageRelation }),
    ...(atomic === null ? {} : { atomic }),
  })
}

function assertSevenChoicesObservedCoverage(observations) {
  const oracle = sevenChoicesCoverageOracle.oracle
  const expectedBundleIds = oracle.requiredBundles.map(
    (bundle) => bundle.bundleId,
  )
  assert.deepEqual(
    [...new Set(observations.map((entry) => entry.bundleId))].sort(),
    [...expectedBundleIds].sort(),
    'Seven Choices observed coverage exposes exactly every required public-surface bundle',
  )
  for (const bundle of oracle.requiredBundles) {
    const actual = observations.filter(
      (entry) => entry.bundleId === bundle.bundleId,
    )
    assert.deepEqual(
      [...new Set(actual.map((entry) => entry.variant))].sort(),
      [...bundle.variants].sort(),
      `${bundle.bundleId} executes exactly every independent required variant`,
    )
    assert.deepEqual(
      [...new Set(actual.map((entry) => entry.edgeId))].sort(),
      [...bundle.expectedEdgeIds].sort(),
      `${bundle.bundleId} observed edge-ID set exactly equals its independent oracle set`,
    )
  }
  const expectedEdgeIds = oracle.edges.map((edge) => edge.edgeId)
  assert.deepEqual(
    [...new Set(observations.map((entry) => entry.edgeId))].sort(),
    [...expectedEdgeIds].sort(),
    'the complete observed public-artifact ledger exactly equals the independent 22-edge oracle set',
  )
  return {
    schemaVersion: 'seven-choices-observed-coverage-ledger-v1',
    oraclePath: path.relative(repositoryRoot, sevenChoicesCoverageOraclePath),
    oracleSha256: sevenChoicesCoverageOracle.digest,
    edgeIds: [...expectedEdgeIds],
    bundles: oracle.requiredBundles.map((bundle) => ({
      bundleId: bundle.bundleId,
      variants: [...bundle.variants],
      edgeIds: [...new Set(observations
        .filter((entry) => entry.bundleId === bundle.bundleId)
        .map((entry) => entry.edgeId))],
      observations: observations.filter(
        (entry) => entry.bundleId === bundle.bundleId,
      ),
    })),
  }
}

function recordClozeBundleCoverage(
  observations,
  {
    bundleId,
    variant,
    proof,
  },
) {
  const bundle = clozeCoverageOracle.oracle.requiredBundles.find(
    (candidate) => candidate.bundleId === bundleId,
  )
  assert.ok(bundle, `independent Cloze oracle declares ${bundleId}`)
  assert.equal(
    bundle.variants.includes(variant),
    true,
    `${bundleId} independently requires ${variant}`,
  )
  const profileId =
    clozeCoverageOracle.oracle.variantOracle.profileByBundleVariant[
      `${bundleId}/${variant}`
    ]
  const expectedVariantEdges =
    clozeCoverageOracle.oracle.variantOracle.profiles[profileId]
  assert.equal(
    Array.isArray(expectedVariantEdges),
    true,
    `${bundleId}/${variant} resolves its independent exact edge profile`,
  )
  assert.equal(
    Array.isArray(proof?.observedEdges) && proof.observedEdges.length > 0,
    true,
    `${bundleId}/${variant} returns real public-artifact edge observations`,
  )
  assert.equal(
    new Set(proof.observedEdges.map((entry) => entry.edgeId)).size,
    proof.observedEdges.length,
    `${bundleId}/${variant} observes each edge at most once`,
  )
  for (const observed of proof.observedEdges) {
    assert.equal(
      expectedVariantEdges.includes(observed.edgeId),
      true,
      `${bundleId}/${variant} observes only its independently declared edges`,
    )
    observations.push({
      bundleId,
      variant,
      ...observed,
      proof: 'source_identity_and_public_geometry_assertion',
      proofDigest: sha256(Buffer.from(JSON.stringify(observed), 'utf8')),
    })
  }
}

function assertClozeObservedCoverage(observations) {
  const oracle = clozeCoverageOracle.oracle
  for (const bundle of oracle.requiredBundles) {
    const actual = observations.filter(
      (entry) => entry.bundleId === bundle.bundleId,
    )
    assert.deepEqual(
      [...new Set(actual.map((entry) => entry.variant))].sort(),
      [...bundle.variants].sort(),
      `${bundle.bundleId} executes exactly every independent Cloze variant`,
    )
    assert.deepEqual(
      [...new Set(actual.map((entry) => entry.edgeId))].sort(),
      [...bundle.expectedEdgeIds].sort(),
      `${bundle.bundleId} observed edge set exactly equals its independent oracle`,
    )
    assert.equal(
      new Set(actual.map((entry) =>
        `${entry.variant}:${entry.edgeId}`)).size,
      actual.length,
      `${bundle.bundleId} has no duplicate variant/edge observation`,
    )
    for (const variant of bundle.variants) {
      const profileId =
        oracle.variantOracle.profileByBundleVariant[
          `${bundle.bundleId}/${variant}`
        ]
      assert.deepEqual(
        actual.filter((entry) => entry.variant === variant)
          .map((entry) => entry.edgeId)
          .sort(),
        [...oracle.variantOracle.profiles[profileId]].sort(),
        `${bundle.bundleId}/${variant} observed edge set exactly equals its independent oracle set`,
      )
    }
  }
  assert.deepEqual(
    [...new Set(observations.map((entry) => entry.edgeId))].sort(),
    oracle.edges.map((edge) => edge.edgeId).sort(),
    'complete Cloze public ledger exactly equals the independent 26-edge oracle',
  )
  return {
    schemaVersion: 'cloze-observed-coverage-ledger-v1',
    oraclePath: path.relative(repositoryRoot, clozeCoverageOraclePath),
    oracleSha256: clozeCoverageOracle.digest,
    edgeIds: oracle.edges.map((edge) => edge.edgeId),
    bundles: oracle.requiredBundles.map((bundle) => ({
      bundleId: bundle.bundleId,
      variants: [...bundle.variants],
      edgeIds: [...new Set(observations
        .filter((entry) => entry.bundleId === bundle.bundleId)
        .map((entry) => entry.edgeId))],
      observations: observations.filter(
        (entry) => entry.bundleId === bundle.bundleId,
      ),
    })),
  }
}

function recordGrammarFillBundleCoverage(
  observations,
  {
    bundleId,
    variant,
    proof,
  },
) {
  const bundle = grammarFillCoverageOracle.oracle.requiredBundles.find(
    (candidate) => candidate.bundleId === bundleId,
  )
  assert.ok(bundle, `independent Grammar Fill oracle declares ${bundleId}`)
  assert.equal(
    bundle.variants.includes(variant),
    true,
    `${bundleId} independently requires ${variant}`,
  )
  assert.equal(
    Array.isArray(proof?.observedEdges) && proof.observedEdges.length > 0,
    true,
    `${bundleId}/${variant} returns measured public-artifact edges`,
  )
  assert.equal(
    new Set(proof.observedEdges.map((entry) => entry.edgeId)).size,
    proof.observedEdges.length,
    `${bundleId}/${variant} records every edge at most once`,
  )
  for (const observed of proof.observedEdges) {
    assert.equal(
      bundle.expectedEdgeIds.includes(observed.edgeId),
      true,
      `${bundleId}/${variant} records only independent oracle edges`,
    )
    observations.push({
      bundleId,
      variant,
      ...observed,
      proof: 'source_identity_and_public_geometry_assertion',
      proofDigest: sha256(Buffer.from(JSON.stringify(observed), 'utf8')),
    })
  }
}

function assertGrammarFillObservedCoverage(observations) {
  const oracle = grammarFillCoverageOracle.oracle
  for (const bundle of oracle.requiredBundles) {
    const actual = observations.filter(
      (entry) => entry.bundleId === bundle.bundleId,
    )
    assert.deepEqual(
      [...new Set(actual.map((entry) => entry.variant))].sort(),
      [...bundle.variants].sort(),
      `${bundle.bundleId} executes exactly every Grammar Fill variant`,
    )
    assert.deepEqual(
      [...new Set(actual.map((entry) => entry.edgeId))].sort(),
      [...bundle.expectedEdgeIds].sort(),
      `${bundle.bundleId} observed set exactly equals its independent oracle`,
    )
    assert.equal(
      new Set(actual.map((entry) =>
        `${entry.variant}:${entry.edgeId}`)).size,
      actual.length,
      `${bundle.bundleId} has no duplicate variant/edge observation`,
    )
  }
  assert.deepEqual(
    [...new Set(observations.map((entry) => entry.edgeId))].sort(),
    oracle.edges.map((edge) => edge.edgeId).sort(),
    'complete Grammar Fill ledger exactly equals the independent 32-edge oracle',
  )
  return {
    schemaVersion: 'grammar-fill-observed-coverage-ledger-v2',
    oraclePath: path.relative(
      repositoryRoot,
      grammarFillCoverageOraclePath,
    ),
    oracleSha256: grammarFillCoverageOracle.digest,
    publicAdversaryOraclePath: path.relative(
      repositoryRoot,
      grammarFillPublicAdversaryOraclePath,
    ),
    publicAdversaryOracleSha256:
      grammarFillPublicAdversaryOracle.digest,
    adversaryConstructionBoundary:
      grammarFillPublicAdversaryOracle.oracle
        .authorityBoundary.constructionBoundary,
    edgeIds: oracle.edges.map((edge) => edge.edgeId),
    bundles: oracle.requiredBundles.map((bundle) => ({
      bundleId: bundle.bundleId,
      variants: [...bundle.variants],
      edgeIds: [...new Set(observations
        .filter((entry) => entry.bundleId === bundle.bundleId)
        .map((entry) => entry.edgeId))],
      observations: observations.filter(
        (entry) => entry.bundleId === bundle.bundleId,
      ),
    })),
  }
}

async function assertClozeDomGeometry(
  page,
  label,
  {
    teacher = false,
    wrappedOption = false,
    expectedRows = clozeSourceOracle.questionRows,
    expectedPassageTexts =
      clozeSourceOracle.paperAsset.content.groups[
        clozeSourceOracle.oracle.publicIdentities.cloze.groupId
      ].passage.paragraphs.map((paragraph) => paragraph.text),
  } = {},
) {
  const expected = clozeSourceOracle
  const observation = await page.evaluate(({ previousGroupId }) => {
    const group = document.querySelector(
      '[data-canonical-group-type="cloze"]',
    )
    if (!(group instanceof HTMLElement)) return { missingGroup: true }
    const visualLines = (element) => {
      if (!(element instanceof Element)) return []
      const range = document.createRange()
      range.selectNodeContents(element)
      const lines = []
      for (const rect of range.getClientRects()) {
        const center = rect.y + rect.height / 2
        const line = lines.find(
          (candidate) => Math.abs(candidate.center - center) <= 1,
        )
        if (line) {
          line.x = Math.min(line.x, rect.x)
          line.right = Math.max(line.right, rect.right)
        } else {
          lines.push({
            x: rect.x,
            right: rect.right,
            y: rect.y,
            height: rect.height,
            center,
          })
        }
      }
      return lines.sort((left, right) =>
        left.center - right.center || left.x - right.x)
    }
    const role = (value) => [
      ...document.querySelectorAll(
        `[data-canonical-cloze-rhythm-role="${value}"]`,
      ),
    ]
    const groupRole = (value) => [
      ...group.querySelectorAll(
        `[data-canonical-cloze-rhythm-role="${value}"]`,
      ),
    ]
    const paragraphs = groupRole('passage_body_line').map((element) => ({
      id: element.getAttribute('data-canonical-paragraph-id')
        || element.getAttribute('data-paper-paragraph-id'),
      text: element.textContent || '',
      rect: element.getBoundingClientRect().toJSON(),
      lineHeight: Number.parseFloat(getComputedStyle(element).lineHeight),
      lines: visualLines(element),
    }))
    const blanks = groupRole('inline_blank_marker').map((element) => {
      const ruled = element.querySelector('.print-blank') || element
      const rect = ruled.getBoundingClientRect()
      const style = getComputedStyle(ruled)
      const paragraph = element.closest(
        '[data-canonical-cloze-rhythm-role="passage_body_line"]',
      )
      return {
        questionId: element.getAttribute('data-canonical-question-id'),
        blankId: element.getAttribute('data-canonical-blank-id'),
        pair: element.getAttribute('data-canonical-pair'),
        text: element.textContent || '',
        width: rect.width,
        fontSize: Number.parseFloat(style.fontSize),
        height: rect.height,
        paragraphLineHeight: paragraph
          ? Number.parseFloat(getComputedStyle(paragraph).lineHeight)
          : null,
        whiteSpace: style.whiteSpace,
        textAlign: style.textAlign,
        display: style.display,
        containsPunctuation: /[.,;:!?，。；：！？]/u.test(
          element.textContent || '',
        ),
      }
    })
    const rows = groupRole('choice_row').map((row) => {
      const labels = [
        ...row.querySelectorAll(
          '[data-canonical-cloze-rhythm-role="choice_label"]',
        ),
      ]
      const texts = [
        ...row.querySelectorAll(
          '[data-canonical-cloze-rhythm-role="choice_text"]',
        ),
      ]
      const placement = row.querySelector(
        '[data-canonical-column-starts-pt]',
      )
      const labelRects = labels.map((element) =>
        element.getBoundingClientRect())
      const textRects = texts.map((element) =>
        element.getBoundingClientRect())
      const textLineRects = texts.map((element) => {
        return visualLines(element)
      })
      const question = row.querySelector(
        '.qnum, .ps-question-number, .ps-question-no',
      )
      return {
        questionId: row.getAttribute('data-canonical-question-id')
          || row.getAttribute('data-paper-question-id'),
        rowRect: row.getBoundingClientRect().toJSON(),
        questionText: question?.textContent || '',
        questionLines: visualLines(question),
        labels: labels.map((element) => element.textContent || ''),
        texts: texts.map((element) => element.textContent || ''),
        labelXs: labelRects.map((rect) => rect.x),
        labelYs: labelRects.map((rect) => rect.y),
        textXs: textRects.map((rect) => rect.x),
        textYs: textRects.map((rect) => rect.y),
        textLineRects,
        columnStartsPt:
          placement?.getAttribute('data-canonical-column-starts-pt'),
        placementMode:
          placement?.getAttribute('data-canonical-placement-mode')
          || placement?.className,
        lineHeight: Number.parseFloat(getComputedStyle(row).lineHeight),
        breakInside: getComputedStyle(row).breakInside,
      }
    })
    const part = role('part_title')[0]
    const partCenter = visualLines(part)[0]?.center
    const previousFamily = [
      ...document.querySelectorAll(
        `[data-canonical-group-id="${previousGroupId}"] [data-canonical-seven-choices-rhythm-role], [data-paper-browse-anchor="${previousGroupId}"] [data-canonical-seven-choices-rhythm-role]`,
      ),
    ].flatMap((element) =>
      visualLines(element).map((line) => ({
        line,
        role: element.getAttribute(
          'data-canonical-seven-choices-rhythm-role',
        ),
        identity:
          element.getAttribute('data-canonical-option-id')
          || element.closest('[data-canonical-question-id]')
            ?.getAttribute('data-canonical-question-id')
          || previousGroupId,
        text: element.textContent || '',
      })))
      .filter((entry) => entry.line.center < partCenter)
      .sort((left, right) => left.line.center - right.line.center)
      .at(-1)
    return {
      missingGroup: false,
      previousFamily,
      previousFamilyIds: [
        ...document.querySelectorAll(
          '[data-canonical-cloze-previous-family-group-id]',
        ),
      ].map((element) =>
        element.getAttribute(
          'data-canonical-cloze-previous-family-group-id',
        )),
      chrome: role('part_title')
        .concat(role('subsection'), role('meta_instruction'))
        .map((element) => ({
          role: element.getAttribute('data-canonical-cloze-rhythm-role'),
          text: element.textContent || '',
          rect: element.getBoundingClientRect().toJSON(),
          lineHeight: Number.parseFloat(getComputedStyle(element).lineHeight),
          lines: visualLines(element),
        })),
      following: role('next_section').map((element) => ({
        id: element.getAttribute('data-paper-browse-anchor')
          || element.id,
        groupId: element.getAttribute(
          'data-canonical-cloze-following-group-id',
        ),
        text: element.textContent || '',
        lines: visualLines(element),
      })),
      paragraphs,
      blanks,
      rows,
      answers: groupRole('answer_line').map((element) => ({
        text: element.textContent || '',
        questionId:
          element.closest('[data-canonical-question-id]')
            ?.getAttribute('data-canonical-question-id'),
        lines: visualLines(element),
      })),
      explanations: groupRole('explanation_line').map((element) => ({
        text: element.textContent || '',
        questionId:
          element.closest('[data-canonical-question-id]')
            ?.getAttribute('data-canonical-question-id'),
        lines: visualLines(element),
      })),
    }
  }, {
    previousGroupId:
      expected.oracle.publicIdentities.sevenChoicesBoundary.groupId,
  })
  assert.equal(observation.missingGroup, false, `${label} exposes Cloze`)
  const observedEdges = []
  const observe = (edgeId, evidence) => {
    assert.equal(
      observedEdges.some((entry) => entry.edgeId === edgeId),
      false,
      `${label} records ${edgeId} once`,
    )
    observedEdges.push({ edgeId, ...evidence })
  }
  const baselineStepPx = clozeRhythm.targets.screen.baselineStepPx
  const assertStep = (edgeId, actualPx) => {
    const authorityEdge = clozeRhythm.adjacencyGraph.find(
      (edge) => edge.edgeId === edgeId,
    )
    assert.ok(
      Number.isFinite(authorityEdge?.baselineStepRatio),
      `${label} resolves ${edgeId} ratio authority`,
    )
    const tolerancePx =
      authorityEdge.baselineStepRatio === 1
        ? clozeRhythm.targets.screen.oneStepTolerancePx
        : authorityEdge.baselineStepRatio === 1.5
          ? clozeRhythm.targets.screen.threeHalfStepTolerancePx
          : clozeRhythm.targets.screen.twoStepTolerancePx
    assert.equal(
      Math.abs(
        actualPx - authorityEdge.baselineStepRatio * baselineStepPx,
      ) <= tolerancePx,
      true,
      `${label} measures ${edgeId} at ${authorityEdge.baselineStepRatio} local baseline steps: ${JSON.stringify({ actualPx, expectedPx: authorityEdge.baselineStepRatio * baselineStepPx })}`,
    )
    return actualPx / baselineStepPx
  }
  assert.equal(
    observation.previousFamilyIds.includes(
      expected.oracle.publicIdentities.sevenChoicesBoundary.groupId,
    ),
    true,
    `${label} binds the exact visible Seven Choices predecessor identity`,
  )
  assert.deepEqual(
    observation.chrome.map((entry) => entry.role),
    ['part_title', 'subsection', 'meta_instruction'],
    `${label} exposes exact ordered Cloze chrome roles`,
  )
  assert.ok(
    observation.previousFamily?.line,
    `${label} resolves the visible Seven Choices family tail`,
  )
  const previousToChromePx =
    observation.chrome[0].lines[0].center
    - observation.previousFamily.line.center
  observe('previous_family_to_chrome_same_page', {
    fromIdentity: observation.previousFamily.identity,
    toIdentity: 'cloze:part_title',
    fromText: normalizedVisibleText(observation.previousFamily.text),
    toText: normalizedVisibleText(observation.chrome[0].text),
    actualRatio: assertStep(
      'previous_family_to_chrome_same_page',
      previousToChromePx,
    ),
  })
  const chromeGaps = observation.chrome.slice(1).map(
    (entry, index) =>
      entry.lines[0].center - observation.chrome[index].lines.at(-1).center,
  )
  assert.equal(
    chromeGaps.every((gap) =>
      Math.abs(
        gap - clozeRhythm.targets.screen.baselineStepPx,
      ) <= clozeRhythm.targets.screen.oneStepTolerancePx),
    true,
    `${label} measures every adjacent Cloze chrome role at one local baseline step: ${JSON.stringify(chromeGaps)}`,
  )
  observe('chrome_internal', {
    fromIdentity: observation.chrome[0].role,
    toIdentity: observation.chrome.at(-1).role,
    fromText: normalizedVisibleText(observation.chrome[0].text),
    toText: normalizedVisibleText(observation.chrome.at(-1).text),
    actualRatios: chromeGaps.map((gap) => gap / baselineStepPx),
  })
  const chromeToPassagePx =
    observation.paragraphs[0].lines[0].center
    - observation.chrome.at(-1).lines.at(-1).center
  observe('chrome_to_passage', {
    fromIdentity: observation.chrome.at(-1).role,
    toIdentity: observation.paragraphs[0].id,
    fromText: normalizedVisibleText(observation.chrome.at(-1).text),
    toText: normalizedVisibleText(observation.paragraphs[0].text),
    actualRatio: assertStep('chrome_to_passage', chromeToPassagePx),
  })
  assert.deepEqual(
    observation.chrome.map((entry) => normalizedVisibleText(entry.text)),
    [
      expected.oracle.publicVisibleChrome.part,
      expected.oracle.publicVisibleChrome.section,
      expected.oracle.publicVisibleChrome.instruction,
    ].map(normalizedVisibleText),
    `${label} chrome text is source-bound rather than DOM-order authority`,
  )
  assert.deepEqual(
    observation.paragraphs.map((entry) => entry.id),
    expected.oracle.publicIdentities.cloze.paragraphIds,
    `${label} passage roles preserve source paragraph identities`,
  )
  assert.deepEqual(
    observation.paragraphs.map((entry, index) =>
      normalizedVisibleText(entry.text)),
    expectedPassageTexts.map((text) =>
      normalizedVisibleText(text.replace(/__(\d+)__/g, '$1'))),
    `${label} preserves passage words, spaces, punctuation, and inline blank numbers`,
  )
  assert.deepEqual(
    observation.blanks.map((blank) => blank.questionId),
    expected.oracle.publicIdentities.cloze.questionIds,
    `${label} exposes each source Question identity exactly once`,
  )
  assert.deepEqual(
    observation.blanks.map((blank) => blank.blankId),
    expected.oracle.publicIdentities.cloze.blankIds,
    `${label} exposes each source Blank identity exactly once`,
  )
  for (const [index, blank] of observation.blanks.entries()) {
    const questionId = expected.oracle.publicIdentities.cloze.questionIds[index]
    const blankId = expected.oracle.publicIdentities.cloze.blankIds[index]
    assert.equal(blank.pair, `${questionId}:${blankId}`)
    assert.equal(normalizedVisibleText(blank.text), String(41 + index))
    assert.equal(Math.abs(blank.width / blank.fontSize - 3.3) <= 0.08, true)
    assert.equal(blank.whiteSpace, 'nowrap')
    assert.equal(blank.textAlign, 'center')
    assert.equal(
      ['inline-block', 'inline-flex'].includes(blank.display),
      true,
      `${label} blank ${blankId} is an unbroken atomic inline unit`,
    )
    assert.equal(blank.containsPunctuation, false)
    assert.equal(
      blank.height <= blank.paragraphLineHeight + 1,
      true,
      `${label} blank ${blankId} adds zero phantom vertical space`,
    )
  }
  observe('inline_blank_no_phantom_space', {
    fromIdentity: observation.paragraphs[0].id,
    toIdentity: observation.blanks.map((blank) => blank.blankId),
    extraBaselineStepRatios: observation.blanks.map(
      (blank) =>
        Math.max(0, blank.height - blank.paragraphLineHeight)
        / baselineStepPx,
    ),
  })
  observe('inline_blank_atomicity', {
    fromIdentity: observation.blanks.map((blank) => blank.blankId),
    pageRelation: 'same_line_unsplittable',
    displays: observation.blanks.map((blank) => blank.display),
  })
  observe('inline_blank_punctuation_outside', {
    fromIdentity: observation.blanks.map((blank) => blank.blankId),
    toIdentity: observation.paragraphs.map((paragraph) => paragraph.id),
    pageRelation: 'punctuation_sibling',
  })
  const internalPassageGaps = observation.paragraphs.flatMap(
    (paragraph) => paragraph.lines.slice(1).map(
      (line, index) => line.center - paragraph.lines[index].center,
    ),
  )
  assert.equal(
    internalPassageGaps.length > 0
    && internalPassageGaps.every((gap) =>
      Math.abs(gap - baselineStepPx)
        <= clozeRhythm.targets.screen.oneStepTolerancePx),
    true,
    `${label} measures every same-paragraph line at one local baseline step`,
  )
  observe('passage_line_internal', {
    fromIdentity: observation.paragraphs.map((paragraph) => paragraph.id),
    toIdentity: observation.paragraphs.map((paragraph) => paragraph.id),
    actualRatios: internalPassageGaps.map((gap) => gap / baselineStepPx),
  })
  const paragraphGaps = observation.paragraphs.slice(1).map(
    (paragraph, index) =>
      paragraph.lines[0].center
      - observation.paragraphs[index].lines.at(-1).center,
  )
  assert.equal(
    paragraphGaps.every((gap) =>
      Math.abs(gap - baselineStepPx)
        <= clozeRhythm.targets.screen.oneStepTolerancePx),
    true,
    `${label} measures every source paragraph transition at one local baseline step`,
  )
  observe('paragraph_transition', {
    fromIdentity: observation.paragraphs.slice(0, -1)
      .map((paragraph) => paragraph.id),
    toIdentity: observation.paragraphs.slice(1)
      .map((paragraph) => paragraph.id),
    actualRatios: paragraphGaps.map((gap) => gap / baselineStepPx),
  })
  assert.deepEqual(
    observation.rows.map((row) => row.questionId),
    expected.oracle.publicIdentities.cloze.questionIds,
    `${label} renders source Questions 41-55 exactly once`,
  )
  for (const [index, row] of observation.rows.entries()) {
    const sourceRow = expectedRows[index]
    assert.deepEqual(
      row.labels.map(normalizedVisibleText),
      sourceRow.options.map((option) => `${option.label}.`),
    )
    assert.deepEqual(
      row.texts.map(normalizedVisibleText),
      sourceRow.options.map((option) => option.text),
    )
    assert.equal(row.columnStartsPt, '0,104,208,312')
    assert.match(String(row.placementMode), /four_columns/)
    const relativeLabelXs = row.labelXs.map((x) => x - row.labelXs[0])
    const expectedPitchPx = 104 * 96 / 72
    assert.equal(
      relativeLabelXs.every(
        (x, track) => Math.abs(x - expectedPitchPx * track) <= 2,
      ),
      true,
      `${label} ${sourceRow.questionId} retains four fixed origin-pitch tracks`,
    )
    assert.equal(
      row.labelYs.every((y) => Math.abs(y - row.labelYs[0]) <= 1),
      true,
      `${label} ${sourceRow.questionId} keeps A-D labels on one baseline`,
    )
    assert.equal(
      row.textXs.every((x, track) => x > row.labelXs[track]),
      true,
      `${label} ${sourceRow.questionId} keeps a stable label/text-start gap`,
    )
    assert.equal(
      row.textYs.every((y, track) =>
        Math.abs(y - row.labelYs[track]) <= 1),
      true,
      `${label} ${sourceRow.questionId} keeps label-plus-text atomic`,
    )
    assert.equal(
      row.breakInside,
      'avoid',
      `${label} ${sourceRow.questionId} is an unsplittable row strategy`,
    )
  }
  const firstRow = observation.rows[0]
  const passageTailToFirstRowPx =
    firstRow.questionLines[0].center
    - observation.paragraphs.at(-1).lines.at(-1).center
  observe('passage_tail_to_first_choice_row', {
    fromIdentity: observation.paragraphs.at(-1).id,
    toIdentity: firstRow.questionId,
    fromText: normalizedVisibleText(observation.paragraphs.at(-1).text),
    toText: normalizedVisibleText(firstRow.questionText),
    actualRatio: assertStep(
      'passage_tail_to_first_choice_row',
      passageTailToFirstRowPx,
    ),
  })
  observe('choice_row_question_to_first_track', {
    fromIdentity: firstRow.questionId,
    toIdentity: `${firstRow.questionId}:A`,
    horizontalRelation: 'fixed_question_to_A_anchor',
    actualPx:
      firstRow.labelXs[0] - firstRow.questionLines[0].x,
  })
  observe('choice_label_to_text', {
    fromIdentity: observation.rows.map((row) => `${row.questionId}:label`),
    toIdentity: observation.rows.map((row) => `${row.questionId}:text`),
    horizontalRelation: 'fixed_em_gap',
    actualGapsPx: observation.rows.flatMap((row) =>
      row.textXs.map((x, track) => x - row.labelXs[track])),
  })
  observe('choice_tracks_internal', {
    fromIdentity: firstRow.labels,
    toIdentity: firstRow.labels,
    horizontalRelation: 'four_fixed_equal_origin_pitch_tracks',
    relativeOriginsPx: firstRow.labelXs.map(
      (x) => x - firstRow.labelXs[0],
    ),
  })
  observe('choice_row_baseline', {
    fromIdentity: observation.rows[0].questionId,
    toIdentity: observation.rows.at(-1).questionId,
    actualLineHeightRatios: observation.rows.map(
      (row) => row.lineHeight / baselineStepPx,
    ),
  })
  observe('choice_label_text_atomicity', {
    fromIdentity: observation.rows.map((row) => row.questionId),
    pageRelation: 'same_atomic_option',
    labelTextBaselineDeltasPx: observation.rows.flatMap((row) =>
      row.textYs.map((y, track) => y - row.labelYs[track])),
  })
  observe('choice_row_unsplittable', {
    fromIdentity: observation.rows.map((row) => row.questionId),
    pageRelation: 'same_page_unit',
    breakInside: observation.rows.map((row) => row.breakInside),
  })
  assert.equal(
    observation.following.some((entry) =>
      (
        entry.id === expected.oracle.publicIdentities.followingSection.sectionId
        || entry.groupId
          === expected.oracle.publicIdentities.followingSection.groupId
      )
      && normalizedVisibleText(entry.text)
          === normalizedVisibleText(
          expected.oracle.publicVisibleChrome.followingSection,
        )),
    true,
    `${label} binds the following Grammar Fill section identity and text`,
  )
  assert.equal(
    observation.answers.length,
    teacher ? 15 : 0,
    `${label} ${teacher ? 'includes' : 'hides'} the Cloze answer supplement`,
  )
  assert.equal(
    observation.explanations.length,
    teacher ? 15 : 0,
    `${label} ${teacher ? 'includes' : 'hides'} the Cloze explanation supplement`,
  )
  if (teacher) {
    for (const [index, answer] of observation.answers.entries()) {
      assert.equal(
        normalizedVisibleText(answer.text),
        normalizedVisibleText(`【答案】${expectedRows[index].answer}`),
        `${label} ${answer.questionId} answer binds the exact official-answer bytes`,
      )
    }
    assert.deepEqual(
      observation.explanations.map((explanation) => ({
        questionId: explanation.questionId,
        text: normalizedVisibleText(explanation.text),
      })),
      expectedRows.map((row) => ({
        questionId: row.questionId,
        text: normalizedVisibleText(`【解析】${row.explanation}`),
      })),
      `${label} binds every Teacher explanation to the exact reviewed-analysis bytes`,
    )
    const rowToAnswerRatios = observation.answers.map(
      (answer, index) =>
        (
          answer.lines[0].center
          - observation.rows[index].textLineRects
            .flat()
            .at(-1).center
        ) / baselineStepPx,
    )
    const answerToExplanationRatios = observation.explanations.map(
      (explanation, index) =>
        (
          explanation.lines[0].center
          - observation.answers[index].lines[0].center
        ) / baselineStepPx,
    )
    assert.equal(
      rowToAnswerRatios.every((ratio) => Math.abs(ratio - 1) <= 0.08),
      true,
      `${label} measures every choice row to Teacher answer at one local baseline step`,
    )
    assert.equal(
      answerToExplanationRatios.every(
        (ratio) => Math.abs(ratio - 1) <= 0.08),
      true,
      `${label} measures every answer to reviewed explanation at one local baseline step`,
    )
    observe('choice_row_to_answer', {
      fromIdentity: observation.rows.map((row) => row.questionId),
      toIdentity: observation.answers.map((answer) => answer.questionId),
      actualRatios: rowToAnswerRatios,
    })
    observe('answer_to_explanation', {
      fromIdentity: observation.answers.map((answer) => answer.questionId),
      toIdentity: observation.explanations.map(
        (explanation) => explanation.questionId),
      actualRatios: answerToExplanationRatios,
    })
    const tailToNextRowRatios = observation.rows.slice(1).map(
      (row, index) =>
        (
          row.questionLines[0].center
          - observation.explanations[index].lines.at(-1).center
        ) / baselineStepPx,
    )
    assert.equal(
      tailToNextRowRatios.every((ratio) => Math.abs(ratio - 1) <= 0.08),
      true,
      `${label} measures every reviewed Teacher tail to next row at one local baseline step`,
    )
    observe('teacher_tail_to_next_row', {
      fromIdentity: observation.explanations.slice(0, -1)
        .map((explanation) => explanation.questionId),
      toIdentity: observation.rows.slice(1).map((row) => row.questionId),
      actualRatios: tailToNextRowRatios,
    })
  }
  if (wrappedOption) {
    assert.equal(
      observation.rows.some((row) =>
        row.textLineRects.some((rects) => rects.length > 1)),
      true,
      `${label} executes a real wrapped option continuation`,
    )
    const wrapped = observation.rows.flatMap((row) =>
      row.textLineRects.map((lines, track) => ({
        questionId: row.questionId,
        track,
        lines,
      }))).find((entry) => entry.lines.length > 1)
    assert.ok(wrapped, `${label} resolves one wrapped source-derived option`)
    assert.equal(
      wrapped.lines.every(
        (line) => Math.abs(line.x - wrapped.lines[0].x) <= 1.5),
      true,
      `${label} wrapped continuation hangs at the option text-start x`,
    )
    observe('wrapped_option_continuation', {
      fromIdentity: `${wrapped.questionId}:${wrapped.track}`,
      toIdentity: `${wrapped.questionId}:${wrapped.track}`,
      horizontalRelation: 'hanging_indent',
      continuationXs: wrapped.lines.map((line) => line.x),
    })
  }
  const finalTail = teacher
    ? observation.explanations.at(-1).lines.at(-1)
    : observation.rows.at(-1).questionLines.at(-1)
  const followingGapPx =
    observation.following[0].lines[0].center - finalTail.center
  const followingEdgeId = teacher
    ? 'teacher_tail_to_next_section_same_page'
    : 'student_tail_to_next_section_same_page'
  observe(followingEdgeId, {
    fromIdentity: teacher
      ? observation.explanations.at(-1).questionId
      : observation.rows.at(-1).questionId,
    toIdentity:
      expected.oracle.publicIdentities.followingSection.sectionId,
    actualRatio: assertStep(followingEdgeId, followingGapPx),
  })
  return { ...observation, observedEdges }
}

async function assertGrammarFillDomGeometry(
  page,
  label,
  {
    teacher = false,
    requireWrappedLine = false,
    requireLineEndBlank = false,
    surface = 'screen',
    observeFollowingTransition = true,
    expectedPassageTexts =
      grammarFillSourceOracle.paperAsset.content.groups[
        grammarFillSourceOracle.oracle.publicIdentities.grammarFill.groupId
      ].passage.paragraphs.map((paragraph) => paragraph.text),
  } = {},
) {
  const expected = grammarFillSourceOracle
  const observation = await page.evaluate(({ groupId, previousGroupId }) => {
    const group = document.querySelector(
      `[data-canonical-group-id="${groupId}"], `
      + `[data-paper-browse-anchor="${groupId}"]`,
    )
    if (!(group instanceof HTMLElement)) return { missingGroup: true }
    const visualLines = (elementOrNode) => {
      if (!elementOrNode) return []
      const range = document.createRange()
      range.selectNodeContents(elementOrNode)
      const lines = []
      for (const rect of range.getClientRects()) {
        const center = rect.y + rect.height / 2
        const line = lines.find(
          (candidate) => Math.abs(candidate.center - center) <= 1,
        )
        if (line) {
          line.x = Math.min(line.x, rect.x)
          line.right = Math.max(line.right, rect.right)
          line.bottom = Math.max(line.bottom, rect.bottom)
        } else {
          lines.push({
            x: rect.x,
            right: rect.right,
            y: rect.y,
            bottom: rect.bottom,
            height: rect.height,
            center,
          })
        }
      }
      return lines.sort((left, right) =>
        left.center - right.center || left.x - right.x)
    }
    const role = (value) => [
      ...document.querySelectorAll(
        `[data-canonical-grammar-fill-rhythm-role="${value}"]`,
      ),
    ]
    const groupRole = (value) => [
      ...group.querySelectorAll(
        `[data-canonical-grammar-fill-rhythm-role="${value}"]`,
      ),
    ]
    const paragraphs = groupRole('passage_body_line').map((element) => ({
      id: element.getAttribute('data-canonical-paragraph-id')
        || element.getAttribute('data-paper-paragraph-id'),
      text: element.textContent || '',
      lineHeight: Number.parseFloat(getComputedStyle(element).lineHeight),
      lines: visualLines(element),
    }))
    const blanks = groupRole('inline_blank_marker').map((element) => {
      const unit = element.closest('[data-canonical-grammar-fill-unit]')
        || element.closest('.print-blank-unit')
      const blankSurface =
        element.matches('.print-blank-unit')
          ? element.querySelector('.print-blank')
          : element
      const prompt = unit?.querySelector('.ps-paper-blank-hint')
        || unit?.querySelector('.print-blank-hint')
      const rect = blankSurface.getBoundingClientRect()
      const unitRect = unit?.getBoundingClientRect()
      const style = getComputedStyle(blankSurface)
      const unitStyle = unit ? getComputedStyle(unit) : null
      let flowUnit = unit
      while (
        flowUnit?.parentElement
        && flowUnit.parentElement !== element.closest(
          '[data-canonical-grammar-fill-rhythm-role="passage_body_line"]',
        )
        && !flowUnit.previousSibling
        && !flowUnit.nextSibling
      ) {
        flowUnit = flowUnit.parentElement
      }
      const paragraph = element.closest(
        '[data-canonical-grammar-fill-rhythm-role="passage_body_line"]',
      )
      const paragraphStyle = paragraph ? getComputedStyle(paragraph) : null
      const textNodes = []
      if (paragraph) {
        const walker = document.createTreeWalker(
          paragraph,
          NodeFilter.SHOW_TEXT,
        )
        while (walker.nextNode()) textNodes.push(walker.currentNode)
      }
      const precedingTextNodes = textNodes.filter(
        (node) =>
          !unit?.contains(node)
          && (
            node.compareDocumentPosition(unit)
            & Node.DOCUMENT_POSITION_FOLLOWING
          ),
      )
      const followingTextNodes = textNodes.filter(
        (node) =>
          !unit?.contains(node)
          && (
            unit?.compareDocumentPosition(node)
            & Node.DOCUMENT_POSITION_FOLLOWING
          ),
      )
      const previous = flowUnit?.previousSibling
      const following = flowUnit?.nextSibling
      return {
        questionId: element.getAttribute('data-canonical-question-id'),
        blankId: element.getAttribute('data-canonical-blank-id'),
        pair: element.getAttribute('data-canonical-pair'),
        text:
          element.querySelector('.print-blank-num')?.textContent
          || element.textContent
          || '',
        width: rect.width,
        fontSize: Number.parseFloat(style.fontSize),
        textAlign: style.textAlign,
        whiteSpace: style.whiteSpace,
        unitDisplay: unitStyle?.display,
        unitBreakInside: unitStyle?.breakInside,
        unitRect: unitRect?.toJSON(),
        blankRect: rect.toJSON(),
        paragraphId:
          paragraph?.getAttribute('data-canonical-paragraph-id')
          || paragraph?.getAttribute('data-paper-paragraph-id')
          || null,
        paragraphLineHeight:
          Number.parseFloat(paragraphStyle?.lineHeight || ''),
        paragraphLines: visualLines(paragraph),
        promptText: prompt?.textContent || null,
        promptRole: prompt?.getAttribute(
          'data-canonical-grammar-fill-rhythm-role',
        ) || null,
        promptRect: prompt?.getBoundingClientRect().toJSON() || null,
        previousText: precedingTextNodes.slice(-4)
          .map((node) => node.textContent || '').join('')
          || previous?.textContent || '',
        followingText: followingTextNodes.slice(0, 4)
          .map((node) => node.textContent || '').join('')
          || following?.textContent || '',
        previousLines: visualLines(precedingTextNodes.at(-1) || previous),
        followingLines: visualLines(followingTextNodes[0] || following),
      }
    })
    const chrome = [
      role('part_context')[0],
      role('subsection')[0],
      role('meta_instruction')[0],
    ].filter(Boolean).map((element) => ({
      role: element.getAttribute(
        'data-canonical-grammar-fill-rhythm-role',
      ),
      text: element.textContent || '',
      lines: visualLines(element),
    }))
    const subsectionCenter = chrome.find(
      (entry) => entry.role === 'subsection',
    )?.lines[0]?.center
    const previousFamily = [
      ...document.querySelectorAll(
        `[data-canonical-group-id="${previousGroupId}"] `
        + '[data-canonical-cloze-rhythm-role], '
        + `[data-paper-browse-anchor="${previousGroupId}"] `
        + '[data-canonical-cloze-rhythm-role]',
      ),
    ].flatMap((element) =>
      visualLines(element).map((line) => ({
        identity:
          element.closest('[data-canonical-question-id]')
            ?.getAttribute('data-canonical-question-id')
          || previousGroupId,
        role: element.getAttribute('data-canonical-cloze-rhythm-role'),
        text: element.textContent || '',
        line,
      })))
      .filter((entry) => entry.line.center < subsectionCenter)
      .sort((left, right) => left.line.center - right.line.center)
      .at(-1)
    const followingElements = role('next_section')
    if (followingElements.length === 0) {
      const fallback = document.querySelector(
        '[data-paper-browse-anchor="part-2026-i-writing"]',
      ) || [...document.querySelectorAll('h1, h2, h3, h4')].find(
        (element) =>
          element.textContent?.includes('第四部分')
          && element.textContent?.includes('写作'),
      )
      if (fallback) followingElements.push(fallback)
    }
    const following = followingElements.map((element) => ({
      id: element.getAttribute('data-paper-browse-anchor') || element.id,
      role: element.getAttribute(
        'data-canonical-grammar-fill-rhythm-role',
      ),
      text: element.textContent || '',
      lines: visualLines(element),
      debug: {
        className: element.className,
        marginTop: getComputedStyle(element).marginTop,
        parentClassName: element.parentElement?.className || '',
        cardClassName:
          element.closest('.paper-browse-group-card')?.className || '',
        cardMarginTop:
          element.closest('.paper-browse-group-card')
            ? getComputedStyle(
                element.closest('.paper-browse-group-card'),
              ).marginTop
            : null,
        shellClassName:
          document.querySelector('.paper-browse-shell')?.className || '',
      },
    }))
    const answers = groupRole('answer_line').map((element) => ({
      questionId:
        element.closest('[data-canonical-question-id]')
          ?.getAttribute('data-canonical-question-id'),
      text: element.textContent || '',
      lines: visualLines(element),
    }))
    const explanations = groupRole('explanation_line').map((element) => ({
      questionId:
        element.closest('[data-canonical-question-id]')
          ?.getAttribute('data-canonical-question-id'),
      text: element.textContent || '',
      lines: visualLines(element),
    }))
    return {
      missingGroup: false,
      groupId:
        group.getAttribute('data-canonical-group-id')
        || group.getAttribute('data-paper-browse-anchor'),
      previousFamily,
      previousFamilyIds: [
        ...document.querySelectorAll(
          '[data-canonical-grammar-fill-previous-family-group-id]',
        ),
      ].map((element) =>
        element.getAttribute(
          'data-canonical-grammar-fill-previous-family-group-id',
        )),
      chrome,
      paragraphs,
      blanks,
      answers,
      explanations,
      following,
    }
  }, {
    groupId:
      expected.oracle.publicIdentities.grammarFill.groupId,
    previousGroupId:
      expected.oracle.publicIdentities.clozeBoundary.groupId,
  })
  assert.equal(observation.missingGroup, false, `${label} exposes Grammar Fill`)
  assert.equal(
    observation.groupId,
    expected.oracle.publicIdentities.grammarFill.groupId,
  )
  assert.equal(
    observation.previousFamilyIds.includes(
      expected.oracle.publicIdentities.clozeBoundary.groupId,
    ),
    true,
    `${label} binds the exact Cloze predecessor identity`,
  )
  assert.deepEqual(
    observation.chrome.map((entry) => entry.role),
    ['part_context', 'subsection', 'meta_instruction'],
    `${label} exposes exact ordered Grammar Fill chrome identities`,
  )
  assert.deepEqual(
    observation.chrome.map((entry) => normalizedVisibleText(entry.text)),
    [
      expected.oracle.publicVisibleChrome.part,
      expected.oracle.publicVisibleChrome.section,
      expected.oracle.publicVisibleChrome.instruction,
    ].map(normalizedVisibleText),
  )
  assert.deepEqual(
    observation.paragraphs.map((paragraph) => paragraph.id),
    expected.oracle.publicIdentities.grammarFill.paragraphIds,
  )
  assert.deepEqual(
    observation.paragraphs.map((paragraph) =>
      normalizedVisibleText(paragraph.text).replace(/\s+/gu, '')),
    expectedPassageTexts.map((text) =>
      normalizedVisibleText(text)
        .replace(/__(\d+)__/gu, '$1')
        .replace(/\s+/gu, '')),
    `${label} binds exact source passage text and order`,
  )
  const observedEdges = []
  const observe = (edgeId, evidence) => {
    assert.equal(
      observedEdges.some((entry) => entry.edgeId === edgeId),
      false,
      `${label} records ${edgeId} once`,
    )
    observedEdges.push({
      edgeId,
      sourceOracleSha256: expected.digest,
      ...evidence,
    })
  }
  const cssPtToPx = 4 / 3
  const baselineStepPx =
    surface === 'printHtml'
      ? grammarFillRhythm.targets.printPdf.baselineStepPt * cssPtToPx
      : grammarFillRhythm.targets.screen.baselineStepPx
  const edgeAuthority = (edgeId) => {
    const edge = grammarFillRhythm.adjacencyGraph.find(
      (candidate) => candidate.edgeId === edgeId,
    )
    assert.ok(edge, `${label} resolves ${edgeId} authority`)
    return edge
  }
  const assertStep = (edgeId, distancePx, debug = null) => {
    const edge = edgeAuthority(edgeId)
    const targetPx = edge.baselineStepRatio * baselineStepPx
    const targetTolerances =
      surface === 'printHtml'
        ? {
            oneStepTolerancePx:
              grammarFillRhythm.targets.printPdf.oneStepTolerancePt
              * cssPtToPx,
            threeHalfStepTolerancePx:
              grammarFillRhythm.targets.printPdf.threeHalfStepTolerancePt
              * cssPtToPx,
            twoStepTolerancePx:
              grammarFillRhythm.targets.printPdf.twoStepTolerancePt
              * cssPtToPx,
          }
        : grammarFillRhythm.targets.screen
    const tolerancePx =
      edge.baselineStepRatio === 1
        ? targetTolerances.oneStepTolerancePx
        : edge.baselineStepRatio === 1.5
          ? targetTolerances.threeHalfStepTolerancePx
          : targetTolerances.twoStepTolerancePx
    assert.equal(
      Math.abs(distancePx - targetPx) <= tolerancePx,
      true,
      `${label} ${edgeId} measures ${JSON.stringify({
        distancePx,
        targetPx,
        debug,
      })}`,
    )
    return distancePx / baselineStepPx
  }
  const subsection = observation.chrome[1].lines[0]
  const instruction = observation.chrome[2].lines[0]
  const firstPassage = observation.paragraphs[0].lines[0]
  assert.ok(observation.previousFamily?.line)
  observe('cloze_tail_to_chrome_same_page', {
    fromIdentity: observation.previousFamily.identity,
    toIdentity: expected.oracle.publicIdentities.grammarFill.groupId,
    actualRatio: assertStep(
      'cloze_tail_to_chrome_same_page',
      subsection.center - observation.previousFamily.line.center,
    ),
    pageRelation: 'same_page',
  })
  assert.equal(
    observation.chrome[0].lines[0].center < subsection.center,
    true,
    `${label} preserves source part-context before subsection`,
  )
  observe('part_context_to_subsection', {
    fromIdentity: 'part-2026-i-language',
    toIdentity: expected.oracle.publicIdentities.grammarFill.groupId,
    pageRelation: 'source_order',
    actualOrder:
      subsection.center - observation.chrome[0].lines[0].center,
  })
  observe('chrome_internal', {
    fromIdentity: expected.oracle.publicIdentities.grammarFill.groupId,
    toIdentity: expected.oracle.publicIdentities.grammarFill.groupId,
    actualRatio: assertStep(
      'chrome_internal',
      instruction.center - subsection.center,
    ),
  })
  observe('chrome_to_passage', {
    fromIdentity: expected.oracle.publicIdentities.grammarFill.groupId,
    toIdentity: observation.paragraphs[0].id,
    actualRatio: assertStep(
      'chrome_to_passage',
      firstPassage.center - instruction.center,
    ),
  })
  const internalLineGaps = observation.paragraphs.flatMap(
    (paragraph) => paragraph.lines.slice(1).map(
      (line, index) => line.center - paragraph.lines[index].center,
    ),
  )
  assert.equal(
    internalLineGaps.length > 0
    && internalLineGaps.every((gap) =>
      Math.abs(gap - baselineStepPx)
        <= (
          surface === 'printHtml'
            ? grammarFillRhythm.targets.printPdf.oneStepTolerancePt
              * cssPtToPx
            : grammarFillRhythm.targets.screen.oneStepTolerancePx
        )),
    true,
    `${label} measures every passage line at one baseline: ${JSON.stringify(internalLineGaps)}`,
  )
  observe('passage_line_internal', {
    fromIdentity: observation.paragraphs[0].id,
    toIdentity: observation.paragraphs.at(-1).id,
    actualRatios: internalLineGaps.map((gap) => gap / baselineStepPx),
  })
  const paragraphGaps = observation.paragraphs.slice(1).map(
    (paragraph, index) =>
      paragraph.lines[0].center
      - observation.paragraphs[index].lines.at(-1).center,
  )
  assert.equal(
    paragraphGaps.every((gap) =>
      Math.abs(gap - baselineStepPx)
        <= (
          surface === 'printHtml'
            ? grammarFillRhythm.targets.printPdf.oneStepTolerancePt
              * cssPtToPx
            : grammarFillRhythm.targets.screen.oneStepTolerancePx
        )),
    true,
    `${label} measures source paragraph transitions`,
  )
  observe('paragraph_transition', {
    fromIdentity: observation.paragraphs[0].id,
    toIdentity: observation.paragraphs.at(-1).id,
    actualRatios: paragraphGaps.map((gap) => gap / baselineStepPx),
  })
  const samePassagePair = observation.paragraphs.flatMap(
    (paragraph) => paragraph.lines.slice(1).map((line, index) => ({
      paragraphId: paragraph.id,
      from: paragraph.lines[index],
      to: line,
    })),
  )[0]
  assert.ok(
    samePassagePair,
    `${label} executes an adjacent same-passage continuation`,
  )
  observe('same_passage_continuation', {
    fromIdentity: samePassagePair.paragraphId,
    toIdentity: samePassagePair.paragraphId,
    pageRelation: 'same_page_continuation',
    actualRelation: 'same_continuous_public_dom_flow',
    fromCenterPx: samePassagePair.from.center,
    toCenterPx: samePassagePair.to.center,
    actualRatio:
      (samePassagePair.to.center - samePassagePair.from.center)
      / baselineStepPx,
  })
  assert.deepEqual(
    observation.blanks.map((blank) => blank.questionId),
    expected.oracle.publicIdentities.grammarFill.questionIds,
  )
  assert.deepEqual(
    observation.blanks.map((blank) => blank.blankId),
    expected.oracle.publicIdentities.grammarFill.blankIds,
  )
  assert.deepEqual(
    observation.blanks.map((blank) => blank.pair),
    expected.oracle.publicIdentities.grammarFill.questionIds.map(
      (questionId, index) =>
        `${questionId}:${expected.oracle.publicIdentities.grammarFill.blankIds[index]}`,
    ),
  )
  for (const blank of observation.blanks) {
    const expectedPrompt =
      expected.oracle.publicIdentities.grammarFill.prompts[blank.questionId]
    assert.equal(blank.text, String(
      expected.rows.find((row) => row.questionId === blank.questionId)
        .questionNo,
    ))
    assert.equal(/\.$/u.test(blank.text), false)
    assert.equal(
      Math.abs(
        blank.width / blank.fontSize
        - grammarFillRhythm.blankGeometry.widthEm,
      ) <= 0.12,
      true,
      `${label} ${blank.blankId} measures a 3.3em-class line`,
    )
    assert.equal(blank.textAlign, 'center')
    assert.match(String(blank.unitDisplay), /inline/)
    assert.equal(
      blank.previousText.endsWith(' '),
      true,
      `${label} ${blank.blankId} retains source left space: ${JSON.stringify(blank.previousText.slice(-12))}`,
    )
    assert.equal(
      blank.followingText.startsWith(' '),
      true,
      `${label} ${blank.blankId} retains source right space: ${JSON.stringify(blank.followingText.slice(0, 12))}`,
    )
    assert.equal(
      blank.promptText,
      expectedPrompt === null ? null : `(${expectedPrompt})`,
    )
    if (expectedPrompt !== null) {
      assert.equal(blank.promptRole, 'prompt_text')
      assert.ok(blank.promptRect)
      assert.equal(
        Math.abs(
          (blank.promptRect.x - blank.blankRect.right) / blank.fontSize
          - grammarFillRhythm.promptGeometry.gapEm,
        ) <= 0.12,
        true,
        `${label} ${blank.blankId} measures prompt attachment`,
      )
      assert.equal(
        blank.promptRect.y >= blank.unitRect.y - 1
        && blank.promptRect.bottom <= blank.unitRect.bottom + 1,
        true,
        `${label} ${blank.blankId} keeps prompt inside the atomic unit`,
      )
    }
  }
  const firstBlank = observation.blanks[0]
  const unpromptedBlank = observation.blanks.find(
    (blank) =>
      blank.questionId
      === expected.oracle.variants.unpromptedQuestionId,
  )
  const sentenceStartBlank = observation.blanks.find(
    (blank) =>
      blank.questionId
      === expected.oracle.variants.sentenceStartQuestionId,
  )
  const sentenceInternalBlank = observation.blanks.find(
    (blank) =>
      blank.questionId
      === expected.oracle.variants.sentenceInternalQuestionId,
  )
  observe('inline_blank_left_space', {
    fromIdentity: firstBlank.questionId,
    toIdentity: firstBlank.blankId,
    horizontalRelation: 'source_space_before',
    observedTextDigest: sha256(Buffer.from(firstBlank.previousText, 'utf8')),
  })
  observe('inline_blank_right_space', {
    fromIdentity: firstBlank.blankId,
    toIdentity: firstBlank.questionId,
    horizontalRelation: 'source_space_after_unit',
    observedTextDigest: sha256(Buffer.from(firstBlank.followingText, 'utf8')),
  })
  const firstBlankExtraHeightPx = Math.max(
    0,
    firstBlank.unitRect.height - firstBlank.paragraphLineHeight,
  )
  assert.equal(
    firstBlankExtraHeightPx / baselineStepPx
      <= (
        surface === 'printHtml'
          ? grammarFillRhythm.targets.printPdf.oneStepTolerancePt * cssPtToPx
          : grammarFillRhythm.targets.screen.oneStepTolerancePx
      ) / baselineStepPx,
    true,
    `${label} measures no Blank-created extra vertical step`,
  )
  observe('inline_blank_no_phantom_space', {
    fromIdentity: firstBlank.questionId,
    toIdentity: firstBlank.questionId,
    actualRatio: firstBlankExtraHeightPx / baselineStepPx,
    measuredUnitHeightPx: firstBlank.unitRect.height,
    measuredParagraphLineHeightPx: firstBlank.paragraphLineHeight,
    blankLineHeight: firstBlank.unitRect.height,
  })
  observe('inline_blank_atomicity', {
    fromIdentity: firstBlank.blankId,
    toIdentity: firstBlank.blankId,
    pageRelation: 'same_line_unsplittable',
    unitRect: firstBlank.unitRect,
  })
  observe('inline_blank_number_centered', {
    fromIdentity: firstBlank.blankId,
    toIdentity: firstBlank.blankId,
    horizontalRelation: 'centered_number_without_trailing_dot',
    measuredWidthEm: firstBlank.width / firstBlank.fontSize,
  })
  observe('inline_blank_width', {
    fromIdentity: firstBlank.blankId,
    toIdentity: observation.blanks.at(-1).blankId,
    horizontalRelation: '3_3em_class',
    measuredWidthsEm: observation.blanks.map(
      (blank) => blank.width / blank.fontSize,
    ),
  })
  observe('inline_blank_source_order', {
    fromIdentity: observation.blanks[0].blankId,
    toIdentity: observation.blanks.at(-1).blankId,
    pageRelation: 'exact_visible_source_order',
    identities: observation.blanks.map((blank) => blank.blankId),
  })
  observe('prompt_attachment', {
    fromIdentity: firstBlank.blankId,
    toIdentity: firstBlank.questionId,
    horizontalRelation: 'fixed_em_gap_inside_atomic_unit',
    actualGapEm:
      (firstBlank.promptRect.x - firstBlank.blankRect.right)
      / firstBlank.fontSize,
  })
  observe('prompt_to_following_text', {
    fromIdentity: firstBlank.questionId,
    toIdentity: firstBlank.questionId,
    horizontalRelation: 'source_space_after_prompt',
    observedTextDigest:
      sha256(Buffer.from(firstBlank.followingText, 'utf8')),
  })
  observe('prompt_atomicity', {
    fromIdentity: firstBlank.questionId,
    toIdentity: firstBlank.blankId,
    pageRelation: 'same_atomic_unit',
    unitRect: firstBlank.unitRect,
  })
  assert.equal(unpromptedBlank.promptText, null)
  const unpromptedExtraHeightPx = Math.max(
    0,
    unpromptedBlank.unitRect.height - unpromptedBlank.blankRect.height,
  )
  observe('unprompted_collapse', {
    fromIdentity: unpromptedBlank.blankId,
    toIdentity: unpromptedBlank.questionId,
    actualRatio: unpromptedExtraHeightPx / baselineStepPx,
    measuredUnitHeightPx: unpromptedBlank.unitRect.height,
    measuredBlankHeightPx: unpromptedBlank.blankRect.height,
  })
  assert.match(sentenceStartBlank.previousText, /[.!?]\s*$/u)
  observe('sentence_start_blank', {
    fromIdentity: sentenceStartBlank.questionId,
    toIdentity: sentenceStartBlank.blankId,
    pageRelation: 'sentence_start',
    observedTextDigest:
      sha256(Buffer.from(sentenceStartBlank.previousText, 'utf8')),
  })
  assert.equal(
    /[.!?]\s*$/u.test(sentenceInternalBlank.previousText),
    false,
  )
  observe('sentence_internal_blank', {
    fromIdentity: sentenceInternalBlank.questionId,
    toIdentity: sentenceInternalBlank.blankId,
    pageRelation: 'sentence_internal',
    observedTextDigest:
      sha256(Buffer.from(sentenceInternalBlank.previousText, 'utf8')),
  })
  const lineEndBlank = observation.blanks.find(
    (blank) =>
      blank.questionId === expected.oracle.variants.lineEndQuestionId,
  )
  if (requireLineEndBlank) {
    assert.ok(
      lineEndBlank?.followingLines[0],
      `${label} resolves the declared source-bound line-end Blank`,
    )
    const blankCenter =
      lineEndBlank.blankRect.y + lineEndBlank.blankRect.height / 2
    assert.equal(
      lineEndBlank.followingLines[0].center - blankCenter > 3,
      true,
      `${label} executes ${lineEndBlank.questionId} at a real line end: ${
        JSON.stringify({
          widthEm:
            expected.oracle.variants.lineEndUsableWidthEm,
          blankRect: lineEndBlank.blankRect,
          followingLine: lineEndBlank.followingLines[0],
          paragraphLines: lineEndBlank.paragraphLines,
        })
      }`,
    )
    observe('line_end_blank', {
      fromIdentity: lineEndBlank.blankId,
      toIdentity: lineEndBlank.paragraphId,
      pageRelation: 'line_end_atomic',
      blankRect: lineEndBlank.blankRect,
      followingLine: lineEndBlank.followingLines[0],
    })
  }
  const wrappedBlank = observation.blanks.find(
    (blank) =>
      blank.questionId === expected.oracle.variants.wrappedLineQuestionId,
  )
  const wrappedParagraph = observation.paragraphs.find(
    (paragraph) => paragraph.id === wrappedBlank?.paragraphId,
  )
  if (requireWrappedLine) {
    const firstWrappedLine = wrappedParagraph?.lines[0]
    const finalWrappedLine = wrappedParagraph?.lines.at(-1)
    assert.ok(
      firstWrappedLine
      && finalWrappedLine
      && finalWrappedLine.center - firstWrappedLine.center
        >= baselineStepPx * 0.9,
      `${label} executes the declared source-bound wrapped-line Blank`,
    )
    observe('wrapped_line_blank', {
      fromIdentity: wrappedParagraph.id,
      toIdentity: wrappedBlank.blankId,
      pageRelation: 'wrapped_line_atomic',
      firstLineCenterPx: firstWrappedLine.center,
      finalLineCenterPx: finalWrappedLine.center,
      localBaselineSpanRatio:
        (finalWrappedLine.center - firstWrappedLine.center)
        / baselineStepPx,
      unitRect: wrappedBlank.unitRect,
    })
  }
  const finalPassageLine = observation.paragraphs.at(-1).lines.at(-1)
  const nextSection = observation.following[0]
  assert.ok(nextSection?.lines[0], `${label} exposes Application Writing`)
  assert.equal(
    nextSection.role,
    'next_section',
    `${label} binds the Application Writing public role`,
  )
  const followingEdgeId = teacher
    ? 'teacher_tail_to_next_section_same_page'
    : 'student_tail_to_next_section_same_page'
  if (teacher) {
    assert.deepEqual(
      observation.answers.map((entry) => entry.questionId),
      expected.oracle.publicIdentities.grammarFill.questionIds,
    )
    assert.deepEqual(
      observation.explanations.map((entry) => entry.questionId),
      expected.oracle.publicIdentities.grammarFill.questionIds,
    )
    for (const [index, row] of expected.rows.entries()) {
      assert.equal(
        normalizedVisibleText(observation.answers[index].text)
          .replace(/^【答案】/u, ''),
        normalizedVisibleText(row.answer),
      )
      assert.equal(
        normalizedVisibleText(observation.explanations[index].text)
          .replace(/^【解析】/u, ''),
        normalizedVisibleText(row.explanation),
      )
    }
    observe('passage_tail_to_answer', {
      fromIdentity: observation.paragraphs.at(-1).id,
      toIdentity: observation.answers[0].questionId,
      actualRatio: assertStep(
        'passage_tail_to_answer',
        observation.answers[0].lines[0].center - finalPassageLine.center,
      ),
    })
    const answerToExplanationRatios = observation.answers.map(
      (answer, index) =>
        (
          observation.explanations[index].lines[0].center
          - answer.lines.at(-1).center
        ) / baselineStepPx,
    )
    assert.equal(
      answerToExplanationRatios.every(
        (ratio) => Math.abs(ratio - 1) <= 0.08),
      true,
    )
    observe('answer_to_explanation', {
      fromIdentity: observation.answers[0].questionId,
      toIdentity: observation.explanations.at(-1).questionId,
      actualRatios: answerToExplanationRatios,
    })
    const tailToNextRatios = observation.answers.slice(1).map(
      (answer, index) =>
        (
          answer.lines[0].center
          - observation.explanations[index].lines.at(-1).center
        ) / baselineStepPx,
    )
    assert.equal(
      tailToNextRatios.every((ratio) => Math.abs(ratio - 1) <= 0.08),
      true,
    )
    observe('teacher_tail_to_next_answer', {
      fromIdentity: observation.explanations[0].questionId,
      toIdentity: observation.answers.at(-1).questionId,
      actualRatios: tailToNextRatios,
    })
    const teacherTail = observation.explanations.at(-1).lines.at(-1)
    if (observeFollowingTransition) {
      observe(followingEdgeId, {
        fromIdentity: observation.explanations.at(-1).questionId,
        toIdentity:
          expected.oracle.publicIdentities.followingSection.sectionId,
        actualRatio: assertStep(
          followingEdgeId,
          nextSection.lines[0].center - teacherTail.center,
        ),
      })
    }
  } else {
    if (observeFollowingTransition) {
      observe(followingEdgeId, {
        fromIdentity: observation.paragraphs.at(-1).id,
        toIdentity:
          expected.oracle.publicIdentities.followingSection.sectionId,
        actualRatio: assertStep(
          followingEdgeId,
          nextSection.lines[0].center - finalPassageLine.center,
          nextSection.debug,
        ),
      })
    }
    const passageTailToFollowingSectionPx =
      nextSection.lines[0].center - finalPassageLine.center
    observe('student_supplement_absence_collapse', {
      fromIdentity: observation.paragraphs.at(-1).id,
      toIdentity:
        expected.oracle.publicIdentities.followingSection.sectionId,
      adjacencyRelation: 'direct_visible_passage_tail_to_following_section',
      passageTailCenterPx: finalPassageLine.center,
      followingSectionCenterPx: nextSection.lines[0].center,
      actualRatio:
        passageTailToFollowingSectionPx / baselineStepPx,
    })
  }
  return { ...observation, observedEdges }
}

function assertSevenChoicesDomObservation(
  observation,
  label,
  {
    teacher = false,
    headingPresent = false,
    wrappedOption = false,
    requireReadingBoundary = true,
    chromePresent = true,
    bundleId = null,
    variant = null,
    recordCoverage = null,
  } = {},
) {
  const oracle =
    sevenChoicesSourceOracle.oracle.publicIdentities.sevenChoices
  assert.ok(observation, `${label} exposes the exact Seven Choices Group`)
  assert.equal(observation.groupId, oracle.groupId)
  assert.deepEqual(
    observation.paragraphIds,
    oracle.paragraphIds,
    `${label} preserves exact paragraph identity/order`,
  )
  assert.equal(
    observation.passageTitleCount,
    0,
    `${label} exposes no passage_title invented beyond the source`,
  )
  assert.deepEqual(
    observation.passageTexts.flatMap(sourceLexicalTokens),
    sevenChoicesSourceOracle.passageTokens,
    `${label} preserves the immutable source-PDF passage text`,
  )
  assert.deepEqual(
    observation.blankPairs,
    oracle.questionBlankPairs.map(
      ({ questionId, blankId }) => `${questionId}:${blankId}`,
    ),
    `${label} preserves exact inline Blank identity/order`,
  )
  assert.equal(
    observation.blankLineCounts.every((count) => count === 1),
    true,
    `${label} inline blanks add no phantom vertical line`,
  )
  assert.equal(
    observation.blankGeometry.every(
      ({ blankBottom, passageLineBottoms, verticalBoxPx }) =>
        passageLineBottoms.some(
          (passageBottom) => Math.abs(passageBottom - blankBottom) <= 1,
        )
        && Math.abs(verticalBoxPx) <= 0.01,
    ),
    true,
    `${label} keeps every inline blank on its source passage line with zero vertical box`,
  )
  assert.equal(observation.bankCount, 1, `${label} renders one A-G bank`)
  assert.equal(
    observation.bankId,
    oracle.bankId,
    `${label} binds the source-owned bank identity`,
  )
  assert.deepEqual(
    observation.optionIds,
    oracle.optionIds,
    `${label} preserves A-G option identity/order`,
  )
  assert.deepEqual(
    observation.optionLabels,
    sevenChoicesSourceOracle.bankOptions.map(({ label: optionLabel }) =>
      optionLabel),
    `${label} preserves source-PDF A-G labels`,
  )
  assert.deepEqual(
    observation.optionTexts.flatMap(sourceLexicalTokens),
    sevenChoicesSourceOracle.bankOptions.flatMap(({ text }) =>
      sourceLexicalTokens(text)),
    `${label} preserves source-PDF A-G text independently of projection output`,
  )
  assert.equal(
    observation.optionRoles.every((role) => role === 'bank_option_line'),
    true,
    `${label} exposes no wrong-role bank row`,
  )
  assert.equal(
    observation.headingCount,
    headingPresent ? 1 : 0,
    `${label} executes the declared bank-heading variant`,
  )
  assert.equal(
    observation.phantomRoleCount,
    0,
    `${label} exposes no unknown Seven Choices role`,
  )
  const chromeOrder = ['part_title', 'subsection', 'meta_instruction']
  assert.equal(
    (chromePresent ? observation.chromeRoles.length > 0 : (
      observation.chromeRoles.length === 0
    ))
    && new Set(observation.chromeRoles).size
      === observation.chromeRoles.length
    && observation.chromeRoles.every((role) => chromeOrder.includes(role))
    && observation.chromeRoles.every(
      (role, index) =>
        index === 0
        || chromeOrder.indexOf(role)
          > chromeOrder.indexOf(observation.chromeRoles[index - 1]),
    ),
    true,
    `${label} preserves an ordered optional-collapse chrome chain`,
  )
  for (const anchor of sevenChoicesCoverageOracle.oracle.authorityBoundary
    .chromeAnchors) {
    const observed = observation.chrome.find(
      (entry) => entry.role === anchor.role,
    )
    if (!observed) continue
    assert.equal(
      normalizedVisibleText(observed.text).replace(/[^\p{L}\p{N}]/gu, ''),
      normalizedVisibleText(anchor.text).replace(/[^\p{L}\p{N}]/gu, ''),
      `${label} binds ${anchor.role} text to the immutable source PDF`,
    )
  }
  if (requireReadingBoundary) {
    assert.equal(
      observation.boundaryGroupId,
      sevenChoicesSourceOracle.oracle.publicIdentities.readingBoundary
        .groupId,
      `${label} binds the established Reading-D boundary without deriving it`,
    )
  }
  assert.equal(
    observation.followingRole,
    'next_section',
    `${label} binds the exact following section role`,
  )
  assert.equal(
    observation.followingFor,
    oracle.groupId,
    `${label} binds the bank/tail to its exact following section`,
  )
  const targetStepPx = 24
  const tolerancePx = sevenChoicesRhythm.targets.screen.oneStepTolerancePx
  const assertRatio = (actualPx, edgeId) => {
    const edge = sevenChoicesCoverageEdge(edgeId)
    const tolerance = edge.baselineStepRatio === 2
      ? sevenChoicesRhythm.targets.screen.twoStepTolerancePx
      : tolerancePx
    assert.equal(
      Math.abs(actualPx - targetStepPx * edge.baselineStepRatio) <= tolerance,
      true,
      `${label} ${edgeId} keeps ${edge.baselineStepRatio}x public DOM rhythm: ${JSON.stringify({
        actualPx,
        expectedPx: targetStepPx * edge.baselineStepRatio,
        ...(edgeId === 'chrome_to_passage'
          ? {
              chromeBox: observation.chrome.at(-1)?.box,
              chromeChain: observation.chrome.map((entry) => ({
                role: entry.role,
                text: entry.text,
                box: entry.box,
              })),
              passageBox: observation.passageBox,
              chromeLine: observation.chrome.at(-1)?.lines.at(-1),
              passageLine: observation.passageLines[0]?.[0],
            }
          : {}),
        ...(edgeId === 'reading_boundary_to_chrome_same_page'
          ? {
              readingBoundary: observation.readingBoundary,
              teacherReadingBoundary: observation.teacherReadingBoundary,
              firstChrome: observation.chrome[0],
            }
          : {}),
      })}`,
    )
    return actualPx / targetStepPx
  }
  if (chromePresent) {
    assert.equal(
      observation.chrome.every((entry) => entry.lines.length > 0),
      true,
      `${label} exposes executable chrome geometry`,
    )
    if (requireReadingBoundary) {
      const boundary = teacher
        && observation.teacherReadingBoundary.lines.length > 0
        ? observation.teacherReadingBoundary
        : observation.readingBoundary
      if (teacher) {
        const teacherBoundary =
          sevenChoicesCoverageOracle.oracle.authorityBoundary
            .teacherReadingBoundary
        const expectedText = boundary.role === 'answer_line'
          ? teacherBoundary.visibleText
          : teacherBoundary.explanationText
        assert.equal(
          normalizedVisibleText(boundary.text)
            .replace(/[^\p{L}\p{N}]/gu, '')
            .includes(
              normalizedVisibleText(expectedText)
                .replace(/[^\p{L}\p{N}]/gu, ''),
            ),
          true,
          `${label} binds the terminal Reading-D teacher tail to checked-in analysis evidence: ${JSON.stringify({
            observed: boundary.text,
            expected: expectedText,
          })}`,
        )
      }
      assert.equal(
        boundary.lines.length > 0,
        true,
        `${label} exposes the source-bound Reading-D tail geometry`,
      )
      const actualPx = label.includes('Print HTML')
        ? observation.chrome[0].lines[0].center
          - boundary.lines.at(-1).center
        : observation.chrome[0].bottom - boundary.bottom
      recordSevenChoicesEdge(recordCoverage, {
        bundleId,
        variant,
        edgeId: 'reading_boundary_to_chrome_same_page',
        fromIdentity: boundary.identity,
        toIdentity: observation.chrome[0].identity,
        fromText: boundary.text,
        toText: observation.chrome[0].text,
        actualRatio: assertRatio(
          actualPx,
          'reading_boundary_to_chrome_same_page',
        ),
      })
    }
    for (let index = 1; index < observation.chrome.length; index += 1) {
      const previous = observation.chrome[index - 1]
      const current = observation.chrome[index]
      const actualPx =
        current.lines[0].center - previous.lines.at(-1).center
      recordSevenChoicesEdge(recordCoverage, {
        bundleId,
        variant,
        edgeId: 'chrome_internal',
        fromIdentity: previous.identity,
        toIdentity: current.identity,
        fromText: previous.text,
        toText: current.text,
        actualRatio: assertRatio(actualPx, 'chrome_internal'),
      })
    }
    const lastChrome = observation.chrome.at(-1)
    const actualPx =
      observation.passageLines[0][0].center
      - lastChrome.lines.at(-1).center
    recordSevenChoicesEdge(recordCoverage, {
      bundleId,
      variant,
      edgeId: 'chrome_to_passage',
      fromIdentity: lastChrome.identity,
      toIdentity: observation.paragraphIds[0],
      fromText: lastChrome.text,
      toText: observation.passageTexts[0],
      actualRatio: assertRatio(actualPx, 'chrome_to_passage'),
    })
  }
  for (const paragraph of observation.passageLines) {
    assert.equal(paragraph.length > 0, true, `${label} has no empty passage role`)
    for (let index = 1; index < paragraph.length; index += 1) {
      assert.equal(
        Math.abs(
          paragraph[index].bottom
          - paragraph[index - 1].bottom
          - targetStepPx,
        ) <= tolerancePx,
        true,
        `${label} keeps wrapped passage lines on one local baseline step`,
      )
      recordSevenChoicesEdge(recordCoverage, {
        bundleId,
        variant,
        edgeId: 'passage_line_internal',
        fromIdentity: observation.paragraphIds[
          observation.passageLines.indexOf(paragraph)
        ],
        toIdentity: observation.paragraphIds[
          observation.passageLines.indexOf(paragraph)
        ],
        fromText: observation.passageTexts[
          observation.passageLines.indexOf(paragraph)
        ],
        toText: observation.passageTexts[
          observation.passageLines.indexOf(paragraph)
        ],
        actualRatio:
          (paragraph[index].center - paragraph[index - 1].center)
          / targetStepPx,
      })
    }
  }
  for (let index = 1; index < observation.passageLines.length; index += 1) {
    const actualPx =
      observation.passageLines[index][0].center
      - observation.passageLines[index - 1].at(-1).center
    recordSevenChoicesEdge(recordCoverage, {
      bundleId,
      variant,
      edgeId: 'paragraph_transition',
      fromIdentity: observation.paragraphIds[index - 1],
      toIdentity: observation.paragraphIds[index],
      fromText: observation.passageTexts[index - 1],
      toText: observation.passageTexts[index],
      actualRatio: assertRatio(actualPx, 'paragraph_transition'),
    })
  }
  for (let index = 0; index < observation.blankGeometry.length; index += 1) {
    recordSevenChoicesEdge(recordCoverage, {
      bundleId,
      variant,
      edgeId: 'inline_blank_no_phantom_space',
      fromIdentity: observation.blankPairs[index],
      toIdentity: observation.blankPairs[index],
      fromText: observation.blankPairs[index],
      toText: observation.blankPairs[index],
      actualRatio: 0,
      atomic: true,
    })
  }
  const flattenedPassage = observation.passageLines.flat()
  assert.equal(
    flattenedPassage.length > observation.passageLines.length,
    true,
    `${label} executes wrapped passage lines`,
  )
  if (headingPresent) {
    assert.equal(
      Math.abs(
        observation.headingLines[0].bottom
        - flattenedPassage.at(-1).bottom
        - targetStepPx,
      ) <= tolerancePx,
      true,
      `${label} keeps passage-to-bank-heading at one baseline step: ${JSON.stringify({
        passageBottom: flattenedPassage.at(-1).bottom,
        headingBottom: observation.headingLines[0]?.bottom,
      })}`,
    )
    recordSevenChoicesEdge(recordCoverage, {
      bundleId,
      variant,
      edgeId: 'passage_to_bank_heading',
      fromIdentity: observation.paragraphIds.at(-1),
      toIdentity: `${observation.bankId}:heading`,
      fromText: observation.passageTexts.at(-1),
      toText: sevenChoicesSourceOracle.oracle.variants.bankHeadingVisibleText,
      actualRatio:
        (observation.headingLines[0].center
        - flattenedPassage.at(-1).center) / targetStepPx,
    })
    assert.equal(
      Math.abs(
        observation.optionLines[0][0].bottom
        - observation.headingLines[0].bottom
        - targetStepPx,
      ) <= tolerancePx,
      true,
      `${label} keeps bank-heading-to-first-option at one baseline step: ${JSON.stringify({
        headingBottom: observation.headingLines[0]?.bottom,
        optionBottom: observation.optionLines[0][0].bottom,
      })}`,
    )
    recordSevenChoicesEdge(recordCoverage, {
      bundleId,
      variant,
      edgeId: 'bank_heading_to_first_option',
      fromIdentity: `${observation.bankId}:heading`,
      toIdentity: observation.optionIds[0],
      fromText: sevenChoicesSourceOracle.oracle.variants.bankHeadingVisibleText,
      toText: observation.optionTexts[0],
      actualRatio:
        (observation.optionLines[0][0].center
        - observation.headingLines[0].center) / targetStepPx,
    })
  } else {
    assert.equal(
      Math.abs(
        observation.optionLines[0][0].bottom
        - flattenedPassage.at(-1).bottom
        - targetStepPx * 2,
      ) <= sevenChoicesRhythm.targets.screen.twoStepTolerancePx,
      true,
      `${label} keeps passage-to-first-option at two local baseline steps: ${JSON.stringify({
        passageBottom: flattenedPassage.at(-1).bottom,
        optionBottom: observation.optionLines[0][0].bottom,
        actual:
          observation.optionLines[0][0].bottom
          - flattenedPassage.at(-1).bottom,
      })}`,
    )
    recordSevenChoicesEdge(recordCoverage, {
      bundleId,
      variant,
      edgeId: 'passage_to_first_option',
      fromIdentity: observation.paragraphIds.at(-1),
      toIdentity: observation.optionIds[0],
      fromText: observation.passageTexts.at(-1),
      toText: observation.optionTexts[0],
      actualRatio:
        (observation.optionLines[0][0].center
        - flattenedPassage.at(-1).center) / targetStepPx,
    })
  }
  for (const lines of observation.optionLines) {
    assert.equal(lines.length > 0, true, `${label} has no empty option row`)
    for (let index = 1; index < lines.length; index += 1) {
      assert.equal(
        Math.abs(lines[index].bottom - lines[index - 1].bottom - targetStepPx)
          <= tolerancePx,
        true,
        `${label} keeps wrapped option lines on one baseline step`,
      )
      const optionIndex = observation.optionLines.indexOf(lines)
      recordSevenChoicesEdge(recordCoverage, {
        bundleId,
        variant,
        edgeId: 'bank_option_line_internal',
        fromIdentity: observation.optionIds[optionIndex],
        toIdentity: observation.optionIds[optionIndex],
        fromText: observation.optionTexts[optionIndex],
        toText: observation.optionTexts[optionIndex],
        actualRatio:
          (lines[index].center - lines[index - 1].center) / targetStepPx,
        atomic: true,
      })
    }
  }
  for (let index = 1; index < observation.optionLines.length; index += 1) {
    assert.equal(
      Math.abs(
        observation.optionLines[index][0].bottom
        - observation.optionLines[index - 1].at(-1).bottom
        - targetStepPx,
      ) <= tolerancePx,
      true,
      `${label} keeps option-to-option transitions on one baseline step`,
    )
    recordSevenChoicesEdge(recordCoverage, {
      bundleId,
      variant,
      edgeId: 'bank_option_to_next_option',
      fromIdentity: observation.optionIds[index - 1],
      toIdentity: observation.optionIds[index],
      fromText: observation.optionTexts[index - 1],
      toText: observation.optionTexts[index],
      actualRatio:
        (observation.optionLines[index][0].center
        - observation.optionLines[index - 1].at(-1).center) / targetStepPx,
      atomic: true,
    })
  }
  if (wrappedOption) {
    assert.equal(
      observation.optionLines.some((lines) => lines.length > 1),
      true,
      `${label} executes a wrapped A-G option`,
    )
  }
  const labelLefts = observation.optionGeometry.map((row) => row.labelLeft)
  const rowWidths = observation.optionGeometry.map((row) => row.rowWidth)
  const textStarts = observation.optionGeometry.map((row) => row.textLeft)
  const rightBounds = observation.optionGeometry.map((row) => row.textRight)
  assert.equal(
    Math.max(...labelLefts) - Math.min(...labelLefts) <= 1.5,
    true,
    `${label} has one fixed option-label x cluster`,
  )
  assert.equal(
    Math.max(...rowWidths) - Math.min(...rowWidths) <= 1.5,
    true,
    `${label} gives every row the same remaining-width track`,
  )
  assert.equal(
    Math.max(...textStarts) - Math.min(...textStarts)
      <= observation.fontSizePx * 0.45,
    true,
    `${label} text starts vary only with label glyph width`,
  )
  if (!wrappedOption) {
    assert.equal(
      Math.max(...rightBounds) - Math.min(...rightBounds)
        >= observation.fontSizePx * 5,
      true,
      `${label} right bounds stay content-driven instead of distributed`,
    )
  }
  assert.equal(
    Math.abs(observation.bankInsetPx / observation.fontSizePx - 2) <= 0.05,
    true,
    `${label} maps the golden bank origin to a local 2em inset`,
  )
  for (const row of observation.optionGeometry) {
    assert.equal(
      Math.abs(row.labelBottom - row.firstTextLineBottom) <= 1,
      true,
      `${label} keeps each A-G label atomic with its first text line`,
    )
    assert.equal(
      [row.breakInside, row.pageBreakInside].includes('avoid'),
      true,
      `${label} marks each complete label-plus-text row unsplittable`,
    )
    assert.equal(
      Math.abs(
        (row.textLeft - row.labelRight) / observation.fontSizePx
        - sevenChoicesRhythm.horizontalBankGeometry.rendererMapping.screen
          .labelTextGapEm,
      ) <= 0.08,
      true,
      `${label} maps the content-driven label gap in local em`,
    )
    assert.equal(
      row.textLineLefts.every(
        (left) => Math.abs(left - row.textLeft) <= 1.5,
      ),
      true,
      `${label} wrapped continuation hangs at its own text-start x`,
    )
  }
  if (teacher) {
    assert.equal(
      observation.answerCount,
      oracle.questionBlankPairs.length,
      `${label} renders one answer tail per source Question`,
    )
    assert.deepEqual(
      observation.answerTexts.map((answerText) =>
        sevenChoicesSourceOracle.answerLabels.find((answerLabel) =>
          normalizedVisibleText(answerText).includes(answerLabel))),
      sevenChoicesSourceOracle.answerLabels,
      `${label} binds teacher tails to the immutable official-answer source`,
    )
    assert.equal(
      observation.teacherTail.length >= oracle.questionBlankPairs.length,
      true,
      `${label} exposes executable teacher-tail geometry`,
    )
    const firstTail = observation.teacherTail[0]
    const bankToAnswerPx =
      firstTail.lines[0].center - observation.optionLines.at(-1).at(-1).center
    recordSevenChoicesEdge(recordCoverage, {
      bundleId,
      variant,
      edgeId: 'bank_to_answer',
      fromIdentity: observation.optionIds.at(-1),
      toIdentity: firstTail.identity,
      fromText: observation.optionTexts.at(-1),
      toText: firstTail.text,
      actualRatio: assertRatio(bankToAnswerPx, 'bank_to_answer'),
    })
    for (let index = 1; index < observation.teacherTail.length; index += 1) {
      const previous = observation.teacherTail[index - 1]
      const current = observation.teacherTail[index]
      const actualPx = current.lines[0].center - previous.lines.at(-1).center
      const edgeId =
        previous.role === 'answer_line'
        && current.role === 'explanation_line'
          ? 'answer_to_explanation'
          : 'teacher_tail_internal'
      recordSevenChoicesEdge(recordCoverage, {
        bundleId,
        variant,
        edgeId,
        fromIdentity: previous.identity,
        toIdentity: current.identity,
        fromText: previous.text,
        toText: current.text,
        actualRatio: assertRatio(actualPx, edgeId),
      })
    }
  } else {
    assert.equal(
      observation.answerCount,
      0,
      `${label} Student/plain artifact hides answer tails`,
    )
  }
  assert.equal(
    normalizedVisibleText(observation.following.text)
      .replace(/[^\p{L}\p{N}]/gu, ''),
    normalizedVisibleText(
      sevenChoicesSourceOracle.oracle.sourceExtraction
        .followingSectionMarker,
    ).replace(/[^\p{L}\p{N}]/gu, ''),
    `${label} binds the following-section text to the immutable source PDF`,
  )
  const tail = teacher
    ? observation.teacherTail.at(-1)
    : {
        identity: observation.optionIds.at(-1),
        text: observation.optionTexts.at(-1),
        lines: observation.optionLines.at(-1),
      }
  const followingPx =
    observation.following.lines[0].center - tail.lines.at(-1).center
  const followingEdgeId = teacher
    ? 'teacher_tail_to_next_section_same_page'
    : 'student_bank_to_next_section_same_page'
  recordSevenChoicesEdge(recordCoverage, {
    bundleId,
    variant,
    edgeId: followingEdgeId,
    fromIdentity: tail.identity,
    toIdentity: observation.following.identity,
    fromText: tail.text,
    toText: observation.following.text,
    actualRatio: assertRatio(followingPx, followingEdgeId),
  })
}

async function sevenChoicesDomObservation(page, groupSelector) {
  const identities = sevenChoicesSourceOracle.oracle.publicIdentities
  return page.evaluate(({ groupSelector, knownRoles, identities }) => {
    const group = document.querySelector(groupSelector)
    if (!group) return null
    const lineRects = (element) => {
      if (!element) return []
      const walker = document.createTreeWalker(
        element,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: (node) =>
            node.textContent?.trim()
              ? NodeFilter.FILTER_ACCEPT
              : NodeFilter.FILTER_REJECT,
        },
      )
      const rects = []
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const range = document.createRange()
        range.selectNodeContents(node)
        for (const rect of range.getClientRects()) {
          if (rect.width > 0 && rect.height > 0) {
            rects.push({
              left: rect.left,
              right: rect.right,
              bottom: rect.bottom,
            })
          }
        }
      }
      const lines = rects.sort((left, right) => left.bottom - right.bottom)
        .reduce((lines, rect) => {
          const prior = lines.at(-1)
          if (!prior || Math.abs(rect.bottom - prior.bottom) > 1) {
            lines.push({ ...rect })
          } else {
            prior.left = Math.min(prior.left, rect.left)
            prior.right = Math.max(prior.right, rect.right)
            prior.bottom = Math.max(prior.bottom, rect.bottom)
          }
          return lines
        }, [])
      const lineHeight = Number.parseFloat(
        getComputedStyle(element).lineHeight || '0',
      )
      const elementTop = element.getBoundingClientRect().top
      return lines.map((line, index) => ({
        ...line,
        center:
          Number.isFinite(lineHeight) && lineHeight > 0
            ? elementTop + lineHeight * (index + 0.5)
            : line.bottom,
      }))
    }
    const textBottom = (element) => {
      if (!element) return null
      const range = document.createRange()
      range.selectNodeContents(element)
      const bottoms = [...range.getClientRects()]
        .filter((rect) => rect.width > 0 && rect.height > 0)
        .map((rect) => rect.bottom)
      return bottoms.length > 0 ? Math.max(...bottoms) : null
    }
    const roleElements = [...document.querySelectorAll(
      '[data-canonical-seven-choices-rhythm-role]',
    )]
    const chromeElements = roleElements.filter((element) =>
      element.hasAttribute('data-canonical-seven-choices-chrome')
      || element.getAttribute('data-canonical-seven-choices-preceding-for'))
    const readingBoundary = document.querySelector(
      `[data-canonical-reading-before-section][data-canonical-option-id="${identities.readingBoundary.optionId}"], `
      + `[data-paper-browse-anchor="${identities.readingBoundary.groupId}"] `
      + `[data-canonical-option-id="${identities.readingBoundary.optionId}"], `
      + `[data-canonical-group-id="${identities.readingBoundary.groupId}"] `
      + `[data-canonical-option-id="${identities.readingBoundary.optionId}"]`,
    )
    const teacherReadingBoundary = document.querySelector(
      `[data-canonical-question-id="${identities.readingBoundary.questionId}"] `
      + '[data-canonical-reading-before-section]',
    )
    const following = document.querySelector(
      '[data-canonical-seven-choices-following-for]',
    )
    const bank = group.querySelector('[data-canonical-bank-id]')
    const bankRegion = bank?.closest('.ps-option-bank-region, .canonical-option-bank-region')
    const optionElements = [...group.querySelectorAll(
      '[data-canonical-seven-choices-rhythm-role="bank_option_line"]',
    )]
    const firstOptionStyle = optionElements[0]
      ? getComputedStyle(optionElements[0])
      : null
    const passageContainer = group.querySelector('.ps-passage-body, .passage')
    const bankStyle = bank ? getComputedStyle(bank) : null
    const bankRect = bank?.getBoundingClientRect()
    const passageRect = passageContainer?.getBoundingClientRect()
    return {
      groupId:
        group.getAttribute('data-paper-browse-anchor')
        || group.getAttribute('data-canonical-group-id'),
      paragraphIds: [...group.querySelectorAll(
        '[data-canonical-seven-choices-rhythm-role="passage_body_line"]',
      )].map((element) =>
        element.getAttribute('data-canonical-paragraph-id')
        || element.getAttribute('data-paper-paragraph-id')),
      passageTitleCount: group.querySelectorAll(
        '[data-canonical-seven-choices-rhythm-role="passage_title"]',
      ).length,
      passageTexts: [...group.querySelectorAll(
        '[data-canonical-seven-choices-rhythm-role="passage_body_line"]',
      )].map((element) => element.textContent || ''),
      passageLines: [...group.querySelectorAll(
        '[data-canonical-seven-choices-rhythm-role="passage_body_line"]',
      )].map(lineRects),
      passageBox: passageContainer
        ? {
            top: passageContainer.getBoundingClientRect().top,
            bottom: passageContainer.getBoundingClientRect().bottom,
            marginTop: Number.parseFloat(
              getComputedStyle(passageContainer).marginTop,
            ),
            marginBottom: Number.parseFloat(
              getComputedStyle(passageContainer).marginBottom,
            ),
          }
        : null,
      readingBoundary: {
        identity: identities.readingBoundary.optionId,
        text: readingBoundary?.textContent || '',
        lines: lineRects(readingBoundary),
        bottom: textBottom(readingBoundary),
        box: readingBoundary
          ? {
              top: readingBoundary.getBoundingClientRect().top,
              bottom: readingBoundary.getBoundingClientRect().bottom,
              marginTop: Number.parseFloat(
                getComputedStyle(readingBoundary).marginTop,
              ),
              marginBottom: Number.parseFloat(
                getComputedStyle(readingBoundary).marginBottom,
              ),
            }
          : null,
      },
      teacherReadingBoundary: {
        identity:
          `${identities.readingBoundary.questionId}:${
            teacherReadingBoundary?.getAttribute(
              'data-canonical-reading-rhythm-role',
            ) || 'teacher_tail'
          }`,
        role: teacherReadingBoundary?.getAttribute(
          'data-canonical-reading-rhythm-role',
        ),
        text: teacherReadingBoundary?.textContent || '',
        lines: lineRects(teacherReadingBoundary),
        bottom: textBottom(teacherReadingBoundary),
        box: teacherReadingBoundary
          ? {
              top: teacherReadingBoundary.getBoundingClientRect().top,
              bottom: teacherReadingBoundary.getBoundingClientRect().bottom,
              marginTop: Number.parseFloat(
                getComputedStyle(teacherReadingBoundary).marginTop,
              ),
              marginBottom: Number.parseFloat(
                getComputedStyle(teacherReadingBoundary).marginBottom,
              ),
            }
          : null,
      },
      chrome: chromeElements.map((element, index) => ({
        identity:
          element.getAttribute('data-paper-browse-anchor')
          || element.id
          || `seven-choices-chrome-${index}`,
        role: element.getAttribute(
          'data-canonical-seven-choices-rhythm-role',
        ),
        text: element.textContent || '',
        lines: lineRects(element),
        bottom: textBottom(element),
        box: {
          top: element.getBoundingClientRect().top,
          bottom: element.getBoundingClientRect().bottom,
          marginTop: Number.parseFloat(getComputedStyle(element).marginTop),
          marginBottom: Number.parseFloat(
            getComputedStyle(element).marginBottom,
          ),
          lineHeight: Number.parseFloat(getComputedStyle(element).lineHeight),
        },
      })),
      blankPairs: [...group.querySelectorAll(
        '[data-canonical-seven-choices-rhythm-role="inline_blank_marker"]',
      )].map((element) => element.getAttribute('data-canonical-pair')),
      blankLineCounts: [...group.querySelectorAll(
        '[data-canonical-seven-choices-rhythm-role="inline_blank_marker"]',
      )].map((element) => lineRects(element).length),
      blankGeometry: [...group.querySelectorAll(
        '[data-canonical-seven-choices-rhythm-role="inline_blank_marker"]',
      )].map((element) => {
        const style = getComputedStyle(element)
        const blankLine = lineRects(element)[0]
        const passageLineBottoms = lineRects(element.closest('p'))
          .map((line) => line.bottom)
        return {
          blankBottom: blankLine?.bottom,
          passageLineBottoms,
          verticalBoxPx:
            Number.parseFloat(style.marginTop || '0')
            + Number.parseFloat(style.marginBottom || '0')
            + Number.parseFloat(style.paddingTop || '0')
            + Number.parseFloat(style.paddingBottom || '0'),
        }
      }),
      bankCount: group.querySelectorAll('[data-canonical-bank-id]').length,
      bankId: bank?.getAttribute('data-canonical-bank-id'),
      headingCount: group.querySelectorAll(
        '[data-canonical-seven-choices-rhythm-role="bank_heading"]',
      ).length,
      headingLines: lineRects(group.querySelector(
        '[data-canonical-seven-choices-rhythm-role="bank_heading"]',
      )),
      optionIds: optionElements.map((element) =>
        element.getAttribute('data-canonical-option-id')),
      optionRoles: optionElements.map((element) =>
        element.getAttribute('data-canonical-seven-choices-rhythm-role')),
      optionLabels: optionElements.map((element) =>
        element.querySelector(
          '.ps-option-label, .canonical-option-bank-label',
        )?.textContent?.replace(/[.\s]+$/g, '') || ''),
      optionTexts: optionElements.map((element) =>
        element.querySelector(
          '.ps-option-bank-text, .canonical-option-bank-text',
        )?.textContent || ''),
      optionLines: optionElements.map(lineRects),
      optionGeometry: optionElements.map((element) => {
        const row = element.getBoundingClientRect()
        const label = element.querySelector(
          '.ps-option-label, .canonical-option-bank-label',
        )
        const labelRect = label?.getBoundingClientRect()
        const textElement = element.querySelector(
          '.ps-option-bank-text, .canonical-option-bank-text',
        )
        const text = textElement?.getBoundingClientRect()
        const textLines = lineRects(textElement)
        const textLineLefts = textLines.map((line) => line.left)
        return {
          rowWidth: row.width,
          labelLeft: labelRect?.left,
          labelRight: labelRect?.right,
          labelBottom: lineRects(label)[0]?.bottom,
          firstTextLineBottom: textLines[0]?.bottom,
          textLeft: text?.left,
          textRight: Math.max(...textLines.map((line) => line.right)),
          textLineLefts,
          breakInside: getComputedStyle(element).breakInside,
          pageBreakInside: getComputedStyle(element).pageBreakInside,
        }
      }),
      fontSizePx: Number.parseFloat(firstOptionStyle?.fontSize || '0'),
      bankInsetPx: optionElements[0] && passageRect
        ? optionElements[0].querySelector(
            '.ps-option-label, .canonical-option-bank-label',
          )?.getBoundingClientRect().left - passageRect.left
        : Number.parseFloat(bankStyle?.marginLeft || '0')
          + Number.parseFloat(bankStyle?.paddingLeft || '0'),
      answerCount: group.querySelectorAll(
        '[data-canonical-seven-choices-rhythm-role="answer_line"]',
      ).length,
      answerTexts: [...group.querySelectorAll(
        '[data-canonical-seven-choices-rhythm-role="answer_line"]',
      )].map((element) => element.textContent || ''),
      teacherTail: [...group.querySelectorAll(
        [
          '[data-canonical-seven-choices-rhythm-role="answer_line"]',
          '[data-canonical-seven-choices-rhythm-role="explanation_line"]',
        ].join(','),
      )].map((element, index) => ({
        identity:
          element.getAttribute('data-canonical-question-id')
          || `${identities.sevenChoices.questionBlankPairs[
            Math.floor(index / 2)
          ]?.questionId || 'unknown-question'}:${element.getAttribute(
            'data-canonical-seven-choices-rhythm-role',
          )}`,
        role: element.getAttribute(
          'data-canonical-seven-choices-rhythm-role',
        ),
        text: element.textContent || '',
        lines: lineRects(element),
      })),
      chromeRoles: chromeElements.map((element) =>
        element.getAttribute('data-canonical-seven-choices-rhythm-role')),
      boundaryGroupId: document.querySelector(
        '[data-canonical-seven-choices-reading-boundary-group-id]',
      )?.getAttribute(
        'data-canonical-seven-choices-reading-boundary-group-id',
      ),
      followingRole: document.querySelector(
        '[data-canonical-seven-choices-following-for]',
      )?.getAttribute('data-canonical-seven-choices-rhythm-role'),
      followingFor: document.querySelector(
        '[data-canonical-seven-choices-following-for]',
      )?.getAttribute('data-canonical-seven-choices-following-for'),
      following: {
        identity:
          following?.getAttribute('data-paper-browse-anchor')
          || following?.getAttribute(
            'data-canonical-seven-choices-section-id',
          )
          || 'seven-choices-following-section',
        text: following?.textContent || '',
        lines: lineRects(following),
      },
      phantomRoleCount: roleElements.filter((element) =>
        !knownRoles.includes(element.getAttribute(
          'data-canonical-seven-choices-rhythm-role',
        ))).length,
      bankHeadingState: bankRegion?.getAttribute(
        'data-canonical-bank-heading-state',
      ),
    }
  }, {
    groupSelector,
    knownRoles: Object.values(sevenChoicesRhythm.semanticRoleClasses).flat(),
    identities,
  })
}

async function assertScreenSevenChoicesGoldenGeometry(
  page,
  label,
  {
    wrappedOption = false,
    headingPresent = false,
    bundleId = null,
    variant = null,
    recordCoverage = null,
  } = {},
) {
  const groupId =
    sevenChoicesSourceOracle.oracle.publicIdentities.sevenChoices.groupId
  const observation = await sevenChoicesDomObservation(
    page,
    `[data-paper-browse-anchor="${groupId}"]`,
  )
  assertSevenChoicesDomObservation(observation, label, {
    wrappedOption,
    headingPresent,
    bundleId,
    variant,
    recordCoverage,
  })
  return observation
}

async function assertPrintHtmlSevenChoicesGoldenGeometry(
  page,
  html,
  label,
  {
    teacher = false,
    headingPresent = false,
    wrappedOption = false,
    requireReadingBoundary = true,
    chromePresent = true,
    bundleId = null,
    variant = null,
    recordCoverage = null,
  } = {},
) {
  await page.setContent(html, { waitUntil: 'load' })
  await page.evaluate(() => document.fonts.ready)
  const groupId =
    sevenChoicesSourceOracle.oracle.publicIdentities.sevenChoices.groupId
  const observation = await sevenChoicesDomObservation(
    page,
    `[data-canonical-group-id="${groupId}"]`,
  )
  assertSevenChoicesDomObservation(observation, label, {
    teacher,
    headingPresent,
    wrappedOption,
    requireReadingBoundary,
    chromePresent,
    bundleId,
    variant,
    recordCoverage,
  })
  return observation
}

async function assertPrintHtmlReadingVerticalRhythm(
  page,
  html,
  consumption,
  label,
  oracleEntries = readingPredecessorOracle.printPdf,
) {
  await page.setContent(html, { waitUntil: 'load' })
  await page.evaluate(() => document.fonts.ready)
  const groupIds = consumption.selections.find(
    (selection) => selection.familyContractId === 'reading',
  ).groupIds
  const observations = await page.evaluate((readingGroupIds) => {
    const lineBottoms = (element) => {
      if (!element) return []
      const walker = document.createTreeWalker(
        element,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: (node) =>
            node.textContent?.trim()
              ? NodeFilter.FILTER_ACCEPT
              : NodeFilter.FILTER_REJECT,
        },
      )
      const bottoms = []
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const range = document.createRange()
        range.selectNodeContents(node)
        for (const rect of range.getClientRects()) {
          if (rect.width > 0 && rect.height > 0) bottoms.push(rect.bottom)
        }
      }
      return bottoms.sort((left, right) => left - right).reduce(
        (lines, bottom) => {
          if (
            lines.at(-1) === undefined
            || Math.abs(bottom - lines.at(-1)) > 1
          ) {
            lines.push(bottom)
          }
          return lines
        },
        [],
      )
    }
    const groups = readingGroupIds.map((groupId) => {
      const group = document.querySelector(
        `[data-canonical-group-id="${groupId}"]`,
      )
      if (!group) return null
      const content = [...group.querySelectorAll(
        [
          '[data-canonical-reading-rhythm-role="passage_title"]',
          '[data-canonical-reading-rhythm-role="passage_subtitle"]',
          '[data-canonical-reading-rhythm-role="passage_body_line"]',
          '[data-canonical-reading-rhythm-role="native_table_line"]',
        ].join(','),
      )].map((element) => ({
        role: element.getAttribute('data-canonical-reading-rhythm-role'),
        lines: lineBottoms(element),
      }))
      const questions = [...group.querySelectorAll(
        '[data-canonical-reading-rhythm-role="question_block"]',
      )].map((question) => ({
        stem: lineBottoms(question.querySelector(
          '[data-canonical-reading-rhythm-role="question_stem_line"]',
        )),
        options: [...question.querySelectorAll(
          '[data-canonical-reading-rhythm-role="option_line"]',
        )].map((option) => lineBottoms(option)),
        placementMode: question.querySelector(
          '[data-canonical-placement-mode]',
        )?.getAttribute('data-canonical-placement-mode'),
        answer: lineBottoms(question.querySelector(
          '[data-canonical-reading-rhythm-role="answer_line"]',
        )),
        explanation: lineBottoms(question.querySelector(
          '[data-canonical-reading-rhythm-role="explanation_line"]',
        )),
      }))
      const visiblePredecessor = document.querySelector(
        `[data-canonical-reading-preceding-for="${groupId}"]`,
      )
      return {
        groupId,
        letter: lineBottoms(group.querySelector(
          '[data-canonical-reading-rhythm-role="passage_letter"]',
        )),
        content,
        questions,
        transition: {
          predecessor: lineBottoms(visiblePredecessor).at(-1),
          predecessorRole: visiblePredecessor?.getAttribute(
            'data-canonical-reading-rhythm-role',
          ),
        },
      }
    })
    const ending = document.querySelector(
      '[data-canonical-reading-following-for]',
    )
    const endingCount = document.querySelectorAll(
      '[data-canonical-reading-following-for]',
    ).length
    const endingGroupId = ending?.getAttribute(
      'data-canonical-reading-following-for',
    )
    const endingPredecessor = document.querySelector(
      `[data-canonical-reading-before-section]`,
    )
    const allEndingPredecessors = [...document.querySelectorAll(
      '[data-canonical-reading-before-section]',
    )]
    return {
      groups,
      ending: ending && endingPredecessor
        ? {
            endingCount,
            groupId: endingGroupId,
            predecessorCount: allEndingPredecessors.length,
            predecessorRole: allEndingPredecessors.at(-1).getAttribute(
              'data-canonical-reading-rhythm-role',
            ),
            predecessorQuestionId: allEndingPredecessors.at(-1).getAttribute(
              'data-canonical-reading-predecessor-question-id',
            ),
            predecessorOptionId: allEndingPredecessors.at(-1).getAttribute(
              'data-canonical-reading-predecessor-option-id',
            ),
            sectionText: ending.textContent?.trim(),
            step:
              lineBottoms(ending)[0]
              - lineBottoms(allEndingPredecessors.at(-1)).at(-1),
          }
        : null,
    }
  }, groupIds)
  assert.equal(
    observations.groups.every(Boolean),
    true,
    `${label} exposes every Reading group`,
  )
  const target =
    readingPassageLetterTypography.verticalRhythm.targets.screen
  const optionRowCounts = new Set()
  const placementModes = new Set()
  const assertStep = (actual, ratio, edgeId) => assert.equal(
    Math.abs(actual - target.baselineStepPx * ratio)
      <= (ratio === 2
        ? target.twoStepTolerancePx
        : target.oneStepTolerancePx),
    true,
    `${label} ${edgeId} keeps ${ratio}x rhythm: ${JSON.stringify({
      actual,
      expected: target.baselineStepPx * ratio,
    })}`,
  )
  for (const [groupIndex, group] of observations.groups.entries()) {
    assert.equal(group.letter.length, 1, `${label} has one passage letter`)
    assert.equal(group.content.length > 0, true, `${label} has passage content`)
    assertStep(
      group.content[0].lines[0] - group.letter[0],
      1,
      'letter_to_first_content',
    )
    for (const entry of group.content) {
      for (let index = 1; index < entry.lines.length; index += 1) {
        assertStep(
          entry.lines[index] - entry.lines[index - 1],
          1,
          'passage_content_internal',
        )
      }
    }
    for (let index = 1; index < group.content.length; index += 1) {
      assertStep(
        group.content[index].lines[0]
          - group.content[index - 1].lines.at(-1),
        1,
        'passage_content_internal',
      )
    }
    assertStep(
      group.questions[0].stem[0] - group.content.at(-1).lines.at(-1),
      2,
      'passage_to_first_question',
    )
    for (const [questionIndex, question] of group.questions.entries()) {
      for (let index = 1; index < question.stem.length; index += 1) {
        assertStep(
          question.stem[index] - question.stem[index - 1],
          1,
          'question_stem_internal',
        )
      }
      const optionRows = question.options.flatMap((lines) => lines)
        .sort((left, right) => left - right)
        .reduce((rows, bottom) => {
          if (rows.at(-1) === undefined || Math.abs(bottom - rows.at(-1)) > 1) {
            rows.push(bottom)
          }
          return rows
        }, [])
      optionRowCounts.add(optionRows.length)
      placementModes.add(question.placementMode)
      assertStep(
        optionRows[0] - question.stem.at(-1),
        1,
        'stem_to_options',
      )
      for (let index = 1; index < optionRows.length; index += 1) {
        assertStep(
          optionRows[index] - optionRows[index - 1],
          1,
          'option_line_internal',
        )
      }
      let tail = optionRows.at(-1)
      if (question.answer.length > 0) {
        assertStep(
          question.answer[0] - tail,
          1,
          'option_to_answer',
        )
        tail = question.answer.at(-1)
      }
      if (question.explanation.length > 0) {
        assertStep(
          question.explanation[0] - tail,
          1,
          'answer_to_explanation',
        )
        for (
          let index = 1;
          index < question.explanation.length;
          index += 1
        ) {
          assertStep(
            question.explanation[index] - question.explanation[index - 1],
            1,
            'answer_to_explanation',
          )
        }
        tail = question.explanation.at(-1)
      }
      const nextQuestion = group.questions[questionIndex + 1]
      if (nextQuestion) {
        assertStep(
          nextQuestion.stem[0] - tail,
          1,
          question.answer.length > 0
            ? 'teacher_tail_to_next_question'
            : 'question_to_next_question',
        )
      }
    }
    assertStep(
      group.letter[0] - group.transition.predecessor,
      groupIndex === 0 ? 1 : 2,
      groupIndex === 0 ? 'chrome_to_a' : 'reading_passage_transition',
    )
    assert.equal(
      group.transition.predecessorRole,
      groupIndex === 0
        ? oracleEntries[0].predecessorRole
        : label.includes('Teacher')
          ? 'explanation_line'
          : 'option_line',
      `${label} uses the exact visible transition role`,
    )
  }
  assert.equal(
    [1, 2, 4].every((rowCount) => optionRowCounts.has(rowCount)),
    true,
    `${label} covers one-, two-, and four-row option layouts`,
  )
  assert.deepEqual(
    [...placementModes].sort(),
    ['four_columns', 'one_column', 'two_by_two'],
    `${label} covers every canonical ABCD placement mode`,
  )
  const ending = readingPredecessorOracle.readingEnd
  assert.ok(observations.ending, `${label} exposes Reading D ending`)
  assert.equal(
    observations.ending.endingCount,
    1,
    `${label} exposes exactly one post-Reading section anchor`,
  )
  assert.equal(observations.ending.groupId, ending.groupId)
  assert.equal(observations.ending.predecessorCount, 1)
  assert.equal(
    observations.ending.predecessorQuestionId,
    ending.predecessorQuestionId,
  )
  assert.equal(
    observations.ending.predecessorOptionId,
    ending.predecessorOptionId,
  )
  assert.equal(
    observations.ending.predecessorRole,
    label.includes('Teacher') ? 'explanation_line' : 'option_line',
  )
  assert.equal(
    normalizedVisibleText(observations.ending.sectionText),
    normalizedVisibleText(ending.printPdfNextSectionVisibleText),
  )
  assertStep(
    observations.ending.step,
    2,
    label.includes('Teacher')
      ? 'teacher_reading_to_next_section_same_page'
      : 'reading_to_next_section_same_page',
  )
}

function assertStudentTeacherStructuralParity(studentHtml, teacherHtml) {
  const student = structuralArtifactIdentity(studentHtml)
  const teacher = structuralArtifactIdentity(teacherHtml)
  for (const [attributeName, studentValues] of Object.entries(student)) {
    if (attributeName === 'data-canonical-question-id') continue
    assert.deepEqual(
      studentValues,
      teacher[attributeName],
      `Student/Teacher Print HTML retains ${attributeName}`,
    )
  }
  const teacherQuestionIds = new Set(teacher['data-canonical-question-id'])
  for (const questionId of new Set(student['data-canonical-question-id'])) {
    assert.equal(
      teacherQuestionIds.has(questionId),
      true,
      `Teacher Print HTML retains Student question ${questionId}`,
    )
  }
}

function assertNoReadingRolesInNonReadingPrintGroups(html, asset, label) {
  for (const group of Object.values(asset.content.groups)
    .filter((candidate) => candidate.groupType !== 'reading')) {
    const sectionStart = html.indexOf(
      `data-canonical-group-id="${group.groupId}"`,
    )
    if (sectionStart < 0) continue
    const sectionEnd = html.indexOf('</section>', sectionStart)
    assert.notEqual(
      sectionEnd,
      -1,
      `${label} closes ${group.groupId}'s structural section`,
    )
    assert.equal(
      html.slice(sectionStart, sectionEnd)
        .includes('data-canonical-reading-rhythm-role='),
      false,
      `${label} exposes no Reading rhythm roles in ${group.groupId}`,
    )
  }
}

function expectedOccurrenceSignatures(consumption) {
  return normalizedConsumptionSemantics(consumption)
    .flatMap((selection) => selection.projectedOccurrences)
    .flatMap((occurrence) => [
      occurrence.semanticSignature,
      occurrence.occurrenceSignature,
    ])
    .filter((signature) => typeof signature === 'string')
}

function assertExactRenderedSignatures(html, consumption, label) {
  assert.deepEqual(
    [...new Set(attributeSignatures(html))].sort(),
    [...new Set(expectedOccurrenceSignatures(consumption))].sort(),
    `${label} renders every canonical semantic and occurrence signature`,
  )
}

function expectedCanonicalIdentity(consumption) {
  const values = {
    groupId: new Set(),
    questionId: new Set(),
    blankId: new Set(),
    optionId: new Set(),
    answerRegionRef: new Set(),
    responseSlotId: new Set(),
  }
  function visit(value) {
    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }
    if (!value || typeof value !== 'object') return
    for (const [key, child] of Object.entries(value)) {
      if (
        Object.hasOwn(values, key)
        && typeof child === 'string'
      ) values[key].add(child)
      visit(child)
    }
  }
  function collectKey(value, targetKey, output) {
    if (Array.isArray(value)) {
      value.forEach((entry) => collectKey(entry, targetKey, output))
      return
    }
    if (!value || typeof value !== 'object') return
    for (const [key, child] of Object.entries(value)) {
      if (key === targetKey && typeof child === 'string') output.add(child)
      collectKey(child, targetKey, output)
    }
  }
  for (const selection of consumption.selections) {
    for (const groupId of selection.groupIds) {
      const group = projectCanonicalConsumerGroup({
        consumption,
        familyContractId: selection.familyContractId,
        groupId,
      })
      visit(group)
      if (group.groupType === 'grammarFill') {
        for (const question of group.questions) {
          values.questionId.delete(question.questionId)
        }
      }
      if (group.groupType !== 'sevenChoices') {
        const groupBlankIds = new Set()
        collectKey(group, 'blankId', groupBlankIds)
        for (const blankId of groupBlankIds) values.blankId.delete(blankId)
      }
      if (!['reading', 'sevenChoices'].includes(group.groupType)) {
        const groupOptionIds = new Set()
        collectKey(group, 'optionId', groupOptionIds)
        for (const optionId of groupOptionIds) values.optionId.delete(optionId)
      }
    }
  }
  return Object.fromEntries(
    Object.entries(values).map(([key, entries]) => [key, [...entries].sort()]),
  )
}

function assertArtifactContainsCanonicalIdentity(html, expected, label) {
  const attributeByKey = {
    groupId: ['data-canonical-group-id', 'data-paper-browse-anchor'],
    questionId: ['data-canonical-question-id', 'data-paper-question-id'],
    blankId: ['data-canonical-blank-id'],
    optionId: ['data-canonical-option-id'],
    answerRegionRef: ['data-canonical-answer-region-ref'],
    responseSlotId: ['data-canonical-response-slot-id'],
  }
  for (const [key, attributeNames] of Object.entries(attributeByKey)) {
    const actual = new Set(attributeNames.flatMap(
      (attributeName) => canonicalAttributeValues(html, attributeName),
    ))
    for (const value of expected[key]) {
      assert.equal(
        actual.has(value),
        true,
        `${label} carries ${attributeNames.join(' or ')}=${value}; actual ${
          [...actual].join(',')
        }`,
      )
    }
  }
}

function expectedGroupOrder(asset) {
  return asset.content.blocks.flatMap((block) =>
    block.type === 'group'
    && asset.content.groups[block.groupId]?.groupType !== 'listening'
      ? [block.groupId]
      : [])
}

function pdfText(pdfPath) {
  return execFileSync('pdftotext', ['-layout', pdfPath, '-'], {
    encoding: 'utf8',
  })
}

function normalizedVisibleText(value) {
  return String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim()
}

function sourceLexicalTokens(value) {
  return normalizedVisibleText(value)
    .replaceAll('’', "'")
    .match(/[\p{L}\p{N}]+(?:[-'][\p{L}\p{N}]+)*/gu) || []
}

function canonicalInlineText(inlines) {
  return normalizedVisibleText(
    (inlines || []).map((inline) =>
      inline.kind === 'text' ? inline.text : ' ').join(' '),
  )
}

function projectedGroupTextCandidates(group) {
  if (Array.isArray(group.blocks)) {
    return group.blocks.map((block) =>
      block.kind === 'table'
        ? normalizedVisibleText(block.rows.map((row) =>
            row.cells.map((cell) => cell.text).join(' '),
          ).join(' '))
        : normalizedVisibleText(block.text || block.caption))
  }
  if (Array.isArray(group.promptBlocks)) {
    return group.promptBlocks.map((block) => normalizedVisibleText(block.text))
  }
  if (Array.isArray(group.materialBlocks)) {
    return group.materialBlocks.map((block) => normalizedVisibleText(block.text))
  }
  if (Array.isArray(group.paragraphs)) {
    return group.paragraphs.flatMap((paragraph) => [
      normalizedVisibleText(
        paragraph.nodes.map((node) => node.type === 'text' ? node.text : ' ')
          .join(' '),
      ),
      ...paragraph.nodes
        .filter((node) => node.type === 'text')
        .map((node) => normalizedVisibleText(node.text)),
    ])
  }
  return []
}

function expectedPdfGroupMarkers(consumption) {
  return consumption.selections.flatMap((selection) =>
    selection.groupIds.map((groupId) => {
      const group = projectCanonicalConsumerGroup({
        consumption,
        familyContractId: selection.familyContractId,
        groupId,
      })
      const text = projectedGroupTextCandidates(group)
        .find((candidate) => candidate.length >= 24)
      assert.ok(text, `${groupId} provides a PDF content marker`)
      return {
        familyContractId: selection.familyContractId,
        groupId,
        marker: text.slice(0, 24),
      }
    }))
}

function assertPdfSemanticOrder(pdfPath, consumption, label) {
  const text = normalizedVisibleText(pdfText(pdfPath))
  const markers = expectedPdfGroupMarkers(consumption)
  const offsets = markers.map(({ groupId, marker }) => {
    const offset = text.indexOf(marker)
    assert.notEqual(offset, -1, `${label} retains ${groupId}: ${marker}`)
    return offset
  })
  assert.equal(
    offsets.every(
      (offset, index) => index === 0 || offset > offsets[index - 1],
    ),
    true,
    `${label} retains canonical whole-paper Group order: ${JSON.stringify(
      markers.map((marker, index) => ({ ...marker, offset: offsets[index] })),
    )}`,
  )
  assert.deepEqual(
    [...new Set(markers.map(({ familyContractId }) => familyContractId))]
      .sort(),
    [
      'application-writing',
      'cloze',
      'continuation-writing',
      'grammar-fill',
      'reading',
      'seven-choices',
    ],
    `${label} covers every active canonical family`,
  )
  for (const forbidden of [
    'listening.short-dialogue',
    'listening.long-form',
    '听力',
  ]) {
    assert.equal(
      text.includes(forbidden),
      false,
      `${label} exposes zero inactive Listening occurrence: ${forbidden}`,
    )
  }
}

function countTextOccurrences(text, fragment) {
  let count = 0
  let offset = 0
  while ((offset = text.indexOf(fragment, offset)) !== -1) {
    count += 1
    offset += fragment.length
  }
  return count
}

function pdfPageText(pdfPath, page) {
  return normalizedVisibleText(execFileSync(
    'pdftotext',
    ['-f', String(page), '-l', String(page), '-layout', pdfPath, '-'],
    { encoding: 'utf8' },
  ))
}

function markerPages(pdfPath, pageCount, marker) {
  return Array.from({ length: pageCount }, (_, index) => index + 1)
    .filter((page) => pdfPageText(pdfPath, page).includes(marker))
}

function compactMarkerPages(pdfPath, pageCount, marker) {
  const compactMarker = String(marker || '').normalize('NFKC').replaceAll(/\s/g, '')
  return Array.from({ length: pageCount }, (_, index) => index + 1)
    .filter((page) =>
      pdfPageText(pdfPath, page).replaceAll(/\s/g, '').includes(compactMarker))
}

function svgPageRectangles(pdfPath, svgPath, page) {
  execFileSync(
    'pdftocairo',
    ['-svg', '-f', String(page), '-l', String(page), pdfPath, svgPath],
  )
  try {
    const svg = readFileSync(svgPath, 'utf8')
    const root = svg.match(
      /<svg\b[^>]*width="([\d.]+)pt"[^>]*height="([\d.]+)pt"[^>]*viewBox="([^"]+)"/,
    )
    assert.ok(root, `PDF page ${page} has SVG page geometry`)
    const rectangles = [...svg.matchAll(/<path\b[^>]*\bd="[^"]+"[^>]*>/g)]
      .map(([tag]) => {
        const d = tag.match(/\bd="([^"]+)"/)?.[1]
        if (!d) return null
        const points = [...d.matchAll(
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
        if (
          xMax - xMin <= 0
          || yMax - yMin <= 0
          || transformed.some(([x, y]) =>
            !(
              Math.abs(x - xMin) <= 0.1
              || Math.abs(x - xMax) <= 0.1
            )
            || !(
              Math.abs(y - yMin) <= 0.1
              || Math.abs(y - yMax) <= 0.1
            ))
        ) return null
        return {
          page,
          xMin,
          yMin,
          xMax,
          yMax,
          width: xMax - xMin,
          height: yMax - yMin,
          stroked: /\bfill="none"/.test(tag),
        }
      })
      .filter(Boolean)
    return {
      width: Number(root[1]),
      height: Number(root[2]),
      viewBox: root[3].split(/\s+/).map(Number),
      rectangles,
    }
  } finally {
    rmSync(svgPath, { force: true })
  }
}

function groupedThinRectangles(rectangles, orientation) {
  const groups = new Map()
  for (const rectangle of rectangles) {
    const vertical = rectangle.width <= 1.6 && rectangle.height >= 10
    const horizontal = rectangle.height <= 1.6 && rectangle.width >= 10
    if (orientation === 'vertical' ? !vertical : !horizontal) continue
    const center = orientation === 'vertical'
      ? (rectangle.xMin + rectangle.xMax) / 2
      : (rectangle.yMin + rectangle.yMax) / 2
    const key = (Math.round(center * 2) / 2).toFixed(1)
    const group = groups.get(key) || []
    group.push(rectangle)
    groups.set(key, group)
  }
  return [...groups.entries()].map(([coordinate, items]) => ({
    coordinate: Number(coordinate),
    count: items.length,
    xMin: Math.min(...items.map((item) => item.xMin)),
    xMax: Math.max(...items.map((item) => item.xMax)),
    yMin: Math.min(...items.map((item) => item.yMin)),
    yMax: Math.max(...items.map((item) => item.yMax)),
  })).sort((left, right) => left.coordinate - right.coordinate)
}

function findNativeTableGrid(rectangles, rowCount, columnCount) {
  const vertical = groupedThinRectangles(rectangles, 'vertical')
    .filter((group) => group.count >= rowCount)
  const horizontal = groupedThinRectangles(rectangles, 'horizontal')
    .filter((group) => group.count >= columnCount)
  for (
    let verticalIndex = 0;
    verticalIndex <= vertical.length - columnCount - 1;
    verticalIndex += 1
  ) {
    const columns = vertical.slice(
      verticalIndex,
      verticalIndex + columnCount + 1,
    )
    const columnWidths = columns.slice(1).map(
      (boundary, index) => boundary.coordinate - columns[index].coordinate,
    )
    if (
      columns.at(-1).coordinate - columns[0].coordinate < 250
      || Math.max(...columnWidths) - Math.min(...columnWidths) > 3
      || Math.max(...columns.map((group) => group.yMin))
        - Math.min(...columns.map((group) => group.yMin)) > 3
      || Math.max(...columns.map((group) => group.yMax))
        - Math.min(...columns.map((group) => group.yMax)) > 3
    ) continue
    for (
      let horizontalIndex = 0;
      horizontalIndex <= horizontal.length - rowCount - 1;
      horizontalIndex += 1
    ) {
      const rows = horizontal.slice(
        horizontalIndex,
        horizontalIndex + rowCount + 1,
      )
      const rowHeights = rows.slice(1).map(
        (boundary, index) => boundary.coordinate - rows[index].coordinate,
      )
      if (
        rows.at(-1).coordinate - rows[0].coordinate < 80
        || Math.max(...rowHeights) - Math.min(...rowHeights) > 3
        || Math.abs(rows[0].xMin - columns[0].coordinate) > 3
        || Math.abs(rows[0].xMax - columns.at(-1).coordinate) > 3
        || Math.abs(columns[0].yMin - rows[0].coordinate) > 3
        || Math.abs(columns[0].yMax - rows.at(-1).coordinate) > 3
      ) continue
      return {
        xMin: columns[0].coordinate,
        xMax: columns.at(-1).coordinate,
        yMin: rows[0].coordinate,
        yMax: rows.at(-1).coordinate,
      }
    }
  }
  return null
}

function rectangleInsideBox(rectangle, box) {
  return rectangle.xMin >= box.xMin - 0.1
    && rectangle.yMin >= box.yMin - 0.1
    && rectangle.xMax <= box.xMax + 0.1
    && rectangle.yMax <= box.yMax + 0.1
}

function firstPdfWordBox(pdfPath, page, word) {
  const bbox = execFileSync(
    'pdftotext',
    ['-bbox', '-f', String(page), '-l', String(page), pdfPath, '-'],
    { encoding: 'utf8' },
  )
  const words = [...bbox.matchAll(
    /<word xMin="([\d.-]+)" yMin="([\d.-]+)" xMax="([\d.-]+)" yMax="([\d.-]+)">([^<]+)<\/word>/g,
  )]
  const match = words.find((candidate) => candidate[5].includes(word))
  assert.ok(match, `PDF page ${page} contains marker word ${word}`)
  return {
    xMin: Number(match[1]),
    yMin: Number(match[2]),
    xMax: Number(match[3]),
    yMax: Number(match[4]),
  }
}

function normalizedPdfToken(value) {
  return String(value)
    .replace(/&#x([0-9a-f]+);/gi, (_match, codePoint) =>
      String.fromCodePoint(Number.parseInt(codePoint, 16)))
    .replace(/&#([0-9]+);/g, (_match, codePoint) =>
      String.fromCodePoint(Number.parseInt(codePoint, 10)))
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .normalize('NFKC')
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
}

function pdfWordsWithBoxes(pdfPath) {
  const bbox = execFileSync('pdftotext', ['-bbox', pdfPath, '-'], {
    encoding: 'utf8',
  })
  return [...bbox.matchAll(
    /<page width="([\d.-]+)" height="([\d.-]+)">([\s\S]*?)<\/page>/g,
  )].flatMap((pageMatch, pageIndex) =>
    [...pageMatch[3].matchAll(
      /<word xMin="([\d.-]+)" yMin="([\d.-]+)" xMax="([\d.-]+)" yMax="([\d.-]+)">([^<]+)<\/word>/g,
    )].map((wordMatch) => ({
      page: pageIndex + 1,
      pageWidth: Number(pageMatch[1]),
      pageHeight: Number(pageMatch[2]),
      xMin: Number(wordMatch[1]),
      yMin: Number(wordMatch[2]),
      xMax: Number(wordMatch[3]),
      yMax: Number(wordMatch[4]),
      text: normalizedPdfToken(wordMatch[5]),
    }))).map((word, wordIndex) => ({ ...word, wordIndex }))
}

function assertPdfReadingQuestionsNotSplit(pdfPath, consumption, label) {
  const words = pdfWordsWithBoxes(pdfPath)
  const readingSelection = consumption.selections.find(
    (selection) => selection.familyContractId === 'reading',
  )
  for (const groupId of readingSelection.groupIds) {
    const group = projectCanonicalConsumerGroup({
      consumption,
      familyContractId: 'reading',
      groupId,
    })
    for (const question of group.questions) {
      const stemTokens = canonicalInlineText(question.stemContent)
        .split(/\s+/)
        .map(normalizedPdfToken)
        .filter(Boolean)
        .slice(0, 5)
      const stemIndexes = words.flatMap((word, wordIndex) =>
        stemTokens.every(
          (token, tokenIndex) =>
            words[wordIndex + tokenIndex]?.text === token,
        ) ? [wordIndex] : [])
      assert.equal(
        stemIndexes.length,
        1,
        `${label} locates exactly one stem for Question ${question.questionNo}`,
      )
      const [stemIndex] = stemIndexes
      assert.equal(
        words[stemIndex - 1]?.text,
        String(question.questionNo),
        `${label} binds the exact question number to its stem`,
      )
      const finalOption = question.options.at(-1)
      const finalOptionTokens = canonicalInlineText(finalOption.content)
        .split(/\s+/)
        .map(normalizedPdfToken)
        .filter(Boolean)
      const finalOptionIndexes = words.flatMap((word, wordIndex) =>
        wordIndex > stemIndex
        && finalOptionTokens.every(
          (token, tokenIndex) =>
            words[wordIndex + tokenIndex]?.text === token,
        ) ? [wordIndex] : [])
      assert.equal(
        finalOptionIndexes.length,
        1,
        `${label} locates exactly one final option for Question ${question.questionNo}`,
      )
      assert.equal(
        words[stemIndex].page,
        words[finalOptionIndexes[0]].page,
        `${label} does not split Question ${question.questionNo} between its stem and final option`,
      )
    }
  }
}

function assertPdfSevenChoicesGoldenGeometry(
  pdfPath,
  label,
  {
    headingText = null,
    requireWrappedOption = false,
    requireCrossPageBank = false,
    bundleId = null,
    variant = null,
    recordCoverage = null,
  } = {},
) {
  const words = pdfWordsWithBoxes(pdfPath)
  const lines = pdfRoleLines(words)
  const lineByWordIndex = new Map(lines.flatMap((line) =>
    line.wordIndexes.map((wordIndex) => [wordIndex, line])))
  const rows = sevenChoicesSourceOracle.bankOptions.map((option, index) => {
    const optionId =
      sevenChoicesSourceOracle.oracle.publicIdentities
        .sevenChoices.optionIds[index]
    const tokens = exactPdfTokens(option.text)
    const start = uniquePdfSequenceIndex(
      words,
      tokens,
      `${label} ${optionId}`,
    )
    const optionWords = words.slice(start, start + tokens.length)
    const labelWord = words[start - 1]
    assert.equal(
      labelWord?.text,
      option.label,
      `${label} binds ${optionId} to its exact source-PDF label`,
    )
    assert.equal(
      labelWord.page,
      optionWords[0].page,
      `${label} keeps ${optionId} label with its source text`,
    )
    assert.equal(
      lineByWordIndex.get(labelWord.wordIndex)?.lineIndex,
      lineByWordIndex.get(optionWords[0].wordIndex)?.lineIndex,
      `${label} keeps ${optionId} label and first text token atomic on one line`,
    )
    const optionLines = [...new Map(optionWords.map((word) => {
      const line = lineByWordIndex.get(word.wordIndex)
      return [`${line.page}:${line.lineIndex}`, line]
    })).values()].sort((left, right) =>
      left.page - right.page || left.centerY - right.centerY)
    assert.equal(
      new Set(optionWords.map((word) => word.page)).size,
      1,
      `${label} never splits ${option.optionId} across A4 pages`,
    )
    const continuationLefts = optionLines.slice(1)
      .map((line) => line.xMin)
    return {
      optionId,
      start,
      page: optionWords[0].page,
      labelLeft: labelWord.xMin,
      labelRight: labelWord.xMax,
      textLeft: optionWords[0].xMin,
      textRight: Math.max(...optionWords.map((word) => word.xMax)),
      lineCenters: optionLines.map((line) => line.centerY),
      lines: optionLines,
      continuationLefts,
    }
  })
  assert.equal(
    rows.every(
      (row, index) => index === 0 || row.start > rows[index - 1].start,
    ),
    true,
    `${label} preserves A-G row order`,
  )
  const labelLefts = rows.map((row) => row.labelLeft)
  const textLefts = rows.map((row) => row.textLeft)
  const rightBounds = rows.map((row) => row.textRight)
  assert.equal(
    Math.max(...labelLefts) - Math.min(...labelLefts) <= 1.5,
    true,
    `${label} has one PDF option-label x cluster`,
  )
  assert.equal(
    Math.abs(median(labelLefts) - (68.03 + 21)) <= 2,
    true,
    `${label} maps the bank origin to 2em inside the 24mm content edge`,
  )
  assert.equal(
    Math.max(...textLefts) - Math.min(...textLefts) <= 5,
    true,
    `${label} PDF text starts vary only with label glyph width`,
  )
  if (!requireWrappedOption) {
    assert.equal(
      Math.max(...rightBounds) - Math.min(...rightBounds) >= 40,
      true,
      `${label} PDF right bounds remain content-driven`,
    )
  }
  for (const row of rows) {
    assert.equal(
      Math.abs(
        (row.textLeft - row.labelRight) / 10.5
        - sevenChoicesRhythm.horizontalBankGeometry.rendererMapping.printPdf
          .labelTextGapEm,
      ) <= 0.15,
      true,
      `${label} maps the label gap in local PDF em`,
    )
    assert.equal(
      row.continuationLefts.every(
        (left) => Math.abs(left - row.textLeft) <= 1.5,
      ),
      true,
      `${label} hangs wrapped ${row.optionId} lines at text-start x`,
    )
    for (let index = 1; index < row.lineCenters.length; index += 1) {
      assert.equal(
        Math.abs(
          row.lineCenters[index]
          - row.lineCenters[index - 1]
          - sevenChoicesRhythm.targets.printPdf.baselineStepPt,
        ) <= sevenChoicesRhythm.targets.printPdf.oneStepTolerancePt,
        true,
        `${label} keeps wrapped ${row.optionId} lines on one PDF baseline step`,
      )
      recordSevenChoicesEdge(recordCoverage, {
        bundleId,
        variant,
        edgeId: 'bank_option_line_internal',
        fromIdentity: row.optionId,
        toIdentity: row.optionId,
        fromText: sevenChoicesSourceOracle.bankOptions.find(
          (_option, optionIndex) =>
            sevenChoicesSourceOracle.oracle.publicIdentities.sevenChoices
              .optionIds[optionIndex] === row.optionId,
        )?.text,
        toText: sevenChoicesSourceOracle.bankOptions.find(
          (_option, optionIndex) =>
            sevenChoicesSourceOracle.oracle.publicIdentities.sevenChoices
              .optionIds[optionIndex] === row.optionId,
        )?.text,
        actualRatio:
          (row.lineCenters[index] - row.lineCenters[index - 1])
          / sevenChoicesRhythm.targets.printPdf.baselineStepPt,
        atomic: true,
      })
    }
  }
  assert.equal(
    rows.some((row) => row.lineCenters.length > 1),
    requireWrappedOption,
    `${label} executes the declared wrapped-option PDF variant`,
  )
  const bankPages = [...new Set(rows.map((row) => row.page))]
  assert.equal(
    bankPages.length > 1,
    requireCrossPageBank,
    `${label} executes the declared same/cross-page bank variant`,
  )
  for (let index = 1; index < rows.length; index += 1) {
    const prior = rows[index - 1]
    const current = rows[index]
    assert.equal(
      current.page === prior.page || current.page === prior.page + 1,
      true,
      `${label} allows no unexplained page jump between options`,
    )
    if (current.page === prior.page) {
      assert.equal(
        Math.abs(
          current.lineCenters[0]
          - prior.lineCenters.at(-1)
          - sevenChoicesRhythm.targets.printPdf.baselineStepPt,
        ) <= sevenChoicesRhythm.targets.printPdf.oneStepTolerancePt,
        true,
        `${label} keeps same-page option transitions on one baseline step`,
      )
      recordSevenChoicesEdge(recordCoverage, {
        bundleId,
        variant,
        edgeId: 'bank_option_to_next_option',
        fromIdentity: prior.optionId,
        toIdentity: current.optionId,
        fromText: sevenChoicesSourceOracle.bankOptions[index - 1].text,
        toText: sevenChoicesSourceOracle.bankOptions[index].text,
        actualRatio:
          (current.lineCenters[0] - prior.lineCenters.at(-1))
          / sevenChoicesRhythm.targets.printPdf.baselineStepPt,
        atomic: true,
      })
    } else {
      assert.equal(
        current.lines[0].yMax < 130,
        true,
        `${label} starts the same-bank continuation at the next A4 page head`,
      )
      recordSevenChoicesEdge(recordCoverage, {
        bundleId,
        variant,
        edgeId: 'bank_between_options_cross_page',
        fromIdentity: prior.optionId,
        toIdentity: current.optionId,
        fromText: sevenChoicesSourceOracle.bankOptions[index - 1].text,
        toText: sevenChoicesSourceOracle.bankOptions[index].text,
        pageRelation: 'next_page_continuation',
        atomic: true,
      })
    }
  }
  if (headingText) {
    assert.equal(
      countTextOccurrences(pdfText(pdfPath), headingText),
      1,
      `${label} emits the optional bank heading once across pages`,
    )
  }
  return rows
}

function assertPdfSevenChoicesObservedEdge({
  from,
  to,
  edgeId,
  fromIdentity,
  toIdentity,
  fromText,
  toText,
  label,
  bundleId,
  variant,
  recordCoverage,
  atomic = null,
}) {
  assert.ok(
    from && to,
    `${label} ${edgeId} has both public PDF role boxes: ${JSON.stringify({
      fromIdentity,
      toIdentity,
      from,
      to,
    })}`,
  )
  const edge = sevenChoicesCoverageEdge(edgeId)
  if (edge.pageRelation) {
    assert.equal(
      to.page,
      from.page + 1,
      `${label} ${edgeId} continues on the adjacent exact-A4 page`,
    )
    assert.equal(
      to.yMax < 130,
      true,
      `${label} ${edgeId} starts at the next exact-A4 page head`,
    )
    recordSevenChoicesEdge(recordCoverage, {
      bundleId,
      variant,
      edgeId,
      fromIdentity,
      toIdentity,
      fromText,
      toText,
      pageRelation: edge.pageRelation,
      atomic,
    })
    return
  }
  assert.equal(
    to.page,
    from.page,
    `${label} ${edgeId} has an executable same-page PDF-point ratio: ${JSON.stringify({
      fromIdentity,
      toIdentity,
      fromPage: from.page,
      toPage: to.page,
      fromText,
      toText,
    })}`,
  )
  const distancePt = to.centerY - from.centerY
  const targetPt =
    sevenChoicesRhythm.targets.printPdf.baselineStepPt
    * edge.baselineStepRatio
  const tolerancePt = edge.baselineStepRatio === 2
    ? sevenChoicesRhythm.targets.printPdf.twoStepTolerancePt
    : sevenChoicesRhythm.targets.printPdf.oneStepTolerancePt
  assert.equal(
    Math.abs(distancePt - targetPt) <= tolerancePt + 0.01,
    true,
    `${label} ${edgeId} keeps ${edge.baselineStepRatio}x in PDF points: ${JSON.stringify({
      distancePt,
      targetPt,
      from: {
        page: from.page,
        yMin: from.yMin,
        yMax: from.yMax,
        centerY: from.centerY,
        text: from.text,
      },
      to: {
        page: to.page,
        yMin: to.yMin,
        yMax: to.yMax,
        centerY: to.centerY,
        text: to.text,
      },
    })}`,
  )
  recordSevenChoicesEdge(recordCoverage, {
    bundleId,
    variant,
    edgeId,
    fromIdentity,
    toIdentity,
    fromText,
    toText,
    actualRatio:
      distancePt / sevenChoicesRhythm.targets.printPdf.baselineStepPt,
    atomic,
  })
}

function assertPdfSevenChoicesRoleGraph(
  pdfPath,
  label,
  {
    teacher = false,
    headingText = null,
    boundaryRelation = 'same_page',
    passageRelation = 'cross_page',
    passageBankRelation = 'same_page',
    followingRelation = 'same_page',
    bundleId = null,
    variant = null,
    recordCoverage = null,
  } = {},
) {
  const words = pdfWordsWithBoxes(pdfPath)
  const lines = pdfRoleLines(words)
  const lineByWordIndex = new Map(lines.flatMap((line) =>
    line.wordIndexes.map((wordIndex) => [wordIndex, line])))
  const locate = (
    value,
    role,
    { first = false, tokenLimit } = {},
  ) => {
    const indexes = collapsedPdfSequenceIndexes(words, value, tokenLimit)
    assert.equal(
      indexes.length > 0,
      true,
      `${label} locates source-bound ${role}`,
    )
    if (!first) {
      assert.equal(
        indexes.length,
        1,
        `${label} locates exactly one source-bound ${role}`,
      )
    }
    return indexes[0]
  }
  const lineFor = (wordIndex) => lineByWordIndex.get(wordIndex)
  const readingTailIndex = locate(
    sevenChoicesSourceOracle.oracle.sourceExtraction.readingBoundaryEndMarker,
    'Reading-D tail',
  )
  const chrome = sevenChoicesCoverageOracle.oracle.authorityBoundary
    .chromeAnchors.map((anchor) => {
      const wordIndex = locate(anchor.text, anchor.role, { tokenLimit: 5 })
      return {
        ...anchor,
        wordIndex,
        line: lineFor(wordIndex),
      }
    })
  let readingBoundaryLine = lineFor(readingTailIndex)
  let readingBoundaryIdentity =
    sevenChoicesSourceOracle.oracle.publicIdentities.readingBoundary.optionId
  let readingBoundaryText =
    sevenChoicesSourceOracle.oracle.sourceExtraction.readingBoundaryEndMarker
  if (teacher) {
    const teacherBoundary =
      sevenChoicesCoverageOracle.oracle.authorityBoundary
        .teacherReadingBoundary
    const explanationBoundaryIndexes = collapsedPdfSequenceIndexes(
      words,
      teacherBoundary.explanationText,
    ).filter(
      (wordIndex) =>
        wordIndex > readingTailIndex && wordIndex < chrome[0].wordIndex,
    )
    const answerBoundaryIndexes = collapsedPdfSequenceIndexes(
      words,
      teacherBoundary.visibleText,
    ).filter(
      (wordIndex) =>
        wordIndex > readingTailIndex && wordIndex < chrome[0].wordIndex,
    )
    const usesExplanation = explanationBoundaryIndexes.length === 1
    const boundaryIndexes = usesExplanation
      ? explanationBoundaryIndexes
      : answerBoundaryIndexes
    assert.equal(
      boundaryIndexes.length,
      1,
      `${label} locates the official-answer-bound Teacher Reading-D tail`,
    )
    readingBoundaryLine = lineFor(boundaryIndexes[0])
    readingBoundaryIdentity = usesExplanation
      ? teacherBoundary.explanationIdentity
      : teacherBoundary.identity
    readingBoundaryText = usesExplanation
      ? teacherBoundary.explanationText
      : teacherBoundary.visibleText
  }
  const paragraphs = sevenChoicesCoverageOracle.oracle.authorityBoundary
    .passageParagraphAnchors.map((anchor) => {
      const start = locate(
        anchor.start,
        `${anchor.paragraphId} start`,
        { tokenLimit: 5 },
      )
      const endTokens = exactPdfTokens(anchor.end)
      const end = uniquePdfSequenceIndex(
        words,
        endTokens,
        `${label} ${anchor.paragraphId} end`,
      ) + endTokens.length - 1
      assert.equal(
        end >= start,
        true,
        `${label} ${anchor.paragraphId} preserves its source-bound range`,
      )
      return {
        ...anchor,
        start,
        end,
        lines: pdfLinesForWordRange(
          lines,
          lineByWordIndex,
          start,
          end + 1,
        ),
      }
    })
  assert.equal(
    paragraphs.every(
      (paragraph, index) =>
        index === 0 || paragraph.start > paragraphs[index - 1].end,
    ),
    true,
    `${label} preserves exact source-bound paragraph identity/order`,
  )
  const passageStartIndex = paragraphs[0].start
  const passageEndIndex = paragraphs.at(-1).end
  const bankRows = sevenChoicesSourceOracle.bankOptions.map(
    ({ text }, index) => {
      const optionId =
        sevenChoicesSourceOracle.oracle.publicIdentities
          .sevenChoices.optionIds[index]
      const start = uniquePdfSequenceIndex(
        words,
        exactPdfTokens(text),
        `${label} ${optionId} source text`,
      )
      return {
        optionId,
        text,
        start,
        end: start + exactPdfTokens(text).length - 1,
        page: words[start].page,
        lines: pdfLinesForWordRange(
          lines,
          lineByWordIndex,
          start - 1,
          start + exactPdfTokens(text).length,
        ),
      }
    },
  )
  const followingIndex = locate(
    sevenChoicesSourceOracle.oracle.sourceExtraction.followingSectionMarker,
    'following section',
    { tokenLimit: 1 },
  )
  assert.equal(
    readingTailIndex < passageStartIndex
    && passageStartIndex < passageEndIndex
    && passageEndIndex < bankRows[0].start
    && bankRows.at(-1).end < followingIndex,
    true,
    `${label} preserves the source-bound Reading-D → passage → A-G → following-section order`,
  )
  const observe = (edgeId, from, to, identitiesAndText = {}) =>
    assertPdfSevenChoicesObservedEdge({
      from,
      to,
      edgeId,
      label,
      bundleId,
      variant,
      recordCoverage,
      ...identitiesAndText,
    })
  observe(
    boundaryRelation === 'same_page'
      ? 'reading_boundary_to_chrome_same_page'
      : 'reading_boundary_to_chrome_cross_page',
    readingBoundaryLine,
    chrome[0].line,
    {
      fromIdentity: readingBoundaryIdentity,
      toIdentity: chrome[0].identity,
      fromText: readingBoundaryText,
      toText: chrome[0].text,
    },
  )
  for (let index = 1; index < chrome.length; index += 1) {
    observe('chrome_internal', chrome[index - 1].line, chrome[index].line, {
      fromIdentity: chrome[index - 1].identity,
      toIdentity: chrome[index].identity,
      fromText: chrome[index - 1].text,
      toText: chrome[index].text,
    })
  }
  observe('chrome_to_passage', chrome.at(-1).line, paragraphs[0].lines[0], {
    fromIdentity: chrome.at(-1).identity,
    toIdentity: paragraphs[0].paragraphId,
    fromText: chrome.at(-1).text,
    toText: paragraphs[0].start,
  })

  for (const paragraph of paragraphs) {
    assert.equal(
      paragraph.lines.length > 0,
      true,
      `${label} ${paragraph.paragraphId} exposes PDF lines`,
    )
    for (let index = 1; index < paragraph.lines.length; index += 1) {
      const previous = paragraph.lines[index - 1]
      const current = paragraph.lines[index]
      observe(
        current.page === previous.page
          ? 'passage_line_internal'
          : 'same_passage_cross_page',
        previous,
        current,
        {
          fromIdentity: paragraph.paragraphId,
          toIdentity: paragraph.paragraphId,
          fromText: paragraph.start,
          toText: paragraph.end,
        },
      )
    }
  }
  for (let index = 1; index < paragraphs.length; index += 1) {
    observe(
      'paragraph_transition',
      paragraphs[index - 1].lines.at(-1),
      paragraphs[index].lines[0],
      {
        fromIdentity: paragraphs[index - 1].paragraphId,
        toIdentity: paragraphs[index].paragraphId,
        fromText: paragraphs[index - 1].end,
        toText: paragraphs[index].start,
      },
    )
  }
  for (const [index, questionNo] of sevenChoicesSourceOracle.oracle
    .sourceSemantics.blankNumbers.entries()) {
    const matches = words.flatMap((word, wordIndex) => {
      if (!new RegExp(`^${questionNo}(?:\\D|$)`, 'u').test(word.text)) {
        return []
      }
      const blankLine = lineFor(wordIndex)
      const paragraph = paragraphs.find((candidate) =>
        candidate.lines.some((line) =>
          line.page === blankLine?.page
          && Math.abs(line.centerY - blankLine.centerY) <= 2.5))
      return paragraph ? [{ wordIndex, paragraph }] : []
    })
    assert.equal(
      matches.length,
      1,
      `${label} locates source-bound inline Blank ${questionNo} exactly once: ${JSON.stringify(
        words
          .filter((word) => /\d/u.test(word.text))
          .map(({ wordIndex, text, page }) => ({ wordIndex, text, page })),
      )}`,
    )
    const [{ paragraph }] = matches
    assert.ok(paragraph, `${label} binds Blank ${questionNo} to a paragraph`)
    recordSevenChoicesEdge(recordCoverage, {
      bundleId,
      variant,
      edgeId: 'inline_blank_no_phantom_space',
      fromIdentity:
        sevenChoicesSourceOracle.oracle.publicIdentities.sevenChoices
          .questionBlankPairs[index].blankId,
      toIdentity: paragraph.paragraphId,
      fromText: String(questionNo),
      toText: paragraph.start,
      actualRatio: 0,
      atomic: true,
    })
  }
  assert.equal(
    passageRelation === 'cross_page'
      ? words[passageEndIndex].page > words[passageStartIndex].page
      : words[passageEndIndex].page === words[passageStartIndex].page,
    true,
    `${label} executes same-passage ${passageRelation}`,
  )
  if (headingText) {
    const headingIndex = locate(headingText, 'optional bank heading')
    observe(
      'passage_to_bank_heading',
      lineFor(passageEndIndex),
      lineFor(headingIndex),
      {
        fromIdentity: paragraphs.at(-1).paragraphId,
        toIdentity:
          `${sevenChoicesSourceOracle.oracle.publicIdentities.sevenChoices.bankId}:heading`,
        fromText: paragraphs.at(-1).end,
        toText: headingText,
      },
    )
    observe(
      'bank_heading_to_first_option',
      lineFor(headingIndex),
      bankRows[0].lines[0],
      {
        fromIdentity:
          `${sevenChoicesSourceOracle.oracle.publicIdentities.sevenChoices.bankId}:heading`,
        toIdentity: bankRows[0].optionId,
        fromText: headingText,
        toText: bankRows[0].text,
      },
    )
  } else {
    observe(
      passageBankRelation === 'same_page'
        ? 'passage_to_first_option'
        : 'passage_to_bank_cross_page',
      lineFor(passageEndIndex),
      bankRows[0].lines[0],
      {
        fromIdentity: paragraphs.at(-1).paragraphId,
        toIdentity: bankRows[0].optionId,
        fromText: paragraphs.at(-1).end,
        toText: bankRows[0].text,
      },
    )
  }
  for (const row of bankRows) {
    for (let index = 1; index < row.lines.length; index += 1) {
      observe(
        'bank_option_line_internal',
        row.lines[index - 1],
        row.lines[index],
        {
          fromIdentity: row.optionId,
          toIdentity: row.optionId,
          fromText: row.text,
          toText: row.text,
          atomic: true,
        },
      )
    }
  }
  for (let index = 1; index < bankRows.length; index += 1) {
    const previous = bankRows[index - 1]
    const current = bankRows[index]
    observe(
      current.page === previous.page
        ? 'bank_option_to_next_option'
        : 'bank_between_options_cross_page',
      previous.lines.at(-1),
      current.lines[0],
      {
        fromIdentity: previous.optionId,
        toIdentity: current.optionId,
        fromText: previous.text,
        toText: current.text,
        atomic: true,
      },
    )
  }
  const answerIndexes = words.flatMap((word, wordIndex) =>
    wordIndex > bankRows.at(-1).end
    && wordIndex < followingIndex
    && word.text.startsWith('答案')
      ? [wordIndex]
      : [])
  const explanationIndexes = words.flatMap((word, wordIndex) =>
    wordIndex > bankRows.at(-1).end
    && wordIndex < followingIndex
    && word.text.startsWith('解析')
      ? [wordIndex]
      : [])
  if (teacher) {
    assert.equal(
      answerIndexes.length,
      sevenChoicesSourceOracle.answerLabels.length,
      `${label} carries one PDF answer tail per official source answer`,
    )
    assert.equal(
      [0, sevenChoicesSourceOracle.answerLabels.length].includes(
        explanationIndexes.length,
      ),
      true,
      `${label} executes the optional explanation-tail collapse atomically`,
    )
  } else {
    assert.deepEqual(
      { answerCount: answerIndexes.length, explanationCount: explanationIndexes.length },
      { answerCount: 0, explanationCount: 0 },
      `${label} Student PDF has no teacher tail`,
    )
  }
  const teacherTail = []
  if (teacher) {
    for (let index = 0; index < answerIndexes.length; index += 1) {
      const answerIndex = answerIndexes[index]
      const answerLine = lineFor(answerIndex)
      assert.equal(
        answerLine.text.includes(sevenChoicesSourceOracle.answerLabels[index]),
        true,
        `${label} binds answer ${index + 1} to the official-answer source`,
      )
      teacherTail.push({
        wordIndex: answerIndex,
        identity:
          `${sevenChoicesSourceOracle.oracle.publicIdentities.sevenChoices
            .questionBlankPairs[index].questionId}:answer_line`,
        role: 'answer_line',
        text: answerLine.text,
        line: answerLine,
      })
      if (explanationIndexes[index] !== undefined) {
        const explanationLine = lineFor(explanationIndexes[index])
        const fixtureText =
          sevenChoicesCoverageOracle.oracle.authorityBoundary
            .teacherExplanationFixture.textsByQuestionNo[
              String(sevenChoicesSourceOracle.oracle.sourceSemantics
                .answerQuestionNumbers[index])
            ]
        assert.equal(
          normalizedVisibleText(explanationLine.text)
            .replace(/[^\p{L}\p{N}]/gu, '')
            .includes(
              normalizedVisibleText(fixtureText)
                .replace(/[^\p{L}\p{N}]/gu, ''),
          ),
          true,
          `${label} binds explanation ${index + 1} to checked-in observation evidence: ${JSON.stringify({
            observed: explanationLine.text,
            expected: fixtureText,
          })}`,
        )
        teacherTail.push({
          wordIndex: explanationIndexes[index],
          identity:
            `${sevenChoicesSourceOracle.oracle.publicIdentities.sevenChoices
              .questionBlankPairs[index].questionId}:explanation_line`,
          role: 'explanation_line',
          text: explanationLine.text,
          line: explanationLine,
        })
      }
    }
    teacherTail.sort((left, right) => left.wordIndex - right.wordIndex)
    observe(
      'bank_to_answer',
      bankRows.at(-1).lines.at(-1),
      teacherTail[0].line,
      {
        fromIdentity: bankRows.at(-1).optionId,
        toIdentity: teacherTail[0].identity,
        fromText: bankRows.at(-1).text,
        toText: teacherTail[0].text,
      },
    )
    for (let index = 1; index < teacherTail.length; index += 1) {
      const previous = teacherTail[index - 1]
      const current = teacherTail[index]
      observe(
        previous.role === 'answer_line'
        && current.role === 'explanation_line'
          ? 'answer_to_explanation'
          : 'teacher_tail_internal',
        previous.line,
        current.line,
        {
          fromIdentity: previous.identity,
          toIdentity: current.identity,
          fromText: previous.text,
          toText: current.text,
        },
      )
    }
  }
  const tailIndex = teacher
    ? explanationIndexes.at(-1) ?? answerIndexes.at(-1)
    : bankRows.at(-1).end
  const followingEdgeId = teacher
    ? followingRelation === 'same_page'
      ? 'teacher_tail_to_next_section_same_page'
      : 'teacher_tail_to_next_section_cross_page'
    : followingRelation === 'same_page'
      ? 'student_bank_to_next_section_same_page'
      : 'student_bank_to_next_section_cross_page'
  observe(
    followingEdgeId,
    lineFor(tailIndex),
    lineFor(followingIndex),
    {
      fromIdentity: teacher
        ? teacherTail.at(-1).identity
        : bankRows.at(-1).optionId,
      toIdentity: 'source:following-section',
      fromText: teacher
        ? teacherTail.at(-1).text
        : bankRows.at(-1).text,
      toText:
        sevenChoicesSourceOracle.oracle.sourceExtraction
          .followingSectionMarker,
    },
  )
  return {
    readingTailPage: words[readingTailIndex].page,
    passageStartPage: words[passageStartIndex].page,
    passageEndPage: words[passageEndIndex].page,
    bankPages: [...new Set(bankRows.map(({ page }) => page))],
    tailPage: words[tailIndex].page,
    followingPage: words[followingIndex].page,
  }
}

function exactPdfSequenceIndexes(words, tokens, startIndex = 0) {
  return words.flatMap((word, wordIndex) =>
    wordIndex >= startIndex
    && tokens.every(
      (token, tokenIndex) => words[wordIndex + tokenIndex]?.text === token,
    ) ? [wordIndex] : [])
}

function assertPdfSevenChoicesSamePassageContinuation(
  pdfPath,
  label,
  {
    bundleId,
    variant,
    recordCoverage,
  },
) {
  const words = pdfWordsWithBoxes(pdfPath)
  const lines = pdfRoleLines(words)
  const lineByWordIndex = new Map(lines.flatMap((line) =>
    line.wordIndexes.map((wordIndex) => [wordIndex, line])))
  const anchor =
    sevenChoicesCoverageOracle.oracle.authorityBoundary
      .passageParagraphAnchors[1]
  const startIndexes = collapsedPdfSequenceIndexes(words, anchor.start, 5)
  assert.equal(
    startIndexes.length,
    1,
    `${label} locates the exact source-bound continuation paragraph start`,
  )
  const endTokens = exactPdfTokens(anchor.end)
  const endIndex = uniquePdfSequenceIndex(
    words,
    endTokens,
    `${label} continuation paragraph end`,
  ) + endTokens.length - 1
  const paragraphLines = pdfLinesForWordRange(
    lines,
    lineByWordIndex,
    startIndexes[0],
    endIndex + 1,
  )
  const pageBreakIndex = paragraphLines.findIndex(
    (line, index) =>
      index > 0 && line.page === paragraphLines[index - 1].page + 1,
  )
  assert.equal(
    pageBreakIndex > 0,
    true,
    `${label} executes a real adjacent-page continuation inside ${anchor.paragraphId}: ${JSON.stringify({
      start: words[startIndexes[0]],
      end: words[endIndex],
      pages: paragraphLines.map((line) => line.page),
    })}`,
  )
  assertPdfSevenChoicesObservedEdge({
    from: paragraphLines[pageBreakIndex - 1],
    to: paragraphLines[pageBreakIndex],
    edgeId: 'same_passage_cross_page',
    fromIdentity: anchor.paragraphId,
    toIdentity: anchor.paragraphId,
    fromText: anchor.start,
    toText: anchor.end,
    label,
    bundleId,
    variant,
    recordCoverage,
  })
}

function assertPdfSevenChoicesPassageToFirstOption(
  pdfPath,
  label,
  {
    bundleId,
    variant,
    recordCoverage,
  },
) {
  const words = pdfWordsWithBoxes(pdfPath)
  const lines = pdfRoleLines(words)
  const lineByWordIndex = new Map(lines.flatMap((line) =>
    line.wordIndexes.map((wordIndex) => [wordIndex, line])))
  const paragraph =
    sevenChoicesCoverageOracle.oracle.authorityBoundary
      .passageParagraphAnchors.at(-1)
  const paragraphEndTokens = exactPdfTokens(paragraph.end)
  const paragraphEndIndex = uniquePdfSequenceIndex(
    words,
    paragraphEndTokens,
    `${label} final source paragraph`,
  ) + paragraphEndTokens.length - 1
  const firstOption = sevenChoicesSourceOracle.bankOptions[0]
  const firstOptionIndex = uniquePdfSequenceIndex(
    words,
    exactPdfTokens(firstOption.text),
    `${label} source option A`,
  )
  assertPdfSevenChoicesObservedEdge({
    from: lineByWordIndex.get(paragraphEndIndex),
    to: lineByWordIndex.get(firstOptionIndex),
    edgeId: 'passage_to_first_option',
    fromIdentity: paragraph.paragraphId,
    toIdentity:
      sevenChoicesSourceOracle.oracle.publicIdentities
        .sevenChoices.optionIds[0],
    fromText: paragraph.end,
    toText: firstOption.text,
    label,
    bundleId,
    variant,
    recordCoverage,
  })
}

function collapsedPdfSequenceIndexes(words, value, tokenLimit) {
  const target = sourceLexicalTokens(value)
    .slice(0, tokenLimit)
    .join('')
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}]/gu, '')
  assert.equal(target.length > 0, true, 'collapsed PDF target is non-empty')
  const indexes = []
  for (let start = 0; start < words.length; start += 1) {
    let observed = ''
    for (
      let index = start;
      index < words.length
        && words[index].page === words[start].page
        && observed.length <= target.length;
      index += 1
    ) {
      observed += words[index].text
        .normalize('NFKC')
        .replace(/[^\p{L}\p{N}]/gu, '')
      if (observed === target) {
        indexes.push(start)
        break
      }
      if (!target.startsWith(observed)) break
    }
  }
  return indexes
}

function pdfRoleLines(words) {
  const lines = []
  for (const word of words) {
    const centerY = (word.yMin + word.yMax) / 2
    const current = lines.find((line) =>
      line.page === word.page
      && Math.abs(centerY - median(line.wordCenters)) <= 2.5)
    if (!current) {
      lines.push({
        page: word.page,
        words: [word],
        wordCenters: [centerY],
      })
    } else {
      current.words.push(word)
      current.wordCenters.push(centerY)
    }
  }
  const measuredLines = lines.sort((left, right) =>
    left.page - right.page
    || median(left.wordCenters) - median(right.wordCenters)
    || Math.min(...left.words.map((word) => word.xMin))
      - Math.min(...right.words.map((word) => word.xMin)))
    .map((line, lineIndex) => ({
    lineIndex,
    page: line.page,
    pageWidth: line.words[0].pageWidth,
    pageHeight: line.words[0].pageHeight,
    xMin: Math.min(...line.words.map((word) => word.xMin)),
    yMin: Math.min(...line.words.map((word) => word.yMin)),
    xMax: Math.max(...line.words.map((word) => word.xMax)),
    yMax: Math.max(...line.words.map((word) => word.yMax)),
    centerY: median(line.wordCenters),
    wordIndexes: line.words.map((word) => word.wordIndex),
    text: line.words.map((word) => word.text).join(' '),
    }))
  const pageBodySeams = new Map()
  for (const page of [...new Set(measuredLines.map((line) => line.page))]) {
    const pageLines = measuredLines.filter((line) => line.page === page)
    const footerLine = pageLines.at(-1)
    const bodyLines = pageLines.slice(0, -1)
    assert.equal(
      bodyLines.length > 0,
      true,
      `PDF page ${page} exposes body lines above its measured footer`,
    )
    const bodyLineHeights = bodyLines.map((line) => line.yMax - line.yMin)
    const footerSeparation =
      footerLine.centerY - bodyLines.at(-1).centerY
    assert.equal(
      footerSeparation > median(bodyLineHeights) * 2,
      true,
      `PDF page ${page} separates its measured footer from the body`,
    )
    const firstBodyLine = bodyLines[0]
    const lastBodyLine = bodyLines.at(-1)
    pageBodySeams.set(page, {
      page,
      topY:
        firstBodyLine.yMin - median(bodyLineHeights) / 2,
      bottomY:
        (lastBodyLine.yMax + footerLine.yMin) / 2,
      firstBodyCenterY: firstBodyLine.centerY,
      lastBodyCenterY: lastBodyLine.centerY,
      footerCenterY: footerLine.centerY,
      footerText: footerLine.text,
      footerTextDigest: sha256(Buffer.from(footerLine.text, 'utf8')),
    })
  }
  return measuredLines.map((line) => ({
    ...line,
    measuredBodySeam: pageBodySeams.get(line.page),
  }))
}

function exactPdfTokens(value) {
  return normalizedVisibleText(value)
    .split(/\s+/)
    .map(normalizedPdfToken)
    .filter(Boolean)
}

function pdfWordsInGeometricReadingOrder(words) {
  const lines = []
  for (const word of words) {
    const centerY = (word.yMin + word.yMax) / 2
    const line = lines.find((candidate) =>
      candidate.page === word.page
      && Math.abs(centerY - median(candidate.wordCenters)) <= 2.5)
    if (line) {
      line.words.push(word)
      line.wordCenters.push(centerY)
    } else {
      lines.push({
        page: word.page,
        words: [word],
        wordCenters: [centerY],
      })
    }
  }
  return lines.sort((left, right) =>
    left.page - right.page
    || median(left.wordCenters) - median(right.wordCenters)
    || Math.min(...left.words.map((word) => word.xMin))
      - Math.min(...right.words.map((word) => word.xMin)))
    .flatMap((line) =>
      line.words.sort((left, right) => left.xMin - right.xMin))
    .map((word, wordIndex) => ({ ...word, wordIndex }))
}

function assertPdfClozeGeometry(
  pdfPath,
  label,
  {
    teacher = false,
    requirePassageCrossPage = false,
    requireChoiceBlockCrossPage = false,
    requireFollowingCrossPage = false,
    requireWrappedOption = false,
    expectedRows = clozeSourceOracle.questionRows,
    expectedPassageTexts =
      clozeSourceOracle.paperAsset.content.groups[
        clozeSourceOracle.oracle.publicIdentities.cloze.groupId
      ].passage.paragraphs.map((paragraph) => paragraph.text),
  } = {},
) {
  const rowWords = pdfWordsWithBoxes(pdfPath)
  const words = pdfWordsInGeometricReadingOrder(rowWords)
  const lines = pdfRoleLines(rowWords)
  const lineByWordIndex = new Map(
    lines.flatMap((line) =>
      line.wordIndexes.map((wordIndex) => [wordIndex, line])),
  )
  const lineForWord = (word) => {
    if (!word) return undefined
    const centerY = (word.yMin + word.yMax) / 2
    return lines.find(
      (line) =>
        line.page === word.page
        && Math.abs(line.centerY - centerY) <= 2.5,
    )
  }
  const observedEdges = []
  const observe = (edgeId, evidence) => {
    assert.equal(
      observedEdges.some((entry) => entry.edgeId === edgeId),
      false,
      `${label} records ${edgeId} once`,
    )
    observedEdges.push({ edgeId, ...evidence })
  }
  const edgeAuthority = (edgeId) => {
    const edge = clozeRhythm.adjacencyGraph.find(
      (candidate) => candidate.edgeId === edgeId,
    )
    assert.ok(edge, `${label} resolves ${edgeId} authority`)
    return edge
  }
  const assertPdfStep = (edgeId, fromLine, toLine) => {
    const edge = edgeAuthority(edgeId)
    assert.equal(
      fromLine.page,
      toLine.page,
      `${label} ${edgeId} is measured on one local PDF page`,
    )
    const distancePt = toLine.centerY - fromLine.centerY
    const targetPt =
      edge.baselineStepRatio * clozeRhythm.targets.printPdf.baselineStepPt
    const tolerancePt =
      edge.baselineStepRatio === 1
        ? clozeRhythm.targets.printPdf.oneStepTolerancePt
        : edge.baselineStepRatio === 1.5
          ? clozeRhythm.targets.printPdf.threeHalfStepTolerancePt
          : clozeRhythm.targets.printPdf.twoStepTolerancePt
    assert.equal(
      Math.abs(distancePt - targetPt) <= tolerancePt,
      true,
      `${label} ${edgeId} maps its local baseline ratio: ${JSON.stringify({ distancePt, targetPt, fromLine, toLine })}`,
    )
    return distancePt / clozeRhythm.targets.printPdf.baselineStepPt
  }
  const pagesText = execFileSync(
    'pdftotext',
    ['-layout', pdfPath, '-'],
    { encoding: 'utf8' },
  ).split('\f').map(normalizedVisibleText)
  const markerIndex = (marker, markerLabel) => {
    const tokens = exactPdfTokens(marker)
    const indexes = exactPdfSequenceIndexes(words, tokens)
    const firstTokenCandidates = words.flatMap((word, index) =>
      word.text === tokens[0]
        ? [{
            page: word.page,
            nearby: words.slice(index, index + tokens.length + 4)
              .map((candidate) => candidate.text),
          }]
        : [])
    assert.equal(
      indexes.length >= 1,
      true,
      `${label} exposes source-bound ${markerLabel}: ${JSON.stringify({
        expectedTokens: tokens,
        firstTokenCandidates,
      })}`,
    )
    return indexes[0]
  }
  const boundaryIndex = markerIndex(
    clozeSourceOracle.oracle.sourceExtraction.sevenChoicesBoundaryMarker,
    'Seven Choices predecessor',
  )
  const partIndex = markerIndex(
    clozeSourceOracle.oracle.publicVisibleChrome.part,
    'Cloze part chrome',
  )
  const sectionIndex = markerIndex(
    clozeSourceOracle.oracle.publicVisibleChrome.section,
    'Cloze section chrome',
  )
  const instructionIndex = markerIndex(
    clozeSourceOracle.oracle.publicVisibleChrome.instruction,
    'Cloze instruction chrome',
  )
  const passageStartIndex = markerIndex(
    clozeSourceOracle.oracle.sourceExtraction.passageStartMarker,
    'Cloze passage start',
  )
  const passageEndIndex = markerIndex(
    clozeSourceOracle.oracle.sourceExtraction.passageEndMarker,
    'Cloze passage end',
  )
  const followingIndex = markerIndex(
    clozeSourceOracle.oracle.publicVisibleChrome.followingSection,
    'Grammar Fill following section',
  )
  const followingWord = words[followingIndex]
  assert.equal(
    boundaryIndex < partIndex
      && partIndex < sectionIndex
      && sectionIndex < instructionIndex
      && instructionIndex < passageStartIndex
      && passageStartIndex < passageEndIndex
      && passageEndIndex < followingIndex,
    true,
    `${label} preserves the complete source semantic order`,
  )
  const passageStartPage = words[passageStartIndex].page
  const passageEndPage = words[passageEndIndex].page
  const boundaryLine = lineForWord(words[boundaryIndex])
  const partLine = lineForWord(words[partIndex])
  const sectionLine = lineForWord(words[sectionIndex])
  const instructionLine = lineForWord(words[instructionIndex])
  const followingLine = lineForWord(followingWord)
  assert.ok(
    boundaryLine && partLine && sectionLine && instructionLine
      && followingLine,
    `${label} resolves all cross-family/chrome PDF baselines`,
  )
  const visibleBoundaryLine = teacher
    ? lines.filter((line) =>
        line.lineIndex > boundaryLine.lineIndex
        && line.lineIndex < partLine.lineIndex
        && isPdfBodyLine(line)).at(-1)
    : boundaryLine
  assert.ok(
    visibleBoundaryLine,
    `${label} resolves the last visible Seven Choices family line`,
  )
  const visibleBoundaryIdentity = teacher
    ? sevenChoicesSourceOracle.oracle.publicIdentities.sevenChoices
      .questionBlankPairs.at(-1).questionId
    : clozeSourceOracle.oracle.publicIdentities.sevenChoicesBoundary.optionId
  const visibleBoundaryText = teacher
    ? `【答案】${sevenChoicesSourceOracle.answerLabels.at(-1)}`
    : clozeSourceOracle.oracle.sourceExtraction.sevenChoicesBoundaryMarker
  if (visibleBoundaryLine.page === partLine.page) {
    observe('previous_family_to_chrome_same_page', {
      fromIdentity: visibleBoundaryIdentity,
      toIdentity: 'cloze:part_title',
      fromText: visibleBoundaryText,
      toText: clozeSourceOracle.oracle.publicVisibleChrome.part,
      actualRatio: assertPdfStep(
        'previous_family_to_chrome_same_page',
        visibleBoundaryLine,
        partLine,
      ),
    })
  } else {
    assert.equal(partLine.page, visibleBoundaryLine.page + 1)
    assert.equal(partLine.yMax < 130, true)
    observe('previous_family_to_chrome_cross_page', {
      fromIdentity: visibleBoundaryIdentity,
      toIdentity: 'cloze:part_title',
      fromText: visibleBoundaryText,
      toText: clozeSourceOracle.oracle.publicVisibleChrome.part,
      pageRelation: 'next_page_start',
      fromPage: visibleBoundaryLine.page,
      toPage: partLine.page,
    })
  }
  observe('chrome_internal', {
    fromIdentity: ['part_title', 'subsection'],
    toIdentity: ['subsection', 'meta_instruction'],
    actualRatios: [
      assertPdfStep('chrome_internal', partLine, sectionLine),
      assertPdfStep('chrome_internal', sectionLine, instructionLine),
    ],
    texts: [
      clozeSourceOracle.oracle.publicVisibleChrome.part,
      clozeSourceOracle.oracle.publicVisibleChrome.section,
      clozeSourceOracle.oracle.publicVisibleChrome.instruction,
    ],
  })
  const firstChoiceBoundaryIndex = words.findIndex(
    (word, index) =>
      index > passageStartIndex
      && word.text === '41'
      && words[index + 1]?.text === 'A',
  )
  assert.equal(
    firstChoiceBoundaryIndex > passageEndIndex,
    true,
    `${label} resolves the passage-to-choice source boundary`,
  )
  const paragraphAnchors = expectedPassageTexts.map((text, index) => {
    const tokens = exactPdfTokens(text.replace(/__(\d+)__/g, '$1'))
    const startTokens = tokens.slice(0, Math.min(6, tokens.length))
    const endTokens = tokens.slice(-Math.min(6, tokens.length))
    const startCandidates = exactPdfSequenceIndexes(
      words,
      startTokens,
      passageStartIndex,
    ).filter((candidate) => candidate < firstChoiceBoundaryIndex)
    assert.equal(
      startCandidates.length > 0,
      true,
      `${label} paragraph ${index + 1} exposes its immutable source start`,
    )
    const start = startCandidates[0]
    const endCandidates = exactPdfSequenceIndexes(
      words,
      endTokens,
      start,
    ).filter((candidate) => candidate < firstChoiceBoundaryIndex)
    assert.equal(
      endCandidates.length > 0,
      true,
      `${label} paragraph ${index + 1} exposes its immutable source end`,
    )
    return {
      text,
      index,
      start,
      sourceEnd: endCandidates.at(-1) + endTokens.length,
    }
  })
  const paragraphProofs = paragraphAnchors.map((anchor, index) => {
    const { text, start, sourceEnd } = anchor
    const paragraphWords = words.slice(start, sourceEnd)
    const startLine = lineForWord(words[start])
    const sourceEndLine = lineForWord(words[sourceEnd - 1])
    const nextStartLine = index < paragraphAnchors.length - 1
      ? lineForWord(words[paragraphAnchors[index + 1].start])
      : null
    const paragraphLines = lines
      .filter((line) =>
        line.lineIndex >= startLine.lineIndex
        && (
          nextStartLine
            ? line.lineIndex < nextStartLine.lineIndex
            : line.lineIndex <= sourceEndLine.lineIndex
        ))
      .filter(isPdfBodyLine)
      .sort((left, right) =>
        left.page - right.page || left.centerY - right.centerY)
    assert.equal(
      paragraphLines.length > 0,
      true,
      `${label} paragraph ${index + 1} has measured body lines`,
    )
    return {
      paragraphId:
        clozeSourceOracle.oracle.publicIdentities.cloze.paragraphIds[index],
      text,
      start,
      words: paragraphWords,
      lines: paragraphLines,
    }
  })
  observe('chrome_to_passage', {
    fromIdentity: 'meta_instruction',
    toIdentity: paragraphProofs[0].paragraphId,
    fromText: clozeSourceOracle.oracle.publicVisibleChrome.instruction,
    toText: expectedPassageTexts[0],
    actualRatio: assertPdfStep(
      'chrome_to_passage',
      instructionLine,
      paragraphProofs[0].lines[0],
    ),
  })
  const bodyLineLedger = paragraphProofs.flatMap((paragraph) =>
    paragraph.lines.map((line) => ({
      lineId: `${paragraph.paragraphId}:${line.page}:${line.lineIndex}`,
      paragraphId: paragraph.paragraphId,
      sourceTextDigest: digestJson(paragraph.text),
      page: line.page,
      pageRelation: 'body_line',
      wordCount: line.wordIndexes.length,
      wordIndexes: [...line.wordIndexes],
      textDigest: digestJson(line.text),
      coordinates: {
        xMin: line.xMin,
        yMin: line.yMin,
        xMax: line.xMax,
        yMax: line.yMax,
        centerY: line.centerY,
      },
    })))
  assert.equal(
    bodyLineLedger.every((line) =>
      line.wordCount >= 1
      && Object.values(line.coordinates).every(Number.isFinite)),
    true,
    `${label} measures every legitimate body line, including one-word lines`,
  )
  assert.equal(
    new Set(bodyLineLedger.map((line) => line.lineId)).size,
    bodyLineLedger.length,
    `${label} body-line identities are unique`,
  )
  const expectedInternalSteps = paragraphProofs.flatMap((paragraph) =>
    paragraph.lines.slice(1).flatMap((line, index) => {
      const previous = paragraph.lines[index]
      if (line.page !== previous.page) return []
      return [{
        stepId:
          `${paragraph.paragraphId}:${previous.page}:`
          + `${previous.lineIndex}->${line.lineIndex}`,
        paragraphId: paragraph.paragraphId,
        from: previous,
        to: line,
      }]
    }))
  const internalLineSteps = expectedInternalSteps.map((step) => ({
    stepId: step.stepId,
    paragraphId: step.paragraphId,
    sourceTextDigest: digestJson(
      paragraphProofs.find(
        (paragraph) => paragraph.paragraphId === step.paragraphId,
      ).text,
    ),
    pageRelation: 'same_page',
    from: {
      page: step.from.page,
      lineIndex: step.from.lineIndex,
      textDigest: digestJson(step.from.text),
      coordinates: {
        xMin: step.from.xMin,
        yMin: step.from.yMin,
        xMax: step.from.xMax,
        yMax: step.from.yMax,
        centerY: step.from.centerY,
      },
    },
    to: {
      page: step.to.page,
      lineIndex: step.to.lineIndex,
      textDigest: digestJson(step.to.text),
      coordinates: {
        xMin: step.to.xMin,
        yMin: step.to.yMin,
        xMax: step.to.xMax,
        yMax: step.to.yMax,
        centerY: step.to.centerY,
      },
    },
    actualRatio: assertPdfStep(
      'passage_line_internal',
      step.from,
      step.to,
    ),
  }))
  assert.equal(
    internalLineSteps.length > 0,
    true,
    `${label} measures every same-page internal passage line edge`,
  )
  assert.equal(
    new Set(internalLineSteps.map((step) => step.stepId)).size,
    expectedInternalSteps.length,
    `${label} records every internal step exactly once`,
  )
  assert.deepEqual(
    internalLineSteps.map((step) => step.stepId).sort(),
    expectedInternalSteps.map((step) => step.stepId).sort(),
    `${label} has no missing, duplicate, or unmeasured internal step`,
  )
  observe('passage_line_internal', {
    fromIdentity: paragraphProofs.map((paragraph) => paragraph.paragraphId),
    toIdentity: paragraphProofs.map((paragraph) => paragraph.paragraphId),
    bodyLines: bodyLineLedger,
    internalSteps: internalLineSteps,
    actualRatios: internalLineSteps.map((step) => step.actualRatio),
  })
  const paragraphTransitionRatios = paragraphProofs.slice(1).flatMap(
    (paragraph, index) => {
      const previous = paragraphProofs[index].lines.at(-1)
      const next = paragraph.lines[0]
      if (next.page !== previous.page) return []
      return [assertPdfStep('paragraph_transition', previous, next)]
    },
  )
  if (paragraphTransitionRatios.length > 0) {
    observe('paragraph_transition', {
      fromIdentity: paragraphProofs.slice(0, -1)
        .map((paragraph) => paragraph.paragraphId),
      toIdentity: paragraphProofs.slice(1)
        .map((paragraph) => paragraph.paragraphId),
      actualRatios: paragraphTransitionRatios,
    })
  }
  const blankProofs =
    clozeSourceOracle.oracle.publicIdentities.cloze.questionIds.map(
      (questionId, index) => {
        const number = String(41 + index)
        const candidates = words.slice(passageStartIndex, passageEndIndex + 1)
          .filter((word) => word.text === number)
        assert.equal(
          candidates.length,
          1,
          `${label} passage exposes one inline Blank ${number}`,
        )
        const word = candidates[0]
        const line = lineForWord(word)
        assert.ok(line)
        const verticalOffsetPt = Math.abs(
          (word.yMin + word.yMax) / 2 - line.centerY,
        )
        assert.equal(
          verticalOffsetPt
            <= clozeRhythm.targets.printPdf.oneStepTolerancePt,
          true,
          `${label} inline Blank ${number} adds no phantom baseline step`,
        )
        return {
          questionId,
          blankId:
            clozeSourceOracle.oracle.publicIdentities.cloze.blankIds[index],
          number,
          page: word.page,
          lineIndex: line.lineIndex,
          glyphWidthPt: word.xMax - word.xMin,
          fontProxyPt: word.yMax - word.yMin,
          extraBaselineStepRatio:
            verticalOffsetPt
            / clozeRhythm.targets.printPdf.baselineStepPt,
        }
      },
    )
  observe('inline_blank_no_phantom_space', {
    fromIdentity: paragraphProofs.map((paragraph) => paragraph.paragraphId),
    toIdentity: blankProofs.map((blank) => blank.blankId),
    extraBaselineStepRatios: blankProofs.map(
      (blank) => blank.extraBaselineStepRatio,
    ),
    blankGlyphMetrics: blankProofs,
  })
  observe('inline_blank_atomicity', {
    fromIdentity: blankProofs.map((blank) => blank.blankId),
    pageRelation: 'same_line_unsplittable',
    lineIdentities: blankProofs.map(
      (blank) => `${blank.page}:${blank.lineIndex}`,
    ),
  })
  observe('inline_blank_punctuation_outside', {
    fromIdentity: blankProofs.map((blank) => blank.blankId),
    toIdentity: paragraphProofs.map((paragraph) => paragraph.paragraphId),
    pageRelation: 'punctuation_sibling',
    blankTokens: blankProofs.map((blank) => blank.number),
  })
  const passageContinuation = paragraphProofs.flatMap((paragraph) =>
    paragraph.lines.slice(1).flatMap((line, index) =>
      line.page === paragraph.lines[index].page + 1
        ? [{ from: paragraph.lines[index], to: line }]
        : [])).at(0)
  if (requirePassageCrossPage) {
    assert.ok(
      passageContinuation,
      `${label} executes a same-passage cross-page continuation`,
    )
  }
  if (passageContinuation) {
    observe('same_passage_cross_page', {
      fromIdentity: paragraphProofs.find((paragraph) =>
        paragraph.lines.includes(passageContinuation.from))?.paragraphId,
      toIdentity: paragraphProofs.find((paragraph) =>
        paragraph.lines.includes(passageContinuation.to))?.paragraphId,
      pageRelation: 'next_page_continuation',
      fromPage: passageContinuation.from.page,
      toPage: passageContinuation.to.page,
    })
  }
  const rowAnchors = expectedRows.map((sourceRow) => {
    const firstOptionToken = exactPdfTokens(
      sourceRow.options[0].text,
    )[0]
    const questionIndexes = rowWords.flatMap((word, wordIndex) =>
      word.text === String(sourceRow.questionNo)
      && word.xMin >= 65
      && word.xMin <= 85
      && rowWords[wordIndex + 1]?.text === 'A'
      && rowWords[wordIndex + 1].page === word.page
      && rowWords[wordIndex + 1].xMin > word.xMin
      && Math.abs(
        (rowWords[wordIndex + 1].yMin + rowWords[wordIndex + 1].yMax)
          / 2
        - (word.yMin + word.yMax) / 2,
      ) <= 1
      && rowWords[wordIndex + 2]?.text
      && (
        firstOptionToken.startsWith(rowWords[wordIndex + 2].text)
        || rowWords[wordIndex + 2]?.text?.startsWith(firstOptionToken)
      )
        ? [wordIndex]
        : [])
    assert.equal(
      questionIndexes.length,
      1,
      `${label} exposes one fixed-left row label ${sourceRow.questionNo}`,
    )
    const questionIndex = questionIndexes[0]
    const questionWord = rowWords[questionIndex]
    return {
      sourceRow,
      questionIndex,
      questionWord,
      page: questionWord.page,
      y: (questionWord.yMin + questionWord.yMax) / 2,
      firstTextX: rowWords[questionIndex + 2].xMin,
    }
  })
  const collapsedWordText = (value) =>
    value.normalize('NFKC').replace(/[^\p{L}\p{N}]/gu, '')
  const rowProofs = rowAnchors.map((anchor, rowIndex) => {
    const {
      sourceRow,
      questionIndex,
      questionWord,
      page,
      y,
      firstTextX,
    } = anchor
    const nextAnchor = rowAnchors[rowIndex + 1]
    const teacherAnswerWord = teacher
      ? rowWords.find((word, wordIndex) =>
          wordIndex > questionIndex
          && word.text === normalizedPdfToken(
            `【答案】${sourceRow.answer}`,
          ))
      : null
    const optionEndY =
      teacherAnswerWord?.page === page
        ? (teacherAnswerWord.yMin + teacherAnswerWord.yMax) / 2 - 1
        : nextAnchor?.page === page
          ? nextAnchor.y - 1
          : followingWord.page === page
            ? (followingWord.yMin + followingWord.yMax) / 2 - 1
            : 790
    const options = sourceRow.options.map((option, track) => {
      const expectedX = firstTextX + 104 * track
      const nextTrackBoundary =
        track < 3 ? firstTextX + 104 * (track + 1) - 16 : 550
      const wordsInTrack = rowWords
        .filter((word) => {
          const centerY = (word.yMin + word.yMax) / 2
          return word.page === page
            && centerY >= y - 1
            && centerY < optionEndY
            && word.xMin >= expectedX - 1.5
            && word.xMin < nextTrackBoundary
        })
        .sort((left, right) =>
          (left.yMin + left.yMax) / 2
            - (right.yMin + right.yMax) / 2
          || left.xMin - right.xMin)
      const observedText = wordsInTrack
        .map((word) => collapsedWordText(word.text))
        .join('')
      const expectedText = collapsedWordText(option.text)
      assert.equal(
        observedText,
        expectedText,
        `${label} row ${sourceRow.questionNo} exposes ${option.label} source text`,
      )
      const labelWords = rowWords.filter((word) => {
        const centerY = (word.yMin + word.yMax) / 2
        return word.page === page
          && Math.abs(centerY - y) <= 1
          && word.text === option.label
          && word.xMin >= expectedX - 20
          && word.xMin < expectedX - 1
      })
      assert.equal(
        labelWords.length,
        1,
        `${label} row ${sourceRow.questionNo} exposes one ${option.label} label at its fixed track`,
      )
      return {
        ...option,
        word: wordsInTrack[0],
        words: wordsInTrack,
        labelWord: labelWords[0],
      }
    })
    assert.equal(
      new Set(options.map((option) => option.word.page)).size,
      1,
      `${label} keeps row ${sourceRow.questionNo} unsplit on one page`,
    )
    const relativeXs = options.map(
      (option) => option.word.xMin - options[0].word.xMin,
    )
    assert.equal(
      relativeXs.every(
        (x, track) => Math.abs(x - 104 * track) <= 2.5,
      ),
      true,
      `${label} row ${sourceRow.questionNo} retains fixed 104pt option text-start pitch`,
    )
    const yCenters = options.map(
      (option) => (option.word.yMin + option.word.yMax) / 2,
    )
    const labelCenters = options.map(
      (option) =>
        (option.labelWord.yMin + option.labelWord.yMax) / 2,
    )
    assert.equal(
      labelCenters.every(
        (labelY) => Math.abs(labelY - labelCenters[0]) <= 1,
      ),
      true,
      `${label} row ${sourceRow.questionNo} keeps A-D labels on one baseline`,
    )
    if (!requireWrappedOption) {
      assert.equal(
        yCenters.every((y) => Math.abs(y - yCenters[0]) <= 1),
        true,
        `${label} row ${sourceRow.questionNo} retains one-line A-D baseline`,
      )
    }
    assert.equal(
      options[0].word.xMin - questionWord.xMin > 20,
      true,
      `${label} row ${sourceRow.questionNo} retains its question-to-A anchor`,
    )
    return {
      questionId: sourceRow.questionId,
      questionNo: sourceRow.questionNo,
      answer: sourceRow.answer,
      questionIndex,
      page,
      y,
      tailY: Math.max(
        ...options.flatMap((option) =>
          option.words.map((word) => (word.yMin + word.yMax) / 2)),
      ),
      xStarts: options.map((option) => option.word.xMin),
      options,
    }
  })
  const followingRawIndex = rowWords.findIndex((word) =>
    word.page === followingWord.page
    && word.text === followingWord.text
    && Math.abs(word.xMin - followingWord.xMin) <= 0.1
    && Math.abs(word.yMin - followingWord.yMin) <= 0.1)
  assert.equal(
    followingRawIndex >= 0,
    true,
    `${label} resolves the following section in the PDF content stream`,
  )
  const teacherTails = teacher
    ? rowProofs.map((row, index) => {
        const nextBoundaryIndex =
          rowProofs[index + 1]?.questionIndex ?? followingRawIndex
        const answerIndexes = rowWords.flatMap((word, wordIndex) =>
          wordIndex > row.questionIndex
          && wordIndex < nextBoundaryIndex
          && word.text === normalizedPdfToken(`【答案】${row.answer}`)
            ? [wordIndex]
            : [])
        const explanationIndexes = rowWords.flatMap((word, wordIndex) =>
          wordIndex > row.questionIndex
          && wordIndex < nextBoundaryIndex
          && word.text.startsWith('解析')
            ? [wordIndex]
            : [])
        assert.equal(
          answerIndexes.length,
          1,
          `${label} binds row ${row.questionNo} to its official Teacher answer`,
        )
        assert.equal(
          explanationIndexes.length,
          1,
          `${label} binds row ${row.questionNo} to one reviewed Teacher explanation`,
        )
        const answerWord = rowWords[answerIndexes[0]]
        const explanationWord = rowWords[explanationIndexes[0]]
        const answerLine = lineForWord(answerWord)
        assert.ok(
          answerLine,
          `${label} resolves row ${row.questionNo} Teacher answer line`,
        )
        assert.equal(
          collapsedWordText(answerLine.text),
          collapsedWordText(`【答案】${expectedRows[index].answer}`),
          `${label} row ${row.questionNo} exposes the exact official-answer bytes`,
        )
        const nextRow = rowProofs[index + 1]
        const explanationRegionWords = rowWords
          .filter((word) =>
            word.page === explanationWord.page
            && word.yMin >= explanationWord.yMin - 1
            && word.yMax < (
              nextRow?.page === explanationWord.page
                ? nextRow.y - 1
                : followingLine.page === explanationWord.page
                  ? followingLine.yMin - 1
                : 790
            ))
        const explanationRegionLines = []
        for (const word of explanationRegionWords) {
          const centerY = (word.yMin + word.yMax) / 2
          const line = explanationRegionLines.find(
            (candidate) => Math.abs(candidate.centerY - centerY) <= 2.5,
          )
          if (line) {
            line.words.push(word)
            line.centerY = median(line.words.map(
              (candidate) => (candidate.yMin + candidate.yMax) / 2,
            ))
          } else {
            explanationRegionLines.push({
              centerY,
              words: [word],
            })
          }
        }
        explanationRegionLines.sort(
          (left, right) => left.centerY - right.centerY,
        )
        const orderedExplanationWords = explanationRegionLines.flatMap(
          (line) => line.words.sort(
            (left, right) => left.xMin - right.xMin,
          ),
        )
        const observedExplanationText = orderedExplanationWords
          .map((word) => word.text)
          .join('')
        assert.equal(
          collapsedWordText(observedExplanationText),
          collapsedWordText(`【解析】${expectedRows[index].explanation}`),
          `${label} row ${row.questionNo} exposes the exact digest-bound reviewed explanation`,
        )
        assert.equal(
          answerWord.page === row.page
          && explanationWord.page === row.page,
          true,
          `${label} keeps row ${row.questionNo} with its answer/explanation supplement`,
        )
        const answerY = (answerWord.yMin + answerWord.yMax) / 2
        const explanationY =
          (explanationWord.yMin + explanationWord.yMax) / 2
        assert.equal(
          Math.abs(
            answerY - row.tailY
            - clozeRhythm.targets.printPdf.baselineStepPt,
          ) <= clozeRhythm.targets.printPdf.oneStepTolerancePt,
          true,
          `${label} keeps row ${row.questionNo} to answer at one local baseline step`,
        )
        assert.equal(
          Math.abs(
            explanationY - answerY
            - clozeRhythm.targets.printPdf.baselineStepPt,
          ) <= clozeRhythm.targets.printPdf.oneStepTolerancePt,
          true,
          `${label} keeps answer to explanation at one local baseline step`,
        )
        const tailWord = orderedExplanationWords.at(-1)
        assert.ok(
          tailWord,
          `${label} resolves row ${row.questionNo} reviewed explanation tail`,
        )
        return {
          page: tailWord.page,
          y: (tailWord.yMin + tailWord.yMax) / 2,
          answerY,
          explanationY,
        }
      })
    : []
  const rowPages = new Set(rowProofs.map((row) => row.page))
  const choiceTransitionIndex = rowProofs.findIndex(
    (row, index) =>
      index > 0 && row.page === rowProofs[index - 1].page + 1,
  )
  if (requireChoiceBlockCrossPage) {
    assert.equal(
      choiceTransitionIndex > 0,
      true,
      `${label} executes row-block pagination without splitting a row`,
    )
  }
  if (choiceTransitionIndex > 0) {
    observe('choice_block_cross_page', {
      fromIdentity: rowProofs[choiceTransitionIndex - 1].questionId,
      toIdentity: rowProofs[choiceTransitionIndex].questionId,
      pageRelation: 'next_page_continuation',
      fromPage: rowProofs[choiceTransitionIndex - 1].page,
      toPage: rowProofs[choiceTransitionIndex].page,
    })
  }
  for (let index = 1; index < rowProofs.length; index += 1) {
    const previous = rowProofs[index - 1]
    const current = rowProofs[index]
    assert.equal(
      current.page === previous.page
      || current.page === previous.page + 1,
      true,
      `${label} keeps rows ${previous.questionNo}-${current.questionNo} contiguous`,
    )
    if (current.page === previous.page && !teacher) {
      assert.equal(
        Math.abs(
          current.y - previous.tailY
          - clozeRhythm.targets.printPdf.baselineStepPt,
        ) <= clozeRhythm.targets.printPdf.oneStepTolerancePt,
        true,
        `${label} keeps row rhythm at one local baseline step`,
      )
    }
    if (current.page === previous.page && teacher) {
      const previousTail = teacherTails[index - 1]
      assert.equal(
        previousTail.page,
        current.page,
        `${label} keeps the prior reviewed explanation tail with the next row`,
      )
      assert.equal(
        Math.abs(
          current.y - previousTail.y
          - clozeRhythm.targets.printPdf.baselineStepPt,
        ) <= clozeRhythm.targets.printPdf.oneStepTolerancePt,
        true,
        `${label} keeps Teacher tail to next row at one local baseline step`,
      )
    }
  }
  const wrappedOptionWords = rowProofs[12].options[3].words
  const wrappedOptionLines = []
  for (const word of wrappedOptionWords) {
      const centerY = (word.yMin + word.yMax) / 2
      const line = wrappedOptionLines.find(
        (candidate) => Math.abs(candidate.centerY - centerY) <= 2.5,
      )
      if (line) {
        line.words.push(word)
        line.centerY = median(line.words.map(
          (candidate) => (candidate.yMin + candidate.yMax) / 2,
        ))
      } else {
        wrappedOptionLines.push({ centerY, words: [word] })
      }
  }
  const continuationXs = wrappedOptionLines
    .sort((left, right) => left.centerY - right.centerY)
    .map((line) => Math.min(...line.words.map((word) => word.xMin)))
  if (requireWrappedOption) {
    assert.equal(
      continuationXs.length > 1,
      true,
      `${label} executes a wrapped option with hanging text continuation`,
    )
    assert.equal(
      Math.max(...continuationXs) - Math.min(...continuationXs) <= 1.5,
      true,
      `${label} wrapped continuation stays anchored inside its fixed track`,
    )
  }
  if (continuationXs.length > 1) {
    observe('wrapped_option_continuation', {
      fromIdentity: `${rowProofs[12].questionId}:D`,
      toIdentity: `${rowProofs[12].questionId}:D`,
      horizontalRelation: 'hanging_indent',
      continuationXs,
    })
  }
  const passageTailLine = paragraphProofs.at(-1).lines.at(-1)
  const firstRowLine = lineForWord(
    rowWords[rowProofs[0].questionIndex],
  )
  if (passageTailLine.page === firstRowLine.page) {
    observe('passage_tail_to_first_choice_row', {
      fromIdentity: paragraphProofs.at(-1).paragraphId,
      toIdentity: rowProofs[0].questionId,
      fromText: expectedPassageTexts.at(-1),
      toText: String(rowProofs[0].questionNo),
      actualRatio: assertPdfStep(
        'passage_tail_to_first_choice_row',
        passageTailLine,
        firstRowLine,
      ),
      pageRelation: 'same_page',
    })
  } else {
    assert.equal(firstRowLine.page, passageTailLine.page + 1)
    assert.equal(firstRowLine.yMax < 130, true)
    observe('passage_tail_to_first_choice_row', {
      fromIdentity: paragraphProofs.at(-1).paragraphId,
      toIdentity: rowProofs[0].questionId,
      fromText: expectedPassageTexts.at(-1),
      toText: String(rowProofs[0].questionNo),
      pageRelation: 'next_page_start',
      fromPage: passageTailLine.page,
      toPage: firstRowLine.page,
    })
  }
  observe('choice_row_question_to_first_track', {
    fromIdentity: rowProofs.map((row) => row.questionId),
    toIdentity: rowProofs.map((row) => `${row.questionId}:A`),
    horizontalRelation: 'fixed_question_to_A_anchor',
    actualOffsetsPt: rowProofs.map(
      (row) => row.options[0].labelWord.xMin
        - rowWords[row.questionIndex].xMin,
    ),
  })
  observe('choice_label_to_text', {
    fromIdentity: rowProofs.flatMap((row) =>
      row.options.map((option) => `${row.questionId}:${option.label}`)),
    toIdentity: rowProofs.flatMap((row) =>
      row.options.map((option) => `${row.questionId}:${option.label}:text`)),
    horizontalRelation: 'fixed_em_gap',
    actualGapEm: rowProofs.flatMap((row) =>
      row.options.map((option) =>
        (option.word.xMin - option.labelWord.xMax) / 10.5)),
  })
  observe('choice_tracks_internal', {
    fromIdentity: rowProofs[0].options.map((option) => option.label),
    toIdentity: rowProofs[0].options.map((option) => option.label),
    horizontalRelation: 'four_fixed_equal_origin_pitch_tracks',
    relativeOriginsPt: rowProofs[0].xStarts.map(
      (x) => x - rowProofs[0].xStarts[0],
    ),
  })
  const samePageRowRatios = rowProofs.slice(1).flatMap((row, index) => {
    const previousTail = teacher
      ? teacherTails[index]
      : {
          page: rowProofs[index].page,
          y: rowProofs[index].tailY,
        }
    return row.page === previousTail.page
      ? [(row.y - previousTail.y)
        / clozeRhythm.targets.printPdf.baselineStepPt]
      : []
  })
  assert.equal(
    samePageRowRatios.length > 0,
    true,
    `${label} measures real same-page row rhythm`,
  )
  assert.equal(
    samePageRowRatios.every(
      (ratio) =>
        Math.abs(ratio - 1)
          <= clozeRhythm.targets.printPdf.oneStepTolerancePt
            / clozeRhythm.targets.printPdf.baselineStepPt,
    ),
    true,
    `${label} keeps every measured row rhythm at one local baseline step`,
  )
  const oneLineBaselineDeltasPt = rowProofs.flatMap((row) =>
    row.options.map((option) =>
      Math.abs(
        (
          option.word.yMin + option.word.yMax
          - option.labelWord.yMin - option.labelWord.yMax
        ) / 2,
      )),
  )
  assert.equal(
    oneLineBaselineDeltasPt.every((delta) => delta <= 1),
    true,
    `${label} keeps every A-D label and option text on one row baseline`,
  )
  observe('choice_row_baseline', {
    fromIdentity: rowProofs.slice(0, -1).map((row) => row.questionId),
    toIdentity: rowProofs.slice(1).map((row) => row.questionId),
    actualRatios: samePageRowRatios,
    oneLineBaselineDeltasPt,
  })
  observe('choice_label_text_atomicity', {
    fromIdentity: rowProofs.map((row) => row.questionId),
    pageRelation: 'same_atomic_option',
    labelTextBaselineDeltasPt: rowProofs.flatMap((row) =>
      row.options.map((option) =>
        (
          (option.word.yMin + option.word.yMax)
          - (option.labelWord.yMin + option.labelWord.yMax)
        ) / 2)),
  })
  observe('choice_row_unsplittable', {
    fromIdentity: rowProofs.map((row) => row.questionId),
    pageRelation: 'same_page_unit',
    pages: rowProofs.map((row) => row.page),
  })
  if (teacher) {
    observe('choice_row_to_answer', {
      fromIdentity: rowProofs.map((row) => row.questionId),
      toIdentity: rowProofs.map((row) => row.questionId),
      actualRatios: rowProofs.map(
        (row, index) =>
          (teacherTails[index].answerY - row.tailY)
          / clozeRhythm.targets.printPdf.baselineStepPt,
      ),
    })
    observe('answer_to_explanation', {
      fromIdentity: rowProofs.map((row) => row.questionId),
      toIdentity: rowProofs.map((row) => row.questionId),
      actualRatios: teacherTails.map(
        (tail) =>
          (tail.explanationY - tail.answerY)
          / clozeRhythm.targets.printPdf.baselineStepPt,
      ),
    })
    observe('teacher_tail_to_next_row', {
      fromIdentity: rowProofs.slice(0, -1).map((row) => row.questionId),
      toIdentity: rowProofs.slice(1).map((row) => row.questionId),
      actualRatios: rowProofs.slice(1).flatMap((row, index) =>
        row.page === teacherTails[index].page
          ? [(row.y - teacherTails[index].y)
            / clozeRhythm.targets.printPdf.baselineStepPt]
          : []),
    })
  }
  const lastRowPage = rowProofs.at(-1).page
  const followingPage = words[followingIndex].page
  if (requireFollowingCrossPage) {
    assert.equal(
      followingPage,
      lastRowPage + 1,
      `${label} starts Grammar Fill on the immediately following page`,
    )
  } else {
    assert.equal(
      followingPage === lastRowPage || followingPage === lastRowPage + 1,
      true,
      `${label} keeps the Cloze-to-Grammar transition contiguous`,
    )
  }
  const finalTail = teacher
    ? teacherTails.at(-1)
    : {
        page: rowProofs.at(-1).page,
        y: rowProofs.at(-1).tailY,
      }
  const followingEdgeId = teacher
    ? followingPage === finalTail.page
      ? 'teacher_tail_to_next_section_same_page'
      : 'teacher_tail_to_next_section_cross_page'
    : followingPage === finalTail.page
      ? 'student_tail_to_next_section_same_page'
      : 'student_tail_to_next_section_cross_page'
  if (followingPage === finalTail.page) {
    observe(followingEdgeId, {
      fromIdentity: rowProofs.at(-1).questionId,
      toIdentity:
        clozeSourceOracle.oracle.publicIdentities.followingSection.groupId,
      actualRatio: assertPdfStep(
        followingEdgeId,
        { page: finalTail.page, centerY: finalTail.y },
        followingLine,
      ),
      pageRelation: 'same_page',
    })
  } else {
    assert.equal(followingPage, finalTail.page + 1)
    assert.equal(followingLine.yMax < 130, true)
    observe(followingEdgeId, {
      fromIdentity: rowProofs.at(-1).questionId,
      toIdentity:
        clozeSourceOracle.oracle.publicIdentities.followingSection.groupId,
      pageRelation: 'next_page_start',
      fromPage: finalTail.page,
      toPage: followingPage,
    })
  }
  const pdfTextValue = pagesText.join('\n')
  if (teacher) {
    assert.equal(
      teacherTails.length,
      15,
      `${label} includes all 15 source-bound Cloze answer/explanation supplements`,
    )
  } else {
    assert.equal(
      (pdfTextValue.match(/【答案】/g) || []).length,
      0,
      `${label} hides all Teacher answers`,
    )
    assert.equal(
      (pdfTextValue.match(/【解析】/g) || []).length,
      0,
      `${label} hides all Teacher explanations`,
    )
  }
  return {
    boundaryPage: words[boundaryIndex].page,
    chromePages: [
      words[partIndex].page,
      words[sectionIndex].page,
      words[instructionIndex].page,
    ],
    passageStartPage,
    passageEndPage:
      paragraphProofs.at(-1)?.lines.at(-1)?.page ?? passageEndPage,
    rowPages: [...rowPages],
    followingPage,
    observedEdges,
  }
}

function uniquePdfSequenceIndex(
  words,
  tokens,
  label,
  startIndex = 0,
  endIndex = words.length,
) {
  const indexes = exactPdfSequenceIndexes(words, tokens, startIndex)
    .filter((wordIndex) => wordIndex + tokens.length <= endIndex)
  assert.equal(
    indexes.length,
    1,
    `${label} resolves to one exact PDF token sequence`,
  )
  return indexes[0]
}

function isPdfBodyLine(line) {
  assert.equal(
    Number.isFinite(line.measuredBodySeam?.topY)
      && Number.isFinite(line.measuredBodySeam?.bottomY)
      && line.measuredBodySeam.topY < line.measuredBodySeam.bottomY,
    true,
    'PDF line carries its artifact-measured page/body seam',
  )
  return (
    line.centerY >= line.measuredBodySeam.topY
    && line.centerY <= line.measuredBodySeam.bottomY
  )
}

function pdfLinesForWordRange(
  lines,
  _wordIndexToLineIndex,
  startWordIndex,
  endWordIndex,
) {
  if (startWordIndex >= endWordIndex) return []
  return lines.filter((line) =>
    line.wordIndexes.some((wordIndex) =>
      wordIndex >= startWordIndex && wordIndex < endWordIndex))
    .filter(isPdfBodyLine)
}

function grammarFillPdfRulingMeasurements(pdfPath, pages) {
  const scratchDir = mkdtempSync(path.join(
    tmpdir(),
    'eqb-grammar-fill-rulings-',
  ))
  const rulings = []
  try {
    for (const page of [...new Set(pages)]) {
      const svgPath = path.join(scratchDir, `page-${page}.svg`)
      execFileSync('pdftocairo', [
        '-f',
        String(page),
        '-l',
        String(page),
        '-svg',
        pdfPath,
        svgPath,
      ])
      const svg = readFileSync(svgPath, 'utf8')
      const rectanglePattern =
        /M ([\d.]+) ([\d.]+) L ([\d.]+) \2 L \3 ([\d.]+) L \1 \4 Z/gu
      for (const match of svg.matchAll(rectanglePattern)) {
        const xMin = Number(match[1])
        const yMin = Number(match[2])
        const xMax = Number(match[3])
        const yMax = Number(match[4])
        const widthPt = xMax - xMin
        const heightPt = yMax - yMin
        if (
          widthPt >= 32
          && widthPt <= 38
          && heightPt >= 0.4
          && heightPt <= 1.2
        ) {
          rulings.push({
            page,
            xMin,
            xMax,
            yMin,
            yMax,
            widthPt,
          })
        }
      }
    }
  } finally {
    rmSync(scratchDir, { recursive: true, force: true })
  }
  return rulings
}

function assertGrammarFillPdfArtifact(
  pdfPath,
  label,
  {
    teacher = false,
    requireLineEndBlank = false,
    previousRelation = 'same_page',
    passageRelation = 'same_page',
    followingRelation = 'same_page',
    expectedPassageTexts =
      grammarFillSourceOracle.paperAsset.content.groups[
        grammarFillSourceOracle.oracle.publicIdentities.grammarFill.groupId
      ].passage.paragraphs.map((paragraph) => paragraph.text),
  } = {},
) {
  const expected = grammarFillSourceOracle
  const rowWords = pdfWordsWithBoxes(pdfPath)
  const words = pdfWordsInGeometricReadingOrder(rowWords)
  const lines = pdfRoleLines(rowWords)
  const lineForWord = (word) => {
    const centerY = (word.yMin + word.yMax) / 2
    return lines.find(
      (line) =>
        line.page === word.page
        && Math.abs(line.centerY - centerY) <= 2.5,
    )
  }
  const marker = (value, markerLabel, startIndex = 0) =>
    uniquePdfSequenceIndex(
      words,
      exactPdfTokens(value),
      `${label} ${markerLabel}`,
      startIndex,
    )
  const partIndex = marker(
    expected.oracle.publicVisibleChrome.part,
    'source part context',
  )
  const sectionIndex = marker(
    expected.oracle.publicVisibleChrome.section,
    'Grammar Fill subsection',
    partIndex,
  )
  const instructionIndex = marker(
    expected.oracle.publicVisibleChrome.instruction,
    'Grammar Fill instruction',
    sectionIndex,
  )
  const firstPassageIndex = marker(
    sourceLexicalTokens(
      expectedPassageTexts[0].replace(/__\d+__/gu, ''),
    ).slice(0, 8).join(' '),
    'source passage start',
    instructionIndex,
  )
  const passageEndTokens = sourceLexicalTokens(
    expectedPassageTexts.at(-1).replace(/__\d+__/gu, ''),
  ).slice(-5)
  const passageEndIndexes = exactPdfSequenceIndexes(
    words,
    exactPdfTokens(passageEndTokens.join(' ')),
    firstPassageIndex,
  )
  assert.equal(
    passageEndIndexes.length >= 1,
    true,
    `${label} resolves the source passage end`,
  )
  const passageEndIndex =
    passageEndIndexes.at(-1) + passageEndTokens.length - 1
  const followingIndexes = exactPdfSequenceIndexes(
    words,
    exactPdfTokens(expected.oracle.publicVisibleChrome.followingPart),
    passageEndIndex,
  )
  assert.equal(followingIndexes.length >= 1, true)
  const followingIndex = followingIndexes[0]
  const sectionLine = lineForWord(words[sectionIndex])
  const firstPassageLine = lineForWord(words[firstPassageIndex])
  const finalPassageLine = lineForWord(words[passageEndIndex])
  const followingLine = lineForWord(words[followingIndex])
  const previousLine = lines.filter(
    (line) =>
      isPdfBodyLine(line)
      && (
        line.page < sectionLine.page
        || (
          line.page === sectionLine.page
          && line.centerY < sectionLine.centerY
        )
      ),
  ).at(-1)
  for (const line of [
    previousLine,
    sectionLine,
    firstPassageLine,
    finalPassageLine,
    followingLine,
  ]) {
    assert.equal(
      isPdfBodyLine(line),
      true,
      `${label} excludes header/footer through measured body seams`,
    )
  }
  const actualPreviousRelation =
    previousLine.page === sectionLine.page ? 'same_page' : 'cross_page'
  assert.equal(actualPreviousRelation, previousRelation)
  if (previousRelation === 'cross_page') {
    assert.equal(sectionLine.page, previousLine.page + 1)
    assert.equal(sectionLine.yMax < 130, true)
  }
  const passageLines = lines.filter(
    (line) =>
      isPdfBodyLine(line)
      && line.lineIndex >= firstPassageLine.lineIndex
      && line.lineIndex <= finalPassageLine.lineIndex,
  )
  const passagePages = [...new Set(passageLines.map((line) => line.page))]
  assert.equal(
    passagePages.length > 1 ? 'cross_page' : 'same_page',
    passageRelation,
  )
  const samePageLineGapsPt = passageLines.slice(1).flatMap(
    (line, index) =>
      line.page === passageLines[index].page
        ? [line.centerY - passageLines[index].centerY]
        : [],
  )
  assert.equal(
    samePageLineGapsPt.every(
      (gap) =>
        Math.abs(
          gap - grammarFillRhythm.targets.printPdf.baselineStepPt,
        ) <= grammarFillRhythm.targets.printPdf.oneStepTolerancePt,
    ),
    true,
    `${label} measures local passage baselines`,
  )
  const compactPdfText = normalizedVisibleText(
    execFileSync('pdftotext', ['-layout', pdfPath, '-'], {
      encoding: 'utf8',
    }),
  ).replace(/\s+/gu, '')
  for (const text of expectedPassageTexts) {
    const projectedText = normalizedVisibleText(text)
      .replace(/__(\d+)__/gu, '$1')
      .replace(/\s+/gu, '')
    for (const fragment of [
      projectedText.slice(0, 80),
      projectedText.slice(-80),
    ]) {
      assert.equal(
        compactPdfText.includes(fragment),
        true,
        `${label} binds digest-backed projected source passage fragments`,
      )
    }
  }
  const blankProofs = expected.rows.map((row) => {
    const indexes = exactPdfSequenceIndexes(
      words,
      [String(row.questionNo)],
      firstPassageIndex,
    ).filter((index) => index <= passageEndIndex)
    assert.equal(indexes.length, 1)
    const word = words[indexes[0]]
    const promptIndex = row.prompt === null
      ? null
      : exactPdfSequenceIndexes(
          words,
          exactPdfTokens(`(${row.prompt})`),
          indexes[0],
        ).find((index) => index <= passageEndIndex)
    if (row.prompt !== null) assert.ok(Number.isInteger(promptIndex))
    return {
      ...row,
      wordIndex: indexes[0],
      word,
      line: lineForWord(word),
      promptWord: promptIndex === null ? null : words[promptIndex],
    }
  })
  assert.equal(
    blankProofs.every(
      (proof, index) =>
        index === 0
        || proof.wordIndex > blankProofs[index - 1].wordIndex,
    ),
    true,
  )
  const rulings = grammarFillPdfRulingMeasurements(
    pdfPath,
    blankProofs.map((proof) => proof.word.page),
  )
  for (const proof of blankProofs) {
    const centerX = (proof.word.xMin + proof.word.xMax) / 2
    const matches = rulings.filter(
      (ruling) =>
        ruling.page === proof.word.page
        && centerX >= ruling.xMin - 1
        && centerX <= ruling.xMax + 1
        && Math.abs(ruling.yMin - proof.word.yMax) <= 8,
    )
    assert.equal(matches.length, 1)
    proof.ruling = matches[0]
    assert.equal(
      Math.abs(
        proof.ruling.widthPt / 10.5
        - grammarFillRhythm.blankGeometry.widthEm,
      ) <= 0.12,
      true,
    )
    assert.equal(/\.$/u.test(proof.word.text), false)
    if (proof.promptWord) {
      assert.equal(
        lineForWord(proof.promptWord).lineIndex,
        proof.line.lineIndex,
      )
      assert.equal(
        Math.abs(
          (proof.promptWord.xMin - proof.ruling.xMax) / 10.5
          - grammarFillRhythm.promptGeometry.gapEm,
        ) <= 0.16,
        true,
      )
    }
  }
  const lineEndBlank = blankProofs.find((proof) => {
    if (proof.questionId !== expected.oracle.variants.lineEndQuestionId) {
      return false
    }
    const terminalWord = proof.promptWord || proof.word
    const nextWord = words[words.indexOf(terminalWord) + 1]
    return nextWord && lineForWord(nextWord).lineIndex !== proof.line.lineIndex
  })
  if (requireLineEndBlank) {
    assert.ok(
      lineEndBlank,
      `${label} executes the exact source-bound line-end blank adversary`,
    )
  }
  let transitionTailLine = finalPassageLine
  if (teacher) {
    for (const row of expected.rows) {
      assert.equal(
        compactPdfText.includes(
          normalizedVisibleText(`【答案】${row.answer}`)
            .replace(/\s+/gu, ''),
        ),
        true,
      )
      assert.equal(
        compactPdfText.includes(
          normalizedVisibleText(`【解析】${row.explanation}`)
            .replace(/\s+/gu, ''),
        ),
        true,
      )
    }
    const finalExplanationIndexes = collapsedPdfSequenceIndexes(
      words,
      `【解析】${expected.rows.at(-1).explanation}`,
      8,
    )
    assert.equal(finalExplanationIndexes.length, 1)
    transitionTailLine = lines.filter(
      (line) =>
        isPdfBodyLine(line)
        && line.lineIndex >= lineForWord(
          words[finalExplanationIndexes[0]],
        ).lineIndex
        && line.lineIndex < followingLine.lineIndex,
    ).at(-1)
  } else {
    assert.equal(compactPdfText.includes('【答案】'), false)
    assert.equal(compactPdfText.includes('【解析】'), false)
  }
  const actualFollowingRelation =
    transitionTailLine.page === followingLine.page
      ? 'same_page'
      : 'cross_page'
  if (followingRelation !== 'either') {
    assert.equal(
      actualFollowingRelation,
      followingRelation,
      `${label} preserves the declared following-section page relation`,
    )
  }
  if (actualFollowingRelation === 'cross_page') {
    assert.equal(followingLine.page, transitionTailLine.page + 1)
    assert.equal(followingLine.yMax < 130, true)
  }
  return {
    pdfSha256: sha256(readFileSync(pdfPath)),
    sourceOracleSha256: expected.digest,
    sourceTextDigest: sha256(Buffer.from(
      expectedPassageTexts.join('\n'),
      'utf8',
    )),
    previousRelation,
    passageRelation,
    followingRelation: actualFollowingRelation,
    previousPage: previousLine.page,
    sectionPage: sectionLine.page,
    passagePages,
    followingPage: followingLine.page,
    baselineRatios: samePageLineGapsPt.map(
      (gap) => gap / grammarFillRhythm.targets.printPdf.baselineStepPt,
    ),
    blankRulings: blankProofs.map((proof) => ({
      questionId: proof.questionId,
      blankId: proof.blankId,
      page: proof.word.page,
      lineIndex: proof.line.lineIndex,
      widthPt: proof.ruling.widthPt,
      xMin: proof.ruling.xMin,
      xMax: proof.ruling.xMax,
      promptText: proof.prompt,
      promptGapEm: proof.promptWord
        ? (proof.promptWord.xMin - proof.ruling.xMax) / 10.5
        : null,
    })),
    lineEndBlankId: lineEndBlank?.blankId || null,
    bodySeams: [...new Map(lines.map((line) => [
      line.page,
      line.measuredBodySeam,
    ])).values()],
  }
}

function assertPdfRoleEdge(
  from,
  to,
  edge,
  label,
  observations,
) {
  assert.ok(from && to, `${label} ${edge.edgeId} has both role coordinates`)
  const samePage = to.page === from.page
  if (edge.edgeId.endsWith('_same_page')) {
    assert.equal(
      samePage,
      true,
      `${label} ${edge.edgeId} stays on its declared same A4 page`,
    )
  } else {
    assert.equal(
      samePage || to.page === from.page + 1,
      true,
      `${label} ${edge.edgeId} stays on the same or adjacent A4 page`,
    )
  }
  const observation = {
    edgeId: edge.edgeId,
    from: {
      page: from.page,
      xMin: from.xMin,
      yMin: from.yMin,
      xMax: from.xMax,
      yMax: from.yMax,
      centerY: from.centerY,
    },
    to: {
      page: to.page,
      xMin: to.xMin,
      yMin: to.yMin,
      xMax: to.xMax,
      yMax: to.yMax,
      centerY: to.centerY,
    },
    pageRelation: samePage ? 'same_page' : 'next_page',
  }
  if (samePage) {
    const target =
      passageLetterReference.evidence.normalizedContract.pdfBodyBaselineStepPt
      * edge.baselineStepRatio
    const tolerance =
      edge.baselineStepRatio === 2
        ? passageLetterReference.evidence.tolerances.pdfTwoStepPt
        : passageLetterReference.evidence.tolerances.pdfOneStepPt
    observation.distancePt = to.centerY - from.centerY
    observation.targetPt = target
    assert.equal(
      Math.abs(observation.distancePt - target) <= tolerance,
      true,
      `${label} ${edge.edgeId} keeps ${edge.baselineStepRatio}x in PDF points: ${JSON.stringify(observation)}`,
    )
  } else {
    assert.equal(
      to.yMax < 130,
      true,
      `${label} ${edge.edgeId} continues at the adjacent A4 page head`,
    )
  }
  observations.push(observation)
}

function assertPdfPageRelationEdge(
  from,
  to,
  edge,
  label,
  observations,
) {
  assert.ok(from && to, `${label} ${edge.edgeId} has both role coordinates`)
  assert.equal(
    to.page,
    from.page + 1,
    `${label} ${edge.edgeId} continues on the adjacent A4 page`,
  )
  assert.equal(
    to.yMax < 130,
    true,
    `${label} ${edge.edgeId} continues at the next A4 page head`,
  )
  observations.push({
    edgeId: edge.edgeId,
    from: {
      page: from.page,
      xMin: from.xMin,
      yMin: from.yMin,
      xMax: from.xMax,
      yMax: from.yMax,
      centerY: from.centerY,
    },
    to: {
      page: to.page,
      xMin: to.xMin,
      yMin: to.yMin,
      xMax: to.xMax,
      yMax: to.yMax,
      centerY: to.centerY,
    },
    pageRelation: edge.pageRelation,
  })
}

function assertPdfReadingVerticalRhythm(
  pdfPath,
  consumption,
  label,
  {
    requireTeacherTail = false,
    requireInstruction = false,
    requireTwoLineStem = false,
    requireWrappedOption = false,
    requireCrossPageEnd = false,
  } = {},
) {
  const words = pdfWordsWithBoxes(pdfPath)
  const lines = pdfRoleLines(words)
  const wordIndexToLineIndex = new Map(
    lines.flatMap((line) =>
      line.wordIndexes.map((wordIndex) => [wordIndex, line.lineIndex])),
  )
  const graph = new Map(
    passageLetterReference.evidence.normalizedContract.adjacencyGraph
      .map((edge) => [edge.edgeId, edge]),
  )
  const observations = []
  const cover = (edgeId, from, to) => {
    const edge = graph.get(edgeId)
    assert.ok(edge, `${label} uses declared edge ${edgeId}`)
    if (edge.pageRelation) {
      assertPdfPageRelationEdge(from, to, edge, label, observations)
    } else {
      assertPdfRoleEdge(from, to, edge, label, observations)
    }
  }
  const readingSelection = consumption.selections.find(
    (selection) => selection.familyContractId === 'reading',
  )
  assert.deepEqual(
    readingSelection.groupIds,
    readingPdfRoleOracle.readingGroups.map((group) => group.groupId),
    `${label} binds the source-digest-pinned Reading A-D group order`,
  )
  const groups = readingSelection.groupIds.map((groupId) =>
    projectCanonicalConsumerGroup({
      consumption,
      familyContractId: 'reading',
      groupId,
    }))
  const groupAnchors = groups.map((group, groupIndex) => {
    const oracle = readingPdfRoleOracle.readingGroups[groupIndex]
    assert.equal(group.passageLetter, oracle.letter)
    assert.equal(group.questions[0].questionId, oracle.firstQuestionId)
    assert.equal(group.questions.at(-1).questionId, oracle.lastQuestionId)
    const firstTokens = exactPdfTokens(group.blocks[0].text).slice(0, 4)
    const firstWordIndex = uniquePdfSequenceIndex(
      words,
      firstTokens,
      `${label} ${group.groupId} first passage line`,
    )
    const letterWordIndex = firstWordIndex - 1
    assert.equal(words[letterWordIndex]?.text, oracle.letter)
    return {
      group,
      oracle,
      firstWordIndex,
      firstLine: lines[wordIndexToLineIndex.get(firstWordIndex)],
      letterWordIndex,
      letterLine: lines[wordIndexToLineIndex.get(letterWordIndex)],
    }
  })
  const questionAnchors = groupAnchors.flatMap((groupAnchor, groupIndex) =>
    groupAnchor.group.questions.map((question, questionIndex) => {
      const stemTokens = exactPdfTokens(
        canonicalInlineText(question.stemContent),
      ).slice(0, 5)
      const stemWordIndex = uniquePdfSequenceIndex(
        words,
        stemTokens,
        `${label} Question ${question.questionNo} stem`,
        groupAnchor.firstWordIndex,
      )
      const questionNumberWordIndex = stemWordIndex - 1
      assert.equal(
        words[questionNumberWordIndex]?.text,
        String(question.questionNo),
        `${label} binds Question ${question.questionNo}'s exact number`,
      )
      return {
        groupIndex,
        questionIndex,
        groupAnchor,
        question,
        stemWordIndex,
        questionNumberWordIndex,
      }
    }))
  const questionById = new Map(
    questionAnchors.map((anchor) => [anchor.question.questionId, anchor]),
  )
  const nextSectionWordIndex = uniquePdfSequenceIndex(
    words,
    exactPdfTokens(readingPdfRoleOracle.readingEnd.nextSectionVisibleText),
    `${label} post-Reading section`,
  )
  const nextSectionLine =
    lines[wordIndexToLineIndex.get(nextSectionWordIndex)]
  const optionRowCases = new Map(
    readingPdfRoleOracle.optionRowCases.map((entry) => [
      entry.questionId,
      entry,
    ]),
  )
  let wrappedOptionObserved = false
  let twoLineStemObserved = false
  const questionRoles = new Map()

  for (const anchor of questionAnchors) {
    const nextQuestion = anchor.groupAnchor.group.questions[
      anchor.questionIndex + 1
    ]
    const nextGroupAnchor = groupAnchors[anchor.groupIndex + 1]
    const boundaryWordIndex = nextQuestion
      ? questionById.get(nextQuestion.questionId).questionNumberWordIndex
      : nextGroupAnchor
        ? nextGroupAnchor.letterWordIndex
        : nextSectionWordIndex
    const answerWordIndexes = words.slice(
      anchor.questionNumberWordIndex,
      boundaryWordIndex,
    ).filter((word) => word.text.startsWith('答案'))
      .map((word) => word.wordIndex)
    const explanationWordIndexes = words.slice(
      anchor.questionNumberWordIndex,
      boundaryWordIndex,
    ).filter((word) => word.text.startsWith('解析'))
      .map((word) => word.wordIndex)
    assert.equal(
      answerWordIndexes.length,
      requireTeacherTail ? 1 : 0,
      `${label} Question ${anchor.question.questionNo} has the exact answer-role count`,
    )
    assert.equal(
      explanationWordIndexes.length,
      requireTeacherTail ? 1 : 0,
      `${label} Question ${anchor.question.questionNo} has the exact explanation-role count`,
    )
    const optionBoundaryWordIndex =
      answerWordIndexes[0] ?? boundaryWordIndex
    const optionLineIndexes = new Set()
    for (const option of anchor.question.options) {
      const optionTokens = exactPdfTokens(canonicalInlineText(option.content))
      const optionWordIndex = uniquePdfSequenceIndex(
        words,
        optionTokens,
        `${label} Question ${anchor.question.questionNo} Option ${option.label}`,
        anchor.stemWordIndex,
        optionBoundaryWordIndex,
      )
      assert.equal(words[optionWordIndex - 1]?.text, option.label)
      for (
        let wordIndex = optionWordIndex - 1;
        wordIndex < optionWordIndex + optionTokens.length;
        wordIndex += 1
      ) {
        optionLineIndexes.add(wordIndexToLineIndex.get(wordIndex))
      }
    }
    const optionLines = [...optionLineIndexes]
      .sort((left, right) => left - right)
      .map((lineIndex) => lines[lineIndex])
    const firstOptionLineIndex = optionLines[0].lineIndex
    const stemStartLineIndex =
      wordIndexToLineIndex.get(anchor.questionNumberWordIndex)
    const stemLines = lines.slice(stemStartLineIndex, firstOptionLineIndex)
      .filter(isPdfBodyLine)
    assert.equal(stemLines.length > 0, true)
    if (
      anchor.question.questionId
        === readingPdfRoleOracle.exactA4Variant.oneLineStemQuestionId
    ) {
      assert.equal(
        stemLines.length,
        readingPdfRoleOracle.exactA4Variant.oneLineStemLineCount,
        `${label} executes the source-pinned one-line stem case`,
      )
    }
    const rowCase = optionRowCases.get(anchor.question.questionId)
    if (rowCase) {
      assert.equal(anchor.question.layoutPlan.mode, rowCase.placementMode)
      if (!requireWrappedOption || anchor.question.questionId
        !== readingPdfRoleOracle.exactA4Variant.wrappedOptionQuestionId) {
        assert.equal(
          optionLines.length,
          rowCase.rowCount,
          `${label} ${anchor.question.questionId} has exact ${rowCase.rowCount}-row PDF geometry`,
        )
      }
    }
    if (
      anchor.question.questionId
        === readingPdfRoleOracle.exactA4Variant.stemQuestionId
      && stemLines.length
        === readingPdfRoleOracle.exactA4Variant.stemLineCount
    ) {
      twoLineStemObserved = true
    }
    if (
      anchor.question.questionId
        === readingPdfRoleOracle.exactA4Variant.wrappedOptionQuestionId
      && optionLines.length >=
        readingPdfRoleOracle.exactA4Variant.minimumWrappedOptionLineCount
    ) {
      wrappedOptionObserved = true
    }
    const answerLine = answerWordIndexes[0] === undefined
      ? null
      : lines[wordIndexToLineIndex.get(answerWordIndexes[0])]
    const explanationLines = explanationWordIndexes[0] === undefined
      ? []
      : pdfLinesForWordRange(
          lines,
          wordIndexToLineIndex,
          explanationWordIndexes[0],
          boundaryWordIndex,
        )
    questionRoles.set(anchor.question.questionId, {
      anchor,
      stemLines,
      optionLines,
      answerLine,
      explanationLines,
      tailLine:
        explanationLines.at(-1) ?? answerLine ?? optionLines.at(-1),
    })

    for (let index = 1; index < stemLines.length; index += 1) {
      cover(
        'question_stem_internal',
        stemLines[index - 1],
        stemLines[index],
      )
    }
    cover('stem_to_options', stemLines.at(-1), optionLines[0])
    for (let index = 1; index < optionLines.length; index += 1) {
      cover(
        'option_line_internal',
        optionLines[index - 1],
        optionLines[index],
      )
    }
    if (requireTeacherTail) {
      cover('option_to_answer', optionLines.at(-1), answerLine)
      cover('answer_to_explanation', answerLine, explanationLines[0])
    }
  }

  for (const groupAnchor of groupAnchors) {
    const firstQuestion = questionRoles.get(
      groupAnchor.group.questions[0].questionId,
    )
    const contentLines = pdfLinesForWordRange(
      lines,
      wordIndexToLineIndex,
      groupAnchor.firstWordIndex,
      firstQuestion.anchor.questionNumberWordIndex,
    )
    assert.equal(contentLines.length > 0, true)
    cover(
      'letter_to_first_content',
      groupAnchor.letterLine,
      contentLines[0],
    )
    for (let index = 1; index < contentLines.length; index += 1) {
      if (contentLines[index - 1].page === contentLines[index].page) {
        cover(
          'passage_content_internal',
          contentLines[index - 1],
          contentLines[index],
        )
      } else {
        cover(
          'same_passage_cross_page',
          contentLines[index - 1],
          contentLines[index],
        )
      }
    }
    cover(
      'passage_to_first_question',
      contentLines.at(-1),
      firstQuestion.stemLines[0],
    )
    for (
      let questionIndex = 1;
      questionIndex < groupAnchor.group.questions.length;
      questionIndex += 1
    ) {
      const previous = questionRoles.get(
        groupAnchor.group.questions[questionIndex - 1].questionId,
      )
      const current = questionRoles.get(
        groupAnchor.group.questions[questionIndex].questionId,
      )
      cover(
        requireTeacherTail
          ? 'teacher_tail_to_next_question'
          : 'question_to_next_question',
        previous.tailLine,
        current.stemLines[0],
      )
    }
  }

  const partTitleWordIndex = uniquePdfSequenceIndex(
    words,
    exactPdfTokens(readingPdfRoleOracle.chrome.partTitleVisibleText),
    `${label} Reading part title`,
  )
  const partTitleLine = lines[wordIndexToLineIndex.get(partTitleWordIndex)]
  let lastChromeLine = partTitleLine
  if (requireInstruction) {
    const instructionWordIndex = uniquePdfSequenceIndex(
      words,
      exactPdfTokens(readingPdfRoleOracle.chrome.instructionVisibleText),
      `${label} Reading instruction`,
    )
    const instructionLine =
      lines[wordIndexToLineIndex.get(instructionWordIndex)]
    cover('chrome_internal', partTitleLine, instructionLine)
    lastChromeLine = instructionLine
  }
  cover('chrome_to_a', lastChromeLine, groupAnchors[0].letterLine)

  for (let groupIndex = 1; groupIndex < groupAnchors.length; groupIndex += 1) {
    const previousGroup = groupAnchors[groupIndex - 1].group
    const previousTail = questionRoles.get(
      previousGroup.questions.at(-1).questionId,
    ).tailLine
    cover(
      requireTeacherTail
        ? 'teacher_reading_passage_transition'
        : 'reading_passage_transition',
      previousTail,
      groupAnchors[groupIndex].letterLine,
    )
  }

  const readingEnd = questionRoles.get(
    readingPdfRoleOracle.readingEnd.questionId,
  ).tailLine
  const endEdgeId = requireCrossPageEnd
    ? 'reading_to_next_section_cross_page'
    : requireTeacherTail
      ? 'teacher_reading_to_next_section_same_page'
      : 'reading_to_next_section_same_page'
  cover(endEdgeId, readingEnd, nextSectionLine)

  if (requireTwoLineStem) {
    assert.equal(
      twoLineStemObserved,
      true,
      `${label} executes the source-pinned two-line stem case`,
    )
  }
  if (requireWrappedOption) {
    assert.equal(
      wrappedOptionObserved,
      true,
      `${label} executes the source-pinned wrapped-option case`,
    )
  }
  const edgeIds = new Set(observations.map((observation) => observation.edgeId))
  return { edgeIds, observations }
}

function assertPdfReadingContinuationAndEnd(pdfPath, consumption, label) {
  const words = pdfWordsWithBoxes(pdfPath)
  const readingSelection = consumption.selections.find(
    (selection) => selection.familyContractId === 'reading',
  )
  let crossPageContinuationCount = 0
  for (const groupId of readingSelection.groupIds) {
    const group = projectCanonicalConsumerGroup({
      consumption,
      familyContractId: 'reading',
      groupId,
    })
    const firstTokens = normalizedVisibleText(group.blocks[0].text)
      .split(/\s+/)
      .map(normalizedPdfToken)
      .filter(Boolean)
      .slice(0, 4)
    const firstIndexes = exactPdfSequenceIndexes(words, firstTokens)
    assert.equal(
      firstIndexes.length,
      1,
      `${label} does not repeat ${groupId}'s letter or first title/body line on continuation pages`,
    )
    const firstIndex = firstIndexes[0]
    assert.equal(
      words[firstIndex - 1]?.text,
      group.passageLetter,
      `${label} places ${group.passageLetter} only at ${groupId}'s exact first content line`,
    )
    const finalBlock = group.blocks.at(-1)
    const finalTokens = normalizedVisibleText(finalBlock.text)
      .split(/\s+/)
      .map(normalizedPdfToken)
      .filter(Boolean)
      .slice(-4)
    const firstQuestionTokens = canonicalInlineText(
      group.questions[0].stemContent,
    ).split(/\s+/).map(normalizedPdfToken).filter(Boolean).slice(0, 5)
    const firstQuestionIndexes = exactPdfSequenceIndexes(
      words,
      firstQuestionTokens,
      firstIndex,
    )
    assert.equal(
      firstQuestionIndexes.length,
      1,
      `${label} locates exactly one first-question line for ${groupId}`,
    )
    const finalIndexes = exactPdfSequenceIndexes(
      words,
      finalTokens,
      firstIndex,
    ).filter((wordIndex) => wordIndex < firstQuestionIndexes[0])
    assert.equal(
      finalIndexes.length,
      1,
      `${label} locates exactly one final original-text line for ${groupId}`,
    )
    const finalLineWords = words.slice(
      finalIndexes[0],
      finalIndexes[0] + finalTokens.length,
    )
    const firstQuestionWord = words[firstQuestionIndexes[0]]
    const finalLinePage = finalLineWords[0].page
    if (firstQuestionWord.page === finalLinePage) {
      const actual =
        (firstQuestionWord.yMin + firstQuestionWord.yMax) / 2
        - median(finalLineWords.map(
          (word) => (word.yMin + word.yMax) / 2,
        ))
      const target =
        readingPassageLetterTypography.verticalRhythm.targets.printPdf
      assert.equal(
        Math.abs(actual - target.baselineStepPt * 2)
          <= target.twoStepTolerancePt,
        true,
        `${label} keeps ${groupId} final original-text line to first question at 2x: ${JSON.stringify({
          actual,
          expected: target.baselineStepPt * 2,
        })}`,
      )
    } else {
      assert.equal(
        firstQuestionWord.page === finalLinePage + 1
        && firstQuestionWord.yMax < 130,
        true,
        `${label} keeps ${groupId}'s cross-page first question at the adjacent page head`,
      )
    }
    if (words[firstIndex].page !== words[finalIndexes[0]].page) {
      crossPageContinuationCount += 1
    }
  }
  assert.equal(
    crossPageContinuationCount > 0,
    true,
    `${label} executes at least one same-passage cross-page continuation`,
  )

  const ending = readingPredecessorOracle.readingEnd
  const finalGroup = projectCanonicalConsumerGroup({
    consumption,
    familyContractId: 'reading',
    groupId: ending.groupId,
  })
  const finalQuestion = finalGroup.questions.at(-1)
  assert.equal(finalQuestion.questionId, ending.predecessorQuestionId)
  assert.equal(finalQuestion.options.at(-1).optionId, ending.predecessorOptionId)
  const finalOptionTokens = canonicalInlineText(
    finalQuestion.options.at(-1).content,
  ).split(/\s+/).map(normalizedPdfToken).filter(Boolean)
  const finalOptionIndexes = exactPdfSequenceIndexes(words, finalOptionTokens)
  assert.equal(
    finalOptionIndexes.length,
    1,
    `${label} binds Reading D ending to its exact final option`,
  )
  const sectionTokens = ending.printPdfNextSectionVisibleText
    .split(/\s+/)
    .map(normalizedPdfToken)
    .filter(Boolean)
  const sectionIndexes = exactPdfSequenceIndexes(words, sectionTokens)
  assert.equal(
    sectionIndexes.length,
    1,
    `${label} locates exactly one post-Reading section heading`,
  )
  const sectionIndex = sectionIndexes[0]
  const visibleTail = words[sectionIndex - 1]
  const finalOption = words[finalOptionIndexes[0]]
  assert.equal(
    visibleTail.page,
    finalOption.page,
    `${label} keeps the Student option or Teacher answer/explanation tail with Reading D's final question`,
  )
  const section = words[sectionIndex]
  assert.equal(
    section.page === visibleTail.page
    || section.page === visibleTail.page + 1,
    true,
    `${label} keeps the post-Reading section on the same or immediately following page`,
  )
  if (section.page === visibleTail.page) {
    const actual = (
      (section.yMin + section.yMax) / 2
      - (visibleTail.yMin + visibleTail.yMax) / 2
    )
    const target =
      readingPassageLetterTypography.verticalRhythm.targets.printPdf
    assert.equal(
      Math.abs(actual - target.baselineStepPt * 2)
        <= target.twoStepTolerancePt,
      true,
      `${label} keeps Reading D to next section at 2x: ${JSON.stringify({
        actual,
        expected: target.baselineStepPt * 2,
      })}`,
    )
  } else {
    assert.equal(
      section.yMax < 130,
      true,
      `${label} starts the cross-page post-Reading section at the next A4 page head`,
    )
  }
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right)
  const midpoint = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[midpoint - 1] + sorted[midpoint]) / 2
    : sorted[midpoint]
}

function assertPdfPassageLetterGeometry(
  pdfPath,
  consumption,
  pageBoxes,
  predecessorBindings,
  label,
  oracleEntries = readingPredecessorOracle.printPdf,
) {
  const words = pdfWordsWithBoxes(pdfPath)
  const expected = expectedReadingPassageEntries(
    consumption,
    'print_pdf',
    oracleEntries,
  )
  const measurements = []
  for (const {
    groupId,
    letter: expectedLetter,
    precedingKind,
  } of expected) {
    const group = projectCanonicalConsumerGroup({
      consumption,
      familyContractId: 'reading',
      groupId,
    })
    const markerTokens = normalizedVisibleText(group.blocks[0].text)
      .split(/\s+/)
      .map(normalizedPdfToken)
      .filter(Boolean)
      .slice(0, 4)
    const markerIndexes = words.flatMap((word, wordIndex) =>
      markerTokens.every(
        (token, tokenIndex) => words[wordIndex + tokenIndex]?.text === token,
      ) ? [wordIndex] : [])
    assert.equal(
      markerIndexes.length,
      1,
      `${label} exposes exactly one ${groupId} first-passage marker`,
    )
    const [markerIndex] = markerIndexes
    const letter = words[markerIndex - 1]
    const firstWord = words[markerIndex]
    const expectedGeometry =
      readingPassageLetterGeometryForLetter(expectedLetter, 'print_pdf')
    const predecessorBinding = predecessorBindings.get(groupId)
    assert.ok(
      predecessorBinding,
      `${label} carries the exact Print HTML predecessor binding for ${groupId}`,
    )
    let predecessorTokens = predecessorBinding.visibleText
      .split(/\s+/)
      .map(normalizedPdfToken)
      .filter(Boolean)
    let predecessorIndexes = words.flatMap((word, wordIndex) =>
      predecessorTokens.every(
        (token, tokenIndex) => words[wordIndex + tokenIndex]?.text === token,
      ) ? [wordIndex] : [])
    if (predecessorIndexes.length === 0) {
      const semanticTailTokens = [
        ...predecessorBinding.visibleText.matchAll(
          /[\p{Script=Han}]{2,}|[A-Za-z0-9-]{3,}/gu,
        ),
      ].map((match) => normalizedPdfToken(match[0]))
        .filter(Boolean)
        .slice(-8)
      const tailMatches = words.flatMap((word, wordIndex) =>
        wordIndex < markerIndex
        && word.text.length >= 2
        && semanticTailTokens.some(
          (tailToken) =>
            word.text.includes(tailToken) || tailToken.includes(word.text),
        )
          ? [wordIndex]
          : [])
      const closestTailMatch = tailMatches.at(-1)
      if (closestTailMatch !== undefined) {
        predecessorIndexes = [closestTailMatch]
        predecessorTokens = [words[closestTailMatch].text]
      }
    }
    assert.equal(
      predecessorIndexes.length,
      1,
      `${label} locates exactly one visible tagged predecessor for ${groupId}: ${JSON.stringify({
        visibleText: predecessorBinding.visibleText,
        visibleRole: predecessorBinding.visiblePredecessorRole,
        tokens: predecessorTokens,
        nearby: words
          .filter((word) =>
            predecessorTokens.some((token) => word.text.includes(token)))
          .slice(-12)
          .map((word) => word.text),
        hanTail: words
          .filter((word) => /\p{Script=Han}/u.test(word.text))
          .slice(-30)
          .map((word) => word.text),
      })}`,
    )
    const [precedingWordIndex] = predecessorIndexes
    const precedingWords = words.slice(
      precedingWordIndex,
      precedingWordIndex + predecessorTokens.length,
    )
    const precedingWord = precedingWords[0]
    assert.equal(
      letter?.text,
      expectedLetter,
      `${label} places ${expectedLetter} immediately before ${groupId}'s first passage line`,
    )
    assert.equal(
      letter.page,
      firstWord.page,
      `${label} keeps ${expectedLetter} with its first passage line`,
    )
    const pageRelation =
      precedingWord?.page === letter.page
        ? 'same_page'
        : 'next_page_transition'
    assert.equal(
      precedingWord?.page === letter.page
      || precedingWord?.page + 1 === letter.page,
      true,
      `${label} keeps ${expectedLetter} on the same or immediately following page`,
    )
    const pageBox = pageBoxes[letter.page - 1].cropBox
    const pageCenterX = (pageBox.xMin + pageBox.xMax) / 2
    const letterCenterX = (letter.xMin + letter.xMax) / 2
    const followingBaselineStepPt = firstWord.yMax - letter.yMax
    const precedingBaselineProxyPt = median(
      precedingWords.map((word) => word.yMax),
    )
    const precedingBaselineStepPt = letter.yMax - precedingBaselineProxyPt
    const tolerances = passageLetterReference.evidence.tolerances
    assert.equal(
      Math.abs(letterCenterX - pageCenterX)
        <= tolerances.pdfHorizontalCenterPt,
      true,
      `${label} ${expectedLetter} is centered on the A4 page`,
    )
    assert.equal(
      Math.abs(
        followingBaselineStepPt
        - readingPassageLetterTypography.followingGeometry.pdfBaselineStepPt,
      ) <= readingPassageLetterTypography.followingGeometry.pdfTolerancePt,
      true,
      `${label} ${expectedLetter} and its first passage line use the ratio-mapped PDF baseline step`,
    )
    if (pageRelation === 'same_page') {
      assert.equal(
        Math.abs(
          precedingBaselineStepPt - expectedGeometry.pdfBaselineStepPt,
        )
          <= expectedGeometry.pdfTolerancePt,
        true,
        `${label} ${expectedLetter} retains the ratio-mapped predecessor baseline step: ${JSON.stringify({
          actual: precedingBaselineStepPt,
          expected: expectedGeometry.pdfBaselineStepPt,
        })}`,
      )
    } else {
      assert.equal(
        letter.yMax < 130,
        true,
        `${label} ${expectedLetter} starts at the next A4 page head after its exact predecessor tail`,
      )
    }
    assert.equal(
      letter.yMax - letter.yMin > 10 && letter.yMax - letter.yMin < 13,
      true,
      `${label} ${expectedLetter} retains the 10.5pt bold glyph box`,
    )
    measurements.push({
      groupId,
      letter: expectedLetter,
      page: letter.page,
      box: {
        xMin: letter.xMin,
        yMin: letter.yMin,
        xMax: letter.xMax,
        yMax: letter.yMax,
      },
      pageCenterOffsetPt: letterCenterX - pageCenterX,
      precedingForGroupId: predecessorBinding.precedingForGroupId,
      precedingKind,
      predecessorGroupId: predecessorBinding.predecessorGroupId,
      predecessorAnchorId: predecessorBinding.predecessorAnchorId,
      predecessorRole: predecessorBinding.predecessorRole,
      visiblePredecessorRole: predecessorBinding.visiblePredecessorRole,
      predecessorQuestionId: predecessorBinding.predecessorQuestionId,
      predecessorOptionId: predecessorBinding.predecessorOptionId,
      visibleText: predecessorBinding.visibleText,
      predecessorPage: precedingWord.page,
      letterPage: letter.page,
      pageRelation,
      firstLineBaselineStepPt: followingBaselineStepPt,
      firstLineInkGapPt: firstWord.yMin - letter.yMax,
      precedingBaselineProxyPt,
      precedingBaselineStepPt,
    })
  }
  assertExactTaggedPredecessorObservations(measurements, expected, label)
  assertTaggedPredecessorAttacksFailClosed(measurements, expected, label)
  return measurements
}

function assertPdfBankAndNativeTable(
  pdfPath,
  consumption,
  outputDir,
  pageBoxes,
  label,
) {
  const text = normalizedVisibleText(pdfText(pdfPath))
  const sevenSelection = consumption.selections.find(
    (selection) => selection.familyContractId === 'seven-choices',
  )
  const sevenGroup = projectCanonicalConsumerGroup({
    consumption,
    familyContractId: 'seven-choices',
    groupId: sevenSelection.groupIds[0],
  })
  for (const option of sevenGroup.optionBank.options) {
    const optionText = canonicalInlineText(option.content)
    assert.equal(
      countTextOccurrences(text, optionText),
      1,
      `${label} renders shared-bank option ${option.label} exactly once`,
    )
  }
  for (const selection of consumption.selections
    .filter((candidate) => candidate.familyContractId === 'reading')) {
    for (const groupId of selection.groupIds) {
      const group = projectCanonicalConsumerGroup({
        consumption,
        familyContractId: 'reading',
        groupId,
      })
      for (const [blockIndex, table] of group.blocks.entries()) {
        if (table.kind !== 'table') continue
        for (const row of table.rows) {
          for (const cell of row.cells) {
            const cellText = normalizedVisibleText(cell.text)
            const terms = cellText.split(/\s+/).filter((term) => term.length > 1)
            assert.equal(terms.length > 0, true)
            for (const term of terms) {
              assert.equal(
                text.includes(term),
                true,
                `${label} retains native table cell ${cell.cellId}: ${term}`,
              )
            }
          }
        }
        const precedingText = normalizedVisibleText(
          group.blocks.slice(0, blockIndex).reverse()
            .find((block) => block.kind === 'paragraph')?.text,
        )
        assert.equal(precedingText.length > 0, true)
        const pages = markerPages(
          pdfPath,
          pageBoxes.length,
          precedingText.slice(0, 24),
        )
        assert.equal(
          pages.length,
          1,
          `${label} places native table ${table.nodeId} on one source-bound page`,
        )
        const page = pages[0]
        const svg = svgPageRectangles(
          pdfPath,
          path.join(
            outputDir,
            `.${label.replaceAll(' ', '-')}-table-${page}.svg`,
          ),
          page,
        )
        const grid = findNativeTableGrid(
          svg.rectangles,
          table.rows.length,
          table.columnCount,
        )
        assert.ok(
          grid,
          `${label} preserves the ${table.rows.length}x${table.columnCount} native table grid`,
        )
        assert.equal(
          rectangleInsideBox(grid, pageBoxes[page - 1].cropBox),
          true,
          `${label} native table grid is fully inside page ${page} CropBox`,
        )
      }
    }
  }
}

function assertPdfA4AndUnclipped(pdfPath, label) {
  const summary = execFileSync('pdfinfo', [pdfPath], { encoding: 'utf8' })
  const pageCount = Number(summary.match(/^Pages:\s+(\d+)$/m)?.[1])
  assert.equal(Number.isInteger(pageCount) && pageCount > 0, true)
  const pageInfo = execFileSync(
    'pdfinfo',
    ['-box', '-f', '1', '-l', String(pageCount), pdfPath],
    { encoding: 'utf8' },
  )
  const sizes = [...pageInfo.matchAll(
    /^Page\s+\d+\s+size:\s+([\d.]+)\s+x\s+([\d.]+)\s+pts/mg,
  )].map((match) => [Number(match[1]), Number(match[2])])
  assert.equal(sizes.length, pageCount, `${label} reports every PDF page`)
  const boxesByPage = Array.from({ length: pageCount }, (_, index) => ({
    page: index + 1,
  }))
  for (const match of pageInfo.matchAll(
    /^Page\s+(\d+)\s+(MediaBox|CropBox):\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)$/mg,
  )) {
    const page = Number(match[1])
    const key = match[2] === 'MediaBox' ? 'mediaBox' : 'cropBox'
    boxesByPage[page - 1][key] = {
      xMin: Number(match[3]),
      yMin: Number(match[4]),
      xMax: Number(match[5]),
      yMax: Number(match[6]),
    }
  }
  for (const [[width, height], boxes] of sizes.map(
    (size, index) => [size, boxesByPage[index]],
  )) {
    assert.equal(
      Math.abs(width - 594.96) <= 0.1
      && Math.abs(height - 841.92) <= 0.1,
      true,
      `${label} page is A4: ${width}x${height}`,
    )
    assert.deepEqual(
      boxes.mediaBox,
      { xMin: 0, yMin: 0, xMax: 594.96, yMax: 841.92 },
      `${label} page ${boxes.page} has an exact A4 MediaBox`,
    )
    assert.deepEqual(
      boxes.cropBox,
      boxes.mediaBox,
      `${label} page ${boxes.page} CropBox equals its MediaBox`,
    )
  }
  const bbox = execFileSync('pdftotext', ['-bbox', pdfPath, '-'], {
    encoding: 'utf8',
  })
  const bboxPages = [...bbox.matchAll(
    /<page width="([\d.-]+)" height="([\d.-]+)">([\s\S]*?)<\/page>/g,
  )]
  assert.equal(bboxPages.length, pageCount, `${label} exposes every text page`)
  for (const [index, pageMatch] of bboxPages.entries()) {
    const cropBox = boxesByPage[index].cropBox
    assert.equal(Math.abs(Number(pageMatch[1]) - cropBox.xMax) <= 0.1, true)
    assert.equal(Math.abs(Number(pageMatch[2]) - cropBox.yMax) <= 0.1, true)
    const words = [...pageMatch[3].matchAll(
      /<word xMin="([\d.-]+)" yMin="([\d.-]+)" xMax="([\d.-]+)" yMax="([\d.-]+)">/g,
    )].map((match) => match.slice(1).map(Number))
    assert.equal(words.length > 0, true, `${label} page ${index + 1} has text`)
    assert.equal(
      words.every(([xMin, yMin, xMax, yMax]) =>
        rectangleInsideBox({ xMin, yMin, xMax, yMax }, cropBox)),
      true,
      `${label} page ${index + 1} has no text outside its CropBox`,
    )
  }
  return boxesByPage
}

function assertPdfWritingResponseRegions(
  pdfPath,
  consumption,
  outputDir,
  pageBoxes,
  label,
) {
  const regions = [
    ['application-writing', 144, 65, 'Application Writing'],
    ['continuation-writing', 145, 57, 'Continuation Writing'],
  ].map(([familyContractId, widthMm, heightMm, regionName]) => {
    const selection = consumption.selections.find(
      (candidate) => candidate.familyContractId === familyContractId,
    )
    const group = projectCanonicalConsumerGroup({
      consumption,
      familyContractId,
      groupId: selection.groupIds[0],
    })
    const markerInsideRegion = familyContractId === 'application-writing'
    const marker = markerInsideRegion
      ? canonicalInlineText(group.answerRegion.givenTop[0].inlines)
      : projectedGroupTextCandidates(group)
        .find((candidate) => candidate.length >= 24).slice(0, 24)
    const pages = markerPages(pdfPath, pageBoxes.length, marker)
    assert.equal(
      pages.length,
      1,
      `${label} places ${regionName} on one source-bound page`,
    )
    return {
      familyContractId,
      widthMm,
      heightMm,
      regionName,
      marker,
      markerPage: pages[0],
      markerInsideRegion,
    }
  })
  for (const [index, region] of regions.entries()) {
    const {
      familyContractId,
      widthMm,
      heightMm,
      regionName,
      marker,
      markerPage,
      markerInsideRegion,
    } = region
    const nextRegion = regions[index + 1]
    const finalPage = nextRegion?.markerPage || pageBoxes.length
    const expectedWidth = widthMm * 72 / 25.4
    const expectedHeight = heightMm * 72 / 25.4
    const matches = []
    for (let page = markerPage; page <= finalPage; page += 1) {
      const svg = svgPageRectangles(
        pdfPath,
        path.join(
          outputDir,
          `.${label.replaceAll(' ', '-')}-${familyContractId}-${page}.svg`,
        ),
        page,
      )
      assert.equal(
        Math.abs(svg.width - pageBoxes[page - 1].cropBox.xMax) <= 0.1
        && Math.abs(svg.height - pageBoxes[page - 1].cropBox.yMax) <= 0.1
        && svg.viewBox.length === 4
        && Math.abs(svg.viewBox[2] - svg.width) <= 0.1
        && Math.abs(svg.viewBox[3] - svg.height) <= 0.1,
        true,
        `${label} page ${page} SVG viewport equals the PDF CropBox`,
      )
      matches.push(...svg.rectangles.filter(({ width, height, stroked }) =>
        stroked
        && Math.abs(width - expectedWidth) <= 2.5
        && Math.abs(height - expectedHeight) <= 2.5))
    }
    assert.equal(
      matches.length,
      1,
      `${label} preserves exactly one ${regionName} ${widthMm}x${heightMm}mm response region in its occurrence interval`,
    )
    assert.equal(
      rectangleInsideBox(matches[0], pageBoxes[matches[0].page - 1].cropBox),
      true,
      `${label} ${regionName} response region is fully inside page ${matches[0].page} CropBox`,
    )
    region.responsePage = matches[0].page
    const markerWord = marker.match(/[A-Za-z][A-Za-z'-]*/)?.[0]
    if (
      markerWord
      && !markerInsideRegion
      && matches[0].page === markerPage
    ) {
      const markerBox = firstPdfWordBox(
        pdfPath,
        markerPage,
        markerWord,
      )
      assert.equal(
        matches[0].yMin > markerBox.yMin,
        true,
        `${label} ${regionName} response region follows its source marker`,
      )
    }
    if (nextRegion && matches[0].page === nextRegion.markerPage) {
      const nextMarkerWord =
        nextRegion.marker.match(/[A-Za-z][A-Za-z'-]*/)?.[0]
      assert.ok(nextMarkerWord)
      const nextMarkerBox = firstPdfWordBox(
        pdfPath,
        nextRegion.markerPage,
        nextMarkerWord,
      )
      assert.equal(
        matches[0].yMax < nextMarkerBox.yMin,
        true,
        `${label} ${regionName} response region precedes the next writing occurrence`,
      )
    }
  }
  return regions
}

async function assertApplicationWritingDomArtifact(
  page,
  consumption,
  label,
  { surface, teacher },
) {
  const source = applicationWritingEvidence.sourceOracle
  const application = source.applicationWriting
  const following = source.followingContinuationWriting
  const applicationRoot = page.locator(
    `[data-paper-browse-anchor="${application.groupId}"], `
      + `[data-canonical-group-id="${application.groupId}"]`,
  ).first()
  const continuationRoot = page.locator(
    `[data-paper-browse-anchor="${following.groupId}"], `
      + `[data-canonical-group-id="${following.groupId}"]`,
  ).first()
  assert.equal(await applicationRoot.count(), 1, `${label} has one Application root`)
  assert.equal(await continuationRoot.count(), 1, `${label} has one Continuation root`)
  const applicationText = (await applicationRoot.innerText()).replaceAll(/\s/g, '')
  const continuationText = (await continuationRoot.innerText()).replaceAll(/\s/g, '')
  for (const { text } of [
    ...application.chrome,
    ...application.promptBlocks,
    ...application.givenParts,
  ]) {
    assert.equal(
      countTextOccurrences(applicationText, text.replaceAll(/\s/g, '')),
      1,
      `${label} renders source-bound Application text exactly once: ${text}`,
    )
  }
  for (const text of [following.sectionText, following.promptText]) {
    assert.equal(
      countTextOccurrences(continuationText, text.replaceAll(/\s/g, '')),
      1,
      `${label} renders source-bound Continuation transition exactly once: ${text}`,
    )
  }
  for (const [role, expectedCount] of [
    ['part_heading', 1],
    ['section_heading', 1],
    ['prompt_line', application.promptParagraphCount],
    ['notice_line', 1],
    ['response_box', 1],
    ['given_title', 1],
  ]) {
    assert.equal(
      await applicationRoot.locator(
        `[data-canonical-application-writing-rhythm-role="${role}"]`,
      ).count(),
      expectedCount,
      `${label} exposes ${expectedCount} ${role} occurrence(s)`,
    )
  }
  const promptBlockOrder = await applicationRoot.locator(
    '[data-canonical-application-writing-rhythm-role="prompt_line"], '
      + '[data-canonical-application-writing-rhythm-role="notice_line"]',
  ).evaluateAll((elements) =>
    elements.map((element) => ({
      tagName: element.tagName,
      blockId: element.getAttribute('data-canonical-block-id'),
    })))
  assert.deepEqual(
    promptBlockOrder,
    application.promptBlocks.map((block) => ({
      tagName: 'P',
      blockId: block.blockId,
    })),
    `${label} preserves the two source prompt paragraphs and notice as distinct ordered public blocks`,
  )
  for (const role of ['continuation_section', 'continuation_prompt']) {
    assert.equal(
      await continuationRoot.locator(
        `[data-canonical-application-writing-rhythm-role="${role}"]`,
      ).count(),
      1,
      `${label} exposes one ${role}`,
    )
  }
  const promptLineCount = await applicationRoot.locator(
    `[data-canonical-block-id="${application.promptBlocks[0].blockId}"]`,
  ).evaluate((element) => {
    const range = document.createRange()
    range.selectNodeContents(element)
    return range.getClientRects().length
  })
  assert.equal(
    promptLineCount > 1,
    true,
    `${label} renders the exact source prompt as a wrapped public paragraph`,
  )
  const response = applicationRoot.locator(
    `[data-canonical-response-slot-id="${application.response.responseSlotId}"]`,
  )
  const geometry = await response.evaluate((element) => {
    const box = element.getBoundingClientRect()
    const style = getComputedStyle(element)
    return {
      width: box.width,
      height: box.height,
      borderLeft: Number.parseFloat(style.borderLeftWidth),
      borderRight: Number.parseFloat(style.borderRightWidth),
      paddingLeft: Number.parseFloat(style.paddingLeft),
      paddingRight: Number.parseFloat(style.paddingRight),
    }
  })
  const expectedWidth = applicationWritingRhythm.responseGeometry.widthMm
    / 25.4 * 96
  const expectedHeight = applicationWritingRhythm.responseGeometry.heightMm
    / 25.4 * 96
  if (surface === 'screen') {
    const promptWidth = await applicationRoot.locator(
      `[data-canonical-block-id="${application.promptBlocks[0].blockId}"]`,
    ).evaluate((element) => element.getBoundingClientRect().width)
    const expectedScreenWidth = Math.min(expectedWidth, promptWidth)
    assert.equal(
      Math.abs(geometry.width - expectedScreenWidth) <= 1,
      true,
      `${label} preserves the standards-owned width with a usable-width cap: ${JSON.stringify({
        geometry,
        promptWidth,
        expectedScreenWidth,
      })}`,
    )
  } else {
    assert.equal(
      Math.abs(geometry.width - expectedWidth) <= 1,
      true,
      `${label} preserves 144 mm response width: ${JSON.stringify({
        geometry,
        expectedWidth,
      })}`,
    )
  }
  assert.equal(
    Math.abs(geometry.height - expectedHeight) <= 1,
    true,
    `${label} preserves 65 mm response height: ${JSON.stringify({
      geometry,
      expectedHeight,
    })}`,
  )
  const usableWidth = geometry.width
    - geometry.borderLeft
    - geometry.borderRight
    - geometry.paddingLeft
    - geometry.paddingRight
  const expectedUsableWidth = geometry.width
    - geometry.borderLeft
    - geometry.borderRight
    - (
      2 * applicationWritingRhythm.responseGeometry.paddingMm
      / 25.4 * 96
    )
  assert.equal(
    Math.abs(usableWidth - expectedUsableWidth) <= 2,
    true,
    `${label} preserves the 3 mm response insets: ${JSON.stringify({
      geometry,
      usableWidth,
      expectedUsableWidth,
    })}`,
  )
  assert.equal(
    await applicationRoot.locator(
      '[data-writing-answer-supplement], .answer, .explanation',
    ).count(),
    0,
    `${label} collapses the source-unapproved Teacher tail without leakage`,
  )
  if (surface === 'screen') {
    const writingPageOrder = await page.locator('[data-pi-writing-page]')
      .evaluateAll((pages, ids) => {
        const [applicationId, continuationId] = ids
        return pages.map((candidate) => ({
          application: candidate.querySelector(
            `[data-canonical-response-slot-id="${applicationId}"]`,
          ) !== null,
          continuation: candidate.querySelector(
            `[data-canonical-instruction-id="${continuationId}"]`,
          ) !== null,
        }))
      }, [
        application.response.responseSlotId,
        following.sectionInstructionId,
      ])
    const applicationPage = writingPageOrder.findIndex((entry) => entry.application)
    const continuationPage = writingPageOrder.findIndex((entry) => entry.continuation)
    assert.equal(applicationPage >= 0 && continuationPage > applicationPage, true)
  } else {
    const relation = await page.locator(
      `[data-canonical-group-id="${application.groupId}"], `
        + `[data-canonical-group-id="${following.groupId}"]`,
    ).evaluateAll((elements) =>
      elements.map((element) => element.getAttribute('data-canonical-group-id')))
    assert.deepEqual(relation, [application.groupId, following.groupId])
  }
  return surface === 'screen'
    ? [
        'part_to_section',
        'section_to_prompt',
        'prompt_line_internal',
        'prompt_wrapped_continuation',
        'prompt_to_notice',
        'notice_line_internal',
        'notice_to_response',
        'response_given_title_alignment',
        'response_usable_width',
        'response_usable_height',
        'student_response_to_next_section_cross_page',
        teacher
          ? 'unauthorized_teacher_tail_collapse'
          : 'student_supplement_absence_collapse',
        'continuation_section_to_prompt',
      ]
    : [
        'grammar_fill_boundary_to_part_same_page',
        'part_to_section',
        'section_to_prompt',
        'prompt_line_internal',
        'prompt_to_notice',
        'notice_line_internal',
        'notice_to_response',
        'response_given_title_alignment',
        'response_usable_width',
        'response_usable_height',
        'response_atomicity_same_page',
        teacher
          ? 'unauthorized_teacher_tail_collapse'
          : 'student_supplement_absence_collapse',
        ...(teacher ? [] : ['student_response_to_next_section_same_page']),
        'continuation_section_to_prompt',
      ]
}

function assertApplicationWritingPdfArtifact({
  pdfPath,
  consumption,
  label,
  teacher,
  responseRegions,
  pageBoxes,
}) {
  const source = applicationWritingEvidence.sourceOracle
  const preceding = source.precedingGrammarFillBoundary
  const application = source.applicationWriting
  const following = source.followingContinuationWriting
  const text = pdfText(pdfPath).replaceAll(/\s/g, '')
  for (const { text: expected } of [
    ...application.chrome,
    ...application.promptBlocks,
    ...application.givenParts,
  ]) {
    assert.equal(
      countTextOccurrences(text, expected.replaceAll(/\s/g, '')),
      1,
      `${label} retains source-bound Application text exactly once: ${expected}`,
    )
  }
  for (const expected of [following.sectionText, following.promptText]) {
    assert.equal(
      countTextOccurrences(text, expected.replaceAll(/\s/g, '')),
      1,
      `${label} retains source-bound Continuation transition exactly once: ${expected}`,
    )
  }
  const applicationOffset = text.indexOf(
    application.promptBlocks[0].text.replaceAll(/\s/g, ''),
  )
  const continuationOffset = text.indexOf(
    following.sectionText.replaceAll(/\s/g, ''),
  )
  assert.equal(applicationOffset >= 0 && continuationOffset > applicationOffset, true)
  const applicationInterval = text.slice(applicationOffset, continuationOffset)
  assert.equal(applicationInterval.includes('【答案】'), false)
  assert.equal(applicationInterval.includes('【解析】'), false)
  const applicationResponse = responseRegions.find(
    (region) => region.familyContractId === 'application-writing',
  )
  assert.ok(applicationResponse)
  const titlePage = compactMarkerPages(
    pdfPath,
    pageBoxes.length,
    application.givenParts[0].text,
  )
  assert.deepEqual(titlePage, [applicationResponse.responsePage])
  const grammarBoundaryPage = compactMarkerPages(
    pdfPath,
    pageBoxes.length,
    preceding.sectionText,
  )
  const applicationPartPage = compactMarkerPages(
    pdfPath,
    pageBoxes.length,
    application.chrome[0].text,
  )
  assert.equal(
    grammarBoundaryPage.length === 1
      && applicationPartPage.length === 1
      && grammarBoundaryPage[0] < applicationPartPage[0],
    true,
    `${label} preserves the source Grammar Fill to Application cross-page boundary`,
  )
  const applicationPromptPage = compactMarkerPages(
    pdfPath,
    pageBoxes.length,
    application.promptBlocks[0].text,
  )
  assert.deepEqual(
    applicationPromptPage,
    [applicationResponse.responsePage],
    `${label} keeps the atomic response region with its source prompt`,
  )
  const continuationPage = compactMarkerPages(
    pdfPath,
    pageBoxes.length,
    following.sectionText,
  )
  const continuationPromptPage = compactMarkerPages(
    pdfPath,
    pageBoxes.length,
    following.promptText,
  )
  assert.deepEqual(
    continuationPromptPage,
    continuationPage,
    `${label} keeps the Continuation section heading with its source prompt`,
  )
  assert.equal(
    continuationPage.length === 1
      && (
        teacher
          ? continuationPage[0] > applicationResponse.responsePage
          : continuationPage[0] === applicationResponse.responsePage
      ),
    true,
    `${label} preserves the source-bound Application-to-Continuation page relation`,
  )
  return [
    'grammar_fill_boundary_to_part_cross_page',
    'prompt_wrapped_continuation',
    'response_atomicity_same_page',
    teacher
      ? 'student_response_to_next_section_cross_page'
      : 'student_response_to_next_section_same_page',
    ...(teacher
      ? [
          'unauthorized_teacher_tail_collapse',
          'continuation_section_to_prompt',
        ]
      : []),
  ]
}

function assertApplicationWritingResponseMovePdfArtifact({
  pdfPath,
  responseRegions,
  pageBoxes,
  label,
}) {
  const source = applicationWritingEvidence.sourceOracle
  const application = source.applicationWriting
  const following = source.followingContinuationWriting
  const applicationResponse = responseRegions.find(
    (region) => region.familyContractId === 'application-writing',
  )
  assert.ok(applicationResponse)
  const promptEndPage = compactMarkerPages(
    pdfPath,
    pageBoxes.length,
    application.promptBlocks.at(-1).text,
  )
  assert.equal(
    promptEndPage.length === 1
      && applicationResponse.responsePage > promptEndPage[0],
    true,
    `${label} moves the complete response region after the source prompt leaves insufficient A4 space`,
  )
  assert.deepEqual(
    compactMarkerPages(
      pdfPath,
      pageBoxes.length,
      application.givenParts[0].text,
    ),
    [applicationResponse.responsePage],
    `${label} moves the source-given title with the atomic response region`,
  )
  const continuationSectionPage = compactMarkerPages(
    pdfPath,
    pageBoxes.length,
    following.sectionText,
  )
  assert.deepEqual(
    compactMarkerPages(
      pdfPath,
      pageBoxes.length,
      following.promptText,
    ),
    continuationSectionPage,
    `${label} keeps the following Continuation heading and prompt together`,
  )
  assert.equal(
    continuationSectionPage.length === 1
      && continuationSectionPage[0] >= applicationResponse.responsePage,
    true,
    `${label} preserves Continuation order after the moved response region`,
  )
  return ['response_atomicity_next_page']
}

function assertApplicationWritingObservedCoverage(ledger) {
  const expected = applicationWritingEvidence.coverageOracle
  assert.deepEqual(
    Object.keys(ledger).sort(),
    Object.keys(expected.requiredBundles).sort(),
    'Application Writing executes every required public artifact bundle',
  )
  for (const [bundleId, requiredEdgeIds] of Object.entries(
    expected.requiredBundles,
  )) {
    assert.deepEqual(
      [...new Set(ledger[bundleId])].sort(),
      [...requiredEdgeIds].sort(),
      `Application Writing ${bundleId} observes its exact required edge set`,
    )
  }
  assert.deepEqual(
    [...new Set(Object.values(ledger).flat())].sort(),
    [...expected.requiredEdgeIds].sort(),
    'Application Writing public Screen, Print HTML, and exact-A4 PDFs execute the complete source-authorized edge set',
  )
  return ledger
}

function listFiles(rootDir) {
  const files = []
  function visit(dir, prefix = '') {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const relativePath = path.join(prefix, entry.name)
      if (entry.isDirectory()) visit(path.join(dir, entry.name), relativePath)
      else files.push(relativePath)
    }
  }
  visit(rootDir)
  return files.sort()
}

function digestDirectorySnapshot(rootDir) {
  const entries = listFiles(rootDir).map((relativePath) => ({
    relativePath,
    sha256: sha256(readFileSync(path.join(rootDir, relativePath))),
  }))
  return sha256(Buffer.from(JSON.stringify(entries), 'utf8'))
}

async function assertServedQaArtifacts({
  qaServer,
  outputDir,
  head,
}) {
  const expectedArtifacts = {
    studentPrintHtml: {
      fileName: 'print-student.html',
      contentType: 'text/html; charset=utf-8',
    },
    teacherPrintHtml: {
      fileName: 'print-teacher.html',
      contentType: 'text/html; charset=utf-8',
    },
    studentChromiumPdf: {
      fileName: 'print-student.pdf',
      contentType: 'application/pdf',
    },
    teacherChromiumPdf: {
      fileName: 'print-teacher.pdf',
      contentType: 'application/pdf',
    },
  }
  for (const [artifactId, expected] of Object.entries(expectedArtifacts)) {
    const response = await fetch(qaServer.urls[artifactId])
    assert.equal(response.status, 200, `${artifactId} QA URL loads`)
    assert.equal(
      response.headers.get('content-type'),
      expected.contentType,
      `${artifactId} QA URL has the correct content type`,
    )
    assert.deepEqual(
      Buffer.from(await response.arrayBuffer()),
      readFileSync(path.join(outputDir, expected.fileName)),
      `${artifactId} QA URL serves the exact generated bytes`,
    )
  }
  const unknown = await fetch(`${qaServer.baseUrl}/not-an-artifact`)
  assert.equal(unknown.status, 404, 'unknown QA artifact paths fail closed')
  const traversal = await fetch(
    `${qaServer.baseUrl}/qa-artifacts/${head}/%2e%2e%2fHEAD.txt`,
  )
  assert.equal(traversal.status, 404, 'QA artifact traversal paths fail closed')
  assert.equal(
    qaServer.isListening(),
    true,
    'QA artifact server remains alive after its behavioral regression',
  )
}

async function renderSupportedArtifacts({
  dbPath,
  paperAssetsDir,
  outputDir,
  consumers,
  keepServices = false,
}) {
  mkdirSync(outputDir, { recursive: true })
  const passageLetterGeometry = {
    screenPlain: [],
    screenLecture: [],
    pdf: {},
  }
  const sevenChoicesCoverageObservations = []
  const recordSevenChoicesCoverage = (observation) => {
    sevenChoicesCoverageObservations.push(observation)
  }
  const clozeCoverageObservations = []
  const grammarFillCoverageObservations = []
  const grammarFillPoisonRejections = []
  const applicationWritingCoverageLedger = {}
  const asset = JSON.parse(readFileSync(
    path.join(paperAssetsDir, paperId, 'latest', 'paper-asset.json'),
    'utf8',
  ))
  const userDbPath = path.join(path.dirname(dbPath), 'user-data.sqlite')
  const forbiddenToolDir = path.join(path.dirname(dbPath), 'forbidden-output-tools')
  const forbiddenToolMarker = path.join(
    path.dirname(dbPath),
    'forbidden-output-tool-called.txt',
  )
  mkdirSync(forbiddenToolDir, { recursive: true })
  for (const toolName of ['libreoffice', 'soffice']) {
    const toolPath = path.join(forbiddenToolDir, toolName)
    writeFileSync(
      toolPath,
      `#!/bin/sh\nprintf '%s\\n' '${toolName}' >> '${forbiddenToolMarker}'\nexit 97\n`,
    )
    chmodSync(toolPath, 0o755)
  }
  const port = await availablePort()
  const baseUrl = `http://127.0.0.1:${port}`
  const api = spawn('node', ['server/api.mjs'], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      QUESTION_BANK_API_PORT: String(port),
      QUESTION_BANK_DB: dbPath,
      QUESTION_BANK_PAPER_ASSET_ROOT: paperAssetsDir,
      QUESTION_BANK_USER_SPACE_ROOT: path.join(
        path.dirname(dbPath),
        'user-space',
      ),
      USER_DATA_DB: userDbPath,
      PATH: `${forbiddenToolDir}:${process.env.PATH || ''}`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  api.output = ''
  api.stdout.on('data', (chunk) => { api.output += chunk.toString() })
  api.stderr.on('data', (chunk) => { api.output += chunk.toString() })

  let viteServer = null
  let completed = false
  const closeServices = async () => {
    if (viteServer) {
      await viteServer.close()
      viteServer = null
    }
    if (api.exitCode === null) await stopChild(api)
  }
  try {
    await waitForHttp(`${baseUrl}/api/health`, api)
    const draft = seedDraftRows(userDbPath, asset)
    const vite = await import('../app/node_modules/vite/dist/node/index.js')
    viteServer = await vite.createServer({
      root: path.join(repositoryRoot, 'app'),
      server: {
        host: '127.0.0.1',
        port: 0,
        proxy: {
          '/api': baseUrl,
          '/paper-assets': baseUrl,
          '/user-space': baseUrl,
        },
      },
    })
    await viteServer.listen()
    const appUrl = viteServer.resolvedUrls?.local?.[0]
    assert.ok(appUrl, 'Vite exposes the real PaperBrowse pilot route')

    const playwright = await import('../app/node_modules/playwright/index.js')
    const browser = await playwright.default.chromium.launch({ headless: true })
    try {
      const page = await browser.newPage({
        viewport: { width: 1280, height: 900 },
      })
      const plainUrl = new URL('canonical-consumption-qa.html', appUrl)
      plainUrl.searchParams.set('paperId', paperId)
      await page.goto(plainUrl.href)
      await page.locator('[data-paper-browse-anchor]').first().waitFor()
      for (const group of draft.activeGroups) {
        assert.equal(
          await page.locator(
            `[data-paper-browse-anchor="${group.groupId}"]`,
          ).count(),
          1,
          `plain PaperSurface renders ${group.groupId} once`,
        )
      }
      for (const group of Object.values(asset.content.groups)
        .filter((candidate) => candidate.groupType !== 'reading')) {
        assert.equal(
          await page.locator(
            `[data-paper-browse-anchor="${group.groupId}"] [data-canonical-reading-rhythm-role]`,
          ).count(),
          0,
          `plain PaperSurface exposes no Reading rhythm roles in ${group.groupId}`,
        )
      }
      for (const group of Object.values(asset.content.groups)
        .filter((candidate) => candidate.groupType === 'listening')) {
        assert.equal(
          await page.locator(
            `[data-paper-browse-anchor="${group.groupId}"]`,
          ).count(),
          0,
          `PaperSurface exposes zero Listening occurrence for ${group.groupId}`,
        )
      }
      assert.equal(
        await page.locator('.paper-browse-answer-row').count(),
        0,
        'plain PaperSurface hides official answers',
      )
      const plainHtml = await page.content()
      assertPassageLetterMarkup(
        plainHtml,
        consumers.screen,
        'screen',
        'plain PaperSurface',
      )
      passageLetterGeometry.screenPlain =
        await measureScreenPassageLetterGeometry(
          page,
          consumers.screen,
          'plain PaperSurface',
        )
      await assertScreenReadingVerticalRhythm(
        page,
        consumers.screen,
        'plain PaperSurface',
      )
      await assertScreenSevenChoicesGoldenGeometry(
        page,
        'plain PaperSurface Seven Choices',
        {
          bundleId: 'screen-plain',
          variant: 'plain-baseline',
          recordCoverage: recordSevenChoicesCoverage,
        },
      )
      const plainClozeObservation = await assertClozeDomGeometry(
        page,
        'plain PaperSurface Cloze',
      )
      recordClozeBundleCoverage(clozeCoverageObservations, {
        bundleId: 'screen-plain',
        variant: 'plain-baseline',
        proof: plainClozeObservation,
      })
      const plainGrammarFillObservation =
        await assertGrammarFillDomGeometry(
          page,
          'plain PaperSurface Grammar Fill',
        )
      recordGrammarFillBundleCoverage(grammarFillCoverageObservations, {
        bundleId: 'screen-plain',
        variant: 'plain-baseline',
        proof: plainGrammarFillObservation,
      })
      applicationWritingCoverageLedger.screen_plain =
        await assertApplicationWritingDomArtifact(
          page,
          consumers.screen,
          'plain PaperSurface Application Writing',
          { surface: 'screen', teacher: false },
        )
      const screenClozeWrapped = clozeVariantConsumption(
        consumers.screen,
        {
          wrappedOptionRepeats:
            clozeSourceOracle.oracle.variants.wrappedOption.repeatCount,
        },
      )
      const screenGrammarFillWrapped = grammarFillVariantConsumption(
        screenClozeWrapped.consumption,
        {
          wrappedPrefixRepeats:
            grammarFillPublicAdversaryOracle.oracle
              .wrappedLineAndLineEnd.wrappedPrefixRepeats,
        },
      )
      const screenConsumptionRoute =
        '**/api/paper-canonical/consumption?**'
      const screenConsumptionHandler = async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(screenGrammarFillWrapped.consumption),
        })
      }
      await page.route(screenConsumptionRoute, screenConsumptionHandler)
      try {
        const wrappedUrl = new URL(plainUrl)
        wrappedUrl.searchParams.set(
          'clozeProducerVariant',
          'source-derived-wrapped-option',
        )
        wrappedUrl.searchParams.set(
          'grammarFillGeometryVariant',
          grammarFillPublicAdversaryOracle.oracle
            .wrappedLineAndLineEnd.screenGeometryVariantId,
        )
        await page.goto(wrappedUrl.href)
        await page.locator('[data-paper-browse-anchor]').first().waitFor()
        const plainClozeWrappedObservation = await assertClozeDomGeometry(
          page,
          'plain PaperSurface Cloze wrapped-option adversary',
          {
            wrappedOption: true,
            expectedRows: screenClozeWrapped.expectedRows,
            expectedPassageTexts:
              screenClozeWrapped.expectedPassageTexts,
          },
        )
        recordClozeBundleCoverage(clozeCoverageObservations, {
          bundleId: 'screen-plain',
          variant: 'plain-wrapped-option',
          proof: plainClozeWrappedObservation,
        })
        const plainGrammarFillWrappedObservation =
          await assertGrammarFillDomGeometry(
            page,
            'plain PaperSurface Grammar Fill wrapped-line adversary',
            {
              requireWrappedLine: true,
              requireLineEndBlank: true,
              observeFollowingTransition: false,
              expectedPassageTexts:
                screenGrammarFillWrapped.expectedPassageTexts,
            },
          )
        recordGrammarFillBundleCoverage(grammarFillCoverageObservations, {
          bundleId: 'screen-plain',
          variant: 'plain-wrapped-line',
          proof: plainGrammarFillWrappedObservation,
        })
      } finally {
        await page.unroute(
          screenConsumptionRoute,
          screenConsumptionHandler,
        )
      }
      const runScreenFixturePlanAttack = async ({
        caseId,
        responseStatus = 200,
        responseBody,
      }) => {
        const routeHandler = async (route) => {
          await route.fulfill({
            status: responseStatus,
            contentType: 'application/json',
            body: JSON.stringify(responseBody),
          })
        }
        await page.route(screenConsumptionRoute, routeHandler)
        try {
          const attackUrl = new URL(plainUrl)
          attackUrl.searchParams.set(
            'grammarFillGeometryVariant',
            grammarFillPublicAdversaryOracle.oracle
              .wrappedLineAndLineEnd.screenGeometryVariantId,
          )
          attackUrl.searchParams.set('fixturePlanAttack', caseId)
          await page.goto(attackUrl.href)
          await page.waitForLoadState('domcontentloaded')
          assert.equal(
            await page.locator(
              '[data-canonical-grammar-fill-geometry-fixture]',
            ).count(),
            0,
            `Screen ${caseId} emits no geometry fixture`,
          )
          assert.equal(
            await page.locator(
              '[data-paper-browse-anchor="group-2026-i-grammar-fill"]',
            ).count(),
            0,
            `Screen ${caseId} emits no partial Grammar Fill artifact`,
          )
        } finally {
          await page.unroute(screenConsumptionRoute, routeHandler)
        }
      }
      await runScreenFixturePlanAttack({
        caseId: 'absent-consumption-plan',
        responseStatus: 404,
        responseBody: { error: 'Consumption Plan unavailable' },
      })
      const historicalScreenFixturePlan =
        structuredClone(screenGrammarFillWrapped.consumption)
      historicalScreenFixturePlan.authorityRef = {
        manifestId: manifestV17.manifestId,
        manifestVersion: manifestV17.version,
        manifestDigest: digestJson(manifestV17),
      }
      await runScreenFixturePlanAttack({
        caseId: 'historical-consumption-plan',
        responseBody: historicalScreenFixturePlan,
      })
      const mismatchedScreenFixturePlan =
        structuredClone(screenGrammarFillWrapped.consumption)
      mismatchedScreenFixturePlan.consumerContractRef =
        consumerContractRefs.print_pdf
      await runScreenFixturePlanAttack({
        caseId: 'mismatched-consumer-contract',
        responseBody: mismatchedScreenFixturePlan,
      })
      const refsOnlyScreenFixturePlan = structuredClone(
        screenGrammarFillWrapped.consumption,
      )
      refsOnlyScreenFixturePlan.selections = [
        {
          familyContractId: 'grammar-fill',
          mode: 'canonical',
          groupIds: ['group-2026-i-grammar-fill'],
        },
      ]
      await runScreenFixturePlanAttack({
        caseId: 'refs-only-consumption-plan',
        responseBody: refsOnlyScreenFixturePlan,
      })
      const mismatchedOccurrenceScreenFixturePlan = structuredClone(
        screenGrammarFillWrapped.consumption,
      )
      mismatchedOccurrenceScreenFixturePlan.selections.find(
        (candidate) => candidate.familyContractId === 'grammar-fill',
      ).projectedOccurrenceDigests[0].digest =
        'sha256:0000000000000000000000000000000000000000000000000000000000000000'
      await runScreenFixturePlanAttack({
        caseId: 'mismatched-occurrence-consumption-plan',
        responseBody: mismatchedOccurrenceScreenFixturePlan,
      })
      await page.goto(plainUrl.href)
      await page.locator('[data-paper-browse-anchor]').first().waitFor()
      const runScreenSourceAssetAttack = async ({
        name,
        mutate,
        expectRejected = false,
      }) => {
        const attackedAsset = structuredClone(asset)
        mutate(attackedAsset)
        const routePattern = '**/paper-asset.json'
        const routeHandler = async (route) => {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(attackedAsset),
          })
        }
        await page.route(routePattern, routeHandler)
        try {
          const attackUrl = new URL(plainUrl)
          attackUrl.searchParams.set('sourceAttack', name)
          await page.goto(attackUrl.href)
          if (expectRejected) {
            const errorText = await page.locator(
              '.paper-browse-error p',
            ).textContent()
            assert.match(
              errorText || '',
              /Seven Choices Group occurs more than once|Cloze Group occurs more than once|Consumption Plan Group is absent|asset Group is missing|Rendered canonical writing Group order is invalid/,
              `Screen rejects ${name} before rendering a partial public artifact`,
            )
            assert.equal(
              await page.locator(
                '[data-canonical-bank-id]',
              ).count(),
              0,
              `Screen ${name} emits zero partial Seven Choices bank`,
            )
            assert.equal(
              await page.locator(
                '[data-canonical-group-type="cloze"]',
              ).count(),
              0,
              `Screen ${name} emits zero partial Cloze artifact`,
            )
          } else {
            await page.locator('[data-paper-browse-anchor]').first().waitFor()
            await assertScreenSevenChoicesGoldenGeometry(
              page,
              `plain PaperSurface ${name}`,
            )
          }
        } finally {
          await page.unroute(routePattern, routeHandler)
        }
      }
      await runScreenSourceAssetAttack({
        name: 'source-text-drift-adversary',
        mutate: (attackedAsset) => {
          const group = attackedAsset.content.groups[
            sevenChoicesSourceOracle.oracle.publicIdentities
              .sevenChoices.groupId
          ]
          group.passage.paragraphs[0].text =
            'POISONED PUBLIC SOURCE PASSAGE __36__'
          group.optionBank[0].text = 'POISONED PUBLIC SOURCE OPTION'
        },
      })
      await runScreenSourceAssetAttack({
        name: 'duplicate-seven-choices-group-adversary',
        expectRejected: true,
        mutate: (attackedAsset) => {
          const groupId =
            sevenChoicesSourceOracle.oracle.publicIdentities
              .sevenChoices.groupId
          const groupIndex = attackedAsset.content.blocks.findIndex(
            (block) => block.type === 'group' && block.groupId === groupId,
          )
          attackedAsset.content.blocks.splice(
            groupIndex + 1,
            0,
            structuredClone(attackedAsset.content.blocks[groupIndex]),
          )
        },
      })
      await runScreenSourceAssetAttack({
        name: 'missing-seven-choices-group-adversary',
        expectRejected: true,
        mutate: (attackedAsset) => {
          const groupId =
            sevenChoicesSourceOracle.oracle.publicIdentities
              .sevenChoices.groupId
          attackedAsset.content.blocks = attackedAsset.content.blocks.filter(
            (block) => block.type !== 'group' || block.groupId !== groupId,
          )
        },
      })
      await runScreenSourceAssetAttack({
        name: 'wrong-seven-choices-group-adversary',
        expectRejected: true,
        mutate: (attackedAsset) => {
          const groupId =
            sevenChoicesSourceOracle.oracle.publicIdentities
              .sevenChoices.groupId
          const block = attackedAsset.content.blocks.find(
            (candidate) =>
              candidate.type === 'group' && candidate.groupId === groupId,
          )
          block.groupId = 'group-poisoned-seven-choices'
        },
      })
      await runScreenSourceAssetAttack({
        name: 'duplicate-cloze-group-adversary',
        expectRejected: true,
        mutate: (attackedAsset) => {
          const groupId =
            clozeSourceOracle.oracle.publicIdentities.cloze.groupId
          const groupIndex = attackedAsset.content.blocks.findIndex(
            (block) => block.type === 'group' && block.groupId === groupId,
          )
          attackedAsset.content.blocks.splice(
            groupIndex + 1,
            0,
            structuredClone(attackedAsset.content.blocks[groupIndex]),
          )
        },
      })
      await runScreenSourceAssetAttack({
        name: 'missing-cloze-group-adversary',
        expectRejected: true,
        mutate: (attackedAsset) => {
          const groupId =
            clozeSourceOracle.oracle.publicIdentities.cloze.groupId
          attackedAsset.content.blocks = attackedAsset.content.blocks.filter(
            (block) => block.type !== 'group' || block.groupId !== groupId,
          )
        },
      })
      await runScreenSourceAssetAttack({
        name: 'wrong-cloze-group-adversary',
        expectRejected: true,
        mutate: (attackedAsset) => {
          const groupId =
            clozeSourceOracle.oracle.publicIdentities.cloze.groupId
          const block = attackedAsset.content.blocks.find(
            (candidate) =>
              candidate.type === 'group' && candidate.groupId === groupId,
          )
          block.groupId = 'group-poisoned-cloze'
        },
      })
      await page.goto(plainUrl.href)
      await page.locator('[data-paper-browse-anchor]').first().waitFor()
      const plainSevenWrappedStyle = await page.addStyleTag({
        content: '.ps-option-bank{width:260px!important}',
      })
      await assertScreenSevenChoicesGoldenGeometry(
        page,
        'plain PaperSurface Seven Choices wrapped-option adversary',
        {
          wrappedOption: true,
          bundleId: 'screen-plain',
          variant: 'plain-wrapped-option',
          recordCoverage: recordSevenChoicesCoverage,
        },
      )
      await plainSevenWrappedStyle.evaluate((element) => element.remove())
      const sevenHeadingUrl = new URL(plainUrl)
      sevenHeadingUrl.searchParams.set(
        'sevenChoicesBankHeading',
        'present',
      )
      await page.goto(sevenHeadingUrl.href)
      await page.locator(
        '[data-canonical-seven-choices-rhythm-role="bank_heading"]',
      ).waitFor()
      await assertScreenSevenChoicesGoldenGeometry(
        page,
        'plain PaperSurface Seven Choices bank-heading-present fixture',
        {
          headingPresent: true,
          bundleId: 'screen-plain',
          variant: 'plain-bank-heading',
          recordCoverage: recordSevenChoicesCoverage,
        },
      )
      await page.goto(plainUrl.href)
      await page.locator('[data-paper-browse-anchor]').first().waitFor()
      const plainNarrowStemStyle = await page.addStyleTag({
        content: `[data-canonical-question-id="${draft.firstGroup.questionIds[0]}"] .ps-question-stem{max-width:240px}`,
      })
      await assertScreenReadingVerticalRhythm(
        page,
        consumers.screen,
        'plain PaperSurface narrow-stem variant',
        { requireFullVariants: true },
      )
      await plainNarrowStemStyle.evaluate((element) => element.remove())
      const plainWrappedOptionStyle = await page.addStyleTag({
        content: '.ps-option-list--one_column{width:240px!important;grid-template-columns:240px!important}',
      })
      await assertScreenReadingVerticalRhythm(
        page,
        consumers.screen,
        'plain PaperSurface wrapped-option variant',
        { requireWrappedOption: true },
      )
      await plainWrappedOptionStyle.evaluate((element) => element.remove())
      assert.equal(
        await page.locator('.paper-browse-lecture-analysis').count(),
        0,
        'plain PaperSurface hides the lecture teaching panel',
      )
      writeFileSync(path.join(outputDir, 'screen-plain.html'), plainHtml)
      await page.screenshot({
        path: path.join(outputDir, 'screen-plain.png'),
        fullPage: true,
      })

      const firstQuestionId = draft.firstGroup.questionIds[0]
      const lectureUrl = new URL(plainUrl)
      lectureUrl.searchParams.set('lecture', '1')
      lectureUrl.searchParams.set('focusGroupId', draft.firstGroup.groupId)
      lectureUrl.searchParams.set('questionId', firstQuestionId)
      await page.goto(lectureUrl.href)
      await page.locator('.paper-browse-answer-row').waitFor()
      for (const group of draft.activeGroups) {
        assert.equal(
          await page.locator(
            `[data-paper-browse-anchor="${group.groupId}"]`,
          ).count(),
          1,
          `lecture PaperSurface renders ${group.groupId} once`,
        )
      }
      assert.equal(
        await page.locator('.paper-browse-answer-row').count(),
        1,
        'lecture PaperSurface exposes the selected official answer',
      )
      const lectureHtml = await page.content()
      assertPassageLetterMarkup(
        lectureHtml,
        consumers.screen,
        'screen',
        'lecture PaperSurface',
      )
      passageLetterGeometry.screenLecture =
        await measureScreenPassageLetterGeometry(
          page,
          consumers.screen,
          'lecture PaperSurface',
        )
      await assertScreenReadingVerticalRhythm(
        page,
        consumers.screen,
        'lecture PaperSurface',
      )
      await assertScreenSevenChoicesGoldenGeometry(
        page,
        'lecture PaperSurface Seven Choices',
        {
          bundleId: 'screen-lecture',
          variant: 'lecture-baseline',
          recordCoverage: recordSevenChoicesCoverage,
        },
      )
      const lectureClozeObservation = await assertClozeDomGeometry(
        page,
        'lecture PaperSurface Cloze',
      )
      recordClozeBundleCoverage(clozeCoverageObservations, {
        bundleId: 'screen-lecture',
        variant: 'lecture-baseline',
        proof: lectureClozeObservation,
      })
      const lectureGrammarFillObservation =
        await assertGrammarFillDomGeometry(
          page,
          'lecture PaperSurface Grammar Fill',
        )
      recordGrammarFillBundleCoverage(grammarFillCoverageObservations, {
        bundleId: 'screen-lecture',
        variant: 'lecture-baseline',
        proof: lectureGrammarFillObservation,
      })
      applicationWritingCoverageLedger.screen_lecture =
        await assertApplicationWritingDomArtifact(
          page,
          consumers.screen,
          'lecture PaperSurface Application Writing',
          { surface: 'screen', teacher: true },
        )
      const screenGrammarFillLectureWrapped =
        grammarFillVariantConsumption(
          screenClozeWrapped.consumption,
          {
            wrappedPrefixRepeats:
              grammarFillPublicAdversaryOracle.oracle
                .wrappedLineAndLineEnd.wrappedPrefixRepeats,
          },
        )
      const screenLectureConsumptionHandler = async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            screenGrammarFillLectureWrapped.consumption,
          ),
        })
      }
      await page.route(
        screenConsumptionRoute,
        screenLectureConsumptionHandler,
      )
      try {
        const wrappedLectureUrl = new URL(lectureUrl)
        wrappedLectureUrl.searchParams.set(
          'clozeProducerVariant',
          'source-derived-wrapped-option',
        )
        wrappedLectureUrl.searchParams.set(
          'grammarFillGeometryVariant',
          grammarFillPublicAdversaryOracle.oracle
            .wrappedLineAndLineEnd.screenGeometryVariantId,
        )
        await page.goto(wrappedLectureUrl.href)
        await page.locator('[data-paper-browse-anchor]').first().waitFor()
        const lectureClozeWrappedObservation = await assertClozeDomGeometry(
          page,
          'lecture PaperSurface Cloze wrapped-option adversary',
          {
            wrappedOption: true,
            expectedRows: screenClozeWrapped.expectedRows,
            expectedPassageTexts:
              screenClozeWrapped.expectedPassageTexts,
          },
        )
        recordClozeBundleCoverage(clozeCoverageObservations, {
          bundleId: 'screen-lecture',
          variant: 'lecture-wrapped-option',
          proof: lectureClozeWrappedObservation,
        })
        const lectureGrammarFillWrappedObservation =
          await assertGrammarFillDomGeometry(
            page,
            'lecture PaperSurface Grammar Fill wrapped-line adversary',
            {
              requireWrappedLine: true,
              requireLineEndBlank: true,
              observeFollowingTransition: false,
              expectedPassageTexts:
                screenGrammarFillLectureWrapped.expectedPassageTexts,
            },
          )
        recordGrammarFillBundleCoverage(grammarFillCoverageObservations, {
          bundleId: 'screen-lecture',
          variant: 'lecture-wrapped-line',
          proof: lectureGrammarFillWrappedObservation,
        })
      } finally {
        await page.unroute(
          screenConsumptionRoute,
          screenLectureConsumptionHandler,
        )
      }
      await page.goto(lectureUrl.href)
      await page.locator('[data-paper-browse-anchor]').first().waitFor()
      const lectureSevenWrappedStyle = await page.addStyleTag({
        content: '.ps-option-bank{width:260px!important}',
      })
      await assertScreenSevenChoicesGoldenGeometry(
        page,
        'lecture PaperSurface Seven Choices wrapped-option adversary',
        {
          wrappedOption: true,
          bundleId: 'screen-lecture',
          variant: 'lecture-wrapped-option',
          recordCoverage: recordSevenChoicesCoverage,
        },
      )
      await lectureSevenWrappedStyle.evaluate((element) => element.remove())
      const lectureSevenHeadingUrl = new URL(lectureUrl)
      lectureSevenHeadingUrl.searchParams.set(
        'sevenChoicesBankHeading',
        'present',
      )
      await page.goto(lectureSevenHeadingUrl.href)
      await page.locator(
        '[data-canonical-seven-choices-rhythm-role="bank_heading"]',
      ).waitFor()
      await assertScreenSevenChoicesGoldenGeometry(
        page,
        'lecture PaperSurface Seven Choices bank-heading-present fixture',
        {
          headingPresent: true,
          bundleId: 'screen-lecture',
          variant: 'lecture-bank-heading',
          recordCoverage: recordSevenChoicesCoverage,
        },
      )
      await page.goto(lectureUrl.href)
      await page.locator('[data-paper-browse-anchor]').first().waitFor()
      const lectureNarrowStemStyle = await page.addStyleTag({
        content: `[data-canonical-question-id="${firstQuestionId}"] .ps-question-stem{max-width:240px}`,
      })
      await assertScreenReadingVerticalRhythm(
        page,
        consumers.screen,
        'lecture PaperSurface narrow-stem variant',
        { requireFullVariants: true },
      )
      await lectureNarrowStemStyle.evaluate((element) => element.remove())
      const lectureWrappedOptionStyle = await page.addStyleTag({
        content: '.ps-option-list--one_column{width:240px!important;grid-template-columns:240px!important}',
      })
      await assertScreenReadingVerticalRhythm(
        page,
        consumers.screen,
        'lecture PaperSurface wrapped-option variant',
        { requireWrappedOption: true },
      )
      await lectureWrappedOptionStyle.evaluate((element) => element.remove())
      assert.equal(
        await page.locator('.paper-browse-lecture-analysis').count(),
        1,
        'lecture PaperSurface exposes one teaching panel',
      )
      assert.deepEqual(
        structuralArtifactIdentity(plainHtml),
        structuralArtifactIdentity(lectureHtml),
        'plain/lecture PaperSurface retains identical canonical structure',
      )
      const screenSignatures = new Set(attributeSignatures(plainHtml))
      assertExactRenderedSignatures(
        plainHtml,
        consumers.screen,
        'PaperSurface',
      )
      assertArtifactContainsCanonicalIdentity(
        plainHtml,
        expectedCanonicalIdentity(consumers.screen),
        'PaperSurface',
      )
      const groupOrder = expectedGroupOrder(asset)
      const screenGroupTops = []
      for (const groupId of groupOrder) {
        const box = await page.locator(
          `[data-paper-browse-anchor="${groupId}"]`,
        ).boundingBox()
        assert.ok(box, `PaperSurface exposes ${groupId} geometry`)
        screenGroupTops.push(box.y)
      }
      assert.equal(
        screenGroupTops.every(
          (top, index) => index === 0 || top >= screenGroupTops[index - 1],
        ),
        true,
        'PaperSurface preserves whole-paper Group order',
      )
      assert.equal(
        await page.locator('[data-canonical-answer-region-ref]').count(),
        2,
        'PaperSurface exposes the two canonical writing response regions',
      )
      writeFileSync(path.join(outputDir, 'screen-lecture.html'), lectureHtml)
      await page.screenshot({
        path: path.join(outputDir, 'screen-lecture.png'),
        fullPage: true,
      })

      const publicAssetPath = path.join(
        paperAssetsDir,
        paperId,
        'latest',
        'paper-asset.json',
      )
      let printInstructionVariantHtml = null
      const publicAssetBytes = readFileSync(publicAssetPath)
      const instructionVariantAsset = JSON.parse(publicAssetBytes)
      const firstReadingBlockIndex =
        instructionVariantAsset.content.blocks.findIndex(
          (block) =>
            block.type === 'group'
            && block.groupId
              === readingPredecessorOracle.screen[0].groupId,
        )
      instructionVariantAsset.content.blocks.splice(
        firstReadingBlockIndex,
        0,
        {
          type: 'instruction',
          text: '阅读下列短文，从每题所给的 A、B、C、D 四个选项中选出最佳选项。',
        },
      )
      try {
        writeFileSync(
          publicAssetPath,
          `${JSON.stringify(instructionVariantAsset, null, 2)}\n`,
        )
        for (const variantMode of ['plain', 'lecture']) {
          const instructionUrl = new URL(
            variantMode === 'plain' ? plainUrl : lectureUrl,
          )
          instructionUrl.searchParams.set(
            'rhythmVariant',
            `instruction-present-${variantMode}`,
          )
          await page.goto(instructionUrl.href)
          await page.locator(
            '[data-canonical-reading-rhythm-role="meta_instruction"]',
          ).waitFor()
          assert.equal(
            await page.locator(
              '[data-canonical-reading-rhythm-role="meta_instruction"]',
            ).count(),
            1,
            `${variantMode} PaperSurface instruction-present fixture exposes one exact instruction role`,
          )
          await assertScreenReadingVerticalRhythm(
            page,
            consumers.screen,
            `${variantMode} PaperSurface instruction-present fixture`,
          )
        }
      } finally {
        writeFileSync(publicAssetPath, publicAssetBytes)
      }
      const latestClozePoison = JSON.parse(publicAssetBytes)
      const latestClozePart = latestClozePoison.content.blocks.find(
        (block) =>
          block.type === 'partHeading'
          && block.partId === 'part-2026-i-language',
      )
      assert.ok(latestClozePart)
      latestClozePart.text = 'POISONED MUTABLE LATEST CLOZE CHROME'
      try {
        writeFileSync(
          publicAssetPath,
          `${JSON.stringify(latestClozePoison, null, 2)}\n`,
        )
        const immutableChromeResponse = await fetch(
          `${baseUrl}/api/draft-papers/${draft.draftPaperId}/print-html?versionType=student`,
        )
        const immutableChromeHtml = await immutableChromeResponse.text()
        assert.equal(
          immutableChromeResponse.status,
          200,
          `Print producer ignores mutable latest Cloze chrome: ${immutableChromeHtml}`,
        )
        assert.equal(
          immutableChromeHtml.includes(
            clozeSourceOracle.oracle.publicVisibleChrome.part,
          ),
          true,
          'Print producer reads Cloze chrome from its immutable Publication-bound source asset',
        )
        assert.equal(
          immutableChromeHtml.includes(latestClozePart.text),
          false,
          'mutable latest Cloze chrome cannot enter a public Print artifact',
        )
      } finally {
        writeFileSync(publicAssetPath, publicAssetBytes)
      }
      const immutableClozeAssetPath = path.join(
        paperAssetsDir,
        paperId,
        'versions',
        `v${consumers.print_pdf.sourceAssetVersion}`,
        'paper-asset.json',
      )
      const immutableClozeAssetBytes = readFileSync(
        immutableClozeAssetPath,
      )
      const immutableClozePoison = JSON.parse(immutableClozeAssetBytes)
      immutableClozePoison.content.blocks.find(
        (block) =>
          block.type === 'partHeading'
          && block.partId === 'part-2026-i-language',
      ).text = 'POISONED IMMUTABLE CLOZE CHROME'
      try {
        writeFileSync(
          immutableClozeAssetPath,
          `${JSON.stringify(immutableClozePoison, null, 2)}\n`,
        )
        const rejectedChromeResponse = await fetch(
          `${baseUrl}/api/draft-papers/${draft.draftPaperId}/print-html?versionType=student`,
        )
        assert.notEqual(
          rejectedChromeResponse.status,
          200,
          'Print producer fails closed before rendering digest-drifted immutable Cloze chrome',
        )
        assert.match(
          await rejectedChromeResponse.text(),
          /Canonical Cloze chrome immutable source digest disagrees/,
        )
      } finally {
        writeFileSync(
          immutableClozeAssetPath,
          immutableClozeAssetBytes,
        )
      }
      const readingVariantItems = readingPdfRoleOracle.readingGroups
        .map(({ groupId }) => readingPrintVariantItem(asset, groupId))
      printInstructionVariantHtml = buildPrintHtml({
        title: 'Canonical Import Pilot Reading Rhythm Variant',
        versionType: 'student',
        items: readingVariantItems,
        blocks: [
          {
            type: 'section_header',
            title: readingPdfRoleOracle.chrome.partTitleVisibleText,
          },
          {
            type: 'instruction',
            text: readingPdfRoleOracle.chrome.instructionVisibleText,
          },
          ...readingPdfRoleOracle.readingGroups.map(({ groupId }) => ({
            type: 'question_group',
            questionGroupId: groupId,
            score: 2.5,
          })),
          {
            type: 'section_header',
            title: readingPdfRoleOracle.readingEnd.nextSectionVisibleText,
          },
        ],
        questionNumberStart: 3,
        printStyle: 'exam',
        canonicalConsumption: consumers.print_pdf,
      })
      assert.equal(
        printInstructionVariantHtml.includes(
          'data-canonical-reading-rhythm-role="meta_instruction"',
        ),
        true,
        'Student Print instruction variant comes from the real canonical renderer',
      )
      await page.goto(lectureUrl.href)
      await page.locator('.paper-browse-answer-row').waitFor()

      const printHtml = {}
      const pdfPaths = {}
      const pdfRhythmEvidence = []
      for (const versionType of ['student', 'teacher']) {
        const htmlResponse = await fetch(
          `${baseUrl}/api/draft-papers/${draft.draftPaperId}/print-html?versionType=${versionType}`,
        )
        assert.equal(htmlResponse.status, 200)
        printHtml[versionType] = await htmlResponse.text()
        writeFileSync(
          path.join(outputDir, `print-${versionType}.html`),
          printHtml[versionType],
        )

        const pdfResponse = await fetch(
          `${baseUrl}/api/draft-papers/${draft.draftPaperId}/print-pdf`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ versionType }),
            signal: AbortSignal.timeout(60_000),
          },
        )
        const pdfBytes = Buffer.from(await pdfResponse.arrayBuffer())
        assert.equal(
          pdfResponse.status,
          200,
          `PDF render failed: ${pdfBytes.toString('utf8')}`,
        )
        assert.equal(pdfBytes.subarray(0, 4).toString(), '%PDF')
        pdfPaths[versionType] = path.join(
          outputDir,
          `print-${versionType}.pdf`,
        )
        writeFileSync(pdfPaths[versionType], pdfBytes)
      }
      await assertPrintHtmlReadingVerticalRhythm(
        page,
        printHtml.student,
        consumers.print_pdf,
        'Student Print HTML',
      )
      await assertPrintHtmlReadingVerticalRhythm(
        page,
        printHtml.teacher,
        consumers.print_pdf,
        'Teacher Print HTML',
      )
      await page.setContent(printHtml.student, { waitUntil: 'load' })
      applicationWritingCoverageLedger.student_print_html =
        await assertApplicationWritingDomArtifact(
          page,
          consumers.print_pdf,
          'Student Print HTML Application Writing',
          { surface: 'printHtml', teacher: false },
        )
      const studentPrintClozeObservation = await assertClozeDomGeometry(
        page,
        'Student Print HTML Cloze',
      )
      recordClozeBundleCoverage(clozeCoverageObservations, {
        bundleId: 'print-html-student',
        variant: 'student-baseline',
        proof: studentPrintClozeObservation,
      })
      const studentPrintGrammarFillObservation =
        await assertGrammarFillDomGeometry(
          page,
          'Student Print HTML Grammar Fill',
          { surface: 'printHtml' },
        )
      recordGrammarFillBundleCoverage(grammarFillCoverageObservations, {
        bundleId: 'print-html-student',
        variant: 'student-baseline',
        proof: studentPrintGrammarFillObservation,
      })
      const printClozeWrapped = clozeVariantConsumption(
        consumers.print_pdf,
        {
          wrappedOptionRepeats:
            clozeSourceOracle.oracle.variants.wrappedOption.repeatCount,
        },
      )
      const clozePublicVariantBlocks = [
        {
          type: 'question_group',
          questionGroupId:
            sevenChoicesSourceOracle.oracle.publicIdentities.sevenChoices
              .groupId,
          score: 2.5,
        },
        {
          type: 'section_header',
          title: clozeSourceOracle.oracle.publicVisibleChrome.part,
        },
        {
          type: 'section_header',
          title: clozeSourceOracle.oracle.publicVisibleChrome.section,
        },
        {
          type: 'instruction',
          text: clozeSourceOracle.oracle.publicVisibleChrome.instruction,
        },
        {
          type: 'question_group',
          questionGroupId:
            clozeSourceOracle.oracle.publicIdentities.cloze.groupId,
          score: 1,
        },
        {
          type: 'section_header',
          title: clozeSourceOracle.oracle.publicVisibleChrome.followingSection,
        },
        {
          type: 'question_group',
          questionGroupId:
            clozeSourceOracle.oracle.publicIdentities.followingSection.groupId,
          score: 1.5,
        },
        {
          type: 'section_header',
          title:
            grammarFillSourceOracle.oracle.publicVisibleChrome.followingPart,
        },
      ]
      const clozePublicVariantItems = [
        sevenChoicesPrintVariantItem(asset),
        clozePrintVariantItem(asset),
        grammarFillPrintVariantItem(asset),
      ]
      const grammarFillPoisonBlocks = [
        {
          type: 'section_header',
          title: grammarFillSourceOracle.oracle.publicVisibleChrome.part,
        },
        {
          type: 'section_header',
          title: grammarFillSourceOracle.oracle.publicVisibleChrome.section,
        },
        {
          type: 'instruction',
          text: grammarFillSourceOracle.oracle.publicVisibleChrome.instruction,
        },
        {
          type: 'question_group',
          questionGroupId:
            grammarFillSourceOracle.oracle.publicIdentities.grammarFill
              .groupId,
          score: 1.5,
        },
        {
          type: 'section_header',
          title:
            grammarFillSourceOracle.oracle.publicVisibleChrome.followingPart,
        },
      ]
      const grammarFillPoisonItem = grammarFillPrintVariantItem(asset)
      const assertGrammarFillPrintProducerRejected = (
        caseId,
        {
          versionType = 'student',
          items = [grammarFillPoisonItem],
          canonicalConsumption = consumers.print_pdf,
          grammarFillChrome = grammarFillChromeForPrint(),
          grammarFillGeometryVariantId = null,
          grammarFillGeometrySurface = null,
          expectedCode = 'CANONICAL_CONSUMPTION_REJECTED',
        } = {},
      ) => {
        const artifactPrefix = `forbidden-grammar-fill-poison-${caseId}`
        const artifactPath = path.join(
          outputDir,
          `${artifactPrefix}.html`,
        )
        const beforeDirectorySnapshotSha256 =
          digestDirectorySnapshot(outputDir)
        const targetPathStateBefore = existsSync(artifactPath)
          ? 'present'
          : 'absent'
        assert.equal(
          targetPathStateBefore,
          'absent',
          `${caseId} starts with no attempted public artifact path`,
        )
        let rejected = null
        try {
          const html = buildPrintHtml({
            title: `Canonical Import Pilot Grammar Fill poison ${caseId}`,
            versionType,
            items,
            blocks: grammarFillPoisonBlocks,
            questionNumberStart: 56,
            printStyle: 'exam',
            canonicalConsumption,
            grammarFillChrome,
            grammarFillGeometryVariantId,
            grammarFillGeometrySurface,
          })
          writeFileSync(artifactPath, html)
        } catch (error) {
          rejected = error
        }
        assert.equal(
          rejected?.code,
          expectedCode,
          `Print producer fails closed on Grammar Fill ${caseId}`,
        )
        const afterDirectorySnapshotSha256 =
          digestDirectorySnapshot(outputDir)
        const targetPathStateAfter = existsSync(artifactPath)
          ? 'present'
          : 'absent'
        assert.equal(
          targetPathStateAfter,
          'absent',
          `Grammar Fill ${caseId} leaves its exact artifact path absent`,
        )
        assert.equal(
          afterDirectorySnapshotSha256,
          beforeDirectorySnapshotSha256,
          `Grammar Fill ${caseId} leaves the complete output directory unchanged`,
        )
        grammarFillPoisonRejections.push({
          caseId,
          status: 'rejected-before-artifact-write',
          code: rejected.code,
          targetPathStateBefore,
          targetPathStateAfter,
          beforeDirectorySnapshotSha256,
          afterDirectorySnapshotSha256,
        })
      }
      const attackedGrammarFillConsumption = (
        mutate,
        { recomputeOccurrenceDigest = true } = {},
      ) => {
        const attacked = structuredClone(consumers.print_pdf)
        const selection = attacked.selections.find(
          (candidate) => candidate.familyContractId === 'grammar-fill',
        )
        const occurrence = selection.projectedOccurrences.find(
          (candidate) =>
            candidate.groupId
              === grammarFillSourceOracle.oracle.publicIdentities.grammarFill
                .groupId,
        )
        assert.ok(occurrence)
        mutate(occurrence, selection)
        if (recomputeOccurrenceDigest) {
          selection.projectedOccurrenceDigests =
            selection.projectedOccurrences.map((candidate) => ({
              groupId: candidate.groupId,
              digest: digestJson(candidate),
            }))
        }
        return attacked
      }
      assertGrammarFillPrintProducerRejected(
        'source-text-drift-with-recomputed-digest',
        {
          canonicalConsumption: attackedGrammarFillConsumption(
            (occurrence) => {
              occurrence.content.blocks[0].inlines[0].text =
                'POISONED GRAMMAR FILL SOURCE TEXT'
            },
          ),
        },
      )
      assertGrammarFillPrintProducerRejected(
        'blank-identity-drift-with-recomputed-digest',
        {
          canonicalConsumption: attackedGrammarFillConsumption(
            (occurrence) => {
              occurrence.blanks[0].blankId =
                'blank-poisoned-grammar-fill'
            },
          ),
        },
      )
      assertGrammarFillPrintProducerRejected(
        'blank-order-drift-with-recomputed-digest',
        {
          canonicalConsumption: attackedGrammarFillConsumption(
            (occurrence) => {
              const firstBlank = occurrence.blanks[0]
              occurrence.blanks[0] = occurrence.blanks[1]
              occurrence.blanks[1] = firstBlank
            },
          ),
        },
      )
      assertGrammarFillPrintProducerRejected(
        'prompt-text-drift-with-recomputed-digest',
        {
          canonicalConsumption: attackedGrammarFillConsumption(
            (occurrence) => {
              const promptText = occurrence.content.blocks[0].inlines[2]
              promptText.text = promptText.text.replace(
                '(hold)',
                '(POISONED)',
              )
            },
          ),
        },
      )
      const promptAttachmentPoison = structuredClone(
        grammarFillChromeForPrint(),
      )
      promptAttachmentPoison.sourceBinding.geometry.promptAttachment =
        'detached'
      assertGrammarFillPrintProducerRejected('prompt-attachment-drift', {
        grammarFillChrome: promptAttachmentPoison,
      })
      const answerPoison = structuredClone([grammarFillPoisonItem])
      answerPoison[0].detail.questions[0].answer =
        'POISONED OFFICIAL ANSWER'
      assertGrammarFillPrintProducerRejected('official-answer-drift', {
        versionType: 'teacher',
        items: answerPoison,
      })
      const explanationPoison = structuredClone([grammarFillPoisonItem])
      explanationPoison[0].detail.questions[0].explanation =
        'POISONED REVIEWED ANALYSIS'
      assertGrammarFillPrintProducerRejected('reviewed-analysis-drift', {
        versionType: 'teacher',
        items: explanationPoison,
      })
      const authorityEnvelopePoison = structuredClone(consumers.print_pdf)
      authorityEnvelopePoison.authorityRef.manifestDigest =
        'sha256:poisoned-grammar-fill-authority'
      assertGrammarFillPrintProducerRejected('authority-envelope-drift', {
        canonicalConsumption: authorityEnvelopePoison,
      })
      const missingIntegrityEnvelope = structuredClone(consumers.print_pdf)
      delete missingIntegrityEnvelope.selections.find(
        (candidate) => candidate.familyContractId === 'grammar-fill',
      ).projectedOccurrenceDigests
      assertGrammarFillPrintProducerRejected('missing-integrity-envelope', {
        canonicalConsumption: missingIntegrityEnvelope,
      })
      assertGrammarFillPrintProducerRejected('projected-digest-drift', {
        canonicalConsumption: attackedGrammarFillConsumption(
          (occurrence) => {
            occurrence.content.blocks[0].inlines[0].text =
              'POISONED WITHOUT DIGEST REFRESH'
          },
          { recomputeOccurrenceDigest: false },
        ),
      })
      const printFixtureVariantId =
        grammarFillPublicAdversaryOracle.oracle
          .wrappedLineAndLineEnd.printHtmlGeometryVariantId
      assertGrammarFillPrintProducerRejected(
        'fixture-absent-consumption-plan',
        {
          canonicalConsumption: null,
          grammarFillGeometryVariantId: printFixtureVariantId,
          grammarFillGeometrySurface: 'print_html',
          expectedCode:
            'CANONICAL_GRAMMAR_FILL_GEOMETRY_FIXTURE_REJECTED',
        },
      )
      const historicalFixturePlan = structuredClone(consumers.print_pdf)
      historicalFixturePlan.authorityRef = {
        manifestId: manifestV17.manifestId,
        manifestVersion: manifestV17.version,
        manifestDigest: digestJson(manifestV17),
      }
      assertGrammarFillPrintProducerRejected(
        'fixture-historical-consumption-plan',
        {
          canonicalConsumption: historicalFixturePlan,
          grammarFillGeometryVariantId: printFixtureVariantId,
          grammarFillGeometrySurface: 'print_html',
          expectedCode:
            'CANONICAL_GRAMMAR_FILL_GEOMETRY_FIXTURE_REJECTED',
        },
      )
      const mismatchedFixturePlan = structuredClone(consumers.print_pdf)
      mismatchedFixturePlan.consumerContractRef =
        consumerContractRefs.screen
      assertGrammarFillPrintProducerRejected(
        'fixture-mismatched-consumer-contract',
        {
          canonicalConsumption: mismatchedFixturePlan,
          grammarFillGeometryVariantId: printFixtureVariantId,
          grammarFillGeometrySurface: 'print_html',
          expectedCode:
            'CANONICAL_GRAMMAR_FILL_GEOMETRY_FIXTURE_REJECTED',
        },
      )
      const refsOnlyFixturePlan = structuredClone(consumers.print_pdf)
      refsOnlyFixturePlan.selections = [
        {
          familyContractId: 'grammar-fill',
          mode: 'canonical',
          groupIds: ['group-2026-i-grammar-fill'],
        },
      ]
      assertGrammarFillPrintProducerRejected(
        'fixture-refs-only-consumption-plan',
        {
          canonicalConsumption: refsOnlyFixturePlan,
          grammarFillGeometryVariantId: printFixtureVariantId,
          grammarFillGeometrySurface: 'print_html',
          expectedCode:
            'CANONICAL_CONSUMPTION_REJECTED',
        },
      )
      const mismatchedOccurrenceFixturePlan =
        structuredClone(consumers.print_pdf)
      mismatchedOccurrenceFixturePlan.selections.find(
        (candidate) => candidate.familyContractId === 'grammar-fill',
      ).projectedOccurrenceDigests[0].digest =
        'sha256:0000000000000000000000000000000000000000000000000000000000000000'
      assertGrammarFillPrintProducerRejected(
        'fixture-mismatched-occurrence-consumption-plan',
        {
          canonicalConsumption: mismatchedOccurrenceFixturePlan,
          grammarFillGeometryVariantId: printFixtureVariantId,
          grammarFillGeometrySurface: 'print_html',
          expectedCode:
            'CANONICAL_CONSUMPTION_REJECTED',
        },
      )
      const printGrammarFillWrapped = grammarFillVariantConsumption(
        printClozeWrapped.consumption,
        {
          wrappedPrefixRepeats:
            grammarFillPublicAdversaryOracle.oracle
              .wrappedLineAndLineEnd.wrappedPrefixRepeats,
        },
      )
      const clozePublicVariantHtml = (versionType, options = {}) => {
        const canonicalConsumption =
          options.consumption || printGrammarFillWrapped.consumption
        return buildPrintHtml({
          title: `Canonical Import Pilot Cloze ${options.variant || 'variant'}`,
          versionType,
          items: clozePublicVariantItems,
          blocks: options.blocks || clozePublicVariantBlocks,
          questionNumberStart: 33,
          printStyle: 'exam',
          canonicalConsumption,
          grammarFillChrome:
            grammarFillChromeForConsumption(canonicalConsumption),
          grammarFillGeometryVariantId:
            options.grammarFillGeometryVariantId || null,
          grammarFillGeometrySurface:
            options.grammarFillGeometrySurface || null,
        })
      }
      const wrappedStudentPrintHtml = clozePublicVariantHtml(
        'student',
        {
          variant: 'source-derived-wrapped-option',
          grammarFillGeometryVariantId:
            grammarFillPublicAdversaryOracle.oracle
              .wrappedLineAndLineEnd.printHtmlGeometryVariantId,
          grammarFillGeometrySurface: 'print_html',
        },
      )
      await page.setContent(wrappedStudentPrintHtml, { waitUntil: 'load' })
      const wrappedStudentPrintClozeObservation =
        await assertClozeDomGeometry(
          page,
          'Student Print HTML Cloze wrapped-option adversary',
          {
            wrappedOption: true,
            expectedRows: printClozeWrapped.expectedRows,
            expectedPassageTexts:
              printClozeWrapped.expectedPassageTexts,
          },
        )
      recordClozeBundleCoverage(clozeCoverageObservations, {
        bundleId: 'print-html-student',
        variant: 'student-wrapped-option',
        proof: wrappedStudentPrintClozeObservation,
      })
      const wrappedStudentPrintGrammarFillObservation =
        await assertGrammarFillDomGeometry(
          page,
          'Student Print HTML Grammar Fill wrapped-line adversary',
          {
            requireWrappedLine: true,
            requireLineEndBlank: true,
            surface: 'printHtml',
            observeFollowingTransition: false,
            expectedPassageTexts:
              printGrammarFillWrapped.expectedPassageTexts,
          },
      )
      recordGrammarFillBundleCoverage(grammarFillCoverageObservations, {
        bundleId: 'print-html-student',
        variant: 'student-wrapped-line',
        proof: wrappedStudentPrintGrammarFillObservation,
      })
      await page.setContent(printHtml.teacher, { waitUntil: 'load' })
      applicationWritingCoverageLedger.teacher_print_html =
        await assertApplicationWritingDomArtifact(
          page,
          consumers.print_pdf,
          'Teacher Print HTML Application Writing',
          { surface: 'printHtml', teacher: true },
        )
      const teacherPrintClozeObservation = await assertClozeDomGeometry(
        page,
        'Teacher Print HTML Cloze',
        { teacher: true },
      )
      recordClozeBundleCoverage(clozeCoverageObservations, {
        bundleId: 'print-html-teacher',
        variant: 'teacher-baseline',
        proof: teacherPrintClozeObservation,
      })
      const teacherPrintGrammarFillObservation =
        await assertGrammarFillDomGeometry(
          page,
          'Teacher Print HTML Grammar Fill',
          { teacher: true, surface: 'printHtml' },
        )
      recordGrammarFillBundleCoverage(grammarFillCoverageObservations, {
        bundleId: 'print-html-teacher',
        variant: 'teacher-baseline',
        proof: teacherPrintGrammarFillObservation,
      })
      const wrappedTeacherPrintHtml = clozePublicVariantHtml(
        'teacher',
        {
          variant: 'source-derived-wrapped-option',
          grammarFillGeometryVariantId:
            grammarFillPublicAdversaryOracle.oracle
              .wrappedLineAndLineEnd.printHtmlGeometryVariantId,
          grammarFillGeometrySurface: 'print_html',
        },
      )
      await page.setContent(wrappedTeacherPrintHtml, { waitUntil: 'load' })
      const wrappedTeacherPrintClozeObservation =
        await assertClozeDomGeometry(
          page,
          'Teacher Print HTML Cloze wrapped-option adversary',
          {
            teacher: true,
            wrappedOption: true,
            expectedRows: printClozeWrapped.expectedRows,
            expectedPassageTexts:
              printClozeWrapped.expectedPassageTexts,
          },
        )
      recordClozeBundleCoverage(clozeCoverageObservations, {
        bundleId: 'print-html-teacher',
        variant: 'teacher-wrapped-option',
        proof: wrappedTeacherPrintClozeObservation,
      })
      const wrappedTeacherPrintGrammarFillObservation =
        await assertGrammarFillDomGeometry(
          page,
          'Teacher Print HTML Grammar Fill wrapped-line adversary',
          {
            teacher: true,
            requireWrappedLine: true,
            requireLineEndBlank: true,
            surface: 'printHtml',
            observeFollowingTransition: false,
            expectedPassageTexts:
              printGrammarFillWrapped.expectedPassageTexts,
          },
      )
      recordGrammarFillBundleCoverage(grammarFillCoverageObservations, {
        bundleId: 'print-html-teacher',
        variant: 'teacher-wrapped-line',
        proof: wrappedTeacherPrintGrammarFillObservation,
      })
      const sevenChoicesVariantBlocks = [
        {
          type: 'section_header',
          title: sevenChoicesSourceOracle.oracle.sourceExtraction
            .sectionMarker,
        },
        {
          type: 'instruction',
          text: sevenChoicesSourceOracle.oracle.sourceExtraction
            .instructionMarker,
        },
        {
          type: 'question_group',
          questionGroupId:
            sevenChoicesSourceOracle.oracle.publicIdentities.sevenChoices
              .groupId,
          score: 2.5,
        },
        {
          type: 'section_header',
          title: sevenChoicesSourceOracle.oracle.sourceExtraction
            .followingSectionMarker,
        },
      ]
      const readingBoundaryGroupId =
        sevenChoicesSourceOracle.oracle.publicIdentities.readingBoundary
          .groupId
      const sevenChoicesPdfCoverageBlocks = [
        {
          type: 'question_group',
          questionGroupId: readingBoundaryGroupId,
          score: 2.5,
        },
        ...sevenChoicesVariantBlocks,
      ]
      const sevenChoicesPdfCoverageItems = [
        readingPrintVariantItem(asset, readingBoundaryGroupId),
        sevenChoicesPrintVariantItem(asset),
      ]
      const sevenChoicesStudentBaselineHtml = buildPrintHtml({
        title: 'Canonical Import Pilot Seven Choices student coverage',
        versionType: 'student',
        items: sevenChoicesPdfCoverageItems,
        blocks: sevenChoicesPdfCoverageBlocks,
        questionNumberStart: 33,
        printStyle: 'exam',
        canonicalConsumption: consumers.print_pdf,
      })
      const sevenChoicesTeacherBaselineHtml = buildPrintHtml({
        title: 'Canonical Import Pilot Seven Choices teacher coverage',
        versionType: 'teacher',
        items: sevenChoicesPdfCoverageItems,
        blocks: sevenChoicesPdfCoverageBlocks,
        questionNumberStart: 33,
        printStyle: 'exam',
        canonicalConsumption: consumers.print_pdf,
      })
      writeFileSync(
        path.join(outputDir, 'print-student-seven-choices-baseline.html'),
        sevenChoicesStudentBaselineHtml,
      )
      writeFileSync(
        path.join(outputDir, 'print-teacher-seven-choices-baseline.html'),
        sevenChoicesTeacherBaselineHtml,
      )
      await assertPrintHtmlSevenChoicesGoldenGeometry(
        page,
        sevenChoicesStudentBaselineHtml,
        'Student Print HTML Seven Choices',
        {
          bundleId: 'print-html-student',
          variant: 'student-baseline',
          recordCoverage: recordSevenChoicesCoverage,
        },
      )
      await assertPrintHtmlSevenChoicesGoldenGeometry(
        page,
        sevenChoicesTeacherBaselineHtml,
        'Teacher Print HTML Seven Choices',
        {
          teacher: true,
          bundleId: 'print-html-teacher',
          variant: 'teacher-baseline',
          recordCoverage: recordSevenChoicesCoverage,
        },
      )
      const sevenChoicesHeadingVariantHtml = buildPrintHtml({
        title: 'Canonical Import Pilot Seven Choices Golden Geometry',
        versionType: 'student',
        items: [sevenChoicesPrintVariantItem(asset)],
        blocks: sevenChoicesVariantBlocks,
        questionNumberStart: 36,
        printStyle: 'exam',
        canonicalConsumption: consumers.print_pdf,
        sevenChoicesBankHeading:
          sevenChoicesSourceOracle.oracle.variants.bankHeadingVisibleText,
      })
      await assertPrintHtmlSevenChoicesGoldenGeometry(
        page,
        sevenChoicesHeadingVariantHtml,
        'Student Print HTML Seven Choices bank-heading-present fixture',
        {
          headingPresent: true,
          requireReadingBoundary: false,
          bundleId: 'print-html-student',
          variant: 'student-bank-heading',
          recordCoverage: recordSevenChoicesCoverage,
        },
      )
      const sevenChoicesWrappedVariantHtml =
        sevenChoicesHeadingVariantHtml.replace(
          '</head>',
          `<style>
.canonical-option-bank { width: ${sevenChoicesSourceOracle.oracle.variants.printWrappedOptionWidthPt}pt !important; }
</style></head>`,
        )
      await assertPrintHtmlSevenChoicesGoldenGeometry(
        page,
        sevenChoicesWrappedVariantHtml,
        'Student Print HTML Seven Choices wrapped-option adversary',
        {
          headingPresent: true,
          wrappedOption: true,
          requireReadingBoundary: false,
          bundleId: 'print-html-student',
          variant: 'student-wrapped-option',
          recordCoverage: recordSevenChoicesCoverage,
        },
      )
      const sevenChoicesTeacherHeadingVariantHtml = buildPrintHtml({
        title: 'Canonical Import Pilot Seven Choices teacher coverage',
        versionType: 'teacher',
        items: [sevenChoicesPrintVariantItem(asset)],
        blocks: sevenChoicesVariantBlocks,
        questionNumberStart: 36,
        printStyle: 'exam',
        canonicalConsumption: consumers.print_pdf,
        sevenChoicesBankHeading:
          sevenChoicesSourceOracle.oracle.variants.bankHeadingVisibleText,
      })
      await assertPrintHtmlSevenChoicesGoldenGeometry(
        page,
        sevenChoicesTeacherHeadingVariantHtml,
        'Teacher Print HTML Seven Choices bank-heading-present fixture',
        {
          teacher: true,
          headingPresent: true,
          requireReadingBoundary: false,
          bundleId: 'print-html-teacher',
          variant: 'teacher-bank-heading',
          recordCoverage: recordSevenChoicesCoverage,
        },
      )
      const sevenChoicesTeacherWrappedVariantHtml =
        sevenChoicesTeacherHeadingVariantHtml.replace(
          '</head>',
          `<style>
.canonical-option-bank { width: ${sevenChoicesSourceOracle.oracle.variants.printWrappedOptionWidthPt}pt !important; }
</style></head>`,
        )
      await assertPrintHtmlSevenChoicesGoldenGeometry(
        page,
        sevenChoicesTeacherWrappedVariantHtml,
        'Teacher Print HTML Seven Choices wrapped-option fixture',
        {
          teacher: true,
          headingPresent: true,
          wrappedOption: true,
          requireReadingBoundary: false,
          bundleId: 'print-html-teacher',
          variant: 'teacher-wrapped-option',
          recordCoverage: recordSevenChoicesCoverage,
        },
      )
      const sevenChoicesVariantItem = sevenChoicesPrintVariantItem(asset)
      const sevenChoicesBuildArgs = {
        title: 'Canonical Import Pilot Seven Choices adversary',
        versionType: 'student',
        items: [sevenChoicesVariantItem],
        blocks: sevenChoicesVariantBlocks,
        questionNumberStart: 36,
        printStyle: 'exam',
        canonicalConsumption: consumers.print_pdf,
      }
      const sevenChoicesGroupBlockIndex =
        sevenChoicesVariantBlocks.findIndex(
          (block) => block.type === 'question_group',
        )
      const assertPrintProducerRejected = (
        name,
        {
          blocks = sevenChoicesVariantBlocks,
          canonicalConsumption = consumers.print_pdf,
        } = {},
      ) => {
        assert.throws(
          () => buildPrintHtml({
            ...sevenChoicesBuildArgs,
            blocks,
            canonicalConsumption,
          }),
          { code: 'CANONICAL_CONSUMPTION_REJECTED' },
          `Print producer fails closed on ${name}`,
        )
      }
      assertPrintProducerRejected('duplicate Seven Choices Group', {
        blocks: [
          ...sevenChoicesVariantBlocks.slice(
            0,
            sevenChoicesGroupBlockIndex + 1,
          ),
          structuredClone(
            sevenChoicesVariantBlocks[sevenChoicesGroupBlockIndex],
          ),
          ...sevenChoicesVariantBlocks.slice(
            sevenChoicesGroupBlockIndex + 1,
          ),
        ],
      })
      assertPrintProducerRejected('missing Seven Choices Group', {
        blocks: sevenChoicesVariantBlocks.filter(
          (block) => block.type !== 'question_group',
        ),
      })
      assertPrintProducerRejected('wrong Seven Choices Group', {
        blocks: sevenChoicesVariantBlocks.map((block) =>
          block.type === 'question_group'
            ? { ...block, questionGroupId: 'group-poisoned-seven-choices' }
            : block),
      })
      const attackedSevenChoicesConsumption = (mutate) => {
        const attacked = structuredClone(consumers.print_pdf)
        const selection = attacked.selections.find(
          (candidate) =>
            candidate.familyContractId === 'seven-choices',
        )
        const occurrence = selection.projectedOccurrences.find(
          (candidate) =>
            candidate.groupId
              === sevenChoicesSourceOracle.oracle.publicIdentities
                .sevenChoices.groupId,
        )
        mutate(occurrence)
        return attacked
      }
      assertPrintProducerRejected('missing source bank option', {
        canonicalConsumption: attackedSevenChoicesConsumption(
          (occurrence) => { occurrence.choices.options.pop() },
        ),
      })
      assertPrintProducerRejected('duplicate source bank option', {
        canonicalConsumption: attackedSevenChoicesConsumption(
          (occurrence) => {
            occurrence.choices.options[1] =
              structuredClone(occurrence.choices.options[0])
          },
        ),
      })
      assertPrintProducerRejected('wrong Question/Blank join', {
        canonicalConsumption: attackedSevenChoicesConsumption(
          (occurrence) => {
            occurrence.questionBlankPairs[0].blankId =
              'blank-poisoned-seven-choices'
          },
        ),
      })
      const synchronizedDriftHtml = buildPrintHtml({
        ...sevenChoicesBuildArgs,
        canonicalConsumption: attackedSevenChoicesConsumption(
          (occurrence) => {
            occurrence.choices.options[0].content[0].text =
              'POISONED SYNCHRONIZED OPTION TEXT'
          },
        ),
      })
      await assert.rejects(
        () => assertPrintHtmlSevenChoicesGoldenGeometry(
          page,
          synchronizedDriftHtml,
          'Print HTML synchronized producer/oracle drift adversary',
          { requireReadingBoundary: false },
        ),
        /preserves source-PDF A-G text/,
        'independent source oracle rejects a structurally valid producer text drift',
      )
      const clozeVariantBlocks = [
        {
          type: 'section_header',
          title: clozeSourceOracle.oracle.sourceExtraction.partMarker,
        },
        {
          type: 'section_header',
          title: clozeSourceOracle.oracle.sourceExtraction.sectionMarker,
        },
        {
          type: 'instruction',
          text: clozeSourceOracle.oracle.sourceExtraction.instructionMarker,
        },
        {
          type: 'question_group',
          questionGroupId:
            clozeSourceOracle.oracle.publicIdentities.cloze.groupId,
          score: 1,
        },
        {
          type: 'section_header',
          title:
            clozeSourceOracle.oracle.sourceExtraction.followingSectionMarker,
        },
      ]
      const clozeVariantItem = clozePrintVariantItem(asset)
      const clozeBuildArgs = {
        title: 'Canonical Import Pilot Cloze adversary',
        versionType: 'student',
        items: [clozeVariantItem],
        blocks: clozeVariantBlocks,
        questionNumberStart: 41,
        printStyle: 'exam',
        canonicalConsumption: consumers.print_pdf,
      }
      const clozeGroupBlockIndex = clozeVariantBlocks.findIndex(
        (block) => block.type === 'question_group',
      )
      const assertClozePrintProducerRejected = (
        name,
        {
          blocks = clozeVariantBlocks,
          canonicalConsumption = consumers.print_pdf,
        } = {},
      ) => {
        assert.throws(
          () => buildPrintHtml({
            ...clozeBuildArgs,
            blocks,
            canonicalConsumption,
          }),
          { code: 'CANONICAL_CONSUMPTION_REJECTED' },
          `Print producer fails closed on Cloze ${name}`,
        )
      }
      assertClozePrintProducerRejected('duplicate Group', {
        blocks: [
          ...clozeVariantBlocks.slice(0, clozeGroupBlockIndex + 1),
          structuredClone(clozeVariantBlocks[clozeGroupBlockIndex]),
          ...clozeVariantBlocks.slice(clozeGroupBlockIndex + 1),
        ],
      })
      assertClozePrintProducerRejected('missing Group', {
        blocks: clozeVariantBlocks.filter(
          (block) => block.type !== 'question_group',
        ),
      })
      assertClozePrintProducerRejected('wrong Group identity', {
        blocks: clozeVariantBlocks.map((block) =>
          block.type === 'question_group'
            ? { ...block, questionGroupId: 'group-poisoned-cloze' }
            : block),
      })
      const attackedClozeConsumption = (mutate) => {
        const attacked = structuredClone(consumers.print_pdf)
        const selection = attacked.selections.find(
          (candidate) => candidate.familyContractId === 'cloze',
        )
        const occurrence = selection.projectedOccurrences.find(
          (candidate) =>
            candidate.groupId
              === clozeSourceOracle.oracle.publicIdentities.cloze.groupId,
        )
        mutate(occurrence)
        return attacked
      }
      const missingClozeOccurrenceDigests = structuredClone(
        consumers.print_pdf,
      )
      delete missingClozeOccurrenceDigests.selections.find(
        (candidate) => candidate.familyContractId === 'cloze',
      ).projectedOccurrenceDigests
      assertClozePrintProducerRejected(
        'missing mandatory v20 projected occurrence digests',
        { canonicalConsumption: missingClozeOccurrenceDigests },
      )
      const fakePreV18ClozeIntegrityEnvelope = structuredClone(
        consumers.print_pdf,
      )
      const strippedClozeSelection =
        fakePreV18ClozeIntegrityEnvelope.selections.find(
          (candidate) => candidate.familyContractId === 'cloze',
        )
      fakePreV18ClozeIntegrityEnvelope.authorityRef = {
        manifestId: manifestV17.manifestId,
        manifestVersion: manifestV17.version,
        manifestDigest: digestJson(manifestV17),
      }
      delete strippedClozeSelection.projectedOccurrenceDigests
      strippedClozeSelection.projectedOccurrences[0]
        .choices.sets[0].options[0].content[0].text =
          'POISONED STRIPPED CURRENT CLOZE SOURCE OPTION'
      const fakePreV18Before = JSON.stringify(
        fakePreV18ClozeIntegrityEnvelope,
      )
      assertClozePrintProducerRejected(
        'stripped current integrity envelope with fake v17 authority and source drift',
        { canonicalConsumption: fakePreV18ClozeIntegrityEnvelope },
      )
      assert.equal(
        JSON.stringify(fakePreV18ClozeIntegrityEnvelope),
        fakePreV18Before,
        'failed public Print projection does not mutate the poisoned Plan',
      )
      assertClozePrintProducerRejected('wrong Question/Blank join', {
        canonicalConsumption: attackedClozeConsumption((occurrence) => {
          occurrence.blanks[0].blankId =
            'blank-poisoned-cloze'
        }),
      })
      assertClozePrintProducerRejected('source option text drift', {
        canonicalConsumption: attackedClozeConsumption((occurrence) => {
          occurrence.choices.sets[0].options[0].content[0].text =
            'POISONED CLOZE SOURCE OPTION'
        }),
      })
      const explanationPoisonItems = structuredClone(
        clozePublicVariantItems,
      )
      explanationPoisonItems.find(
        (item) =>
          item.detail.id
            === clozeSourceOracle.oracle.publicIdentities.cloze.groupId,
      ).detail.questions[0].explanation =
        'POISONED REVIEWED CLOZE EXPLANATION'
      const explanationPoisonHtml = buildPrintHtml({
        title: 'Canonical Import Pilot Cloze explanation poison',
        versionType: 'teacher',
        items: explanationPoisonItems,
        blocks: clozePublicVariantBlocks,
        questionNumberStart: 33,
        printStyle: 'exam',
        canonicalConsumption: consumers.print_pdf,
        grammarFillChrome: grammarFillChromeForPrint(),
      })
      await page.setContent(explanationPoisonHtml, { waitUntil: 'load' })
      await assert.rejects(
        () => assertClozeDomGeometry(
          page,
          'Teacher Print HTML Cloze explanation poison',
          { teacher: true },
        ),
        /exact reviewed-analysis bytes/,
        'independent Teacher oracle rejects explanation poison injected before public rendering',
      )
      const answerPoisonItems = structuredClone(
        clozePublicVariantItems,
      )
      answerPoisonItems.find(
        (item) =>
          item.detail.id
            === clozeSourceOracle.oracle.publicIdentities.cloze.groupId,
      ).detail.questions[0].answer =
        `${clozeSourceOracle.questionRows[0].answer} POISONED`
      const answerPoisonHtml = buildPrintHtml({
        title: 'Canonical Import Pilot Cloze answer poison',
        versionType: 'teacher',
        items: answerPoisonItems,
        blocks: clozePublicVariantBlocks,
        questionNumberStart: 33,
        printStyle: 'exam',
        canonicalConsumption: consumers.print_pdf,
        grammarFillChrome: grammarFillChromeForPrint(),
      })
      await page.setContent(answerPoisonHtml, { waitUntil: 'load' })
      await assert.rejects(
        () => assertClozeDomGeometry(
          page,
          'Teacher Print HTML Cloze answer poison',
          { teacher: true },
        ),
        /exact official-answer bytes/,
        'independent Teacher oracle rejects answer poison injected before public rendering',
      )
      const sevenChoicesNoChromeHtml = buildPrintHtml({
        ...sevenChoicesBuildArgs,
        blocks: [
          sevenChoicesVariantBlocks[sevenChoicesGroupBlockIndex],
          sevenChoicesVariantBlocks.at(-1),
        ],
      })
      await assertPrintHtmlSevenChoicesGoldenGeometry(
        page,
        sevenChoicesNoChromeHtml,
        'Student Print HTML Seven Choices all-optional-chrome collapse',
        {
          chromePresent: false,
          requireReadingBoundary: false,
          bundleId: 'print-html-student',
          variant: 'student-optional-chrome-collapse',
          recordCoverage: recordSevenChoicesCoverage,
        },
      )
      assertNoReadingRolesInNonReadingPrintGroups(
        printHtml.student,
        asset,
        'Student Print HTML',
      )
      assertNoReadingRolesInNonReadingPrintGroups(
        printHtml.teacher,
        asset,
        'Teacher Print HTML',
      )

      assert.equal(
        (printHtml.student.match(/<div class="answer">/g) || []).length,
        0,
        'Student Print HTML hides answers',
      )
      assert.equal(
        (printHtml.teacher.match(/<div class="answer">/g) || []).length > 0,
        true,
        'Teacher Print HTML exposes answers',
      )
      assertStudentTeacherStructuralParity(
        printHtml.student,
        printHtml.teacher,
      )
      assertPassageLetterMarkup(
        printHtml.student,
        consumers.print_pdf,
        'print_pdf',
        'Student Print HTML',
      )
      assertPassageLetterMarkup(
        printHtml.teacher,
        consumers.print_pdf,
        'print_pdf',
        'Teacher Print HTML',
      )
      const printPredecessorBindings = {
        student: exactPrintReadingPredecessorBindings(
          printHtml.student,
          consumers.print_pdf,
          'Student Print HTML',
        ),
        teacher: exactPrintReadingPredecessorBindings(
          printHtml.teacher,
          consumers.print_pdf,
          'Teacher Print HTML',
        ),
      }
      assert.equal(
        attributeSignatures(printHtml.student).length > 0,
        true,
        'Print HTML carries canonical semantic and occurrence signatures',
      )
      const printSignatures = new Set(attributeSignatures(printHtml.student))
      assertExactRenderedSignatures(
        printHtml.student,
        consumers.print_pdf,
        'Print HTML',
      )
      assert.deepEqual(
        [...screenSignatures].sort(),
        [...printSignatures].sort(),
        'PaperSurface and Print HTML carry the same canonical signatures',
      )
      assertArtifactContainsCanonicalIdentity(
        printHtml.student,
        expectedCanonicalIdentity(consumers.print_pdf),
        'Print HTML',
      )
      assert.equal(
        (printHtml.student.match(/class="explanation"/g) || []).length,
        0,
        'Student Print HTML hides explanations',
      )
      assert.equal(
        canonicalAttributeValues(
          printHtml.student,
          'data-canonical-answer-region-ref',
        ).length,
        2,
        'Print HTML exposes the two canonical writing response regions',
      )
      const printGroupOffsets = groupOrder.map((groupId) =>
        printHtml.student.indexOf(`data-canonical-group-id="${groupId}"`))
      assert.equal(
        printGroupOffsets.every(
          (offset, index) =>
            offset >= 0
            && (index === 0 || offset > printGroupOffsets[index - 1]),
        ),
        true,
        `Print HTML preserves whole-paper Group order: ${JSON.stringify(
          groupOrder.map((groupId, index) => ({
            groupId,
            offset: printGroupOffsets[index],
          })),
        )}`,
      )
      for (const group of Object.values(asset.content.groups)
        .filter((candidate) => candidate.groupType === 'listening')) {
        assert.equal(
          printHtml.student.includes(group.groupId),
          false,
          `Print HTML exposes zero Listening occurrence for ${group.groupId}`,
        )
        assert.equal(
          printHtml.teacher.includes(group.groupId),
          false,
          `Teacher Print HTML exposes zero Listening occurrence for ${group.groupId}`,
        )
      }
      const studentPdfText = pdfText(pdfPaths.student)
      const teacherPdfText = pdfText(pdfPaths.teacher)
      assert.equal(
        studentPdfText.includes('【答案】'),
        false,
        'Student Chromium PDF hides answers',
      )
      assert.equal(
        teacherPdfText.includes('【答案】'),
        true,
        'Teacher Chromium PDF exposes answers',
      )
      assert.equal(
        studentPdfText.includes('Canonical Import Pilot'),
        true,
        'Student Chromium PDF renders the pilot draft title',
      )
      assert.equal(
        teacherPdfText.includes('Canonical Import Pilot'),
        true,
        'Teacher Chromium PDF renders the same pilot draft title',
      )
      for (const [versionType, pdfPath] of Object.entries(pdfPaths)) {
        const label =
          `${versionType === 'student' ? 'Student' : 'Teacher'} Chromium PDF`
        assertPdfSemanticOrder(pdfPath, consumers.print_pdf, label)
        const pageBoxes = assertPdfA4AndUnclipped(pdfPath, label)
        assertPdfReadingQuestionsNotSplit(
          pdfPath,
          consumers.print_pdf,
          label,
        )
        assertPdfReadingContinuationAndEnd(
          pdfPath,
          consumers.print_pdf,
          label,
        )
        pdfRhythmEvidence.push(assertPdfReadingVerticalRhythm(
          pdfPath,
          consumers.print_pdf,
          label,
          { requireTeacherTail: versionType === 'teacher' },
        ))
        passageLetterGeometry.pdf[versionType] =
          assertPdfPassageLetterGeometry(
            pdfPath,
            consumers.print_pdf,
            pageBoxes,
            printPredecessorBindings[versionType],
            label,
          )
        assertPdfBankAndNativeTable(
          pdfPath,
          consumers.print_pdf,
          outputDir,
          pageBoxes,
          label,
        )
        const writingResponseRegions = assertPdfWritingResponseRegions(
          pdfPath,
          consumers.print_pdf,
          outputDir,
          pageBoxes,
          label,
        )
        applicationWritingCoverageLedger[
          versionType === 'student' ? 'student_pdf' : 'teacher_pdf'
        ] = assertApplicationWritingPdfArtifact({
          pdfPath,
          consumption: consumers.print_pdf,
          label: `${label} Application Writing`,
          teacher: versionType === 'teacher',
          responseRegions: writingResponseRegions,
          pageBoxes,
        })
      }
      const applicationResponseMoveHtml = printHtml.teacher.replace(
        '</head>',
        `<style>
.canonical-application-prompt {
  width: 160pt !important;
  max-width: 160pt !important;
}
</style></head>`,
      )
      const applicationResponseMovePdfPath = path.join(
        outputDir,
        'print-teacher-application-response-move.pdf',
      )
      let applicationResponseMoveRender
      try {
        applicationResponseMoveRender = await renderPaginatedPaper(
          applicationResponseMoveHtml,
        )
      } finally {
        await closeChromiumPool()
      }
      writeFileSync(
        applicationResponseMovePdfPath,
        applicationResponseMoveRender.pdfBytes,
      )
      const applicationResponseMoveLabel =
        'Teacher Chromium PDF Application Writing insufficient-space adversary'
      const applicationResponseMovePageBoxes = assertPdfA4AndUnclipped(
        applicationResponseMovePdfPath,
        applicationResponseMoveLabel,
      )
      const applicationResponseMoveRegions = assertPdfWritingResponseRegions(
        applicationResponseMovePdfPath,
        consumers.print_pdf,
        outputDir,
        applicationResponseMovePageBoxes,
        applicationResponseMoveLabel,
      )
      applicationWritingCoverageLedger.teacher_pdf_response_move =
        assertApplicationWritingResponseMovePdfArtifact({
          pdfPath: applicationResponseMovePdfPath,
          responseRegions: applicationResponseMoveRegions,
          pageBoxes: applicationResponseMovePageBoxes,
          label: applicationResponseMoveLabel,
        })
      const baselineStudentClozePdf = assertPdfClozeGeometry(
        pdfPaths.student,
        'Student Chromium PDF Cloze baseline',
      )
      recordClozeBundleCoverage(clozeCoverageObservations, {
        bundleId: 'pdf-student',
        variant: 'student-baseline',
        proof: baselineStudentClozePdf,
      })
      const baselineTeacherClozePdf = assertPdfClozeGeometry(
        pdfPaths.teacher,
        'Teacher Chromium PDF Cloze baseline',
        { teacher: true },
      )
      recordClozeBundleCoverage(clozeCoverageObservations, {
        bundleId: 'pdf-teacher',
        variant: 'teacher-baseline',
        proof: baselineTeacherClozePdf,
      })
      const renderClozePdfVariant = async ({
        versionType,
        variant,
        consumptionVariant,
        blocks = clozePublicVariantBlocks,
        assertionOptions,
      }) => {
        const html = clozePublicVariantHtml(
          versionType,
          {
            variant,
            blocks,
            consumption: consumptionVariant.consumption,
          },
        )
        let renderedVariant
        try {
          renderedVariant = await renderPaginatedPaper(html)
        } finally {
          await closeChromiumPool()
        }
        const outputPath = path.join(
          outputDir,
          `print-${versionType}-cloze-${variant}.pdf`,
        )
        writeFileSync(outputPath, renderedVariant.pdfBytes)
        const label =
          `${versionType === 'student' ? 'Student' : 'Teacher'} Chromium PDF Cloze ${variant}`
        assertPdfA4AndUnclipped(outputPath, label)
        const proof = assertPdfClozeGeometry(
          outputPath,
          label,
          {
            teacher: versionType === 'teacher',
            expectedRows: consumptionVariant.expectedRows,
            expectedPassageTexts:
              consumptionVariant.expectedPassageTexts,
            ...assertionOptions,
          },
        )
        recordClozeBundleCoverage(clozeCoverageObservations, {
          bundleId: `pdf-${versionType}`,
          variant: `${versionType}-${variant}`,
          proof,
        })
      }
      const pageBreakBeforeClozeBlocks = [
        clozePublicVariantBlocks[0],
        { type: 'page_break' },
        ...clozePublicVariantBlocks.slice(1),
      ]
      const pageBreakBeforeFollowingBlocks = [
        ...clozePublicVariantBlocks.slice(
          0,
          clozePublicVariantBlocks.findIndex(
            (block) =>
              block.type === 'section_header'
              && normalizedVisibleText(block.title)
                === normalizedVisibleText(
                  clozeSourceOracle.oracle.publicVisibleChrome
                    .followingSection,
                ),
          ),
        ),
        { type: 'page_break' },
        ...clozePublicVariantBlocks.slice(
          clozePublicVariantBlocks.findIndex(
            (block) =>
              block.type === 'section_header'
              && normalizedVisibleText(block.title)
                === normalizedVisibleText(
                  clozeSourceOracle.oracle.publicVisibleChrome
                    .followingSection,
                ),
          ),
        ),
      ]
      const studentPassageCross = clozeVariantConsumption(
        consumers.print_pdf,
        {
          wrappedOptionRepeats:
            clozeSourceOracle.oracle.variants.wrappedOption.repeatCount,
          passageTailRepeats:
            clozeSourceOracle.oracle.variants.passageCrossPage.repeatCount,
        },
      )
      await renderClozePdfVariant({
        versionType: 'student',
        variant: 'passage-cross-page',
        consumptionVariant: studentPassageCross,
        blocks: pageBreakBeforeClozeBlocks,
        assertionOptions: {
          requirePassageCrossPage: true,
          requireWrappedOption: true,
        },
      })
      const studentChoiceCross = clozeVariantConsumption(
        consumers.print_pdf,
        {
          wrappedOptionRepeats:
            clozeSourceOracle.oracle.variants.choiceBlockCrossPage
              .repeatCountPerQuestion,
          wrapEveryChoiceRow: true,
        },
      )
      await renderClozePdfVariant({
        versionType: 'student',
        variant: 'choice-block-cross-page',
        consumptionVariant: studentChoiceCross,
        assertionOptions: {
          requireChoiceBlockCrossPage: true,
          requireWrappedOption: true,
        },
      })
      const studentFollowingCross = clozeVariantConsumption(
        consumers.print_pdf,
      )
      await renderClozePdfVariant({
        versionType: 'student',
        variant: 'next-section-cross-page',
        consumptionVariant: studentFollowingCross,
        blocks: pageBreakBeforeFollowingBlocks,
        assertionOptions: { requireFollowingCrossPage: true },
      })
      const teacherPassageCross = clozeVariantConsumption(
        consumers.print_pdf,
        {
          wrappedOptionRepeats:
            clozeSourceOracle.oracle.variants.wrappedOption.repeatCount,
          passageTailRepeats:
            clozeSourceOracle.oracle.variants.passageCrossPage.repeatCount,
        },
      )
      await renderClozePdfVariant({
        versionType: 'teacher',
        variant: 'passage-cross-page',
        consumptionVariant: teacherPassageCross,
        blocks: pageBreakBeforeClozeBlocks,
        assertionOptions: {
          requirePassageCrossPage: true,
          requireWrappedOption: true,
        },
      })
      const teacherChoiceCross = clozeVariantConsumption(
        consumers.print_pdf,
        {
          wrappedOptionRepeats:
            clozeSourceOracle.oracle.variants.choiceBlockCrossPage
              .repeatCountPerQuestion,
          wrapEveryChoiceRow: true,
        },
      )
      await renderClozePdfVariant({
        versionType: 'teacher',
        variant: 'choice-block-cross-page',
        consumptionVariant: teacherChoiceCross,
        assertionOptions: {
          requireChoiceBlockCrossPage: true,
          requireWrappedOption: true,
        },
      })
      const teacherFollowingCross = clozeVariantConsumption(
        consumers.print_pdf,
      )
      await renderClozePdfVariant({
        versionType: 'teacher',
        variant: 'next-section-cross-page',
        consumptionVariant: teacherFollowingCross,
        blocks: pageBreakBeforeFollowingBlocks,
        assertionOptions: { requireFollowingCrossPage: true },
      })
      const grammarFillFollowingBlockIndex =
        clozePublicVariantBlocks.findLastIndex(
          (block) =>
            block.type === 'section_header'
            && normalizedVisibleText(block.title)
              === normalizedVisibleText(
                grammarFillSourceOracle.oracle.publicVisibleChrome
                  .followingPart,
              ),
        )
      assert.equal(grammarFillFollowingBlockIndex >= 0, true)
      const pageBreakBeforeGrammarFillFollowingBlocks = [
        ...clozePublicVariantBlocks.slice(
          0,
          grammarFillFollowingBlockIndex,
        ),
        { type: 'page_break' },
        ...clozePublicVariantBlocks.slice(
          grammarFillFollowingBlockIndex,
        ),
      ]
      const grammarFillPassageCross = grammarFillVariantConsumption(
        consumers.print_pdf,
        {
          passageTailRepeats:
            grammarFillPublicAdversaryOracle.oracle
              .passageCrossPage.repeatCount,
        },
      )
      const renderGrammarFillPdfVariant = async ({
        versionType,
        variant,
        blocks,
        consumption,
        expectedPassageTexts,
        domMode,
        pdfRelations,
      }) => {
        const geometryVariantId = variant === 'passage-cross-page'
          ? grammarFillPublicAdversaryOracle.oracle
            .passageCrossPage.geometryVariantId
          : variant === 'next-section-cross-page'
            ? 'pdf-next-section-cross-page'
            : 'pdf-baseline'
        const html = clozePublicVariantHtml(versionType, {
          variant: `grammar-fill-${variant}`,
          blocks,
          consumption,
          grammarFillGeometryVariantId: geometryVariantId,
          grammarFillGeometrySurface: 'print_pdf',
        })
        await page.setContent(html, { waitUntil: 'load' })
        let domProof = null
        if (domMode) {
          domProof = await assertGrammarFillDomGeometry(
            page,
            `${versionType} Grammar Fill ${variant} pre-PDF public DOM`,
            {
              teacher: versionType === 'teacher',
              surface: 'printHtml',
              requireWrappedLine: domMode === 'wrapped',
              requireLineEndBlank: domMode === 'wrapped',
              observeFollowingTransition: domMode !== 'wrapped',
              expectedPassageTexts,
            },
          )
        }
        let renderedVariant
        try {
          renderedVariant = await renderPaginatedPaper(html)
        } finally {
          await closeChromiumPool()
        }
        const outputPath = path.join(
          outputDir,
          `print-${versionType}-grammar-fill-${variant}.pdf`,
        )
        writeFileSync(outputPath, renderedVariant.pdfBytes)
        const artifactLabel =
          `${versionType === 'student' ? 'Student' : 'Teacher'} Chromium PDF Grammar Fill ${variant}`
        assertPdfA4AndUnclipped(outputPath, artifactLabel)
        const pdfMeasurement = assertGrammarFillPdfArtifact(
          outputPath,
          artifactLabel,
          {
            teacher: versionType === 'teacher',
            requireLineEndBlank: variant === 'passage-cross-page',
            expectedPassageTexts,
            ...pdfRelations,
          },
        )
        let observedEdges
        if (variant === 'baseline') {
          observedEdges = domProof.observedEdges.map((edge) => ({
            ...edge,
            pdfMeasurement,
          }))
        } else if (variant === 'passage-cross-page') {
          const wrappedEdge = domProof.observedEdges.find(
            (edge) => edge.edgeId === 'wrapped_line_blank',
          )
          assert.ok(wrappedEdge)
          assert.ok(pdfMeasurement.lineEndBlankId)
          observedEdges = [
            {
              edgeId: 'cloze_tail_to_chrome_cross_page',
              sourceOracleSha256: grammarFillSourceOracle.digest,
              fromIdentity:
                grammarFillSourceOracle.oracle.publicIdentities
                  .clozeBoundary.questionId,
              toIdentity:
                grammarFillSourceOracle.oracle.publicIdentities
                  .grammarFill.groupId,
              pageRelation: 'next_page_start',
              pdfMeasurement,
            },
            {
              edgeId: 'same_passage_cross_page',
              sourceOracleSha256: grammarFillSourceOracle.digest,
              fromIdentity:
                grammarFillSourceOracle.oracle.publicIdentities
                  .grammarFill.paragraphIds[0],
              toIdentity:
                grammarFillSourceOracle.oracle.publicIdentities
                  .grammarFill.paragraphIds.at(-1),
              pageRelation: 'next_page_continuation',
              pdfMeasurement,
            },
            {
              ...wrappedEdge,
              pdfMeasurement,
            },
            {
              edgeId: 'line_end_blank',
              sourceOracleSha256: grammarFillSourceOracle.digest,
              fromIdentity: pdfMeasurement.lineEndBlankId,
              toIdentity:
                grammarFillSourceOracle.oracle.publicIdentities
                  .grammarFill.paragraphIds[1],
              pageRelation: 'line_end_atomic',
              pdfMeasurement,
            },
          ]
        } else {
          const edgeId = versionType === 'teacher'
            ? 'teacher_tail_to_next_section_cross_page'
            : 'student_tail_to_next_section_cross_page'
          observedEdges = [{
            edgeId,
            sourceOracleSha256: grammarFillSourceOracle.digest,
            fromIdentity: versionType === 'teacher'
              ? grammarFillSourceOracle.oracle.publicIdentities
                .grammarFill.questionIds.at(-1)
              : grammarFillSourceOracle.oracle.publicIdentities
                .grammarFill.paragraphIds.at(-1),
            toIdentity:
              grammarFillSourceOracle.oracle.publicIdentities
                .followingSection.sectionId,
            pageRelation: 'next_page_start',
            pdfMeasurement,
          }]
        }
        recordGrammarFillBundleCoverage(grammarFillCoverageObservations, {
          bundleId: `pdf-${versionType}`,
          variant: `${versionType}-${variant}`,
          proof: { observedEdges },
        })
      }
      for (const versionType of ['student', 'teacher']) {
        await renderGrammarFillPdfVariant({
          versionType,
          variant: 'baseline',
          blocks: clozePublicVariantBlocks,
          consumption: consumers.print_pdf,
          expectedPassageTexts:
            grammarFillSourceOracle.paperAsset.content.groups[
              grammarFillSourceOracle.oracle.publicIdentities
                .grammarFill.groupId
            ].passage.paragraphs.map((paragraph) => paragraph.text),
          domMode: 'baseline',
          pdfRelations: {
            previousRelation: 'same_page',
            passageRelation: 'same_page',
            followingRelation: 'same_page',
          },
        })
        await renderGrammarFillPdfVariant({
          versionType,
          variant: 'passage-cross-page',
          blocks: pageBreakBeforeFollowingBlocks,
          consumption: grammarFillPassageCross.consumption,
          expectedPassageTexts:
            grammarFillPassageCross.expectedPassageTexts,
          domMode: 'wrapped',
          pdfRelations: {
            previousRelation: 'cross_page',
            passageRelation: 'cross_page',
            followingRelation: 'either',
          },
        })
        await renderGrammarFillPdfVariant({
          versionType,
          variant: 'next-section-cross-page',
          blocks: pageBreakBeforeGrammarFillFollowingBlocks,
          consumption: consumers.print_pdf,
          expectedPassageTexts:
            grammarFillSourceOracle.paperAsset.content.groups[
              grammarFillSourceOracle.oracle.publicIdentities
                .grammarFill.groupId
            ].passage.paragraphs.map((paragraph) => paragraph.text),
          domMode: null,
          pdfRelations: {
            previousRelation: 'same_page',
            passageRelation: 'same_page',
            followingRelation: 'cross_page',
          },
        })
      }
      assertPdfSevenChoicesPassageToFirstOption(
        pdfPaths.teacher,
        'Teacher Chromium PDF public baseline Seven Choices direct-bank edge',
        {
          bundleId: 'pdf-teacher',
          variant: 'teacher-baseline',
          recordCoverage: recordSevenChoicesCoverage,
        },
      )
      for (const versionType of ['student', 'teacher']) {
        const sourceBoundBaselineBaseHtml = buildPrintHtml({
          title:
            `Canonical Import Pilot Seven Choices ${versionType} PDF coverage`,
          versionType,
          items: sevenChoicesPdfCoverageItems,
          blocks: sevenChoicesPdfCoverageBlocks,
          questionNumberStart: 33,
          printStyle: 'exam',
          canonicalConsumption: consumers.print_pdf,
        })
        const sourceBoundBaselineHtml = versionType === 'teacher'
          ? sourceBoundBaselineBaseHtml.replace(
              '</head>',
              `<style>
[data-canonical-seven-choices-reading-boundary-group-id] {
  break-before: page !important;
  page-break-before: always !important;
}
.canonical-option-bank-region {
  break-before: page !important;
  page-break-before: always !important;
}
</style></head>`,
            )
          : sourceBoundBaselineBaseHtml
        const sourceBoundBaselinePath = path.join(
          outputDir,
          `print-${versionType}-seven-choices-source-bound-baseline.pdf`,
        )
        let sourceBoundBaselineRender
        try {
          sourceBoundBaselineRender = await renderPaginatedPaper(
            sourceBoundBaselineHtml,
          )
        } finally {
          await closeChromiumPool()
        }
        writeFileSync(
          sourceBoundBaselinePath,
          sourceBoundBaselineRender.pdfBytes,
        )
        const sourceBoundLabel =
          `${versionType === 'student' ? 'Student' : 'Teacher'} Chromium PDF Seven Choices source-bound baseline`
        assertPdfA4AndUnclipped(sourceBoundBaselinePath, sourceBoundLabel)
        assertPdfSevenChoicesGoldenGeometry(
          sourceBoundBaselinePath,
          sourceBoundLabel,
          {
            bundleId: versionType === 'student'
              ? 'pdf-student'
              : 'pdf-teacher',
            variant: `${versionType}-baseline`,
            recordCoverage: recordSevenChoicesCoverage,
          },
        )
        assertPdfSevenChoicesRoleGraph(
          sourceBoundBaselinePath,
          sourceBoundLabel,
          {
            teacher: versionType === 'teacher',
            boundaryRelation: versionType === 'teacher'
              ? 'cross_page'
              : 'same_page',
            passageRelation: 'same_page',
            passageBankRelation: versionType === 'teacher'
              ? 'cross_page'
              : 'same_page',
            bundleId: versionType === 'student'
              ? 'pdf-student'
              : 'pdf-teacher',
            variant: `${versionType}-baseline`,
            recordCoverage: recordSevenChoicesCoverage,
          },
        )
      }
      assert.ok(
        printInstructionVariantHtml,
        'the real Student Print instruction variant is available',
      )
      const variant = readingPdfRoleOracle.exactA4Variant
      const readingEnd = readingPdfRoleOracle.readingEnd
      const variantCss = `
<style>
[data-canonical-question-id="${variant.stemQuestionId}"] .stem {
  width: ${variant.stemWidthPt}pt !important;
}
[data-canonical-question-id="${variant.wrappedOptionQuestionId}"] .canonical-options {
  width: ${variant.wrappedOptionWidthPt}pt !important;
  grid-template-columns: ${variant.wrappedOptionWidthPt}pt !important;
}
[data-canonical-reading-following-for="${readingEnd.groupId}"] {
  break-before: page !important;
  page-break-before: always !important;
}
</style>`
      const variantHtml = printInstructionVariantHtml.replace(
        '</head>',
        `${variantCss}</head>`,
      )
      const variantPdfPath = path.join(
        outputDir,
        'print-student-reading-rhythm-variants.pdf',
      )
      let variantRender
      try {
        variantRender = await renderPaginatedPaper(variantHtml)
      } finally {
        await closeChromiumPool()
      }
      writeFileSync(variantPdfPath, variantRender.pdfBytes)
      assert.equal(
        variantRender.pdfBytes.subarray(0, 4).toString(),
        '%PDF',
        'the real paginated exact-A4 variant emits Chromium PDF bytes',
      )
      assertPdfA4AndUnclipped(
        variantPdfPath,
        'Student Chromium PDF complete Reading rhythm variant',
      )
      pdfRhythmEvidence.push(assertPdfReadingVerticalRhythm(
        variantPdfPath,
        consumers.print_pdf,
        'Student Chromium PDF complete Reading rhythm variant',
        {
          requireInstruction: true,
          requireTwoLineStem: true,
          requireWrappedOption: true,
          requireCrossPageEnd: true,
        },
      ))
      const sevenChoicesPdfVariantHtml = buildPrintHtml({
        title: 'Canonical Import Pilot Seven Choices student PDF variants',
        versionType: 'student',
        items: sevenChoicesPdfCoverageItems,
        blocks: sevenChoicesPdfCoverageBlocks,
        questionNumberStart: 33,
        printStyle: 'exam',
        canonicalConsumption: consumers.print_pdf,
        sevenChoicesBankHeading:
          sevenChoicesSourceOracle.oracle.variants.bankHeadingVisibleText,
      }).replace(
          '</head>',
          `<style>
.canonical-option-bank {
  width: ${sevenChoicesSourceOracle.oracle.variants.printWrappedOptionWidthPt}pt !important;
}
.canonical-option-bank-item:nth-child(5) {
  break-before: page !important;
  page-break-before: always !important;
}
</style></head>`,
        )
      const sevenChoicesPdfVariantPath = path.join(
        outputDir,
        'print-student-seven-choices-golden-geometry-variants.pdf',
      )
      let sevenChoicesVariantRender
      try {
        sevenChoicesVariantRender = await renderPaginatedPaper(
          sevenChoicesPdfVariantHtml,
        )
      } finally {
        await closeChromiumPool()
      }
      writeFileSync(
        sevenChoicesPdfVariantPath,
        sevenChoicesVariantRender.pdfBytes,
      )
      assertPdfA4AndUnclipped(
        sevenChoicesPdfVariantPath,
        'Student Chromium PDF Seven Choices wrapped/cross-page adversary',
      )
      assertPdfSevenChoicesGoldenGeometry(
        sevenChoicesPdfVariantPath,
        'Student Chromium PDF Seven Choices wrapped/cross-page adversary',
        {
          headingText:
            sevenChoicesSourceOracle.oracle.variants.bankHeadingVisibleText,
          requireWrappedOption: true,
          requireCrossPageBank: true,
          bundleId: 'pdf-student',
          variant: 'student-bank-heading-wrapped-bank-pagination',
          recordCoverage: recordSevenChoicesCoverage,
        },
      )
      assertPdfSevenChoicesRoleGraph(
        sevenChoicesPdfVariantPath,
        'Student Chromium PDF Seven Choices wrapped/cross-page adversary',
        {
          headingText:
            sevenChoicesSourceOracle.oracle.variants.bankHeadingVisibleText,
          boundaryRelation: 'same_page',
          passageRelation: 'same_page',
          passageBankRelation: 'same_page',
          followingRelation: 'same_page',
          bundleId: 'pdf-student',
          variant: 'student-bank-heading-wrapped-bank-pagination',
          recordCoverage: recordSevenChoicesCoverage,
        },
      )
      const sevenChoicesStudentContinuationHtml =
        sevenChoicesPdfVariantHtml.replace(
          '</head>',
          `<style>
.question-group[data-canonical-group-type="sevenChoices"] .passage p:nth-child(2) {
  width: 50pt !important;
  orphans: 1 !important;
  widows: 1 !important;
}
</style></head>`,
        )
      const sevenChoicesStudentContinuationPath = path.join(
        outputDir,
        'print-student-seven-choices-same-passage-continuation.pdf',
      )
      let sevenChoicesStudentContinuationRender
      try {
        sevenChoicesStudentContinuationRender = await renderPaginatedPaper(
          sevenChoicesStudentContinuationHtml,
        )
      } finally {
        await closeChromiumPool()
      }
      writeFileSync(
        sevenChoicesStudentContinuationPath,
        sevenChoicesStudentContinuationRender.pdfBytes,
      )
      assertPdfA4AndUnclipped(
        sevenChoicesStudentContinuationPath,
        'Student Chromium PDF Seven Choices same-passage continuation adversary',
      )
      assertPdfSevenChoicesSamePassageContinuation(
        sevenChoicesStudentContinuationPath,
        'Student Chromium PDF Seven Choices same-passage continuation adversary',
        {
          bundleId: 'pdf-student',
          variant: 'student-bank-heading-wrapped-bank-pagination',
          recordCoverage: recordSevenChoicesCoverage,
        },
      )
      const sevenChoicesFullGraphVariantHtml = buildPrintHtml({
        title: 'Canonical Import Pilot Seven Choices student cross-page coverage',
        versionType: 'student',
        items: sevenChoicesPdfCoverageItems,
        blocks: sevenChoicesPdfCoverageBlocks,
        questionNumberStart: 33,
        printStyle: 'exam',
        canonicalConsumption: consumers.print_pdf,
      }).replace(
        '</head>',
        `<style>
[data-canonical-seven-choices-reading-boundary-group-id],
.canonical-option-bank-region,
[data-canonical-seven-choices-following-for] {
  break-before: page !important;
  page-break-before: always !important;
}
</style></head>`,
      )
      const sevenChoicesFullGraphVariantPath = path.join(
        outputDir,
        'print-student-seven-choices-full-role-graph-variants.pdf',
      )
      let sevenChoicesFullGraphVariantRender
      try {
        sevenChoicesFullGraphVariantRender = await renderPaginatedPaper(
          sevenChoicesFullGraphVariantHtml,
        )
      } finally {
        await closeChromiumPool()
      }
      writeFileSync(
        sevenChoicesFullGraphVariantPath,
        sevenChoicesFullGraphVariantRender.pdfBytes,
      )
      assertPdfA4AndUnclipped(
        sevenChoicesFullGraphVariantPath,
        'Student Chromium PDF Seven Choices complete cross-page role graph',
      )
      assertPdfSevenChoicesGoldenGeometry(
        sevenChoicesFullGraphVariantPath,
        'Student Chromium PDF Seven Choices complete cross-page role graph',
        {
          bundleId: 'pdf-student',
          variant: 'student-cross-page-role-graph',
          recordCoverage: recordSevenChoicesCoverage,
        },
      )
      assertPdfSevenChoicesRoleGraph(
        sevenChoicesFullGraphVariantPath,
        'Student Chromium PDF Seven Choices complete cross-page role graph',
        {
          boundaryRelation: 'cross_page',
          passageRelation: 'same_page',
          passageBankRelation: 'cross_page',
          followingRelation: 'cross_page',
          bundleId: 'pdf-student',
          variant: 'student-cross-page-role-graph',
          recordCoverage: recordSevenChoicesCoverage,
        },
      )
      const sevenChoicesTeacherHeadingPdfHtml = buildPrintHtml({
        title: 'Canonical Import Pilot Seven Choices teacher PDF coverage',
        versionType: 'teacher',
        items: sevenChoicesPdfCoverageItems,
        blocks: sevenChoicesPdfCoverageBlocks,
        questionNumberStart: 33,
        printStyle: 'exam',
        canonicalConsumption: consumers.print_pdf,
        sevenChoicesBankHeading:
          sevenChoicesSourceOracle.oracle.variants.bankHeadingVisibleText,
      }).replace(
        '</head>',
        `<style>
.canonical-option-bank {
  width: ${sevenChoicesSourceOracle.oracle.variants.printWrappedOptionWidthPt}pt !important;
}
.canonical-option-bank-item:nth-child(5) {
  break-before: page !important;
  page-break-before: always !important;
}
</style></head>`,
      )
      const sevenChoicesTeacherHeadingPdfPath = path.join(
        outputDir,
        'print-teacher-seven-choices-heading-bank-variants.pdf',
      )
      let sevenChoicesTeacherHeadingPdfRender
      try {
        sevenChoicesTeacherHeadingPdfRender = await renderPaginatedPaper(
          sevenChoicesTeacherHeadingPdfHtml,
        )
      } finally {
        await closeChromiumPool()
      }
      writeFileSync(
        sevenChoicesTeacherHeadingPdfPath,
        sevenChoicesTeacherHeadingPdfRender.pdfBytes,
      )
      assertPdfA4AndUnclipped(
        sevenChoicesTeacherHeadingPdfPath,
        'Teacher Chromium PDF Seven Choices heading/wrapped/bank pagination graph',
      )
      assertPdfSevenChoicesGoldenGeometry(
        sevenChoicesTeacherHeadingPdfPath,
        'Teacher Chromium PDF Seven Choices heading/wrapped/bank pagination graph',
        {
          headingText:
            sevenChoicesSourceOracle.oracle.variants.bankHeadingVisibleText,
          requireWrappedOption: true,
          requireCrossPageBank: true,
          bundleId: 'pdf-teacher',
          variant: 'teacher-bank-heading-wrapped-bank-pagination',
          recordCoverage: recordSevenChoicesCoverage,
        },
      )
      assertPdfSevenChoicesRoleGraph(
        sevenChoicesTeacherHeadingPdfPath,
        'Teacher Chromium PDF Seven Choices heading/wrapped/bank pagination graph',
        {
          teacher: true,
          headingText:
            sevenChoicesSourceOracle.oracle.variants.bankHeadingVisibleText,
          boundaryRelation: 'same_page',
          passageRelation: 'same_page',
          followingRelation: 'same_page',
          bundleId: 'pdf-teacher',
          variant: 'teacher-bank-heading-wrapped-bank-pagination',
          recordCoverage: recordSevenChoicesCoverage,
        },
      )
      const sevenChoicesTeacherContinuationHtml =
        sevenChoicesTeacherHeadingPdfHtml.replace(
          '</head>',
          `<style>
.question-group[data-canonical-group-type="sevenChoices"] .passage p:nth-child(2) {
  width: 50pt !important;
  orphans: 1 !important;
  widows: 1 !important;
}
</style></head>`,
        )
      const sevenChoicesTeacherContinuationPath = path.join(
        outputDir,
        'print-teacher-seven-choices-same-passage-continuation.pdf',
      )
      let sevenChoicesTeacherContinuationRender
      try {
        sevenChoicesTeacherContinuationRender = await renderPaginatedPaper(
          sevenChoicesTeacherContinuationHtml,
        )
      } finally {
        await closeChromiumPool()
      }
      writeFileSync(
        sevenChoicesTeacherContinuationPath,
        sevenChoicesTeacherContinuationRender.pdfBytes,
      )
      assertPdfA4AndUnclipped(
        sevenChoicesTeacherContinuationPath,
        'Teacher Chromium PDF Seven Choices same-passage continuation adversary',
      )
      assertPdfSevenChoicesSamePassageContinuation(
        sevenChoicesTeacherContinuationPath,
        'Teacher Chromium PDF Seven Choices same-passage continuation adversary',
        {
          bundleId: 'pdf-teacher',
          variant: 'teacher-bank-heading-wrapped-bank-pagination',
          recordCoverage: recordSevenChoicesCoverage,
        },
      )
      const sevenChoicesTeacherCrossPageHtml = buildPrintHtml({
        title: 'Canonical Import Pilot Seven Choices teacher cross-page coverage',
        versionType: 'teacher',
        items: sevenChoicesPdfCoverageItems,
        blocks: sevenChoicesPdfCoverageBlocks,
        questionNumberStart: 33,
        printStyle: 'exam',
        canonicalConsumption: consumers.print_pdf,
      }).replace(
        '</head>',
        `<style>
[data-canonical-seven-choices-reading-boundary-group-id],
.canonical-option-bank-region,
[data-canonical-seven-choices-following-for] {
  break-before: page !important;
  page-break-before: always !important;
}
.canonical-option-bank-item:nth-child(5) {
  break-before: page !important;
  page-break-before: always !important;
}
</style></head>`,
      )
      const sevenChoicesTeacherCrossPagePath = path.join(
        outputDir,
        'print-teacher-seven-choices-full-role-graph-variants.pdf',
      )
      let sevenChoicesTeacherCrossPageRender
      try {
        sevenChoicesTeacherCrossPageRender = await renderPaginatedPaper(
          sevenChoicesTeacherCrossPageHtml,
        )
      } finally {
        await closeChromiumPool()
      }
      writeFileSync(
        sevenChoicesTeacherCrossPagePath,
        sevenChoicesTeacherCrossPageRender.pdfBytes,
      )
      assertPdfA4AndUnclipped(
        sevenChoicesTeacherCrossPagePath,
        'Teacher Chromium PDF Seven Choices complete cross-page role graph',
      )
      assertPdfSevenChoicesGoldenGeometry(
        sevenChoicesTeacherCrossPagePath,
        'Teacher Chromium PDF Seven Choices complete cross-page role graph',
        {
          requireCrossPageBank: true,
          bundleId: 'pdf-teacher',
          variant: 'teacher-complete-cross-page-role-graph',
          recordCoverage: recordSevenChoicesCoverage,
        },
      )
      assertPdfSevenChoicesRoleGraph(
        sevenChoicesTeacherCrossPagePath,
        'Teacher Chromium PDF Seven Choices complete cross-page role graph',
        {
          teacher: true,
          boundaryRelation: 'cross_page',
          passageRelation: 'same_page',
          passageBankRelation: 'cross_page',
          followingRelation: 'cross_page',
          bundleId: 'pdf-teacher',
          variant: 'teacher-complete-cross-page-role-graph',
          recordCoverage: recordSevenChoicesCoverage,
        },
      )
      assert.deepEqual(
        [...new Set(pdfRhythmEvidence.flatMap(
          (evidence) => [...evidence.edgeIds],
        ))].sort(),
        passageLetterReference.evidence.normalizedContract.adjacencyGraph
          .map((edge) => edge.edgeId)
          .sort(),
        'Student/Teacher exact-A4 PDFs execute the complete independent Reading adjacency graph',
      )
      assert.deepEqual(
        [...new Set(pdfRhythmEvidence.flatMap((evidence) =>
          evidence.observations
            .filter((observation) =>
              Number.isFinite(observation.distancePt))
            .map((observation) => observation.edgeId)))].sort(),
        passageLetterReference.evidence.normalizedContract.adjacencyGraph
          .filter((edge) => !edge.pageRelation)
          .map((edge) => edge.edgeId)
          .sort(),
        'every ratio-based Reading adjacency edge has an exact same-page PDF-point measurement',
      )
      assert.equal(
        existsSync(forbiddenToolMarker),
        false,
        'direct Chromium PDFs do not invoke DOCX or LibreOffice output tools',
      )
    } finally {
      await browser.close()
    }

    assertSupportedConsumerParity(consumers)
    const sevenChoicesCoverageLedger = assertSevenChoicesObservedCoverage(
      sevenChoicesCoverageObservations,
    )
    const clozeCoverageLedger = assertClozeObservedCoverage(
      clozeCoverageObservations,
    )
    const grammarFillCoverageLedger = assertGrammarFillObservedCoverage(
      grammarFillCoverageObservations,
    )
    assertApplicationWritingObservedCoverage(
      applicationWritingCoverageLedger,
    )
    const artifactFiles = listFiles(outputDir)
    assert.equal(
      artifactFiles.some((file) => /\.(?:docx|xml)$/i.test(file)),
      false,
      'pilot generates no DOCX or OOXML artifact',
    )
    completed = true
    return {
      appUrl,
      baseUrl,
      plainUrl: new URL(
        `canonical-consumption-qa.html?paperId=${encodeURIComponent(paperId)}`,
        appUrl,
      ).href,
      lectureUrl: new URL(
        `canonical-consumption-qa.html?paperId=${encodeURIComponent(paperId)}`
        + `&lecture=1&focusGroupId=${encodeURIComponent(draft.firstGroup.groupId)}`
        + `&questionId=${encodeURIComponent(draft.firstGroup.questionIds[0])}`,
        appUrl,
      ).href,
      artifactFiles,
      passageLetterGeometry,
      sevenChoicesCoverageLedger,
      clozeCoverageLedger,
      grammarFillCoverageLedger,
      grammarFillPoisonRejections,
      applicationWritingCoverageLedger,
      closeServices,
    }
  } finally {
    if (!keepServices || !completed) await closeServices()
  }
}

const passageLetterReference = assertPassageLetterReferenceEvidence()
const readingPredecessorOracle = assertReadingPredecessorOracle()
const readingPdfRoleOracle = assertReadingPdfRoleOracle()
const sevenChoicesSourceOracle = assertSevenChoicesSourceOracle()
const sevenChoicesReference = assertSevenChoicesReferenceEvidence()
const sevenChoicesCoverageOracle = assertSevenChoicesCoverageOracle()
const clozeSourceOracle = assertClozeSourceOracle()
const clozeReference = assertClozeReferenceEvidence()
const clozeCoverageOracle = assertClozeCoverageOracle()
const grammarFillSourceOracle = assertGrammarFillSourceOracle()
const grammarFillPublicAdversaryOracle =
  assertGrammarFillPublicAdversaryOracle()
const grammarFillReference = assertGrammarFillReferenceEvidence()
const grammarFillCoverageOracle = assertGrammarFillCoverageOracle()
const applicationWritingEvidence =
  assertApplicationWritingReferenceEvidence()
const rootDir = mkdtempSync(path.join(tmpdir(), 'eqb-canonical-import-pilot-'))
const dbPath = path.join(rootDir, 'question-bank.sqlite')
const paperAssetsDir = path.join(rootDir, 'paper-assets')
let db = new DatabaseSync(dbPath)

try {
  db.exec(readFileSync(path.join(repositoryRoot, 'data/sql/schema.sql'), 'utf8'))
  const files = readImportPackageFromDirectory(sourcePackageDir)
  const filesByName = Object.fromEntries(
    files.map(({ fileName, buffer }) => [fileName, buffer]),
  )
  const validation = validatePaperImportPackage(files)
  assert.equal(validation.ok, true)
  const sourceDocument = validation.packageData.sourceDocx
  assert.equal(sourceDocument.kind, 'pdf')
  const requestPath = path.join(
    sourcePackageDir,
    'canonical-evidence/canonical-import-request-v26.json',
  )
  execFileSync(process.execPath, [
    path.join(
      repositoryRoot,
      'scripts/import-pipeline/build-canonical-request.mjs',
    ),
    sourcePackageDir,
    '--answers-pdf',
    path.join(
      sourcePackageDir,
      'canonical-evidence/06-source_answers_pdf.pdf',
    ),
    '--instruction-evidence',
    path.join(
      sourcePackageDir,
      'canonical-evidence/03-continuation_writing_instruction_evidence.json',
    ),
    '--reviewed-evidence-dir',
    path.join(sourcePackageDir, 'reviewed-evidence'),
    '--output-dir',
    path.dirname(requestPath),
    '--request-file-name',
    path.basename(requestPath),
  ], { stdio: 'pipe' })
  const loadedRequest = loadCanonicalImportRequest(requestPath)
  const loadedSourceDocument = loadedRequest.evidence.documents.find(
    (document) => document.inputKey === 'original_question_source',
  )
  assert.ok(loadedSourceDocument, 'operator envelope captures the source PDF')
  assert.equal(
    Buffer.compare(
      Buffer.from(loadedSourceDocument.bytes),
      sourceDocument.buffer,
    ),
    0,
    'operator envelope captures the exact admitted source PDF bytes',
  )

  const beforeDryRun = {
    tree: snapshotTree(paperAssetsDir),
    database: snapshotDatabase(db),
  }
  const dryRun = admitCanonicalPaperImport({
    request: loadedRequest,
    sourceAssetVersion: 1,
    sourceAsset: filesByName['paper-asset.json'],
  })
  assert.equal(dryRun.ok, true)
  const capturedSourceDocument =
    dryRun.compilation.artifacts.sourceCapture.documents.find(
      (document) => document.inputKey === 'original_question_source',
    )
  assert.equal(capturedSourceDocument.originalName, sourceDocument.fileName)
  assert.equal(
    capturedSourceDocument.sha256,
    `sha256:${sha256(sourceDocument.buffer)}`,
  )
  assert.equal(
    dryRun.compilation.artifacts.canonicalPaper.paperPlan.slotBindings
      .filter((binding) => binding.state === 'inactive').length,
    2,
    'canonical Plan closes both Listening slots as inactive',
  )
  assert.equal(
    dryRun.compilation.artifacts.normalizationReport.inactiveSourceClosures
      .length,
    2,
    'normalization evidence closes both inactive Listening source slices',
  )
  assert.deepEqual(snapshotTree(paperAssetsDir), beforeDryRun.tree)
  assert.deepEqual(snapshotDatabase(db), beforeDryRun.database)

  const assertPromptEvidenceRejected = (caseId, mutate) => {
    const attackedRequest = structuredClone(loadedRequest)
    const promptDocument = attackedRequest.evidence.documents.find(
      (document) =>
        document.inputKey === 'grammar_fill_prompt_source_capture',
    )
    mutate(attackedRequest, promptDocument)
    const attacked = admitCanonicalPaperImport({
      request: attackedRequest,
      sourceAssetVersion: 1,
      sourceAsset: filesByName['paper-asset.json'],
    })
    assert.equal(attacked.ok, false, `${caseId} fails closed`)
    assert.equal(
      attacked.diagnostics.some(
        (diagnostic) =>
          [
            'GRAMMAR_FILL_PROMPT_SOURCE_CAPTURE_REQUIRED',
            'GRAMMAR_FILL_PROMPT_SOURCE_CAPTURE_INVALID',
            'GRAMMAR_FILL_PROMPT_EVIDENCE_INCOMPLETE',
          ].includes(diagnostic.code),
      ),
      true,
      `${caseId} reports a Grammar Fill prompt authority diagnostic`,
    )
  }
  assertPromptEvidenceRejected(
    'missing Grammar Fill prompt source capture',
    (request) => {
      request.evidence.documents = request.evidence.documents.filter(
        (document) =>
          document.inputKey !== 'grammar_fill_prompt_source_capture',
      )
    },
  )
  assertPromptEvidenceRejected(
    'incomplete Grammar Fill prompt source capture',
    (_request, document) => {
      const evidence = JSON.parse(new TextDecoder().decode(document.bytes))
      evidence.rows.splice(0, 1)
      document.bytes = new TextEncoder().encode(JSON.stringify(evidence))
    },
  )
  assertPromptEvidenceRejected(
    'bogus Grammar Fill prompt source capture',
    (_request, document) => {
      const evidence = JSON.parse(new TextDecoder().decode(document.bytes))
      evidence.rows[0].prompt = 'bogus-source-prompt'
      document.bytes = new TextEncoder().encode(JSON.stringify(evidence))
    },
  )

  let publisherCaptureCount = 0
  const captureDocxSourceMediaImpl = () => {
    publisherCaptureCount += 1
    throw new Error('PDF source must not enter DOCX media capture')
  }
  const publishPilot = (options = {}) => publishPaperImportPackage({
    files,
    db,
    paperAssetsDir,
    canonicalRequest: loadedRequest,
    captureDocxSourceMediaImpl,
    ...options,
  })
  const published = publishPilot()
  assert.equal(
    published.status,
    'published',
    `canonical publish diagnostics: ${JSON.stringify(
      published.canonicalAdmission?.diagnostics || [],
    )}`,
  )
  assert.equal(published.publish.assetVersion, 1)
  const first = await exactReload({
    db,
    paperAssetsDir,
    expectedVersion: 'v1',
  })

  assert.throws(
    () => publishPilot({
      failurePoint: 'after-commit',
    }),
    { code: 'CANONICAL_PUBLICATION_FORCED_RELOAD_FAILURE' },
  )
  db.close()
  db = new DatabaseSync(dbPath)
  const retry = publishPilot()
  assert.equal(retry.status, 'idempotent')
  assert.equal(retry.publish.assetVersion, 2)
  await exactReload({
    db,
    paperAssetsDir,
    expectedVersion: 'v2',
  })

  const rollback = rollbackPaperImportPublication({
    db,
    paperAssetsDir,
    paperId,
    versionName: first.ref.versionName,
  })
  assert.equal(rollback.status, 'rolled_back')
  const restored = await exactReload({
    db,
    paperAssetsDir,
    expectedVersion: 'v1',
  })
  assert.equal(restored.ref.publicationDigest, first.ref.publicationDigest)
  assert.equal(
    publisherCaptureCount,
    0,
    'public publish and retry keep PDF input outside DOCX capture',
  )
  const restoredVersionDir = path.join(
    paperAssetsDir,
    paperId,
    'versions',
    first.ref.versionName,
  )
  const immutableSourcePath = path.join(
    restoredVersionDir,
    'raw',
    sourceDocument.fileName,
  )
  assert.deepEqual(
    readFileSync(immutableSourcePath),
    Buffer.from(sourceDocument.buffer),
    'immutable version preserves the exact PDF source bytes',
  )
  assert.equal(
    existsSync(path.join(restoredVersionDir, 'raw', 'docx-source-capture.json')),
    false,
    'PDF input creates no DOCX capture sidecar',
  )
  db.close()
  db = null

  const head = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  }).trim()
  const outputDir = provisionActualArtifacts
    ? path.join(
        repositoryRoot,
        '.scratch/paper-canonical-ticket-20-qa',
        head,
      )
    : path.join(rootDir, 'rendered-artifacts')
  if (provisionActualArtifacts && existsSync(outputDir)) {
    rmSync(outputDir, { recursive: true, force: true })
  }
  const publishedAnalysisDir = path.join(
    paperAssetsDir,
    paperId,
    'latest',
    'analyses',
  )
  mkdirSync(publishedAnalysisDir, { recursive: true })
  const publishedClozeAnalysisPath = path.join(
    publishedAnalysisDir,
    'cloze-analysis-v1.json',
  )
  const reviewedClozeAnalysisBytes = readFileSync(
    clozeSourceOracle.teacherAnalysisPath,
  )
  writeFileSync(publishedClozeAnalysisPath, reviewedClozeAnalysisBytes)
  assert.deepEqual(
    readFileSync(publishedClozeAnalysisPath),
    reviewedClozeAnalysisBytes,
    'Teacher public proof consumes the exact digest-bound reviewed Cloze analysis bytes',
  )
  const publishedGrammarFillAnalysisPath = path.join(
    publishedAnalysisDir,
    'grammar-fill-analysis-v1.json',
  )
  const reviewedGrammarFillAnalysisBytes = readFileSync(
    grammarFillSourceOracle.teacherAnalysisPath,
  )
  writeFileSync(
    publishedGrammarFillAnalysisPath,
    reviewedGrammarFillAnalysisBytes,
  )
  assert.deepEqual(
    readFileSync(publishedGrammarFillAnalysisPath),
    reviewedGrammarFillAnalysisBytes,
    'Teacher public proof consumes the exact digest-bound reviewed Grammar Fill analysis bytes',
  )
  const rendered = await renderSupportedArtifacts({
    dbPath,
    paperAssetsDir,
    outputDir,
    consumers: restored.consumers,
    keepServices: keepQaServer,
  })
  const sourcePackageDigests = Object.fromEntries(
    files.map(({ fileName, buffer }) => [fileName, sha256(buffer)]),
  )
  const canonicalEvidenceDigests = Object.fromEntries(
    dryRun.compilation.artifacts.sourceCapture.documents.map((document) => [
      document.inputKey,
      document.sha256,
    ]),
  )
  const renderedArtifactDigests = Object.fromEntries(
    rendered.artifactFiles.map((relativePath) => [
      relativePath,
      sha256(readFileSync(path.join(outputDir, relativePath))),
    ]),
  )
  const forbiddenOutputArtifacts = rendered.artifactFiles.filter(
    (relativePath) => /\.(?:docx|xml)$/i.test(relativePath),
  )
  writeFileSync(path.join(outputDir, 'evidence.json'), `${JSON.stringify({
    schemaVersion: 'canonical-import-pilot-evidence-v1',
    head,
    sourcePackage: path.relative(repositoryRoot, sourcePackageDir),
    sourcePackageDigests,
    canonicalRequestDigest: sha256(readFileSync(requestPath)),
    readingPassageLetterReferenceDigest: passageLetterReference.digest,
    sevenChoicesReferenceDigest: sevenChoicesReference.digest,
    sevenChoicesSourceOracleDigest: sevenChoicesSourceOracle.digest,
    sevenChoicesCoverageOracleDigest: sevenChoicesCoverageOracle.digest,
    clozeReferenceDigest: clozeReference.digest,
    clozeSourceOracleDigest: clozeSourceOracle.digest,
    clozeCoverageOracleDigest: clozeCoverageOracle.digest,
    canonicalEvidenceDigests,
    dryRun: {
      validation: 'ready',
      canonicalAdmission: 'ready',
      storeMutationCount: 0,
      sourceCaptureDocument: {
        inputKey: capturedSourceDocument.inputKey,
        originalName: capturedSourceDocument.originalName,
        sha256: capturedSourceDocument.sha256,
      },
      inactiveListeningSlotCount: 2,
    },
    publish: {
      initialVersion: first.ref,
      recoveryRetryVersion: 'v2',
      retryStatus: retry.status,
      rollbackStatus: rollback.status,
      restoredVersion: restored.ref,
      publisherDocxCaptureCount: publisherCaptureCount,
      immutableSource: {
        relativePath: path.relative(paperAssetsDir, immutableSourcePath),
        inputSha256: sha256(sourceDocument.buffer),
        publishedSha256: sha256(readFileSync(immutableSourcePath)),
      },
    },
    consumers: {
      ids: Object.keys(restored.consumers).sort(),
      semanticParity: 'exact',
      listeningOccurrenceCount: 0,
    },
    renderedPassageLetterGeometry: rendered.passageLetterGeometry,
    sevenChoicesPublicSeamCoverage: {
      sourceOracles: ['original-question-pdf', 'official-answer-json'],
      producers: ['PaperBrowse', 'buildPrintHtml', 'renderPaginatedPaper'],
      variants: [
        'baseline-student-teacher',
        'optional-chrome-collapse',
        'optional-bank-heading',
        'wrapped-options',
        'same-and-cross-page-passage',
        'reading-boundary-cross-page',
        'passage-to-bank-cross-page',
        'bank-between-options-cross-page',
        'student-following-section-cross-page',
        'teacher-tail-following-section-cross-page',
      ],
      observedLedger: rendered.sevenChoicesCoverageLedger,
    },
    clozePublicSeamCoverage: {
      sourceOracles: [
        'original-question-pdf',
        'paper-asset-json',
        'official-answer-json',
      ],
      producers: ['PaperBrowse', 'buildPrintHtml', 'renderPaginatedPaper'],
      variants: [
        'plain-and-lecture-baseline',
        'screen-and-print-wrapped-options',
        'student-and-teacher-baseline',
        'same-passage-cross-page',
        'choice-block-cross-page',
        'following-section-cross-page',
      ],
      observedLedger: rendered.clozeCoverageLedger,
    },
    grammarFillPublicSeamCoverage: {
      sourceOracles: [
        'original-question-pdf',
        'versioned-paper-asset-json',
        'official-answer-json',
        'reviewed-analysis-json',
        'checked-in-public-adversary-oracle',
      ],
      producers: ['PaperBrowse', 'buildPrintHtml', 'renderPaginatedPaper'],
      variants: [
        'plain-and-lecture-baseline',
        'screen-and-print-wrapped-lines',
        'student-and-teacher-baseline',
        'same-passage-cross-page',
        'line-end-blank',
        'following-section-cross-page',
      ],
      observedLedger: rendered.grammarFillCoverageLedger,
      failClosedPoisonRejections:
        rendered.grammarFillPoisonRejections,
    },
    applicationWritingPublicSeamCoverage: {
      sourceOracles: [
        'page-11-dimensionless-reference',
        'original-question-pdf',
        'versioned-paper-asset-json',
        'official-answer-json',
        'official-reference-pdf',
        'application-source-capture',
        'reviewed-application-transcription',
      ],
      producers: ['PaperBrowse', 'buildPrintHtml', 'renderPaginatedPaper'],
      variants: [
        'plain-and-lecture-source-bound-baseline',
        'source-bound-wrapped-prompt',
        'student-and-teacher-print-baseline',
        'atomic-response-region',
        'source-bound-insufficient-space-response-move',
        'same-and-cross-page-family-transition',
        'source-unapproved-teacher-tail-collapse',
      ],
      observedLedger: rendered.applicationWritingCoverageLedger,
    },
    renderedArtifactDigests,
    forbiddenOutputArtifacts,
    directPdfOutputToolSentinel: 'not_called',
  }, null, 2)}\n`)
  writeFileSync(path.join(outputDir, 'HEAD.txt'), `${head}\n`)
  if (provisionActualArtifacts) {
    console.log(`QA artifacts: ${outputDir}`)
  }
  if (keepQaServer) {
    try {
      await runCanonicalImportPilotQaSession({
        startArtifactServer: injectQaArtifactServerStartupFailure
          ? async () => {
              throw new Error('Injected QA artifact server startup failure')
            }
          : undefined,
        artifactServerOptions: {
          repositoryRoot,
          head,
        },
        closeRenderedServices: rendered.closeServices,
        run: async (qaArtifactServer) => {
          assert.equal(
            qaArtifactServer.artifactDir,
            outputDir,
            'QA artifact server binds the exact HEAD-scoped output directory',
          )
          await assertServedQaArtifacts({
            qaServer: qaArtifactServer,
            outputDir,
            head,
          })
          console.log(`QA plain URL: ${rendered.plainUrl}`)
          console.log(`QA lecture URL: ${rendered.lectureUrl}`)
          console.log(
            `QA Student Print HTML URL: ${
              qaArtifactServer.urls.studentPrintHtml
            }`,
          )
          console.log(
            `QA Teacher Print HTML URL: ${
              qaArtifactServer.urls.teacherPrintHtml
            }`,
          )
          console.log(
            `QA Student Chromium PDF URL: ${
              qaArtifactServer.urls.studentChromiumPdf
            }`,
          )
          console.log(
            `QA Teacher Chromium PDF URL: ${
              qaArtifactServer.urls.teacherChromiumPdf
            }`,
          )
          console.log('QA server is ready; stop this process after owner QA.')
          await new Promise((resolve) => {
            process.once('SIGINT', resolve)
            process.once('SIGTERM', resolve)
          })
        },
      })
    } catch (error) {
      if (!injectQaArtifactServerStartupFailure) throw error
      const retainedServiceProbeComplete = new Promise((resolve) => {
        const keepAlive = setInterval(() => {}, 1_000)
        const finish = () => {
          clearInterval(keepAlive)
          resolve()
        }
        process.once('SIGINT', finish)
        process.once('SIGTERM', finish)
      })
      console.log(
        `QA retained-service cleanup probes: ${JSON.stringify({
          api: new URL('/api/health', rendered.baseUrl).href,
          vite: rendered.appUrl,
        })}`,
      )
      await retainedServiceProbeComplete
      throw error
    }
  }
  console.log('PASS backend canonical import pilot')
} finally {
  if (db) db.close()
  rmSync(rootDir, { recursive: true, force: true })
}
