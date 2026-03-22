# Apollo's Table — Design Specification

## Overview

Apollo's Table is a modular, automated resale pipeline that sources free and underpriced items from Facebook Marketplace, evaluates their resale value against eBay sold data, and streamlines the listing process so the operator spends minimal time sourcing and maximum time selling.

**Primary exit channel:** eBay
**Secondary exit channel:** Facebook Marketplace (heavy/low-margin items)
**Dashboard:** apollostable.com via GitHub Pages

## Goals

- Surface only high-profit, data-backed deals worth picking up
- Minimize driving through profit-per-mile scoring and dynamic radius filtering
- Automate eBay listing creation: AI-generated titles, descriptions, categories, and pricing
- Track profitability end-to-end from pickup to sale
- Start at $0 infrastructure cost (runs locally), with a path to scale

## Non-Goals

- Not a general marketplace aggregator — this is a profit-focused deal sniper
- Not an eBay store manager — it helps list and track, not manage returns or customer service
- No mobile app — dashboard is web, tools are CLI

---

## Architecture

### Module Overview

```
apollos-table/
├── scanner/          # FB Marketplace scraping
│   ├── scraper.js    # Puppeteer stealth browser automation
│   ├── cookies.js    # Session cookie management (manual login export)
│   ├── queries.js    # Search term rotation and strategy
│   └── parser.js     # Extract listing data from page + keyword blacklist
├── evaluator/        # Deal scoring engine
│   ├── identifier.js # Claude Vision item identification (structured JSON output)
│   ├── comps.js      # eBay sold listings scraper (ebay.com/sch/ with sold filter)
│   ├── shipping.js   # Weight-class shipping lookup table
│   ├── profit.js     # Profit calculation and scoring
│   └── alerts.js     # Notification dispatch
├── lister/           # eBay listing automation
│   ├── generator.js  # AI listing content generation
│   ├── pricer.js     # Pricing strategy engine
│   └── publisher.js  # eBay API listing push
├── dashboard/        # Static site (GitHub Pages)
│   ├── index.html    # Deals feed
│   ├── inventory.html
│   ├── listings.html
│   ├── profit.html
│   ├── settings.html
│   ├── css/
│   ├── js/
│   └── data/         # JSON data snapshot (force-pushed, single commit)
├── images/           # Downloaded listing images (local persistence)
├── shared/
│   ├── db.js         # SQLite connection and schema
│   ├── config.js     # User configuration
│   └── types.js      # Shared constants and enums
├── cli.js            # Entry point: `apollo scan`, `apollo list`, `apollo dash`
└── package.json
```

### Data Flow

```
FB Marketplace ─→ Scanner ─→ Raw Listings (DB)
                  (cookies)    + images saved locally
                                  │
                            keyword blacklist
                            (pre-filter junk)
                                  │
                                  ▼
                             Evaluator
                           ┌─────┴─────┐
                           │            │
                     Claude Vision   eBay Sold Scraper
                     (identify item) (ebay.com/sch/?LH_Sold=1)
                           │            │
                           └─────┬─────┘
                                 ▼
                          Profit Calculator
                          (fees + processing + shipping + gas)
                                 │
                          ┌──────┴──────┐
                          │             │
                     Grade A/B      Grade C/F
                     (alert user)   (ignore)
                          │
                          ▼
                    User picks up item
                          │
                          ▼
                    User snaps photos
                          │
                          ▼
                       Lister
                  (AI descriptions,
                   pricing, category)
                          │
                    ┌─────┴─────┐
                    │           │
                Shippable    Too heavy/
                (eBay)       low margin
                             (FB local)
                    │
                    ▼
               eBay Listing
                    │
                    ▼
                  SOLD
                    │
                    ▼
              Profit Tracker
```

---

## Module Specifications

### Scanner

**Purpose:** Continuously monitor Facebook Marketplace for free and cheap items.

**Authentication:**
- Facebook Marketplace requires login to view most listings, especially free items
- Setup step: User logs into Facebook manually in a browser, exports session cookies (via browser extension or dev tools), saves to `cookies.json`
- Scanner loads these cookies into Puppeteer on each run
- If cookies expire or session is invalidated, scanner enters a "blocked" state and alerts the user to re-export cookies rather than silently retrying forever
- Circuit breaker: if scraping has failed for 2+ hours continuously, sends an alert and pauses until user intervenes

