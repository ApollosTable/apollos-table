const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'apollo.db');
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

function migrate() {
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
}

// -- Business operations --

function slugify(name) {
  return name.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

function addBusiness({ name, url, category, address, city, phone, email, source }) {
  const db = getDb();
  let slug = slugify(name);

  // Handle duplicates
  const existing = db.prepare('SELECT slug FROM businesses WHERE slug = ?').get(slug);
  if (existing) {
    slug = slug + '-' + Date.now().toString(36).slice(-4);
  }

  const stmt = db.prepare(`
    INSERT INTO businesses (name, slug, url, category, address, city, phone, email, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(name, slug, url, category || null, address || null, city || null, phone || null, email || null, source || 'manual');
  return { id: result.lastInsertRowid, slug };
}

function getBusiness(idOrSlug) {
  const db = getDb();
  if (typeof idOrSlug === 'number') {
    return db.prepare('SELECT * FROM businesses WHERE id = ?').get(idOrSlug);
  }
  return db.prepare('SELECT * FROM businesses WHERE slug = ?').get(idOrSlug);
}

function listBusinesses({ category, hasScans, limit } = {}) {
  const db = getDb();
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

  return db.prepare(sql).all(...params);
}

// -- Scan operations --

function saveScan(businessId, { score, grade, findings, rawHeaders }) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO scans (business_id, score, grade, findings, raw_headers)
    VALUES (?, ?, ?, ?, ?)
  `);
  const result = stmt.run(businessId, score, grade, JSON.stringify(findings), JSON.stringify(rawHeaders || {}));
  db.prepare('UPDATE businesses SET updated_at = datetime(\'now\') WHERE id = ?').run(businessId);
  return result.lastInsertRowid;
}

function getLatestScan(businessId) {
  const db = getDb();
  const scan = db.prepare('SELECT * FROM scans WHERE business_id = ? ORDER BY scanned_at DESC LIMIT 1').get(businessId);
  if (scan && scan.findings) scan.findings = JSON.parse(scan.findings);
  if (scan && scan.raw_headers) scan.raw_headers = JSON.parse(scan.raw_headers);
  return scan;
}

// -- Report operations --

function saveReport(businessId, scanId, narrative) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO reports (business_id, scan_id, narrative)
    VALUES (?, ?, ?)
  `);
  return stmt.run(businessId, scanId, narrative).lastInsertRowid;
}

function getLatestReport(businessId) {
  const db = getDb();
  return db.prepare('SELECT * FROM reports WHERE business_id = ? ORDER BY created_at DESC LIMIT 1').get(businessId);
}

function publishReport(reportId) {
  const db = getDb();
  db.prepare('UPDATE reports SET published = 1 WHERE id = ?').run(reportId);
}

// -- Outreach operations --

function saveOutreach(businessId, { method, status, notes }) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO outreach (business_id, method, status, notes)
    VALUES (?, ?, ?, ?)
  `);
  return stmt.run(businessId, method || 'email', status || 'pending', notes || null).lastInsertRowid;
}

function updateOutreach(id, updates) {
  const db = getDb();
  const fields = [];
  const params = [];
  for (const [key, val] of Object.entries(updates)) {
    fields.push(`${key} = ?`);
    params.push(val);
  }
  params.push(id);
  db.prepare(`UPDATE outreach SET ${fields.join(', ')} WHERE id = ?`).run(...params);
}

// -- Stats --

function getStats() {
  const db = getDb();
  const total = db.prepare('SELECT COUNT(*) as count FROM businesses').get().count;
  const scanned = db.prepare('SELECT COUNT(DISTINCT business_id) as count FROM scans').get().count;
  const reported = db.prepare('SELECT COUNT(DISTINCT business_id) as count FROM reports WHERE published = 1').get().count;
  const grades = db.prepare(`
    SELECT s.grade, COUNT(*) as count
    FROM scans s
    INNER JOIN (SELECT business_id, MAX(scanned_at) as max_date FROM scans GROUP BY business_id) latest
      ON s.business_id = latest.business_id AND s.scanned_at = latest.max_date
    GROUP BY s.grade
  `).all();
  const outreachSent = db.prepare("SELECT COUNT(*) as count FROM outreach WHERE status != 'pending'").get().count;
  const responses = db.prepare("SELECT COUNT(*) as count FROM outreach WHERE responded_at IS NOT NULL").get().count;

  return { total, scanned, reported, outreachSent, responses, grades };
}

// -- Pipeline view --

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
      o.responded_at AS outreach_responded,
      CASE
        WHEN o.responded_at IS NOT NULL THEN 'responded'
        WHEN o.sent_at IS NOT NULL THEN 'outreach_sent'
        WHEN r.published = 1 THEN 'report_ready'
        WHEN r.id IS NOT NULL THEN 'report_draft'
        WHEN s.id IS NOT NULL THEN 'scanned'
        ELSE 'discovered'
      END AS pipeline_stage
    FROM businesses b
    LEFT JOIN scans s ON s.id = (SELECT id FROM scans WHERE business_id = b.id ORDER BY scanned_at DESC LIMIT 1)
    LEFT JOIN reports r ON r.id = (SELECT id FROM reports WHERE business_id = b.id ORDER BY created_at DESC LIMIT 1)
    LEFT JOIN outreach o ON o.id = (SELECT id FROM outreach WHERE business_id = b.id ORDER BY id DESC LIMIT 1)
    ORDER BY b.updated_at DESC
  `).all();
}

function close() {
  if (db) db.close();
}

module.exports = {
  getDb, addBusiness, getBusiness, listBusinesses, slugify,
  saveScan, getLatestScan,
  saveReport, getLatestReport, publishReport,
  saveOutreach, updateOutreach,
  getStats, getPipeline, close
};
