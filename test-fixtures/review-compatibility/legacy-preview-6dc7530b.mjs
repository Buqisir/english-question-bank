import { digestJson } from '../../shared/paper-canonical/stable.mjs'
import { LISTENING_AUDIO_PATHS } from '../../server/paper-import/listeningAudioEvidence.mjs'
import { reviewedPlaybackSegments } from '../../server/paper-import/listeningReview.mjs'

// Verbatim function from `git show
// 6dc7530bb1bb24f6372339f6834df57d0614f70f:server/import-review/importReviewStore.mjs`.
// Keep the function source intact; the regression asserts its source SHA-256.
export function saveProductPreview(db, revision, rendererId, projection) {
    const playback = projection.sourceInput?.listeningAudio || projection.analyzedPackage?.listeningAudio
    const playbackPath = projection.analyzedPackage
      ? projection.sourceProvenance?.members.find(member => member.role === 'audio')?.path
      : LISTENING_AUDIO_PATHS.playback
    const payload = {
      paperAsset: projection.paperAsset,
      analysisSidecars: projection.analysisSidecars || {},
      consumption: { ...projection.consumption, ...(playback ? { listeningAudio: {
        relativePath: 'listening/playback.mp3', sha256: playback.sha256, byteLength: playback.byteLength,
        durationSeconds: playback.durationSeconds, mediaType: 'audio/mpeg',
        url: `/api/import-review-preview/revisions/${encodeURIComponent(revision.id)}/files?path=${encodeURIComponent(playbackPath)}`,
        segments: reviewedPlaybackSegments(projection.reviewedListening),
      } } : {}) },
    }
    // Small derived Screen data only: no original documents, MP3/PDF bytes,
    // source rasters or new approval authority. Keep it in the same DB snapshot.
    const json = JSON.stringify(payload)
    db.prepare(`INSERT INTO import_review_product_previews
      (revision_id, bundle_digest, renderer_build_id, payload_digest, payload_json)
      VALUES (?, ?, ?, ?, ?)`).run(revision.id, revision.bundleDigest, rendererId,
      digestJson(JSON.parse(json)), json)
  }
