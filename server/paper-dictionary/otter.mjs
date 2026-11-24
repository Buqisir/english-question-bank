import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { splitSentences } from '../../shared/paper-selection/segmentation.mjs'

const normalize = (text) => text.normalize('NFC').trim()
const normalizeSentence = (text) => normalize(text).replace(/\s+/g, ' ').replace(/ +([.,!?])/g, '$1')
const occurrenceKey = (...parts) => JSON.stringify(parts)

function readOptional(read, fallback) {
  try {
    return read()
  } catch (error) {
    if (error.code === 'ENOENT') return fallback
    throw error
  }
}

export function openOtterDictionary(rootDir) {
  const dir = path.join(rootDir, 'data', 'otter-dictionary')
  const entriesDir = path.join(dir, 'entries')
  const entries = readOptional(() => readdirSync(entriesDir), [])
    .filter(name => name.endsWith('.json')).sort()
    .map(name => JSON.parse(readFileSync(path.join(entriesDir, name), 'utf8')))
  const headwords = new Map(entries.map(entry => [normalize(entry.headword), entry]))
  const aliases = new Map()
  for (const entry of entries) {
    for (const form of [entry.headword, ...entry.variants, ...entry.forms.map(item => item.form)]) {
      const key = normalize(form).toLowerCase()
      aliases.set(key, !aliases.has(key) || aliases.get(key) === entry ? entry : null)
    }
  }
  const occurrences = new Map()
  const mapFile = path.join(dir, 'occurrence-senses.ndjson')
  const rows = readOptional(() => readFileSync(mapFile, 'utf8'), '').trim()
  for (const line of rows ? rows.split('\n') : []) {
    const row = JSON.parse(line)
    const key = occurrenceKey(row.paperId, row.groupId, row.paragraphId ?? row.questionId,
      row.sentence, row.start, row.end, row.surface, row.entryId)
    occurrences.set(key, row.senseId)
  }
  return {
    available: entries.length > 0,
    find(surface) {
      const key = normalize(surface)
      return headwords.get(key) ?? aliases.get(key.toLowerCase()) ?? null
    },
    match(entry, paperId, stream, word) {
      const leaf = stream.leaves.find(item => item.start <= word.start && item.end >= word.end)
      if (!leaf) return null
      const text = stream.text.slice(leaf.start, leaf.end)
      const sentences = splitSentences(text)
      const index = sentences.findIndex(item => item.start <= word.start - leaf.start && item.end >= word.end - leaf.start)
      if (index < 0) return null
      const sentence = sentences[index]
      const start = [...text.slice(sentence.start, word.start - leaf.start).trimStart()].length
      const end = start + [...word.surface].length
      const locator = leaf.kind === 'option' ? leaf.id.replace(/:([^:]+)$/, '#option=$1') : leaf.id
      const key = occurrenceKey(paperId, stream.groupId, locator, index + 1, start, end, word.surface, entry.entryId)
      const senseId = occurrences.get(key)
      if (entry.senses.some(sense => sense.senseId === senseId)) return senseId
      const sentenceText = normalizeSentence(sentence.text)
      const matches = entry.senses.filter(sense => sense.examples.some(example =>
        normalizeSentence(example.text) === sentenceText))
      return matches.length === 1 ? matches[0].senseId : null
    },
  }
}
