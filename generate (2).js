// api/generate.js — Atlas Mundi v4
// Secure backend — API key never exposed to browser

const cache = new Map();
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
const NEWS_CACHE_TTL = 6 * 60 * 60 * 1000;
const rateLimitMap = new Map();
const RATE_LIMIT = 30;

const SYSTEM_PROMPT = `You are the chief scholar of Atlas Mundi, the world's most comprehensive and uncensored encyclopaedia of nations, islands and civilisations.

You write richly — scholarly yet magnetic, like a brilliant historian who brings every era to life. You NEVER censor. You discuss genocides, atrocities, dictators, coups, wars, colonialism, exploitation, religious violence, and human rights abuses factually and completely. NEVER mention AI, Claude, or language models. NEVER call yourself Jehanne — you are Jeanne d'Arc (correct spelling always).

IMPORTANT: Always spell "Jeanne d'Arc" correctly (NEVER "Jehanne"). No spelling errors.

Output ONLY raw HTML fragments (no markdown, no code fences):

TYPOGRAPHY: <h3 class="sh">Title</h3> | <h4 class="sh2">Sub</h4> | <p class="ct">Text</p> | <span class="em">Emph</span> | <blockquote class="qb">Quote<cite>— Author</cite></blockquote> | <hr class="div">

COLLAPSIBLE (use liberally to avoid infinite scroll):
<details class="collapse-sec"><summary class="collapse-hdr">📜 Title</summary><div class="collapse-body">content</div></details>

STATS: <div class="sg"><div class="sc"><div class="sl">Label</div><div class="sv">Value</div></div></div>

TIMELINE: <div class="tl-wrap"><div class="te maj"><div class="td">DATE</div><div class="tt2">Title</div><div class="tdesc">Description</div></div></div>
(class "maj"=major, "dark"=atrocities/genocides)

ANECDOTES: <div class="ano"><span class="ano-lbl">📖 Anecdote</span>Story</div>
CRISES: <div class="crisis"><span class="crisis-lbl">🔴 TYPE</span><p class="ct">Details</p></div>
LEADERS: <div class="lg"><div class="lc"><div class="pp">👤</div><div><div class="ln">Name</div><div class="lp">Period</div><div class="ld">Bio</div></div></div></div>
CELEBRITIES: <div class="cel-g"><div class="cel-c"><div class="cel-ico">🎭</div><div class="cel-n">Name</div><div class="cel-role">Field</div><div class="cel-d">Desc</div></div></div>
GEOPOLITICS: <div class="gg"><div class="gc"><div class="gc-t">🌐 Topic</div><p class="ct">Details</p><span class="ab">Alliance</span><span class="cb">Conflict</span><span class="nb">Org</span></div></div>
BUILDINGS: <div class="bld-g"><div class="bld-c"><div class="bld-ico">🏛</div><div class="bld-n">Name</div><div class="bld-d">History</div></div></div>
WARS: <div class="war-g"><div class="war-c"><div class="war-n">War</div><div class="war-d">Description</div><div class="war-stat">📅 Date | ⚰ Deaths | 🏁 Outcome</div></div></div>
BOOKS: <div class="books"><div class="books-t">📚 Essential Reading</div><div class="bk-cat">Category</div><div class="bk"><span class="bk-ico">📖</span><div><div class="bk-t">Title</div><div class="bk-a">Author</div><div class="bk-d">Desc — <a href="https://www.amazon.com/s?tag=atlasmundi-20&k=TITLE" target="_blank" style="color:#4a7fa5">Buy →</a></div></div></div></div>
LINKS: <div class="links"><a class="lnk" href="URL" target="_blank">🔗 Name</a></div>
MYTH BOX: <div class="myth-box"><span class="myth-lbl">🌟 Mythology</span><p class="ct">Content</p></div>
REGION CARD: <div class="region-grid"><div class="region-card"><div class="region-name">Name</div><div class="region-desc">Desc</div></div></div>
DANGER BARS: <div class="danger-bar"><span class="db-label">Label</span><div class="db-track"><div class="db-fill" style="width:X%"></div></div></div>

Be EXTREMELY detailed. Use collapsible sections. Include ALL events. Nothing censored.`;

