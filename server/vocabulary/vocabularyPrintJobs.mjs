import { randomBytes } from 'node:crypto'

const JOB_TTL_MS = 2 * 60 * 1000
const jobs = new Map()

function purgeExpiredJobs(now = Date.now()) {
  for (const [id, job] of jobs) {
    if (job.expiresAt <= now) jobs.delete(id)
  }
}

export function createVocabularyPrintJob(userId, payload) {
  purgeExpiredJobs()
  const id = randomBytes(24).toString('base64url')
  jobs.set(id, {
    userId,
    payload: structuredClone(payload),
    expiresAt: Date.now() + JOB_TTL_MS,
  })
  return id
}

export function readVocabularyPrintJob(userId, id) {
  purgeExpiredJobs()
  const job = jobs.get(id)
  if (!job || job.userId !== userId) return null
  return structuredClone(job.payload)
}

export function deleteVocabularyPrintJob(id) {
  jobs.delete(id)
}
