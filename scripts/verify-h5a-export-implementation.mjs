#!/usr/bin/env node
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createExportImplementation } from '../server/exports/exportImplementation.mjs'
import { createVerifier, readText, repoRootFrom } from './lib/verifyScope.mjs'

const root = repoRootFrom(import.meta.url)
const verifier = createVerifier('H5-A export implementation')
const fixture = JSON.parse(readFileSync(path.join(root, 'scripts/fixtures/h5a-export-baseline.json'), 'utf8'))

function detailForGroup(questionGroupId) {
  return fixture.detailByGroupId[questionGroupId] || null
}

function documentXmlSummary({ title, versionType, printStyle, items, blocks, questionNumberStart }) {
  return [
    'documentXml',
    title,
    versionType,
    printStyle,
    questionNumberStart,
    items.length,
    Array.isArray(blocks) ? blocks.length : 0,
  ].join(':')
}

function documentXmlSummaryWithDiagnostic(input) {
  input.normalizationDiagnostics.push({
    status: 'legacy',
    source: 'legacy',
    paperId: 'paper-host-diagnostic',
    groupId: 'group-host-diagnostic',
    reason: 'host_diagnostic_probe',
  })
  return documentXmlSummary(input)
}

function htmlSummary({ title, versionType, printStyle, items, blocks, questionNumberStart }) {
  return [
    'html',
    title,
    versionType,
    printStyle,
    questionNumberStart,
    items.length,
    Array.isArray(blocks) ? blocks.length : 0,
  ].join(':')
}

function assertResult(label, result, expected) {
  verifier.assert(result.fileName === expected.fileName, `${label} file name matches baseline`)
  if (expected.outputPathSuffix) {
    verifier.assert(
      String(result.outputPath || '').endsWith(expected.outputPathSuffix),
      `${label} output path keeps timestamped file suffix`,
    )
  }
  verifier.assert(Buffer.from(result.body).toString('utf8') === expected.bodyUtf8, `${label} body bytes match baseline`)
}

verifier.section('Run-form byte fixtures')

const tempExportDir = mkdtempSync(path.join(tmpdir(), 'h5a-export-fixtures-'))
try {
  const implementation = createExportImplementation({
    rootDir: root,
    exportDir: tempExportDir,
    getQuestionGroupDetail: detailForGroup,
    buildDocumentXml: documentXmlSummary,
    writeDocxPackage({ documentXml, outputPath, title }) {
      writeFileSync(outputPath, Buffer.from(`docx:${title}:${documentXml}`))
      return readFileSync(outputPath)
    },
    buildPrintHtml: htmlSummary,
    convertDocxToPdf(_docxPath, outputPath) {
      writeFileSync(outputPath, Buffer.from(`pdf:${path.basename(outputPath)}`))
    },
    renderPrintPdf({ html, pdfPath }) {
      writeFileSync(pdfPath, Buffer.from(`pdf:${html}`))
    },
    timestampPrefix: () => fixture.fixedTimestampPrefix,
  })

  assertResult(
    'student DOCX',
    implementation.exportDocx(fixture.inputs.docxStudent),
    fixture.expected.docxStudent,
  )
  assertResult(
    'teacher DOCX',
    implementation.exportDocx(fixture.inputs.docxTeacher),
    fixture.expected.docxTeacher,
  )
  assertResult(
    'student PDF',
    implementation.exportPdf(fixture.inputs.docxStudent),
    fixture.expected.pdfStudent,
  )
  assertResult(
    'print HTML',
    implementation.exportPrintHtml(fixture.inputs.printHtml),
    fixture.expected.printHtml,
  )
  assertResult(
    'print PDF',
    implementation.exportPrintPdf(fixture.inputs.printPdf),
    fixture.expected.printPdf,
  )
} finally {
  rmSync(tempExportDir, { recursive: true, force: true })
}

verifier.section('Extraction seam')

const apiSource = readText(root, 'server/api.mjs')
const routesSource = readText(root, 'server/exports/exportRoutes.mjs')
const implementationSource = readText(root, 'server/exports/exportImplementation.mjs')

for (const name of ['exportDocx', 'exportPdf', 'exportPrintHtml', 'exportPrintPdf']) {
  verifier.assert(!new RegExp(`function\\s+${name}\\s*\\(`).test(apiSource), `api no longer defines ${name}`)
  verifier.assert(implementationSource.includes(`function ${name}(`), `implementation defines ${name}`)
  verifier.assert(!routesSource.includes(`context.${name}`), `export routes do not call context.${name}`)
}

for (const name of ['sendBinary', 'sendDocx', 'sendPdf']) {
  verifier.assert(!new RegExp(`function\\s+${name}\\s*\\(`).test(apiSource), `api no longer defines ${name}`)
  verifier.assert(implementationSource.includes(`function ${name}(`), `implementation owns ${name}`)
}

verifier.assert(
  routesSource.includes('exportDocx(input)') && routesSource.includes('sendDocx(response, result.body, result.fileName, result.outputPath)'),
  'export routes call implementation helpers directly',
)
verifier.assert(
  apiSource.includes("from './exports/exportImplementation.mjs'") && apiSource.includes('createExportRoutes(exportImplementation)'),
  'api wires export implementation into export routes',
)

verifier.section('DOCX normalization diagnostic host seam')

const diagnosticExportDir = mkdtempSync(path.join(tmpdir(), 'h5a-docx-diagnostic-'))
try {
  const implementation = createExportImplementation({
    rootDir: root,
    exportDir: diagnosticExportDir,
    getQuestionGroupDetail: detailForGroup,
    buildDocumentXml: documentXmlSummaryWithDiagnostic,
    writeDocxPackage({ documentXml, outputPath }) {
      writeFileSync(outputPath, Buffer.from(documentXml))
      return readFileSync(outputPath)
    },
    buildPrintHtml: htmlSummary,
    convertDocxToPdf(_docxPath, outputPath) {
      writeFileSync(outputPath, Buffer.from('pdf'))
    },
    timestampPrefix: () => fixture.fixedTimestampPrefix,
  })
  const result = implementation.exportDocx(fixture.inputs.docxStudent)
  verifier.assert(
    result.normalizationDiagnostics?.[0]?.reason === 'host_diagnostic_probe',
    'exportDocx returns structured normalization diagnostics to its host',
  )
} finally {
  rmSync(diagnosticExportDir, { recursive: true, force: true })
}

verifier.summary()
