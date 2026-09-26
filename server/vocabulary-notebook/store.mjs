import { createHash, randomUUID } from 'node:crypto'
import {
  NOTEBOOK_CONTEXT_QUOTA,
  NOTEBOOK_MUTATION_WINDOW_MS,
  NOTEBOOK_POLICY_VERSION,
} from '../../shared/vocabulary-notebook/constants.mjs'

function fail(code, message, status) {
  const error = new Error(message)
  error.code = code
  error.status = status
  return error
}

export function ensureVocabularyNotebookShape(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS vocabulary_notebook_entries (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      paper_id TEXT NOT NULL,
      source_revision TEXT NOT NULL,
      group_id TEXT NOT NULL,
      lexical_key TEXT NOT NULL,
      headword TEXT NOT NULL,
      lexical_strategy TEXT NOT NULL,
      dictionary_version TEXT,
      pronunciation_json TEXT NOT NULL,
      paper_title TEXT NOT NULL,
      group_label TEXT NOT NULL,
      group_order INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_added_at TEXT NOT NULL,
      UNIQUE (user_id, paper_id, source_revision, group_id, lexical_key)
    );
    CREATE TABLE IF NOT EXISTS vocabulary_notebook_contexts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      entry_id TEXT NOT NULL,
      paper_id TEXT NOT NULL,
      source_revision TEXT NOT NULL,
      group_id TEXT NOT NULL,
      stream_id TEXT NOT NULL,
      start_offset INTEGER NOT NULL,
      end_offset INTEGER NOT NULL,
      selected_text TEXT NOT NULL,
      sentence_start INTEGER NOT NULL,
      sentence_end INTEGER NOT NULL,
      sentence_text TEXT NOT NULL,
      sentence_digest TEXT NOT NULL,
      selection_start INTEGER NOT NULL,
      selection_end INTEGER NOT NULL,
      source_kind TEXT NOT NULL,
      role TEXT NOT NULL,
      publication_digest TEXT,
      source_projection_version TEXT NOT NULL,
      segmentation_version TEXT NOT NULL,
      group_order INTEGER NOT NULL,
      stream_order INTEGER NOT NULL,
      gloss_zh TEXT,
      translation_zh TEXT,
      target_ranges_json TEXT NOT NULL,
      gloss_status TEXT NOT NULL,
      translation_status TEXT NOT NULL,
      alignment_status TEXT NOT NULL,
      alignment_method TEXT,
      policy_version TEXT NOT NULL,
      error_code TEXT,
      retryable INTEGER NOT NULL,
      record_version INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (user_id, paper_id, source_revision, group_id, stream_id, start_offset, end_offset)
    );
    CREATE TABLE IF NOT EXISTS vocabulary_notebook_mutations (
      user_id TEXT NOT NULL,
      client_mutation_id TEXT NOT NULL,
      context_id TEXT NOT NULL,
      body_digest TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (user_id, client_mutation_id)
    );
    CREATE INDEX IF NOT EXISTS idx_notebook_entries_user_paper
      ON vocabulary_notebook_entries(user_id, paper_id, group_order, id);
    CREATE INDEX IF NOT EXISTS idx_notebook_contexts_entry
      ON vocabulary_notebook_contexts(user_id, entry_id, stream_order, start_offset);
  `)
}

function ready(db) {
  return Boolean(db.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'vocabulary_notebook_entries'
  `).get())
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function reviveProcessing(row, nowIso) {
  if (row.gloss_status !== 'processing' && row.translation_status !== 'processing') return row
  const age = Date.now() - Date.parse(row.updated_at)
  if (Number.isFinite(age) && age < 2 * 60 * 1000) return row
  return {
    ...row,
    gloss_status: row.gloss_status === 'processing' ? 'failed' : row.gloss_status,
    translation_status: row.translation_status === 'processing' ? 'failed' : row.translation_status,
    retryable: 1,
    error_code: row.error_code || 'NOTEBOOK_ENRICH_INTERRUPTED',
    updated_at: nowIso,
  }
}

