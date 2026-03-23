const Anthropic = require('@anthropic-ai/sdk');
const config = require('../shared/config').load();

let client;
function getClient() {
  if (!client) client = new Anthropic();
  return client;
}

async function generateNarrative(business, scan) {
  const anthropic = getClient();

  const findingsSummary = scan.findings.map(f =>
    `- [${f.severity.toUpperCase()}] ${f.title}: ${f.detail}`
  ).join('\n');

  const prompt = `You are writing a website security report for a small business owner. The business is "${business.name}", a ${business.category || 'local business'} in ${business.city || 'Southern NH'}.

Their website (${business.url}) scored ${scan.score}/100 (Grade: ${scan.grade}).

Findings:
${findingsSummary || 'No major issues found.'}

Write a short, direct report narrative for the business owner. Rules:
- Write like a knowledgeable neighbor explaining the issues, not a corporate consultant
- NO jargon. If you must use a technical term, explain it in parentheses
- Focus on what these issues mean for THEIR BUSINESS: lost customers, security risk, Google ranking impact
- Be honest but not alarmist. Don't scare them, inform them.
- Keep it under 200 words
- End with a single sentence about what fixing these issues would do for them
- Do NOT mention yourself, the report tool, or any specific consultant
- Do NOT use bullet points — write in short paragraphs`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 500,
    messages: [{ role: 'user', content: prompt }],
  });

  return response.content[0].text;
}

async function generateOutreachEmail(business, scan, report) {
  const anthropic = getClient();
  const contactName = config.contact.name;
  const contactEmail = process.env.CONTACT_EMAIL || config.contact.email;
  const contactPhone = process.env.CONTACT_PHONE || config.contact.phone;

  const prompt = `Write a cold outreach email from ${contactName}, a website security consultant in Southern NH, to ${business.name} (a ${business.category || 'local business'}).

Their website scored ${scan.grade} (${scan.score}/100) on a security check. Top issues: ${scan.findings.slice(0, 3).map(f => f.title).join(', ')}.

A full report is available at: https://apollostable.com/report.html?b=${encodeURIComponent(business.slug)}

Rules:
- Subject line + body
- Short (under 150 words in the body)
- Friendly, not salesy. You're a local guy who noticed their site has some issues.
- Don't list every finding — tease 1-2 specific issues that sound concerning
- Include the report link
- Mention you're local to Southern NH
- End with a low-pressure CTA: "happy to walk you through it" or similar
- Sign off with: ${contactName} | ${contactPhone} | ${contactEmail}
- Format: first line is "Subject: ..." then blank line then body`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 400,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].text;
  const subjectMatch = text.match(/^Subject:\s*(.+)/im);
  const subject = subjectMatch ? subjectMatch[1].trim() : `Quick note about ${business.name}'s website`;
  const body = text.replace(/^Subject:.+\n\n?/im, '').trim();

  return { subject, body };
}

// ── Scope Generation ─────────────────────────────────────────────────

const PRICING = {
  'no-https': { description: 'Install and configure SSL certificate', hours: 0.5, price: 75 },
  'ssl-expired': { description: 'Renew SSL certificate', hours: 0.5, price: 75 },
  'ssl-expiring': { description: 'Renew SSL certificate (expiring soon)', hours: 0.5, price: 75 },
  'ssl-error': { description: 'Fix SSL certificate issue', hours: 0.5, price: 75 },
  'no-https-redirect': { description: 'Configure HTTPS redirect', hours: 0.25, price: 50 },
  'no-hsts': { description: 'Add HSTS security header', hours: 0.25, price: 50 },
  'no-xcto': { description: 'Add X-Content-Type-Options header', hours: 0.15, price: 25 },
  'no-xfo': { description: 'Add clickjacking protection', hours: 0.15, price: 25 },
  'no-csp': { description: 'Configure Content Security Policy', hours: 0.5, price: 75 },
  'no-referrer-policy': { description: 'Add Referrer Policy header', hours: 0.15, price: 25 },
  'no-permissions-policy': { description: 'Add Permissions Policy header', hours: 0.15, price: 25 },
  'wp-version-exposed': { description: 'Hide WordPress version', hours: 0.25, price: 50 },
  'wp-xmlrpc': { description: 'Disable XML-RPC', hours: 0.25, price: 50 },
  'wp-readme': { description: 'Remove WordPress readme', hours: 0.15, price: 25 },
  'admin-exposed-wp-loginphp': { description: 'Harden WordPress login access', hours: 1, price: 150 },
  'admin-exposed-wpadmin': { description: 'Harden WordPress admin access', hours: 1, price: 150 },
  'admin-exposed-admin': { description: 'Harden admin panel access', hours: 1, price: 150 },
  'admin-exposed-administrator': { description: 'Harden admin panel access', hours: 1, price: 150 },
  'server-version': { description: 'Hide server version info', hours: 0.25, price: 50 },
  'powered-by': { description: 'Remove X-Powered-By header', hours: 0.15, price: 25 },
  'cookie-flags': { description: 'Add security flags to cookies', hours: 0.25, price: 50 },
  'mixed-content': { description: 'Fix mixed content issues', hours: 0.5, price: 75 },
  'outdated-jquery': { description: 'Update jQuery to current version', hours: 1, price: 100 },
  'outdated-bootstrap': { description: 'Update Bootstrap to current version', hours: 1, price: 100 },
};

function generateScope(scan) {
  const items = [];
  for (const finding of (scan.findings || [])) {
    const pricing = PRICING[finding.id];
    if (pricing) {
      items.push({
        finding_id: finding.id,
        description: pricing.description,
        estimated_hours: pricing.hours,
        price: pricing.price,
        status: 'pending',
      });
    } else {
      items.push({
        finding_id: finding.id,
        description: `Fix: ${finding.title}`,
        estimated_hours: 0.5,
        price: 75,
        status: 'pending',
      });
    }
  }
  const totalPrice = items.reduce((sum, i) => sum + i.price, 0);
  const tier = totalPrice > 1000 ? 'rebuild' : 'fix';
  return { items, total_price: totalPrice, tier };
}

module.exports = { generateNarrative, generateOutreachEmail, generateScope };
