import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

function sitesStaticWorker(): Plugin {
  return {
    name: 'sites-static-worker',
    apply: 'build',
    async closeBundle() {
      const serverDirectory = fileURLToPath(new URL('./dist/server', import.meta.url))

      await mkdir(serverDirectory, { recursive: true })
      await writeFile(
        fileURLToPath(new URL('./dist/server/index.js', import.meta.url)),
        `export default {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request)
    if (response.status !== 404) return response

    const url = new URL(request.url)
    url.pathname = '/index.html'
    return env.ASSETS.fetch(new Request(url, request))
  },
}\n`,
      )
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  build: {
    outDir: 'dist/client',
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: [tailwindcss(), react(), sitesStaticWorker()],
})
