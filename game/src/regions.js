// Story progress is the single source of truth for district access.
import * as THREE from '../vendor/three.module.min.js';
import { REGIONS } from './config.js';

function contains(rectangle, x, z, includeMax = false) {
  return x >= rectangle.minX && z >= rectangle.minZ
    && (x < rectangle.maxX || (includeMax && x === rectangle.maxX))
    && (z < rectangle.maxZ || (includeMax && z === rectangle.maxZ));
}

function sharedEdge(a, b) {
  if (a.maxX === b.minX || b.maxX === a.minX) {
    const min = Math.max(a.minZ, b.minZ);
    const max = Math.min(a.maxZ, b.maxZ);
    if (max > min) return { x: a.maxX === b.minX ? a.maxX : b.maxX, z: (min + max) / 2, length: max - min, vertical: true };
  }
  if (a.maxZ === b.minZ || b.maxZ === a.minZ) {
    const min = Math.max(a.minX, b.minX);
    const max = Math.min(a.maxX, b.maxX);
    if (max > min) return { x: (min + max) / 2, z: a.maxZ === b.minZ ? a.maxZ : b.maxZ, length: max - min, vertical: false };
  }
  return null;
}

export function createRegions(ctx) {
  const { scene, missions } = ctx;
  let elapsed = 0;
  let lastAttempt = -Infinity;
  let lastWanted = -Infinity;
  let lastToast = -Infinity;
  const regions = REGIONS.list.map((entry) => {
    const rectangles = entry.rectangles.map((rectangle) => ({ ...rectangle }));
    return {
      id: entry.id, name: entry.name, required: entry.required, rectangles,
      // Retain a bounding box for existing map consumers; membership uses rectangles.
      bounds: {
        minX: Math.min(...rectangles.map((rectangle) => rectangle.minX)),
        maxX: Math.max(...rectangles.map((rectangle) => rectangle.maxX)),
        minZ: Math.min(...rectangles.map((rectangle) => rectangle.minZ)),
        maxZ: Math.max(...rectangles.map((rectangle) => rectangle.maxZ)),
      },
      get open() { return missions.completedCount() >= entry.required; },
      get locked() { return !this.open; },
    };
  });
  const rectangles = regions.flatMap((region) => region.rectangles.map((rectangle) => ({ region, rectangle })));
  const barriers = [];
  for (let i = 0; i < rectangles.length; i += 1) {
    for (let j = i + 1; j < rectangles.length; j += 1) {
      const a = rectangles[i];
      const b = rectangles[j];
      if (a.region === b.region) continue;
      const edge = sharedEdge(a.rectangle, b.rectangle);
      if (!edge) continue;
      const lockedRegion = a.region.required > b.region.required ? a.region : b.region;
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(edge.length, REGIONS.barrierHeight),
        new THREE.MeshBasicMaterial({
          color: REGIONS.barrierColor, transparent: true, opacity: REGIONS.barrierOpacity,
          side: THREE.DoubleSide, depthWrite: false,
        }),
      );
      mesh.name = `district-gate-${lockedRegion.id}`;
      mesh.position.set(edge.x, REGIONS.barrierHeight / 2, edge.z);
      if (edge.vertical) mesh.rotation.y = Math.PI / 2;
      scene.add(mesh);
      barriers.push({ a: a.region, b: b.region, mesh });
    }
  }
  const state = { regions, lastWarning: null, hint: '' };

  function refreshBarriers() {
    for (const { a, b, mesh } of barriers) mesh.visible = a.open !== b.open;
  }

  function regionAt(x, z) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
    const match = rectangles.find(({ rectangle }) => contains(rectangle, x, z));
    if (match) return match.region;
    // Include the world's outside edges. At an outer corner shared by two zones,
    // prefer the zone starting there, preserving half-open internal boundaries.
    const outer = rectangles.filter(({ rectangle }) => contains(rectangle, x, z, true))
      .sort((a, b) => b.rectangle.minZ - a.rectangle.minZ || b.rectangle.minX - a.rectangle.minX);
    return outer[0]?.region ?? null;
  }

  function isOpen(id) { return regions.find((region) => region.id === id)?.open ?? false; }
  function isLocked(id) { return regions.find((region) => region.id === id)?.locked ?? false; }
  function unlockedCount() { return regions.filter((region) => region.open).length; }

  function snapshot(x, z) {
    refreshBarriers();
    return { regions, currentRegion: regionAt(x, z), unlockedCount: unlockedCount(), total: regions.length };
  }

  function update(dt, player, vehicles, police, hud) {
    if (Number.isFinite(dt) && dt > 0) elapsed += dt;
    refreshBarriers();
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
      // Project onto the actual union before applying the inset. Insetting every
      // rectangle first could choose a farther edge or move the other axis.
      let nearest = null;
      for (const { region: candidate, rectangle } of rectangles) {
        if (!candidate.open) continue;
        const x = Math.max(rectangle.minX, Math.min(rectangle.maxX, actor.x));
        const z = Math.max(rectangle.minZ, Math.min(rectangle.maxZ, actor.z));
        const distance = (x - actor.x) ** 2 + (z - actor.z) ** 2;
        if (!nearest || distance < nearest.distance) nearest = { x, z, distance, rectangle };
      }
      if (!nearest) return;
      const { rectangle } = nearest;
      const marginX = Math.min(REGIONS.pushMargin, (rectangle.maxX - rectangle.minX) / 2);
      const marginZ = Math.min(REGIONS.pushMargin, (rectangle.maxZ - rectangle.minZ) / 2);
      if (actor.x < rectangle.minX) nearest.x += marginX;
      else if (actor.x > rectangle.maxX) nearest.x -= marginX;
      if (actor.z < rectangle.minZ) nearest.z += marginZ;
      else if (actor.z > rectangle.maxZ) nearest.z -= marginZ;
      // Equality may be an internal seam between open rectangles, so only inset
      // that axis if half-open membership still leaves the projection locked.
      if (!regionAt(nearest.x, nearest.z)?.open) {
        const insetX = actor.x === rectangle.minX ? marginX : actor.x === rectangle.maxX ? -marginX : 0;
        const insetZ = actor.z === rectangle.minZ ? marginZ : actor.z === rectangle.maxZ ? -marginZ : 0;
        let correction = null;
        for (const [dx, dz] of [[insetX, 0], [0, insetZ], [insetX, insetZ]]) {
          const x = nearest.x + dx;
          const z = nearest.z + dz;
          if (!regionAt(x, z)?.open) continue;
          const distance = (x - actor.x) ** 2 + (z - actor.z) ** 2;
          if (!correction || distance < correction.distance) correction = { x, z, distance };
        }
        if (correction) {
          nearest.x = correction.x;
          nearest.z = correction.z;
        }
      }
      const car = player.state.inCar;
      if (car) {
        car.state.speed = 0;
        vehicles.setCarPosition(car, nearest.x, nearest.z, car.state.heading);
        player.state.x = nearest.x;
        player.state.z = nearest.z;
      } else {
        player.state.x = nearest.x;
        player.state.z = nearest.z;
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
    refreshBarriers();
  }

  refreshBarriers();
  return { state, regionAt, isOpen, isLocked, unlockedCount, snapshot, update, reset };
}
