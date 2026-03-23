const https = require('https');
const { parse } = require('node-html-parser');
const config = require('../shared/config').load();
const db = require('../shared/db');

const UA = config.scanner.user_agent;

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const mod = parsed.protocol === 'https:' ? https : require('http');
    const req = mod.get(url, { headers: { 'User-Agent': UA }, timeout: 15000 }, (res) => {
      if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
        resolve(fetchPage(new URL(res.headers.location, url).toString()));
        return;
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

// Search Yellow Pages for local businesses
async function searchYellowPages(category, location) {
  const query = encodeURIComponent(category);
  const loc = encodeURIComponent(location);
  const url = `https://www.yellowpages.com/search?search_terms=${query}&geo_location_terms=${loc}`;

  console.log(`  Searching: ${category} in ${location}...`);

  let html;
  try {
    html = await fetchPage(url);
  } catch (e) {
    console.log(`  Failed to fetch Yellow Pages: ${e.message}`);
    return [];
  }

  const root = parse(html);
  const results = [];
  const listings = root.querySelectorAll('.result');

  for (const listing of listings) {
    const nameEl = listing.querySelector('.business-name a, .n a');
    const name = nameEl ? nameEl.text.trim() : null;
    if (!name) continue;

    // Look for website link
    const websiteEl = listing.querySelector('a.track-visit-website, a[href*="website"]');
    let website = null;
    if (websiteEl) {
      const href = websiteEl.getAttribute('href') || '';
      // Yellow Pages wraps URLs in a redirect
      const urlMatch = href.match(/[?&]redirect=([^&]+)/) || href.match(/[?&]url=([^&]+)/);
      if (urlMatch) {
        website = decodeURIComponent(urlMatch[1]);
      } else if (href.startsWith('http') && !href.includes('yellowpages.com')) {
        website = href;
      }
    }

    const phoneEl = listing.querySelector('.phones, .phone');
    const phone = phoneEl ? phoneEl.text.trim() : null;

    const addrEl = listing.querySelector('.adr, .street-address');
    const address = addrEl ? addrEl.text.trim() : null;

    const localityEl = listing.querySelector('.locality');
    const city = localityEl ? localityEl.text.trim().replace(/,\s*$/, '') : null;

    results.push({ name, website, phone, address, city, category });
  }

  return results;
}

// Discover businesses for all configured categories
// If regionId is provided, use that region's first city + state for location and its categories.
// Otherwise fall back to config.location and config.categories.
async function discoverAll(regionId) {
  let location;
  let categories;
  let defaultCity = config.location.city;

  if (regionId) {
    const region = db.getRegion(regionId);
    if (!region) throw new Error(`Region ${regionId} not found`);
    const cities = JSON.parse(region.cities || '[]');
    const city = cities[0] || config.location.city;
    const state = region.state || config.location.state;
    location = `${city}, ${state}`;
    defaultCity = city;
    categories = region.categories ? JSON.parse(region.categories) : config.categories;
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

      // O(1) domain dedup via indexed lookup
      const domain = safeHostname(biz.website);
      if (!domain || db.businessExistsByDomain(domain)) continue;

      try {
        const { id, slug } = db.addBusiness({
          name: biz.name,
          url: biz.website,
          category: biz.category,
          address: biz.address,
          city: biz.city || defaultCity,
          phone: biz.phone,
          source: 'yellowpages',
          region_id: regionId || null,
        });
        totalAdded++;
        console.log(`  + ${biz.name} (${biz.website})`);
      } catch (e) {
        // Likely duplicate slug, skip
      }
    }
    totalFound += businesses.length;
  }

  return { totalFound, totalAdded };
}

function safeHostname(url) {
  try {
    return new URL(url.startsWith('http') ? url : 'https://' + url).hostname;
  } catch {
    return null;
  }
}

// Add a single business manually
function addManual({ name, url, category, address, city, phone, email }) {
  if (!url.startsWith('http')) url = 'https://' + url;
  const result = db.addBusiness({
    name, url, category, address,
    city: city || config.location.city,
    phone, email, source: 'manual',
  });
  return result;
}

module.exports = { searchYellowPages, discoverAll, addManual };
