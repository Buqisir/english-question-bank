import { spawn } from 'node:child_process'

// Keep renewals serial and drain the outstanding request before the caller
// records a completed step. A failed renewal never schedules another attempt.
export async function maintainSourceIntakeLease(renew, {
  schedule = (callback) => setTimeout(callback, 30_000),
  cancel = clearTimeout,
} = {}) {
  await renew()
  let stopped = false
  let pending = null
  let timer = null
  const controller = new AbortController()
  const keeper = {
    signal: controller.signal,
    failure: null,
    async stop() {
      stopped = true
      if (timer != null) cancel(timer)
      if (pending) await pending
    },
  }
  const tick = () => {
    if (stopped || keeper.failure) return
    timer = schedule(() => {
      pending = Promise.resolve().then(renew)
        .catch((error) => { keeper.failure = error; controller.abort(error) })
        .finally(() => { pending = null; tick() })
    })
    timer?.unref?.()
  }
  tick()
  return keeper
}

export function runSourceIntakeChild(args, { cwd, signal } = {}) {
  signal?.throwIfAborted()
  return new Promise((resolve, reject) => {
    // A process group also contains synchronous FFmpeg/producer descendants.
    const grouped = process.platform !== 'win32'
    const child = spawn(process.execPath, args, {
      cwd, env: process.env, detached: grouped, stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    let termination = null
    const terminate = (kind) => {
      if (!child.pid) return
      try {
        if (grouped) process.kill(-child.pid, kind)
        else child.kill(kind)
      } catch (error) {
        if (error.code !== 'ESRCH') throw error
      }
    }
    const abort = () => {
      terminate('SIGTERM')
      termination = new Promise((done) => setTimeout(() => {
        terminate('SIGKILL')
        done()
      }, 1000))
    }
    signal?.addEventListener('abort', abort, { once: true })
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.once('error', (error) => {
      signal?.removeEventListener('abort', abort)
      reject(error)
    })
    child.once('close', async (code) => {
      signal?.removeEventListener('abort', abort)
      if (termination) await termination
      if (signal?.aborted) reject(signal.reason)
      else if (code === 0) resolve({ stdout, stderr })
      else reject(new Error(stderr.trim() || stdout.trim() || `Child command exited ${code}`))
    })
  })
}
