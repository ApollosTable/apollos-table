const fs = require('fs');
const path = require('path');

const defaultPath = path.join(__dirname, '..', 'config.default.json');
const userPath = path.join(__dirname, '..', 'config.json');

let config = null;

function load() {
  if (config) return config;

  const defaults = JSON.parse(fs.readFileSync(defaultPath, 'utf8'));
  let user = {};

  if (fs.existsSync(userPath)) {
    user = JSON.parse(fs.readFileSync(userPath, 'utf8'));
  }

  config = deepMerge(defaults, user);
  return config;
}

function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

module.exports = { load };
