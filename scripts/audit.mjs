// Screenshots of the running dev server (http://localhost:5198) at given
// camera-key positions f, on the real GPU (headless Chromium + ANGLE d3d11).
//
//   node scripts/audit.mjs <outDir> <f,f,...> [width] [height] [d3d11|swiftshader]
//
// Start the server first:
//   node node_modules/vite/bin/vite.js --port 5198 --strictPort --host 127.0.0.1
import path from 'node:path'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

const OUT = path.resolve(process.argv[2] || '.shots')
const FS = (process.argv[3] || '0,3,5.3').split(',').map(Number)
const W = Number(process.argv[4] || 1440)
const H = Number(process.argv[5] || 900)
const GL = process.argv[6] || 'd3d11'
await mkdir(OUT, { recursive: true })

const args = ['--use-gl=angle', `--use-angle=${GL}`, '--ignore-gpu-blocklist', '--enable-gpu']
if (GL === 'swiftshader') args.push('--enable-unsafe-swiftshader')
const browser = await chromium.launch({ headless: true, args })
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })
const page = await ctx.newPage()
const errors = []
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))

// AUDIT_QUERY=look=pearl shoots a variant (query string without '?').
const QUERY = process.env.AUDIT_QUERY ? `?${process.env.AUDIT_QUERY}` : ''
await page.goto(`http://localhost:5198/${QUERY}`, { waitUntil: 'load' })
await page.waitForFunction(() => window.__director && window.__lenis && window.__render, null, { timeout: 60000 })
await page.waitForTimeout(6000)

const info = await page.evaluate(() => {
  const gl = window.__dbg.renderer.getContext()
  const ext = gl.getExtension('WEBGL_debug_renderer_info')
  return {
    gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'n/a',
    info: JSON.parse(JSON.stringify(window.__dbg.renderer.info.render)),
    mem: JSON.parse(JSON.stringify(window.__dbg.renderer.info.memory)),
  }
})
console.log('GPU:', JSON.stringify(info))

for (const f of FS) {
  const stats = await page.evaluate(async (ff) => {
    const limit = document.documentElement.scrollHeight - window.innerHeight
    window.__lenis.scrollTo(window.__director.scrollAt(ff) * limit, { immediate: true, force: true })
    for (let i = 0; i < 6; i++) window.__render()
    await new Promise((r) => setTimeout(r, 900))
    for (let i = 0; i < 3; i++) window.__render()
    const r = window.__dbg.renderer
    const gl = r.getContext()
    const t0 = performance.now()
    for (let i = 0; i < 20; i++) {
      window.__render()
      gl.finish()
    }
    const ms = (performance.now() - t0) / 20
    return { ms: +ms.toFixed(2), calls: r.info.render.calls, tris: r.info.render.triangles }
  }, f)
  console.log(`f=${f}`, JSON.stringify(stats))
  await page.screenshot({ path: path.join(OUT, `f${String(f).padStart(4, '0')}_${W}.jpg`), type: 'jpeg', quality: 88 })
}

console.log('ERRORS:', JSON.stringify(errors.slice(0, 10)))
await browser.close()
