#!/usr/bin/env node
require('dotenv').config();

const { program } = require('commander');
const db = require('./shared/db');
const config = require('./shared/config').load();

program
  .name('apollo')
  .description('Apollo\'s Table — Website Security Scanner')
  .version('1.0.0');

// -- Discover businesses --
program
  .command('discover')
  .description('Find local businesses with websites')
  .action(async () => {
    const { discoverAll } = require('./security/discover');
    console.log('\nSearching for businesses...\n');
    const { totalFound, totalAdded } = await discoverAll();
    console.log(`\nDone. Found ${totalFound} listings, added ${totalAdded} new businesses.`);
    console.log('Run "apollo list" to see them, or "apollo scan" to check their sites.\n');
    db.close();
  });

// -- Add business manually --
program
  .command('add <name> <url>')
  .description('Add a business manually')
  .option('-c, --category <cat>', 'Business category (e.g. plumber, electrician)')
  .option('-p, --phone <phone>', 'Phone number')
  .option('-a, --address <addr>', 'Street address')
  .option('--city <city>', 'City')
  .option('-e, --email <email>', 'Email address')
  .action((name, url, opts) => {
    const { addManual } = require('./security/discover');
    const result = addManual({ name, url, ...opts });
    console.log(`Added: ${name} (${url}) → slug: ${result.slug}`);
    db.close();
  });

// -- List businesses --
program
  .command('list')
  .description('List discovered businesses')
  .option('-c, --category <cat>', 'Filter by category')
  .option('--scanned', 'Only show scanned businesses')
  .option('--unscanned', 'Only show unscanned businesses')
  .option('-n, --limit <n>', 'Limit results', parseInt)
  .action((opts) => {
    const businesses = db.listBusinesses({
      category: opts.category,
      hasScans: opts.scanned ? true : opts.unscanned ? false : undefined,
      limit: opts.limit,
    });

    if (businesses.length === 0) {
      console.log('\nNo businesses found. Run "apollo discover" or "apollo add" first.\n');
      db.close();
      return;
    }

    console.log(`\n${'Name'.padEnd(35)} ${'Grade'.padEnd(6)} ${'Score'.padEnd(6)} ${'Category'.padEnd(15)} URL`);
    console.log('-'.repeat(100));
    for (const b of businesses) {
      const grade = b.grade || '-';
      const score = b.score != null ? String(b.score) : '-';
      const cat = (b.category || '').slice(0, 14);
      console.log(`${(b.name || '').slice(0, 34).padEnd(35)} ${grade.padEnd(6)} ${score.padEnd(6)} ${cat.padEnd(15)} ${b.url}`);
    }
    console.log(`\n${businesses.length} businesses total.\n`);
    db.close();
  });

// -- Scan businesses --
program
  .command('scan')
  .description('Run security scans on discovered businesses')
  .option('-u, --url <url>', 'Scan a single URL (does not save)')
  .option('--all', 'Re-scan all businesses')
  .option('-n, --limit <n>', 'Limit number of scans', parseInt)
  .action(async (opts) => {
    const { scanUrl } = require('./security/scanner');

    if (opts.url) {
      // One-off scan, just print results
      console.log('\nScanning...\n');
      const result = await scanUrl(opts.url);
      printScanResult(result);
      db.close();
      return;
    }

    // Scan businesses from DB
    const businesses = db.listBusinesses({
      hasScans: opts.all ? undefined : false,
      limit: opts.limit,
    });

    if (businesses.length === 0) {
      console.log('\nNo businesses to scan. Run "apollo discover" or "apollo add" first.\n');
      db.close();
      return;
    }

    console.log(`\nScanning ${businesses.length} businesses...\n`);
    let scanned = 0;
    const concurrent = config.scanner.concurrent_scans || 3;

    // Process in batches
    for (let i = 0; i < businesses.length; i += concurrent) {
      const batch = businesses.slice(i, i + concurrent);
      const results = await Promise.all(batch.map(async (biz) => {
        try {
          const result = await scanUrl(biz.url);
          db.saveScan(biz.id, {
            score: result.score,
            grade: result.grade,
            findings: result.findings,
            rawHeaders: result.headers,
          });
          scanned++;
          const gradeColor = result.grade === 'A' ? '\x1b[32m' : result.grade === 'F' ? '\x1b[31m' : '\x1b[33m';
          console.log(`  ${gradeColor}${result.grade}\x1b[0m ${result.score}/100 — ${biz.name}`);
          return result;
        } catch (e) {
          console.log(`  \x1b[31mERR\x1b[0m — ${biz.name}: ${e.message}`);
          return null;
        }
      }));
    }

    console.log(`\nDone. Scanned ${scanned}/${businesses.length} businesses.`);
    console.log('Run "apollo report" to generate reports, or "apollo list --scanned" to see results.\n');
    db.close();
  });

