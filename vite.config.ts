import { URL, fileURLToPath } from 'node:url'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

// devtools removed
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
// nitro plugin removed (tanstackStart handles server runtime)
import { defineConfig } from 'vite'
import viteTsConfigPaths from 'vite-tsconfig-paths'

const config = defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  ssr: {
    external: ['playwright', 'playwright-core', 'playwright-extra', 'puppeteer-extra-plugin-stealth'],
  },
  optimizeDeps: {
    exclude: ['playwright', 'playwright-core', 'playwright-extra', 'puppeteer-extra-plugin-stealth'],
  },
  server: {
    proxy: {
      '/gateway-ui': {
        target: 'http://127.0.0.1:18789',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/gateway-ui/, ''),
        ws: true,
        configure: (proxy) => {
          proxy.on('proxyRes', (_proxyRes) => {
            // Strip iframe-blocking headers so we can embed
            delete _proxyRes.headers['x-frame-options']
            delete _proxyRes.headers['content-security-policy']
          })
        },
      },
    },
  },
  plugins: [
    // devtools(),
    // this is the plugin that enables path aliases
    viteTsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
    // Copy pty-helper.py into the server assets directory after build
    {
      name: 'copy-pty-helper',
      closeBundle() {
        const src = resolve('src/server/pty-helper.py')
        const destDir = resolve('dist/server/assets')
        const dest = resolve(destDir, 'pty-helper.py')
        if (existsSync(src)) {
          mkdirSync(destDir, { recursive: true })
          copyFileSync(src, dest)
        }
      },
    },
  ],
})

export default config
