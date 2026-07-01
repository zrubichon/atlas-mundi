#!/usr/bin/env node
// scripts/pregenerate-all.js
//
// Pré-génère TOUT le contenu statique (pays × onglets × langues) et l'écrit
// directement dans Supabase. Conçu pour tourner en local ou via GitHub Actions
// — donc AUCUNE limite de timeout (contrairement aux fonctions Vercel à 60s/300s).
//
// Une fois ce script terminé, le site ne fait PLUS jamais d'appel à l'API Claude
// pour du contenu pays : il lit uniquement Supabase. Gain de vitesse massif.
//
// Usage:
//   ANTHROPIC_API_KEY=... SUPABASE_URL=... SUPABASE_ANON_KEY=... node scripts/pregenerate-all.js
//   node scripts/pregenerate-all.js --lang=fr
//   node scripts/pregenerate-all.js --lang=en --region=europe
//   node scripts/pregenerate-all.js --resume   (par défaut: saute ce qui existe déjà en base)
//
// Nécessite Node 18+ (fetch natif).

const fs = require('fs');
const path = require('path');
const { getPrompt, SYSTEM_PROMPT } = require('../api/generate.js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY || !ANTHROPIC_KEY) {
  console.error('❌ Il manque SUPABASE_URL, SUPABASE_ANON_KEY ou ANTHROPIC_API_KEY dans l\'environnement.');
  process.exit(1);
}

// ── Config ──
const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? true];
}));

const LANGS = args.lang ? [args.lang] : ['en', 'fr'];
const CONCURRENCY = parseInt(args.concurrency || '4', 10); // appels API en parallèle
const RETRY_MAX = 3;
const PROGRESS_FILE = path.join(__dirname, '.pregenerate-progress.json');

// Les 16 onglets "statiques" (pas de paramètres dynamiques comme battle/news/chat)
const STATIC_TABS = [
  'overview', 'antiquity', 'history', 'politics', 'leaders', 'culture',
  'monuments', 'religion', 'celebrities', 'geopolitics', 'wars', 'crises',
  'regions', 'books', 'resources', 'sources_academic'
];

// ── Charger la liste des pays directement depuis le frontend (source unique de vérité) ──
function loadCountries() {
  const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  const m = html.match(/const DB = \{([\s\S]*?)\n\};/);
  if (!m) throw new Error('Impossible de trouver "const DB = {...}" dans public/index.html');
  const names = [...m[1].matchAll(/"([^"]+)":\{/g)].map(x => x[1]);
  return [...new Set(names)];
}

let REGION_FILTER = null;
if (args.region) {
  // Optionnel: filtrer par région via r-europe / r-asia / etc. dans public/index.html
  const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  const re = new RegExp(`"([^"]+)":\\{"flag":"[^"]*","r":"r-${args.region}"`, 'g');
  REGION_FILTER = new Set([...html.matchAll(re)].map(x => x[1]));
}

// ── Supabase helpers ──
async function getExistingKeys() {
  const keys = new Set();
  let offset = 0;
  const pageSize = 1000;
  while (true) {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/pages?select=cache_key&limit=${pageSize}&offset=${offset}`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    const data = await r.json();
    if (!Array.isArray(data) || data.length === 0) break;
    data.forEach(row => keys.add(row.cache_key));
    if (data.length < pageSize) break;
    offset += pageSize;
  }
  return keys;
}

async function dbSet(cacheKey, html) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/pages`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal'
    },
    body: JSON.stringify({ cache_key: cacheKey, html, updated_at: new Date().toISOString() })
  });
  if (!r.ok) throw new Error(`Supabase write failed: ${r.status} ${await r.text()}`);
}

