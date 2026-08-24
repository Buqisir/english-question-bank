#!/usr/bin/env node

import path from 'node:path'
import { mkdir, readFile, writeFile } from 'node:fs/promises'

const root = path.resolve(import.meta.dirname, '../..')
const qaPath = path.resolve(process.argv[2] ?? path.join(root, '.scratch/gaokao-audio-targeted-repair-v6/owner-qa-v5.json'))
const outputRoot = path.join(root, '.scratch/gaokao-audio-targeted-repair-v6')
const selectionPath = path.join(root, 'data/vocabulary/gaokao-frequency-google-neural2-voice-selection-v1.json')

const ipaByEntry = {
  'gaokao-frequency-0001-the': { american: 'ðə', british: 'ðə' },
  'gaokao-frequency-0139-become': { american: 'bɪˈkʌm' },
  'gaokao-frequency-0227-research': { british: 'ˈriːsɜːtʃ' },
  'gaokao-frequency-0363-enough': { american: 'ɪˈnʌf', british: 'ɪˈnʌf' },
  'gaokao-frequency-0446-until': { american: 'ənˈtɪl' },
  'gaokao-frequency-0468-p-m-pm': { american: 'ˌpiːˈɛm', british: 'ˌpiːˈɛm' },
  'gaokao-frequency-0469-hotel': { american: 'hoʊˈtɛl', british: 'həʊˈtel' },
  'gaokao-frequency-0477-event': { american: 'ɪˈvɛnt', british: 'ɪˈvent' },
  'gaokao-frequency-0478-reduce': { american: 'rɪˈduːs' },
  'gaokao-frequency-0580-within': { american: 'wɪˈðɪn' },
  'gaokao-frequency-0582-communication': { american: 'kəˌmjuːnəˈkeɪʃən' },
  'gaokao-frequency-0583-describe': { american: 'dɪˈskraɪb' },
  'gaokao-frequency-0617-remain': { american: 'rɪˈmeɪn' },
  'gaokao-frequency-0624-themselves': { american: 'ðəmˈsɛlvz' },
  'gaokao-frequency-0625-percent': { american: 'pɚˈsɛnt' },
  'gaokao-frequency-0634-alone': { american: 'əˈloʊn' },
  'gaokao-frequency-0652-accept': { american: 'əkˈsɛpt', british: 'əkˈsept' },
  'gaokao-frequency-0662-protect': { american: 'prəˈtɛkt' },
  'gaokao-frequency-0687-advance': { american: 'ədˈvæns' },
  'gaokao-frequency-0704-creative': { american: 'kriˈeɪtɪv', british: 'kriˈeɪtɪv' },
  'gaokao-frequency-0732-relate': { american: 'rɪˈleɪt' },
  'gaokao-frequency-0747-beyond': { american: 'bɪˈjɑːnd' },
  'gaokao-frequency-0832-a-m-am': { american: 'ˌeɪˈɛm', british: 'ˌeɪˈɛm' },
  'gaokao-frequency-0833-invite': { american: 'ɪnˈvaɪt' },
  'gaokao-frequency-0836-depend': { american: 'dɪˈpɛnd' },
  'gaokao-frequency-0849-imagine': { american: 'ɪˈmædʒɪn', british: 'ɪˈmædʒɪn' },
  'gaokao-frequency-0852-contain': { american: 'kənˈteɪn' },
  'gaokao-frequency-0865-respect': { american: 'rɪˈspɛkt' },
  'gaokao-frequency-0866-advice': { american: 'ədˈvaɪs', british: 'ədˈvaɪs' },
  'gaokao-frequency-0877-conduct': { american: 'kənˈdʌkt', british: 'kənˈdʌkt' },
  'gaokao-frequency-0878-unique': { american: 'juˈniːk', british: 'juˈniːk' },
  'gaokao-frequency-0994-reflect': { american: 'rɪˈflɛkt' },
  'gaokao-frequency-1011-ms': { british: 'mɪz' },
  'gaokao-frequency-1012-eventually': { american: 'ɪˈvɛntʃuəli', british: 'ɪˈventʃuəli' },
  'gaokao-frequency-1024-admit': { american: 'ədˈmɪt', british: 'ədˈmɪt' },
  'gaokao-frequency-1079-emotion': { british: 'ɪˈməʊʃən' },
  'gaokao-frequency-1107-economic': { american: 'ˌiːkəˈnɑːmɪk' },
  'gaokao-frequency-1164-unless': { american: 'ənˈlɛs' },
  'gaokao-frequency-1289-resource': { american: 'rɪˈsɔːrs' },
  'gaokao-frequency-1364-evaluate': { british: 'ɪˈvæljueɪt' },
  'gaokao-frequency-1366-donate': { american: 'doʊˈneɪt' },
  'gaokao-frequency-1372-separate': { american: 'ˈsɛpərət', british: 'ˈseprət' },
  'gaokao-frequency-1402-electricity': { american: 'ɪˌlɛkˈtrɪsəti', british: 'ɪˌlekˈtrɪsɪti' },
  'gaokao-frequency-1419-supply': { american: 'səˈplaɪ' },
  'gaokao-frequency-1454-organization': { american: 'ˌɔːrɡənəˈzeɪʃən' },
  'gaokao-frequency-1513-presentation': { american: 'ˌprɛzənˈteɪʃən' },
  'gaokao-frequency-1582-debate': { american: 'dɪˈbeɪt' },
  'gaokao-frequency-1689-diverse': { american: 'daɪˈvɝːs', british: 'daɪˈvɜːs' },
  'gaokao-frequency-1766-insist': { american: 'ɪnˈsɪst' },
  'gaokao-frequency-1781-accommodation': { american: 'əˌkɑːməˈdeɪʃən' },
  'gaokao-frequency-1816-pretend': { american: 'prɪˈtɛnd' },
  'gaokao-frequency-1882-behave': { american: 'bɪˈheɪv' },
  'gaokao-frequency-1887-hello': { american: 'həˈloʊ', british: 'həˈləʊ' },
  'gaokao-frequency-1902-maintain': { american: 'meɪnˈteɪn' },
  'gaokao-frequency-2002-advertisement': { american: 'ˌædvərˈtaɪzmənt' },
  'gaokao-frequency-2035-suspect': { american: 'səˈspɛkt', british: 'səˈspekt' },
  'gaokao-frequency-2081-violin': { american: 'ˌvaɪəˈlɪn', british: 'ˌvaɪəˈlɪn' },
  'gaokao-frequency-2172-digest': { american: 'daɪˈdʒɛst', british: 'daɪˈdʒest' },
  'gaokao-frequency-2213-energetic': { american: 'ˌɛnərˈdʒɛtɪk' },
  'gaokao-frequency-2214-alongside': { american: 'əˌlɔːŋˈsaɪd', british: 'əˌlɒŋˈsaɪd' },
  'gaokao-frequency-2222-fundamental': { american: 'ˌfʌndəˈmɛntəl', british: 'ˌfʌndəˈmentəl' },
  'gaokao-frequency-2262-database': { american: 'ˈdeɪtəˌbeɪs' },
  'gaokao-frequency-2315-ecology': { british: 'iˈkɒlədʒi' },
  'gaokao-frequency-2333-refresh': { american: 'rɪˈfrɛʃ', british: 'rɪˈfreʃ' },
  'gaokao-frequency-2396-ballet': { american: 'bæˈleɪ' },
  'gaokao-frequency-2463-mankind': { american: 'mænˈkaɪnd' },
  'gaokao-frequency-2486-illegal': { american: 'ɪˈliːɡəl', british: 'ɪˈliːɡəl' },
  'gaokao-frequency-2515-japan': { american: 'dʒəˈpæn' },
  'gaokao-frequency-2519-receipt': { american: 'rɪˈsiːt', british: 'rɪˈsiːt' },
  'gaokao-frequency-2524-contrary': { british: 'ˈkɒntrəri' },
  'gaokao-frequency-2536-dismiss': { american: 'dɪsˈmɪs', british: 'dɪsˈmɪs' },
  'gaokao-frequency-2585-distinct': { american: 'dɪˈstɪŋkt' },
  'gaokao-frequency-2602-congratulation': { american: 'kənˌɡrætʃəˈleɪʃən', british: 'kənˌɡrætʃuˈleɪʃən' },
  'gaokao-frequency-2619-superb': { american: 'suːˈpɜːrb', british: 'suːˈpɜːb' },
  'gaokao-frequency-2634-potato': { american: 'pəˈteɪtoʊ' },
  'gaokao-frequency-2656-erupt': { american: 'ɪˈrʌpt', british: 'ɪˈrʌpt' },
  'gaokao-frequency-2662-occupation': { american: 'ˌɑːkjəˈpeɪʃən' },
  'gaokao-frequency-2716-applaud': { american: 'əˈplɔːd', british: 'əˈplɔːd' },
  'gaokao-frequency-2727-restrict': { american: 'rɪˈstrɪkt', british: 'rɪˈstrɪkt' },
  'gaokao-frequency-2739-ad-a-d': { british: 'ˌeɪˈdiː' },
  'gaokao-frequency-2741-canteen': { american: 'kænˈtiːn', british: 'kænˈtiːn' },
  'gaokao-frequency-2754-eighteen': { american: 'ˌeɪˈtiːn', british: 'ˌeɪˈtiːn' },
  'gaokao-frequency-2758-pe-p-e': { british: 'ˌpiːˈiː' },
  'gaokao-frequency-2760-sixteen': { american: 'ˌsɪkˈstiːn', british: 'ˌsɪkˈstiːn' },
  'gaokao-frequency-2766-download': { american: 'ˌdaʊnˈloʊd', british: 'ˌdaʊnˈləʊd' },
  'gaokao-frequency-2775-dimension': { american: 'dɪˈmɛnʃən' },
  'gaokao-frequency-2778-frontier': { american: 'frʌnˈtɪr' },
  'gaokao-frequency-2789-subscribe': { american: 'səbˈskraɪb', british: 'səbˈskraɪb' },
  'gaokao-frequency-2804-correspond': { american: 'ˌkɔːrəˈspɑːnd', british: 'ˌkɒrɪˈspɒnd' },
  'gaokao-frequency-2823-dolphin': { american: 'ˈdɑːlfɪn', british: 'ˈdɒlfɪn' },
  'gaokao-frequency-2824-anticipate': { american: 'ænˈtɪsəˌpeɪt' },
  'gaokao-frequency-2830-compose': { american: 'kəmˈpoʊz' },
  'gaokao-frequency-2866-downstairs': { american: 'ˌdaʊnˈstɛrz', british: 'ˌdaʊnˈsteəz' },
  'gaokao-frequency-2921-kangaroo': { american: 'ˌkæŋɡəˈruː', british: 'ˌkæŋɡəˈruː' },
  'gaokao-frequency-2938-bow': { american: 'baʊ', british: 'baʊ' },
  'gaokao-frequency-2951-directory': { british: 'dɪˈrektəri' },
  'gaokao-frequency-2952-domain': { american: 'doʊˈmeɪn' },
  'gaokao-frequency-2955-entitle': { american: 'ɪnˈtaɪtəl' },
  'gaokao-frequency-2956-equator': { american: 'ɪˈkweɪtər', british: 'ɪˈkweɪtə' },
  'gaokao-frequency-2970-liberation': { american: 'ˌlɪbəˈreɪʃən' },
}

