# Apollo's Table Phase 1: Scanner + Evaluator — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the deal-sniping pipeline that scans FB Marketplace for free/cheap items, evaluates them against eBay sold comps, scores profitability, and alerts the user on high-value deals.

**Architecture:** Four layers — shared foundation (DB, config), scanner (Puppeteer scraping FB Marketplace with cookie auth), evaluator (Claude Vision identification + eBay sold scraping + profit math), and CLI entry point tying it together. Each layer is independently testable.

**Tech Stack:** Node.js, Puppeteer + stealth plugin, @anthropic-ai/sdk (Claude Haiku), better-sqlite3, Commander.js, node-notifier (cross-platform desktop alerts), Nodemailer

**Spec:** `docs/superpowers/specs/2026-03-22-apollo-stable-design.md`

**Reference codebase:** `C:\Users\Blake\Projects\chair-hunter\hunt.js` — proven Puppeteer stealth + Claude Vision + alert patterns

---

## File Map

```
apollos-table/
├── package.json                # Dependencies and "apollo" bin entry
├── .gitignore                  # node_modules, *.db, .env, cookies.json, images/
├── .env.example                # Template for API keys
├── config.default.json         # Default configuration (committed)
├── cli.js                      # CLI entry point (Commander.js)
├── shared/
│   ├── db.js                   # SQLite schema + connection + query helpers
│   ├── config.js               # Load/merge config.default.json + config.json
│   └── distance.js             # Haversine distance calculation
├── scanner/
│   ├── cookies.js              # Load/validate cookies.json for FB auth
│   ├── queries.js              # Search term list + rotation
│   ├── parser.js               # Extract listing data from FB Marketplace DOM + blacklist filter
│   ├── images.js               # Download listing images locally
│   └── scraper.js              # Puppeteer orchestration — scan cycle
├── evaluator/
│   ├── identifier.js           # Claude Vision item identification → structured JSON
│   ├── comps.js                # eBay sold listings scraper (ebay.com/sch/?LH_Sold=1)
│   ├── shipping.js             # Weight-class → shipping cost lookup
│   ├── profit.js               # Fee calc, profit calc, grading
│   └── alerts.js               # Desktop notification + email alerts
├── test/
│   ├── shared/
│   │   ├── db.test.js
│   │   ├── config.test.js
│   │   └── distance.test.js
│   ├── scanner/
│   │   ├── cookies.test.js
│   │   ├── parser.test.js
│   │   └── images.test.js
│   └── evaluator/
│       ├── identifier.test.js
│       ├── comps.test.js
│       ├── shipping.test.js
│       ├── profit.test.js
│       └── alerts.test.js
└── images/                     # Downloaded FB listing images (gitignored)
```

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `config.default.json`

- [ ] **Step 1: Initialize npm project**

```bash
cd /c/Users/Blake/Projects/apollos-table
npm init -y
```

- [ ] **Step 2: Install dependencies**

```bash
npm install puppeteer puppeteer-extra puppeteer-extra-plugin-stealth @anthropic-ai/sdk better-sqlite3 commander node-notifier nodemailer dotenv
npm install --save-dev mocha chai
```

- [ ] **Step 3: Update package.json**

Set `"bin"`, `"scripts"`, and `"type"` fields:

```json
{
  "name": "apollos-table",
  "version": "0.1.0",
  "description": "Automated resale deal sniper — FB Marketplace to eBay",
  "main": "cli.js",
  "bin": {
    "apollo": "./cli.js"
  },
  "scripts": {
    "test": "mocha --recursive test/**/*.test.js",
    "scan": "node cli.js scan",
    "eval": "node cli.js eval",
    "deals": "node cli.js deals"
  },
  "author": "Blake Corbit",
  "license": "MIT"
}
```

- [ ] **Step 4: Create .gitignore**

```
node_modules/
*.db
.env
cookies.json
images/
```

- [ ] **Step 5: Create .env.example**

```
ANTHROPIC_API_KEY=your-key-here
SMTP_PASSWORD=your-gmail-app-password
ALERT_EMAIL=your-email@gmail.com
```

- [ ] **Step 6: Create config.default.json**

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
    "email": false
  },
  "shipping_estimates": {
    "under_10lb": 13,
    "10_30lb": 27,
    "30_70lb": 50,
    "70lb_plus": 75
  }
}
```

- [ ] **Step 7: Create images/ directory placeholder**

```bash
mkdir -p images
touch images/.gitkeep
```

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json .gitignore .env.example config.default.json images/.gitkeep
git commit -m "feat: scaffold project with dependencies and default config"
```

---

### Task 2: Shared — Config Loader

**Files:**
- Create: `shared/config.js`
- Create: `test/shared/config.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// test/shared/config.test.js
const { expect } = require('chai');
const path = require('path');
const fs = require('fs');

describe('config', () => {
  const configModule = require('../../shared/config');

  it('loads default config when no user config exists', () => {
    const cfg = configModule.load();
    expect(cfg.location.city).to.equal('Milford');
    expect(cfg.scanner.interval_minutes).to.equal(15);
    expect(cfg.ebay.final_value_fee_rate).to.equal(0.1305);
  });

  it('merges user config over defaults', () => {
    const userPath = path.join(process.cwd(), 'config.json');
    fs.writeFileSync(userPath, JSON.stringify({ scanner: { interval_minutes: 5 } }));
    // Clear require cache
    delete require.cache[require.resolve('../../shared/config')];
    const configModule2 = require('../../shared/config');
    const cfg = configModule2.load();
    expect(cfg.scanner.interval_minutes).to.equal(5);
    expect(cfg.scanner.max_price).to.equal(25); // default preserved
    fs.unlinkSync(userPath);
  });

  it('exposes config via get() after load()', () => {
    const cfg = configModule.load();
    const got = configModule.get();
    expect(got).to.deep.equal(cfg);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --grep "config"`
Expected: FAIL — cannot find module `../../shared/config`

- [ ] **Step 3: Write implementation**

```javascript
// shared/config.js
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_PATH = path.join(ROOT, 'config.default.json');
const USER_PATH = path.join(ROOT, 'config.json');

let _config = null;

function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])
        && target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])) {
      result[key] = deepMerge(target[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

function load() {
  const defaults = JSON.parse(fs.readFileSync(DEFAULT_PATH, 'utf8'));
  let user = {};
  if (fs.existsSync(USER_PATH)) {
    user = JSON.parse(fs.readFileSync(USER_PATH, 'utf8'));
  }
  _config = deepMerge(defaults, user);
  return _config;
}

function get() {
  if (!_config) return load();
  return _config;
}

module.exports = { load, get };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --grep "config"`
Expected: 3 passing

- [ ] **Step 5: Commit**

```bash
git add shared/config.js test/shared/config.test.js
git commit -m "feat: add config loader with default/user merge"
```

---

### Task 3: Shared — Distance Calculator

**Files:**
- Create: `shared/distance.js`
- Create: `test/shared/distance.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// test/shared/distance.test.js
const { expect } = require('chai');
const { milesToLocation } = require('../../shared/distance');

describe('distance', () => {
  // Milford NH to Nashua NH is ~10 miles
  it('calculates distance between two known points', () => {
    const home = { latitude: 42.8354, longitude: -71.6487 }; // Milford NH
    const nashua = { latitude: 42.7654, longitude: -71.4676 }; // Nashua NH
    const d = milesToLocation(home, nashua);
    expect(d).to.be.within(8, 12);
  });

  it('returns 0 for same point', () => {
    const home = { latitude: 42.8354, longitude: -71.6487 };
    expect(milesToLocation(home, home)).to.equal(0);
  });

  it('applies max(1.0) floor for profit-per-mile', () => {
    const { flooredDistance } = require('../../shared/distance');
    expect(flooredDistance(0.3)).to.equal(1.0);
    expect(flooredDistance(5)).to.equal(5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --grep "distance"`
