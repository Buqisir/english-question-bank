import { defineRoute } from '../router/index.mjs'
import archiver from 'archiver'
import { readFileSync } from 'node:fs'
import {
  createVocabularyPrintJob,
  deleteVocabularyPrintJob,
  readVocabularyPrintJob,
} from './vocabularyPrintJobs.mjs'
import {
  VocabularyStoreError,
  buildCombinedVocabularyPrintPayload,
  buildVocabularyDictationTaskPrintPayload,
  createVocabularyDictationRecord,
  createVocabularyDictationTask,
  createVocabularyMeaningRecallRecord,
  createVocabularyStudent,
  createVocabularyReviewRun,
  createVocabularySetFromEntries,
  createVocabularySetErrorTasks,
  decideVocabularyReviewEntry,
  discardVocabularyReviewRun,
  freezeVocabularySet,
  getPublicVocabularyDictationResource,
  getPublicVocabularyListenResource,
  getCurrentVocabularyReviewRun,
  getPublicVocabularyShare,
  getStudentVocabularyReviewStates,
  getStudentVocabularyMeaningStates,
  getSuggestedVocabularyReview,
  getSuggestedVocabularyMeaningRecall,
  getVocabularyDictationRecord,
  getVocabularyDictationTask,
  getVocabularyMeaningRecallRecord,
  getVocabularyProgram,
  getVocabularyProgress,
  getVocabularyReviewRun,
  getVocabularySet,
  getVocabularySetForReviewRun,
  listVocabularyDictationRecords,
  listVocabularyDictationTasks,
  listVocabularyMeaningRecallRecords,
  listVocabularySetLibrary,
  listVocabularyStudents,
  listVocabularyPrograms,
  listVocabularySets,
  renameVocabularySet,
  restoreVocabularyDictationRecord,
  restoreVocabularyMeaningRecallRecord,
  revokeVocabularyDictationTaskShare,
  revokeVocabularyShare,
  setVocabularyProgressStart,
  shareVocabularyDictationTask,
  shareVocabularySet,
  undoVocabularyReviewDecision,
  updateStudentVocabularyWordFlag,
  updateVocabularyDictationRecord,
  updateVocabularyMeaningRecallRecord,
  voidVocabularyDictationRecord,
  voidVocabularyMeaningRecallRecord,
} from './vocabularyStore.mjs'

const VOCABULARY_MATERIAL_KINDS = ['cards', 'dictation', 'answer', 'word-search', 'handwriting']
const HENGSHUI_FONT_BYTES = readFileSync(new URL('./assets/shuyao-hengshui.ttf', import.meta.url))

function decodePathPart(raw) {
  try {
    return decodeURIComponent(raw)
  } catch {
    throw new VocabularyStoreError('路径参数无效。')
  }
}

function readQueryPart(request, name) {
  const value = new URL(request.url ?? '/', 'http://localhost').searchParams.get(name)
  if (!value) throw new VocabularyStoreError(`${name}不能为空。`)
  return value
}

function readQuery(request) {
  return new URL(request.url ?? '/', 'http://localhost').searchParams
}

function readOptionalQueryPart(request, name) {
  return new URL(request.url ?? '/', 'http://localhost').searchParams.get(name)?.trim() || null
}

function sendVocabularyError(response, context, error) {
  if (error instanceof VocabularyStoreError) {
    context.sendJson(response, error.status, { error: error.code, message: error.message })
    return
  }
  throw error
}

function withUserDb(context, readOnly, callback) {
  const db = context.openUserDatabase({ readOnly })
  try {
    return callback(db)
  } finally {
    db.close()
  }
}

function withBankDb(context, readOnly, callback) {
  const db = context.openDatabase({ readOnly })
  try {
    return callback(db)
  } finally {
    db.close()
  }
}

function withVocabularyDbs(context, callback) {
  const userDb = context.openUserDatabase({ readOnly: false })
  const bankDb = context.openDatabase({ readOnly: true })
  try {
    return callback({ userDb, bankDb })
  } finally {
    bankDb.close()
    userDb.close()
  }
}

function sendVocabularyPdf(response, body, fileName) {
  response.writeHead(200, {
    'content-disposition': `attachment; filename="vocabulary-sheet.pdf"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    'content-type': 'application/pdf',
    'x-file-name': encodeURIComponent(fileName),
  })
  response.end(body)
}

function sendVocabularyZipHeaders(response, fileName) {
  response.writeHead(200, {
    'content-disposition': `attachment; filename="vocabulary-review-materials.zip"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    'content-type': 'application/zip',
    'x-file-name': encodeURIComponent(fileName),
  })
}

function isVocabularyMaterialKind(kind) {
  return VOCABULARY_MATERIAL_KINDS.includes(kind)
}

function readVocabularyMaterialKinds(input) {
  const kinds = Array.isArray(input.kinds)
    ? [...new Set(input.kinds.map((value) => String(value ?? '').trim()).filter(Boolean))]
    : []
  if (!kinds.length || kinds.some((kind) => !isVocabularyMaterialKind(kind))) {
    throw new VocabularyStoreError('资料包类型无效。', 400, 'invalid_vocabulary_bundle_kinds')
  }
  return kinds
}

