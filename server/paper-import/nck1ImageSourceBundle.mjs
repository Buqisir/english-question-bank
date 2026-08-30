import { execFileSync } from 'node:child_process'

import {
  exactKeys,
  sha256,
  stableStringify,
} from '../../shared/paper-canonical/stable.mjs'

export const NCK1_IMAGE_BUNDLE_SCHEMA_VERSION =
  'universal-nck1-image-source-bundle-v1'
export const NCK1_IMAGE_BUNDLE_MEDIA_TYPE =
  'application/vnd.eqb.nck1-image-source-bundle+json'

const IMAGE_MEDIA_TYPES = Object.freeze({
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
})
const MAX_IMAGE_BUFFER = 128 * 1024 * 1024

export class Nck1ImageSourceBundleError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'Nck1ImageSourceBundleError'
    this.code = code
  }
}

function fail(code, message) {
  throw new Nck1ImageSourceBundleError(code, message)
}

function imageMediaType(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 12) return null
  if (
    bytes[0] === 0x89
    && bytes[1] === 0x50
    && bytes[2] === 0x4e
    && bytes[3] === 0x47
    && bytes[4] === 0x0d
    && bytes[5] === 0x0a
    && bytes[6] === 0x1a
    && bytes[7] === 0x0a
  ) return 'image/png'
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }
  if (
    Buffer.from(bytes.subarray(0, 4)).toString('ascii') === 'RIFF'
    && Buffer.from(bytes.subarray(8, 12)).toString('ascii') === 'WEBP'
  ) return 'image/webp'
  return null
}

export function inspectNck1SourceImage(bytes) {
  const mediaType = imageMediaType(bytes)
  if (!mediaType) {
    fail(
      'NCK1_IMAGE_MEDIA_TYPE_UNSUPPORTED',
      'Image source pages must be immutable PNG, JPEG, or WebP bytes',
    )
  }
  let dimensions
  try {
    dimensions = execFileSync(
      'magick',
      ['identify', '-format', '%w,%h', '-'],
      { encoding: 'utf8', input: bytes, maxBuffer: MAX_IMAGE_BUFFER },
    ).split(',').map(Number)
  } catch {
    fail('NCK1_IMAGE_PAGE_COVERAGE_INCOMPLETE', 'Image source page pixels are unreadable')
  }
  const [pixelWidth, pixelHeight] = dimensions
  if (!Number.isInteger(pixelWidth) || pixelWidth < 1
    || !Number.isInteger(pixelHeight) || pixelHeight < 1) {
    fail('NCK1_IMAGE_PAGE_COVERAGE_INCOMPLETE', 'Image source page dimensions are unavailable')
  }
  return {
    mediaType,
    sha256: sha256(bytes),
    byteLength: bytes.byteLength,
    pixelWidth,
    pixelHeight,
  }
}

function pageRecord(page, bytes) {
  return {
    page,
    ...inspectNck1SourceImage(bytes),
    encodedBytes: Buffer.from(bytes).toString('base64'),
  }
}

function assertOrderedPages(pages) {
  if (!Array.isArray(pages) || pages.length === 0) {
    fail('NCK1_IMAGE_PAGE_COVERAGE_INCOMPLETE', 'Image source bundle needs at least one page')
  }
  const pageNumbers = pages.map((item) => item?.page)
  if (new Set(pageNumbers).size !== pageNumbers.length) {
    fail('NCK1_IMAGE_PAGE_DUPLICATE', 'Image source bundle page numbers must be unique')
  }
  if (pageNumbers.some((page, index) => page !== index + 1)) {
    fail(
      'NCK1_IMAGE_BUNDLE_ORDER_INVALID',
      'Image source bundle pages must be explicitly ordered from 1 without gaps',
    )
  }
}

export function buildNck1ImageSourceBundle(pages) {
  assertOrderedPages(pages)
  const descriptor = {
    schemaVersion: NCK1_IMAGE_BUNDLE_SCHEMA_VERSION,
    pages: pages.map(({ page, bytes }) => {
      if (!(bytes instanceof Uint8Array)) {
        fail('NCK1_IMAGE_PAGE_COVERAGE_INCOMPLETE', `Image page ${page} bytes are unavailable`)
      }
      return pageRecord(page, bytes)
    }),
  }
  return new TextEncoder().encode(stableStringify(descriptor))
}

function decodedPage(record, index) {
  if (!exactKeys(record, [
    'page', 'mediaType', 'sha256', 'byteLength', 'pixelWidth', 'pixelHeight',
    'encodedBytes',
  ]) || record.page !== index + 1) {
    fail(
      'NCK1_IMAGE_BUNDLE_ORDER_INVALID',
      'Image source descriptor pages must preserve one contiguous explicit order',
    )
  }
  if (!Object.hasOwn(IMAGE_MEDIA_TYPES, record.mediaType)
    || typeof record.encodedBytes !== 'string') {
    fail('NCK1_IMAGE_MEDIA_TYPE_UNSUPPORTED', `Image page ${record.page} media type is unsupported`)
  }
  const bytes = new Uint8Array(Buffer.from(record.encodedBytes, 'base64'))
  if (Buffer.from(bytes).toString('base64') !== record.encodedBytes) {
    fail('NCK1_IMAGE_PAGE_DIGEST_MISMATCH', `Image page ${record.page} bytes are not exact base64`)
  }
  const inspected = inspectNck1SourceImage(bytes)
  if (
    inspected.mediaType !== record.mediaType
    || inspected.sha256 !== record.sha256
    || inspected.byteLength !== record.byteLength
    || inspected.pixelWidth !== record.pixelWidth
    || inspected.pixelHeight !== record.pixelHeight
  ) {
    fail(
      'NCK1_IMAGE_PAGE_DIGEST_MISMATCH',
      `Image page ${record.page} no longer matches its immutable pixels and metadata`,
    )
  }
  return { ...record, bytes }
}

