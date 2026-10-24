import { setTimeout as delay } from 'node:timers/promises'

const NETWORK_ERROR_CODES = new Set([
  'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE', 'ENETUNREACH',
  'EHOSTUNREACH', 'ENOTFOUND', 'EAI_AGAIN', 'UND_ERR_SOCKET', 'UND_ERR_CONNECT_TIMEOUT',
])

function isNetworkError(error) {
  return NETWORK_ERROR_CODES.has(error?.code)
    || error?.message === 'terminated'
    || (error?.cause && isNetworkError(error.cause))
}

async function responseBody(response) {
  return (response.headers.get('content-type') || '').includes('application/json')
    ? response.json() : response.text()
}

function httpError(response, body) {
  const error = new Error(`${response.status} ${body?.code || ''} ${body?.error || body || 'Review API failed'}`.trim())
  error.status = response.status
  if (body?.metrics) error.metrics = body.metrics
  return error
}

// This recovery belongs only to proofread-ocr. In particular, a POST body-read
// failure after HTTP headers arrive must never enter the replay path.
export async function confirmOcrWithReconciliation({
  origin, credentialHeaders, paperId, revisionId, input,
  fetchImpl = fetch, wait = delay, delayMs = 30_000,
  log = message => console.error(message),
}) {
  const paperPath = `/api/import-agent-reviews/papers/${encodeURIComponent(paperId)}`
  const confirmationPath = `/api/import-agent-reviews/revisions/${encodeURIComponent(revisionId)}/ocr-confirmation`
  const postPath = `${paperPath}/revisions/${encodeURIComponent(revisionId)}/proofread-ocr`
  // Serialize once: all attempts carry the exact same immutable request bytes.
  const body = JSON.stringify(input)
  const shellQuote = value => `'${String(value).replaceAll("'", "'\\''")}'`
  let attempts = 0
  let lastObserved = 'not_reconciled'
  const unknown = cause => Object.assign(new Error(
    `OCR confirmation UNKNOWN: revision=${revisionId}; POST attempts=${attempts}; lastObserved=${lastObserved}; `
      + `origin=${origin}; paperId=${paperId}; expectedBundleDigest=${input.bundleDigest}; `
      + `${cause.message}. Stop writes. Read-only check using existing credentials:\n`
      + `QUESTION_BANK_IMPORT_OPS_ORIGIN=${shellQuote(origin)} node scripts/import-pipeline/review.mjs status ${shellQuote(paperId)}\n`
      + `Inspect this revision's approval receipt; confirmation endpoint: GET ${origin}${confirmationPath}.`,
    { cause },
  ), { code: 'IMPORT_REVIEW_OCR_CONFIRMATION_UNKNOWN' })

  async function read(pathname, maxRetries = 3) {
    // Read-only transport failures may retry three times (four GETs total).
    for (let retries = 0; ; retries++) {
      let response
      try {
        response = await fetchImpl(`${origin}${pathname}`, {
          method: 'GET', redirect: 'manual', headers: { ...credentialHeaders },
        })
      } catch (error) {
        lastObserved = `${lastObserved}; GET ${pathname}: network error ${error.code || error.message}`
        if (!isNetworkError(error) || retries === maxRetries) throw error
        await wait(delayMs)
        continue
      }
      lastObserved = `${lastObserved}; GET ${pathname}: HTTP ${response.status}`
      return { response, body: await responseBody(response) }
    }
  }

  async function reconcile(allowReplay) {
    try {
      await wait(delayMs)
      const confirmation = await read(confirmationPath, allowReplay ? 3 : 0)
      if (confirmation.response.status === 200) {
        const receipt = confirmation.body?.receipt
        lastObserved = `confirmation=200; receipt revision=${receipt?.revisionId}; bundleDigest=${receipt?.bundleDigest}`
        if (receipt?.paperId !== paperId || receipt?.revisionId !== revisionId
          || receipt?.bundleDigest !== input.bundleDigest) {
          throw new Error('confirmation receipt identity mismatch')
        }
        log(`proofread-ocr: reconciled after network error (${revisionId}, POST attempts=${attempts})`)
        return confirmation.body
      }
      lastObserved = `confirmation=${confirmation.response.status} ${confirmation.body?.code || 'unknown_code'}`
      // Once POST response headers arrived, only an existing exact receipt can
      // resolve the outcome. Pending must never authorize another POST.
      if (!allowReplay) throw new Error('POST response body unreadable; no matching confirmation receipt')
      if (confirmation.response.status !== 404
        || confirmation.body?.code !== 'IMPORT_REVIEW_OCR_CONFIRMATION_PENDING') {
        throw new Error('unexpected OCR confirmation response')
      }
      const status = await read(paperPath)
      if (status.response.status !== 200) throw httpError(status.response, status.body)
      const revision = status.body?.revisions?.find(entry => entry.id === revisionId)
      lastObserved = `confirmation=404 IMPORT_REVIEW_OCR_CONFIRMATION_PENDING; `
        + `revision.state=${revision?.state || 'missing'}; latestRevisionId=${status.body?.latestRevisionId}; `
        + `bundleDigest=${revision?.bundleDigest}`
      if (status.body.latestRevisionId !== revisionId || revision?.state !== 'awaiting_review'
        || revision?.paperId !== paperId || revision?.reviewKind !== 'ocr'
        || revision?.bundleDigest !== input.bundleDigest) {
        throw new Error('revision is not the latest exact awaiting_review OCR revision')
      }
      if (attempts === 3) throw new Error('POST retry limit reached')
      return null
    } catch (reconciliationError) {
      throw unknown(reconciliationError)
    }
  }

  for (;;) {
    attempts++
    let response
    try {
      response = await fetchImpl(`${origin}${postPath}`, {
        method: 'POST', redirect: 'manual',
        headers: { ...credentialHeaders, 'content-type': 'application/json' }, body,
      })
    } catch (error) {
      if (!isNetworkError(error)) throw error
      log(`proofread-ocr: network error for ${revisionId} (POST attempt ${attempts}); reconciling before any retry`)
      const reconciled = await reconcile(true)
      if (reconciled) return reconciled
      continue
    }
    // HTTP failures (including redirects) never authorize a retry. If a body
    // cannot be read, one read-only receipt check may still resolve success.
    let result
    try {
      result = await responseBody(response)
    } catch (error) {
      lastObserved = `POST HTTP ${response.status}; body unreadable: ${error.message}`
      return reconcile(false)
    }
    if (!response.ok) throw httpError(response, result)
    return result
  }
}
