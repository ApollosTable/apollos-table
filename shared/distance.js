// shared/distance.js
function milesToLocation(from, to) {
  const R = 3958.8;
  const dLat = toRad(to.latitude - from.latitude);
  const dLon = toRad(to.longitude - from.longitude);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from.latitude)) * Math.cos(toRad(to.latitude)) *
    Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

function toRad(deg) {
  return deg * (Math.PI / 180);
}

function flooredDistance(miles) {
  return Math.max(miles, 1.0);
}

module.exports = { milesToLocation, flooredDistance };
