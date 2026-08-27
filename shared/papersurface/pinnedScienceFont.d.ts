export type CanonicalAuthorityRef = {
  readonly manifestId: string
  readonly manifestVersion: string
  readonly manifestDigest: string
}

export const pinnedScienceFont: Readonly<{
  cssFamily: string
  assetRelativePath: string
  publicUrl: string
  mediaType: string
  format: string
  unicodeRange: string
  characters: string
  sha256: string
}>

export const pinnedScienceAuthorityRef: Readonly<CanonicalAuthorityRef>

export function hasPinnedScienceFontAuthority(
  authorityRef?: CanonicalAuthorityRef | null,
): boolean

export function paperFontStackForAuthority(
  authorityRef?: CanonicalAuthorityRef | null,
): string
