import { monitorEventLoopDelay } from 'node:perf_hooks'
import { existsSync, writeFileSync } from 'node:fs'
import { Server } from 'node:net'
import path from 'node:path'

// Preloaded only in the real API process, never in the HTTP probe process.
if (process.argv[1]?.endsWith('/server/api.mjs')) {
  const listen = Server.prototype.listen
  Server.prototype.listen = function (...args) {
    this.once('listening', () => {
      writeFileSync(path.join(path.dirname(process.env.EQB_PROMOTION_API_DELAY), 'api-address.json'),
        JSON.stringify(this.address()))
    })
    return listen.apply(this, args)
  }
  const delay = monitorEventLoopDelay({ resolution: 10 })
  delay.enable()
  let reset = false
  setInterval(() => {
    if (!reset && existsSync(`${process.env.EQB_PROMOTION_API_DELAY}.reset`)) {
      delay.reset()
      reset = true
    }
    writeFileSync(process.env.EQB_PROMOTION_API_DELAY, JSON.stringify({
      pid: process.pid, reset, maxMs: delay.max / 1e6, p99Ms: delay.percentile(99) / 1e6,
    }))
  }, 50).unref()
}
