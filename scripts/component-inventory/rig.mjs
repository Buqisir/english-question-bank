#!/usr/bin/env node
// 构件清点用的本地网站：临时数据库 + 固定测试数据 + 一个 owner 账号 + 带标记的 Vite。
// 标记：清点时给每个原生 JSX 元素加 data-inv="文件:行:列"（和 static.mjs 的 id 一样），
// 这样页面上拍到的每个元素都能对回源码。只在这个脚本启动的服务里加，不改网站代码和正式构建。
//
// 用法：node scripts/component-inventory/rig.mjs        （前台运行，Ctrl-C 结束）
// 端口：网页 5299，接口 9912；账号 owner / inventory-owner-pw-1
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { ROOT, APP, SRC, RAW, rel, isExcluded, requireFromApp, resolveFromApp, HOST_WRAPPERS } from './lib.mjs'

// 两份同时跑（重跑核对）时用 INVENTORY_PORT_OFFSET 错开端口
const OFF = Number(process.env.INVENTORY_PORT_OFFSET || 0)
export const WEB_PORT = 5299 + OFF
export const API_PORT = 9912 + OFF
export const OWNER = { username: 'owner', password: 'inventory-owner-pw-1' }

const ts = requireFromApp('typescript')

export function instrumentPlugin() {
  return {
    name: 'eqb-component-inventory-instrument',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0]
      if (!file.endsWith('.tsx') || !file.startsWith(SRC)) return null
      const r = rel(file)
      if (isExcluded(r)) return null
      const sf = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
      const inserts = []
      const visit = (n) => {
        if ((ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) && (/^[a-z]/.test(n.tagName.getText(sf)) || n.tagName.getText(sf) in HOST_WRAPPERS)) {
          const { line, character } = sf.getLineAndCharacterOfPosition(n.getStart(sf))
          inserts.push([n.tagName.end, ` data-inv="${r}:${line + 1}:${character + 1}"`])
        }
        ts.forEachChild(n, visit)
      }
      visit(sf)
      if (!inserts.length) return null
      let out = code
      for (const [pos, s] of inserts.sort((a, b) => b[0] - a[0])) out = out.slice(0, pos) + s + out.slice(pos)
      return { code: out, map: null }
    },
  }
}

export async function startRig({ quiet = false } = {}) {
  const tmp = path.join(RAW, OFF ? `rigdata-${OFF}` : 'rigdata')
  rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp, { recursive: true })
  const db = path.join(tmp, 'qb.sqlite'), udb = path.join(tmp, 'ud.sqlite'), assets = path.join(tmp, 'assets')
  const { seedConfirmedCanonicalDraftFixture } = await import(pathToFileURL(path.join(ROOT, 'scripts/lib/canonicalDraftE2eFixture.mjs')).href)
  seedConfirmedCanonicalDraftFixture({ repositoryRoot: ROOT, bankDbPath: db, paperAssetsDir: assets,
    groupIds: ['group-2026-i-reading-a', 'group-2026-i-reading-b', 'group-2026-i-reading-c', 'group-2026-i-reading-d'] })
  const u = spawnSync('node', ['scripts/create-user.mjs', '--username', OWNER.username, '--password', OWNER.password, '--role', 'owner'],
    { cwd: ROOT, env: { ...process.env, USER_DATA_DB: udb }, encoding: 'utf8' })
  if (u.status !== 0) throw new Error('create-user failed: ' + u.stderr)
  const env = { ...process.env, QUESTION_BANK_DB: db, USER_DATA_DB: udb, QUESTION_BANK_PAPER_ASSET_ROOT: assets, QUESTION_BANK_API_PORT: String(API_PORT) }
  // detached：接口自己会再起浏览器出 PDF，结束时整组一起杀掉，不留孤儿进程
  const api = spawn('node', ['server/api.mjs'], { cwd: ROOT, env, stdio: quiet ? 'ignore' : 'inherit', detached: true })
  process.env.QUESTION_BANK_API_PORT = String(API_PORT) // app/vite.config.ts 读它来配接口代理
  const vite = await import(pathToFileURL(resolveFromApp('vite')).href)
  const server = await vite.createServer({
    configFile: path.join(APP, 'vite.config.ts'), root: APP, logLevel: quiet ? 'error' : 'info',
    plugins: [instrumentPlugin()],
    server: { host: '127.0.0.1', port: WEB_PORT, strictPort: true, watch: { ignored: () => true }, hmr: false }, // 只拍照：不监听文件、不热更新（Vite 8 里 watch: null 仍会监听，实测两万多个）
  })
  await server.listen()
  // 等接口起来
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`http://127.0.0.1:${API_PORT}/api/health`); if (r.status < 500) break } catch {}
    await new Promise((r) => setTimeout(r, 500))
  }
  const stop = async () => { try { process.kill(-api.pid, 'SIGKILL') } catch {} await server.close() }
  process.on('exit', () => { try { process.kill(-api.pid, 'SIGKILL') } catch {} })
  return { base: `http://127.0.0.1:${WEB_PORT}`, stop }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const rig = await startRig()
  console.log('rig ready', rig.base)
  const bye = async () => { await rig.stop(); process.exit(0) }
  process.on('SIGINT', bye); process.on('SIGTERM', bye)
}
