import { readingOptionFigureAuthorityRef } from '../../shared/paper-canonical/authority.mjs'
import { digestJson, sha256 } from '../../shared/paper-canonical/stable.mjs'
import {
  confirmVisualImportCandidate,
  createVisualImportCandidate,
} from '../../server/paper-canonical/visualCandidate.mjs'
import { makeReadyCanonicalFixture } from './foundationFixture.mjs'

const optionPngBase64 = Object.freeze([
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==',
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNg+M/wHwAEAQH/cetH5QAAAABJRU5ErkJggg==',
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYPj/HwADAgH/5ncLrgAAAABJRU5ErkJggg==',
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAX+XDSwAAAABJRU5ErkJggg==',
])

function stableId(prefix, value) {
  return `${prefix}:${digestJson(value).slice('sha256:'.length, 28)}`
}

function pngArtifact(encodedBytes) {
  const bytes = new Uint8Array(Buffer.from(encodedBytes, 'base64'))
  return {
    mimeType: 'image/png',
    encodedBytes,
    byteLength: bytes.byteLength,
    sha256: sha256(bytes),
    pixelWidth: 1,
    pixelHeight: 1,
  }
}

function sourceDocument(inputKey, roles, mediaType, originalName, bytes) {
  const digest = sha256(bytes)
  const artifactId = stableId('source-document', { sha256: digest })
  return {
    documentId: stableId('document', { digest, roles, inputKey }),
    inputKey,
    roles,
    mediaType,
    originalName,
    byteLength: bytes.byteLength,
    sha256: digest,
    immutableArtifactRef: {
      artifactId,
      relativePath: `source-evidence/${artifactId.slice('source-document:'.length)}.bin`,
      sha256: digest,
      byteLength: bytes.byteLength,
    },
    encodedBytes: Buffer.from(bytes).toString('base64'),
  }
}

function visualSourceCapture(owners, artifacts) {
  const sourceBytes = new TextEncoder().encode('%PDF-1.7\n% frozen Reading Figure Option source\n')
  const document = sourceDocument(
    'reading_option_figure_source',
    ['question_source', 'source_provenance'],
    'application/pdf',
    'reading-option-figure-source.pdf',
    sourceBytes,
  )
  const observations = owners.map((owner, index) => ({
    observationId: `observation:reading-option-figure:${owner.optionId}`,
    documentId: document.documentId,
    kind: 'source_figure',
    value: { optionLabel: 'ABCD'[index] },
    order: index,
    extraction: { adapterId: 'canonical-fixture-evidence', version: '1' },
    sourceSpanId: `source-span:observation:reading-option-figure:${owner.optionId}`,
  }))
  const sourceSpans = observations.map((observation, index) => ({
    sourceSpanId: observation.sourceSpanId,
    documentId: document.documentId,
    documentDigest: document.sha256,
    coordinate: {
      kind: 'page_region',
      page: 1,
      region: { x: index * 0.25, y: 0.2, width: 0.25, height: 0.4 },
    },
  }))
  const body = {
    schemaVersion: 'source-capture-v1',
    documents: [document],
    observations,
    sourceSpans,
    assertions: [],
  }
  const digest = digestJson(body)
  return {
    sourceCapture: {
      ...body,
      captureId: `source-capture:${digest.slice('sha256:'.length, 28)}`,
      digest,
    },
    sourceBytes,
    observations,
    artifacts,
  }
}

function refreshFixtureSource(fixture) {
  for (let pass = 0; pass < 4; pass += 1) {
    const bytes = new TextEncoder().encode(JSON.stringify(fixture.source))
    for (const observation of fixture.source.observations) {
      if (
        observation.documentInputKey === 'questions'
        && observation.span?.kind !== 'page_region'
      ) {
        observation.span = { start: 0, end: bytes.byteLength }
      }
    }
  }
  const sourceAsset = new TextEncoder().encode(JSON.stringify(fixture.source))
  fixture.request.evidence.documents[0].bytes = sourceAsset
  return sourceAsset
}

export const readingOptionFigureFixtureOracle = Object.freeze({
  paperId: 'paper-canonical-fixture',
  groupId: 'group:reading.d',
  questionId: 'question:reading.d:1',
  optionIds: Object.freeze('ABCD'.split('').map(
    (label) => `option:question:reading.d:1:${label}`,
  )),
  mediaIds: Object.freeze('ABCD'.split('').map(
    (label) => `media:question:reading.d:1:${label}`,
  )),
})

