// evaluator/shipping.js
const config = require('../shared/config');

function estimateShipping(weightClass) {
  const cfg = config.get();
  const estimates = cfg.shipping_estimates;

  if (weightClass === '70lb_plus') {
    return {
      cost: estimates['70lb_plus'] || 75,
      local_cost: 0,
      channel: 'local',
      note: 'Heavy item — local sale recommended, but eBay shipping possible at this cost'
    };
  }

  const cost = estimates[weightClass] || estimates['30_70lb'] || 50;
  return {
    cost,
    local_cost: 0,
    channel: 'ebay'
  };
}

module.exports = { estimateShipping };
