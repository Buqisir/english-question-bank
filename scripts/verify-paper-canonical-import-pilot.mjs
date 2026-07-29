#!/usr/bin/env node

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync, spawn } from 'node:child_process'
import {
  existsSync,
  chmodSync,
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
import {
  projectCanonicalConsumerGroup,
} from '../shared/paper-canonical/consumerProjection.mjs'
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
  runCanonicalImportPilotQaSession,
} from './lib/canonicalImportPilotQaArtifactServer.mjs'

const repositoryRoot = path.resolve(import.meta.dirname, '..')
const sourcePackageDir = path.join(
  repositoryRoot,
  'test-fixtures/paper-import/paper-2026-i-canonical-pilot',
)
const paperId = 'paper-2026-i'
const provisionActualArtifacts = process.argv.includes('--actual-artifacts')
const keepQaServer = process.argv.includes('--qa-server')
const injectQaArtifactServerStartupFailure = process.argv.includes(
  '--inject-qa-artifact-server-startup-failure',
)

if (keepQaServer && !provisionActualArtifacts) {
  throw new Error('--qa-server requires --actual-artifacts')
}
if (injectQaArtifactServerStartupFailure && !keepQaServer) {
  throw new Error(
    '--inject-qa-artifact-server-startup-failure requires --qa-server',
  )
}

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
    const familyIds = consumers[consumerId].selections
      .map((selection) => selection.familyContractId)
      .sort()
    assert.deepEqual(familyIds, [
      'application-writing',
      'cloze',
      'continuation-writing',
      'grammar-fill',
      'reading',
      'seven-choices',
    ])
    assert.equal(
      consumers[consumerId].selections.some(
        (selection) =>
          selection.familyContractId === 'listening'
          || selection.groupIds.some((groupId) => groupId.includes('listening'))
          || selection.projectedOccurrences.some(
            (occurrence) => occurrence.groupType === 'listening',
          ),
      ),
      false,
      `${consumerId} exposes zero Listening occurrence`,
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
    projectedOccurrences: selection.groupIds.map((groupId) => {
      const occurrence = projectCanonicalConsumerGroup({
        consumption,
        familyContractId: selection.familyContractId,
        groupId,
      })
      return {
        groupId: occurrence.groupId,
        groupType: occurrence.groupType,
        semanticSignature: occurrence.semanticSignature,
        occurrenceSignature: occurrence.occurrenceSignature,
        questions: (occurrence.questions || []).map((question) => ({
        questionId: question.questionId,
        correctOptionId: question.correctOptionId,
      })),
      }
    }),
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
  const groups = expectedGroupOrder(asset)
    .map((groupId) => asset.content.groups[groupId])
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
    /data-canonical-[a-z-]*(?:semantic|occurrence)-signature="([^"]+)"/g,
  )].map((match) => match[1]).sort()
}

function canonicalAttributeValues(html, attributeName) {
  const pattern = new RegExp(`${attributeName}="([^"]+)"`, 'g')
  return [...html.matchAll(pattern)].map((match) => match[1]).sort()
}

function structuralArtifactIdentity(html) {
  return Object.fromEntries([
    'data-canonical-semantic-signature',
    'data-canonical-occurrence-signature',
    'data-canonical-application-semantic-signature',
    'data-canonical-application-occurrence-signature',
    'data-canonical-writing-semantic-signature',
    'data-canonical-writing-occurrence-signature',
    'data-canonical-group-id',
    'data-canonical-question-id',
    'data-canonical-blank-id',
    'data-canonical-option-id',
    'data-canonical-answer-region-ref',
    'data-canonical-response-slot-id',
    'data-canonical-placement-signature',
  ].map((attributeName) => [
    attributeName,
    canonicalAttributeValues(html, attributeName),
  ]))
}

function assertStudentTeacherStructuralParity(studentHtml, teacherHtml) {
  const student = structuralArtifactIdentity(studentHtml)
  const teacher = structuralArtifactIdentity(teacherHtml)
  for (const [attributeName, studentValues] of Object.entries(student)) {
    if (attributeName === 'data-canonical-question-id') continue
    assert.deepEqual(
      studentValues,
      teacher[attributeName],
      `Student/Teacher Print HTML retains ${attributeName}`,
    )
  }
  const teacherQuestionIds = new Set(teacher['data-canonical-question-id'])
  for (const questionId of new Set(student['data-canonical-question-id'])) {
    assert.equal(
      teacherQuestionIds.has(questionId),
      true,
      `Teacher Print HTML retains Student question ${questionId}`,
    )
  }
}

function expectedOccurrenceSignatures(consumption) {
  return normalizedConsumptionSemantics(consumption)
    .flatMap((selection) => selection.projectedOccurrences)
    .flatMap((occurrence) => [
      occurrence.semanticSignature,
      occurrence.occurrenceSignature,
    ])
    .filter((signature) => typeof signature === 'string')
}

function assertExactRenderedSignatures(html, consumption, label) {
  assert.deepEqual(
    [...new Set(attributeSignatures(html))].sort(),
    [...new Set(expectedOccurrenceSignatures(consumption))].sort(),
    `${label} renders every canonical semantic and occurrence signature`,
  )
}

