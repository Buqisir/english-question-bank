/**
 * Type declarations for `shared/papersurface/headingKind.mjs`.
 *
 * heading-fidelity cut (刀⑤ SW-B 销账). Types-only — DO NOT add value
 * declarations here. The runtime `.mjs` is the single source of
 * truth for the actual regex/branching logic. Keep this file in sync
 * with `headingKind.d.mts`.
 */

export function headingKind(title: string): 'part' | 'section'
