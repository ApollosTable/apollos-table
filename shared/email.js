const nodemailer = require('nodemailer');

// ── Rate limiter state ──────────────────────────────────────────────────
let emailsSentThisWindow = 0;
let windowStart = Date.now();

const HOUR_MS = 60 * 60 * 1000;

function getRateLimit() {
  return parseInt(process.env.EMAIL_RATE_LIMIT, 10) || 50;
}

function checkRateLimit() {
  const now = Date.now();
  if (now - windowStart >= HOUR_MS) {
    emailsSentThisWindow = 0;
    windowStart = now;
  }
  if (emailsSentThisWindow >= getRateLimit()) {
    throw new Error(
      `Rate limit exceeded: ${emailsSentThisWindow}/${getRateLimit()} emails this hour`
    );
  }
}

function _resetRateLimiter() {
  emailsSentThisWindow = 0;
  windowStart = Date.now();
}

// ── Transporter ─────────────────────────────────────────────────────────

function getTransporter() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT, 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !port || !user || !pass) {
    throw new Error(
      'SMTP not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASS environment variables.'
    );
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

// ── Build email ─────────────────────────────────────────────────────────

const PHYSICAL_ADDRESS = 'Milford, NH 03055';

function buildEmail({ to, subject, body, businessId }) {
  const unsubscribeUrl = businessId
    ? `https://apollostable.com/unsubscribe?bid=${businessId}`
    : 'https://apollostable.com/unsubscribe';

  const canSpamFooter = [
    '',
    '---',
    `Apollo's Table | ${PHYSICAL_ADDRESS}`,
    `You received this because we thought our services might help your business.`,
    `Unsubscribe: ${unsubscribeUrl}`,
  ].join('\n');

  const canSpamHtml = `
    <hr style="margin-top:32px;border:none;border-top:1px solid #ddd;">
    <p style="font-size:12px;color:#888;margin-top:16px;">
      Apollo's Table | ${PHYSICAL_ADDRESS}<br>
      You received this because we thought our services might help your business.<br>
      <a href="${unsubscribeUrl}" style="color:#888;">Unsubscribe</a>
    </p>`;

  const htmlBody = body + canSpamHtml;
  const textBody = body.replace(/<[^>]+>/g, '') + canSpamFooter;

  return {
    from: process.env.SMTP_USER,
    to,
    subject,
    html: htmlBody,
    text: textBody,
  };
}

// ── Send email ──────────────────────────────────────────────────────────

async function sendEmail({ to, subject, body, businessId }) {
  checkRateLimit();

  const transporter = getTransporter();
  const message = buildEmail({ to, subject, body, businessId });
  const result = await transporter.sendMail(message);

  emailsSentThisWindow++;

  // Log interaction to DB if businessId provided
  if (businessId) {
    try {
      const db = require('./db');
      db.addInteraction({
        business_id: businessId,
        type: 'email_sent',
        notes: `Subject: ${subject}`,
      });
    } catch (err) {
      // Don't fail the send if DB logging fails
      console.error('Failed to log email interaction:', err.message);
    }
  }

  return result;
}

module.exports = {
  getTransporter,
  buildEmail,
  sendEmail,
  _resetRateLimiter,
};
