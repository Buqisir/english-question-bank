import {
  createMySpaceFolder,
  deleteMySpaceArtifact,
  deleteMySpaceFolder,
  listMySpace,
  renameMySpaceFolder,
  resolveMySpaceArtifactForDownload,
  saveMySpaceArtifact,
} from './mySpace.mjs'
import { defineRoute } from '../router/index.mjs'

function routeError(error) {
  return error instanceof Error ? error.message : String(error)
}

function sendMySpaceArtifactStatic(response, urlPath, context) {
  const match = urlPath.match(/^\/user-space\/files\/([^/]+)\.pdf$/)
  if (!match) {
    context.sendJson(response, 400, { error: 'Invalid user-space path' })
    return
  }
  let artifactId
  try {
    artifactId = decodeURIComponent(match[1])
  } catch {
    context.sendJson(response, 400, { error: 'Invalid artifact id' })
    return
  }
  if (!/^artifact-[a-z0-9-]+$/i.test(artifactId)) {
    context.sendJson(response, 400, { error: 'Invalid artifact id' })
    return
  }
  // M0-4 (docs/cuts/m0-4-user-scope/plan.md decision 8): this route previously only
  // validated the artifactId's shape (any syntactically valid id could be
  // downloaded by anyone who guessed/observed it). resolveMySpaceArtifactForDownload
  // now scopes the row lookup to userId — an unmatched (id, user_id) returns null,
  // which this route reports as the same 404 as "does not exist" (no existence leak).
  const userId = context.resolveDataUserId(context)
  const db = context.openUserDatabase({ readOnly: true })
  try {
    const artifact = resolveMySpaceArtifactForDownload(db, userId, context.userSpaceFilesDir, artifactId)
    if (!artifact) {
      context.sendJson(response, 404, { error: 'PDF file not found' })
      return
    }
    response.writeHead(200, {
      'access-control-allow-origin': '*',
      'content-disposition': `inline; filename="${encodeURIComponent(artifact.fileName)}"; filename*=UTF-8''${encodeURIComponent(artifact.fileName)}`,
      'content-type': 'application/pdf',
      'x-file-name': encodeURIComponent(artifact.fileName),
    })
    response.end(artifact.body)
  } finally {
    db.close()
  }
}

