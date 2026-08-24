import { digestJson, sha256 } from '../../../shared/paper-canonical/stable.mjs'

const sourceCropPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/PrcruAAAAABJRU5ErkJggg=='
const vectorPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
const restoredPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNgAAAAAgABSK+kcQAAAABJRU5ErkJggg=='

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

function makeSourceCapture() {
  const bytes = new TextEncoder().encode('%PDF-1.7\n% frozen generic visual source\n')
  const documentDigest = sha256(bytes)
  const roles = ['question_source', 'source_provenance']
  const inputKey = 'generic_visual_source'
  const documentId = stableId('document', {
    digest: documentDigest,
    roles,
    inputKey,
  })
  const artifactId = stableId('source-document', { sha256: documentDigest })
  const observations = [
    {
      observationId: 'observation:visual:reading-option-a',
      documentId,
      kind: 'source_figure',
      value: { sourceLabel: 'A' },
      order: 0,
      extraction: { adapterId: 'canonical-fixture-evidence', version: '1' },
      sourceSpanId: 'source-span:observation:visual:reading-option-a',
    },
    {
      observationId: 'observation:visual:passage-diagram',
      documentId,
      kind: 'source_figure',
      value: { sourceLabel: 'passage' },
      order: 1,
      extraction: { adapterId: 'canonical-fixture-evidence', version: '1' },
      sourceSpanId: 'source-span:observation:visual:passage-diagram',
    },
  ]
  const sourceSpans = [
    {
      sourceSpanId: observations[0].sourceSpanId,
      documentId,
      documentDigest,
      coordinate: {
        kind: 'page_region',
        page: 2,
        region: { x: 0.1, y: 0.2, width: 0.3, height: 0.2 },
      },
    },
    {
      sourceSpanId: observations[1].sourceSpanId,
      documentId,
      documentDigest,
      coordinate: {
        kind: 'page_region',
        page: 3,
        region: { x: 0.2, y: 0.25, width: 0.5, height: 0.35 },
      },
    },
  ]
  const captureBase = {
    schemaVersion: 'source-capture-v1',
    documents: [{
      documentId,
      inputKey,
      roles,
      mediaType: 'application/pdf',
      originalName: 'generic-visual-source.pdf',
      byteLength: bytes.byteLength,
      sha256: documentDigest,
      immutableArtifactRef: {
        artifactId,
        relativePath: `source-evidence/${artifactId.slice('source-document:'.length)}.bin`,
        sha256: documentDigest,
        byteLength: bytes.byteLength,
      },
      encodedBytes: Buffer.from(bytes).toString('base64'),
    }],
    observations,
    sourceSpans,
    assertions: [],
  }
  const digest = digestJson(captureBase)
  return {
    ...captureBase,
    captureId: stableId('source-capture', captureBase),
    digest,
  }
}

function checklist(...entries) {
  return entries.map(([relationship, sourceTruth]) => ({ relationship, sourceTruth }))
}

export const visualCandidateFixtureOracle = Object.freeze({
  optionObservationId: 'observation:visual:reading-option-a',
  passageObservationId: 'observation:visual:passage-diagram',
  optionOwner: Object.freeze({
    kind: 'reading_option',
    groupId: 'group:reading.d',
    questionId: 'question:reading.d.1',
    optionId: 'option:reading.d.1.a',
  }),
  passageOwner: Object.freeze({
    kind: 'passage',
    groupId: 'group:reading.c',
  }),
})

export function makeVisualCandidateFixture() {
  const sourceCrop = pngArtifact(sourceCropPngBase64)
  const vector = pngArtifact(vectorPngBase64)
  const restored = pngArtifact(restoredPngBase64)
  const optionChecklist = checklist(
    ['count', 'one source-authored option diagram'],
    ['orientation', 'the dark region remains on the source-authored side'],
    ['connectivity', 'the source-authored line stays connected'],
  )
  const passageChecklist = checklist(
    ['order', 'the two source shapes retain their source order'],
    ['containment', 'the inner source shape remains contained'],
  )
  return {
    sourceArtifacts: {
      sourceCrop: structuredClone(sourceCrop),
      vector: structuredClone(vector),
      restored: structuredClone(restored),
    },
    request: {
      sourceCapture: makeSourceCapture(),
      observations: [
        {
          observationId: visualCandidateFixtureOracle.optionObservationId,
          owner: structuredClone(visualCandidateFixtureOracle.optionOwner),
          sourceCrop: structuredClone(sourceCrop),
        },
        {
          observationId: visualCandidateFixtureOracle.passageObservationId,
          owner: structuredClone(visualCandidateFixtureOracle.passageOwner),
          sourceCrop: structuredClone(sourceCrop),
        },
      ],
      candidates: [
        {
          observationId: visualCandidateFixtureOracle.optionObservationId,
          owner: structuredClone(visualCandidateFixtureOracle.optionOwner),
          method: 'source_crop',
          artifact: structuredClone(sourceCrop),
          sourceTruthChecklist: structuredClone(optionChecklist),
        },
        {
          observationId: visualCandidateFixtureOracle.optionObservationId,
          owner: structuredClone(visualCandidateFixtureOracle.optionOwner),
          method: 'vector_authored',
          artifact: structuredClone(vector),
          sourceTruthChecklist: structuredClone(optionChecklist),
          reproducibility: {
            editableVector: '<svg viewBox="0 0 1 1"></svg>',
            tool: 'deterministic-fixture-exporter-v1',
            exportSettings: 'PNG 1x1 fixture export',
          },
        },
        {
          observationId: visualCandidateFixtureOracle.optionObservationId,
          owner: structuredClone(visualCandidateFixtureOracle.optionOwner),
          method: 'reference_restored',
          artifact: structuredClone(restored),
          sourceTruthChecklist: structuredClone(optionChecklist),
          reproducibility: {
            prompt: 'Restore edge clarity without changing geometry.',
            tool: 'fixture-reference-editor',
            model: 'fixture-model-v1',
          },
        },
        {
          observationId: visualCandidateFixtureOracle.passageObservationId,
          owner: structuredClone(visualCandidateFixtureOracle.passageOwner),
          method: 'source_crop',
          artifact: structuredClone(sourceCrop),
          sourceTruthChecklist: structuredClone(passageChecklist),
        },
        {
          observationId: visualCandidateFixtureOracle.passageObservationId,
          owner: structuredClone(visualCandidateFixtureOracle.passageOwner),
          method: 'reference_restored',
          artifact: structuredClone(restored),
          sourceTruthChecklist: structuredClone(passageChecklist),
          reproducibility: {
            prompt: 'Remove capture noise without changing containment.',
            tool: 'fixture-reference-editor',
            model: 'fixture-model-v1',
          },
        },
      ],
    },
  }
}
