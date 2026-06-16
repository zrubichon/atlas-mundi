// api/pregenerator.js — Fixed version
// Calls generate.js directly instead of via HTTP

const generateHandler = require('./generate.js');

const COUNTRIES_BY_REGION = {
  europe: ["France","Germany","United Kingdom","Italy","Spain","Poland","Netherlands","Belgium","Greece","Portugal","Sweden","Norway","Denmark","Finland","Austria","Switzerland","Czech Republic","Romania","Hungary","Ukraine","Russia","Serbia","Croatia","Bulgaria","Slovakia","Slovenia","Lithuania","Latvia","Estonia","Ireland","Iceland","Kosovo","North Macedonia","Moldova","Belarus","Albania","Bosnia","Montenegro","Luxembourg","Malta","Cyprus","Monaco","Liechtenstein","San Marino","Vatican","Andorra","Georgia"],
  americas: ["United States","Brazil","Mexico","Argentina","Colombia","Chile","Peru","Venezuela","Ecuador","Bolivia","Paraguay","Uruguay","Cuba","Haiti","Dominican Republic","Guatemala","Honduras","El Salvador","Nicaragua","Costa Rica","Panama","Jamaica","Trinidad and Tobago","Guyana","Suriname","Barbados","Bahamas","Saint Lucia","Grenada","Saint Vincent","Antigua and Barbuda","Saint Kitts and Nevis","Canada","Belize","French Guiana","Puerto Rico"],
  africa: ["Nigeria","Ethiopia","Egypt","Tanzania","Kenya","South Africa","Uganda","Sudan","Algeria","Morocco","Ghana","Mozambique","Madagascar","Cameroon","Angola","Zimbabwe","Mali","Burkina Faso","Malawi","Zambia","Senegal","Somalia","Rwanda","Chad","Guinea","South Sudan","Benin","Tunisia","Libya","Sierra Leone","Togo","Eritrea","Central African Republic","Liberia","Republic of the Congo","Congo","Mauritania","Gabon","Namibia","Botswana","Lesotho","Gambia","Guinea-Bissau","Djibouti","Eswatini","Comoros","Cape Verde","Mauritius","Burundi","Niger"],
  asia: ["China","India","Japan","South Korea","Indonesia","Pakistan","Bangladesh","Vietnam","Philippines","Thailand","Myanmar","Malaysia","North Korea","Sri Lanka","Kazakhstan","Uzbekistan","Afghanistan","Nepal","Tajikistan","Kyrgyzstan","Turkmenistan","Mongolia","Laos","Cambodia","Singapore","Brunei","Bhutan","Maldives","Timor-Leste","Taiwan"],
  mena: ["Saudi Arabia","Iran","Turkey","Iraq","Syria","UAE","Israel","Jordan","Lebanon","Palestine","Yemen","Oman","Qatar","Kuwait","Bahrain","Tunisia","Algeria","Morocco","Libya"],
  oceania: ["Australia","New Zealand","Papua New Guinea","Fiji","Solomon Islands","Vanuatu","Samoa","Tonga","Kiribati","Palau","Marshall Islands","Nauru","Tuvalu","New Caledonia"]
};

const PRIORITY_TABS = ['overview','history','politics','leaders','culture'];

module.exports = async function handler(req, res) {
  const secret = req.query.secret;
  if (secret !== 'atlas2026' && secret !== process.env.PREGEN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { country, tab, batch, lang = 'en' } = req.query;
  const start = parseInt(req.query.start || '0');

  // Single page generation
  if (country && tab) {
    const result = await generatePage(country, tab, lang);
    return res.status(200).json(result);
  }

  // Single country - all priority tabs
  if (country) {
    const results = [];
    for (const t of PRIORITY_TABS) {
      const r = await generatePage(country, t, lang);
      results.push(r);
      await sleep(1500);
    }
    return res.status(200).json({ country, tabs_generated: results.length, results });
  }

  // Batch by region
  if (batch && COUNTRIES_BY_REGION[batch]) {
    const list = COUNTRIES_BY_REGION[batch];
    const chunk = list.slice(start, start + 2); // 2 countries at a time
    const results = [];

    for (const c of chunk) {
      for (const t of ['overview', 'history']) {
        const r = await generatePage(c, t, lang);
        results.push(r);
        await sleep(2000);
      }
    }

    const nextStart = start + 2;
    const hasMore = nextStart < list.length;

    return res.status(200).json({
      batch,
      processed: chunk,
      results,
      progress: `${Math.min(nextStart, list.length)}/${list.length}`,
      next: hasMore
        ? `/api/pregenerator?secret=${secret}&batch=${batch}&start=${nextStart}&lang=${lang}`
        : null,
      remaining: hasMore ? list.length - nextStart : 0,
      message: hasMore
        ? `✅ Done ${chunk.join(', ')}. Copy the "next" URL to continue.`
        : `✅ Batch "${batch}" COMPLETE! All ${list.length} countries processed.`
    });
  }

  // Status check
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
  let stored = 0;
  if (SUPABASE_URL && SUPABASE_KEY) {
    try {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/pages?select=id`,
        { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
      );
      const data = await r.json();
      stored = Array.isArray(data) ? data.length : 0;
    } catch(e) {}
  }

  return res.status(200).json({
    status: 'ready',
    stored_pages: stored,
    total_countries: Object.values(COUNTRIES_BY_REGION).flat().length,
    instructions: {
      europe: `/api/pregenerator?secret=atlas2026&batch=europe&start=0`,
      americas: `/api/pregenerator?secret=atlas2026&batch=americas&start=0`,
      africa: `/api/pregenerator?secret=atlas2026&batch=africa&start=0`,
      asia: `/api/pregenerator?secret=atlas2026&batch=asia&start=0`,
      mena: `/api/pregenerator?secret=atlas2026&batch=mena&start=0`,
      oceania: `/api/pregenerator?secret=atlas2026&batch=oceania&start=0`,
      single: `/api/pregenerator?secret=atlas2026&country=France&tab=overview`
    }
  });
};

async function generatePage(country, tab, lang) {
  // Create mock req/res to call generate directly
  const mockReq = {
    method: 'POST',
    headers: { 'x-forwarded-for': 'pregenerator' },
    body: { country, tab, lang },
    socket: { remoteAddress: 'pregenerator' }
  };

  return new Promise((resolve) => {
    const mockRes = {
      _status: 200,
      _data: null,
      setHeader() {},
      status(code) { this._status = code; return this; },
      json(data) {
        this._data = data;
        resolve({
          country, tab,
          status: this._status === 200 ? (data.cached ? 'already_cached' : 'generated') : 'error',
          cached: data.cached || false,
          error: data.error || null
        });
      },
      end() { resolve({ country, tab, status: 'empty' }); }
    };
    try {
      generateHandler(mockReq, mockRes);
    } catch(e) {
      resolve({ country, tab, status: 'error', error: e.message });
    }
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
