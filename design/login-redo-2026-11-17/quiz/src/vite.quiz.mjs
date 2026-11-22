// 打静态包用：把这个目录的四个文件（index.html、main.tsx、quiz.css、本文件）拷到 app/__login-quiz/，在 app/ 下跑
//   npx vite build --config __login-quiz/vite.quiz.mjs
// 再把 public/brand/mark.svg、wordmark.svg 拷进产物的 brand/。
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: './',
  publicDir: false,
  plugins: [react()],
  build: { outDir: fileURLToPath(new URL('../dist-login-quiz', import.meta.url)), emptyOutDir: true, assetsInlineLimit: 0 },
})