function selectVocabularyPrintEntries(payload, rawEntryIds) {
  if (!Array.isArray(rawEntryIds)) return payload
  const selectedEntryIds = [...new Set(rawEntryIds.map((value) => String(value ?? '').trim()).filter(Boolean))]
  if (!selectedEntryIds.length || selectedEntryIds.length > 3000) {
    throw new VocabularyStoreError('练字纸必须选择1–3000个单词。', 400, 'invalid_vocabulary_handwriting_selection')
  }
  const requested = new Set(selectedEntryIds)
  const sourceEntries = payload.vocabularySet.entries
  const seen = new Set()
  const selectedEntries = sourceEntries.filter((entry) => {
    if (!requested.has(entry.id) || seen.has(entry.id)) return false
    seen.add(entry.id)
    return true
  })
  if (selectedEntries.length !== requested.size) {
    throw new VocabularyStoreError('练字纸所选单词不属于当前资料。', 400, 'invalid_vocabulary_handwriting_entries')
  }
  const sourceSections = payload.sections?.length
    ? payload.sections
    : [{ startIndex: 0, title: payload.vocabularySet.title }]
  const sections = []
  let activeTitle = null
  const sectioned = new Set()
  sourceEntries.forEach((entry, sourceIndex) => {
    if (!requested.has(entry.id) || sectioned.has(entry.id)) return
    sectioned.add(entry.id)
    const sourceSection = [...sourceSections].reverse().find((section) => section.startIndex <= sourceIndex)
    const title = sourceSection?.title || payload.vocabularySet.title
    if (title !== activeTitle) {
      activeTitle = title
      sections.push({ startIndex: selectedEntries.findIndex((selected) => selected.id === entry.id), title })
    }
  })
  return {
    ...payload,
    vocabularySet: {
      ...payload.vocabularySet,
      entryCount: selectedEntries.length,
      entries: selectedEntries,
    },
    sections,
  }
}

function buildVocabularySetPrintPayload(vocabularySet, accent) {
  return {
    vocabularySet,
    sections: [{ startIndex: 0, title: vocabularySet.title }],
    accent,
    materialLayout: 'dedupe',
  }
}

function readVocabularyHandwritingMode(rawMode) {
  if (rawMode === undefined || rawMode === null || rawMode === '') return 'standard'
  if (rawMode === 'standard' || rawMode === 'single') return rawMode
  throw new VocabularyStoreError('练字方式无效。', 400, 'invalid_vocabulary_handwriting_mode')
}

async function readOptionalVocabularyPrintOptions(request, context) {
  if (!String(request.headers['content-type'] ?? '').includes('application/json')) {
    return { selectedEntryIds: null, handwritingMode: 'standard' }
  }
  const input = await context.readJsonBody(request, { maxBytes: 100_000 })
  return {
    selectedEntryIds: input.selectedEntryIds,
    handwritingMode: readVocabularyHandwritingMode(input.handwritingMode),
  }
}

