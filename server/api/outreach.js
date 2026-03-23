const express = require('express');
const router = express.Router();
const db = require('../../shared/db');
const { generateOutreachEmail } = require('../../security/reporter');
const { sendEmail } = require('../../shared/email');

// POST /api/outreach/:businessId/draft — draft outreach email
router.post('/:businessId/draft', async (req, res) => {
  try {
    const biz = db.getBusiness(Number(req.params.businessId));
    if (!biz) return res.status(404).json({ error: 'Business not found' });

    const scan = db.getLatestScan(biz.id);
    if (!scan) return res.status(400).json({ error: 'No scan data. Run a scan first.' });

    const report = db.getLatestReport(biz.id);
    if (!report) return res.status(400).json({ error: 'No report found. Generate one first.' });

    const { subject, body } = await generateOutreachEmail(biz, scan, report);

    // Save outreach record
    const outreachId = db.saveOutreach(biz.id, {
      method: 'email',
      status: 'draft',
      notes: `Draft generated`,
    });

    // Save email_subject and email_body via raw update
    const d = db.getDb();
    d.prepare('UPDATE outreach SET email_subject = ?, email_body = ? WHERE id = ?')
      .run(subject, body, outreachId);

    res.json({ outreachId, email_subject: subject, email_body: body });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/outreach/:businessId/send — send outreach email
router.post('/:businessId/send', async (req, res) => {
  try {
    const biz = db.getBusiness(Number(req.params.businessId));
    if (!biz) return res.status(404).json({ error: 'Business not found' });

    if (biz.unsubscribed) {
      return res.status(400).json({ error: 'Business is unsubscribed. Cannot send email.' });
    }

    if (!biz.email) {
      return res.status(400).json({ error: 'Business has no email address on file.' });
    }

    // Get latest outreach draft
    const d = db.getDb();
    const outreach = d.prepare(
      'SELECT * FROM outreach WHERE business_id = ? ORDER BY id DESC LIMIT 1'
    ).get(biz.id);

    if (!outreach || !outreach.email_subject || !outreach.email_body) {
      return res.status(400).json({ error: 'No draft found. Generate a draft first.' });
    }

    await sendEmail({
      to: biz.email,
      subject: outreach.email_subject,
      body: outreach.email_body,
      businessId: biz.id,
    });

    // Update outreach record
    const now = new Date();
    const followUpDue = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);
    db.updateOutreach(outreach.id, {
      status: 'sent',
      sent_at: now.toISOString(),
      follow_up_due: followUpDue.toISOString(),
    });

    db.updatePipelineStage(biz.id, 'outreach_sent');

    res.json({
      outreachId: outreach.id,
      status: 'sent',
      follow_up_due: followUpDue.toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/outreach/:businessId/reply — log a reply manually
router.post('/:businessId/reply', (req, res) => {
  try {
    const biz = db.getBusiness(Number(req.params.businessId));
    if (!biz) return res.status(404).json({ error: 'Business not found' });

    const { replyText, classification } = req.body;
    if (!replyText) {
      return res.status(400).json({ error: 'replyText is required' });
    }

    // Get latest outreach
    const d = db.getDb();
    const outreach = d.prepare(
      'SELECT * FROM outreach WHERE business_id = ? ORDER BY id DESC LIMIT 1'
    ).get(biz.id);

    if (!outreach) {
      return res.status(400).json({ error: 'No outreach record found for this business.' });
    }

    // Update outreach with reply data
    db.updateOutreach(outreach.id, {
      status: 'replied',
      responded_at: new Date().toISOString(),
      reply_text: replyText,
      reply_classification: classification || null,
    });

    // Log interaction
    db.addInteraction({
      business_id: biz.id,
      type: 'reply_received',
      notes: `Classification: ${classification || 'unclassified'}. Text: ${replyText}`,
    });

    // If interested, update to warm_lead
    if (classification === 'interested') {
      db.updatePipelineStage(biz.id, 'warm_lead');
    }

    res.json({
      outreachId: outreach.id,
      status: 'replied',
      classification: classification || null,
      stage: classification === 'interested' ? 'warm_lead' : biz.pipeline_stage,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