Expected: FAIL — cannot find module

- [ ] **Step 3: Write implementation**

```javascript
// shared/distance.js
function milesToLocation(from, to) {
  const R = 3958.8; // Earth radius in miles
  const dLat = toRad(to.latitude - from.latitude);
  const dLon = toRad(to.longitude - from.longitude);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from.latitude)) * Math.cos(toRad(to.latitude)) *
    Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

function toRad(deg) {
  return deg * (Math.PI / 180);
}

function flooredDistance(miles) {
  return Math.max(miles, 1.0);
}

module.exports = { milesToLocation, flooredDistance };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --grep "distance"`
Expected: 3 passing

- [ ] **Step 5: Commit**

```bash
git add shared/distance.js test/shared/distance.test.js
git commit -m "feat: add haversine distance calculator"
```

---

### Task 4: Shared — Database Schema and Helpers

**Files:**
- Create: `shared/db.js`
- Create: `test/shared/db.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// test/shared/db.test.js
const { expect } = require('chai');
const fs = require('fs');
const path = require('path');

const TEST_DB = path.join(__dirname, '..', 'test.db');

describe('db', () => {
  let db;

  before(() => {
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
    db = require('../../shared/db');
    db.init(TEST_DB);
  });

  after(() => {
    db.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it('creates all tables on init', () => {
    const tables = db.raw().prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all().map(r => r.name);
    expect(tables).to.include('raw_listings');
    expect(tables).to.include('evaluations');
    expect(tables).to.include('inventory');
  });

  it('inserts and retrieves a raw listing', () => {
    const id = db.insertListing({
      url: 'https://fb.com/item/123',
      title: 'Free couch',
      price: 0,
      description: 'Moving out',
      images: JSON.stringify(['images/1_0.jpg']),
      location: 'Milford NH',
      distance_miles: 2.5,
      posted_at: '2026-03-22T10:00:00Z',
      found_at: '2026-03-22T10:05:00Z'
    });
    expect(id).to.be.a('number');

    const listing = db.getListing(id);
    expect(listing.title).to.equal('Free couch');
    expect(listing.status).to.equal('pending_eval');
  });

  it('rejects duplicate URLs', () => {
    const fn = () => db.insertListing({
      url: 'https://fb.com/item/123',
      title: 'Dup',
      price: 0,
      description: '',
      images: '[]',
      location: '',
      distance_miles: 0,
      posted_at: '',
      found_at: ''
    });
    expect(fn).to.throw();
  });

  it('gets pending listings for evaluation', () => {
    db.insertListing({
      url: 'https://fb.com/item/456',
      title: 'Free table',
      price: 0,
      description: '',
      images: '[]',
      location: 'Nashua NH',
      distance_miles: 10,
      posted_at: '2026-03-22T11:00:00Z',
      found_at: '2026-03-22T11:05:00Z'
    });
    const pending = db.getPendingListings();
    expect(pending.length).to.be.at.least(1);
    expect(pending.every(l => l.status === 'pending_eval')).to.be.true;
  });

  it('inserts and retrieves an evaluation', () => {
    const pending = db.getPendingListings();
    const evalId = db.insertEvaluation({
      listing_id: pending[0].id,
      item_type: 'couch',
      brand: null,
      model: null,
      condition: 'good',
      weight_class: '30_70lb',
      ebay_search_query: 'couch sofa',
      ebay_median_price: 150,
      ebay_sold_count: 12,
      ebay_avg_days_to_sell: 7,
      shipping_estimate: 50,
      ebay_fees: 24.28,
      gas_cost: 3.35,
      net_profit: 72.37,
      profit_per_mile: 28.95,
      grade: 'B',
      sell_channel: 'ebay',
      notes: 'Standard couch, good condition'
    });
    expect(evalId).to.be.a('number');
    db.updateListingStatus(pending[0].id, 'evaluated');
  });

  it('gets top deals sorted by profit_per_mile', () => {
    const deals = db.getTopDeals(10);
    expect(deals.length).to.be.at.least(1);
    expect(deals[0]).to.have.property('net_profit');
    expect(deals[0]).to.have.property('title');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --grep "db"`
Expected: FAIL — cannot find module

- [ ] **Step 3: Write implementation**

```javascript
// shared/db.js
const Database = require('better-sqlite3');
const path = require('path');

const DEFAULT_PATH = path.join(__dirname, '..', 'apollo.db');
let _db = null;

function init(dbPath) {
  _db = new Database(dbPath || DEFAULT_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  createTables();
  return _db;
}

function createTables() {
  _db.exec(`
    CREATE TABLE IF NOT EXISTS raw_listings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      price REAL DEFAULT 0,
      description TEXT DEFAULT '',
      images TEXT DEFAULT '[]',
      image_hash TEXT,
      location TEXT DEFAULT '',
      latitude REAL,
      longitude REAL,
      distance_miles REAL,
      posted_at TEXT,
      found_at TEXT,
      last_checked TEXT,
      status TEXT DEFAULT 'pending_eval'
    );

    CREATE TABLE IF NOT EXISTS evaluations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      listing_id INTEGER NOT NULL REFERENCES raw_listings(id),
      item_type TEXT,
      brand TEXT,
      model TEXT,
      condition TEXT,
      weight_class TEXT,
      ebay_search_query TEXT,
      ebay_median_price REAL,
      ebay_sold_count INTEGER,
      ebay_avg_days_to_sell REAL,
      shipping_estimate REAL,
      ebay_fees REAL,
      gas_cost REAL,
      net_profit REAL,
      profit_per_mile REAL,
      grade TEXT,
      sell_channel TEXT,
      evaluated_at TEXT DEFAULT (datetime('now')),
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      listing_id INTEGER REFERENCES raw_listings(id),
      evaluation_id INTEGER REFERENCES evaluations(id),
      status TEXT DEFAULT 'targeted',
      purchase_price REAL DEFAULT 0,
      photos TEXT DEFAULT '[]',
      ebay_listing_id TEXT,
      listed_price REAL,
      sold_price REAL,
      shipping_actual REAL,
      ebay_fees_actual REAL,
      net_profit_actual REAL,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);
}

function insertListing(data) {
  const stmt = _db.prepare(`
    INSERT INTO raw_listings (url, title, price, description, images, image_hash, location, latitude, longitude, distance_miles, posted_at, found_at)
    VALUES (@url, @title, @price, @description, @images, @image_hash, @location, @latitude, @longitude, @distance_miles, @posted_at, @found_at)
  `);
  return stmt.run({
    image_hash: null, latitude: null, longitude: null,
    ...data
  }).lastInsertRowid;
}

function getListing(id) {
  return _db.prepare('SELECT * FROM raw_listings WHERE id = ?').get(id);
}

function getListingByUrl(url) {
  return _db.prepare('SELECT * FROM raw_listings WHERE url = ?').get(url);
}

function getPendingListings() {
  return _db.prepare("SELECT * FROM raw_listings WHERE status = 'pending_eval' ORDER BY found_at DESC").all();
}

function updateListingStatus(id, status) {
  _db.prepare('UPDATE raw_listings SET status = ?, last_checked = datetime("now") WHERE id = ?').run(status, id);
}

