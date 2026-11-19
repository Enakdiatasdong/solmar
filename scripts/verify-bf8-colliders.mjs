// Exercise the Node-only production world/infill builders and their collision resolver.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as THREE from '../game/vendor/three.module.min.js';
import { createAssets, ASSETS } from '../game/src/assets.js';
import { createCollectibles } from '../game/src/collectibles.js';
import { createCityInfill } from '../game/src/city-infill.js';
import { createDistricts } from '../game/src/districts.js';
import { createLandmarks } from '../game/src/landmarks.js';
import { createMissions } from '../game/src/missions.js';
import { createRandom } from '../game/src/random.js';
import { RESTAURANTS, createRestaurants } from '../game/src/restaurants.js';
import { SAFEHOUSES, createSafehouses } from '../game/src/safehouses.js';
import { VEHICLE, PLAYER } from '../game/src/config.js';
import { createVehicles } from '../game/src/vehicles.js';
import { createCity, resolveCollisions } from '../game/src/world.js';
import { roadConflict } from '../game/src/roads.js';

const gradient = { addColorStop() {} };
globalThis.document = { createElement: () => ({ width: 0, height: 0,
  getContext: () => new Proxy({}, { get: (_, key) => key === 'createLinearGradient' || key === 'createRadialGradient'
    ? () => gradient : () => {} }),
}) };

const seed = 1;
const random = createRandom(seed);
const scene = new THREE.Scene();
const places = [...ASSETS, ...RESTAURANTS, ...SAFEHOUSES];
const city = createCity(random, places);
scene.add(city.group);
const districts = createDistricts({ scene, city, random: createRandom(seed ^ 0xd157) });
const vehicles = createVehicles(city, scene);
vehicles.spawnStarter();
vehicles.spawnParked(random);
vehicles.spawnExpansionVehicles(random);
const parked = vehicles.cars.map((car) => ({ car, ...car.state }));
const landmarks = createLandmarks({ scene, city, districts });
const missions = createMissions({ scene, city });
const assets = createAssets({ scene });
const restaurants = createRestaurants({ scene });
const safehouses = createSafehouses({ scene });
const collectibles = createCollectibles({ scene, city });

const cityColliderCount = city.colliders.length;
const infill = createCityInfill({
  city,
  scene,
  random: createRandom(seed ^ 0xc171),
  reserved: [
    ...parked.map(({ x, z }) => ({ x, z, radius: 4 })),
    ...landmarks.list.map(({ x, z }) => ({ x, z, radius: 8 })),
    ...collectibles.list.map(({ x, z }) => ({ x, z, radius: 3 })),
    ...missions.list.map(({ start }) => ({ ...start, radius: 8 })),
    ...[...assets.list, ...restaurants.list, ...safehouses.list].map(({ x, z }) => ({ x, z, radius: 6 })),
    { ...city.landmarks.garage, radius: 21 },
  ],
});

assert.deepEqual({
  buildings: infill.counts.buildings,
  trees: infill.counts.trees,
  shrubs: infill.counts.shrubs,
  benches: infill.counts.benches,
  streetlights: infill.counts.streetlights,
  parkedVehicles: infill.counts.parkedVehicles,
}, { buildings: 29, trees: 74, shrubs: 71, benches: 21, streetlights: 20, parkedVehicles: 30 });

const addedColliders = city.colliders.slice(cityColliderCount);
const colliderCounts = {
  trees: 0,
  parkedVehicles: 0,
  shrubs: 0,
  benches: 0,
};
const close = (a, b) => Math.abs(a - b) < 1e-5;
for (const box of addedColliders) {
  assert.equal(roadConflict(box), null, `infill collider intersects road: ${JSON.stringify(box)}`);
  const width = box.maxX - box.minX;
  const depth = box.maxZ - box.minZ;
  if (close(width, 0.84) && close(depth, 0.84)) colliderCounts.trees++;
  else if (close(width, 2.03) && close(depth, 4.18)) colliderCounts.parkedVehicles++;
  else if (close(width, 1) && close(depth, 1)) colliderCounts.shrubs++;
  else if (close(width, 2.45) && close(depth, 0.71)) colliderCounts.benches++;
}
assert.deepEqual(colliderCounts, {
  trees: infill.counts.trees,
  parkedVehicles: infill.counts.parkedVehicles,
  shrubs: infill.counts.shrubs,
  benches: infill.counts.benches,
});

function instances(match) {
  const result = [];
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  for (const mesh of infill.group.children) {
    if (!mesh.isInstancedMesh) continue;
    for (let index = 0; index < mesh.count; index++) {
      mesh.getMatrixAt(index, matrix);
      matrix.decompose(position, quaternion, scale);
      if (match(mesh.name, scale)) result.push({
        x: Number(position.x.toFixed(3)),
        z: Number(position.z.toFixed(3)),
        sx: scale.x,
        sy: scale.y,
        sz: scale.z,
      });
    }
  }
  return result;
}

const generatedTrees = instances((name, scale) => name.startsWith('infill:trunk:')
  && close(scale.x, 0.42) && close(scale.z, 0.42) && scale.y >= 2.35 && scale.y <= 3.45);
const generatedCars = instances((name, scale) => name.startsWith('infill:solid:')
  && close(scale.x, 2.03) && close(scale.y, 0.54) && close(scale.z, 4.18));
assert.equal(generatedTrees.length, infill.counts.trees);
assert.equal(generatedCars.length, infill.counts.parkedVehicles);

