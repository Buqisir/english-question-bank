#!/usr/bin/env node

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync, spawn } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { consumerContractRefs } from '../shared/paper-canonical/consumers.mjs'
import { loadCanonicalImportRequest } from '../server/paper-canonical/importRequest.mjs'
import {
  admitCanonicalPaperImport,
  createFileSystemCanonicalPublicationStore,
  loadPaperForConsumption,
} from '../server/paper-canonical/publication.mjs'
import {
  publishPaperImportPackage,
  rollbackPaperImportPublication,
} from '../server/paper-import/publisher.mjs'
import {
  readImportPackageFromDirectory,
  validatePaperImportPackage,
} from '../server/paper-import/validator.mjs'
import {
  makeCanonicalImportAdmissionRequest,
} from '../test-fixtures/paper-canonical/foundationFixture.mjs'

const repositoryRoot = path.resolve(import.meta.dirname, '..')
const sourcePackageDir = path.join(
  repositoryRoot,
  'test-fixtures/paper-import/paper-2024-jslk-english',
)
const paperId = 'paper-2024-jslk-english'
const provisionActualArtifacts = process.argv.includes('--actual-artifacts')

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function snapshotTree(rootDir) {
  if (!existsSync(rootDir)) return []
  const entries = []
  function visit(dir, prefix = '') {
    for (const entry of readdirSync(dir, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))) {
      const relativePath = path.join(prefix, entry.name)
      if (entry.isDirectory()) {
        entries.push({ path: `${relativePath}/`, bytes: null })
        visit(path.join(dir, entry.name), relativePath)
      } else {
        entries.push({
          path: relativePath,
          bytes: readFileSync(path.join(dir, entry.name)).toString('base64'),
        })
      }
    }
  }
  visit(rootDir)
  return entries
}

function snapshotDatabase(db) {
  return db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
  ).all().map(({ name }) => ({
    name,
    rows: db.prepare(`SELECT * FROM "${name.replaceAll('"', '""')}"`).all(),
  }))
}

function writeRequestEnvelope(rootDir, request) {
  mkdirSync(rootDir, { recursive: true })
  const documents = request.evidence.documents.map((document, index) => {
    const fileName = `evidence-${index + 1}.bin`
    writeFileSync(path.join(rootDir, fileName), document.bytes)
    const { bytes: _bytes, ...descriptor } = document
    return { ...descriptor, path: fileName }
  })
  const requestPath = path.join(rootDir, 'canonical-import-request.json')
  writeFileSync(
    requestPath,
    `${JSON.stringify({
      ...request,
      evidence: { ...request.evidence, documents },
    }, null, 2)}\n`,
  )
  return requestPath
}

function currentPublication(db) {
  const row = db.prepare(
    `
    SELECT paper_id, version_name, source_asset_version, publication_digest
    FROM canonical_paper_publications
    WHERE paper_id = ? AND is_current = 1
    `,
  ).get(paperId)
  assert.ok(row, 'pilot has one current canonical Publication')
  return {
    paperId: row.paper_id,
    versionName: row.version_name,
    sourceAssetVersion: Number(row.source_asset_version),
    publicationDigest: row.publication_digest,
  }
}

async function exactReload({ db, paperAssetsDir, expectedVersion }) {
  const ref = currentPublication(db)
  assert.equal(ref.versionName, expectedVersion)
  const store = createFileSystemCanonicalPublicationStore({
    rootDir: paperAssetsDir,
    db,
  })
  const consumers = {}
  for (const [consumerId, consumerContract] of Object.entries(consumerContractRefs)) {
    consumers[consumerId] = await loadPaperForConsumption({
      paperId,
      consumerContract,
    }, store)
    assert.equal(consumers[consumerId].disposition, 'ready')
    assert.equal(
      consumers[consumerId].selections.every(
        (selection) => selection.mode === 'canonical',
      ),
      true,
    )
  }
  assert.deepEqual(Object.keys(consumers).sort(), ['print_pdf', 'screen'])
  return { ref, consumers }
}

