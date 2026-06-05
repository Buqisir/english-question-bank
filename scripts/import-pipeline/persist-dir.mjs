// Persist all labels-out/<groupId>.json into the DB via shipped exports.
// Run with the API STOPPED (bind opens a write connection). bind re-normalizes
// (taxonomy-validates) internally, so out-of-vocabulary labels are dropped, not stored.
import { readFileSync, readdirSync } from 'node:fs'
import { bindTopicLabelsToQuestionGroup } from '../../server/api.mjs'

const dir = process.argv[2] || '/Users/huangxuewei/Projects/english-question-bank/.scratch/import-pilot/labels-out'
const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort()
let total = 0
let groups = 0
let dropped = 0
const fails = []
for (const f of files) {
  const groupId = f.replace(/\.json$/, '')
  try {
    const raw = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'))
    const inN = Array.isArray(raw.topicLabels) ? raw.topicLabels.length : 0
    const res = bindTopicLabelsToQuestionGroup(groupId, raw.topicLabels)
    total += res.topicLabels.length
    const d = inN - res.topicLabels.length
    if (d > 0) {
      dropped += d
      console.log(`${groupId}: persisted=${res.topicLabels.length}  ⚠ DROPPED=${d}`)
    }
    groups++
  } catch (e) {
    fails.push({ groupId, error: e.message })
    console.log(`${groupId}: FAIL ${e.message}`)
  }
}
console.log(`\nPersisted ${total} labels across ${groups} groups; dropped=${dropped}; failed=${fails.length}`)
if (fails.length) console.log('FAILED:', JSON.stringify(fails.map((x) => x.groupId)))
