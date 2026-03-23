const express = require('express');
const router = express.Router();
const db = require('../../shared/db');

// GET /api/stats — dashboard overview stats
router.get('/', (req, res) => {
  try {
    const stats = db.getStats();
    const regions = db.listRegions();
    res.json({ ...stats, regions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/stats/jobs — latest job runs grouped by job_name
router.get('/jobs', (req, res) => {
  try {
    const d = db.getDb();
    const jobs = d.prepare(`
      SELECT jr.*
      FROM job_runs jr
      INNER JOIN (
        SELECT job_name, MAX(id) AS max_id
        FROM job_runs
        GROUP BY job_name
      ) latest ON jr.id = latest.max_id
      ORDER BY jr.started_at DESC
    `).all();
    res.json(jobs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
