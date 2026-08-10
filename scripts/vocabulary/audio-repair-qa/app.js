const elements = Object.fromEntries(
  [
    "audio-error", "decision-mark", "entry-progress", "export-button", "jump-form", "jump-index",
    "original-button", "pending-count", "play-button", "problem-note", "progress-fill", "replay-button",
    "problem-note-label", "review-total", "reviewed-count", "save-status", "select-button", "selected-count", "undo-button", "unresolved-button",
    "unresolved-count", "word-audio", "word-heading", "word-order", "word-part-of-speech", "word-phonetic", "word-sense",
  ].map((id) => [id.replaceAll("-", "_"), document.querySelector(`#${id}`)]),
)

const candidateButtons = [...document.querySelectorAll("[data-candidate]")]
let entries = []
let entryIds = new Set()
let state = { schemaVersion: 1, batchId: "wanwei-audio-repair-v1", cursor: 0, decisions: {}, history: [], updatedAt: null }
let activeSource = { type: "candidate", label: "A" }
let saveQueue = Promise.resolve()

function currentEntry() {
  return entries[state.cursor] ?? entries.at(-1)
}

function counts() {
  const values = Object.values(state.decisions)
  const selected = values.filter((decision) => decision.status === "selected").length
  const unresolved = values.filter((decision) => decision.status === "unresolved").length
  return { selected, unresolved, reviewed: selected + unresolved }
}

function activeAudio(entry) {
  if (activeSource.type === "original") return { url: entry.originalUrl, label: "原版" }
  const candidate = entry.candidates.find((item) => item.label === activeSource.label)
  return { url: candidate?.audioUrl, label: `修复 ${activeSource.label}` }
}

function loadActiveAudio({ autoplay = false } = {}) {
  const entry = currentEntry()
  if (!entry) return
  const source = activeAudio(entry)
  elements.audio_error.hidden = true
  elements.word_audio.pause()
  elements.word_audio.src = source.url
  elements.word_audio.dataset.entryId = entry.entryId
  elements.word_audio.dataset.source = source.label
  elements.word_audio.load()
  if (autoplay) void playCurrent()
}

function render({ entryChanged = false, autoplay = false } = {}) {
  const entry = currentEntry()
  if (!entry) return
  const summary = counts()
  const decision = state.decisions[entry.entryId]
  if (entryChanged) {
    activeSource = decision?.status === "selected"
      ? { type: "candidate", label: decision.candidate }
      : { type: "candidate", label: "A" }
  }

  elements.word_order.textContent = `原书第 ${entry.sourceOrder} 词`
  elements.word_heading.textContent = entry.headword
  elements.word_phonetic.textContent = entry.phonetic
  elements.word_part_of_speech.textContent = entry.partOfSpeech
  elements.word_sense.textContent = entry.teachingSense
  elements.entry_progress.textContent = `问题词 ${state.cursor + 1} / ${entries.length}`
  elements.reviewed_count.textContent = String(summary.reviewed)
  elements.selected_count.textContent = String(summary.selected)
  elements.unresolved_count.textContent = String(summary.unresolved)
  elements.pending_count.textContent = String(entries.length - summary.reviewed)
  elements.progress_fill.style.width = `${(summary.reviewed / entries.length) * 100}%`
  elements.jump_index.value = String(state.cursor + 1)
  elements.problem_note.value = decision?.note ?? ""
  elements.decision_mark.textContent = decision?.status === "selected"
    ? `已选修复 ${decision.candidate}`
    : decision?.status === "unresolved" ? "仍需处理" : "待复检"
  elements.decision_mark.dataset.status = decision?.status ?? "pending"

  const originalActive = activeSource.type === "original"
  elements.original_button.dataset.active = String(originalActive)
  elements.original_button.setAttribute("aria-pressed", String(originalActive))
  for (const button of candidateButtons) {
    const label = button.dataset.candidate
    const active = activeSource.type === "candidate" && activeSource.label === label
    button.dataset.active = String(active)
    button.setAttribute("aria-pressed", String(active))
    button.dataset.selected = String(decision?.status === "selected" && decision.candidate === label)
  }
  elements.select_button.disabled = activeSource.type !== "candidate"
  elements.select_button.querySelector("span").textContent = activeSource.type === "candidate"
    ? `采用修复 ${activeSource.label}`
    : "请先选择修复版"
  if (entryChanged || elements.word_audio.dataset.entryId !== entry.entryId) loadActiveAudio({ autoplay })
}

function playCurrent({ restart = true } = {}) {
  elements.audio_error.hidden = true
  if (restart) elements.word_audio.currentTime = 0
  return elements.word_audio.play().catch((error) => {
    if (error?.name !== "NotAllowedError") elements.audio_error.hidden = false
  })
}

function selectAudio(source) {
  if (source.type === "candidate" && !currentEntry()?.candidates.some((candidate) => candidate.label === source.label)) return
  activeSource = source
  render()
  loadActiveAudio({ autoplay: true })
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
    .catch(() => setSaveStatus("保存失败，请先导出结果", "error"))
}

