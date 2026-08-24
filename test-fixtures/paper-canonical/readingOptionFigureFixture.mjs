import { deflateSync } from 'node:zlib'

import { readingOptionFigureAuthorityRef } from '../../shared/paper-canonical/authority.mjs'
import { digestJson, sha256 } from '../../shared/paper-canonical/stable.mjs'
import {
  confirmVisualImportCandidate,
  createVisualImportCandidate,
} from '../../server/paper-canonical/visualCandidate.mjs'
import { makeReadyCanonicalFixture } from './foundationFixture.mjs'

const optionPngFixtures = Object.freeze([
  Object.freeze({
    pixelWidth: 160,
    pixelHeight: 80,
    encodedBytes: 'iVBORw0KGgoAAAANSUhEUgAAAKAAAABQCAYAAACeXX40AAAA+0lEQVR4nO3bsQkDAQwEwS/n+2/QbuJgkT0DlyvYVM8HQk99AP9NgKQESEqApARISoCkBEhKgKQESEqApARISoCkBEhKgKQESEqApARISoCkBEhKgKQESEqApARISoCkBEhKgKQESEqApARISoCk5gG+72s/viUBmgDt1pYEaAK0W1sSoAnQbm1JgCZAu7UlAZoA7daWBGgCtFtbEqAJ0G5tSYAmQLu1JQGaAO3WlvyEkBIgKQGSEiApAZISICkBkhIgKQGSEiApAZISICkBkhIgKQGSEiApAZISICkBkhIgKQGSEiApAZISICkBkhIgKQGSEiApAZISIKkvO7Kh6t2kgxoAAAAASUVORK5CYII=',
  }),
  Object.freeze({
    pixelWidth: 80,
    pixelHeight: 160,
    encodedBytes: 'iVBORw0KGgoAAAANSUhEUgAAAFAAAACgCAYAAACbg+u0AAABZklEQVR4nO3QwQnAMBADQZdz/TeYFLGBw2EG9Bd7HpKzfeB2AkYCRgJGAkYCRgJGAkYCRgJGAkYCRgJGAkYCRgJGAkYCRgJGqwFn5rNtETASMBIwEjASMBIwEjASMBIwEjASMBIwEjASMBIwEjASMBIwEjASMBIwEjASMBIwEjASMBIwEjASMBIwEjASMBIwEjASMBIwEjASMBIwEjASMBIwEjASMBIwEjASMBIwEjASMBIwEjASMBIwEjASMBIwEjASMBIwEjASMBIwEjASMBIwEjASMBIwEjASMBIwEjASMBIwEjASMBIwEjASMBIwEjASMBIwEjASMBIwEjASMBIwEjASMBIwEjASMBIwEjASMBIwEjASMBIwEjASMBIwEjASMBIwEjASMBIwEjASMBIwWg34BwJGAkYCRgJGAkYCRgJGAkYCRgJGAkYCRgJGAkYCRgJGAkYCRi91VqHqxq+tUwAAAABJRU5ErkJggg==',
  }),
  Object.freeze({
    pixelWidth: 120,
    pixelHeight: 120,
    encodedBytes: 'iVBORw0KGgoAAAANSUhEUgAAAHgAAAB4CAYAAAA5ZDbSAAACDUlEQVR4nO3bUWoDMRAEUR/H979gwhAWjAkhCZJ6prYK5n/p9yn28WHoHukPsL0JDE9geALDExiewPAEhicwPIHhCQxPYHgCwxMYnsDwBIYnMDyB4QkMT2B4AsMTGJ7A8geEJDA8L/Hw+/3zEMMD/Ab0D+HjgHbAk6JHAJ1Ap2OOAk7gTkccAp1GnQo8ATkNORm4NnMYjQLcFToNRkFsCp6FIyO2A00A05FbAaRgichvgNAgVWWCB95eGICPHgdMAdGSBBd5Xevg7IMeA04PfBVlggfeUHlvgjaWHvhOywAKvLT1whzuZwAKvLT1uhzuZwAKvKz1spzuVwAKvKz1qpzuVwAKvKz1qpzuVwAKvKz1qpzuVwAKvKz1qpzuVwAKvKz1qpzuVwAKvKz1qpzuVr0lg3EpggdeWHrfDnUxggdeXHvguuJXAAu8pPfQdcCuBBd5TemyBD5QenI5b+Yc/GLcSWOD9pQGouFUL4CoNQcStBBb4XGkQGm7VCrhKw5Bwq3bAVRqIglu1BK7SUATcqi1wlQabjlu1Br5K402EvRoBXKUhJ+JWY4Cv0qhTYK/GAVfi/r6RwK+J+nPjga+E/T4M8Ht3BX0PC2xfCQxPYHgCwxMYnsDwBIYnMDyB4QkMT2B4AsMTGJ7A8geEJDE9geALDExiewPAEhicwPIHhCQzvEzDhRlfA3m/eAAAAAElFTkSuQmCC',
  }),
  Object.freeze({
    pixelWidth: 200,
    pixelHeight: 100,
    encodedBytes: 'iVBORw0KGgoAAAANSUhEUgAAAMgAAABkCAYAAADDhn8LAAABWUlEQVR4nO3coQ3EQBAEQYdz+Sf4Robf1CO5Shq+pOleP+Cv6+0DYJlAIAgEgkAgCASCQCAIBIJAIAgEgkAgCASCQCAIBIJAIAgEgkAgCASCQCAIBIJAIAgEgkAgTAZyzrGPbo1AbGprBGJTWyMQm9oagdjU1gjEprZGIDa1NQKxqa0RiE1tjUBsamsEYlNbIxCb2hqB2NTWTAYCKwQCQSAQBAJBIBAEAkEgEAQCQSAQBAJBIBAEAkEgEAQCQSAQBAJBIBAEAkEgEAQCQSAQBAJBIBAEAkEgEAQCQSAQBAJBIBAmA3n7w7j57v4QiE1tjUBsamsEYlNbIxCb2hqB2NTWCMSmtkYgNrU1ArGprRGITW2NQGxqawRiU1sjEJvamslAYIVAIAgEgkAgCASCQCAIBIJAIAgEgkAgCASCQCAIBIJAIAgEgkAgCASCQCAIBIJAIAgEgkAg3Mt22E0w7ybWAAAAAElFTkSuQmCC',
  }),
])

