// evaluator/comps.js
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

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
