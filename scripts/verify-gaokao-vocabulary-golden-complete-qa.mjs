#!/usr/bin/env node

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const rootDir = path.resolve(import.meta.dirname, '..')
const htmlPath = path.join(rootDir, 'app/public/vocabulary-assets/gaokao-frequency-v1/qa/golden-complete-owner-qa-v1.html')
const html = readFileSync(htmlPath, 'utf8')
const entriesMatch = html.match(/const entries = (\[.*\])\n    const storageKey/su)
assert.ok(entriesMatch, 'QA page has no embedded production-shaped entry payload')
const entries = JSON.parse(entriesMatch[1])

assert.equal(entries.length, 90, 'complete QA page must contain exactly 90 entries')
assert.equal(new Set(entries.map((entry) => entry.entryId)).size, 90, 'QA page entry IDs must be unique')
assert.equal(entries.filter((entry) => entry.binding.visualMode === 'direct-sense').length, 79, 'direct visual count changed')
assert.equal(entries.filter((entry) => entry.binding.visualMode === 'sentence-scene').length, 11, 'sentence-scene visual count changed')
for (const entry of entries) {
  assert.equal(entry.examples.length, 3, `QA page must show three examples for ${entry.entryId}`)
  assert.match(entry.visual.src, /^\.\.\/visuals\/koboyo-v1\/[A-Za-z0-9._-]+\.svg$/u, `QA visual path is invalid for ${entry.entryId}`)
  assert.match(entry.audio.american, /^\.\.\/audio\/google-neural2-us-c-v1\/[A-Za-z0-9._-]+\.mp3$/u, `QA American audio path is invalid for ${entry.entryId}`)
  assert.match(entry.audio.british, /^\.\.\/audio\/google-neural2-gb-d-v1\/[A-Za-z0-9._-]+\.mp3$/u, `QA British audio path is invalid for ${entry.entryId}`)
  if (entry.binding.visualMode === 'sentence-scene') {
    const candidateId = entry.binding.visualSentenceId.replace('candidate-', '')
    assert.ok(entry.examples.some((example) => example.candidateId === candidateId), `QA page cannot render bound sentence for ${entry.entryId}`)
    assert.equal(entry.binding.displayContract, 'image_and_exact_sentence_with_target_highlight', `QA sentence display contract changed for ${entry.entryId}`)
  }
}

assert.doesNotMatch(html, /\bautoplay\b/iu, 'QA page must never autoplay or continuously play words')
assert.match(html, /new Audio\(entry\.audio\[accent\]\)/u, 'QA page does not load only the selected accent for the current entry')
assert.match(html, /const stopAudio = \(\) =>/u, 'QA page cannot stop the previous word before playing another')
assert.match(html, /localStorage\.setItem\(storageKey \+ ':verdicts'/u, 'QA verdicts are not persisted locally')
assert.match(html, /gaokao-frequency-golden-complete-owner-qa-v1\.json/u, 'QA export receipt is missing')
assert.match(html, /<meta name="viewport"/u, 'QA page has no mobile viewport contract')
for (const audioVerdict of ['pass', 'american_fail', 'british_fail', 'both_fail']) {
  assert.match(html, new RegExp(`data-audio-value="${audioVerdict}"`, 'u'), `QA page is missing audio verdict ${audioVerdict}`)
}
assert.match(html, /schemaVersion: 2/u, 'QA export schema must preserve component-level verdicts')
assert.match(html, /americanAudio: audio\.american/u, 'QA export does not preserve the American audio verdict')
assert.match(html, /britishAudio: audio\.british/u, 'QA export does not preserve the British audio verdict')
assert.match(html, /issues\.push\('american_audio'\)/u, 'QA export cannot pinpoint an American audio issue')
assert.match(html, /issues\.push\('british_audio'\)/u, 'QA export cannot pinpoint a British audio issue')
assert.match(html, /document\.addEventListener\('keydown'/u, 'QA page has no keyboard QA contract')
assert.match(html, /playAmerican: 'A'/u, 'American playback shortcut changed')
assert.match(html, /playBritish: 'B'/u, 'British playback shortcut changed')
assert.match(html, /americanFail: '2'/u, 'American-fail shortcut changed')
assert.match(html, /britishFail: '3'/u, 'British-fail shortcut changed')
assert.match(html, /saveAndNext: 'Enter'/u, 'save-and-next shortcut changed')

console.log('PASS gaokao complete QA page: 90 one-word review units with component-level US/GB verdicts and keyboard QA')
