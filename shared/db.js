const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.APOLLO_DB_PATH || path.join(__dirname, '..', 'apollo.db');
let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    migrate();
  }
  return db;
}

// ── Helpers ─────────────────────────────────────────────────────────────

function extractDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function addColumnIfMissing(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  const exists = cols.some((c) => c.name === column);
  if (!exists) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

// ── Migration ───────────────────────────────────────────────────────────

function migrate() {
  // -- Original tables --
  db.exec(`
    CREATE TABLE IF NOT EXISTS businesses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      url TEXT NOT NULL,
      category TEXT,
      address TEXT,
      city TEXT,
      phone TEXT,
      email TEXT,
      source TEXT DEFAULT 'manual',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS scans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL,
      score INTEGER,
      grade TEXT,
      findings TEXT,
      raw_headers TEXT,
      scanned_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (business_id) REFERENCES businesses(id)
    );

    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL,
      scan_id INTEGER NOT NULL,
      narrative TEXT,
      published INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (business_id) REFERENCES businesses(id),
      FOREIGN KEY (scan_id) REFERENCES scans(id)
    );

    CREATE TABLE IF NOT EXISTS outreach (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL,
      method TEXT DEFAULT 'email',
      status TEXT DEFAULT 'pending',
      sent_at TEXT,
      responded_at TEXT,
      notes TEXT,
      FOREIGN KEY (business_id) REFERENCES businesses(id)
    );

    CREATE INDEX IF NOT EXISTS idx_businesses_slug ON businesses(slug);
    CREATE INDEX IF NOT EXISTS idx_scans_business ON scans(business_id);
    CREATE INDEX IF NOT EXISTS idx_reports_business ON reports(business_id);
  `);

  // -- New tables --
  db.exec(`
    CREATE TABLE IF NOT EXISTS regions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      name TEXT UNIQUE NOT NULL,
      state TEXT,
      cities TEXT NOT NULL,
      categories TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL UNIQUE,
      contact_name TEXT,
      contact_email TEXT,
      contact_phone TEXT,
      status TEXT DEFAULT 'lead',
      signed_at TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (business_id) REFERENCES businesses(id)
    );

    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      type TEXT,
      status TEXT DEFAULT 'pending',
      started_at TEXT,
      completed_at TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (client_id) REFERENCES clients(id)
    );

    CREATE TABLE IF NOT EXISTS interactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      notes TEXT,
      occurred_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (business_id) REFERENCES businesses(id)
    );

    CREATE TABLE IF NOT EXISTS job_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_name TEXT NOT NULL,
      started_at TEXT DEFAULT (datetime('now')),
      ended_at TEXT,
      status TEXT DEFAULT 'running',
      result_summary TEXT
    );

    CREATE TABLE IF NOT EXISTS scheduled_scans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL,
      frequency TEXT DEFAULT 'monthly',
      next_run TEXT,
      last_run TEXT,
      enabled INTEGER DEFAULT 1,
      FOREIGN KEY (business_id) REFERENCES businesses(id)
    );

    CREATE TABLE IF NOT EXISTS support_tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      subject TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'open',
      priority TEXT DEFAULT 'normal',
      created_at TEXT DEFAULT (datetime('now')),
      resolved_at TEXT,
      FOREIGN KEY (client_id) REFERENCES clients(id)
    );

    CREATE INDEX IF NOT EXISTS idx_clients_business ON clients(business_id);
    CREATE INDEX IF NOT EXISTS idx_projects_client ON projects(client_id);
    CREATE INDEX IF NOT EXISTS idx_interactions_business ON interactions(business_id);
    CREATE INDEX IF NOT EXISTS idx_job_runs_name ON job_runs(job_name);
  `);

  // -- Add columns to existing tables --

  // businesses
  addColumnIfMissing('businesses', 'pipeline_stage', "TEXT DEFAULT 'discovered'");
  addColumnIfMissing('businesses', 'region_id', 'INTEGER REFERENCES regions(id)');
  addColumnIfMissing('businesses', 'domain', 'TEXT');
  addColumnIfMissing('businesses', 'cold_pool_until', 'TEXT');
  addColumnIfMissing('businesses', 'referral_source', 'TEXT');
  addColumnIfMissing('businesses', 'unsubscribed', 'INTEGER DEFAULT 0');

  // domain index (must come after the domain column is added)
  db.exec('CREATE INDEX IF NOT EXISTS idx_businesses_domain ON businesses(domain)');

  // outreach
  addColumnIfMissing('outreach', 'email_subject', 'TEXT');
  addColumnIfMissing('outreach', 'email_body', 'TEXT');
  addColumnIfMissing('outreach', 'follow_up_count', 'INTEGER DEFAULT 0');
  addColumnIfMissing('outreach', 'follow_up_due', 'TEXT');
  addColumnIfMissing('outreach', 'reply_text', 'TEXT');
  addColumnIfMissing('outreach', 'reply_classification', 'TEXT');

  // scans
  addColumnIfMissing('scans', 'source', "TEXT DEFAULT 'manual'");

  // -- Backfill domain from url for existing rows --
  const needsDomain = db.prepare(
    "SELECT id, url FROM businesses WHERE domain IS NULL AND url IS NOT NULL"
  ).all();
  if (needsDomain.length > 0) {
    const update = db.prepare('UPDATE businesses SET domain = ? WHERE id = ?');
    const tx = db.transaction(() => {
      for (const row of needsDomain) {
        const domain = extractDomain(row.url);
        if (domain) update.run(domain, row.id);
      }
    });
    tx();
  }

  // -- Backfill pipeline_stage from the old derived CASE logic --
  db.exec(`
    UPDATE businesses SET pipeline_stage =
      CASE
        WHEN id IN (SELECT business_id FROM outreach WHERE responded_at IS NOT NULL) THEN 'responded'
        WHEN id IN (SELECT business_id FROM outreach WHERE sent_at IS NOT NULL) THEN 'outreach_sent'
        WHEN id IN (SELECT business_id FROM reports WHERE published = 1) THEN 'report_ready'
        WHEN id IN (SELECT business_id FROM reports) THEN 'report_draft'
        WHEN id IN (SELECT business_id FROM scans) THEN 'scanned'
        ELSE 'discovered'
      END
    WHERE pipeline_stage IS NULL OR pipeline_stage = 'discovered'
  `);

  // -- Add columns to regions for existing DBs --
  addColumnIfMissing('regions', 'slug', 'TEXT');
  addColumnIfMissing('regions', 'state', 'TEXT');
  addColumnIfMissing('regions', 'categories', 'TEXT');

  // Backfill slug for regions missing it
  const regionsNoSlug = db.prepare("SELECT id, name FROM regions WHERE slug IS NULL").all();
  if (regionsNoSlug.length > 0) {
    const updateSlug = db.prepare('UPDATE regions SET slug = ? WHERE id = ?');
    for (const r of regionsNoSlug) {
      updateSlug.run(slugify(r.name), r.id);
    }
    // Now add unique index if not present
  }
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_regions_slug ON regions(slug)');

  // -- Seed default region if none exist --
  const regionCount = db.prepare('SELECT COUNT(*) as count FROM regions').get().count;
  if (regionCount === 0) {
    db.prepare(
      "INSERT INTO regions (slug, name, state, cities) VALUES (?, ?, ?, ?)"
    ).run('southern-nh', 'Southern NH', 'NH', JSON.stringify(['Milford', 'Nashua', 'Amherst', 'Hollis', 'Bedford', 'Merrimack']));
  }
}

// -- Business operations --

function slugify(name) {
  return name.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

function addBusiness({ name, url, category, address, city, phone, email, source, region_id }) {
  const d = getDb();
  let slug = slugify(name);

  // Handle duplicates
  const existing = d.prepare('SELECT slug FROM businesses WHERE slug = ?').get(slug);
  if (existing) {
    slug = slug + '-' + Date.now().toString(36).slice(-4);
  }

  const domain = extractDomain(url);

  const stmt = d.prepare(`
    INSERT INTO businesses (name, slug, url, category, address, city, phone, email, source, domain, region_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    name, slug, url, category || null, address || null, city || null,
    phone || null, email || null, source || 'manual', domain, region_id || null
  );
  return { id: result.lastInsertRowid, slug };
}

function getBusiness(idOrSlug) {
  const d = getDb();
  if (typeof idOrSlug === 'number') {
    return d.prepare('SELECT * FROM businesses WHERE id = ?').get(idOrSlug);
  }
  return d.prepare('SELECT * FROM businesses WHERE slug = ?').get(idOrSlug);
}

function listBusinesses({ category, hasScans, limit } = {}) {
  const d = getDb();
  let sql = 'SELECT b.*, s.score, s.grade, s.scanned_at AS last_scanned FROM businesses b LEFT JOIN scans s ON s.id = (SELECT id FROM scans WHERE business_id = b.id ORDER BY scanned_at DESC LIMIT 1)';
  const conditions = [];
  const params = [];

  if (category) {
    conditions.push('b.category = ?');
    params.push(category);
  }
  if (hasScans === true) {
    conditions.push('s.id IS NOT NULL');
  } else if (hasScans === false) {
    conditions.push('s.id IS NULL');
  }

  if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY b.created_at DESC';
  if (limit) {
    sql += ' LIMIT ?';
    params.push(limit);
  }

  return d.prepare(sql).all(...params);
}

function businessExistsByDomain(domain) {
  const d = getDb();
  const row = d.prepare('SELECT id FROM businesses WHERE domain = ?').get(domain);
  return !!row;
}

function unsubscribeBusiness(id) {
  const d = getDb();
  d.prepare('UPDATE businesses SET unsubscribed = 1, updated_at = datetime(?) WHERE id = ?')
    .run(new Date().toISOString(), id);
}

function updatePipelineStage(id, stage) {
  const d = getDb();
  d.prepare('UPDATE businesses SET pipeline_stage = ?, updated_at = datetime(?) WHERE id = ?')
    .run(stage, new Date().toISOString(), id);
}

// -- Scan operations --

function saveScan(businessId, { score, grade, findings, rawHeaders }) {
  const d = getDb();
  const stmt = d.prepare(`
    INSERT INTO scans (business_id, score, grade, findings, raw_headers)
    VALUES (?, ?, ?, ?, ?)
  `);
  const result = stmt.run(businessId, score, grade, JSON.stringify(findings), JSON.stringify(rawHeaders || {}));
  d.prepare("UPDATE businesses SET updated_at = datetime('now') WHERE id = ?").run(businessId);
  return result.lastInsertRowid;
}

function getLatestScan(businessId) {
  const d = getDb();
  const scan = d.prepare('SELECT * FROM scans WHERE business_id = ? ORDER BY scanned_at DESC LIMIT 1').get(businessId);
  if (scan && scan.findings) scan.findings = JSON.parse(scan.findings);
  if (scan && scan.raw_headers) scan.raw_headers = JSON.parse(scan.raw_headers);
  return scan;
}

// -- Report operations --

function saveReport(businessId, scanId, narrative) {
  const d = getDb();
  const stmt = d.prepare(`
    INSERT INTO reports (business_id, scan_id, narrative)
    VALUES (?, ?, ?)
  `);
  return stmt.run(businessId, scanId, narrative).lastInsertRowid;
}

function getLatestReport(businessId) {
  const d = getDb();
  return d.prepare('SELECT * FROM reports WHERE business_id = ? ORDER BY created_at DESC LIMIT 1').get(businessId);
}

function publishReport(reportId) {
  const d = getDb();
  d.prepare('UPDATE reports SET published = 1 WHERE id = ?').run(reportId);
}

// -- Outreach operations --

function saveOutreach(businessId, { method, status, notes }) {
  const d = getDb();
  const stmt = d.prepare(`
    INSERT INTO outreach (business_id, method, status, notes)
    VALUES (?, ?, ?, ?)
  `);
  return stmt.run(businessId, method || 'email', status || 'pending', notes || null).lastInsertRowid;
}

function updateOutreach(id, updates) {
  const d = getDb();
  const fields = [];
  const params = [];
  for (const [key, val] of Object.entries(updates)) {
    fields.push(`${key} = ?`);
    params.push(val);
  }
  params.push(id);
  d.prepare(`UPDATE outreach SET ${fields.join(', ')} WHERE id = ?`).run(...params);
}

// -- Stats --

function getStats() {
  const d = getDb();
  const total = d.prepare('SELECT COUNT(*) as count FROM businesses').get().count;
  const scanned = d.prepare('SELECT COUNT(DISTINCT business_id) as count FROM scans').get().count;
  const reported = d.prepare('SELECT COUNT(DISTINCT business_id) as count FROM reports WHERE published = 1').get().count;
  const grades = d.prepare(`
    SELECT s.grade, COUNT(*) as count
    FROM scans s
    INNER JOIN (SELECT business_id, MAX(scanned_at) as max_date FROM scans GROUP BY business_id) latest
      ON s.business_id = latest.business_id AND s.scanned_at = latest.max_date
    GROUP BY s.grade
  `).all();
  const outreachSent = d.prepare("SELECT COUNT(*) as count FROM outreach WHERE status != 'pending'").get().count;
  const responses = d.prepare("SELECT COUNT(*) as count FROM outreach WHERE responded_at IS NOT NULL").get().count;

  return { total, scanned, reported, outreachSent, responses, grades };
}

// -- Pipeline view --

function getPipeline() {
  const d = getDb();
  return d.prepare(`
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

// -- Region operations --

function addRegion({ slug, name, state, cities, categories }) {
  const d = getDb();
  const regionSlug = slug || slugify(name);
  const result = d.prepare(
    'INSERT INTO regions (slug, name, state, cities, categories) VALUES (?, ?, ?, ?, ?)'
  ).run(
    regionSlug,
    name,
    state || null,
    JSON.stringify(Array.isArray(cities) ? cities : []),
    categories ? JSON.stringify(Array.isArray(categories) ? categories : []) : null
  );
  return { id: result.lastInsertRowid, slug: regionSlug };
}

function getRegion(id) {
  const d = getDb();
  return d.prepare('SELECT * FROM regions WHERE id = ?').get(id);
}

function listRegions() {
  const d = getDb();
  return d.prepare('SELECT * FROM regions ORDER BY name').all();
}

// -- Interaction operations --

function addInteraction({ business_id, type, notes }) {
  const d = getDb();
  const result = d.prepare(
    'INSERT INTO interactions (business_id, type, notes) VALUES (?, ?, ?)'
  ).run(business_id, type, notes || null);
  return result.lastInsertRowid;
}

// -- Job run operations --

function logJobStart(jobName) {
  const d = getDb();
  const result = d.prepare('INSERT INTO job_runs (job_name) VALUES (?)').run(jobName);
  return result.lastInsertRowid;
}

function logJobEnd(id, { status, result_summary }) {
  const d = getDb();
  d.prepare(
    "UPDATE job_runs SET ended_at = datetime('now'), status = ?, result_summary = ? WHERE id = ?"
  ).run(status, result_summary || null, id);
}

// -- Client operations --

function createClient({ business_id, contact_name, contact_email, contact_phone, status }) {
  const d = getDb();
  const result = d.prepare(
    'INSERT INTO clients (business_id, contact_name, contact_email, contact_phone, status) VALUES (?, ?, ?, ?, ?)'
  ).run(business_id, contact_name || null, contact_email || null, contact_phone || null, status || 'lead');
  return result.lastInsertRowid;
}

function getClientByBusiness(businessId) {
  const d = getDb();
  return d.prepare('SELECT * FROM clients WHERE business_id = ?').get(businessId);
}

function listClients(status) {
  const d = getDb();
  let sql = 'SELECT c.*, b.name AS business_name, b.url AS business_url FROM clients c JOIN businesses b ON b.id = c.business_id';
  const params = [];
  if (status) {
    sql += ' WHERE c.status = ?';
    params.push(status);
  }
  sql += ' ORDER BY c.created_at DESC';
  return d.prepare(sql).all(...params);
}

// -- Project operations --

function createProject({ client_id, name, type, status }) {
  const d = getDb();
  const result = d.prepare(
    'INSERT INTO projects (client_id, name, type, status) VALUES (?, ?, ?, ?)'
  ).run(client_id, name, type || null, status || 'pending');
  return result.lastInsertRowid;
}

function getProject(id) {
  const d = getDb();
  return d.prepare('SELECT * FROM projects WHERE id = ?').get(id);
}

function updateProject(id, updates) {
  const d = getDb();
  const fields = [];
  const params = [];
  for (const [key, val] of Object.entries(updates)) {
    fields.push(`${key} = ?`);
    params.push(val);
  }
  fields.push("updated_at = datetime('now')");
  params.push(id);
  d.prepare(`UPDATE projects SET ${fields.join(', ')} WHERE id = ?`).run(...params);
}

// ─────────────────────────────────────────────────────────────────────────

function close() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = {
  getDb, addBusiness, getBusiness, listBusinesses, slugify,
  saveScan, getLatestScan,
  saveReport, getLatestReport, publishReport,
  saveOutreach, updateOutreach,
  getStats, getPipeline, close,
  // New exports
  addRegion, getRegion, listRegions,
  updatePipelineStage,
  businessExistsByDomain,
  unsubscribeBusiness,
  addInteraction,
  logJobStart, logJobEnd,
  createClient, getClientByBusiness, listClients,
  createProject, getProject, updateProject,
};
