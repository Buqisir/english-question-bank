import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

const apiPort = Number(process.env.QUESTION_BANK_API_PORT || 8787)

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Issue #21-B1 / Issue #30 gate 2: the React paper-surface prototype
    // imports primitive style tokens from `shared/papersurface/tokens.mjs`
    // at the repo root, which sits one level above `app/`. Vite's default
    // `server.fs.allow` is rooted at the package, so we widen it just
    // enough to reach the shared/ sibling. The shared module is pure
    // ESM primitives — no CSS, no JSX, no React — so this is safe.
    fs: {
      allow: [path.resolve(__dirname, '..')],
    },
    proxy: {
      '/api': `http://127.0.0.1:${apiPort}`,
    },
  },
})
