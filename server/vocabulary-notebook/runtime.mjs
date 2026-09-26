import path from 'node:path'
import { readSelection } from '../../shared/paper-selection/sourceProjection.mjs'
import { buildSelectionSourceFromConsumption } from '../../shared/paper-selection/sourceProjection.mjs'
import { REQUEST_SCHEMA } from '../../shared/paper-selection/constants.mjs'
import { extractNotebookOccurrence } from '../../shared/vocabulary-notebook/occurrence.mjs'
import { alignGloss } from '../../shared/vocabulary-notebook/highlight.mjs'
import { NOTEBOOK_ADD_SCHEMA, NOTEBOOK_SCHEMA } from '../../shared/vocabulary-notebook/constants.mjs'
import { buildSenseCandidates } from '../paper-dictionary/sensePick.mjs'
import { enrichWithGaokao, sharedGaokaoVocabulary } from '../paper-dictionary/gaokao.mjs'
import { lookupSurface, openPaperDictionary } from '../paper-dictionary/store.mjs'
import { readPaperTranslationConfig } from '../paper-translation/config.mjs'
import { createNotebookSenseAdapter } from './flashSense.mjs'
import { createVocabularyNotebookStore, ensureVocabularyNotebookShape } from './store.mjs'

const ALLOWED_ADD_KEYS = new Set(['schemaVersion', 'clientMutationId', 'paperId', 'sourceRevision', 'segments'])

function fail(code, message, status = 400) {
  const error = new Error(message)
  error.code = code
  error.status = status
  return error
}

function groupMeta(consumption) {
  const labels = new Map()
  let label = ''
  let order = 0
  for (const item of consumption?.visibleStructure || []) {
    if (item?.kind === 'instruction' && item.renderPolicy !== 'skip' && typeof item.text === 'string' && item.text.trim()) {
      label = item.text.trim().replace(/\s+/g, ' ').slice(0, 80)
    }
    if (item?.kind === 'group' && typeof item.groupId === 'string') {
      labels.set(item.groupId, { label: label || item.groupId, order })
      order += 1
    }
  }
  return labels
}

function surfaceSnapshot(surface, strategy) {
  return {
    lexicalKey: `surface:${surface.toLowerCase()}`,
    headword: surface,
    lexicalStrategy: strategy,
    dictionaryVersion: null,
    pronunciations: [],
    candidates: [],
    choices: [],
  }
}

function snapshotFromEntries(entries, dictionaryVersion) {
  const enriched = enrichWithGaokao(entries, sharedGaokaoVocabulary())
  const headword = enriched[0].headword
  const pronunciations = []
  for (const entry of enriched) {
    for (const group of entry.posGroups || []) {
      const items = []
      for (const pronunciation of group.pronunciations || []) {
        if (!pronunciation.ipa) continue
        if (items.some((item) => item.dialect === pronunciation.dialectLabel && item.ipa === pronunciation.ipa)) continue
        items.push({ dialect: pronunciation.dialectLabel, ipa: pronunciation.ipa })
      }
      if (items.length) pronunciations.push({ pos: group.posLabel, items })
    }
  }
  return {
    lexicalKey: `lemma:${headword.toLowerCase()}`,
    headword,
    lexicalStrategy: 'dictionary',
    dictionaryVersion,
    pronunciations,
    candidates: buildSenseCandidates(entries),
    choices: [],
  }
}

function groupedHeadwords(entries) {
  const groups = new Map()
  for (const entry of entries || []) {
    const list = groups.get(entry.headword) || []
    list.push(entry)
    groups.set(entry.headword, list)
  }
  return [...groups.entries()].map(([headword, groupEntries]) => ({
    headword,
    entries: groupEntries,
    glosses: buildSenseCandidates(groupEntries).slice(0, 1).map((item) => item.gloss),
    pos: [...new Set(groupEntries.flatMap((entry) => entry.posGroups.map((group) => group.posLabel)))].join('/'),
  }))
}

function lexicalSnapshot(dictionary, surface) {
  if (!dictionary?.available) return surfaceSnapshot(surface, 'surface')
  const found = lookupSurface(dictionary.db, surface)
  const choices = groupedHeadwords(found.entries)
  const version = dictionary.meta?.schema_version || null
  if (choices.length === 1) return { ...snapshotFromEntries(choices[0].entries, version), choices }
  if (choices.length === 0) return surfaceSnapshot(surface, 'missing')
  return { ...surfaceSnapshot(surface, 'ambiguous'), dictionaryVersion: version, choices }
}

