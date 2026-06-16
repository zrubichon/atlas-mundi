// api/pregenerator.js
// Call this endpoint to pre-generate all country pages
// GET /api/pregenerator?secret=VOTRE_SECRET&country=France&tab=overview
// GET /api/pregenerator?secret=VOTRE_SECRET&batch=europe&start=0

const COUNTRIES_BY_REGION = {
  europe: ["France","Germany","United Kingdom","Italy","Spain","Poland","Netherlands","Belgium","Greece","Portugal","Sweden","Norway","Denmark","Finland","Austria","Switzerland","Czech Republic","Romania","Hungary","Ukraine","Russia","Serbia","Croatia","Bulgaria","Slovakia","Slovenia","Lithuania","Latvia","Estonia","Ireland","Iceland","Kosovo","North Macedonia","Moldova","Belarus","Albania","Bosnia","Montenegro","Luxembourg","Malta","Cyprus","Monaco","Liechtenstein","San Marino","Vatican","Andorra","Georgia"],
  americas: ["United States","Brazil","Mexico","Argentina","Colombia","Chile","Peru","Venezuela","Ecuador","Bolivia","Paraguay","Uruguay","Cuba","Haiti","Dominican Republic","Guatemala","Honduras","El Salvador","Nicaragua","Costa Rica","Panama","Jamaica","Trinidad and Tobago","Guyana","Suriname","Barbados","Bahamas","Saint Lucia","Grenada","Saint Vincent","Antigua and Barbuda","Saint Kitts and Nevis","Canada","Belize","French Guiana","Puerto Rico","Falkland Islands"],
  africa: ["Nigeria","Ethiopia","Egypt","Tanzania","Kenya","South Africa","Uganda","Sudan","Algeria","Morocco","Ghana","Mozambique","Madagascar","Cameroon","Angola","Zimbabwe","Mali","Burkina Faso","Malawi","Zambia","Senegal","Somalia","Rwanda","Chad","Guinea","South Sudan","Benin","Tunisia","Libya","Sierra Leone","Togo","Eritrea","Central African Republic","Liberia","Republic of the Congo","Congo","Mauritania","Gabon","Namibia","Botswana","Lesotho","Gambia","Guinea-Bissau","Equatorial Guinea","Djibouti","Eswatini","Comoros","Cape Verde","Mauritius","Sao Tome and Principe","Burundi","Niger","Côte d'Ivoire","Western Sahara"],
  asia: ["China","India","Japan","South Korea","Indonesia","Pakistan","Bangladesh","Vietnam","Philippines","Thailand","Myanmar","Malaysia","North Korea","Sri Lanka","Kazakhstan","Uzbekistan","Afghanistan","Nepal","Tajikistan","Kyrgyzstan","Turkmenistan","Mongolia","Laos","Cambodia","Singapore","Brunei","Bhutan","Maldives","Timor-Leste","Taiwan","Hong Kong"],
  mena: ["Saudi Arabia","Iran","Turkey","Iraq","Syria","UAE","Israel","Jordan","Lebanon","Palestine","Yemen","Oman","Qatar","Kuwait","Bahrain","Egypt","Libya","Tunisia","Algeria","Morocco"],
  oceania: ["Australia","New Zealand","Papua New Guinea","Fiji","Solomon Islands","Vanuatu","Samoa","Tonga","Kiribati","Micronesia","Palau","Marshall Islands","Nauru","Tuvalu","New Caledonia"]
};

const PRIORITY_TABS = ['overview','history','politics','leaders','culture','wars','geopolitics'];
const ALL_TABS = ['overview','antiquity','history','politics','leaders','culture','monuments','religion','celebrities','geopolitics','wars','crises','regions','books','resources'];

module.exports = async function handler(req, res) {
  const secret = req.query.secret || req.body?.secret;
  if (secret !== process.env.PREGEN_SECRET && secret !== 'atlas2026') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { country, tab, batch, start = 0, lang = 'en', priority = 'true' } = req.query;
  const tabs = priority === 'true' ? PRIORITY_TABS : ALL_TABS;

  // Single country + tab
  if (country && tab) {
    const result = await generateAndStore(country, tab, lang);
    return res.status(200).json(result);
  }

  // Single country all tabs
  if (country) {
    const results = [];
    for (const t of tabs) {
      const r = await generateAndStore(country, t, lang);
      results.push({ tab: t, ...r });
      await delay(2000);
    }
    return res.status(200).json({ country, results });
  }

  // Batch by region
  if (batch && COUNTRIES_BY_REGION[batch]) {
    const countries = COUNTRIES_BY_REGION[batch].slice(Number(start), Number(start) + 3);
    const results = [];
    for (const c of countries) {
      for (const t of ['overview', 'history']) {
        const r = await generateAndStore(c, t, lang);
        results.push({ country: c, tab: t, ...r });
        await delay(3000);
      }
    }
    const nextStart = Number(start) + 3;
    const hasMore = nextStart < COUNTRIES_BY_REGION[batch].length;
    return res.status(200).json({
      processed: countries,
      results,
      next: hasMore ? `/api/pregenerator?secret=${secret}&batch=${batch}&start=${nextStart}` : null,
      remaining: hasMore ? COUNTRIES_BY_REGION[batch].length - nextStart : 0
    });
  }

  // Status
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
  if (SUPABASE_URL && SUPABASE_KEY) {
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/pages?select=cache_key&limit=1000`,
        { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } });
      const pages = await r.json();
      return res.status(200).json({
        stored_pages: pages.length,
        total_possible: Object.values(COUNTRIES_BY_REGION).flat().length * ALL_TABS.length,
        regions: Object.fromEntries(Object.entries(COUNTRIES_BY_REGION).map(([k,v])=>[k,v.length])),
        instructions: {
          single: '/api/pregenerator?secret=atlas2026&country=France&tab=overview',
          batch_europe: '/api/pregenerator?secret=atlas2026&batch=europe&start=0',
          batch_americas: '/api/pregenerator?secret=atlas2026&batch=americas&start=0',
          batch_africa: '/api/pregenerator?secret=atlas2026&batch=africa&start=0',
          batch_asia: '/api/pregenerator?secret=atlas2026&batch=asia&start=0',
        }
      });
    } catch(e) {}
  }
  return res.status(200).json({ message: 'Pre-generator ready', usage: '?secret=atlas2026&batch=europe' });
};

async function generateAndStore(country, tab, lang) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

  const cacheKey = `${country}::${tab}::${lang}::`;

  // Check if already in Supabase
  if (SUPABASE_URL && SUPABASE_KEY) {
    try {
      const check = await fetch(`${SUPABASE_URL}/rest/v1/pages?cache_key=eq.${encodeURIComponent(cacheKey)}&select=id`,
        { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } });
      const existing = await check.json();
      if (existing?.length > 0) return { status: 'already_cached', country, tab };
    } catch(e) {}
  }

  // Generate
  try {
    const r = await fetch(`https://${process.env.VERCEL_URL||'atlas-mundi.vercel.app'}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ country, tab, lang })
    });
    const d = await r.json();
    return { status: d.cached ? 'was_cached' : 'generated', country, tab, tokens: d.tokens };
  } catch(e) {
    return { status: 'error', error: e.message, country, tab };
  }
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
