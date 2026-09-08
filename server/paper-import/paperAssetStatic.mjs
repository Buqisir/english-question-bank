import { createReadStream, existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import path from 'node:path'
import { listPaperAssetVersions } from './storage.mjs'

// Called only after the existing authenticated paper-assets gate.
export function sendPaperAssetStatic(request, response, urlPath, paperAssetsDir) {
  const fail = (status, error) => {
    response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
    response.end(JSON.stringify({ error }))
  }
  let relativePath
  try { relativePath = decodeURIComponent(urlPath.replace(/^\/paper-assets\/?/, '')) }
  catch { return fail(400, 'Invalid paper asset path') }
  if (!relativePath || relativePath.includes('..') || relativePath.includes('\\') || path.isAbsolute(relativePath)) {
    return fail(400, 'Invalid paper asset path')
  }
  const audio = /^[a-z0-9][a-z0-9._-]*\/versions\/v[1-9]\d*\/listening\/playback\.mp3$/.test(relativePath)
  if (!audio && (/\.(?:mp3|wav|m4a)$/i.test(relativePath) || /(?:^|\/)(?:listening-audio|asr-v1|check-v1)/.test(relativePath))) {
    return fail(404, 'Paper asset file not found')
  }
  let filePath = path.resolve(paperAssetsDir, relativePath)
  if (!existsSync(filePath)) {
    const parts = relativePath.split('/')
    if (parts.length > 2 && parts[1] === 'latest') {
      const versions = listPaperAssetVersions(paperAssetsDir, parts[0])
      if (versions.length) filePath = path.resolve(paperAssetsDir, parts[0], 'versions', `v${versions.at(-1)}`, ...parts.slice(2))
    }
  }
  if (!existsSync(filePath)) return fail(404, 'Paper asset file not found')
  const root = realpathSync(paperAssetsDir)
  filePath = realpathSync(filePath)
  if (!filePath.startsWith(`${root}${path.sep}`) || !statSync(filePath).isFile()) return fail(404, 'Paper asset file not found')
  if (!audio) {
    const ext = path.extname(filePath).toLowerCase()
    response.writeHead(200, {
      'content-type': ext === '.json' ? 'application/json; charset=utf-8'
        : ext === '.docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          : 'application/octet-stream',
    })
    response.end(request.method === 'HEAD' ? undefined : readFileSync(filePath))
    return
  }
  const size = statSync(filePath).size
  let start = 0
  let end = size - 1
  const range = request.headers.range
  if (range !== undefined) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range)
    if (match && (match[1] || match[2])) {
      if (match[1]) {
        start = Number(match[1])
        end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1
      } else {
        const suffix = Number(match[2])
        start = suffix > 0 ? Math.max(size - suffix, 0) : size
      }
    } else start = size
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || start > end) {
      response.writeHead(416, { 'content-range': `bytes */${size}`, 'accept-ranges': 'bytes' })
      response.end()
      return
    }
  }
  response.writeHead(range === undefined ? 200 : 206, {
    'content-type': 'audio/mpeg',
    'content-length': end - start + 1,
    'accept-ranges': 'bytes',
    'cache-control': 'private, max-age=31536000, immutable',
    'x-content-type-options': 'nosniff',
    ...(range === undefined ? {} : { 'content-range': `bytes ${start}-${end}/${size}` }),
  })
  if (request.method === 'HEAD') return response.end()
  const stream = createReadStream(filePath, { start, end })
  stream.on('error', () => response.destroy())
  response.on('close', () => stream.destroy())
  stream.pipe(response)
}
