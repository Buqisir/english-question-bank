import assert from 'node:assert/strict'
import { isBase64String } from '../shared/paper-canonical/base64.mjs'

const previous = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/
let comparisons = 0
function compare(value) {
  assert.equal(isBase64String(value), previous.test(value), JSON.stringify(value))
  comparisons++
}
// Exhaust every string through length six over representatives of each class.
const alphabet = ['A', 'z', '0', '+', '/', '=', '!', '\n']
function enumerate(prefix, remaining) {
  compare(prefix)
  if (remaining === 0) return
  for (const character of alphabet) enumerate(prefix + character, remaining - 1)
}
enumerate('', 6)
for (let code = 0; code <= 0xffff; code++) {
  const character = String.fromCharCode(code)
  compare(`AAA${character}`)
  compare(`A${character}==`)
}
let seed = 0x9e3779b9
function random() {
  seed ^= seed << 13
  seed ^= seed >>> 17
  seed ^= seed << 5
  return seed >>> 0
}
for (let sample = 0; sample < 10000; sample++) {
  const bytes = Buffer.from(Array.from({ length: random() % 96 }, () => random() & 255))
  const valid = bytes.toString('base64')
  compare(valid)
  const position = random() % (valid.length + 1)
  compare(valid.slice(0, position) + String.fromCharCode(random() & 0xffff) + valid.slice(position + 1))
}
for (const value of [undefined, null, 0, {}, [], new String('AAAA')]) {
  assert.equal(isBase64String(value), false)
}
assert.equal(isBase64String(''), true)
assert.equal(isBase64String('AB=='), true)
for (const size of [4, 12, 20]) {
  const encoded = Buffer.alloc(size * 1024 * 1024, 0xa5).toString('base64')
  assert.equal(isBase64String(encoded), true, `${size} MiB`)
  for (const invalid of [
    encoded.slice(0, -1) + '!',
    encoded.slice(0, -3) + '===',
    encoded.slice(0, -1),
    encoded.slice(0, 4) + '=' + encoded.slice(5),
  ]) assert.equal(isBase64String(invalid), false, `${size} MiB malformed input`)
}
console.log(`verify-paper-canonical-base64: PASS (${comparisons} old/new comparisons; 4/12/20 MiB and malformed tails)`)
