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
  _db.prepare("UPDATE raw_listings SET status = ?, last_checked = datetime('now') WHERE id = ?").run(status, id);
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
