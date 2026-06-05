// One-off exploration: drive a real browser, capture JSON/XHR responses to find
// the SPA's underlying data API. Not part of the app — just reconnaissance.
import { chromium } from 'playwright'

const TARGET = process.argv[2] || 'https://oglasnik.hr/nekretnine/prodaja-stanova'

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({
  userAgent:
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  locale: 'hr-HR',
  viewport: { width: 1366, height: 900 },
})
const page = await ctx.newPage()

const apiHits = []
page.on('response', async (res) => {
  const url = res.url()
  const ct = res.headers()['content-type'] || ''
  if (!ct.includes('application/json')) return
  if (/google|gtm|analytics|facebook|consent|cookie|sentry/i.test(url)) return
  let size = 0
  let sample = ''
  try {
    const body = await res.text()
    size = body.length
    sample = body.slice(0, 200).replace(/\s+/g, ' ')
  } catch {}
  apiHits.push({ status: res.status(), size, url, sample })
})

console.log('navigating:', TARGET)
const resp = await page.goto(TARGET, { waitUntil: 'networkidle', timeout: 45000 }).catch((e) => {
  console.log('goto error:', e.message)
  return null
})
console.log('final url:', page.url(), '| status:', resp?.status())
await page.waitForTimeout(3000)

console.log('\n=== JSON responses (likely data API) ===')
apiHits
  .sort((a, b) => b.size - a.size)
  .slice(0, 12)
  .forEach((h) => console.log(`[${h.status}] ${h.size}b  ${h.url}\n      ${h.sample}\n`))

// Also check if the rendered DOM has listing cards now.
const cardCounts = await page.evaluate(() => {
  const sels = ['[class*=listing]', '[class*=oglas]', '[class*=card]', 'article', '[class*=product]', '[class*=ad-]']
  return sels.map((s) => `${s}: ${document.querySelectorAll(s).length}`)
})
console.log('=== DOM card-ish selectors ===')
console.log(cardCounts.join('\n'))

await browser.close()
