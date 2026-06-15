// api/generate.js — Atlas Mundi v5 — CommonJS (module.exports)
// Compatible avec Vercel serverless functions

const cache = new Map();
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
const NEWS_CACHE_TTL = 4 * 60 * 60 * 1000;
const rateLimitMap = new Map();

const SYSTEM_PROMPT = `You are the chief encyclopaedist of Atlas Mundi — the world's most complete, detailed and uncensored historical encyclopaedia. You have total mastery of ALL world history from prehistory to 2026, ALL sciences, ALL cultures, ALL politics and economics.

QUALITY RULES:
- Be EXHAUSTIVE — minimum 8 timeline entries, minimum 4 sentences per leader bio
- Include REAL DATES, REAL NAMES, REAL STATISTICS — never vague
- NOTHING CENSORED — genocides, atrocities, war crimes, dictators, exploitation all described factually
- Use COLLAPSIBLE SECTIONS to organise long content
- Always spell "Jeanne d'Arc" correctly (NEVER Jehanne)
- Output ONLY raw HTML — no markdown, no code fences, never mention AI or Claude

HTML CLASSES TO USE:
<h3 class="sh">Title</h3>
<h4 class="sh2">Subtitle</h4>
<p class="ct">Paragraph</p>
<details class="collapse-sec"><summary class="collapse-hdr">📜 Section</summary><div class="collapse-body">content</div></details>
<div class="tl-wrap"><div class="te maj"><div class="td">DATE</div><div class="tt2">Event</div><div class="tdesc">Details with context and consequences</div></div></div>
<div class="te dark"><!-- for genocides/atrocities --></div>
<div class="sg"><div class="sc"><div class="sl">Label</div><div class="sv">Value</div></div></div>
<div class="ano"><span class="ano-lbl">📖 Anecdote</span>Surprising fact</div>
<div class="crisis"><span class="crisis-lbl">🔴 CRISIS</span><p class="ct">Details with real numbers and named perpetrators</p></div>
<div class="myth-box"><span class="myth-lbl">🌟 Mythology</span><p class="ct">Content</p></div>
<div class="lg"><div class="lc"><div class="pp">👤</div><div><div class="ln">Name (dates)</div><div class="lp">Title/Period</div><div class="ld">Bio — 4-5 sentences</div></div></div></div>
<div class="cel-g"><div class="cel-c"><div class="cel-ico">🎭</div><div class="cel-n">Name</div><div class="cel-role">Field</div><div class="cel-d">2 sentences</div></div></div>
<div class="gg"><div class="gc"><div class="gc-t">🌐 Topic</div><p class="ct">Analysis</p><span class="ab">Alliance</span><span class="cb">Conflict</span><span class="nb">Org</span></div></div>
<div class="bld-g"><div class="bld-c"><div class="bld-ico">🏛</div><div class="bld-n">Name</div><div class="bld-d">History</div></div></div>
<div class="war-g"><div class="war-c"><div class="war-n">⚔ War (dates)</div><div class="war-d">Description</div><div class="war-stat">📅 Dates | ⚰ Deaths | 🏁 Outcome</div></div></div>
<div class="books"><div class="books-t">📚 Essential Reading</div><div class="bk-cat">Category</div><div class="bk"><span class="bk-ico">📖</span><div><div class="bk-t">Title</div><div class="bk-a">Author (Year)</div><div class="bk-d">Description — <a href="https://www.amazon.com/s?tag=atlasmundi-20&k=TITLE" target="_blank" style="color:#4a7fa5">Amazon →</a></div></div></div></div>
<div class="links"><a class="lnk" href="URL" target="_blank">🔗 Source</a></div>
<div class="region-grid"><div class="region-card"><div class="region-name">Name</div><div class="region-desc">Description</div></div></div>
<div class="danger-bar"><span class="db-label">Label</span><div class="db-track"><div class="db-fill" style="width:X%"></div></div></div>`;

