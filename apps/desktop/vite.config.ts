import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { packageAliases } from './aliases'

/**
 * In a plain browser (`pnpm dev` without the Mac shell), the window talks to the same Node host the Mac app
 * starts, served here at POST /__host. Dev only: it's never part of a build. Requests from other origins are refused.
 */
function devHost(): Plugin {
  let host: { handle: (method: string, params: unknown) => Promise<unknown> } | null = null
  let loadedFrom: unknown = null
  return {
    name: 'onefamily-dev-host',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__host', (req, res) => {
        const origin = req.headers.origin
        if (req.method !== 'POST' || (origin && !/^http:\/\/(localhost|127\.0\.0\.1):1420$/.test(origin))) {
          res.statusCode = 403
          res.end()
          return
        }
        let body = ''
        req.on('data', (c: Buffer) => (body += c.toString('utf8')))
        req.on('end', async () => {
          res.setHeader('Content-Type', 'application/json')
          try {
            const mod = (await server.ssrLoadModule('/host/handlers.ts')) as typeof import('./host/handlers')
            if (!host || loadedFrom !== mod.createHost) {
              host = mod.createHost({ stateDir: process.env.ONEFAMILY_STATE_DIR ?? mod.defaultStateDir() })
              loadedFrom = mod.createHost
            }
            const { method, params } = JSON.parse(body) as { method: string; params: unknown }
            res.end(JSON.stringify({ result: (await host.handle(method, params)) ?? null }))
          } catch (e) {
            res.end(JSON.stringify({ error: (e as Error).message }))
          }
        })
      })
    },
  }
}

// Tauri serves the built app; in dev it loads this server.
export default defineConfig({
  plugins: [react(), devHost()],
  resolve: { alias: packageAliases },
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  build: { target: 'safari16', outDir: 'dist' },
})