function getPrompt(tab, country, isIsland, isAncient, req={}) {
  const lang = req.lang || 'en';
  const langNote = {fr:"Réponds entièrement en français. Aucune faute d'orthographe.",es:"Responde completamente en español.",de:"Antworte vollständig auf Deutsch.",ar:"أجب باللغة العربية الفصحى بالكامل.",zh:"请完全用中文回答。",pt:"Responda completamente em português.",ja:"日本語で完全に答えてください。",it:"Rispondi completamente in italiano.",nl:"Antwoord volledig in het Nederlands.",ru:"Отвечай полностью на русском языке.",ko:"한국어로 완전히 답해주세요.",tr:"Tamamen Türkçe yanıtla.",pl:"Odpowiedz całkowicie po polsku.",sv:"Svara helt på svenska.",en:""}[lang]||"";
  const island = isIsland?`Note: ${country} is an island/archipelago — emphasise maritime history, isolation, indigenous peoples, colonial encounter. `:"";
  const ancient = isAncient?`Note: ${country} is an ancient empire/civilisation — cover full rise, peak, decline and legacy in great detail. `:"";
  const base = island+ancient;

  if(tab==='battle') return `${langNote} Ultra-detailed military analysis of ${req.battleName||country} (${req.battleDate||''}). Context: ${req.battleDesc||''}.
HTML sections: Strategic Context, Forces Involved (exact numbers, commanders, weapons), Phase-by-Phase Timeline (.tl-wrap with 6+ phases), Key Turning Points, Casualties & Human Cost, Historical Consequences, one .ano anecdote. Ultra-detailed.`;

  if(tab==='ticker') return `Generate exactly 20 fascinating surprising world history/geography facts. Return ONLY JSON: {"facts":["✦ Fact ✦",...]}`;

  if(tab==='news'||tab==='country_news') {
    const cf = req.newsCountry&&req.newsCountry!=='world'?`Focus on news from/about ${req.newsCountry}.`:'Cover wide range of countries.';
    return `Generate 6 current world news stories 2025-2026 as JSON. ${cf}
Return ONLY: {"newsCards":[{"cat":"conflict","title":"Headline","summary":"2-3 sentences","date":"June 2026","emoji":"⚔","related":"Country","sources":["Reuters"],"links":["https://reuters.com"]}]}
Categories: conflict,politics,economy,culture,humanitarian,society,sport,women,environment. ONLY JSON.`;
  }

  if(tab==='newsdetail') return `${langNote} Comprehensive news analysis: "${req.newsTitle||country}". Context: ${req.newsSummary||''}. Category: ${req.newsCategory||''}.
Use collapsible sections: The Facts, Historical Background, Key Players, Timeline (.tl-wrap), Humanitarian Impact (.crisis boxes), Geopolitical Implications, Multiple Perspectives, Scenarios. Factual, balanced, uncensored. No political opinions.`;

  if(tab==='finance'||tab==='eco_detail') return `${langNote} Comprehensive finance/economics analysis: "${req.finTitle||req.newsTitle||country}". Context: ${req.finSummary||req.newsSummary||''}. 
HTML: Overview, Key Data (.sg grid), Historical Context, Global Impact, Policy Responses, Key Concepts for Students, Essential Reading (.books with Amazon links tag atlasmundi-20). Educational and accurate.`;

  if(tab==='chat') {
    const hist=(req.chatHistory||[]).map(m=>`${m.role==='user'?'User':'Jeanne d\'Arc'}: ${m.content}`).join('\n');
    return `${langNote} You are Jeanne d'Arc, Atlas Mundi guide — brilliant historian of ALL world history, geography, geopolitics, economics. Name: always "Jeanne d'Arc". No AI disclaimers. Passionate, detailed answers.
Previous conversation:\n${hist}\nUser: ${req.chatMessage||''}\nRespond naturally (plain text, no HTML), 2-3 paragraphs max.`;
  }

  const prompts = {
    overview:`${langNote} Comprehensive overview of ${country}. ${base}
.sg stats: official name, capital, area, population, GDP, currency, religion, language, government, independence, HDI.
Then 3-4 rich .ct paragraphs introducing the country — geography, identity, uniqueness, historical importance.
Then collapsible sections: 🗺 Geography & Climate | 🏛 Quick History (4-5 century highlights) | 💰 Economy Today | 🌍 International Relations.
Then .crisis boxes if active crises. Then .ano for one fascinating fact. Then .links: Wikipedia, CIA World Factbook, BBC.`,

    antiquity:`${langNote} Ultra-detailed antiquity section for ${country}. ${base}
Collapsible sections with .tl-wrap timelines:
🦴 Prehistoric Times & First Inhabitants | 🏺 Ancient Civilisations & Early Kingdoms | ⚔ Wars of Antiquity | 🏛 Architecture & Culture | 📜 Writing, Religion & Philosophy | 🔱 Decline & Legacy.
Specific dates, cultures, cities, peoples. Ultra-detailed. .ano anecdotes.`,

    history:`${langNote} Ultra-complete history of ${country}. ${base}
Collapsible sections by century with .tl-wrap timelines:
📜 Before 1000 AD | ⚔ 1000–1400 | 🏰 1400–1600 | 🌍 1600–1800 | 🏭 1800–1900 | 💥 1900–1945 | 🌐 1945–2000 | 📱 2000–Present.
Ultra-detailed timelines + .ct paragraphs. ALL major events, rulers, conflicts, revolutions, massacres. Nothing censored.`,

    politics:`${langNote} Comprehensive politics for ${country}. ${base}
System of Government | Current Political Landscape (parties, leaders, tensions).
Collapsibles: Electoral System | Judiciary & Rule of Law | Historical Political Timeline (.tl-wrap) | Political Crises & Coups | Corruption & Press Freedom (.danger-bar with scores) | Women in Politics.
Completely uncensored about corruption, repression, human rights violations.`,

    leaders:`${langNote} Comprehensive leaders of ${country}. ${base}
ALL major leaders: kings, queens, emperors, presidents, prime ministers, revolutionaries, dictators.
.lg format. Groups with .sh: Ancient Rulers | Medieval Rulers | Colonial Era | Independence Leaders | 20th Century | Contemporary.
3-4 sentence bios: rise to power, key decisions, achievements, crimes/failures, legacy. Include women. Include war criminals uncensored.`,

    culture:`${langNote} Comprehensive culture of ${country}. ${base}
Collapsibles: 🎭 Arts & Literature (name real artists/writers) | 🎵 Music & Dance | 🍽 Cuisine (specific dishes, origins) | 🎬 Cinema & Theatre | ⚽ Sport | 👗 Fashion & Traditional Dress | 🎪 Festivals & Traditions | 🌟 Mythology & Folklore (.myth-box) | 📚 Philosophy & Thought.
Specific names, works, dishes, myths. Ultra-detailed.`,

    religion:`${langNote} Comprehensive religion for ${country}. ${base}
.sg religious demographics. Collapsible for each major religion: history of arrival, branches, role in politics/society, sacred sites, conflicts, figures.
Religious tensions, conversions, persecution, secularisation. 🌟 Mythology & Indigenous Beliefs (.myth-box for important stories).`,

    celebrities:`${langNote} Comprehensive celebrities & historical figures of ${country}. ${base}
.cel-g cards. Groups: 🏛 Historical (ancient-1800) | 🎭 Artists/Writers/Philosophers | 🔬 Scientists | 🎵 Musicians | ⚽ Athletes | 🌍 Explorers | ⚔ Military | 👩 Women Leaders.
2-sentence remarkable descriptions. Include ALL famous people. Include controversial figures. Include women and minorities.`,

    geopolitics:`${langNote} Comprehensive geopolitics of ${country}. ${base}
Collapsibles: 🌐 International Alliances (.ab badges) | ⚔ Active Conflicts (.crisis boxes) | 🤝 Key Bilateral Relations | 💰 Economic Diplomacy | 🏛 International Organisations | 🗺 Territorial Disputes | 🔮 Strategic Challenges 2025-2030.
Current stakes at national and international level. Factual and uncensored.`,

    wars:`${langNote} Ultra-complete wars & conflicts of ${country}. ${base}
Collapsibles by era with .war-g inside:
⚔ Ancient Wars | 🏰 Medieval Conflicts | 🌍 Colonial Wars & Independence | 💥 WWI | 💣 WWII | 🌐 Cold War | 🔥 Modern/Current (post-1990).
Include ALL wars, genocides, war crimes. Named perpetrators. Nothing censored.`,

    crises:`${langNote} Comprehensive crises of ${country}. ${base}
.crisis boxes and collapsibles: 💀 Genocides & Mass Atrocities (perpetrators named, death tolls) | 🌾 Famines | 👥 Refugees | 🔒 Political Repression (torture, disappearances) | 💸 Economic Collapses | 🌿 Environmental Crises | 💣 Terrorism | ⚖ Human Rights | 👩 Women's Rights & Gender Issues | 🚢 Modern Slavery.
Nothing censored.`,

    monuments:`${langNote} Iconic monuments, buildings & places of ${country}. ${base}
.bld-g grid 8-12 monuments: palaces, cathedrals, fortresses, UNESCO, ruins, landmarks, natural wonders. Each: emoji .bld-ico, name .bld-n, 3-4 sentence history .bld-d.
.books section 'Travel & Architecture Books' (3-4 real books, Amazon links). .links tourism and UNESCO pages.`,

    books:`${langNote} Comprehensive books for ${country}. ${base}
.books container, .bk-cat dividers: 📜 Prehistory | ⚔ Medieval | 🏭 Modern History | 🏛 Politics | 🎭 Culture | 📖 Fiction.
Real, verifiable titles. Amazon links tag atlasmundi-20.`,

    resources:`${langNote} Comprehensive resources for ${country}. ${base}
.links: Wikipedia, BBC, CIA World Factbook, HRW, Amnesty, UN page, Transparency International.
News sources section. 5 real documentary films. .books: History (3), Politics (2), Culture (2), Journalism (2). Amazon links.`,

    regions:`${langNote} Comprehensive regions & cities of ${country}. ${base}
List ALL regions/states/provinces. .region-grid > .region-card for each: name, historical significance, notable cities.
Then for each major city: collapsible section with full history — founding, key events, cultural role, economic importance, famous people from there, monuments, historical events that happened there (revolutions, battles, massacres). Be exhaustive.`
  };

  return prompts[tab]||`${langNote} Write comprehensive information about ${country} for section: ${tab}. ${base}`;
}