**Behavior:**
- Runs on a 15-minute interval (configurable)
- Uses Puppeteer with stealth plugin to avoid detection
- Rotates through search queries: "free", "moving must go", "curb alert", "$0", price filter $0-$25, "free stuff", "garage cleanout"
- Targets Milford, NH area with configurable radius
- **Pre-filtering:** Before writing to DB, checks listing title against a keyword blacklist (configurable, default: "baby clothes", "broken", "parts only", "needs repair"). Discards matches to save eval costs.
- For each listing that passes pre-filter, captures:
  - Title, price (0 for free), description
  - All images (up to 10) — **downloaded locally** to `images/{listing_id}_{index}.jpg`
  - Seller location (city/town)
  - Listing URL
  - Time posted
- Deduplicates by listing URL against the database
- Writes new listings to `raw_listings` table with status `pending_eval`
- Prioritizes newest listings first (speed is the competitive edge on free stuff)

**Image persistence:**
- All listing images are downloaded locally during scanning
- FB Marketplace images disappear when listings are removed
- Local copies ensure the evaluator and lister always have access to images
- Naming convention: `images/{listing_id}_{index}.jpg`

**Error handling:**
- If Puppeteer crashes or FB blocks, backs off exponentially (15min → 30min → 1hr)
- Circuit breaker after 2 hours of continuous failure — alerts user, pauses scanning
- Logs errors but doesn't stop — resumes on next interval
- Rotates user agents between runs

### Evaluator

**Purpose:** Score every raw listing and determine if it's worth picking up.

**Step 0 — Freshness Check:**
- Before running a full evaluation, re-checks the listing URL to confirm it's still active
- If listing is gone or marked "pending", sets status to `stale` and skips evaluation
- Saves API costs on items already taken

**Step 1 — Item Identification (Claude Vision):**
- Sends all listing images (from local `images/` directory) to Claude Haiku
- Requests structured JSON output:
```json
{
  "item_type": "string",
  "brand": "string or null",
  "model": "string or null",
  "condition": "new|like-new|good|fair|poor",
  "weight_class": "under_10lb|10_30lb|30_70lb|70lb_plus",
  "ebay_search_query": "suggested eBay search string for finding comps",
  "notes": "anything affecting resale value"
}
```
- The `ebay_search_query` field lets Claude generate optimal search terms rather than naive brand+model concatenation
- If Claude can't identify the item confidently, marks as `unidentifiable` and skips

**Step 2 — eBay Comp Lookup (Sold Listings Scraper):**
- **Note:** The eBay Browse API does NOT return sold/completed listings. We scrape eBay's search directly.
- Uses Puppeteer to hit `ebay.com/sch/` with parameters `LH_Complete=1&LH_Sold=1` using the `ebay_search_query` from Step 1
- Parses sold listing results from the search page
- Captures: sold prices (min, max, median, average), number sold, average days to sell
- Falls back to eBay Finding API (`findCompletedItems`) if available on the developer account
- If fewer than 3 sold comps found, marks as `insufficient_data` — still shows on dashboard but with a warning

**Step 3 — Shipping Estimate (Lookup Table):**
- No standalone eBay shipping calculator API exists — uses a weight-class lookup table:

| Weight Class | Typical Method | Estimated Cost |
|-------------|----------------|---------------|
| Under 10lb | USPS Priority Mail | $10-16 |
| 10-30lb | UPS Ground / USPS Priority | $18-35 |
| 30-70lb | UPS Ground | $35-65 |
| 70lb+ | Freight / local sell recommended | $75+ or $0 if local |

- Uses midpoint of range for profit calculation
- Refined with actual shipping data in Phase 4
- Items over 70lb get flagged as `local_sell_recommended` (still shows profit for local sale)