export function createVocabularyNotebookRuntime({
  rootDir,
  openUserDatabase,
  loadCanonicalConsumption,
  translate,
  pickSense,
  pickHeadword,
  lookupWord,
  loadPaper: loadPaperOverride,
  env = process.env,
  fetchImpl = fetch,
} = {}) {
  const config = readPaperTranslationConfig(env)
  const dictionaryPath = env.QUESTION_BANK_PAPER_DICTIONARY_PATH
    || path.join(rootDir, 'data', 'paper-dictionary', 'eqb-dictionary.sqlite')
  let dictionary
  function lexicon() {
    if (!dictionary) dictionary = openPaperDictionary(dictionaryPath)
    return dictionary
  }
  const generatedAdapter = pickSense ? null : createNotebookSenseAdapter({
    endpoint: config.endpoint,
    apiKey: config.apiKey,
    model: 'qwen-flash',
    fetchImpl,
  })
  const sensePicker = pickSense || generatedAdapter.pickSense
  const headPicker = pickHeadword || generatedAdapter?.pickHeadword
  const inflight = new Map()

  function writableStore() {
    const db = openUserDatabase({ readOnly: false })
    ensureVocabularyNotebookShape(db)
    return { db, store: createVocabularyNotebookStore(db) }
  }
  function readableStore() {
    const db = openUserDatabase({ readOnly: true })
    return { db, store: createVocabularyNotebookStore(db) }
  }

  function loadPaper(paperId) {
    if (loadPaperOverride) return loadPaperOverride(paperId)
    const consumption = loadCanonicalConsumption({ paperId, consumerId: 'screen' })
    const source = buildSelectionSourceFromConsumption(consumption)
    return {
      source,
      paperTitle: consumption.paperTitle || consumption.title || '未命名试卷',
      publicationDigest: consumption.publicationDigest || null,
      groups: groupMeta(consumption),
    }
  }

  function prepare(body) {
    if (!body || body.schemaVersion !== NOTEBOOK_ADD_SCHEMA) {
      throw fail('NOTEBOOK_REQUEST_INVALID', '加入生词本的请求不正确')
    }
    for (const key of Object.keys(body)) {
      if (!ALLOWED_ADD_KEYS.has(key)) throw fail('NOTEBOOK_REQUEST_INVALID', '加入生词本的请求不正确')
    }
    if (typeof body.clientMutationId !== 'string' || body.clientMutationId.length < 8 || body.clientMutationId.length > 80) {
      throw fail('NOTEBOOK_REQUEST_INVALID', '加入生词本的请求不正确')
    }
    if (!Array.isArray(body.segments) || body.segments.length !== 1) {
      throw fail('NOTEBOOK_REQUEST_INVALID', '一次只能加入一个单词')
    }
    const paper = loadPaper(body.paperId)
    if (paper.source.sourceRevision !== body.sourceRevision) {
      throw fail('NOTEBOOK_SOURCE_MISMATCH', '卷子已经更新，请刷新后再加入', 409)
    }
    const segment = body.segments[0]
    const slice = readSelection(paper.source, segment)
    const streamIndex = paper.source.streams.findIndex((item) => item.streamId === segment.streamId)
    const occurrence = extractNotebookOccurrence(slice.stream, segment.start, segment.end)
    const group = paper.groups.get(occurrence.groupId) || { label: occurrence.groupId, order: 0 }
    const lexical = lookupWord ? lookupWord(occurrence.surface) : lexicalSnapshot(lexicon(), occurrence.surface)
    return {
      paper,
      occurrence,
      lexical,
      streamOrder: streamIndex < 0 ? 0 : streamIndex,
      group,
      segment,
      clientMutationId: body.clientMutationId,
    }
  }

  async function resolveLexical(surface, sentence, signal) {
    const looked = lookupWord ? lookupWord(surface) : lexicalSnapshot(lexicon(), surface)
    if (!looked.choices || looked.choices.length < 2) return looked
    if (!headPicker || !sentence) return looked
    try {
      const picked = await headPicker({
        word: surface,
        sentence,
        heads: looked.choices.map((choice) => ({
          headword: choice.headword,
          pos: choice.pos,
          gloss: choice.glosses.join('；'),
        })),
      }, signal)
      const chosen = looked.choices.find((choice) => choice.headword === picked?.headword)
      if (!chosen) return looked
      return snapshotFromEntries(chosen.entries, looked.dictionaryVersion)
    } catch {
      return looked
    }
  }

  function selectionState(userId, body) {
    const prepared = prepare(body)
    const { db, store } = readableStore()
    try {
      const found = store.findOccurrence(userId, {
        paperId: body.paperId,
        sourceRevision: body.sourceRevision,
        groupId: prepared.occurrence.groupId,
        streamId: prepared.segment.streamId,
        start: prepared.segment.start,
        end: prepared.segment.end,
      })
      const hasEntry = found.state === 'occurrence-exists' || store.entryExists(userId, {
        paperId: body.paperId,
        sourceRevision: body.sourceRevision,
        groupId: prepared.occurrence.groupId,
        lexicalKey: prepared.lexical.lexicalKey,
      })
      return {
        schemaVersion: NOTEBOOK_SCHEMA,
        state: found.state === 'occurrence-exists' ? 'occurrence-exists' : hasEntry ? 'entry-exists' : 'not-added',
        contextId: found.contextId || null,
        entryId: found.entryId || null,
      }
    } finally {
      db.close()
    }
  }

  async function add(userId, body) {
    const prepared = prepare(body)
    prepared.lexical = await resolveLexical(
      prepared.occurrence.surface,
      prepared.occurrence.sentenceText,
    )
    const { db, store } = writableStore()
    try {
      const saved = store.addContext(userId, {
        clientMutationId: prepared.clientMutationId,
        paperId: body.paperId,
        sourceRevision: body.sourceRevision,
        paperTitle: prepared.paper.paperTitle,
        publicationDigest: prepared.paper.publicationDigest,
        groupId: prepared.occurrence.groupId,
        groupLabel: prepared.group.label,
        groupOrder: prepared.group.order,
        streamId: prepared.segment.streamId,
        streamOrder: prepared.streamOrder,
        start: prepared.segment.start,
        end: prepared.segment.end,
        selectedText: prepared.segment.selectedText,
        sentenceStart: prepared.occurrence.sentenceStart,
        sentenceEnd: prepared.occurrence.sentenceEnd,
        sentenceText: prepared.occurrence.sentenceText,
        sentenceDigest: prepared.occurrence.sentenceDigest,
        selectionStart: prepared.occurrence.selectionInSentence.start,
        selectionEnd: prepared.occurrence.selectionInSentence.end,
        sourceKind: prepared.occurrence.sourceKind,
        role: prepared.occurrence.role,
        sourceProjectionVersion: prepared.occurrence.sourceProjectionVersion,
        segmentationVersion: prepared.occurrence.segmentationVersion,
        lexicalKey: prepared.lexical.lexicalKey,
        headword: prepared.lexical.headword,
        lexicalStrategy: prepared.lexical.lexicalStrategy,
        dictionaryVersion: prepared.lexical.dictionaryVersion,
        pronunciations: prepared.lexical.pronunciations,
      })
      return {
        schemaVersion: NOTEBOOK_SCHEMA,
        created: saved.created,
        contextId: saved.contextId,
        entryId: saved.entryId,
        state: 'occurrence-exists',
      }
    } finally {
      db.close()
    }
  }

  async function enrich(userId, contextId, { context, signal, requestId }) {
    const current = inflight.get(`${userId}:${contextId}`)
    if (current) return current
    const job = enrichOnce(userId, contextId, { context, signal, requestId })
      .finally(() => inflight.delete(`${userId}:${contextId}`))
    inflight.set(`${userId}:${contextId}`, job)
    return job
  }

  async function enrichOnce(userId, contextId, { context: requestContext, signal, requestId }) {
    const opened = writableStore()
    const row = opened.store.getContext(userId, contextId)
    if (!row) {
      opened.db.close()
      throw fail('NOTEBOOK_NOT_FOUND', '没有找到这条生词', 404)
    }
    const version = row.record_version
    opened.store.updateEnrichment(userId, contextId, version, {
      glossZh: row.gloss_zh,
      translationZh: row.translation_zh,
      targetRanges: JSON.parse(row.target_ranges_json || '[]'),
      glossStatus: row.gloss_zh ? 'ready' : 'processing',
      translationStatus: row.translation_zh ? 'ready' : 'processing',
      alignmentStatus: row.alignment_status,
      alignmentMethod: row.alignment_method,
      errorCode: null,
      retryable: false,
    })
    opened.db.close()

    let gloss = row.gloss_zh
    let glossStatus = gloss ? 'ready' : 'empty'
    let translation = row.translation_zh
    let translationStatus = translation ? 'ready' : 'empty'
    let errorCode = null
    let retryable = false
    const lexical = await resolveLexical(row.selected_text, row.sentence_text, signal)
    if (lexical.lexicalStrategy === 'dictionary') {
      const relink = writableStore()
      relink.store.assignLemma(userId, contextId, lexical)
      relink.db.close()
    }
    if (!gloss) {
      try {
        if (lexical.candidates.length === 0) {
          glossStatus = 'unavailable'
        } else {
          const picked = await sensePicker({
            word: row.selected_text,
            sentence: row.sentence_text,
            candidates: lexical.candidates,
          }, signal)
          gloss = picked?.gloss || null
          glossStatus = gloss ? 'ready' : 'unavailable'
        }
      } catch (error) {
        glossStatus = 'failed'
        errorCode = error.code || 'NOTEBOOK_SENSE_FAILED'
        retryable = true
      }
    }
    if (!translation && translate) {
      try {
        const result = await translate({
          body: {
            schemaVersion: REQUEST_SCHEMA,
            paperId: row.paper_id,
            sourceRevision: row.source_revision,
            segments: [{
              streamId: row.stream_id,
              start: row.sentence_start,
              end: row.sentence_end,
              selectedText: row.sentence_text,
            }],
          },
          context: requestContext,
          signal,
          requestId,
          userId,
        })
        translation = result?.results?.[0]?.translation || null
        translationStatus = translation ? 'ready' : 'failed'
        if (!translation) {
          errorCode = errorCode || 'NOTEBOOK_TRANSLATION_FAILED'
          retryable = true
        }
      } catch (error) {
        translationStatus = 'failed'
        errorCode = error.code || 'NOTEBOOK_TRANSLATION_FAILED'
        retryable = error.retryable !== false
      }
    } else if (!translation) {
      translationStatus = 'unavailable'
    }
    const aligned = gloss && translation ? alignGloss(translation, gloss) : { status: 'unavailable', ranges: [] }
    const again = writableStore()
    const latest = again.store.getContext(userId, contextId)
    if (!latest) {
      again.db.close()
      return { schemaVersion: NOTEBOOK_SCHEMA, discarded: true }
    }
    again.store.updateEnrichment(userId, contextId, latest.record_version, {
      glossZh: gloss,
      translationZh: translation,
      targetRanges: aligned.ranges,
      glossStatus,
      translationStatus,
      alignmentStatus: aligned.status,
      alignmentMethod: aligned.status === 'ready' ? 'unique-boundary-v1' : null,
      errorCode,
      retryable,
    })
    const saved = again.store.getContext(userId, contextId)
    again.db.close()
    return { schemaVersion: NOTEBOOK_SCHEMA, context: saved ? undefined : null, saved: true }
  }

  return {
    capability() {
      return {
        schemaVersion: NOTEBOOK_SCHEMA,
        enabled: true,
        enrichEnabled: Boolean(config.enabled && config.keyAvailable),
        contextQuota: 10000,
      }
    },
    selectionState,
    add,
    enrich,
    listPapers(userId) {
      const { db, store } = readableStore()
      try {
        return { schemaVersion: NOTEBOOK_SCHEMA, papers: store.listPapers(userId) }
      } finally {
        db.close()
      }
    },
    listPaper(userId, paperId) {
      const { db, store } = readableStore()
      try {
        return { schemaVersion: NOTEBOOK_SCHEMA, ...store.listPaper(userId, paperId) }
      } finally {
        db.close()
      }
    },
    deleteContext(userId, contextId) {
      const { db, store } = writableStore()
      try {
        const result = store.deleteContext(userId, contextId)
        if (!result.deleted) throw fail('NOTEBOOK_NOT_FOUND', '没有找到这条生词', 404)
        return { schemaVersion: NOTEBOOK_SCHEMA, ...result }
      } finally {
        db.close()
      }
    },
    deleteEntry(userId, entryId) {
      const { db, store } = writableStore()
      try {
        const result = store.deleteEntry(userId, entryId)
        if (!result.deleted) throw fail('NOTEBOOK_NOT_FOUND', '没有找到这个单词', 404)
        return { schemaVersion: NOTEBOOK_SCHEMA, ...result }
      } finally {
        db.close()
      }
    },
  }
}
