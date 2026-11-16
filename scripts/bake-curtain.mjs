// Runs scripts/bake-curtain.html on the dev server (http://localhost:5198) on
// the real GPU and writes the baked cloud bank.
//   node scripts/bake-curtain.mjs [out=public/ui/cloud-bank-a.webp] [query]
// The two shipped bakes:
//   node scripts/bake-curtain.mjs public/ui/cloud-bank-a.webp "f=4&seed=11"
//   node scripts/bake-curtain.mjs public/ui/cloud-bank-b.webp "f=4&seed=23"
import { writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'

const OUT = process.argv[2] || 'public/ui/cloud-bank-a.webp'
const QUERY = process.argv[3] || ''
const args = ['--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu']
const browser = await chromium.launch({ headless: true, args })
const page = await browser.newPage()
page.on('pageerror', (e) => console.error('PAGEERROR', e.message))
page.on('console', (msg) => msg.type() === 'log' && console.log('page:', msg.text()))
await page.goto(`http://localhost:5198/scripts/bake-curtain.html?${QUERY}`)
await page.waitForFunction(() => window.__bake || window.__bakeError, null, { timeout: 300000 })
const err = await page.evaluate(() => window.__bakeError)
if (err) {
  console.error(err)
  process.exit(1)
}
const url = await page.evaluate(() => window.__bake)
await writeFile(OUT, Buffer.from(url.split(',')[1], 'base64'))
console.log('wrote', OUT)
await browser.close()
