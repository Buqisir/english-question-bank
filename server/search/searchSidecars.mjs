import { readFileSync } from 'node:fs'

export function ensureSearchSidecarDatabaseShape(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS paper_search_sidecars (
      paper_id TEXT NOT NULL,
      source_digest TEXT NOT NULL,
      candidate_digest TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (paper_id, source_digest, candidate_digest)
    );
  `)
}

function sourceText(value) {
  if (!value || typeof value !== 'object') return ''
  if (Array.isArray(value)) return value.map(sourceText).join('')
  if (typeof value.text === 'string') return value.text
  return Object.values(value).map(sourceText).join('') + (value.kind === 'paragraph' ? '\n' : '')
}

export function sealedSearchSidecarGenerationInput(store, revisionId) {
  const revision = store.getRevision(revisionId)
  if (!revision || revision.state === 'uploading') {
    throw Object.assign(new Error('Finalized revision not found'), { status: 404, code: 'IMPORT_REVIEW_NOT_FOUND' })
  }
  if (revision.reviewKind !== 'candidate') {
    throw Object.assign(new Error('A Candidate revision is required'), { status: 409, code: 'IMPORT_REVIEW_CANDIDATE_REQUIRED' })
  }
  const files = revision.manifest.files
  const read = file => JSON.parse(readFileSync(store.verifiedFileForRead(revisionId, file.path).filePath, 'utf8'))
  const canonical = files.find(file => ['canonical_paper', 'compilation'].includes(file.role)
    || ['canonical-paper.json', 'compilation.json'].includes(file.path))
  if (canonical) {
    const sealed = read(canonical)
    return searchSidecarGenerationInput({ revision, canonicalPaper: sealed.artifacts?.canonicalPaper
      || sealed.compilation?.artifacts?.canonicalPaper || sealed })
  }
  const file = files.find(file => file.role === 'materialization')
  if (!file) {
    throw Object.assign(new Error('Sealed Source Materialization is missing'), { status: 404, code: 'IMPORT_REVIEW_NOT_FOUND' })
  }
  const materialization = read(file)
  return {
    paperId: revision.paperId, sourceDigest: revision.sourceDigest, candidateDigest: revision.candidateDigest,
    groups: materialization.groups.filter(group => group.family !== 'listening').map(group => ({
      groupId: group.groupId, text: sourceText(group.blocks).trim(),
    })),
    // These are the same slot and question identities used by appendListeningGroups.
    segments: [
      { slotId: 'listening.short-dialogue', from: 1, to: 5 },
      { slotId: 'listening.long-form', from: 6, to: 20 },
    ].flatMap(({ slotId, from, to }) => (materialization.listening?.transcript || [])
      .filter(segment => segment.questionNumbers.some(number => number >= from && number <= to))
      .map(segment => ({
        groupId: `group:${revision.paperId}:${slotId}`, segmentId: segment.segmentId,
        questionIds: segment.questionNumbers.map(number => `question:listening:${number}`),
        transcript: segment.text,
      }))),
  }
}

export function searchSidecarGenerationInput({ revision, projection, canonicalPaper = projection?.compilation.artifacts.canonicalPaper }) {
  const groups = canonicalPaper.questionGroups
  return {
    paperId: revision.paperId,
    sourceDigest: revision.sourceDigest,
    candidateDigest: revision.candidateDigest,
    groups: groups.filter(group => group.variant.family !== 'listening').map(group => ({
      groupId: group.identity.groupId,
      text: sourceText(group.content).trim(),
    })),
    segments: groups.flatMap(group => (group.variant.transcriptSegments || []).map(segment => ({
      groupId: group.identity.groupId,
      segmentId: segment.segmentId,
      questionIds: segment.questionIds,
      transcript: sourceText(segment.content).trim(),
    }))),
  }
}

function invalid(message) {
  throw Object.assign(new Error(message), { status: 400, code: 'SEARCH_SIDECAR_INVALID' })
}

export function validateSearchSidecar(payload, input) {
  const nonempty = value => typeof value === 'string' && value.trim().length > 0
  if (!Array.isArray(payload?.groups) || !Array.isArray(payload?.segments)) invalid('groups and segments must be arrays')
  const groupIds = new Set([...input.groups, ...input.segments].map(group => group.groupId))
  for (const group of payload.groups) {
    if (!groupIds.has(group?.groupId) || !nonempty(group.overview)) invalid('Unknown groupId or empty overview')
  }
  for (const segment of payload.segments) {
    const expected = input.segments.find(item => item.groupId === segment?.groupId && item.segmentId === segment?.segmentId)
    if (!expected || !Array.isArray(segment.questionIds)
      || JSON.stringify([...segment.questionIds].sort()) !== JSON.stringify([...expected.questionIds].sort())) {
      invalid('segmentId or questionIds differ from the revision transcript')
    }
    if (!['theme', 'themeGroup', 'subtopic'].every(key => nonempty(segment.topic?.[key]))
      || !nonempty(segment.summaryZh)) invalid('Empty topic or summaryZh')
  }
}

export function createSearchSidecarStore({ openDatabase }) {
  const withDb = (readOnly, callback) => {
    const db = openDatabase({ readOnly })
    try { return callback(db) } finally { db.close() }
  }
  const decode = row => row ? {
    paperId: row.paper_id, sourceDigest: row.source_digest, candidateDigest: row.candidate_digest,
    payload: JSON.parse(row.payload_json), updatedAt: row.updated_at,
  } : null
  return {
    upsert(input, payload) {
      validateSearchSidecar(payload, input)
      return withDb(false, db => {
        const updatedAt = new Date().toISOString()
        db.prepare(`INSERT INTO paper_search_sidecars
          (paper_id, source_digest, candidate_digest, payload_json, updated_at) VALUES (?, ?, ?, ?, ?)
          ON CONFLICT (paper_id, source_digest, candidate_digest)
          DO UPDATE SET payload_json = excluded.payload_json, updated_at = excluded.updated_at`)
          .run(input.paperId, input.sourceDigest, input.candidateDigest, JSON.stringify(payload), updatedAt)
        return { paperId: input.paperId, sourceDigest: input.sourceDigest, candidateDigest: input.candidateDigest, payload, updatedAt }
      })
    },
    get({ paperId, sourceDigest, candidateDigest }) {
      return withDb(true, db => decode(db.prepare(`SELECT * FROM paper_search_sidecars
        WHERE paper_id = ? AND source_digest = ? AND candidate_digest = ?`).get(paperId, sourceDigest, candidateDigest)))
    },
    list(paperId) {
      return withDb(true, db => db.prepare(`SELECT * FROM paper_search_sidecars WHERE paper_id = ?
        ORDER BY updated_at DESC, source_digest, candidate_digest`).all(paperId).map(decode))
    },
  }
}
