// api/generate.js — Atlas Mundi v5 — CommonJS + Supabase cache
// Pages stored permanently in Supabase → instant reload after first generation

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

// In-memory cache for this server instance
const memCache = new Map();
const MEM_TTL = 60 * 60 * 1000; // 1h in memory
const NEWS_TTL = 4 * 60 * 60 * 1000; // 4h for news
const rateLimitMap = new Map();

// ── Supabase helpers ──
async function dbGet(cacheKey) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000); // 3s max
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/pages?cache_key=eq.${encodeURIComponent(cacheKey)}&select=html`,
      { 
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
        signal: controller.signal
      }
    );
    clearTimeout(timeout);
    const data = await r.json();
    let html = data?.[0]?.html || null;
    if (html) {
      // Clean any markdown fences that may have been stored
      html = html.replace(/^```html\s*/i,'').replace(/^```\s*/i,'').replace(/\s*```$/i,'').trim();
      console.log('[Supabase] Cache HIT:', cacheKey);
    }
    return html;
  } catch (e) { 
    console.log('[Supabase] Cache MISS or timeout:', cacheKey, e.message);
    return null; 
  }
}

async function dbSet(cacheKey, html) {
  if (!SUPABASE_URL || !SUPABASE_KEY || !html) return;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/pages`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify({ cache_key: cacheKey, html, updated_at: new Date().toISOString() })
    });
    if (!r.ok) {
      const err = await r.text();
      console.error('Supabase write failed:', r.status, err);
    } else {
      console.log('[Supabase] Saved:', cacheKey);
    }
  } catch (e) { console.error('Supabase write error:', e.message); }
}

const SYSTEM_PROMPT = `You are the chief encyclopaedist of Atlas Mundi — the world's most authoritative, detailed and uncensored historical encyclopaedia, more comprehensive than Wikipedia. You have total mastery of ALL world history from prehistory to 2026, ALL sciences, ALL cultures, ALL politics, economics, philosophy, art, religion and current events.

Your content is used by students, researchers, historians and curious minds worldwide. Every response must be:
- MORE DETAILED than Wikipedia
- Include PRIMARY SOURCES and real citations
- Cover CONTROVERSIES and multiple historical perspectives  
- Include precise dates, real names, verified statistics
- Written with the depth of an academic encyclopedia
- Completely UNCENSORED — atrocities, genocide, war crimes all described factually

QUALITY RULES:
- Be EXHAUSTIVE — minimum 8 timeline entries, minimum 4 sentences per leader bio
- Include REAL DATES, REAL NAMES, REAL STATISTICS — never vague
- NOTHING CENSORED — genocides, atrocities, war crimes, dictators, exploitation all described factually
- Use COLLAPSIBLE SECTIONS to organise long content
- Always spell "Jeanne d'Arc" correctly (NEVER Jehanne)
- Output ONLY raw HTML — no markdown, no code fences, never mention AI or Claude

HTML CLASSES:
<h3 class="sh">Title</h3>
<h4 class="sh2">Subtitle</h4>
<p class="ct">Paragraph</p>
<details class="collapse-sec"><summary class="collapse-hdr">📜 Section</summary><div class="collapse-body">content</div></details>
<div class="tl-wrap"><div class="te maj"><div class="td">DATE</div><div class="tt2">Event</div><div class="tdesc">Details</div></div></div>
<div class="te dark">for genocides/atrocities</div>
<div class="sg"><div class="sc"><div class="sl">Label</div><div class="sv">Value</div></div></div>
<div class="ano"><span class="ano-lbl">📖 Anecdote</span>Fact</div>
<div class="crisis"><span class="crisis-lbl">🔴 CRISIS</span><p class="ct">Details with real numbers</p></div>
<div class="myth-box"><span class="myth-lbl">🌟 Mythology</span><p class="ct">Content</p></div>
<div class="lg"><div class="lc"><div class="pp">👤</div><div><div class="ln">Name (dates)</div><div class="lp">Title</div><div class="ld">4-5 sentence bio</div></div></div></div>
<div class="cel-g"><div class="cel-c"><div class="cel-ico">🎭</div><div class="cel-n">Name</div><div class="cel-role">Field</div><div class="cel-d">2 sentences</div></div></div>
<div class="gg"><div class="gc"><div class="gc-t">🌐 Topic</div><p class="ct">Analysis</p><span class="ab">Alliance</span><span class="cb">Conflict</span><span class="nb">Org</span></div></div>
<div class="bld-g"><div class="bld-c"><div class="bld-ico">🏛</div><div class="bld-n">Name</div><div class="bld-d">History</div></div></div>
<div class="war-g"><div class="war-c"><div class="war-n">⚔ War (dates)</div><div class="war-d">Description</div><div class="war-stat">📅 Dates | ⚰ Deaths | 🏁 Outcome</div></div></div>
<div class="books"><div class="books-t">📚 Essential Reading</div><div class="bk-cat">Category</div><div class="bk"><span class="bk-ico">📖</span><div><div class="bk-t">Title</div><div class="bk-a">Author (Year)</div><div class="bk-d">Description — <a href="https://www.amazon.com/s?tag=atlasmundi-20&k=TITLE" target="_blank" style="color:#4a7fa5">Amazon →</a></div></div></div></div>
<div class="links"><a class="lnk" href="URL" target="_blank">🔗 Source</a></div>
<div class="region-grid"><div class="region-card"><div class="region-name">Name</div><div class="region-desc">Description</div></div></div>
<div class="danger-bar"><span class="db-label">Label</span><div class="db-track"><div class="db-fill" style="width:X%"></div></div></div>`;

function getLangNote(lang) {
  return { fr:"Réponds entièrement en FRANÇAIS. Style encyclopédique académique.", es:"Responde completamente en español.", de:"Antworte vollständig auf Deutsch.", ar:"أجب باللغة العربية الفصحى.", zh:"请完全用中文回答。", pt:"Responda completamente em português.", ja:"日本語で完全に答えてください。", it:"Rispondi completamente in italiano.", nl:"Antwoord volledig in het Nederlands.", ru:"Отвечай полностью на русском языке.", ko:"한국어로 완전히 답해주세요.", tr:"Tamamen Türkçe yanıtla.", pl:"Odpowiedz całkowicie po polsku.", sv:"Svara helt på svenska.", en:"" }[lang] || "";
}

function getPrompt(tab, country, req) {
  const lang = req.lang || 'en';
  const L = getLangNote(lang);
  const D = `Use collapsible sections. Minimum 8 timeline entries with precise dates. Named sources. Real statistics. Nothing censored.`;

  if (tab === 'ticker') return `Generate 20 fascinating world history facts in ${lang==='fr'?'French':lang==='de'?'German':lang==='es'?'Spanish':lang==='pt'?'Portuguese':'English'}. ONLY JSON: {"facts":["✦ Fact ✦",...]}`;

  if (tab === 'chat') {
    const hist = (req.chatHistory||[]).map(m=>`${m.role==='user'?'User':"Jeanne d'Arc"}: ${m.content}`).join('\n');
    return `${L} You are Jeanne d'Arc, the brilliant historian guide of Atlas Mundi. Total mastery of ALL world history to 2026. Passionate, precise, never mention AI. When mentioning a country suggest exploring it on the map.
Previous: ${hist}
User: ${req.chatMessage||''}
Respond in plain text, 2-3 paragraphs, specific dates and facts.`;
  }

  if (tab === 'news' || tab === 'country_news') {
    const focus = req.newsCountry && req.newsCountry !== 'world'
      ? `Generate 8 current 2026 news stories SPECIFICALLY about ${req.newsCountry}.`
      : 'Generate 8 diverse current 2026 world news stories.';
    return `${focus} ONLY JSON: {"newsCards":[{"cat":"conflict","title":"Headline","summary":"3 factual sentences","date":"June 4, 2026","emoji":"⚔","country":"Ukraine","sources":["Reuters"],"links":["https://reuters.com"]}]}`;
  }

  if (tab === 'newsdetail') return `${L} Comprehensive news analysis: "${req.newsTitle}". Summary: ${req.newsSummary||''}. Category: ${req.newsCategory||''}.
<h3 class="sh">📍 The Facts</h3>
Collapsibles: 📜 Historical Background | 👥 Key Players | 📅 Timeline (.tl-wrap 8+) | 🤝 Humanitarian Impact (.crisis) | 🌐 Geopolitical Implications | 🔮 Scenarios. Factual, uncensored, no political opinions.`;

  if (tab === 'battle') return `${L} Exhaustive military analysis of ${req.battleName} (${req.battleDate}). Context: ${req.battleDesc}.
Structure: Strategic Context | Forces & Commanders (exact numbers) | Phase-by-Phase (.tl-wrap 6+) | Turning Points | Casualties | Historical Consequences | .ano surprising fact.`;

  if (tab === 'eco_detail' || tab === 'finance') return `${L} Economics analysis: "${req.newsTitle||req.finTitle||country}". Context: ${req.newsSummary||req.finSummary||''}.
Overview | .sg Key Stats | Historical Context | Global Impact | Policy Responses | Key Concepts | .books Essential Reading (Amazon tag: atlasmundi-20)`;

  const tabs = {
    overview: `${L} COMPREHENSIVE OVERVIEW of ${country}.
.sg stats grid (15+ stats: name, capital, area, population, GDP per capita, currency, religion, language, government, independence, HDI, life expectancy, literacy, head of state, main exports).
3-4 rich .ct paragraphs: geography, identity, uniqueness, historical importance.
Collapsibles: 🗺 Geography & Climate | 🏛 Historical Summary (.tl-wrap 10+) | 💰 Economy | 🌍 International Relations | 🔥 Current Challenges.
.crisis for active conflicts. .ano for extraordinary fact. .links: Wikipedia, CIA, BBC, UN. ${D}`,

    antiquity: `${L} EXHAUSTIVE ANTIQUITY of ${country} from earliest times to 500 AD.
Collapsibles with .tl-wrap (8+ each): 🦴 Prehistoric | 🏺 Bronze Age & First Kingdoms | ⚔ Ancient Wars | 🏛 Architecture & Culture | 📜 Religion & Philosophy | 👑 Key Rulers (.lg format, 6+) | 🔱 Decline & Legacy.
.myth-box for major myths. Specific cultures, cities, rulers, dates. ${D}`,

    history: `${L} COMPLETE HISTORY of ${country}.
Each era: collapsible + .tl-wrap (10+ entries):
📜 Early Medieval (500-1000) | ⚔ High Medieval (1000-1300) | 🏰 Late Medieval (1300-1500) | 🌍 Early Modern (1500-1700) | 🏭 18th-19th Century | 💥 WWI Era | 🌑 Interwar & WWII | 🌐 Cold War | 📱 Contemporary (1990-2026).
Named leaders, death tolls, political context. Nothing censored. ${D}`,

    politics: `${L} COMPREHENSIVE POLITICS of ${country}.
System of Government | Current Landscape (all parties, recent elections).
Collapsibles: 🗳 Elections | ⚖ Judiciary | 🏛 Political Timeline (.tl-wrap 12+) | 🔴 Crises & Coups | 📊 Corruption & Press Freedom (.danger-bar) | 👩 Women in Politics. Uncensored. ${D}`,

    leaders: `${L} EXHAUSTIVE LEADERS of ${country}.
Groups with .lg format: 👑 Ancient | 🏰 Medieval | 🌍 Colonial Era | ⚔ Independence | 🏛 Presidents/PMs (ALL) | 😈 Dictators (fully uncensored) | 👩 Women Leaders.
5-sentence bios: background, rise, key decisions, crimes/failures, legacy. ${D}`,

    culture: `${L} COMPREHENSIVE CULTURE of ${country}.
Collapsibles: 🎭 Literature & Poetry | 🎵 Music | 🎬 Cinema | 🖼 Visual Arts | 🍽 Cuisine (10+ dishes) | ⚽ Sport | 👗 Fashion | 🎪 Festivals | 🌟 Mythology (.myth-box) | 📚 Philosophy. Specific names, works, dates. ${D}`,

    monuments: `${L} ICONIC MONUMENTS of ${country}.
.bld-g grid 12+: UNESCO, palaces, temples, fortresses, ruins, natural wonders. 4-sentence history each.
Collapsibles: UNESCO | Natural Wonders | Sacred Sites. .books (4+ real books, Amazon). .links UNESCO, tourism. ${D}`,

    religion: `${L} COMPREHENSIVE RELIGION of ${country}.
.sg demographics. Each religion: arrival, branches, political role, sacred sites, conflicts, secularisation.
🌟 Indigenous beliefs (.myth-box). Religious conflicts fully detailed. ${D}`,

    celebrities: `${L} EXHAUSTIVE FAMOUS FIGURES of ${country}.
.cel-g cards. Groups: 🏛 Historical | 🔬 Scientists | 🎭 Artists/Writers | 🎵 Musicians | 🎬 Filmmakers | ⚽ Athletes | 🌍 Explorers | ⚔ Military | 👩 Women Who Changed History.
2 compelling sentences with dates. Include controversial figures. ${D}`,

    geopolitics: `${L} COMPREHENSIVE GEOPOLITICS of ${country}.
Strategic Position | .gg grid: Military, Economic, Diplomatic.
Collapsibles: 🌐 Alliances (.ab) | ⚔ Conflicts (.crisis) | 🤝 Key Relations (top 6) | 💰 Economic Diplomacy | 🗺 Territorial Disputes | 🏛 International Orgs | 🔮 Challenges 2025-2030. ${D}`,

    wars: `${L} COMPLETE WARS & MILITARY HISTORY of ${country}.
Collapsibles with .war-g: ⚔ Ancient | 🏰 Medieval | 🌍 Colonial | 💥 WWI | 💣 WWII | 🌐 Cold War | 🔥 Post-1990.
Named commanders ALL sides, death tolls, outcomes. War crimes, named perpetrators. Nothing censored. ${D}`,

    crises: `${L} COMPREHENSIVE CRISES of ${country}.
💀 Genocides (perpetrators named, methods, death tolls) | 🌾 Famines | 👥 Refugees | 🔒 Repression | 💸 Economic Collapses | 🌿 Environmental | 💣 Terrorism | ⚖ Human Rights | 👩 Women's Rights | 🚢 Slavery.
Nothing censored. Real numbers, named perpetrators. ${D}`,

    regions: `${L} EXHAUSTIVE REGIONS & CITIES of ${country}.
.region-grid for ALL administrative divisions: history, cities, economic role, culture.
Major cities: founding, key events, neighborhoods, institutions, economy, famous people. ${D}`,

    books: `${L} COMPLETE BOOKS GUIDE for ${country}.
.books with .bk-cat: 📜 Prehistory | ⚔ Medieval | 🏭 Modern | 🔥 Wars | 🏛 Politics | 🎭 Culture | 📖 Novels | 🌍 Travel.
All books real and verifiable. Amazon links tag: atlasmundi-20. Min 3 per category.`,

    resources: `${L} RESEARCH GUIDE for ${country}.
.links: Wikipedia, BBC, CIA, Freedom House, HRW, Amnesty, UN, Transparency International, RSF.
Quality news sources. 5 real documentaries. .books: History (3), Politics (2), Culture (2), Journalism (2).`,

    sources_academic: `${L} ACADEMIC SOURCES for ${country}.
📰 Quality journalism | 🎓 Academic databases (JSTOR, Google Scholar) | 📚 10+ Essential books with real authors | 🏛 Official government sources | 🌍 International reports (UN, World Bank, IMF, HRW) | 📺 5+ Documentaries | 🌐 Digital archives. Real URLs where possible.`
  };

  return tabs[tab] || `${L} Write comprehensive encyclopedic content about ${country} for section: ${tab}. ${D}`;
}

function isRateLimited(ip) {
  const now = Date.now();
  const times = (rateLimitMap.get(ip)||[]).filter(t=>now-t<3600000);
  if (times.length >= 100) return true;
  times.push(now); rateLimitMap.set(ip, times); return false;
}

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Stream');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
  // Rate limit only very aggressive bots (100+ req/hour)
  if (isRateLimited(ip)) return res.status(429).json({ error: 'Too many requests. Please wait.' });

  const body = req.body || {};
  const { country, tab, lang, newsCountry } = body;
  if (!country || !tab) return res.status(400).json({ error: 'Missing country or tab' });

  const safeCountry = String(country).slice(0, 100).replace(/[<>'"]/g, '');
  const validTabs = ['overview','antiquity','history','politics','leaders','culture','monuments','religion','celebrities','geopolitics','wars','crises','regions','books','resources','sources_academic','battle','ticker','news','newsdetail','finance','chat','country_news','eco_detail'];
  if (!validTabs.includes(tab)) return res.status(400).json({ error: 'Invalid tab' });

  const isNews = tab === 'news' || tab === 'country_news';
  const isChat = tab === 'chat';
  const cacheKey = `${safeCountry}::${tab}::${lang||'en'}::${newsCountry||''}`;

  // 1. Check memory cache
  const memCached = memCache.get(cacheKey);
  if (memCached && Date.now() - memCached.ts < (isNews ? NEWS_TTL : MEM_TTL)) {
    res.setHeader('X-Cache', 'MEM');
    return res.status(200).json({ ...memCached.data, cached: true });
  }

  // 2. Check Supabase (skip for news and chat — always fresh)
  if (!isNews && !isChat) {
    const dbHtml = await dbGet(cacheKey);
    if (dbHtml) {
      const data = { html: dbHtml, cached: true };
      memCache.set(cacheKey, { data, ts: Date.now() });
      res.setHeader('X-Cache', 'DB');
      return res.status(200).json(data);
    }
  }

  // 3. Generate with Claude
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured.' });

  const prompt = getPrompt(tab, safeCountry, body);
  // Use Haiku for speed — Vercel free tier has 60s timeout
  // Haiku generates in 5-10s vs Sonnet 20-30s
  const modelName = 'claude-haiku-4-5-20251001';
  const maxTok = tab === 'ticker' ? 800 : 
                 ['chat','news','country_news'].includes(tab) ? 1500 :
                 ['overview','culture','monuments','religion','books','resources'].includes(tab) ? 2500 : 3000;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: modelName, max_tokens: maxTok, system: SYSTEM_PROMPT, messages: [{ role: 'user', content: prompt }] })
    });

    if (!response.ok) {
      const err = await response.json().catch(()=>({}));
      return res.status(502).json({ error: `API error: ${err?.error?.message || response.statusText}` });
    }

    const aiData = await response.json();
    const rawText = aiData.content.map(b=>b.text||'').join('');

    // Strip markdown code fences that AI sometimes adds
    const cleanText = rawText
      .replace(/^```html\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    let responseData = { html: cleanText, cached: false };

    if (tab === 'ticker') {
      try { const p = JSON.parse(rawText.replace(/```json|```/g,'').trim()); responseData = { facts: p.facts, cached: false }; }
      catch(e) { responseData = { facts: [], cached: false }; }
    } else if (isNews) {
      try { const p = JSON.parse(rawText.replace(/```json|```/g,'').trim()); responseData = { newsCards: p.newsCards, cached: false }; }
      catch(e) { responseData = { newsCards: [], cached: false }; }
    }

    // 4. Save to caches
    memCache.set(cacheKey, { data: responseData, ts: Date.now() });
    if (!isNews && !isChat && responseData.html) {
      dbSet(cacheKey, responseData.html); // async, don't await
    }

    console.log(`[Atlas v5] ${safeCountry}/${tab}/${lang||'en'} | ${aiData.usage?.output_tokens} tokens | Supabase: ${!isNews&&!isChat}`);
    return res.status(200).json(responseData);

  } catch (err) {
    console.error('Handler error:', err);
    return res.status(500).json({ error: 'Internal server error: ' + err.message });
  }
}

// module.exports is the handler itself (Vercel needs a callable),
// but we attach helpers so scripts/pregenerate-all.js can reuse the exact
// same prompts/system prompt/DB helpers instead of duplicating logic.
module.exports = handler;
module.exports.getPrompt = getPrompt;
module.exports.SYSTEM_PROMPT = SYSTEM_PROMPT;
module.exports.dbGet = dbGet;
module.exports.dbSet = dbSet;
