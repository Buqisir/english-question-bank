const stageLabels = {
  core: "课标核心词",
  basic: "基础识记词",
  recognition: "认识拓展词",
}

const elements = Object.fromEntries(
  [
    "audio-error", "day-progress", "decision-mark", "export-button", "jump-form", "jump-order",
    "pass-button", "pass-count", "pending-count", "play-button", "problem-button", "problem-count",
    "progress-fill", "replay-button", "reviewed-count", "save-status", "undo-button", "word-audio",
    "word-day", "word-heading", "word-order", "word-part-of-speech", "word-phonetic", "word-sense",
  ].map((id) => [id.replaceAll("-", "_"), document.querySelector(`#${id}`)]),
)

let entries = []
let entryIds = new Set()
let state = { schemaVersion: 1, cursor: 0, decisions: {}, history: [], updatedAt: null }
let saveQueue = Promise.resolve()

function currentEntry() {
  return entries[state.cursor] ?? entries.at(-1)
}

function counts() {
  const values = Object.values(state.decisions)
  const pass = values.filter((decision) => decision.status === "pass").length
  const problem = values.filter((decision) => decision.status === "problem").length
  return { pass, problem, reviewed: pass + problem }
}

function render() {
  const entry = currentEntry()
  if (!entry) return
  const summary = counts()
  const decision = state.decisions[entry.id]
  const dayEntries = entries.filter((candidate) => candidate.day === entry.day && candidate.stage === entry.stage)
  const dayReviewed = dayEntries.filter((candidate) => state.decisions[candidate.id]).length

  elements.word_order.textContent = `第 ${entry.sourceOrder} 词`
  elements.word_day.textContent = `${stageLabels[entry.stage] ?? entry.stage} · Day ${entry.day}`
  elements.word_heading.textContent = entry.headword
  elements.word_phonetic.textContent = entry.phonetic
  elements.word_part_of_speech.textContent = entry.partOfSpeech
  elements.word_sense.textContent = entry.teachingSense
  elements.decision_mark.textContent = decision?.status === "pass" ? "已通过" : decision?.status === "problem" ? "已标问题" : "待判断"
  elements.decision_mark.dataset.status = decision?.status ?? "pending"
  elements.reviewed_count.textContent = String(summary.reviewed)
  elements.pass_count.textContent = String(summary.pass)
  elements.problem_count.textContent = String(summary.problem)
  elements.pending_count.textContent = String(entries.length - summary.reviewed)
  elements.progress_fill.style.width = `${(summary.reviewed / entries.length) * 100}%`
  elements.day_progress.textContent = `Day ${entry.day} · ${dayReviewed} / ${dayEntries.length}`
  elements.jump_order.value = String(entry.sourceOrder)
  elements.audio_error.hidden = true

  if (elements.word_audio.dataset.entryId !== entry.id) {
    elements.word_audio.pause()
    elements.word_audio.src = entry.audioUrl
    elements.word_audio.dataset.entryId = entry.id
    elements.word_audio.load()
  }
}

function playCurrent({ restart = true } = {}) {
  elements.audio_error.hidden = true
  if (restart) elements.word_audio.currentTime = 0
  return elements.word_audio.play().catch(() => {
    elements.audio_error.hidden = false
  })
}

function togglePlayback() {
  if (elements.word_audio.paused) void playCurrent({ restart: false })
  else elements.word_audio.pause()
}

function setSaveStatus(label, status = "ok") {
  elements.save_status.textContent = label
  elements.save_status.dataset.state = status
}

function saveState() {
  const payload = { ...state, updatedAt: new Date().toISOString() }
  state.updatedAt = payload.updatedAt
  setSaveStatus("正在保存…")
  saveQueue = saveQueue
    .catch(() => undefined)
    .then(async () => {
      const response = await fetch("/api/state", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!response.ok) throw new Error(`save failed: ${response.status}`)
      setSaveStatus("进度已保存")
    })
    .catch(() => setSaveStatus("保存失败，先导出结果", "error"))
}

