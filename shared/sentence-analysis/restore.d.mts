import type { RestoreDisplaySegment, RestoreSegment, Token } from './types.d.mts'

export const CLITIC_WORDS: Record<string, string[]>
export function foldWord(text: string): string
export function aliasOf(sentenceWord: string, word: string): boolean
export function alignRestore(
  tokens: Token[],
  scopes: Array<{ id: string; start: number; end: number }>,
  text: string,
): { scopeId?: string; segments?: RestoreSegment[]; problems: string[] }
export function restoreDisplay(sentenceText: string, tokens: Token[], segments: RestoreSegment[]): RestoreDisplaySegment[]
