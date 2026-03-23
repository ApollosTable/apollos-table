/**
 * Tests for the extended database schema and helper functions.
 * Uses an in-memory database via APOLLO_DB_PATH=:memory:
 */

// Force in-memory DB before requiring db module
process.env.APOLLO_DB_PATH = ':memory:';

const db = require('../shared/db');

afterAll(() => {
  db.close();
});

// ── Schema: new tables exist ────────────────────────────────────────────

describe('Schema — new tables', () => {
  const tableNames = [
    'regions',
    'clients',
    'projects',
    'interactions',
    'job_runs',
    'scheduled_scans',
    'support_tickets',
  ];

  test.each(tableNames)('table "%s" exists', (table) => {
    const row = db.getDb().prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
    ).get(table);
    expect(row).toBeTruthy();
    expect(row.name).toBe(table);
  });
});

// ── Schema: new columns on existing tables ──────────────────────────────

describe('Schema — new columns on businesses', () => {
  const cols = [
    'pipeline_stage',
    'region_id',
    'domain',
    'cold_pool_until',
    'referral_source',
    'unsubscribed',
  ];

  test.each(cols)('businesses has column "%s"', (col) => {
    const info = db.getDb().prepare('PRAGMA table_info(businesses)').all();
    const names = info.map((c) => c.name);
    expect(names).toContain(col);
  });
});

describe('Schema — new columns on outreach', () => {
  const cols = [
    'email_subject',
    'email_body',
    'follow_up_count',
    'follow_up_due',
    'reply_text',
    'reply_classification',
  ];

  test.each(cols)('outreach has column "%s"', (col) => {
    const info = db.getDb().prepare('PRAGMA table_info(outreach)').all();
    const names = info.map((c) => c.name);
    expect(names).toContain(col);
  });
});

describe('Schema — new columns on scans', () => {
  test('scans has column "source"', () => {
    const info = db.getDb().prepare('PRAGMA table_info(scans)').all();
    const names = info.map((c) => c.name);
    expect(names).toContain('source');
  });
});

// ── Region helpers ──────────────────────────────────────────────────────

describe('Region helpers', () => {
  let regionId;

  test('addRegion inserts a region and returns id', () => {
    const result = db.addRegion({ name: 'Test Region', cities: ['Alpha', 'Beta'] });
    regionId = result.id;
    expect(regionId).toBeDefined();
  });

  test('getRegion retrieves by id', () => {
    const region = db.getRegion(regionId);
    expect(region).toBeTruthy();
    expect(region.name).toBe('Test Region');
    expect(JSON.parse(region.cities)).toEqual(['Alpha', 'Beta']);
  });

  test('listRegions returns all regions', () => {
    const regions = db.listRegions();
    expect(regions.length).toBeGreaterThanOrEqual(1);
  });

  test('default "Southern NH" region is seeded', () => {
    const regions = db.listRegions();
    const snh = regions.find((r) => r.name === 'Southern NH');
    expect(snh).toBeTruthy();
    const cities = JSON.parse(snh.cities);
    expect(cities).toContain('Milford');
    expect(cities).toContain('Nashua');
  });
});

// ── Pipeline stage helpers ──────────────────────────────────────────────

describe('Pipeline stage helpers', () => {
  let bizId;

  beforeAll(() => {
    const result = db.addBusiness({
      name: 'Pipeline Test Co',
      url: 'https://pipelinetest.com',
      category: 'plumber',
    });
    bizId = result.id;
  });

  test('new business gets pipeline_stage "discovered"', () => {
    const biz = db.getBusiness(bizId);
    expect(biz.pipeline_stage).toBe('discovered');
  });

  test('updatePipelineStage changes the stage', () => {
    db.updatePipelineStage(bizId, 'scanned');
    const biz = db.getBusiness(bizId);
    expect(biz.pipeline_stage).toBe('scanned');
  });
});

// ── addBusiness now stores domain and region_id ────────────────────────

describe('addBusiness extended fields', () => {
  test('domain is extracted from url', () => {
    const { id } = db.addBusiness({
      name: 'Domain Test LLC',
      url: 'https://www.domaintest.com/about',
      category: 'hvac',
    });
    const biz = db.getBusiness(id);
    expect(biz.domain).toBe('www.domaintest.com');
  });

  test('region_id is stored when provided', () => {
    const region = db.addRegion({ name: 'RegionForBiz', cities: ['X'] });
    const { id } = db.addBusiness({
      name: 'Region Biz',
      url: 'https://regionbiz.com',
      region_id: region.id,
    });
    const biz = db.getBusiness(id);
    expect(biz.region_id).toBe(region.id);
  });
});

// ── businessExistsByDomain ──────────────────────────────────────────────