function stableId(prefix, value) {
  return `${prefix}:${digestJson(value).slice('sha256:'.length, 28)}`
}

function pngCrc32(bytes) {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      crc = ((crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0)) >>> 0
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type)
  const chunk = Buffer.alloc(12 + data.byteLength)
  chunk.writeUInt32BE(data.byteLength, 0)
  typeBytes.copy(chunk, 4)
  data.copy(chunk, 8)
  chunk.writeUInt32BE(
    pngCrc32(Buffer.concat([typeBytes, data])),
    8 + data.byteLength,
  )
  return chunk
}

function genericPngBase64(pixelWidth, pixelHeight, variant) {
  const rowLength = pixelWidth * 4 + 1
  const scanlines = Buffer.alloc(rowLength * pixelHeight, 255)
  for (let y = 0; y < pixelHeight; y += 1) {
    const rowStart = y * rowLength
    scanlines[rowStart] = 0
    for (let x = 0; x < pixelWidth; x += 1) {
      const pixelStart = rowStart + 1 + x * 4
      const ink = variant % 2 === 0
        ? y > pixelHeight * 0.38 && y < pixelHeight * 0.62
        : x > pixelWidth * 0.38 && x < pixelWidth * 0.62
      const value = ink ? 40 : 255
      scanlines[pixelStart] = value
      scanlines[pixelStart + 1] = value
      scanlines[pixelStart + 2] = value
      scanlines[pixelStart + 3] = 255
    }
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(pixelWidth, 0)
  header.writeUInt32BE(pixelHeight, 4)
  header[8] = 8
  header[9] = 6
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(scanlines)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]).toString('base64')
}

function pngArtifact({ pixelWidth, pixelHeight }, index) {
  const encodedBytes = genericPngBase64(pixelWidth, pixelHeight, index)
  const bytes = new Uint8Array(Buffer.from(encodedBytes, 'base64'))
  return {
    mimeType: 'image/png',
    encodedBytes,
    byteLength: bytes.byteLength,
    sha256: sha256(bytes),
    pixelWidth,
    pixelHeight,
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
  const artifacts = optionPngFixtures.map(pngArtifact)
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
