const https = require('https');
const http = require('http');
const { URL } = require('url');
const tls = require('tls');
const { parse } = require('node-html-parser');
const config = require('../shared/config').load();

const UA = config.scanner.user_agent;
const TIMEOUT = config.scanner.timeout_ms;

// -- HTTP helper --

function fetch(urlStr, { method = 'GET', followRedirects = true, maxRedirects = 5 } = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlStr);
    const mod = parsed.protocol === 'https:' ? https : http;

    const opts = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method,
      headers: { 'User-Agent': UA },
      timeout: TIMEOUT,
      rejectUnauthorized: false,
    };

    const req = mod.request(opts, (res) => {
      if (followRedirects && [301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && maxRedirects > 0) {
        const next = new URL(res.headers.location, urlStr).toString();
        resolve(fetch(next, { method, followRedirects, maxRedirects: maxRedirects - 1 }));
        return;
      }

      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks).toString('utf8'),
          url: urlStr,
        });
      });
    });

    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
    req.end();
  });
}

// -- Individual checks --

async function checkSSL(url) {
  const findings = [];
  const parsed = new URL(url);
  const hostname = parsed.hostname;

  // Check if HTTPS works at all
  try {
    const httpsUrl = `https://${hostname}`;
    await fetch(httpsUrl, { followRedirects: false });
  } catch (e) {
    findings.push({
      id: 'no-https',
      severity: 'critical',
      points: 25,
      title: 'No HTTPS support',
      detail: 'This site does not support encrypted connections. Visitors see a "Not Secure" warning in their browser, and any data they submit (contact forms, etc.) is sent in plain text.',
    });
    return findings;
  }

  // Check certificate validity
  try {
    const certInfo = await getCertInfo(hostname);
    if (certInfo.expired) {
      findings.push({
        id: 'ssl-expired',
        severity: 'critical',
        points: 25,
        title: 'SSL certificate expired',
        detail: `The security certificate expired on ${certInfo.validTo}. Browsers show a full-page security warning that blocks visitors from reaching the site.`,
      });
    } else if (certInfo.expiresSoon) {
      findings.push({
        id: 'ssl-expiring',
        severity: 'medium',
        points: 10,
        title: 'SSL certificate expiring soon',
        detail: `The certificate expires on ${certInfo.validTo}. If not renewed, the site will show security warnings.`,
      });
    }
  } catch (e) {
    findings.push({
      id: 'ssl-error',
      severity: 'high',
      points: 15,
      title: 'SSL certificate issue',
      detail: 'Could not validate the SSL certificate. Visitors may see security warnings.',
    });
  }

  // Check HTTP -> HTTPS redirect
  try {
    const httpRes = await fetch(`http://${hostname}`, { followRedirects: false });
    if (![301, 302, 307, 308].includes(httpRes.status) || !(httpRes.headers.location || '').startsWith('https')) {
      findings.push({
        id: 'no-https-redirect',
        severity: 'medium',
        points: 10,
        title: 'No automatic HTTPS redirect',
        detail: 'Visiting the site via http:// does not redirect to the secure https:// version. This means some visitors are using an unencrypted connection without knowing it.',
      });
    }
  } catch (e) {
    // HTTP not available, which is fine
  }

  return findings;
}

function getCertInfo(hostname) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect(443, hostname, { rejectUnauthorized: false, servername: hostname }, () => {
      const cert = socket.getPeerCertificate();
      socket.end();
      if (!cert || !cert.valid_to) return reject(new Error('No cert'));

      const validTo = new Date(cert.valid_to);
      const now = new Date();
      const daysLeft = (validTo - now) / (1000 * 60 * 60 * 24);

      resolve({
        validTo: cert.valid_to,
        validFrom: cert.valid_from,
        issuer: cert.issuer ? cert.issuer.O : 'Unknown',
        expired: daysLeft < 0,
        expiresSoon: daysLeft >= 0 && daysLeft < 30,
        daysLeft: Math.floor(daysLeft),
      });
    });
    socket.on('error', reject);
    socket.setTimeout(TIMEOUT, () => { socket.destroy(); reject(new Error('timeout')); });
  });
}

