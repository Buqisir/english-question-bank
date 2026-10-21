import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execute = promisify(execFile)
const terminated = new WeakMap()

async function processInventory() {
  const { stdout } = await execute('ps', ['-axo', 'pid=,ppid=,rss=,pgid=,stat='], { maxBuffer: 4 * 1024 ** 2 })
  return stdout.trim().split('\n').filter(Boolean).map(line => {
    const [pid, parent, rss, group, state] = line.trim().split(/\s+/)
    return { pid: Number(pid), parent: Number(parent), rss: Number(rss), group: Number(group), state }
  })
}

// ps reports resident KiB on both Linux and macOS. Include every descendant,
// including external parsers, rather than measuring only the V8 child.
export async function readReviewProcessTree(pid) {
  const rows = await processInventory()
  const ids = new Set([pid])
  let changed = true
  while (changed) {
    changed = false
    for (const { pid: id, parent } of rows) if (ids.has(parent) && !ids.has(id)) {
      ids.add(id)
      changed = true
    }
  }
  return { pids: [...ids], rssBytes: rows.reduce((sum, row) =>
    sum + (ids.has(row.pid) ? row.rss * 1024 : 0), 0) }
}

export function killReviewProcessTree(child, pids = []) {
  if (terminated.has(child)) return terminated.get(child)
  const kill = async (pid, group = false) => {
    try { process.kill(group ? -pid : pid, 'SIGKILL') }
    catch (error) {
      if (error.code === 'ESRCH') return
      if (error.code !== 'EPERM') throw error
      // Darwin returns EPERM for zombie-only groups before Node emits exit.
      // Never suppress a real permission failure against any live member.
      const targets = (await processInventory()).filter(row => group ? row.group === pid : row.pid === pid)
      if (targets.some(row => !row.state?.startsWith('Z'))) throw error
    }
  }
  const disposal = (async () => {
    // fork creates a dedicated POSIX process group. Include observed escaped
    // descendants as well, and share this disposal across competing callers.
    await kill(child.pid, true)
    for (const pid of [...pids].reverse()) await kill(pid)
  })()
  terminated.set(child, disposal)
  return disposal
}
