import assert from 'node:assert/strict'
import { cpSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { createServer } from 'node:http'
import { createImportReviewStore } from '../../server/import-review/importReviewStore.mjs'
import { createPromotionWorkerService } from '../../server/import-review/runPromotionWorker.mjs'
import { createPromotionOperationStore } from '../../server/import-review/promotionOperationStore.mjs'
import { freezeReviewFixture, finalizeReviewFixture } from '../../scripts/lib/reviewPublicationFixture.mjs'
import { createPaperSurfaceAnalysisAvailability } from '../../server/search/paperSurfaceAvailability.mjs'
import { createTeachingFacetIndex } from '../../server/search/teachingFacets.mjs'
import { createSimilarQuestionsStore } from '../../server/search/similarQuestions.mjs'

const store = createImportReviewStore({ dbPath: process.env.QUESTION_BANK_IMPORT_OPS_DB,
  filesRoot: process.env.QUESTION_BANK_IMPORT_OPS_ROOT, rendererBuildId: 'fixture-original-renderer',
  initializeSchema: false, busyTimeoutMs: 0 })
const operations = createPromotionOperationStore({ dbPath: process.env.QUESTION_BANK_IMPORT_OPS_DB })
let invalidations = 0
const paperAssetsDir = process.env.QUESTION_BANK_PAPER_ASSET_ROOT
const availability = createPaperSurfaceAnalysisAvailability({ paperAssetsDir })
const facets = createTeachingFacetIndex({ paperAssetsDir })
const similar = createSimilarQuestionsStore({ paperAssetsDir, getTeachingFacetIndex: () => facets.getIndex() })
let primedCaches
const cacheInvalidations = { similar: 0, facets: 0, availability: 0 }
function consumeCaches() {
  return { similar: similar.__promotionFixtureRawIndex(), facets: facets.getIndex(), availability: availability.getByGroupId() }
}
const service = createPromotionWorkerService({ getStore: () => store, afterPublish() {
  invalidations++
  similar.invalidate(); cacheInvalidations.similar++
  facets.invalidate(); cacheInvalidations.facets++
  availability.invalidate(); cacheInvalidations.availability++
} })
let httpServer
function start(message) {
  return message.mode === 'owner_publish'
    ? service.promoteOwner(message.paperId, message.input.revisionId, message.input, 'synthetic-owner')
    : message.mode === 'scoped'
      ? service.promoteScoped(message.paperId, message.input.requestId, message.input.secretHash, 'synthetic-agent')
      : service.promote(message.paperId, message.input, 'synthetic-ship')
}
process.send({ type: 'ready' })
process.on('message', async message => {
  try {
    let result
    if (message.type === 'start') {
      result = await start(message)
    } else if (message.type === 'http-listen') {
      assert.equal(httpServer, undefined)
      httpServer = createServer(async (request, response) => {
        try {
          let body = ''
          for await (const bytes of request) body += bytes
          const published = await start(JSON.parse(body))
          response.writeHead(201, { 'content-type': 'application/json' })
          response.end(JSON.stringify({ result: published, invalidations }))
        } catch (error) {
          response.writeHead(409, { 'content-type': 'application/json' })
          response.end(JSON.stringify({ code: error.code, operationId: error.operationId }))
        }
      })
      await new Promise(resolve => httpServer.listen(0, '127.0.0.1', resolve))
      result = { port: httpServer.address().port }
    } else if (message.type === 'cache-prime') {
      primedCaches = consumeCaches()
      result = { primed: true, sizes: { similar: primedCaches.similar.paperMetaByGroupId.size,
        facets: primedCaches.facets.size, availability: primedCaches.availability.size } }
    } else if (message.type === 'cache-consume') {
      const current = consumeCaches()
      result = { invalidations: cacheInvalidations,
        refreshed: Object.fromEntries(Object.keys(current).map(key => [key, current[key] !== primedCaches[key]])),
        sizes: { similar: current.similar.paperMetaByGroupId.size, facets: current.facets.size, availability: current.availability.size } }
    } else if (message.type === 'reconcile') result = await service.reconcile()
    else if (message.type === 'legacy-start') {
      const { createSinglePaperPromotionService } = await import('../../server/import-review/singlePaperPromotion.mjs')
      const { promotionBootstrap, openPromotionBank } = await import('../../server/import-review/promotionBootstrap.mjs')
      const config = promotionBootstrap()
      await store.ready()
      const legacy = createSinglePaperPromotionService({ getStore: () => store,
        openDatabase: options => openPromotionBank(config, options), paperAssetsDir: config.paperAssetsDir })
      result = await legacy.promote(message.paperId, message.input, 'synthetic-ship')
    }
    else if (message.type === 'new-revision') {
      const directory = path.join(path.dirname(process.env.QUESTION_BANK_IMPORT_OPS_DB), 'new-revision')
      cpSync(store.revisionDirectory(message.revisionId), directory, { recursive: true })
      const configPath = path.join(directory, 'config.json')
      const config = JSON.parse(readFileSync(configPath))
      config.provenance.month = config.provenance.month === 2 ? 3 : 2
      writeFileSync(configPath, JSON.stringify(config))
      const projection = freezeReviewFixture(directory)
      result = finalizeReviewFixture({ directory, output: path.dirname(directory), projection, store }).approval
    }
    else if (message.type === 'operation') result = operations.unresolved()
    else if (message.type === 'stop') {
      service.stop()
      httpServer?.close()
      process.disconnect(); return
    }
    process.send({ type: 'result', requestId: message.requestId, result, invalidations })
  } catch (error) {
    process.send({ type: 'error', requestId: message.requestId, code: error.code,
      operationId: error.operationId, error: error.message })
  }
})