async function checkHeaders(url, headers) {
  const findings = [];

  const securityHeaders = {
    'strict-transport-security': {
      id: 'no-hsts',
      severity: 'medium',
      points: 10,
      title: 'No HSTS header',
      detail: 'The site doesn\'t tell browsers to always use HTTPS. An attacker on the same network (like public WiFi) could intercept the connection before encryption kicks in.',
    },
    'x-content-type-options': {
      id: 'no-xcto',
      severity: 'low',
      points: 5,
      title: 'Missing X-Content-Type-Options header',
      detail: 'Without this header, browsers might misinterpret files, which can lead to security vulnerabilities.',
    },
    'x-frame-options': {
      id: 'no-xfo',
      severity: 'medium',
      points: 8,
      title: 'No clickjacking protection',
      detail: 'The site can be embedded in an iframe on a malicious page. An attacker could trick visitors into clicking buttons they can\'t see (clickjacking).',
    },
    'content-security-policy': {
      id: 'no-csp',
      severity: 'medium',
      points: 8,
      title: 'No Content Security Policy',
      detail: 'Without a CSP, the browser allows scripts from anywhere to run on the page. If an attacker injects malicious code, nothing stops it from executing.',
    },
    'referrer-policy': {
      id: 'no-referrer-policy',
      severity: 'low',
      points: 3,
      title: 'No Referrer Policy',
      detail: 'The site may leak the full URL (including sensitive query parameters) to other sites when visitors click links.',
    },
    'permissions-policy': {
      id: 'no-permissions-policy',
      severity: 'low',
      points: 3,
      title: 'No Permissions Policy',
      detail: 'The site hasn\'t restricted access to browser features like camera, microphone, or geolocation. Third-party scripts could request these without your knowledge.',
    },
  };

  for (const [header, finding] of Object.entries(securityHeaders)) {
    if (!headers[header]) {
      findings.push(finding);
    }
  }

  return findings;
}

async function checkServerDisclosure(url, headers) {
  const findings = [];

  if (headers['server'] && /[\d.]/.test(headers['server'])) {
    findings.push({
      id: 'server-version',
      severity: 'medium',
      points: 8,
      title: 'Server software version exposed',
      detail: `The server announces itself as "${headers['server']}". This tells attackers exactly which version to look up exploits for.`,
    });
  }

  if (headers['x-powered-by']) {
    findings.push({
      id: 'powered-by',
      severity: 'medium',
      points: 8,
      title: 'Technology stack exposed',
      detail: `The "X-Powered-By: ${headers['x-powered-by']}" header reveals the backend technology. Attackers use this to narrow down which vulnerabilities to try.`,
    });
  }

  return findings;
}

async function checkCMS(url, body) {
  const findings = [];
  const html = body.toLowerCase();

  // WordPress detection
  const isWordPress = html.includes('/wp-content/') || html.includes('/wp-includes/') || html.includes('wp-json');

  if (isWordPress) {
    // Check generator meta tag for version
    const root = parse(body);
    const generator = root.querySelector('meta[name="generator"]');
    const genContent = generator ? generator.getAttribute('content') || '' : '';

    if (/wordpress\s+[\d.]+/i.test(genContent)) {
      const version = genContent.match(/[\d.]+/)[0];
      findings.push({
        id: 'wp-version-exposed',
        severity: 'high',
        points: 15,
        title: `WordPress version ${version} exposed`,
        detail: `The exact WordPress version (${version}) is visible in the page source. Attackers check this against public vulnerability databases to find known exploits for this specific version.`,
        cms: 'wordpress',
        version,
      });
    } else {
      findings.push({
        id: 'wp-detected',
        severity: 'low',
        points: 3,
        title: 'WordPress detected',
        detail: 'The site runs on WordPress. This is not inherently bad, but WordPress sites require regular updates to stay secure.',
        cms: 'wordpress',
      });
    }

    // Check readme.html (exposes version)
    try {
      const readmeRes = await fetch(new URL('/readme.html', url).toString(), { followRedirects: false });
      if (readmeRes.status === 200 && readmeRes.body.toLowerCase().includes('wordpress')) {
        findings.push({
          id: 'wp-readme',
          severity: 'medium',
          points: 8,
          title: 'WordPress readme.html accessible',
          detail: 'The default WordPress readme file is publicly accessible and reveals version information.',
        });
      }
    } catch (e) {}

    // Check xmlrpc.php (commonly exploited)
    try {
      const xmlrpcRes = await fetch(new URL('/xmlrpc.php', url).toString(), { followRedirects: false });
      if (xmlrpcRes.status === 200 || xmlrpcRes.status === 405) {
        findings.push({
          id: 'wp-xmlrpc',
          severity: 'high',
          points: 12,
          title: 'WordPress XML-RPC enabled',
          detail: 'XML-RPC is an old remote access feature that attackers frequently exploit for brute-force password attacks and DDoS amplification. Most sites don\'t need it.',
        });
      }
    } catch (e) {}
  }

  // Joomla detection
  if (html.includes('/media/jui/') || html.includes('joomla')) {
    findings.push({
      id: 'joomla-detected',
      severity: 'low',
      points: 3,
      title: 'Joomla CMS detected',
      detail: 'The site runs on Joomla. Keep it updated to avoid known vulnerabilities.',
      cms: 'joomla',
    });
  }

  return findings;
}

