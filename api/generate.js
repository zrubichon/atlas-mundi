// api/generate.js
// Secure backend proxy — API key never exposed to the browser
// Simple in-memory cache to reduce Anthropic API costs

const cache = new Map();
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days in ms
const rateLimitMap = new Map(); // IP -> [timestamps]
const RATE_LIMIT = 20; // max 20 requests per IP per hour

// ─────────────────────────────────────────
// SYSTEM PROMPT
// ─────────────────────────────────────────
const SYSTEM_PROMPT = `You are the chief scholar of Atlas Mundi, the world's most comprehensive and uncensored encyclopaedia of nations, islands and civilisations.

You write richly in English — scholarly yet magnetic, like a brilliant historian who brings every era to life. You never censor, never sanitise. You discuss genocides, atrocities, dictators, coups, wars, colonialism, exploitation, religious violence, and human rights abuses factually and completely.

You output ONLY raw HTML fragments using these CSS classes (no markdown, no code fences):

TYPOGRAPHY:
- <h3 class="sh">Section Title</h3>
- <h4 class="sh2">Subsection</h4>
- <p class="ct">Body paragraph</p>
- <span class="em">Emphasis</span>
- <blockquote class="qb">Quote<cite>— Author</cite></blockquote>
- <hr class="div">

STATS: <div class="sg"><div class="sc"><div class="sl">Label</div><div class="sv">Value</div></div></div>

TIMELINE: <div class="tl-wrap"><div class="te maj"><div class="td">DATE</div><div class="tt2">Title</div><div class="tdesc">Description</div></div></div>
(class "maj" for major events, "dark" for atrocities)

ANECDOTES: <div class="ano"><span class="ano-lbl">📖 Anecdote</span>Story</div>

CRISES: <div class="crisis"><span class="crisis-lbl">🔴 TYPE</span><p class="ct">Details</p></div>

LEADERS: <div class="lg"><div class="lc"><div class="pp">👤</div><div><div class="ln">Name</div><div class="lp">Period</div><div class="ld">Bio</div></div></div></div>

CELEBRITIES: <div class="cel-g"><div class="cel-c"><div class="cel-ico">🎭</div><div class="cel-n">Name</div><div class="cel-role">Field</div><div class="cel-d">Description</div></div></div>

GEOPOLITICS: <div class="gg"><div class="gc"><div class="gc-t">🌐 Topic</div><p class="ct">Details</p><span class="ab">Alliance</span><span class="cb">Conflict</span><span class="nb">Org</span></div></div>

BUILDINGS: <div class="bld-g"><div class="bld-c"><div class="bld-ico">🏛</div><div class="bld-n">Name</div><div class="bld-d">History</div></div></div>

WARS: <div class="war-g"><div class="war-c"><div class="war-n">War</div><div class="war-d">Description</div><div class="war-stat">📅 Date | ⚰ Deaths | 🏁 Outcome</div></div></div>

BOOKS: <div class="books"><div class="books-t">📚 Essential Reading</div><div class="bk"><span class="bk-ico">📖</span><div><div class="bk-t">Title</div><div class="bk-a">Author</div><div class="bk-d">Description — <a href="https://amazon.com/s?k=TITLE+AUTHOR" target="_blank" style="color:#4a7fa5">Buy on Amazon ↗</a></div></div></div></div>

LINKS: <div class="links"><a class="lnk" href="URL">🔗 Name</a></div>

DANGER BARS: <div class="danger-bar"><span class="db-label">Label</span><div class="db-track"><div class="db-fill" style="width:X%"></div></div></div>

ISLAND NOTE: <div class="island-note">🏝 Note</div>

Be EXTREMELY detailed. For major countries write 1500+ words of HTML. Include ALL coups, genocides, atrocities, controversies. Use real names, dates, figures. For book links, always add a real Amazon search URL.`;

