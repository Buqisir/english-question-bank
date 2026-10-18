import { readFileSync } from 'node:fs'
import path from 'node:path'
import { validateAuthoredPublicSearchMetadata } from '../../server/paper-import-ai/publicSearchMetadata.mjs'

const json = file => JSON.parse(readFileSync(file, 'utf8'))

// Old batches already marked round2 done before this gate existed. The finish
// entry uses the same gate as round2, without finalizing or writing public files.
export function checkSearchMetadataFiles({ fastDirectory, paperDirectory }) {
  const request = json(path.join(fastDirectory, 'search-metadata-request.json'))
  const manifest = json(path.join(paperDirectory, 'universal-source-manifest.json'))
  let authored
  try { authored = json(path.join(fastDirectory, 'search-metadata-authored.json')) } catch (error) {
    return [{ code: 'PUBLIC_METADATA_AUTHORED_JSON_INVALID', path: '$', message: error.message,
      allowedValues: request.outputContract }]
  }
  return validateAuthoredPublicSearchMetadata({
    authored,
    materialization: json(path.join(paperDirectory, manifest.materializationPath)),
    ...request.binding,
  })
}

export async function ensureSearchMetadata({ check, rewrite, maxRewrites = 2 }) {
  for (let attempt = 0; ; attempt += 1) {
    const issues = await check()
    if (!issues.length) return
    if (attempt >= maxRewrites) {
      throw Object.assign(new Error(`检索 metadata 重写 ${maxRewrites} 次仍不合格：${JSON.stringify(issues)}`),
        { kind: 'search_metadata_check_failed', issues })
    }
    await rewrite(issues, attempt + 1)
  }
}