const spokenTextByEntry = {
  'gaokao-frequency-0468-p-m-pm': 'PM',
  'gaokao-frequency-0832-a-m-am': 'AM',
  'gaokao-frequency-2739-ad-a-d': 'AD',
  'gaokao-frequency-2758-pe-p-e': 'PE',
}

const verdictAccents = {
  american_fail: ['american'],
  british_fail: ['british'],
  both_fail: ['american', 'british'],
}

const escapeXml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('"', '&quot;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')

const qaPayload = JSON.parse(await readFile(qaPath, 'utf8'))
if (qaPayload.qaTarget !== 'gaokao-frequency-full-3000-audio-repair-v5' || !Array.isArray(qaPayload.qa)) {
  throw new Error('Expected the V5 owner QA export')
}
if (qaPayload.qa.length !== 117 || qaPayload.qa.some((entry) => entry.status !== 'pass' && entry.status !== 'fail')) {
  throw new Error('V5 owner QA must contain 117 completed entries')
}

const failed = qaPayload.qa.filter((entry) => entry.audioVerdict !== 'pass')
if (failed.length !== 100) throw new Error(`Expected 100 failed words, found ${failed.length}`)
if (new Set(failed.map((entry) => entry.entryId)).size !== failed.length) throw new Error('Duplicate V5 QA entry IDs')

