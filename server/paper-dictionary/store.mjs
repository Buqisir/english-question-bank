import { existsSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { DICTIONARY_SCHEMA } from '../../shared/paper-dictionary/constants.mjs'
import { allowedAudioUrl } from '../../shared/paper-dictionary/audioUrl.mjs'
import { learnerIpa } from '../../shared/paper-dictionary/ipa.mjs'
import { dialectFromTags, morphologyLabels, posLabel } from '../../shared/paper-dictionary/morphology.mjs'

function fold(text) {
  return text.toLowerCase()
}

// 录音已换成本站副本，署名仍需指回 Commons 原文件页。
function commonsFilePage(source) {
  const match = /^Wikimedia Commons: File:(.+)$/.exec(source || '')
  return match ? `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(match[1].replace(/ /g, '_'))}` : null
}

function parseTags(value) {
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((tag) => typeof tag === 'string') : []
  } catch {
    return []
  }
}

export function openPaperDictionary(filePath) {
  if (!filePath || !existsSync(filePath)) {
    return { available: false, reason: 'missing', db: null, meta: null }
  }
  let db
  try {
    db = new DatabaseSync(filePath, { readOnly: true, timeout: 2000 })
    db.exec('PRAGMA query_only = ON')
    db.exec('PRAGMA cache_size = -2000')
    const schema = db.prepare('SELECT value FROM meta WHERE key = ?').get('schema_version')
    if (schema?.value !== DICTIONARY_SCHEMA) {
      db.close()
      return { available: false, reason: 'invalid', db: null, meta: null }
    }
    const rows = db.prepare('SELECT key, value FROM meta').all()
    const meta = Object.fromEntries(rows.map((row) => [row.key, row.value]))
    return { available: true, reason: 'ok', db, meta }
  } catch {
    try {
      db?.close()
    } catch {
      // The failed open already explains itself through `invalid`.
    }
    return { available: false, reason: 'invalid', db: null, meta: null }
  }
}

function groupMatches(rows) {
  const entries = new Map()
  for (const row of rows) {
    let entry = entries.get(row.entry_id)
    if (!entry) {
      entry = {
        entryId: row.entry_id,
        headword: row.headword,
        groups: new Map(),
      }
      entries.set(row.entry_id, entry)
    }
    let group = entry.groups.get(row.pos_group_index)
    if (!group) {
      group = {
        posGroupIndex: row.pos_group_index,
        pos: row.pos,
        etymologyId: row.etymology_id || null,
        formText: row.form_text,
        tagSets: [],
      }
      entry.groups.set(row.pos_group_index, group)
    }
    group.tagSets.push(parseTags(row.tags_json))
  }
  return [...entries.values()]
}

export function lookupSurface(db, surface) {
  const folded = fold(surface)
  const rows = db.prepare(`
    SELECT f.entry_id, f.pos_group_index, f.form_text, f.tags_json,
           e.headword, g.pos, g.etymology_id
    FROM forms f
    JOIN entries e ON e.entry_id = f.entry_id
    JOIN pos_groups g ON g.entry_id = f.entry_id AND g.pos_group_index = f.pos_group_index
    WHERE f.form_fold = ?
  `).all(folded)

  const exact = rows.filter((row) => row.form_text === surface)
  const matched = exact.length > 0 ? exact : rows
  if (matched.length === 0) {
    return { status: 'not-found', entries: [] }
  }

  const grouped = groupMatches(matched)
  const senseStmt = db.prepare(`
    SELECT sense_id, priority, short_gloss, learner_explanation
    FROM senses
    WHERE entry_id = ? AND pos_group_index = ?
    ORDER BY meaning_index
  `)
  const pronStmt = db.prepare(`
    SELECT pronunciation_index, ipa, tags_json, audio_url, audio_source,
           audio_author, audio_license, audio_license_url
    FROM pronunciations
    WHERE entry_id = ? AND pos_group_index = ?
    ORDER BY pronunciation_index
  `)

  const entries = grouped.map((entry) => {
    const posGroups = [...entry.groups.values()].map((group) => {
      const senses = senseStmt.all(entry.entryId, group.posGroupIndex).map((sense) => ({
        senseId: sense.sense_id,
        priority: sense.priority,
        shortGloss: sense.short_gloss || null,
        learnerExplanation: sense.learner_explanation || null,
      }))
      const seenPronunciations = new Set()
      const pronunciations = []
      const narrowIds = new Set()
      for (const pron of pronStmt.all(entry.entryId, group.posGroupIndex)) {
        const dialect = dialectFromTags(parseTags(pron.tags_json))
        const audioUrl = allowedAudioUrl(pron.audio_url)
        const ipa = learnerIpa(pron.ipa) || null
        const key = `${dialect.code}\n${ipa || ''}\n${audioUrl || ''}`
        if (seenPronunciations.has(key)) continue
        seenPronunciations.add(key)
        if (/^\s*\[/.test(pron.ipa || '')) narrowIds.add(`${group.posGroupIndex}:${pron.pronunciation_index}`)
        pronunciations.push({
          pronunciationId: `${group.posGroupIndex}:${pron.pronunciation_index}`,
          ipa,
          dialect: dialect.code,
          dialectLabel: dialect.label,
          spokenForm: entry.headword,
          audio: audioUrl ? {
            url: audioUrl,
            source: pron.audio_source || null,
            sourceUrl: commonsFilePage(pron.audio_source),
            author: pron.audio_author || null,
            license: pron.audio_license || null,
            licenseUrl: pron.audio_license_url || null,
          } : null,
        })
      }
      // 未标口音的音标多是印度、苏格兰等地方音（adequate /əɖɪˈkweʈ/）；已有英美音时不再显示，
      // 带真人录音的仍保留。
      // 同组已有宽式音标时，严式 [ ] 多是地方音或音值细节（dragon 美 [ˈdreɪɡən]），同样不显示。
      const hasUsUk = pronunciations.some((item) => item.dialect === 'US' || item.dialect === 'UK')
      const hasBroad = pronunciations.some((item) => item.ipa && !narrowIds.has(item.pronunciationId))
      const shownPronunciations = pronunciations.filter((item) => item.audio || (
        !(hasUsUk && item.dialect === 'unspecified') && !(hasBroad && narrowIds.has(item.pronunciationId))
      ))
      return {
        posGroupIndex: group.posGroupIndex,
        pos: group.pos,
        posLabel: posLabel(group.pos),
        etymologyId: group.etymologyId,
        morphologyLabels: morphologyLabels(group.tagSets),
        matchedForm: group.formText,
        senses,
        pronunciations: shownPronunciations,
      }
    })
    return {
      entryId: entry.entryId,
      headword: entry.headword,
      posGroups,
    }
  })

  entries.sort((a, b) => a.headword.localeCompare(b.headword) || a.entryId.localeCompare(b.entryId))
  return {
    status: entries.length > 1 ? 'ambiguous' : 'found',
    entries,
  }
}
