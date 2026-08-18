#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '../..')
const readJson = (file) => JSON.parse(readFileSync(path.join(root, file), 'utf8'))
const escapeXml = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
const emphasize = (text) => `<speak><emphasis level="moderate">${escapeXml(text)}</emphasis></speak>`
const emphasizePhoneme = (text, ipa) => `<speak><emphasis level="moderate"><phoneme alphabet="ipa" ph="${ipa}">${escapeXml(text)}</phoneme></emphasis></speak>`
const emphasizeCharacters = (characters) => `<speak><emphasis level="moderate"><say-as interpret-as="characters">${characters}</say-as></emphasis></speak>`

const source = readJson('data/vocabulary/gaokao-frequency-source-content-v1.json').entries
const plan = readJson('data/vocabulary/gaokao-frequency-full-audio-repair-plan-v1.json')
const previousOverrides = readJson('data/vocabulary/gaokao-frequency-audio-text-overrides-v1.json').entries
const repairIds = new Set(plan.entries.map((entry) => entry.entryId))
const sourceById = new Map(source.map((entry) => [entry.entryId, entry]))

const spokenText = {
  'gaokao-frequency-0468-p-m-pm': { american: 'p.m.', british: 'p.m.' },
  'gaokao-frequency-0716-recognize-recognise': { american: 'recognize', british: 'recognise' },
  'gaokao-frequency-0832-a-m-am': { american: 'a.m.', british: 'a.m.' },
  'gaokao-frequency-1774-mobile-phone': { british: 'mobile phone' },
  'gaokao-frequency-2168-ought-to': { american: 'ought to' },
  'gaokao-frequency-2739-ad-a-d': { british: 'AD' },
  'gaokao-frequency-2758-pe-p-e': { american: 'PE', british: 'PE' },
}

const lockedIpa = {
  'gaokao-frequency-0001-the': { american: 'ðə', british: 'ðə' },
  'gaokao-frequency-0227-research': { american: 'ˈɹiːsɚtʃ' },
  'gaokao-frequency-0877-conduct': { american: 'kənˈdʌkt', british: 'kənˈdʌkt' },
  'gaokao-frequency-1011-ms': { british: 'mɪz' },
  'gaokao-frequency-1372-separate': { american: 'ˈsɛpərət', british: 'ˈsɛprət' },
  'gaokao-frequency-2035-suspect': { american: 'səˈspɛkt', british: 'səˈspɛkt' },
  'gaokao-frequency-2172-digest': { american: 'daɪˈdʒɛst', british: 'daɪˈdʒɛst' },
  'gaokao-frequency-2766-download': { american: 'ˌdaʊnˈloʊd', british: 'ˌdaʊnˈləʊd' },
  'gaokao-frequency-2938-bow': { american: 'baʊ', british: 'baʊ' },
}

const characterSsml = {
  'gaokao-frequency-0468-p-m-pm': { american: 'PM', british: 'PM' },
  'gaokao-frequency-0832-a-m-am': { american: 'AM', british: 'AM' },
  'gaokao-frequency-2739-ad-a-d': { british: 'AD' },
  'gaokao-frequency-2758-pe-p-e': { american: 'PE', british: 'PE' },
}

const repairOverrides = plan.entries.map((planned) => {
  const sourceEntry = sourceById.get(planned.entryId)
  if (!sourceEntry) throw new Error(`Missing source entry ${planned.entryId}`)
  const override = {
    entryId: planned.entryId,
    reason: 'Owner requested a second regeneration: Neural2 natural pronunciation with moderate emphasis; only heteronyms and abbreviations remain explicitly locked.',
  }
  for (const accent of Object.keys(planned.repairs)) {
    const text = spokenText[planned.entryId]?.[accent]
      ?? sourceEntry.headword.replace(/\s*[,;/]\s*.*/u, '').trim()
    if (text !== sourceEntry.headword) override[accent] = text
    override[`${accent}Ssml`] = characterSsml[planned.entryId]?.[accent]
      ? emphasizeCharacters(characterSsml[planned.entryId][accent])
      : lockedIpa[planned.entryId]?.[accent]
        ? emphasizePhoneme(text, lockedIpa[planned.entryId][accent])
        : emphasize(text)
  }
  return override
})

const payload = {
  schemaVersion: 'gaokao-frequency-audio-text-overrides-v1',
  status: 'candidate_pending_owner_reqa',
  strategy: 'natural-neural2-moderate-emphasis-with-minimal-phoneme-locks-v2',
  entries: [...previousOverrides.filter((entry) => !repairIds.has(entry.entryId)), ...repairOverrides],
}

const outputDirectory = path.join(root, '.scratch/gaokao-audio-repair-v2')
mkdirSync(outputDirectory, { recursive: true })
writeFileSync(path.join(outputDirectory, 'overrides.json'), `${JSON.stringify(payload, null, 2)}\n`)
writeFileSync(path.join(outputDirectory, 'strategy.json'), `${JSON.stringify({
  schemaVersion: 'gaokao-frequency-audio-repair-strategy-v2',
  status: 'candidate_pending_owner_reqa',
  sourcePlan: 'data/vocabulary/gaokao-frequency-full-audio-repair-plan-v1.json',
  repairWordCount: plan.entries.length,
  generatedAccentCount: plan.entries.reduce((count, entry) => count + Object.keys(entry.repairs).length, 0),
  naturalEmphasisCount: plan.entries.reduce((count, entry) => count + Object.keys(entry.repairs).filter((accent) => !lockedIpa[entry.entryId]?.[accent] && !characterSsml[entry.entryId]?.[accent]).length, 0),
  phonemeLockedCount: Object.values(lockedIpa).reduce((count, accents) => count + Object.keys(accents).length, 0),
  characterLockedCount: Object.values(characterSsml).reduce((count, accents) => count + Object.keys(accents).length, 0),
}, null, 2)}\n`)

console.log(JSON.stringify({ repairWords: plan.entries.length, overrides: payload.entries.length, outputDirectory }, null, 2))
