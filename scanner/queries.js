// scanner/queries.js
const config = require('../shared/config');

let _index = 0;

function getAllQueries() {
  return config.get().scanner.search_queries;
}

function getNextQuery() {
  const queries = getAllQueries();
  const q = queries[_index % queries.length];
  _index++;
  return q;
}

function resetIndex() {
  _index = 0;
}

module.exports = { getAllQueries, getNextQuery, resetIndex };
