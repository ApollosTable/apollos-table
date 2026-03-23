/**
 * Tests for shared/email.js — email building, SMTP validation, rate limiting.
 */

// In-memory DB for interaction logging
process.env.APOLLO_DB_PATH = ':memory:';

// Clear any SMTP env vars so tests start clean
beforeEach(() => {
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_PORT;
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASS;

  // Reset module cache so db module gets fresh in-memory DB
  jest.resetModules();
});

// ── buildEmail ──────────────────────────────────────────────────────────

describe('buildEmail', () => {
  test('adds CAN-SPAM footer with physical address', () => {
    const { buildEmail } = require('../shared/email');
    process.env.SMTP_USER = 'test@example.com';

    const msg = buildEmail({
      to: 'recipient@example.com',
      subject: 'Test Subject',
      body: '<p>Hello there</p>',
      businessId: 42,
    });

    expect(msg.html).toContain('Milford, NH 03055');
    expect(msg.text).toContain('Milford, NH 03055');
    expect(msg.html).toContain("Apollo's Table");
    expect(msg.text).toContain("Apollo's Table");
  });

  test('includes unsubscribe link with businessId', () => {
    const { buildEmail } = require('../shared/email');
    process.env.SMTP_USER = 'test@example.com';

    const msg = buildEmail({
      to: 'recipient@example.com',
      subject: 'Security Report',
      body: '<p>Your report is ready</p>',
      businessId: 99,
    });

    expect(msg.html).toContain('unsubscribe?bid=99');
    expect(msg.text).toContain('unsubscribe?bid=99');
  });

  test('unsubscribe link works without businessId', () => {
    const { buildEmail } = require('../shared/email');
    process.env.SMTP_USER = 'test@example.com';

    const msg = buildEmail({
      to: 'recipient@example.com',
      subject: 'Hello',
      body: '<p>Hi</p>',
    });

    expect(msg.html).toContain('https://apollostable.com/unsubscribe');
    expect(msg.text).toContain('https://apollostable.com/unsubscribe');
    // Should NOT contain bid= since no businessId
    expect(msg.html).not.toContain('bid=');
  });

  test('sets correct from, to, and subject fields', () => {
    const { buildEmail } = require('../shared/email');
    process.env.SMTP_USER = 'sender@apollostable.com';

    const msg = buildEmail({
      to: 'recipient@example.com',
      subject: 'Test',
      body: '<p>Body</p>',
    });

    expect(msg.from).toBe('sender@apollostable.com');
    expect(msg.to).toBe('recipient@example.com');
    expect(msg.subject).toBe('Test');
  });

  test('generates plain text version without HTML tags', () => {
    const { buildEmail } = require('../shared/email');
    process.env.SMTP_USER = 'test@example.com';

    const msg = buildEmail({
      to: 'recipient@example.com',
      subject: 'Test',
      body: '<p>Hello <strong>world</strong></p>',
    });

    expect(msg.text).not.toContain('<p>');
    expect(msg.text).not.toContain('<strong>');
    expect(msg.text).toContain('Hello world');
  });
});

// ── getTransporter ──────────────────────────────────────────────────────

describe('getTransporter', () => {
  test('throws without SMTP config', () => {
    const { getTransporter } = require('../shared/email');

    expect(() => getTransporter()).toThrow('SMTP not configured');
  });

  test('throws when partial SMTP config is set', () => {
    const { getTransporter } = require('../shared/email');
    process.env.SMTP_HOST = 'smtp.example.com';
    // Missing PORT, USER, PASS

    expect(() => getTransporter()).toThrow('SMTP not configured');
  });

  test('returns transporter when fully configured', () => {
    const { getTransporter } = require('../shared/email');
    process.env.SMTP_HOST = 'smtp.example.com';
    process.env.SMTP_PORT = '587';
    process.env.SMTP_USER = 'user@example.com';
    process.env.SMTP_PASS = 'password123';

    const transporter = getTransporter();
    expect(transporter).toBeDefined();
    expect(typeof transporter.sendMail).toBe('function');
  });
});

// ── sendEmail ───────────────────────────────────────────────────────────

describe('sendEmail', () => {
  test('rejects without SMTP config', async () => {
    const { sendEmail, _resetRateLimiter } = require('../shared/email');
    _resetRateLimiter();

    await expect(
      sendEmail({
        to: 'test@example.com',
        subject: 'Test',
        body: '<p>Hi</p>',
      })
    ).rejects.toThrow('SMTP not configured');
  });

  test('enforces rate limit', async () => {
    // Mock nodemailer before requiring email module
    jest.resetModules();
    const mockSendMail = jest.fn().mockResolvedValue({ messageId: 'test-123' });
    jest.mock('nodemailer', () => ({
      createTransport: jest.fn(() => ({ sendMail: mockSendMail })),
    }));

    process.env.SMTP_HOST = 'smtp.example.com';
    process.env.SMTP_PORT = '587';
    process.env.SMTP_USER = 'user@example.com';
    process.env.SMTP_PASS = 'password123';
    process.env.EMAIL_RATE_LIMIT = '2';

    const email = require('../shared/email');
    email._resetRateLimiter();

    // First two should succeed
    await email.sendEmail({ to: 'a@b.com', subject: 'S', body: 'B' });
    await email.sendEmail({ to: 'a@b.com', subject: 'S', body: 'B' });

    // Third should hit rate limit
    await expect(
      email.sendEmail({ to: 'a@b.com', subject: 'S', body: 'B' })
    ).rejects.toThrow('Rate limit exceeded');

    expect(mockSendMail).toHaveBeenCalledTimes(2);
  });
});
