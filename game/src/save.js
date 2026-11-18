import { SAVE_VERSION, MISSIONS } from './config.js';
const KEY = 'solmar.save.v2';
export function readSave() {
  try {
    const save = JSON.parse(localStorage.getItem(KEY));
    if (!save || save.version !== SAVE_VERSION || !Number.isFinite(save.cash) || !Array.isArray(save.missions)) return null;
    const best = {};
    for (const [id, time] of Object.entries(save.best || {})) if (MISSIONS.order.includes(id) && Number.isFinite(time) && time >= 0) best[id] = time;
    return { version: SAVE_VERSION, cash: Math.max(0, Math.floor(save.cash)), missions: save.missions.filter(id => MISSIONS.order.includes(id)), best, muted: !!save.muted };
  } catch { return null; }
}
export function writeSave(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ version: SAVE_VERSION, cash: data.cash, missions: [...data.missions], best: { ...data.best }, muted: !!data.muted }));
    return true;
  } catch { return false; }
}
export function clearSave() {
  try { localStorage.removeItem(KEY); return true; } catch { return false; }
}
