import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = resolve(__dirname, '../public/data.json');

const INSTITUTIONS = [
  // --- Agro & Investigación ---
  {
    id: 'iniap',
    name: 'INIAP',
    fullName: 'Instituto Nacional de Investigaciones Agropecuarias',
    category: 'Agro & Investigación',
    color: '#52B788',
    sourceUrl: 'https://www.iniap.gob.ec/noticias/',
    selectors: [
      { items: 'article', title: 'h2 a, h3 a, .entry-title a', date: 'time, .entry-date', link: 'h2 a, h3 a, .entry-title a' },
      { items: '.post', title: 'h2 a, h3 a', date: '.date, time', link: 'h2 a, h3 a' },
    ]
  },
  {
    id: 'mag',
    name: 'MAG',
    fullName: 'Ministerio de Agricultura y Ganadería',
    category: 'Agro & Investigación',
    color: '#74C69D',
    sourceUrl: 'https://www.agricultura.gob.ec/noticias/',
    selectors: [
      { items: 'article', title: 'h2 a, h3 a, .entry-title a', date: 'time, .entry-date', link: 'h2 a, h3 a, .entry-title a' },
      { items: '.views-row', title: 'span.field-content a, h3 a', date: 'span.date-display-single, time', link: 'span.field-content a, h3 a' },
    ]
  },
  {
    id: 'agrocalidad',
    name: 'AGROCALIDAD',
    fullName: 'Agencia de Regulación y Control Fito y Zoosanitario',
    category: 'Agro & Investigación',
    color: '#40916C',
    sourceUrl: 'https://www.agrocalidad.gob.ec/noticias/',
    selectors: [
      { items: 'article', title: 'h2 a, h3 a, .entry-title a', date: 'time, .entry-date', link: 'h2 a, h3 a, .entry-title a' },
      { items: '.view-content .views-row', title: '.views-field-title a, h3 a', date: '.views-field-created, time', link: '.views-field-title a, h3 a' },
    ]
  },
  {
    id: 'proecuador',
    name: 'ProEcuador',
    fullName: 'Instituto de Promoción de Exportaciones e Inversiones',
    category: 'Agro & Investigación',
    color: '#95D5B2',
    sourceUrl: 'https://www.proecuador.gob.ec/noticias/',
    selectors: [
      { items: 'article', title: 'h2 a, h3 a, .entry-title a', date: 'time, .entry-date', link: 'h2 a, h3 a, .entry-title a' },
      { items: '.post-item, .news-item', title: 'h2 a, h3 a', date: 'time, .date', link: 'h2 a, h3 a' },
    ]
  },

  // --- Economía & Negocios ---
  {
    id: 'bce',
    name: 'Banco Central',
    fullName: 'Banco Central del Ecuador',
    category: 'Economía & Negocios',
    color: '#457B9D',
    sourceUrl: 'https://www.bce.fin.ec/comunicados/',
    selectors: [
      { items: 'article, .communicado-item', title: 'h2 a, h3 a, .title a', date: 'time, .date', link: 'h2 a, h3 a, .title a' },
      { items: '.views-row', title: '.views-field-title a', date: '.views-field-created', link: '.views-field-title a' },
    ]
  },
  {
    id: 'mipro',
    name: 'MIPRO',
    fullName: 'Ministerio de Producción, Comercio Exterior, Inversiones y Pesca',
    category: 'Economía & Negocios',
    color: '#6A9AB0',
    sourceUrl: 'https://www.produccion.gob.ec/noticias/',
    selectors: [
      { items: 'article', title: 'h2 a, h3 a, .entry-title a', date: 'time, .entry-date', link: 'h2 a, h3 a, .entry-title a' },
      { items: '.news-item, .views-row', title: 'h3 a, .title a', date: 'time, .date', link: 'h3 a, .title a' },
    ]
  },
  {
    id: 'sri',
    name: 'SRI',
    fullName: 'Servicio de Rentas Internas',
    category: 'Economía & Negocios',
    color: '#1D3557',
    sourceUrl: 'https://www.sri.gob.ec/noticias',
    selectors: [
      { items: 'article, .noticia-item', title: 'h2 a, h3 a, .entry-title a', date: 'time, .entry-date', link: 'h2 a, h3 a, .entry-title a' },
      { items: '.views-row', title: '.views-field-title a', date: '.views-field-created', link: '.views-field-title a' },
    ]
  },

  // --- Regulatorio ---
  {
    id: 'arcsa',
    name: 'ARCSA',
    fullName: 'Agencia Nacional de Regulación, Control y Vigilancia Sanitaria',
    category: 'Regulatorio',
    color: '#E9C46A',
    sourceUrl: 'https://www.controlsanitario.gob.ec/noticias/',
    selectors: [
      { items: 'article', title: 'h2 a, h3 a, .entry-title a', date: 'time, .entry-date', link: 'h2 a, h3 a, .entry-title a' },
      { items: '.views-row', title: '.views-field-title a', date: '.views-field-created', link: '.views-field-title a' },
    ]
  },
  {
    id: 'senescyt',
    name: 'SENESCYT',
    fullName: 'Secretaría de Educación Superior, Ciencia, Tecnología e Innovación',
    category: 'Regulatorio',
    color: '#F4A261',
    sourceUrl: 'https://www.senescyt.gob.ec/noticias/',
    selectors: [
      { items: 'article', title: 'h2 a, h3 a, .entry-title a', date: 'time, .entry-date', link: 'h2 a, h3 a, .entry-title a' },
      { items: '.news-item, .views-row', title: 'h3 a, .title a', date: 'time, .date', link: 'h3 a, .title a' },
    ]
  },
  {
    id: 'sercop',
    name: 'SERCOP',
    fullName: 'Servicio Nacional de Contratación Pública',
    category: 'Regulatorio',
    color: '#E76F51',
    sourceUrl: 'https://www.sercop.gob.ec/noticias/',
    selectors: [
      { items: 'article', title: 'h2 a, h3 a, .entry-title a', date: 'time, .entry-date', link: 'h2 a, h3 a, .entry-title a' },
      { items: '.views-row', title: '.views-field-title a', date: '.views-field-created', link: '.views-field-title a' },
    ]
  },

  // --- Seguridad & Gobierno ---
  {
    id: 'min-interior',
    name: 'Min. Interior',
    fullName: 'Ministerio del Interior',
    category: 'Seguridad & Gobierno',
    color: '#9B5DE5',
    sourceUrl: 'https://www.ministeriodelinterior.gob.ec/noticias/',
    selectors: [
      { items: 'article', title: 'h2 a, h3 a, .entry-title a', date: 'time, .entry-date', link: 'h2 a, h3 a, .entry-title a' },
      { items: '.news-item, .views-row', title: 'h3 a, .title a', date: 'time, .date', link: 'h3 a, .title a' },
    ]
  },
  {
    id: 'min-gobierno',
    name: 'Min. Gobierno',
    fullName: 'Ministerio de Gobierno',
    category: 'Seguridad & Gobierno',
    color: '#E07A5F',
    sourceUrl: 'https://www.ministeriodegobierno.gob.ec/noticias/',
    selectors: [
      { items: 'article', title: 'h2 a, h3 a, .entry-title a', date: 'time, .entry-date', link: 'h2 a, h3 a, .entry-title a' },
      { items: '.news-item, .views-row', title: 'h3 a, .title a', date: 'time, .date', link: 'h3 a, .title a' },
    ]
  },
];

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; EcuadorMonitorBot/1.0; +https://github.com/jorgehcorrea/ecuador-monitor)',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'es-EC,es;q=0.9,en;q=0.8',
};

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, { headers: HEADERS, timeout: 15000 });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      if (i === retries - 1) throw err;
      await delay(2000 * (i + 1));
    }
  }
}

