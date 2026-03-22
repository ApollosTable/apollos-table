const { expect } = require('chai');

describe('identifier', () => {
  const { buildIdentificationPrompt, parseIdentificationResponse } = require('../../evaluator/identifier');

  it('builds a prompt with listing context', () => {
    const prompt = buildIdentificationPrompt('Free desk', 'Oak desk, 5ft');
    expect(prompt).to.include('Free desk');
    expect(prompt).to.include('Oak desk');
    expect(prompt).to.include('ebay_search_query');
  });

  it('parses valid JSON response', () => {
    const json = JSON.stringify({
      item_type: 'desk', brand: 'IKEA', model: 'MALM', condition: 'good',
      weight_class: '30_70lb', ebay_search_query: 'IKEA MALM desk', notes: 'Standard office desk'
    });
    const result = parseIdentificationResponse(json);
    expect(result.item_type).to.equal('desk');
    expect(result.ebay_search_query).to.equal('IKEA MALM desk');
  });

  it('parses JSON wrapped in markdown code fence', () => {
    const text = '```json\n{"item_type":"chair","brand":null,"model":null,"condition":"fair","weight_class":"10_30lb","ebay_search_query":"office chair","notes":"generic"}\n```';
    const result = parseIdentificationResponse(text);
    expect(result.item_type).to.equal('chair');
  });

  it('returns null for unparseable response', () => {
    const result = parseIdentificationResponse('I cannot identify this item');
    expect(result).to.be.null;
  });
});
