// Which wrong listening options are built from words the student actually heard.
// docs/product/listening-methods.md §三: an option must be explained when at least half of its
// content words (stopwords removed, longer than two letters) occur in its own transcript, or when it
// reuses a number from the transcript. The corpus sample put real traps at 28 of 30 flags.

const STOPWORDS = new Set((
  'the a an of to in on at for and or is are was were be been by with his her their its it he she they you i we this that '
  + 'from as about not do does did will can has have had your our my me him them who what which there here some any more most very just than then '
  + 'one two get got go going make made take took'
).split(' '))

const tokens = (text) => String(text).match(/[A-Za-z][A-Za-z’'-]*|\d[\d:.,]*\d|\d/gu) || []
const isNumber = (word) => /\d/u.test(word)

function normalize(word) {
  if (isNumber(word)) return word.replace(/,/gu, '')
  return word.toLowerCase().replace(/[’']s$/u, '').replace(/ies$/u, 'y').replace(/(?:ing|ed|es|s)$/u, '')
}

export function heardInRecording(optionText, transcript) {
  const heard = new Set(tokens(transcript).map(normalize))
  const content = tokens(optionText).filter((word) => isNumber(word) || (!STOPWORDS.has(word.toLowerCase()) && word.length > 2))
  const hits = content.filter((word) => heard.has(normalize(word)))
  return {
    heardInRecording: [...new Set(hits)],
    mustExplain: content.length > 0 && (hits.some(isNumber) || hits.length * 2 >= content.length),
  }
}

/** { B: { heardInRecording: ['drive'], mustExplain: true }, ... } for every wrong option. */
export function listeningWrongOptions({ options, officialAnswer }, transcript) {
  return Object.fromEntries(Object.entries(options || {})
    .filter(([label]) => label !== officialAnswer)
    .map(([label, text]) => [label, heardInRecording(text, transcript)]))
}

export function mustExplainLabels(question, transcript) {
  return Object.entries(listeningWrongOptions(question, transcript))
    .filter(([, { mustExplain }]) => mustExplain)
    .map(([label]) => label)
}
