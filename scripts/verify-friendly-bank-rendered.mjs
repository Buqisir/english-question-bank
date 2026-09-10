import assert from 'node:assert/strict'
import { applyPlannedGroupBreaks } from '../server/draft-paper/fixedPagePdfPlanner.mjs'
import { renderPaginatedPaper } from '../server/draft-paper/paginationRenderer.mjs'
import { closeChromiumPool } from '../server/draft-paper/chromiumPool.mjs'

// Exercise Paged.js itself: a marker-only mock cannot prove bank relaxation.
const source = (relaxed, oversized = false) => `<html><head><style>
@page{size:A4;margin:20mm}body{margin:0}
.lead{height:160mm}.canonical-option-bank-item{height:${oversized ? 300 : 20}mm}
</style>${relaxed ? '<style data-pdf-option-bank-fallback></style>' : ''}</head><body>
<section data-canonical-group-id="seven"><div class="lead">Passage</div>
<div class="canonical-option-bank-region">${Array.from({ length: 6 }, (_, index) =>
  `<div class="canonical-option-bank-item">Option ${index + 1}</div>`).join('')}</div></section>
</body></html>`

try {
  for (const relaxed of [false, true]) {
    const result = await renderPaginatedPaper(applyPlannedGroupBreaks(source(relaxed), []), {
      inspect: (page) => page.evaluate(() => [...document.querySelectorAll('.pagedjs_page')]
        .flatMap((sheet, index) => sheet.querySelector('.canonical-option-bank-region') ? [index + 1] : [])),
    })
    assert.equal(result.pageCount, 2)
    assert.deepEqual(result.inspection, relaxed ? [1, 2] : [2])
  }
  await assert.rejects(() => renderPaginatedPaper(applyPlannedGroupBreaks(source(true, true), [])),
    (error) => /试卷内容超出排版区域/.test(error.message))
  console.log('PASS actual Paged bank protection, relaxed bank split and oversized individual-option rejection')
} finally {
  await closeChromiumPool()
}
