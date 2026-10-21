// Node 24 supplies a synchronous native hash without importing a Node module
// into browser bundles. The browser retains its existing synchronous fallback.
const nativeCreateHash = typeof process !== 'undefined' && typeof process.getBuiltinModule === 'function'
  ? process.getBuiltinModule('node:crypto').createHash : null

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
  if (nativeCreateHash) return `sha256:${nativeCreateHash('sha256').update(value instanceof Uint8Array ? value : String(value)).digest('hex')}`
  const bytes = value instanceof Uint8Array ? value : new TextEncoder().encode(String(value))
  return `sha256:${sha256Hex(bytes)}`
}

function visitCanonicalTokens(value, write) {
  function visit(item) {
    if (Array.isArray(item)) {
      write('[')
      for (let index = 0; index < item.length; index++) {
        if (index) write(',')
        // Match Array.map/join's existing sparse-array byte representation.
        if (index in item) visit(item[index])
      }
      write(']')
    } else if (isRecord(item)) {
      write('{')
      let first = true
      for (const key of Object.keys(item).sort().filter(key => item[key] !== undefined)) {
        if (!first) write(',')
        first = false
        visit(key); write(':'); visit(item[key])
      }
      write('}')
    } else if (typeof item === 'string' && item.length > 8192) {
      // Image bundles contain large base64 strings. Escape bounded pieces,
      // preserving surrogate pairs so the canonical UTF-8 bytes stay exact.
      write('"')
      for (let start = 0; start < item.length;) {
        let end = Math.min(start + 8192, item.length)
        if (end < item.length && item.charCodeAt(end - 1) >= 0xd800 && item.charCodeAt(end - 1) <= 0xdbff
          && item.charCodeAt(end) >= 0xdc00 && item.charCodeAt(end) <= 0xdfff) end--
        write(JSON.stringify(item.slice(start, end)).slice(1, -1))
        start = end
      }
      write('"')
    } else write(stableStringify(item))
  }
  visit(value)
}

// Canonical ordinary data only, like stableStringify; no getter/Proxy or
// mutation protocol. Two synchronous traversals retain only one owned result
// and bounded UTF-8 tokens, including for very long object keys and strings.
export function stableUtf8Bytes(value) {
  const encoder = new TextEncoder()
  let byteLength = 1
  visitCanonicalTokens(value, token => { byteLength += encoder.encode(token).length })
  const bytes = new Uint8Array(byteLength)
  let offset = 0
  visitCanonicalTokens(value, token => {
    const { read, written } = encoder.encodeInto(token, bytes.subarray(offset, byteLength - 1))
    if (read !== token.length) throw new TypeError('Canonical value changed while encoding')
    offset += written
  })
  if (offset !== byteLength - 1) throw new TypeError('Canonical value changed while encoding')
  bytes[offset] = 10
  return bytes
}

export function digestJson(value) {
  if (!nativeCreateHash) return sha256(stableStringify(value))
  const hash = nativeCreateHash('sha256')
  let pending = ''
  visitCanonicalTokens(value, token => {
    pending += token
    if (pending.length >= 65536) { hash.update(pending); pending = '' }
  })
  hash.update(pending)
  return `sha256:${hash.digest('hex')}`
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