async function checkAdminPanels(url) {
  const findings = [];
  const paths = [
    { path: '/wp-login.php', cms: 'WordPress login' },
    { path: '/wp-admin/', cms: 'WordPress admin' },
    { path: '/admin/', cms: 'Admin panel' },
    { path: '/administrator/', cms: 'Admin panel' },
  ];

  for (const { path: p, cms } of paths) {
    try {
      const res = await fetch(new URL(p, url).toString(), { followRedirects: false });
      if (res.status === 200 || (res.status >= 300 && res.status < 400)) {
        findings.push({
          id: `admin-exposed-${p.replace(/\W/g, '')}`,
          severity: 'medium',
          points: 10,
          title: `${cms} page publicly accessible`,
          detail: `The page at ${p} is reachable by anyone. Attackers use automated tools to try common passwords against login pages like this around the clock.`,
        });
        break; // Only report the first one found to avoid noise
      }
    } catch (e) {}
  }

  return findings;
}

async function checkExposedFiles(url) {
  const findings = [];
  const sensitive = [
    { path: '/.git/HEAD', name: 'Git repository data', severity: 'critical', points: 20, detail: 'The site\'s source code repository is exposed. An attacker could download the entire codebase, including passwords, API keys, and database credentials.' },
    { path: '/.env', name: 'Environment file', severity: 'critical', points: 20, detail: 'The .env file typically contains database passwords, API keys, and other secrets. It is publicly accessible on this site.' },
    { path: '/wp-config.php.bak', name: 'WordPress config backup', severity: 'critical', points: 20, detail: 'A backup of the WordPress configuration file is accessible. This file contains database credentials.' },
    { path: '/.htaccess', name: 'Apache config file', severity: 'medium', points: 8, detail: 'The server configuration file is accessible and may reveal internal paths and security rules.' },
    { path: '/phpinfo.php', name: 'PHP info page', severity: 'high', points: 15, detail: 'A PHP info page exposes detailed server configuration, file paths, and installed modules.' },
  ];

  for (const file of sensitive) {
    try {
      const res = await fetch(new URL(file.path, url).toString(), { followRedirects: false });
      if (res.status === 200 && res.body.length > 10) {
        // Validate it's actually the file and not a custom 404
        let isReal = false;
        if (file.path === '/.git/HEAD') isReal = res.body.includes('ref:');
        else if (file.path === '/.env') isReal = res.body.includes('=');
        else if (file.path.includes('wp-config')) isReal = res.body.includes('DB_');
        else if (file.path === '/phpinfo.php') isReal = res.body.includes('phpinfo');
        else if (file.path === '/.htaccess') isReal = res.body.includes('Rewrite') || res.body.includes('Deny');

        if (isReal) {
          findings.push({
            id: `exposed-${file.path.replace(/\W/g, '')}`,
            severity: file.severity,
            points: file.points,
            title: `${file.name} exposed`,
            detail: file.detail,
          });
        }
      }
    } catch (e) {}
  }

  return findings;
}

async function checkCookies(url, headers) {
  const findings = [];
  const cookies = headers['set-cookie'];
  if (!cookies) return findings;

  const cookieStr = Array.isArray(cookies) ? cookies.join('; ') : cookies;
  const lower = cookieStr.toLowerCase();

  const issues = [];
  if (!lower.includes('secure')) issues.push('Secure flag');
  if (!lower.includes('httponly')) issues.push('HttpOnly flag');
  if (!lower.includes('samesite')) issues.push('SameSite attribute');

  if (issues.length > 0) {
    findings.push({
      id: 'cookie-flags',
      severity: 'low',
      points: 5,
      title: 'Cookies missing security flags',
      detail: `Cookies are set without: ${issues.join(', ')}. This makes them easier to steal or misuse in cross-site attacks.`,
    });
  }

  return findings;
}

