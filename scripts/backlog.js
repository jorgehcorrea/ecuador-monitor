/**
 * Ecuador Monitor — Backlog Script
 *
 * Fetches historical news month by month from January 2026 to today
 * for the 6 Legislativo & Judicial institutions (or all 19 with --all).
 *
 * Runs ONCE locally to seed the archive with this year's history.
 * Results saved to public/archive/[id].json, merged with existing data.
 *
 * Usage:
 *   cd scripts
 *   ANTHROPIC_API_KEY=sk-ant-... node backlog.js
 *
 * Optional flags:
 *   --all              run for all 19 institutions
 *   --id asamblea      run for one institution only
 *   --from 2025-01     start from a different month (default: 2026-01)
 *   --dry-run          print results without saving to disk
 */

import fetch from 'node-fetch';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ARCHIVE_DIR = resolve(__dirname, '../public/archive');

if (!existsSync(ARCHIVE_DIR)) mkdirSync(ARCHIVE_DIR, { recursive: true });

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) {
  console.error('ERROR: ANTHROPIC_API_KEY is not set.');
  console.error('Run as: ANTHROPIC_API_KEY=sk-ant-... node backlog.js');
  process.exit(1);
}

// ── CLI flags ─────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = flag => { const i = args.indexOf(flag); return i !== -1 ? args[i+1] : null; };
const DRY_RUN    = args.includes('--dry-run');
const RUN_ALL    = args.includes('--all');
const ONLY_ID    = getArg('--id');
const FROM_MONTH = getArg('--from') || '2026-01';

// ── Institution list ──────────────────────────────────────────────────────
const ALL_INSTITUTIONS = [
  { id: 'iniap',                name: 'INIAP',         fullName: 'Instituto Nacional de Investigaciones Agropecuarias',           category: 'Agro & Investigación',   color: '#52B788', sourceUrl: 'https://www.iniap.gob.ec/noticias/' },
  { id: 'mag',                  name: 'MAG',           fullName: 'Ministerio de Agricultura y Ganadería',                         category: 'Agro & Investigación',   color: '#74C69D', sourceUrl: 'https://www.agricultura.gob.ec/noticias/' },
  { id: 'agrocalidad',          name: 'AGROCALIDAD',   fullName: 'Agencia de Regulación y Control Fito y Zoosanitario',           category: 'Agro & Investigación',   color: '#40916C', sourceUrl: 'https://www.agrocalidad.gob.ec/noticias/' },
  { id: 'proecuador',           name: 'ProEcuador',    fullName: 'Instituto de Promoción de Exportaciones e Inversiones',         category: 'Agro & Investigación',   color: '#95D5B2', sourceUrl: 'https://www.proecuador.gob.ec/noticias/' },
  { id: 'bce',                  name: 'Banco Central', fullName: 'Banco Central del Ecuador',                                     category: 'Economía & Negocios',    color: '#457B9D', sourceUrl: 'https://www.bce.fin.ec/comunicados/' },
  { id: 'mipro',                name: 'MIPRO',         fullName: 'Ministerio de Producción, Comercio Exterior, Inversiones y Pesca', category: 'Economía & Negocios', color: '#6A9AB0', sourceUrl: 'https://www.produccion.gob.ec/noticias/' },
  { id: 'sri',                  name: 'SRI',           fullName: 'Servicio de Rentas Internas',                                   category: 'Economía & Negocios',    color: '#1D3557', sourceUrl: 'https://www.sri.gob.ec/noticias' },
  { id: 'arcsa',                name: 'ARCSA',         fullName: 'Agencia Nacional de Regulación, Control y Vigilancia Sanitaria', category: 'Regulatorio',           color: '#E9C46A', sourceUrl: 'https://www.controlsanitario.gob.ec/noticias/' },
  { id: 'senescyt',             name: 'SENESCYT',      fullName: 'Secretaría de Educación Superior, Ciencia, Tecnología e Innovación', category: 'Regulatorio',       color: '#F4A261', sourceUrl: 'https://www.senescyt.gob.ec/noticias/' },
  { id: 'sercop',               name: 'SERCOP',        fullName: 'Servicio Nacional de Contratación Pública',                     category: 'Regulatorio',            color: '#E76F51', sourceUrl: 'https://www.sercop.gob.ec/noticias/' },
  { id: 'min-interior',         name: 'Min. Interior', fullName: 'Ministerio del Interior',                                       category: 'Seguridad & Gobierno',   color: '#9B5DE5', sourceUrl: 'https://www.ministeriodelinterior.gob.ec/noticias/' },
  { id: 'min-gobierno',         name: 'Min. Gobierno', fullName: 'Ministerio de Gobierno',                                        category: 'Seguridad & Gobierno',   color: '#E07A5F', sourceUrl: 'https://www.ministeriodegobierno.gob.ec/noticias/' },
  { id: 'presidencia',          name: 'Presidencia',   fullName: 'Presidencia de la República del Ecuador',                       category: 'Seguridad & Gobierno',   color: '#E63946', sourceUrl: 'https://www.comunicacion.gob.ec/noticias/' },
  { id: 'cne',                  name: 'CNE',           fullName: 'Consejo Nacional Electoral',                                    category: 'Legislativo & Judicial', color: '#F72585', sourceUrl: 'https://www.cne.gob.ec/noticias/' },
  { id: 'asamblea',             name: 'Asamblea',      fullName: 'Asamblea Nacional del Ecuador',                                 category: 'Legislativo & Judicial', color: '#7209B7', sourceUrl: 'https://www.asambleanacional.gob.ec/es/noticias' },
  { id: 'corte-constitucional', name: 'Corte Const.',  fullName: 'Corte Constitucional del Ecuador',                              category: 'Legislativo & Judicial', color: '#3A0CA3', sourceUrl: 'https://www.corteconstitucional.gob.ec/noticias/' },
  { id: 'pge',                  name: 'PGE',           fullName: 'Procuraduría General del Estado',                               category: 'Legislativo & Judicial', color: '#560BAD', sourceUrl: 'https://www.pge.gob.ec/' },
  { id: 'contraloria',          name: 'Contraloría',   fullName: 'Contraloría General del Estado',                                category: 'Legislativo & Judicial', color: '#480CA8', sourceUrl: 'https://www.contraloria.gob.ec/SalaDePrensa/' },
  { id: 'registro-oficial',     name: 'Reg. Oficial',  fullName: 'Registro Oficial del Ecuador',                                  category: 'Legislativo & Judicial', color: '#3A0CA3', sourceUrl: 'https://www.registroficial.gob.ec/' },
];

