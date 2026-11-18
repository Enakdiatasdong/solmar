// Solmar Reels are fixed film reel pickups at intersections and open ground.
import * as THREE from '../vendor/three.module.min.js';
import { CITY } from './config.js';

// Keep the Reel IDs across both maps, on open sand beyond the beach props.
const BEACH_POINTS = Number.isFinite(CITY.beachWest)
  ? [[-532, 72], [-532, 240], [-532, -144]]
  : [[-190, 500], [0, 515], [242, 500]];

const REELS = [
  // South Shore is open at the start of the story.
  ['opening-frame', 'Opening Frame', -72, 216],
  ['taxi-light', 'Taxi Light', 144, 216],
  ['marina-matinee', 'Marina Matinee', 288, 216],
  ['dockside-dailies', 'Dockside Dailies', -288, 288],
  ['southern-crossing', 'Southern Crossing', 0, 288],
  ['runway-lights', 'Runway Lights', 216, 360],
  ['last-departure', 'Last Departure', -216, 360],
  // City intersections, away from the canal at z=0.
  ['brisa-after-hours', 'Brisa After Hours', -216, 144],
  ['prisma-premiere', 'Prisma Premiere', 144, 72],
  ['neon-projection', 'Neon Projection', 288, -72],
  ['cobre-in-focus', 'Cobre in Focus', -216, -144],
  ['northbound-take', 'Northbound Take', 72, -216],
  ['alta-night-cut', 'Alta Night Cut', 216, -288],
  // Open sand along the coast.
  ['salt-air', 'Salt Air', ...BEACH_POINTS[0]],
  ['swell-at-dusk', 'Swell at Dusk', ...BEACH_POINTS[1]],
  ['shoreline-silhouette', 'Shoreline Silhouette', ...BEACH_POINTS[2]],
  // Dirt roads in the northern village.
  ['west-track', 'West Track', -300, -560],
  ['east-track', 'East Track', 300, -560],
  ['oak-country', 'Oak Country', -300, -760],
  ['harvest-light', 'Harvest Light', 300, -715],
];

const REEL_IDS = new Set(REELS.map(([id]) => id));
const PICKUP_RADIUS = 3;
const REEL_COLOR = '#e878e5';
const COLLECTED_COLOR = '#8a94a0';

export function normalizeCollectedReels(value) {
  return Array.isArray(value) ? [...new Set(value.filter((id) => REEL_IDS.has(id)))] : [];
}

export function createCollectibles({ scene, city, hud, audio, onPickup }) {
  const group = new THREE.Group();
  group.name = 'solmar-reels';
  scene.add(group);

  const state = {
    collected: [],
    get count() { return state.collected.length; },
    total: REELS.length,
  };
  const list = REELS.map(([id, name, x, z]) => ({ id, name, x, z }));
  const ground = city.groundHeight ?? 0;
  const hoverHeight = ground + 1.8;
  const material = new THREE.MeshBasicMaterial({ color: REEL_COLOR });
  const rimGeometry = new THREE.TorusGeometry(0.52, 0.1, 8, 20);
  const spokeGeometry = new THREE.BoxGeometry(0.14, 0.51, 0.14).translate(0, 0.25, 0);
  const beamGeometry = new THREE.CylinderGeometry(0.11, 0.3, 4.6, 10, 1, true);
  const beamMaterial = new THREE.MeshBasicMaterial({
    color: REEL_COLOR, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide,
  });
  const markers = new Map(list.map(({ id, x, z }) => {
    const holder = new THREE.Group();
    holder.position.set(x, 0, z);
    const reel = new THREE.Group();
    reel.position.y = hoverHeight;
    reel.add(new THREE.Mesh(rimGeometry, material));
    for (let index = 0; index < 3; index += 1) {
      const spoke = new THREE.Mesh(spokeGeometry, material);
      spoke.rotation.z = index * Math.PI * 2 / 3;
      reel.add(spoke);
    }
    const beam = new THREE.Mesh(beamGeometry, beamMaterial);
    beam.position.y = ground + 2.3;
    holder.add(beam, reel);
    group.add(holder);
    return [id, { holder, reel }];
  }));
  let elapsed = 0;

  function nearest(x, z) {
    let best = null;
    for (const item of list) {
      if (state.collected.includes(item.id)) continue;
      const distance = Math.hypot(x - item.x, z - item.z);
      if (distance <= PICKUP_RADIUS && (!best || distance < best.distance)) best = { item, distance };
    }
    return best;
  }

  function getBlips() {
    return list.map(({ id, x, z }) => {
      const collected = state.collected.includes(id);
      return { x, z, color: collected ? COLLECTED_COLOR : REEL_COLOR, size: collected ? 10 : 15 };
    });
  }

  function restore(ids) {
    state.collected = normalizeCollectedReels(ids);
    elapsed = 0;
    group.clear();
    markers.forEach(({ holder, reel }, id) => {
      reel.position.y = hoverHeight;
      reel.rotation.set(0, 0, 0);
      if (!state.collected.includes(id)) group.add(holder);
    });
  }

  function update(dt, player) {
    const actor = player?.state?.inCar?.state ?? player?.state;
    if (!actor) return;
    elapsed += dt;
    markers.forEach(({ holder, reel }) => {
      if (!holder.parent) return;
      reel.position.y = hoverHeight + Math.sin(elapsed * 2.8) * 0.23;
      reel.rotation.y = elapsed * 1.5;
    });

    const nearby = nearest(actor.x, actor.z);
    if (!nearby) return;
    const { item } = nearby;
    state.collected.push(item.id);
    markers.get(item.id).holder.removeFromParent();
    audio?.chime?.();
    hud?.toast?.(`Solmar Reel ${state.count}/${state.total} — ${item.name}`, 'mission', 4);
    onPickup?.(item);
  }

  return { group, state, list, nearest, getBlips, update, restore, reset: () => restore() };
}
