const express = require('express');
const router = express.Router();
const db = require('../../shared/db');
const { generateNarrative } = require('../../security/reporter');

// POST /api/reports/:businessId — generate report for single business
router.post('/:businessId', async (req, res) => {
  try {
    const biz = db.getBusiness(Number(req.params.businessId));
    if (!biz) return res.status(404).json({ error: 'Business not found' });

    const scan = db.getLatestScan(biz.id);
    if (!scan) return res.status(400).json({ error: 'No scan data. Run a scan first.' });

    const narrative = await generateNarrative(biz, scan);
    const reportId = db.saveReport(biz.id, scan.id, narrative);
    db.updatePipelineStage(biz.id, 'report_draft');

    res.json({ reportId, narrative });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/reports/:businessId/publish — publish a report
router.post('/:businessId/publish', (req, res) => {
  try {
    const biz = db.getBusiness(Number(req.params.businessId));
    if (!biz) return res.status(404).json({ error: 'Business not found' });

    const report = db.getLatestReport(biz.id);
    if (!report) return res.status(400).json({ error: 'No report found. Generate one first.' });

    db.publishReport(report.id);
    db.updatePipelineStage(biz.id, 'report_published');

    res.json({ reportId: report.id, published: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/reports — batch generate reports
router.post('/', async (req, res) => {
  try {
    let { businessIds } = req.body || {};

    // If no IDs provided, generate for all scanned businesses without reports
    if (!businessIds || !Array.isArray(businessIds) || businessIds.length === 0) {
      const pipeline = db.getPipeline();
      businessIds = pipeline
        .filter((b) => b.last_scanned && !b.report_id)
        .map((b) => b.id);
    }

    const results = [];
    for (const id of businessIds) {
      const biz = db.getBusiness(Number(id));
      if (!biz) {
        results.push({ businessId: id, error: 'Not found' });
        continue;
      }

      const scan = db.getLatestScan(biz.id);
      if (!scan) {
        results.push({ businessId: biz.id, error: 'No scan data' });
        continue;
      }

      try {
        const narrative = await generateNarrative(biz, scan);
        const reportId = db.saveReport(biz.id, scan.id, narrative);
        db.updatePipelineStage(biz.id, 'report_draft');
        results.push({ businessId: biz.id, reportId });
      } catch (err) {
        results.push({ businessId: biz.id, error: err.message });
      }
    }

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