describe('businessExistsByDomain', () => {
  test('returns true for existing domain', () => {
    db.addBusiness({ name: 'Exists Co', url: 'https://existsco.com' });
    expect(db.businessExistsByDomain('existsco.com')).toBe(true);
  });

  test('returns false for unknown domain', () => {
    expect(db.businessExistsByDomain('nope-never.com')).toBe(false);
  });
});

// ── unsubscribeBusiness ─────────────────────────────────────────────────

describe('unsubscribeBusiness', () => {
  test('sets unsubscribed = 1', () => {
    const { id } = db.addBusiness({
      name: 'Unsub Co',
      url: 'https://unsubco.com',
    });
    db.unsubscribeBusiness(id);
    const biz = db.getBusiness(id);
    expect(biz.unsubscribed).toBe(1);
  });
});

// ── Interaction helpers ─────────────────────────────────────────────────

describe('Interaction helpers', () => {
  let bizId;

  beforeAll(() => {
    const r = db.addBusiness({
      name: 'Interact Co',
      url: 'https://interactco.com',
    });
    bizId = r.id;
  });

  test('addInteraction stores a record', () => {
    const id = db.addInteraction({
      business_id: bizId,
      type: 'call',
      notes: 'Left voicemail',
    });
    expect(id).toBeDefined();
  });
});

// ── Job run helpers ─────────────────────────────────────────────────────

describe('Job run helpers', () => {
  let runId;

  test('logJobStart creates a run', () => {
    runId = db.logJobStart('test_job');
    expect(runId).toBeDefined();
  });

  test('logJobEnd updates the run', () => {
    db.logJobEnd(runId, { status: 'success', result_summary: '10 scanned' });
    const row = db.getDb().prepare('SELECT * FROM job_runs WHERE id = ?').get(runId);
    expect(row.status).toBe('success');
    expect(row.ended_at).toBeTruthy();
  });
});

// ── Client helpers ──────────────────────────────────────────────────────

describe('Client helpers', () => {
  let bizId;
  let clientId;

  beforeAll(() => {
    const r = db.addBusiness({
      name: 'Client Source Co',
      url: 'https://clientsource.com',
    });
    bizId = r.id;
  });

  test('createClient stores a client', () => {
    clientId = db.createClient({
      business_id: bizId,
      contact_name: 'John Doe',
      contact_email: 'john@example.com',
      status: 'active',
    });
    expect(clientId).toBeDefined();
  });

  test('getClientByBusiness retrieves the client', () => {
    const client = db.getClientByBusiness(bizId);
    expect(client).toBeTruthy();
    expect(client.contact_name).toBe('John Doe');
  });

  test('listClients returns all clients', () => {
    const clients = db.listClients();
    expect(clients.length).toBeGreaterThanOrEqual(1);
  });

  test('listClients filters by status', () => {
    const active = db.listClients('active');
    expect(active.length).toBeGreaterThanOrEqual(1);
    const inactive = db.listClients('inactive');
    expect(inactive.every((c) => c.status === 'inactive')).toBe(true);
  });
});

// ── Project helpers ─────────────────────────────────────────────────────

describe('Project helpers', () => {
  let clientId;
  let projectId;

  beforeAll(() => {
    const biz = db.addBusiness({
      name: 'Project Source Co',
      url: 'https://projectsource.com',
    });
    clientId = db.createClient({
      business_id: biz.id,
      contact_name: 'Jane',
      contact_email: 'jane@example.com',
      status: 'active',
    });
  });

  test('createProject stores a project', () => {
    projectId = db.createProject({
      client_id: clientId,
      name: 'Website Redesign',
      type: 'redesign',
      status: 'active',
    });
    expect(projectId).toBeDefined();
  });

  test('getProject retrieves the project', () => {
    const project = db.getProject(projectId);
    expect(project).toBeTruthy();
    expect(project.name).toBe('Website Redesign');
  });

  test('updateProject modifies fields', () => {
    db.updateProject(projectId, { status: 'completed', notes: 'All done' });
    const project = db.getProject(projectId);
    expect(project.status).toBe('completed');
    expect(project.notes).toBe('All done');
  });
});

// ── getPipeline uses column directly ────────────────────────────────────

describe('getPipeline', () => {
  test('returns pipeline_stage from column, not CASE derivation', () => {
    const { id } = db.addBusiness({
      name: 'Pipeline Column Co',
      url: 'https://pipelinecol.com',
    });
    db.updatePipelineStage(id, 'report_ready');
    const rows = db.getPipeline();
    const row = rows.find((r) => r.id === id);
    expect(row).toBeTruthy();
    expect(row.pipeline_stage).toBe('report_ready');
  });
});
