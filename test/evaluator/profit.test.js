const { expect } = require('chai');

describe('profit', () => {
  before(() => require('../../shared/config').load());

  const { calculateProfit, gradeDeal } = require('../../evaluator/profit');

  it('calculates net profit for a free item sold on eBay', () => {
    const result = calculateProfit({
      purchase_price: 0, ebay_median_price: 150, shipping_cost: 13, distance_miles: 5
    });
    expect(result.net_profit).to.be.within(105, 107);
    expect(result.profit_per_mile).to.be.within(20, 22);
    expect(result.total_fees).to.be.within(24, 25);
  });

  it('calculates profit for a $20 item', () => {
    const result = calculateProfit({
      purchase_price: 20, ebay_median_price: 100, shipping_cost: 27, distance_miles: 15
    });
    expect(result.net_profit).to.be.within(16, 17);
  });

  it('uses floored distance of 1.0 for very close items', () => {
    const result = calculateProfit({
      purchase_price: 0, ebay_median_price: 200, shipping_cost: 13, distance_miles: 0.2
    });
    expect(result.profit_per_mile).to.equal(
      Math.round(result.net_profit / 1.0 * 100) / 100
    );
  });

  it('grades an A deal correctly', () => {
    expect(gradeDeal({ net_profit: 100, profit_per_mile: 10, ebay_sold_count: 8 })).to.equal('A');
  });

  it('grades a B deal correctly', () => {
    expect(gradeDeal({ net_profit: 40, profit_per_mile: 4, ebay_sold_count: 4 })).to.equal('B');
  });

  it('grades a C deal correctly', () => {
    expect(gradeDeal({ net_profit: 20, profit_per_mile: 1, ebay_sold_count: 1 })).to.equal('C');
  });

  it('grades an F deal correctly', () => {
    expect(gradeDeal({ net_profit: 10, profit_per_mile: 1, ebay_sold_count: 1 })).to.equal('F');
  });
});
