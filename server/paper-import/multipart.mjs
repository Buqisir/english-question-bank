import busboy from 'busboy'
import { PAPER_IMPORT_LIMITS } from './validator.mjs'

export function parsePaperImportMultipart(request, options = {}) {
  const limits = options.limits || PAPER_IMPORT_LIMITS
  return new Promise((resolve, reject) => {
    const files = []
    const fields = {}
    let totalBytes = 0
    let settled = false

    function fail(error) {
      if (settled) return
      settled = true
      reject(error)
    }

    const parser = busboy({
      headers: request.headers,
      limits: {
        files: limits.maxFiles,
        fileSize: limits.maxFileBytes,
        parts: limits.maxFiles + 20,
      },
    })

    parser.on('field', (name, value) => {
      fields[name] = value
    })

    parser.on('file', (_name, stream, info) => {
      const chunks = []
      let size = 0
      const fileName = info.filename || ''
      const contentType = info.mimeType || ''

      stream.on('data', (chunk) => {
        size += chunk.byteLength
        totalBytes += chunk.byteLength
        if (totalBytes > limits.maxTotalBytes) {
          fail(new Error('试卷包总大小超过 20MB。'))
          stream.resume()
          return
        }
        chunks.push(chunk)
      })

      stream.on('limit', () => {
        fail(new Error(`${fileName} 超过 5MB。`))
      })

      stream.on('error', fail)
      stream.on('end', () => {
        files.push({
          fileName,
          contentType,
          buffer: Buffer.concat(chunks, size),
        })
      })
    })

    parser.on('filesLimit', () => fail(new Error(`最多允许 ${limits.maxFiles} 个文件。`)))
    parser.on('error', fail)
    parser.on('finish', () => {
      if (settled) return
      settled = true
      resolve({ files, fields })
    })

    request.pipe(parser)
  })
}
