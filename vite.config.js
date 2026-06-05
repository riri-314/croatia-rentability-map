import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_FILE = join(__dirname, 'src', 'data', 'scraped-listings.json')
const SCRAPER = join(__dirname, 'scraper', 'scrape.mjs')

async function readData() {
  try {
    const raw = await readFile(DATA_FILE, 'utf8')
    const json = JSON.parse(raw)
    return Array.isArray(json) ? { scrapedAt: null, source: 'nekretnine.hr', listings: json } : json
  } catch {
    return { scrapedAt: null, source: null, listings: [] }
  }
}

function send(res, code, body) {
  res.statusCode = code
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

// Dev-only API: lets the frontend read current data and trigger a re-scrape.
function dataApi() {
  return {
    name: 'dalmatia-data-api',
    configureServer(server) {
      server.middlewares.use('/api/data', async (req, res) => {
        send(res, 200, await readData())
      })

      server.middlewares.use('/api/refetch', async (req, res) => {
        if (req.method !== 'POST') return send(res, 405, { error: 'POST only' })
        const url = new URL(req.url, 'http://localhost')
        const pages = String(parseInt(url.searchParams.get('pages') || '4', 10))
        // Default to the fast HTTP source; merge mode preserves browser-sourced
        // data. Pass ?source=all to also re-run the slower Playwright sources.
        const source = url.searchParams.get('source') || 'nekretnine.hr'
        const args = [SCRAPER, '--pages', pages, '--delay', '1200']
        if (source !== 'all') args.push('--source', source)
        const child = spawn('node', args, { cwd: __dirname })
        let log = ''
        child.stdout.on('data', (d) => (log += d))
        child.stderr.on('data', (d) => (log += d))
        child.on('close', async (code) => {
          if (code !== 0) return send(res, 500, { error: 'scraper failed', log })
          const data = await readData()
          send(res, 200, { ...data, log: log.trim().split('\n').slice(-3) })
        })
        child.on('error', (err) => send(res, 500, { error: err.message }))
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), dataApi()],
  server: { port: 5173 },
})
