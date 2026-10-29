import { sha256, digestJson } from '../../../shared/paper-canonical/stable.mjs'

// Text-only public-seam fixture. No PDF parser, image generation or raster job.
export const historicalTexts = ['第四部分 写作', '第一节（满分15分）', '参考范文',
  'An original application sample.', '评分标准', '应用文评分正文。',
  '第二节（满分25分）', '参考范文', 'An original continuation sample.', '评分原则', '续写评分正文。']
export const qingdaoTexts = ['第四部分：写作（满分40分）', '第一节（满分15分）', '参考范文（略）',
  '评分细则（格式错扣1分）：', '应用文评分第一段。', '应用文评分第二段。',
  '第二节（满分25分）', '评分原则', '续写评分第一段。', '各档次给分范围及要求：',
  '续写评分第二段。', '英语听力原文', 'Text 1', 'M: A synthetic recording.']
export function textInput(pageTexts = [historicalTexts]) {
  const bytes = Buffer.from('Immutable synthetic source identity; not a renderable PDF.')
  const document = { documentId: 'answers', role: 'official_answers', mediaType: 'application/pdf',
    sha256: sha256(bytes), byteLength: bytes.length, pageCount: pageTexts.length }
  const materialization = { paperId: 'paper-source-title-compat', documents: [document],
    groups: ['application', 'continuation'].map(taskType => ({ groupId: taskType, writingTask: { taskType } })) }
  const pages = pageTexts.map((texts, p) => ({ page: p + 1, visualClassifications: [], furnitureObservationIds: [],
    orderedItems: texts.map((text, i) => ({ text, itemId: `p${p + 1}:i${i}`, observationIds: [`p${p + 1}:w${i}`] })) }))
  const confirmation = { schemaVersion: 'nck1-ocr-source-confirmation-v3', documents: [{ documentId: 'answers', pages }] }
  const evidence = { documents: [{ documentId: 'answers', pages: pages.map(page => ({
    page: page.page, regions: [], observations: page.orderedItems.map((item, i) => ({
      observationId: item.observationIds[0], text: item.text,
      region: { x: .1, y: .12 + i * .025, width: .7, height: .02 },
    })),
  })) }] }
  const sourceInput = { documents: [{ documentId: 'answers', bytes }],
    ocrSourceBytes: { evidenceBytes: Buffer.from(JSON.stringify(evidence)),
      confirmationBytes: Buffer.from(JSON.stringify(confirmation)) } }
  return { materialization, evidence, confirmation, sourceInput, sourceDigest: sha256('synthetic-source'),
    candidateDigest: digestJson(materialization) }
}
