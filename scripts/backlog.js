/**
 * Ecuador Monitor — Historical Backlog Scraper
 *
 * Run once locally to seed a 2-year archive.
 * Paginates each institution's news archive as far back as possible,
 * then merges results into public/data.json (appends, never overwrites live data).
 *
 * Usage:
 *   cd scripts
 *   npm install
 *   node backlog.js
 *
 * Optional flags:
 *   node backlog.js --years 2        (default: 2 years back from today)
 *   node backlog.js --id mag         (only scrape one institution by id)
 *   node backlog.js --dry-run        (print results, don't write to disk)
 */

import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = resolve(__dirname, '../public/data.json');

// ── CLI flags ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (flag) => {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : null;
};
const DRY_RUN   = args.includes('--dry-run');
const ONLY_ID   = getArg('--id');
const YEARS_BACK = parseInt(getArg('--years') || '2', 10);
const CUTOFF_DATE = new Date();
CUTOFF_DATE.setFullYear(CUTOFF_DATE.getFullYear() - YEARS_BACK);
const CUTOFF_STR = CUTOFF_DATE.toISOString().split('T')[0];

// ── Pagination strategies ──────────────────────────────────────────────────
// Most .gob.ec sites use one of these URL patterns for pagination.
// The scraper tries each in order and stops when it gets no results or hits the cutoff.
const PAGINATION_STRATEGIES = [
  (baseUrl, page) => `${baseUrl}page/${page}/`,           // WordPress default
  (baseUrl, page) => `${baseUrl}?page=${page}`,           // query param
  (baseUrl, page) => `${baseUrl}?paged=${page}`,          // WordPress alt
  (baseUrl, page) => {                                     // Drupal /noticias?page=N (0-indexed)
    const url = new URL(baseUrl);
    url.searchParams.set('page', page - 1);
    return url.toString();
  },
];

