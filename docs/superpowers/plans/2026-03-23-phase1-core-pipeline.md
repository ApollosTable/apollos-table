# Phase 1: Core Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the existing CLI scanner into a local operations dashboard with Lane 1 (Sales Funnel) fully operational end-to-end: discover → scan → report → email outreach → follow-up → track replies.

**Architecture:** Express API server wrapping the existing CLI logic, React+Vite frontend for the local dashboard, extended SQLite schema with explicit pipeline stages and regions. Email via Nodemailer/SMTP. Background jobs via node-cron. Existing CLI and public GitHub Pages site remain unchanged.

**Tech Stack:** Node.js, Express, React, Vite, SQLite (better-sqlite3), Nodemailer, node-cron, @anthropic-ai/sdk

**Spec:** `docs/superpowers/specs/2026-03-23-operations-platform-design.md`

---

## File Structure

### Existing files to modify
- `shared/db.js` — Extended schema migration, new tables, new query functions
- `security/discover.js` — Accept region_id param, use domain column for O(1) dedup
- `security/reporter.js` — Add scope generation function
- `package.json` — Add express, cors, node-cron, concurrently deps
- `cli.js` — Add region commands, update discover to use regions

### New files to create

**Server layer:**
- `server.js` — Express app entry point, mounts API routes, serves React app, starts cron jobs
- `server/api/businesses.js` — Business CRUD, batch operations, pipeline stage transitions
- `server/api/scan.js` — Trigger scans via API
- `server/api/reports.js` — Generate/approve/publish reports via API
- `server/api/outreach.js` — Draft/send/track outreach emails via API
- `server/api/regions.js` — Region CRUD
- `server/api/stats.js` — Dashboard stats endpoint

**Infrastructure:**
- `shared/email.js` — Nodemailer send function, rate limiting, CAN-SPAM footer
- `shared/jobs.js` — node-cron background jobs (follow-up, cold-pool, backup)

**Frontend (React + Vite):**
- `app/index.html` — Vite entry point
- `app/src/main.jsx` — React app mount
- `app/src/App.jsx` — Router shell, lane navigation
- `app/src/api.js` — Fetch wrapper for all API calls
- `app/src/components/StatsBar.jsx` — Top-level stats (discovered, scanned, reports, outreach, responses)
- `app/src/components/Pipeline.jsx` — Lane 1 kanban board
- `app/src/components/BusinessCard.jsx` — Card in pipeline kanban
- `app/src/components/BusinessDetail.jsx` — Full detail view (scan results, report, email draft)
- `app/src/components/RegionPicker.jsx` — Region selector + add region form
- `app/src/components/BatchActions.jsx` — Batch scan/report/outreach buttons
- `app/vite.config.js` — Vite config with API proxy to Express

**Config:**
- `.env.example` — Template for SMTP config, API keys

---

## Task 1: Database Schema Migration

**Files:**
- Modify: `shared/db.js`

This extends the existing schema with new tables (regions, clients, projects, interactions, job_runs, scheduled_scans, support_tickets) and new columns on existing tables (businesses, outreach, scans). All existing data and CLI functionality must continue working.

- [ ] **Step 1: Write the failing test for new schema**

Create `tests/db.test.js`:
```javascript
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Use a temp DB for tests
const TEST_DB = path.join(__dirname, '..', 'test.db');

function freshDb() {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  // Force re-init by clearing module cache
  delete require.cache[require.resolve('../shared/db')];
  process.env.APOLLO_DB_PATH = TEST_DB;
  return require('../shared/db');
}

afterAll(() => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  delete process.env.APOLLO_DB_PATH;
});

describe('schema migration', () => {
  test('businesses table has new columns', () => {
    const db = freshDb();
    const raw = db.getDb();
    const cols = raw.pragma('table_info(businesses)').map(c => c.name);
    expect(cols).toContain('pipeline_stage');
    expect(cols).toContain('region_id');
    expect(cols).toContain('domain');
    expect(cols).toContain('cold_pool_until');
    expect(cols).toContain('referral_source');
    expect(cols).toContain('unsubscribed');
    db.close();
  });

  test('regions table exists', () => {
    const db = freshDb();
    const raw = db.getDb();
    const tables = raw.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
    expect(tables).toContain('regions');
    db.close();
  });

  test('clients table exists', () => {
    const db = freshDb();
    const raw = db.getDb();
    const tables = raw.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
    expect(tables).toContain('clients');
    db.close();
  });

  test('outreach table has new columns', () => {
    const db = freshDb();
    const raw = db.getDb();
    const cols = raw.pragma('table_info(outreach)').map(c => c.name);
    expect(cols).toContain('email_subject');
    expect(cols).toContain('email_body');
    expect(cols).toContain('follow_up_count');
    expect(cols).toContain('follow_up_due');
    expect(cols).toContain('reply_text');
    expect(cols).toContain('reply_classification');
    db.close();
  });

  test('scans table has source column', () => {
    const db = freshDb();
    const raw = db.getDb();
    const cols = raw.pragma('table_info(scans)').map(c => c.name);
    expect(cols).toContain('source');
    db.close();
  });

  test('interactions table exists', () => {
    const db = freshDb();
    const raw = db.getDb();
    const tables = raw.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
    expect(tables).toContain('interactions');
    db.close();
  });

  test('job_runs table exists', () => {
    const db = freshDb();
    const raw = db.getDb();
    const tables = raw.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
    expect(tables).toContain('job_runs');
    db.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /c/Users/Blake/Projects/apollos-table && npx jest tests/db.test.js --verbose`

Expected: FAIL — columns and tables don't exist yet.

- [ ] **Step 3: Install jest as dev dependency**

Run: `cd /c/Users/Blake/Projects/apollos-table && npm install --save-dev jest`

- [ ] **Step 4: Update db.js to support configurable DB path**

In `shared/db.js`, change the DB_PATH line:
```javascript
const DB_PATH = process.env.APOLLO_DB_PATH || path.join(__dirname, '..', 'apollo.db');
```

- [ ] **Step 5: Add new tables and columns to migrate() in db.js**

Add to the `migrate()` function in `shared/db.js`, after the existing CREATE TABLE statements:

```javascript
    // -- V2 schema additions --

    CREATE TABLE IF NOT EXISTS regions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      state TEXT,
      cities TEXT DEFAULT '[]',
      categories TEXT DEFAULT '[]',
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL,
      tier TEXT NOT NULL DEFAULT 'fix',
      status TEXT NOT NULL DEFAULT 'active',
      monthly_rate REAL DEFAULT 0,
      total_paid REAL DEFAULT 0,
      started_at TEXT DEFAULT (datetime('now')),
      churned_at TEXT,
      referred_by INTEGER,
      referral_code TEXT,
      notes TEXT,
      FOREIGN KEY (business_id) REFERENCES businesses(id),
      FOREIGN KEY (referred_by) REFERENCES clients(id)
    );

    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      type TEXT NOT NULL DEFAULT 'fix',
      scope TEXT DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'queued',
      price REAL DEFAULT 0,
      paid_at TEXT,
      started_at TEXT,
      completed_at TEXT,
      stripe_payment_link TEXT,
      verification_scan_id INTEGER,
      FOREIGN KEY (client_id) REFERENCES clients(id),
      FOREIGN KEY (verification_scan_id) REFERENCES scans(id)
    );

    CREATE TABLE IF NOT EXISTS support_tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      subject TEXT,
      body TEXT,
      priority TEXT DEFAULT 'normal',
      status TEXT DEFAULT 'new',
      category TEXT,
      response_draft TEXT,
      resolved_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (client_id) REFERENCES clients(id)
    );

    CREATE TABLE IF NOT EXISTS interactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      direction TEXT NOT NULL DEFAULT 'outbound',
      subject TEXT,
      body TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (business_id) REFERENCES businesses(id)
    );

    CREATE TABLE IF NOT EXISTS job_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_name TEXT NOT NULL,
      started_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT,
      result TEXT,
      error TEXT
    );

    CREATE TABLE IF NOT EXISTS scheduled_scans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      frequency TEXT NOT NULL DEFAULT 'weekly',
      last_run TEXT,
      next_run TEXT,
      baseline_scan_id INTEGER,
      alert_threshold INTEGER DEFAULT 5,
      notify_client INTEGER DEFAULT 1,
      FOREIGN KEY (client_id) REFERENCES clients(id),
      FOREIGN KEY (baseline_scan_id) REFERENCES scans(id)
    );

    CREATE INDEX IF NOT EXISTS idx_regions_slug ON regions(slug);
    CREATE INDEX IF NOT EXISTS idx_clients_business ON clients(business_id);
    CREATE INDEX IF NOT EXISTS idx_projects_client ON projects(client_id);
    CREATE INDEX IF NOT EXISTS idx_interactions_business ON interactions(business_id);
```

