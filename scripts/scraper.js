/**
 * Ecuador Monitor — Claude API Scraper
 *
 * Uses the Claude API with web_search to find recent news
 * from each institution. No direct scraping of .gob.ec sites.
 *
 * Requires: ANTHROPIC_API_KEY environment variable
 */

import fetch from 'node-fetch';
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = resolve(__dirname, '../public/data.json');

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) {
  console.error('ERROR: ANTHROPIC_API_KEY environment variable is not set.');
  process.exit(1);
}

// ── Institution definitions ───────────────────────────────────────────────
const INSTITUTIONS = [
  {
    id: 'iniap',
    name: 'INIAP',
    fullName: 'Instituto Nacional de Investigaciones Agropecuarias',
    category: 'Agro & Investigación',
    color: '#52B788',
    sourceUrl: 'https://www.iniap.gob.ec/noticias/',
    searchQuery: 'INIAP Ecuador Instituto Nacional Investigaciones Agropecuarias noticias 2025 2026',
  },
  {
    id: 'mag',
    name: 'MAG',
    fullName: 'Ministerio de Agricultura y Ganadería',
    category: 'Agro & Investigación',
    color: '#74C69D',
    sourceUrl: 'https://www.agricultura.gob.ec/noticias/',
    searchQuery: 'Ministerio Agricultura Ganadería Ecuador MAG noticias comunicados 2025 2026',
  },
  {
    id: 'agrocalidad',
    name: 'AGROCALIDAD',
    fullName: 'Agencia de Regulación y Control Fito y Zoosanitario',
    category: 'Agro & Investigación',
    color: '#40916C',
    sourceUrl: 'https://www.agrocalidad.gob.ec/noticias/',
    searchQuery: 'AGROCALIDAD Ecuador agencia fitosanitaria noticias resoluciones 2025 2026',
  },
  {
    id: 'proecuador',
    name: 'ProEcuador',
    fullName: 'Instituto de Promoción de Exportaciones e Inversiones',
    category: 'Agro & Investigación',
    color: '#95D5B2',
    sourceUrl: 'https://www.proecuador.gob.ec/noticias/',
    searchQuery: 'ProEcuador exportaciones inversiones noticias comunicados 2025 2026',
  },
  {
    id: 'bce',
    name: 'Banco Central',
    fullName: 'Banco Central del Ecuador',
    category: 'Economía & Negocios',
    color: '#457B9D',
    sourceUrl: 'https://www.bce.fin.ec/comunicados/',
    searchQuery: 'Banco Central Ecuador BCE comunicados noticias economía 2025 2026',
  },
  {
    id: 'mipro',
    name: 'MIPRO',
    fullName: 'Ministerio de Producción, Comercio Exterior, Inversiones y Pesca',
    category: 'Economía & Negocios',
    color: '#6A9AB0',
    sourceUrl: 'https://www.produccion.gob.ec/noticias/',
    searchQuery: 'MIPRO Ministerio Producción Comercio Exterior Ecuador noticias 2025 2026',
  },
  {
    id: 'sri',
    name: 'SRI',
    fullName: 'Servicio de Rentas Internas',
    category: 'Economía & Negocios',
    color: '#1D3557',
    sourceUrl: 'https://www.sri.gob.ec/noticias',
    searchQuery: 'SRI Servicio Rentas Internas Ecuador noticias resoluciones tributarias 2025 2026',
  },
  {
    id: 'arcsa',
    name: 'ARCSA',
    fullName: 'Agencia Nacional de Regulación, Control y Vigilancia Sanitaria',
    category: 'Regulatorio',
    color: '#E9C46A',
    sourceUrl: 'https://www.controlsanitario.gob.ec/noticias/',
    searchQuery: 'ARCSA Ecuador agencia regulación sanitaria noticias resoluciones 2025 2026',
  },
  {
    id: 'senescyt',
    name: 'SENESCYT',
    fullName: 'Secretaría de Educación Superior, Ciencia, Tecnología e Innovación',
    category: 'Regulatorio',
    color: '#F4A261',
    sourceUrl: 'https://www.senescyt.gob.ec/noticias/',
    searchQuery: 'SENESCYT Ecuador educación superior ciencia tecnología noticias 2025 2026',
  },
  {
    id: 'sercop',
    name: 'SERCOP',
    fullName: 'Servicio Nacional de Contratación Pública',
    category: 'Regulatorio',
    color: '#E76F51',
    sourceUrl: 'https://www.sercop.gob.ec/noticias/',
    searchQuery: 'SERCOP Ecuador contratación pública noticias resoluciones 2025 2026',
  },
  {
    id: 'min-interior',
    name: 'Min. Interior',
    fullName: 'Ministerio del Interior',
    category: 'Seguridad & Gobierno',
    color: '#9B5DE5',
    sourceUrl: 'https://www.ministeriodelinterior.gob.ec/noticias/',
    searchQuery: 'Ministerio Interior Ecuador seguridad policia noticias comunicados 2025 2026',
  },
  {
    id: 'min-gobierno',
    name: 'Min. Gobierno',
    fullName: 'Ministerio de Gobierno',
    category: 'Seguridad & Gobierno',
    color: '#E07A5F',
    sourceUrl: 'https://www.ministeriodegobierno.gob.ec/noticias/',
    searchQuery: 'Ministerio Gobierno Ecuador noticias decretos comunicados 2025 2026',
  },
];

