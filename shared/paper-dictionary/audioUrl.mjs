const UPSTREAM_HOSTS = new Set(['upload.wikimedia.org', 'commons.wikimedia.org'])
// 本站随代码发布、Owner 验收过的高考词表合成发音；只认这两个正式目录。
const OWN_AUDIO_PATH = /^\/vocabulary-assets\/gaokao-frequency-v1\/audio\/google-neural2-(?:us-c|gb-d)-v1\/[a-z0-9-]+\.mp3$/
// Wikimedia Commons 真人录音的本站转码副本；upload.wikimedia.org 在中国内地通常打不开，
// 所以网站只播放本站副本，浏览器不直连 Wikimedia。
const MIRROR_AUDIO_PATH = /^\/dictionary-audio\/wikimedia-v1\/[0-9a-f]{16}\.mp3$/

export function allowedAudioUrl(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2048) return null
  if (OWN_AUDIO_PATH.test(value) || MIRROR_AUDIO_PATH.test(value)) return value
  return null
}

// 只用于构建期从 Wiktionary 抽取、下载录音，不得用来判断网站可播放的地址。
export function allowedUpstreamAudioUrl(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2048) return null
  let url
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.protocol !== 'https:') return null
  if (url.username || url.password) return null
  if (!UPSTREAM_HOSTS.has(url.hostname)) return null
  return url.toString()
}