export function createMySpaceRoutes() {
  return [
    defineRoute('GET', /^\/user-space\/files\/[^/]+\.pdf$/, ({ response, url, context }) => {
      sendMySpaceArtifactStatic(response, url.pathname, context)
    }),

    defineRoute('GET', /^\/api\/my-space$/, ({ response, url, context }) => {
      const userId = context.resolveDataUserId(context)
      const db = context.openUserDatabase({ readOnly: true })
      try {
        context.sendJson(response, 200, listMySpace(db, userId, { folderId: url.searchParams.get('folderId') }))
      } finally {
        db.close()
      }
    }),

    defineRoute('GET', /^\/api\/my-space\/folders$/, ({ response, context }) => {
      const userId = context.resolveDataUserId(context)
      const db = context.openUserDatabase({ readOnly: true })
      try {
        const snapshot = listMySpace(db, userId)
        context.sendJson(response, 200, { folders: snapshot.folders })
      } finally {
        db.close()
      }
    }),

    defineRoute('GET', /^\/api\/my-space\/artifacts$/, ({ response, url, context }) => {
      const userId = context.resolveDataUserId(context)
      const db = context.openUserDatabase({ readOnly: true })
      try {
        const snapshot = listMySpace(db, userId, { folderId: url.searchParams.get('folderId') })
        context.sendJson(response, 200, { artifacts: snapshot.artifacts })
      } finally {
        db.close()
      }
    }),

    defineRoute('POST', /^\/api\/my-space\/folders$/, async ({ request, response, context }) => {
      const userId = context.resolveDataUserId(context)
      const input = await context.readJsonBody(request, { maxBytes: 100_000 })
      const db = context.openUserDatabase({ readOnly: false })
      try {
        const folder = createMySpaceFolder(db, userId, input)
        context.sendJson(response, 201, { folder })
      } catch (error) {
        context.sendJson(response, 400, { error: routeError(error) })
      } finally {
        db.close()
      }
    }),

    defineRoute('PATCH', /^\/api\/my-space\/folders\/([^/]+)$/, async ({ request, response, match, context }) => {
      const userId = context.resolveDataUserId(context)
      const input = await context.readJsonBody(request, { maxBytes: 100_000 })
      const db = context.openUserDatabase({ readOnly: false })
      try {
        const folder = renameMySpaceFolder(db, userId, decodeURIComponent(match[1]), input)
        context.sendJson(response, 200, { folder })
      } catch (error) {
        context.sendJson(response, 400, { error: routeError(error) })
      } finally {
        db.close()
      }
    }),

    defineRoute('DELETE', /^\/api\/my-space\/folders\/([^/]+)$/, ({ response, match, context }) => {
      const userId = context.resolveDataUserId(context)
      const db = context.openUserDatabase({ readOnly: false })
      try {
        context.sendJson(response, 200, deleteMySpaceFolder(db, userId, decodeURIComponent(match[1])))
      } catch (error) {
        context.sendJson(response, 400, { error: routeError(error) })
      } finally {
        db.close()
      }
    }),

    defineRoute('POST', /^\/api\/my-space\/artifacts$/, async ({ request, response, context }) => {
      // M0-4 (docs/cuts/m0-4-user-scope/plan.md decision 3, PA MF-3): this route
      // exports a draft to PDF and then saves it as an artifact — a two-store
      // collaboration where the folderId-ownership check lives inside
      // saveMySpaceArtifact, and the exportDraftPaperPdf call is the "borrow
      // someone else's draftId through the export path" vector PA flagged. Both
      // must receive the SAME resolved userId; B supplying A's draftPaperId must
      // 404 out of exportDraftPaperPdf before saveMySpaceArtifact is ever reached.
      const userId = context.resolveDataUserId(context)
      const input = await context.readJsonBody(request, { maxBytes: 500_000 })
      const draftPaperId = String(input.draftPaperId || '').trim()
      let result = null
      try {
        result = context.draftPaperStore.exportDraftPaperPdf(userId, draftPaperId, { preferRecent: true })
        const db = context.openUserDatabase({ readOnly: false })
        try {
          const artifact = saveMySpaceArtifact(db, userId, {
            filesRoot: context.userSpaceFilesDir,
            draftPaper: result.draftPaper,
            pdfBody: result.body,
            sourcePdfPath: result.outputPath,
            folderId: input.folderId,
            fileName: input.fileName,
          })
          context.draftPaperStore.clearRecentDraftPdfExport(draftPaperId, result.outputPath)
          context.sendJson(response, 201, { artifact, reusedRecentPdf: result.reusedRecent === true })
        } finally {
          db.close()
        }
      } catch (error) {
        context.draftPaperStore.clearRecentDraftPdfExport(draftPaperId, result?.outputPath)
        const message = routeError(error)
        // M0-4 (PA MF-3 / plan.md verification 2): check draft-not-found/not-owned
        // BEFORE the generic 'not found' substring match — otherwise B borrowing A's
        // draftPaperId here would incorrectly get 503 "精排 PDF 不可用" instead of the
        // 404 the plan requires for this exact exfiltration vector.
        if (message === 'Draft paper not found') {
          context.sendJson(response, 404, { error: message })
        } else if (message.includes('vivliostyle') || message.includes('not found') || message.includes('ENOENT')) {
          context.sendJson(response, 503, { error: `精排 PDF 不可用: ${message}` })
        } else {
          context.sendJson(response, 400, { error: message })
        }
      }
    }),

    defineRoute('DELETE', /^\/api\/my-space\/artifacts\/([^/]+)$/, ({ response, match, context }) => {
      // M0-4 (docs/cuts/m0-4-user-scope/plan.md verification 2): "B uses A's
      // artifactId" must 404 here, matching the download route's 404 for the same
      // case — deleteMySpaceArtifact throws the same '文件不存在' message whether
      // the id is genuinely unknown or just not owned by this userId.
      const userId = context.resolveDataUserId(context)
      const db = context.openUserDatabase({ readOnly: false })
      try {
        context.sendJson(response, 200, deleteMySpaceArtifact(db, userId, context.userSpaceFilesDir, decodeURIComponent(match[1])))
      } catch (error) {
        const message = routeError(error)
        if (message === '文件不存在') {
          context.sendJson(response, 404, { error: message })
        } else {
          context.sendJson(response, 400, { error: message })
        }
      } finally {
        db.close()
      }
    }),
  ]
}
