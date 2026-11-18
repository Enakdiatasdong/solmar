// Versioned localStorage persistence. Invalid or incompatible data is ignored safely.
import { ASSETS } from './assets.js';
import { MISSIONS, SAVE_KEY, SAVE_VERSION } from './config.js';
import { normalizeSafehouseSave } from './safehouses.js';

const LEGACY_SAVE_KEY = 'solmar.save.v2';
const ASSET_IDS = new Set(ASSETS.map(({ id }) => id));

function safeStorage() {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

function finiteNumber(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function normalizeBest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const best = {};
  for (const [id, time] of Object.entries(value)) {
    if (MISSIONS.order.includes(id) && Number.isFinite(time) && time >= 0 && time <= 1e7) {
      best[id] = time;
    }
  }
  return best;
}

function normalizeSave(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const current = value.version === SAVE_VERSION;
  if (!current && value.version !== 2) return null;
  const missions = Array.isArray(value.missions)
    ? [...new Set(value.missions.filter((id) => MISSIONS.order.includes(id)))]
    : [];
  const assets = current && Array.isArray(value.assets)
    ? [...new Set(value.assets.filter((id) => ASSET_IDS.has(id)))]
    : [];
  return {
    cash: Math.max(0, Math.min(1e9, finiteNumber(value.cash, MISSIONS.startCash))),
    rep: Math.max(0, Math.min(100000, Number.isFinite(value.rep) ? Math.floor(value.rep) : 0)),
    missions,
    best: normalizeBest(value.best),
    muted: value.muted === true,
    seed: Number.isInteger(value.seed) ? value.seed >>> 0 : 1,
    assets,
    safehouses: normalizeSafehouseSave(current ? value.safehouses : null),
    mealsEaten: current ? Math.max(0, finiteNumber(value.mealsEaten, 0)) : 0,
    version: SAVE_VERSION,
    updatedAt: Number.isFinite(value.updatedAt) && value.updatedAt >= 0 ? value.updatedAt : 0,
  };
}

export function readSave(storage = safeStorage()) {
  if (!storage) return null;
  for (const key of [SAVE_KEY, LEGACY_SAVE_KEY]) {
    try {
      const raw = storage.getItem(key);
      const save = raw ? normalizeSave(JSON.parse(raw)) : null;
      if (save) return save;
    } catch {
      // A corrupt current save should not prevent loading an older one.
    }
  }
  return null;
}

export function writeSave(data, storage = safeStorage()) {
  if (!storage || !data || typeof data !== 'object' || Array.isArray(data)) return false;
  try {
    const save = normalizeSave({
      ...data,
      version: SAVE_VERSION,
      updatedAt: Date.now(),
    });
    storage.setItem(SAVE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

export function clearSave(storage = safeStorage()) {
  if (!storage) return false;
  try {
    storage.removeItem(SAVE_KEY);
    storage.removeItem(LEGACY_SAVE_KEY);
    return true;
  } catch {
    return false;
  }
}
