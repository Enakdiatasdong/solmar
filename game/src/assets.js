// Buyable Solmar businesses pay rent for each minute they are owned in play.
import { createPlaceMarker, nearestPlace } from './places.js';

const INCOME_INTERVAL = 60;
const GOLD = '#ffc857';
const OWNED_GOLD = '#e6a444';

export const ASSETS = [
  { id: 'moreno-auto-works', name: 'Moreno Auto Works', x: -268, z: -108, price: 4000, income: 120, color: 0x78a5bc, roof: 0x315263, width: 8.5, depth: 6.5 },
  { id: 'sunset-mart', name: 'Sunset Mart', x: 108, z: -236, price: 2500, income: 70, color: 0xec9152, roof: 0x78473d, width: 7, depth: 5.5 },
  { id: 'pier-light-bar', name: 'Pier Light Bar', x: -396, z: 216, price: 6000, income: 180, color: 0x76b099, roof: 0x2f625d, width: 7.5, depth: 6 },
  { id: 'harbor-storage', name: 'Harbor Storage', x: -432, z: -108, price: 8000, income: 240, color: 0xb9a2d2, roof: 0x5b4a75, width: 10, depth: 8 },
];

export function createAssets({ scene, hud, onIncome, onToast }) {
  const list = ASSETS;
  const state = { owned: new Set(), pendingIncome: 0 };
  const timers = new Map();
  const toast = onToast ?? ((message) => hud?.toast(message, 'info'));

  for (const asset of list) {
    const { color, roof, width, depth } = asset;
    createPlaceMarker(scene, asset, { color, roof, width, depth, ring: GOLD, kind: 'asset' });
  }

  function buy(id, cash) {
    const asset = list.find((entry) => entry.id === id);
    if (!asset) return { ok: false, reason: 'Unknown property.' };
    if (state.owned.has(id)) return { ok: false, reason: 'You already own this property.' };
    if (!Number.isFinite(cash) || cash < asset.price) {
      return { ok: false, reason: `You need $${asset.price.toLocaleString('en-US')} to buy ${asset.name}.` };
    }
    state.owned.add(id);
    timers.set(id, 0);
    return { ok: true, price: asset.price };
  }

  function update(dt) {
    if (!Number.isFinite(dt) || dt <= 0 || !state.owned.size) return;
    let payout = 0;
    state.pendingIncome = 0;
    for (const asset of list) {
      if (!state.owned.has(asset.id)) continue;
      const elapsed = (timers.get(asset.id) ?? 0) + dt;
      // A fixed-step minute can sum to a few trillionths of a second short of 60.
      const minutes = Math.floor((elapsed + 1e-8) / INCOME_INTERVAL);
      const remaining = Math.max(0, elapsed - minutes * INCOME_INTERVAL);
      timers.set(asset.id, remaining);
      state.pendingIncome += (remaining / INCOME_INTERVAL) * asset.income;
      if (minutes > 0) {
        const amount = minutes * asset.income;
        payout += amount;
        onIncome?.(amount, asset);
      }
    }
    if (payout) toast(`Asset income +$${payout.toLocaleString('en-US')}`);
  }

  function ownedIncomePerMin() {
    return list.reduce((total, asset) => total + (state.owned.has(asset.id) ? asset.income : 0), 0);
  }

  function getBlips() {
    return list.map(({ id, x, z }) => {
      const owned = state.owned.has(id);
      return { x, z, color: owned ? OWNED_GOLD : GOLD, size: owned ? 17 : 24 };
    });
  }

  function reset() {
    state.owned.clear();
    state.pendingIncome = 0;
    timers.clear();
  }

  function restore(data) {
    reset();
    if (!Array.isArray(data)) return;
    for (const asset of list) {
      if (data.includes(asset.id)) state.owned.add(asset.id);
    }
  }

  return {
    list, state, update, buy, ownedIncomePerMin, getBlips, reset, restore,
    nearest: (x, z, radius = 5) => nearestPlace(list, x, z, radius),
    serialize: () => [...state.owned],
  };
}