const repairEntries = failed.map((entry) => {
  const accents = verdictAccents[entry.audioVerdict]
  if (!accents) throw new Error(`Unsupported verdict ${entry.audioVerdict} for ${entry.entryId}`)
  const ipa = ipaByEntry[entry.entryId]
  if (!ipa) throw new Error(`Missing targeted IPA for ${entry.entryId}`)
  for (const accent of accents) {
    if (!ipa[accent]) throw new Error(`Missing ${accent} IPA for ${entry.entryId}`)
    if (!entry[`${accent}Issue`]?.trim()) throw new Error(`Missing owner ${accent} issue for ${entry.entryId}`)
  }
  return {
    entryId: entry.entryId,
    headword: entry.headword,
    verdict: entry.audioVerdict,
    accents,
    ownerIssue: Object.fromEntries(accents.map((accent) => [accent, entry[`${accent}Issue`].trim()])),
    ipa: Object.fromEntries(accents.map((accent) => [accent, ipa[accent]])),
    spokenText: spokenTextByEntry[entry.entryId] ?? entry.headword.replace(/\s*[,;/]\s*.*/u, '').trim(),
  }
})

const makeScript = (accent, voice) => ({
  schemaVersion: 'gaokao-frequency-audio-script-v1',
  programId: 'gaokao-curriculum-3000-frequency-v1',
  voice,
  entries: repairEntries
    .filter((entry) => entry.accents.includes(accent))
    .map((entry) => ({
      id: entry.entryId,
      headword: entry.headword,
      audio: {
        text: entry.spokenText,
        ssml: `<speak><phoneme alphabet="ipa" ph="${escapeXml(entry.ipa[accent])}">${escapeXml(entry.spokenText)}</phoneme></speak>`,
      },
    })),
})