For altering existing tables (SQLite doesn't support ALTER ADD IF NOT EXISTS), use a safe helper:

```javascript
function addColumnIfMissing(table, column, definition) {
  const cols = db.pragma(`table_info(${table})`).map(c => c.name);
  if (!cols.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

// Businesses additions
addColumnIfMissing('businesses', 'pipeline_stage', "TEXT DEFAULT 'discovered'");
addColumnIfMissing('businesses', 'region_id', 'INTEGER');
addColumnIfMissing('businesses', 'domain', 'TEXT');
addColumnIfMissing('businesses', 'cold_pool_until', 'TEXT');
addColumnIfMissing('businesses', 'referral_source', 'TEXT');
addColumnIfMissing('businesses', 'unsubscribed', 'INTEGER DEFAULT 0');

// Outreach additions
addColumnIfMissing('outreach', 'email_subject', 'TEXT');
addColumnIfMissing('outreach', 'email_body', 'TEXT');
addColumnIfMissing('outreach', 'follow_up_count', 'INTEGER DEFAULT 0');
addColumnIfMissing('outreach', 'follow_up_due', 'TEXT');
addColumnIfMissing('outreach', 'reply_text', 'TEXT');
addColumnIfMissing('outreach', 'reply_classification', 'TEXT');

// Scans additions
addColumnIfMissing('scans', 'source', "TEXT DEFAULT 'manual'");
```

Also create the domain index:
```javascript
db.exec(`CREATE INDEX IF NOT EXISTS idx_businesses_domain ON businesses(domain)`);
```

Backfill domain column for existing rows:
```javascript
const bizWithoutDomain = db.prepare("SELECT id, url FROM businesses WHERE domain IS NULL").all();
for (const b of bizWithoutDomain) {
  try {
    const domain = new URL(b.url.startsWith('http') ? b.url : 'https://' + b.url).hostname;
    db.prepare("UPDATE businesses SET domain = ? WHERE id = ?").run(domain, b.id);
  } catch (e) {}
}
```

Backfill pipeline_stage for existing rows using the old derived logic:
```javascript
db.exec(`
  UPDATE businesses SET pipeline_stage = 'scanned'
  WHERE pipeline_stage = 'discovered'
  AND id IN (SELECT DISTINCT business_id FROM scans);

  UPDATE businesses SET pipeline_stage = 'report_draft'
  WHERE pipeline_stage IN ('discovered', 'scanned')
  AND id IN (SELECT DISTINCT business_id FROM reports WHERE published = 0);

  UPDATE businesses SET pipeline_stage = 'report_published'
  WHERE pipeline_stage IN ('discovered', 'scanned', 'report_draft')
  AND id IN (SELECT DISTINCT business_id FROM reports WHERE published = 1);

  UPDATE businesses SET pipeline_stage = 'outreach_sent'
  WHERE pipeline_stage IN ('discovered', 'scanned', 'report_draft', 'report_published')
  AND id IN (SELECT DISTINCT business_id FROM outreach WHERE sent_at IS NOT NULL);

  UPDATE businesses SET pipeline_stage = 'warm_lead'
  WHERE pipeline_stage IN ('discovered', 'scanned', 'report_draft', 'report_published', 'outreach_sent')
  AND id IN (SELECT DISTINCT business_id FROM outreach WHERE responded_at IS NOT NULL);
`);
```

- [ ] **Step 6: Update getPipeline() to use column instead of CASE derivation**

The existing `getPipeline()` function derives `pipeline_stage` via a CASE statement. Now that we have an explicit column, replace the CASE block with the column value. In `shared/db.js`, update `getPipeline()`:

```javascript
function getPipeline() {
  const db = getDb();
  return db.prepare(`
    SELECT
      b.*,
      s.score,
      s.grade,
      s.scanned_at AS last_scanned,
      r.id AS report_id,
      r.published,
      o.status AS outreach_status,
      o.sent_at AS outreach_sent,
      o.responded_at AS outreach_responded
    FROM businesses b
    LEFT JOIN scans s ON s.id = (SELECT id FROM scans WHERE business_id = b.id ORDER BY scanned_at DESC LIMIT 1)
    LEFT JOIN reports r ON r.id = (SELECT id FROM reports WHERE business_id = b.id ORDER BY created_at DESC LIMIT 1)
    LEFT JOIN outreach o ON o.id = (SELECT id FROM outreach WHERE business_id = b.id ORDER BY id DESC LIMIT 1)
    ORDER BY b.updated_at DESC
  `).all();
}
```

The `pipeline_stage` column on `businesses` is now the source of truth. The backfill in Step 5 ensures existing data is correct.

- [ ] **Step 7: Add new DB helper functions for regions and pipeline**

Add to `shared/db.js` exports:

```javascript
// -- Region operations --
function addRegion({ slug, name, state, cities, categories }) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO regions (slug, name, state, cities, categories)
    VALUES (?, ?, ?, ?, ?)
  `);
  const result = stmt.run(slug, name, state || null, JSON.stringify(cities || []), JSON.stringify(categories || []));
  return { id: result.lastInsertRowid, slug };
}

function getRegion(id) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM regions WHERE id = ?').get(id);
  if (row) {
    row.cities = JSON.parse(row.cities || '[]');
    row.categories = JSON.parse(row.categories || '[]');
  }
  return row;
}

function listRegions() {
  const db = getDb();
  return db.prepare('SELECT * FROM regions WHERE active = 1 ORDER BY name').all().map(r => ({
    ...r,
    cities: JSON.parse(r.cities || '[]'),
    categories: JSON.parse(r.categories || '[]'),
  }));
}

// -- Pipeline stage transitions --
function updatePipelineStage(businessId, stage) {
  const db = getDb();
  db.prepare('UPDATE businesses SET pipeline_stage = ?, updated_at = datetime(\'now\') WHERE id = ?').run(stage, businessId);
}

// -- Domain dedup check --
function businessExistsByDomain(domain) {
  const db = getDb();
  return db.prepare('SELECT id FROM businesses WHERE domain = ?').get(domain);
}

// -- Unsubscribe --
function unsubscribeBusiness(id) {
  const db = getDb();
  db.prepare('UPDATE businesses SET unsubscribed = 1 WHERE id = ?').run(id);
}

// -- Interactions --
function addInteraction({ businessId, type, direction, subject, body }) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO interactions (business_id, type, direction, subject, body)
    VALUES (?, ?, ?, ?, ?)
  `);
  return stmt.run(businessId, type, direction || 'outbound', subject || null, body || null).lastInsertRowid;
}

// -- Job runs --
function logJobStart(jobName) {
  const db = getDb();
  return db.prepare('INSERT INTO job_runs (job_name) VALUES (?)').run(jobName).lastInsertRowid;
}

function logJobEnd(id, result, error) {
  const db = getDb();
  db.prepare("UPDATE job_runs SET completed_at = datetime('now'), result = ?, error = ? WHERE id = ?").run(result || null, error || null, id);
}
```

Update the `module.exports` to include all new functions.

- [ ] **Step 8: Run tests to verify they pass**

Run: `cd /c/Users/Blake/Projects/apollos-table && npx jest tests/db.test.js --verbose`

Expected: All tests PASS.

- [ ] **Step 9: Verify existing CLI still works**

Run: `cd /c/Users/Blake/Projects/apollos-table && node cli.js stats`

Expected: Stats output, no errors. Existing data intact.

- [ ] **Step 10: Commit**

```bash
cd /c/Users/Blake/Projects/apollos-table
git add shared/db.js tests/db.test.js package.json package-lock.json
git commit -m "feat: extend schema with regions, clients, projects, pipeline stages"
```

---

## Task 2: Express Server Scaffold

**Files:**
- Create: `server.js`
- Create: `server/api/stats.js`
- Modify: `package.json`

Stand up the Express server that will serve the API and eventually the React frontend. Start with just the stats endpoint to prove the wiring works.

- [ ] **Step 1: Install dependencies**

Run: `cd /c/Users/Blake/Projects/apollos-table && npm install express cors`

- [ ] **Step 2: Write failing test for server**

Create `tests/server.test.js`:
```javascript
const http = require('http');

const BASE = 'http://localhost:3456';

function get(path) {
  return new Promise((resolve, reject) => {
    http.get(BASE + path, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString();
        resolve({ status: res.statusCode, body: JSON.parse(body) });
      });
    }).on('error', reject);
  });
}

describe('API server', () => {
  let server;

  beforeAll((done) => {
    process.env.PORT = '3456';
    process.env.APOLLO_DB_PATH = require('path').join(__dirname, '..', 'test-server.db');
    server = require('../server');
    // Give server a moment to start
    setTimeout(done, 500);
  });

  afterAll((done) => {
    if (server && server.close) server.close(done);
    else done();
    const fs = require('fs');
    const dbPath = process.env.APOLLO_DB_PATH;
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  test('GET /api/stats returns stats object', async () => {
    const { status, body } = await get('/api/stats');
    expect(status).toBe(200);
    expect(body).toHaveProperty('total');
    expect(body).toHaveProperty('scanned');
    expect(body).toHaveProperty('reported');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd /c/Users/Blake/Projects/apollos-table && npx jest tests/server.test.js --verbose`

Expected: FAIL — server.js doesn't exist.

- [ ] **Step 4: Create server.js**

Create `server.js`:
```javascript
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// API routes
app.use('/api/stats', require('./server/api/stats'));

// Serve React app in production
const appDist = path.join(__dirname, 'app', 'dist');
const fs = require('fs');
if (fs.existsSync(appDist)) {
  app.use(express.static(appDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(appDist, 'index.html'));
  });
}

const server = app.listen(PORT, () => {
  console.log(`Apollo server running on http://localhost:${PORT}`);
});

module.exports = server;
```

- [ ] **Step 5: Create server/api/stats.js**

```javascript
const express = require('express');
const router = express.Router();
const db = require('../../shared/db');

