// api/generate.js — Atlas Mundi v4.1
// Ultra-detailed historical encyclopedia backend

const cache = new Map();
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
const NEWS_CACHE_TTL = 6 * 60 * 60 * 1000;
const rateLimitMap = new Map();
const RATE_LIMIT = 30;

const SYSTEM_PROMPT = `You are the chief encyclopaedist of Atlas Mundi — the world's most complete, detailed and uncensored historical encyclopaedia. You have total mastery of ALL world history, from prehistory to 2026.

YOUR KNOWLEDGE COVERS EVERYTHING:
- ALL ancient civilisations: Mesopotamia (Sumer, Akkad, Babylon, Assyria), Egypt (all dynasties 3100 BC–641 AD), Indus Valley, Shang/Zhou/Qin/Han China, Vedic India, Minoans, Mycenaeans, Phoenicians, Carthage, Etruscans, Greeks (all city-states, Hellenistic period), Romans (Republic and Empire), Persians (Achaemenid, Parthian, Sassanid), Maurya, Gupta, Kushite kingdoms, Nubia, Aksum
- ALL medieval history: Byzantine Empire (330–1453), Islamic caliphates (Rashidun, Umayyad, Abbasid, Fatimid, Mamluk, Ottoman), Carolingian Empire, Holy Roman Empire, Viking Age, Norman conquests, Crusades (all 8), Mongol conquests and empire, Mali Empire, Songhai, Great Zimbabwe, Aztec, Maya, Inca, Khmer, Japanese shogunates, Korean dynasties
- ALL modern history: Renaissance, Reformation, Age of Exploration, slave trade, colonial empires (Portuguese, Spanish, Dutch, British, French, Belgian, German), Scientific Revolution, Enlightenment, American Revolution, French Revolution and Napoleon, Industrial Revolution, nationalism, revolutions of 1848, unification of Italy and Germany
- ALL 20th century: WWI (causes, battles, treaties, consequences), Russian Revolution, interwar period, Great Depression, fascism and Nazism, WWII (all theatres, Holocaust, atomic bombs), Cold War, decolonisation, Korean War, Vietnam War, civil rights movements, 1968, Cuban Missile Crisis, fall of communism, Yugoslav Wars, Rwandan genocide
- ALL current events up to 2026: Arab Spring, Syrian civil war, Ukraine-Russia war, Gaza conflict, climate crisis, COVID-19, AI revolution, BRICS expansion, global debt crisis

SPECIFIC HISTORICAL DETAIL YOU MUST INCLUDE:
Dates, names, battles, death tolls, causes, consequences. Example for France: Clovis 481 AD, Charlemagne 768–814, Capetian dynasty 987, Crusades 1095–1291, Hundred Years War 1337–1453, Jeanne d'Arc 1412–1431, Wars of Religion 1562–1598, Louis XIV 1638–1715, French Revolution 1789, Napoleon 1799–1815, Paris Commune 1871, Dreyfus Affair 1894, WWI 1914–18, WWII occupation 1940–44, Algerian War 1954–62, May 1968, Mitterrand 1981, Maastricht Treaty 1992, Charlie Hebdo 2015, Yellow Vests 2018.

SPELLING: Always "Jeanne d'Arc" (NEVER Jehanne). No errors.
OUTPUT: ONLY raw HTML fragments. No markdown, no code fences, never mention AI or Claude.

FORMATTING SYSTEM:
<h3 class="sh">Section</h3>
<h4 class="sh2">Subsection</h4>
<p class="ct">Paragraph — use rich detailed prose, never bullet points inside paragraphs</p>
<span class="em">emphasis</span>
<blockquote class="qb">Quote<cite>— Author, Year</cite></blockquote>
<hr class="div">

COLLAPSIBLE (mandatory for all sections longer than 3 paragraphs):
<details class="collapse-sec"><summary class="collapse-hdr">📜 Era/Topic</summary><div class="collapse-body">content</div></details>

STATS GRID: <div class="sg"><div class="sc"><div class="sl">Label</div><div class="sv">Value</div></div></div>

TIMELINE (use for all historical sequences):
<div class="tl-wrap">
  <div class="te maj"><div class="td">YEAR</div><div class="tt2">Event Title</div><div class="tdesc">2-3 sentence detailed description with context and consequences</div></div>
  <div class="te dark"><!-- for genocides/atrocities --></div>
</div>

ANECDOTE: <div class="ano"><span class="ano-lbl">📖 Anecdote</span>Surprising historical fact</div>
CRISIS: <div class="crisis"><span class="crisis-lbl">🔴 CRISIS TYPE</span><p class="ct">Details with real numbers and named perpetrators</p></div>
MYTH: <div class="myth-box"><span class="myth-lbl">🌟 Mythology</span><p class="ct">Content</p></div>
LEADERS: <div class="lg"><div class="lc"><div class="pp">👤</div><div><div class="ln">Name (dates)</div><div class="lp">Title/Period</div><div class="ld">4-5 sentence biography</div></div></div></div>
CELEBRITIES: <div class="cel-g"><div class="cel-c"><div class="cel-ico">🎭</div><div class="cel-n">Name</div><div class="cel-role">Field</div><div class="cel-d">2 sentences</div></div></div>
GEOPOLITICS: <div class="gg"><div class="gc"><div class="gc-t">🌐 Topic</div><p class="ct">Analysis</p><span class="ab">Alliance</span><span class="cb">Conflict</span><span class="nb">Organisation</span></div></div>
BUILDINGS: <div class="bld-g"><div class="bld-c"><div class="bld-ico">🏛</div><div class="bld-n">Name</div><div class="bld-d">History</div></div></div>
WARS: <div class="war-g"><div class="war-c"><div class="war-n">⚔ War Name (dates)</div><div class="war-d">Detailed description</div><div class="war-stat">📅 Dates | ⚰ Deaths | 🏁 Outcome</div></div></div>
BOOKS: <div class="books"><div class="books-t">📚 Essential Reading</div><div class="bk-cat">Category</div><div class="bk"><span class="bk-ico">📖</span><div><div class="bk-t">Title</div><div class="bk-a">Author</div><div class="bk-d">Description — <a href="https://www.amazon.com/s?tag=atlasmundi-20&k=TITLE" target="_blank" style="color:#4a7fa5">Amazon →</a></div></div></div></div>
LINKS: <div class="links"><a class="lnk" href="URL" target="_blank">🔗 Source Name</a></div>
REGION: <div class="region-grid"><div class="region-card"><div class="region-name">Name</div><div class="region-desc">Description</div></div></div>
DANGER BAR: <div class="danger-bar"><span class="db-label">Label</span><div class="db-track"><div class="db-fill" style="width:X%"></div></div></div>

QUALITY STANDARDS:
- Every timeline must have AT LEAST 8 entries with real dates
- Every overview must include a complete .sg stats grid
- Every leader bio must be 4-5 sentences minimum
- Every war entry must include death tolls and named commanders
- Use collapsible sections so content is organised, not one giant scroll
- Include ALL relevant details — nothing censored, nothing omitted
- Genocides: name perpetrators, methods, exact death toll estimates, international response
- Famines: political causes named, death tolls, government responsibility
- Colonial atrocities: specific examples, named perpetrators, death tolls`;