function insertEvaluation(data) {
  const stmt = _db.prepare(`
    INSERT INTO evaluations (listing_id, item_type, brand, model, condition, weight_class, ebay_search_query,
      ebay_median_price, ebay_sold_count, ebay_avg_days_to_sell, shipping_estimate, ebay_fees, gas_cost,
      net_profit, profit_per_mile, grade, sell_channel, notes)
    VALUES (@listing_id, @item_type, @brand, @model, @condition, @weight_class, @ebay_search_query,
      @ebay_median_price, @ebay_sold_count, @ebay_avg_days_to_sell, @shipping_estimate, @ebay_fees, @gas_cost,
      @net_profit, @profit_per_mile, @grade, @sell_channel, @notes)
  `);
  return stmt.run(data).lastInsertRowid;
}

function getTopDeals(limit = 20) {
  return _db.prepare(`
    SELECT e.*, l.title, l.url, l.price, l.images, l.location, l.distance_miles
    FROM evaluations e
    JOIN raw_listings l ON e.listing_id = l.id
    WHERE e.grade IN ('A', 'B')
    ORDER BY e.profit_per_mile DESC
    LIMIT ?
  `).all(limit);
}

function urlExists(url) {
  return !!_db.prepare('SELECT 1 FROM raw_listings WHERE url = ?').get(url);
}

function grabDeal(listingId) {
  const listing = getListing(listingId);
  if (!listing) throw new Error(`Listing ${listingId} not found`);
  const evalRow = _db.prepare('SELECT * FROM evaluations WHERE listing_id = ? ORDER BY id DESC LIMIT 1').get(listingId);
  const invId = _db.prepare(`
    INSERT INTO inventory (listing_id, evaluation_id, status, purchase_price)
    VALUES (?, ?, 'targeted', ?)
  `).run(listingId, evalRow ? evalRow.id : null, listing.price).lastInsertRowid;
  updateListingStatus(listingId, 'grabbed');
  return invId;
}

function raw() { return _db; }

function close() {
  if (_db) _db.close();
  _db = null;
}

