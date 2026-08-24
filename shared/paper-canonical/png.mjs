const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10]

export function decodeCanonicalBase64(value) {
  if (typeof value !== 'string' || value.length === 0) return null
  try {
    const binary = atob(value)
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
    let decoded = ''
    for (const byte of bytes) decoded += String.fromCharCode(byte)
    const roundTrip = btoa(decoded)
    return roundTrip === value ? bytes : null
  } catch {
    return null
  }
}

function uint32(bytes, offset) {
  return (
    ((bytes[offset] << 24) >>> 0)
    + (bytes[offset + 1] << 16)
    + (bytes[offset + 2] << 8)
    + bytes[offset + 3]
  ) >>> 0
}

export function inspectPng(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 45) return null
  if (PNG_SIGNATURE.some((value, index) => bytes[index] !== value)) return null
  if (
    uint32(bytes, 8) !== 13
    || String.fromCharCode(...bytes.slice(12, 16)) !== 'IHDR'
  ) return null
  const width = uint32(bytes, 16)
  const height = uint32(bytes, 20)
  if (width < 1 || height < 1) return null
  const tail = bytes.slice(-12)
  if (
    uint32(tail, 0) !== 0
    || String.fromCharCode(...tail.slice(4, 8)) !== 'IEND'
  ) return null
  return { width, height }
}