// ── Delay helper ──────────────────────────────────────────────────────────
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Call Claude API with web search ──────────────────────────────────────
async function fetchNewsFromClaude(institution) {
  const today = new Date().toISOString().split('T')[0];

  const prompt = `Search the web and find the 5 most recent official news items, announcements, or press releases from ${institution.fullName} (${institution.name}) in Ecuador. Today's date is ${today}.

Return ONLY a JSON array with exactly this structure, no other text, no markdown, no explanation:
[
  {
    "title": "Full title of the news item in Spanish",
    "date": "YYYY-MM-DD",
    "url": "https://direct-url-to-the-article-or-source"
  }
]

Rules:
- Titles must be in Spanish
- Dates must be real dates in YYYY-MM-DD format, from the last 90 days if possible
- URLs must be real, working URLs from the search results
- If you cannot find 5 items, return however many you find (minimum 1)
- Items must be sorted newest first
- Do not invent or fabricate any items`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
      
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      tools: [
        {
          type: 'web_search_20250305',
          name: 'web_search',
        }
      ],
      messages: [
        { role: 'user', content: prompt }
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`API error ${response.status}: ${err.slice(0, 200)}`);
  }

  const data = await response.json();

  // Extract the final text response from content blocks
  const textBlocks = data.content.filter(b => b.type === 'text');
  if (textBlocks.length === 0) throw new Error('No text in API response');

  const raw = textBlocks[textBlocks.length - 1].text.trim();

  // Parse JSON — strip any accidental markdown fences
  const clean = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
  const parsed = JSON.parse(clean);

  if (!Array.isArray(parsed)) throw new Error('Response is not an array');

  // Validate and clean each item
  return parsed
    .filter(item => item.title && item.date && item.url)
    .map(item => ({
      title: String(item.title).trim(),
      date: String(item.date).trim(),
      url: String(item.url).trim(),
    }))
    .slice(0, 5);
}

// ── Merge new items into existing institution data ────────────────────────
function mergeNews(existingNews, newNews) {
  const existingTitles = new Set(
    existingNews.map(n => n.title.slice(0, 60).toLowerCase())
  );

  const toAdd = newNews.filter(
    n => !existingTitles.has(n.title.slice(0, 60).toLowerCase())
  );

  const merged = [...toAdd, ...existingNews];

  // Sort newest first
  merged.sort((a, b) => {
    const da = a.date || '0000-00-00';
    const db = b.date || '0000-00-00';
    return db.localeCompare(da);
  });

  // Keep max 100 items per institution (backlog cap)
  return merged.slice(0, 100);
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  console.log('Ecuador Monitor — Claude API Scraper');
  console.log(`Date: ${new Date().toISOString()}\n`);

  // Load existing data
  let existing;
  try {
    existing = JSON.parse(readFileSync(DATA_PATH, 'utf8'));
    console.log(`Loaded existing data: ${existing.institutions.length} institutions\n`);
  } catch {
    console.log('No existing data.json — starting fresh\n');
    existing = { lastScraped: new Date().toISOString(), institutions: [], summary: {} };
  }

  const results = [];
  let okCount = 0;
  let errCount = 0;

  for (const inst of INSTITUTIONS) {
    process.stdout.write(`  [${inst.id}] fetching... `);

    // Find existing institution record
    const existingInst = existing.institutions.find(i => i.id === inst.id);
    const existingNews = existingInst?.news || [];

    try {
      const newNews = await fetchNewsFromClaude(inst);
      const mergedNews = mergeNews(existingNews, newNews);

      results.push({
        id: inst.id,
        name: inst.name,
        fullName: inst.fullName,
        category: inst.category,
        color: inst.color,
        sourceUrl: inst.sourceUrl,
        status: 'ok',
        news: mergedNews,
        lastUpdated: new Date().toISOString(),
      });

      console.log(`✓ ${newNews.length} new items (total: ${mergedNews.length})`);
      okCount++;
    } catch (err) {
      console.log(`✗ ${err.message.slice(0, 80)}`);
      errCount++;

      // Keep previous data on error
      results.push({
        id: inst.id,
        name: inst.name,
        fullName: inst.fullName,
        category: inst.category,
        color: inst.color,
        sourceUrl: inst.sourceUrl,
        status: 'error',
        news: existingNews,
        lastUpdated: existingInst?.lastUpdated || new Date().toISOString(),
      });
    }

    // Respectful delay between API calls to avoid rate limiting
    await delay(2000);
  }

  // Write output
  const output = {
    lastScraped: new Date().toISOString(),
    institutions: results,
    summary: {
      total: results.length,
      ok: okCount,
      stale: 0,
      error: errCount,
    },
  };

  writeFileSync(DATA_PATH, JSON.stringify(output, null, 2));

  console.log(`\nDone. ${okCount} ok · ${errCount} errors`);
  console.log(`Written to ${DATA_PATH}`);

  const totalItems = results.reduce((s, i) => s + i.news.length, 0);
  console.log(`Total items in archive: ${totalItems}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});