function expectedCanonicalIdentity(consumption) {
  const values = {
    groupId: new Set(),
    questionId: new Set(),
    blankId: new Set(),
    optionId: new Set(),
    answerRegionRef: new Set(),
    responseSlotId: new Set(),
  }
  function visit(value) {
    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }
    if (!value || typeof value !== 'object') return
    for (const [key, child] of Object.entries(value)) {
      if (
        Object.hasOwn(values, key)
        && typeof child === 'string'
      ) values[key].add(child)
      visit(child)
    }
  }
  function collectKey(value, targetKey, output) {
    if (Array.isArray(value)) {
      value.forEach((entry) => collectKey(entry, targetKey, output))
      return
    }
    if (!value || typeof value !== 'object') return
    for (const [key, child] of Object.entries(value)) {
      if (key === targetKey && typeof child === 'string') output.add(child)
      collectKey(child, targetKey, output)
    }
  }
  for (const selection of consumption.selections) {
    for (const groupId of selection.groupIds) {
      const group = projectCanonicalConsumerGroup({
        consumption,
        familyContractId: selection.familyContractId,
        groupId,
      })
      visit(group)
      if (group.groupType === 'grammarFill') {
        for (const question of group.questions) {
          values.questionId.delete(question.questionId)
        }
      }
      if (group.groupType !== 'sevenChoices') {
        const groupBlankIds = new Set()
        collectKey(group, 'blankId', groupBlankIds)
        for (const blankId of groupBlankIds) values.blankId.delete(blankId)
      }
      if (!['reading', 'sevenChoices'].includes(group.groupType)) {
        const groupOptionIds = new Set()
        collectKey(group, 'optionId', groupOptionIds)
        for (const optionId of groupOptionIds) values.optionId.delete(optionId)
      }
    }
  }
  return Object.fromEntries(
    Object.entries(values).map(([key, entries]) => [key, [...entries].sort()]),
  )
}

function assertArtifactContainsCanonicalIdentity(html, expected, label) {
  const attributeByKey = {
    groupId: ['data-canonical-group-id', 'data-paper-browse-anchor'],
    questionId: ['data-canonical-question-id', 'data-paper-question-id'],
    blankId: ['data-canonical-blank-id'],
    optionId: ['data-canonical-option-id'],
    answerRegionRef: ['data-canonical-answer-region-ref'],
    responseSlotId: ['data-canonical-response-slot-id'],
  }
  for (const [key, attributeNames] of Object.entries(attributeByKey)) {
    const actual = new Set(attributeNames.flatMap(
      (attributeName) => canonicalAttributeValues(html, attributeName),
    ))
    for (const value of expected[key]) {
      assert.equal(
        actual.has(value),
        true,
        `${label} carries ${attributeNames.join(' or ')}=${value}; actual ${
          [...actual].join(',')
        }`,
      )
    }
  }
}

function expectedGroupOrder(asset) {
  return asset.content.blocks.flatMap((block) =>
    block.type === 'group'
    && asset.content.groups[block.groupId]?.groupType !== 'listening'
      ? [block.groupId]
      : [])
}

function pdfText(pdfPath) {
  return execFileSync('pdftotext', ['-layout', pdfPath, '-'], {
    encoding: 'utf8',
  })
}

function normalizedVisibleText(value) {
  return String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim()
}

function canonicalInlineText(inlines) {
  return normalizedVisibleText(
    (inlines || []).map((inline) =>
      inline.kind === 'text' ? inline.text : ' ').join(' '),
  )
}

function projectedGroupTextCandidates(group) {
  if (Array.isArray(group.blocks)) {
    return group.blocks.map((block) =>
      block.kind === 'table'
        ? normalizedVisibleText(block.rows.map((row) =>
            row.cells.map((cell) => cell.text).join(' '),
          ).join(' '))
        : normalizedVisibleText(block.text || block.caption))
  }
  if (Array.isArray(group.promptBlocks)) {
    return group.promptBlocks.map((block) => normalizedVisibleText(block.text))
  }
  if (Array.isArray(group.materialBlocks)) {
    return group.materialBlocks.map((block) => normalizedVisibleText(block.text))
  }
  if (Array.isArray(group.paragraphs)) {
    return group.paragraphs.flatMap((paragraph) => [
      normalizedVisibleText(
        paragraph.nodes.map((node) => node.type === 'text' ? node.text : ' ')
          .join(' '),
      ),
      ...paragraph.nodes
        .filter((node) => node.type === 'text')
        .map((node) => normalizedVisibleText(node.text)),
    ])
  }
  return []
}

function expectedPdfGroupMarkers(consumption) {
  return consumption.selections.flatMap((selection) =>
    selection.groupIds.map((groupId) => {
      const group = projectCanonicalConsumerGroup({
        consumption,
        familyContractId: selection.familyContractId,
        groupId,
      })
      const text = projectedGroupTextCandidates(group)
        .find((candidate) => candidate.length >= 24)
      assert.ok(text, `${groupId} provides a PDF content marker`)
      return {
        familyContractId: selection.familyContractId,
        groupId,
        marker: text.slice(0, 24),
      }
    }))
}

function assertPdfSemanticOrder(pdfPath, consumption, label) {
  const text = normalizedVisibleText(pdfText(pdfPath))
  const markers = expectedPdfGroupMarkers(consumption)
  const offsets = markers.map(({ groupId, marker }) => {
    const offset = text.indexOf(marker)
    assert.notEqual(offset, -1, `${label} retains ${groupId}: ${marker}`)
    return offset
  })
  assert.equal(
    offsets.every(
      (offset, index) => index === 0 || offset > offsets[index - 1],
    ),
    true,
    `${label} retains canonical whole-paper Group order: ${JSON.stringify(
      markers.map((marker, index) => ({ ...marker, offset: offsets[index] })),
    )}`,
  )
  assert.deepEqual(
    [...new Set(markers.map(({ familyContractId }) => familyContractId))]
      .sort(),
    [
      'application-writing',
      'cloze',
      'continuation-writing',
      'grammar-fill',
      'reading',
      'seven-choices',
    ],
    `${label} covers every active canonical family`,
  )
  for (const forbidden of [
    'listening.short-dialogue',
    'listening.long-form',
    '听力',
  ]) {
    assert.equal(
      text.includes(forbidden),
      false,
      `${label} exposes zero inactive Listening occurrence: ${forbidden}`,
    )
  }
}

function countTextOccurrences(text, fragment) {
  let count = 0
  let offset = 0
  while ((offset = text.indexOf(fragment, offset)) !== -1) {
    count += 1
    offset += fragment.length
  }
  return count
}

function pdfPageText(pdfPath, page) {
  return normalizedVisibleText(execFileSync(
    'pdftotext',
    ['-f', String(page), '-l', String(page), '-layout', pdfPath, '-'],
    { encoding: 'utf8' },
  ))
}

