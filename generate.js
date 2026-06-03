// api/generate.js — Atlas Mundi v3
// Secure backend — API key never exposed to browser
// In-memory cache to reduce costs

const cache = new Map();
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
const rateLimitMap = new Map();
const RATE_LIMIT = 25;

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

BOOKS: <div class="books"><div class="books-t">📚 Essential Reading</div><div class="bk-cat">Category</div><div class="bk"><span class="bk-ico">📖</span><div><div class="bk-t">Title</div><div class="bk-a">Author</div><div class="bk-d">Description — <a href="https://www.amazon.com/s?tag=atlasmundi-20&k=TITLE+AUTHOR" target="_blank" style="color:#4a7fa5">Buy on Amazon →</a></div></div></div></div>

LINKS: <div class="links"><a class="lnk" href="URL" target="_blank">🔗 Name</a></div>

DANGER BARS: <div class="danger-bar"><span class="db-label">Label</span><div class="db-track"><div class="db-fill" style="width:X%"></div></div></div>

ISLAND NOTE: <div class="island-note">🏝 Note</div>

Be EXTREMELY detailed. Include ALL coups, genocides, atrocities, controversies. Use real names, dates, figures.`;

function getPrompt(tab, country, isIsland, isAncient, req = {}) {
  const lang = req.lang || 'en';
  const langNote = {
    fr: 'Réponds entièrement en français.',
    es: 'Responde completamente en español.',
    de: 'Antworte vollständig auf Deutsch.',
    ar: 'أجب باللغة العربية الفصحى بالكامل.',
    zh: '请完全用中文回答。',
    pt: 'Responda completamente em português.',
    ja: '日本語で完全に答えてください。',
    en: ''
  }[lang] || '';

  const island = isIsland ? `Note: ${country} is an island/archipelago — emphasise maritime history, isolation, indigenous peoples, colonial encounter, and unique cultural identity. ` : '';
  const ancient = isAncient ? `Note: ${country} is an ancient empire/civilisation — cover its full rise, peak, decline and legacy in great detail. ` : '';
  const base = island + ancient;

  // Special tabs
  if (tab === 'battle') {
    return `${langNote} Write an ULTRA-DETAILED military analysis of the ${req.battleName || country} (${req.battleDate || ''}). Context: ${req.battleDesc || ''}.
Include as HTML: 1) Strategic context — why this battle mattered geopolitically. 2) Forces involved — exact numbers, commanders, weapons, tactics. 3) Phase-by-phase account using .tl-wrap timeline. 4) Key turning points. 5) Casualties — military and civilian. 6) Historical consequences — how it changed history. 7) One .ano fascinating anecdote. Use .ct paragraphs, .sh headings, .war-stat for numbers.`;
  }

  if (tab === 'monuments') {
    return `${langNote} Write about the MOST ICONIC MONUMENTS, BUILDINGS & PLACES of ${country}. ${base}
Use a .bld-g grid with .bld-c cards. Include: palaces, cathedrals, fortresses, UNESCO sites, ancient ruins, modern landmarks, natural wonders.
For each card: appropriate emoji as .bld-ico, name as .bld-n, detailed history and cultural significance as .bld-d (3-4 sentences).
Include 6-10 monuments. After the grid, add a .books section titled 'Travel & Architecture Books' with 3-4 real verifiable books about ${country}'s architecture or travel, each with Amazon link using tag atlasmundi-20.
Also add a .links section with links to official tourism websites and UNESCO pages.`;
  }

  if (tab === 'books') {
    return `${langNote} Write a COMPREHENSIVE BOOKS section for ${country}. ${base}
