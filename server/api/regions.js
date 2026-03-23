const express = require('express');
const router = express.Router();
const db = require('../../shared/db');

// GET /api/regions — list all regions
router.get('/', (req, res) => {
  try {
    const regions = db.listRegions();
    res.json(regions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/regions — create a new region
router.post('/', (req, res) => {
  try {
    const { name, state, cities, categories } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }

    const slug = db.slugify(name);
    const result = db.addRegion({
      slug,
      name,
      state: state || null,
      cities: Array.isArray(cities) ? cities : [],
      categories: categories || null,
    });

    res.status(201).json({ id: result.id, slug: result.slug, name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
