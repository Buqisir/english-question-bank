#!/usr/bin/env node

import assert from 'node:assert/strict'
import {
  closeChromiumPool,
  withChromiumPage,
} from '../server/draft-paper/chromiumPool.mjs'

try {
  const result = await withChromiumPage(async (page) => {
    await page.setContent('<main data-eqb-browser-smoke>EQB Chromium ready</main>')
    const marker = await page.locator('[data-eqb-browser-smoke]').textContent()
    const pdf = await page.pdf({ format: 'A4', printBackground: true })
    return { marker, pdfHeader: pdf.subarray(0, 5).toString('ascii') }
  })

  assert.equal(result.marker, 'EQB Chromium ready')
  assert.equal(result.pdfHeader, '%PDF-')
  console.log('Production Chromium smoke passed: browser launch + PDF bytes')
} finally {
  await closeChromiumPool()
}
