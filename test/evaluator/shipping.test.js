const { expect } = require('chai');

describe('shipping', () => {
  before(() => require('../../shared/config').load());
  const { estimateShipping } = require('../../evaluator/shipping');

  it('returns cost for under_10lb items', () => {
    const est = estimateShipping('under_10lb');
    expect(est.cost).to.equal(13);
    expect(est.channel).to.equal('ebay');
  });

  it('returns cost for 30_70lb items', () => {
    const est = estimateShipping('30_70lb');
    expect(est.cost).to.equal(50);
    expect(est.channel).to.equal('ebay');
  });

  it('flags 70lb_plus as local_sell_recommended', () => {
    const est = estimateShipping('70lb_plus');
    expect(est.channel).to.equal('local');
    expect(est.local_cost).to.equal(0);
  });

  it('falls back to 30_70lb for unknown weight class', () => {
    const est = estimateShipping('unknown');
    expect(est.cost).to.equal(50);
  });
});
