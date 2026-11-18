// Story progress is the single source of truth for district access.
import * as THREE from '../vendor/three.module.min.js';
import { CITY, REGIONS } from './config.js';

export function createRegions(ctx) {
  const { scene, missions } = ctx;
  let elapsed = 0;
  let lastAttempt = -Infinity;
  let lastWanted = -Infinity;
  let lastToast = -Infinity;
  const regions = REGIONS.list.map((entry) => ({
    id: entry.id, name: entry.name, required: entry.required,
    bounds: { minX: -CITY.edge, maxX: CITY.edge, minZ: entry.minZ, maxZ: entry.maxZ },
    get open() { return missions.completedCount() >= entry.required; },
    get locked() { return !this.open; },
  }));
  const barriers = regions.slice(1).map((region) => {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(CITY.edge * 2, REGIONS.barrierHeight),
      new THREE.MeshBasicMaterial({
        color: REGIONS.barrierColor, transparent: true, opacity: REGIONS.barrierOpacity,
        side: THREE.DoubleSide, depthWrite: false,
      }),
    );
    mesh.name = `district-gate-${region.id}`;
    mesh.position.set(0, REGIONS.barrierHeight / 2, region.bounds.maxZ);
    mesh.visible = region.locked;
    scene.add(mesh);
    return { region, mesh };
  });
  const state = { regions, lastWarning: null, hint: '' };

  function regionAt(x, z) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
    return regions.find((region) => z >= region.bounds.minZ && z < region.bounds.maxZ) ?? null;
  }

  function isOpen(id) { return regions.find((region) => region.id === id)?.open ?? false; }
  function isLocked(id) { return regions.find((region) => region.id === id)?.locked ?? false; }
  function unlockedCount() { return regions.filter((region) => region.open).length; }

  function snapshot(x, z) {
    for (const { region, mesh } of barriers) mesh.visible = region.locked;
    return { regions, currentRegion: regionAt(x, z), unlockedCount: unlockedCount(), total: regions.length };
  }

  function update(dt, player, vehicles, police, hud) {
    if (Number.isFinite(dt) && dt > 0) elapsed += dt;
    for (const { region, mesh } of barriers) mesh.visible = region.locked;
    const actor = player.state.inCar?.state ?? player.state;
    const region = regionAt(actor.x, actor.z);
    if (region?.locked) {
      const message = `${region.name} is locked. Complete ${region.required} story ${region.required === 1 ? 'job' : 'jobs'} to enter.`;
      if (elapsed - lastAttempt <= REGIONS.repeatWindow && elapsed - lastWanted >= REGIONS.wantedCooldown) {
        police.addWanted(1, 'Trespassing in a locked district');
        lastWanted = elapsed;
      }
      lastAttempt = elapsed;
      state.lastWarning = { regionId: region.id, regionName: region.name, message, at: elapsed };
      if (elapsed - lastToast >= REGIONS.warningCooldown) {
        hud.toast(message, 'danger', REGIONS.warningDuration);
        lastToast = elapsed;
      }
      // All open bands are contiguous. Clamp to the closest edge of their union,
      // even when a teleport has crossed several locked districts at once.
      const boundary = Math.min(...regions.filter((entry) => entry.open).map((entry) => entry.bounds.minZ));
      const z = boundary + REGIONS.pushMargin;
      const car = player.state.inCar;
      if (car) {
        car.state.speed = 0;
        vehicles.setCarPosition(car, car.state.x, z, car.state.heading);
      } else {
        player.state.z = z;
        player.state.speed = 0;
        player.state.moving = false;
        player.syncMesh();
      }
    }
    const warning = state.lastWarning;
    state.hint = warning && isLocked(warning.regionId) && elapsed - warning.at < REGIONS.warningDuration
      ? warning.message : '';
    if (state.hint) hud.setHint(state.hint);
  }

  function reset() {
    elapsed = 0;
    lastAttempt = -Infinity;
    lastWanted = -Infinity;
    lastToast = -Infinity;
    state.lastWarning = null;
    state.hint = '';
    for (const { region, mesh } of barriers) mesh.visible = region.locked;
  }

  return { state, regionAt, isOpen, isLocked, unlockedCount, snapshot, update, reset };
}
