// Section state only: recognition priority stays in ocr-line-roles and the caller.
// Paragraph assembly, source locators and review output stay in ocr-proofread.
const WRITING_SCOPE = Object.freeze({
  OUTSIDE: 'outside-writing',
  PART: 'writing-part',
  TASK: 'writing-task',
  OMITTED_PART: 'omitted-writing-part',
  OMITTED_TASK: 'omitted-writing-task',
  ENDED: 'writing-ended',
})

function selectTask(scope, sections, taskType, reuse = false) {
  scope.current = (reuse && sections.get(taskType)) || { taskType, lines: [] }
  sections.set(taskType, scope.current)
  scope.phase = WRITING_SCOPE.TASK
}

export function createWritingScope(sections) {
  return {
    phase: WRITING_SCOPE.OUTSIDE,
    partPhase: WRITING_SCOPE.OUTSIDE,
    current: null,
    get inWriting() { return this.partPhase === WRITING_SCOPE.PART },
    get ended() { return this.phase === WRITING_SCOPE.ENDED },
    startTask(taskType, { reuse = false } = {}) {
      selectTask(this, sections, taskType, reuse)
      this.partPhase = WRITING_SCOPE.PART
    },
    enterPart(writing, trailingTask) {
      this.current = null
      this.phase = writing ? WRITING_SCOPE.PART : WRITING_SCOPE.OUTSIDE
      this.partPhase = this.phase
      // Raw part recognition and the NFKC trailing-section helper can disagree.
      // Selecting that task must preserve the raw heading's writing-part state.
      if (trailingTask) selectTask(this, sections, trailingTask)
    },
    omit() {
      // Omission is an observation, not a terminal veto on later source text.
      // Do not select a current task when the entire writing part is omitted.
      for (const taskType of this.current ? [this.current.taskType] : ['application', 'continuation']) {
        if (!sections.has(taskType)) sections.set(taskType, { taskType, lines: [] })
      }
      this.phase = this.current ? WRITING_SCOPE.OMITTED_TASK : WRITING_SCOPE.OMITTED_PART
    },
    end() { this.phase = this.partPhase = WRITING_SCOPE.ENDED },
  }
}

const REFERENCE_CAPTURE = Object.freeze({
  READY: 'awaiting-reference',
  ESSAY: 'capturing-essay',
  SCORING: 'capturing-scoring',
  PAUSED: 'paused-commentary',
  ENDED: 'task-ended',
})

export function createReferenceCapture() {
  return {
    phase: REFERENCE_CAPTURE.READY,
    get paused() { return this.phase === REFERENCE_CAPTURE.PAUSED },
    get ended() { return this.phase === REFERENCE_CAPTURE.ENDED },
    get kind() {
      return this.phase === REFERENCE_CAPTURE.SCORING ? 'scoring'
        : this.phase === REFERENCE_CAPTURE.ESSAY ? 'essays' : null
    },
    start(kind) { this.phase = kind === 'scoring' ? REFERENCE_CAPTURE.SCORING : REFERENCE_CAPTURE.ESSAY },
    pause() { this.phase = REFERENCE_CAPTURE.PAUSED },
    resume() {
      // The caller has ruled out commentary and skipped fragments. Preserve
      // scoring capture; a permitted unlabeled line starts/resumes an essay.
      if (this.phase === REFERENCE_CAPTURE.READY || this.paused) this.start('essays')
    },
    end() { this.phase = REFERENCE_CAPTURE.ENDED },
  }
}
