import { endpointAllowed } from '../paper-translation/config.mjs'
import { singleGloss } from '../../shared/vocabulary-notebook/highlight.mjs'

const HEAD_PROMPT = [
  '你是高中英语试卷的查词助手。圈中的词可能是词头的变形。',
  '输入 JSON：word，sentence，heads。每个 head 有 headword、pos、gloss。',
  '选出这句话里实际用的那个词头。过去式、现在分词要回到动词词头，不要停在同形的形容词。',
  '只输出 {"headword":"词头"}，必须和某一条 headword 完全一致。确定不了输出 {"sense":0}。',
].join('\n')

const PROMPT = [
  '你是高中英语试卷的查词助手。老师圈了一个英文单词。',
  '输入是 JSON：word 是圈中的词，sentence 是它所在的句子，senses 是这个词自己的义项。',
  '选出它在这句里的一个短义。只输出 JSON：{"gloss":"短义"}。',
  '短义必须是某一条 sense 里的一段，不能带分号，不能翻译整句。',
  '确定不了就输出 {"sense":0}。',
].join('\n')

function partsOf(gloss) {
  return String(gloss || '').split(/[；;]/).map((part) => part.trim()).filter(Boolean)
}

export function parseNotebookHeadword(content, headwords) {
  let parsed
  try {
    parsed = JSON.parse(String(content || '').trim())
  } catch {
    return null
  }
  if (!parsed || parsed.sense === 0) return null
  const headword = typeof parsed.headword === 'string' ? parsed.headword.trim() : ''
  const matches = (headwords || []).filter((item) => item === headword)
  return matches.length === 1 ? headword : null
}

export function parseNotebookGloss(content, candidates) {
  let parsed
  try {
    parsed = JSON.parse(String(content || '').trim())
  } catch {
    return null
  }
  if (!parsed || parsed.sense === 0) return null
  const gloss = typeof parsed.gloss === 'string' ? parsed.gloss.trim() : ''
  if (!gloss) return null
  const exact = (candidates || []).filter((item) => item.gloss.trim() === gloss)
  if (exact.length === 1) return gloss
  const short = singleGloss(gloss)
  if (!short) return null
  const owners = (candidates || []).filter((item) => partsOf(item.gloss).includes(short))
  if (owners.length !== 1) return null
  return short
}

export function createNotebookSenseAdapter({
  endpoint,
  apiKey,
  model = 'qwen-flash',
  fetchImpl = fetch,
} = {}) {
  async function complete(prompt, signal) {
    if (!endpoint || !endpointAllowed(endpoint) || !apiKey) {
      const error = new Error('选义暂不可用')
      error.code = 'NOTEBOOK_SENSE_UNAVAILABLE'
      throw error
    }
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
        max_tokens: 64,
        response_format: { type: 'json_object' },
      }),
      signal,
      redirect: 'error',
    })
    if (!response.ok) {
      const error = new Error('这句话里的意思暂时没有得到')
      error.code = 'NOTEBOOK_SENSE_FAILED'
      error.retryable = response.status >= 500 || response.status === 429
      throw error
    }
    const payload = await response.json()
    if (payload?.model && payload.model !== model) {
      const error = new Error('选义模型不对')
      error.code = 'NOTEBOOK_SENSE_FAILED'
      throw error
    }
    return payload
  }

  async function pickHeadword({ word, sentence, heads }, signal) {
    const payload = await complete(`${HEAD_PROMPT}\n${JSON.stringify({ word, sentence, heads })}`, signal)
    return {
      headword: parseNotebookHeadword(payload?.choices?.[0]?.message?.content, heads.map((item) => item.headword)),
      usage: payload?.usage || null,
    }
  }

  async function pickSense({ word, sentence, candidates }, signal) {
    if (!endpoint || !endpointAllowed(endpoint) || !apiKey) {
      const error = new Error('选义暂不可用')
      error.code = 'NOTEBOOK_SENSE_UNAVAILABLE'
      throw error
    }
    const payload = await complete(
      `${PROMPT}\n${JSON.stringify({ word, sentence, senses: candidates.map((item) => ({ n: item.n, gloss: item.gloss })) })}`,
      signal,
    )
    return {
      gloss: parseNotebookGloss(payload?.choices?.[0]?.message?.content, candidates),
      usage: payload?.usage || null,
    }
  }

  return { pickHeadword, pickSense }
}
