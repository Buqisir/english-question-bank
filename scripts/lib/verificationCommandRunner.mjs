import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'

const DEFAULT_MAX_LINE_CHARS = 8_192
const PROCESS_GROUP_GRACE_MS = 250

function createCappedLineWriter(writeOutput, maxLineChars) {
  const headLimit = Math.floor(maxLineChars * 3 / 4)
  const tailLimit = maxLineChars - headLimit
  let head = ''
  let tail = ''
  let length = 0
  let hash = createHash('sha256')

  const append = (value) => {
    if (!value) return
    hash.update(value)
    length += value.length
    const headRoom = headLimit - head.length
    if (headRoom > 0) {
      head += value.slice(0, headRoom)
      value = value.slice(headRoom)
    }
    if (value) tail = `${tail}${value}`.slice(-tailLimit)
  }

  const emit = (newline) => {
    const digest = hash.digest('hex')
    if (length <= maxLineChars) {
      writeOutput(`${head}${tail}${newline ? '\n' : ''}`)
    } else {
      const omitted = length - head.length - tail.length
      writeOutput(
        `${head}\n… [line truncated: ${omitted} chars omitted; sha256:${digest}] …\n${tail}${newline ? '\n' : ''}`,
      )
    }
    head = ''
    tail = ''
    length = 0
    hash = createHash('sha256')
  }

  return {
    write(chunk) {
      let remaining = chunk
      for (;;) {
        const newlineIndex = remaining.indexOf('\n')
        if (newlineIndex === -1) {
          append(remaining)
          return
        }
        append(remaining.slice(0, newlineIndex))
        emit(true)
        remaining = remaining.slice(newlineIndex + 1)
      }
    },
    end() {
      if (length > 0) emit(false)
    },
  }
}

function processGroupExists(pid) {
  if (process.platform === 'win32') return false
  try {
    process.kill(-pid, 0)
    return true
  } catch (error) {
    return error?.code === 'EPERM'
  }
}

function signalProcessTree(child, signal) {
  if (process.platform !== 'win32') {
    try {
      process.kill(-child.pid, signal)
      return
    } catch (error) {
      if (error?.code !== 'ESRCH') throw error
    }
  }
  try {
    child.kill(signal)
  } catch (error) {
    if (error?.code !== 'ESRCH') throw error
  }
}

async function reapLingeringProcessGroup(child) {
  if (!processGroupExists(child.pid)) return
  signalProcessTree(child, 'SIGTERM')
  const deadline = Date.now() + PROCESS_GROUP_GRACE_MS
  while (Date.now() < deadline) {
    if (!processGroupExists(child.pid)) return
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  if (processGroupExists(child.pid)) signalProcessTree(child, 'SIGKILL')
}

function signalExitCode(signal) {
  if (signal === 'SIGINT') return 130
  if (signal === 'SIGTERM') return 143
  return 1
}

export async function runVerificationCommand(command, args, {
  cwd,
  maxLineChars = DEFAULT_MAX_LINE_CHARS,
  stdout = (chunk) => process.stdout.write(chunk),
  stderr = (chunk) => process.stderr.write(chunk),
} = {}) {
  const child = spawn(command, args, {
    cwd,
    detached: process.platform !== 'win32',
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const stdoutWriter = createCappedLineWriter(stdout, maxLineChars)
  const stderrWriter = createCappedLineWriter(stderr, maxLineChars)
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', (chunk) => stdoutWriter.write(chunk))
  child.stderr.on('data', (chunk) => stderrWriter.write(chunk))
  const closePromise = new Promise((resolve) => child.once('close', resolve))

  let interruptTimer = null
  let interruptedSignal = null
  const interrupt = (signal) => {
    if (interruptedSignal) return
    interruptedSignal = signal
    signalProcessTree(child, 'SIGTERM')
    interruptTimer = setTimeout(() => {
      signalProcessTree(child, 'SIGKILL')
      process.exit(signalExitCode(signal))
    }, PROCESS_GROUP_GRACE_MS)
  }
  const onSigint = () => interrupt('SIGINT')
  const onSigterm = () => interrupt('SIGTERM')
  process.once('SIGINT', onSigint)
  process.once('SIGTERM', onSigterm)

  const result = await new Promise((resolve) => {
    let settled = false
    const settle = (value) => {
      if (settled) return
      settled = true
      resolve(value)
    }
    child.once('error', (error) => settle({ error }))
    child.once('exit', (code, signal) => settle({ code, signal }))
  })
  await reapLingeringProcessGroup(child)
  await closePromise

  if (interruptTimer) clearTimeout(interruptTimer)
  process.removeListener('SIGINT', onSigint)
  process.removeListener('SIGTERM', onSigterm)
  stdoutWriter.end()
  stderrWriter.end()

  if (interruptedSignal) process.exit(signalExitCode(interruptedSignal))
  if (result.error) {
    stderr(`Unable to start ${command}: ${result.error.message}\n`)
    return 1
  }
  return result.code ?? signalExitCode(result.signal)
}
