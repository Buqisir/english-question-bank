import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

const apiPort = Number(process.env.QUESTION_BANK_API_PORT || 8787)

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Issue #21-B1 / Issue #30 gate 2 (PR #32 review fix): the React
    // paper-surface prototype imports primitive style tokens from
    // `shared/papersurface/tokens.mjs` at the repo root. Once fs.allow is
    // explicit, Vite no longer implicitly allows the app package root, so
    // keep `app/` itself plus the `shared/` sibling — and only those.
    //
    // We deliberately do NOT allow the whole repo root (`..`). The
    // narrower allow keeps the dev server from serving anything outside
    // `app/` and `shared/` (e.g. `server/`, `data/`, `imports/`,
    // `exports/`, raw PDFs, knowledge/, prompts/). The shared module
    // is pure ESM primitives — no CSS, no JSX, no React — so the
    // narrow allow is sufficient.
    fs: {
      allow: [path.resolve(__dirname), path.resolve(__dirname, '../shared')],
    },
    proxy: {
      '/api': `http://127.0.0.1:${apiPort}`,
    },
  },
})