function markerPages(pdfPath, pageCount, marker) {
  return Array.from({ length: pageCount }, (_, index) => index + 1)
    .filter((page) => pdfPageText(pdfPath, page).includes(marker))
}

function svgPageRectangles(pdfPath, svgPath, page) {
  execFileSync(
    'pdftocairo',
    ['-svg', '-f', String(page), '-l', String(page), pdfPath, svgPath],
  )
  try {
    const svg = readFileSync(svgPath, 'utf8')
    const root = svg.match(
      /<svg\b[^>]*width="([\d.]+)pt"[^>]*height="([\d.]+)pt"[^>]*viewBox="([^"]+)"/,
    )
    assert.ok(root, `PDF page ${page} has SVG page geometry`)
    const rectangles = [...svg.matchAll(/<path\b[^>]*\bd="[^"]+"[^>]*>/g)]
      .map(([tag]) => {
        const d = tag.match(/\bd="([^"]+)"/)?.[1]
        if (!d) return null
        const points = [...d.matchAll(
          /[ML]\s*([\d.-]+)\s+([\d.-]+)/g,
        )].slice(0, 4).map((match) => [Number(match[1]), Number(match[2])])
        if (points.length !== 4) return null
        const matrix = tag.match(
          /transform="matrix\(([\d.-]+),\s*([\d.-]+),\s*([\d.-]+),\s*([\d.-]+),\s*([\d.-]+),\s*([\d.-]+)\)"/,
        )?.slice(1).map(Number) || [1, 0, 0, 1, 0, 0]
        const transformed = points.map(([x, y]) => [
          matrix[0] * x + matrix[2] * y + matrix[4],
          matrix[1] * x + matrix[3] * y + matrix[5],
        ])
        const xs = transformed.map(([x]) => x)
        const ys = transformed.map(([, y]) => y)
        const xMin = Math.min(...xs)
        const xMax = Math.max(...xs)
        const yMin = Math.min(...ys)
        const yMax = Math.max(...ys)
        if (
          xMax - xMin <= 0
          || yMax - yMin <= 0
          || transformed.some(([x, y]) =>
            !(
              Math.abs(x - xMin) <= 0.1
              || Math.abs(x - xMax) <= 0.1
            )
            || !(
              Math.abs(y - yMin) <= 0.1
              || Math.abs(y - yMax) <= 0.1
            ))
        ) return null
        return {
          page,
          xMin,
          yMin,
          xMax,
          yMax,
          width: xMax - xMin,
          height: yMax - yMin,
          stroked: /\bfill="none"/.test(tag),
        }
      })
      .filter(Boolean)
    return {
      width: Number(root[1]),
      height: Number(root[2]),
      viewBox: root[3].split(/\s+/).map(Number),
      rectangles,
    }
  } finally {
    rmSync(svgPath, { force: true })
  }
}

function groupedThinRectangles(rectangles, orientation) {
  const groups = new Map()
  for (const rectangle of rectangles) {
    const vertical = rectangle.width <= 1.6 && rectangle.height >= 10
    const horizontal = rectangle.height <= 1.6 && rectangle.width >= 10
    if (orientation === 'vertical' ? !vertical : !horizontal) continue
    const center = orientation === 'vertical'
      ? (rectangle.xMin + rectangle.xMax) / 2
      : (rectangle.yMin + rectangle.yMax) / 2
    const key = (Math.round(center * 2) / 2).toFixed(1)
    const group = groups.get(key) || []
    group.push(rectangle)
    groups.set(key, group)
  }
  return [...groups.entries()].map(([coordinate, items]) => ({
    coordinate: Number(coordinate),
    count: items.length,
    xMin: Math.min(...items.map((item) => item.xMin)),
    xMax: Math.max(...items.map((item) => item.xMax)),
    yMin: Math.min(...items.map((item) => item.yMin)),
    yMax: Math.max(...items.map((item) => item.yMax)),
  })).sort((left, right) => left.coordinate - right.coordinate)
}

function findNativeTableGrid(rectangles, rowCount, columnCount) {
  const vertical = groupedThinRectangles(rectangles, 'vertical')
    .filter((group) => group.count >= rowCount)
  const horizontal = groupedThinRectangles(rectangles, 'horizontal')
    .filter((group) => group.count >= columnCount)
  for (
    let verticalIndex = 0;
    verticalIndex <= vertical.length - columnCount - 1;
    verticalIndex += 1
  ) {
    const columns = vertical.slice(
      verticalIndex,
      verticalIndex + columnCount + 1,
    )
    const columnWidths = columns.slice(1).map(
      (boundary, index) => boundary.coordinate - columns[index].coordinate,
    )
    if (
      columns.at(-1).coordinate - columns[0].coordinate < 250
      || Math.max(...columnWidths) - Math.min(...columnWidths) > 3
      || Math.max(...columns.map((group) => group.yMin))
        - Math.min(...columns.map((group) => group.yMin)) > 3
      || Math.max(...columns.map((group) => group.yMax))
        - Math.min(...columns.map((group) => group.yMax)) > 3
    ) continue
    for (
      let horizontalIndex = 0;
      horizontalIndex <= horizontal.length - rowCount - 1;
      horizontalIndex += 1
    ) {
      const rows = horizontal.slice(
        horizontalIndex,
        horizontalIndex + rowCount + 1,
      )
      const rowHeights = rows.slice(1).map(
        (boundary, index) => boundary.coordinate - rows[index].coordinate,
      )
      if (
        rows.at(-1).coordinate - rows[0].coordinate < 80
        || Math.max(...rowHeights) - Math.min(...rowHeights) > 3
        || Math.abs(rows[0].xMin - columns[0].coordinate) > 3
        || Math.abs(rows[0].xMax - columns.at(-1).coordinate) > 3
        || Math.abs(columns[0].yMin - rows[0].coordinate) > 3
        || Math.abs(columns[0].yMax - rows.at(-1).coordinate) > 3
      ) continue
      return {
        xMin: columns[0].coordinate,
        xMax: columns.at(-1).coordinate,
        yMin: rows[0].coordinate,
        yMax: rows.at(-1).coordinate,
      }
    }
  }
  return null
}

