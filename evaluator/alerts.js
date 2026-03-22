// evaluator/alerts.js
const notifier = require('node-notifier');
const nodemailer = require('nodemailer');
const config = require('../shared/config');

function shouldAlert(grade) {
  const cfg = config.get().alerts;
  if (grade === 'A') return { desktop: cfg.desktop, email: cfg.email };
  if (grade === 'B') return { desktop: cfg.desktop, email: false };
  return { desktop: false, email: false };
}

function formatAlertMessage({ title, grade, net_profit, distance_miles, location }) {
  return `[Grade ${grade}] ${title}\nEst. profit: $${net_profit} | ${distance_miles} mi | ${location}`;
}

async function sendAlert(deal) {
  const { desktop, email } = shouldAlert(deal.grade);
  const message = formatAlertMessage(deal);

  if (desktop) {
    notifier.notify({
      title: `Apollo's Table — Grade ${deal.grade} Deal`,
      message: `${deal.title}\n$${deal.net_profit} profit | ${deal.distance_miles} mi`,
      sound: true
    });
    console.log(`[Alert] Desktop notification sent: ${deal.title}`);
  }

  if (email) {
    try {
      const emailAddr = process.env.ALERT_EMAIL;
      const smtpPass = process.env.SMTP_PASSWORD;
      if (!emailAddr || !smtpPass) return;

      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: emailAddr, pass: smtpPass }
      });

      await transporter.sendMail({
        from: emailAddr,
        to: emailAddr,
        subject: `Apollo's Table: Grade ${deal.grade} — ${deal.title}`,
        html: `
          <h2>Grade ${deal.grade} Deal Found</h2>
          <p><strong>${deal.title}</strong></p>
          <p>Est. Profit: <strong>$${deal.net_profit}</strong></p>
          <p>Distance: ${deal.distance_miles} miles (${deal.location})</p>
          <p>Item: ${deal.item_type || 'unknown'} ${deal.brand ? '— ' + deal.brand : ''}</p>
          <p><a href="${deal.url}" style="font-size:18px;font-weight:bold">VIEW LISTING</a></p>
          <hr><p style="color:#888;font-size:12px">Apollo's Table — apollostable.com</p>
        `
      });
      console.log(`[Alert] Email sent: ${deal.title}`);
    } catch (err) {
      console.error(`[Alert] Email failed: ${err.message}`);
    }
  }
}

module.exports = { shouldAlert, formatAlertMessage, sendAlert };
