/**
 * Tests for the /api/regions endpoints.
 * Uses an in-memory database and port 3457 to avoid conflicts.
 */

// Set env before requiring anything
process.env.APOLLO_DB_PATH = ':memory:';
process.env.PORT = '3457';

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
      port: 3457,
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

// ── POST /api/regions ────────────────────────────────────────────────────

describe('POST /api/regions', () => {
  test('creates a region and returns id + slug', async () => {
    const { status, body } = await request('POST', '/api/regions', {
      name: 'Central Vermont',
      state: 'VT',
      cities: ['Montpelier', 'Barre', 'Waterbury'],
      categories: ['plumber', 'electrician'],
    });

    expect(status).toBe(201);
    expect(body).toHaveProperty('id');
    expect(body).toHaveProperty('slug');
    expect(body.slug).toBe('central-vermont');
    expect(body.name).toBe('Central Vermont');
  });

  test('returns 400 when name is missing', async () => {
    const { status, body } = await request('POST', '/api/regions', {
      state: 'NH',
      cities: ['Nashua'],
    });

    expect(status).toBe(400);
    expect(body).toHaveProperty('error');
    expect(body.error).toMatch(/name/i);
  });
});

// ── GET /api/regions ─────────────────────────────────────────────────────

describe('GET /api/regions', () => {
  test('lists created regions', async () => {
    const { status, body } = await request('GET', '/api/regions');

    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    // Should have the seeded region + the one we created above
    expect(body.length).toBeGreaterThanOrEqual(2);

    const cv = body.find((r) => r.name === 'Central Vermont');
    expect(cv).toBeDefined();
    expect(cv).toHaveProperty('id');
    expect(cv).toHaveProperty('cities');
  });
});
