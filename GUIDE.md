# 🗺 Atlas Mundi — Complete Deployment Guide

## Architecture
```
Browser (index.html)
    │  POST /api/generate {country, tab}
    ▼
Vercel Edge Function (api/generate.js)   ← Your API key is SECRET here
    │
    ├── Check cache (7-day memory cache)
    │       HIT  → return instantly, $0 cost
    │       MISS ↓
    ▼
Anthropic Claude API
    │
    └── Store in cache → return HTML to browser
```

## File Structure
```
atlas-mundi/
├── vercel.json          ← Vercel routing config
├── package.json         ← Project metadata
├── api/
│   └── generate.js      ← Backend (API key lives here, NEVER exposed)
└── public/
    └── index.html       ← Frontend (the atlas interface)
```

---

## STEP 1 — Create GitHub Account & Repository

1. Go to https://github.com and create a free account
2. Click "New Repository"
3. Name it: `atlas-mundi`
4. Set to **Public** (required for Vercel free tier)
5. Click "Create repository"
6. Upload your 4 files maintaining the folder structure above

**Quick upload method:**
- Click "Add file" → "Upload files"
- Drag and drop all files
- Commit changes

---

## STEP 2 — Create Vercel Account & Deploy

1. Go to https://vercel.com
2. Sign up with your GitHub account (one click)
3. Click "New Project"
4. Import your `atlas-mundi` repository
5. Click "Deploy" — Vercel auto-detects everything

Your site will be live at: `https://atlas-mundi.vercel.app`

---

## STEP 3 — Add Your Anthropic API Key (CRITICAL)

**Never put your API key in the HTML file — always in Vercel environment variables.**

1. In Vercel dashboard → your project → "Settings"
2. Click "Environment Variables"
3. Add:
   - Name: `ANTHROPIC_API_KEY`
   - Value: `sk-ant-api03-...` (your key from console.anthropic.com)
   - Environment: Production + Preview + Development ✓
4. Click "Save"
5. Go to "Deployments" → click "Redeploy" to apply

---

## STEP 4 — Get Your Anthropic API Key

1. Go to https://console.anthropic.com
2. Create account
3. Go to "API Keys" → "Create Key"
4. Copy the key (starts with `sk-ant-`)
5. **Important:** Set a spending limit!
   - Go to "Billing" → "Usage Limits"
   - Set monthly limit to $20-30 to start
   - You'll get email alerts before hitting limits

---

## STEP 5 — Connect a Custom Domain (Optional)

### Buy a domain:
- https://www.namecheap.com (cheapest, ~$10/year)
- https://www.ovh.com (French support, ~$12/year)
- Suggested names: atlasmundi.com, worldatlas.app, explorerlatlas.com

### Connect to Vercel:
1. In Vercel → your project → "Settings" → "Domains"
2. Type your domain name → "Add"
3. Vercel gives you 2 DNS records (Type A and CNAME)
4. In Namecheap → "Manage" your domain → "Advanced DNS"
5. Add those 2 records
6. Wait 1-24 hours → your domain is live with HTTPS! ✓

---

## MONETISATION ROADMAP

### Phase 1 — Launch (Month 1-3) — FREE
- Launch completely free, no registration
- Goal: build audience, get feedback, fix bugs
- Cost: ~$5-15/month API costs if low traffic

### Phase 2 — First Revenue (Month 2+)

**Amazon Affiliate Links** (already in the code!)
- Register at: https://affiliate-program.amazon.com
- Get your affiliate tag (e.g., `atlasmundi-20`)
- Replace `atlasmundi-20` in api/generate.js with your real tag
- Every book click that leads to a purchase = 3-8% commission
- 0 extra work, passive income from day 1

**Ko-fi / Buy Me a Coffee** (already in the code!)
- Register at: https://ko-fi.com
- Set up your page (takes 10 minutes)
- Replace the Ko-fi link in index.html with your real page
- Visitors who love the atlas can donate €3-5
- 0% fees on Ko-fi (Stripe takes 1.5% + €0.25)

### Phase 3 — Freemium (Month 4-6)

Once you have 500+ daily visitors:

**Stripe Payment Integration:**
- Register at: https://stripe.com (free to start, 1.5% + €0.25 per transaction)
- Free tier: Overview + History tabs only
- Premium (€4.99/month): All 12 tabs, all countries, PDF export
- Expected revenue at 1000 users with 5% conversion: €250/month

### Phase 4 — Scale (Month 6+)

**Google AdSense:** (requires 1000+ monthly visitors)
- Apply at: https://adsense.google.com
- Non-intrusive banner ads in sidebar
- ~€2-5 per 1000 visitors (RPM)
- 10,000 visitors/month = €20-50 from ads

**Educational Licensing:**
- Contact schools, universities, cultural organisations
- Offer institutional license: €200-500/year per institution
- One email to 10 schools could bring €1000-2000

---

## COST CONTROL — Stay Profitable

### Set Anthropic spending limits
Go to console.anthropic.com → Billing → set hard monthly cap

### Understand your costs
- Claude Sonnet: ~$0.003 per 1000 output tokens
- One tab load ≈ 500-800 tokens of output ≈ $0.002-0.003
- 1000 tab loads/day ≈ $2-3/day ≈ $60-90/month

### The cache is your best friend
- The backend caches responses for 7 days
- Popular countries (France, USA, Japan) get generated ONCE
- All subsequent visitors get it for FREE
- With good traffic, cache hit rate reaches 80-90%
- Effective cost drops to $0.0003 per visitor

### Upgrade the cache later
For production with real traffic, replace the in-memory cache with:
- **Supabase** (free tier, PostgreSQL database): Store HTML responses permanently
- Cost: $0/month up to 500MB storage (enough for EVERY country, EVERY tab)
- This reduces API costs by 95%+

---

## MONITORING

### Free tools to track your atlas:
1. **Vercel Analytics** — built in, shows visitors, countries, page loads
2. **Google Analytics 4** — add the tracking script to index.html (free)
3. **Uptime Robot** — monitors if your site is up (free)

---

## TROUBLESHOOTING

**"Could not load" error:**
- Check Vercel → Functions logs for error details
- Verify ANTHROPIC_API_KEY is set correctly in environment variables
- Check you haven't exceeded your Anthropic spending limit

**Map not loading:**
- The CDN links for D3 and TopoJSON need internet connection
- Try hard refresh (Ctrl+Shift+R)

**Slow responses:**
- Normal: first load takes 5-10 seconds (Claude is generating)
- Cache hit: instant
- If always slow: check Vercel function timeout (set to 30s in vercel.json)

---

## FUTURE FEATURES TO ADD

- [ ] User accounts (save favourite countries)
- [ ] Compare two countries side-by-side
- [ ] Quiz mode ("Guess the country from clues")
- [ ] PDF export of country profiles
- [ ] Multi-language support (French, Spanish, Arabic)
- [ ] Historical map overlays (show 1900 borders, Roman Empire, etc.)
- [ ] Community corrections and additions
- [ ] Country of the Day feature
- [ ] Timeline view comparing events across countries

---

## CONTACT & SUPPORT

If you run into issues with deployment, the Vercel documentation is excellent:
https://vercel.com/docs

For API questions:
https://docs.anthropic.com
