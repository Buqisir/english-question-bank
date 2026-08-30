#!/usr/bin/env node

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const rootDir = path.resolve(import.meta.dirname, '..')
const samplePath = path.join(rootDir, 'data/vocabulary/gaokao-frequency-golden-sample-v1.json')
const candidatePath = path.join(rootDir, 'data/vocabulary/gaokao-frequency-golden-learning-candidates-v1.json')
const reviewedPath = path.join(rootDir, 'data/vocabulary/gaokao-frequency-golden-learning-reviewed-v1.json')

const sample = JSON.parse(readFileSync(samplePath, 'utf8')).entries
const candidates = JSON.parse(readFileSync(candidatePath, 'utf8')).entries
const reviewed = JSON.parse(readFileSync(reviewedPath, 'utf8')).entries
const sampleById = new Map(sample.map((entry) => [entry.entryId, entry]))
const reviewedEnglish = new Set()
const emojiPattern = /\p{Extended_Pictographic}/u

assert.equal(sample.length, 90, 'golden sample must contain exactly 90 entries')
assert.equal(candidates.length, 90, 'candidate content must contain exactly 90 entries')
assert.equal(reviewed.length, 90, 'independently reviewed content must contain exactly 90 entries')
assert.equal(new Set(reviewed.map((entry) => entry.entryId)).size, 90, 'reviewed entry IDs must be unique')

for (const entry of reviewed) {
  const source = sampleById.get(entry.entryId)
  assert.ok(source, `reviewed entry is outside the golden sample: ${entry.entryId}`)
  assert.equal(entry.headword, source.headword, `headword changed for ${entry.entryId}`)
  assert.deepEqual(entry.sourceMeanings, source.sourceMeanings, `source meanings changed for ${entry.entryId}`)
  assert.equal(entry.partOfSpeech, source.partOfSpeech, `part of speech changed for ${entry.entryId}`)
  assert.ok(entry.teachingSenses.length >= 1 && entry.teachingSenses.length <= 3, `invalid teaching senses for ${entry.entryId}`)
  assert.ok(entry.teachingSenses.every((sense) => typeof sense === 'string' && sense.trim()), `empty teaching sense for ${entry.entryId}`)
  assert.ok(['syllables', 'forms'].includes(entry.pronunciationMode), `invalid pronunciation mode for ${entry.entryId}`)
  for (const accent of ['american', 'british']) {
    assert.match(entry.phonetics[accent], /^\/.+\/$/u, `invalid ${accent} IPA for ${entry.entryId}`)
    assert.ok(entry.pronunciationParts[accent].length >= 1, `missing ${accent} pronunciation parts for ${entry.entryId}`)
    for (const part of entry.pronunciationParts[accent]) {
      assert.ok(part.spelling?.trim() && part.phonetic?.trim(), `empty ${accent} pronunciation part for ${entry.entryId}`)
    }
  }
  assert.deepEqual(entry.examples.map((example) => example.candidateId), ['a', 'b', 'c'], `examples must be ordered a,b,c for ${entry.entryId}`)
  assert.equal(entry.independentReview?.status, 'approved', `entry is not independently approved: ${entry.entryId}`)
  for (const example of entry.examples) {
    assert.ok(entry.teachingSenses.includes(example.teachingSense), `example sense is not selected for ${entry.entryId}/${example.candidateId}`)
    assert.ok(example.english.includes(example.highlight), `highlight is not in sentence for ${entry.entryId}/${example.candidateId}`)
    assert.ok(example.chinese.trim(), `translation is empty for ${entry.entryId}/${example.candidateId}`)
    assert.equal(emojiPattern.test(`${example.english}${example.chinese}`), false, `emoji found for ${entry.entryId}/${example.candidateId}`)
    const normalized = example.english.trim().toLocaleLowerCase('en-US')
    assert.equal(reviewedEnglish.has(normalized), false, `duplicate golden example: ${example.english}`)
    reviewedEnglish.add(normalized)
  }
}

assert.equal(reviewedEnglish.size, 270, 'golden content must contain 270 unique examples')
console.log('PASS gaokao golden content: 90 independently reviewed entries and 270 unique approved examples')
