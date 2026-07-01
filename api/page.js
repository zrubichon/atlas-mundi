// api/page.js — Lecture SEULE, en GET, cacheable par le CDN Vercel.
//
// Contrairement à /api/generate (POST, jamais caché par le CDN), cet endpoint
// est un GET avec Cache-Control: la première requête touche la fonction,
// toutes les suivantes (partout dans le monde) sont servies par le edge en
// quelques ms, sans même exécuter de code serverless.
//
// Usage: /api/page?country=France&tab=overview&lang=fr
// Si la page n'est pas encore en base (pas encore pré-générée), renvoie 404 —
// le frontend doit alors basculer sur /api/generate (POST) pour la générer.

const { dbGet } = require('./generate.js');

const STATIC_TABS = new Set([
  'overview', 'antiquity', 'history', 'politics', 'leaders', 'culture',
  'monuments', 'religion', 'celebrities', 'geopolitics', 'wars', 'crises',
  'regions', 'books', 'resources', 'sources_academic'
]);

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { country, tab, lang = 'en' } = req.query || {};
  if (!country || !tab) return res.status(400).json({ error: 'Missing country or tab' });
  if (!STATIC_TABS.has(tab)) return res.status(400).json({ error: 'This tab is dynamic — use /api/generate' });

  const safeCountry = String(country).slice(0, 100).replace(/[<>'"]/g, '');
  const cacheKey = `${safeCountry}::${tab}::${lang}::`;

  const html = await dbGet(cacheKey);

  if (!html) {
    // Pas encore pré-généré. Pas de cache CDN sur les 404 pour ne pas bloquer
    // durablement une page qui sera bientôt disponible.
    return res.status(404).json({ error: 'Not pregenerated yet', fallback: '/api/generate' });
  }

  // Cache CDN 30 jours, "stale-while-revalidate" pour rafraîchissement silencieux.
  res.setHeader('Cache-Control', 'public, s-maxage=2592000, stale-while-revalidate=86400');
  return res.status(200).json({ html, cached: true });
};
