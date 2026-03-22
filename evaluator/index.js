// evaluator/index.js
require('dotenv').config();
const db = require('../shared/db');
const config = require('../shared/config');
const { milesToLocation } = require('../shared/distance');
const { identifyItem } = require('./identifier');
const { fetchSoldComps } = require('./comps');
const { estimateShipping } = require('./shipping');
const { calculateProfit, gradeDeal } = require('./profit');
const { sendAlert } = require('./alerts');

async function evaluateListing(listing) {
  const cfg = config.get();
  const home = { latitude: cfg.location.latitude, longitude: cfg.location.longitude };

  console.log(`[Eval] Evaluating: "${listing.title}" (${listing.url})`);

  // Step 1: Identify item via Claude Vision
  const identification = await identifyItem(listing);
  if (!identification) {
    console.log(`[Eval] Could not identify item — skipping`);
    db.updateListingStatus(listing.id, 'evaluated');
    return null;
  }
  console.log(`[Eval] Identified: ${identification.item_type} ${identification.brand || ''} ${identification.model || ''}`);

  // Step 2: Fetch eBay sold comps
  const comps = await fetchSoldComps(identification.ebay_search_query);
  const ebayMedian = comps ? comps.median : 0;
  const ebayCount = comps ? comps.count : 0;
  const insufficientData = ebayCount < cfg.evaluator.min_comps;

  if (!comps || ebayMedian === 0) {
    console.log(`[Eval] No sold comps found — skipping`);
    db.updateListingStatus(listing.id, 'evaluated');
    return null;
  }
  console.log(`[Eval] Comps: $${ebayMedian} median (${ebayCount} sold)`);

  // Step 3: Estimate shipping
  const shipping = estimateShipping(identification.weight_class);
  const shippingCost = shipping.channel === 'local' ? 0 : shipping.cost;

  // Step 4: Calculate profit
  const distance = listing.distance_miles || milesToLocation(home, {
    latitude: listing.latitude || home.latitude,
    longitude: listing.longitude || home.longitude
  });

  const profit = calculateProfit({
    purchase_price: listing.price || 0,
    ebay_median_price: ebayMedian,
    shipping_cost: shippingCost,
    distance_miles: distance
  });

  // Step 5: Grade
  const grade = gradeDeal({
    net_profit: profit.net_profit,
    profit_per_mile: profit.profit_per_mile,
    ebay_sold_count: ebayCount
  });

  const sellChannel = shipping.channel === 'local' ? 'local' :
    (profit.net_profit < 15 ? 'local' : 'ebay');

  // Check radius limits
  const radiusLimits = cfg.radius;
  const maxRadius = grade === 'A' ? radiusLimits.grade_a_miles :
    grade === 'B' ? radiusLimits.grade_b_miles :
    radiusLimits.grade_c_miles;

  if (distance > maxRadius) {
    console.log(`[Eval] Grade ${grade} but ${distance}mi exceeds ${maxRadius}mi limit — downgrading`);
  }

  console.log(`[Eval] Grade: ${grade} | Profit: $${profit.net_profit} | $/mi: ${profit.profit_per_mile}`);

  // Step 6: Save evaluation
  const evalId = db.insertEvaluation({
    listing_id: listing.id,
    item_type: identification.item_type,
    brand: identification.brand,
    model: identification.model,
    condition: identification.condition,
    weight_class: identification.weight_class,
    ebay_search_query: identification.ebay_search_query,
    ebay_median_price: ebayMedian,
    ebay_sold_count: ebayCount,
    ebay_avg_days_to_sell: comps ? comps.avg_days || null : null,
    shipping_estimate: shippingCost,
    ebay_fees: profit.total_fees,
    gas_cost: profit.gas_cost,
    net_profit: profit.net_profit,
    profit_per_mile: profit.profit_per_mile,
    grade,
    sell_channel: sellChannel,
    notes: insufficientData
      ? `[LOW DATA: only ${ebayCount} comps] ${identification.notes || ''}`
      : (identification.notes || '')
  });

  db.updateListingStatus(listing.id, 'evaluated');

  // Step 7: Alert if worthy
  if (grade === 'A' || grade === 'B') {
    await sendAlert({
      title: listing.title,
      grade,
      net_profit: profit.net_profit,
      distance_miles: distance,
      location: listing.location,
      item_type: identification.item_type,
      brand: identification.brand,
      url: listing.url
    });
  }

  return { evalId, grade, net_profit: profit.net_profit };
}

async function evaluateAll() {
  const pending = db.getPendingListings();
  console.log(`[Eval] ${pending.length} listings pending evaluation`);

  const results = [];
  for (const listing of pending) {
    const result = await evaluateListing(listing);
    results.push(result);
    // Throttle between evaluations
    await new Promise(r => setTimeout(r, 1000));
  }

  const graded = results.filter(Boolean);
  const aCount = graded.filter(r => r.grade === 'A').length;
  const bCount = graded.filter(r => r.grade === 'B').length;
  console.log(`[Eval] Done: ${graded.length} evaluated (${aCount} A, ${bCount} B)`);
  return results;
}

module.exports = { evaluateListing, evaluateAll };
