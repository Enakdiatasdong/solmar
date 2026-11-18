// Street reputation derives ranks from points and observes wanted transitions without owning police.
import { POLICE, REP } from './config.js';

export function createRep(ctx = {}) {
  let points = 0;
  let elapsed = 0;
  let previousWanted = 0;
  let peakWanted = 0;
  let lastGain = null;
  let rankUps = [];

  function normalizePoints(value) {
    return Number.isFinite(value) ? Math.max(0, Math.min(REP.maxPoints, Math.floor(value))) : 0;
  }

  function rankAt(value) {
    const total = normalizePoints(value);
    let index = REP.ranks.length - 1;
    while (index > 0 && total < REP.ranks[index].points) index -= 1;
    return { index, ...REP.ranks[index] };
  }

  const state = {
    get points() { return points; },
    get rankIndex() { return rankAt(points).index; },
    get rank() { return rankAt(points).name; },
    get lastGain() { return lastGain; },
    get wanted() { return previousWanted; },
    get peakWanted() { return peakWanted; },
  };

  function addPoints(amount, reason = '') {
    if (!Number.isFinite(amount) || amount <= 0) return 0;
    const previousRank = rankAt(points).index;
    const nextPoints = normalizePoints(points + Math.floor(amount));
    const gain = nextPoints - points;
    if (gain <= 0) return 0;
    points = nextPoints;
    lastGain = Object.freeze({ points: gain, reason: String(reason), at: ctx.now?.() ?? elapsed });
    for (let index = previousRank + 1; index <= rankAt(points).index; index += 1) {
      rankUps.push(Object.freeze({ index, ...REP.ranks[index] }));
    }
    return gain;
  }

  function rankInfo() {
    const rank = rankAt(points);
    const next = REP.ranks[rank.index + 1];
    return {
      index: rank.index,
      name: rank.name,
      points,
      nextName: next?.name ?? null,
      nextAt: next?.points ?? null,
      progress: next ? Math.max(0, Math.min(1, (points - rank.points) / (next.points - rank.points))) : 1,
    };
  }

  function takeRankUps() {
    const reached = rankUps;
    rankUps = [];
    return reached;
  }

  // Suppress escape awards around arrests and scripted clears; increases still earn stars.
  function noteWanted(value, { awardEscape = true } = {}) {
    const level = Number.isFinite(value) ? Math.max(0, Math.min(POLICE.maxWanted, Math.round(value))) : 0;
    if (level > previousWanted) addPoints((level - previousWanted) * REP.wantedStar, 'Wanted level rose');
    peakWanted = Math.max(peakWanted, level);
    if (previousWanted > 0 && level === 0) {
      if (awardEscape && peakWanted >= REP.tailWanted) addPoints(REP.lostTail, 'Lost the tail');
      peakWanted = 0;
    }
    previousWanted = level;
  }

  function update(dt, wanted, { awardEscape = true } = {}) {
    if (Number.isFinite(dt) && dt > 0) elapsed += dt;
    if (Number.isFinite(wanted)) noteWanted(wanted, { awardEscape });
  }

  function reset(value = 0) {
    points = normalizePoints(value);
    elapsed = 0;
    previousWanted = 0;
    peakWanted = 0;
    lastGain = null;
    rankUps = [];
  }

  return { state, update, addPoints, rankAt, rankInfo, reset, noteWanted, takeRankUps };
}
