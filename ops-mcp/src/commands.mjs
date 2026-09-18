import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { FIXED_COMMAND_TIMEOUT_MS } from './config.mjs'

const execFileAsync = promisify(execFile)

export async function runFixed(bin, args, { timeout = FIXED_COMMAND_TIMEOUT_MS, cwd } = {}) {
  const { stdout, stderr } = await execFileAsync(bin, args, {
    timeout,
    encoding: 'utf8',
    cwd,
    maxBuffer: 1024 * 1024,
  })
  return { stdout: String(stdout || ''), stderr: String(stderr || '') }
}
