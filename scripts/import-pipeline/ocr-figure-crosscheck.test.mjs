import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { coverageRatio, crosscheckFigures, matchesExemption, writeFigureCrosscheck } from './ocr-figure-crosscheck.mjs'

const bbox = [0, 0, 1, 1]
const region = (x, y, width, height) => ({ x, y, width, height })
const candidate = { pageKey: 'p03', imageSha256: 'digest', candidateId: 'p03-c1', category: 'image', bbox }
const page = { key: 'p03', imageSha256: 'digest' }
const detection = (overrides = {}) => ({ pages: [{ ...candidate, status: 'ok', hasTable: true,
  candidates: [candidate], ...overrides }] })

test('coverage integrates multiple figures as a union, including overlap and clipping', () => {
  assert.equal(coverageRatio(bbox, []), 0)
  assert.equal(coverageRatio(bbox, [region(0, 0, 0.5, 1), region(0.5, 0, 0.5, 1)]), 1)
  assert.equal(coverageRatio(bbox, [region(0, 0, 0.6, 1), region(0.4, 0, 0.4, 1)]), 0.8)
  assert.equal(coverageRatio(bbox, [region(0, 0, 0.5, 0.5), region(0.25, 0.25, 0.5, 0.5)]), 0.4375)
  assert.equal(coverageRatio([0.25, 0.25, 0.75, 0.75], [region(0, 0, 1, 1)]), 1)
  assert.equal(coverageRatio(bbox, [region(2, 2, 1, 1)]), 0)
})

test('exemption binds all four identity fields and requires the fifth field, reason', () => {
  const exemption = { ...candidate, reason: '经页图确认是装饰' }
  assert.equal(matchesExemption(candidate, exemption), true)
  for (const key of ['pageKey', 'imageSha256', 'candidateId', 'category']) {
    assert.equal(matchesExemption(candidate, { ...exemption, [key]: 'other' }), false, key)
  }
  for (const reason of [undefined, '', '   ', 123]) {
    assert.equal(matchesExemption(candidate, { ...exemption, reason }), false)
  }
  const result = crosscheckFigures({ pages: [page], figures: [], detection: detection(), exemptions: [exemption] })
  assert.equal(result.exempted.length, 1)
  assert.equal(result.uncovered.length, 0)
  assert.deepEqual(result.tablePages, ['p03'])
  assert.equal(crosscheckFigures({ pages: [page], figures: [], detection: detection(),
    exemptions: [{ ...exemption, imageSha256: 'old' }] }).uncovered.length, 1)
})

test('90 percent coverage threshold, stale images and progressive or failed detection', () => {
  const check = (changes = {}) => crosscheckFigures({ pages: [page], figures: [], detection: detection(), ...changes })
  assert.equal(check().uncovered.length, 1)
  assert.equal(check({ figures: [{ key: 'p03', region: region(0, 0, 0.9, 1) }] }).covered.length, 1)
  assert.equal(check({ figures: [{ key: 'p03', region: region(0, 0, 0.899, 1) }] }).uncovered.length, 1)
  assert.equal(check({ figures: [{ key: 'p04', region: region(0, 0, 1, 1) }] }).uncovered.length, 1)
  assert.equal(check({ detection: null }).detection, 'missing')
  for (const value of [detection({ imageSha256: 'old' }), detection({ status: 'failed' }), { pages: [] }]) {
    assert.equal(check({ detection: value }).detection, 'partial')
    assert.equal(check({ detection: value }).uncovered.length, 0)
  }
})

test('shadow wrapper tolerates missing, corrupt and unwritable reports', () => {
  const work = mkdtempSync(path.join(os.tmpdir(), 'eqb-figure-test-'))
  assert.equal(writeFigureCrosscheck({ work, pages: [], figures: [] }).detection, 'missing')
  writeFileSync(path.join(work, 'fast/figure-candidates.json'), '{broken')
  assert.equal(writeFigureCrosscheck({ work, pages: [], figures: [] }).detection, 'partial')
  assert.equal(JSON.parse(readFileSync(path.join(work, 'fast/figure-crosscheck.json'))).mode, 'shadow')
  const file = path.join(work, 'file')
  writeFileSync(file, '')
  assert.doesNotThrow(() => writeFigureCrosscheck({ work: file, pages: [], figures: [] }))
})

function parse(text) {
  const child = spawnSync('python3', [path.join(import.meta.dirname, 'ocr-figure-detect.py'), '--parse'],
    { input: text, encoding: 'utf8' })
  assert.equal(child.status, 0, child.stderr)
  return JSON.parse(child.stdout)
}

