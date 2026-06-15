// api/daily-update.js
// Runs daily at 6am UTC — pre-generates news content for all major topics
// Stores in Vercel KV cache (or in-memory for simple version)

export default async function handler(req, res) {
  // Verify it's a cron job call or manual trigger
  const authHeader = req.headers.authorization;
  if (req.headers['x-vercel-cron'] !== '1' && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'No API key' });

  const topics = [
    { country: 'World', tab: 'news', newsCountry: 'world', lang: 'en' },
    { country: 'World', tab: 'news', newsCountry: 'world', lang: 'fr' },
    { country: 'France', tab: 'news', newsCountry: 'France', lang: 'fr' },
    { country: 'United States', tab: 'news', newsCountry: 'United States', lang: 'en' },
  ];

  const results = [];
  for (const topic of topics) {
    try {
      const resp = await fetch(`${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(topic)
      });
      const data = await resp.json();
      results.push({ topic: topic.country + '/' + topic.lang, status: 'ok', articles: data.newsCards?.length || 0 });
    } catch (e) {
      results.push({ topic: topic.country + '/' + topic.lang, status: 'error', error: e.message });
    }
  }

  console.log('[Daily Update]', new Date().toISOString(), results);
  return res.status(200).json({ updated: new Date().toISOString(), results });
}
