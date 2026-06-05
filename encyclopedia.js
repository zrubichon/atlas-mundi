// api/encyclopedia.js — Ultra-detailed encyclopedia with caching
// Uses Anthropic API + stores results for instant re-access

const pageCache = new Map();
const CACHE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days for encyclopedia content

// Pre-built knowledge base for fastest responses
const QUICK_FACTS = {
  "France": {
    area: "643,801 km²", pop: "68.4 million", capital: "Paris", currency: "Euro (€)",
    gdp: "$3.1 trillion (2024)", hdi: "0.903 (Very High)", language: "French",
    gov: "Semi-Presidential Republic", president: "Emmanuel Macron (2017–)",
    pm: "Gabriel Attal (2024–)", founded: "843 AD (Treaty of Verdun)",
    motto: "Liberté, Égalité, Fraternité", anthem: "La Marseillaise"
  },
  "Germany": {
    area: "357,022 km²", pop: "84.4 million", capital: "Berlin", currency: "Euro (€)",
    gdp: "$4.5 trillion (2024)", hdi: "0.950 (Very High)", language: "German",
    gov: "Federal Parliamentary Republic", chancellor: "Olaf Scholz (2021–)",
    founded: "962 AD (Holy Roman Empire) / 1871 (unified Germany)",
    motto: "Einigkeit und Recht und Freiheit", anthem: "Das Deutschlandlied"
  },
  // ... more countries pre-loaded
};

