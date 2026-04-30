/**
 * Ecuador Monitor — Claude API Scraper v2.0
 * Archive-based architecture:
 *   - public/archive/[id].json  — permanent per-institution history
 *   - public/data.json          — current week feed (fast, small)
 *
 * New items get summaries generated. Existing items reuse cached summaries.
 * Requires: ANTHROPIC_API_KEY environment variable
 */

import fetch from 'node-fetch';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH    = resolve(__dirname, '../public/data.json');
const ARCHIVE_DIR  = resolve(__dirname, '../public/archive');

// Ensure archive directory exists
if (!existsSync(ARCHIVE_DIR)) mkdirSync(ARCHIVE_DIR, { recursive: true });

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) {
  console.error('ERROR: ANTHROPIC_API_KEY environment variable is not set.');
  process.exit(1);
}

// ── Institution definitions ───────────────────────────────────────────────
const INSTITUTIONS = [
  // --- Agro & Investigación ---
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

  // --- Economía & Negocios ---
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

  // --- Regulatorio ---
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

  // --- Seguridad & Gobierno ---
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
  {
    id: 'presidencia',
    name: 'Presidencia',
    fullName: 'Presidencia de la República del Ecuador',
    category: 'Seguridad & Gobierno',
    color: '#E63946',
    sourceUrl: 'https://www.comunicacion.gob.ec/noticias/',
    searchQuery: 'Presidencia República Ecuador Noboa decretos ejecutivos acciones gobierno noticias 2025 2026',
  },

  // --- Legislativo & Judicial ---
  {
    id: 'cne',
    name: 'CNE',
    fullName: 'Consejo Nacional Electoral',
    category: 'Legislativo & Judicial',
    color: '#F72585',
    sourceUrl: 'https://www.cne.gob.ec/noticias/',
    searchQuery: 'CNE Ecuador resolvió aprobó suspendió electoral noticias recientes site:primicias.ec OR site:eluniverso.com OR site:expreso.ec OR site:cne.gob.ec',
  },
  {
    id: 'asamblea',
    name: 'Asamblea',
    fullName: 'Asamblea Nacional del Ecuador',
    category: 'Legislativo & Judicial',
    color: '#7209B7',
    sourceUrl: 'https://www.asambleanacional.gob.ec/es/noticias',
    searchQuery: 'Asamblea Nacional Ecuador aprobó debatió archivó ley proyecto noticias recientes site:primicias.ec OR site:eluniverso.com OR site:asambleanacional.gob.ec',
  },
  {
    id: 'corte-constitucional',
    name: 'Corte Const.',
    fullName: 'Corte Constitucional del Ecuador',
    category: 'Legislativo & Judicial',
    color: '#3A0CA3',
    sourceUrl: 'https://www.corteconstitucional.gob.ec/noticias/',
    searchQuery: 'Corte Constitucional Ecuador falló dictaminó declaró inconstitucional noticias recientes site:primicias.ec OR site:eluniverso.com OR site:corteconstitucional.gob.ec',
  },
  {
    id: 'pge',
    name: 'PGE',
    fullName: 'Procuraduría General del Estado',
    category: 'Legislativo & Judicial',
    color: '#560BAD',
    sourceUrl: 'https://www.pge.gob.ec/',
    searchQuery: 'Procuraduría General Estado Ecuador pronunciamiento opinión jurídica resolvió noticias recientes site:primicias.ec OR site:eluniverso.com OR site:pge.gob.ec',
  },
  {
    id: 'contraloria',
    name: 'Contraloría',
    fullName: 'Contraloría General del Estado',
    category: 'Legislativo & Judicial',
    color: '#480CA8',
    sourceUrl: 'https://www.contraloria.gob.ec/SalaDePrensa/',
    searchQuery: 'Contraloría General Estado Ecuador auditoría responsabilidad glosa informe noticias recientes site:primicias.ec OR site:eluniverso.com OR site:contraloria.gob.ec',
  },
  {
    id: 'registro-oficial',
    name: 'Reg. Oficial',
    fullName: 'Registro Oficial del Ecuador',
    category: 'Legislativo & Judicial',
    color: '#3A0CA3',
    sourceUrl: 'https://www.registroficial.gob.ec/',
    searchQuery: 'Registro Oficial Ecuador decreto ejecutivo ley orgánica acuerdo ministerial publicado noticias recientes site:registroficial.gob.ec OR site:primicias.ec OR site:eluniverso.com',
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function makeKey(instId, title) {
  return `${instId}::${title.toLowerCase().trim().slice(0, 60).replace(/\s+/g, '-').replace(/[^a-z0-9\-áéíóúñ]/g, '')}`;
}

function archivePath(instId) {
  return resolve(ARCHIVE_DIR, `${instId}.json`);
}

function loadArchive(instId) {
  const path = archivePath(instId);
  try {
    if (existsSync(path)) {
      const data = JSON.parse(readFileSync(path, 'utf8'));
      return data.items || [];
    }
  } catch (e) {
    console.log(`    ⚠ Could not load archive for ${instId}: ${e.message}`);
  }
  return [];
}

function saveArchive(inst, items) {
  const path = archivePath(inst.id);
  const data = {
    id: inst.id,
    name: inst.name,
    fullName: inst.fullName,
    lastUpdated: new Date().toISOString(),
    items,
  };
  writeFileSync(path, JSON.stringify(data, null, 2));
}

function currentWeekItems(items) {
  // Items from the last 7 days
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  const cutoffStr = cutoff.toISOString().split('T')[0];
  const recent = items.filter(i => i.date >= cutoffStr);
  // Always return at least 5 items even if older, so feed is never empty
  return recent.length >= 3 ? recent : items.slice(0, 5);
}

// ── Claude API call ───────────────────────────────────────────────────────
async function fetchNewsFromClaude(institution) {
  const today = new Date().toISOString().split('T')[0];

  const prompt = `Search the web and find the 5 most recent official news items, announcements, or press releases from ${institution.fullName} (${institution.name}) in Ecuador. Today's date is ${today}.

Return ONLY a JSON array with exactly this structure, no other text, no markdown, no explanation:
[
  {
    "title": "Full title of the news item in Spanish",
    "date": "YYYY-MM-DD",
    "url": "https://direct-url-to-the-article-or-source",
    "summary": "1-2 plain language sentences in Spanish explaining what this news means in practice. Avoid repeating the title. Focus on real-world effect."
  }
]

CRITICAL RULES — follow every single one:
- Return ONLY the JSON array, nothing else before or after it
- Every single item MUST have all 4 fields: title, date, url, summary
- The summary field is MANDATORY — never omit it, never leave it empty
- Summaries must be in Spanish, 1-2 sentences, plain language — explain what actually changes in the real world as a result of this news. Do not repeat the title.
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
      max_tokens: 4096,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`API error ${response.status}: ${err.slice(0, 200)}`);
  }

  const data = await response.json();
  const textBlocks = data.content.filter(b => b.type === 'text');
  if (textBlocks.length === 0) throw new Error('No text in API response');

  const raw = textBlocks[textBlocks.length - 1].text.trim();
  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error(`No JSON array found in response: ${raw.slice(0, 100)}`);

  const parsed = JSON.parse(jsonMatch[0]);
  if (!Array.isArray(parsed)) throw new Error('Response is not an array');

  // Strict validation — require all 4 fields including non-empty summary
  const valid = parsed.filter(item =>
    item.title && item.date && item.url &&
    item.summary && String(item.summary).trim().length > 10
  );

  if (valid.length < parsed.length) {
    console.log(`    ⚠ ${parsed.length - valid.length} items missing summary — discarded`);
  }

  return valid.map(item => ({
    title: String(item.title).trim(),
    date: String(item.date).trim(),
    url: String(item.url).trim(),
    summary: String(item.summary).trim(),
  })).slice(0, 5);
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  console.log('Ecuador Monitor — Claude API Scraper v2.0 (archive mode)');
  console.log(`Date: ${new Date().toISOString()}\n`);

  const dataInstitutions = [];
  let okCount = 0;
  let errCount = 0;
  let newItemsTotal = 0;
  let cachedItemsTotal = 0;

  for (const inst of INSTITUTIONS) {
    process.stdout.write(`  [${inst.id}] `);

    // Load existing archive for this institution
    const archive = loadArchive(inst.id);
    const archiveKeys = new Set(archive.map(i => i.key));

    let freshItems = [];
    try {
      // Fetch latest from Claude API
      const fetched = await fetchNewsFromClaude(inst);

      // Separate new vs already-archived items
      const newItems = fetched.filter(i => {
        const key = makeKey(inst.id, i.title);
        return !archiveKeys.has(key);
      });

      const cachedItems = fetched.filter(i => {
        const key = makeKey(inst.id, i.title);
        return archiveKeys.has(key);
      });

      // Enrich new items with key and scrapedAt timestamp
      const enrichedNew = newItems.map(i => ({
        key: makeKey(inst.id, i.title),
        ...i,
        scrapedAt: new Date().toISOString(),
      }));

      // For cached items, pull summary from archive (in case API dropped it)
      const enrichedCached = cachedItems.map(i => {
        const key = makeKey(inst.id, i.title);
        const archived = archive.find(a => a.key === key);
        return {
          key,
          ...i,
          summary: (i.summary && i.summary.length > 10) ? i.summary : (archived?.summary || i.summary),
          scrapedAt: archived?.scrapedAt || new Date().toISOString(),
        };
      });

      console.log(`fetching... ✓ ${newItems.length} new · ${cachedItems.length} cached`);
      newItemsTotal += newItems.length;
      cachedItemsTotal += cachedItems.length;

      // Merge new items into archive (prepend new, keep existing)
      const updatedArchive = [...enrichedNew, ...archive.filter(a => {
        // Don't duplicate items that came back in this fetch
        const matchedInFetch = enrichedCached.find(c => c.key === a.key);
        return !matchedInFetch;
      }), ...enrichedCached];

      // Sort by date descending
      updatedArchive.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

      // Save updated archive
      saveArchive(inst, updatedArchive);

      freshItems = updatedArchive;
      okCount++;
    } catch (err) {
      console.log(`fetching... ✗ ${err.message.slice(0, 80)}`);
      errCount++;
      // On error fall back to whatever is in the archive
      freshItems = archive;
    }

    // For data.json — show current week items (or last 5 if recent ones are sparse)
    const feedItems = currentWeekItems(freshItems).map(i => ({
      title: i.title,
      date: i.date,
      url: i.url,
      summary: i.summary || '',
    }));

    dataInstitutions.push({
      id: inst.id,
      name: inst.name,
      fullName: inst.fullName,
      category: inst.category,
      color: inst.color,
      sourceUrl: inst.sourceUrl,
      status: freshItems.length > 0 ? 'ok' : 'stale',
      news: feedItems,
      lastUpdated: new Date().toISOString(),
    });

    await delay(25000);
  }

  // Write lean data.json for the dashboard
  const output = {
    lastScraped: new Date().toISOString(),
    institutions: dataInstitutions,
    summary: {
      total: dataInstitutions.length,
      ok: okCount,
      stale: dataInstitutions.filter(i => i.status === 'stale').length,
      error: errCount,
    },
  };

  writeFileSync(DATA_PATH, JSON.stringify(output, null, 2));

  console.log(`\nDone. ${okCount} ok · ${errCount} errors`);
  console.log(`New items: ${newItemsTotal} · Cached (no API call): ${cachedItemsTotal}`);
  console.log(`Written to ${DATA_PATH}`);
  console.log(`Archive files updated in ${ARCHIVE_DIR}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