const LEG_IDS = ['cne','asamblea','corte-constitucional','pge','contraloria','registro-oficial'];

// Month-specific search queries per institution
const SEARCH_QUERY = {
  'cne':                  (m,y) => `CNE Consejo Nacional Electoral Ecuador ${m} ${y} resolvió aprobó noticias site:primicias.ec OR site:eluniverso.com OR site:cne.gob.ec`,
  'asamblea':             (m,y) => `Asamblea Nacional Ecuador ${m} ${y} aprobó debatió ley proyecto noticias site:primicias.ec OR site:eluniverso.com OR site:asambleanacional.gob.ec`,
  'corte-constitucional': (m,y) => `Corte Constitucional Ecuador ${m} ${y} falló dictaminó inconstitucional noticias site:primicias.ec OR site:eluniverso.com`,
  'pge':                  (m,y) => `Procuraduría General Estado Ecuador ${m} ${y} pronunciamiento opinión jurídica noticias site:primicias.ec OR site:pge.gob.ec`,
  'contraloria':          (m,y) => `Contraloría General Estado Ecuador ${m} ${y} auditoría responsabilidad glosa noticias site:primicias.ec OR site:contraloria.gob.ec`,
  'registro-oficial':     (m,y) => `Registro Oficial Ecuador ${m} ${y} decreto ejecutivo ley orgánica acuerdo ministerial site:registroficial.gob.ec OR site:primicias.ec`,
  'iniap':                (m,y) => `INIAP Ecuador ${m} ${y} investigación variedad semilla noticias`,
  'mag':                  (m,y) => `Ministerio Agricultura Ecuador MAG ${m} ${y} noticias comunicados`,
  'agrocalidad':          (m,y) => `AGROCALIDAD Ecuador ${m} ${y} fitosanitario resolución noticias`,
  'proecuador':           (m,y) => `ProEcuador exportaciones ${m} ${y} noticias misión comercial`,
  'bce':                  (m,y) => `Banco Central Ecuador BCE ${m} ${y} economía comunicado`,
  'mipro':                (m,y) => `MIPRO Ecuador ${m} ${y} producción comercio noticias`,
  'sri':                  (m,y) => `SRI Ecuador ${m} ${y} tributario resolución noticias`,
  'arcsa':                (m,y) => `ARCSA Ecuador ${m} ${y} sanitario resolución noticias`,
  'senescyt':             (m,y) => `SENESCYT Ecuador ${m} ${y} educación superior noticias`,
  'sercop':               (m,y) => `SERCOP Ecuador ${m} ${y} contratación pública noticias`,
  'min-interior':         (m,y) => `Ministerio Interior Ecuador ${m} ${y} seguridad noticias`,
  'min-gobierno':         (m,y) => `Ministerio Gobierno Ecuador ${m} ${y} decreto noticias`,
  'presidencia':          (m,y) => `Presidencia Ecuador Noboa ${m} ${y} decreto ejecutivo noticias`,
};

// ── Helpers ───────────────────────────────────────────────────────────────
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function makeKey(instId, title) {
  return `${instId}::${title.toLowerCase().trim().slice(0,60).replace(/\s+/g,'-').replace(/[^a-z0-9\-áéíóúñ]/g,'')}`;
}

function getMonths(fromYYYYMM) {
  const months = [];
  const [fy, fm] = fromYYYYMM.split('-').map(Number);
  const now = new Date();
  let y = fy, m = fm;
  while (y < now.getFullYear() || (y === now.getFullYear() && m <= now.getMonth() + 1)) {
    months.push({
      year: y,
      month: m,
      monthName: new Date(y, m-1, 1).toLocaleString('es-EC', { month: 'long' }),
      label: `${String(m).padStart(2,'0')}/${y}`,
    });
    if (++m > 12) { m = 1; y++; }
  }
  return months;
}

