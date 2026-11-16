// Headless screenshot harness for visual verification. Serves the built `dist`
// over a local http server (in-process, so it works under sandboxed shells),
// drives the Lenis scroll deterministically via window.__lenis, and captures the
// flight at several scroll positions.
//
//   npm run build && npm run shoot            → writes to ./.shots
//   node scripts/shoot.mjs <distDir> <outDir> [pos,pos,...]
import http from 'node:http'
import { readFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const DIST = path.resolve(process.argv[2] || 'dist')
const OUT = path.resolve(process.argv[3] || '.shots')
const POSITIONS = (process.argv[4] || '0.02,0.28,0.52,0.78,0.98').split(',').map(Number)
const PORT = 4319

const MIME = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.glb': 'model/gltf-binary',
}

await mkdir(OUT, { recursive: true })

const server = http.createServer(async (req, res) => {
  try {
    let url = decodeURIComponent(req.url.split('?')[0])
    if (url === '/') url = '/index.html'
    let file = path.join(DIST, url)
    if (!existsSync(file)) file = path.join(DIST, 'index.html')
    const buf = await readFile(file)
    res.setHeader('Content-Type', MIME[path.extname(file)] || 'application/octet-stream')
    res.end(buf)
  } catch (e) {
    res.statusCode = 500
    res.end(String(e))
  }
})
await new Promise((r) => server.listen(PORT, '127.0.0.1', r))

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()

const errors = []
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))

await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)

for (let i = 0; i < POSITIONS.length; i++) {
  const p = POSITIONS[i]
  await page.evaluate((pp) => {
    const el = document.documentElement
    const y = pp * (el.scrollHeight - window.innerHeight)
    if (window.__lenis) window.__lenis.scrollTo(y, { immediate: true })
    else window.scrollTo(0, y)
  }, p)
  await page.waitForTimeout(700)
  const name = String(i).padStart(2, '0') + '-' + p
  await page.screenshot({ path: path.join(OUT, `shot-${name}.png`) })
}

console.log('ERRORS:', JSON.stringify(errors))
await browser.close()
server.close()
