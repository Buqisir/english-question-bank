import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { sendPaperAssetStatic } from '../server/paper-import/paperAssetStatic.mjs'

const root = mkdtempSync(path.join(tmpdir(), 'listening-serving-'))
const assets = path.join(root, 'paper-assets')
const version = path.join(assets, 'paper-fixture/versions/v1')
const audioUrl = '/paper-assets/paper-fixture/versions/v1/listening/playback.mp3'
const bytes = Buffer.from('0123456789')
mkdirSync(path.join(version, 'listening'), { recursive: true })
writeFileSync(path.join(version, 'listening/playback.mp3'), bytes)
writeFileSync(path.join(version, 'paper-asset.json'), '{}')
writeFileSync(path.join(root, 'private.json'), 'private')
symlinkSync(path.join(root, 'private.json'), path.join(version, 'escape.json'))
for (const file of ['source/listening-audio.mp3', 'materialization/listening-audio/asr-v1.json', 'materialization/listening-audio/check-v1.json']) {
  mkdirSync(path.dirname(path.join(version, file)), { recursive: true })
  writeFileSync(path.join(version, file), 'private')
}
const server = createServer((request, response) => {
  sendPaperAssetStatic(request, response, request.url, assets)
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${server.address().port}`
try {
  const full = await fetch(origin + audioUrl)
  assert.equal(full.status, 200)
  assert.equal(full.headers.get('content-type'), 'audio/mpeg')
  assert.equal(full.headers.get('accept-ranges'), 'bytes')
  assert.equal(full.headers.get('cache-control'), 'private, max-age=31536000, immutable')
  assert.equal(await full.text(), '0123456789')
  for (const [range, body, contentRange] of [
    ['bytes=2-5', '2345', 'bytes 2-5/10'],
    ['bytes=7-', '789', 'bytes 7-9/10'],
    ['bytes=-3', '789', 'bytes 7-9/10'],
    ['bytes=8-999', '89', 'bytes 8-9/10'],
  ]) {
    const response = await fetch(origin + audioUrl, { headers: { range } })
    assert.equal(response.status, 206)
    assert.equal(response.headers.get('content-range'), contentRange)
    assert.equal(await response.text(), body)
  }
  for (const range of ['bytes=10-', 'bytes=8-2', 'bytes=-0', 'bytes=0-1,3-4', 'bad', 'bytes=99999999999999999999-']) {
    const response = await fetch(origin + audioUrl, { headers: { range } })
    assert.equal(response.status, 416, range)
    assert.equal(response.headers.get('content-range'), 'bytes */10')
  }
  const head = await fetch(origin + audioUrl, { method: 'HEAD' })
  assert.equal(head.status, 200)
  assert.equal(head.headers.get('content-length'), '10')
  assert.equal(await head.text(), '')
  for (const file of ['source/listening-audio.mp3', 'materialization/listening-audio/asr-v1.json', 'materialization/listening-audio/check-v1.json', 'escape.json']) {
    assert.equal((await fetch(`${origin}/paper-assets/paper-fixture/versions/v1/${file}`)).status, 404, file)
  }
  assert.equal((await fetch(`${origin}/paper-assets/paper-fixture/latest/listening/playback.mp3`)).status, 404)
  assert.equal((await fetch(`${origin}/paper-assets/%2e%2e%2fprivate.json`)).status, 400)
  assert.equal((await fetch(`${origin}/paper-assets/%ZZ`)).status, 400)
  assert.equal((await fetch(`${origin}/paper-assets/paper-fixture/latest/paper-asset.json`)).status, 200)
  console.log('verify-listening-audio-serving: PASS (200/206/416/HEAD, private artifacts, traversal, symlink, historical JSON)')
} finally {
  await new Promise((resolve) => server.close(resolve))
  rmSync(root, { recursive: true, force: true })
}
