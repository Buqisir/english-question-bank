import assert from 'node:assert/strict'
import test from 'node:test'
import { declareFastListening, fastProductSet } from './lib-fast-products.mjs'

test('无听力必须显式声明，产品选择不取决于音频文件', () => {
  assert.deepEqual(fastProductSet({}).products, ['largeComplete', 'largeNoListening', 'economy8', 'answerOnly'])
  const config = declareFastListening({}, 'absent-by-exam-design', null)
  assert.deepEqual(fastProductSet(config, 0), {
    products: ['largeNoListening', 'economy8', 'answerOnly'],
    editions: ['largeNoListening', 'economy8'], hasListening: false,
  })
  assert.throws(() => declareFastListening({}, 'none', null), /只接受/)
  assert.throws(() => declareFastListening(config, null, '/recording.mp3'), /不能附带/)
  assert.throws(() => fastProductSet(config, 2), /Canonical/)
  assert.throws(() => fastProductSet({}, 0), /Canonical/)
  assert.throws(() => fastProductSet({ listening: 'absent' }, 0), /Canonical/)
})

test('历史有听力保留四产品与三版分页，不改既有来源配置', () => {
  const config = { paperId: 'paper-historical', provenance: { year: 2026, month: 4 } }
  assert.equal(declareFastListening(config, null, '/recording.mp3'), config)
  assert.deepEqual(fastProductSet(config, 2), {
    products: ['largeComplete', 'largeNoListening', 'economy8', 'answerOnly'],
    editions: ['largeComplete', 'largeNoListening', 'economy8'], hasListening: true,
  })
})
