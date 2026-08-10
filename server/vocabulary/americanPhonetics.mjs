import { readFileSync } from 'node:fs'

const manifest = JSON.parse(readFileSync(
  new URL('../../data/vocabulary/wanwei-american-phonetics-v1.json', import.meta.url),
  'utf8',
))

if (manifest.schemaVersion !== 'wanwei-american-phonetics-v1' || manifest.dialect !== 'en-US') {
  throw new Error('Invalid Wanwei American phonetics manifest')
}
if (!Array.isArray(manifest.entries) || manifest.entries.length !== 1600) {
  throw new Error(`Expected 1600 American phonetics entries, found ${manifest.entries?.length ?? 0}`)
}

const phoneticsByEntryId = new Map(manifest.entries.map((entry) => [entry.entryId, entry]))
if (phoneticsByEntryId.size !== manifest.entries.length) throw new Error('Duplicate American phonetics entry IDs')

export function applyAmericanVocabularyPhonetics(entry) {
  const american = phoneticsByEntryId.get(entry.id)
  if (!american) return entry
  if (!Array.isArray(american.parts) || !american.parts.length) {
    throw new Error(`Missing American pronunciation parts for ${entry.id}`)
  }
  const britishParts = entry.pronunciationParts?.british ?? entry.syllables
  return {
    ...entry,
    phonetic: american.phonetic,
    syllables: american.parts,
    pronunciationParts: {
      american: american.parts,
      british: britishParts,
    },
  }
}
