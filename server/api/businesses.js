const express = require('express');
const router = express.Router();
const db = require('../../shared/db');

const ALLOWED_STAGES = [
  'discovered', 'scanned', 'report_draft', 'report_published',
  'outreach_sent', 'follow_up', 'warm_lead', 'cold_pool',
];

// GET /api/businesses — list businesses with optional filters
router.get('/', (req, res) => {
  try {
    let rows = db.getPipeline();
    const { stage, grade, category, region_id, limit } = req.query;

    if (stage) {
      rows = rows.filter((r) => r.pipeline_stage === stage);
    }
    if (grade) {
      rows = rows.filter((r) => r.grade === grade.toUpperCase());
    }
    if (category) {
      rows = rows.filter((r) => r.category === category);
    }
    if (region_id) {
      rows = rows.filter((r) => r.region_id === Number(region_id));
    }
    if (limit) {
      rows = rows.slice(0, Number(limit));
    }

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/businesses/:id — single business with latest scan + report
router.get('/:id', (req, res) => {
  try {
    const idOrSlug = /^\d+$/.test(req.params.id)
      ? Number(req.params.id)
      : req.params.id;
    const biz = db.getBusiness(idOrSlug);
    if (!biz) return res.status(404).json({ error: 'Business not found' });

    const scan = db.getLatestScan(biz.id);
    const report = db.getLatestReport(biz.id);

    res.json({ ...biz, scan: scan || null, report: report || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/businesses — add business manually
router.post('/', (req, res) => {
  try {
    const { name, url, category, address, city, phone, email, source, region_id } = req.body;

    if (!name || !url) {
      return res.status(400).json({ error: 'name and url are required' });
    }

    const result = db.addBusiness({
      name, url, category, address, city, phone, email, source, region_id,
    });

    res.status(201).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/businesses/:id/stage — update pipeline stage
router.patch('/:id/stage', (req, res) => {
  try {
    const { stage } = req.body;
    if (!stage || !ALLOWED_STAGES.includes(stage)) {
      return res.status(400).json({
        error: `Invalid stage. Allowed: ${ALLOWED_STAGES.join(', ')}`,
      });
    }

    const biz = db.getBusiness(Number(req.params.id));
    if (!biz) return res.status(404).json({ error: 'Business not found' });

    db.updatePipelineStage(biz.id, stage);
    res.json({ id: biz.id, pipeline_stage: stage });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/businesses/:id/unsubscribe — mark business as unsubscribed
router.post('/:id/unsubscribe', (req, res) => {
  try {
    const biz = db.getBusiness(Number(req.params.id));
    if (!biz) return res.status(404).json({ error: 'Business not found' });

    db.unsubscribeBusiness(biz.id);
    res.json({ id: biz.id, unsubscribed: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