function loadArchive(instId) {
  const path = resolve(ARCHIVE_DIR, `${instId}.json`);
  try { if (existsSync(path)) return JSON.parse(readFileSync(path,'utf8')).items || []; } catch {}
  return [];
}

function saveArchive(inst, items) {
  writeFileSync(
    resolve(ARCHIVE_DIR, `${inst.id}.json`),
    JSON.stringify({ id: inst.id, name: inst.name, lastUpdated: new Date().toISOString(), items }, null, 2)
  );
}

// ── Claude API — one institution, one month ───────────────────────────────
async function fetchMonth(inst, monthLabel, searchQuery) {
  const prompt = `Search the web and find up to 5 significant news items, announcements, or decisions from or about ${inst.name} (${inst.fullName}) in Ecuador during ${monthLabel}.

Return ONLY a JSON array, nothing else:
[
  {
    "title": "Title in Spanish",
    "date": "YYYY-MM-DD",
    "url": "https://real-working-url",
    "summary": "1-2 sentences in Spanish on real-world effect. Do not repeat title."
  }
]

RULES:
- All 4 fields are MANDATORY on every item — especially summary
- Dates must fall within ${monthLabel}
- Return [] if nothing significant happened that month
- Do not fabricate`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      system: `Research assistant. Focus search on: ${searchQuery}`,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) throw new Error(`API ${res.status}: ${(await res.text()).slice(0,120)}`);

  const data = await res.json();
  const text = data.content.filter(b => b.type === 'text').pop()?.text?.trim() || '';
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];

  const parsed = JSON.parse(match[0]);
  if (!Array.isArray(parsed)) return [];

  return parsed
    .filter(i => i.title && i.date && i.url && i.summary && i.summary.length > 10)
    .map(i => ({
      key: makeKey(inst.id, i.title),
      title: String(i.title).trim(),
      date: String(i.date).trim(),
      url: String(i.url).trim(),
      summary: String(i.summary).trim(),
      scrapedAt: new Date().toISOString(),
    }))
    .slice(0, 5);
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log(' Ecuador Monitor — Backlog Script');
  console.log('═══════════════════════════════════════════════════════');

  const targets = ALL_INSTITUTIONS.filter(i =>
    ONLY_ID ? i.id === ONLY_ID : RUN_ALL ? true : LEG_IDS.includes(i.id)
  );

  if (!targets.length) { console.error('No institutions matched'); process.exit(1); }

  const months = getMonths(FROM_MONTH);
  const totalCalls = targets.length * months.length;

  console.log(` From     : ${FROM_MONTH}`);
  console.log(` Months   : ${months.length} (${months[0].label} → ${months[months.length-1].label})`);
  console.log(` Targets  : ${targets.length} institutions`);
  console.log(` API calls: ~${totalCalls} (${totalCalls * 8}s delay = ~${Math.ceil(totalCalls*8/60)} min)`);
  console.log(` Dry run  : ${DRY_RUN}`);
  console.log('───────────────────────────────────────────────────────\n');

  let totalNew = 0, totalErrors = 0;

  for (const inst of targets) {
    console.log(`\n── ${inst.name} (${inst.id})`);

    const archive = loadArchive(inst.id);
    const archiveKeys = new Set(archive.map(i => i.key));
    const newItems = [];

    for (const { year, monthName, label } of months) {
      process.stdout.write(`   ${label} ... `);
      const query = (SEARCH_QUERY[inst.id] || ((m,y) => `${inst.name} Ecuador ${m} ${y} noticias`))(monthName, year);

      try {
        const items = await fetchMonth(inst, label, query);
        const fresh = items.filter(i => !archiveKeys.has(i.key));
        fresh.forEach(i => archiveKeys.add(i.key));
        newItems.push(...fresh);
        console.log(`${fresh.length} new · ${items.length - fresh.length} dupes`);
        totalNew += fresh.length;
      } catch (err) {
        console.log(`✗ ${err.message.slice(0,60)}`);
        totalErrors++;
      }

      await delay(8000);
    }

    const updated = [...newItems, ...archive].sort((a,b) => (b.date||'').localeCompare(a.date||''));
    console.log(`   → ${newItems.length} added · archive now ${updated.length} total`);

    if (DRY_RUN) {
      console.log(`   [DRY RUN] Would write archive/${inst.id}.json`);
      if (newItems[0]) console.log(`   Sample: ${newItems[0].title.slice(0,70)}`);
    } else {
      saveArchive(inst, updated);
    }

    await delay(15000);
  }

  console.log('\n═══════════════════════════════════════════════════════');
  console.log(` New items added : ${totalNew}`);
  console.log(` API errors      : ${totalErrors}`);
  if (!DRY_RUN) {
    console.log('\nNext steps:');
    console.log('  git add public/archive/');
    console.log('  git commit -m "backlog: seed historical data from ' + FROM_MONTH + '"');
    console.log('  git pull && git push origin main');
  }
  console.log('═══════════════════════════════════════════════════════');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
