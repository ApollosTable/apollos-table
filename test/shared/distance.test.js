// test/shared/distance.test.js
const { expect } = require('chai');
const { milesToLocation, flooredDistance } = require('../../shared/distance');

describe('distance', () => {
  it('calculates distance between two known points', () => {
    const home = { latitude: 42.8354, longitude: -71.6487 };
    const nashua = { latitude: 42.7654, longitude: -71.4676 };
    const d = milesToLocation(home, nashua);
    expect(d).to.be.within(8, 12);
  });

  it('returns 0 for same point', () => {
    const home = { latitude: 42.8354, longitude: -71.6487 };
    expect(milesToLocation(home, home)).to.equal(0);
  });

  it('applies max(1.0) floor for profit-per-mile', () => {
    expect(flooredDistance(0.3)).to.equal(1.0);
    expect(flooredDistance(5)).to.equal(5);
  });
});
