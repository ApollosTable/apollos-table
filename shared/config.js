// shared/config.js
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_PATH = path.join(ROOT, 'config.default.json');
const USER_PATH = path.join(ROOT, 'config.json');

let _config = null;

function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])
        && target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])) {
      result[key] = deepMerge(target[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

function load() {
  const defaults = JSON.parse(fs.readFileSync(DEFAULT_PATH, 'utf8'));
  let user = {};
  if (fs.existsSync(USER_PATH)) {
    user = JSON.parse(fs.readFileSync(USER_PATH, 'utf8'));
  }
  _config = deepMerge(defaults, user);
  return _config;
}

function get() {
  if (!_config) return load();
  return _config;
}

module.exports = { load, get };
