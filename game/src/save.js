// Versioned localStorage persistence. Invalid or incompatible data is ignored safely.
import { GANGS, MISSIONS, SAVE_KEY, SAVE_VERSION } from './config.js';
import { normalizeStats } from './stats.js';

const GANG_OWNERS = new Set(GANGS.factions.map(({ id }) => id));

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

function normalizeDistricts(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const districts = {};
  for (const { id } of GANGS.districts) {
    const { owner, progress } = value[id] ?? {};
    if (GANG_OWNERS.has(owner)) {
      districts[id] = { owner, progress: Math.max(0, Math.min(100, finiteNumber(progress, 0))) };
    } else if (owner === 'player' || owner === 'neutral') {
      districts[id] = { owner, progress: 0 };
    }
  }
  return districts;
}

function normalizeSave(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (value.version !== SAVE_VERSION) return null;
  const missions = Array.isArray(value.missions)
    ? [...new Set(value.missions.filter((id) => MISSIONS.order.includes(id)))]
    : [];
  return {
    cash: Math.max(0, Math.min(1e9, finiteNumber(value.cash, MISSIONS.startCash))),
    missions,
    best: normalizeBest(value.best),
    districts: normalizeDistricts(value.districts),
    stats: normalizeStats(value.stats),
    muted: value.muted === true,
    seed: Number.isInteger(value.seed) ? value.seed >>> 0 : 1,
    version: SAVE_VERSION,
    updatedAt: Number.isFinite(value.updatedAt) && value.updatedAt >= 0 ? value.updatedAt : 0,
  };
}

export function readSave(storage = safeStorage()) {
  if (!storage) return null;
  try {
    const raw = storage.getItem(SAVE_KEY);
    if (!raw) return null;
    return normalizeSave(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeSave(data, storage = safeStorage()) {
  if (!storage || !data || typeof data !== 'object') return false;
  const save = normalizeSave({
    ...data,
    version: SAVE_VERSION,
    updatedAt: Date.now(),
  });
  if (!save) return false;
  try {
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
    return true;
  } catch {
    return false;
  }
}