async function checkMixedContent(url, body) {
  const findings = [];
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') return findings;

  const httpResources = body.match(/http:\/\/[^"'\s)]+\.(js|css|jpg|png|gif|svg|woff|ico)/gi);
  if (httpResources && httpResources.length > 0) {
    findings.push({
      id: 'mixed-content',
      severity: 'medium',
      points: 8,
      title: 'Mixed content (HTTP resources on HTTPS page)',
      detail: `The page loads ${httpResources.length} resource(s) over unencrypted HTTP. This partially defeats the protection that HTTPS provides.`,
    });
  }

  return findings;
}

async function checkOutdatedLibraries(url, body) {
  const findings = [];
  const root = parse(body);
  const scripts = root.querySelectorAll('script[src]');

  for (const script of scripts) {
    const src = script.getAttribute('src') || '';

    // jQuery version detection
    const jqMatch = src.match(/jquery[.-](\d+\.\d+\.\d+)/i);
    if (jqMatch) {
      const ver = jqMatch[1];
      const [major, minor] = ver.split('.').map(Number);
      if (major < 3 || (major === 3 && minor < 5)) {
        findings.push({
          id: 'outdated-jquery',
          severity: 'medium',
          points: 8,
          title: `Outdated jQuery ${ver}`,
          detail: `The site uses jQuery ${ver}, which has known security vulnerabilities (XSS). Current version is 3.7+.`,
        });
      }
    }

    // Bootstrap version detection
    const bsMatch = src.match(/bootstrap[.-](\d+\.\d+\.\d+)/i);
    if (bsMatch) {
      const ver = bsMatch[1];
      const [major] = ver.split('.').map(Number);
      if (major < 5) {
        findings.push({
          id: 'outdated-bootstrap',
          severity: 'low',
          points: 5,
          title: `Outdated Bootstrap ${ver}`,
          detail: `The site uses Bootstrap ${ver}. Older versions have known XSS vulnerabilities.`,
        });
      }
    }
  }

  // Also check inline version comments
  const jqInline = body.match(/jQuery\s+v?(\d+\.\d+\.\d+)/i);
  if (jqInline && !findings.find(f => f.id === 'outdated-jquery')) {
    const ver = jqInline[1];
    const [major, minor] = ver.split('.').map(Number);
    if (major < 3 || (major === 3 && minor < 5)) {
      findings.push({
        id: 'outdated-jquery',
        severity: 'medium',
        points: 8,
        title: `Outdated jQuery ${ver}`,
        detail: `The site uses jQuery ${ver}, which has known security vulnerabilities.`,
      });
    }
  }

  return findings;
}

// -- Scoring --

function calculateScore(findings) {
  let score = 100;
  for (const f of findings) {
    score -= f.points;
  }
  return Math.max(0, Math.min(100, score));
}

function calculateGrade(score) {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

// -- Main scan function --

async function scanUrl(url) {
  // Normalize URL
  if (!url.startsWith('http')) url = 'https://' + url;

  console.log(`  Scanning ${url}...`);
  let allFindings = [];
  let mainResponse;

  // Fetch main page
  try {
    mainResponse = await fetch(url);
  } catch (e) {
    // Try http if https failed
    try {
      const httpUrl = url.replace('https://', 'http://');
      mainResponse = await fetch(httpUrl);
    } catch (e2) {
      return {
        url,
        error: 'Could not reach site',
        score: 0,
        grade: 'F',
        findings: [{
          id: 'unreachable',
          severity: 'critical',
          points: 100,
          title: 'Website unreachable',
          detail: 'Could not connect to the website at all. It may be down or the URL may be incorrect.',
        }],
        headers: {},
      };
    }
  }

  const headers = mainResponse.headers;
  const body = mainResponse.body;

  // Run all checks
  const [ssl, headerFindings, serverFindings, cmsFindings, adminFindings, exposedFindings, cookieFindings, mixedFindings, libFindings] = await Promise.all([
    checkSSL(url),
    checkHeaders(url, headers),
    checkServerDisclosure(url, headers),
    checkCMS(url, body),
    checkAdminPanels(url),
    checkExposedFiles(url),
    checkCookies(url, headers),
    checkMixedContent(url, body),
    checkOutdatedLibraries(url, body),
  ]);

  allFindings = [...ssl, ...headerFindings, ...serverFindings, ...cmsFindings, ...adminFindings, ...exposedFindings, ...cookieFindings, ...mixedFindings, ...libFindings];

  // Deduplicate by id
  const seen = new Set();
  allFindings = allFindings.filter(f => {
    if (seen.has(f.id)) return false;
    seen.add(f.id);
    return true;
  });

  // Sort by severity
  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  allFindings.sort((a, b) => (severityOrder[a.severity] || 99) - (severityOrder[b.severity] || 99));

  const score = calculateScore(allFindings);
  const grade = calculateGrade(score);

  return {
    url: mainResponse.url || url,
    score,
    grade,
    findings: allFindings,
    headers,
  };
}

module.exports = { scanUrl, calculateScore, calculateGrade };