function printScanResult(result) {
  const gradeColor = result.grade === 'A' ? '\x1b[32m' : result.grade === 'F' ? '\x1b[31m' : '\x1b[33m';
  console.log(`URL:   ${result.url}`);
  console.log(`Grade: ${gradeColor}${result.grade}\x1b[0m`);
  console.log(`Score: ${result.score}/100`);
  console.log('');

  if (result.findings.length === 0) {
    console.log('  No issues found. Site looks solid.');
  } else {
    for (const f of result.findings) {
      const sevColor = f.severity === 'critical' ? '\x1b[31m' : f.severity === 'high' ? '\x1b[33m' : '\x1b[36m';
      console.log(`  ${sevColor}[${f.severity.toUpperCase()}]\x1b[0m ${f.title}`);
      console.log(`    ${f.detail}\n`);
    }
  }
}

// -- Generate reports --
program
  .command('report')
  .description('Generate reports for scanned businesses')
  .option('--all', 'Regenerate all reports')
  .option('-n, --limit <n>', 'Limit number of reports', parseInt)
  .action(async (opts) => {
    const { generateNarrative } = require('./security/reporter');
    const businesses = db.listBusinesses({ hasScans: true });

    let toReport = businesses.filter(b => {
      if (opts.all) return true;
      const existing = db.getLatestReport(b.id);
      return !existing;
    });

    if (opts.limit) toReport = toReport.slice(0, opts.limit);

    if (toReport.length === 0) {
      console.log('\nNo businesses need reports. Run "apollo scan" first, or use --all to regenerate.\n');
      db.close();
      return;
    }

    console.log(`\nGenerating ${toReport.length} reports...\n`);

    for (const biz of toReport) {
      const scan = db.getLatestScan(biz.id);
      if (!scan) continue;

      try {
        process.stdout.write(`  ${biz.name}...`);
        const narrative = await generateNarrative(biz, scan);
        const reportId = db.saveReport(biz.id, scan.id, narrative);
        db.publishReport(reportId);
        console.log(' done');
      } catch (e) {
        console.log(` error: ${e.message}`);
      }
    }

    console.log('\nDone. Run "apollo export" to publish to the dashboard.\n');
    db.close();
  });

// -- Export to dashboard --
program
  .command('export')
  .description('Export data to dashboard JSON files')
  .action(() => {
    const fs = require('fs');
    const path = require('path');

    const dataDir = path.join(__dirname, 'dashboard', 'data');
    const reportsDir = path.join(dataDir, 'reports');

    if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

    // Export main dashboard data
    const stats = db.getStats();
    const pipeline = db.getPipeline();

    const dashboardData = {
      generated_at: new Date().toISOString(),
      stats,
      businesses: pipeline.map(b => ({
        id: b.id,
        name: b.name,
        slug: b.slug,
        url: b.url,
        category: b.category,
        city: b.city,
        phone: b.phone,
        score: b.score,
        grade: b.grade,
        last_scanned: b.last_scanned,
        pipeline_stage: b.pipeline_stage,
        outreach_status: b.outreach_status,
        has_report: !!b.report_id,
      })),
    };

    fs.writeFileSync(path.join(dataDir, 'businesses.json'), JSON.stringify(dashboardData, null, 2));
    console.log(`Exported dashboard data (${pipeline.length} businesses)`);

    // Export individual reports
    let reportCount = 0;
    for (const biz of pipeline) {
      if (!biz.report_id) continue;

      const scan = db.getLatestScan(biz.id);
      const report = db.getLatestReport(biz.id);
      if (!scan || !report) continue;

      const reportData = {
        business: {
          name: biz.name,
          slug: biz.slug,
          url: biz.url,
          category: biz.category,
          city: biz.city,
        },
        scan: {
          score: scan.score,
          grade: scan.grade,
          findings: scan.findings,
          scanned_at: scan.scanned_at,
        },
        narrative: report.narrative,
        contact: config.contact,
        generated_at: report.created_at,
      };

      fs.writeFileSync(path.join(reportsDir, `${biz.slug}.json`), JSON.stringify(reportData, null, 2));
      reportCount++;
    }

    console.log(`Exported ${reportCount} individual reports`);
    console.log('\nPush to GitHub to update apollostable.com\n');
    db.close();
  });

