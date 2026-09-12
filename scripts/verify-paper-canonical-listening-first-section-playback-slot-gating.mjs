import assert from 'node:assert/strict'

import { nck1MaterializationCandidateAuthorityRef, resolveCanonicalAuthority } from '../shared/paper-canonical/authority.mjs'
import {
  importCanonicalCandidate,
  rederiveConfirmedCanonicalCandidate,
} from '../shared/paper-canonical/compiler.mjs'
import { projectCanonicalPaper } from '../shared/paper-canonical/projector.mjs'
import { digestJson, sha256 } from '../shared/paper-canonical/stable.mjs'
import { makeFixture } from './verify-nck1-source-materialization.mjs'

const textEncoder = new TextEncoder()
const mediaDocumentBytesFixture = new Uint8Array(Buffer.from(
  'UEsDBBQAAAAAAGBBG10rh3kcJgEAACYBAAAVAAAAd29yZC9tZWRpYS9pbWFnZTEucG5niVBORw0KGgoAAAANSUhEUgAAAAEAAAABAQAAAAA3bvkkAAAAIGNIUk0AAHomAACAhAAA+gAAAIDoAAB1MAAA6mAAADqYAAAXcJy6UTwAAAACYktHRAAB3YoTpAAAAAd0SU1FB+oIGwgLAVaDsf4AAAAldEVYdGRhdGU6Y3JlYXRlADIwMjYtMDgtMjdUMDg6MTE6MDErMDA6MDCMMSViAAAAJXRFWHRkYXRlOm1vZGlmeQAyMDI2LTA4LTI3VDA4OjExOjAxKzAwOjAw/Wyd3gAAACh0RVh0ZGF0ZTp0aW1lc3RhbXAAMjAyNi0wOC0yN1QwODoxMTowMSswMDowMKp5vAEAAAAKSURBVAjXY2AAAAACAAHiIbwzAAAAAElFTkSuQmCCUEsBAhQDFAAAAAAAYEEbXSuHeRwmAQAAJgEAABUAAAAAAAAAAAAAAIABAAAAAHdvcmQvbWVkaWEvaW1hZ2UxLnBuZ1BLBQYAAAAAAQABAEMAAABZAQAAAAA=',
  'base64',
))
const mediaBytesFixture = new Uint8Array(Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABAQAAAAA3bvkkAAAAIGNIUk0AAHomAACAhAAA+gAAAIDoAAB1MAAA6mAAADqYAAAXcJy6UTwAAAACYktHRAAB3YoTpAAAAAd0SU1FB+oIGwgLAVaDsf4AAAAldEVYdGRhdGU6Y3JlYXRlADIwMjYtMDgtMjdUMDg6MTE6MDErMDA6MDCMMSViAAAAJXRFWHRkYXRlOm1vZGlmeQAyMDI2LTA4LTI3VDA4OjExOjAxKzAwOjAw/Wyd3gAAACh0RVh0ZGF0ZTp0aW1lc3RhbXAAMjAyNi0wOC0yN1QwODoxMTowMSswMDowMKp5vAEAAAAKSURBVAjXY2AAAAACAAHiIbwzAAAAAElFTkSuQmCC',
  'base64',
))

function confirmation(candidate) {
  return {
    schemaVersion: 'teacher-confirmation-v1',
    candidateDigest: candidate.candidateDigest,
    sourceDigest: candidate.source.sha256,
    confirmed: true,
  }
}

