export type ListeningInactiveEvidenceDocument = {
  inputKey: string
  byteLength: number
  sha256: string
  roles: readonly string[]
  mediaType: string
  immutableArtifactRef?: {
    artifactId: string
  }
}

export type ListeningInactiveEvidenceEntry = {
  document: ListeningInactiveEvidenceDocument
  value: Record<string, unknown>
}

export function appendListeningInactiveClosures(input: {
  source: Record<string, unknown>
  profileSlots: readonly Record<string, unknown>[]
  documents: readonly ListeningInactiveEvidenceDocument[]
  questionsEntry?: ListeningInactiveEvidenceEntry | null
  answersEntry?: ListeningInactiveEvidenceEntry | null
  transcriptEntry?: ListeningInactiveEvidenceEntry | null
  inventoryEntry?: ListeningInactiveEvidenceEntry | null
  inventorySchema?: Record<string, unknown> | null
  diagnostics: Array<Record<string, unknown>>
}): void