function parseNews(html, institution) {
  const $ = cheerio.load(html);
  const items = [];

  for (const sel of institution.selectors) {
    const elements = $(sel.items);
    if (elements.length === 0) continue;

    elements.each((i, el) => {
      if (i >= 5) return false; // max 5 items
      const titleEl = $(el).find(sel.title).first();
      const dateEl = $(el).find(sel.date).first();
      const linkEl = $(el).find(sel.link).first();

      const title = titleEl.text().trim();
      const rawDate = dateEl.attr('datetime') || dateEl.text().trim();
      const href = linkEl.attr('href') || '';

      if (!title || title.length < 10) return;

      const url = href.startsWith('http') ? href : (href ? `${new URL(institution.sourceUrl).origin}${href}` : institution.sourceUrl);
      const date = normalizeDate(rawDate) || new Date().toISOString().split('T')[0];

      items.push({ title, date, url });
    });

    if (items.length > 0) break; // stop if a selector worked
  }

  return items;
}

function normalizeDate(raw) {
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d\-\/\s,a-záéíóúñ]/gi, '').trim();
  const parsed = new Date(cleaned);
  if (!isNaN(parsed)) return parsed.toISOString().split('T')[0];

  // Try common Spanish date patterns
  const months = { enero:0,febrero:1,marzo:2,abril:3,mayo:4,junio:5,julio:6,agosto:7,septiembre:8,octubre:9,noviembre:10,diciembre:11 };
  const m = cleaned.match(/(\d{1,2})\s+de\s+(\w+)\s+(?:de\s+)?(\d{4})/i);
  if (m) {
    const month = months[m[2].toLowerCase()];
    if (month !== undefined) {
      return new Date(parseInt(m[3]), month, parseInt(m[1])).toISOString().split('T')[0];
    }
  }
  return null;
}