Structure it using a .books container with .bk-cat category dividers:
- 📜 Prehistory & Antiquity (2-3 books)
- ⚔ Medieval & Early Modern History (2-3 books)
- 🏭 Modern History 19th-20th Century (2-3 books)
- 🏛 Politics & Society (2-3 books)
- 🎭 Culture, Art & Literature (2-3 books)
- 📖 Fiction & Novels set in ${country} (2-3 books)
${isIsland ? '- 🏝 Island History & Travel (2 books)' : ''}
Each .bk entry: .bk-t (real title), .bk-a (real author), .bk-d (2-sentence description + Amazon search link with tag atlasmundi-20).
ALL books must be REAL, published, verifiable. No invented titles.`;
  }

  if (tab === 'ticker') {
    return `Generate exactly 14 fascinating, surprising world history or geography facts. Return ONLY a JSON object like this:
{"facts": ["✦ Fact one here ✦", "✦ Fact two here ✦", ...]}
Facts should be surprising, educational and engaging. Mix history, geography, culture and science. No markdown, no explanation, ONLY the JSON object.`;
  }

  if (tab === 'news') {
    return `Generate 3 important current world news stories from 2025 as JSON. Return ONLY:
{"newsCards": [{"cat":"conflict","catLabel":"⚔ Active Conflict","title":"Short title","summary":"2-3 sentence summary of the real situation","badge":"LIVE","related":"CountryName","date":"Today"}]}
Use real current events. Categories: conflict, politics, economy, culture. No markdown, ONLY the JSON.`;
  }

  if (tab === 'newsdetail') {
    return `${langNote} Write a COMPREHENSIVE NEWS ANALYSIS article about: "${req.newsTitle || country}".
Summary context: ${req.newsSummary || ''}. Category: ${req.newsCategory || ''}.
Structure as HTML with these .sh sections:
1) 'Historical Background' — the deep roots of this issue (go back decades or centuries if relevant)
2) 'Key Players & Their Interests' — who is involved, what each side wants
3) 'Timeline of Recent Events' — use .tl-wrap with recent developments
4) 'Humanitarian Impact' — real numbers, civilian consequences, use .crisis box if severe
5) 'Geopolitical Implications' — regional and global consequences
6) 'Multiple Perspectives' — how different sides see this issue
7) 'What Could Happen Next' — 2-3 realistic scenarios
Be factual, balanced and completely uncensored. Cite real organisations and figures.`;
  }

  if (tab === 'finance') {
    return `${langNote} Write a COMPREHENSIVE FINANCE & ECONOMICS ANALYSIS about: "${req.finTitle || country}".
Context: ${req.finSummary || ''}. Category: ${req.finCat || ''}.
Structure as HTML:
1) .sh 'Overview' — clear accessible explanation for students and non-specialists
2) .sh 'Key Data & Statistics' — .sg stat grid with real numbers and figures
3) .sh 'Historical Context' — how we arrived at this situation
4) .sh 'Global Impact' — which countries and sectors are most affected and how
5) .sh 'Policy Responses' — what governments and central banks can do
6) .sh 'For Students: Key Concepts' — define 3-4 relevant economic terms clearly
7) .books section 'Essential Reading' — 3-4 real economics/finance books with Amazon links (tag: atlasmundi-20)
Be educational, accessible and accurate.`;
  }

  if (tab === 'chat') {
    return `You are Jeanne d'Arc, a legendary French historical figure now serving as the AI guide for Atlas Mundi world encyclopaedia. You speak with wisdom, passion, occasional medieval flair, and encyclopaedic knowledge of world history, geography and geopolitics. You are brave, direct and deeply moral. The user is currently exploring: ${country || 'the world'}. Their message: "${req.userMessage || 'Hello'}".
Reply in 2-4 sentences maximum, staying fully in character as Jeanne — wise, passionate about justice and truth, occasionally using medieval expressions. Keep response SHORT (under 120 words). Output plain text only, no HTML. You may use ⚔ 🏰 🌍 ✝ emojis very sparingly.`;
  }

  const prompts = {
    overview: `${langNote} Write a COMPREHENSIVE OVERVIEW for ${country}. ${base}
Include: 1) Stats grid (.sg) with: Capital, Population, Area, Official Languages, Currency, Government Type, GDP, Main Religion(s), Independence/Founded date, Life Expectancy, HDI Rank. 2) Two compelling intro paragraphs on what makes ${country} unique historically and today. 3) Geography and strategic importance. 4) Historical arc summary from earliest times to today (3 paragraphs). 5) Current political/economic/social situation. 6) Three fascinating .ano anecdotes. 7) Danger/instability .danger-bar ratings: Political Stability, Safety for Travellers, Human Rights, Press Freedom, Economic Inequality (0-100% where 100% = most dangerous/unequal). 8) Global standing today.`,

    antiquity: `${langNote} Write about the ANCIENT AND CLASSICAL HISTORY of ${country}. ${base}
