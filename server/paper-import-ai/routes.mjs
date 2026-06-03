import { parsePaperImportMultipart } from '../paper-import/multipart.mjs'
import { publishPaperImportPackage } from '../paper-import/publisher.mjs'
import { defineRoute } from '../router/index.mjs'
import { analyzeReadingImportCandidate } from './analyzeReading.mjs'
import { analyzeClozeImportCandidate } from './analyzeCloze.mjs'
import { analyzeSevenChoicesImportCandidate } from './analyzeSevenChoices.mjs'
import { analyzeGrammarFillImportCandidate } from './analyzeGrammarFill.mjs'
import { parseReadingDocxBuffer } from './docxSplitter.mjs'
import { buildPaperImportAiPackageFiles } from './packageBuilder.mjs'

const I1_PARSE_LIMITS = {
  maxFiles: 2,
  maxFileBytes: 8_000_000,
  maxTotalBytes: 16_000_000,
}

const I1_PUBLISH_LIMITS = {
  maxFiles: 2,
  maxFileBytes: 8_000_000,
  maxTotalBytes: 16_000_000,
}

function routeError(error) {
  if (error && typeof error === 'object' && 'message' in error) return String(error.message)
  return error instanceof Error ? error.message : String(error)
}

function isDocxFile(file) {
  return /\.docx$/i.test(readableFileName(file))
}

function isAnswerDocxFile(file) {
  return /答案|解析|参考答案/i.test(readableFileName(file))
}

function readableFileName(file) {
  const raw = String(file?.fileName || '')
  if (!raw) return ''
  const decoded = Buffer.from(raw, 'latin1').toString('utf8')
  return /[\u4e00-\u9fff]/.test(decoded) ? decoded : raw
}

function splitPaperAndAnswerFiles(files) {
  const docxFiles = files.filter(isDocxFile)
  if (docxFiles.length === 1) {
    return { paperFile: docxFiles[0], answerFile: null, error: '' }
  }
  if (docxFiles.length !== 2) {
    return { paperFile: null, answerFile: null, error: '请上传一个试卷版 .docx，可选再上传一个答案解析版 .docx。' }
  }
  const answerFiles = docxFiles.filter(isAnswerDocxFile)
  const paperFiles = docxFiles.filter((file) => !isAnswerDocxFile(file))
  if (answerFiles.length === 0) {
    const sorted = [...docxFiles].sort((a, b) => a.buffer.byteLength - b.buffer.byteLength)
    return { paperFile: sorted[1], answerFile: sorted[0], error: '' }
  }
  if (answerFiles.length !== 1 || paperFiles.length !== 1) {
    return { paperFile: null, answerFile: null, error: '双文件导入需要 1 个试卷版 .docx 和 1 个文件名含“答案/解析”的答案解析版 .docx。' }
  }
  return { paperFile: paperFiles[0], answerFile: answerFiles[0], error: '' }
}

function parsePublishPayload(files, fields) {
  const payloadFile = files.find((file) => /\.json$/i.test(readableFileName(file)))
  const payloadText = payloadFile?.buffer?.toString('utf8') || fields?.payload || ''
  if (!payloadText.trim()) {
    throw new Error('缺少发布 payload。')
  }
  const payload = JSON.parse(payloadText)
  const paperFile = files.find((file) => isDocxFile(file) && !isAnswerDocxFile(file)) || files.find(isDocxFile)
  if (!paperFile) {
    throw new Error('发布需要同时上传试卷版 DOCX。')
  }
  return { payload, paperFile }
}

