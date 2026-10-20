import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execute = promisify(execFile)
const terminated = new WeakSet()

// ps reports resident KiB on both Linux and macOS. Include every descendant,
// including external parsers, rather than measuring only the V8 child.
export async function readReviewProcessTree(pid) {
  const { stdout } = await execute('ps', ['-axo', 'pid=,ppid=,rss='], { maxBuffer: 4 * 1024 ** 2 })
  const rows = stdout.trim().split('\n').map(line => line.trim().split(/\s+/).map(Number))
  const ids = new Set([pid])
  let changed = true
  while (changed) {
    changed = false
    for (const [id, parent] of rows) if (ids.has(parent) && !ids.has(id)) {
      ids.add(id)
      changed = true
    }
  }
  return { pids: [...ids], rssBytes: rows.reduce((sum, [id, , rss]) =>
    sum + (ids.has(id) ? rss * 1024 : 0), 0) }
}

export function killReviewProcessTree(child, pids = []) {
  if (terminated.has(child)) return
  // fork creates a dedicated POSIX process group. Kill the group as well as
  // observed descendants, so a parser forked between polls is also stopped.
  try { process.kill(-child.pid, 'SIGKILL') } catch (error) { if (error.code !== 'ESRCH') throw error }
  for (const pid of [...pids].reverse()) {
    try { process.kill(pid, 'SIGKILL') } catch (error) { if (error.code !== 'ESRCH') throw error }
  }
  terminated.add(child)
}
