import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  // Repo site: https://egermusic.github.io/pipe-cutting/
  base: process.env.GITHUB_ACTIONS ? '/pipe-cutting/' : '/',
})