router.get('/', (req, res) => {
  try {
    const stats = db.getStats();
    const regions = db.listRegions();
    res.json({ ...stats, regions });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd /c/Users/Blake/Projects/apollos-table && npx jest tests/server.test.js --verbose`

Expected: PASS.

- [ ] **Step 7: Add npm scripts**

Add to `package.json` scripts:
```json
"server": "node server.js",
"test": "jest --runInBand --forceExit"
```

- [ ] **Step 8: Commit**

```bash
cd /c/Users/Blake/Projects/apollos-table
git add server.js server/api/stats.js tests/server.test.js package.json package-lock.json
git commit -m "feat: add Express server with stats API endpoint"
```

---

## Task 3: Email Infrastructure

**Files:**
- Create: `shared/email.js`
- Create: `.env.example`

Build the shared email sending function. Uses Nodemailer + SMTP. Includes CAN-SPAM footer, rate limiting, and delivery tracking via the interactions table.

- [ ] **Step 1: Write failing test**

Create `tests/email.test.js`:
```javascript
const path = require('path');

// Set test DB before requiring anything
process.env.APOLLO_DB_PATH = path.join(__dirname, '..', 'test-email.db');

describe('email module', () => {
  const fs = require('fs');

  afterAll(() => {
    const dbPath = process.env.APOLLO_DB_PATH;
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  test('buildEmail adds CAN-SPAM footer', () => {
    const { buildEmail } = require('../shared/email');
    const result = buildEmail({
      to: 'test@example.com',
      subject: 'Test',
      body: 'Hello',
    });
    expect(result.html).toContain('Unsubscribe');
    expect(result.html).toContain('Milford, NH');
    expect(result.subject).toBe('Test');
  });

  test('buildEmail includes unsubscribe link', () => {
    const { buildEmail } = require('../shared/email');
    const result = buildEmail({
      to: 'test@example.com',
      subject: 'Test',
      body: 'Hello',
      businessId: 42,
    });
    expect(result.html).toContain('unsubscribe');
    expect(result.html).toContain('42');
  });

  test('sendEmail rejects without SMTP config', async () => {
    delete process.env.SMTP_HOST;
    // Clear module cache to re-init
    delete require.cache[require.resolve('../shared/email')];
    const { sendEmail } = require('../shared/email');
    await expect(sendEmail({
      to: 'test@example.com',
      subject: 'Test',
      body: 'Hello',
    })).rejects.toThrow(/SMTP/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /c/Users/Blake/Projects/apollos-table && npx jest tests/email.test.js --verbose`

Expected: FAIL — email.js doesn't exist.

- [ ] **Step 3: Create shared/email.js**

```javascript
const nodemailer = require('nodemailer');
const config = require('./config').load();

let transporter = null;
let emailsSentThisHour = 0;
let hourStart = Date.now();

const RATE_LIMIT = parseInt(process.env.EMAIL_RATE_LIMIT || '50', 10);

function getTransporter() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error('SMTP not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS in .env');
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  return transporter;
}

function buildEmail({ to, subject, body, businessId }) {
  const contact = config.contact || {};
  const address = contact.address || 'Milford, NH 03055';
  const fromName = contact.name || 'Blake Corbit';
  const fromEmail = process.env.SMTP_USER || contact.email || 'noreply@example.com';
  const publicDomain = contact.website || 'apollostable.com';

  const unsubUrl = businessId
    ? `https://${publicDomain}/unsubscribe?id=${businessId}`
    : '#';

  const footer = `
    <hr style="margin-top:32px;border:none;border-top:1px solid #ddd;">
    <p style="font-size:11px;color:#999;margin-top:12px;">
      ${fromName} · ${address}<br>
      <a href="${unsubUrl}" style="color:#999;">Unsubscribe</a>
    </p>
  `;

  const html = `
    <div style="font-family:sans-serif;font-size:14px;line-height:1.6;color:#333;max-width:600px;">
      ${body.replace(/\n/g, '<br>')}
      ${footer}
    </div>
  `;

  return {
    from: `"${fromName}" <${fromEmail}>`,
    to,
    subject,
    html,
    text: body + `\n\n---\n${fromName} · ${address}\nUnsubscribe: ${unsubUrl}`,
  };
}

async function sendEmail({ to, subject, body, businessId }) {
  // Rate limiting
  const now = Date.now();
  if (now - hourStart > 3600000) {
    emailsSentThisHour = 0;
    hourStart = now;
  }
  if (emailsSentThisHour >= RATE_LIMIT) {
    throw new Error(`Rate limit reached (${RATE_LIMIT}/hour). Try again later.`);
  }

  const transport = getTransporter();
  const email = buildEmail({ to, subject, body, businessId });
  const result = await transport.sendMail(email);

  emailsSentThisHour++;

  // Log interaction if db available and businessId provided
  if (businessId) {
    try {
      const db = require('./db');
      db.addInteraction({
        businessId,
        type: 'email',
        direction: 'outbound',
        subject,
        body,
      });
    } catch (e) {
      // Non-fatal — don't fail the send
    }
  }

  return { messageId: result.messageId, accepted: result.accepted };
}

module.exports = { buildEmail, sendEmail };
```

- [ ] **Step 4: Create .env.example**

```
# SMTP Configuration (Gmail example)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# Email rate limit (per hour)
EMAIL_RATE_LIMIT=50

# Anthropic API
ANTHROPIC_API_KEY=your-key-here

# Server
PORT=3000
```

- [ ] **Step 5: Add .env to .gitignore**

Check if `.gitignore` exists, create/append:
```
.env
test*.db
node_modules/
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd /c/Users/Blake/Projects/apollos-table && npx jest tests/email.test.js --verbose`

Expected: All PASS.

- [ ] **Step 7: Commit**

```bash
cd /c/Users/Blake/Projects/apollos-table
git add shared/email.js .env.example .gitignore tests/email.test.js
git commit -m "feat: add email infrastructure with CAN-SPAM compliance and rate limiting"
```

---

## Task 4: Region System

**Files:**
- Create: `server/api/regions.js`
- Modify: `shared/db.js` (if addRegion not already exported)
- Modify: `cli.js`

Regions let Blake target new markets. DB-backed, manageable from dashboard and CLI. Seed the default region from config.

- [ ] **Step 1: Write failing test for region API**

Create `tests/regions.test.js`:
```javascript
const http = require('http');
const path = require('path');

const PORT = 3457;
const BASE = `http://localhost:${PORT}`;

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE + path);
    const opts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    const req = http.request(opts, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString()) });
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

describe('regions API', () => {
  let server;

  beforeAll((done) => {
    process.env.PORT = String(PORT);
    process.env.APOLLO_DB_PATH = path.join(__dirname, '..', 'test-regions.db');
    delete require.cache[require.resolve('../server')];
    delete require.cache[require.resolve('../shared/db')];
    server = require('../server');
    setTimeout(done, 500);
  });

  afterAll((done) => {
    if (server && server.close) server.close(done);
    else done();
    const fs = require('fs');
    if (fs.existsSync(process.env.APOLLO_DB_PATH)) fs.unlinkSync(process.env.APOLLO_DB_PATH);
  });

  test('POST /api/regions creates a region', async () => {
    const { status, body } = await request('POST', '/api/regions', {
      name: 'Southern NH',
      state: 'NH',
      cities: ['Milford', 'Nashua'],
      categories: ['plumber', 'electrician'],
    });
    expect(status).toBe(201);
    expect(body).toHaveProperty('id');
    expect(body.slug).toBe('southern-nh');
  });

  test('GET /api/regions lists regions', async () => {
    const { status, body } = await request('GET', '/api/regions');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
    expect(body[0].name).toBe('Southern NH');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /c/Users/Blake/Projects/apollos-table && npx jest tests/regions.test.js --verbose`

Expected: FAIL — regions route not mounted.

- [ ] **Step 3: Create server/api/regions.js**

```javascript
const express = require('express');
const router = express.Router();
const db = require('../../shared/db');

router.get('/', (req, res) => {
  try {
    res.json(db.listRegions());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/', (req, res) => {
  try {
    const { name, state, cities, categories } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const result = db.addRegion({ slug, name, state, cities, categories });
    res.status(201).json({ id: result.id, slug: result.slug, name });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
```

- [ ] **Step 4: Mount regions route in server.js**

Add to `server.js`:
```javascript
app.use('/api/regions', require('./server/api/regions'));
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd /c/Users/Blake/Projects/apollos-table && npx jest tests/regions.test.js --verbose`

Expected: PASS.

- [ ] **Step 6: Add region CLI commands to cli.js**

Add to `cli.js` before `program.parse()`:
```javascript
// -- Region management --
program
  .command('region-add <name>')
  .description('Add a target region')
  .option('-s, --state <state>', 'State code')
  .option('--cities <cities>', 'Comma-separated cities')
  .option('--categories <cats>', 'Comma-separated categories')
  .action((name, opts) => {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const cities = opts.cities ? opts.cities.split(',').map(c => c.trim()) : [];
    const categories = opts.categories ? opts.categories.split(',').map(c => c.trim()) : config.categories;
    const result = db.addRegion({ slug, name, state: opts.state, cities, categories });
    console.log(`Region added: ${name} (${result.slug})`);
    db.close();
  });

program
  .command('regions')
  .description('List target regions')
  .action(() => {
    const regions = db.listRegions();
    if (regions.length === 0) {
      console.log('\nNo regions. Add one with "apollo region-add".\n');
    } else {
      for (const r of regions) {
        console.log(`  ${r.name} (${r.state}) — ${r.cities.join(', ')} — ${r.categories.length} categories`);
      }
    }
    db.close();
  });
```

- [ ] **Step 7: Seed default region from config on first run**

Add to the end of `migrate()` in `shared/db.js`:
```javascript
// Seed default region from config if none exist
const regionCount = db.prepare('SELECT COUNT(*) as count FROM regions').get().count;
if (regionCount === 0) {
  try {
    const config = require('./config').load();
    if (config.location && config.location.city) {
      db.prepare(`
        INSERT INTO regions (slug, name, state, cities, categories)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        'southern-nh',
        'Southern NH',
        config.location.state || 'NH',
        JSON.stringify(['Milford', 'Nashua', 'Amherst', 'Hollis', 'Bedford', 'Merrimack']),
        JSON.stringify(config.categories || [])
      );
    }
  } catch (e) {
    // Config not available in test context — skip seeding
  }
}
```

- [ ] **Step 8: Commit**

```bash
cd /c/Users/Blake/Projects/apollos-table
git add server/api/regions.js server.js cli.js shared/db.js tests/regions.test.js
git commit -m "feat: add region system with API, CLI, and config migration"
```

---

## Task 5: Update Discovery for Regions + Domain Dedup

**Files:**
- Modify: `security/discover.js`
- Modify: `shared/db.js` (addBusiness — populate domain column)

- [ ] **Step 1: Write failing test**

Create `tests/discover.test.js`:
```javascript
const path = require('path');
const fs = require('fs');

const TEST_DB = path.join(__dirname, '..', 'test-discover.db');

beforeAll(() => {
  process.env.APOLLO_DB_PATH = TEST_DB;
});

afterAll(() => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
});

describe('discovery dedup', () => {
  test('addBusiness populates domain column', () => {
    delete require.cache[require.resolve('../shared/db')];
    const db = require('../shared/db');
    const result = db.addBusiness({
      name: 'Test Plumbing',
      url: 'https://testplumbing.com/services',
      category: 'plumber',
      city: 'Milford',
      source: 'manual',
    });
    const biz = db.getBusiness(result.id);
    expect(biz.domain).toBe('testplumbing.com');
    db.close();
  });

  test('businessExistsByDomain finds existing business', () => {
    delete require.cache[require.resolve('../shared/db')];
    const db = require('../shared/db');
    db.addBusiness({
      name: 'Dedup Test',
      url: 'https://deduptest.com',
      category: 'hvac',
      city: 'Nashua',
      source: 'manual',
    });
    const exists = db.businessExistsByDomain('deduptest.com');
    expect(exists).toBeTruthy();
    const missing = db.businessExistsByDomain('nonexistent.com');
    expect(missing).toBeFalsy();
    db.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /c/Users/Blake/Projects/apollos-table && npx jest tests/discover.test.js --verbose`

Expected: FAIL — addBusiness doesn't populate domain, businessExistsByDomain doesn't exist.

- [ ] **Step 3: Update addBusiness in shared/db.js to populate domain**

In the `addBusiness` function, add domain extraction before the INSERT:
```javascript
function addBusiness({ name, url, category, address, city, phone, email, source, regionId }) {
  const db = getDb();
  let slug = slugify(name);

  // Extract domain for dedup
  let domain = null;
  try {
    domain = new URL(url.startsWith('http') ? url : 'https://' + url).hostname;
  } catch (e) {}

  // Handle duplicates
  const existing = db.prepare('SELECT slug FROM businesses WHERE slug = ?').get(slug);
  if (existing) {
    slug = slug + '-' + Date.now().toString(36).slice(-4);
  }

  const stmt = db.prepare(`
    INSERT INTO businesses (name, slug, url, domain, category, address, city, phone, email, source, region_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(name, slug, url, domain, category || null, address || null, city || null, phone || null, email || null, source || 'manual', regionId || null);
  return { id: result.lastInsertRowid, slug };
}
```

- [ ] **Step 4: Update discover.js to use domain dedup and accept regionId**

Replace the `discoverAll` function in `security/discover.js`:
```javascript
async function discoverAll(regionId) {
  let location, categories;

  if (regionId) {
    const region = db.getRegion(regionId);
    if (!region) throw new Error(`Region ${regionId} not found`);
    // Use first city as the search location
    location = `${region.cities[0]}, ${region.state}`;
    categories = region.categories;
  } else {
    location = `${config.location.city}, ${config.location.state} ${config.location.zip}`;
    categories = config.categories;
  }

  let totalFound = 0;
  let totalAdded = 0;

  for (const category of categories) {
    const businesses = await searchYellowPages(category, location);

    for (const biz of businesses) {
      if (!biz.website) continue;

      // O(1) domain dedup
      let domain;
      try {
        domain = new URL(biz.website.startsWith('http') ? biz.website : 'https://' + biz.website).hostname;
      } catch (e) { continue; }

      if (db.businessExistsByDomain(domain)) continue;

      try {
        db.addBusiness({
          name: biz.name,
          url: biz.website,
          category: biz.category,
          address: biz.address,
          city: biz.city || (regionId ? undefined : config.location.city),
          phone: biz.phone,
          source: 'yellowpages',
          regionId,
        });
        totalAdded++;
        console.log(`  + ${biz.name} (${biz.website})`);
      } catch (e) {}
    }
    totalFound += businesses.length;
  }

  return { totalFound, totalAdded };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd /c/Users/Blake/Projects/apollos-table && npx jest tests/discover.test.js --verbose`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd /c/Users/Blake/Projects/apollos-table
git add shared/db.js security/discover.js tests/discover.test.js
git commit -m "feat: add domain-based O(1) dedup, region-aware discovery"
```

---

## Task 6: Lane 1 API Routes

**Files:**
- Create: `server/api/businesses.js`
- Create: `server/api/scan.js`
- Create: `server/api/reports.js`
- Create: `server/api/outreach.js`
- Modify: `server.js` (mount routes)

These API routes wrap the existing CLI logic so the dashboard can drive all Lane 1 operations.

- [ ] **Step 1: Write failing test for businesses API**

Create `tests/businesses-api.test.js`:
```javascript
const http = require('http');
const path = require('path');

const PORT = 3458;
const BASE = `http://localhost:${PORT}`;

function request(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE + urlPath);
    const opts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    const req = http.request(opts, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString()) });
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

describe('businesses API', () => {
  let server;

  beforeAll((done) => {
    process.env.PORT = String(PORT);
    process.env.APOLLO_DB_PATH = path.join(__dirname, '..', 'test-biz-api.db');
    delete require.cache[require.resolve('../server')];
    delete require.cache[require.resolve('../shared/db')];
    server = require('../server');
    setTimeout(done, 500);
  });

  afterAll((done) => {
    if (server && server.close) server.close(done);
    else done();
    const fs = require('fs');
    if (fs.existsSync(process.env.APOLLO_DB_PATH)) fs.unlinkSync(process.env.APOLLO_DB_PATH);
  });

  test('POST /api/businesses adds a business', async () => {
    const { status, body } = await request('POST', '/api/businesses', {
      name: 'Test Plumber',
      url: 'https://testplumber.com',
      category: 'plumber',
      city: 'Milford',
    });
    expect(status).toBe(201);
    expect(body).toHaveProperty('id');
    expect(body).toHaveProperty('slug');
  });

  test('GET /api/businesses lists businesses', async () => {
    const { status, body } = await request('GET', '/api/businesses');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
  });

  test('PATCH /api/businesses/:id/stage updates pipeline stage', async () => {
    // First add a business
    const { body: biz } = await request('POST', '/api/businesses', {
      name: 'Stage Test Biz',
      url: 'https://stagetest.com',
      category: 'hvac',
    });
    const { status, body } = await request('PATCH', `/api/businesses/${biz.id}/stage`, {
      stage: 'scanned',
    });
    expect(status).toBe(200);
    expect(body.pipeline_stage).toBe('scanned');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /c/Users/Blake/Projects/apollos-table && npx jest tests/businesses-api.test.js --verbose`

Expected: FAIL.

- [ ] **Step 3: Create server/api/businesses.js**

```javascript
const express = require('express');
const router = express.Router();
const db = require('../../shared/db');

// List businesses with optional filters
router.get('/', (req, res) => {
  try {
    const { stage, grade, category, region_id, limit } = req.query;
    let businesses = db.getPipeline();

    if (stage && stage !== 'all') businesses = businesses.filter(b => b.pipeline_stage === stage);
    if (grade && grade !== 'all') businesses = businesses.filter(b => b.grade === grade);
    if (category && category !== 'all') businesses = businesses.filter(b => b.category === category);
    if (region_id) businesses = businesses.filter(b => b.region_id === parseInt(region_id));
    if (limit) businesses = businesses.slice(0, parseInt(limit));

    res.json(businesses);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get single business
router.get('/:id', (req, res) => {
  try {
    const biz = db.getBusiness(parseInt(req.params.id));
    if (!biz) return res.status(404).json({ error: 'Not found' });

    const scan = db.getLatestScan(biz.id);
    const report = db.getLatestReport(biz.id);
    res.json({ ...biz, scan, report });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Add business manually
router.post('/', (req, res) => {
  try {
    const { name, url, category, city, phone, email, regionId } = req.body;
    if (!name || !url) return res.status(400).json({ error: 'name and url required' });
    const result = db.addBusiness({ name, url: url.startsWith('http') ? url : 'https://' + url, category, city, phone, email, source: 'manual', regionId });
    res.status(201).json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Update pipeline stage
router.patch('/:id/stage', (req, res) => {
  try {
    const { stage } = req.body;
    const validStages = ['discovered', 'scanned', 'report_draft', 'report_published', 'outreach_sent', 'follow_up', 'warm_lead', 'cold_pool'];
    if (!validStages.includes(stage)) return res.status(400).json({ error: `Invalid stage. Must be one of: ${validStages.join(', ')}` });

    db.updatePipelineStage(parseInt(req.params.id), stage);
    const biz = db.getBusiness(parseInt(req.params.id));
    res.json(biz);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Unsubscribe
router.post('/:id/unsubscribe', (req, res) => {
  try {
    db.unsubscribeBusiness(parseInt(req.params.id));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
```

- [ ] **Step 4: Create server/api/scan.js**

```javascript
const express = require('express');
const router = express.Router();
const db = require('../../shared/db');
const { scanUrl } = require('../../security/scanner');

// Scan a single business
router.post('/:businessId', async (req, res) => {
  try {
    const biz = db.getBusiness(parseInt(req.params.businessId));
    if (!biz) return res.status(404).json({ error: 'Business not found' });

    const result = await scanUrl(biz.url);
    db.saveScan(biz.id, {
      score: result.score,
      grade: result.grade,
      findings: result.findings,
      rawHeaders: result.headers,
    });
    db.updatePipelineStage(biz.id, 'scanned');

    res.json({ score: result.score, grade: result.grade, findings: result.findings });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Batch scan — scan all discovered (unscanned) businesses
router.post('/', async (req, res) => {
  try {
    const { businessIds } = req.body;
    let businesses;

    if (businessIds && businessIds.length) {
      businesses = businessIds.map(id => db.getBusiness(id)).filter(Boolean);
    } else {
      businesses = db.listBusinesses({ hasScans: false });
    }

    const results = [];
    for (const biz of businesses) {
      try {
        const result = await scanUrl(biz.url);
        db.saveScan(biz.id, {
          score: result.score,
          grade: result.grade,
          findings: result.findings,
          rawHeaders: result.headers,
        });
        db.updatePipelineStage(biz.id, 'scanned');
        results.push({ id: biz.id, name: biz.name, grade: result.grade, score: result.score });
      } catch (e) {
        results.push({ id: biz.id, name: biz.name, error: e.message });
      }
    }

    res.json({ scanned: results.length, results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
```

- [ ] **Step 5: Create server/api/reports.js**

```javascript
const express = require('express');
const router = express.Router();
const db = require('../../shared/db');
const { generateNarrative } = require('../../security/reporter');

// Generate report for a business
router.post('/:businessId', async (req, res) => {
  try {
    const biz = db.getBusiness(parseInt(req.params.businessId));
    if (!biz) return res.status(404).json({ error: 'Business not found' });

    const scan = db.getLatestScan(biz.id);
    if (!scan) return res.status(400).json({ error: 'No scan data. Run a scan first.' });

    const narrative = await generateNarrative(biz, scan);
    const reportId = db.saveReport(biz.id, scan.id, narrative);
    db.updatePipelineStage(biz.id, 'report_draft');

    res.json({ reportId, narrative });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Publish a report
router.post('/:businessId/publish', (req, res) => {
  try {
    const report = db.getLatestReport(parseInt(req.params.businessId));
    if (!report) return res.status(404).json({ error: 'No report found' });

    db.publishReport(report.id);
    db.updatePipelineStage(parseInt(req.params.businessId), 'report_published');

    res.json({ ok: true, reportId: report.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Batch generate reports
router.post('/', async (req, res) => {
  try {
    const { businessIds } = req.body;
    let businesses;

    if (businessIds && businessIds.length) {
      businesses = businessIds.map(id => db.getBusiness(id)).filter(Boolean);
    } else {
      businesses = db.listBusinesses({ hasScans: true }).filter(b => {
        const report = db.getLatestReport(b.id);
        return !report;
      });
    }

    const results = [];
    for (const biz of businesses) {
      const scan = db.getLatestScan(biz.id);
      if (!scan) continue;
      try {
        const narrative = await generateNarrative(biz, scan);
        const reportId = db.saveReport(biz.id, scan.id, narrative);
        db.updatePipelineStage(biz.id, 'report_draft');
        results.push({ id: biz.id, name: biz.name, reportId });
      } catch (e) {
        results.push({ id: biz.id, name: biz.name, error: e.message });
      }
    }

    res.json({ generated: results.length, results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
```

- [ ] **Step 6: Create server/api/outreach.js**

```javascript
const express = require('express');
const router = express.Router();
const db = require('../../shared/db');
const { generateOutreachEmail } = require('../../security/reporter');
const { sendEmail } = require('../../shared/email');

// Draft outreach email for a business
router.post('/:businessId/draft', async (req, res) => {
  try {
    const biz = db.getBusiness(parseInt(req.params.businessId));
    if (!biz) return res.status(404).json({ error: 'Business not found' });

    const scan = db.getLatestScan(biz.id);
    const report = db.getLatestReport(biz.id);
    if (!scan || !report) return res.status(400).json({ error: 'Need scan + report first' });

    const email = await generateOutreachEmail(biz, scan, report);

    const outreachId = db.saveOutreach(biz.id, {
      method: 'email',
      status: 'draft',
      notes: JSON.stringify(email),
    });

    // Also save in new dedicated columns
    const rawDb = db.getDb();
    rawDb.prepare('UPDATE outreach SET email_subject = ?, email_body = ? WHERE id = ?')
      .run(email.subject, email.body, outreachId);

    res.json({ outreachId, subject: email.subject, body: email.body });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Send outreach email
router.post('/:businessId/send', async (req, res) => {
  try {
    const businessId = parseInt(req.params.businessId);
    const biz = db.getBusiness(businessId);
    if (!biz) return res.status(404).json({ error: 'Business not found' });
    if (biz.unsubscribed) return res.status(400).json({ error: 'Business has unsubscribed' });
    if (!biz.email && !req.body.to) return res.status(400).json({ error: 'No email address. Provide "to" in request body or add email to business.' });

    // Get the draft
    const rawDb = db.getDb();
    const outreach = rawDb.prepare('SELECT * FROM outreach WHERE business_id = ? ORDER BY id DESC LIMIT 1').get(businessId);
    if (!outreach) return res.status(400).json({ error: 'No outreach draft. Generate one first.' });

    const subject = req.body.subject || outreach.email_subject;
    const body = req.body.body || outreach.email_body;
    const to = req.body.to || biz.email;

    if (!subject || !body) return res.status(400).json({ error: 'No email content found' });

    await sendEmail({ to, subject, body, businessId });

    // Update outreach record
    db.updateOutreach(outreach.id, {
      status: 'sent',
      sent_at: new Date().toISOString(),
    });

    // Set follow-up due in 5 days
    const followUpDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    rawDb.prepare('UPDATE outreach SET follow_up_due = ? WHERE id = ?').run(followUpDate, outreach.id);

    db.updatePipelineStage(businessId, 'outreach_sent');

    res.json({ ok: true, sentTo: to });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Log a reply (manual — Phase 1 workaround before IMAP)
router.post('/:businessId/reply', (req, res) => {
  try {
    const businessId = parseInt(req.params.businessId);
    const { replyText, classification } = req.body;

    const rawDb = db.getDb();
    const outreach = rawDb.prepare('SELECT * FROM outreach WHERE business_id = ? ORDER BY id DESC LIMIT 1').get(businessId);
    if (outreach) {
      rawDb.prepare('UPDATE outreach SET reply_text = ?, reply_classification = ?, responded_at = datetime(\'now\') WHERE id = ?')
        .run(replyText, classification || null, outreach.id);
    }

    db.addInteraction({
      businessId,
      type: 'email',
      direction: 'inbound',
      subject: 'Reply to outreach',
      body: replyText,
    });

    if (classification === 'interested') {
      db.updatePipelineStage(businessId, 'warm_lead');
    }

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
```

- [ ] **Step 7: Mount all routes in server.js**

Update `server.js` to mount all API routes:
```javascript
app.use('/api/stats', require('./server/api/stats'));
app.use('/api/regions', require('./server/api/regions'));
app.use('/api/businesses', require('./server/api/businesses'));
app.use('/api/scan', require('./server/api/scan'));
app.use('/api/reports', require('./server/api/reports'));
app.use('/api/outreach', require('./server/api/outreach'));
```

- [ ] **Step 8: Run all tests**

Run: `cd /c/Users/Blake/Projects/apollos-table && npx jest tests/businesses-api.test.js --verbose`

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
cd /c/Users/Blake/Projects/apollos-table
git add server/api/businesses.js server/api/scan.js server/api/reports.js server/api/outreach.js server.js tests/businesses-api.test.js
git commit -m "feat: add Lane 1 API routes (businesses, scan, reports, outreach)"
```

---

## Task 7: Background Jobs

**Files:**
- Create: `shared/jobs.js`
- Modify: `server.js` (start jobs on server boot)

Follow-up checks, cold pool rescans, and database backup — all on cron schedules.

- [ ] **Step 1: Install node-cron**

Run: `cd /c/Users/Blake/Projects/apollos-table && npm install node-cron`

- [ ] **Step 2: Create shared/jobs.js**

```javascript
const cron = require('node-cron');
const path = require('path');
const fs = require('fs');
const db = require('./db');

function startJobs() {
  console.log('Starting background jobs...');

  // Follow-up check — daily at 9am
  cron.schedule('0 9 * * *', async () => {
    const jobId = db.logJobStart('follow-up-check');
    try {
      const rawDb = db.getDb();
      const due = rawDb.prepare(`
        SELECT o.*, b.name, b.email, b.unsubscribed
        FROM outreach o
        JOIN businesses b ON b.id = o.business_id
        WHERE o.follow_up_due <= date('now')
        AND o.follow_up_count < 2
        AND o.responded_at IS NULL
        AND o.status = 'sent'
        AND b.unsubscribed = 0
      `).all();

      let processed = 0;
      for (const row of due) {
        // Increment follow-up count, set new due date 5 days out
        const newDue = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        rawDb.prepare('UPDATE outreach SET follow_up_count = follow_up_count + 1, follow_up_due = ? WHERE id = ?')
          .run(newDue, row.id);

        // Move to cold pool if max follow-ups reached
        if (row.follow_up_count + 1 >= 2) {
          const coldDate = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
          rawDb.prepare("UPDATE businesses SET pipeline_stage = 'cold_pool', cold_pool_until = ? WHERE id = ?")
            .run(coldDate, row.business_id);
        } else {
          rawDb.prepare("UPDATE businesses SET pipeline_stage = 'follow_up' WHERE id = ?")
            .run(row.business_id);
        }
        processed++;
      }

      db.logJobEnd(jobId, `Processed ${processed} follow-ups`);
      if (processed > 0) console.log(`[follow-up-check] Processed ${processed} follow-ups`);
    } catch (e) {
      db.logJobEnd(jobId, null, e.message);
      console.error('[follow-up-check] Error:', e.message);
    }
  });

  // Cold pool rescan — daily at 3am
  cron.schedule('0 3 * * *', async () => {
    const jobId = db.logJobStart('cold-pool-rescan');
    try {
      const rawDb = db.getDb();
      const due = rawDb.prepare(`
        SELECT * FROM businesses
        WHERE pipeline_stage = 'cold_pool'
        AND cold_pool_until <= date('now')
        AND unsubscribed = 0
      `).all();

      let rescanned = 0;
      if (due.length > 0) {
        const { scanUrl } = require('../security/scanner');
        for (const biz of due) {
          try {
            const result = await scanUrl(biz.url);
            const oldScan = db.getLatestScan(biz.id);
            db.saveScan(biz.id, {
              score: result.score,
              grade: result.grade,
              findings: result.findings,
              rawHeaders: result.headers,
            });

            // If score changed, move back to discovered for new report cycle
            if (!oldScan || result.score !== oldScan.score) {
              rawDb.prepare("UPDATE businesses SET pipeline_stage = 'scanned', cold_pool_until = NULL WHERE id = ?").run(biz.id);
            }
            rescanned++;
          } catch (e) {}
        }
      }

      db.logJobEnd(jobId, `Rescanned ${rescanned}/${due.length} cold pool businesses`);
      if (rescanned > 0) console.log(`[cold-pool-rescan] Rescanned ${rescanned} businesses`);
    } catch (e) {
      db.logJobEnd(jobId, null, e.message);
      console.error('[cold-pool-rescan] Error:', e.message);
    }
  });

  // Database backup — daily at midnight
  cron.schedule('0 0 * * *', () => {
    const jobId = db.logJobStart('db-backup');
    try {
      const dbPath = process.env.APOLLO_DB_PATH || path.join(__dirname, '..', 'apollo.db');
      const backupDir = path.join(require('os').homedir(), 'OneDrive', 'backups');

      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }

      const date = new Date().toISOString().split('T')[0];
      const dest = path.join(backupDir, `apollo-${date}.db`);
      fs.copyFileSync(dbPath, dest);

      // Clean up backups older than 30 days
      const files = fs.readdirSync(backupDir).filter(f => f.startsWith('apollo-') && f.endsWith('.db'));
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      for (const file of files) {
        const match = file.match(/apollo-(\d{4}-\d{2}-\d{2})\.db/);
        if (match && new Date(match[1]) < cutoff) {
          fs.unlinkSync(path.join(backupDir, file));
        }
      }

      db.logJobEnd(jobId, `Backed up to ${dest}`);
      console.log(`[db-backup] Backed up to ${dest}`);
    } catch (e) {
      db.logJobEnd(jobId, null, e.message);
      console.error('[db-backup] Error:', e.message);
    }
  });

  console.log('Background jobs scheduled: follow-up-check (9am), cold-pool-rescan (3am), db-backup (midnight)');
}

module.exports = { startJobs };
```

- [ ] **Step 3: Start jobs in server.js**

Add after `app.listen`:
```javascript
// Start background jobs
const { startJobs } = require('./shared/jobs');
startJobs();
```

- [ ] **Step 4: Add job status endpoint to stats API**

Add to `server/api/stats.js`:
```javascript
router.get('/jobs', (req, res) => {
  try {
    const rawDb = db.getDb();
    const jobs = rawDb.prepare(`
      SELECT job_name, MAX(started_at) as last_run, result, error
      FROM job_runs
      GROUP BY job_name
      ORDER BY last_run DESC
    `).all();
    res.json(jobs);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
```

- [ ] **Step 5: Commit**

```bash
cd /c/Users/Blake/Projects/apollos-table
git add shared/jobs.js server.js server/api/stats.js package.json package-lock.json
git commit -m "feat: add background jobs (follow-up, cold pool rescan, backup)"
```

---

## Task 8: React Dashboard Scaffold

**Files:**
- Create: `app/` directory with Vite + React setup
- Modify: `package.json` (add dev script with concurrently)

- [ ] **Step 1: Scaffold Vite + React app**

Run:
```bash
cd /c/Users/Blake/Projects/apollos-table && npm create vite@latest app -- --template react
```

- [ ] **Step 2: Install app dependencies**

Run:
```bash
cd /c/Users/Blake/Projects/apollos-table/app && npm install
```

- [ ] **Step 3: Install concurrently in root**

Run:
```bash
cd /c/Users/Blake/Projects/apollos-table && npm install --save-dev concurrently
```

- [ ] **Step 4: Configure Vite proxy**

Replace the scaffolded `app/vite.config.js` with:
```javascript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
  build: {
    outDir: 'dist',
  },
});
```

- [ ] **Step 5: Add dev scripts to root package.json**

```json
"dev": "concurrently \"node server.js\" \"cd app && npm run dev\"",
"build": "cd app && npm run build",
```

- [ ] **Step 6: Create app/src/api.js**

```javascript
const API = '/api';

async function request(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(API + path, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

export const api = {
  // Stats
  getStats: () => request('GET', '/stats'),
  getJobs: () => request('GET', '/stats/jobs'),

  // Regions
  getRegions: () => request('GET', '/regions'),
  addRegion: (data) => request('POST', '/regions', data),

  // Businesses
  getBusinesses: (params) => {
    const qs = new URLSearchParams(params).toString();
    return request('GET', '/businesses' + (qs ? '?' + qs : ''));
  },
  getBusiness: (id) => request('GET', `/businesses/${id}`),
  addBusiness: (data) => request('POST', '/businesses', data),
  updateStage: (id, stage) => request('PATCH', `/businesses/${id}/stage`, { stage }),

  // Scan
  scanBusiness: (id) => request('POST', `/scan/${id}`),
  scanBatch: (ids) => request('POST', '/scan', { businessIds: ids }),

  // Reports
  generateReport: (id) => request('POST', `/reports/${id}`),
  publishReport: (id) => request('POST', `/reports/${id}/publish`),
  generateReportsBatch: (ids) => request('POST', '/reports', { businessIds: ids }),

  // Outreach
  draftOutreach: (id) => request('POST', `/outreach/${id}/draft`),
  sendOutreach: (id, data) => request('POST', `/outreach/${id}/send`, data),
  logReply: (id, data) => request('POST', `/outreach/${id}/reply`, data),
};
```

- [ ] **Step 7: Create minimal App.jsx shell**

Replace `app/src/App.jsx`:
```jsx
import { useState, useEffect } from 'react';
import { api } from './api';

export default function App() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api.getStats().then(setStats).catch(console.error);
  }, []);

  return (
    <div className="app">
      <nav className="top-nav">
        <div className="nav-brand">Apollo Operations</div>
      </nav>
      <main>
        {stats ? (
          <div className="stats-bar">
            <div>Discovered: {stats.total}</div>
            <div>Scanned: {stats.scanned}</div>
            <div>Reports: {stats.reported}</div>
          </div>
        ) : (
          <div>Loading...</div>
        )}
        <p>Dashboard coming next...</p>
      </main>
    </div>
  );
}
```

- [ ] **Step 8: Test the full dev setup**

Run: `cd /c/Users/Blake/Projects/apollos-table && npm run dev`

Expected: Express server on :3000, Vite dev server on :5173. Opening http://localhost:5173 shows the shell with stats.

- [ ] **Step 9: Commit**

```bash
cd /c/Users/Blake/Projects/apollos-table
git add app/ package.json package-lock.json
git commit -m "feat: scaffold React + Vite dashboard with API proxy"
```

---

## Task 9: Lane 1 Dashboard — Pipeline View

**Files:**
- Create: `app/src/components/StatsBar.jsx`
- Create: `app/src/components/Pipeline.jsx`
- Create: `app/src/components/BusinessCard.jsx`
- Create: `app/src/components/BatchActions.jsx`
- Create: `app/src/components/RegionPicker.jsx`
- Modify: `app/src/App.jsx`
- Create: `app/src/App.css`

This is the main Lane 1 view — a kanban board with pipeline stages as columns, business cards in each column, batch action buttons, and region filtering.

- [ ] **Step 1: Create StatsBar.jsx**

```jsx
export default function StatsBar({ stats }) {
  if (!stats) return null;

  const items = [
    { label: 'Discovered', value: stats.total, color: '' },
    { label: 'Scanned', value: stats.scanned, color: 'gold' },
    { label: 'Reports', value: stats.reported, color: 'green' },
    { label: 'Outreach Sent', value: stats.outreachSent, color: '' },
    { label: 'Responses', value: stats.responses, color: 'green' },
  ];

  return (
    <div className="stats-bar">
      {items.map(item => (
        <div key={item.label} className="stat-card">
          <div className="stat-label">{item.label}</div>
          <div className={`stat-value ${item.color}`}>{item.value || 0}</div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create BusinessCard.jsx**

```jsx
export default function BusinessCard({ business, onSelect }) {
  const gradeColors = { A: '#3ecf6e', B: '#7bc87b', C: '#e8a832', D: '#e07840', F: '#e05252' };
  const color = gradeColors[business.grade] || '#5a5868';

  return (
    <div className="biz-card" onClick={() => onSelect(business)} style={{ borderLeftColor: color }}>
      <div className="biz-card-header">
        <span className="biz-name">{business.name}</span>
        {business.grade && <span className="biz-grade" style={{ color }}>{business.grade}</span>}
      </div>
      <div className="biz-meta">
        {business.category && <span>{business.category}</span>}
        {business.city && <span>{business.city}</span>}
        {business.score != null && <span>{business.score}/100</span>}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create Pipeline.jsx**

```jsx
import BusinessCard from './BusinessCard';

const STAGES = [
  { key: 'discovered', label: 'Discovered' },
  { key: 'scanned', label: 'Scanned' },
  { key: 'report_draft', label: 'Report Draft' },
  { key: 'report_published', label: 'Published' },
  { key: 'outreach_sent', label: 'Outreach Sent' },
  { key: 'follow_up', label: 'Follow-up' },
  { key: 'warm_lead', label: 'Warm Lead' },
  { key: 'cold_pool', label: 'Cold Pool' },
];

export default function Pipeline({ businesses, onSelect }) {
  const byStage = {};
  for (const s of STAGES) byStage[s.key] = [];
  for (const b of businesses) {
    const stage = b.pipeline_stage || 'discovered';
    if (byStage[stage]) byStage[stage].push(b);
    else byStage.discovered.push(b);
  }

  return (
    <div className="pipeline">
      {STAGES.map(stage => (
        <div key={stage.key} className="pipeline-column">
          <div className="pipeline-header">
            <span>{stage.label}</span>
            <span className="pipeline-count">{byStage[stage.key].length}</span>
          </div>
          <div className="pipeline-cards">
            {byStage[stage.key].map(b => (
              <BusinessCard key={b.id} business={b} onSelect={onSelect} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Create BatchActions.jsx**

```jsx
import { useState } from 'react';
import { api } from '../api';

export default function BatchActions({ businesses, onRefresh }) {
  const [loading, setLoading] = useState(null);

  const discovered = businesses.filter(b => b.pipeline_stage === 'discovered');
  const scanned = businesses.filter(b => b.pipeline_stage === 'scanned' && !b.report_id);
  const drafted = businesses.filter(b => b.pipeline_stage === 'report_draft');
  const published = businesses.filter(b => b.pipeline_stage === 'report_published');

  async function run(action, ids, label) {
    setLoading(label);
    try {
      await action(ids);
      onRefresh();
    } catch (e) {
      alert(`Error: ${e.message}`);
    }
    setLoading(null);
  }

  return (
    <div className="batch-actions">
      <button
        disabled={!discovered.length || loading}
        onClick={() => run(api.scanBatch, discovered.map(b => b.id), 'scan')}
      >
        {loading === 'scan' ? 'Scanning...' : `Scan All (${discovered.length})`}
      </button>
      <button
        disabled={!scanned.length || loading}
        onClick={() => run(api.generateReportsBatch, scanned.map(b => b.id), 'report')}
      >
        {loading === 'report' ? 'Generating...' : `Generate Reports (${scanned.length})`}
      </button>
      <button
        disabled={!drafted.length || loading}
        onClick={() => {
          // Publish all drafts
          setLoading('publish');
          Promise.all(drafted.map(b => api.publishReport(b.id)))
            .then(onRefresh)
            .catch(e => alert(e.message))
            .finally(() => setLoading(null));
        }}
      >
        {loading === 'publish' ? 'Publishing...' : `Publish All (${drafted.length})`}
      </button>
    </div>
  );
}
```

- [ ] **Step 5: Create RegionPicker.jsx**

```jsx
import { useState, useEffect } from 'react';
import { api } from '../api';

export default function RegionPicker({ selected, onSelect }) {
  const [regions, setRegions] = useState([]);

  useEffect(() => {
    api.getRegions().then(setRegions).catch(console.error);
  }, []);

  return (
    <div className="region-picker">
      <select value={selected || ''} onChange={e => onSelect(e.target.value || null)}>
        <option value="">All Regions</option>
        {regions.map(r => (
          <option key={r.id} value={r.id}>{r.name}</option>
        ))}
      </select>
    </div>
  );
}
```

- [ ] **Step 6: Create BusinessDetail.jsx**

```jsx
import { useState, useEffect } from 'react';
import { api } from '../api';

export default function BusinessDetail({ business, onClose, onRefresh }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(null);

  useEffect(() => {
    api.getBusiness(business.id).then(setDetail).catch(console.error);
  }, [business.id]);

  if (!detail) return <div className="detail-panel"><p>Loading...</p></div>;

  async function action(fn, label) {
    setLoading(label);
    try {
      await fn();
      const updated = await api.getBusiness(business.id);
      setDetail(updated);
      onRefresh();
    } catch (e) {
      alert(e.message);
    }
    setLoading(null);
  }

  return (
    <div className="detail-panel">
      <div className="detail-header">
        <h2>{detail.name}</h2>
        <button onClick={onClose}>Close</button>
      </div>

      <div className="detail-info">
        <div><strong>URL:</strong> <a href={detail.url} target="_blank" rel="noreferrer">{detail.url}</a></div>
        <div><strong>Category:</strong> {detail.category || '-'}</div>
        <div><strong>City:</strong> {detail.city || '-'}</div>
        <div><strong>Stage:</strong> {detail.pipeline_stage}</div>
        {detail.phone && <div><strong>Phone:</strong> {detail.phone}</div>}
        {detail.email && <div><strong>Email:</strong> {detail.email}</div>}
      </div>

      {detail.scan && (
        <div className="detail-scan">
          <h3>Scan Results — Grade: {detail.scan.grade} ({detail.scan.score}/100)</h3>
          <ul>
            {(detail.scan.findings || []).map((f, i) => (
              <li key={i}><strong>[{f.severity}]</strong> {f.title} — {f.detail}</li>
            ))}
          </ul>
        </div>
      )}

      {detail.report && (
        <div className="detail-report">
          <h3>Report</h3>
          <div className="report-narrative">{detail.report.narrative}</div>
        </div>
      )}

      <div className="detail-actions">
        {detail.pipeline_stage === 'discovered' && (
          <button disabled={loading} onClick={() => action(() => api.scanBusiness(detail.id), 'scan')}>
            {loading === 'scan' ? 'Scanning...' : 'Run Scan'}
          </button>
        )}
        {detail.pipeline_stage === 'scanned' && (
          <button disabled={loading} onClick={() => action(() => api.generateReport(detail.id), 'report')}>
            {loading === 'report' ? 'Generating...' : 'Generate Report'}
          </button>
        )}
        {detail.pipeline_stage === 'report_draft' && (
          <button disabled={loading} onClick={() => action(() => api.publishReport(detail.id), 'publish')}>
            {loading === 'publish' ? 'Publishing...' : 'Publish Report'}
          </button>
        )}
        {detail.pipeline_stage === 'report_published' && (
          <button disabled={loading} onClick={() => action(() => api.draftOutreach(detail.id), 'draft')}>
            {loading === 'draft' ? 'Drafting...' : 'Draft Outreach Email'}
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Wire it all together in App.jsx**

```jsx
import { useState, useEffect, useCallback } from 'react';
import { api } from './api';
import StatsBar from './components/StatsBar';
import Pipeline from './components/Pipeline';
import BatchActions from './components/BatchActions';
import RegionPicker from './components/RegionPicker';
import BusinessDetail from './components/BusinessDetail';
import './App.css';

export default function App() {
  const [stats, setStats] = useState(null);
  const [businesses, setBusinesses] = useState([]);
  const [selectedRegion, setSelectedRegion] = useState(null);
  const [selectedBusiness, setSelectedBusiness] = useState(null);

  const loadData = useCallback(async () => {
    try {
      const [s, b] = await Promise.all([
        api.getStats(),
        api.getBusinesses(selectedRegion ? { region_id: selectedRegion } : {}),
      ]);
      setStats(s);
      setBusinesses(b);
    } catch (e) {
      console.error(e);
    }
  }, [selectedRegion]);

  useEffect(() => { loadData(); }, [loadData]);

  return (
    <div className="app">
      <nav className="top-nav">
        <div className="nav-brand">Operations</div>
        <RegionPicker selected={selectedRegion} onSelect={setSelectedRegion} />
      </nav>

      <main>
        <StatsBar stats={stats} />
        <BatchActions businesses={businesses} onRefresh={loadData} />
        <Pipeline businesses={businesses} onSelect={setSelectedBusiness} />
      </main>

      {selectedBusiness && (
        <BusinessDetail
          business={selectedBusiness}
          onClose={() => setSelectedBusiness(null)}
          onRefresh={loadData}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 8: Create App.css with base styling**

Create `app/src/App.css` with functional layout styles (kanban grid, cards, stats bar, detail panel). Use the TRON aesthetic per Blake's preferences — dark background (#050510), cyan accents (#00d4ff), clean geometric lines, IBM Plex Mono font.

The CSS should cover:
- `.app` — dark bg, full viewport
- `.top-nav` — fixed top bar with brand + region picker
- `.stats-bar` — horizontal row of stat cards
- `.batch-actions` — horizontal button row
- `.pipeline` — horizontal flex/grid of stage columns, scrollable
- `.pipeline-column` — vertical column with header and card list
- `.biz-card` — individual business card with left border color accent
- `.detail-panel` — slide-in panel from right, overlay
- Responsive: pipeline scrolls horizontally on small screens

- [ ] **Step 9: Test the full dashboard**

Run: `cd /c/Users/Blake/Projects/apollos-table && npm run dev`

Open http://localhost:5173. Verify:
- Stats bar shows numbers
- Pipeline shows kanban columns
- Clicking a card opens the detail panel
- Batch actions trigger API calls

- [ ] **Step 10: Commit**

```bash
cd /c/Users/Blake/Projects/apollos-table
git add app/src/
git commit -m "feat: add Lane 1 dashboard with pipeline kanban, business detail, batch actions"
```

---

## Task 10: Discovery API + Dashboard Integration

**Files:**
- Create: `server/api/discover.js`
- Modify: `server.js`
- Modify: `app/src/App.jsx` (add discover button)

Let Blake trigger discovery from the dashboard instead of only via CLI.

- [ ] **Step 1: Create server/api/discover.js**

```javascript
const express = require('express');
const router = express.Router();
const db = require('../../shared/db');
const { discoverAll } = require('../../security/discover');

router.post('/', async (req, res) => {
  try {
    const { regionId } = req.body;
    const result = await discoverAll(regionId || null);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
```

- [ ] **Step 2: Mount in server.js**

Add: `app.use('/api/discover', require('./server/api/discover'));`

- [ ] **Step 3: Add to api.js**

Add to api object:
```javascript
discover: (regionId) => request('POST', '/discover', { regionId }),
```

- [ ] **Step 4: Add discover button to App.jsx**

In the batch actions area or nav, add a "Discover Businesses" button that calls `api.discover(selectedRegion)` and refreshes on completion.

- [ ] **Step 5: Test end-to-end**

Run: `npm run dev`, click Discover, verify businesses appear in the pipeline.

- [ ] **Step 6: Commit**

```bash
cd /c/Users/Blake/Projects/apollos-table
git add server/api/discover.js server.js app/src/
git commit -m "feat: add discovery API endpoint + dashboard trigger"
```

---

## Task 11: Lane 2 Basics — Onboarding

**Files:**
- Create: `server/api/clients.js`
- Modify: `server.js`
- Modify: `security/reporter.js` (add scope generation)
- Modify: `app/src/api.js`
- Create: `app/src/components/Onboarding.jsx`
- Modify: `app/src/App.jsx` (add lane navigation)

Minimal Lane 2: warm leads appear, Blake can generate a scope, send a proposal, paste a Stripe link, mark as paid.

- [ ] **Step 1: Add scope generation to reporter.js**

Add to `security/reporter.js`:
```javascript
const PRICING = {
  'no-https': { description: 'Install and configure SSL certificate', hours: 0.5, price: 75 },
  'ssl-expired': { description: 'Renew SSL certificate', hours: 0.5, price: 75 },
  'no-https-redirect': { description: 'Configure HTTPS redirect', hours: 0.25, price: 50 },
  'no-hsts': { description: 'Add HSTS security header', hours: 0.25, price: 50 },
  'no-xcto': { description: 'Add X-Content-Type-Options header', hours: 0.15, price: 25 },
  'no-xfo': { description: 'Add clickjacking protection', hours: 0.15, price: 25 },
  'no-csp': { description: 'Configure Content Security Policy', hours: 0.5, price: 75 },
  'wp-version-exposed': { description: 'Hide WordPress version', hours: 0.25, price: 50 },
  'wp-xmlrpc': { description: 'Disable XML-RPC', hours: 0.25, price: 50 },
  'wp-readme': { description: 'Remove WordPress readme', hours: 0.15, price: 25 },
  'admin-exposed-wp-loginphp': { description: 'Harden WordPress login access', hours: 1, price: 150 },
  'admin-exposed-wpadmin': { description: 'Harden WordPress admin access', hours: 1, price: 150 },
  'admin-exposed-admin': { description: 'Harden admin panel access', hours: 1, price: 150 },
  'admin-exposed-administrator': { description: 'Harden admin panel access', hours: 1, price: 150 },
  'server-version': { description: 'Hide server version info', hours: 0.25, price: 50 },
  'powered-by': { description: 'Remove X-Powered-By header', hours: 0.15, price: 25 },
};

function generateScope(scan) {
  const items = [];
  for (const finding of (scan.findings || [])) {
    const pricing = PRICING[finding.id];
    if (pricing) {
      items.push({
        finding_id: finding.id,
        description: pricing.description,
        estimated_hours: pricing.hours,
        price: pricing.price,
        status: 'pending',
      });
    } else {
      // Generic pricing for unknown findings
      items.push({
        finding_id: finding.id,
        description: `Fix: ${finding.title}`,
        estimated_hours: 0.5,
        price: 75,
        status: 'pending',
      });
    }
  }

  const totalPrice = items.reduce((sum, i) => sum + i.price, 0);
  const tier = totalPrice > 1000 ? 'rebuild' : totalPrice > 200 ? 'fix' : 'fix';

  return { items, total_price: totalPrice, tier };
}

module.exports = { generateNarrative, generateOutreachEmail, generateScope };
```

- [ ] **Step 2: Add client and project DB functions to shared/db.js**

```javascript
// -- Client operations --
function createClient(businessId, { tier, monthlyRate }) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO clients (business_id, tier, monthly_rate)
    VALUES (?, ?, ?)
  `);
  return stmt.run(businessId, tier || 'fix', monthlyRate || 0).lastInsertRowid;
}

function getClientByBusiness(businessId) {
  const db = getDb();
  return db.prepare('SELECT * FROM clients WHERE business_id = ?').get(businessId);
}

function listClients(status) {
  const db = getDb();
  let sql = `SELECT c.*, b.name, b.url, b.category, b.city
    FROM clients c JOIN businesses b ON b.id = c.business_id`;
  const params = [];
  if (status) {
    sql += ' WHERE c.status = ?';
    params.push(status);
  }
  sql += ' ORDER BY c.started_at DESC';
  return db.prepare(sql).all(...params);
}

// -- Project operations --
function createProject(clientId, { type, scope, price, stripeLink }) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO projects (client_id, type, scope, price, stripe_payment_link)
    VALUES (?, ?, ?, ?, ?)
  `);
  return stmt.run(clientId, type || 'fix', JSON.stringify(scope), price || 0, stripeLink || null).lastInsertRowid;
}

function getProject(id) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  if (row && row.scope) row.scope = JSON.parse(row.scope);
  return row;
}

function updateProject(id, updates) {
  const db = getDb();
  const fields = [];
  const params = [];
  for (const [key, val] of Object.entries(updates)) {
    fields.push(`${key} = ?`);
    params.push(key === 'scope' ? JSON.stringify(val) : val);
  }
  params.push(id);
  db.prepare(`UPDATE projects SET ${fields.join(', ')} WHERE id = ?`).run(...params);
}
```

Add to exports.

- [ ] **Step 3: Create server/api/clients.js**

```javascript
const express = require('express');
const router = express.Router();
const db = require('../../shared/db');
const { generateScope } = require('../../security/reporter');

// List warm leads (businesses in warm_lead stage) + active clients
router.get('/', (req, res) => {
  try {
    const warmLeads = db.getPipeline().filter(b => b.pipeline_stage === 'warm_lead');
    const clients = db.listClients();
    res.json({ warmLeads, clients });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Generate scope for a business
router.post('/:businessId/scope', (req, res) => {
  try {
    const scan = db.getLatestScan(parseInt(req.params.businessId));
    if (!scan) return res.status(400).json({ error: 'No scan data' });
    const scope = generateScope(scan);
    res.json(scope);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Convert warm lead to client + create project
router.post('/:businessId/convert', (req, res) => {
  try {
    const businessId = parseInt(req.params.businessId);
    const { tier, scope, price, stripeLink, monthlyRate } = req.body;

    const clientId = db.createClient(businessId, { tier, monthlyRate });
    const projectId = db.createProject(clientId, { type: tier, scope, price, stripeLink });

    res.status(201).json({ clientId, projectId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Mark project as paid
router.post('/projects/:projectId/paid', (req, res) => {
  try {
    db.updateProject(parseInt(req.params.projectId), {
      paid_at: new Date().toISOString(),
      status: 'queued',
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
```

- [ ] **Step 4: Mount in server.js**

Add: `app.use('/api/clients', require('./server/api/clients'));`

- [ ] **Step 5: Add client API methods to app/src/api.js**

```javascript
// Clients / Onboarding
getOnboarding: () => request('GET', '/clients'),
generateScope: (id) => request('POST', `/clients/${id}/scope`),
convertToClient: (id, data) => request('POST', `/clients/${id}/convert`, data),
markPaid: (projectId) => request('POST', `/clients/projects/${projectId}/paid`),
```

- [ ] **Step 6: Create Onboarding.jsx**

```jsx
import { useState, useEffect } from 'react';
import { api } from '../api';

export default function Onboarding() {
  const [data, setData] = useState({ warmLeads: [], clients: [] });

  useEffect(() => {
    api.getOnboarding().then(setData).catch(console.error);
  }, []);

  return (
    <div className="onboarding">
      <h2>Onboarding</h2>

      <h3>Warm Leads ({data.warmLeads.length})</h3>
      {data.warmLeads.map(lead => (
        <WarmLeadCard key={lead.id} lead={lead} onRefresh={() => api.getOnboarding().then(setData)} />
      ))}

      <h3>Active Clients ({data.clients.length})</h3>
      {data.clients.map(client => (
        <div key={client.id} className="client-card">
          <strong>{client.name}</strong> — {client.tier} — {client.status}
        </div>
      ))}
    </div>
  );
}

function WarmLeadCard({ lead, onRefresh }) {
  const [scope, setScope] = useState(null);
  const [loading, setLoading] = useState(false);

  async function genScope() {
    setLoading(true);
    try {
      const s = await api.generateScope(lead.id);
      setScope(s);
    } catch (e) { alert(e.message); }
    setLoading(false);
  }

  async function convert() {
    if (!scope) return;
    try {
      const stripeLink = prompt('Paste Stripe payment link (or leave empty):');
      await api.convertToClient(lead.id, {
        tier: scope.tier,
        scope,
        price: scope.total_price,
        stripeLink: stripeLink || null,
      });
      onRefresh();
    } catch (e) { alert(e.message); }
  }

  return (
    <div className="warm-lead-card">
      <div><strong>{lead.name}</strong> — {lead.category} — {lead.city}</div>
      <div>Grade: {lead.grade} | Score: {lead.score}/100</div>
      {lead.outreach_responded && <div>Replied: {lead.outreach_responded}</div>}

      {!scope ? (
        <button onClick={genScope} disabled={loading}>
          {loading ? 'Generating...' : 'Generate Scope'}
        </button>
      ) : (
        <div className="scope-preview">
          <h4>Scope — ${scope.total_price} ({scope.tier})</h4>
          <ul>
            {scope.items.map((item, i) => (
              <li key={i}>{item.description} — ${item.price}</li>
            ))}
          </ul>
          <button onClick={convert}>Convert to Client</button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Add lane navigation to App.jsx**

Add tab navigation between "Pipeline" (Lane 1) and "Onboarding" (Lane 2):
```jsx
const [lane, setLane] = useState('pipeline');

// In nav:
<button className={lane === 'pipeline' ? 'active' : ''} onClick={() => setLane('pipeline')}>Pipeline</button>
<button className={lane === 'onboarding' ? 'active' : ''} onClick={() => setLane('onboarding')}>Onboarding</button>

// In main:
{lane === 'pipeline' && <Pipeline ... />}
{lane === 'onboarding' && <Onboarding />}
```

- [ ] **Step 8: Test end-to-end**

Run `npm run dev`. Verify: Pipeline and Onboarding tabs work, warm leads show up, scope generation works, convert to client works.

- [ ] **Step 9: Commit**

```bash
cd /c/Users/Blake/Projects/apollos-table
git add security/reporter.js shared/db.js server/api/clients.js server.js app/src/
git commit -m "feat: add Lane 2 onboarding with scope generation and client conversion"
```

---

## Task 12: Final Integration + Build

**Files:**
- Modify: `package.json`
- Modify: `server.js`

Production build and one-command startup.

- [ ] **Step 1: Build the React app**

Run: `cd /c/Users/Blake/Projects/apollos-table && npm run build`

Expected: `app/dist/` directory created.

- [ ] **Step 2: Verify production mode**

Run: `cd /c/Users/Blake/Projects/apollos-table && node server.js`

Open http://localhost:3000. The built React app should serve from Express. All API calls should work.

- [ ] **Step 3: Add start script**

Add to `package.json`:
```json
"start": "node server.js"
```

- [ ] **Step 4: Run full test suite**

Run: `cd /c/Users/Blake/Projects/apollos-table && npx jest --verbose`

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
cd /c/Users/Blake/Projects/apollos-table
git add -A
git commit -m "feat: Phase 1 complete — Lane 1 pipeline + Lane 2 onboarding operational"
```

---

## Summary

After completing all 12 tasks, Blake has:

1. **Extended database** with regions, clients, projects, interactions, pipeline stages
2. **Express API server** wrapping all existing CLI logic
3. **Email sending** with Nodemailer, CAN-SPAM compliance, rate limiting
4. **Region system** for multi-market targeting
5. **Lane 1 fully operational**: discover → scan → report → publish → outreach → follow-up → track replies
6. **Lane 2 basics**: warm leads → scope generation → proposal → client conversion
7. **Background jobs**: follow-up automation, cold pool rescans, daily backups
8. **React dashboard**: pipeline kanban, business detail, batch actions, onboarding view

**Next plan:** Phase 2 (Lane 3 Delivery + Lane 4 Account Management + IMAP + Stripe API)
