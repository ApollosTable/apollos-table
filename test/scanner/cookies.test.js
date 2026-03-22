const { expect } = require('chai');
const fs = require('fs');
const path = require('path');

const COOKIE_PATH = path.join(__dirname, 'test-cookies.json');

describe('cookies', () => {
  const { loadCookies, validateCookies } = require('../../scanner/cookies');

  afterEach(() => {
    if (fs.existsSync(COOKIE_PATH)) fs.unlinkSync(COOKIE_PATH);
  });

  it('loads cookies from a JSON file', () => {
    const fakeCookies = [
      { name: 'c_user', value: '12345', domain: '.facebook.com' },
      { name: 'xs', value: 'abc', domain: '.facebook.com' }
    ];
    fs.writeFileSync(COOKIE_PATH, JSON.stringify(fakeCookies));
    const cookies = loadCookies(COOKIE_PATH);
    expect(cookies).to.have.length(2);
    expect(cookies[0].name).to.equal('c_user');
  });

  it('throws if cookie file does not exist', () => {
    expect(() => loadCookies('/nonexistent/cookies.json')).to.throw(/cookie/i);
  });

  it('validates that required FB cookies are present', () => {
    const good = [
      { name: 'c_user', value: '12345', domain: '.facebook.com' },
      { name: 'xs', value: 'abc', domain: '.facebook.com' }
    ];
    expect(validateCookies(good)).to.be.true;
  });

  it('rejects cookies missing c_user', () => {
    const bad = [{ name: 'xs', value: 'abc', domain: '.facebook.com' }];
    expect(validateCookies(bad)).to.be.false;
  });
});