function normalizedConsumptionSemantics(consumption) {
  return consumption.selections.map((selection) => ({
    familyContractId: selection.familyContractId,
    mode: selection.mode,
    groupIds: [...selection.groupIds],
    projectedOccurrences: selection.projectedOccurrences.map((occurrence) => ({
      groupId: occurrence.groupId,
      groupType: occurrence.groupType,
      semanticSignature: occurrence.semanticSignature,
      occurrenceSignature: occurrence.occurrenceSignature,
      questions: (occurrence.questions || []).map((question) => ({
        questionId: question.questionId,
        correctOptionId: question.correctOptionId,
      })),
    })),
  }))
}

function assertSupportedConsumerParity(consumers) {
  assert.deepEqual(
    normalizedConsumptionSemantics(consumers.screen),
    normalizedConsumptionSemantics(consumers.print_pdf),
    'Screen and Print/PDF consume one semantic projection',
  )
}

async function availablePort() {
  const net = await import('node:net')
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close((error) => {
        if (error) reject(error)
        else resolve(address.port)
      })
    })
  })
}

async function waitForHttp(url, child, timeoutMs = 20_000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (child.exitCode !== null) {
      throw new Error(
        `API exited before readiness (${child.exitCode}): ${child.output}`,
      )
    }
    try {
      const response = await fetch(url)
      if (response.status) return
    } catch {
      // Keep waiting for the local API process.
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`Timed out waiting for ${url}\n${child.output}`)
}

async function stopChild(child) {
  child.kill('SIGTERM')
  const closed = new Promise((resolve) => {
    if (child.exitCode !== null) resolve()
    else child.once('close', resolve)
  })
  const exited = await Promise.race([
    closed.then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 3_000)),
  ])
  if (!exited) {
    child.kill('SIGKILL')
    await closed
  }
}

function seedDraftRows(userDbPath, asset) {
  const userDb = new DatabaseSync(userDbPath)
  const draftPaperId = 'draft-canonical-import-pilot'
  const groups = Object.values(asset.content.groups)
    .filter((group) => group.groupType !== 'listening')
  userDb.prepare(
    `
    INSERT INTO draft_papers (
      id, user_id, title, subject, status, current_marker,
      created_at, updated_at
    ) VALUES (?, 'local', ?, 'english', 'active', 1, datetime('now'), datetime('now'))
    `,
  ).run(draftPaperId, 'Canonical Import Pilot')
  const insertItem = userDb.prepare(
    `
    INSERT INTO draft_paper_items (
      id, draft_paper_id, group_id, source_paper_id, order_index,
      page_break_before, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 0, datetime('now'), datetime('now'))
    `,
  )
  groups.forEach((group, index) => {
    insertItem.run(
      `draft-canonical-import-pilot-${index + 1}`,
      draftPaperId,
      group.groupId,
      asset.paper.paperId,
      index + 1,
    )
  })
  userDb.close()
  return { draftPaperId, activeGroups: groups, firstGroup: groups[0] }
}

function attributeSignatures(html) {
  return [...html.matchAll(
    /data-canonical-[a-z-]*signature="([^"]+)"/g,
  )].map((match) => match[1]).sort()
}

function pdfText(pdfPath) {
  return execFileSync('pdftotext', ['-layout', pdfPath, '-'], {
    encoding: 'utf8',
  })
}

function listFiles(rootDir) {
  const files = []
  function visit(dir, prefix = '') {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const relativePath = path.join(prefix, entry.name)
      if (entry.isDirectory()) visit(path.join(dir, entry.name), relativePath)
      else files.push(relativePath)
    }
  }
  visit(rootDir)
  return files.sort()
}

