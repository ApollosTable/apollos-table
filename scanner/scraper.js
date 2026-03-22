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
  let cookies;
  try {
    cookies = loadCookies();
  } catch (err) {
    console.error(`[Scanner] ${err.message}`);
    return { scanned: 0, new: 0, error: 'missing_cookies' };
  }

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
    const maxPrice = cfg.scanner.max_price;

    const searchUrl = `https://www.facebook.com/marketplace/search?query=${encodeURIComponent(query)}&maxPrice=${maxPrice}&exact=false`;
    console.log(`[Scanner] Searching: "${query}" (max $${maxPrice})`);

    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 3000)); // Let dynamic content load

    // Parse listings from page
    const rawListings = await page.evaluate(parseListingsScript);
    console.log(`[Scanner] Found ${rawListings.length} listings on page`);

    let newCount = 0;

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
          distance_miles: null,
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
