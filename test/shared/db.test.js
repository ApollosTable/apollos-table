// test/shared/db.test.js
const { expect } = require('chai');
const fs = require('fs');
const path = require('path');

const TEST_DB = path.join(__dirname, '..', 'test.db');

describe('db', () => {
  let db;

  before(() => {
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
    db = require('../../shared/db');
    db.init(TEST_DB);
  });

  after(() => {
    db.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it('creates all tables on init', () => {
    const tables = db.raw().prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all().map(r => r.name);
    expect(tables).to.include('raw_listings');
    expect(tables).to.include('evaluations');
    expect(tables).to.include('inventory');
  });

  it('inserts and retrieves a raw listing', () => {
    const id = db.insertListing({
      url: 'https://fb.com/item/123',
      title: 'Free couch',
      price: 0,
      description: 'Moving out',
      images: JSON.stringify(['images/1_0.jpg']),
      location: 'Milford NH',
      distance_miles: 2.5,
      posted_at: '2026-03-22T10:00:00Z',
      found_at: '2026-03-22T10:05:00Z'
    });
    expect(id).to.be.a('number');

    const listing = db.getListing(id);
    expect(listing.title).to.equal('Free couch');
    expect(listing.status).to.equal('pending_eval');
  });

  it('rejects duplicate URLs', () => {
    const fn = () => db.insertListing({
      url: 'https://fb.com/item/123',
      title: 'Dup',
      price: 0,
      description: '',
      images: '[]',
      location: '',
      distance_miles: 0,
      posted_at: '',
      found_at: ''
    });
    expect(fn).to.throw();
  });

  it('gets pending listings for evaluation', () => {
    db.insertListing({
      url: 'https://fb.com/item/456',
      title: 'Free table',
      price: 0,
      description: '',
      images: '[]',
      location: 'Nashua NH',
      distance_miles: 10,
      posted_at: '2026-03-22T11:00:00Z',
      found_at: '2026-03-22T11:05:00Z'
    });
    const pending = db.getPendingListings();
    expect(pending.length).to.be.at.least(1);
    expect(pending.every(l => l.status === 'pending_eval')).to.be.true;
  });

  it('inserts and retrieves an evaluation', () => {
    const pending = db.getPendingListings();
    const evalId = db.insertEvaluation({
      listing_id: pending[0].id,
      item_type: 'couch',
      brand: null,
      model: null,
      condition: 'good',
      weight_class: '30_70lb',
      ebay_search_query: 'couch sofa',
      ebay_median_price: 150,
      ebay_sold_count: 12,
      ebay_avg_days_to_sell: 7,
      shipping_estimate: 50,
      ebay_fees: 24.28,
      gas_cost: 3.35,
      net_profit: 72.37,
      profit_per_mile: 28.95,
      grade: 'B',
      sell_channel: 'ebay',
      notes: 'Standard couch, good condition'
    });
    expect(evalId).to.be.a('number');
    db.updateListingStatus(pending[0].id, 'evaluated');
  });

  it('gets top deals sorted by profit_per_mile', () => {
    const deals = db.getTopDeals(10);
    expect(deals.length).to.be.at.least(1);
    expect(deals[0]).to.have.property('net_profit');
    expect(deals[0]).to.have.property('title');
  });
});
