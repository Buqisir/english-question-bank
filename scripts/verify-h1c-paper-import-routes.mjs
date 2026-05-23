#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

let passed = 0
let failed = 0

function read(relPath) {
  return readFileSync(path.join(rootDir, relPath), 'utf8')
}

function assert(name, condition, details = '') {
  if (condition) {
    passed += 1
    console.log(`PASS ${name}`)
  } else {
    failed += 1
    console.error(`FAIL ${name}${details ? `\n  ${details}` : ''}`)
  }
}

console.log('H1-C verify: Paper Import route extraction')

const routePath = path.join(rootDir, 'server/paper-import/paperImportRoutes.mjs')
const api = read('server/api.mjs')
const routes = read('server/paper-import/paperImportRoutes.mjs')
const verifyCi = read('scripts/verify-ci.mjs')
const scriptsReadme = read('scripts/README.md')

assert('Paper Import routes module exists', existsSync(routePath))
assert('route module exports createPaperImportRoutes', /export function createPaperImportRoutes\(\)/.test(routes))
assert('route module uses minimal router helper', routes.includes("from '../router/index.mjs'"))
assert('route module parses multipart packages', routes.includes("from './multipart.mjs'") && routes.includes('parsePaperImportMultipart(request)'))
assert('route module uses publisher only for publish route', routes.includes("from './publisher.mjs'") && routes.includes('publishPaperImportPackage({ files, db, paperAssetsDir: context.paperAssetsDir })'))
assert('route module uses validator public report', routes.includes('validatePaperImportPackage(files)') && routes.includes('makePublicValidationReport(validation)'))

assert('validate route registered', routes.includes('/api\\/paper-import\\/validate$'))
assert('publish route registered', routes.includes('/api\\/paper-import\\/publish$'))
assert('revalidate-latest route registered', routes.includes('/api\\/paper-import\\/revalidate-latest$'))
assert('validate route preserves parse error 400', /parsePaperImportMultipart\(request\)[\s\S]{0,160}context\.sendJson\(response,\s*400/.test(routes))
assert('validate route preserves 200-or-422 status', /validation\.ok \? 200 : 422/.test(routes))
assert('publish route opens writable DB', routes.includes('context.openDatabase({ readOnly: false })'))
assert('publish route closes DB in finally', /const db = context\.openDatabase\(\{ readOnly: false \}\)[\s\S]{0,420}finally \{[\s\S]{0,80}db\.close\(\)/.test(routes))
assert('publish route preserves 201-or-422 status', /result\.ok \? 201 : 422/.test(routes))
assert('publish route invalidates availability cache after publish call', /publishPaperImportPackage[\s\S]{0,180}invalidatePaperSurfaceAnalysisAvailability\(\)/.test(routes))
assert('revalidate route invalidates availability cache before recount', /invalidatePaperSurfaceAnalysisAvailability\(\)[\s\S]{0,180}analysisEntryCount/.test(routes))
assert('revalidate route reports analysisEntryCount from context owner', routes.includes('context.getPaperSurfaceAnalysisAvailabilityByGroupId().size'))

assert('api imports Paper Import routes module', api.includes("from './paper-import/paperImportRoutes.mjs'"))
assert('api registers Paper Import routes in serverRoutes', /\.\.\.createPaperImportRoutes\(\)/.test(api))
assert('api exposes availability getter through context', api.includes('getPaperSurfaceAnalysisAvailabilityByGroupId,'))
assert('api exposes availability invalidator through context', api.includes('invalidatePaperSurfaceAnalysisAvailability,'))
assert('api keeps availability cache owner until H1-D', api.includes('let paperSurfaceAnalysisAvailabilityByGroupIdCache = null'))
assert('api keeps availability getter implementation until H1-D', /function getPaperSurfaceAnalysisAvailabilityByGroupId\(\)/.test(api))
assert('api owns one cache invalidation helper', /function invalidatePaperSurfaceAnalysisAvailability\(\)[\s\S]{0,80}paperSurfaceAnalysisAvailabilityByGroupIdCache = null/.test(api))
assert('api no longer imports paper import multipart parser directly', !api.includes("from './paper-import/multipart.mjs'"))
assert('api no longer imports publishPaperImportPackage directly', !api.includes('publishPaperImportPackage'))
assert('api no longer imports validatePaperImportPackage directly', !api.includes('validatePaperImportPackage'))
assert('api no longer owns inline paper-import route branches', !api.includes("url.pathname === '/api/paper-import/validate'") && !api.includes("url.pathname === '/api/paper-import/publish'") && !api.includes("url.pathname === '/api/paper-import/revalidate-latest'"))

assert('verify-ci includes H1-C Paper Import route verify', verifyCi.includes('verify-h1c-paper-import-routes.mjs'))
assert('scripts README documents H1-C Paper Import route verify', scriptsReadme.includes('verify-h1c-paper-import-routes.mjs'))

if (failed > 0) {
  console.error(`\nH1-C Paper Import route verify FAILED: ${passed} passed, ${failed} failed`)
  process.exit(1)
}

console.log(`\nH1-C Paper Import route verify passed: ${passed} passed, 0 failed`)
