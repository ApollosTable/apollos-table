const { expect } = require('chai');

describe('parser', () => {
  const { isBlacklisted, parsePrice } = require('../../scanner/parser');

  it('rejects blacklisted titles', () => {
    const blacklist = ['baby clothes', 'broken', 'parts only'];
    expect(isBlacklisted('Free baby clothes size 3T', blacklist)).to.be.true;
    expect(isBlacklisted('BROKEN microwave free', blacklist)).to.be.true;
  });

  it('passes non-blacklisted titles', () => {
    const blacklist = ['baby clothes', 'broken', 'parts only'];
    expect(isBlacklisted('Free Herman Miller chair', blacklist)).to.be.false;
    expect(isBlacklisted('Moving sale - desk and monitor', blacklist)).to.be.false;
  });

  it('parses price strings', () => {
    expect(parsePrice('$50')).to.equal(50);
    expect(parsePrice('Free')).to.equal(0);
    expect(parsePrice('$0')).to.equal(0);
    expect(parsePrice('$1,250')).to.equal(1250);
    expect(parsePrice(null)).to.equal(0);
  });
});

describe('queries', () => {
  // Ensure config is loaded
  before(() => require('../../shared/config').load());

  const { getNextQuery, getAllQueries } = require('../../scanner/queries');

  it('returns search queries from config', () => {
    const queries = getAllQueries();
    expect(queries).to.be.an('array');
    expect(queries.length).to.be.at.least(1);
  });

  it('rotates through queries', () => {
    const q1 = getNextQuery();
    const q2 = getNextQuery();
    expect(q1).to.be.a('string');
    expect(q2).to.be.a('string');
  });
});
