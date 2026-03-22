// scanner/parser.js
function isBlacklisted(title, blacklist) {
  const lower = title.toLowerCase();
  return blacklist.some(term => lower.includes(term.toLowerCase()));
}

function parseListingsScript() {
  const listings = [];
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
