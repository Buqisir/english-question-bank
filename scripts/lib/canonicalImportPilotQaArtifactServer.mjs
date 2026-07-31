import { lstatSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'

import {
  assertCanonicalImportPilotEvidenceRoot,
} from './canonicalImportPilotEvidenceRoot.mjs'

const artifactDefinitions = {
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

export async function startCanonicalImportPilotQaArtifactServer({
  repositoryRoot,
  head,
}) {
  if (!/^[0-9a-f]{40}$/.test(head)) {
    throw new Error(`Invalid QA artifact HEAD: ${head}`)
  }
  const artifactDir = path.resolve(
    repositoryRoot,
    '.scratch/paper-canonical-ticket-20-qa',
    head,
  )
  assertCanonicalImportPilotEvidenceRoot({
    repositoryRoot,
    rootDir: artifactDir,
    expectedHead: head,
  })
  const artifacts = Object.fromEntries(
    Object.entries(artifactDefinitions).map(([artifactId, definition]) => {
      const filePath = path.resolve(artifactDir, definition.fileName)
      if (
        path.dirname(filePath) !== artifactDir
        || !lstatSync(filePath).isFile()
      ) {
        throw new Error(
          `QA artifact is not a file in the HEAD-scoped directory: ${
            definition.fileName
          }`,
        )
      }
      return [artifactId, {
        ...definition,
        bytes: readFileSync(filePath),
        pathname:
          `/qa-artifacts/${head}/${encodeURIComponent(definition.fileName)}`,
      }]
    }),
  )
  const artifactsByPath = new Map(
    Object.values(artifacts).map((artifact) => [artifact.pathname, artifact]),
  )
  const server = createServer((request, response) => {
    if (!['GET', 'HEAD'].includes(request.method || '')) {
      response.writeHead(405, { allow: 'GET, HEAD' })
      response.end()
      return
    }
    const pathname = String(request.url || '').split('?', 1)[0]
    const artifact = artifactsByPath.get(pathname)
    if (!artifact) {
      response.writeHead(404, {
        'cache-control': 'no-store',
        'content-type': 'text/plain; charset=utf-8',
        'x-content-type-options': 'nosniff',
      })
      response.end('Not Found\n')
      return
    }
    response.writeHead(200, {
      'cache-control': 'no-store',
      'content-length': artifact.bytes.length,
      'content-type': artifact.contentType,
      'x-content-type-options': 'nosniff',
    })
    response.end(request.method === 'HEAD' ? undefined : artifact.bytes)
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject)
      resolve()
    })
  })
  const address = server.address()
  if (!address || typeof address === 'string') {
    server.close()
    throw new Error('QA artifact server did not bind an IPv4 localhost port')
  }
  const baseUrl = `http://127.0.0.1:${address.port}`
  return {
    artifactDir,
    baseUrl,
    urls: Object.fromEntries(
      Object.entries(artifacts).map(([artifactId, artifact]) => [
        artifactId,
        new URL(artifact.pathname, baseUrl).href,
      ]),
    ),
    isListening: () => server.listening,
    close: () => new Promise((resolve, reject) => {
      if (!server.listening) {
        resolve()
        return
      }
      server.close((error) => {
        if (error) reject(error)
        else resolve()
      })
    }),
  }
}

export async function runCanonicalImportPilotQaSession({
  startArtifactServer = startCanonicalImportPilotQaArtifactServer,
  artifactServerOptions,
  closeRenderedServices,
  run,
}) {
  let qaArtifactServer
  try {
    qaArtifactServer = await startArtifactServer(artifactServerOptions)
    return await run(qaArtifactServer)
  } finally {
    try {
      await qaArtifactServer?.close()
    } finally {
      await closeRenderedServices()
    }
  }
}