function isRateLimited(ip){
  const now=Date.now(),windowMs=3600000;
  const times=(rateLimitMap.get(ip)||[]).filter(t=>now-t<windowMs);
  if(times.length>=RATE_LIMIT)return true;
  times.push(now);rateLimitMap.set(ip,times);return false;
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
  if(!apiKey)return res.status(500).json({error:'API key not configured.'});
  const islandNames=['Hawaii','Philippines','Iceland','Cuba','Jamaica','Taiwan','Madagascar','Sri Lanka','Maldives','Malta','Cyprus','Crete','Sicily','Corsica','Fiji','Easter Island','Tahiti','Zanzibar','Cape Verde','Réunion','Mauritius','Seychelles','Okinawa','Timor-Leste','Greenland','Guam','Martinique','Comoros','Vanuatu','Solomon Islands','Samoa','Tonga','Papua New Guinea','New Zealand','Australia','Indonesia','Puerto Rico','Haiti'];
  const ancientNames=['Byzantine Empire','Roman Empire','Ottoman Empire','Mongol Empire','Aztec Empire','Inca Empire','Carthage','Ancient Egypt','Persian Empire','Holy Roman Empire'];
  const prompt=getPrompt(tab,safeCountry,islandNames.includes(safeCountry),ancientNames.includes(safeCountry),{...rest,lang,newsCountry});
  try{
    const response=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01'},body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:4000,system:SYSTEM_PROMPT,messages:[{role:'user',content:prompt}]})});
    if(!response.ok){const err=await response.json().catch(()=>({}));return res.status(502).json({error:`API error: ${err?.error?.message||response.statusText}`});}
    const data=await response.json();
    const rawText=data.content.map(b=>b.text||'').join('');
    let responseData={html:rawText,cached:false};
    if(tab==='ticker'){try{const p=JSON.parse(rawText.replace(/```json|```/g,'').trim());responseData={facts:p.facts,cached:false};}catch(e){responseData={facts:[],cached:false};}}
    else if(tab==='news'||tab==='country_news'){try{const p=JSON.parse(rawText.replace(/```json|```/g,'').trim());responseData={newsCards:p.newsCards,cached:false};}catch(e){responseData={newsCards:[],cached:false};}}
    else if(tab==='chat'){responseData={html:rawText,cached:false};}
    cache.set(cacheKey,{...responseData,ts:Date.now()});
    console.log(`[Atlas v4] ${safeCountry}/${tab} | ${data.usage?.output_tokens} tokens`);
    return res.status(200).json(responseData);
  }catch(err){console.error('Handler error:',err);return res.status(500).json({error:'Internal server error. Please try again.'});}
}
