// Frame cost of the running dev server (http://localhost:5198) at given
// camera-key positions f, with and without the cloud layer. Each batch is
// forced to completion with a readPixels (gl.finish alone under-reports).
// Also prints the triangle count of the whole scene graph.
//
//   node scripts/perf.mjs <f,f,...> [width] [height] [devicePixelRatio]
import { chromium } from 'playwright'

const FS = (process.argv[2] || '0,3,5.3').split(',').map(Number)
const W = Number(process.argv[3] || 1920)
const H = Number(process.argv[4] || 1080)
const DPR = Number(process.argv[5] || 1)

const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu'] })
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR })
const page = await ctx.newPage()
const errors = []
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))
await page.goto('http://localhost:5198/', { waitUntil: 'load' })
await page.waitForFunction(() => window.__director && window.__lenis && window.__render, null, { timeout: 60000 })
await page.waitForTimeout(5000)

const tris = await page.evaluate(() => {
  let n = 0
  window.__dbg.scene.traverse((o) => {
    const g = o.geometry
    if (g && g.attributes.position) n += (g.index ? g.index.count : g.attributes.position.count) / 3
  })
  return Math.round(n)
})
console.log('scene triangles:', tris)

for (const f of FS) {
  const out = await page.evaluate(async (ff) => {
    const limit = document.documentElement.scrollHeight - window.innerHeight
    window.__lenis.scrollTo(window.__director.scrollAt(ff) * limit, { immediate: true, force: true })
    for (let i = 0; i < 6; i++) window.__render()
    const gl = window.__dbg.renderer.getContext()
    const px = new Uint8Array(4)
    const sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px)
    sync()
    const N = 30
    const t0 = performance.now()
    for (let i = 0; i < N; i++) window.__render()
    sync()
    const all = (performance.now() - t0) / N
    // Same again without the cloud layer, to isolate its cost.
    const world = window.__dbg.post.world
    const clouds = world.clouds
    world.clouds = null
    window.__render()
    sync()
    const t1 = performance.now()
    for (let i = 0; i < N; i++) window.__render()
    sync()
    const bare = (performance.now() - t1) / N
    world.clouds = clouds
    return { ms: +all.toFixed(2), noClouds: +bare.toFixed(2) }
  }, f)
  console.log(`f=${f} ${W}x${H}@${DPR}`, JSON.stringify(out))
}
console.log('ERRORS:', JSON.stringify(errors.slice(0, 5)))
await browser.close()
