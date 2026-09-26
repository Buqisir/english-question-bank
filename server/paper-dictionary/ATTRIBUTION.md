# Paper dictionary data

EQB ships no dictionary database in git. The lookup file is an offline
derivative of the pinned Open Dictionary v2.0 distribution
(`distribution_entry_v5` / `distribution_sqlite_v1`).

- Upstream code: MIT License.
- Upstream dictionary data, including the Chinese learner glosses: CC BY-SA 4.0.
  Those glosses are Wiktionary-derived and include model-generated explanations.
  They are not a commercially reviewed dictionary.
- Build with `node scripts/build-paper-dictionary.mjs` from the verified
  `distribution.sqlite` asset. Production reads that SQLite only.
- Pronunciation audio is a second offline step, `node scripts/build-paper-dictionary-audio.mjs`.
  It reads the Kaikki raw Wiktextract English extract and keeps only recordings whose
  Wikimedia Commons license can be read. UK and US recordings are not copied onto each other.
  An assumed uploader is not stored as the author. Each accepted recording is transcoded
  to a small mono mp3 and stored at `app/public/dictionary-audio/wikimedia-v1/`. Those
  files ship with the website. `upload.wikimedia.org` is usually unreachable in mainland
  China, so the browser plays only this same-origin copy and never the upstream URL.