function vocabularyPdfFileName(title, entryCount, accent, kind = 'cards', handwritingMode = 'standard') {
  const safeTitle = String(title ?? '')
    .replace(/[\\/:*?"<>|]/gu, ' ')
    .replace(/[\p{Cc}\p{Cf}]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, 60) || '生词记忆纸'
  const countSuffix = new RegExp(`${entryCount}\\s*词$`, 'u').test(safeTitle) ? '' : `-${entryCount}词`
  const exportTitle = safeTitle
    .replace(new RegExp(`[·\\s-]*${entryCount}\\s*词$`, 'u'), '')
    .trim() || '生词组'
  if (kind === 'answer') return `${exportTitle}-教师答案-${entryCount}词.pdf`
  if (kind === 'dictation') {
    return `${exportTitle}-听写纸-${entryCount}词-${accent === 'american' ? '美式' : '英式'}.pdf`
  }
  if (kind === 'word-search') return `${exportTitle}-圈词与拼写-${entryCount}词.pdf`
  if (kind === 'handwriting') {
    return `${exportTitle}-衡水体练字纸${handwritingMode === 'single' ? '-每词1遍' : ''}-${entryCount}词.pdf`
  }
  return `${safeTitle}${countSuffix}-${accent === 'american' ? '美式' : '英式'}.pdf`
}

function expectedVocabularyPrintPages(entryCount, kind, handwritingMode = 'standard') {
  if (kind === 'word-search') return Math.ceil(entryCount / 10) * 2
  if (kind === 'cards') return Math.ceil(entryCount / 6)
  if (kind === 'handwriting') return Math.ceil(entryCount / (handwritingMode === 'single' ? 10 : 7))
  return Math.ceil(entryCount / 15)
}

async function streamVocabularyMaterialBundle({
  request,
  response,
  context,
  userId,
  payloads,
  kinds,
  zipFileName,
}) {
  sendVocabularyZipHeaders(response, zipFileName)
  const archive = archiver('zip', { zlib: { level: 9 } })
  let activePrintJobId = null
  let archiveError = null
  let clientDisconnected = false
  archive.once('error', (error) => { archiveError = error })
  response.once('close', () => {
    if (response.writableEnded) return
    clientDisconnected = true
    archive.abort()
  })
  archive.on('warning', (warning) => {
    if (warning.code !== 'ENOENT') archive.emit('error', warning)
  })
  archive.pipe(response)
  try {
    renderMaterials:
    for (const payload of payloads) {
      for (const kind of kinds) {
        if (clientDisconnected) break renderMaterials
        if (archiveError) throw archiveError
        activePrintJobId = createVocabularyPrintJob(userId, {
          ...payload,
          kind,
          shareKind: kind === 'cards' ? 'listen' : kind === 'dictation' ? 'dictation' : null,
        })
        try {
          const hasQr = payload.vocabularySet.share?.status === 'active' && ['cards', 'dictation'].includes(kind)
          const result = await context.renderVocabularySetPdf({
            cookie: request.headers.cookie ?? '',
            printJobId: activePrintJobId,
            accent: payload.accent,
            kind,
            expectedPageCount: payload.materialLayout === 'grouped'
              ? undefined
              : expectedVocabularyPrintPages(payload.vocabularySet.entryCount, kind),
            expectedQrCount: hasQr ? 1 : 0,
          })
          if (clientDisconnected) break renderMaterials
          if (archiveError) throw archiveError
          archive.append(Buffer.from(result.pdfBytes), {
            name: vocabularyPdfFileName(
              payload.vocabularySet.title,
              payload.vocabularySet.entryCount,
              payload.accent,
              kind,
            ),
          })
        } finally {
          deleteVocabularyPrintJob(activePrintJobId)
          activePrintJobId = null
        }
      }
    }
    if (clientDisconnected) return
    if (archiveError) throw archiveError
    await archive.finalize()
  } catch (error) {
    if (activePrintJobId) deleteVocabularyPrintJob(activePrintJobId)
    throw error
  }
}

export function createVocabularyRoutes() {
  return [
    defineRoute('GET', /^\/api\/vocabulary\/programs$/, ({ request, response, context }) => {
      const programs = withBankDb(context, true, (db) => listVocabularyPrograms(db))
      const studentId = readOptionalQueryPart(request, 'studentId')
      if (!studentId) {
        context.sendJson(response, 200, { programs })
        return
      }
      const userId = context.resolveDataUserId(context)
      try {
        const programsWithProgress = withUserDb(context, true, (db) => programs.map((program) => ({
          ...program,
          progress: getVocabularyProgress(db, userId, studentId, program.id),
        })))
        context.sendJson(response, 200, { programs: programsWithProgress })
      } catch (error) {
        sendVocabularyError(response, context, error)
      }
    }),

    defineRoute('GET', /^\/api\/vocabulary\/programs\/([^/]+)$/, ({ response, match, context }) => {
      const programId = decodePathPart(match[1])
      const program = withBankDb(context, true, (db) => getVocabularyProgram(db, programId))
      if (!program) {
        context.sendJson(response, 404, { error: 'program_not_found' })
        return
      }
      context.sendJson(response, 200, { program })
    }),

    defineRoute('GET', /^\/api\/vocabulary\/students$/, ({ response, context }) => {
      const userId = context.resolveDataUserId(context)
      try {
        const students = withUserDb(context, false, (db) => listVocabularyStudents(db, userId))
        context.sendJson(response, 200, { students })
      } catch (error) {
        sendVocabularyError(response, context, error)
      }
    }),

    defineRoute('POST', /^\/api\/vocabulary\/students$/, async ({ request, response, context }) => {
      const userId = context.resolveDataUserId(context)
      const input = await context.readJsonBody(request, { maxBytes: 10_000 })
      try {
        const student = withUserDb(context, false, (db) => createVocabularyStudent(db, userId, input))
        context.sendJson(response, 201, { student })
      } catch (error) {
        sendVocabularyError(response, context, error)
      }
    }),

    defineRoute('GET', /^\/api\/vocabulary\/progress\/([^/]+)$/, ({ request, response, match, context }) => {
      const userId = context.resolveDataUserId(context)
      const programId = decodePathPart(match[1])
      try {
        const studentId = readQueryPart(request, 'studentId')
        const progress = withUserDb(context, true, (db) => getVocabularyProgress(db, userId, studentId, programId))
        context.sendJson(response, 200, { progress })
      } catch (error) {
        sendVocabularyError(response, context, error)
      }
    }),

    defineRoute('PATCH', /^\/api\/vocabulary\/progress\/([^/]+)$/, async ({ request, response, match, context }) => {
      const userId = context.resolveDataUserId(context)
      const programId = decodePathPart(match[1])
      const input = await context.readJsonBody(request, { maxBytes: 10_000 })
      try {
        const result = withVocabularyDbs(context, (dbs) => setVocabularyProgressStart(dbs, userId, {
          ...input,
          programId,
        }))
        context.sendJson(response, 200, result)
      } catch (error) {
        sendVocabularyError(response, context, error)
      }
    }),

    defineRoute('POST', /^\/api\/vocabulary\/review-runs$/, async ({ request, response, context }) => {
      const userId = context.resolveDataUserId(context)
      const input = await context.readJsonBody(request, { maxBytes: 20_000 })
      try {
        const reviewRun = withVocabularyDbs(context, (dbs) => createVocabularyReviewRun(dbs, userId, input))
        context.sendJson(response, 201, { reviewRun })
      } catch (error) {
        sendVocabularyError(response, context, error)
      }
    }),

    defineRoute('GET', /^\/api\/vocabulary\/review-runs\/current$/, ({ request, response, context }) => {
      const userId = context.resolveDataUserId(context)
      try {
        const studentId = readQueryPart(request, 'studentId')
        const programId = readQueryPart(request, 'programId')
        const reviewRun = withUserDb(context, true, (db) =>
          getCurrentVocabularyReviewRun(db, userId, studentId, programId))
        context.sendJson(response, 200, { reviewRun })
      } catch (error) {
        sendVocabularyError(response, context, error)
      }
    }),

    defineRoute('GET', /^\/api\/vocabulary\/review-runs\/([^/]+)$/, ({ response, match, context }) => {
      const userId = context.resolveDataUserId(context)
      try {
        const result = withUserDb(context, true, (db) => {
          const reviewRun = getVocabularyReviewRun(db, userId, decodePathPart(match[1]))
          const vocabularySet = reviewRun.status === 'frozen'
            ? getVocabularySetForReviewRun(db, userId, reviewRun.id)
            : null
          return { reviewRun, vocabularySet }
        })
        context.sendJson(response, 200, result)
      } catch (error) {
        sendVocabularyError(response, context, error)
      }
    }),

    defineRoute('DELETE', /^\/api\/vocabulary\/review-runs\/([^/]+)$/, ({ response, match, context }) => {
      const userId = context.resolveDataUserId(context)
      try {
        const result = withUserDb(context, false, (db) =>
          discardVocabularyReviewRun(db, userId, decodePathPart(match[1])))
        context.sendJson(response, 200, result)
      } catch (error) {
        sendVocabularyError(response, context, error)
      }
    }),

    defineRoute('PATCH', /^\/api\/vocabulary\/review-runs\/([^/]+)\/decision$/, async ({ request, response, match, context }) => {
      const userId = context.resolveDataUserId(context)
      const input = await context.readJsonBody(request, { maxBytes: 10_000 })
      try {
        const reviewRun = withVocabularyDbs(context, (dbs) =>
          decideVocabularyReviewEntry(dbs, userId, decodePathPart(match[1]), input))
        context.sendJson(response, 200, { reviewRun })
      } catch (error) {
        sendVocabularyError(response, context, error)
      }
    }),

    defineRoute('POST', /^\/api\/vocabulary\/review-runs\/([^/]+)\/undo$/, ({ response, match, context }) => {
      const userId = context.resolveDataUserId(context)
      try {
        const reviewRun = withVocabularyDbs(context, (dbs) =>
          undoVocabularyReviewDecision(dbs, userId, decodePathPart(match[1])))
        context.sendJson(response, 200, { reviewRun })
      } catch (error) {
        sendVocabularyError(response, context, error)
      }
    }),

    defineRoute('POST', /^\/api\/vocabulary\/review-runs\/([^/]+)\/freeze$/, async ({ request, response, match, context }) => {
      const userId = context.resolveDataUserId(context)
      const input = await context.readJsonBody(request, { maxBytes: 20_000 })
      try {
        const vocabularySet = withVocabularyDbs(context, (dbs) =>
          freezeVocabularySet(dbs, userId, decodePathPart(match[1]), input))
        context.sendJson(response, 201, { vocabularySet })
      } catch (error) {
        sendVocabularyError(response, context, error)
      }
    }),

    defineRoute('GET', /^\/api\/vocabulary\/set-library$/, ({ request, response, context }) => {
      const userId = context.resolveDataUserId(context)
      const query = readQuery(request)
      try {
        const library = withUserDb(context, false, (db) => listVocabularySetLibrary(db, userId, {
          studentId: query.get('studentId'),
          programId: query.get('programId') ?? 'wanwei-round-one-v1',
          page: query.get('page'),
          pageSize: query.get('pageSize'),
          query: query.get('query'),
          from: query.get('from'),
          to: query.get('to'),
        }))
        context.sendJson(response, 200, { library })
      } catch (error) {
        sendVocabularyError(response, context, error)
      }
    }),

    defineRoute('GET', /^\/api\/vocabulary\/print-jobs\/([^/]+)$/, ({ response, match, context }) => {
      const userId = context.resolveDataUserId(context)
      const printJob = readVocabularyPrintJob(userId, decodePathPart(match[1]))
      if (!printJob) {
        context.sendJson(response, 404, { error: 'vocabulary_print_job_not_found', message: '打印请求已过期，请重新生成。' })
        return
      }
      context.sendJson(response, 200, { printJob })
    }),

    defineRoute('GET', /^\/api\/vocabulary\/print-assets\/hengshui\.ttf$/, ({ response, context }) => {
      context.resolveDataUserId(context)
      response.writeHead(200, {
        'cache-control': 'private, max-age=86400',
        'content-length': HENGSHUI_FONT_BYTES.length,
        'content-type': 'font/ttf',
      })
      response.end(HENGSHUI_FONT_BYTES)
    }),

    defineRoute('POST', /^\/api\/vocabulary\/combined-pdf$/, async ({ request, response, context }) => {
      const userId = context.resolveDataUserId(context)
      const input = await context.readJsonBody(request, { maxBytes: 100_000 })
      const accent = input.accent
      const kind = input.kind
      const handwritingMode = readVocabularyHandwritingMode(input.handwritingMode)
      if (accent !== 'american' && accent !== 'british') {
        context.sendJson(response, 400, { error: 'invalid_vocabulary_accent', message: '合并打印必须选择英式或美式。' })
        return
      }
      if (!isVocabularyMaterialKind(kind)) {
        context.sendJson(response, 400, { error: 'invalid_vocabulary_pdf_kind', message: '下载类型无效。' })
        return
      }
      let printJobId = null
      try {
        const payload = selectVocabularyPrintEntries(
          withUserDb(context, false, (db) => buildCombinedVocabularyPrintPayload(db, userId, input)),
          input.selectedEntryIds,
        )
        printJobId = createVocabularyPrintJob(userId, { ...payload, accent, kind, handwritingMode })
        const result = await context.renderVocabularySetPdf({
          cookie: request.headers.cookie ?? '',
          printJobId,
          accent,
          kind,
          expectedPageCount: input.mode === 'grouped'
            ? undefined
            : expectedVocabularyPrintPages(payload.vocabularySet.entryCount, kind, handwritingMode),
          expectedQrCount: 0,
        })
        sendVocabularyPdf(
          response,
          result.pdfBytes,
          vocabularyPdfFileName(payload.vocabularySet.title, payload.vocabularySet.entryCount, accent, kind, handwritingMode),
        )
      } catch (error) {
        sendVocabularyError(response, context, error)
      } finally {
        if (printJobId) deleteVocabularyPrintJob(printJobId)
      }
    }),

    defineRoute('POST', /^\/api\/vocabulary\/combined-materials\.zip$/, async ({ request, response, context }) => {
      const userId = context.resolveDataUserId(context)
      const input = await context.readJsonBody(request, { maxBytes: 100_000 })
      if (input.accent !== 'american' && input.accent !== 'british') {
        context.sendJson(response, 400, { error: 'invalid_vocabulary_accent', message: '资料包必须选择英式或美式。' })
        return
      }
      try {
        const kinds = readVocabularyMaterialKinds(input)
        const payload = withUserDb(context, false, (db) => buildCombinedVocabularyPrintPayload(db, userId, input))
        const zipFileName = `${String(payload.vocabularySet.title || '生词合集').replace(/[\\/:*?"<>|]/gu, ' ')}-全套资料.zip`
        await streamVocabularyMaterialBundle({
          request,
          response,
          context,
          userId,
          payloads: [{ ...payload, accent: input.accent }],
          kinds,
          zipFileName,
        })
      } catch (error) {
        if (response.headersSent) response.destroy(error instanceof Error ? error : new Error('生词资料包生成失败。'))
        else sendVocabularyError(response, context, error)
      }
    }),

    defineRoute('GET', /^\/api\/vocabulary\/dictation-tasks$/, ({ request, response, context }) => {
      const userId = context.resolveDataUserId(context)
      const query = readQuery(request)
      try {
        const tasks = withUserDb(context, false, (db) => listVocabularyDictationTasks(
          db,
          userId,
          readQueryPart(request, 'studentId'),
          { limit: query.get('limit') },
        ))
        context.sendJson(response, 200, { tasks })
      } catch (error) {
        sendVocabularyError(response, context, error)
      }
    }),

    defineRoute('POST', /^\/api\/vocabulary\/dictation-tasks$/, async ({ request, response, context }) => {
      const userId = context.resolveDataUserId(context)
      const input = await context.readJsonBody(request, { maxBytes: 80_000 })
      try {
        const task = withVocabularyDbs(context, (dbs) => createVocabularyDictationTask(dbs, userId, input))
        context.sendJson(response, 201, { task })
      } catch (error) {
        sendVocabularyError(response, context, error)
      }
    }),

    defineRoute('POST', /^\/api\/vocabulary\/dictation-tasks\/from-set-errors$/, async ({ request, response, context }) => {
      const userId = context.resolveDataUserId(context)
      const input = await context.readJsonBody(request, { maxBytes: 40_000 })
      try {
        const tasks = withVocabularyDbs(context, (dbs) => createVocabularySetErrorTasks(dbs, userId, input))
        context.sendJson(response, 201, { tasks })
      } catch (error) {
        sendVocabularyError(response, context, error)
      }
    }),

    defineRoute('GET', /^\/api\/vocabulary\/meaning-recall-records$/, ({ request, response, context }) => {
      const userId = context.resolveDataUserId(context)
      const query = readQuery(request)
      try {
        const records = withUserDb(context, false, (db) => listVocabularyMeaningRecallRecords(
          db,
          userId,
          readQueryPart(request, 'studentId'),
          { limit: query.get('limit') },
        ))
        context.sendJson(response, 200, { records })
      } catch (error) {
        sendVocabularyError(response, context, error)
      }
    }),

    defineRoute('POST', /^\/api\/vocabulary\/meaning-recall-records$/, async ({ request, response, context }) => {
      const userId = context.resolveDataUserId(context)
      const input = await context.readJsonBody(request, { maxBytes: 100_000 })
      try {
        const record = withUserDb(context, false, (userDb) => createVocabularyMeaningRecallRecord(
          { userDb },
          userId,
          input,
        ))
        context.sendJson(response, 201, { record })
      } catch (error) {
        sendVocabularyError(response, context, error)
      }
    }),

    defineRoute('GET', /^\/api\/vocabulary\/meaning-recall-records\/([^/]+)$/, ({ response, match, context }) => {
      const userId = context.resolveDataUserId(context)
      try {
        const record = withUserDb(context, false, (db) => getVocabularyMeaningRecallRecord(
          db,
          userId,
          decodePathPart(match[1]),
        ))
        context.sendJson(response, 200, { record })
      } catch (error) {
        sendVocabularyError(response, context, error)
      }
    }),

    defineRoute('PATCH', /^\/api\/vocabulary\/meaning-recall-records\/([^/]+)$/, async ({ request, response, match, context }) => {
      const userId = context.resolveDataUserId(context)
      const input = await context.readJsonBody(request, { maxBytes: 100_000 })
      try {
        const record = withUserDb(context, false, (db) => updateVocabularyMeaningRecallRecord(
          db,
          userId,
          decodePathPart(match[1]),
          input,
        ))
        context.sendJson(response, 200, { record })
      } catch (error) {
        sendVocabularyError(response, context, error)
      }
    }),

    defineRoute('POST', /^\/api\/vocabulary\/meaning-recall-records\/([^/]+)\/void$/, ({ response, match, context }) => {
      const userId = context.resolveDataUserId(context)
      try {
        const record = withUserDb(context, false, (db) => voidVocabularyMeaningRecallRecord(
          db,
          userId,
          decodePathPart(match[1]),
        ))
        context.sendJson(response, 200, { record })
      } catch (error) {
        sendVocabularyError(response, context, error)
      }
    }),

    defineRoute('POST', /^\/api\/vocabulary\/meaning-recall-records\/([^/]+)\/restore$/, ({ response, match, context }) => {
      const userId = context.resolveDataUserId(context)
      try {
        const record = withUserDb(context, false, (db) => restoreVocabularyMeaningRecallRecord(
          db,
          userId,
          decodePathPart(match[1]),
        ))
        context.sendJson(response, 200, { record })
      } catch (error) {
        sendVocabularyError(response, context, error)
      }
    }),

    defineRoute('GET', /^\/api\/vocabulary\/meaning-review-states$/, ({ request, response, context }) => {
      const userId = context.resolveDataUserId(context)
      const query = readQuery(request)
      try {
        const states = withUserDb(context, false, (db) => getStudentVocabularyMeaningStates(
          db,
          userId,
          readQueryPart(request, 'studentId'),
          query.get('programId') ?? 'wanwei-round-one-v1',
        ))
        context.sendJson(response, 200, { states })
      } catch (error) {
        sendVocabularyError(response, context, error)
      }
    }),

    defineRoute('GET', /^\/api\/vocabulary\/meaning-review-suggestion$/, ({ request, response, context }) => {
      const userId = context.resolveDataUserId(context)
      const query = readQuery(request)
      try {
        const entries = withUserDb(context, false, (db) => getSuggestedVocabularyMeaningRecall(
          db,
          userId,
          readQueryPart(request, 'studentId'),
          query.get('programId') ?? 'wanwei-round-one-v1',
          query.get('target'),
        ))
        context.sendJson(response, 200, { entries })
      } catch (error) {
        sendVocabularyError(response, context, error)
      }
    }),

    defineRoute('GET', /^\/api\/vocabulary\/dictation-tasks\/([^/]+)$/, ({ response, match, context }) => {
      const userId = context.resolveDataUserId(context)
      try {
        const task = withUserDb(context, false, (db) => getVocabularyDictationTask(db, userId, decodePathPart(match[1])))
        context.sendJson(response, 200, { task })
      } catch (error) {
        sendVocabularyError(response, context, error)
      }
    }),

    defineRoute('POST', /^\/api\/vocabulary\/dictation-tasks\/([^/]+)\/pdf$/, async ({ request, response, match, context }) => {
      const userId = context.resolveDataUserId(context)
      const kind = readQuery(request).get('kind') ?? 'dictation'
      if (!isVocabularyMaterialKind(kind)) {
        context.sendJson(response, 400, { error: 'invalid_vocabulary_pdf_kind', message: '下载类型无效。' })
        return
      }
      let printJobId = null
      try {
        const { selectedEntryIds, handwritingMode } = await readOptionalVocabularyPrintOptions(request, context)
        const payload = selectVocabularyPrintEntries(
          withUserDb(context, false, (db) => buildVocabularyDictationTaskPrintPayload(
            db,
            userId,
            decodePathPart(match[1]),
          )),
          selectedEntryIds,
        )
        printJobId = createVocabularyPrintJob(userId, {
          ...payload,
          kind,
          handwritingMode,
          shareKind: kind === 'cards' ? 'listen' : kind === 'dictation' ? 'dictation' : null,
        })
        const hasQr = payload.vocabularySet.share?.status === 'active' && ['cards', 'dictation'].includes(kind)
        const result = await context.renderVocabularySetPdf({
          cookie: request.headers.cookie ?? '',
          printJobId,
          accent: payload.accent,
          kind,
          expectedPageCount: payload.materialLayout === 'grouped'
            ? undefined
            : expectedVocabularyPrintPages(payload.vocabularySet.entryCount, kind, handwritingMode),
          expectedQrCount: hasQr ? 1 : 0,
        })
        sendVocabularyPdf(
          response,
          result.pdfBytes,
          vocabularyPdfFileName(payload.vocabularySet.title, payload.vocabularySet.entryCount, payload.accent, kind, handwritingMode),
        )
      } catch (error) {
        sendVocabularyError(response, context, error)
      } finally {
        if (printJobId) deleteVocabularyPrintJob(printJobId)
      }
    }),

    defineRoute('POST', /^\/api\/vocabulary\/dictation-task-materials\.zip$/, async ({ request, response, context }) => {
      const userId = context.resolveDataUserId(context)
      const input = await context.readJsonBody(request, { maxBytes: 40_000 })
      const taskIds = Array.isArray(input.taskIds)
        ? [...new Set(input.taskIds.map((value) => String(value ?? '').trim()).filter(Boolean))]
        : []
      if (!taskIds.length || taskIds.length > 30) {
        context.sendJson(response, 400, { error: 'invalid_vocabulary_bundle_tasks', message: '资料包必须包含1–30份听写任务。' })
        return
      }
      try {
        const kinds = readVocabularyMaterialKinds(input)
        const payloads = withUserDb(context, false, (db) => taskIds.map((taskId) => (
          buildVocabularyDictationTaskPrintPayload(db, userId, taskId)
        )))
        const studentIds = new Set(payloads.map((payload) => payload.vocabularySet.studentId))
        if (studentIds.size !== 1) {
          throw new VocabularyStoreError('资料包中的听写任务必须属于同一名学生。', 409, 'vocabulary_bundle_student_mismatch')
        }
        const firstTitle = payloads[0].vocabularySet.title.replace(/（\d+\/\d+）$/u, '').trim()
        const zipFileName = `${firstTitle || '错词复听写'}-资料.zip`
        await streamVocabularyMaterialBundle({ request, response, context, userId, payloads, kinds, zipFileName })
      } catch (error) {
        if (response.headersSent) {
          response.destroy(error instanceof Error ? error : new Error('错词资料包生成失败。'))
        } else {
          sendVocabularyError(response, context, error)
        }
      }
    }),

    defineRoute('POST', /^\/api\/vocabulary\/dictation-tasks\/([^/]+)\/share$/, ({ response, match, context }) => {
      const userId = context.resolveDataUserId(context)
      try {
        const share = withUserDb(context, false, (db) => shareVocabularyDictationTask(db, userId, decodePathPart(match[1])))
        context.sendJson(response, 200, { share })
      } catch (error) {
        sendVocabularyError(response, context, error)
      }
    }),

    defineRoute('DELETE', /^\/api\/vocabulary\/dictation-tasks\/([^/]+)\/share$/, ({ response, match, context }) => {
      const userId = context.resolveDataUserId(context)
      try {
        const share = withUserDb(context, false, (db) => revokeVocabularyDictationTaskShare(db, userId, decodePathPart(match[1])))
        context.sendJson(response, 200, { share })
      } catch (error) {
        sendVocabularyError(response, context, error)
      }
    }),

    defineRoute('POST', /^\/api\/vocabulary\/dictation-tasks\/([^/]+)\/records$/, async ({ request, response, match, context }) => {
      const userId = context.resolveDataUserId(context)
      const input = await context.readJsonBody(request, { maxBytes: 100_000 })
      try {
        const record = withUserDb(context, false, (db) => createVocabularyDictationRecord(
          db,
          userId,
          decodePathPart(match[1]),
          input,
        ))
        context.sendJson(response, 201, { record })
      } catch (error) {
        sendVocabularyError(response, context, error)
      }
    }),

    defineRoute('GET', /^\/api\/vocabulary\/dictation-records$/, ({ request, response, context }) => {
      const userId = context.resolveDataUserId(context)
      const query = readQuery(request)
      try {
        const records = withUserDb(context, false, (db) => listVocabularyDictationRecords(
          db,
          userId,
          readQueryPart(request, 'studentId'),
          { limit: query.get('limit') },
        ))
        context.sendJson(response, 200, { records })
      } catch (error) {
        sendVocabularyError(response, context, error)
      }
    }),

    defineRoute('GET', /^\/api\/vocabulary\/dictation-records\/([^/]+)$/, ({ response, match, context }) => {
      const userId = context.resolveDataUserId(context)
      try {
        const record = withUserDb(context, false, (db) => getVocabularyDictationRecord(db, userId, decodePathPart(match[1])))
        context.sendJson(response, 200, { record })
      } catch (error) {
        sendVocabularyError(response, context, error)
      }
    }),

    defineRoute('PATCH', /^\/api\/vocabulary\/dictation-records\/([^/]+)$/, async ({ request, response, match, context }) => {
      const userId = context.resolveDataUserId(context)
      const input = await context.readJsonBody(request, { maxBytes: 100_000 })
      try {
        const record = withUserDb(context, false, (db) => updateVocabularyDictationRecord(
          db,
          userId,
          decodePathPart(match[1]),
          input,
        ))
        context.sendJson(response, 200, { record })
      } catch (error) {
        sendVocabularyError(response, context, error)
      }
    }),

    defineRoute('POST', /^\/api\/vocabulary\/dictation-records\/([^/]+)\/void$/, ({ response, match, context }) => {
      const userId = context.resolveDataUserId(context)
      try {
        const record = withUserDb(context, false, (db) => voidVocabularyDictationRecord(db, userId, decodePathPart(match[1])))
        context.sendJson(response, 200, { record })
      } catch (error) {
        sendVocabularyError(response, context, error)
      }
    }),

    defineRoute('POST', /^\/api\/vocabulary\/dictation-records\/([^/]+)\/restore$/, ({ response, match, context }) => {
      const userId = context.resolveDataUserId(context)
      try {
        const record = withUserDb(context, false, (db) => restoreVocabularyDictationRecord(db, userId, decodePathPart(match[1])))
        context.sendJson(response, 200, { record })
      } catch (error) {
        sendVocabularyError(response, context, error)
      }
    }),

    defineRoute('GET', /^\/api\/vocabulary\/review-states$/, ({ request, response, context }) => {
      const userId = context.resolveDataUserId(context)
      const query = readQuery(request)
      try {
        const states = withUserDb(context, false, (db) => getStudentVocabularyReviewStates(
          db,
          userId,
          readQueryPart(request, 'studentId'),
          query.get('programId') ?? 'wanwei-round-one-v1',
        ))
        context.sendJson(response, 200, { states })
      } catch (error) {
        sendVocabularyError(response, context, error)
      }
    }),

    defineRoute('GET', /^\/api\/vocabulary\/review-suggestion$/, ({ request, response, context }) => {
      const userId = context.resolveDataUserId(context)
      const query = readQuery(request)
      try {
        const entries = withUserDb(context, false, (db) => getSuggestedVocabularyReview(
          db,
          userId,
          readQueryPart(request, 'studentId'),
          query.get('programId') ?? 'wanwei-round-one-v1',
          query.get('target'),
        ))
        context.sendJson(response, 200, { entries })
      } catch (error) {
        sendVocabularyError(response, context, error)
      }
    }),

    defineRoute('PATCH', /^\/api\/vocabulary\/review-states\/([^/]+)\/flag$/, async ({ request, response, match, context }) => {
      const userId = context.resolveDataUserId(context)
      const input = await context.readJsonBody(request, { maxBytes: 10_000 })
      try {
        const flag = withUserDb(context, false, (db) => updateStudentVocabularyWordFlag(
          db,
          userId,
          input.studentId,
          input.programId ?? 'wanwei-round-one-v1',
          decodePathPart(match[1]),
          input,
        ))
        context.sendJson(response, 200, { flag })
      } catch (error) {
        sendVocabularyError(response, context, error)
      }
    }),

    defineRoute('GET', /^\/api\/vocabulary\/sets$/, ({ request, response, context }) => {
      const userId = context.resolveDataUserId(context)
      try {
        const studentId = readQueryPart(request, 'studentId')
        const programId = readQueryPart(request, 'programId')
        const vocabularySets = withUserDb(context, true, (db) => listVocabularySets(db, userId, studentId, programId))
        context.sendJson(response, 200, { vocabularySets })
      } catch (error) {
        sendVocabularyError(response, context, error)
      }
    }),

    defineRoute('POST', /^\/api\/vocabulary\/sets$/, async ({ request, response, context }) => {
      const userId = context.resolveDataUserId(context)
      const input = await context.readJsonBody(request, { maxBytes: 20_000 })
      try {
        const vocabularySet = withVocabularyDbs(context, (dbs) =>
          createVocabularySetFromEntries(dbs, userId, input))
        context.sendJson(response, 201, { vocabularySet })
      } catch (error) {
        sendVocabularyError(response, context, error)
      }
    }),

    defineRoute('GET', /^\/api\/vocabulary\/sets\/([^/]+)$/, ({ response, match, context }) => {
      const userId = context.resolveDataUserId(context)
      try {
        const vocabularySet = withUserDb(context, true, (db) => getVocabularySet(db, userId, decodePathPart(match[1])))
        context.sendJson(response, 200, { vocabularySet })
      } catch (error) {
        sendVocabularyError(response, context, error)
      }
    }),

    defineRoute('PATCH', /^\/api\/vocabulary\/sets\/([^/]+)$/, async ({ request, response, match, context }) => {
      const userId = context.resolveDataUserId(context)
      const input = await context.readJsonBody(request, { maxBytes: 10_000 })
      try {
        const vocabularySet = withUserDb(context, false, (db) =>
          renameVocabularySet(db, userId, decodePathPart(match[1]), input))
        context.sendJson(response, 200, { vocabularySet })
      } catch (error) {
        sendVocabularyError(response, context, error)
      }
    }),

    defineRoute('POST', /^\/api\/vocabulary\/sets\/([^/]+)\/pdf$/, async ({ request, response, match, context }) => {
      const userId = context.resolveDataUserId(context)
      const searchParams = new URL(request.url ?? '/', 'http://localhost').searchParams
      const accent = searchParams.get('accent')
      const kind = searchParams.get('kind') ?? 'cards'
      if (accent !== 'american' && accent !== 'british') {
        context.sendJson(response, 400, { error: 'invalid_vocabulary_accent', message: '单词纸音标必须选择英式或美式。' })
        return
      }
      if (!isVocabularyMaterialKind(kind)) {
        context.sendJson(response, 400, { error: 'invalid_vocabulary_pdf_kind', message: '下载类型无效。' })
        return
      }
      let printJobId = null
      try {
        const vocabularySet = withUserDb(context, true, (db) =>
          getVocabularySet(db, userId, decodePathPart(match[1])))
        if ((kind === 'cards' || kind === 'dictation') && vocabularySet.share?.status !== 'active') {
          throw new VocabularyStoreError(
            '请先生成二维码，再下载带二维码的单词资料。',
            409,
            'vocabulary_share_required',
          )
        }
        const { selectedEntryIds, handwritingMode } = await readOptionalVocabularyPrintOptions(request, context)
        const payload = selectVocabularyPrintEntries(buildVocabularySetPrintPayload(vocabularySet, accent), selectedEntryIds)
        if (selectedEntryIds || handwritingMode !== 'standard') {
          printJobId = createVocabularyPrintJob(userId, {
            ...payload,
            kind,
            handwritingMode,
            shareKind: kind === 'cards' ? 'listen' : kind === 'dictation' ? 'dictation' : null,
          })
        }
        const result = await context.renderVocabularySetPdf({
          cookie: request.headers.cookie ?? '',
          ...(printJobId ? { printJobId } : { setId: vocabularySet.id }),
          accent,
          kind,
          expectedPageCount: expectedVocabularyPrintPages(payload.vocabularySet.entryCount, kind, handwritingMode),
        })
        sendVocabularyPdf(
          response,
          result.pdfBytes,
          vocabularyPdfFileName(payload.vocabularySet.title, payload.vocabularySet.entryCount, accent, kind, handwritingMode),
        )
      } catch (error) {
        sendVocabularyError(response, context, error)
      } finally {
        if (printJobId) deleteVocabularyPrintJob(printJobId)
      }
    }),

    defineRoute('POST', /^\/api\/vocabulary\/sets\/([^/]+)\/materials\.zip$/, async ({ request, response, match, context }) => {
      const userId = context.resolveDataUserId(context)
      const input = await context.readJsonBody(request, { maxBytes: 40_000 })
      if (input.accent !== 'american' && input.accent !== 'british') {
        context.sendJson(response, 400, { error: 'invalid_vocabulary_accent', message: '资料包必须选择英式或美式。' })
        return
      }
      try {
        const kinds = readVocabularyMaterialKinds(input)
        const vocabularySet = withUserDb(context, true, (db) =>
          getVocabularySet(db, userId, decodePathPart(match[1])))
        if (kinds.some((kind) => ['cards', 'dictation'].includes(kind)) && vocabularySet.share?.status !== 'active') {
          throw new VocabularyStoreError(
            '请先生成二维码，再下载全套资料。',
            409,
            'vocabulary_share_required',
          )
        }
        const payload = buildVocabularySetPrintPayload(vocabularySet, input.accent)
        const safeTitle = String(vocabularySet.title || '生词组').replace(/[\\/:*?"<>|]/gu, ' ')
        await streamVocabularyMaterialBundle({
          request,
          response,
          context,
          userId,
          payloads: [payload],
          kinds,
          zipFileName: `${safeTitle}-全套资料.zip`,
        })
      } catch (error) {
        if (response.headersSent) response.destroy(error instanceof Error ? error : new Error('生词资料包生成失败。'))
        else sendVocabularyError(response, context, error)
      }
    }),

    defineRoute('POST', /^\/api\/vocabulary\/sets\/([^/]+)\/share$/, ({ response, match, context }) => {
      const userId = context.resolveDataUserId(context)
      try {
        const share = withUserDb(context, false, (db) => shareVocabularySet(db, userId, decodePathPart(match[1])))
        context.sendJson(response, 200, { share })
      } catch (error) {
        sendVocabularyError(response, context, error)
      }
    }),

    defineRoute('DELETE', /^\/api\/vocabulary\/sets\/([^/]+)\/share$/, ({ response, match, context }) => {
      const userId = context.resolveDataUserId(context)
      try {
        const share = withUserDb(context, false, (db) => revokeVocabularyShare(db, userId, decodePathPart(match[1])))
        context.sendJson(response, 200, { share })
      } catch (error) {
        sendVocabularyError(response, context, error)
      }
    }),

    defineRoute('GET', /^\/api\/public\/vocabulary\/listen\/([^/]+)$/, ({ response, match, context }) => {
      const result = withUserDb(context, true, (db) => getPublicVocabularyListenResource(db, decodePathPart(match[1])))
      if (result.status === 'not_found') {
        context.sendJson(response, 404, { error: 'vocabulary_share_not_found' })
        return
      }
      if (result.status === 'revoked') {
        context.sendJson(response, 410, { error: 'vocabulary_share_revoked' })
        return
      }
      context.sendJson(response, 200, { vocabularySet: result.set })
    }),

    defineRoute('GET', /^\/api\/public\/vocabulary\/dictation\/([^/]+)$/, ({ response, match, context }) => {
      const result = withUserDb(context, true, (db) => getPublicVocabularyDictationResource(db, decodePathPart(match[1])))
      if (result.status === 'not_found') {
        context.sendJson(response, 404, { error: 'vocabulary_share_not_found' })
        return
      }
      if (result.status === 'revoked') {
        context.sendJson(response, 410, { error: 'vocabulary_share_revoked' })
        return
      }
      context.sendJson(response, 200, { vocabularySet: result.set })
    }),
  ]
}
