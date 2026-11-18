// Jax's homes: a starter flat, a loft for sale, and a house earned through the story.
import { DEFAULT_OUTFIT, OUTFITS, SPAWN } from './config.js';
import { createPlaceMarker, nearestPlace } from './places.js';

const RING = '#b48ce0';
const GARAGE = {
  id: 'garage-flat', name: 'Moreno Garage Flat', x: -36, z: 108,
  color: 0xcb9a70, roof: 0x76594c, width: 8, depth: 6,
};
const LOFT = {
  id: 'marina-loft', name: 'Marina Loft', x: 252, z: -108, price: 5000,
  color: 0x8db5bb, roof: 0x3c5674, width: 7, depth: 8,
};
const HILLTOP = {
  id: 'hilltop-house', name: 'Hilltop House', x: -252, z: 108, mission: 'beach-run',
  color: 0xe0c8a0, roof: 0x94534e, width: 10, depth: 7,
};

export const SAFEHOUSES = [GARAGE, LOFT, HILLTOP];
const byId = new Map(SAFEHOUSES.map((place) => [place.id, place]));

export function normalizeSafehouseSave(data) {
  const owned = Array.isArray(data?.owned)
    ? [...new Set(data.owned.filter((id) => byId.has(id)))]
    : [];
  const respawnId = data?.respawnId;
  return {
    owned,
    respawnId: respawnId === GARAGE.id || owned.includes(respawnId) ? respawnId : null,
    outfit: OUTFITS.some((outfit) => outfit.id === data?.outfit) ? data.outfit : DEFAULT_OUTFIT,
  };
}

export function createSafehouses({ scene, player, hud, isMissionComplete, onSave, onSetRespawn }) {
  const list = SAFEHOUSES;
  for (const place of list) createPlaceMarker(scene, place, { ...place, kind: 'safehouse', ring: RING });
  const state = { owned: new Set([GARAGE.id]), respawnId: null };

  function owned(id) {
    return state.owned.has(id);
  }

  function isLocked(id) {
    const place = byId.get(id);
    return Boolean(place?.mission && !owned(id) && !isMissionComplete?.(place.mission));
  }

  function update() {
    if (owned(HILLTOP.id) || !isMissionComplete?.(HILLTOP.mission)) return;
    state.owned.add(HILLTOP.id);
    hud?.toast?.(`Safehouse unlocked: ${HILLTOP.name}`, 'mission', 3.5);
  }

  function buy(id, cash) {
    const place = byId.get(id);
    if (!place) return { ok: false, reason: 'Unknown safehouse.' };
    if (owned(id)) return { ok: false, reason: 'You already own this safehouse.' };
    if (isLocked(id)) return { ok: false, reason: 'Complete The Pickup to unlock this safehouse.' };
    if (!place.price) return { ok: false, reason: 'This safehouse is not for sale.' };
    if (!Number.isFinite(cash) || cash < place.price) return { ok: false, reason: 'Not enough cash.' };
    state.owned.add(id);
    return { ok: true, price: place.price };
  }

  function saveGame(id) {
    if (!owned(id)) return { ok: false, reason: 'You do not own this safehouse.' };
    if (!onSave?.()) return { ok: false, reason: 'Could not save the game.' };
    hud?.toast?.(`Game saved at ${byId.get(id).name}`, 'info', 3);
    return { ok: true };
  }

  function setActiveRespawn(id) {
    if (!owned(id)) return { ok: false, reason: 'You do not own this safehouse.' };
    const place = byId.get(id);
    state.respawnId = id;
    onSetRespawn?.(place);
    hud?.toast?.(`Respawn set at ${place.name}`, 'info', 3);
    return { ok: true };
  }

  function heal(id) {
    if (!owned(id)) return { ok: false, reason: 'You do not own this safehouse.' };
    const before = player.state.health;
    player.heal(player.state.maxHealth);
    hud?.setHealth?.(player.state.health, player.state.maxHealth);
    hud?.toast?.(`Rested at ${byId.get(id).name}. Health restored.`, 'info', 3);
    return { ok: true, healed: player.state.health - before };
  }

  function changeOutfit(id) {
    if (!owned(id)) return { ok: false, reason: 'You do not own this safehouse.' };
    const current = OUTFITS.findIndex((outfit) => outfit.id === player.state.outfit);
    const next = OUTFITS[(current + 1) % OUTFITS.length];
    player.setOutfit(next.id);
    hud?.toast?.(`Outfit changed: ${next.name}`, 'info', 2.5);
    return { ok: true, outfit: next.id };
  }

  function getBlips() {
    return list.map(({ x, z }) => ({ x, z, color: RING, size: 24 }));
  }

  function reset() {
    state.owned.clear();
    state.owned.add(GARAGE.id);
    state.respawnId = null;
    player.setOutfit(DEFAULT_OUTFIT);
    onSetRespawn?.(SPAWN);
  }

  function serialize() {
    return {
      owned: [...state.owned],
      respawnId: state.respawnId,
      outfit: player.state.outfit,
    };
  }

  function restore(data) {
    const saved = normalizeSafehouseSave(data);
    reset();
    for (const id of saved.owned) {
      if (!isLocked(id)) state.owned.add(id);
    }
    state.respawnId = owned(saved.respawnId) ? saved.respawnId : null;
    player.setOutfit(saved.outfit);
    if (state.respawnId) onSetRespawn?.(byId.get(state.respawnId));
  }

  return {
    list, state, nearest: (x, z, radius = 5) => nearestPlace(list, x, z, radius),
    update, buy, owned, isLocked, saveGame, setActiveRespawn, heal, changeOutfit,
    getBlips, reset, serialize, restore,
  };
}