// ── Institution definitions (same as scraper.js) ──────────────────────────
const INSTITUTIONS = [
  {
    id: 'iniap', name: 'INIAP',
    fullName: 'Instituto Nacional de Investigaciones Agropecuarias',
    category: 'Agro & Investigación', color: '#52B788',
    sourceUrl: 'https://www.iniap.gob.ec/noticias/',
    selectors: [
      { items: 'article', title: 'h2 a, h3 a, .entry-title a', date: 'time, .entry-date', link: 'h2 a, h3 a, .entry-title a' },
      { items: '.post', title: 'h2 a, h3 a', date: '.date, time', link: 'h2 a, h3 a' },
    ]
  },
  {
    id: 'mag', name: 'MAG',
    fullName: 'Ministerio de Agricultura y Ganadería',
    category: 'Agro & Investigación', color: '#74C69D',
    sourceUrl: 'https://www.agricultura.gob.ec/noticias/',
    selectors: [
      { items: 'article', title: 'h2 a, h3 a, .entry-title a', date: 'time, .entry-date', link: 'h2 a, h3 a, .entry-title a' },
      { items: '.views-row', title: 'span.field-content a, h3 a', date: 'span.date-display-single, time', link: 'span.field-content a, h3 a' },
    ]
  },
  {
    id: 'agrocalidad', name: 'AGROCALIDAD',
    fullName: 'Agencia de Regulación y Control Fito y Zoosanitario',
    category: 'Agro & Investigación', color: '#40916C',
    sourceUrl: 'https://www.agrocalidad.gob.ec/noticias/',
    selectors: [
      { items: 'article', title: 'h2 a, h3 a, .entry-title a', date: 'time, .entry-date', link: 'h2 a, h3 a, .entry-title a' },
      { items: '.view-content .views-row', title: '.views-field-title a, h3 a', date: '.views-field-created, time', link: '.views-field-title a, h3 a' },
    ]
  },
  {
    id: 'proecuador', name: 'ProEcuador',
    fullName: 'Instituto de Promoción de Exportaciones e Inversiones',
    category: 'Agro & Investigación', color: '#95D5B2',
    sourceUrl: 'https://www.proecuador.gob.ec/noticias/',
    selectors: [
      { items: 'article', title: 'h2 a, h3 a, .entry-title a', date: 'time, .entry-date', link: 'h2 a, h3 a, .entry-title a' },
      { items: '.post-item, .news-item', title: 'h2 a, h3 a', date: 'time, .date', link: 'h2 a, h3 a' },
    ]
  },
  {
    id: 'bce', name: 'Banco Central',
    fullName: 'Banco Central del Ecuador',
    category: 'Economía & Negocios', color: '#457B9D',
    sourceUrl: 'https://www.bce.fin.ec/comunicados/',
    selectors: [
      { items: 'article, .communicado-item', title: 'h2 a, h3 a, .title a', date: 'time, .date', link: 'h2 a, h3 a, .title a' },
      { items: '.views-row', title: '.views-field-title a', date: '.views-field-created', link: '.views-field-title a' },
    ]
  },
  {
    id: 'mipro', name: 'MIPRO',
    fullName: 'Ministerio de Producción, Comercio Exterior, Inversiones y Pesca',
    category: 'Economía & Negocios', color: '#6A9AB0',
    sourceUrl: 'https://www.produccion.gob.ec/noticias/',
    selectors: [
      { items: 'article', title: 'h2 a, h3 a, .entry-title a', date: 'time, .entry-date', link: 'h2 a, h3 a, .entry-title a' },
      { items: '.news-item, .views-row', title: 'h3 a, .title a', date: 'time, .date', link: 'h3 a, .title a' },
    ]
  },
  {
    id: 'sri', name: 'SRI',
    fullName: 'Servicio de Rentas Internas',
    category: 'Economía & Negocios', color: '#1D3557',
    sourceUrl: 'https://www.sri.gob.ec/noticias',
    selectors: [
      { items: 'article, .noticia-item', title: 'h2 a, h3 a, .entry-title a', date: 'time, .entry-date', link: 'h2 a, h3 a, .entry-title a' },
      { items: '.views-row', title: '.views-field-title a', date: '.views-field-created', link: '.views-field-title a' },
    ]
  },
  {
    id: 'arcsa', name: 'ARCSA',
    fullName: 'Agencia Nacional de Regulación, Control y Vigilancia Sanitaria',
    category: 'Regulatorio', color: '#E9C46A',
    sourceUrl: 'https://www.controlsanitario.gob.ec/noticias/',
    selectors: [
      { items: 'article', title: 'h2 a, h3 a, .entry-title a', date: 'time, .entry-date', link: 'h2 a, h3 a, .entry-title a' },
      { items: '.views-row', title: '.views-field-title a', date: '.views-field-created', link: '.views-field-title a' },
    ]
  },
  {
    id: 'senescyt', name: 'SENESCYT',
    fullName: 'Secretaría de Educación Superior, Ciencia, Tecnología e Innovación',
    category: 'Regulatorio', color: '#F4A261',
    sourceUrl: 'https://www.senescyt.gob.ec/noticias/',
    selectors: [
      { items: 'article', title: 'h2 a, h3 a, .entry-title a', date: 'time, .entry-date', link: 'h2 a, h3 a, .entry-title a' },
      { items: '.news-item, .views-row', title: 'h3 a, .title a', date: 'time, .date', link: 'h3 a, .title a' },
    ]
  },
  {
    id: 'sercop', name: 'SERCOP',
    fullName: 'Servicio Nacional de Contratación Pública',
    category: 'Regulatorio', color: '#E76F51',
    sourceUrl: 'https://www.sercop.gob.ec/noticias/',
    selectors: [
      { items: 'article', title: 'h2 a, h3 a, .entry-title a', date: 'time, .entry-date', link: 'h2 a, h3 a, .entry-title a' },
      { items: '.views-row', title: '.views-field-title a', date: '.views-field-created', link: '.views-field-title a' },
    ]
  },
  {
    id: 'min-interior', name: 'Min. Interior',
    fullName: 'Ministerio del Interior',
    category: 'Seguridad & Gobierno', color: '#9B5DE5',
    sourceUrl: 'https://www.ministeriodelinterior.gob.ec/noticias/',
    selectors: [
      { items: 'article', title: 'h2 a, h3 a, .entry-title a', date: 'time, .entry-date', link: 'h2 a, h3 a, .entry-title a' },
      { items: '.news-item, .views-row', title: 'h3 a, .title a', date: 'time, .date', link: 'h3 a, .title a' },
    ]
  },
  {
    id: 'min-gobierno', name: 'Min. Gobierno',
    fullName: 'Ministerio de Gobierno',
    category: 'Seguridad & Gobierno', color: '#E07A5F',
    sourceUrl: 'https://www.ministeriodegobierno.gob.ec/noticias/',
    selectors: [
      { items: 'article', title: 'h2 a, h3 a, .entry-title a', date: 'time, .entry-date', link: 'h2 a, h3 a, .entry-title a' },
      { items: '.news-item, .views-row', title: 'h3 a, .title a', date: 'time, .date', link: 'h3 a, .title a' },
    ]
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; EcuadorMonitorBot/1.0; +https://github.com/jorgehcorrea/ecuador-monitor)',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'es-EC,es;q=0.9,en;q=0.8',
};

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchPage(url) {
  const res = await fetch(url, { headers: HEADERS, timeout: 20000 });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

const MONTHS = { enero:0,febrero:1,marzo:2,abril:3,mayo:4,junio:5,julio:6,agosto:7,septiembre:8,octubre:9,noviembre:10,diciembre:11 };

function normalizeDate(raw) {
  if (!raw) return null;
  const cleaned = raw.replace(/[\n\t]+/g, ' ').trim();
  // ISO / standard parse
  const d = new Date(cleaned);
  if (!isNaN(d) && d.getFullYear() > 2000) return d.toISOString().split('T')[0];
  // Spanish: "15 de abril de 2024" or "15 de abril 2024"
  const m = cleaned.match(/(\d{1,2})\s+de\s+(\w+)\s+(?:de\s+)?(\d{4})/i);
  if (m) {
    const mo = MONTHS[m[2].toLowerCase()];
    if (mo !== undefined) return new Date(parseInt(m[3]), mo, parseInt(m[1])).toISOString().split('T')[0];
  }
  // dd/mm/yyyy or dd-mm-yyyy
  const dmy = cleaned.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (dmy) return new Date(parseInt(dmy[3]), parseInt(dmy[2])-1, parseInt(dmy[1])).toISOString().split('T')[0];
  return null;
}

function parseItems(html, inst) {
  const $ = cheerio.load(html);
  const results = [];

  for (const sel of inst.selectors) {
    const els = $(sel.items);
    if (els.length === 0) continue;

    els.each((_, el) => {
      const titleEl = $(el).find(sel.title).first();
      const dateEl  = $(el).find(sel.date).first();
      const linkEl  = $(el).find(sel.link).first();

      const title = titleEl.text().trim();
      if (!title || title.length < 10) return;

      const rawDate = dateEl.attr('datetime') || dateEl.text().trim();
      const date = normalizeDate(rawDate) || null;

      const href = linkEl.attr('href') || '';
      const url = href.startsWith('http')
        ? href
        : href ? `${new URL(inst.sourceUrl).origin}${href}` : inst.sourceUrl;

      results.push({ title, date, url });
    });

    if (results.length > 0) break;
  }

  return results;
}

// Detect if a page is empty / same as page 1 (pagination ended)
function isEmptyOrDuplicate(items, seenTitles) {
  if (items.length === 0) return true;
  const newTitles = items.map(i => i.title);
  const overlap = newTitles.filter(t => seenTitles.has(t)).length;
  return overlap >= newTitles.length * 0.8; // 80%+ duplicates = stop
}

// ── Core: paginate one institution ────────────────────────────────────────
async function scrapeInstitutionBacklog(inst) {
  console.log(`\n  [${inst.id}] Starting backlog scrape (cutoff: ${CUTOFF_STR})`);
  const allItems = [];
  const seenTitles = new Set();
  const seenUrls   = new Set();

  // Try each pagination strategy; use whichever works
  let workingStrategy = null;

  // Always scrape page 1 first to establish baseline
  let page1Html;
  try {
    page1Html = await fetchPage(inst.sourceUrl);
  } catch (e) {
    console.log(`    ✗ Cannot reach ${inst.sourceUrl}: ${e.message}`);
    return [];
  }

  const page1Items = parseItems(page1Html, inst);
  if (page1Items.length === 0) {
    console.log(`    ⚠ Page 1 parsed 0 items — site may require JS rendering`);
    return [];
  }

  page1Items.forEach(i => { allItems.push(i); seenTitles.add(i.title); if (i.url) seenUrls.add(i.url); });
  console.log(`    Page 1: ${page1Items.length} items`);

  // Check if all page 1 items are already past cutoff (nothing to backfill)
  const datedItems = page1Items.filter(i => i.date);
  if (datedItems.length > 0 && datedItems.every(i => i.date < CUTOFF_STR)) {
    console.log(`    All page 1 items pre-date cutoff — no backlog needed`);
    return allItems;
  }

  // Try pagination strategies
  for (const strategy of PAGINATION_STRATEGIES) {
    const testUrl = strategy(inst.sourceUrl, 2);
    if (testUrl === inst.sourceUrl) continue; // same URL, skip
    try {
      const html = await fetchPage(testUrl);
      await delay(1000);
      const items = parseItems(html, inst);
      if (items.length > 0 && !isEmptyOrDuplicate(items, seenTitles)) {
        workingStrategy = strategy;
        console.log(`    ✓ Pagination works: ${testUrl}`);
        items.forEach(i => { allItems.push(i); seenTitles.add(i.title); if (i.url) seenUrls.add(i.url); });
        console.log(`    Page 2: ${items.length} items`);
        break;
      }
    } catch { /* try next */ }
  }

  if (!workingStrategy) {
    console.log(`    ⚠ No pagination found — only page 1 available`);
    return dedup(allItems);
  }

  // Paginate until cutoff or no more pages (max 100 pages safety limit)
  let page = 3;
  let hitCutoff = false;
  let emptyStreak = 0;

  while (page <= 100 && !hitCutoff) {
    const url = workingStrategy(inst.sourceUrl, page);
    try {
      await delay(1500 + Math.random() * 500); // polite random delay
      const html = await fetchPage(url);
      const items = parseItems(html, inst);

      if (isEmptyOrDuplicate(items, seenTitles)) {
        emptyStreak++;
        if (emptyStreak >= 2) {
          console.log(`    ↳ Pagination ended at page ${page}`);
          break;
        }
      } else {
        emptyStreak = 0;
        let pageNew = 0;
        for (const item of items) {
          if (item.date && item.date < CUTOFF_STR) { hitCutoff = true; break; }
          if (!seenTitles.has(item.title)) {
            allItems.push(item);
            seenTitles.add(item.title);
            if (item.url) seenUrls.add(item.url);
            pageNew++;
          }
        }
        console.log(`    Page ${page}: ${pageNew} new items${hitCutoff ? ' (cutoff reached)' : ''}`);
      }
    } catch (e) {
      emptyStreak++;
      console.log(`    Page ${page}: fetch error (${e.message})`);
      if (emptyStreak >= 3) break;
    }
    page++;
  }

  const final = dedup(allItems).filter(i => !i.date || i.date >= CUTOFF_STR);
  console.log(`    Total: ${final.length} items within cutoff`);
  return final;
}

function dedup(items) {
  const seen = new Set();
  return items.filter(i => {
    const key = i.title.slice(0, 60).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── Merge into data.json ───────────────────────────────────────────────────
function mergeIntoData(backlogByInst) {
  let existing;
  try {
    existing = JSON.parse(readFileSync(DATA_PATH, 'utf8'));
  } catch {
    existing = { lastScraped: new Date().toISOString(), institutions: [], summary: {} };
  }

  let totalAdded = 0;

  for (const inst of INSTITUTIONS) {
    const backlog = backlogByInst[inst.id] || [];
    const existingInst = existing.institutions.find(i => i.id === inst.id);

    if (!existingInst) {
      // Institution not in data.json at all — create it
      existing.institutions.push({
        id: inst.id, name: inst.name, fullName: inst.fullName,
        category: inst.category, color: inst.color, sourceUrl: inst.sourceUrl,
        status: backlog.length > 0 ? 'ok' : 'stale',
        news: backlog,
        lastUpdated: new Date().toISOString(),
      });
      totalAdded += backlog.length;
      continue;
    }

    // Merge: combine existing news with backlog, dedup by title, sort by date desc
    const existingTitles = new Set(existingInst.news.map(n => n.title.slice(0, 60).toLowerCase()));
    let added = 0;
    for (const item of backlog) {
      const key = item.title.slice(0, 60).toLowerCase();
      if (!existingTitles.has(key)) {
        existingInst.news.push(item);
        existingTitles.add(key);
        added++;
      }
    }
    // Sort newest first
    existingInst.news.sort((a, b) => {
      const da = a.date || '0000-00-00';
      const db = b.date || '0000-00-00';
      return db.localeCompare(da);
    });
    totalAdded += added;
    console.log(`  [${inst.id}] Merged ${added} new items → total ${existingInst.news.length}`);
  }

  // Update summary
  const ok    = existing.institutions.filter(i => i.news.length > 0).length;
  const stale = existing.institutions.filter(i => i.news.length === 0).length;
  existing.summary = { total: existing.institutions.length, ok, stale, error: 0 };
  existing.lastScraped = new Date().toISOString();

  return { data: existing, totalAdded };
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log(' Ecuador Monitor — Historical Backlog Scraper');
  console.log(`═══════════════════════════════════════════════════`);
  console.log(` Cutoff : ${CUTOFF_STR} (${YEARS_BACK} years back)`);
  console.log(` Dry run: ${DRY_RUN}`);
  if (ONLY_ID) console.log(` Filter : ${ONLY_ID}`);
  console.log('───────────────────────────────────────────────────\n');

  const targets = ONLY_ID
    ? INSTITUTIONS.filter(i => i.id === ONLY_ID)
    : INSTITUTIONS;

  if (targets.length === 0) {
    console.error(`No institution found with id "${ONLY_ID}"`);
    process.exit(1);
  }

  const backlogByInst = {};

  for (const inst of targets) {
    const items = await scrapeInstitutionBacklog(inst);
    backlogByInst[inst.id] = items;
    await delay(2000); // pause between institutions
  }

  console.log('\n───────────────────────────────────────────────────');
  console.log(' Merging into data.json…');

  const { data, totalAdded } = mergeIntoData(backlogByInst);

  if (DRY_RUN) {
    console.log(`\n[DRY RUN] Would add ${totalAdded} items. Not writing to disk.`);
    console.log('Sample output (first 3 items of first institution):');
    const first = data.institutions[0];
    console.log(JSON.stringify(first.news.slice(0, 3), null, 2));
  } else {
    writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
    console.log(`\n✓ Written to ${DATA_PATH}`);
    console.log(`  Total new items added: ${totalAdded}`);

    const totalItems = data.institutions.reduce((s, i) => s + i.news.length, 0);
    const fileSizeKB = Math.round(JSON.stringify(data).length / 1024);
    console.log(`  Total items in archive: ${totalItems}`);
    console.log(`  File size: ~${fileSizeKB} KB`);
  }

  console.log('\nDone.');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
