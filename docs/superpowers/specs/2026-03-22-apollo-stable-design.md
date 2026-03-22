# Apollo Stable — Design Specification

## Overview

Apollo Stable is a modular, automated resale pipeline that sources free and underpriced items from Facebook Marketplace, evaluates their resale value against eBay sold data, and streamlines the listing process so the operator spends minimal time sourcing and maximum time selling.

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
apollo-stable/
├── scanner/          # FB Marketplace scraping
│   ├── scraper.js    # Puppeteer stealth browser automation
│   ├── queries.js    # Search term rotation and strategy
│   └── parser.js     # Extract listing data from page
├── evaluator/        # Deal scoring engine
│   ├── identifier.js # Claude Vision item identification
│   ├── comps.js      # eBay sold listings lookup
│   ├── shipping.js   # Shipping cost estimation
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
│   └── data/         # JSON data files pushed by pipeline
├── shared/
│   ├── db.js         # SQLite connection and schema
│   ├── config.js     # User configuration
│   └── types.js      # Shared constants and enums
├── cli.js            # CLI entry point
└── package.json
```

### Data Flow

```
FB Marketplace ─→ Scanner ─→ Raw Listings (DB)
                                  │
                                  ▼
                             Evaluator
                           ┌─────┴─────┐
                           │            │
                     Claude Vision   eBay Browse API
                     (identify item) (sold comps)
                           │            │
                           └─────┬─────┘
                                 ▼
                          Profit Calculator
                          (fees + shipping + gas)
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

**Behavior:**
- Runs on a 15-minute interval (configurable)
- Uses Puppeteer with stealth plugin to avoid detection
- Rotates through search queries: "free", "moving must go", "curb alert", "$0", price filter $0-$25, "free stuff", "garage cleanout"
- Targets Milford, NH area with configurable radius
- For each listing, captures:
  - Title, price (0 for free), description
  - All images (up to 10)
  - Seller location (city/town)
  - Listing URL
  - Time posted
- Deduplicates by listing URL against the database
- Writes new listings to `raw_listings` table with status `pending_eval`
- Prioritizes newest listings first (speed is the competitive edge on free stuff)

**Error handling:**
- If Puppeteer crashes or FB blocks, backs off exponentially (15min → 30min → 1hr)
- Logs errors but doesn't stop — resumes on next interval
- Rotates user agents between runs

### Evaluator

**Purpose:** Score every raw listing and determine if it's worth picking up.

**Step 1 — Item Identification (Claude Vision):**
- Sends all listing images to Claude Haiku with the prompt: "Identify this item. Return: item type, brand (if visible), model (if identifiable), estimated condition (new/like-new/good/fair/poor), estimated weight class (under 10lb / 10-30lb / 30-70lb / 70lb+), and any notable details that affect resale value."
- If Claude can't identify the item confidently, marks as `unidentifiable` and skips

**Step 2 — eBay Comp Lookup:**
- Searches eBay Browse API for sold listings matching the identified item
- Query: brand + model + item type, filtered to "sold" in last 90 days
- Captures: sold prices (min, max, median, average), number sold, average days to sell
- If fewer than 3 sold comps found, marks as `insufficient_data` — still shows on dashboard but with a warning

**Step 3 — Shipping Estimate:**
- Maps weight class to estimated shipping dimensions/weight
- Calculates shipping cost via eBay shipping calculator API
- Items over 70lb get flagged as `local_sell_recommended` (still shows profit for local sale)

**Step 4 — Profit Calculation:**
```
purchase_cost     = listing price (0 for free items)
ebay_sold_median  = median of sold comps
ebay_fees         = ebay_sold_median × 0.13
shipping_cost     = calculated estimate (0 if local sell)
gas_cost          = round_trip_miles × 0.67
net_profit        = ebay_sold_median - purchase_cost - ebay_fees - shipping_cost - gas_cost
profit_per_mile   = net_profit / one_way_miles
```

**Step 5 — Deal Grading:**
| Grade | Criteria |
|-------|----------|
| A | Net profit ≥ $75 AND profit/mile ≥ $5 AND sell-through ≥ 5 sold/90 days |
| B | Net profit ≥ $30 AND profit/mile ≥ $3 AND sell-through ≥ 3 sold/90 days |
| C | Net profit ≥ $15 OR insufficient comp data but item looks promising |
| F | Net profit < $15 OR unidentifiable OR no comps found |

**Step 6 — Alerting:**
- Grade A: Desktop notification + email with photos, profit estimate, and pickup link
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
   - **High sell-through (≥10 sold/90d) + stable prices (std dev < 20% of mean):** Buy It Now at median sold price or slightly below for fast turnover
   - **Low sell-through or high price variance:** 7-day auction starting at 25th percentile of sold prices
   - **Rare items (< 5 comps):** BIN at median with Best Offer enabled
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
**Data:** JSON files in `dashboard/data/` committed by the local pipeline
**Auth:** Simple token-based gate (URL parameter or localStorage token) — not Fort Knox, just keeps casual visitors out

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
| images | TEXT | JSON array of image URLs |
| location | TEXT | Seller's city/town |
| latitude | REAL | Seller lat (if available) |
| longitude | REAL | Seller lng (if available) |
| distance_miles | REAL | Calculated distance from home |
| posted_at | TEXT | When the listing was posted |
| found_at | TEXT | When our scanner found it |
| status | TEXT | pending_eval, evaluated, expired, grabbed |

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
| ebay_median_price | REAL | Median sold price on eBay |
| ebay_sold_count | INTEGER | Number sold in 90 days |
| ebay_avg_days_to_sell | REAL | Average days to sell |
| shipping_estimate | REAL | Estimated shipping cost |
| ebay_fees | REAL | Estimated eBay fees |
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
- **Browse API:** Search sold listings for comp data
- **Sell API (Inventory/Trading):** Create and manage listings
- **Taxonomy API:** Category suggestion from item title/description
- **Requires:** eBay Developer account (free), OAuth app credentials

### Claude API (Existing spend)
- **Haiku:** Item identification from photos, quick evaluations (~$0.001/eval)
- **Sonnet:** Listing description generation (~$0.01/listing)
- **Estimated monthly cost at volume:** $5-15/month at 50 evals/day + 10 listings/day

### Facebook Marketplace (Scraped)
- No official API — Puppeteer stealth scraping
- Risk: FB can change layout or block. Mitigation: modular parser, easy to update selectors

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
apollo push              # Push latest data to dashboard (git commit + push)
apollo config            # View/edit configuration
```

---

## GitHub Pages Setup

1. Repository: `apollo-stable` on Blake's GitHub
2. GitHub Pages enabled from `main` branch, serving from `/dashboard` directory
3. Custom domain: apollostable.com
4. DNS: CNAME record pointing apollostable.com → `<username>.github.io`
5. HTTPS: Enforced via GitHub Pages (free SSL)
6. `.gitignore` excludes: `node_modules/`, `*.db`, `.env`, scanner cookies/sessions

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
    "search_queries": ["free", "moving must go", "curb alert", "free stuff", "garage cleanout"]
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
    "fee_rate": 0.13,
    "gas_cost_per_mile": 0.67
  },
  "alerts": {
    "email": true,
    "desktop": true,
    "email_to": ""
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
Close the loop. Track actual sales, compare predicted vs actual profit, tune the scoring algorithm based on real results.