**Step 4 — Profit Calculation:**
```
purchase_cost       = listing price (0 for free items)
ebay_sold_median    = median of sold comps
ebay_final_value    = ebay_sold_median × 0.1305  (13.05% final value fee)
payment_processing  = (ebay_sold_median × 0.0295) + 0.30  (2.95% + $0.30)
total_fees          = ebay_final_value + payment_processing  (~15.95% + $0.30)
shipping_cost       = lookup table estimate (0 if local sell)
gas_cost            = round_trip_miles × 0.67
net_profit          = ebay_sold_median - purchase_cost - total_fees - shipping_cost - gas_cost
profit_per_mile     = net_profit / max(one_way_miles, 1.0)
```

Note: `max(one_way_miles, 1.0)` prevents division by zero for very close listings and avoids absurdly high scores for items at 0.1 miles.

**Step 5 — Deal Grading:**
| Grade | Criteria |
|-------|----------|
| A | Net profit ≥ $75 AND profit/mile ≥ $5 AND sell-through ≥ 5 sold/90 days |
| B | Net profit ≥ $30 AND profit/mile ≥ $3 AND sell-through ≥ 3 sold/90 days |
| C | Net profit ≥ $15 OR insufficient comp data but item looks promising |
| F | Net profit < $15 OR unidentifiable OR no comps found |

**Step 6 — Alerting:**
- Grade A: Desktop notification with photos, profit estimate, and pickup link
- Grade B: Desktop notification only
- Grade C/F: Logged to DB, visible on dashboard, no alert

**Dynamic radius based on grade:**
- Grade A: Up to 30 miles
- Grade B: Up to 20 miles
- Grade C: Up to 10 miles

### Lister

**Purpose:** Generate complete eBay listings from photos with minimal manual effort.

**Workflow:**
1. User runs `apollo list` and selects an item from inventory (or adds new)
2. User provides photo paths (or a folder of photos)
3. System sends photos + original listing data + eBay comp data to Claude Sonnet
4. Claude generates:
   - **Title** (max 80 chars): Brand + model + key specs + condition keywords, optimized for eBay search
   - **Description**: Natural, detailed listing description. Not AI-template style — reads like a knowledgeable seller wrote it. Includes condition notes, specs, what's included, measurements if relevant.
   - **Item specifics**: Key-value pairs for eBay's structured data fields (brand, model, color, etc.)
5. System determines pricing strategy:
   - **Default (Phase 2 MVP):** Buy It Now at median sold price with Best Offer enabled
   - **Future refinement:** Auction for volatile-price items, aggressive BIN for high sell-through items
6. System selects eBay category via eBay Taxonomy API
7. Calculates shipping (calculated rate vs free-shipping-baked-in, picks whichever nets more based on comp analysis)
8. Presents full listing preview to user in terminal
9. User confirms → pushes to eBay as draft or live listing via eBay Sell API

**Photo handling:**
- Accepts JPG/PNG from any path
- Reorders photos: best/clearest first (Claude Vision ranks them)
- Recommends if more photos needed ("you should add a photo of the back/bottom/label")

### Dashboard (apollostable.com)

**Purpose:** Web-based command center for monitoring deals and tracking profit.

**Hosting:** GitHub Pages with custom domain apollostable.com
**Stack:** Static HTML/CSS/JS — no framework, no build step
**Data sync:** Pipeline generates a `data.json` snapshot, force-pushed to a dedicated `gh-pages` branch (single commit, never grows). Real history stays in SQLite locally.
**Auth:** Client-side password gate using localStorage — user sets a password, page checks localStorage flag. Not cryptographic security, just keeps casual visitors out. No tokens in URLs.

**Pages:**

**Deals Feed (index.html):**
- Cards showing today's evaluated deals, sorted by profit-per-mile score
- Each card: primary photo, item name, estimated profit, distance, grade badge, time posted
- Filter by grade (A/B/C), distance, min profit
- "Grabbing this" button moves item to inventory
- Auto-refreshes when new data is pushed

**Inventory (inventory.html):**
- Items you've committed to picking up or already have
- Status pipeline: Targeted → Picked Up → Photographed → Listed → Sold
- Click to start the listing flow (shows CLI command to run)