// ── Anthropic call ──
async function generateOne(country, tab, lang) {
  const prompt = getPrompt(tab, country, { lang });
  const maxTok = ['overview', 'culture', 'monuments', 'religion', 'books', 'resources'].includes(tab) ? 2500 : 3000;

  for (let attempt = 1; attempt <= RETRY_MAX; attempt++) {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: maxTok,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: prompt }]
        })
      });

      if (response.status === 429) {
        const wait = 5000 * attempt;
        console.warn(`  ⏳ Rate limited, attente ${wait}ms...`);
        await sleep(wait);
        continue;
      }
      if (!response.ok) throw new Error(`API ${response.status}: ${await response.text()}`);

      const data = await response.json();
      const raw = data.content.map(b => b.text || '').join('');
      const clean = raw.replace(/^```html\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
      if (!clean) throw new Error('Réponse vide');
      return clean;
    } catch (e) {
      if (attempt === RETRY_MAX) throw e;
      console.warn(`  ⚠ Tentative ${attempt} échouée (${country}/${tab}/${lang}): ${e.message} — retry...`);
      await sleep(2000 * attempt);
    }
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Progress tracking (reprise possible si le script est interrompu) ──
function loadProgress() {
  if (fs.existsSync(PROGRESS_FILE)) return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
  return { done: [], failed: [] };
}
function saveProgress(p) { fs.writeFileSync(PROGRESS_FILE, JSON.stringify(p, null, 2)); }

// ── Simple concurrency pool ──
async function runPool(items, worker, concurrency) {
  let i = 0;
  let active = 0;
  let resolveAll;
  const done = new Promise(r => (resolveAll = r));

  return new Promise((resolve) => {
    function next() {
      if (i >= items.length && active === 0) return resolve();
      while (active < concurrency && i < items.length) {
        const item = items[i++];
        active++;
        worker(item).finally(() => {
          active--;
          next();
        });
      }
    }
    next();
  });
}

// ── Main ──
(async () => {
  const allCountries = loadCountries();
  const countries = REGION_FILTER ? allCountries.filter(c => REGION_FILTER.has(c)) : allCountries;

  console.log(`🌍 ${countries.length} pays × ${STATIC_TABS.length} onglets × ${LANGS.length} langue(s) = ${countries.length * STATIC_TABS.length * LANGS.length} pages potentielles`);

  console.log('🔍 Récupération des pages déjà en cache...');
  const existing = await getExistingKeys();
  console.log(`   ${existing.size} pages déjà en base — elles seront sautées.`);

  const progress = loadProgress();
  const alreadyDone = new Set(progress.done);

  const tasks = [];
  for (const lang of LANGS) {
    for (const country of countries) {
      for (const tab of STATIC_TABS) {
        const cacheKey = `${country}::${tab}::${lang}::`;
        if (existing.has(cacheKey) || alreadyDone.has(cacheKey)) continue;
        tasks.push({ country, tab, lang, cacheKey });
      }
    }
  }

  console.log(`📋 ${tasks.length} pages à générer. Concurrence: ${CONCURRENCY}. Ctrl+C interrompt proprement (relance = reprise).`);

  let completed = 0;
  const total = tasks.length;
  const startTime = Date.now();

  await runPool(tasks, async (task) => {
    try {
      const html = await generateOne(task.country, task.tab, task.lang);
      await dbSet(task.cacheKey, html);
      progress.done.push(task.cacheKey);
      completed++;
      if (completed % 10 === 0 || completed === total) {
        saveProgress(progress);
        const elapsed = (Date.now() - startTime) / 1000;
        const rate = completed / elapsed;
        const eta = rate > 0 ? Math.round((total - completed) / rate / 60) : '?';
        console.log(`✅ ${completed}/${total} (${task.country}/${task.tab}/${task.lang}) — ~${eta} min restantes`);
      }
    } catch (e) {
      console.error(`❌ ÉCHEC: ${task.country}/${task.tab}/${task.lang} — ${e.message}`);
      progress.failed.push(task.cacheKey);
      saveProgress(progress);
    }
    // Petite pause pour rester sous les limites de rate Anthropic
    await sleep(300);
  }, CONCURRENCY);

  saveProgress(progress);
  console.log(`\n🎉 Terminé. ${completed}/${total} générées. ${progress.failed.length} échecs (relancer le script pour réessayer).`);
})();