export function createPaperImportAiRoutes(services = {}) {
  const analyzeReading = services.analyzeReading || analyzeReadingImportCandidate
  const analyzeSevenChoices = services.analyzeSevenChoices || analyzeSevenChoicesImportCandidate
  const analyzeCloze = services.analyzeCloze || analyzeClozeImportCandidate
  const analyzeGrammarFill = services.analyzeGrammarFill || analyzeGrammarFillImportCandidate
  return [
    defineRoute('POST', /^\/api\/paper-import-ai\/parse$/, async ({ request, response, context }) => {
      let files = []
      try {
        ;({ files } = await parsePaperImportMultipart(request, { limits: I1_PARSE_LIMITS }))
      } catch (error) {
        context.sendJson(response, 400, { error: routeError(error) })
        return
      }

      const { paperFile, answerFile, error } = splitPaperAndAnswerFiles(files)
      if (error) {
        context.sendJson(response, 400, { error })
        return
      }

      try {
        const result = await parseReadingDocxBuffer(paperFile.buffer, {
          sourceFilename: readableFileName(paperFile),
          answerKeyBuffer: answerFile?.buffer,
          answerSourceFilename: answerFile ? readableFileName(answerFile) : '',
        })
        context.sendJson(response, 200, result)
      } catch (error) {
        context.sendJson(response, 422, { error: routeError(error) })
      }
    }),
    defineRoute('POST', /^\/api\/paper-import-ai\/analyze$/, async ({ request, response, context }) => {
      try {
        const input = await context.readJsonBody(request, { maxBytes: 2_000_000 })
        const result = await analyzeReading(input)
        context.sendJson(response, 200, result)
      } catch (error) {
        context.sendJson(response, 422, { error: routeError(error) })
      }
    }),
    defineRoute('POST', /^\/api\/paper-import-ai\/analyze-seven-choices$/, async ({ request, response, context }) => {
      try {
        const input = await context.readJsonBody(request, { maxBytes: 2_000_000 })
        const result = await analyzeSevenChoices(input)
        context.sendJson(response, 200, result)
      } catch (error) {
        context.sendJson(response, 422, { error: routeError(error) })
      }
    }),
    defineRoute('POST', /^\/api\/paper-import-ai\/analyze-cloze$/, async ({ request, response, context }) => {
      try {
        const input = await context.readJsonBody(request, { maxBytes: 2_000_000 })
        const result = await analyzeCloze(input)
        context.sendJson(response, 200, result)
      } catch (error) {
        context.sendJson(response, 422, { error: routeError(error) })
      }
    }),
    defineRoute('POST', /^\/api\/paper-import-ai\/analyze-grammar-fill$/, async ({ request, response, context }) => {
      try {
        const input = await context.readJsonBody(request, { maxBytes: 2_000_000 })
        const result = await analyzeGrammarFill(input)
        context.sendJson(response, 200, result)
      } catch (error) {
        context.sendJson(response, 422, { error: routeError(error) })
      }
    }),
    defineRoute('POST', /^\/api\/paper-import-ai\/publish$/, async ({ request, response, context }) => {
      let files = []
      let fields = {}
      try {
        ;({ files, fields } = await parsePaperImportMultipart(request, { limits: I1_PUBLISH_LIMITS }))
      } catch (error) {
        context.sendJson(response, 400, { error: routeError(error) })
        return
      }

      let packageFiles = []
      try {
        const { payload, paperFile } = parsePublishPayload(files, fields)
        packageFiles = buildPaperImportAiPackageFiles({
          parseResult: payload.parseResult,
          analysesByGroupId: payload.analysesByGroupId,
          sevenChoicesGroup: payload.sevenChoicesGroup || null,
          sevenChoicesAnalysis: payload.sevenChoicesAnalysis || null,
          clozeGroup: payload.clozeGroup || null,
          clozeAnalysis: payload.clozeAnalysis || null,
          grammarFillGroup: payload.grammarFillGroup || null,
          grammarFillAnalysis: payload.grammarFillAnalysis || null,
          applicationGroup: payload.applicationGroup || null,
          continuationGroup: payload.continuationGroup || null,
          sourceDocx: {
            fileName: readableFileName(paperFile),
            contentType: paperFile.contentType,
            buffer: paperFile.buffer,
          },
        })
      } catch (error) {
        const detail = error && typeof error === 'object' ? error : {}
        context.sendJson(response, 422, { ok: false, status: detail.status || 'package_failed', error: routeError(error), detail })
        return
      }

      const db = context.openDatabase({ readOnly: false })
      try {
        const result = publishPaperImportPackage({ files: packageFiles, db, paperAssetsDir: context.paperAssetsDir })
        if (result.ok) {
          context.invalidatePaperSurfaceAnalysisAvailability()
          context.invalidateTeachingFacetIndex()
        }
        context.sendJson(response, result.ok ? 201 : 422, result)
      } catch (error) {
        context.sendJson(response, 500, { ok: false, status: 'publish_failed', error: routeError(error) })
      } finally {
        db.close()
      }
    }),
  ]
}