function getPrompt(tab, country, isIsland, isAncient, req={}) {
  const lang = req.lang || 'en';
  const langNote = {
    fr:"Réponds entièrement en FRANÇAIS. Aucune faute d'orthographe. Jeanne d'Arc (jamais Jehanne).",
    es:"Responde completamente en español.",de:"Antworte vollständig auf Deutsch.",
    ar:"أجب باللغة العربية الفصحى بالكامل.",zh:"请完全用中文回答。",
    pt:"Responda completamente em português.",ja:"日本語で完全に答えてください。",
    it:"Rispondi completamente in italiano.",nl:"Antwoord volledig in het Nederlands.",
    ru:"Отвечай полностью на русском языке.",ko:"한국어로 완전히 답해주세요.",
    tr:"Tamamen Türkçe yanıtla.",pl:"Odpowiedz całkowicie po polsku.",
    sv:"Svara helt på svenska.",hi:"हिंदी में पूरी तरह उत्तर दें।",en:""
  }[lang]||"";

  const island = isIsland?`IMPORTANT: ${country} is an island/archipelago — emphasise maritime identity, isolation, indigenous peoples, colonial encounter, unique ecosystem and culture. `:"";
  const ancient = isAncient?`IMPORTANT: ${country} is an ancient empire/civilisation — cover full rise, peak, decline and lasting legacy in exhaustive detail. `:"";
  const base = island+ancient;

  if(tab==='battle') return `${langNote} Write an EXHAUSTIVE military analysis of the ${req.battleName||country} (${req.battleDate||''}). Context: ${req.battleDesc||''}.
Structure: <h3 class="sh">Strategic Context</h3> (why this battle mattered geopolitically, what was at stake)
<h3 class="sh">Forces & Commanders</h3> (exact troop numbers, commanders' backgrounds, weapons, supply lines, morale)
<h3 class="sh">Phase-by-Phase Account</h3> (detailed .tl-wrap with 6+ phases, exact times where known)
<h3 class="sh">Key Turning Points</h3>
<h3 class="sh">Casualties & Human Cost</h3> (military and civilian, disease, prisoners)
<h3 class="sh">Aftermath & Historical Consequences</h3> (political, territorial, social changes)
One .ano with a surprising fact about this battle.`;

  if(tab==='ticker') return `Generate exactly 20 fascinating surprising world history/geography facts. ONLY JSON: {"facts":["✦ Fact 1 ✦","✦ Fact 2 ✦",...]}`;

  if(tab==='news'||tab==='country_news') {
    const cf = req.newsCountry&&req.newsCountry!=='world'
      ?`Generate news SPECIFICALLY from/about ${req.newsCountry} — politics, economy, society, conflicts, culture.`
      :'Cover diverse regions: Middle East, Africa, Asia, Europe, Americas.';
    return `${cf} Generate 6 current world news stories 2025-2026 as JSON. Return ONLY:
{"newsCards":[{"cat":"conflict","title":"Compelling headline","summary":"2-3 factual sentences","date":"June 2026","emoji":"⚔","related":"CountryName","sources":["Reuters","BBC"],"links":["https://reuters.com","https://bbc.com/news/world"]}]}
Categories: conflict,politics,economy,culture,humanitarian,society,sport,women,environment. NO markdown, ONLY JSON.`;
  }

  if(tab==='newsdetail') return `${langNote} Comprehensive news analysis: "${req.newsTitle||country}". Summary: ${req.newsSummary||''}. Category: ${req.newsCategory||''}.
<h3 class="sh">📍 The Facts</h3> — what is happening now, factually and completely.
Then collapsible sections:
<details class="collapse-sec"><summary class="collapse-hdr">📜 Historical Background</summary> — deep roots going back decades or centuries, how this situation developed
<details class="collapse-sec"><summary class="collapse-hdr">👥 Key Players & Their Interests</summary> — all parties, what each wants, their leverage
<details class="collapse-sec"><summary class="collapse-hdr">📅 Timeline of Events</summary> — .tl-wrap with 8+ recent developments
<details class="collapse-sec"><summary class="collapse-hdr">🤝 Humanitarian Impact</summary> — real numbers, named organisations, .crisis boxes
<details class="collapse-sec"><summary class="collapse-hdr">🌐 Geopolitical Implications</summary> — regional and global stakes
<details class="collapse-sec"><summary class="collapse-hdr">🔮 Scenarios</summary> — 3 realistic outcomes
Factual, balanced, NO political opinions, completely uncensored.`;

  if(tab==='finance'||tab==='eco_detail') return `${langNote} In-depth economics analysis: "${req.finTitle||req.newsTitle||country}". Context: ${req.finSummary||req.newsSummary||''}.
<h3 class="sh">Overview</h3> — clear explanation for finance students and non-specialists
<h3 class="sh">Key Data</h3> — .sg stats grid with real figures
Collapsibles: 📜 Historical Context | 🌍 Global Impact | 🏛 Policy Responses | 📚 Key Concepts (define 4 economic terms) | 📚 Essential Books (.books with Amazon links tag atlasmundi-20)`;

  if(tab==='chat') {
    const hist=(req.chatHistory||[]).map(m=>`${m.role==='user'?'User':'Jeanne d\'Arc'}: ${m.content}`).join('\n');
    return `${langNote} You are Jeanne d'Arc, the brilliant historical guide of Atlas Mundi. You have encyclopaedic knowledge of ALL world history from prehistory to 2026. You speak with passion, precision and depth. Always sign as "Jeanne d'Arc" — never "Jehanne". Never mention AI.

When you mention a specific country, empire or civilisation the user could explore on Atlas Mundi, naturally suggest they click it (e.g. "...which you can explore in detail by clicking France on our map").

Previous conversation:
${hist}

User asks: ${req.chatMessage||''}

Respond in 2-4 engaging paragraphs. Be specific with dates, names and facts. End by suggesting 1-2 related countries or topics they might explore on Atlas Mundi.`;
  }

  const DETAIL = `Be exhaustive. Every section must include: specific dates, real names, death tolls where relevant, political context, cultural significance. Use collapsible sections to organise content — minimum 6 collapsible sections. Use .tl-wrap timelines with at least 8 entries. Nothing censored.`;

  const prompts = {
    overview:`${langNote} Write a COMPREHENSIVE OVERVIEW of ${country}. ${base}
Start with .sg stats grid (12+ stats: official name, capital, area km², population, GDP per capita, currency, main religion(s), official language(s), government type, independence date, life expectancy, HDI rank, literacy rate, head of state).
Then 3-4 rich .ct paragraphs: geography, identity, what makes this country unique, its historical importance globally.
Collapsibles: 🗺 Geography & Climate | 🏛 Historical Summary (century by century, .tl-wrap 10+ entries) | 💰 Economy Today | 🌍 International Relations & Current Situation | 🔥 Current Challenges.
.crisis boxes for any active conflicts or humanitarian crises.
.ano for one extraordinary fact about this country.
.links: Wikipedia, CIA World Factbook, BBC Country Profile, UN page.
${DETAIL}`,

    antiquity:`${langNote} Write an EXHAUSTIVE ANTIQUITY section for ${country}. ${base}
Cover from 100,000 BC to 500 AD (or appropriate end date for this region).
Collapsibles with .tl-wrap (8+ entries each):
🦴 Prehistoric Times & First Inhabitants (paleolithic, neolithic, first settlements, tools, religion)
🏺 Bronze Age & First Kingdoms (specific dynasties, rulers, cities, writing systems)
⚔ Conquests & Foreign Dominations (each conquest explained with causes and consequences)
🏛 Architecture & Urban Life (specific buildings, city plans, engineering achievements)
📜 Religion, Writing & Knowledge (specific gods, texts, philosophical schools, scientific discoveries)
👑 Key Rulers of Antiquity (use .lg format, minimum 6 rulers with full bios)
🔱 Decline & Transition (what ended the ancient period here, how it gave way to the next era)
.myth-box for the most important myths and legends of this territory in antiquity.
${DETAIL}`,

    history:`${langNote} Write the COMPLETE HISTORY of ${country} from the end of antiquity to today. ${base}
Each era must have its own collapsible with a detailed .tl-wrap (minimum 8 entries):
📜 Early Medieval (500–1000 AD) — invasions, kingdoms, church, society
⚔ High Medieval (1000–1300) — feudalism, crusades, cities, culture
🏰 Late Medieval (1300–1500) — Black Death impact, wars, political changes
🌍 Early Modern (1500–1700) — Renaissance/Reformation/exploration impact, religious wars
🏭 18th–19th Century — revolution, industry, nationalism, colonial expansion or subjugation  
💥 WWI Era (1900–1918) — causes, involvement, battles, home front, losses
🌑 Interwar & WWII (1918–1945) — crisis, occupation or role, resistance, liberation
🌐 Cold War (1945–1990) — alignment, conflicts, social changes, economic development
📱 Contemporary (1990–2026) — key events, crises, leaders, current situation
For each era: specific dates, named leaders, death tolls for conflicts, social and economic context.
${DETAIL}`,

    politics:`${langNote} Write a COMPREHENSIVE POLITICS & GOVERNANCE section for ${country}. ${base}
<h3 class="sh">System of Government</h3> — constitution details, branches, checks and balances, electoral system
<h3 class="sh">Current Political Landscape</h3> — all major parties, current government, recent election results, political tensions
Collapsibles:
🗳 Electoral System & Recent Elections (results, turnout, controversies)
⚖ Judiciary & Rule of Law (.danger-bar for corruption index, press freedom, rule of law scores with real Transparency International/RSF data)
🏛 Political History Timeline (.tl-wrap 10+ entries: coups, revolutions, key elections, constitutional changes)
🔴 Political Crises & Controversies (every coup, scandal, political assassination, fully detailed)
👩 Women in Politics (representation %, key female leaders, feminist movements, legal rights)
🌍 Foreign Policy & Alliances
Completely uncensored — name corrupt officials, describe repression, list human rights violations.
${DETAIL}`,

    leaders:`${langNote} Write an EXHAUSTIVE LEADERS section for ${country}. ${base}
Include EVERY significant leader in the country's history.
Use .lg format with .sh group headers:
👑 Ancient & Medieval Rulers (all kings, pharaohs, emperors, sultans)
🌍 Colonial Era & Independence Leaders
⚔ Revolutionary & Military Leaders  
🏛 Presidents & Prime Ministers (every single one, no exceptions)
😈 Dictators & Authoritarian Leaders (fully uncensored descriptions of crimes and methods)
👩 Women Leaders & Reformers
For EACH leader: full name and dates, exact title and period, 4-5 sentences covering: background, rise to power, 3 key achievements or decisions, crimes or failures, historical legacy.
${DETAIL}`,

    culture:`${langNote} Write a COMPREHENSIVE CULTURE section for ${country}. ${base}
Collapsibles (each with specific named works, artists, dates):
🎭 Literature & Poetry (name specific authors, works, literary movements, Nobel winners)
🎵 Music (traditional, classical, popular — name specific artists, genres, instruments)
🎬 Cinema & Theatre (key directors, films, theatrical traditions, award winners)
🖼 Visual Arts & Architecture (art movements, named artists, iconic works, museums)
🍽 Cuisine (10+ specific dishes with origins, regional variations, cultural significance)
⚽ Sport (major sports, legendary athletes, World Cup/Olympics results, national teams)
👗 Fashion & Traditional Dress (historical costumes, regional variations, modern designers)
🎪 Festivals & Traditions (specific festivals, dates, origins, rituals)
🌟 Mythology & Folklore (.myth-box for 3+ major myths/legends with full narratives)
📚 Philosophy & Intellectual Life
${DETAIL}`,

    religion:`${langNote} Write a COMPREHENSIVE RELIGION section for ${country}. ${base}
.sg stats: religious demographics with percentages.
For EACH major religion in this country:
<details class="collapse-sec"><summary class="collapse-hdr">✝/☪/✡/🕉 [Religion Name] — [X]% of population</summary>
History of how this religion arrived and spread in ${country}
Specific branches and denominations present (with founding dates)
Role in politics, law and public life
Major religious sites (named, with history)
Key religious figures and leaders
Conflicts and persecutions involving this religion
Current issues and secularisation trends
</details>
🌟 Pre-Abrahamic & Indigenous Beliefs (.myth-box for important traditional beliefs, animism, pre-Islamic/pre-Christian practices)
Religious conflicts and inter-community tensions (fully detailed)
${DETAIL}`,

    celebrities:`${langNote} Write an EXHAUSTIVE FAMOUS FIGURES section for ${country}. ${base}
Include EVERY notable person born in or strongly associated with ${country}.
.cel-g grid, grouped by .sh:
🏛 Historical Figures (before 1800) — rulers, warriors, explorers, philosophers, saints
🔬 Scientists & Inventors — with specific discoveries and dates
🎭 Artists, Writers & Poets — with specific works named
🎵 Musicians & Composers — classical and popular
🎬 Actors & Filmmakers
⚽ Athletes & Sports Champions
🌍 Explorers & Adventurers
⚔ Military Heroes & Resistance Fighters
🏛 Political Leaders & Activists (separate from the Leaders tab — focus on activists, reformers)
👩 Women Who Changed History
For each: 2 compelling sentences with specific dates and achievements. Include controversial figures without censorship.
${DETAIL}`,

    geopolitics:`${langNote} Write a COMPREHENSIVE GEOPOLITICS section for ${country}. ${base}
<h3 class="sh">Strategic Position</h3> — why this country matters geopolitically
.gg grid for: Military Power | Economic Influence | Diplomatic Weight | Regional Role
Collapsibles:
🌐 International Alliances & Treaties (.ab badges: NATO/EU/AU/ASEAN/etc., with dates joined and significance)
⚔ Active Conflicts & Security Threats (.crisis boxes, .cb badges for conflicts)
🤝 Key Bilateral Relations (top 6 most important relationships, explain the stakes of each)
💰 Economic Diplomacy (trade partners, aid relationships, sanctions, Belt & Road)
🗺 Territorial Disputes (every disputed territory, historical context, current status)
🏛 International Organisations (role in UN, regional bodies, contribution or absence)
🔮 Strategic Challenges 2025–2030 (real geopolitical stakes, named threats, scenarios)
Current stakes at national and international level. No political opinion, only factual analysis.
${DETAIL}`,

    wars:`${langNote} Write an ULTRA-COMPLETE WARS & MILITARY HISTORY section for ${country}. ${base}
Include EVERY significant conflict in this country's history.
Collapsibles by era:
⚔ Ancient Wars & Conquests (with .war-g cards for each)
🏰 Medieval Conflicts (sieges, crusades, dynastic wars)
🌍 Colonial Wars & Resistance (both the wars of conquest and the resistance movements)
💥 World War I (causes, specific battles, death toll, home front)
💣 World War II (occupation/resistance/collaboration/liberation — all sides named)
🌐 Cold War Conflicts (civil wars, proxy wars, coups)
🔥 Post-1990 Conflicts (all wars, ethnic cleansing, terrorist attacks)
🚨 Current Situation
Each .war-c: specific dates, named commanders on all sides, exact death toll estimates, tactical description, outcome and consequences.
NOTHING CENSORED — chemical weapons, rape as weapon of war, war crimes, named perpetrators, ICC indictments.
${DETAIL}`,

    crises:`${langNote} Write a COMPREHENSIVE CRISES & HUMANITARIAN DISASTERS section for ${country}. ${base}
NOTHING CENSORED. Use .crisis boxes and collapsibles:
💀 Genocides & Mass Atrocities — every documented case: perpetrators NAMED, methods described, victim groups, timeline, death toll (with range of estimates), international response or inaction, denial politics, trials, convictions
🌾 Famines (natural AND political causes, governmental responsibility explicitly named, death tolls)
👥 Refugees & Displacement (numbers, causes, camp conditions, international response)
🔒 Political Repression (secret police, death squads, torture methods, named perpetrators, disappeared persons)
💸 Economic Collapses (hyperinflation figures, IMF austerity conditions, social consequences)
🌿 Environmental Crises (deforestation rates, pollution data, climate vulnerability)
💣 Terrorism & Insurgencies (all groups, ideology, attacks, body counts, state response)
⚖ Human Rights Violations (HRW and Amnesty key findings, specific named cases)
👩 Women's Rights & Gender-Based Violence (femicide rates, legal status, specific cases)
🚢 Modern Slavery & Trafficking (routes, numbers, industries involved)
⚖ ICC Indictments & War Crimes Trials
${DETAIL}`,

    monuments:`${langNote} Write about the ICONIC MONUMENTS & PLACES of ${country}. ${base}
.bld-g grid with 10-15 monuments: UNESCO sites, palaces, temples, cathedrals, fortresses, ancient ruins, modern landmarks, natural wonders.
Each .bld-c: fitting emoji, full name, 3-4 sentence history (founding date, who built it, historical events that occurred there, current status).
Collapsibles for: UNESCO World Heritage Sites | Natural Wonders | Modern Architecture | Sacred Sites
.books section (4-5 real books on architecture/travel with Amazon links tag atlasmundi-20)
.links: official tourism, UNESCO, virtual tour links
${DETAIL}`,

    books:`${langNote} Write a COMPREHENSIVE BOOKS section for ${country}. ${base}
.books container with .bk-cat dividers (3 books per category minimum):
📜 Prehistory & Antiquity | ⚔ Medieval History | 🏭 Modern History 19th–20th C | 🔥 Wars & Conflicts | 🏛 Politics & Society | 🎭 Culture & Arts | 📖 Literature & Novels set in ${country} | 🌍 Travel & Geography
ALL books REAL, published, verifiable. Each with: real title, real author, 2-sentence description, Amazon link tag atlasmundi-20.`,

    resources:`${langNote} Comprehensive resources for ${country}. ${base}
.links section: Wikipedia, BBC Country Profile, CIA World Factbook, Freedom House, HRW, Amnesty International, UN page, Transparency International, RSF Press Freedom, UNHCR if relevant.
Reliable news sources section (local + international).
5 real documentaries about ${country} with streaming platform.
.books section: History (3), Politics (2), Culture (2), Investigative Journalism (2). Amazon links.`,

    regions:`${langNote} Write EXHAUSTIVE REGIONS & CITIES for ${country}. ${base}
.region-grid for ALL administrative divisions (states/provinces/regions/departments):
Each .region-card: name, historical origin, major cities, economic role, cultural specificity.
Then for each MAJOR CITY, a collapsible:
<details class="collapse-sec"><summary class="collapse-hdr">🏙 [City Name] — population, founded YEAR</summary>
Full founding history and original name
Key historical events (battles, revolutions, massacres, cultural movements — ALL named with dates)
Neighbourhoods and their histories
Cultural institutions (museums, theatres, universities with founding dates)
Economic role past and present
Famous people born there
Current challenges
</details>
${DETAIL}`
  };

  return prompts[tab]||`${langNote} Write comprehensive encyclopaedic content about ${country} for the section: ${tab}. ${base} ${DETAIL}`;
}

