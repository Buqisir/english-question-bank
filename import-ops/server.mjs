#!/usr/bin/env node
/**
 * Same-origin local shell for the hosted Import Review Workbench.
 * /ops/ serves this package; all app and API requests proxy to EQB_APP_ORIGIN.
 * It does not publish, deploy, or touch production.
 */
import { createServer, request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const appOrigin = new URL(process.env.EQB_APP_ORIGIN || 'http://127.0.0.1:5173')
const host = '127.0.0.1'
const port = Number(process.env.IMPORT_OPS_PORT || 8790)
const publicDir = path.join(import.meta.dirname, 'public')

function send(response, status, body, headers = {}) {
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
    ...headers,
  })
  response.end(body)
}

function serveOps(response, pathname) {
  const relativePath = pathname === '/ops/'
    ? 'index.html'
    : pathname.slice('/ops/'.length)
  if (!relativePath || relativePath.includes('/') || relativePath.includes('\\')) {
    send(response, 404, 'not found', { 'content-type': 'text/plain; charset=utf-8' })
    return
  }
  const filePath = path.join(publicDir, relativePath)
  if (!existsSync(filePath)) {
    send(response, 404, 'not found', { 'content-type': 'text/plain; charset=utf-8' })
    return
  }
  const contentType = relativePath.endsWith('.js')
    ? 'text/javascript; charset=utf-8'
    : relativePath.endsWith('.css')
      ? 'text/css; charset=utf-8'
      : 'text/html; charset=utf-8'
  send(response, 200, readFileSync(filePath), { 'content-type': contentType })
}

function proxy(request, response) {
  const target = new URL(request.url || '/', appOrigin)
  const client = target.protocol === 'https:' ? httpsRequest : httpRequest
  const upstream = client(target, {
    method: request.method,
    headers: {
      ...request.headers,
      host: target.host,
    },
  }, (upstreamResponse) => {
    response.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.headers)
    upstreamResponse.pipe(response)
  })
  upstream.on('error', (error) => {
    if (response.headersSent) {
      response.destroy(error)
      return
    }
    send(response, 502, `upstream unavailable: ${error.message}`, {
      'content-type': 'text/plain; charset=utf-8',
    })
  })
  request.pipe(upstream)
}

const server = createServer((request, response) => {
  const url = new URL(request.url || '/', `http://${host}:${port}`)
  if (url.pathname === '/ops') {
    response.writeHead(308, { location: '/ops/' })
    response.end()
    return
  }
  if (request.method === 'GET' && url.pathname.startsWith('/ops/')) {
    serveOps(response, url.pathname)
    return
  }
  proxy(request, response)
})

server.listen(port, host, () => {
  console.log(`导题审核 http://${host}:${port}/ops/`)
  console.log(`same-origin app/API proxy -> ${appOrigin.origin}`)
  console.log('no publish, no deployment, no production mutation')
})
