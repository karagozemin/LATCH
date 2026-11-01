import fs from 'node:fs'
import path from 'node:path'
import postcss from 'postcss'
import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'
import { transformWithEsbuild, type Plugin } from 'vite'

/**
 * Compiles Tailwind (src/index.css) to a plain stylesheet served at /latch.css and linked from
 * index.html with an ordinary <link rel="stylesheet">.
 *
 * Why: Vite's default dev behaviour injects CSS from JavaScript (a <style> tag created when
 * main.tsx runs, replaced on every HMR update and removed when a module is pruned). Any module
 * error, HMR hiccup or reload race leaves the page with no styles at all. A <link> stylesheet is
 * fetched by the browser itself before any script runs, so styles survive reloads, HMR and
 * crashes in app code.
 *
 * Dev: served from memory, recompiled when a file in src/ changes, and hot-swapped by Vite's
 * built-in css-update handling (the old sheet stays until the new one has loaded).
 * Build: emitted as dist/latch.css.
 */
export function latchCss(root: string): Plugin {
  const input = path.resolve(root, 'src/index.css')
  const srcDir = path.resolve(root, 'src') + path.sep
  const configFile = path.resolve(root, 'tailwind.config.js')

  let css = ''
  let dirty = true
  let inflight: Promise<string> | null = null

  const compile = (): Promise<string> => {
    if (!dirty && css) return Promise.resolve(css)
    inflight ??= (async () => {
      try {
        dirty = false
        const source = fs.readFileSync(input, 'utf8')
        const out = await postcss([tailwindcss(configFile), autoprefixer()]).process(source, { from: input })
        css = out.css
      } catch (error) {
        dirty = true
        console.error('[latch-css] compile failed, serving the last good stylesheet', error)
      } finally {
        inflight = null
      }
      return css
    })()
    return inflight
  }

  return {
    name: 'latch-css',

    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0] !== '/latch.css') return next()
        void compile().then((body) => {
          res.statusCode = 200
          res.setHeader('Content-Type', 'text/css; charset=utf-8')
          res.setHeader('Cache-Control', 'no-store')
          res.end(body)
        })
      })

      let timer: ReturnType<typeof setTimeout> | undefined
      const onFileEvent = (file: string) => {
        if (!file.startsWith(srcDir) && file !== configFile && file !== input) return
        dirty = true
        clearTimeout(timer)
        timer = setTimeout(() => {
          void compile().then(() => {
            server.ws.send({
              type: 'update',
              updates: [
                { type: 'css-update', path: '/latch.css', acceptedPath: '/latch.css', timestamp: Date.now() },
              ],
            })
          })
        }, 60)
      }
      server.watcher.on('change', onFileEvent)
      server.watcher.on('add', onFileEvent)
      server.watcher.on('unlink', onFileEvent)
    },

    buildStart() {
      dirty = true
    },

    async generateBundle() {
      const body = await compile()
      if (!body) this.error('[latch-css] produced an empty stylesheet')
      const min = await transformWithEsbuild(body, 'latch.css', { loader: 'css', minify: true })
      this.emitFile({ type: 'asset', fileName: 'latch.css', source: min.code })
    },
  }
}
