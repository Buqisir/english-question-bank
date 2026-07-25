export function buildSupportedMarkerSequence(start, count) {
  return Array.from(
    { length: count },
    (_, index) => `__${start + index}__`,
  ).join(' ')
}
