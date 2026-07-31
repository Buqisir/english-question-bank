function isAsciiLetter(value) {
  return /^[A-Za-z]$/u.test(value)
}

function isChineseGloss(value) {
  return value.length > 0 && /^[\u3400-\u9fff]+$/u.test(value)
}

function isAsciiPunctuation(value) {
  return /^[.,;:!?]$/u.test(value)
}

/**
 * Independent replay oracle for canonical-visible-typography.
 *
 * This deliberately uses a character scanner rather than the producer's
 * regular-expression pipeline. A shared implementation would let one
 * algorithmic bug prove itself during Transformation Record validation.
 */
function replayCanonicalVisibleTypographyV1(value) {
  if (typeof value !== 'string') return value
  let output = ''
  for (let index = 0; index < value.length; index += 1) {
    const current = value[index]
    if (
      current === "'"
      && isAsciiLetter(value[index - 1] || '')
      && isAsciiLetter(value[index + 1] || '')
    ) {
      output += '’'
      continue
    }
    if (current !== '（' && current !== '(') {
      output += current
      continue
    }
    const closeIndex = value.indexOf(
      current === '（' ? '）' : ')',
      index + 1,
    )
    const gloss =
      closeIndex < 0 ? '' : value.slice(index + 1, closeIndex)
    if (closeIndex < 0 || !isChineseGloss(gloss)) {
      output += current
      continue
    }
    let prefixEnd = output.length
    while (prefixEnd > 0 && /\s/u.test(output[prefixEnd - 1])) {
      prefixEnd -= 1
    }
    if (isAsciiLetter(output[prefixEnd - 1] || '')) {
      output = `${output.slice(0, prefixEnd)} (${gloss})`
    } else {
      output += `(${gloss})`
    }
    let nextIndex = closeIndex + 1
    while (nextIndex < value.length && /\s/u.test(value[nextIndex])) {
      nextIndex += 1
    }
    if (isAsciiPunctuation(value[nextIndex] || '')) {
      output += value[nextIndex]
      index = nextIndex
    } else {
      output += value.slice(closeIndex + 1, nextIndex)
      index = nextIndex - 1
    }
  }
  return output
}

function replayCanonicalVisibleTypographyV2(value) {
  if (typeof value !== 'string') return value
  let output = ''
  for (let index = 0; index < value.length; index += 1) {
    const current = value[index]
    if (
      current === "'"
      && isAsciiLetter(value[index - 1] || '')
      && isAsciiLetter(value[index + 1] || '')
    ) {
      output += '’'
      continue
    }
    if (current !== '（' && current !== '(') {
      output += current
      continue
    }

    const closeIndex = value.indexOf(
      current === '（' ? '）' : ')',
      index + 1,
    )
    if (closeIndex < 0) {
      output += current
      continue
    }
    const gloss = value.slice(index + 1, closeIndex)
    let prefixEnd = output.length
    while (prefixEnd > 0 && /\s/u.test(output[prefixEnd - 1])) {
      prefixEnd -= 1
    }
    if (
      !isChineseGloss(gloss)
      || !isAsciiLetter(output[prefixEnd - 1] || '')
    ) {
      output += current
      continue
    }

    if (current === '（') {
      output = `${output.slice(0, prefixEnd)} (${gloss})`
    } else {
      output += `(${gloss})`
    }
    let nextIndex = closeIndex + 1
    while (nextIndex < value.length && /\s/u.test(value[nextIndex])) {
      nextIndex += 1
    }
    if (isAsciiPunctuation(value[nextIndex] || '')) {
      output += value[nextIndex]
      index = nextIndex
    } else {
      output += value.slice(closeIndex + 1, nextIndex)
      index = nextIndex - 1
    }
  }
  return output
}

export function replayCanonicalVisibleTypography(value, ruleVersion = '2') {
  if (ruleVersion === '1') {
    return replayCanonicalVisibleTypographyV1(value)
  }
  if (ruleVersion === '2') {
    return replayCanonicalVisibleTypographyV2(value)
  }
  return undefined
}
