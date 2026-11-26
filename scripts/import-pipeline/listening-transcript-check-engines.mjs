import { execFile } from 'node:child_process'
import { readFile, writeFile, mkdir, mkdtemp, rename, rm, symlink } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)
const trial = path.join(homedir(), '.cache/eqbank/asr-trial')
export const appleSource = path.join(import.meta.dirname, 'transcribe-listening-apple.swift')
export const parakeet = path.join(trial, 'fluid-runner/.build/release/ASRTrial')
export const readJson = async file => JSON.parse(await readFile(file, 'utf8'))

async function cacheFile(file, produce) {
  try {
    return await readJson(file)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  const result = await produce()
  const temporary = `${file}.${process.pid}.tmp`
  await writeFile(temporary, JSON.stringify(result), { mode: 0o600 })
  await rename(temporary, file)
  return result
}

const cut = (audio, { startSeconds, endSeconds }, destination, extra = []) =>
  run('ffmpeg', ['-nostdin', '-loglevel', 'error', '-ss', String(startSeconds), '-i', audio,
    '-t', String(endSeconds - startSeconds), '-ac', '1', '-ar', '16000', ...extra, destination],
  { encoding: 'buffer', timeout: 60_000 })

export async function localEngines(audio, groups, cache, work, env) {
  const clips = path.join(work, 'clips')
  let clipsReady
  const prepareClips = () => clipsReady ??= mkdir(clips).then(() =>
    Promise.all(groups.map(({ key, occurrence }) => cut(audio, occurrence, path.join(clips, `${key}.wav`)))))
  const apple = cacheFile(path.join(cache, 'apple.json'), async () => {
    await prepareClips()
    const executable = path.join(work, 'apple-transcribe')
    await run('swiftc', ['-parse-as-library', '-O', appleSource, '-o', executable], { env, timeout: 120_000 })
    const results = {}
    for (const { key } of groups) {
      results[key] = await cacheFile(path.join(cache, `apple-${key}.json`), async () => {
        const raw = path.join(work, `apple-${key}.json`)
        await run(executable, [path.join(clips, `${key}.wav`), raw, 'en_US'], { env, timeout: 120_000 })
        const data = await readJson(raw)
        return data.result.segments.flatMap(segment => segment.runs.map(run => ({
          text: run.text, start: run.start, end: run.end,
        })))
      })
    }
    return results
  })
  const fluid = cacheFile(path.join(cache, 'parakeet-v2.json'), async () => {
    await prepareClips()
    await symlink(path.join(trial, 'fluid-model'), path.join(work, 'fluid-model'), 'dir')
    await run(parakeet, [], { cwd: work, env, timeout: 240_000 })
    const raw = await readJson(path.join(work, 'fluid-results.json'))
    return Object.fromEntries(Object.entries(raw).map(([key, result]) =>
      [key, result.words.map(word => ({ text: word.word, start: word.startTime, end: word.endTime }))]))
  })
  const results = await Promise.allSettled([apple, fluid])
  for (const result of results) if (result.status === 'rejected') throw result.reason
  return { apple: results[0].value, 'parakeet-v2': results[1].value }
}

async function requestClip(audio, range, model) {
  const file = await readFile(path.join(homedir(), '.config/openai/speech-to-text.env'), 'utf8')
  const settings = Object.fromEntries([...file.matchAll(/^(OPENAI_[A-Z_]+)=(.*?)\s*$/gmu)]
    .map(([, key, value]) => [key, value.replace(/^(['"])(.*)\1$/u, '$2')]))
  const origin = settings.OPENAI_BASE_URL?.replace(/\/+$/u, '')
  if (origin !== 'https://api.openai.com/v1' || !settings.OPENAI_API_KEY) {
    throw new Error('OpenAI 转写配置缺少官方地址或密钥')
  }
  const { stdout } = await cut(audio, range, 'pipe:1', ['-b:a', '48k', '-f', 'mp3'])
  const form = new FormData()
  form.set('model', model)
  form.set('language', 'en')
  form.set('response_format', 'json')
  form.set('file', new Blob([stdout], { type: 'audio/mpeg' }), 'clip.mp3')
  const response = await fetch(`${origin}/audio/transcriptions`, {
    method: 'POST', body: form, redirect: 'error',
    headers: { Authorization: `Bearer ${settings.OPENAI_API_KEY}` }, signal: AbortSignal.timeout(90_000),
  })
  if (!response.ok) throw new Error(`OpenAI 转写 HTTP ${response.status}`)
  const { text } = await response.json()
  if (typeof text !== 'string') throw new Error('OpenAI 转写响应缺少文本')
  return { text }
}

export const remoteEngine = (audio, range, cache, model = 'gpt-transcribe') => cacheFile(
  path.join(cache, `${model}-${range.startSeconds}-${range.endSeconds}.json`),
  () => requestClip(audio, range, model),
)

export async function withWork(runCheck) {
  const work = await mkdtemp('/private/tmp/eqb-transcript-check.')
  try {
    return await runCheck(work, { ...process.env, TMPDIR: work, CLANG_MODULE_CACHE_PATH: path.join(work, 'swift-cache') })
  } finally {
    await rm(work, { recursive: true, force: true })
  }
}