// ─────────────────────────────────────────
// PROMPTS
// ─────────────────────────────────────────
function getPrompt(tab, country, isIsland, isAncient, req={}) {
  const island = isIsland ? `Note: ${country} is an island/archipelago — emphasise maritime history, isolation, indigenous peoples, colonial encounter, and unique cultural identity. ` : '';
  const ancient = isAncient ? `Note: ${country} is an ancient empire/civilisation — cover its full rise, peak, decline and legacy in great detail. ` : '';
  const base = island + ancient;

  const prompts = {
    overview: `Write a COMPREHENSIVE OVERVIEW for ${country}. ${base}
Include: 1) Stats grid (Capital, Population, Area, Languages, Currency, Government, GDP, Religion, Independence date, Life Expectancy, HDI). 2) Two compelling intro paragraphs on what makes ${country} unique historically and today. 3) Geography and strategic importance. 4) Historical arc summary (3-4 paragraphs from earliest times to today). 5) Current political/economic/social situation. 6) Three fascinating anecdotes (.ano). 7) Danger/instability bars: Political Stability, Safety, Human Rights, Press Freedom, Economic Inequality (0-100%). 8) Global standing today.`,

    antiquity: `Write about the ANCIENT AND CLASSICAL HISTORY of ${country}. ${base}
Include: 1) Prehistoric archaeology and earliest human presence. 2) First civilisations and peoples — languages, customs, social structures. 3) Ancient empires that controlled this territory. 4) For countries WITH direct ancient history (Italy→Rome, Greece→Athens/Sparta, Egypt→Pharaohs, Iran→Persia, Iraq→Mesopotamia): go VERY DEEP. 5) Classical achievements in philosophy, art, law, architecture. 6) Roman/Byzantine/Persian connections if relevant. 7) Ancient trade routes. 8) Archaeological sites and what they reveal. 9) How ancient history shapes modern national identity. Use extensive timeline and anecdotes.`,

    history: `Write an ULTRA-COMPREHENSIVE POLITICAL AND SOCIAL HISTORY of ${country}. ${base}
Cover every era with detailed timeline: Medieval period, Early modern era, Colonial period (coloniser, resistance, exploitation, slavery), 19th century nationalism, WWI (involvement, casualties, treaties), Interwar (coups, fascism, communism), WWII (occupation, collaboration, Holocaust if relevant), Cold War (CIA/KGB, coups, dictatorships), Decolonisation, Late 20th century crises, 21st century to present. Mark .maj for pivotal moments, .dark for atrocities. Include ALL coups with perpetrators named. No censorship.`,

    politics: `Write a COMPREHENSIVE POLITICAL ANALYSIS of ${country}. ${base}
Include: 1) Current system — constitution, branches, elections. 2) ALL historical regimes chronologically with dates. 3) Every coup d'état with perpetrators, causes, consequences. 4) Major political parties and their ideologies. 5) Current government and leaders. 6) Corruption (Transparency International ranking, major scandals with names). 7) Press freedom (RSF ranking, imprisoned journalists). 8) Human rights (Freedom House rating, specific documented abuses). 9) Judicial independence. 10) For authoritarian states: apparatus of repression in detail. 11) Military-civilian relations. 12) If Mexico: cartel infiltration of politics, femicides, disappearances numbers.`,

    leaders: `Write about the MOST SIGNIFICANT LEADERS of ${country} across ALL history. ${base}
Include 15-20+ people: ancient rulers, medieval kings/sultans/emperors, colonial governors, independence leaders, 20th century leaders (heroes AND dictators), current leaders, key intellectuals and spiritual leaders. For each: .lc card with portrait placeholder, name, period/title, detailed biography. DO NOT CENSOR — dictators and war criminals get full honest treatment including specific crimes. Include personality, personal life, legacy, revisionist debates.`,

    culture: `Write a COMPREHENSIVE CULTURE section for ${country}. ${base}
Include: 1) Indigenous and pre-colonial cultures. 2) Art history — movements and key works. 3) Literature — major authors, censored writers. 4) Music — traditional instruments, genres, evolution. 5) Cinema — industry history, famous films, censorship. 6) Architecture — iconic buildings (.bld-g grid). 7) Cuisine — origins, dishes, global influence. 8) Sport — traditional sports, famous athletes, World Cup moments. 9) UNESCO World Heritage Sites. 10) Festivals with historical origins. 11) Cultural suppression under regimes. 12) Pop culture today.`,

    religion: `Write a COMPREHENSIVE RELIGION section for ${country}. ${base}
Include: 1) Pre-religious animist traditions. 2) Ancient religious systems. 3) How each major religion arrived — exact circumstances, conversions, resistance. 4) Religious wars and sectarian conflicts with casualties. 5) Forced conversions (Inquisition, conquest, missionaries). 6) Major religious sites. 7) Sects and denominations with their tensions. 8) Religion-state relationship. 9) Religious persecution — who, when, by whom. 10) Famous religious figures. 11) Syncretism (Voodoo, Candomblé, etc. where relevant). 12) Current demographics and tensions. 13) Secularism and atheism movements.`,

    celebrities: `Write about FAMOUS PEOPLE from ${country} who shaped world history and culture. ${base}
Use .cel-g grid with 20+ people across: historical leaders, scientists/inventors (with discoveries), writers/poets/philosophers, artists/painters, musicians/composers, actors/directors, athletes, revolutionaries/dissidents, religious figures, explorers, economists, criminals/villains (include them honestly). For each: emoji, full name, field, 2-3 sentence bio explaining global significance. Include surprising lesser-known figures alongside famous ones.`,

    geopolitics: `Write a COMPREHENSIVE GEOPOLITICAL ANALYSIS of ${country}. ${base}
Include: 1) Global position (superpower/regional/failed state). 2) Military strength, budget, nuclear status. 3) All international alliances (.ab badges): NATO, EU, BRICS, AU, ASEAN, SCO etc. 4) Key rivalries (.cb badges) with territorial disputes. 5) Relationship with USA — history and current tensions. 6) Relationship with China — Belt & Road, investments, tensions. 7) Relationship with Russia. 8) Relationship with EU. 9) All active territorial disputes. 10) Energy geopolitics — oil, gas, pipelines. 11) Diaspora and soft power. 12) Refugee/migration situation with numbers. 13) ICC/ICJ cases. 14) Future scenarios for next 20 years.`,

    wars: `Write a COMPREHENSIVE WARS section for ${country}. ${base}
Cover ALL significant conflicts — ancient, medieval, colonial, modern, current. Use .war-g grid. For each war: full causes (going deep into political/economic/religious roots), major battles, key commanders, civilian experience, turning points, aftermath, death toll. Include: ancient battles, medieval conflicts, colonial conquest/resistance, independence wars, WWI & WWII involvement, civil wars, proxy wars, modern conflicts, current active conflicts. Include chemical weapons use, massacres, rape as weapon of war, war crimes — nothing censored.`,

    crises: `Write a COMPREHENSIVE CRISES section for ${country}. ${base}
NO CENSORSHIP. Cover: 1) Genocides — every documented case with perpetrators, victims, timeline, death toll, international response/inaction, denial, trials. 2) Famines — natural AND political causes, governmental responsibility. 3) Current humanitarian crises — scope, causes, response. 4) Refugee situations. 5) Political repression — death squads, gulags, disappearances, torture, perpetrators named. 6) Economic collapses — hyperinflation, IMF austerity effects. 7) Environmental crises. 8) Terrorism and insurgencies. 9) Drug crisis and cartels with statistics. 10) Human trafficking. 11) ICC indictments and convictions. 12) Human rights NGO reports (AI, HRW, RSF).`,

    resources: `Write a COMPREHENSIVE RESOURCES section for ${country}. ${base}
Include: 1) 10-12 REAL verifiable books (.books) — history, politics, culture, memoirs, journalism — each with Amazon affiliate link using: https://www.amazon.com/s?tag=atlasmundi-20&k=BOOK+TITLE+AUTHOR (replace spaces with +). 2) 5-8 real documentaries. 3) Online resources (.links) with real URLs: Wikipedia, BBC Country Profile, CIA World Factbook, Freedom House, HRW, Amnesty, UN, Transparency International, RSF. 4) Academic resources. 5) Museums with relevant collections. 6) Language learning resources. 7) Reliable news sources covering this country. Always use the Amazon affiliate tag: atlasmundi-20`
  };

  // Special: battle detail
  if(tab === 'battle' && req && req.battleName) {
    return `Write an ULTRA-DETAILED military analysis of the ${req.battleName} (${req.battleDate}).
${req.battleDesc}
Include as HTML: 1) Strategic context — why this battle mattered. 2) Forces involved — numbers, commanders, equipment. 3) Tactical overview — how the battle unfolded, key moments, turning points. 4) Day-by-day or phase-by-phase account. 5) Casualties and human cost. 6) Aftermath and historical consequences. 7) One fascinating anecdote (.ano). Use .ct paragraphs, .tl-wrap timeline for phases, .war-stat for numbers.`;
  }
  return prompts[tab] || `Write comprehensive information about ${tab} for ${country}.`;
}

