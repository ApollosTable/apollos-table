// test/shared/config.test.js
const { expect } = require('chai');
const path = require('path');
const fs = require('fs');

describe('config', () => {
  const configModule = require('../../shared/config');

  it('loads default config when no user config exists', () => {
    const cfg = configModule.load();
    expect(cfg.location.city).to.equal('Milford');
    expect(cfg.scanner.interval_minutes).to.equal(15);
    expect(cfg.ebay.final_value_fee_rate).to.equal(0.1305);
  });

  it('merges user config over defaults', () => {
    const userPath = path.join(process.cwd(), 'config.json');
    fs.writeFileSync(userPath, JSON.stringify({ scanner: { interval_minutes: 5 } }));
    delete require.cache[require.resolve('../../shared/config')];
    const configModule2 = require('../../shared/config');
    const cfg = configModule2.load();
    expect(cfg.scanner.interval_minutes).to.equal(5);
    expect(cfg.scanner.max_price).to.equal(25);
    fs.unlinkSync(userPath);
  });

  it('exposes config via get() after load()', () => {
    const cfg = configModule.load();
    const got = configModule.get();
    expect(got).to.deep.equal(cfg);
  });
});
