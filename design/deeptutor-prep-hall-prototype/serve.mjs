/**
 * PROTOTYPE server — throwaway. Ticket 05 prep-hall layouts.
 * Run: pnpm -C app prototype:prep-hall
 */
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))
const port = Number(process.env.PREP_HALL_PROTO_PORT || 4177)

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${port}`)
  if (url.pathname !== '/' && url.pathname !== '/index.html') {
    res.writeHead(404)
    res.end()
    return
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
  res.end(readFileSync(join(dir, 'index.html')))
})

server.listen(port, '127.0.0.1', () => {
  console.log(`PROTOTYPE prep-hall  http://127.0.0.1:${port}/?variant=A`)
})
