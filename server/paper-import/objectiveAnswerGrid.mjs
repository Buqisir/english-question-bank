// Shared confirmed answer-grid syntax. Callers supply their answer-value policy.
function normalized(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[\u200b\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim()
}

function consecutive(numbers) {
  return numbers.every((number, index) => index === 0 || number === numbers[index - 1] + 1)
}

const ANSWER_GRID_NUMBER_LABEL = /^(?:题号|题序|序号|小题)$/u
const ANSWER_GRID_VALUE_LABEL = /^答案$/u

// One number row and the answer row printed under it, from a table or from
// two transcribed lines ("序号 1 2 3" / "答案 C C B"). Text lines carry no cell
// boundaries, so their answers must be one word each; tables keep phrases.
export function answerGridPairs(numberCells, valueCells, answerValueFor) {
  const label = (cells, pattern) => (pattern.test(normalized(cells[0])) ? cells.slice(1) : null)
  const numbers = label(numberCells, ANSWER_GRID_NUMBER_LABEL)
  const values = label(valueCells, ANSWER_GRID_VALUE_LABEL)
  if (!numbers || !values) return null
  const used = numbers.findLastIndex((cell) => normalized(cell)) + 1
  const parsedNumbers = numbers.slice(0, used).map((cell) =>
    (/^\d{1,2}$/u.test(normalized(cell)) ? Number(normalized(cell)) : null))
  if (used < 2 || parsedNumbers.some((number) => number === null) || !consecutive(parsedNumbers)) return { ambiguous: true }
  if (values.length < used || values.slice(used).some((cell) => normalized(cell))) return { ambiguous: true, numbers: parsedNumbers }
  const parsedValues = parsedNumbers.map((number, index) => answerValueFor(number, values[index]))
  return parsedValues.every(Boolean)
    ? { pairs: parsedNumbers.map((number, index) => [number, parsedValues[index]]) }
    : { ambiguous: true, numbers: parsedNumbers }
}

export function answerLineCells(text) {
  return normalized(text).replace(/^(\S+?) ?[|｜:：] ?/u, '$1 ').split(' ')
}
