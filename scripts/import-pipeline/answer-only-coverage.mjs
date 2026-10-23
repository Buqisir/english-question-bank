export function answerOnlyCoveredNumbers(text) {
  const covered = new Set()
  for (const match of text.matchAll(/(?<![\d.])(\d{1,2})\s*[-–—]\s*(\d{1,2})\s+([A-G](?:\s*[A-G])*)/gu)) {
    const start = Number(match[1]); const end = Number(match[2])
    if (end >= start && end - start + 1 === match[3].replace(/\s/gu, '').length) {
      for (let n = start; n <= end; n++) covered.add(n)
    }
  }
  // Keep physical lines/pages and column starts: \s+ can swallow an empty
  // cell's neighbouring question number and hide that neighbour from matchAll.
  const lines = text.replaceAll('\f', '\n\n').split(/\r?\n/u)
  const markers = (line) => [...line.matchAll(/(?<![\d.])(\d{1,2})[.．、](?=[ \t]|$)/gu)]
  for (const [lineIndex, line] of lines.entries()) {
    const numbers = markers(line)
    const nextLine = lines[lineIndex + 1] || ''
    const continuation = markers(nextLine).length ? [] : [...nextLine.matchAll(/\S+/gu)]
    for (const [index, match] of numbers.entries()) {
      const end = numbers[index + 1]?.index ?? line.length
      const answer = line.slice(match.index + match[0].length, end).trim()
      const wrapped = continuation.some((word) => Math.abs(word.index - match.index) <= 3
        && word.index < end && !/^\d{1,2}[.．、]/u.test(word[0]))
      if ((answer && !/^\d{1,2}[.．、]/u.test(answer)) || wrapped) covered.add(Number(match[1]))
    }
  }
  return covered
}