function getLangNote(lang) {
  const notes = {
    fr: "Réponds entièrement en FRANÇAIS. Aucune faute d'orthographe. Style encyclopédique académique.",
    es: "Responde completamente en español. Estilo enciclopédico.",
    de: "Antworte vollständig auf Deutsch. Akademischer Stil.",
    ar: "أجب باللغة العربية الفصحى بالكامل.",
    zh: "请完全用中文回答。",
    pt: "Responda completamente em português. Estilo enciclopédico.",
    ja: "日本語で完全に答えてください。",
    it: "Rispondi completamente in italiano.",
    nl: "Antwoord volledig in het Nederlands.",
    ru: "Отвечай полностью на русском языке.",
    ko: "한국어로 완전히 답해주세요.",
    tr: "Tamamen Türkçe yanıtla.",
    pl: "Odpowiedz całkowicie po polsku.",
    sv: "Svara helt på svenska.",
    en: ""
  };
  return notes[lang] || "";
}

function getPrompt(tab, country, req) {
  const lang = req.lang || 'en';
  const L = getLangNote(lang);
  const DETAIL = `Use collapsible sections. Include minimum 8 timeline entries with precise dates. Named sources. Real statistics. Nothing censored.`;

  if (tab === 'ticker') {
    return `Generate exactly 20 fascinating world history/geography facts in ${lang === 'fr' ? 'French' : lang === 'de' ? 'German' : lang === 'es' ? 'Spanish' : lang === 'pt' ? 'Portuguese' : 'English'}. Return ONLY JSON: {"facts":["✦ Fact 1 ✦","✦ Fact 2 ✦",...]}`;
  }

  if (tab === 'chat') {
    const hist = (req.chatHistory || []).map(m => `${m.role === 'user' ? 'User' : 'Jeanne d\'Arc'}: ${m.content}`).join('\n');
    return `${L} You are Jeanne d'Arc, the brilliant historian guide of Atlas Mundi. Encyclopaedic knowledge of ALL world history to 2026. Passionate, precise, detailed. Never mention AI. When you mention a country the user can explore, add naturally: "you can explore [Country] on our map".

Previous conversation:
${hist}

User: ${req.chatMessage || ''}

Respond in plain text (no HTML), 2-3 paragraphs. Specific dates, names, facts. End with 1-2 related topics to explore.`;
  }

  if (tab === 'news' || tab === 'country_news') {
    const focus = req.newsCountry && req.newsCountry !== 'world'
      ? `Generate 8 current news stories SPECIFICALLY about ${req.newsCountry}.`
      : 'Generate 8 diverse current world news stories covering different regions.';
    return `${focus} Year: 2026. Return ONLY JSON:
{"newsCards":[{"cat":"conflict","title":"Compelling headline","summary":"3 factual sentences with context","date":"June 4, 2026","emoji":"⚔","country":"Ukraine","sources":["Reuters","BBC","AP"],"links":["https://reuters.com","https://bbc.com/news/world"]}]}
Categories: conflict, politics, economy, culture, humanitarian, society, sport, environment. NO markdown. ONLY valid JSON.`;
  }

  if (tab === 'newsdetail') {
    return `${L} Write a COMPREHENSIVE news analysis article about: "${req.newsTitle}".
Summary: ${req.newsSummary || ''}. Category: ${req.newsCategory || ''}.

Structure with collapsible sections:
<h3 class="sh">📍 The Facts</h3> — what is happening, factually and completely
<details class="collapse-sec"><summary class="collapse-hdr">📜 Historical Background</summary> — deep roots going back decades or centuries
<details class="collapse-sec"><summary class="collapse-hdr">👥 Key Players & Their Interests</summary>
<details class="collapse-sec"><summary class="collapse-hdr">📅 Timeline of Events</summary> — .tl-wrap with 8+ entries
<details class="collapse-sec"><summary class="collapse-hdr">🤝 Humanitarian Impact</summary> — real numbers, .crisis boxes
<details class="collapse-sec"><summary class="collapse-hdr">🌐 Geopolitical Implications</summary>
<details class="collapse-sec"><summary class="collapse-hdr">🔮 Possible Scenarios</summary> — 3 realistic outcomes
Factual, balanced, uncensored. No political opinions.`;
  }

  if (tab === 'battle') {
    return `${L} EXHAUSTIVE military analysis of ${req.battleName} (${req.battleDate}). Context: ${req.battleDesc}.
Structure: Strategic Context | Forces & Commanders (exact numbers) | Phase-by-Phase Account (.tl-wrap 6+ phases) | Key Turning Points | Casualties & Human Cost | Historical Consequences | one .ano surprising fact.`;
  }

  if (tab === 'eco_detail' || tab === 'finance') {
    return `${L} In-depth economics analysis: "${req.newsTitle || req.finTitle || country}". Context: ${req.newsSummary || req.finSummary || ''}.
Sections: Overview (clear for students) | .sg Key Statistics | Historical Context | Global Impact | Policy Responses | Key Economic Concepts | .books Essential Reading (Amazon links tag: atlasmundi-20)`;
  }

  const tabs = {
    overview: `${L} COMPREHENSIVE OVERVIEW of ${country}.
Start with .sg stats grid (15+ stats: name, capital, area, population, GDP per capita, currency, religion, language, government, independence, HDI, life expectancy, literacy, head of state, main exports).
Then 3-4 rich .ct paragraphs: geography, identity, uniqueness, historical importance.
Collapsibles: 🗺 Geography & Climate | 🏛 Historical Summary (.tl-wrap 10+ entries) | 💰 Economy Today | 🌍 International Relations | 🔥 Current Challenges.
.crisis boxes for active conflicts. .ano for one extraordinary fact. .links: Wikipedia, CIA World Factbook, BBC Country Profile, UN page. ${DETAIL}`,

    antiquity: `${L} EXHAUSTIVE ANTIQUITY of ${country} from 100,000 BC to 500 AD.
Collapsibles with .tl-wrap (8+ entries each):
🦴 Prehistoric Times & First Inhabitants | 🏺 Bronze Age & First Kingdoms | ⚔ Ancient Wars & Conquests | 🏛 Architecture & Urban Life | 📜 Religion, Writing & Philosophy | 👑 Key Ancient Rulers (.lg format, 6+ rulers) | 🔱 Decline & Transition.
.myth-box for major myths and legends. Specific cultures, cities, rulers, dates. ${DETAIL}`,

    history: `${L} COMPLETE HISTORY of ${country}.
Each era: collapsible + .tl-wrap (10+ entries):
📜 Early Medieval (500–1000) | ⚔ High Medieval (1000–1300) | 🏰 Late Medieval (1300–1500) | 🌍 Early Modern (1500–1700) | 🏭 18th–19th Century | 💥 WWI Era | 🌑 Interwar & WWII | 🌐 Cold War (1945–1990) | 📱 Contemporary (1990–2026).
Named leaders, death tolls, political context. Nothing censored. ${DETAIL}`,

    politics: `${L} COMPREHENSIVE POLITICS of ${country}.
System of Government (constitution, branches, electoral system) | Current Landscape (all parties, recent elections, tensions).
Collapsibles: 🗳 Elections & Democracy | ⚖ Judiciary & Rule of Law | 🏛 Political Timeline (.tl-wrap 12+) | 🔴 Crises & Coups | 📊 Corruption & Press Freedom (.danger-bar with real scores) | 👩 Women in Politics.
Uncensored about corruption, repression, human rights violations. ${DETAIL}`,

    leaders: `${L} EXHAUSTIVE LEADERS of ${country}.
Groups: 👑 Ancient Rulers | 🏰 Medieval | 🌍 Colonial Era | ⚔ Independence Leaders | 🏛 Presidents/PMs (ALL of them) | 😈 Dictators (fully uncensored) | 👩 Women Leaders.
.lg format for each. 5-sentence bios: background, rise to power, 3 key decisions, crimes/failures, legacy. Include war criminals. ${DETAIL}`,

    culture: `${L} COMPREHENSIVE CULTURE of ${country}.
Collapsibles: 🎭 Literature & Poetry (named authors, works, movements) | 🎵 Music (traditional + modern, named artists) | 🎬 Cinema & Theatre | 🖼 Visual Arts | 🍽 Cuisine (10+ specific dishes with origins) | ⚽ Sport (athletes, results) | 👗 Fashion & Traditional Dress | 🎪 Festivals (specific dates, origins) | 🌟 Mythology & Folklore (.myth-box with full narratives) | 📚 Philosophy. ${DETAIL}`,

    monuments: `${L} ICONIC MONUMENTS & PLACES of ${country}.
.bld-g grid with 12+ monuments: UNESCO sites, palaces, temples, fortresses, ruins, natural wonders. Each: fitting emoji, name, 4-sentence history (who built it, when, events there, current status).
Collapsibles: UNESCO World Heritage | Natural Wonders | Sacred Sites.
.books (4+ real travel/architecture books, Amazon links). .links tourism and UNESCO pages. ${DETAIL}`,

    religion: `${L} COMPREHENSIVE RELIGION of ${country}.
.sg religious demographics. For EACH major religion:
<details><summary>[Religion] — X% of population</summary>: arrival history, branches present, role in politics/society, sacred sites, key figures, conflicts, secularisation trends.
🌟 Pre-Abrahamic & Indigenous beliefs (.myth-box). Religious conflicts and inter-community tensions fully detailed. ${DETAIL}`,

    celebrities: `${L} EXHAUSTIVE FAMOUS FIGURES of ${country}.
.cel-g cards. Groups: 🏛 Historical (pre-1800) | 🔬 Scientists & Inventors | 🎭 Artists, Writers, Poets | 🎵 Musicians | 🎬 Filmmakers | ⚽ Athletes | 🌍 Explorers | ⚔ Military Heroes | 🏛 Political Leaders & Activists | 👩 Women Who Changed History.
2 compelling sentences per person with specific dates and achievements. Include controversial figures. ${DETAIL}`,

    geopolitics: `${L} COMPREHENSIVE GEOPOLITICS of ${country}.
Strategic Position | .gg grid for: Military Power, Economic Influence, Diplomatic Weight.
Collapsibles: 🌐 Alliances & Treaties (.ab badges) | ⚔ Active Conflicts (.crisis boxes) | 🤝 Key Bilateral Relations (top 6) | 💰 Economic Diplomacy | 🗺 Territorial Disputes | 🏛 International Organisations | 🔮 Strategic Challenges 2025–2030.
Factual analysis only. ${DETAIL}`,

    wars: `${L} COMPLETE WARS & MILITARY HISTORY of ${country}.
Collapsibles by era with .war-g cards:
⚔ Ancient Wars | 🏰 Medieval Conflicts | 🌍 Colonial Wars | 💥 WWI | 💣 WWII | 🌐 Cold War Conflicts | 🔥 Post-1990.
Each .war-c: dates, named commanders on ALL sides, death toll, tactical description, outcome, consequences.
Include chemical weapons, war crimes, named perpetrators, ICC indictments. Nothing censored. ${DETAIL}`,

    crises: `${L} COMPREHENSIVE CRISES of ${country}.
Collapsibles: 💀 Genocides & Atrocities (perpetrators named, methods, death tolls, international response) | 🌾 Famines | 👥 Refugees | 🔒 Political Repression | 💸 Economic Collapses | 🌿 Environmental | 💣 Terrorism | ⚖ Human Rights | 👩 Women's Rights & Gender Violence | 🚢 Modern Slavery.
Nothing censored. Real numbers, named perpetrators. ${DETAIL}`,

    regions: `${L} EXHAUSTIVE REGIONS & CITIES of ${country}.
.region-grid for ALL administrative divisions: history, major cities, economic role, cultural specificity.
For each MAJOR CITY collapsible: founding date, key historical events, neighbourhoods, cultural institutions, economic role, famous people, current challenges. Be exhaustive. ${DETAIL}`,

    books: `${L} COMPLETE BOOKS GUIDE for ${country}.
.books with .bk-cat: 📜 Prehistory & Antiquity | ⚔ Medieval | 🏭 Modern History | 🔥 Wars & Conflicts | 🏛 Politics | 🎭 Culture & Arts | 📖 Novels set in ${country} | 🌍 Travel & Geography.
ALL books real and verifiable. Amazon links tag: atlasmundi-20. Minimum 3 books per category.`,

    resources: `${L} COMPLETE RESEARCH GUIDE for ${country}.
.links: Wikipedia, BBC, CIA World Factbook, Freedom House, HRW, Amnesty, UN, Transparency International, RSF.
Quality news sources (local + international). 5 real documentaries. .books: History (3), Politics (2), Culture (2), Journalism (2). Amazon links.`,

    sources_academic: `${L} ACADEMIC SOURCES & BIBLIOGRAPHY for ${country}.
Organise by type:
📰 QUALITY JOURNALISM: best national newspapers, international outlets covering ${country}
🎓 ACADEMIC: JSTOR search terms, Google Scholar keywords, key university research centres on ${country}
📚 ESSENTIAL BOOKS: 10+ real published works by topic (history, politics, economy, society, culture) with real authors and dates
🏛 OFFICIAL: government websites, parliament, statistics office, central bank, URLs
🌍 INTERNATIONAL: UN, World Bank, IMF, HRW, Amnesty, Freedom House reports on ${country}
📺 DOCUMENTARIES: 5+ real documentaries with streaming platform
🌐 DIGITAL: Wikipedia featured articles, encyclopaedia entries, digital archives
Include real, working URLs where possible.`
  };

  return tabs[tab] || `${L} Write comprehensive encyclopedic content about ${country} for section: ${tab}. ${DETAIL}`;
}

