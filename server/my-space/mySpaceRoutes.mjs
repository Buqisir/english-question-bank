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
  const db = context.openUserDatabase({ readOnly: true })
  try {
    const artifact = resolveMySpaceArtifactForDownload(db, context.userSpaceFilesDir, artifactId)
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
      const db = context.openUserDatabase({ readOnly: true })
      try {
        context.sendJson(response, 200, listMySpace(db, { folderId: url.searchParams.get('folderId') }))
      } finally {
        db.close()
      }
    }),

    defineRoute('GET', /^\/api\/my-space\/folders$/, ({ response, context }) => {
      const db = context.openUserDatabase({ readOnly: true })
      try {
        const snapshot = listMySpace(db)
        context.sendJson(response, 200, { folders: snapshot.folders })
      } finally {
        db.close()
      }
    }),

    defineRoute('GET', /^\/api\/my-space\/artifacts$/, ({ response, url, context }) => {
      const db = context.openUserDatabase({ readOnly: true })
      try {
        const snapshot = listMySpace(db, { folderId: url.searchParams.get('folderId') })
        context.sendJson(response, 200, { artifacts: snapshot.artifacts })
      } finally {
        db.close()
      }
    }),

    defineRoute('POST', /^\/api\/my-space\/folders$/, async ({ request, response, context }) => {
      const input = await context.readJsonBody(request, { maxBytes: 100_000 })
      const db = context.openUserDatabase({ readOnly: false })
      try {
        const folder = createMySpaceFolder(db, input)
        context.sendJson(response, 201, { folder })
      } catch (error) {
        context.sendJson(response, 400, { error: routeError(error) })
      } finally {
        db.close()
      }
    }),

    defineRoute('PATCH', /^\/api\/my-space\/folders\/([^/]+)$/, async ({ request, response, match, context }) => {
      const input = await context.readJsonBody(request, { maxBytes: 100_000 })
      const db = context.openUserDatabase({ readOnly: false })
      try {
        const folder = renameMySpaceFolder(db, decodeURIComponent(match[1]), input)
        context.sendJson(response, 200, { folder })
      } catch (error) {
        context.sendJson(response, 400, { error: routeError(error) })
      } finally {
        db.close()
      }
    }),

    defineRoute('DELETE', /^\/api\/my-space\/folders\/([^/]+)$/, ({ response, match, context }) => {
      const db = context.openUserDatabase({ readOnly: false })
      try {
        context.sendJson(response, 200, deleteMySpaceFolder(db, decodeURIComponent(match[1])))
      } catch (error) {
        context.sendJson(response, 400, { error: routeError(error) })
      } finally {
        db.close()
      }
    }),

    defineRoute('POST', /^\/api\/my-space\/artifacts$/, async ({ request, response, context }) => {
      const input = await context.readJsonBody(request, { maxBytes: 500_000 })
      const draftPaperId = String(input.draftPaperId || '').trim()
      let result = null
      try {
        result = context.draftPaperStore.exportDraftPaperPdf(draftPaperId, { preferRecent: true })
        const db = context.openUserDatabase({ readOnly: false })
        try {
          const artifact = saveMySpaceArtifact(db, {
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
        if (message.includes('vivliostyle') || message.includes('not found') || message.includes('ENOENT')) {
          context.sendJson(response, 503, { error: `精排 PDF 不可用: ${message}` })
        } else {
          context.sendJson(response, 400, { error: message })
        }
      }
    }),

    defineRoute('DELETE', /^\/api\/my-space\/artifacts\/([^/]+)$/, ({ response, match, context }) => {
      const db = context.openUserDatabase({ readOnly: false })
      try {
        context.sendJson(response, 200, deleteMySpaceArtifact(db, context.userSpaceFilesDir, decodeURIComponent(match[1])))
      } catch (error) {
        context.sendJson(response, 400, { error: routeError(error) })
      } finally {
        db.close()
      }
    }),
  ]
}
