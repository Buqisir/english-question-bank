/**
 * `Element.scrollIntoView`/`window.scrollTo`'s `behavior` option overrides
 * `prefers-reduced-motion` — the browser has no built-in way to make a JS
 * smooth-scroll respect the media query, so every call site must check it
 * itself. `PaperBrowsePage.tsx`'s lecture-evidence scroll already did this
 * inline; this pulls that one check into a shared helper so the other three
 * call sites (which passed a hardcoded `'smooth'`) stop leaving
 * reduced-motion users scrolled against their preference.
 */
export function scrollBehavior(): ScrollBehavior {
  const reduced =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  return reduced ? 'auto' : 'smooth'
}
