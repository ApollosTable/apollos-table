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
  return names.includes('c_user') && names.includes('xs');
}

module.exports = { loadCookies, validateCookies };
