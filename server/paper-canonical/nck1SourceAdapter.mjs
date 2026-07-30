import { canonicalAuthorityRef } from '../../shared/paper-canonical/compiler.mjs'
import { sha256 } from '../../shared/paper-canonical/stable.mjs'

const textDecoder = new TextDecoder()
const textEncoder = new TextEncoder()

function parseJson(bytes, label) {
  if (!(bytes instanceof Uint8Array)) return null
  try {
    const value = JSON.parse(textDecoder.decode(bytes))
    if (!value || typeof value !== 'object') {
      throw new TypeError('root is not an object')
    }
    return value
  } catch (error) {
    throw new Error(`Canonical NCK1 ${label} is unreadable: ${error.message}`)
  }
}

function evidenceDocument({
  inputKey,
  roles,
  bytes,
  mediaType,
  originalName,
}) {
  if (!(bytes instanceof Uint8Array)) return null
  return {
    inputKey,
    roles,
    bytes: new Uint8Array(bytes),
    declared: {
      mediaType,
      ...(originalName ? { originalName } : {}),
    },
  }
}

/**
 * Assemble immutable NCK1 source evidence for the public compiler seam.
 *
 * This adapter deliberately creates no canonical Group, answer assertion,
 * Transformation Record, or inactive-slot closure. Registered compiler
 * adapters derive those semantics from the supplied source-bound documents;
 * missing documents therefore remain visible as blocked compilation.
 */