export function makeReadingOptionFigureFixture() {
  const fixture = makeReadyCanonicalFixture()
  fixture.request.authority = structuredClone(readingOptionFigureAuthorityRef)
  const continuation = fixture.source.groups.find(
    (candidate) => candidate.family === 'continuation-writing',
  )
  continuation.variant = {
    family: 'continuation-writing',
    mode: 'legacy_opaque',
    writingTaskId: continuation.variant.writingTaskId,
    sourceTaskType: 'continuation',
    contentBlockRefs: continuation.content.blocks.map((block) => block.nodeId),
    sourceStarterBlockRefs: continuation.content.blocks
      .map((block) => block.nodeId)
      .filter((nodeId) => nodeId.includes(':starter:')),
    wordCountTarget: 150,
    wordCountTargetCertainty: 'explicit_legacy_field',
    wordCountScope: 'unspecified',
    choiceOwnership: { ownership: 'none' },
    response: {
      kind: 'generic_response_box',
      answerRegionRef: 'writing.continuation-box',
      ownership: 'product',
    },
  }
  const group = fixture.source.groups.find(
    (candidate) => candidate.groupId === readingOptionFigureFixtureOracle.groupId,
  )
  const question = group.variant.questions[0]
  const set = group.variant.choiceOwnership.sets[0]
  const artifacts = optionPngBase64.map(pngArtifact)
  const owners = set.options.map((option) => ({
    kind: 'reading_option',
    groupId: group.groupId,
    questionId: question.questionId,
    optionId: option.optionId,
  }))
  const visual = visualSourceCapture(owners, artifacts)
  const visualRequest = {
    sourceCapture: visual.sourceCapture,
    observations: owners.map((owner, index) => ({
      observationId: visual.observations[index].observationId,
      owner: structuredClone(owner),
      sourceCrop: structuredClone(artifacts[index]),
    })),
    candidates: owners.map((owner, index) => ({
      observationId: visual.observations[index].observationId,
      owner: structuredClone(owner),
      method: 'source_crop',
      artifact: structuredClone(artifacts[index]),
      sourceTruthChecklist: [
        { relationship: 'identity', sourceTruth: `source-authored Option ${'ABCD'[index]}` },
        { relationship: 'topology', sourceTruth: 'the source-authored topology is unchanged' },
      ],
    })),
  }
  const candidatePackage = createVisualImportCandidate(visualRequest)
  const teacherConfirmation = {
    schemaVersion: 'visual-teacher-confirmation-v1',
    packageDigest: candidatePackage.packageDigest,
    decisions: candidatePackage.observations.map((observation) => ({
      observationId: observation.observationId,
      owner: structuredClone(observation.owner),
      disposition: 'confirmed',
      selectedCandidateDigest: candidatePackage.candidates.find(
        (candidate) => candidate.observationId === observation.observationId,
      ).candidateDigest,
    })),
  }
  const confirmedSelection = confirmVisualImportCandidate(
    candidatePackage,
    teacherConfirmation,
  )

  fixture.source.observations.push(...owners.map((owner, index) => ({
    observationId: visual.observations[index].observationId,
    kind: 'source_figure',
    documentInputKey: 'reading_option_figure_source',
    value: { owner: structuredClone(owner) },
    span: structuredClone(visual.sourceCapture.sourceSpans[index].coordinate),
  })))
  group.media = artifacts.map((artifact, index) => {
    const bytes = new Uint8Array(Buffer.from(artifact.encodedBytes, 'base64'))
    const artifactId = stableId('source-document', { sha256: sha256(bytes) })
    return {
      mediaId: readingOptionFigureFixtureOracle.mediaIds[index],
      mimeType: 'image/png',
      sha256: artifact.sha256,
      pixelWidth: artifact.pixelWidth,
      pixelHeight: artifact.pixelHeight,
      sourceArtifactRef: { artifactId },
    }
  })
  set.options = set.options.map((option, index) => ({
    optionId: option.optionId,
    label: option.label,
    figure: { mediaId: group.media[index].mediaId },
  }))
  group.sourceSpanRefsByTarget ||= {}
  for (const [index, option] of set.options.entries()) {
    const sourceSpanId = visual.observations[index].sourceSpanId
    group.sourceSpanRefsByTarget[`option:${option.optionId}`] = [sourceSpanId]
    group.sourceSpanRefsByTarget[`media:${option.figure.mediaId}`] = [sourceSpanId]
  }

  fixture.request.evidence.documents.push(
    {
      inputKey: 'reading_option_figure_source',
      roles: ['question_source', 'source_provenance'],
      bytes: visual.sourceBytes,
      declared: {
        mediaType: 'application/pdf',
        originalName: 'reading-option-figure-source.pdf',
      },
    },
    ...artifacts.map((artifact, index) => ({
      inputKey: `reading_option_figure_${'abcd'[index]}`,
      roles: ['source_provenance'],
      bytes: new Uint8Array(Buffer.from(artifact.encodedBytes, 'base64')),
      declared: {
        mediaType: 'image/png',
        originalName: `reading-option-${'abcd'[index]}.png`,
      },
    })),
  )
  const sourceAsset = refreshFixtureSource(fixture)
  return {
    ...fixture,
    sourceAsset,
    candidatePackage,
    teacherConfirmation,
    confirmedSelection,
    selectedArtifacts: artifacts.map((artifact) => structuredClone(artifact)),
  }
}

export function refreshReadingOptionFigureFixture(fixture) {
  fixture.sourceAsset = refreshFixtureSource(fixture)
  return fixture
}
