// 打静态包用：把这个目录的四个文件拷到 app/__login-abc/，在 app/ 下跑
//   npx vite build --config __login-abc/vite.abc.mjs
// 再把 public/brand/mark.svg、wordmark.svg 拷进产物的 brand/。
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: './',
  publicDir: false,
  plugins: [react()],
  build: { outDir: fileURLToPath(new URL('../dist-login-abc', import.meta.url)), emptyOutDir: true, assetsInlineLimit: 0 },
})