module.exports = {
  init, insertListing, getListing, getListingByUrl, getPendingListings,
  updateListingStatus, insertEvaluation, getTopDeals, urlExists, grabDeal,
  raw, close
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --grep "db"`
Expected: 5 passing

- [ ] **Step 5: Commit**

```bash
git add shared/db.js test/shared/db.test.js
git commit -m "feat: add SQLite database schema and query helpers"
```

---

### Task 5: Scanner — Cookie Loader

**Files:**
- Create: `scanner/cookies.js`
- Create: `test/scanner/cookies.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// test/scanner/cookies.test.js
const { expect } = require('chai');
const fs = require('fs');
const path = require('path');

const COOKIE_PATH = path.join(__dirname, 'test-cookies.json');

describe('cookies', () => {
  const { loadCookies, validateCookies } = require('../../scanner/cookies');

  afterEach(() => {
    if (fs.existsSync(COOKIE_PATH)) fs.unlinkSync(COOKIE_PATH);
  });

  it('loads cookies from a JSON file', () => {
    const fakeCookies = [
      { name: 'c_user', value: '12345', domain: '.facebook.com' },
      { name: 'xs', value: 'abc', domain: '.facebook.com' }
    ];
    fs.writeFileSync(COOKIE_PATH, JSON.stringify(fakeCookies));
    const cookies = loadCookies(COOKIE_PATH);
    expect(cookies).to.have.length(2);
    expect(cookies[0].name).to.equal('c_user');
  });

  it('throws if cookie file does not exist', () => {
    expect(() => loadCookies('/nonexistent/cookies.json')).to.throw(/cookie/i);
  });

  it('validates that required FB cookies are present', () => {
    const good = [
      { name: 'c_user', value: '12345', domain: '.facebook.com' },
      { name: 'xs', value: 'abc', domain: '.facebook.com' }
    ];
    expect(validateCookies(good)).to.be.true;
  });

  it('rejects cookies missing c_user', () => {
    const bad = [{ name: 'xs', value: 'abc', domain: '.facebook.com' }];
    expect(validateCookies(bad)).to.be.false;
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --grep "cookies"`
Expected: FAIL

- [ ] **Step 3: Write implementation**

```javascript
// scanner/cookies.js
const fs = require('fs');
const path = require('path');

const DEFAULT_PATH = path.join(__dirname, '..', 'cookies.json');

function loadCookies(cookiePath) {
  const p = cookiePath || DEFAULT_PATH;
  if (!fs.existsSync(p)) {
    throw new Error(
      `Cookie file not found at ${p}.\n` +
      'To set up cookies:\n' +
      '1. Log into Facebook in your browser\n' +
      '2. Export cookies using a browser extension (e.g., "EditThisCookie")\n' +
      '3. Save the exported JSON as cookies.json in the project root'
    );
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function validateCookies(cookies) {
  const names = cookies.map(c => c.name);
  // c_user and xs are the critical FB session cookies
  return names.includes('c_user') && names.includes('xs');
}

module.exports = { loadCookies, validateCookies };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --grep "cookies"`
Expected: 4 passing

- [ ] **Step 5: Commit**

```bash
git add scanner/cookies.js test/scanner/cookies.test.js
git commit -m "feat: add FB cookie loader with validation"
```

---

### Task 6: Scanner — Query Rotation and Parser

**Files:**
- Create: `scanner/queries.js`
- Create: `scanner/parser.js`
- Create: `test/scanner/parser.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// test/scanner/parser.test.js
const { expect } = require('chai');

describe('parser', () => {
  const { isBlacklisted } = require('../../scanner/parser');

  it('rejects blacklisted titles', () => {
    const blacklist = ['baby clothes', 'broken', 'parts only'];
    expect(isBlacklisted('Free baby clothes size 3T', blacklist)).to.be.true;
    expect(isBlacklisted('BROKEN microwave free', blacklist)).to.be.true;
  });

  it('passes non-blacklisted titles', () => {
    const blacklist = ['baby clothes', 'broken', 'parts only'];
    expect(isBlacklisted('Free Herman Miller chair', blacklist)).to.be.false;
    expect(isBlacklisted('Moving sale - desk and monitor', blacklist)).to.be.false;
  });
});

describe('queries', () => {
  const { getNextQuery, getAllQueries } = require('../../scanner/queries');

  it('returns search queries from config', () => {
    const queries = getAllQueries();
    expect(queries).to.be.an('array');
    expect(queries.length).to.be.at.least(1);
  });

  it('rotates through queries', () => {
    const q1 = getNextQuery();
    const q2 = getNextQuery();
    // Should eventually cycle — just verify it returns strings
    expect(q1).to.be.a('string');
    expect(q2).to.be.a('string');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --grep "parser|queries"`
Expected: FAIL

- [ ] **Step 3: Write queries.js**

```javascript
// scanner/queries.js
const config = require('../shared/config');

let _index = 0;

function getAllQueries() {
  return config.get().scanner.search_queries;
}

function getNextQuery() {
  const queries = getAllQueries();
  const q = queries[_index % queries.length];
  _index++;
  return q;
}

function resetIndex() {
  _index = 0;
}

module.exports = { getAllQueries, getNextQuery, resetIndex };
```

- [ ] **Step 4: Write parser.js**

```javascript
// scanner/parser.js

function isBlacklisted(title, blacklist) {
  const lower = title.toLowerCase();
  return blacklist.some(term => lower.includes(term.toLowerCase()));
}

// Parses listing data from FB Marketplace DOM elements
// This function runs inside Puppeteer's page.evaluate() so it must be self-contained
function parseListingsScript() {
  const listings = [];
  // FB Marketplace search results are in anchor tags linking to /marketplace/item/
  const links = document.querySelectorAll('a[href*="/marketplace/item/"]');
  const seen = new Set();

  links.forEach(link => {
    const href = link.getAttribute('href');
    const match = href.match(/\/marketplace\/item\/(\d+)/);
    if (!match || seen.has(match[1])) return;
    seen.add(match[1]);

    const img = link.querySelector('img');
    const spans = link.querySelectorAll('span');
    let title = '', price = '', location = '';

    // FB typically structures these as: image, price span, title span, location span
    const spanTexts = Array.from(spans).map(s => s.textContent.trim()).filter(Boolean);
    if (spanTexts.length >= 1) price = spanTexts[0];
    if (spanTexts.length >= 2) title = spanTexts[1];
    if (spanTexts.length >= 3) location = spanTexts[2];

    listings.push({
      id: match[1],
      url: `https://www.facebook.com/marketplace/item/${match[1]}/`,
      title: title,
      price: price,
      location: location,
      imageUrl: img ? img.src : null
    });
  });
  return listings;
}

function parsePrice(priceStr) {
  if (!priceStr) return 0;
  if (/free/i.test(priceStr) || priceStr === '$0') return 0;
  const match = priceStr.match(/\$([\d,.]+)/);
  if (!match) return 0;
  return parseFloat(match[1].replace(/,/g, ''));
}

module.exports = { isBlacklisted, parseListingsScript, parsePrice };
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- --grep "parser|queries"`
Expected: 4 passing

- [ ] **Step 6: Commit**

```bash
git add scanner/queries.js scanner/parser.js test/scanner/parser.test.js
git commit -m "feat: add search query rotation and listing parser with blacklist"
```

---

### Task 7: Scanner — Image Downloader

**Files:**
- Create: `scanner/images.js`
- Create: `test/scanner/images.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// test/scanner/images.test.js
const { expect } = require('chai');
const fs = require('fs');
const path = require('path');

describe('images', () => {
  const { imagePath, ensureImagesDir } = require('../../scanner/images');

  it('generates correct image path from listing ID and index', () => {
    const p = imagePath(12345, 0);
    expect(p).to.match(/images[/\\]12345_0\.jpg$/);
  });

  it('ensures images directory exists', () => {
    const dir = ensureImagesDir();
    expect(fs.existsSync(dir)).to.be.true;
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --grep "images"`
Expected: FAIL

- [ ] **Step 3: Write implementation**

```javascript
// scanner/images.js
const fs = require('fs');
const path = require('path');

const IMAGES_DIR = path.join(__dirname, '..', 'images');

function ensureImagesDir() {
  if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });
  return IMAGES_DIR;
}

function imagePath(listingId, index) {
  return path.join(IMAGES_DIR, `${listingId}_${index}.jpg`);
}

// Downloads an image from a URL using Puppeteer's page context (bypasses CORS)
// Same pattern as chair-hunter: fetch inside page.evaluate, return base64
async function downloadImage(page, url, savePath) {
  try {
    const base64 = await page.evaluate(async (imgUrl) => {
      try {
        const res = await fetch(imgUrl);
        if (!res.ok) return null;
        const blob = await res.blob();
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.readAsDataURL(blob);
        });
      } catch { return null; }
    }, url);

    if (!base64) return false;

    const match = base64.match(/^data:image\/[^;]+;base64,(.+)$/);
    if (!match) return false;

    fs.writeFileSync(savePath, Buffer.from(match[1], 'base64'));
    return true;
  } catch {
    return false;
  }
}

// Returns base64 image data for Claude Vision API
function imageToBase64(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const data = fs.readFileSync(filePath).toString('base64');
  return { media_type: 'image/jpeg', data };
}

module.exports = { ensureImagesDir, imagePath, downloadImage, imageToBase64 };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --grep "images"`
Expected: 2 passing

- [ ] **Step 5: Commit**

```bash
git add scanner/images.js test/scanner/images.test.js
git commit -m "feat: add image downloader with base64 conversion for Vision API"
```

---

### Task 8: Scanner — Main Scraper Orchestration

**Files:**
- Create: `scanner/scraper.js`

This is the main Puppeteer orchestration — it wires together cookies, queries, parser, images, and the DB. Integration-tested manually (depends on live FB).

- [ ] **Step 1: Write scraper.js**

```javascript
// scanner/scraper.js
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const config = require('../shared/config');
const db = require('../shared/db');
const { milesToLocation } = require('../shared/distance');
const { loadCookies, validateCookies } = require('./cookies');
const { getNextQuery } = require('./queries');
const { isBlacklisted, parseListingsScript, parsePrice } = require('./parser');
const { ensureImagesDir, imagePath, downloadImage } = require('./images');

let _failCount = 0;
let _circuitOpen = false;
const MAX_FAIL_HOURS = 2;
let _failSince = null;

async function scanOnce() {
  if (_circuitOpen) {
    console.log('[Scanner] Circuit breaker OPEN — paused. Re-export cookies.json and restart.');
    return { scanned: 0, new: 0, error: 'circuit_open' };
  }

  const cfg = config.get();
  const cookies = loadCookies();
  if (!validateCookies(cookies)) {
    console.error('[Scanner] Invalid cookies — missing c_user or xs. Re-export from browser.');
    return { scanned: 0, new: 0, error: 'invalid_cookies' };
  }

  ensureImagesDir();
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-notifications', '--disable-gpu']
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1920, height: 1080 });

    // Set cookies before navigating
    await page.setCookie(...cookies);

    const query = getNextQuery();
    const lat = cfg.location.latitude;
    const lng = cfg.location.longitude;
    const maxMiles = cfg.radius.grade_a_miles; // scan widest radius, filter later
    const maxPrice = cfg.scanner.max_price;

    const searchUrl = `https://www.facebook.com/marketplace/search?query=${encodeURIComponent(query)}&maxPrice=${maxPrice}&exact=false`;
    console.log(`[Scanner] Searching: "${query}" (max $${maxPrice})`);

    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 3000)); // Let dynamic content load

    // Parse listings from page
    const rawListings = await page.evaluate(parseListingsScript);
    console.log(`[Scanner] Found ${rawListings.length} listings on page`);

    let newCount = 0;
    const home = { latitude: lat, longitude: lng };

    for (const raw of rawListings) {
      // Skip if already in DB
      if (db.urlExists(raw.url)) continue;

      const price = parsePrice(raw.price);
      const title = raw.title || '';

      // Blacklist check
      if (isBlacklisted(title, cfg.scanner.keyword_blacklist)) {
        continue;
      }

      // Download images
      const localImages = [];
      if (raw.imageUrl) {
        const saveTo = imagePath(raw.id, 0);
        const ok = await downloadImage(page, raw.imageUrl, saveTo);
        if (ok) localImages.push(saveTo);
      }

      // Insert to DB
      try {
        db.insertListing({
          url: raw.url,
          title: title,
          price: price,
          description: '',
          images: JSON.stringify(localImages),
          location: raw.location || '',
          distance_miles: null, // calculated during eval when we have better location data
          posted_at: new Date().toISOString(),
          found_at: new Date().toISOString()
        });
        newCount++;
      } catch (err) {
        // Duplicate URL race condition — safe to skip
        if (!err.message.includes('UNIQUE')) throw err;
      }
    }

    _failCount = 0;
    _failSince = null;
    console.log(`[Scanner] ${newCount} new listings saved`);
    await browser.close();
    return { scanned: rawListings.length, new: newCount };

  } catch (err) {
    if (browser) await browser.close().catch(() => {});
    _failCount++;
    if (!_failSince) _failSince = Date.now();

    const failHours = (Date.now() - _failSince) / (1000 * 60 * 60);
    if (failHours >= MAX_FAIL_HOURS) {
      _circuitOpen = true;
      console.error(`[Scanner] CIRCUIT BREAKER OPEN — failed for ${failHours.toFixed(1)} hours. Check cookies.json.`);
    } else {
      console.error(`[Scanner] Error (attempt ${_failCount}): ${err.message}`);
    }
    return { scanned: 0, new: 0, error: err.message };
  }
}

async function startLoop() {
  const cfg = config.get();
  const interval = cfg.scanner.interval_minutes * 60 * 1000;
  console.log(`[Scanner] Starting — scanning every ${cfg.scanner.interval_minutes} minutes`);

  await scanOnce();
  setInterval(() => scanOnce(), interval);
}

module.exports = { scanOnce, startLoop };
```

- [ ] **Step 2: Manual smoke test**

Before this works, you need `cookies.json`. Test without it first to verify graceful error:
```bash
cd /c/Users/Blake/Projects/apollos-table
node -e "require('./shared/config').load(); require('./shared/db').init(); const s = require('./scanner/scraper'); s.scanOnce().then(console.log)"
```
Expected: Error message about missing cookies.json

- [ ] **Step 3: Commit**

```bash
git add scanner/scraper.js
git commit -m "feat: add FB Marketplace scanner with stealth Puppeteer and circuit breaker"
```

---

### Task 9: Evaluator — Claude Vision Item Identifier

**Files:**
- Create: `evaluator/identifier.js`
- Create: `test/evaluator/identifier.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// test/evaluator/identifier.test.js
const { expect } = require('chai');

describe('identifier', () => {
  const { buildIdentificationPrompt, parseIdentificationResponse } = require('../../evaluator/identifier');

  it('builds a prompt with listing context', () => {
    const prompt = buildIdentificationPrompt('Free desk', 'Oak desk, 5ft');
    expect(prompt).to.include('Free desk');
    expect(prompt).to.include('Oak desk');
    expect(prompt).to.include('ebay_search_query');
  });

  it('parses valid JSON response', () => {
    const json = JSON.stringify({
      item_type: 'desk',
      brand: 'IKEA',
      model: 'MALM',
      condition: 'good',
      weight_class: '30_70lb',
      ebay_search_query: 'IKEA MALM desk',
      notes: 'Standard office desk'
    });
    const result = parseIdentificationResponse(json);
    expect(result.item_type).to.equal('desk');
    expect(result.ebay_search_query).to.equal('IKEA MALM desk');
  });

  it('parses JSON wrapped in markdown code fence', () => {
    const text = '```json\n{"item_type":"chair","brand":null,"model":null,"condition":"fair","weight_class":"10_30lb","ebay_search_query":"office chair","notes":"generic"}\n```';
    const result = parseIdentificationResponse(text);
    expect(result.item_type).to.equal('chair');
  });

  it('returns null for unparseable response', () => {
    const result = parseIdentificationResponse('I cannot identify this item');
    expect(result).to.be.null;
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --grep "identifier"`
Expected: FAIL

- [ ] **Step 3: Write implementation**

```javascript
// evaluator/identifier.js
const Anthropic = require('@anthropic-ai/sdk').default;
const { imageToBase64 } = require('../scanner/images');

let _client = null;

function getClient() {
  if (!_client) {
    _client = process.env.ANTHROPIC_API_KEY
      ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
      : new Anthropic();
  }
  return _client;
}

function buildIdentificationPrompt(title, description) {
  return `You are an expert resale evaluator. Identify this item from the photos and listing info.

Listing title: "${title}"
Listing description: "${description || 'none provided'}"

Return ONLY a JSON object with these exact fields:
{
  "item_type": "what this item is (e.g., 'office chair', 'power drill', 'monitor')",
  "brand": "brand name or null if not identifiable",
  "model": "model name/number or null if not identifiable",
  "condition": "new|like-new|good|fair|poor",
  "weight_class": "under_10lb|10_30lb|30_70lb|70lb_plus",
  "ebay_search_query": "the exact search string you would use on eBay to find sold comps for this item",
  "notes": "anything that affects resale value (missing parts, damage, collectibility, etc.)"
}

For ebay_search_query: be specific enough to find this exact item but general enough to get results. Include brand and model if known. Example: "Herman Miller Aeron office chair size B" not just "chair".

If you cannot identify the item at all from the photos, return: {"item_type": null}`;
}

function parseIdentificationResponse(text) {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // Try extracting JSON from markdown code fence
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch { /* fall through */ }
    }
    return null;
  }
}

async function identifyItem(listing) {
  const images = JSON.parse(listing.images || '[]');
  if (images.length === 0) return null;

  const imageContent = [];
  for (const imgPath of images.slice(0, 5)) {
    const b64 = imageToBase64(imgPath);
    if (b64) {
      imageContent.push({
        type: 'image',
        source: { type: 'base64', ...b64 }
      });
    }
  }

  if (imageContent.length === 0) return null;

  const prompt = buildIdentificationPrompt(listing.title, listing.description);

  const response = await getClient().messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 500,
    messages: [{
      role: 'user',
      content: [
        ...imageContent,
        { type: 'text', text: prompt }
      ]
    }]
  });

  const result = parseIdentificationResponse(response.content[0].text);
  if (!result || !result.item_type) return null;
  return result;
}

module.exports = { buildIdentificationPrompt, parseIdentificationResponse, identifyItem };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --grep "identifier"`
Expected: 4 passing

- [ ] **Step 5: Commit**

```bash
git add evaluator/identifier.js test/evaluator/identifier.test.js
git commit -m "feat: add Claude Vision item identifier with structured JSON output"
```

---

### Task 10: Evaluator — eBay Sold Comps Scraper

**Files:**
- Create: `evaluator/comps.js`
- Create: `test/evaluator/comps.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// test/evaluator/comps.test.js
const { expect } = require('chai');

describe('comps', () => {
  const { parseEbaySoldPrices, calculateCompStats } = require('../../evaluator/comps');

  it('calculates stats from an array of sold prices', () => {
    const prices = [50, 75, 100, 125, 150];
    const stats = calculateCompStats(prices);
    expect(stats.median).to.equal(100);
    expect(stats.min).to.equal(50);
    expect(stats.max).to.equal(150);
    expect(stats.average).to.equal(100);
    expect(stats.count).to.equal(5);
  });

  it('handles even-length price arrays for median', () => {
    const prices = [50, 100, 150, 200];
    const stats = calculateCompStats(prices);
    expect(stats.median).to.equal(125);
  });

  it('returns null stats for empty array', () => {
    const stats = calculateCompStats([]);
    expect(stats).to.be.null;
  });

  it('parses price strings from eBay format', () => {
    const priceTexts = ['$49.99', '$125.00', '$75.50'];
    const prices = priceTexts.map(p => parseEbaySoldPrices(p)).filter(Boolean);
    expect(prices).to.deep.equal([49.99, 125.00, 75.50]);
  });

  it('handles "to" range prices by taking the higher value', () => {
    expect(parseEbaySoldPrices('$50.00 to $75.00')).to.equal(75.00);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --grep "comps"`
Expected: FAIL

- [ ] **Step 3: Write implementation**

```javascript
// evaluator/comps.js
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

function parseEbaySoldPrices(priceText) {
  if (!priceText) return null;
  // Handle range prices like "$50.00 to $75.00" — take the higher
  const rangeMatch = priceText.match(/\$([\d,.]+)\s+to\s+\$([\d,.]+)/);
  if (rangeMatch) {
    return parseFloat(rangeMatch[2].replace(/,/g, ''));
  }
  const match = priceText.match(/\$([\d,.]+)/);
  if (!match) return null;
  return parseFloat(match[1].replace(/,/g, ''));
}

function calculateCompStats(prices) {
  if (!prices || prices.length === 0) return null;

  const sorted = [...prices].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];

  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    median: median,
    average: Math.round(prices.reduce((a, b) => a + b, 0) / prices.length * 100) / 100,
    count: prices.length
  };
}

async function fetchSoldComps(searchQuery) {
  const encoded = encodeURIComponent(searchQuery);
  const url = `https://www.ebay.com/sch/i.html?_nkw=${encoded}&LH_Complete=1&LH_Sold=1&_sop=13`;

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 });

    const prices = await page.evaluate(() => {
      const results = [];
      // eBay sold listings show prices in .s-item__price spans
      const items = document.querySelectorAll('.s-item');
      items.forEach(item => {
        const priceEl = item.querySelector('.s-item__price');
        if (priceEl) results.push(priceEl.textContent.trim());
      });
      return results;
    });

    await browser.close();

    const parsed = prices.map(p => parseEbaySoldPrices(p)).filter(p => p !== null && p > 0);
    return calculateCompStats(parsed);
  } catch (err) {
    if (browser) await browser.close().catch(() => {});
    console.error(`[Comps] Error fetching comps for "${searchQuery}": ${err.message}`);
    return null;
  }
}

module.exports = { parseEbaySoldPrices, calculateCompStats, fetchSoldComps };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --grep "comps"`
Expected: 5 passing

- [ ] **Step 5: Commit**

```bash
git add evaluator/comps.js test/evaluator/comps.test.js
git commit -m "feat: add eBay sold comps scraper with price parsing and stats"
```

---

### Task 11: Evaluator — Shipping Estimator

**Files:**
- Create: `evaluator/shipping.js`
- Create: `test/evaluator/shipping.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// test/evaluator/shipping.test.js
const { expect } = require('chai');

describe('shipping', () => {
  const { estimateShipping } = require('../../evaluator/shipping');

  it('returns cost for under_10lb items', () => {
    const est = estimateShipping('under_10lb');
    expect(est.cost).to.equal(13);
    expect(est.channel).to.equal('ebay');
  });

  it('returns cost for 30_70lb items', () => {
    const est = estimateShipping('30_70lb');
    expect(est.cost).to.equal(50);
    expect(est.channel).to.equal('ebay');
  });

  it('flags 70lb_plus as local_sell_recommended', () => {
    const est = estimateShipping('70lb_plus');
    expect(est.channel).to.equal('local');
    expect(est.local_cost).to.equal(0);
  });

  it('falls back to 30_70lb for unknown weight class', () => {
    const est = estimateShipping('unknown');
    expect(est.cost).to.equal(50);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --grep "shipping"`
Expected: FAIL

- [ ] **Step 3: Write implementation**

```javascript
// evaluator/shipping.js
const config = require('../shared/config');

function estimateShipping(weightClass) {
  const cfg = config.get();
  const estimates = cfg.shipping_estimates;

  if (weightClass === '70lb_plus') {
    return {
      cost: estimates['70lb_plus'] || 75,
      local_cost: 0,
      channel: 'local',
      note: 'Heavy item — local sale recommended, but eBay shipping possible at this cost'
    };
  }

  const cost = estimates[weightClass] || estimates['30_70lb'] || 50;
  return {
    cost,
    local_cost: 0,
    channel: 'ebay'
  };
}

module.exports = { estimateShipping };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --grep "shipping"`
Expected: 4 passing

- [ ] **Step 5: Commit**

```bash
git add evaluator/shipping.js test/evaluator/shipping.test.js
git commit -m "feat: add weight-class shipping cost estimator"
```

---

### Task 12: Evaluator — Profit Calculator and Grader

**Files:**
- Create: `evaluator/profit.js`
- Create: `test/evaluator/profit.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// test/evaluator/profit.test.js
const { expect } = require('chai');

describe('profit', () => {
  // Load config before tests
  before(() => require('../../shared/config').load());

  const { calculateProfit, gradeDeal } = require('../../evaluator/profit');

  it('calculates net profit for a free item sold on eBay', () => {
    const result = calculateProfit({
      purchase_price: 0,
      ebay_median_price: 150,
      shipping_cost: 13,
      distance_miles: 5
    });
    // 150 - 0 - (150*0.1305) - (150*0.0295 + 0.30) - 13 - (5*2*0.67)
    // 150 - 19.575 - 4.725 - 13 - 6.7 = 106.00
    expect(result.net_profit).to.be.within(105, 107);
    expect(result.profit_per_mile).to.be.within(20, 22);
    expect(result.total_fees).to.be.within(24, 25);
  });

  it('calculates profit for a $20 item', () => {
    const result = calculateProfit({
      purchase_price: 20,
      ebay_median_price: 100,
      shipping_cost: 27,
      distance_miles: 15
    });
    // 100 - 20 - (100*0.1305) - (100*0.0295 + 0.30) - 27 - (15*2*0.67)
    // 100 - 20 - 13.05 - 3.25 - 27 - 20.1 = 16.60
    expect(result.net_profit).to.be.within(16, 17);
  });

  it('uses floored distance of 1.0 for very close items', () => {
    const result = calculateProfit({
      purchase_price: 0,
      ebay_median_price: 200,
      shipping_cost: 13,
      distance_miles: 0.2
    });
    // profit_per_mile should use max(0.2, 1.0) = 1.0
    expect(result.profit_per_mile).to.equal(
      Math.round(result.net_profit / 1.0 * 100) / 100
    );
  });

  it('grades an A deal correctly', () => {
    const grade = gradeDeal({ net_profit: 100, profit_per_mile: 10, ebay_sold_count: 8 });
    expect(grade).to.equal('A');
  });

  it('grades a B deal correctly', () => {
    const grade = gradeDeal({ net_profit: 40, profit_per_mile: 4, ebay_sold_count: 4 });
    expect(grade).to.equal('B');
  });

  it('grades a C deal correctly', () => {
    const grade = gradeDeal({ net_profit: 20, profit_per_mile: 1, ebay_sold_count: 1 });
    expect(grade).to.equal('C');
  });

  it('grades an F deal correctly', () => {
    const grade = gradeDeal({ net_profit: 10, profit_per_mile: 1, ebay_sold_count: 1 });
    expect(grade).to.equal('F');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --grep "profit"`
Expected: FAIL

- [ ] **Step 3: Write implementation**

```javascript
// evaluator/profit.js
const config = require('../shared/config');
const { flooredDistance } = require('../shared/distance');

function calculateProfit({ purchase_price, ebay_median_price, shipping_cost, distance_miles }) {
  const cfg = config.get().ebay;

  const fvf = ebay_median_price * cfg.final_value_fee_rate;
  const processing = (ebay_median_price * cfg.payment_processing_rate) + cfg.payment_processing_flat;
  const total_fees = Math.round((fvf + processing) * 100) / 100;

  const gas_cost = Math.round(distance_miles * 2 * cfg.gas_cost_per_mile * 100) / 100;

  const net_profit = Math.round(
    (ebay_median_price - purchase_price - total_fees - shipping_cost - gas_cost) * 100
  ) / 100;

  const profit_per_mile = Math.round(
    (net_profit / flooredDistance(distance_miles)) * 100
  ) / 100;

  return { net_profit, profit_per_mile, total_fees, gas_cost };
}

function gradeDeal({ net_profit, profit_per_mile, ebay_sold_count }) {
  const cfg = config.get().evaluator;

  if (net_profit >= 75 && profit_per_mile >= 5 && ebay_sold_count >= 5) return 'A';
  if (net_profit >= 30 && profit_per_mile >= 3 && ebay_sold_count >= 3) return 'B';
  if (net_profit >= 15) return 'C';
  return 'F';
}

module.exports = { calculateProfit, gradeDeal };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --grep "profit"`
Expected: 7 passing

- [ ] **Step 5: Commit**

```bash
git add evaluator/profit.js test/evaluator/profit.test.js
git commit -m "feat: add profit calculator with eBay fee model and deal grading"
```

---

### Task 13: Evaluator — Alerts

**Files:**
- Create: `evaluator/alerts.js`
- Create: `test/evaluator/alerts.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// test/evaluator/alerts.test.js
const { expect } = require('chai');

describe('alerts', () => {
  const { shouldAlert, formatAlertMessage } = require('../../evaluator/alerts');

  it('alerts on grade A deals', () => {
    expect(shouldAlert('A')).to.deep.equal({ desktop: true, email: false });
  });

  it('alerts desktop only on grade B deals', () => {
    expect(shouldAlert('B')).to.deep.equal({ desktop: true, email: false });
  });

  it('does not alert on grade C or F', () => {
    expect(shouldAlert('C')).to.deep.equal({ desktop: false, email: false });
    expect(shouldAlert('F')).to.deep.equal({ desktop: false, email: false });
  });

  it('formats a readable alert message', () => {
    const msg = formatAlertMessage({
      title: 'Free Standing Desk',
      grade: 'A',
      net_profit: 120,
      distance_miles: 5,
      location: 'Nashua NH'
    });
    expect(msg).to.include('Free Standing Desk');
    expect(msg).to.include('$120');
    expect(msg).to.include('5');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --grep "alerts"`
Expected: FAIL

- [ ] **Step 3: Write implementation**

```javascript
// evaluator/alerts.js
const notifier = require('node-notifier');
const nodemailer = require('nodemailer');
const config = require('../shared/config');

function shouldAlert(grade) {
  const cfg = config.get().alerts;
  if (grade === 'A') return { desktop: cfg.desktop, email: cfg.email };
  if (grade === 'B') return { desktop: cfg.desktop, email: false };
  return { desktop: false, email: false };
}

function formatAlertMessage({ title, grade, net_profit, distance_miles, location }) {
  return `[Grade ${grade}] ${title}\nEst. profit: $${net_profit} | ${distance_miles} mi | ${location}`;
}

async function sendAlert(deal) {
  const { desktop, email } = shouldAlert(deal.grade);
  const message = formatAlertMessage(deal);

  if (desktop) {
    notifier.notify({
      title: `Apollo's Table — Grade ${deal.grade} Deal`,
      message: `${deal.title}\n$${deal.net_profit} profit | ${deal.distance_miles} mi`,
      sound: true
    });
    console.log(`[Alert] Desktop notification sent: ${deal.title}`);
  }

  if (email) {
    try {
      const emailAddr = process.env.ALERT_EMAIL;
      const smtpPass = process.env.SMTP_PASSWORD;
      if (!emailAddr || !smtpPass) return;

      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: emailAddr, pass: smtpPass }
      });

      await transporter.sendMail({
        from: emailAddr,
        to: emailAddr,
        subject: `Apollo's Table: Grade ${deal.grade} — ${deal.title}`,
        html: `
          <h2>Grade ${deal.grade} Deal Found</h2>
          <p><strong>${deal.title}</strong></p>
          <p>Est. Profit: <strong>$${deal.net_profit}</strong></p>
          <p>Distance: ${deal.distance_miles} miles (${deal.location})</p>
          <p>Item: ${deal.item_type || 'unknown'} ${deal.brand ? '— ' + deal.brand : ''}</p>
          <p><a href="${deal.url}" style="font-size:18px;font-weight:bold">VIEW LISTING</a></p>
          <hr><p style="color:#888;font-size:12px">Apollo's Table — apollostable.com</p>
        `
      });
      console.log(`[Alert] Email sent: ${deal.title}`);
    } catch (err) {
      console.error(`[Alert] Email failed: ${err.message}`);
    }
  }
}

module.exports = { shouldAlert, formatAlertMessage, sendAlert };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --grep "alerts"`
Expected: 4 passing

- [ ] **Step 5: Commit**

```bash
git add evaluator/alerts.js test/evaluator/alerts.test.js
git commit -m "feat: add desktop and email alert system"
```

---

### Task 14: Evaluator — Main Evaluation Pipeline

**Files:**
- Create: `evaluator/index.js`

Wires together: identifier → comps → shipping → profit → grade → alert. Integration-level — depends on live APIs.

- [ ] **Step 1: Write evaluator/index.js**

```javascript
// evaluator/index.js
require('dotenv').config();
const db = require('../shared/db');
const config = require('../shared/config');
const { milesToLocation } = require('../shared/distance');
const { identifyItem } = require('./identifier');
const { fetchSoldComps } = require('./comps');
const { estimateShipping } = require('./shipping');
const { calculateProfit, gradeDeal } = require('./profit');
const { sendAlert } = require('./alerts');

async function evaluateListing(listing) {
  const cfg = config.get();
  const home = { latitude: cfg.location.latitude, longitude: cfg.location.longitude };

  console.log(`[Eval] Evaluating: "${listing.title}" (${listing.url})`);

  // Step 1: Identify item via Claude Vision
  const identification = await identifyItem(listing);
  if (!identification) {
    console.log(`[Eval] Could not identify item — skipping`);
    db.updateListingStatus(listing.id, 'evaluated');
    return null;
  }
  console.log(`[Eval] Identified: ${identification.item_type} ${identification.brand || ''} ${identification.model || ''}`);

  // Step 2: Fetch eBay sold comps
  const comps = await fetchSoldComps(identification.ebay_search_query);
  const ebayMedian = comps ? comps.median : 0;
  const ebayCount = comps ? comps.count : 0;
  const insufficientData = ebayCount < cfg.evaluator.min_comps;

  if (!comps || ebayMedian === 0) {
    console.log(`[Eval] No sold comps found — skipping`);
    db.updateListingStatus(listing.id, 'evaluated');
    return null;
  }
  console.log(`[Eval] Comps: $${ebayMedian} median (${ebayCount} sold)`);

  // Step 3: Estimate shipping
  const shipping = estimateShipping(identification.weight_class);
  const shippingCost = shipping.channel === 'local' ? 0 : shipping.cost;

  // Step 4: Calculate profit
  const distance = listing.distance_miles || milesToLocation(home, {
    latitude: listing.latitude || home.latitude,
    longitude: listing.longitude || home.longitude
  });

  const profit = calculateProfit({
    purchase_price: listing.price || 0,
    ebay_median_price: ebayMedian,
    shipping_cost: shippingCost,
    distance_miles: distance
  });

  // Step 5: Grade
  const grade = gradeDeal({
    net_profit: profit.net_profit,
    profit_per_mile: profit.profit_per_mile,
    ebay_sold_count: ebayCount
  });

  const sellChannel = shipping.channel === 'local' ? 'local' :
    (profit.net_profit < 15 ? 'local' : 'ebay');

  // Check radius limits
  const radiusLimits = cfg.radius;
  const maxRadius = grade === 'A' ? radiusLimits.grade_a_miles :
    grade === 'B' ? radiusLimits.grade_b_miles :
    radiusLimits.grade_c_miles;

  if (distance > maxRadius) {
    console.log(`[Eval] Grade ${grade} but ${distance}mi exceeds ${maxRadius}mi limit — downgrading`);
  }

  console.log(`[Eval] Grade: ${grade} | Profit: $${profit.net_profit} | $/mi: ${profit.profit_per_mile}`);

  // Step 6: Save evaluation
  const evalId = db.insertEvaluation({
    listing_id: listing.id,
    item_type: identification.item_type,
    brand: identification.brand,
    model: identification.model,
    condition: identification.condition,
    weight_class: identification.weight_class,
    ebay_search_query: identification.ebay_search_query,
    ebay_median_price: ebayMedian,
    ebay_sold_count: ebayCount,
    ebay_avg_days_to_sell: comps ? comps.avg_days || null : null,
    shipping_estimate: shippingCost,
    ebay_fees: profit.total_fees,
    gas_cost: profit.gas_cost,
    net_profit: profit.net_profit,
    profit_per_mile: profit.profit_per_mile,
    grade,
    sell_channel: sellChannel,
    notes: insufficientData
      ? `[LOW DATA: only ${ebayCount} comps] ${identification.notes || ''}`
      : (identification.notes || '')
  });

  db.updateListingStatus(listing.id, 'evaluated');

  // Step 7: Alert if worthy
  if (grade === 'A' || grade === 'B') {
    await sendAlert({
      title: listing.title,
      grade,
      net_profit: profit.net_profit,
      distance_miles: distance,
      location: listing.location,
      item_type: identification.item_type,
      brand: identification.brand,
      url: listing.url
    });
  }

  return { evalId, grade, net_profit: profit.net_profit };
}

async function evaluateAll() {
  const pending = db.getPendingListings();
  console.log(`[Eval] ${pending.length} listings pending evaluation`);

  const results = [];
  for (const listing of pending) {
    const result = await evaluateListing(listing);
    results.push(result);
    // Throttle between evaluations
    await new Promise(r => setTimeout(r, 1000));
  }

  const graded = results.filter(Boolean);
  const aCount = graded.filter(r => r.grade === 'A').length;
  const bCount = graded.filter(r => r.grade === 'B').length;
  console.log(`[Eval] Done: ${graded.length} evaluated (${aCount} A, ${bCount} B)`);
  return results;
}

module.exports = { evaluateListing, evaluateAll };
```

- [ ] **Step 2: Commit**

```bash
git add evaluator/index.js
git commit -m "feat: add evaluation pipeline — identify, comp, price, grade, alert"
```

---

### Task 15: CLI Entry Point

**Files:**
- Create: `cli.js`

- [ ] **Step 1: Write cli.js**

```javascript
#!/usr/bin/env node
// cli.js — Apollo's Table CLI
require('dotenv').config();
const { program } = require('commander');
const config = require('./shared/config');
const db = require('./shared/db');

config.load();
db.init();

program
  .name('apollo')
  .description("Apollo's Table — automated resale deal sniper")
  .version('0.1.0');

program
  .command('scan')
  .description('Start scanning FB Marketplace (runs continuously)')
  .option('--once', 'Run one scan cycle and exit')
  .action(async (opts) => {
    const { scanOnce, startLoop } = require('./scanner/scraper');
    if (opts.once) {
      await scanOnce();
      process.exit(0);
    } else {
      await startLoop();
    }
  });

program
  .command('eval')
  .description('Evaluate all pending listings')
  .action(async () => {
    const { evaluateAll } = require('./evaluator');
    await evaluateAll();
    process.exit(0);
  });

program
  .command('deals')
  .description('Show top deals')
  .option('-n, --limit <number>', 'Number of deals to show', '20')
  .action((opts) => {
    const deals = db.getTopDeals(parseInt(opts.limit));
    if (deals.length === 0) {
      console.log('No deals found yet. Run "apollo scan" then "apollo eval" first.');
      return;
    }
    console.log(`\nTop ${deals.length} deals:\n`);
    deals.forEach((d, i) => {
      const grade = d.grade === 'A' ? '\x1b[32mA\x1b[0m' : '\x1b[33mB\x1b[0m';
      console.log(
        `${i + 1}. [${grade}] ${d.title}\n` +
        `   $${d.net_profit} profit | ${d.distance_miles}mi | $${d.profit_per_mile}/mi | ${d.item_type}\n` +
        `   eBay: $${d.ebay_median_price} median (${d.ebay_sold_count} sold) | ${d.url}\n`
      );
    });
  });

program
  .command('grab <id>')
  .description('Mark a deal as "grabbing it" — moves to inventory')
  .action((id) => {
    try {
      const invId = db.grabDeal(parseInt(id));
      console.log(`Deal ${id} moved to inventory (inventory #${invId})`);
    } catch (err) {
      console.error(err.message);
    }
  });

program
  .command('stats')
  .description('Show profit summary')
  .action(() => {
    const deals = db.getTopDeals(1000);
    const aDeals = deals.filter(d => d.grade === 'A');
    const bDeals = deals.filter(d => d.grade === 'B');
    const totalProfit = deals.reduce((sum, d) => sum + d.net_profit, 0);

    console.log('\nApollo\'s Table — Stats\n');
    console.log(`Grade A deals found: ${aDeals.length}`);
    console.log(`Grade B deals found: ${bDeals.length}`);
    console.log(`Total potential profit: $${totalProfit.toFixed(2)}`);
    if (deals.length > 0) {
      console.log(`Avg profit per deal: $${(totalProfit / deals.length).toFixed(2)}`);
      console.log(`Best deal: "${deals[0].title}" — $${deals[0].net_profit}`);
    }
  });

program.parse();
```

- [ ] **Step 2: Make cli.js executable and test help output**

```bash
chmod +x cli.js
node cli.js --help
```

Expected: Shows command list (scan, eval, deals, grab, stats)

- [ ] **Step 3: Commit**

```bash
git add cli.js
git commit -m "feat: add CLI entry point with scan, eval, deals, grab, stats commands"
```

---

### Task 16: End-to-End Smoke Test

- [ ] **Step 1: Run full test suite**

```bash
cd /c/Users/Blake/Projects/apollos-table
npm test
```

Expected: All tests pass (config, distance, db, cookies, parser, identifier, comps, shipping, profit, alerts)

- [ ] **Step 2: Test CLI commands without live data**

```bash
node cli.js deals
node cli.js stats
```

Expected: "No deals found" / empty stats (clean DB)

- [ ] **Step 3: Test scan with missing cookies (graceful error)**

```bash
node cli.js scan --once
```

Expected: Error about missing cookies.json — not a crash

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: smoke test fixes"
```

---

### Task 17: GitHub Remote + Push

- [ ] **Step 1: Create GitHub repo**

```bash
cd /c/Users/Blake/Projects/apollos-table
gh repo create apollos-table --private --source=. --remote=origin
```

- [ ] **Step 2: Push to remote**

```bash
git push -u origin master
```

- [ ] **Step 3: Verify on GitHub**

```bash
gh repo view --web
```

---

### Task 18: Cookie Setup Guide

- [ ] **Step 1: Create SETUP.md with cookie export instructions**

Create a short setup guide at the project root. Not a README — just the bare minimum to get running.

```markdown
# Setup

## 1. Install dependencies
npm install

## 2. Environment variables
cp .env.example .env
# Edit .env with your Anthropic API key and optional email credentials

## 3. Facebook cookies (required for scanning)
1. Open Chrome, log into Facebook
2. Install "EditThisCookie" extension (or similar)
3. Go to facebook.com/marketplace
4. Export all cookies → save as `cookies.json` in this directory
5. Verify: file should be a JSON array of cookie objects with `c_user` and `xs` entries

## 4. Run
node cli.js scan --once    # Test one scan cycle
node cli.js eval           # Evaluate findings
node cli.js deals          # See what's worth grabbing
```

- [ ] **Step 2: Commit**

```bash
git add SETUP.md
git commit -m "docs: add setup guide for cookie export and first run"
```
