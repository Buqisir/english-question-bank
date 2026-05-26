import { parsePaperImportMultipart } from '../paper-import/multipart.mjs'
import { defineRoute } from '../router/index.mjs'
import { analyzeReadingImportCandidate } from './analyzeReading.mjs'
import { parseReadingDocxBuffer } from './docxSplitter.mjs'

const I1_PARSE_LIMITS = {
  maxFiles: 2,
  maxFileBytes: 8_000_000,
  maxTotalBytes: 16_000_000,
}

function routeError(error) {
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

export function createPaperImportAiRoutes(services = {}) {
  const analyzeReading = services.analyzeReading || analyzeReadingImportCandidate
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
  ]
}