Include: 1) Prehistoric archaeology — earliest human presence, cave art, megaliths. 2) First civilisations — who were they, languages, customs, social structures. 3) Ancient empires that controlled this territory. 4) For countries WITH direct ancient history (Italy→Rome, Greece→Athens/Sparta, Egypt→Pharaohs, Iran→Persia, Iraq→Mesopotamia/Babylon/Sumer): go VERY DEEP — describe the civilisation in detail, achievements, laws, arts, religion, rulers, wars. 5) Classical achievements in philosophy, science, architecture. 6) Roman/Byzantine/Persian/Islamic connections if relevant. 7) Ancient trade routes passing through. 8) Archaeological sites — what they reveal. 9) How ancient history shapes modern national identity. Use extensive .tl-wrap timeline and .ano anecdotes. For ancient empires this tab should be the most detailed.`,

    history: `${langNote} Write an ULTRA-COMPREHENSIVE HISTORY of ${country}. ${base}
Cover every era with detailed .tl-wrap timeline (use .maj for pivotal events, .dark for atrocities):
- Medieval period: kingdoms, invasions, religious conversion, feudalism
- Early modern: Renaissance, Reformation, exploration, colonial empire if applicable
- Colonial era: who colonised, resistance, collaboration, economic exploitation, slavery
- 19th century: nationalism, revolutions, industrialisation
- WWI: involvement, casualties, territorial changes
- Interwar: coups, economic crises, rise of fascism/communism
- WWII: occupation, resistance, collaboration, Holocaust if relevant, casualties
- Cold War: which bloc, CIA/KGB interventions, coups, dictatorships
- Decolonisation if applicable
- Late 20th century: democratisation or crises
- 21st century to present
Include ALL coups d'état with perpetrators named. No censorship whatsoever.`,

    politics: `${langNote} Write a COMPREHENSIVE POLITICAL ANALYSIS of ${country}. ${base}
Include: 1) Current political system — constitution, branches, electoral system. 2) ALL historical regimes chronologically with dates. 3) Every coup d'état — perpetrators, causes, consequences. 4) Major political parties and their ideologies. 5) Current government and leaders. 6) Corruption — Transparency International ranking, major named scandals. 7) Press freedom — RSF ranking, imprisoned journalists. 8) Human rights — Freedom House rating, specific documented abuses. 9) Judicial independence. 10) For authoritarian states: apparatus of repression in full detail. 11) Military-civilian relations. 12) For Mexico: cartel infiltration of politics, femicides statistics, disappearances.`,

    leaders: `${langNote} Write about the MOST SIGNIFICANT LEADERS of ${country} across ALL history. ${base}
Include 15-20+ people in .lg grid: ancient rulers, medieval kings/sultans/emperors, colonial governors, independence leaders, 20th century leaders (heroes AND dictators), current leaders, key intellectual and spiritual leaders.
For each .lc card: portrait emoji in .pp, .ln (full name), .lp (period/title), .ld (detailed paragraph including specific achievements AND specific crimes if applicable).
DO NOT CENSOR — dictators and war criminals get full honest treatment. Describe their methods of repression, death tolls they caused, their psychology and legacy.`,

    culture: `${langNote} Write a COMPREHENSIVE CULTURE section for ${country}. ${base}
Include: 1) Indigenous and pre-colonial cultures. 2) Art history — major movements and masterworks. 3) Literature — major authors, censored writers, Nobel laureates. 4) Music — traditional instruments, genres, famous musicians. 5) Cinema — film industry history, famous directors/films. 6) Architecture — major styles, .bld-g grid of iconic buildings. 7) Cuisine — origins, traditional dishes, global influence. 8) Sport — traditional sports, famous athletes, World Cup/Olympic moments. 9) UNESCO World Heritage Sites — all of them with descriptions. 10) Festivals with historical origins. 11) Cultural suppression under repressive regimes. 12) Pop culture today — TV, social media, youth culture.`,

    religion: `${langNote} Write a COMPREHENSIVE RELIGION & SPIRITUALITY section for ${country}. ${base}
Include: 1) Pre-religious animist/shamanic traditions. 2) Ancient religious systems. 3) How each major religion arrived — exact historical circumstances, missionaries, conquests, voluntary conversions, resistance. 4) Religious wars and sectarian conflicts — with casualty figures. 5) Forced conversions — Inquisition, Islamic conquest, colonial missionaries. 6) Major sacred sites with descriptions. 7) Sects and denominations with their internal tensions. 8) Religion-state relationship — theocracy, secularism, concordats. 9) Religious persecution — who persecuted whom, when, how. 10) Famous religious figures. 11) Syncretism where relevant (Voodoo, Candomblé, etc.). 12) Current demographics and interfaith tensions. 13) Secularism and atheism movements.`,

    celebrities: `${langNote} Write about FAMOUS PEOPLE from ${country} who shaped world history and culture. ${base}
Use .cel-g grid with 20+ people across ALL categories: scientists/inventors (with specific discoveries), writers/poets/philosophers, artists/painters/sculptors, musicians/composers/singers, actors/directors, athletes/champions, revolutionaries/political dissidents, religious figures, explorers/adventurers, economists, criminals/villains (include them honestly), rulers who became legendary.
For each .cel-c: appropriate emoji as .cel-ico, full name as .cel-n, field as .cel-role, 2-3 sentence biography explaining their global significance as .cel-d.
Include surprising lesser-known figures alongside famous ones. Do not censor controversial or criminal figures.`,

    geopolitics: `${langNote} Write a COMPREHENSIVE GEOPOLITICAL ANALYSIS of ${country} in the current world order. ${base}
Include: 1) Global position — superpower/regional power/middle power/weak state/failed state and why. 2) Military — size, budget, doctrine, nuclear status if applicable, recent conflicts. 3) All international alliances using .ab badges: NATO, EU, BRICS, AU, ASEAN, SCO, CSTO, Arab League, etc. 4) Key rivalries using .cb badges with specific territorial disputes and historical grievances. 5) Relationship with USA — full history and current tensions/cooperation. 6) Relationship with China — Belt & Road, investments, debt diplomacy, tensions. 7) Relationship with Russia. 8) All active territorial disputes with specific details. 9) Energy geopolitics — oil, gas, pipelines, renewables, dependencies. 10) Diaspora and soft power. 11) Refugee/migration situation with numbers. 12) ICC/ICJ cases if any. 13) Future geopolitical scenarios for next 20 years.`,

    wars: `${langNote} Write a COMPREHENSIVE WARS & MILITARY CONFLICTS section for ${country}. ${base}
Cover ALL significant conflicts in .war-g grid — ancient, medieval, colonial, modern, current.
For each .war-c: full .war-n title, detailed .war-d covering causes (going deep into political/economic/religious roots), major battles, key commanders, civilian experience, turning points, aftermath. .war-stat line with dates, estimated casualties, outcome.
Include: ancient battles, medieval conflicts, colonial conquest/resistance wars, independence wars, WWI & WWII involvement, civil wars in detail, Cold War proxy conflicts, modern wars, current active conflicts.
NOTHING IS CENSORED — include chemical weapons use, massacres, rape as weapon of war, war crimes, named perpetrators.`,

    crises: `${langNote} Write a COMPREHENSIVE CRISES & HUMANITARIAN DISASTERS section for ${country}. ${base}
NO CENSORSHIP. Use .crisis boxes for each major crisis type:
1) Genocides — every documented case: perpetrators named, victims, timeline, death toll, international response or inaction, denial politics, trials and convictions
2) Famines — natural AND political causes, governmental responsibility, death tolls
3) Current humanitarian crisis if any — scope, causes, NGO response
4) Refugee situations — numbers, causes, conditions
5) Political repression — death squads, gulags, disappearances, torture, named perpetrators and methods
6) Economic collapses — hyperinflation, IMF austerity consequences, social breakdown
7) Environmental crises — deforestation, pollution, climate vulnerability
8) Terrorism and insurgencies — all groups, ideology, attacks, state response
9) Drug crisis if applicable — trafficking routes, cartels, corruption, violence statistics
10) Human trafficking and modern slavery
11) ICC indictments and convictions
12) Human Rights Watch and Amnesty International key findings`,

    resources: `${langNote} Write a COMPREHENSIVE RESOURCES section for ${country}. ${base}
Include:
1) .links section with real URLs: Wikipedia main article, BBC Country Profile, CIA World Factbook, Freedom House, Human Rights Watch, Amnesty International, UN country page, Transparency International, RSF Press Freedom, UNHCR if refugee crisis
2) NEWS SOURCES section — reliable local and international media covering ${country}
3) ACADEMIC RESOURCES — 2-3 universities with area studies programs
4) DOCUMENTARY FILMS — 5 real documentaries available on major platforms
Then a .books section 'Essential Reading Library' with books organised by .bk-cat:
- History (3 books)
- Politics & Society (2 books)  
- Culture & Travel (2 books)
- Journalism & Investigation (2 books)
All books REAL and verifiable with Amazon links using tag atlasmundi-20.`
  };

  return prompts[tab] || `${langNote} Write comprehensive information about ${country} for the section: ${tab}. ${base}`;
}