export function buildNck1CanonicalImportRequest({
  paperId,
  paperAssetBytes,
  answerKeyBytes,
  sourcePdfBytes = null,
  answersPdfBytes = null,
  instructionEvidenceBytes = null,
  sourceProvenanceBytes = null,
  readingSourceCaptureBytes = null,
  grammarFillPromptSourceCaptureBytes = null,
  tableVisualProofBytes = null,
  applicationWritingCaptureBytes = null,
  applicationWritingTranscriptionBytes = null,
  continuationWritingCaptureBytes = null,
  continuationWritingTranscriptionBytes = null,
  listeningQuestionsBytes = null,
  listeningAnswersBytes = null,
  listeningTranscriptBytes = null,
  listeningInventoryBytes = null,
}) {
  const paperAsset = parseJson(paperAssetBytes, 'paper asset')
  const answerKey = parseJson(answerKeyBytes, 'official answer evidence')
  if (
    paperAsset?.paper?.paperId !== paperId
    || answerKey?.paperId !== paperId
    || !Number.isInteger(answerKey?.sourceAssetVersion)
  ) {
    throw new Error(
      'Canonical NCK1 source adapter requires one paper and source version',
    )
  }
  const sourceEnvelope = {
    paperId,
    profileId: 'nck1',
    sourceAssetVersion: answerKey.sourceAssetVersion,
    profileInstructionSourceDigest:
      sourcePdfBytes instanceof Uint8Array ? sha256(sourcePdfBytes) : null,
    observations: [],
    assertions: [],
    groups: [],
    transformations: [],
    inactiveSlots: {},
    inactiveSourceClosures: [],
  }
  const documents = [
    evidenceDocument({
      inputKey: 'canonical_source_envelope',
      roles: ['operator_assertions'],
      bytes: textEncoder.encode(JSON.stringify(sourceEnvelope)),
      mediaType: 'application/vnd.eqb.canonical-fixture+json',
      originalName: 'canonical-source-envelope.json',
    }),
    evidenceDocument({
      inputKey: 'paper_asset',
      roles: ['question_source'],
      bytes: paperAssetBytes,
      mediaType: 'application/json',
      originalName: 'paper-asset.json',
    }),
    evidenceDocument({
      inputKey: 'official_answers',
      roles: ['official_answer_source'],
      bytes: answerKeyBytes,
      mediaType: 'application/json',
      originalName: 'answer-key.json',
    }),
    evidenceDocument({
      inputKey: 'reading_structure',
      roles: ['structured_source'],
      bytes: readingSourceCaptureBytes,
      mediaType: 'application/json',
      originalName: 'reading-source-capture-v1.json',
    }),
    evidenceDocument({
      inputKey: 'grammar_fill_prompt_source_capture',
      roles: ['structured_source', 'source_provenance'],
      bytes: grammarFillPromptSourceCaptureBytes,
      mediaType:
        'application/vnd.eqb.grammar-fill-prompt-source-capture+json',
      originalName: 'grammar-fill-prompt-source-capture.json',
    }),
    evidenceDocument({
      inputKey: 'table_visual_proof',
      roles: ['source_provenance'],
      bytes: tableVisualProofBytes,
      mediaType: 'image/png',
      originalName: 'reading-a-table-1.png',
    }),
    evidenceDocument({
      inputKey: 'application_writing_capture',
      roles: ['structured_source', 'source_provenance'],
      bytes: applicationWritingCaptureBytes,
      mediaType:
        'application/vnd.eqb.application-writing-source-capture+json',
      originalName: 'application-writing-source-capture.json',
    }),
    evidenceDocument({
      inputKey: 'application_writing_transcription',
      roles: ['structured_source', 'source_provenance'],
      bytes: applicationWritingTranscriptionBytes,
      mediaType:
        'application/vnd.eqb.application-writing-source-transcription+json',
      originalName: 'application-writing-source-transcription.json',
    }),
    evidenceDocument({
      inputKey: 'continuation_writing_capture',
      roles: ['structured_source', 'source_provenance'],
      bytes: continuationWritingCaptureBytes,
      mediaType:
        'application/vnd.eqb.continuation-writing-source-capture+json',
      originalName: 'continuation-writing-source-capture.json',
    }),
    evidenceDocument({
      inputKey: 'continuation_writing_transcription',
      roles: ['structured_source', 'source_provenance'],
      bytes: continuationWritingTranscriptionBytes,
      mediaType:
        'application/vnd.eqb.continuation-writing-source-transcription+json',
      originalName: 'continuation-writing-source-transcription.json',
    }),
    evidenceDocument({
      inputKey: 'continuation_writing_instruction_evidence',
      roles: ['structured_source', 'source_provenance'],
      bytes: instructionEvidenceBytes,
      mediaType:
        'application/vnd.eqb.profile-writing-source-evidence+json',
      originalName: 'continuation-writing-instruction-evidence.json',
    }),
    evidenceDocument({
      inputKey: 'source_provenance',
      roles: ['source_provenance'],
      bytes: sourceProvenanceBytes,
      mediaType: 'application/json',
      originalName: 'import-meta.json',
    }),
    evidenceDocument({
      inputKey: 'original_question_source',
      roles: ['question_source', 'source_provenance'],
      bytes: sourcePdfBytes,
      mediaType: 'application/pdf',
      originalName: 'paper.pdf',
    }),
    evidenceDocument({
      inputKey: 'listening_answer_source',
      roles: [
        'official_answer_source',
        'transcript_source',
        'source_provenance',
      ],
      bytes: answersPdfBytes,
      mediaType: 'application/pdf',
      originalName: 'answers.pdf',
    }),
    evidenceDocument({
      inputKey: 'listening_questions',
      roles: ['structured_source', 'question_source'],
      bytes: listeningQuestionsBytes,
      mediaType: 'application/vnd.eqb.listening-questions+json',
      originalName: 'questions.json',
    }),
    evidenceDocument({
      inputKey: 'listening_answers',
      roles: ['structured_source', 'official_answer_source'],
      bytes: listeningAnswersBytes,
      mediaType: 'application/vnd.eqb.listening-answers+json',
      originalName: 'answers.json',
    }),
    evidenceDocument({
      inputKey: 'listening_transcript',
      roles: ['structured_source', 'transcript_source'],
      bytes: listeningTranscriptBytes,
      mediaType: 'application/vnd.eqb.listening-transcript+json',
      originalName: 'transcript.json',
    }),
    evidenceDocument({
      inputKey: 'listening_inventory',
      roles: ['operator_assertions', 'source_provenance'],
      bytes: listeningInventoryBytes,
      mediaType: 'application/vnd.eqb.listening-source-inventory+json',
      originalName: 'listening-source-inventory.json',
    }),
  ].filter(Boolean)

  return {
    authority: canonicalAuthorityRef,
    evidence: { documents },
  }
}
