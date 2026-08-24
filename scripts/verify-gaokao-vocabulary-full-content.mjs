#!/usr/bin/env node

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const rootDir = path.resolve(import.meta.dirname, '..')
const readJson = (relativePath) => JSON.parse(readFileSync(path.join(rootDir, relativePath), 'utf8'))
const source = readJson('data/vocabulary/gaokao-frequency-source-content-v1.json').entries
const reviewedPayload = readJson('data/vocabulary/gaokao-frequency-learning-reviewed-v1.json')
const reviewed = reviewedPayload.entries

assert.equal(source.length, 3_000, 'source content must contain exactly 3000 entries')
assert.equal(reviewed.length, 3_000, 'reviewed learning content must contain exactly 3000 entries')
assert.equal(new Set(reviewed.map((entry) => entry.entryId)).size, 3_000, 'reviewed entry IDs must be unique')
assert.deepEqual(reviewed.map((entry) => entry.entryId), source.map((entry) => entry.entryId), 'reviewed entries must preserve source order')

const normalizedExamples = new Set()
for (let index = 0; index < source.length; index += 1) {
  const authority = source[index]
  const entry = reviewed[index]
  assert.equal(entry.entryId, authority.entryId, `entry identity mismatch at source order ${authority.sourceOrder}`)
  assert.equal(entry.headword, authority.headword, `headword mismatch for ${authority.entryId}`)
  assert.equal(entry.partOfSpeech, authority.partOfSpeech, `part of speech mismatch for ${authority.entryId}`)
  assert.deepEqual(entry.sourceMeanings, authority.sourceMeanings, `source meanings mismatch for ${authority.entryId}`)
  assert.ok(Array.isArray(entry.teachingSenses) && entry.teachingSenses.length >= 1 && entry.teachingSenses.length <= 3, `invalid teaching senses for ${authority.entryId}`)
  assert.ok(entry.teachingSenses.every((sense) => typeof sense === 'string' && sense.trim()), `empty teaching sense for ${authority.entryId}`)
  assert.ok(['syllables', 'forms'].includes(entry.pronunciationMode), `invalid pronunciation mode for ${authority.entryId}`)
  for (const accent of ['american', 'british']) {
    assert.match(entry.phonetics?.[accent] ?? '', /^\/[^/]+\/$/u, `invalid ${accent} IPA for ${authority.entryId}`)
    assert.ok(Array.isArray(entry.pronunciationParts?.[accent]) && entry.pronunciationParts[accent].length >= 1, `missing ${accent} pronunciation parts for ${authority.entryId}`)
    for (const part of entry.pronunciationParts[accent]) {
      assert.ok(typeof part.spelling === 'string' && part.spelling.trim(), `empty ${accent} spelling for ${authority.entryId}`)
      assert.match(part.phonetic ?? '', /^\/[^/]+\/$/u, `invalid ${accent} part IPA for ${authority.entryId}`)
    }
  }
  assert.equal(entry.independentReview?.status, 'approved', `independent review missing for ${authority.entryId}`)
  assert.equal(entry.examples?.length, 3, `need exactly three examples for ${authority.entryId}`)
  assert.deepEqual(entry.examples.map((example) => example.candidateId), ['a', 'b', 'c'], `example IDs changed for ${authority.entryId}`)
  for (const example of entry.examples) {
    assert.ok(entry.teachingSenses.includes(example.teachingSense), `example sense is not approved for ${authority.entryId}/${example.candidateId}`)
    assert.ok(example.english.includes(example.highlight), `highlight is absent for ${authority.entryId}/${example.candidateId}`)
    assert.match(example.chinese, /[\u3400-\u9fff]/u, `Chinese translation missing for ${authority.entryId}/${example.candidateId}`)
    assert.doesNotMatch(`${example.english}${example.chinese}`, /\p{Extended_Pictographic}/u, `emoji in example for ${authority.entryId}/${example.candidateId}`)
    const normalized = example.english.toLocaleLowerCase().replace(/[^a-z0-9]+/gu, ' ').trim()
    assert.ok(normalized.length >= 5, `example is too short for ${authority.entryId}/${example.candidateId}`)
    assert.equal(normalizedExamples.has(normalized), false, `duplicate example: ${example.english}`)
    normalizedExamples.add(normalized)
  }
}

assert.equal(normalizedExamples.size, 9_000, 'full course must contain 9000 unique examples')
console.log('PASS gaokao full content: 3000 independently reviewed entries and 9000 unique examples')
