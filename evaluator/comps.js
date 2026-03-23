// evaluator/comps.js
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

let _browser = null;

function parseEbaySoldPrices(priceText) {
  if (!priceText) return null;
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

async function getBrowser() {
  if (_browser && _browser.isConnected()) return _browser;
  _browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
  });
  return _browser;
}

async function closeBrowser() {
  if (_browser) {
    await _browser.close().catch(() => {});
    _browser = null;
  }
}

async function fetchSoldComps(searchQuery) {
  if (!searchQuery) return null;
  const encoded = encodeURIComponent(searchQuery);
  const url = `https://www.ebay.com/sch/i.html?_nkw=${encoded}&LH_Complete=1&LH_Sold=1&_sop=13&_ipg=60`;

  let page;
  try {
    const browser = await getBrowser();
    page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // eBay uses s-card__price (new) or s-item__price (legacy) — wait for either
    await page.waitForSelector('.s-card__price, .s-item__price', { timeout: 15000 }).catch(() => {});

    // Scroll to trigger lazy loading of more items
    await page.evaluate(() => window.scrollBy(0, 2000));
    await new Promise(r => setTimeout(r, 2000));

    const prices = await page.evaluate(() => {
      // Try new selector first, fall back to legacy
      let els = document.querySelectorAll('.s-card__price');
      if (els.length === 0) els = document.querySelectorAll('.s-item__price');
      return Array.from(els).map(el => el.textContent.trim());
    });

    await page.close();

    const parsed = prices.map(p => parseEbaySoldPrices(p)).filter(p => p !== null && p > 0);

    if (parsed.length === 0) {
      console.log(`[Comps] No sold prices found for "${searchQuery}"`);
      return null;
    }

    const stats = calculateCompStats(parsed);
    console.log(`[Comps] Found ${stats.count} sold comps for "${searchQuery}" — median $${stats.median}`);
    return stats;
  } catch (err) {
    if (page) await page.close().catch(() => {});
    if (err.message.includes('Target closed') || err.message.includes('Protocol error')) {
      _browser = null;
    }
    console.error(`[Comps] Error fetching comps for "${searchQuery}": ${err.message}`);
    return null;
  }
}

module.exports = { parseEbaySoldPrices, calculateCompStats, fetchSoldComps, closeBrowser };