function isRateLimited(ip) {
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;
  const times = (rateLimitMap.get(ip) || []).filter(t => now - t < windowMs);
  if (times.length >= RATE_LIMIT) return true;
  times.push(now);
  rateLimitMap.set(ip, times);
  return false;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
  if (isRateLimited(ip)) return res.status(429).json({ error: 'Too many requests. Please wait a moment.' });

  const { country, tab, battleName, battleDate, battleDesc, lang, userMessage, newsTitle, newsSummary, newsCategory, finTitle, finSummary, finCat } = req.body || {};

  if (!country || !tab) return res.status(400).json({ error: 'Missing country or tab' });

  const safeCountry = country.slice(0, 100).replace(/[<>'"]/g, '');
  const validTabs = ['overview','antiquity','history','politics','leaders','culture','monuments','religion','celebrities','geopolitics','wars','crises','books','resources','battle','ticker','news','newsdetail','finance','chat'];
  if (!validTabs.includes(tab)) return res.status(400).json({ error: 'Invalid tab' });

  const cacheKey = `${safeCountry}::${tab}::${lang||'en'}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    res.setHeader('X-Cache', 'HIT');
    const payload = cached.facts ? { facts: cached.facts } : cached.newsCards ? { newsCards: cached.newsCards } : { html: cached.html };
    return res.status(200).json({ ...payload, cached: true });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured. Add ANTHROPIC_API_KEY to Vercel environment variables.' });

  const islandNames = ['Hawaii','Philippines','Iceland','Cuba','Jamaica','Taiwan','Madagascar','Sri Lanka','Maldives','Malta','Cyprus','Crete','Sicily','Corsica','Fiji','Easter Island','Tahiti','Zanzibar','Cape Verde','Réunion','Mauritius','Seychelles','Okinawa','Timor-Leste','Greenland','Guam','Martinique','Comoros','Vanuatu','Solomon Islands','Samoa','Tonga','Papua New Guinea','New Zealand','Australia','Indonesia','Puerto Rico','Haiti'];
  const ancientNames = ['Byzantine Empire','Roman Empire','Ottoman Empire','Mongol Empire','Aztec Empire','Inca Empire','Carthage','Ancient Egypt','Persian Empire','Holy Roman Empire'];
  const isIsland = islandNames.includes(safeCountry);
  const isAncient = ancientNames.includes(safeCountry);

  const prompt = getPrompt(tab, safeCountry, isIsland, isAncient, req.body || {});

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
      console.error('Anthropic error:', response.status, err);
      return res.status(502).json({ error: `API error: ${err?.error?.message || response.statusText}` });
    }

    const data = await response.json();
    const rawText = data.content.map(b => b.text || '').join('');

    let responseData = { html: rawText, cached: false };

    // JSON-only tabs
    if (tab === 'ticker') {
      try {
        const clean = rawText.replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(clean);
        responseData = { facts: parsed.facts, cached: false };
      } catch (e) {
        responseData = { facts: [], cached: false };
      }
    } else if (tab === 'news') {
      try {
        const clean = rawText.replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(clean);
        responseData = { newsCards: parsed.newsCards, cached: false };
      } catch (e) {
        responseData = { newsCards: [], cached: false };
      }
    } else if (tab === 'chat') {
      // Chat returns plain text
      responseData = { html: rawText, cached: false };
    }

    cache.set(cacheKey, { ...responseData, ts: Date.now() });
    console.log(`[Atlas] ${safeCountry}/${tab} | tokens: ${data.usage?.input_tokens}→${data.usage?.output_tokens}`);
    return res.status(200).json(responseData);

  } catch (err) {
    console.error('Handler error:', err);
    return res.status(500).json({ error: 'Internal server error. Please try again.' });
  }
}
