/*
 * Entry for the server's personal-overlay browser bundle (#489 5a): the
 * shared functions the measure pass runs inside Chromium. Re-exports only —
 * esbuild bundles whatever these modules actually reach for.
 */
export { printSegmentToDomRanges } from './printDomAnchor.mjs'
export { placeNoteNearAnchor } from './notePlacement.mjs'
export { orderAppendixEntries, appendixSourceLabel, appendixMarkerPosition } from './appendix.mjs'
export { inkFreeRect } from './inkProbe.mjs'
export { textRects, mergeLineRects } from './markGeometry.mjs'
