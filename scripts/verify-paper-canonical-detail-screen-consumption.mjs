#!/usr/bin/env node

import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { compileCanonicalPaper } from '../shared/paper-canonical/compiler.mjs'
import { consumerContractRefs } from '../shared/paper-canonical/consumers.mjs'
import {
  createFileSystemCanonicalPublicationStore,
  loadPaperForConsumption,
  publishCanonicalPaperPublication,
} from '../server/paper-canonical/publication.mjs'
import { makeReadyCanonicalFixture } from '../test-fixtures/paper-canonical/foundationFixture.mjs'

const fixture = makeReadyCanonicalFixture()
const compilation = compileCanonicalPaper(fixture.request)
assert.equal(compilation.disposition, 'ready')
const paperId = compilation.artifacts.canonicalPaper.paperPlan.paperId
const publicationRoot = mkdtempSync(path.join(tmpdir(), 'eqb-detail-screen-canonical-'))
const publicationDb = new DatabaseSync(path.join(publicationRoot, 'publication.sqlite'))
let consumption
try {
  const published = publishCanonicalPaperPublication({
    rootDir: publicationRoot,
    db: publicationDb,
    request: fixture.request,
    sourceAssetVersion: 1,
    sourceAsset: fixture.sourceAsset,
  })
  assert.equal(published.status, 'published')
  consumption = await loadPaperForConsumption({
    paperId,
    consumerContract: consumerContractRefs.screen,
  }, createFileSystemCanonicalPublicationStore({ rootDir: publicationRoot, db: publicationDb }))
  assert.equal(consumption.disposition, 'ready')
} finally {
  publicationDb.close()
  rmSync(publicationRoot, { recursive: true, force: true })
}

function groupFor(familyContractId) {
  const selection = consumption.selections.find(
    (candidate) => candidate.familyContractId === familyContractId,
  )
  assert.equal(selection?.mode, 'canonical')
  assert.equal(typeof selection?.groupIds?.[0], 'string')
  return selection.groupIds[0]
}

function corruptCanonicalGroup(familyContractId, groupId) {
  const corrupted = structuredClone(consumption)
  const selection = corrupted.selections.find(
    (candidate) => candidate.familyContractId === familyContractId,
  )
  assert.ok(selection)
  const index = selection.groupIds.indexOf(groupId)
  assert.notEqual(index, -1)
  // Keep the public response shape valid through loader admission, then remove
  // content the selected family adapter requires. The detail Screen must render
  // no paper rather than falling back to caller/raw structures.
  selection.projectedOccurrences[index] = {
    ...selection.projectedOccurrences[index],
    blocks: [],
  }
  return corrupted
}

const families = [
  { familyContractId: 'reading', marker: '[data-canonical-reading-semantic-signature]' },
  { familyContractId: 'seven-choices', marker: '[data-canonical-bank-id]' },
  { familyContractId: 'application-writing', marker: '[data-canonical-application-semantic-signature]' },
  { familyContractId: 'continuation-writing', marker: '[data-canonical-continuation-material]' },
]

const vite = await import('../app/node_modules/vite/dist/node/index.js')
const viteServer = await vite.createServer({
  root: new URL('../app', import.meta.url).pathname,
  server: { host: '127.0.0.1', port: 0 },
})
await viteServer.listen()
const appUrl = viteServer.resolvedUrls?.local?.[0]
assert.ok(appUrl, 'Vite must expose the public detail Screen seam')
const playwright = await import('../app/node_modules/playwright/index.js')
const browser = await playwright.default.chromium.launch({ headless: true })

async function openDetail({ groupId, response, rawMirror }) {
  const page = await browser.newPage()
  let rawAssetRequests = 0
  page.on('request', (request) => {
    if (request.url().includes('/paper-assets/')) rawAssetRequests += 1
  })
  await page.route('**/api/paper-canonical/consumption?*', (route) => route.fulfill({
    status: response.status,
    contentType: 'application/json',
    body: JSON.stringify(response.body),
  }))
  // Any request here is a public raw-asset bypass; a valid-but-poisoned body
  // makes that bypass visible without granting it a fallback path.
  await page.route('**/paper-assets/**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ rawMirror: `${rawMirror}-POISON` }),
  }))
  const url = new URL('canonical-detail-consumption-qa.html', appUrl)
  url.searchParams.set('paperId', paperId)
  url.searchParams.set('groupId', groupId)
  url.searchParams.set('rawGroupType', 'cloze')
  url.searchParams.set('rawMirror', rawMirror)
  await page.goto(url.href)
  return { page, rawAssetRequests: () => rawAssetRequests }
}

try {
  for (const { familyContractId, marker } of families) {
    const groupId = groupFor(familyContractId)
    const { page, rawAssetRequests } = await openDetail({
      groupId,
      response: { status: 200, body: consumption },
      rawMirror: `RAW_${familyContractId.replaceAll('-', '_')}`,
    })
    try {
      try {
        await page.locator(`.peek-paper ${marker}`).waitFor({ timeout: 10_000 })
      } catch (error) {
        throw new Error(
          `${familyContractId} Canonical detail paper did not mount: ${await page.locator('.peek-paper').innerText()}`,
          { cause: error },
        )
      }
      const paperText = await page.locator('.peek-paper').innerText()
      assert.equal(
        paperText.includes(`RAW_${familyContractId.replaceAll('-', '_')}`),
        false,
        `${familyContractId} detail paper must ignore a conflicting raw caller mirror`,
      )
      assert.equal(rawAssetRequests(), 0, `${familyContractId} detail paper must not request raw paper assets`)
    } finally {
      await page.close()
    }
  }

  const readingGroupId = groupFor('reading')
  for (const [label, response] of [
    ['missing', { status: 404, body: { error: 'Canonical publication unavailable' } }],
    ['corrupt', { status: 200, body: corruptCanonicalGroup('reading', readingGroupId) }],
  ]) {
    const { page, rawAssetRequests } = await openDetail({
      groupId: readingGroupId,
      response,
      rawMirror: `RAW_${label.toUpperCase()}`,
    })
    try {
      await page.locator('.peek-paper-placeholder').waitFor({ timeout: 10_000 })
      assert.equal(await page.locator('.peek-paper .ps-surface').count(), 0, `${label} Canonical detail data must render zero paper output`)
      assert.equal(await page.locator('.peek-paper [data-canonical-question-id]').count(), 0, `${label} Canonical detail data must render zero questions`)
      assert.equal(rawAssetRequests(), 0, `${label} Canonical detail failure must not consult raw assets`)
    } finally {
      await page.close()
    }
  }
} finally {
  await browser.close()
  await viteServer.close()
}

console.log('Ticket 34 Canonical detail Screen verify passed: Reading, Seven Choices, Application Writing, and Continuation Writing use only confirmed Consumption; missing/corrupt data is zero-output.')
