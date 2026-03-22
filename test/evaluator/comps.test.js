const { expect } = require('chai');

describe('comps', () => {
  const { parseEbaySoldPrices, calculateCompStats } = require('../../evaluator/comps');

  it('calculates stats from an array of sold prices', () => {
    const prices = [50, 75, 100, 125, 150];
    const stats = calculateCompStats(prices);
    expect(stats.median).to.equal(100);
    expect(stats.min).to.equal(50);
    expect(stats.max).to.equal(150);
    expect(stats.average).to.equal(100);
    expect(stats.count).to.equal(5);
  });

  it('handles even-length price arrays for median', () => {
    const prices = [50, 100, 150, 200];
    const stats = calculateCompStats(prices);
    expect(stats.median).to.equal(125);
  });

  it('returns null stats for empty array', () => {
    const stats = calculateCompStats([]);
    expect(stats).to.be.null;
  });

  it('parses price strings from eBay format', () => {
    const priceTexts = ['$49.99', '$125.00', '$75.50'];
    const prices = priceTexts.map(p => parseEbaySoldPrices(p)).filter(Boolean);
    expect(prices).to.deep.equal([49.99, 125.00, 75.50]);
  });

  it('handles "to" range prices by taking the higher value', () => {
    expect(parseEbaySoldPrices('$50.00 to $75.00')).to.equal(75.00);
  });
});
