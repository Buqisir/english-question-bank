#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

function parseArgs(argv) {
  const args = {}
  for (let index = 0; index < argv.length; index += 2) args[argv[index].replace(/^--/u, '')] = argv[index + 1]
  for (const key of ['learning', 'american-output', 'british-output']) if (!args[key]) throw new Error(`Missing --${key}`)
  return args
}

function normalizedSpelling(value) {
  return String(value ?? '').replace(/·/gu, '').replace(/\s+/gu, ' ').trim()
}

function audioText(entry, accent, overridesById) {
  const override = overridesById.get(entry.entryId)
  const overrideText = override?.[accent] ?? override?.text
  if (overrideText) return overrideText
  const headword = entry.headword.trim()
  const phraseCandidate = headword
    .replace(/\([^)]*(?:pl\.|AmE|BrE|=)[^)]*\)/giu, '')
    .replace(/\s+/gu, ' ')
    .trim()
  if (/^[A-Za-z.'-]+(?:\s+[A-Za-z.'-]+)+$/u.test(phraseCandidate)) return phraseCandidate
  if (entry.pronunciationMode === 'forms') {
    const firstForm = normalizedSpelling(entry.pronunciationParts?.[accent]?.[0]?.spelling)
    if (firstForm) return firstForm
  }
  return headword
    .replace(/\(([A-Za-z]+)\)/gu, '')
    .split(/\s*[,;/]\s*/u)[0]
    .replace(/\s*\([^)]*\)\s*/gu, '')
    .trim()
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function audioSpec(entry, accent, overridesById) {
  const text = audioText(entry, accent, overridesById)
  const override = overridesById.get(entry.entryId)
  const ssml = override?.[`${accent}Ssml`]
    ?? (override?.[`${accent}Ipa`]
      ? `<speak><phoneme alphabet="ipa" ph="${escapeXml(override[`${accent}Ipa`])}">${escapeXml(text)}</phoneme></speak>`
      : null)
  return ssml ? { text, ssml } : { text }
}

const args = parseArgs(process.argv.slice(2))
const learning = JSON.parse(readFileSync(path.resolve(args.learning), 'utf8'))
if (!Array.isArray(learning.entries) || !learning.entries.length) throw new Error('Learning content is empty')
const overridePayload = args.overrides
  ? JSON.parse(readFileSync(path.resolve(args.overrides), 'utf8'))
  : { schemaVersion: 'gaokao-frequency-audio-text-overrides-v1', entries: [] }
if (overridePayload.schemaVersion !== 'gaokao-frequency-audio-text-overrides-v1' || !Array.isArray(overridePayload.entries)) {
  throw new Error('Audio text overrides contract mismatch')
}
const sourceIds = new Set(learning.entries.map((entry) => entry.entryId))
const overridesById = new Map(overridePayload.entries.map((entry) => [entry.entryId, entry]))
if (
  overridesById.size !== overridePayload.entries.length
  || overridePayload.entries.some((entry) => (
    !sourceIds.has(entry.entryId)
    || !(entry.text || entry.american || entry.british || entry.americanIpa || entry.britishIpa || entry.americanSsml || entry.britishSsml)
  ))
) {
  throw new Error('Audio text overrides contain duplicate, unknown, or empty entries')
}
const makeEntries = (accent) => learning.entries.map((entry) => ({
  id: entry.entryId,
  headword: entry.headword,
  audio: audioSpec(entry, accent, overridesById),
}))
const americanEntries = makeEntries('american')
const britishEntries = makeEntries('british')
if (
  new Set(americanEntries.map((entry) => entry.id)).size !== americanEntries.length
  || americanEntries.some((entry) => !entry.audio.text)
  || britishEntries.some((entry) => !entry.audio.text)
) {
  throw new Error('Audio script contains duplicate IDs or empty text')
}
const base = { schemaVersion: 'gaokao-frequency-audio-script-v1', programId: 'gaokao-curriculum-3000-frequency-v1' }
writeFileSync(path.resolve(args['american-output']), `${JSON.stringify({ ...base, voice: 'en-US-Neural2-C', entries: americanEntries }, null, 2)}\n`)
writeFileSync(path.resolve(args['british-output']), `${JSON.stringify({ ...base, voice: 'en-GB-Neural2-D', entries: britishEntries }, null, 2)}\n`)
console.log(JSON.stringify({
  entries: americanEntries.length,
  overrides: overridesById.size,
  americanPhrases: americanEntries.filter((entry) => /\s/u.test(entry.audio.text)).length,
  britishPhrases: britishEntries.filter((entry) => /\s/u.test(entry.audio.text)).length,
}, null, 2))
