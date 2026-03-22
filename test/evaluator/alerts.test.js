const { expect } = require('chai');

describe('alerts', () => {
  before(() => require('../../shared/config').load());
  const { shouldAlert, formatAlertMessage } = require('../../evaluator/alerts');

  it('alerts on grade A deals', () => {
    expect(shouldAlert('A')).to.deep.equal({ desktop: true, email: false });
  });

  it('alerts desktop only on grade B deals', () => {
    expect(shouldAlert('B')).to.deep.equal({ desktop: true, email: false });
  });

  it('does not alert on grade C or F', () => {
    expect(shouldAlert('C')).to.deep.equal({ desktop: false, email: false });
    expect(shouldAlert('F')).to.deep.equal({ desktop: false, email: false });
  });

  it('formats a readable alert message', () => {
    const msg = formatAlertMessage({
      title: 'Free Standing Desk', grade: 'A', net_profit: 120,
      distance_miles: 5, location: 'Nashua NH'
    });
    expect(msg).to.include('Free Standing Desk');
    expect(msg).to.include('$120');
    expect(msg).to.include('5');
  });
});
