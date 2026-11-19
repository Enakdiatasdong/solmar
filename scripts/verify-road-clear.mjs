// Run the real generators in Node; canvas drawing is stubbed, geometry is not.
// No renderer, browser, package install or duplicated procedural placement math.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from '../game/vendor/three.module.min.js';
import { createCity } from '../game/src/world.js';
import { createDistricts } from '../game/src/districts.js';
import { createLandmarks } from '../game/src/landmarks.js';
import { createPlaceMarker, nearestPlace } from '../game/src/places.js';
import { RESTAURANTS } from '../game/src/restaurants.js';
import { SAFEHOUSES, createSafehouses } from '../game/src/safehouses.js';
import { ASSETS } from '../game/src/assets.js';
import { createRandom } from '../game/src/random.js';
import { GARAGE_LOCATION, RACES } from '../game/src/config.js';
import { auditRoadClearance } from '../game/src/static-props.js';
import { roadConflict, ROAD_CORRIDORS, placeShape, footprint, relocateFootprint } from '../game/src/roads.js';

const gradient = { addColorStop() {} };
globalThis.document = { createElement: () => ({ width: 0, height: 0,
  getContext: () => new Proxy({}, { get: (_, key) => key === 'createLinearGradient' || key === 'createRadialGradient'
    ? () => gradient : () => {} }),
}) };

assert(roadConflict({ x: 144, z: 103, width: 10.8, depth: 10 }), 'old Sunset Grill must fail');
assert(roadConflict({ x: 300, z: -780, width: 1, depth: 1 }), 'northern track must fail');
assert(roadConflict({ x: -500, z: 84, width: 1, depth: 1 }), 'causeway must fail');
assert(roadConflict({ x: 272, z: 108, width: 1, depth: 1 }), 'freeway shoulder must fail');
assert(!roadConflict({ x: 108, z: 108, width: 10, depth: 10 }), 'block interior must pass');
assert(!roadConflict({ x: 720, z: 144, width: 1, depth: 1 }), 'segments must have finite ends');
for (let x = -360; x <= 360; x += 72) for (let z = -360; z <= 360; z += 72) {
  assert(roadConflict({ x, z, width: 0.5, depth: 0.5 }), 'every intersection must be protected');
}
const groups = [[SAFEHOUSES, 'safehouse'], [RESTAURANTS, 'restaurant'], [ASSETS, 'asset']];
const places = groups.flatMap(([list]) => list);
for (const [list, kind] of groups) for (const place of list) {
  assert(!roadConflict(footprint(place, placeShape(place, kind))), place.id);
  assert.equal(nearestPlace(list, place.x, place.z)?.id, place.id);
}
const garage = SAFEHOUSES.find((place) => place.id === 'garage-flat');
assert.deepEqual([garage.x, garage.z], [GARAGE_LOCATION.x, GARAGE_LOCATION.z]);
assert.deepEqual([RACES.find((race) => race.id === 'harbor-loop').start.x,
  RACES.find((race) => race.id === 'harbor-loop').start.z], [garage.x, garage.z]);

function build(seed) {
  const scene = new THREE.Scene();
  const city = createCity(createRandom(seed), places);
  scene.add(city.group);
  const districts = createDistricts({ scene, city, random: createRandom(seed ^ 0xd157) });
  const landmarks = createLandmarks({ scene, city, districts });
  const roots = [city.group, districts.group, landmarks.group];
  for (const [list, kind] of groups) for (const place of list) roots.push(createPlaceMarker(scene, { ...place }, { ...place, kind }));
  const report = auditRoadClearance(roots);
  assert.equal(report.violations.length, 0, JSON.stringify(report.violations.slice(0, 8)));
  for (const box of city.buildings) assert(!roadConflict(box), 'grid building footprint');
  for (const box of city.colliders) if (!box.roadInfrastructure) assert(!roadConflict(box), 'static collider');
  assert.deepEqual([city.landmarks.garage.x, city.landmarks.garage.z], [garage.x, garage.z]);
  // Save round trip must restore to the relocated ID, not the original coordinate.
  let respawn;
  const safehouses = createSafehouses({ scene, player: { state: { outfit: 'crimson' }, setOutfit() {} },
    onSetRespawn: (point) => { respawn = point; } });
  safehouses.restore({ owned: ['garage-flat'], respawnId: 'garage-flat', outfit: 'crimson' });
  assert.deepEqual([respawn.x, respawn.z], [garage.x, garage.z]);
  // An on-road caller is relocated by the rendering path, not silently dropped.
  const injected = { id: 'regression-marker', x: 144, z: 108, width: 10, depth: 7 };
  const marker = createPlaceMarker(scene, injected, { ...injected, kind: 'restaurant' });
  assert(auditRoadClearance([marker]).ok);
  assert.notEqual(injected.x, 144);
  const signature = createHash('sha256').update(JSON.stringify({ buildings: city.buildings,
    colliders: city.colliders, landmarks: landmarks.list, counts: report.categories })).digest('hex');
  const removed = [city.group, districts.group].flatMap((root) => root.userData.roadClearance.removed);
  console.log(`PASS seed=${seed}: ${city.buildings.length} grid buildings, ${places.length} places, ${landmarks.list.length} landmarks; ${report.checked} rendered footprints; 0 violations (${removed.length} unsafe decorative parts omitted)`);
  if (process.env.ROAD_VERBOSE) console.log(JSON.stringify(removed, null, 2));
  const geometries = new Set(), materials = new Set();
  scene.traverse((node) => { if (node.geometry) geometries.add(node.geometry);
    for (const mat of [node.material].flat()) if (mat) materials.add(mat); });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  return signature;
}
const seeds = process.argv.slice(2).map(Number);
for (const seed of seeds.length ? seeds : [1, 2, 3, 7, 42, 12345, 0, 0xffffffff]) build(seed);
assert.equal(build(1), build(1), 'same seed must reproduce placements');
assert.deepEqual(relocateFootprint({ x: 144, z: 108 }, { width: 10, depth: 10 }),
  relocateFootprint({ x: 144, z: 108 }, { width: 10, depth: 10 }));
console.log(`PASS deterministic rebuild, interaction/respawn IDs, garage references, road-boundary regressions; ${ROAD_CORRIDORS.length} finite road segments protected`);
