const express = require('express');
const router = express.Router();
const db = require('../../shared/db');
const { scanUrl } = require('../../security/scanner');

// POST /api/scan/:businessId — scan single business
router.post('/:businessId', async (req, res) => {
  try {
    const biz = db.getBusiness(Number(req.params.businessId));
    if (!biz) return res.status(404).json({ error: 'Business not found' });

    const result = await scanUrl(biz.url);
    const scanId = db.saveScan(biz.id, {
      score: result.score,
      grade: result.grade,
      findings: result.findings,
      rawHeaders: result.headers,
    });

    db.updatePipelineStage(biz.id, 'scanned');

    res.json({ scanId, score: result.score, grade: result.grade, findings: result.findings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/scan — batch scan
router.post('/', async (req, res) => {
  try {
    let { businessIds } = req.body || {};

    // If no IDs provided, scan all unscanned businesses
    if (!businessIds || !Array.isArray(businessIds) || businessIds.length === 0) {
      const pipeline = db.getPipeline();
      businessIds = pipeline
        .filter((b) => !b.last_scanned)
        .map((b) => b.id);
    }

    const results = [];
    for (const id of businessIds) {
      const biz = db.getBusiness(Number(id));
      if (!biz) {
        results.push({ businessId: id, error: 'Not found' });
        continue;
      }

      try {
        const result = await scanUrl(biz.url);
        const scanId = db.saveScan(biz.id, {
          score: result.score,
          grade: result.grade,
          findings: result.findings,
          rawHeaders: result.headers,
        });
        db.updatePipelineStage(biz.id, 'scanned');
        results.push({ businessId: biz.id, scanId, score: result.score, grade: result.grade });
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
