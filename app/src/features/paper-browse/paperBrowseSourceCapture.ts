import type { PaperAssetV1 } from '../../domain/paperAsset.ts'

// 整卷预览读卷面（UI 体检 2026-11-16 第 2 条）：Ticket 26 收进来的老卷，paper-asset.json 不是卷面本身，
// 而是 source-capture-v1 外壳，真正的卷面在外壳里唯一一份 asset-projection 证据文件中。
// 打印那边早就这样拆（server/paper-canonical/sourceAssetRepresentation.mjs 的
// loadCanonicalSourceAssetRepresentation）；这里照同样的规矩拆：只认一份、路径在 source-evidence/ 下、
// 字节数和 sha256 都对上才用。哪一条不对就停，不猜。

type SourceCaptureDocument = {
  roles?: string[]
  sha256?: string
  immutableArtifactRef?: { relativePath?: string; sha256?: string; byteLength?: number }
}

function unreadable(reason: string): Error {
  return new Error(`这份卷的卷面文件对不上（${reason}），没有拿来显示。`)
}

async function sha256Of(bytes: ArrayBuffer): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  return `sha256:${Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('')}`
}

export async function resolveScreenPaperAsset(
  sourceAsset: unknown,
  assetBase: string,
  fetchImpl: typeof fetch,
): Promise<PaperAssetV1> {
  const raw = sourceAsset as { schemaVersion?: string; content?: { blocks?: unknown }; documents?: SourceCaptureDocument[] }
  if (Array.isArray(raw?.content?.blocks)) return sourceAsset as PaperAssetV1
  if (raw?.schemaVersion !== 'source-capture-v1') throw unreadable('不认识的格式')
  const documents = (raw.documents ?? []).filter((document) => document.roles?.includes('asset-projection'))
  if (documents.length !== 1) throw unreadable('卷面证据不是唯一一份')
  const [document] = documents
  const ref = document.immutableArtifactRef
  const relativePath = ref?.relativePath
  if (typeof relativePath !== 'string' || !relativePath.startsWith('source-evidence/') || relativePath.includes('..')) {
    throw unreadable('卷面证据路径不对')
  }
  const response = await fetchImpl(`${assetBase}/${relativePath}`)
  if (!response.ok) throw unreadable('卷面证据取不到')
  const bytes = await response.arrayBuffer()
  const digest = await sha256Of(bytes)
  if (digest !== document.sha256 || digest !== ref?.sha256 || bytes.byteLength !== ref?.byteLength) {
    throw unreadable('卷面证据校验不过')
  }
  let asset: { content?: { blocks?: unknown } }
  try {
    asset = JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    throw unreadable('卷面证据不是 JSON')
  }
  if (!Array.isArray(asset?.content?.blocks)) throw unreadable('卷面证据里没有内容')
  return asset as PaperAssetV1
}
