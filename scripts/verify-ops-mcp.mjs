#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const opsDir = path.join(rootDir, 'ops-mcp')
if (!existsSync(path.join(opsDir, 'node_modules', '@modelcontextprotocol', 'sdk'))) {
  const install = spawnSync('npm', ['ci'], { cwd: opsDir, stdio: 'inherit' })
  if (install.status !== 0) process.exit(install.status ?? 1)
}
const result = spawnSync(process.execPath, [path.join(opsDir, 'verify.mjs')], {
  cwd: opsDir,
  stdio: 'inherit',
})
process.exit(result.status ?? 1)