test('Ovis parser: no images, multiple sorted images, duplicate boxes and HTML tables', () => {
  assert.deepEqual(parse('Only text.'), { hasTable: false, candidates: [], invalidBboxes: 0 })
  const result = parse(`<table><tr><td>text</td></tr></table>
    <img src="images/bbox_300_500_600_800.jpg" />
    <img src='images/bbox_100_200_900_400.jpg'>
    <img src="images/bbox_300_500_600_800.jpg" />`)
  assert.equal(result.hasTable, true)
  assert.deepEqual(result.candidates.map((item) => item.bbox), [[0.1, 0.2, 0.9, 0.4], [0.3, 0.5, 0.6, 0.8]])
  assert.ok(result.candidates.every((item) => item.category === 'image'))
})

test('Ovis parser rejects malformed, negative, reversed, zero-area and out-of-range bboxes', () => {
  const result = parse([
    'bbox_100_100_100_200', 'bbox_300_200_100_400', 'bbox_-1_0_20_30',
    'bbox_0_0_1000_300', 'bbox_0_x_300_400', 'bbox_1.5_2_3_4',
  ].map((name) => `<img src="images/${name}.jpg" />`).join('\n'))
  assert.equal(result.invalidBboxes, 6)
  assert.deepEqual(result.candidates, [])
})

test('detector loads once, retries one page, continues after failure and caches by image digest', () => {
  const work = mkdtempSync(path.join(os.tmpdir(), 'eqb-figure-runner-'))
  const put = (file, text) => {
    const target = path.join(work, file)
    mkdirSync(path.dirname(target), { recursive: true })
    writeFileSync(target, text)
    return target
  }
  put('mlx/__init__.py', '')
  put('mlx/core.py', `
def set_memory_limit(value): pass
def set_cache_limit(value): pass
def synchronize(): pass
def get_peak_memory(): return 42
`)
  put('mlx_vlm/prompt_utils.py', 'def apply_chat_template(*args, **kwargs): return "prompt"\n')
  const counters = put('calls.json', '{}')
  put('mlx_vlm/__init__.py', `
import json, os
from pathlib import Path
from types import SimpleNamespace
attempts = {}
def count(key):
    file = Path(os.environ["FAKE_OVIS_CALLS"])
    data = json.loads(file.read_text())
    data[key] = data.get(key, 0) + 1
    file.write_text(json.dumps(data))
def load(path):
    count("load")
    return SimpleNamespace(config={}), None
def generate(*args, image, **kwargs):
    name = Path(image[0]).name
    count(name)
    attempts[name] = attempts.get(name, 0) + 1
    if name == "bad.png" or (name == "retry.png" and attempts[name] == 1):
        raise ValueError("fixture failure")
    return SimpleNamespace(text='<img src="images/bbox_100_200_300_400.jpg" />', generation_tokens=12)
`)
  const pages = ['retry', 'bad', 'good'].map((key) => ({
    pageKey: key, imagePath: put(`${key}.png`, key),
  }))
  const list = put('pages.json', JSON.stringify(pages))
  const output = path.join(work, 'figure-candidates.json')
  const run = () => {
    const child = spawnSync('python3', [path.join(import.meta.dirname, 'ocr-figure-detect.py'),
      '--pages', list, '--output', output], { encoding: 'utf8', env: {
      ...process.env, PYTHONPATH: work, FAKE_OVIS_CALLS: counters,
      EQB_OVIS_FIGURE_CACHE_DIR: path.join(work, 'cache'),
    } })
    assert.equal(child.status, 0, child.stderr)
    return JSON.parse(readFileSync(output))
  }
  const first = run()
  assert.deepEqual(first.pages.map((entry) => entry.status), ['ok', 'failed', 'ok'])
  assert.equal(first.pages[0].candidates[0].candidateId, 'retry-c1')
  assert.deepEqual(JSON.parse(readFileSync(counters)),
    { load: 1, 'retry.png': 2, 'bad.png': 2, 'good.png': 1 })
  put('pages.json', JSON.stringify([pages[2]]))
  assert.equal(run().pages[0].cacheHit, true)
  assert.equal(JSON.parse(readFileSync(counters)).load, 1)
  put('good.png', 'different image')
  assert.equal(run().pages[0].cacheHit, false)
  assert.equal(JSON.parse(readFileSync(counters)).load, 2)
})
