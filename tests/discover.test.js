/**
 * Tests for discovery dedup and domain population.
 * Uses an in-memory database via APOLLO_DB_PATH=:memory:
 */

// Force in-memory DB before requiring db module
process.env.APOLLO_DB_PATH = ':memory:';

const db = require('../shared/db');

afterAll(() => {
  db.close();
});

// ── addBusiness populates domain ────────────────────────────────────────

describe('addBusiness domain population', () => {
  test('extracts hostname from a full URL', () => {
    const { id } = db.addBusiness({
      name: 'Domain Extraction Co',
      url: 'https://www.example.com/page?q=1',
      category: 'plumber',
    });
    const biz = db.getBusiness(id);
    expect(biz.domain).toBe('www.example.com');
  });

  test('extracts hostname from URL with path only', () => {
    const { id } = db.addBusiness({
      name: 'Simple Domain Co',
      url: 'https://simpledomain.net',
      category: 'hvac',
    });
    const biz = db.getBusiness(id);
    expect(biz.domain).toBe('simpledomain.net');
  });

  test('extracts hostname from http URL', () => {
    const { id } = db.addBusiness({
      name: 'HTTP Only Co',
      url: 'http://httponly.org/contact',
      category: 'roofing',
    });
    const biz = db.getBusiness(id);
    expect(biz.domain).toBe('httponly.org');
  });

  test('stores region_id when provided', () => {
    const region = db.addRegion({ name: 'Discover Region', cities: ['TestCity'], state: 'TX' });
    const { id } = db.addBusiness({
      name: 'Region Assigned Co',
      url: 'https://regionassigned.com',
      region_id: region.id,
    });
    const biz = db.getBusiness(id);
    expect(biz.region_id).toBe(region.id);
  });
});

// ── businessExistsByDomain ──────────────────────────────────────────────

describe('businessExistsByDomain', () => {
  test('returns true for a domain that exists in the database', () => {
    db.addBusiness({
      name: 'Already Here Inc',
      url: 'https://alreadyhere.com/about',
      category: 'electrician',
    });
    expect(db.businessExistsByDomain('alreadyhere.com')).toBe(true);
  });

  test('returns false for a domain not in the database', () => {
    expect(db.businessExistsByDomain('does-not-exist-xyz.com')).toBe(false);
  });

  test('returns false for null domain', () => {
    expect(db.businessExistsByDomain(null)).toBe(false);
  });

  test('returns false for empty string domain', () => {
    expect(db.businessExistsByDomain('')).toBe(false);
  });

  test('differentiates subdomains', () => {
    db.addBusiness({
      name: 'Subdomain Co',
      url: 'https://shop.subdomain.com',
      category: 'fencing',
    });
    expect(db.businessExistsByDomain('shop.subdomain.com')).toBe(true);
    expect(db.businessExistsByDomain('subdomain.com')).toBe(false);
  });
});
