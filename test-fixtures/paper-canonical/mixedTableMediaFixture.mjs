import { digestJson, sha256 } from '../../shared/paper-canonical/stable.mjs'
import { makeReadyCanonicalFixture } from './foundationFixture.mjs'
import { bindCanonicalFixtureRequest } from './framedColumnsFixture.mjs'

const mediaBytes = new Uint8Array(Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lY6O3wAAAABJRU5ErkJggg==',
  'base64',
))

export function makeMixedTableMediaCanonicalFixture() {
  const fixture = makeReadyCanonicalFixture()
  const group = fixture.source.groups.find((candidate) => candidate.slotId === 'reading.a')
  const mediaId = 'media:reading-a:warning-icon'
  const observationId = 'observation:reading-a:warning-icon'
  const mediaDigest = sha256(mediaBytes)
  const artifactId =
    `source-document:${digestJson({ sha256: mediaDigest }).slice('sha256:'.length, 28)}`

  group.media = [{
    mediaId,
    mimeType: 'image/png',
    sha256: mediaDigest,
    pixelWidth: 1,
    pixelHeight: 1,
    sourceArtifactRef: { artifactId },
  }]
  group.content = {
    blocks: [{
      kind: 'table',
      nodeId: 'table:reading-a:product-label',
      columnCount: 2,
      rows: [
        {
          rowId: 'row:reading-a:product-label:heading',
          cells: [
            {
              cellId: 'cell:reading-a:product-label:heading:label',
              columnStart: 0,
              columnSpan: 1,
              rowSpan: 1,
              role: 'header',
              inlines: [{
                kind: 'text',
                nodeId: 'text:reading-a:product-label:heading:label',
                text: 'Warning',
              }],
            },
            {
              cellId: 'cell:reading-a:product-label:heading:meaning',
              columnStart: 1,
              columnSpan: 1,
              rowSpan: 1,
              role: 'header',
              inlines: [{
                kind: 'text',
                nodeId: 'text:reading-a:product-label:heading:meaning',
                text: 'Meaning',
              }],
            },
          ],
        },
        {
          rowId: 'row:reading-a:product-label:warning',
          cells: [
            {
              cellId: 'cell:reading-a:product-label:warning:icon',
              columnStart: 0,
              columnSpan: 1,
              rowSpan: 1,
              role: 'data',
              inlines: [{
                kind: 'media_ref',
                nodeId: 'media-ref:reading-a:warning-icon',
                mediaId,
                alt: 'Warning icon',
              }],
            },
            {
              cellId: 'cell:reading-a:product-label:warning:meaning',
              columnStart: 1,
              columnSpan: 1,
              rowSpan: 1,
              role: 'data',
              inlines: [{
                kind: 'text',
                nodeId: 'text:reading-a:product-label:warning:meaning',
                text: 'Keep away from children.',
              }],
            },
          ],
        },
      ],
    }],
  }
  group.sourceSpanRefsByTarget = {
    [`media:${mediaId}`]: [`source-span:${observationId}`],
  }
  fixture.source.observations.push({
    observationId,
    kind: 'source_table_media',
    documentInputKey: 'reading_table_media',
    value: {
      mediaId,
      sha256: mediaDigest,
      pixelWidth: 1,
      pixelHeight: 1,
    },
    span: { start: 0, end: mediaBytes.byteLength },
  })
  fixture.request.evidence.documents.push({
    inputKey: 'reading_table_media',
    roles: ['source_media'],
    bytes: mediaBytes,
    declared: {
      mediaType: 'image/png',
      originalName: 'warning-icon.png',
    },
  })
  bindCanonicalFixtureRequest(fixture, fixture.source)
  return { fixture, mediaBytes, mediaDigest, mediaId }
}
