import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { createServer } from '../../app/node_modules/vite/dist/node/index.js'
import { buildPrintHtml } from '../../server/print-renderer.mjs'
import { writingNoticeFixture } from '../../test-fixtures/paper-canonical/writingNoticeFixture.mjs'
import { writingNoticeGroup } from '../../shared/paper-canonical/applicationWritingDisplay.mjs'
import { sha256 } from '../../shared/paper-canonical/stable.mjs'

const require = createRequire(new URL('../../app/package.json', import.meta.url))
const { createElement } = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
let vite, PaperSurface
before(async () => {
  vite = await createServer({ root: new URL('../../app', import.meta.url).pathname,
    logLevel: 'error', server: { middlewareMode: true, hmr: false }, appType: 'custom',
    cacheDir: new URL('../../.scratch/tmp/vite-notice-test', import.meta.url).pathname })
  ;({ PaperSurface } = await vite.ssrLoadModule('/src/shared-ui/papersurface/PaperSurface.tsx'))
})
after(async () => { await vite?.close() })

for (const family of ['application', 'continuation']) {
  for (const combinedCount of [1, 2]) {
    for (const marked of [false, true]) {
      test(`${family}: ${combinedCount} combined instructions plus split tail, marks=${marked}, actual Print and Screen`, () => {
        const count = family === 'application' ? '80' : '150'
        const instructions = [`（1）词数${count}左右；`, '（2）可适当增加细节，使内容充实，行文连贯。',
          '（3）请按如下格式作答。']
        const texts = ['注意：\n' + instructions.slice(0, combinedCount).join('\n'),
          instructions[combinedCount]]
        const fixture = writingNoticeFixture({ family, texts, marked })
        const notice = writingNoticeGroup(texts)
        for (const html of [buildPrintHtml(fixture.printInput),
          renderToStaticMarkup(createElement(PaperSurface, fixture.screenProps))]) {
          const plain = html.replace(/<[^>]*>/gu, '')
          for (const text of instructions.slice(0, combinedCount + 1)) assert(plain.includes(text), text)
          if (marked) {
            assert(html.includes('data-source-marks="underline"'))
            assert(html.includes(`>${count}</span>`), 'word count mark stays on its exact source text')
            assert(html.includes('>增加细节</span>'), 'tail mark stays on its exact source text')
          }
          const tail = fixture.sourceBlocks.find(block => block.inlines?.map(node => node.text).join('') === texts[1])
          assert(html.includes(`data-canonical-block-id="${tail.nodeId}"`))
        }
        assert.deepEqual(notice.lines.map(({ blockOffset, lineIndex }) => [blockOffset, lineIndex]),
          [...Array.from({ length: combinedCount + 1 }, (_, index) => [0, index]), [1, 0]])
      })
    }
  }
}

// Frozen before the mapping change from each published paper's exact notice
// block, compiled into the same structured fixture used by the real consumers.
const historicalBytes = {
  application: [
    'sha256:8b08ed6918082497ea43cebba04053f4f38e7390d331c47412a8d35264e53949',
    'sha256:c827915df351bb080345067928ff441c15026820bcd6fce45fe6731936adbaf2',
  ],
  continuation: [
    'sha256:2139f3545cca29518d0c848fb45df9d5caac0619df386df9226073322ded92b8',
    'sha256:c43d753fc6ea66db129ff714b35cc33c27fc6c63d3ac9381c09ef3df68c2f79a',
  ],
}
for (const paperId of ['paper-zj-2021-jun', 'paper-zj-2022-jun']) {
  for (const [index, family] of ['application', 'continuation'].entries()) {
    test(`${paperId} ${family}: published notice Print and Screen bytes stay unchanged`, () => {
      const asset = JSON.parse(readFileSync(new URL(
        `../../app/public/paper-assets/${paperId}/latest/paper-asset.json`, import.meta.url)))
      const notices = asset.content.blocks.filter(block => block.type === 'instruction' && block.text.startsWith('注意'))
      assert.equal(notices.length, 2)
      const fixture = writingNoticeFixture({ family, texts: [notices[index].text] })
      const output = [buildPrintHtml(fixture.printInput),
        renderToStaticMarkup(createElement(PaperSurface, fixture.screenProps))]
      assert.deepEqual(output.map(html => sha256(Buffer.from(html))), historicalBytes[family])
    })
  }
}