const selection = JSON.parse(await readFile(selectionPath, 'utf8'))
selection.american.version = 'google-neural2-us-c-targeted-ipa-v6'
selection.british.version = 'google-neural2-gb-d-targeted-ipa-v6'

await mkdir(outputRoot, { recursive: true })
await Promise.all([
  writeFile(path.join(outputRoot, 'owner-qa-v5.json'), `${JSON.stringify(qaPayload, null, 2)}\n`),
  writeFile(path.join(outputRoot, 'repair-spec.json'), `${JSON.stringify({
    schemaVersion: 'gaokao-frequency-targeted-audio-repair-v6',
    status: 'candidate_pending_owner_reqa',
    sourceQaTarget: qaPayload.qaTarget,
    sourceQaExportedAt: qaPayload.exportedAt,
    strategy: 'owner-issue-specific-full-word-ipa-lock-without-extra-emphasis',
    repairWordCount: repairEntries.length,
    repairAccentCount: repairEntries.reduce((count, entry) => count + entry.accents.length, 0),
    entries: repairEntries,
  }, null, 2)}\n`),
  writeFile(path.join(outputRoot, 'selection.json'), `${JSON.stringify(selection, null, 2)}\n`),
  writeFile(path.join(outputRoot, 'american-script.json'), `${JSON.stringify(makeScript('american', selection.american.voice), null, 2)}\n`),
  writeFile(path.join(outputRoot, 'british-script.json'), `${JSON.stringify(makeScript('british', selection.british.voice), null, 2)}\n`),
])

console.log(JSON.stringify({
  repairWords: repairEntries.length,
  american: repairEntries.filter((entry) => entry.accents.includes('american')).length,
  british: repairEntries.filter((entry) => entry.accents.includes('british')).length,
  outputRoot,
}, null, 2))
