// Source-authored bullet lines remain canonical text, not synthesized list
// items. Only a wholly bulleted paragraph opts out of ordinary prose indent.
export function hasSourceBulletLines(inlines) {
  if (!inlines.length || inlines.some((inline) => typeof inline.text !== 'string')) return false
  return inlines.map((inline) => inline.text).join('').trim().split(/\r?\n/)
    .every((line) => /^[\t ]*[●•][\t ]+\S/.test(line))
}
