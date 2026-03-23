const express = require('express');
const router = express.Router();
const { discoverAll } = require('../../security/discover');

router.post('/', async (req, res) => {
  try {
    const { regionId } = req.body;
    const result = await discoverAll(regionId || null);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
