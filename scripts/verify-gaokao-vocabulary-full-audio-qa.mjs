#!/usr/bin/env node

import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const rootDir = path.resolve(import.meta.dirname, '..')
const qaPath = path.join(rootDir, 'app/public/vocabulary-assets/gaokao-frequency-v1/qa/full-3000-audio-owner-qa-v1.html')
assert.equal(existsSync(qaPath), true, 'full audio QA page is missing')
const html = readFileSync(qaPath, 'utf8')
const match = html.match(/const entries = (\[[\s\S]*?\])\n    const storageKey/u)
assert.ok(match, 'full audio QA entries payload is missing')
const entries = JSON.parse(match[1])
assert.equal(entries.length, 3000, 'full audio QA page must contain 3000 entries')
assert.equal(new Set(entries.map((entry) => entry.entryId)).size, 3000, 'full audio QA IDs must be unique')
for (const entry of entries) {
  for (const accent of ['american', 'british']) {
    assert.match(entry.audio[accent], /^\.\.\/audio\/google-neural2-(?:us-c|gb-d)-v1\/.+\.mp3$/u, `${accent} QA URL is invalid for ${entry.entryId}`)
    const filePath = path.resolve(path.dirname(qaPath), entry.audio[accent])
    assert.equal(existsSync(filePath), true, `${accent} QA audio is missing for ${entry.entryId}`)
  }
}
for (const required of ['美音错', '英音错', '都错', '未选错误即默认都对', '未选错误，保存时默认都对', '<kbd>W</kbd> 美音', '<kbd>D</kbd> 英音', '<kbd>H</kbd> 美音错', '<kbd>U</kbd> 英音错', '<kbd>I</kbd> 都错', '<kbd>空格</kbd> 保存并下一个', '<kbd>⌫</kbd> 上一个', "'1': 'pass'", "h: 'american_fail'", "u: 'british_fail'", "i: 'both_fail'", "record.audioVerdict === 'pending'", "record.audioVerdict = 'pass'", "key === 'w'", "key === 'd'", "key === 'j'", "event.key === ' '", "event.key === 'Backspace'", "event.key === 'ArrowLeft'", "event.key === 'ArrowRight'", 'gaokao-frequency-full-3000-audio-owner-qa-v1.json']) {
  assert.ok(html.includes(required), `full audio QA contract is missing ${required}`)
}
for (const retired of ["'2': 'american_fail'", "'3': 'british_fail'", "'4': 'both_fail'", '美音错 <kbd>2</kbd>', '英音错 <kbd>3</kbd>', '都错 <kbd>4</kbd>']) {
  assert.equal(html.includes(retired), false, `full audio QA still exposes retired shortcut ${retired}`)
}

console.log('PASS gaokao full audio QA: 3000 entries, dual audio assets, component verdicts, resume/search/export, and keyboard contract')