async function renderSupportedArtifacts({
  dbPath,
  paperAssetsDir,
  outputDir,
  consumers,
}) {
  mkdirSync(outputDir, { recursive: true })
  const asset = JSON.parse(readFileSync(
    path.join(paperAssetsDir, paperId, 'latest', 'paper-asset.json'),
    'utf8',
  ))
  const userDbPath = path.join(path.dirname(dbPath), 'user-data.sqlite')
  const port = await availablePort()
  const baseUrl = `http://127.0.0.1:${port}`
  const api = spawn('node', ['server/api.mjs'], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      QUESTION_BANK_API_PORT: String(port),
      QUESTION_BANK_DB: dbPath,
      QUESTION_BANK_PAPER_ASSET_ROOT: paperAssetsDir,
      QUESTION_BANK_USER_SPACE_ROOT: path.join(
        path.dirname(dbPath),
        'user-space',
      ),
      USER_DATA_DB: userDbPath,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  api.output = ''
  api.stdout.on('data', (chunk) => { api.output += chunk.toString() })
  api.stderr.on('data', (chunk) => { api.output += chunk.toString() })

  let viteServer = null
  try {
    await waitForHttp(`${baseUrl}/api/health`, api)
    const draft = seedDraftRows(userDbPath, asset)
    const vite = await import('../app/node_modules/vite/dist/node/index.js')
    viteServer = await vite.createServer({
      root: path.join(repositoryRoot, 'app'),
      server: {
        host: '127.0.0.1',
        port: 0,
        proxy: {
          '/api': baseUrl,
          '/paper-assets': baseUrl,
          '/user-space': baseUrl,
        },
      },
    })
    await viteServer.listen()
    const appUrl = viteServer.resolvedUrls?.local?.[0]
    assert.ok(appUrl, 'Vite exposes the real PaperBrowse pilot route')

    const playwright = await import('../app/node_modules/playwright/index.js')
    const browser = await playwright.default.chromium.launch({ headless: true })
    try {
      const page = await browser.newPage({
        viewport: { width: 1280, height: 900 },
      })
      const plainUrl = new URL('canonical-consumption-qa.html', appUrl)
      plainUrl.searchParams.set('paperId', paperId)
      await page.goto(plainUrl.href)
      await page.locator('[data-paper-browse-anchor]').first().waitFor()
      for (const group of draft.activeGroups) {
        assert.equal(
          await page.locator(
            `[data-paper-browse-anchor="${group.groupId}"]`,
          ).count(),
          1,
          `plain PaperSurface renders ${group.groupId} once`,
        )
      }
      assert.equal(
        await page.locator('.paper-browse-answer-row').count(),
        0,
        'plain PaperSurface hides official answers',
      )
      const plainHtml = await page.content()
      writeFileSync(path.join(outputDir, 'screen-plain.html'), plainHtml)
      await page.screenshot({
        path: path.join(outputDir, 'screen-plain.png'),
        fullPage: true,
      })

      const firstQuestionId = draft.firstGroup.questionIds[0]
      const lectureUrl = new URL(plainUrl)
      lectureUrl.searchParams.set('lecture', '1')
      lectureUrl.searchParams.set('focusGroupId', draft.firstGroup.groupId)
      lectureUrl.searchParams.set('questionId', firstQuestionId)
      await page.goto(lectureUrl.href)
      await page.locator('.paper-browse-answer-row').waitFor()
      for (const group of draft.activeGroups) {
        assert.equal(
          await page.locator(
            `[data-paper-browse-anchor="${group.groupId}"]`,
          ).count(),
          1,
          `lecture PaperSurface renders ${group.groupId} once`,
        )
      }
      assert.equal(
        await page.locator('.paper-browse-answer-row').count(),
        1,
        'lecture PaperSurface exposes the selected official answer',
      )
      const lectureHtml = await page.content()
      writeFileSync(path.join(outputDir, 'screen-lecture.html'), lectureHtml)
      await page.screenshot({
        path: path.join(outputDir, 'screen-lecture.png'),
        fullPage: true,
      })

      const printHtml = {}
      const pdfPaths = {}
      for (const versionType of ['student', 'teacher']) {
        const htmlResponse = await fetch(
          `${baseUrl}/api/draft-papers/${draft.draftPaperId}/print-html?versionType=${versionType}`,
        )
        assert.equal(htmlResponse.status, 200)
        printHtml[versionType] = await htmlResponse.text()
        writeFileSync(
          path.join(outputDir, `print-${versionType}.html`),
          printHtml[versionType],
        )

        const pdfResponse = await fetch(
          `${baseUrl}/api/draft-papers/${draft.draftPaperId}/print-pdf`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ versionType }),
            signal: AbortSignal.timeout(60_000),
          },
        )
        const pdfBytes = Buffer.from(await pdfResponse.arrayBuffer())
        assert.equal(pdfResponse.status, 200)
        assert.equal(pdfBytes.subarray(0, 4).toString(), '%PDF')
        pdfPaths[versionType] = path.join(
          outputDir,
          `print-${versionType}.pdf`,
        )
        writeFileSync(pdfPaths[versionType], pdfBytes)
      }

      assert.equal(
        (printHtml.student.match(/<div class="answer">/g) || []).length,
        0,
        'Student Print HTML hides answers',
      )
      assert.equal(
        (printHtml.teacher.match(/<div class="answer">/g) || []).length > 0,
        true,
        'Teacher Print HTML exposes answers',
      )
      assert.deepEqual(
        attributeSignatures(printHtml.student),
        attributeSignatures(printHtml.teacher),
        'Student/Teacher Print HTML retains identical canonical semantics',
      )
      assert.equal(
        attributeSignatures(printHtml.student).length > 0,
        true,
        'Print HTML carries canonical semantic and occurrence signatures',
      )
      const studentPdfText = pdfText(pdfPaths.student)
      const teacherPdfText = pdfText(pdfPaths.teacher)
      assert.equal(
        studentPdfText.includes('【答案】'),
        false,
        'Student Chromium PDF hides answers',
      )
      assert.equal(
        teacherPdfText.includes('【答案】'),
        true,
        'Teacher Chromium PDF exposes answers',
      )
      assert.equal(
        studentPdfText.includes('Canonical Import Pilot'),
        true,
        'Student Chromium PDF renders the pilot draft title',
      )
      assert.equal(
        teacherPdfText.includes('Canonical Import Pilot'),
        true,
        'Teacher Chromium PDF renders the same pilot draft title',
      )
    } finally {
      await browser.close()
    }

    assertSupportedConsumerParity(consumers)
    const artifactFiles = listFiles(outputDir)
    assert.equal(
      artifactFiles.some((file) => /\.(?:docx|xml)$/i.test(file)),
      false,
      'pilot generates no DOCX or OOXML artifact',
    )
    return {
      appUrl,
      baseUrl,
      artifactFiles,
    }
  } finally {
    if (viteServer) await viteServer.close()
    await stopChild(api)
  }
}