const SYSTEM_ULTRA = `You are the world's most comprehensive encyclopedia AI for Atlas Mundi. 
You have deep knowledge of ALL human history, science, culture, politics, economics, geography, art, religion, philosophy, and current events up to 2026.

When generating content for students and researchers, you must:
1. Be EXHAUSTIVE — cover every major aspect, never truncate
2. Include MULTIPLE SOURCES — cite real academic works, journalists, institutions
3. Use COLLAPSIBLE SECTIONS so content is organised
4. Include TIMELINES with precise dates
5. Include STATISTICS with real numbers
6. Include QUOTES from historical figures
7. Include CONTROVERSIES and multiple perspectives
8. Never censor — discuss atrocities, genocides, exploitation factually
9. Include STUDY LINKS to Wikipedia, Google Scholar, JSTOR, Britannica

Format using these HTML classes only (no markdown):
<h3 class="sh">Title</h3>
<h4 class="sh2">Subtitle</h4>  
<p class="ct">Paragraph</p>
<details class="collapse-sec"><summary class="collapse-hdr">📚 Section</summary><div class="collapse-body">content</div></details>
<div class="tl-wrap"><div class="te maj"><div class="td">DATE</div><div class="tt2">Event</div><div class="tdesc">Details</div></div></div>
<div class="sg"><div class="sc"><div class="sl">Stat</div><div class="sv">Value</div></div></div>
<div class="ano"><span class="ano-lbl">📖 Source</span>Citation text</div>
<div class="crisis"><span class="crisis-lbl">⚠ Controversy</span><p class="ct">Details</p></div>
<div class="myth-box"><span class="myth-lbl">📚 Academic Sources</span><p class="ct">List of references</p></div>
<div class="links"><a class="lnk" href="URL" target="_blank">🔗 Source</a></div>
<div class="books"><div class="books-t">📚 Essential Reading</div><div class="bk"><span class="bk-ico">📖</span><div><div class="bk-t">Title</div><div class="bk-a">Author (Year)</div><div class="bk-d">Description</div></div></div></div>`;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { country, section, query, lang, depth } = req.body || {};
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'No API key' });

  const cacheKey = `${country}::${section}::${lang}::${query||''}`;
  const cached = pageCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    res.setHeader('X-Cache', 'HIT');
    return res.status(200).json({ html: cached.html, cached: true });
  }

  const langNote = {
    fr: "Réponds entièrement en français, style encyclopédique académique.",
    de: "Antworte vollständig auf Deutsch, akademischer Stil.",
    es: "Responde completamente en español, estilo enciclopédico.",
    pt: "Responda completamente em português, estilo enciclopédico.",
    en: ""
  }[lang] || "";

  let prompt = "";
  
  if (query) {
    // Free search query
    prompt = `${langNote}
The user is a student or researcher searching for: "${query}"
${country ? `Context: searching within information about ${country}` : ''}

Provide a COMPREHENSIVE encyclopedic response covering:
1. Direct answer to the query with full context
2. Historical background and development
3. Key figures and organisations involved
4. Current state and recent developments
5. Academic sources and further reading
6. Related topics and cross-references

Include: precise dates, real statistics, named sources, multiple perspectives, controversies.
Use collapsible sections for depth. Include .links with Wikipedia, academic sources, news archives.
Include a .books section with 4-6 real published works on this topic.
This response will be used for academic research — be thorough and cite sources.`;
  } else {
    // Section-based content
    const sectionPrompts = {
      overview: `${langNote} Write an ULTRA-COMPREHENSIVE overview of ${country} for academic research.
Include: .sg stats grid (20+ statistics), geography, identity, historical importance, current situation.
Collapsibles: Geography & Climate | Economy | Demographics | International Position | Current Challenges | Academic Context.
End with: .myth-box for 5 essential academic sources on ${country}, .links to Wikipedia/CIA/UN/World Bank pages.`,

      history: `${langNote} Write the COMPLETE ACADEMIC HISTORY of ${country} — encyclopedic depth.
Every era needs: .tl-wrap with 10+ events, named leaders with full titles and dates, death tolls for conflicts, primary sources.
Include ALL of: prehistoric settlement, ancient kingdoms, medieval period, colonial era (if applicable), independence, 20th century, 21st century.
For each major event: cause → development → consequence → historiographical debates.
Cite real historians: names, book titles, publication years.
Include a comprehensive .books section organised by era.`,

      politics: `${langNote} COMPREHENSIVE POLITICAL SCIENCE analysis of ${country}.
Current system + constitution details + all parties + election results + political tensions.
Historical political timeline (.tl-wrap 15+ entries).
Corruption data (Transparency International score), press freedom (RSF rank), democracy index.
.danger-bar for: Press Freedom, Corruption, Democracy, Rule of Law.
Academic sources: political scientists who have written about ${country}'s politics.`,

      economy: `${langNote} COMPREHENSIVE ECONOMIC ANALYSIS of ${country} for economics students.
.sg grid: GDP, GDP per capita, growth rate, inflation, unemployment, trade balance, debt/GDP, FDI, main exports, main imports, currency, central bank rate, Gini coefficient, HDI, poverty rate.
Sectors analysis, trade partners, economic history, major companies, economic crises.
Academic: economists who have studied this economy, key economic texts.
Charts description: use .tl-wrap for economic timeline.`,

      sources: `${langNote} Provide a COMPLETE RESEARCH GUIDE for ${country} — for students and academics.
Organise by type:
📰 QUALITY JOURNALISM: national newspapers, international outlets covering ${country}
🎓 ACADEMIC DATABASES: JSTOR articles, Google Scholar searches, university research centres
📚 ESSENTIAL BOOKS: 10+ real published books, organised by topic (history, politics, economy, society, culture)
🏛 OFFICIAL SOURCES: government websites, parliament, statistics office, central bank
🌍 INTERNATIONAL: UN, World Bank, IMF, HRW, Amnesty International, Freedom House reports on ${country}
📺 DOCUMENTARIES: 5+ real documentaries with streaming availability
🌐 ONLINE RESOURCES: Wikipedia featured articles, encyclopaedia entries, digital archives
All links must be real, working URLs.`
    };

    prompt = sectionPrompts[section] || `${langNote} Write comprehensive encyclopedic content about ${country} — section: ${section}. Ultra-detailed, with sources and academic references.`;
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 4000,
        system: SYSTEM_ULTRA,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return res.status(502).json({ error: `API error: ${err?.error?.message || response.statusText}` });
    }

    const data = await response.json();
    const html = data.content.map(b => b.text || '').join('');
    
    pageCache.set(cacheKey, { html, ts: Date.now() });
    console.log(`[Encyclopedia] ${country}/${section} | ${data.usage?.output_tokens} tokens`);
    
    return res.status(200).json({ html, cached: false });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
