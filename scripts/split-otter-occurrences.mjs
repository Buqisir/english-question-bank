#!/usr/bin/env node
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { cleanExample, occurrenceKey, validOccurrencePaperId } from '../server/paper-dictionary/otter.mjs'

function sourceKey(paperId, groupId, locator) {
  return occurrenceKey(paperId, groupId, locator.paragraphId ?? locator.questionId, locator.sentence)
}

export function splitOtterOccurrences(source, output) {
  const entriesDir = path.join(source, 'entries')
  const entries = readdirSync(entriesDir).filter(name => name.endsWith('.json')).sort()
    .map(name => JSON.parse(readFileSync(path.join(entriesDir, name), 'utf8')))
  const phraseIds = new Set(entries.filter(entry => entry.kind === 'phrase').map(entry => entry.entryId))
  const papers = new Map()
  const phraseRows = new Map()
  const legacySentences = Object.create(null)
  for (const line of readFileSync(path.join(source, 'occurrence-senses.ndjson'), 'utf8').split('\n')) {
    if (!line.trim()) continue
    const row = JSON.parse(line)
    if (!validOccurrencePaperId(row.paperId)) throw new Error(`Invalid paperId: ${row.paperId}`)
    if (!papers.has(row.paperId)) papers.set(row.paperId, [])
    papers.get(row.paperId).push(line)
    if (!phraseIds.has(row.entryId)) continue
    const key = sourceKey(row.paperId, row.groupId, row)
    if (!phraseRows.has(key)) phraseRows.set(key, [])
    phraseRows.get(key).push(row)
    if (!row.sentenceText) legacySentences[key] ??= []
  }

  const exampleHighlights = Object.create(null)
  for (const entry of entries) {
    for (const sense of entry.senses) {
      for (const example of sense.examples) {
        const { paperId, groupId, locator } = example.source
        const key = sourceKey(paperId, groupId, locator)
        const rows = phraseRows.get(key)
        if (!rows) continue
        const text = cleanExample(example.text)
        const sentences = legacySentences[key]
        if (sentences && !sentences.includes(text)) sentences.push(text)
        if (entry.kind !== 'phrase') continue
        const points = [...text]
        const row = rows.find(row => row.entryId === entry.entryId && row.senseId === sense.senseId
          && row.end <= points.length && (!row.surface || points.slice(row.start, row.end).join('') === row.surface))
        if (!row) continue
        const ranges = row.parts ?? [[row.start, row.end]]
        if (JSON.stringify(example.highlightRanges) === JSON.stringify(ranges)) continue
        exampleHighlights[entry.entryId] ??= {}
        exampleHighlights[entry.entryId][occurrenceKey(sense.senseId, example.exampleId)] = ranges
      }
    }
  }
  const phrasesAvailable = [...phraseRows].some(([key, rows]) =>
    legacySentences[key]?.length || rows.some(row => row.sentenceText))
  mkdirSync(output)
  for (const paperId of [...papers.keys()].sort()) {
    writeFileSync(path.join(output, `${paperId}.ndjson`), `${papers.get(paperId).join('\n')}\n`)
  }
  writeFileSync(path.join(output, 'index.json'), `${JSON.stringify({ phrasesAvailable, legacySentences, exampleHighlights })}\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [source, output] = process.argv.slice(2)
  if (!source || !output) throw new Error('Usage: node scripts/split-otter-occurrences.mjs <snapshot-otter-data> <new-occurrences-directory>')
  splitOtterOccurrences(source, output)
}
