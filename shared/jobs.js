const cron = require('node-cron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const db = require('./db');
const { scanUrl } = require('../security/scanner');

// ── Follow-Up Check (daily 9am) ────────────────────────────────────────

async function followUpCheck() {
  const jobId = db.logJobStart('follow-up-check');
  console.log('[job] follow-up-check started');

  try {
    const d = db.getDb();
    const today = new Date().toISOString().slice(0, 10);

    // Outreach records due for follow-up:
    // follow_up_due <= today, follow_up_count < 2, no response, status = 'sent',
    // and the business is not unsubscribed
    const rows = d.prepare(`
      SELECT o.id AS outreach_id, o.business_id, o.follow_up_count
      FROM outreach o
      JOIN businesses b ON b.id = o.business_id
      WHERE o.follow_up_due <= ?
        AND o.follow_up_count < 2
        AND o.responded_at IS NULL
        AND o.status = 'sent'
        AND (b.unsubscribed IS NULL OR b.unsubscribed = 0)
    `).all(today);

    let followed = 0;
    let movedToCold = 0;

    for (const row of rows) {
      const newCount = (row.follow_up_count || 0) + 1;

      if (newCount >= 2) {
        // Max follow-ups reached -- move to cold pool
        const coldUntil = new Date();
        coldUntil.setDate(coldUntil.getDate() + 60);
        const coldUntilStr = coldUntil.toISOString().slice(0, 10);

        d.prepare('UPDATE outreach SET follow_up_count = ? WHERE id = ?')
          .run(newCount, row.outreach_id);
        d.prepare('UPDATE businesses SET pipeline_stage = ?, cold_pool_until = ?, updated_at = datetime(?) WHERE id = ?')
          .run('cold_pool', coldUntilStr, new Date().toISOString(), row.business_id);

        movedToCold++;
      } else {
        // Schedule next follow-up 5 days out
        const nextDue = new Date();
        nextDue.setDate(nextDue.getDate() + 5);
        const nextDueStr = nextDue.toISOString().slice(0, 10);

        d.prepare('UPDATE outreach SET follow_up_count = ?, follow_up_due = ? WHERE id = ?')
          .run(newCount, nextDueStr, row.outreach_id);
        db.updatePipelineStage(row.business_id, 'follow_up');

        followed++;
      }
    }

    const summary = `Processed ${rows.length} records: ${followed} follow-ups scheduled, ${movedToCold} moved to cold pool`;
    console.log(`[job] follow-up-check done: ${summary}`);
    db.logJobEnd(jobId, { status: 'success', result_summary: summary });
  } catch (err) {
    console.error('[job] follow-up-check error:', err.message);
    db.logJobEnd(jobId, { status: 'error', result_summary: err.message });
  }
}

// ── Cold Pool Rescan (daily 3am) ────────────────────────────────────────

async function coldPoolRescan() {
  const jobId = db.logJobStart('cold-pool-rescan');
  console.log('[job] cold-pool-rescan started');

  try {
    const d = db.getDb();
    const today = new Date().toISOString().slice(0, 10);

    const rows = d.prepare(`
      SELECT id, url
      FROM businesses
      WHERE pipeline_stage = 'cold_pool'
        AND cold_pool_until <= ?
        AND (unsubscribed IS NULL OR unsubscribed = 0)
    `).all(today);

    let rescanned = 0;
    let changed = 0;

    for (const biz of rows) {
      try {
        const prevScan = db.getLatestScan(biz.id);
        const result = await scanUrl(biz.url);

        db.saveScan(biz.id, {
          score: result.score,
          grade: result.grade,
          findings: result.findings,
          rawHeaders: result.headers,
        });

        rescanned++;

        const prevScore = prevScan ? prevScan.score : null;
        if (prevScore !== null && prevScore !== result.score) {
          db.updatePipelineStage(biz.id, 'scanned');
          d.prepare('UPDATE businesses SET cold_pool_until = NULL, updated_at = datetime(?) WHERE id = ?')
            .run(new Date().toISOString(), biz.id);
          changed++;
        }
      } catch (scanErr) {
        console.error(`[job] cold-pool-rescan: failed to scan business ${biz.id}:`, scanErr.message);
      }
    }

    const summary = `Rescanned ${rescanned}/${rows.length} businesses, ${changed} score changes detected`;
    console.log(`[job] cold-pool-rescan done: ${summary}`);
    db.logJobEnd(jobId, { status: 'success', result_summary: summary });
  } catch (err) {
    console.error('[job] cold-pool-rescan error:', err.message);
    db.logJobEnd(jobId, { status: 'error', result_summary: err.message });
  }
}

// ── Database Backup (midnight) ──────────────────────────────────────────

function dbBackup() {
  const jobId = db.logJobStart('db-backup');
  console.log('[job] db-backup started');

  try {
    const srcPath = path.join(__dirname, '..', 'apollo.db');
    const backupDir = path.join(os.homedir(), 'OneDrive', 'backups');
    const dateStr = new Date().toISOString().slice(0, 10);
    const destPath = path.join(backupDir, `apollo-${dateStr}.db`);

    // Create backup directory if needed
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    // Copy the database file
    fs.copyFileSync(srcPath, destPath);

    // Delete backups older than 30 days
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    let deleted = 0;

    const files = fs.readdirSync(backupDir);
    for (const file of files) {
      const match = file.match(/^apollo-(\d{4}-\d{2}-\d{2})\.db$/);
      if (match) {
        const fileDate = new Date(match[1]);
        if (fileDate < cutoff) {
          fs.unlinkSync(path.join(backupDir, file));
          deleted++;
        }
      }
    }

    const summary = `Backed up to ${destPath}, deleted ${deleted} old backup(s)`;
    console.log(`[job] db-backup done: ${summary}`);
    db.logJobEnd(jobId, { status: 'success', result_summary: summary });
  } catch (err) {
    console.error('[job] db-backup error:', err.message);
    db.logJobEnd(jobId, { status: 'error', result_summary: err.message });
  }
}

// ── Start All Jobs ──────────────────────────────────────────────────────

function startJobs() {
  console.log('[jobs] Scheduling background jobs...');

  // Daily 9am -- follow-up check
  cron.schedule('0 9 * * *', () => {
    followUpCheck();
  });

  // Daily 3am -- cold pool rescan
  cron.schedule('0 3 * * *', () => {
    coldPoolRescan();
  });

  // Midnight -- database backup
  cron.schedule('0 0 * * *', () => {
    dbBackup();
  });

  console.log('[jobs] Background jobs scheduled: follow-up-check (9am), cold-pool-rescan (3am), db-backup (midnight)');
}

module.exports = { startJobs, followUpCheck, coldPoolRescan, dbBackup };
