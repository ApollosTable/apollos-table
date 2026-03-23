const express = require('express');
const router = express.Router();
const db = require('../../shared/db');
const { generateScope } = require('../../security/reporter');

// GET /api/clients — list warm leads and active clients
router.get('/', (req, res) => {
  try {
    const pipeline = db.getPipeline();
    const warmLeads = pipeline.filter((b) => b.pipeline_stage === 'warm_lead');
    const clients = db.listClients();
    res.json({ warmLeads, clients });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/clients/:businessId/scope — generate scope from latest scan
router.post('/:businessId/scope', (req, res) => {
  try {
    const biz = db.getBusiness(Number(req.params.businessId));
    if (!biz) return res.status(404).json({ error: 'Business not found' });

    const scan = db.getLatestScan(biz.id);
    if (!scan) return res.status(400).json({ error: 'No scan data. Run a scan first.' });

    const scope = generateScope(scan);
    res.json(scope);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/clients/:businessId/convert — convert warm lead to client
router.post('/:businessId/convert', (req, res) => {
  try {
    const biz = db.getBusiness(Number(req.params.businessId));
    if (!biz) return res.status(404).json({ error: 'Business not found' });

    const { tier, scope, price, stripeLink, monthlyRate } = req.body || {};

    const clientId = db.createClient({
      business_id: biz.id,
      contact_name: biz.name,
      contact_email: biz.email,
      contact_phone: biz.phone,
      status: 'active',
    });

    const projectId = db.createProject({
      client_id: clientId,
      name: `${tier === 'rebuild' ? 'Rebuild' : 'Security Fix'} — ${biz.name}`,
      type: tier || 'fix',
      status: 'pending',
    });

    db.updatePipelineStage(biz.id, 'client');

    res.json({ clientId, projectId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/clients/projects/:projectId/paid — mark project as paid
router.post('/projects/:projectId/paid', (req, res) => {
  try {
    const project = db.getProject(Number(req.params.projectId));
    if (!project) return res.status(404).json({ error: 'Project not found' });

    db.updateProject(project.id, {
      status: 'queued',
      paid_at: new Date().toISOString(),
    });

    res.json({ projectId: project.id, status: 'queued' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