function isRateLimited(ip){
  const now=Date.now(), windowMs=3600000;
  const times=(rateLimitMap.get(ip)||[]).filter(t=>now-t<windowMs);
  if(times.length>=RATE_LIMIT)return true;
  times.push(now); rateLimitMap.set(ip,times); return false;
}

export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if(req.method==='OPTIONS')return res.status(200).end();
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  const ip=req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown';
  if(isRateLimited(ip))return res.status(429).json({error:'Too many requests. Please wait.'});
  const{country,tab,lang,newsCountry,...rest}=req.body||{};
  if(!country||!tab)return res.status(400).json({error:'Missing country or tab'});
  const safeCountry=country.slice(0,100).replace(/[<>'"]/g,'');
  const validTabs=['overview','antiquity','history','politics','leaders','culture','monuments','religion','celebrities','geopolitics','wars','crises','books','resources','regions','battle','ticker','news','newsdetail','finance','chat','country_news','eco_detail'];
  if(!validTabs.includes(tab))return res.status(400).json({error:'Invalid tab'});
  const ttl=(tab==='news'||tab==='country_news')?NEWS_CACHE_TTL:CACHE_TTL;
  const cacheKey=`${safeCountry}::${tab}::${lang||'en'}::${newsCountry||''}`;
  const cached=cache.get(cacheKey);
  if(cached&&Date.now()-cached.ts<ttl){
    res.setHeader('X-Cache','HIT');
    const payload=cached.facts?{facts:cached.facts}:cached.newsCards?{newsCards:cached.newsCards}:{html:cached.html};
    return res.status(200).json({...payload,cached:true});
  }
  const apiKey=process.env.ANTHROPIC_API_KEY;
  if(!apiKey)return res.status(500).json({error:'API key not configured. Add ANTHROPIC_API_KEY to Vercel environment variables.'});
  const islandNames=['Hawaii','Philippines','Iceland','Cuba','Jamaica','Taiwan','Madagascar','Sri Lanka','Maldives','Malta','Cyprus','Crete','Sicily','Corsica','Fiji','Easter Island','Tahiti','Zanzibar','Cape Verde','Réunion','Mauritius','Seychelles','Okinawa','Timor-Leste','Greenland','Guam','Martinique','Comoros','Vanuatu','Solomon Islands','Samoa','Tonga','Papua New Guinea','New Zealand','Australia','Indonesia','Puerto Rico','Haiti'];
  const ancientNames=['Byzantine Empire','Roman Empire','Ottoman Empire','Mongol Empire','Aztec Empire','Inca Empire','Carthage','Ancient Egypt','Persian Empire','Holy Roman Empire'];
  const prompt=getPrompt(tab,safeCountry,islandNames.includes(safeCountry),ancientNames.includes(safeCountry),{...rest,lang,newsCountry});
  try{
    const response=await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01'},
      body:JSON.stringify({
        model:'claude-sonnet-4-5',
        max_tokens:4000,
        system:SYSTEM_PROMPT,
        messages:[{role:'user',content:prompt}]
      })
    });
    if(!response.ok){
      const err=await response.json().catch(()=>({}));
      console.error('Anthropic error:',response.status,err);
      return res.status(502).json({error:`API error: ${err?.error?.message||response.statusText}`});
    }
    const data=await response.json();
    const rawText=data.content.map(b=>b.text||'').join('');
    let responseData={html:rawText,cached:false};
    if(tab==='ticker'){
      try{const p=JSON.parse(rawText.replace(/```json|```/g,'').trim());responseData={facts:p.facts,cached:false};}
      catch(e){responseData={facts:[],cached:false};}
    } else if(tab==='news'||tab==='country_news'){
      try{const p=JSON.parse(rawText.replace(/```json|```/g,'').trim());responseData={newsCards:p.newsCards,cached:false};}
      catch(e){responseData={newsCards:[],cached:false};}
    } else if(tab==='chat'){
      responseData={html:rawText,cached:false};
    }
    cache.set(cacheKey,{...responseData,ts:Date.now()});
    console.log(`[Atlas v4.1] ${safeCountry}/${tab}/${lang||'en'} | ${data.usage?.output_tokens} tokens`);
    return res.status(200).json(responseData);
  }catch(err){
    console.error('Handler error:',err);
    return res.status(500).json({error:'Internal server error. Please try again.'});
  }
}
