/**
 * Tests for the Express server and /api/stats endpoints.
 * Uses an in-memory database and a unique port to avoid conflicts.
 */

// Set env before requiring anything
process.env.APOLLO_DB_PATH = ':memory:';
process.env.PORT = '3456';

const http = require('http');
const db = require('../shared/db');

let server;

beforeAll((done) => {
  // Clear any cached server module
  delete require.cache[require.resolve('../server')];
  server = require('../server');
  // Wait for the server to be listening
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

function get(path) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:3456${path}`, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    }).on('error', reject);
  });
}

// ── GET /api/stats ──────────────────────────────────────────────────────

describe('GET /api/stats', () => {
  test('returns stats object with expected keys', async () => {
    const { status, body } = await get('/api/stats');
    expect(status).toBe(200);
    expect(body).toHaveProperty('total');
    expect(body).toHaveProperty('scanned');
    expect(body).toHaveProperty('reported');
    expect(body).toHaveProperty('outreachSent');
    expect(body).toHaveProperty('responses');
    expect(body).toHaveProperty('grades');
    expect(body).toHaveProperty('regions');
    expect(Array.isArray(body.regions)).toBe(true);
  });

  test('regions array contains seeded default region', async () => {
    const { body } = await get('/api/stats');
    expect(body.regions.length).toBeGreaterThanOrEqual(1);
    expect(body.regions[0]).toHaveProperty('name');
    expect(body.regions[0]).toHaveProperty('cities');
  });
});

// ── GET /api/stats/jobs ─────────────────────────────────────────────────

describe('GET /api/stats/jobs', () => {
  test('returns empty array when no jobs exist', async () => {
    const { status, body } = await get('/api/stats/jobs');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(0);
  });

  test('returns latest job per job_name after logging jobs', async () => {
    // Log two runs for "scan" and one for "discover"
    const scanId1 = db.logJobStart('scan');
    db.logJobEnd(scanId1, { status: 'ok', result_summary: 'first' });
    const scanId2 = db.logJobStart('scan');
    db.logJobEnd(scanId2, { status: 'ok', result_summary: 'second' });
    const discId = db.logJobStart('discover');
    db.logJobEnd(discId, { status: 'ok', result_summary: 'found 5' });

    const { status, body } = await get('/api/stats/jobs');
    expect(status).toBe(200);
    expect(body.length).toBe(2);

    const scanJob = body.find((j) => j.job_name === 'scan');
    expect(scanJob).toBeDefined();
    expect(scanJob.result_summary).toBe('second');

    const discoverJob = body.find((j) => j.job_name === 'discover');
    expect(discoverJob).toBeDefined();
    expect(discoverJob.result_summary).toBe('found 5');
  });
});