function isRateLimited(ip) {
  const now = Date.now();
  const times = (rateLimitMap.get(ip) || []).filter(t => now - t < 3600000);
  if (times.length >= 40) return true;
  times.push(now);
  rateLimitMap.set(ip, times);
  return false;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
  if (isRateLimited(ip)) return res.status(429).json({ error: 'Too many requests. Please wait.' });

  const body = req.body || {};
  const { country, tab, lang, newsCountry } = body;
  if (!country || !tab) return res.status(400).json({ error: 'Missing country or tab' });

  const safeCountry = String(country).slice(0, 100).replace(/[<>'"]/g, '');
  const validTabs = ['overview','antiquity','history','politics','leaders','culture','monuments','religion','celebrities','geopolitics','wars','crises','regions','books','resources','sources_academic','battle','ticker','news','newsdetail','finance','chat','country_news','eco_detail'];
  if (!validTabs.includes(tab)) return res.status(400).json({ error: 'Invalid tab' });

  const ttl = (tab === 'news' || tab === 'country_news') ? NEWS_CACHE_TTL : CACHE_TTL;
  const cacheKey = `${safeCountry}::${tab}::${lang || 'en'}::${newsCountry || ''}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < ttl) {
    res.setHeader('X-Cache', 'HIT');
    const payload = cached.facts ? { facts: cached.facts } : cached.newsCards ? { newsCards: cached.newsCards } : { html: cached.html };
    return res.status(200).json({ ...payload, cached: true });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured in Vercel environment variables.' });

  const prompt = getPrompt(tab, safeCountry, body);

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
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return res.status(502).json({ error: `API error: ${err?.error?.message || response.statusText}` });
    }

    const data = await response.json();
    const rawText = data.content.map(b => b.text || '').join('');

    let responseData = { html: rawText, cached: false };

    if (tab === 'ticker') {
      try {
        const p = JSON.parse(rawText.replace(/```json|```/g, '').trim());
        responseData = { facts: p.facts, cached: false };
      } catch (e) { responseData = { facts: [], cached: false }; }
    } else if (tab === 'news' || tab === 'country_news') {
      try {
        const p = JSON.parse(rawText.replace(/```json|```/g, '').trim());
        responseData = { newsCards: p.newsCards, cached: false };
      } catch (e) { responseData = { newsCards: [], cached: false }; }
    }

    cache.set(cacheKey, { ...responseData, ts: Date.now() });
    console.log(`[Atlas v5] ${safeCountry}/${tab}/${lang || 'en'} | ${data.usage?.output_tokens} tokens`);
    return res.status(200).json(responseData);

  } catch (err) {
    console.error('Handler error:', err);
    return res.status(500).json({ error: 'Internal server error: ' + err.message });
  }
};
