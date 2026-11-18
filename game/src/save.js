import { SAVE_VERSION, MISSIONS, RACE_IDS, CLOCK, DIFFICULTY, COLLECTIBLE_TOTAL } from './config.js';
const KEY = 'solmar.save.v2';
export function readSave() {
  try {
    const save = JSON.parse(localStorage.getItem(KEY));
    if (!save || save.version !== SAVE_VERSION || !Number.isFinite(save.cash) || !Array.isArray(save.missions)) return null;
    const best = {};
    for (const [id, time] of Object.entries(save.best || {})) if ([...MISSIONS.order, ...RACE_IDS].includes(id) && Number.isFinite(time) && time >= 0) best[id] = time;
    return {
      version: SAVE_VERSION, cash: Math.max(0, Math.floor(save.cash)), missions: [...new Set(save.missions.filter(id => MISSIONS.order.includes(id)))], best, muted: !!save.muted,
      difficulty: Object.hasOwn(DIFFICULTY, save.difficulty) ? save.difficulty : 'normal',
      clock: Number.isFinite(save.clock) && save.clock >= 0 ? save.clock : CLOCK.start,
      medallions: Array.isArray(save.medallions) ? [...new Set(save.medallions.filter(id => Number.isInteger(id) && id >= 0 && id < COLLECTIBLE_TOTAL))] : [],
      armed: save.armed !== false,
      ammo: Number.isFinite(save.ammo) ? Math.max(0, Math.floor(save.ammo)) : 24,
    };
  } catch { return null; }
}
export function writeSave(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...data, version: SAVE_VERSION }));
    return true;
  } catch { return false; }
}
export function clearSave() {
  try { localStorage.removeItem(KEY); return true; } catch { return false; }
}