// ─────────────────────────────────────────
// RATE LIMITER
// ─────────────────────────────────────────
function isRateLimited(ip) {
  const now = Date.now();
  const windowMs = 60 * 60 * 1000; // 1 hour
  const times = (rateLimitMap.get(ip) || []).filter(t => now - t < windowMs);
  if (times.length >= RATE_LIMIT) return true;
  times.push(now);
  rateLimitMap.set(ip, times);
  return false;
}

// ─────────────────────────────────────────
// MAIN HANDLER
// ─────────────────────────────────────────
export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Rate limiting
  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Too many requests. Please wait a moment before exploring more.' });
  }

  const { country, tab, battleName, battleDate, battleDesc } = req.body || {};

  if (!country || !tab) {
    return res.status(400).json({ error: 'Missing country or tab parameter' });
  }

  // Sanitise inputs
  const safeCountry = country.slice(0, 100).replace(/[<>'"]/g, '');
  const validTabs = ['overview','antiquity','history','politics','leaders','culture','religion','celebrities','geopolitics','wars','crises','resources'];
  if (!validTabs.includes(tab)) {
    return res.status(400).json({ error: 'Invalid tab' });
  }

  // Check cache
  const cacheKey = `${safeCountry}::${tab}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    res.setHeader('X-Cache', 'HIT');
    return res.status(200).json({ html: cached.html, cached: true });
  }

  // Check API key
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured on server. Add ANTHROPIC_API_KEY to Vercel environment variables.' });
  }

  // Detect island/ancient
  const islandNames = ['Hawaii','Philippines','Iceland','Cuba','Jamaica','Taiwan','Madagascar','Sri Lanka','Maldives','Malta','Cyprus','Crete','Sicily','Corsica','Fiji','Easter Island','Tahiti','Zanzibar','Cape Verde','Réunion','Mauritius','Seychelles','Okinawa','Timor-Leste','Greenland','Guam','Martinique','Comoros','Vanuatu','Solomon Islands','Samoa','Tonga','Papua New Guinea','New Zealand','Australia','Indonesia'];
  const ancientNames = ['Byzantine Empire','Roman Empire','Ottoman Empire','Mongol Empire','Aztec Empire','Inca Empire','Carthage','Ancient Egypt','Persian Empire','Holy Roman Empire'];
  const isIsland = islandNames.includes(safeCountry);
  const isAncient = ancientNames.includes(safeCountry);

  const prompt = getPrompt(tab, safeCountry, isIsland, isAncient, req.body);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 3500,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      console.error('Anthropic API error:', response.status, err);
      return res.status(502).json({
        error: `API error: ${err?.error?.message || response.statusText}`
      });
    }

    const data = await response.json();
    const html = data.content.map(b => b.text || '').join('');

    // Store in cache
    cache.set(cacheKey, { html, ts: Date.now() });

    // Log for monitoring (country + tab only, no personal data)
    console.log(`[Atlas] Generated: ${safeCountry} / ${tab} | Tokens: ${data.usage?.input_tokens}→${data.usage?.output_tokens}`);

    return res.status(200).json({ html, cached: false });

  } catch (err) {
    console.error('Handler error:', err);
    return res.status(500).json({ error: 'Internal server error. Please try again.' });
  }
}