function rectangleInsideBox(rectangle, box) {
  return rectangle.xMin >= box.xMin - 0.1
    && rectangle.yMin >= box.yMin - 0.1
    && rectangle.xMax <= box.xMax + 0.1
    && rectangle.yMax <= box.yMax + 0.1
}

function firstPdfWordBox(pdfPath, page, word) {
  const bbox = execFileSync(
    'pdftotext',
    ['-bbox', '-f', String(page), '-l', String(page), pdfPath, '-'],
    { encoding: 'utf8' },
  )
  const words = [...bbox.matchAll(
    /<word xMin="([\d.-]+)" yMin="([\d.-]+)" xMax="([\d.-]+)" yMax="([\d.-]+)">([^<]+)<\/word>/g,
  )]
  const match = words.find((candidate) => candidate[5].includes(word))
  assert.ok(match, `PDF page ${page} contains marker word ${word}`)
  return {
    xMin: Number(match[1]),
    yMin: Number(match[2]),
    xMax: Number(match[3]),
    yMax: Number(match[4]),
  }
}

function assertPdfBankAndNativeTable(
  pdfPath,
  consumption,
  outputDir,
  pageBoxes,
  label,
) {
  const text = normalizedVisibleText(pdfText(pdfPath))
  const sevenSelection = consumption.selections.find(
    (selection) => selection.familyContractId === 'seven-choices',
  )
  const sevenGroup = projectCanonicalConsumerGroup({
    consumption,
    familyContractId: 'seven-choices',
    groupId: sevenSelection.groupIds[0],
  })
  for (const option of sevenGroup.optionBank.options) {
    const optionText = canonicalInlineText(option.content)
    assert.equal(
      countTextOccurrences(text, optionText),
      1,
      `${label} renders shared-bank option ${option.label} exactly once`,
    )
  }
  for (const selection of consumption.selections
    .filter((candidate) => candidate.familyContractId === 'reading')) {
    for (const groupId of selection.groupIds) {
      const group = projectCanonicalConsumerGroup({
        consumption,
        familyContractId: 'reading',
        groupId,
      })
      for (const [blockIndex, table] of group.blocks.entries()) {
        if (table.kind !== 'table') continue
        for (const row of table.rows) {
          for (const cell of row.cells) {
            const cellText = normalizedVisibleText(cell.text)
            const terms = cellText.split(/\s+/).filter((term) => term.length > 1)
            assert.equal(terms.length > 0, true)
            for (const term of terms) {
              assert.equal(
                text.includes(term),
                true,
                `${label} retains native table cell ${cell.cellId}: ${term}`,
              )
            }
          }
        }
        const precedingText = normalizedVisibleText(
          group.blocks.slice(0, blockIndex).reverse()
            .find((block) => block.kind === 'paragraph')?.text,
        )
        assert.equal(precedingText.length > 0, true)
        const pages = markerPages(
          pdfPath,
          pageBoxes.length,
          precedingText.slice(0, 24),
        )
        assert.equal(
          pages.length,
          1,
          `${label} places native table ${table.nodeId} on one source-bound page`,
        )
        const page = pages[0]
        const svg = svgPageRectangles(
          pdfPath,
          path.join(
            outputDir,
            `.${label.replaceAll(' ', '-')}-table-${page}.svg`,
          ),
          page,
        )
        const grid = findNativeTableGrid(
          svg.rectangles,
          table.rows.length,
          table.columnCount,
        )
        assert.ok(
          grid,
          `${label} preserves the ${table.rows.length}x${table.columnCount} native table grid`,
        )
        assert.equal(
          rectangleInsideBox(grid, pageBoxes[page - 1].cropBox),
          true,
          `${label} native table grid is fully inside page ${page} CropBox`,
        )
      }
    }
  }
}

function assertPdfA4AndUnclipped(pdfPath, label) {
  const summary = execFileSync('pdfinfo', [pdfPath], { encoding: 'utf8' })
  const pageCount = Number(summary.match(/^Pages:\s+(\d+)$/m)?.[1])
  assert.equal(Number.isInteger(pageCount) && pageCount > 0, true)
  const pageInfo = execFileSync(
    'pdfinfo',
    ['-box', '-f', '1', '-l', String(pageCount), pdfPath],
    { encoding: 'utf8' },
  )
  const sizes = [...pageInfo.matchAll(
    /^Page\s+\d+\s+size:\s+([\d.]+)\s+x\s+([\d.]+)\s+pts/mg,
  )].map((match) => [Number(match[1]), Number(match[2])])
  assert.equal(sizes.length, pageCount, `${label} reports every PDF page`)
  const boxesByPage = Array.from({ length: pageCount }, (_, index) => ({
    page: index + 1,
  }))
  for (const match of pageInfo.matchAll(
    /^Page\s+(\d+)\s+(MediaBox|CropBox):\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)$/mg,
  )) {
    const page = Number(match[1])
    const key = match[2] === 'MediaBox' ? 'mediaBox' : 'cropBox'
    boxesByPage[page - 1][key] = {
      xMin: Number(match[3]),
      yMin: Number(match[4]),
      xMax: Number(match[5]),
      yMax: Number(match[6]),
    }
  }
  for (const [[width, height], boxes] of sizes.map(
    (size, index) => [size, boxesByPage[index]],
  )) {
    assert.equal(
      Math.abs(width - 594.96) <= 0.1
      && Math.abs(height - 841.92) <= 0.1,
      true,
      `${label} page is A4: ${width}x${height}`,
    )
    assert.deepEqual(
      boxes.mediaBox,
      { xMin: 0, yMin: 0, xMax: 594.96, yMax: 841.92 },
      `${label} page ${boxes.page} has an exact A4 MediaBox`,
    )
    assert.deepEqual(
      boxes.cropBox,
      boxes.mediaBox,
      `${label} page ${boxes.page} CropBox equals its MediaBox`,
    )
  }
  const bbox = execFileSync('pdftotext', ['-bbox', pdfPath, '-'], {
    encoding: 'utf8',
  })
  const bboxPages = [...bbox.matchAll(
    /<page width="([\d.-]+)" height="([\d.-]+)">([\s\S]*?)<\/page>/g,
  )]
  assert.equal(bboxPages.length, pageCount, `${label} exposes every text page`)
  for (const [index, pageMatch] of bboxPages.entries()) {
    const cropBox = boxesByPage[index].cropBox
    assert.equal(Math.abs(Number(pageMatch[1]) - cropBox.xMax) <= 0.1, true)
    assert.equal(Math.abs(Number(pageMatch[2]) - cropBox.yMax) <= 0.1, true)
    const words = [...pageMatch[3].matchAll(
      /<word xMin="([\d.-]+)" yMin="([\d.-]+)" xMax="([\d.-]+)" yMax="([\d.-]+)">/g,
    )].map((match) => match.slice(1).map(Number))
    assert.equal(words.length > 0, true, `${label} page ${index + 1} has text`)
    assert.equal(
      words.every(([xMin, yMin, xMax, yMax]) =>
        rectangleInsideBox({ xMin, yMin, xMax, yMax }, cropBox)),
      true,
      `${label} page ${index + 1} has no text outside its CropBox`,
    )
  }
  return boxesByPage
}