function contextDto(row) {
  return {
    id: row.id,
    entryId: row.entry_id,
    source: {
      paperId: row.paper_id,
      sourceRevision: row.source_revision,
      publicationDigest: row.publication_digest,
      sourceProjectionVersion: row.source_projection_version,
      segmentationVersion: row.segmentation_version,
      groupId: row.group_id,
      streamId: row.stream_id,
      role: row.role,
      start: row.start_offset,
      end: row.end_offset,
      selectedText: row.selected_text,
      sentenceStart: row.sentence_start,
      sentenceEnd: row.sentence_end,
      sourceKind: row.source_kind,
      sentenceText: row.sentence_text,
      sentenceDigest: row.sentence_digest,
      selectionInSentence: { start: row.selection_start, end: row.selection_end },
      groupOrder: row.group_order,
      streamOrder: row.stream_order,
    },
    glossZh: row.gloss_zh,
    translationZh: row.translation_zh,
    targetRanges: parseJson(row.target_ranges_json, []),
    enrichment: {
      glossStatus: row.gloss_status,
      translationStatus: row.translation_status,
      alignmentStatus: row.alignment_status,
      alignmentMethod: row.alignment_method,
      policyVersion: row.policy_version,
      errorCode: row.error_code,
      retryable: Boolean(row.retryable),
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    recordVersion: row.record_version,
  }
}

function entryDto(row, contexts) {
  const meanings = []
  for (const context of contexts) {
    if (context.glossZh && !meanings.includes(context.glossZh)) meanings.push(context.glossZh)
  }
  return {
    id: row.id,
    paperId: row.paper_id,
    sourceRevision: row.source_revision,
    groupId: row.group_id,
    groupLabel: row.group_label,
    groupOrder: row.group_order,
    lexicalKey: row.lexical_key,
    headword: row.headword,
    lexicalStrategy: row.lexical_strategy,
    dictionaryVersion: row.dictionary_version,
    pronunciations: parseJson(row.pronunciation_json, []),
    meanings,
    contexts,
  }
}

export function createVocabularyNotebookStore(db) {
  const nowIso = () => new Date().toISOString()

  function listPapers(userId) {
    if (!ready(db)) return []
    return db.prepare(`
      SELECT e.paper_id AS paperId,
             e.paper_title AS paperTitle,
             COUNT(DISTINCT e.id) AS entryCount,
             MAX(c.created_at) AS lastAddedAt
      FROM vocabulary_notebook_entries e
      JOIN vocabulary_notebook_contexts c ON c.entry_id = e.id AND c.user_id = e.user_id
      WHERE e.user_id = ?
      GROUP BY e.paper_id
      ORDER BY lastAddedAt DESC, e.paper_id ASC
    `).all(userId)
  }

  function listPaper(userId, paperId) {
    if (!ready(db)) return { paperId, paperTitle: '未命名试卷', revisions: [] }
    const entries = db.prepare(`
      SELECT * FROM vocabulary_notebook_entries
      WHERE user_id = ? AND paper_id = ?
    `).all(userId, paperId)
    const contexts = db.prepare(`
      SELECT * FROM vocabulary_notebook_contexts
      WHERE user_id = ? AND paper_id = ?
      ORDER BY group_order ASC, stream_order ASC, start_offset ASC
    `).all(userId, paperId).map((row) => reviveProcessing(row, nowIso()))
    const byRevision = new Map()
    for (const entry of entries) {
      const bucket = byRevision.get(entry.source_revision) || {
        sourceRevision: entry.source_revision,
        paperTitle: entry.paper_title,
        entries: [],
      }
      const own = contexts.filter((row) => row.entry_id === entry.id).map(contextDto)
      if (own.length === 0) continue
      const earliest = own.reduce((best, item) => (
        item.source.streamOrder < best.source.streamOrder
          || (item.source.streamOrder === best.source.streamOrder && item.source.start < best.source.start)
          ? item
          : best
      ), own[0])
      bucket.entries.push({
        ...entryDto(entry, own),
        sortStream: earliest.source.streamOrder,
        sortStart: earliest.source.start,
      })
      byRevision.set(entry.source_revision, bucket)
    }
    const revisions = [...byRevision.values()].map((bucket) => ({
      sourceRevision: bucket.sourceRevision,
      paperTitle: bucket.paperTitle,
      entryCount: bucket.entries.length,
      groups: groupEntries(bucket.entries),
    }))
    const paperTitle = revisions[0]?.paperTitle || '未命名试卷'
    return { paperId, paperTitle, entryCount: revisions.reduce((sum, item) => sum + item.entryCount, 0), revisions }
  }

  function findOccurrence(userId, source) {
    if (!ready(db)) return { state: 'not-added' }
    const row = db.prepare(`
      SELECT id, entry_id FROM vocabulary_notebook_contexts
      WHERE user_id = ? AND paper_id = ? AND source_revision = ? AND group_id = ?
        AND stream_id = ? AND start_offset = ? AND end_offset = ?
    `).get(userId, source.paperId, source.sourceRevision, source.groupId, source.streamId, source.start, source.end)
    if (row) return { state: 'occurrence-exists', contextId: row.id, entryId: row.entry_id }
    return { state: 'not-added' }
  }

  function entryExists(userId, key) {
    if (!ready(db)) return false
    return Boolean(db.prepare(`
      SELECT id FROM vocabulary_notebook_entries
      WHERE user_id = ? AND paper_id = ? AND source_revision = ? AND group_id = ? AND lexical_key = ?
    `).get(userId, key.paperId, key.sourceRevision, key.groupId, key.lexicalKey))
  }

  function addContext(userId, input) {
    ensureVocabularyNotebookShape(db)
    const digest = createHash('sha256').update(JSON.stringify({
      paperId: input.paperId,
      sourceRevision: input.sourceRevision,
      streamId: input.streamId,
      start: input.start,
      end: input.end,
      selectedText: input.selectedText,
    })).digest('hex')
    const prior = db.prepare(`
      SELECT * FROM vocabulary_notebook_mutations WHERE user_id = ? AND client_mutation_id = ?
    `).get(userId, input.clientMutationId)
    if (prior) {
      if (prior.body_digest !== digest) throw fail('NOTEBOOK_MUTATION_CONFLICT', '这次加入和上次不是同一个词', 409)
      const age = Date.now() - Date.parse(prior.created_at)
      if (age > NOTEBOOK_MUTATION_WINDOW_MS) {
        throw fail('NOTEBOOK_MUTATION_EXPIRED', '这次加入已经过期，请重新加入', 409)
      }
      const alive = db.prepare(`
        SELECT id FROM vocabulary_notebook_contexts WHERE user_id = ? AND id = ?
      `).get(userId, prior.context_id)
      if (!alive) throw fail('NOTEBOOK_MUTATION_CONSUMED', '这条语境已经删除，不会重新加入', 409)
      return { created: false, contextId: prior.context_id, entryId: input.knownEntryId || null }
    }
    const count = db.prepare(`
      SELECT COUNT(*) AS n FROM vocabulary_notebook_contexts WHERE user_id = ?
    `).get(userId).n
    if (count >= NOTEBOOK_CONTEXT_QUOTA) {
      throw fail('NOTEBOOK_QUOTA', '生词本已经满了，先删掉一些再加入', 429)
    }
    const timestamp = nowIso()
    const contextId = randomUUID()
    const saved = runTransaction(db, () => {
      let entry = db.prepare(`
        SELECT * FROM vocabulary_notebook_entries
        WHERE user_id = ? AND paper_id = ? AND source_revision = ? AND group_id = ? AND lexical_key = ?
      `).get(userId, input.paperId, input.sourceRevision, input.groupId, input.lexicalKey)
      let createdEntry = false
      if (!entry) {
        const entryId = randomUUID()
        db.prepare(`
          INSERT INTO vocabulary_notebook_entries (
            id, user_id, paper_id, source_revision, group_id, lexical_key, headword,
            lexical_strategy, dictionary_version, pronunciation_json, paper_title,
            group_label, group_order, created_at, updated_at, last_added_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          entryId, userId, input.paperId, input.sourceRevision, input.groupId, input.lexicalKey,
          input.headword, input.lexicalStrategy, input.dictionaryVersion,
          JSON.stringify(input.pronunciations || []), input.paperTitle, input.groupLabel,
          input.groupOrder, timestamp, timestamp, timestamp,
        )
        entry = { id: entryId }
        createdEntry = true
      }
      try {
        db.prepare(`
          INSERT INTO vocabulary_notebook_contexts (
            id, user_id, entry_id, paper_id, source_revision, group_id, stream_id,
            start_offset, end_offset, selected_text, sentence_start, sentence_end,
            sentence_text, sentence_digest, selection_start, selection_end, source_kind,
            role, publication_digest, source_projection_version, segmentation_version,
            group_order, stream_order, gloss_zh, translation_zh, target_ranges_json,
            gloss_status, translation_status, alignment_status, alignment_method,
            policy_version, error_code, retryable, record_version, created_at, updated_at
          ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, '[]',
            'empty', 'empty', 'empty', NULL, ?, NULL, 0, 1, ?, ?
          )
        `).run(
          contextId, userId, entry.id, input.paperId, input.sourceRevision, input.groupId,
          input.streamId, input.start, input.end, input.selectedText, input.sentenceStart,
          input.sentenceEnd, input.sentenceText, input.sentenceDigest, input.selectionStart,
          input.selectionEnd, input.sourceKind, input.role, input.publicationDigest,
          input.sourceProjectionVersion, input.segmentationVersion, input.groupOrder,
          input.streamOrder, NOTEBOOK_POLICY_VERSION, timestamp, timestamp,
        )
      } catch (error) {
        if (!String(error.message).includes('UNIQUE')) throw error
        const existing = db.prepare(`
          SELECT id, entry_id FROM vocabulary_notebook_contexts
          WHERE user_id = ? AND paper_id = ? AND source_revision = ? AND group_id = ?
            AND stream_id = ? AND start_offset = ? AND end_offset = ?
        `).get(userId, input.paperId, input.sourceRevision, input.groupId, input.streamId, input.start, input.end)
        db.prepare(`
          INSERT INTO vocabulary_notebook_mutations (user_id, client_mutation_id, context_id, body_digest, created_at)
          VALUES (?, ?, ?, ?, ?)
        `).run(userId, input.clientMutationId, existing.id, digest, timestamp)
        return { created: false, contextId: existing.id, entryId: existing.entry_id, createdEntry }
      }
      if (!createdEntry) {
        db.prepare(`
          UPDATE vocabulary_notebook_entries SET last_added_at = ?, updated_at = ? WHERE user_id = ? AND id = ?
        `).run(timestamp, timestamp, userId, entry.id)
      }
      db.prepare(`
        INSERT INTO vocabulary_notebook_mutations (user_id, client_mutation_id, context_id, body_digest, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(userId, input.clientMutationId, contextId, digest, timestamp)
      return { created: true, contextId, entryId: entry.id, createdEntry }
    })
    return saved
  }

  function getContext(userId, contextId) {
    if (!ready(db)) return null
    const row = db.prepare(`
      SELECT * FROM vocabulary_notebook_contexts WHERE user_id = ? AND id = ?
    `).get(userId, contextId)
    return row ? reviveProcessing(row, nowIso()) : null
  }

  function updateEnrichment(userId, contextId, recordVersion, patch) {
    const timestamp = nowIso()
    const changed = db.prepare(`
      UPDATE vocabulary_notebook_contexts SET
        gloss_zh = ?, translation_zh = ?, target_ranges_json = ?,
        gloss_status = ?, translation_status = ?, alignment_status = ?,
        alignment_method = ?, error_code = ?, retryable = ?,
        record_version = record_version + 1, updated_at = ?
      WHERE user_id = ? AND id = ? AND record_version = ?
    `).run(
      patch.glossZh, patch.translationZh, JSON.stringify(patch.targetRanges || []),
      patch.glossStatus, patch.translationStatus, patch.alignmentStatus,
      patch.alignmentMethod, patch.errorCode, patch.retryable ? 1 : 0,
      timestamp, userId, contextId, recordVersion,
    )
    if (changed.changes !== 1) {
      throw fail('NOTEBOOK_VERSION', `enrichment version missed ${recordVersion}`, 409)
    }
    return true
  }

  function deleteContext(userId, contextId) {
    if (!ready(db)) return { deleted: false }
    return runTransaction(db, () => {
      const row = db.prepare(`
        SELECT entry_id FROM vocabulary_notebook_contexts WHERE user_id = ? AND id = ?
      `).get(userId, contextId)
      if (!row) return { deleted: false }
      db.prepare(`DELETE FROM vocabulary_notebook_contexts WHERE user_id = ? AND id = ?`).run(userId, contextId)
      const left = db.prepare(`
        SELECT COUNT(*) AS n FROM vocabulary_notebook_contexts WHERE user_id = ? AND entry_id = ?
      `).get(userId, row.entry_id).n
      if (left === 0) {
        db.prepare(`DELETE FROM vocabulary_notebook_entries WHERE user_id = ? AND id = ?`).run(userId, row.entry_id)
      }
      return { deleted: true, entryId: row.entry_id, entryRemoved: left === 0 }
    })
  }

  function assignLemma(userId, contextId, lexical) {
    ensureVocabularyNotebookShape(db)
    return runTransaction(db, () => {
      const context = db.prepare(`
        SELECT * FROM vocabulary_notebook_contexts WHERE user_id = ? AND id = ?
      `).get(userId, contextId)
      if (!context) return null
      const entry = db.prepare(`
        SELECT * FROM vocabulary_notebook_entries WHERE user_id = ? AND id = ?
      `).get(userId, context.entry_id)
      if (!entry) return null
      if (entry.lexical_key === lexical.lexicalKey && entry.headword === lexical.headword) {
        db.prepare(`
          UPDATE vocabulary_notebook_entries
          SET pronunciation_json = ?, dictionary_version = ?, updated_at = ?
          WHERE user_id = ? AND id = ?
        `).run(
          JSON.stringify(lexical.pronunciations || []),
          lexical.dictionaryVersion,
          nowIso(),
          userId,
          entry.id,
        )
        return entry.id
      }
      const siblings = db.prepare(`
        SELECT COUNT(*) AS n FROM vocabulary_notebook_contexts WHERE user_id = ? AND entry_id = ?
      `).get(userId, entry.id).n
      const target = db.prepare(`
        SELECT id FROM vocabulary_notebook_entries
        WHERE user_id = ? AND paper_id = ? AND source_revision = ? AND group_id = ? AND lexical_key = ?
      `).get(userId, entry.paper_id, entry.source_revision, entry.group_id, lexical.lexicalKey)
      const timestamp = nowIso()
      if (target && target.id !== entry.id) {
        db.prepare(`
          UPDATE vocabulary_notebook_contexts SET entry_id = ? WHERE user_id = ? AND id = ?
        `).run(target.id, userId, contextId)
        if (siblings === 1) {
          db.prepare(`DELETE FROM vocabulary_notebook_entries WHERE user_id = ? AND id = ?`).run(userId, entry.id)
        }
        return target.id
      }
      if (siblings === 1) {
        db.prepare(`
          UPDATE vocabulary_notebook_entries
          SET lexical_key = ?, headword = ?, lexical_strategy = ?, dictionary_version = ?,
              pronunciation_json = ?, updated_at = ?
          WHERE user_id = ? AND id = ?
        `).run(
          lexical.lexicalKey, lexical.headword, lexical.lexicalStrategy, lexical.dictionaryVersion,
          JSON.stringify(lexical.pronunciations || []), timestamp, userId, entry.id,
        )
        return entry.id
      }
      const entryId = randomUUID()
      db.prepare(`
        INSERT INTO vocabulary_notebook_entries (
          id, user_id, paper_id, source_revision, group_id, lexical_key, headword,
          lexical_strategy, dictionary_version, pronunciation_json, paper_title,
          group_label, group_order, created_at, updated_at, last_added_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        entryId, userId, entry.paper_id, entry.source_revision, entry.group_id, lexical.lexicalKey,
        lexical.headword, lexical.lexicalStrategy, lexical.dictionaryVersion,
        JSON.stringify(lexical.pronunciations || []), entry.paper_title, entry.group_label,
        entry.group_order, timestamp, timestamp, entry.last_added_at,
      )
      db.prepare(`
        UPDATE vocabulary_notebook_contexts SET entry_id = ? WHERE user_id = ? AND id = ?
      `).run(entryId, userId, contextId)
      return entryId
    })
  }

  function deleteEntry(userId, entryId) {
    if (!ready(db)) return { deleted: false }
    return runTransaction(db, () => {
      const entry = db.prepare(`
        SELECT id FROM vocabulary_notebook_entries WHERE user_id = ? AND id = ?
      `).get(userId, entryId)
      if (!entry) return { deleted: false }
      const removed = db.prepare(`
        DELETE FROM vocabulary_notebook_contexts WHERE user_id = ? AND entry_id = ?
      `).run(userId, entryId).changes
      db.prepare(`DELETE FROM vocabulary_notebook_entries WHERE user_id = ? AND id = ?`).run(userId, entryId)
      return { deleted: true, contexts: removed }
    })
  }

  return {
    listPapers,
    listPaper,
    findOccurrence,
    entryExists,
    addContext,
    getContext,
    updateEnrichment,
    deleteContext,
    deleteEntry,
    assignLemma,
  }
}

function runTransaction(db, work) {
  db.exec('BEGIN')
  try {
    const result = work()
    db.exec('COMMIT')
    return result
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

function groupEntries(entries) {
  const groups = []
  const sorted = entries.slice().sort((a, b) => a.groupOrder - b.groupOrder || a.sortStream - b.sortStream || a.sortStart - b.sortStart)
  for (const entry of sorted) {
    let group = groups.find((item) => item.groupId === entry.groupId)
    if (!group) {
      group = { groupId: entry.groupId, groupLabel: entry.groupLabel, groupOrder: entry.groupOrder, entries: [] }
      groups.push(group)
    }
    group.entries.push(entry)
  }
  for (const group of groups) {
    group.entries.sort((a, b) => a.sortStream - b.sortStream || a.sortStart - b.sortStart)
  }
  return groups.sort((a, b) => a.groupOrder - b.groupOrder)
}
