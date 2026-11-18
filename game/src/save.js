// A bad or unavailable browser store must never prevent a new run.
export const SAVE_KEY = 'solmar.save.v2';
const JOBS = ['first-fare', 'hot-wheels', 'beach-run', 'heat', 'harbor-job'];

function validSave(value) {
  if (!value || typeof value !== 'object' || value.version !== 2) return null;
  if (!Number.isFinite(value.cash) || !Array.isArray(value.completed)) return null;
  const bestTimes = {};
  for (const id of JOBS) {
    const time = value.bestTimes?.[id];
    if (Number.isFinite(time) && time > 0) bestTimes[id] = Math.round(time * 10) / 10;
  }
  return {
    version: 2,
    cash: Math.max(0, Math.floor(value.cash)),
    completed: JOBS.filter(id => value.completed.includes(id)),
    bestTimes,
    muted: value.muted === true,
  };
}

export function readSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? validSave(JSON.parse(raw)) : null;
  } catch { return null; }
}

export function writeSave(data) {
  try {
    const clean = validSave({ ...data, version: 2 });
    if (!clean) return false;
    localStorage.setItem(SAVE_KEY, JSON.stringify(clean));
    return true;
  } catch { return false; }
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); return true; }
  catch { return false; }
}
