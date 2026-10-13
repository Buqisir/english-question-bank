import { paperFontFaces } from '../../../../shared/papersurface/paperFonts.mjs'
import webFaces from './paperWebFonts.json'

type FontAsset = {
  family: string
  style: string
  weight: string
  path: string
  sha256: string
  unicodeRange?: string
}

const common: FontAsset[] = paperFontFaces.filter(face => face.family === 'EQB Termes')
const byCharacter = new Map<number, FontAsset[]>()
for (const face of webFaces) {
  for (const [index, shard] of face.shards.entries()) {
    const asset: FontAsset = {
      family: face.family, style: face.style, weight: face.weight,
      path: shard.path, sha256: shard.sha256,
      unicodeRange: shard.ranges.map(([from, to]) =>
        `U+${from.toString(16)}${to === from ? '' : `-${to.toString(16)}`}`).join(','),
    }
    if (index === 0) common.push(asset)
    for (const [from, to] of shard.ranges) {
      for (let code = from; code <= to; code++) {
        const assets = byCharacter.get(code) || []
        assets.push(asset)
        byCharacter.set(code, assets)
      }
    }
  }
}

const loaded = new Set<string>()
const pending = new Map<string, Promise<void>>()

export class PaperFontError extends Error {
  constructor(cause: unknown) {
    super('试卷字体加载失败，请刷新重试。', { cause })
  }
}

// Read text conservatively from source/model data; never infer paper semantics.
// React children may contain text too, but their owner/ref internals are not data.
export function requiredPaperFonts(content: unknown): FontAsset[] {
  const required = new Set(common)
  const visited = new Set<object>()
  const visit = (value: unknown): void => {
    if (typeof value === 'string') {
      for (const char of value) {
        for (const asset of byCharacter.get(char.codePointAt(0)!) || []) required.add(asset)
      }
    } else if (value && typeof value === 'object' && !visited.has(value)) {
      visited.add(value)
      if ('$$typeof' in value && 'props' in value) visit(value.props)
      else if (value instanceof Map || value instanceof Set) for (const item of value.values()) visit(item)
      else for (const item of Object.values(value)) visit(item)
    }
  }
  visit(content)
  return [...required]
}

export function paperFontsReady(fonts: FontAsset[]): boolean {
  return fonts.every(font => loaded.has(font.sha256))
}

function loadFont(asset: FontAsset): Promise<void> {
  if (loaded.has(asset.sha256)) return Promise.resolve()
  const existing = pending.get(asset.sha256)
  if (existing) return existing
  const promise = (async () => {
    const response = await fetch(`/fonts/paper/${asset.path}?v=${asset.sha256}`)
    if (!response.ok) throw new Error('Paper font unavailable')
    const bytes = await response.arrayBuffer()
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
      byte => byte.toString(16).padStart(2, '0')).join('')
    if (digest !== asset.sha256) throw new Error('Paper font integrity mismatch')
    const face = await new FontFace(asset.family, bytes, {
      style: asset.style, weight: asset.weight,
      ...(asset.unicodeRange ? { unicodeRange: asset.unicodeRange } : {}),
    }).load()
    document.fonts.add(face)
    loaded.add(asset.sha256)
  })().catch(error => {
    throw new PaperFontError(error)
  }).finally(() => { pending.delete(asset.sha256) })
  pending.set(asset.sha256, promise)
  return promise
}

export async function ensurePaperFonts(content: unknown): Promise<void> {
  await Promise.all(requiredPaperFonts(content).map(loadFont))
}