// -- Stats --
program
  .command('stats')
  .description('Show pipeline statistics')
  .action(() => {
    const stats = db.getStats();
    console.log('\n--- Apollo\'s Table Stats ---\n');
    console.log(`Businesses discovered: ${stats.total}`);
    console.log(`Scanned:              ${stats.scanned}`);
    console.log(`Reports published:    ${stats.reported}`);
    console.log(`Outreach sent:        ${stats.outreachSent}`);
    console.log(`Responses:            ${stats.responses}`);
    if (stats.grades.length) {
      console.log('\nGrade distribution:');
      for (const g of stats.grades) {
        console.log(`  ${g.grade}: ${g.count}`);
      }
    }
    console.log('');
    db.close();
  });

// -- Outreach email generation --
program
  .command('outreach')
  .description('Generate outreach emails for reported businesses')
  .option('-n, --limit <n>', 'Limit number', parseInt)
  .action(async (opts) => {
    const { generateOutreachEmail } = require('./security/reporter');
    const pipeline = db.getPipeline();
    let candidates = pipeline.filter(b => b.report_id && b.published && !b.outreach_status);

    if (opts.limit) candidates = candidates.slice(0, opts.limit);

    if (candidates.length === 0) {
      console.log('\nNo businesses ready for outreach. Run "apollo report" first.\n');
      db.close();
      return;
    }

    console.log(`\nGenerating ${candidates.length} outreach emails...\n`);

    for (const biz of candidates) {
      const scan = db.getLatestScan(biz.id);
      const report = db.getLatestReport(biz.id);
      if (!scan || !report) continue;

      try {
        process.stdout.write(`  ${biz.name}...`);
        const email = await generateOutreachEmail(biz, scan, report);
        db.saveOutreach(biz.id, {
          method: 'email',
          status: 'draft',
          notes: JSON.stringify(email),
        });
        console.log(' done');
        console.log(`    Subject: ${email.subject}`);
      } catch (e) {
        console.log(` error: ${e.message}`);
      }
    }

    console.log('\nDone. Review emails in the dashboard before sending.\n');
    db.close();
  });

// -- Add a region --
program
  .command('region-add <name>')
  .description('Add a geographic region')
  .option('-s, --state <state>', 'State abbreviation')
  .option('--cities <cities>', 'Comma-separated list of cities')
  .option('--categories <categories>', 'Comma-separated list of categories')
  .action((name, opts) => {
    const slug = db.slugify(name);
    const cities = opts.cities ? opts.cities.split(',').map(c => c.trim()) : [];
    const categories = opts.categories
      ? opts.categories.split(',').map(c => c.trim())
      : config.categories;

    const result = db.addRegion({ slug, name, state: opts.state, cities, categories });
    console.log(`Added region: ${name} (slug: ${result.slug}, id: ${result.id})`);
    db.close();
  });

// -- List regions --
program
  .command('regions')
  .description('List all regions')
  .action(() => {
    const regions = db.listRegions();

    if (regions.length === 0) {
      console.log('\nNo regions found. Run "apollo region-add" to create one.\n');
      db.close();
      return;
    }

    console.log(`\n${'Name'.padEnd(25)} ${'State'.padEnd(8)} ${'Cities'.padEnd(40)} Categories`);
    console.log('-'.repeat(100));
    for (const r of regions) {
      const cities = JSON.parse(r.cities || '[]');
      const cats = r.categories ? JSON.parse(r.categories) : [];
      console.log(
        `${(r.name || '').slice(0, 24).padEnd(25)} ` +
        `${(r.state || '-').padEnd(8)} ` +
        `${cities.join(', ').slice(0, 39).padEnd(40)} ` +
        `${cats.length} categories`
      );
    }
    console.log(`\n${regions.length} regions total.\n`);
    db.close();
  });

program.parse();
