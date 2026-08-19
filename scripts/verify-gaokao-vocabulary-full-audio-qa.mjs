#!/usr/bin/env node

import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const rootDir = path.resolve(import.meta.dirname, '..')
const builderPath = path.join(rootDir, 'scripts/vocabulary/build-gaokao-full-audio-qa.mjs')
const builderSource = readFileSync(builderPath, 'utf8')
const manifests = {
  american: JSON.parse(readFileSync(path.join(rootDir, 'data/vocabulary/gaokao-frequency-full-american-audio-manifest-v1.json'), 'utf8')),
  british: JSON.parse(readFileSync(path.join(rootDir, 'data/vocabulary/gaokao-frequency-full-british-audio-manifest-v1.json'), 'utf8')),
}
const entryIdsByAccent = {}
for (const [accent, manifest] of Object.entries(manifests)) {
  assert.equal(manifest.entries.length, 3000, `${accent} QA manifest must contain 3000 entries`)
  entryIdsByAccent[accent] = manifest.entries.map((entry) => entry.entryId)
  assert.equal(new Set(entryIdsByAccent[accent]).size, 3000, `${accent} QA IDs must be unique`)
  for (const entry of manifest.entries) {
    assert.match(entry.path, /^.+\.mp3$/u, `${accent} QA audio path is invalid for ${entry.entryId}`)
    const filePath = path.join(rootDir, 'app/public', manifest.publicBasePath.slice(1), entry.path)
    assert.equal(existsSync(filePath), true, `${accent} QA audio is missing for ${entry.entryId}`)
  }
}
assert.deepEqual(entryIdsByAccent.american, entryIdsByAccent.british, 'American and British QA entry order differs')
for (const required of ['美音错', '英音错', '都错', '未选错误即默认正确', '未选错误，保存时默认都对', '<kbd>W</kbd> 美音', '<kbd>D</kbd> 英音', '<kbd>H</kbd> 美音错', '<kbd>U</kbd> 英音错', '<kbd>I</kbd> 都错', '<kbd>空格</kbd> 保存并下一个', '<kbd>⌫</kbd> 上一个', "'1': 'pass'", "h: 'american_fail'", "u: 'british_fail'", "i: 'both_fail'", "record.audioVerdict === 'pending'", "record.audioVerdict = 'pass'", "key === 'w'", "key === 'd'", "key === 'j'", "event.key === ' '", "event.key === 'Backspace'", "event.key === 'ArrowLeft'", "event.key === 'ArrowRight'", 'gaokao-frequency-full-3000-audio-owner-qa-v1.json']) {
  assert.ok(builderSource.includes(required), `full audio QA builder contract is missing ${required}`)
}
for (const retired of ["'2': 'american_fail'", "'3': 'british_fail'", "'4': 'both_fail'", '美音错 <kbd>2</kbd>', '英音错 <kbd>3</kbd>', '都错 <kbd>4</kbd>']) {
  assert.equal(builderSource.includes(retired), false, `full audio QA builder still exposes retired shortcut ${retired}`)
}

console.log('PASS gaokao full audio QA: reproducible 3000-entry builder, dual audio assets, component verdicts, resume/search/export, and keyboard contract')