function assertPdfWritingResponseRegions(
  pdfPath,
  consumption,
  outputDir,
  pageBoxes,
  label,
) {
  const regions = [
    ['application-writing', 144, 65, 'Application Writing'],
    ['continuation-writing', 145, 57, 'Continuation Writing'],
  ].map(([familyContractId, widthMm, heightMm, regionName]) => {
    const selection = consumption.selections.find(
      (candidate) => candidate.familyContractId === familyContractId,
    )
    const group = projectCanonicalConsumerGroup({
      consumption,
      familyContractId,
      groupId: selection.groupIds[0],
    })
    const marker = projectedGroupTextCandidates(group)
      .find((candidate) => candidate.length >= 24).slice(0, 24)
    const pages = markerPages(pdfPath, pageBoxes.length, marker)
    assert.equal(
      pages.length,
      1,
      `${label} places ${regionName} on one source-bound page`,
    )
    return {
      familyContractId,
      widthMm,
      heightMm,
      regionName,
      marker,
      markerPage: pages[0],
    }
  })
  for (const [index, region] of regions.entries()) {
    const {
      familyContractId,
      widthMm,
      heightMm,
      regionName,
      marker,
      markerPage,
    } = region
    const nextRegion = regions[index + 1]
    const finalPage = nextRegion?.markerPage || pageBoxes.length
    const expectedWidth = widthMm * 72 / 25.4
    const expectedHeight = heightMm * 72 / 25.4
    const matches = []
    for (let page = markerPage; page <= finalPage; page += 1) {
      const svg = svgPageRectangles(
        pdfPath,
        path.join(
          outputDir,
          `.${label.replaceAll(' ', '-')}-${familyContractId}-${page}.svg`,
        ),
        page,
      )
      assert.equal(
        Math.abs(svg.width - pageBoxes[page - 1].cropBox.xMax) <= 0.1
        && Math.abs(svg.height - pageBoxes[page - 1].cropBox.yMax) <= 0.1
        && svg.viewBox.length === 4
        && Math.abs(svg.viewBox[2] - svg.width) <= 0.1
        && Math.abs(svg.viewBox[3] - svg.height) <= 0.1,
        true,
        `${label} page ${page} SVG viewport equals the PDF CropBox`,
      )
      matches.push(...svg.rectangles.filter(({ width, height, stroked }) =>
        stroked
        && Math.abs(width - expectedWidth) <= 2.5
        && Math.abs(height - expectedHeight) <= 2.5))
    }
    assert.equal(
      matches.length,
      1,
      `${label} preserves exactly one ${regionName} ${widthMm}x${heightMm}mm response region in its occurrence interval`,
    )
    assert.equal(
      rectangleInsideBox(matches[0], pageBoxes[matches[0].page - 1].cropBox),
      true,
      `${label} ${regionName} response region is fully inside page ${matches[0].page} CropBox`,
    )
    const markerWord = marker.match(/[A-Za-z][A-Za-z'-]*/)?.[0]
    if (markerWord && matches[0].page === markerPage) {
      const markerBox = firstPdfWordBox(
        pdfPath,
        markerPage,
        markerWord,
      )
      assert.equal(
        matches[0].yMin > markerBox.yMin,
        true,
        `${label} ${regionName} response region follows its source marker`,
      )
    }
    if (nextRegion && matches[0].page === nextRegion.markerPage) {
      const nextMarkerWord =
        nextRegion.marker.match(/[A-Za-z][A-Za-z'-]*/)?.[0]
      assert.ok(nextMarkerWord)
      const nextMarkerBox = firstPdfWordBox(
        pdfPath,
        nextRegion.markerPage,
        nextMarkerWord,
      )
      assert.equal(
        matches[0].yMax < nextMarkerBox.yMin,
        true,
        `${label} ${regionName} response region precedes the next writing occurrence`,
      )
    }
  }
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

async function assertServedQaArtifacts({
  qaServer,
  outputDir,
  head,
}) {
  const expectedArtifacts = {
    studentPrintHtml: {
      fileName: 'print-student.html',
      contentType: 'text/html; charset=utf-8',
    },
    teacherPrintHtml: {
      fileName: 'print-teacher.html',
      contentType: 'text/html; charset=utf-8',
    },
    studentChromiumPdf: {
      fileName: 'print-student.pdf',
      contentType: 'application/pdf',
    },
    teacherChromiumPdf: {
      fileName: 'print-teacher.pdf',
      contentType: 'application/pdf',
    },
  }
  for (const [artifactId, expected] of Object.entries(expectedArtifacts)) {
    const response = await fetch(qaServer.urls[artifactId])
    assert.equal(response.status, 200, `${artifactId} QA URL loads`)
    assert.equal(
      response.headers.get('content-type'),
      expected.contentType,
      `${artifactId} QA URL has the correct content type`,
    )
    assert.deepEqual(
      Buffer.from(await response.arrayBuffer()),
      readFileSync(path.join(outputDir, expected.fileName)),
      `${artifactId} QA URL serves the exact generated bytes`,
    )
  }
  const unknown = await fetch(`${qaServer.baseUrl}/not-an-artifact`)
  assert.equal(unknown.status, 404, 'unknown QA artifact paths fail closed')
  const traversal = await fetch(
    `${qaServer.baseUrl}/qa-artifacts/${head}/%2e%2e%2fHEAD.txt`,
  )
  assert.equal(traversal.status, 404, 'QA artifact traversal paths fail closed')
  assert.equal(
    qaServer.isListening(),
    true,
    'QA artifact server remains alive after its behavioral regression',
  )
}

async function renderSupportedArtifacts({
  dbPath,
  paperAssetsDir,
  outputDir,
  consumers,
  keepServices = false,
}) {
  mkdirSync(outputDir, { recursive: true })
  const asset = JSON.parse(readFileSync(
    path.join(paperAssetsDir, paperId, 'latest', 'paper-asset.json'),
    'utf8',
  ))
  const userDbPath = path.join(path.dirname(dbPath), 'user-data.sqlite')
  const forbiddenToolDir = path.join(path.dirname(dbPath), 'forbidden-output-tools')
  const forbiddenToolMarker = path.join(
    path.dirname(dbPath),
    'forbidden-output-tool-called.txt',
  )
  mkdirSync(forbiddenToolDir, { recursive: true })
  for (const toolName of ['libreoffice', 'soffice']) {
    const toolPath = path.join(forbiddenToolDir, toolName)
    writeFileSync(
      toolPath,
      `#!/bin/sh\nprintf '%s\\n' '${toolName}' >> '${forbiddenToolMarker}'\nexit 97\n`,
    )
    chmodSync(toolPath, 0o755)
  }
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
      PATH: `${forbiddenToolDir}:${process.env.PATH || ''}`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  api.output = ''
  api.stdout.on('data', (chunk) => { api.output += chunk.toString() })
  api.stderr.on('data', (chunk) => { api.output += chunk.toString() })

  let viteServer = null
  let completed = false
  const closeServices = async () => {
    if (viteServer) {
      await viteServer.close()
      viteServer = null
    }
    if (api.exitCode === null) await stopChild(api)
  }
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
      for (const group of Object.values(asset.content.groups)
        .filter((candidate) => candidate.groupType === 'listening')) {
        assert.equal(
          await page.locator(
            `[data-paper-browse-anchor="${group.groupId}"]`,
          ).count(),
          0,
          `PaperSurface exposes zero Listening occurrence for ${group.groupId}`,
        )
      }
      assert.equal(
        await page.locator('.paper-browse-answer-row').count(),
        0,
        'plain PaperSurface hides official answers',
      )
      const plainHtml = await page.content()
      assert.equal(
        await page.locator('.paper-browse-lecture-analysis').count(),
        0,
        'plain PaperSurface hides the lecture teaching panel',
      )
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
      assert.equal(
        await page.locator('.paper-browse-lecture-analysis').count(),
        1,
        'lecture PaperSurface exposes one teaching panel',
      )
      assert.deepEqual(
        structuralArtifactIdentity(plainHtml),
        structuralArtifactIdentity(lectureHtml),
        'plain/lecture PaperSurface retains identical canonical structure',
      )
      const screenSignatures = new Set(attributeSignatures(plainHtml))
      assertExactRenderedSignatures(
        plainHtml,
        consumers.screen,
        'PaperSurface',
      )
      assertArtifactContainsCanonicalIdentity(
        plainHtml,
        expectedCanonicalIdentity(consumers.screen),
        'PaperSurface',
      )
      const groupOrder = expectedGroupOrder(asset)
      const screenGroupTops = []
      for (const groupId of groupOrder) {
        const box = await page.locator(
          `[data-paper-browse-anchor="${groupId}"]`,
        ).boundingBox()
        assert.ok(box, `PaperSurface exposes ${groupId} geometry`)
        screenGroupTops.push(box.y)
      }
      assert.equal(
        screenGroupTops.every(
          (top, index) => index === 0 || top >= screenGroupTops[index - 1],
        ),
        true,
        'PaperSurface preserves whole-paper Group order',
      )
      assert.equal(
        await page.locator('[data-canonical-answer-region-ref]').count(),
        2,
        'PaperSurface exposes the two canonical writing response regions',
      )
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
      assertStudentTeacherStructuralParity(
        printHtml.student,
        printHtml.teacher,
      )
      assert.equal(
        attributeSignatures(printHtml.student).length > 0,
        true,
        'Print HTML carries canonical semantic and occurrence signatures',
      )
      const printSignatures = new Set(attributeSignatures(printHtml.student))
      assertExactRenderedSignatures(
        printHtml.student,
        consumers.print_pdf,
        'Print HTML',
      )
      assert.deepEqual(
        [...screenSignatures].sort(),
        [...printSignatures].sort(),
        'PaperSurface and Print HTML carry the same canonical signatures',
      )
      assertArtifactContainsCanonicalIdentity(
        printHtml.student,
        expectedCanonicalIdentity(consumers.print_pdf),
        'Print HTML',
      )
      assert.equal(
        (printHtml.student.match(/class="explanation"/g) || []).length,
        0,
        'Student Print HTML hides explanations',
      )
      assert.equal(
        canonicalAttributeValues(
          printHtml.student,
          'data-canonical-answer-region-ref',
        ).length,
        2,
        'Print HTML exposes the two canonical writing response regions',
      )
      const printGroupOffsets = groupOrder.map((groupId) =>
        printHtml.student.indexOf(`data-canonical-group-id="${groupId}"`))
      assert.equal(
        printGroupOffsets.every(
          (offset, index) =>
            offset >= 0
            && (index === 0 || offset > printGroupOffsets[index - 1]),
        ),
        true,
        `Print HTML preserves whole-paper Group order: ${JSON.stringify(
          groupOrder.map((groupId, index) => ({
            groupId,
            offset: printGroupOffsets[index],
          })),
        )}`,
      )
      for (const group of Object.values(asset.content.groups)
        .filter((candidate) => candidate.groupType === 'listening')) {
        assert.equal(
          printHtml.student.includes(group.groupId),
          false,
          `Print HTML exposes zero Listening occurrence for ${group.groupId}`,
        )
        assert.equal(
          printHtml.teacher.includes(group.groupId),
          false,
          `Teacher Print HTML exposes zero Listening occurrence for ${group.groupId}`,
        )
      }
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
      for (const [versionType, pdfPath] of Object.entries(pdfPaths)) {
        const label =
          `${versionType === 'student' ? 'Student' : 'Teacher'} Chromium PDF`
        assertPdfSemanticOrder(pdfPath, consumers.print_pdf, label)
        const pageBoxes = assertPdfA4AndUnclipped(pdfPath, label)
        assertPdfBankAndNativeTable(
          pdfPath,
          consumers.print_pdf,
          outputDir,
          pageBoxes,
          label,
        )
        assertPdfWritingResponseRegions(
          pdfPath,
          consumers.print_pdf,
          outputDir,
          pageBoxes,
          label,
        )
      }
      assert.equal(
        existsSync(forbiddenToolMarker),
        false,
        'direct Chromium PDFs do not invoke DOCX or LibreOffice output tools',
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
    completed = true
    return {
      appUrl,
      baseUrl,
      plainUrl: new URL(
        `canonical-consumption-qa.html?paperId=${encodeURIComponent(paperId)}`,
        appUrl,
      ).href,
      lectureUrl: new URL(
        `canonical-consumption-qa.html?paperId=${encodeURIComponent(paperId)}`
        + `&lecture=1&focusGroupId=${encodeURIComponent(draft.firstGroup.groupId)}`
        + `&questionId=${encodeURIComponent(draft.firstGroup.questionIds[0])}`,
        appUrl,
      ).href,
      artifactFiles,
      closeServices,
    }
  } finally {
    if (!keepServices || !completed) await closeServices()
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
  const validation = validatePaperImportPackage(files)
  assert.equal(validation.ok, true)
  const sourceDocument = validation.packageData.sourceDocx
  assert.equal(sourceDocument.kind, 'pdf')
  const requestPath = path.join(
    sourcePackageDir,
    'canonical-evidence/canonical-import-request.json',
  )
  execFileSync(process.execPath, [
    path.join(
      repositoryRoot,
      'scripts/import-pipeline/build-canonical-request.mjs',
    ),
    sourcePackageDir,
    '--answers-pdf',
    path.join(
      sourcePackageDir,
      'canonical-evidence/06-source_answers_pdf.pdf',
    ),
    '--instruction-evidence',
    path.join(
      sourcePackageDir,
      'canonical-evidence/03-continuation_writing_instruction_evidence.json',
    ),
    '--reviewed-evidence-dir',
    path.join(sourcePackageDir, 'reviewed-evidence'),
    '--output-dir',
    path.dirname(requestPath),
  ], { stdio: 'pipe' })
  const loadedRequest = loadCanonicalImportRequest(requestPath)
  const loadedSourceDocument = loadedRequest.evidence.documents.find(
    (document) => document.inputKey === 'original_question_source',
  )
  assert.ok(loadedSourceDocument, 'operator envelope captures the source PDF')
  assert.equal(
    Buffer.compare(
      Buffer.from(loadedSourceDocument.bytes),
      sourceDocument.buffer,
    ),
    0,
    'operator envelope captures the exact admitted source PDF bytes',
  )

  const beforeDryRun = {
    tree: snapshotTree(paperAssetsDir),
    database: snapshotDatabase(db),
  }
  const dryRun = admitCanonicalPaperImport({
    request: loadedRequest,
    sourceAssetVersion: 1,
    sourceAsset: filesByName['paper-asset.json'],
  })
  assert.equal(dryRun.ok, true)
  const capturedSourceDocument =
    dryRun.compilation.artifacts.sourceCapture.documents.find(
      (document) => document.inputKey === 'original_question_source',
    )
  assert.equal(capturedSourceDocument.originalName, sourceDocument.fileName)
  assert.equal(
    capturedSourceDocument.sha256,
    `sha256:${sha256(sourceDocument.buffer)}`,
  )
  assert.equal(
    dryRun.compilation.artifacts.canonicalPaper.paperPlan.slotBindings
      .filter((binding) => binding.state === 'inactive').length,
    2,
    'canonical Plan closes both Listening slots as inactive',
  )
  assert.equal(
    dryRun.compilation.artifacts.normalizationReport.inactiveSourceClosures
      .length,
    2,
    'normalization evidence closes both inactive Listening source slices',
  )
  assert.deepEqual(snapshotTree(paperAssetsDir), beforeDryRun.tree)
  assert.deepEqual(snapshotDatabase(db), beforeDryRun.database)

  let publisherCaptureCount = 0
  const captureDocxSourceMediaImpl = () => {
    publisherCaptureCount += 1
    throw new Error('PDF source must not enter DOCX media capture')
  }
  const publishPilot = (options = {}) => publishPaperImportPackage({
    files,
    db,
    paperAssetsDir,
    canonicalRequest: loadedRequest,
    captureDocxSourceMediaImpl,
    ...options,
  })
  const published = publishPilot()
  assert.equal(
    published.status,
    'published',
    `canonical publish diagnostics: ${JSON.stringify(
      published.canonicalAdmission?.diagnostics || [],
    )}`,
  )
  assert.equal(published.publish.assetVersion, 1)
  const first = await exactReload({
    db,
    paperAssetsDir,
    expectedVersion: 'v1',
  })

  assert.throws(
    () => publishPilot({
      failurePoint: 'after-commit',
    }),
    { code: 'CANONICAL_PUBLICATION_FORCED_RELOAD_FAILURE' },
  )
  db.close()
  db = new DatabaseSync(dbPath)
  const retry = publishPilot()
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
  assert.equal(
    publisherCaptureCount,
    0,
    'public publish and retry keep PDF input outside DOCX capture',
  )
  const restoredVersionDir = path.join(
    paperAssetsDir,
    paperId,
    'versions',
    first.ref.versionName,
  )
  const immutableSourcePath = path.join(
    restoredVersionDir,
    'raw',
    sourceDocument.fileName,
  )
  assert.deepEqual(
    readFileSync(immutableSourcePath),
    Buffer.from(sourceDocument.buffer),
    'immutable version preserves the exact PDF source bytes',
  )
  assert.equal(
    existsSync(path.join(restoredVersionDir, 'raw', 'docx-source-capture.json')),
    false,
    'PDF input creates no DOCX capture sidecar',
  )
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
    keepServices: keepQaServer,
  })
  const sourcePackageDigests = Object.fromEntries(
    files.map(({ fileName, buffer }) => [fileName, sha256(buffer)]),
  )
  const canonicalEvidenceDigests = Object.fromEntries(
    dryRun.compilation.artifacts.sourceCapture.documents.map((document) => [
      document.inputKey,
      document.sha256,
    ]),
  )
  const renderedArtifactDigests = Object.fromEntries(
    rendered.artifactFiles.map((relativePath) => [
      relativePath,
      sha256(readFileSync(path.join(outputDir, relativePath))),
    ]),
  )
  const forbiddenOutputArtifacts = rendered.artifactFiles.filter(
    (relativePath) => /\.(?:docx|xml)$/i.test(relativePath),
  )
  writeFileSync(path.join(outputDir, 'evidence.json'), `${JSON.stringify({
    schemaVersion: 'canonical-import-pilot-evidence-v1',
    head,
    sourcePackage: path.relative(repositoryRoot, sourcePackageDir),
    sourcePackageDigests,
    canonicalRequestDigest: sha256(readFileSync(requestPath)),
    canonicalEvidenceDigests,
    dryRun: {
      validation: 'ready',
      canonicalAdmission: 'ready',
      storeMutationCount: 0,
      sourceCaptureDocument: {
        inputKey: capturedSourceDocument.inputKey,
        originalName: capturedSourceDocument.originalName,
        sha256: capturedSourceDocument.sha256,
      },
      inactiveListeningSlotCount: 2,
    },
    publish: {
      initialVersion: first.ref,
      recoveryRetryVersion: 'v2',
      retryStatus: retry.status,
      rollbackStatus: rollback.status,
      restoredVersion: restored.ref,
      publisherDocxCaptureCount: publisherCaptureCount,
      immutableSource: {
        relativePath: path.relative(paperAssetsDir, immutableSourcePath),
        inputSha256: sha256(sourceDocument.buffer),
        publishedSha256: sha256(readFileSync(immutableSourcePath)),
      },
    },
    consumers: {
      ids: Object.keys(restored.consumers).sort(),
      semanticParity: 'exact',
      listeningOccurrenceCount: 0,
    },
    renderedArtifactDigests,
    forbiddenOutputArtifacts,
    directPdfOutputToolSentinel: 'not_called',
  }, null, 2)}\n`)
  writeFileSync(path.join(outputDir, 'HEAD.txt'), `${head}\n`)
  if (provisionActualArtifacts) {
    console.log(`QA artifacts: ${outputDir}`)
  }
  if (keepQaServer) {
    try {
      await runCanonicalImportPilotQaSession({
        startArtifactServer: injectQaArtifactServerStartupFailure
          ? async () => {
              throw new Error('Injected QA artifact server startup failure')
            }
          : undefined,
        artifactServerOptions: {
          repositoryRoot,
          head,
        },
        closeRenderedServices: rendered.closeServices,
        run: async (qaArtifactServer) => {
          assert.equal(
            qaArtifactServer.artifactDir,
            outputDir,
            'QA artifact server binds the exact HEAD-scoped output directory',
          )
          await assertServedQaArtifacts({
            qaServer: qaArtifactServer,
            outputDir,
            head,
          })
          console.log(`QA plain URL: ${rendered.plainUrl}`)
          console.log(`QA lecture URL: ${rendered.lectureUrl}`)
          console.log(
            `QA Student Print HTML URL: ${
              qaArtifactServer.urls.studentPrintHtml
            }`,
          )
          console.log(
            `QA Teacher Print HTML URL: ${
              qaArtifactServer.urls.teacherPrintHtml
            }`,
          )
          console.log(
            `QA Student Chromium PDF URL: ${
              qaArtifactServer.urls.studentChromiumPdf
            }`,
          )
          console.log(
            `QA Teacher Chromium PDF URL: ${
              qaArtifactServer.urls.teacherChromiumPdf
            }`,
          )
          console.log('QA server is ready; stop this process after owner QA.')
          await new Promise((resolve) => {
            process.once('SIGINT', resolve)
            process.once('SIGTERM', resolve)
          })
        },
      })
    } catch (error) {
      if (!injectQaArtifactServerStartupFailure) throw error
      const retainedServiceProbeComplete = new Promise((resolve) => {
        const keepAlive = setInterval(() => {}, 1_000)
        const finish = () => {
          clearInterval(keepAlive)
          resolve()
        }
        process.once('SIGINT', finish)
        process.once('SIGTERM', finish)
      })
      console.log(
        `QA retained-service cleanup probes: ${JSON.stringify({
          api: new URL('/api/health', rendered.baseUrl).href,
          vite: rendered.appUrl,
        })}`,
      )
      await retainedServiceProbeComplete
      throw error
    }
  }
  console.log('PASS backend canonical import pilot')
} finally {
  if (db) db.close()
  rmSync(rootDir, { recursive: true, force: true })
}
