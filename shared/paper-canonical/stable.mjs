function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function stableStringify(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value)
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Non-finite numbers are not canonical values')
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`
  }
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .filter((key) => value[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`
  }
  throw new TypeError(`Unsupported canonical value: ${typeof value}`)
}

// Node exposes builtins synchronously without an import, which keeps this
// module loadable in the browser bundle. Import validation hashes hundreds of
// MB of page pixels, which the portable implementation below takes seconds on.
const nodeCrypto = globalThis.process?.getBuiltinModule?.('node:crypto')

function sha256Hex(bytes) {
  if (nodeCrypto) return nodeCrypto.createHash('sha256').update(bytes).digest('hex')
  const bitLength = bytes.length * 8
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64
  const padded = new Uint8Array(paddedLength)
  padded.set(bytes)
  padded[bytes.length] = 0x80
  const view = new DataView(padded.buffer)
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000))
  view.setUint32(paddedLength - 4, bitLength >>> 0)

  const constants = []
  const initial = []
  for (let candidate = 2; constants.length < 64; candidate++) {
    let prime = true
    for (let factor = 2; factor * factor <= candidate; factor++) {
      if (candidate % factor === 0) {
        prime = false
        break
      }
    }
    if (!prime) continue
    if (initial.length < 8) initial.push((Math.sqrt(candidate) % 1) * 0x100000000 >>> 0)
    constants.push((Math.cbrt(candidate) % 1) * 0x100000000 >>> 0)
  }

  const hash = initial
  const words = new Uint32Array(64)
  const rotateRight = (word, bits) => (word >>> bits) | (word << (32 - bits))
  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index++) words[index] = view.getUint32(offset + index * 4)
    for (let index = 16; index < 64; index++) {
      const left = words[index - 15]
      const right = words[index - 2]
      const sigma0 = rotateRight(left, 7) ^ rotateRight(left, 18) ^ (left >>> 3)
      const sigma1 = rotateRight(right, 17) ^ rotateRight(right, 19) ^ (right >>> 10)
      words[index] = (words[index - 16] + sigma0 + words[index - 7] + sigma1) >>> 0
    }
    let [a, b, c, d, e, f, g, h] = hash
    for (let index = 0; index < 64; index++) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25)
      const choose = (e & f) ^ (~e & g)
      const temp1 = (h + sum1 + choose + constants[index] + words[index]) >>> 0
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22)
      const majority = (a & b) ^ (a & c) ^ (b & c)
      const temp2 = (sum0 + majority) >>> 0
      h = g
      g = f
      f = e
      e = (d + temp1) >>> 0
      d = c
      c = b
      b = a
      a = (temp1 + temp2) >>> 0
    }
    hash[0] = (hash[0] + a) >>> 0
    hash[1] = (hash[1] + b) >>> 0
    hash[2] = (hash[2] + c) >>> 0
    hash[3] = (hash[3] + d) >>> 0
    hash[4] = (hash[4] + e) >>> 0
    hash[5] = (hash[5] + f) >>> 0
    hash[6] = (hash[6] + g) >>> 0
    hash[7] = (hash[7] + h) >>> 0
  }
  return hash.map((word) => word.toString(16).padStart(8, '0')).join('')
}

export function sha256(value) {
  const bytes = value instanceof Uint8Array ? value : new TextEncoder().encode(String(value))
  return `sha256:${sha256Hex(bytes)}`
}

export function digestJson(value) {
  return sha256(stableStringify(value))
}

export function withoutKey(value, key) {
  const { [key]: _ignored, ...rest } = value
  return rest
}

export function cloneJson(value) {
  return JSON.parse(JSON.stringify(value))
}

export function exactKeys(value, keys) {
  if (!isRecord(value)) return false
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

export function isRecordValue(value) {
  return isRecord(value)
}