**Active Listings (listings.html):**
- Your live eBay listings with current price, watchers, views, bids
- Data pulled from eBay API and pushed as JSON
- Days active, price vs comp median indicator

**Profit Tracker (profit.html):**
- Revenue, costs (purchase + gas + shipping + fees), net profit
- Per-item breakdown: what you paid, what it sold for, net
- Running totals: weekly, monthly, all-time
- Charts: profit trend over time, profit by category, best flips
- Key metrics: average profit per flip, average ROI, average days to sell

**Settings (settings.html):**
- Search radius, minimum profit threshold, alert preferences
- Categories to always ignore (e.g., "baby clothes", "broken TVs")
- Keyword blacklist for scanner pre-filtering
- Saved to a config JSON that the local pipeline reads

**Design:**
- Dark mode, data-dense, clean
- Functional — like a trading terminal, not a lifestyle brand
- Mobile-responsive (check deals from your phone while you're out)

---

## Data Model (SQLite)

### raw_listings
| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | Auto-increment |
| url | TEXT UNIQUE | FB Marketplace listing URL |
| title | TEXT | Listing title |
| price | REAL | Listed price (0 for free) |
| description | TEXT | Listing description |
| images | TEXT | JSON array of local image paths |
| image_hash | TEXT | Perceptual hash of primary image (for repost detection) |
| location | TEXT | Seller's city/town |
| latitude | REAL | Seller lat (if available) |
| longitude | REAL | Seller lng (if available) |
| distance_miles | REAL | Calculated distance from home |
| posted_at | TEXT | When the listing was posted |
| found_at | TEXT | When our scanner found it |
| last_checked | TEXT | Last time we verified listing is still active |
| status | TEXT | pending_eval, evaluated, stale, expired, grabbed |

### evaluations
| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | Auto-increment |
| listing_id | INTEGER FK | References raw_listings.id |
| item_type | TEXT | What Claude identified it as |
| brand | TEXT | Brand if identified |
| model | TEXT | Model if identified |
| condition | TEXT | new/like-new/good/fair/poor |
| weight_class | TEXT | under_10lb/10_30lb/30_70lb/70lb_plus |
| ebay_search_query | TEXT | The search query used for comps |
| ebay_median_price | REAL | Median sold price on eBay |
| ebay_sold_count | INTEGER | Number sold in 90 days |
| ebay_avg_days_to_sell | REAL | Average days to sell |
| shipping_estimate | REAL | Estimated shipping cost |
| ebay_fees | REAL | Estimated eBay fees (FVF + payment processing) |
| gas_cost | REAL | Round trip gas cost |
| net_profit | REAL | Calculated net profit |
| profit_per_mile | REAL | Profit per mile driven |
| grade | TEXT | A/B/C/F |
| sell_channel | TEXT | ebay/local/either |
| evaluated_at | TEXT | Timestamp |
| notes | TEXT | Any special notes from Claude |

### inventory
| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | Auto-increment |
| listing_id | INTEGER FK | References raw_listings.id (nullable for manual adds) |
| evaluation_id | INTEGER FK | References evaluations.id (nullable) |
| status | TEXT | targeted/picked_up/photographed/listed/sold |
| purchase_price | REAL | What was actually paid |
| photos | TEXT | JSON array of local photo paths |
| ebay_listing_id | TEXT | eBay listing ID once listed |
| listed_price | REAL | Price listed on eBay |
| sold_price | REAL | Actual sale price |
| shipping_actual | REAL | Actual shipping cost |
| ebay_fees_actual | REAL | Actual eBay fees |
| net_profit_actual | REAL | Actual net profit after sale |
| notes | TEXT | User notes |
| created_at | TEXT | When added to inventory |
| updated_at | TEXT | Last status change |

### config
| Column | Type | Description |
|--------|------|-------------|
| key | TEXT PK | Config key |
| value | TEXT | JSON-encoded value |

---

## APIs and External Dependencies

### eBay APIs (Free)
- **Sell API (Inventory/Trading):** Create and manage listings
- **Taxonomy API:** Category suggestion from item title/description
- **Requires:** eBay Developer account (free), OAuth app credentials
- **Note:** Browse API is NOT used for comps — it cannot return sold listings

### eBay Sold Comps (Scraped)
- Puppeteer scrapes `ebay.com/sch/` with `LH_Complete=1&LH_Sold=1` parameters
- Fallback: eBay Finding API (`findCompletedItems`) if developer account has access
- This is how every major reseller tool (Terapeak, etc.) gets comp data

### Claude API (Existing spend)
- **Haiku:** Item identification from photos, quick evaluations (~$0.001/eval)
- **Sonnet:** Listing description generation (~$0.01/listing)
- **Estimated monthly cost at volume:** $5-15/month at 50 evals/day + 10 listings/day

### Facebook Marketplace (Scraped)
- No official API — Puppeteer stealth scraping with exported session cookies
- Risk: FB can change layout or block. Mitigation: modular parser, easy to update selectors, cookie re-export workflow, circuit breaker alerting

### Other
- **Nodemailer:** Email alerts (uses existing Gmail/SMTP config from chair-hunter)
- **better-sqlite3:** Local SQLite database
- **Commander.js:** CLI framework

---

## CLI Commands

```
apollo scan              # Start the scanner (runs continuously)
apollo scan --once       # Run one scan cycle and exit
apollo eval              # Evaluate all pending listings
apollo deals             # Show top deals in terminal
apollo grab <id>         # Mark a deal as "grabbing it" → moves to inventory
apollo list              # Interactive listing flow for an inventory item
apollo list <id>         # Start listing flow for specific item
apollo listings          # Show active eBay listings
apollo stats             # Profit summary in terminal
apollo push              # Push latest data snapshot to dashboard
apollo config            # View/edit configuration
```

---

## GitHub Pages Setup

1. Repository: `apollos-table` on Blake's GitHub
2. `gh-pages` branch contains only the dashboard and current data snapshot
3. Custom domain: apollostable.com
4. DNS: CNAME record pointing apollostable.com → `<username>.github.io`
5. HTTPS: Enforced via GitHub Pages (free SSL)
6. `.gitignore` excludes: `node_modules/`, `*.db`, `.env`, `cookies.json`, `images/`
7. `.gitattributes`: JSON data files treated as binary to avoid diff bloat

---

## Configuration Defaults

```json
{
  "location": {
    "city": "Milford",
    "state": "NH",
    "latitude": 42.8354,
    "longitude": -71.6487
  },
  "scanner": {
    "interval_minutes": 15,
    "max_price": 25,
    "search_queries": ["free", "moving must go", "curb alert", "free stuff", "garage cleanout"],
    "keyword_blacklist": ["baby clothes", "broken", "parts only", "needs repair", "for parts"]
  },
  "evaluator": {
    "min_profit": 30,
    "min_profit_per_mile": 3,
    "comp_lookback_days": 90,
    "min_comps": 3
  },
  "radius": {
    "grade_a_miles": 30,
    "grade_b_miles": 20,
    "grade_c_miles": 10
  },
  "ebay": {
    "final_value_fee_rate": 0.1305,
    "payment_processing_rate": 0.0295,
    "payment_processing_flat": 0.30,
    "gas_cost_per_mile": 0.67
  },
  "alerts": {
    "desktop": true,
    "email": false,
    "email_to": ""
  },
  "shipping_estimates": {
    "under_10lb": 13,
    "10_30lb": 27,
    "30_70lb": 50,
    "70lb_plus": 75
  }
}
```

---

## Phase Rollout

**Phase 1 — Scanner + Evaluator (Prove the model)**
Get deals flowing and scored. Validate that the system finds real money-making opportunities. No eBay integration yet — just find and score.

**Phase 2 — Lister + eBay Integration**
Once Phase 1 proves there's money on the table, build the listing automation. Get items from pickup to eBay with minimal effort.

**Phase 3 — Dashboard (apollostable.com)**
Deploy the web dashboard for monitoring and tracking. Push data from local pipeline to GitHub Pages.

**Phase 4 — Profit Tracking + Optimization**
Close the loop. Track actual sales, compare predicted vs actual profit, tune the scoring algorithm based on real results. Refine shipping estimates with actual data. Add repost detection via image hashing.