async function scrapeInstitution(institution, existingData) {
  console.log(`  Scraping ${institution.name}...`);
  try {
    const html = await fetchWithRetry(institution.sourceUrl);
    const news = parseNews(html, institution);

    if (news.length === 0) {
      console.log(`    ⚠ No items parsed — keeping previous data (stale)`);
      const prev = existingData.find(d => d.id === institution.id);
      return {
        id: institution.id,
        name: institution.name,
        fullName: institution.fullName,
        category: institution.category,
        color: institution.color,
        sourceUrl: institution.sourceUrl,
        status: 'stale',
        news: prev?.news || [],
        lastUpdated: new Date().toISOString(),
      };
    }

    console.log(`    ✓ ${news.length} items`);
    return {
      id: institution.id,
      name: institution.name,
      fullName: institution.fullName,
      category: institution.category,
      color: institution.color,
      sourceUrl: institution.sourceUrl,
      status: 'ok',
      news,
      lastUpdated: new Date().toISOString(),
    };
  } catch (err) {
    console.log(`    ✗ Error: ${err.message} — keeping previous data`);
    const prev = existingData.find(d => d.id === institution.id);
    return {
      id: institution.id,
      name: institution.name,
      fullName: institution.fullName,
      category: institution.category,
      color: institution.color,
      sourceUrl: institution.sourceUrl,
      status: 'error',
      news: prev?.news || [],
      lastUpdated: new Date().toISOString(),
    };
  }
}

async function main() {
  console.log('Ecuador Monitor — starting scrape\n');

  let existingData = [];
  try {
    const raw = readFileSync(DATA_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    existingData = parsed.institutions || [];
    console.log(`Loaded ${existingData.length} existing institution records\n`);
  } catch {
    console.log('No existing data.json found — starting fresh\n');
  }

  const results = [];
  for (const inst of INSTITUTIONS) {
    const result = await scrapeInstitution(inst, existingData);
    results.push(result);
    await delay(1500); // polite delay between requests
  }

  const ok = results.filter(r => r.status === 'ok').length;
  const stale = results.filter(r => r.status === 'stale').length;
  const error = results.filter(r => r.status === 'error').length;

  const output = {
    lastScraped: new Date().toISOString(),
    institutions: results,
    summary: { total: results.length, ok, stale, error },
  };

  writeFileSync(DATA_PATH, JSON.stringify(output, null, 2));
  console.log(`\nDone. ${ok} ok · ${stale} stale · ${error} errors`);
  console.log(`Written to ${DATA_PATH}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
