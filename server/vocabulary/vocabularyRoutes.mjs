import { defineRoute } from '../router/index.mjs'
import {
  VocabularyStoreError,
  createVocabularyStudent,
  createVocabularyReviewRun,
  createVocabularySetFromEntries,
  decideVocabularyReviewEntry,
  discardVocabularyReviewRun,
  freezeVocabularySet,
  getPublicVocabularyDictationShare,
  getCurrentVocabularyReviewRun,
  getPublicVocabularyShare,
  getVocabularyProgram,
  getVocabularyProgress,
  getVocabularyReviewRun,
  getVocabularySet,
  getVocabularySetForReviewRun,
  listVocabularyStudents,
  listVocabularySets,
  renameVocabularySet,
  revokeVocabularyShare,
  setVocabularyProgressStart,
  shareVocabularySet,
  undoVocabularyReviewDecision,
} from './vocabularyStore.mjs'

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

function vocabularyPdfFileName(title, entryCount, accent, kind = 'cards') {
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
  return `${safeTitle}${countSuffix}-${accent === 'american' ? '美式' : '英式'}.pdf`
}

export function createVocabularyRoutes() {
  return [
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

    defineRoute('GET', /^\/api\/vocabulary\/sets$/, ({ request, response, context }) => {
      const userId = context.resolveDataUserId(context)
      try {
        const studentId = readQueryPart(request, 'studentId')
        const vocabularySets = withUserDb(context, true, (db) => listVocabularySets(db, userId, studentId))
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
      if (!['cards', 'dictation', 'answer'].includes(kind)) {
        context.sendJson(response, 400, { error: 'invalid_vocabulary_pdf_kind', message: '下载类型无效。' })
        return
      }
      try {
        const vocabularySet = withUserDb(context, true, (db) =>
          getVocabularySet(db, userId, decodePathPart(match[1])))
        if (kind !== 'answer' && vocabularySet.share?.status !== 'active') {
          throw new VocabularyStoreError(
            '请先生成扫码听写，再下载带二维码的单词纸。',
            409,
            'vocabulary_share_required',
          )
        }
        const result = await context.renderVocabularySetPdf({
          cookie: request.headers.cookie ?? '',
          setId: vocabularySet.id,
          accent,
          kind,
          expectedPageCount: Math.ceil(vocabularySet.entryCount / (kind === 'cards' ? 6 : 15)),
        })
        sendVocabularyPdf(
          response,
          result.pdfBytes,
          vocabularyPdfFileName(vocabularySet.title, vocabularySet.entryCount, accent, kind),
        )
      } catch (error) {
        sendVocabularyError(response, context, error)
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
      const result = withUserDb(context, true, (db) => getPublicVocabularyShare(db, decodePathPart(match[1])))
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
      const result = withUserDb(context, true, (db) => getPublicVocabularyDictationShare(db, decodePathPart(match[1])))
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