// The section1_playback marker is materialization-level and section-1-only:
// the DOCX producer scans only section-1 paragraphs for "仅读一遍". The
// adapter must therefore attach firstSectionPlayback solely to the
// listening.short-dialogue occurrence and never to listening.long-form.
function sourceInput({ withMarker }) {
  const materialization = makeFixture({ listening: true, mixedTable: true })
  if (withMarker) {
    materialization.listening.timing = [{
      kind: 'section1_playback',
      passes: 1,
      source: {
        kind: 'page_region',
        documentId: 'paper',
        page: 1,
        region: { x: 0, y: 0, width: 1, height: 1 },
      },
    }]
  }
  const questionBytes = textEncoder.encode(
    '%PDF-1.7 deterministic NCK1 question source'.padEnd(100, 'q'),
  )
  const answerBytes = textEncoder.encode(
    '%PDF-1.7 deterministic official answer source'.padEnd(100, 'a'),
  )
  const mediaDocumentBytes = mediaDocumentBytesFixture.slice()
  const mediaBytes = mediaBytesFixture.slice()
  for (const [documentId, bytes] of [
    ['paper', questionBytes],
    ['answers', answerBytes],
  ]) {
    const document = materialization.documents.find((item) =>
      item.documentId === documentId)
    document.sha256 = sha256(bytes)
    document.byteLength = bytes.byteLength
  }
  materialization.documents.push({
    documentId: 'media-source',
    role: 'question_source',
    mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    sha256: sha256(mediaDocumentBytes),
    byteLength: mediaDocumentBytes.byteLength,
    pageCount: 1,
  })
  materialization.media[0].sha256 = sha256(mediaBytes)
  materialization.media[0].pixelWidth = 1
  materialization.media[0].pixelHeight = 1
  materialization.media[0].extraction = {
    kind: 'docx_media',
    documentId: 'media-source',
    entryName: 'word/media/image1.png',
  }
  return {
    kind: 'nck1-source-materialization',
    materializationBytes: textEncoder.encode(JSON.stringify(materialization)),
    documents: [
      { documentId: 'paper', bytes: questionBytes },
      { documentId: 'answers', bytes: answerBytes },
      { documentId: 'media-source', bytes: mediaDocumentBytes },
    ],
    media: [{ mediaId: 'media:warning-icon', bytes: mediaBytes }],
  }
}

function project(input) {
  const first = importCanonicalCandidate(input)
  assert.deepEqual(first.issues, [])
  const confirmed = rederiveConfirmedCanonicalCandidate(
    first.candidate,
    confirmation(first.candidate),
  )
  const confirmedPackage = {
    plan: confirmed.compilation.artifacts.canonicalPaper.paperPlan,
    groups: confirmed.compilation.artifacts.canonicalPaper.questionGroups,
    sourceCapture: confirmed.compilation.artifacts.sourceCapture,
    authorityClosure: resolveCanonicalAuthority(
      nck1MaterializationCandidateAuthorityRef,
    ).closure,
  }
  return projectCanonicalPaper(confirmedPackage)
}

function listeningBySlot(projected) {
  const nodes = projected.nodes.filter((node) => node.kind === 'group'
    && node.familyContractId === 'listening')
  return Object.fromEntries(nodes.map((node) => [node.slotId, node]))
}

const withMarker = project(sourceInput({ withMarker: true }))
const withBySlot = listeningBySlot(withMarker)
assert.equal(
  withBySlot['listening.short-dialogue'].firstSectionPlayback,
  'once_explicit',
  'the section1_playback marker reaches the short-dialogue occurrence',
)
assert.equal(
  withBySlot['listening.long-form'].firstSectionPlayback,
  undefined,
  'the section-1-only firstSectionPlayback flag must not reach the long-form occurrence',
)
assert.equal(
  Object.hasOwn(withBySlot['listening.long-form'], 'firstSectionPlayback'),
  false,
  'the long-form occurrence must not even own the firstSectionPlayback key',
)

const withoutMarker = project(sourceInput({ withMarker: false }))
const withoutBySlot = listeningBySlot(withoutMarker)
assert.equal(
  withoutBySlot['listening.short-dialogue'].firstSectionPlayback,
  undefined,
  'no section1_playback marker means no firstSectionPlayback on short-dialogue',
)
assert.equal(
  withoutBySlot['listening.long-form'].firstSectionPlayback,
  undefined,
  'no section1_playback marker means no firstSectionPlayback on long-form',
)

// The long-form projected occurrence (and its projectedOccurrenceDigests entry)
// must be byte-identical whether or not the section-1 marker is present: the
// marker is section-1-only and must not perturb the long-form digest.
assert.equal(
  digestJson(withBySlot['listening.long-form']),
  digestJson(withoutBySlot['listening.long-form']),
  'the long-form occurrence digest must be unaffected by the section-1 playback marker',
)
// The short-dialogue digest must still reflect the marker, proving the gate
// did not accidentally suppress the flag on the section-1 occurrence.
assert.notEqual(
  digestJson(withBySlot['listening.short-dialogue']),
  digestJson(withoutBySlot['listening.short-dialogue']),
  'the short-dialogue occurrence digest must reflect the section1_playback marker',
)

console.log('PASS NCK1 section-1 playback flag is gated to listening.short-dialogue only')