function decide(status) {
  const entry = currentEntry()
  if (!entry) return
  state.history.push({
    entryId: entry.id,
    previousDecision: state.decisions[entry.id] ?? null,
    previousCursor: state.cursor,
  })
  if (state.history.length > entries.length) state.history.shift()
  state.decisions[entry.id] = { status, decidedAt: new Date().toISOString() }
  state.cursor = Math.min(state.cursor + 1, entries.length - 1)
  render()
  saveState()
  if (!state.decisions[currentEntry().id]) void playCurrent()
}

function undo() {
  const previous = state.history.pop()
  if (!previous) return
  if (previous.previousDecision) state.decisions[previous.entryId] = previous.previousDecision
  else delete state.decisions[previous.entryId]
  state.cursor = previous.previousCursor
  render()
  saveState()
  void playCurrent()
}

function jumpToOrder(order) {
  const index = entries.findIndex((entry) => entry.sourceOrder === order)
  if (index < 0) return
  state.cursor = index
  render()
  saveState()
  void playCurrent()
}

function exportResults() {
  const summary = counts()
  const problemEntries = entries
    .filter((entry) => state.decisions[entry.id]?.status === "problem")
    .map((entry) => ({
      entryId: entry.id,
      sourceOrder: entry.sourceOrder,
      headword: entry.headword,
      phonetic: entry.phonetic,
      day: entry.day,
      stage: entry.stage,
      decision: state.decisions[entry.id],
    }))
  const payload = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    totalEntries: entries.length,
    reviewedCount: summary.reviewed,
    passCount: summary.pass,
    problemCount: summary.problem,
    cursorSourceOrder: currentEntry()?.sourceOrder ?? null,
    problemEntries,
    decisions: state.decisions,
  }
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: "application/json" })
  const link = document.createElement("a")
  link.href = URL.createObjectURL(blob)
  link.download = `wanwei-audio-owner-qa-${new Date().toISOString().slice(0, 10)}.json`
  link.click()
  URL.revokeObjectURL(link.href)
}

function bindEvents() {
  elements.pass_button.addEventListener("click", () => decide("pass"))
  elements.problem_button.addEventListener("click", () => decide("problem"))
  elements.undo_button.addEventListener("click", undo)
  elements.replay_button.addEventListener("click", () => void playCurrent())
  elements.play_button.addEventListener("click", togglePlayback)
  elements.export_button.addEventListener("click", exportResults)
  elements.jump_form.addEventListener("submit", (event) => {
    event.preventDefault()
    jumpToOrder(Number(elements.jump_order.value))
  })
  elements.word_audio.addEventListener("error", () => {
    elements.audio_error.hidden = false
  })
  window.addEventListener("keydown", (event) => {
    if (event.target instanceof HTMLInputElement) return
    const actions = {
      ArrowUp: () => decide("pass"),
      ArrowDown: () => decide("problem"),
      ArrowLeft: undo,
      ArrowRight: () => void playCurrent(),
      " ": togglePlayback,
    }
    const action = actions[event.key]
    if (!action) return
    event.preventDefault()
    action()
  })
}

async function start() {
  const [entriesResponse, stateResponse] = await Promise.all([fetch("/api/entries"), fetch("/api/state")])
  if (!entriesResponse.ok || !stateResponse.ok) throw new Error("QA data did not load")
  entries = await entriesResponse.json()
  entryIds = new Set(entries.map((entry) => entry.id))
  const stored = await stateResponse.json()
  state = {
    ...state,
    ...stored,
    decisions: Object.fromEntries(Object.entries(stored.decisions ?? {}).filter(([entryId]) => entryIds.has(entryId))),
    history: Array.isArray(stored.history) ? stored.history.filter((item) => entryIds.has(item.entryId)) : [],
  }
  if (!Number.isInteger(state.cursor) || state.cursor < 0 || state.cursor >= entries.length) state.cursor = 0
  bindEvents()
  render()
  setSaveStatus(state.updatedAt ? "已恢复上次进度" : "尚未开始")
}

start().catch((error) => {
  console.error(error)
  setSaveStatus("页面载入失败", "error")
})
