// Frame-by-frame recording of the whole scroll flight, on the real GPU
// (headless Chromium + ANGLE d3d11). Every frame is rendered on demand with a
// fake clock, so the result is smooth regardless of how long a capture takes.
//
//   node scripts/record.mjs <framesDir> [url] [seconds] [fps] [width] [height]
//
// Then encode, e.g.:
//   ffmpeg -framerate 30 -i <framesDir>/f%05d.jpg -c:v libx264 -crf 20 \
//     -pix_fmt yuv420p -movflags +faststart out.mp4
import path from 'node:path'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

const OUT = path.resolve(process.argv[2] || '.shots/frames')
const URL = process.argv[3] || 'http://localhost:5198/'
const SECONDS = Number(process.argv[4] || 84)
const FPS = Number(process.argv[5] || 30)
const W = Number(process.argv[6] || 1280)
const H = Number(process.argv[7] || 720)
// Still shots at both ends, in seconds.
const HOLD_START = 2.5
const HOLD_END = 3

await mkdir(OUT, { recursive: true })
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu'],
})
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })
const page = await ctx.newPage()
const errors = []
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))

await page.goto(URL, { waitUntil: 'load' })
await page.waitForFunction(() => window.__director && window.__lenis && window.__render, null, { timeout: 60000 })
await page.waitForTimeout(6000)

// Take over the clock: the app's own loop stops, and animation time advances
// by exactly one frame per captured frame.
await page.evaluate((fps) => {
  window.requestAnimationFrame = () => 0
  let now = performance.now()
  performance.now = () => now
  window.__step = async (progress) => {
    now += 1000 / fps
    const limit = document.documentElement.scrollHeight - window.innerHeight
    window.__lenis.scrollTo(progress * limit, { immediate: true, force: true })
    await new Promise((r) => setTimeout(r, 0))
    window.__render()
  }
}, FPS)

const total = Math.round(SECONDS * FPS)
// RECORD_UNTIL=<seconds> stops early with the same pacing (re-shoot just the opening).
const stop = process.env.RECORD_UNTIL ? Math.min(Math.round(Number(process.env.RECORD_UNTIL) * FPS), total) : total
const a = HOLD_START * FPS
const b = total - HOLD_END * FPS
// Constant scroll speed with a soft start and stop.
const ease = (x) => {
  const e = 0.06
  if (x < e) return (x * x) / (2 * e * (1 - e))
  if (x > 1 - e) return 1 - ((1 - x) * (1 - x)) / (2 * e * (1 - e))
  return (x - e / 2) / (1 - e)
}
const started = Date.now()
for (let i = 0; i < stop; i++) {
  const x = Math.min(Math.max((i - a) / (b - a), 0), 1)
  await page.evaluate((p) => window.__step(p), ease(x))
  await page.screenshot({ path: path.join(OUT, `f${String(i).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 93 })
  if (i % 300 === 0) console.log(`frame ${i}/${total}, ${Math.round((Date.now() - started) / 1000)}s`)
}
console.log('ERRORS:', JSON.stringify(errors.slice(0, 5)))
await browser.close()
