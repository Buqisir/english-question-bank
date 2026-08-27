import manifestV50 from '../../standards/paper-canonical/manifest-v50.json' with { type: 'json' }
import metricsV2 from '../../standards/paper-canonical/rendering/times-compatible-metrics-v2.json' with { type: 'json' }

import { digestJson } from '../paper-canonical/stable.mjs'
import { paperSurfaceTokens } from './tokens.mjs'

const scienceFallback = metricsV2.fallbacks.find(
  (fallback) => fallback.upstreamFontFaceId === 'STIX Two Text',
)
if (!scienceFallback) throw new Error('v50 pinned science font authority is unavailable')

export const pinnedScienceFont = Object.freeze({
  cssFamily: scienceFallback.fontFaceId,
  assetRelativePath: scienceFallback.assetPath,
  publicUrl: scienceFallback.publicUrl,
  mediaType: 'font/ttf',
  format: 'truetype',
  unicodeRange: scienceFallback.unicodeRange,
  characters: scienceFallback.characters,
  sha256: scienceFallback.fontFileSha256,
})

const manifestV50Digest = digestJson(manifestV50)

export const pinnedScienceAuthorityRef = Object.freeze({
  manifestId: manifestV50.manifestId,
  manifestVersion: manifestV50.version,
  manifestDigest: manifestV50Digest,
})

export function hasPinnedScienceFontAuthority(authorityRef) {
  return authorityRef?.manifestId === pinnedScienceAuthorityRef.manifestId
    && authorityRef?.manifestVersion === pinnedScienceAuthorityRef.manifestVersion
    && authorityRef?.manifestDigest === pinnedScienceAuthorityRef.manifestDigest
}

export function paperFontStackForAuthority(authorityRef) {
  return hasPinnedScienceFontAuthority(authorityRef)
    ? `"${pinnedScienceFont.cssFamily}", ${paperSurfaceTokens.paperFontStack}`
    : paperSurfaceTokens.paperFontStack
}
