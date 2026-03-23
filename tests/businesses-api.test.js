/**
 * Tests for the /api/businesses endpoints.
 * Uses an in-memory database and port 3458 to avoid conflicts.
 */

// Set env before requiring anything
process.env.APOLLO_DB_PATH = ':memory:';
process.env.PORT = '3458';

const http = require('http');
const db = require('../shared/db');

let server;

beforeAll((done) => {
  delete require.cache[require.resolve('../server')];
  delete require.cache[require.resolve('../shared/db')];
  server = require('../server');
  if (server.listening) {
    done();
  } else {
    server.on('listening', done);
  }
});

afterAll((done) => {
  db.close();
  server.close(done);
});

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: '127.0.0.1',
      port: 3458,
      path,
      method,
      headers: { 'Content-Type': 'application/json' },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ── POST /api/businesses ───────────────────────────────────────────────

describe('POST /api/businesses', () => {
  test('adds a business and returns id + slug', async () => {
    const { status, body } = await request('POST', '/api/businesses', {
      name: 'Test Bakery',
      url: 'https://testbakery.com',
      category: 'bakery',
    });

    expect(status).toBe(201);
    expect(body).toHaveProperty('id');
    expect(body).toHaveProperty('slug');
    expect(body.slug).toBe('test-bakery');
  });

  test('returns 400 when name is missing', async () => {
    const { status, body } = await request('POST', '/api/businesses', {
      url: 'https://example.com',
    });

    expect(status).toBe(400);
    expect(body.error).toMatch(/name/i);
  });

  test('returns 400 when url is missing', async () => {
    const { status, body } = await request('POST', '/api/businesses', {
      name: 'No URL Biz',
    });

    expect(status).toBe(400);
    expect(body.error).toMatch(/url/i);
  });
});

// ── GET /api/businesses ────────────────────────────────────────────────

describe('GET /api/businesses', () => {
  test('lists businesses including the one we created', async () => {
    const { status, body } = await request('GET', '/api/businesses');

    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(1);

    const bakery = body.find((b) => b.slug === 'test-bakery');
    expect(bakery).toBeDefined();
    expect(bakery.name).toBe('Test Bakery');
  });

  test('filters by category', async () => {
    // Add a second business with different category
    await request('POST', '/api/businesses', {
      name: 'Test Plumber',
      url: 'https://testplumber.com',
      category: 'plumber',
    });

    const { body } = await request('GET', '/api/businesses?category=bakery');
    expect(body.length).toBe(1);
    expect(body[0].category).toBe('bakery');
  });

  test('respects limit parameter', async () => {
    const { body } = await request('GET', '/api/businesses?limit=1');
    expect(body.length).toBe(1);
  });
});

// ── GET /api/businesses/:id ────────────────────────────────────────────

describe('GET /api/businesses/:id', () => {
  test('returns business with scan and report as null', async () => {
    // Get the bakery id first
    const { body: list } = await request('GET', '/api/businesses');
    const bakery = list.find((b) => b.slug === 'test-bakery');

    const { status, body } = await request('GET', `/api/businesses/${bakery.id}`);
    expect(status).toBe(200);
    expect(body.name).toBe('Test Bakery');
    expect(body.scan).toBeNull();
    expect(body.report).toBeNull();
  });

  test('returns 404 for nonexistent business', async () => {
    const { status } = await request('GET', '/api/businesses/99999');
    expect(status).toBe(404);
  });
});

// ── PATCH /api/businesses/:id/stage ────────────────────────────────────

describe('PATCH /api/businesses/:id/stage', () => {
  let bizId;

  beforeAll(async () => {
    const { body: list } = await request('GET', '/api/businesses');
    bizId = list.find((b) => b.slug === 'test-bakery').id;
  });

  test('updates pipeline stage', async () => {
    const { status, body } = await request('PATCH', `/api/businesses/${bizId}/stage`, {
      stage: 'scanned',
    });

    expect(status).toBe(200);
    expect(body.id).toBe(bizId);
    expect(body.pipeline_stage).toBe('scanned');
  });

  test('returns 400 for invalid stage', async () => {
    const { status, body } = await request('PATCH', `/api/businesses/${bizId}/stage`, {
      stage: 'not-a-real-stage',
    });

    expect(status).toBe(400);
    expect(body.error).toMatch(/invalid stage/i);
  });

  test('returns 400 when stage is missing', async () => {
    const { status, body } = await request('PATCH', `/api/businesses/${bizId}/stage`, {});

    expect(status).toBe(400);
    expect(body.error).toMatch(/invalid stage/i);
  });
});

// ── POST /api/businesses/:id/unsubscribe ───────────────────────────────

describe('POST /api/businesses/:id/unsubscribe', () => {
  test('marks business as unsubscribed', async () => {
    const { body: list } = await request('GET', '/api/businesses');
    const bizId = list.find((b) => b.slug === 'test-bakery').id;

    const { status, body } = await request('POST', `/api/businesses/${bizId}/unsubscribe`);

    expect(status).toBe(200);
    expect(body.id).toBe(bizId);
    expect(body.unsubscribed).toBe(true);
  });
});
