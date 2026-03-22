// evaluator/profit.js
const config = require('../shared/config');
const { flooredDistance } = require('../shared/distance');

function calculateProfit({ purchase_price, ebay_median_price, shipping_cost, distance_miles }) {
  const cfg = config.get().ebay;

  const fvf = ebay_median_price * cfg.final_value_fee_rate;
  const processing = (ebay_median_price * cfg.payment_processing_rate) + cfg.payment_processing_flat;
  const total_fees = Math.round((fvf + processing) * 100) / 100;

  const gas_cost = Math.round(distance_miles * 2 * cfg.gas_cost_per_mile * 100) / 100;

  const net_profit = Math.round(
    (ebay_median_price - purchase_price - total_fees - shipping_cost - gas_cost) * 100
  ) / 100;

  const profit_per_mile = Math.round(
    (net_profit / flooredDistance(distance_miles)) * 100
  ) / 100;

  return { net_profit, profit_per_mile, total_fees, gas_cost };
}

function gradeDeal({ net_profit, profit_per_mile, ebay_sold_count }) {
  if (net_profit >= 75 && profit_per_mile >= 5 && ebay_sold_count >= 5) return 'A';
  if (net_profit >= 30 && profit_per_mile >= 3 && ebay_sold_count >= 3) return 'B';
  if (net_profit >= 15) return 'C';
  return 'F';
}

module.exports = { calculateProfit, gradeDeal };
