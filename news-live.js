// api/news-live.js — Real-time news via NewsAPI + Wikipedia
// Free tier: 100 requests/day on newsapi.org

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { country, lang, category } = req.body || {};
  const NEWS_API_KEY = process.env.NEWS_API_KEY;
  
  // Map categories to NewsAPI topics
  const categoryMap = {
    conflict: 'war OR military OR conflict OR attack',
    politics: 'politics OR government OR election OR parliament',
    economy: 'economy OR finance OR GDP OR inflation OR trade',
    culture: 'culture OR arts OR music OR film OR sport',
    humanitarian: 'humanitarian OR refugees OR famine OR human rights OR women',
    environment: 'climate OR environment OR pollution OR deforestation',
    sport: 'football OR tennis OR Olympics OR World Cup OR Champions League',
    world: 'world news'
  };

  const query = country && country !== 'world' 
    ? country 
    : (categoryMap[category] || 'world news');

  if (!NEWS_API_KEY) {
    // Fallback: use Wikipedia current events
    return res.status(200).json({ 
      articles: [], 
      source: 'no_api_key',
      message: 'Add NEWS_API_KEY to Vercel environment variables for live news'
    });
  }

  try {
    const langMap = { fr: 'fr', de: 'de', es: 'es', pt: 'pt', it: 'it', en: 'en' };
    const newsLang = langMap[lang] || 'en';
    
    const url = `https://newsapi.org/v2/everything?` +
      `q=${encodeURIComponent(query)}&` +
      `language=${newsLang}&` +
      `sortBy=publishedAt&` +
      `pageSize=12&` +
      `apiKey=${NEWS_API_KEY}`;

    const resp = await fetch(url);
    const data = await resp.json();

    if (data.status !== 'ok') throw new Error(data.message);

    const articles = (data.articles || []).map(a => ({
      title: a.title,
      summary: a.description || a.content?.slice(0, 200) || '',
      url: a.url,
      img: a.urlToImage,
      source: a.source?.name,
      date: new Date(a.publishedAt).toLocaleDateString(
        lang === 'fr' ? 'fr-FR' : lang === 'de' ? 'de-DE' : 'en-US',
        { day: 'numeric', month: 'long', year: 'numeric' }
      ),
      country: country || 'World'
    }));

    return res.status(200).json({ articles, source: 'newsapi', total: data.totalResults });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
