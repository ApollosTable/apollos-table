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

module.exports = { generateNarrative, generateOutreachEmail };
