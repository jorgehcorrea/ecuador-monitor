# Monitor Institucional · Ecuador

Dashboard de noticias semanales de 12 instituciones públicas ecuatorianas, actualizado automáticamente vía GitHub Actions.

## Instituciones monitoreadas

| Categoría | Institución |
|---|---|
| Agro & Investigación | INIAP, MAG, AGROCALIDAD, ProEcuador |
| Economía & Negocios | Banco Central, MIPRO, SRI |
| Regulatorio | ARCSA, SENESCYT, SERCOP |
| Seguridad & Gobierno | Min. Interior, Min. Gobierno |

## Arquitectura

```
GitHub Actions (domingo 01:00 ECT)
  → scripts/scraper.js   (Node.js + cheerio)
  → public/data.json     (commit automático)
  → Vercel redeploy      (detecta el commit)
  → Dashboard live
```

## Setup en GitHub + Vercel

### 1. Crear repo en GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/jorgehcorrea/ecuador-monitor
git push -u origin main
```

### 2. Conectar Vercel

1. vercel.com → Add New Project → importar `ecuador-monitor`
2. Configuración:
   - **Framework Preset**: Other
   - **Build Command**: *(vacío)*
   - **Output Directory**: `public`
   - **Install Command**: *(vacío)*
3. Deploy

### 3. Primer scrape manual

GitHub repo → pestaña **Actions** → "Weekly Institution News Scraper" → **Run workflow**

El workflow actualiza `public/data.json` y Vercel redeploya automáticamente en ~20 segundos.

## Correr localmente

```bash
cd scripts
npm install
node scraper.js
# Abrir public/index.html en el navegador
```

## Notas técnicas

- Los sitios `.gob.ec` que usan JavaScript rendering (SPAs) aparecerán como `stale` — el scraper guarda el dato anterior en ese caso
- Para extender: agregar un objeto al array `INSTITUTIONS` en `scripts/scraper.js`
- Fase siguiente planificada: newsletter semanal via Buttondown o Mailchimp
