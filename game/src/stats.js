// Run statistics stay serializable, with district ownership read from the turf state.
const COUNTS = ['missionsCompleted', 'kills', 'shotsFired', 'shotsHit', 'deaths', 'bustedCount', 'carsStolen'];
const TOTALS = ['playTimeSeconds', 'distanceOnFootMeters', 'distanceDrivingMeters', 'moneyEarnedTotal', 'moneySpentTotal'];

function nonnegative(value) {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function normalizeStats(value) {
  const data = {};
  for (const key of COUNTS) data[key] = Math.floor(nonnegative(value?.[key]));
  for (const key of TOTALS) data[key] = nonnegative(value?.[key]);
  data.shotsHit = Math.min(data.shotsHit, data.shotsFired);
  data.placesVisited = Array.isArray(value?.placesVisited)
    ? [...new Set(value.placesVisited.filter((name) => typeof name === 'string' && name.trim()))]
    : [];
  return data;
}

export function createStats(getDistricts = () => []) {
  const state = {
    ...normalizeStats(),
    get districtsOwned() {
      return getDistricts().filter((district) => district.owner === 'player').length;
    },
  };
  const countedEnemies = new Set();

  function restore(data) {
    Object.assign(state, normalizeStats(data));
    countedEnemies.clear();
  }

  function reset() {
    restore();
  }

  function serialize() {
    return normalizeStats(state);
  }

  function snapshot() {
    return { ...state, placesVisited: [...state.placesVisited] };
  }

  function recordKill() {
    state.kills += 1;
  }

  function recordMoneyEarned(amount) {
    state.moneyEarnedTotal += nonnegative(amount);
  }

  function recordMissionComplete(reward) {
    state.missionsCompleted += 1;
    recordMoneyEarned(reward);
  }

  function recordMoneySpent(amount) {
    state.moneySpentTotal += nonnegative(amount);
  }

  function recordBusted() {
    state.bustedCount += 1;
  }

  function recordDeath() {
    state.deaths += 1;
  }

  function recordCarStolen() {
    state.carsStolen += 1;
  }

  function recordShot(hits) {
    state.shotsFired += 1;
    if (hits > 0) state.shotsHit += 1;
  }

  function addDistance(meters, inCar) {
    const key = inCar ? 'distanceDrivingMeters' : 'distanceOnFootMeters';
    state[key] += nonnegative(meters);
  }

  function visitPlace(name) {
    if (typeof name === 'string' && name.trim() && !state.placesVisited.includes(name)) {
      state.placesVisited.push(name);
    }
  }

  function update(dt, enemies = []) {
    state.playTimeSeconds += nonnegative(dt);
    for (const enemy of enemies) {
      // Combat creates enemies alive, so a dead enemy can count on its first observation.
      if (enemy.alive !== false || countedEnemies.has(enemy)) continue;
      countedEnemies.add(enemy);
      recordKill();
    }
  }

  return {
    state, reset, snapshot, recordKill, recordMissionComplete, recordMoneyEarned, recordMoneySpent,
    recordBusted, recordDeath, recordCarStolen, recordShot, addDistance, visitPlace, update, serialize, restore,
  };
}
