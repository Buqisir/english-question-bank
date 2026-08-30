#!/usr/bin/env node

import { createServer } from 'node:http'
import path from 'node:path'

import { buildNck1ReviewProjection } from '../../server/import-review/revisionProjection.mjs'

const paperId = process.argv[2]
const port = Number(process.env.PORT || process.argv[3])

if (!/^paper-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(paperId || '')) {
  throw new Error('Usage: nck1-candidate-preview-server.mjs <paperId> with PORT set')
}
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('Candidate preview server requires a valid PORT')
}

const paperDir = path.join(import.meta.dirname, 'papers', paperId)
const projection = buildNck1ReviewProjection(paperDir)

function sendJson(response, status, body) {
  response.writeHead(status, {
    'access-control-allow-origin': '*',
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
  })
  response.end(`${JSON.stringify(body)}\n`)
}

createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`)
  if (url.pathname === '/api/health') {
    sendJson(response, 200, { ok: true, paperId, mode: 'candidate-preview' })
    return
  }
  if (
    url.pathname === '/api/paper-canonical/consumption'
    && url.searchParams.get('paperId') === paperId
  ) {
    sendJson(response, 200, projection.consumption)
    return
  }
  if (
    url.pathname === `/paper-assets/${paperId}/latest/paper-asset.json`
    || url.pathname === `/paper-assets/${paperId}/paper-asset.json`
  ) {
    sendJson(response, 200, projection.paperAsset)
    return
  }
  sendJson(response, 404, { error: 'Candidate preview resource not found' })
}).listen(port, '127.0.0.1', () => {
  console.log(`NCK1 Candidate consumer preview API listening on ${port} for ${paperId}`)
})