export function parseNck1ImageSourceBundle(bytes) {
  let descriptor
  try {
    descriptor = JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    fail('NCK1_IMAGE_PAGE_COVERAGE_INCOMPLETE', 'Image source bundle descriptor is not valid JSON')
  }
  if (!exactKeys(descriptor, ['schemaVersion', 'pages'])
    || descriptor.schemaVersion !== NCK1_IMAGE_BUNDLE_SCHEMA_VERSION
    || !Array.isArray(descriptor.pages)
    || descriptor.pages.length === 0) {
    fail('NCK1_IMAGE_PAGE_COVERAGE_INCOMPLETE', 'Image source bundle descriptor shape is incomplete')
  }
  const pageNumbers = descriptor.pages.map((page) => page?.page)
  if (new Set(pageNumbers).size !== pageNumbers.length) {
    fail('NCK1_IMAGE_PAGE_DUPLICATE', 'Image source descriptor contains duplicate pages')
  }
  return {
    schemaVersion: descriptor.schemaVersion,
    pages: descriptor.pages.map(decodedPage),
  }
}

export function nck1ImageBundlePage(document, page) {
  if (
    document?.mediaType !== NCK1_IMAGE_BUNDLE_MEDIA_TYPE
    || !(document.bytes instanceof Uint8Array)
    || sha256(document.bytes) !== document.sha256
    || document.bytes.byteLength !== document.byteLength
  ) {
    fail('NCK1_IMAGE_PAGE_DIGEST_MISMATCH', 'Image source bundle document is not immutable')
  }
  const bundle = parseNck1ImageSourceBundle(document.bytes)
  if (bundle.pages.length !== document.pageCount) {
    fail('NCK1_IMAGE_PAGE_COVERAGE_INCOMPLETE', 'Image source page count does not match its descriptor')
  }
  const result = bundle.pages[page - 1]
  if (!result || result.page !== page) {
    fail('NCK1_IMAGE_PAGE_COVERAGE_INCOMPLETE', `Image source page ${page} is unavailable`)
  }
  return result
}

export function assertNck1ImageBundlePageArtifacts(document, pageArtifacts) {
  if (document?.mediaType !== NCK1_IMAGE_BUNDLE_MEDIA_TYPE) return
  const bundle = parseNck1ImageSourceBundle(document.bytes)
  if (!Array.isArray(pageArtifacts)
    || pageArtifacts.length !== bundle.pages.length
    || pageArtifacts.length !== document.pageCount) {
    fail('NCK1_IMAGE_PAGE_COVERAGE_INCOMPLETE', 'Image source page artifact inventory is incomplete')
  }
  for (const [index, artifact] of pageArtifacts.entries()) {
    const page = bundle.pages[index]
    if (
      artifact?.page !== index + 1
      || !(artifact.bytes instanceof Uint8Array)
      || artifact.mediaType !== page.mediaType
      || artifact.sha256 !== page.sha256
      || artifact.byteLength !== page.byteLength
      || artifact.pixelWidth !== page.pixelWidth
      || artifact.pixelHeight !== page.pixelHeight
      || sha256(artifact.bytes) !== page.sha256
      || artifact.bytes.byteLength !== page.byteLength
    ) {
      fail(
        'NCK1_IMAGE_PAGE_DIGEST_MISMATCH',
        `Image source page ${index + 1} no longer matches its immutable bundle descriptor`,
      )
    }
  }
}

export function nck1ImagePageRgba(page) {
  const pixels = execFileSync(
    'magick',
    ['-', '-alpha', 'on', 'rgba:-'],
    { input: page.bytes, maxBuffer: MAX_IMAGE_BUFFER },
  )
  return {
    sha256: sha256(pixels),
    pixelWidth: page.pixelWidth,
    pixelHeight: page.pixelHeight,
  }
}

export function cropNck1SourceImage(bytes, region) {
  const inspected = inspectNck1SourceImage(bytes)
  const x = Math.floor(region.x * inspected.pixelWidth)
  const y = Math.floor(region.y * inspected.pixelHeight)
  const right = Math.ceil((region.x + region.width) * inspected.pixelWidth)
  const bottom = Math.ceil((region.y + region.height) * inspected.pixelHeight)
  const width = Math.max(1, right - x)
  const height = Math.max(1, bottom - y)
  const output = execFileSync(
    'magick',
    ['-', '-crop', `${width}x${height}+${x}+${y}`, '+repage', 'png:-'],
    { input: bytes, maxBuffer: MAX_IMAGE_BUFFER },
  )
  return { bytes: new Uint8Array(output), pixelWidth: width, pixelHeight: height }
}

export function nck1ImageExtension(mediaType) {
  return IMAGE_MEDIA_TYPES[mediaType] || null
}