function colliderAt(x, z, width, depth) {
  const halfWidth = width / 2;
  const halfDepth = depth / 2;
  const box = city.colliders.find((candidate) => close(candidate.minX, x - halfWidth)
    && close(candidate.maxX, x + halfWidth)
    && close(candidate.minZ, z - halfDepth)
    && close(candidate.maxZ, z + halfDepth));
  assert(box, `missing registered collider at (${x}, ${z})`);
  return box;
}

function boxClearance(x, z, box, radius) {
  const dx = Math.max(box.minX - x, 0, x - box.maxX);
  const dz = Math.max(box.minZ - z, 0, z - box.maxZ);
  return Math.hypot(dx, dz) - radius;
}

function driveToward(label, box, radius, startX, startZ, colliders = city.colliders) {
  let x = startX;
  let z = startZ;
  const initialZ = z;
  const boundary = box.minZ - radius;
  let hit = false;
  for (let step = 0; step < 600 && z < box.maxZ + radius + 2; step++) {
    const resolved = resolveCollisions(colliders, x, Math.min(z + 0.05, box.maxZ + radius + 2), radius);
    hit ||= resolved.hit;
    if (Math.abs(resolved.x - x) < 1e-10 && Math.abs(resolved.z - z) < 1e-10) break;
    x = resolved.x;
    z = resolved.z;
  }
  const clearance = boxClearance(x, z, box, radius);
  assert(hit, `${label} did not hit a collider`);
  assert(clearance >= -1e-5, `${label} overlaps collider by ${-clearance} m`);
  assert(Math.abs(z - boundary) <= 0.01, `${label} stopped at z=${z}, expected boundary ${boundary}`);
  assert(z < box.maxZ, `${label} crossed through the far side of its collider`);
  return { x, z, traveled: z - initialZ, clearance: Math.max(0, clearance) };
}

function report(label, result) {
  console.log(`${label}: end=(${result.x.toFixed(2)}, ${result.z.toFixed(2)}), traveled=${result.traveled.toFixed(2)} m, overlap=${Math.max(0, -result.clearance).toFixed(3)} m`);
}

const treeTarget = colliderAt(-236, -340, 0.84, 0.84);
const carTarget = colliderAt(-324, -235, 2.03, 4.18);
const primary = [
  ['vehicle -> tree', driveToward('vehicle -> tree', treeTarget, VEHICLE.radius, -236, -350)],
  ['vehicle -> parked car', driveToward('vehicle -> parked car', carTarget, VEHICLE.radius, -324, -245)],
  ['pedestrian -> tree', driveToward('pedestrian -> tree', treeTarget, PLAYER.radius, -236, -350)],
  ['pedestrian -> parked car', driveToward('pedestrian -> parked car', carTarget, PLAYER.radius, -324, -245)],
];
for (const [label, result] of primary) report(label, result);

let playtestCandidates = null;
try {
  const candidateFile = fileURLToPath(new URL('../../preview/playtest-pt3-retest-d-results.json', import.meta.url));
  playtestCandidates = JSON.parse(readFileSync(candidateFile, 'utf8')).infillCandidates;
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

const treeSource = playtestCandidates?.trees?.filter((item) => close(item.sx, 0.42) && close(item.sz, 0.42)) ?? generatedTrees;
const carSource = playtestCandidates?.cars ?? generatedCars;
function resolveCandidates(source, generated, target) {
  const generatedByPosition = new Map(generated.map((item) => [`${item.x},${item.z}`, item]));
  const unique = new Map();
  for (const item of source) {
    const key = `${Number(item.x.toFixed(3))},${Number(item.z.toFixed(3))}`;
    const actual = generatedByPosition.get(key);
    if (actual && key !== `${target.x},${target.z}`) unique.set(key, actual);
  }
  return [...unique.values()];
}

const treeSamples = createRandom(seed ^ 0xbf8).shuffle(resolveCandidates(treeSource, generatedTrees, { x: -236, z: -340 })).slice(0, 10);
const carSamples = createRandom(seed ^ 0xbf9).shuffle(resolveCandidates(carSource, generatedCars, { x: -324, z: -235 })).slice(0, 10);
assert.equal(treeSamples.length, 10, 'need 10 other playtest tree candidates that were built');
assert.equal(carSamples.length, 10, 'need 10 other playtest parked-car candidates that were built');

for (const item of treeSamples) {
  const box = colliderAt(item.x, item.z, 0.84, 0.84);
  driveToward(`sample tree vehicle (${item.x},${item.z})`, box, VEHICLE.radius, item.x, item.z - 10, [box]);
  driveToward(`sample tree pedestrian (${item.x},${item.z})`, box, PLAYER.radius, item.x, item.z - 10, [box]);
}
for (const item of carSamples) {
  const box = colliderAt(item.x, item.z, 2.03, 4.18);
  driveToward(`sample car vehicle (${item.x},${item.z})`, box, VEHICLE.radius, item.x, item.z - 10, [box]);
  driveToward(`sample car pedestrian (${item.x},${item.z})`, box, PLAYER.radius, item.x, item.z - 10, [box]);
}

const sourceLabel = playtestCandidates ? 'playtest infillCandidates intersected with built infill' : 'built infill candidates';
console.log(`PASS ${sourceLabel}: 10 other trees and 10 other parked cars each blocked pedestrians and vehicles`);
console.log(`PASS registered infill colliders: ${JSON.stringify(colliderCounts)}; ${addedColliders.length} total including ${infill.counts.buildings} building colliders`);
console.log(`PASS roadConflict: ${addedColliders.length} new infill colliders, 0 violations`);