function decide(status) {
  const entry = currentEntry()
  if (!entry || (status === "selected" && activeSource.type !== "candidate")) return
  state.history.push({
    entryId: entry.entryId,
    previousDecision: state.decisions[entry.entryId] ?? null,
    previousCursor: state.cursor,
  })
  if (state.history.length > entries.length) state.history.shift()
  state.decisions[entry.entryId] = {
    status,
    candidate: status === "selected" ? activeSource.label : null,
    note: elements.problem_note.value.trim(),
    decidedAt: new Date().toISOString(),
  }
  state.cursor = Math.min(state.cursor + 1, entries.length - 1)
  render({ entryChanged: true, autoplay: true })
  saveState()
}

function undo() {
  const previous = state.history.pop()
  if (!previous) return
  if (previous.previousDecision) state.decisions[previous.entryId] = previous.previousDecision
  else delete state.decisions[previous.entryId]
  state.cursor = previous.previousCursor
  render({ entryChanged: true, autoplay: true })
  saveState()
}

function jumpToIndex(index) {
  if (!Number.isInteger(index) || index < 0 || index >= entries.length) return
  state.cursor = index
  render({ entryChanged: true, autoplay: true })
  saveState()
}

function exportResults() {
  const summary = counts()
  const payload = {
    schemaVersion: 1,
    batchId: state.batchId,
    exportedAt: new Date().toISOString(),
    totalEntries: entries.length,
    ...summary,
    selectedRepairs: entries
      .filter((entry) => state.decisions[entry.entryId]?.status === "selected")
      .map((entry) => ({
        entryId: entry.entryId,
        sourceOrder: entry.sourceOrder,
        headword: entry.headword,
        ...state.decisions[entry.entryId],
        candidateAsset: entry.candidates.find((candidate) => candidate.label === state.decisions[entry.entryId].candidate),
      })),
    unresolved: entries
      .filter((entry) => state.decisions[entry.entryId]?.status === "unresolved")
      .map((entry) => ({ entryId: entry.entryId, sourceOrder: entry.sourceOrder, headword: entry.headword, ...state.decisions[entry.entryId] })),
  }
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: "application/json" })
  const link = document.createElement("a")
  link.href = URL.createObjectURL(blob)
  link.download = `wanwei-audio-repair-qa-${new Date().toISOString().slice(0, 10)}.json`
  link.click()
  URL.revokeObjectURL(link.href)
}

function bindEvents() {
  elements.original_button.addEventListener("click", () => selectAudio({ type: "original" }))
  for (const button of candidateButtons) {
    button.addEventListener("click", () => selectAudio({ type: "candidate", label: button.dataset.candidate }))
  }
  elements.select_button.addEventListener("click", () => decide("selected"))
  elements.unresolved_button.addEventListener("click", () => decide("unresolved"))
  elements.undo_button.addEventListener("click", undo)
  elements.replay_button.addEventListener("click", () => void playCurrent())
  elements.play_button.addEventListener("click", togglePlayback)
  elements.export_button.addEventListener("click", exportResults)
  elements.jump_form.addEventListener("submit", (event) => {
    event.preventDefault()
    jumpToIndex(Number(elements.jump_index.value) - 1)
  })
  elements.word_audio.addEventListener("error", () => { elements.audio_error.hidden = false })
  window.addEventListener("keydown", (event) => {
    if (event.target instanceof HTMLInputElement) return
    const actions = {
      "0": () => selectAudio({ type: "original" }),
      "1": () => selectAudio({ type: "candidate", label: "A" }),
      "2": () => selectAudio({ type: "candidate", label: "B" }),
      "3": () => selectAudio({ type: "candidate", label: "C" }),
      "4": () => selectAudio({ type: "candidate", label: "D" }),
      ArrowUp: () => decide("selected"),
      ArrowDown: () => decide("unresolved"),
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
  if (!entriesResponse.ok || !stateResponse.ok) throw new Error("Repair QA data did not load")
  entries = await entriesResponse.json()
  entryIds = new Set(entries.map((entry) => entry.entryId))
  const availableLabels = new Set(entries[0]?.candidates.map((candidate) => candidate.label) ?? [])
  for (const button of candidateButtons) button.hidden = !availableLabels.has(button.dataset.candidate)
  document.querySelector("h1").textContent = `${entries.length} 词修复复检`
  const candidateCopy = [...availableLabels].join(" / ")
  document.querySelector(".subtitle").textContent = `原版保留不动。听原版和 ${candidateCopy}，选择一个完整、重音正确的修复版。`
  elements.review_total.textContent = String(entries.length)
  elements.problem_note_label.textContent = `若 ${candidateCopy} 都不行，可顺手写一句原因`
  elements.unresolved_button.querySelector("span").textContent = `${candidateCopy} 都不行`
  elements.jump_index.max = String(entries.length)
  const stored = await stateResponse.json()
  state = {
    ...state,
    ...stored,
    decisions: Object.fromEntries(Object.entries(stored.decisions ?? {}).filter(([entryId]) => entryIds.has(entryId))),
    history: Array.isArray(stored.history) ? stored.history.filter((item) => entryIds.has(item.entryId)) : [],
  }
  if (!Number.isInteger(state.cursor) || state.cursor < 0 || state.cursor >= entries.length) state.cursor = 0
  bindEvents()
  render({ entryChanged: true })
  setSaveStatus(state.updatedAt ? "已恢复上次进度" : "尚未开始")
}

start().catch((error) => {
  console.error(error)
  setSaveStatus("页面载入失败", "error")
})
