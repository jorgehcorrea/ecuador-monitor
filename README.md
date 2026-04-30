# Monitor Institucional · Ecuador

Dashboard de noticias semanales de 19 instituciones públicas ecuatorianas, actualizado automáticamente vía GitHub Actions + Claude API.

## Instituciones monitoreadas

| Categoría | Institución | ID |
|---|---|---|
| Agro & Investigación | INIAP | `iniap` |
| Agro & Investigación | Ministerio de Agricultura y Ganadería | `mag` |
| Agro & Investigación | AGROCALIDAD | `agrocalidad` |
| Agro & Investigación | ProEcuador | `proecuador` |
| Economía & Negocios | Banco Central del Ecuador | `bce` |
| Economía & Negocios | MIPRO | `mipro` |
| Economía & Negocios | Servicio de Rentas Internas | `sri` |
| Regulatorio | ARCSA | `arcsa` |
| Regulatorio | SENESCYT | `senescyt` |
| Regulatorio | SERCOP | `sercop` |
| Seguridad & Gobierno | Ministerio del Interior | `min-interior` |
| Seguridad & Gobierno | Ministerio de Gobierno | `min-gobierno` |
| Seguridad & Gobierno | Presidencia de la República | `presidencia` |
| Legislativo & Judicial | Consejo Nacional Electoral | `cne` |
| Legislativo & Judicial | Asamblea Nacional | `asamblea` |
| Legislativo & Judicial | Corte Constitucional | `corte-constitucional` |
| Legislativo & Judicial | Procuraduría General del Estado | `pge` |
| Legislativo & Judicial | Contraloría General del Estado | `contraloria` |
| Legislativo & Judicial | Registro Oficial | `registro-oficial` |

## Arquitectura

```
GitHub Actions (diario 01:00 ECT)
  → scripts/scraper.js       (Node.js — llama Claude API con web_search)
  → Claude API (Haiku)       (busca noticias reales + genera resumen por ítem)
  → public/data.json         (commit automático al repo)
  → Vercel redeploy          (detecta el commit, ~20s)
  → Dashboard live
```

## Características del dashboard

- **Vista Feed** — todas las noticias en orden cronológico
- **Vista Instituciones** — tarjetas por institución
- **Navbar abreviado** — Tot · Agro · Econ · Reg · Seg · Leg
- **Sidebar colapsable** — filtro por institución con conteo de noticias
- **Hover resumen** — card con resumen en lenguaje llano al hacer hover
- **Búsqueda** — filtra por título e institución en tiempo real
- **Registro Oficial** — limitado a 3 ítems en feed general; sin límite al seleccionar directamente

## Notas de diseño

- Solo fuentes primarias oficiales (.gob.ec) — sin medios de comunicación
- Los .gob.ec bloquean scraping directo (HTTP 000/403), por eso se usa Claude API con web_search
- El Registro Oficial publica decenas de documentos diarios; el cap de 3 en el feed general evita ruido
- Cada ítem incluye campo `summary` generado por Claude en español, lenguaje llano

## Setup en GitHub + Vercel

### 1. Crear repo y hacer push

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/jorgehcorrea/ecuador-monitor
git push -u origin main
```

### 2. Agregar secret en GitHub

Settings → Secrets and variables → Actions → New repository secret

- Name: ANTHROPIC_API_KEY
- Value: tu clave sk-ant-... de console.anthropic.com

### 3. Conectar Vercel

1. vercel.com → Add New Project → importar ecuador-monitor
2. Framework Preset: Other
3. Build Command: vacío
4. Output Directory: public
5. Install Command: vacío

### 4. Primer scrape manual

GitHub repo → Actions → Daily Institution News Scraper → Run workflow

Toma ~8-9 minutos (19 instituciones × 25s delay).

## Correr scraper localmente

```bash
cd scripts
npm install
ANTHROPIC_API_KEY=sk-ant-... node scraper.js
```

## Estructura de data.json

```json
{
  "lastScraped": "ISO timestamp",
  "institutions": [
    {
      "id": "mag",
      "name": "MAG",
      "fullName": "Ministerio de Agricultura y Ganadería",
      "category": "Agro & Investigación",
      "color": "#74C69D",
      "sourceUrl": "https://www.agricultura.gob.ec/noticias/",
      "status": "ok | stale | error",
      "news": [
        {
          "title": "Título en español",
          "date": "YYYY-MM-DD",
          "url": "https://url-del-articulo",
          "summary": "Resumen en 1-2 oraciones en lenguaje llano."
        }
      ],
      "lastUpdated": "ISO timestamp"
    }
  ],
  "summary": { "total": 19, "ok": 19, "stale": 0, "error": 0 }
}
```

## Roadmap pendiente

### Próximo
- Backlog histórico — seed de 2 años por institución via Claude API
- Búsqueda en resúmenes — extender filtro al campo summary
- Fix Node.js 24 — actualizar actions/setup-node en scrape.yml

### Pinned para el futuro
- Hover card avanzado (Opción B) — on-demand via Claude API con resumen, estimado de población impactada, y proyección económica a 6 meses - 2 años
- Smart alerts — watchlist de keywords con badge visual y notificación
- Newsletter semanal — digest por email

## Changelog

| Versión | Fecha | Cambios |
|---|---|---|
| v1.0 | 2026-04-25 | Setup inicial, 12 instituciones, scraper cheerio |
| v1.1 | 2026-04-25 | Switch a Claude API scraper (cheerio bloqueado) |
| v1.2 | 2026-04-26 | Ground News layout: Feed + Cards, sidebar colapsable, nav abreviado |
| v1.3 | 2026-04-27 | Categoría Legislativo & Judicial: CNE, Asamblea, Corte Constitucional |
| v1.4 | 2026-04-28 | Hover summary cards en feed items |
| v1.5 | 2026-04-29 | +4 instituciones: Presidencia, PGE, Contraloría, Registro Oficial (19 total) |
| v1.6 | 2026-04-29 | Clean reset: strip seed data, 25s delay, empty states limpios |
| v2.0 | 2026-04-30 | Archive database: per-institution JSON files, dedup by key, cached summaries, Node 24 |
| v2.1 | 2026-04-30 | Split scraper into 2 batches to fix rate limiting, merge logic for data.json |
