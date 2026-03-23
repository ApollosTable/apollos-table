require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();

app.use(cors());
app.use(express.json());

// API routes
app.use('/api/stats', require('./server/api/stats'));
app.use('/api/regions', require('./server/api/regions'));
app.use('/api/businesses', require('./server/api/businesses'));
app.use('/api/scan', require('./server/api/scan'));
app.use('/api/reports', require('./server/api/reports'));
app.use('/api/outreach', require('./server/api/outreach'));
app.use('/api/discover', require('./server/api/discover'));
app.use('/api/clients', require('./server/api/clients'));

// Serve React frontend from app/dist if it exists
const distPath = path.join(__dirname, 'app', 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`Apollo's Table server listening on port ${PORT}`);

  const { startJobs } = require('./shared/jobs');
  startJobs();
});

module.exports = server;