const rootDir = mkdtempSync(path.join(tmpdir(), 'eqb-canonical-import-pilot-'))
const dbPath = path.join(rootDir, 'question-bank.sqlite')
const paperAssetsDir = path.join(rootDir, 'paper-assets')
let db = new DatabaseSync(dbPath)

try {
  db.exec(readFileSync(path.join(repositoryRoot, 'data/sql/schema.sql'), 'utf8'))
  const files = readImportPackageFromDirectory(sourcePackageDir)
  const filesByName = Object.fromEntries(
    files.map(({ fileName, buffer }) => [fileName, buffer]),
  )
  const request = makeCanonicalImportAdmissionRequest({
    paperId,
    paperAssetBytes: filesByName['paper-asset.json'],
    answerKeyBytes: filesByName['answer-key.json'],
  })
  const requestPath = writeRequestEnvelope(
    path.join(rootDir, 'operator-request'),
    request,
  )
  const loadedRequest = loadCanonicalImportRequest(requestPath)

  const beforeDryRun = {
    tree: snapshotTree(paperAssetsDir),
    database: snapshotDatabase(db),
  }
  const validation = validatePaperImportPackage(files)
  assert.equal(validation.ok, true)
  const dryRun = admitCanonicalPaperImport({
    request: loadedRequest,
    sourceAssetVersion: 1,
    sourceAsset: filesByName['paper-asset.json'],
  })
  assert.equal(dryRun.ok, true)
  assert.deepEqual(snapshotTree(paperAssetsDir), beforeDryRun.tree)
  assert.deepEqual(snapshotDatabase(db), beforeDryRun.database)

  const published = publishPaperImportPackage({
    files,
    db,
    paperAssetsDir,
    canonicalRequest: loadedRequest,
  })
  assert.equal(published.status, 'published')
  assert.equal(published.publish.assetVersion, 1)
  const first = await exactReload({
    db,
    paperAssetsDir,
    expectedVersion: 'v1',
  })

  assert.throws(
    () => publishPaperImportPackage({
      files,
      db,
      paperAssetsDir,
      canonicalRequest: loadedRequest,
      failurePoint: 'after-commit',
    }),
    { code: 'CANONICAL_PUBLICATION_FORCED_RELOAD_FAILURE' },
  )
  db.close()
  db = new DatabaseSync(dbPath)
  const retry = publishPaperImportPackage({
    files,
    db,
    paperAssetsDir,
    canonicalRequest: loadedRequest,
  })
  assert.equal(retry.status, 'idempotent')
  assert.equal(retry.publish.assetVersion, 2)
  await exactReload({
    db,
    paperAssetsDir,
    expectedVersion: 'v2',
  })

  const rollback = rollbackPaperImportPublication({
    db,
    paperAssetsDir,
    paperId,
    versionName: first.ref.versionName,
  })
  assert.equal(rollback.status, 'rolled_back')
  const restored = await exactReload({
    db,
    paperAssetsDir,
    expectedVersion: 'v1',
  })
  assert.equal(restored.ref.publicationDigest, first.ref.publicationDigest)
  db.close()
  db = null

  const head = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  }).trim()
  const outputDir = provisionActualArtifacts
    ? path.join(
        repositoryRoot,
        '.scratch/paper-canonical-ticket-20-qa',
        head,
      )
    : path.join(rootDir, 'rendered-artifacts')
  if (provisionActualArtifacts && existsSync(outputDir)) {
    rmSync(outputDir, { recursive: true, force: true })
  }
  const rendered = await renderSupportedArtifacts({
    dbPath,
    paperAssetsDir,
    outputDir,
    consumers: restored.consumers,
  })
  const sourcePackageDigests = Object.fromEntries(
    files.map(({ fileName, buffer }) => [fileName, sha256(buffer)]),
  )
  writeFileSync(path.join(outputDir, 'evidence.json'), `${JSON.stringify({
    schemaVersion: 'canonical-import-pilot-evidence-v1',
    head,
    sourcePackage: path.relative(repositoryRoot, sourcePackageDir),
    sourcePackageDigests,
    dryRun: {
      validation: 'ready',
      canonicalAdmission: 'ready',
      storeMutationCount: 0,
    },
    publish: {
      initialVersion: first.ref,
      recoveryRetryVersion: 'v2',
      retryStatus: retry.status,
      rollbackStatus: rollback.status,
      restoredVersion: restored.ref,
    },
    consumers: {
      ids: Object.keys(restored.consumers).sort(),
      semanticParity: 'exact',
    },
    renderedArtifacts: rendered.artifactFiles,
    generatedDocx: false,
    generatedOoxml: false,
    docxSourceInputPreserved: true,
  }, null, 2)}\n`)
  writeFileSync(path.join(outputDir, 'HEAD.txt'), `${head}\n`)
  if (provisionActualArtifacts) {
    console.log(`QA artifacts: ${outputDir}`)
  }
  console.log('PASS backend canonical import pilot')
} finally {
  if (db) db.close()
  rmSync(rootDir, { recursive: true, force: true })
}
