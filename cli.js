#!/usr/bin/env node
// cli.js — Apollo's Table CLI
require('dotenv').config();
const { program } = require('commander');
const config = require('./shared/config');
const db = require('./shared/db');

config.load();
db.init();

program
  .name('apollo')
  .description("Apollo's Table — automated resale deal sniper")
  .version('0.1.0');

program
  .command('scan')
  .description('Start scanning FB Marketplace (runs continuously)')
  .option('--once', 'Run one scan cycle and exit')
  .action(async (opts) => {
    const { scanOnce, startLoop } = require('./scanner/scraper');
    if (opts.once) {
      await scanOnce();
      process.exit(0);
    } else {
      await startLoop();
    }
  });

program
  .command('eval')
  .description('Evaluate all pending listings')
  .action(async () => {
    const { evaluateAll } = require('./evaluator');
    await evaluateAll();
    process.exit(0);
  });

program
  .command('deals')
  .description('Show top deals')
  .option('-n, --limit <number>', 'Number of deals to show', '20')
  .action((opts) => {
    const deals = db.getTopDeals(parseInt(opts.limit));
    if (deals.length === 0) {
      console.log('No deals found yet. Run "apollo scan" then "apollo eval" first.');
      return;
    }
    console.log(`\nTop ${deals.length} deals:\n`);
    deals.forEach((d, i) => {
      const grade = d.grade === 'A' ? '\x1b[32mA\x1b[0m' : '\x1b[33mB\x1b[0m';
      console.log(
        `${i + 1}. [${grade}] ${d.title}\n` +
        `   $${d.net_profit} profit | ${d.distance_miles}mi | $${d.profit_per_mile}/mi | ${d.item_type}\n` +
        `   eBay: $${d.ebay_median_price} median (${d.ebay_sold_count} sold) | ${d.url}\n`
      );
    });
  });

program
  .command('grab <id>')
  .description('Mark a deal as "grabbing it" — moves to inventory')
  .action((id) => {
    try {
      const invId = db.grabDeal(parseInt(id));
      console.log(`Deal ${id} moved to inventory (inventory #${invId})`);
    } catch (err) {
      console.error(err.message);
    }
  });

program
  .command('stats')
  .description('Show profit summary')
  .action(() => {
    const deals = db.getTopDeals(1000);
    const aDeals = deals.filter(d => d.grade === 'A');
    const bDeals = deals.filter(d => d.grade === 'B');
    const totalProfit = deals.reduce((sum, d) => sum + d.net_profit, 0);

    console.log('\nApollo\'s Table — Stats\n');
    console.log(`Grade A deals found: ${aDeals.length}`);
    console.log(`Grade B deals found: ${bDeals.length}`);
    console.log(`Total potential profit: $${totalProfit.toFixed(2)}`);
    if (deals.length > 0) {
      console.log(`Avg profit per deal: $${(totalProfit / deals.length).toFixed(2)}`);
      console.log(`Best deal: "${deals[0].title}" — $${deals[0].net_profit}`);
    }
  });

program.parse();
