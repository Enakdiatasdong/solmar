// Node-only regression checks for the BF6 streetlight/night-scene changes.
// This runs the production city generator with a canvas stub; it never creates a renderer.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from '../game/vendor/three.module.min.js';
import { CITY, DAYNIGHT } from '../game/src/config.js';
import { createCity } from '../game/src/world.js';
import { createRandom } from '../game/src/random.js';
import { RESTAURANTS } from '../game/src/restaurants.js';
import { SAFEHOUSES } from '../game/src/safehouses.js';
import { ASSETS } from '../game/src/assets.js';
import { roadConflict } from '../game/src/roads.js';

const gradient = { addColorStop() {} };
globalThis.document = {
  createElement: () => ({ width: 0, height: 0,
    getContext: () => new Proxy({}, { get: (_, key) => key === 'createLinearGradient' || key === 'createRadialGradient'
      ? () => gradient : () => {} }),
  }),
};

const places = [...RESTAURANTS, ...SAFEHOUSES, ...ASSETS];
const SUPPLEMENT_COUNT = 7;
const NEAR = (a, b, tolerance = 1e-4) => Math.abs(a - b) <= tolerance;

function build(seed, reserved = places) {
  const city = createCity(createRandom(seed), reserved);
  city.group.updateMatrixWorld(true);
  return city;
}

function findOne(root, name) {
  let match = null;
  root.traverse((node) => { if (node.name === name) match = node; });
  assert(match, `missing scene node ${name}`);
  return match;
}

function lampPositions(mesh) {
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  return Array.from({ length: mesh.count }, (_, index) => {
    mesh.getMatrixAt(index, matrix);
    position.setFromMatrixPosition(matrix);
    return { x: position.x, z: position.z };
  });
}

function pointKey(point) {
  return `${point.x.toFixed(4)},${point.z.toFixed(4)}`;
}

function findSupplement(city, baseline) {
  const metadata = city.group.userData.streetlightSupplements ?? city.group.userData.streetlightSupplement;
  if (Array.isArray(metadata)) return metadata.map((point) => ({ x: point.x, z: point.z }));
  const existing = new Set(baseline.map(pointKey));
  return lampPositions(findOne(city.group, 'streetlights:poles'))
    .filter((point) => !existing.has(pointKey(point)));
}

function smoothstep(value, min, max) {
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
  return t * t * (3 - 2 * t);
}

function hemiAt(minute) {
  const frames = [...DAYNIGHT, { ...DAYNIGHT[0], minute: 1440 }];
  const index = frames.findIndex((frame) => frame.minute > minute);
  const before = frames[index - 1];
  const after = frames[index];
  const amount = smoothstep(minute, before.minute, after.minute);
  return before.hemiIntensity + (after.hemiIntensity - before.hemiIntensity) * amount;
}

function readTowerMaterials(city) {
  const ordinaryTowerMaterials = new Set();
  const downtownTowerMaterials = new Set();
  let ordinaryBuildingCount = 0;
  let ordinaryEmissiveBuildingCount = 0;
  let towerCount = 0;
  city.group.traverse((node) => {
    if (!node.isMesh) return;
    if (node.name === 'building') {
      ordinaryBuildingCount += 1;
      const material = Array.isArray(node.material) ? node.material[0] : node.material;
      if (material?.emissiveMap) ordinaryEmissiveBuildingCount += 1;
    }
    if (node.name !== 'glass-tower') return;
    towerCount += 1;
    const material = Array.isArray(node.material) ? node.material[0] : node.material;
    assert(material?.map, 'tower facade has diffuse map');
    assert(material?.emissiveMap, 'tower facade has emissive map');
    assert(material.emissive, 'tower facade has emissive material');
    if (material.isMeshLambertMaterial) ordinaryTowerMaterials.add(material);
    if (material.isMeshPhongMaterial) downtownTowerMaterials.add(material);
  });
  return { ordinaryBuildingCount, ordinaryEmissiveBuildingCount, towerCount,
    ordinaryTowerMaterials, downtownTowerMaterials };
}

function plainSpawnPoints(spawnPoints) {
  // Spawn lists reference road-graph nodes (neighbors/edge cycles), so only
  // scalar coordinates enter the determinism signature.
  const plain = (value) => {
    if (Array.isArray(value)) return value.map(plain);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value)
        .filter(([, v]) => typeof v !== 'object' || v === null)
        .map(([k, v]) => [k, typeof v === 'number' ? Number(v.toFixed(6)) : v]));
    }
    return value;
  };
  return Object.fromEntries(Object.entries(spawnPoints).map(([k, v]) => [k, plain(v)]));
}

function sceneSignature(city) {
  const poles = findOne(city.group, 'streetlights:poles');
  const heads = findOne(city.group, 'streetlights:heads');
  const pavement = findOne(city.group, 'streetlights:pavement-glow');
  const matrix = new THREE.Matrix4();
  const matrices = [poles, heads, pavement].map((mesh) => {
    const rows = [];
    for (let index = 0; index < mesh.count; index += 1) {
      mesh.getMatrixAt(index, matrix);
      rows.push(Array.from(matrix.elements, (value) => Number(value.toFixed(6))));
    }
    return rows;
  });
  return JSON.stringify({ matrices, buildings: city.buildings, colliders: city.colliders,
    spawnPoints: plainSpawnPoints(city.spawnPoints), towerPositions: city.downtownTowers });
}

const city = build(1);
const baseline = build(1, []);
const poles = findOne(city.group, 'streetlights:poles');
const heads = findOne(city.group, 'streetlights:heads');
const pavement = findOne(city.group, 'streetlights:pavement-glow');
const positions = lampPositions(poles);
const supplement = findSupplement(city, lampPositions(findOne(baseline.group, 'streetlights:poles')));

assert.equal(poles.count, 200, `lamp pole allocation=${poles.count}`);
assert.equal(heads.count, 200, `lamp head allocation=${heads.count}`);
assert.equal(pavement.count, 200, `pavement glow allocation=${pavement.count}`);
assert.equal(supplement.length, SUPPLEMENT_COUNT, `new lamp positions=${supplement.length}`);
for (const [name, mesh] of [['poles', poles], ['heads', heads], ['pavement glow', pavement]]) {
  assert.equal(mesh.count, positions.length, `${name} instances match lamp positions`);
  assert.equal(mesh.userData.roadInfrastructure, true, `${name} marked road infrastructure`);
}
assert.equal(poles.instanceMatrix.count, 200);
assert.equal(heads.instanceMatrix.count, 200);
assert.equal(pavement.instanceMatrix.count, 200);
assert.equal(pavement.geometry.parameters.width, 14);
assert.equal(pavement.geometry.parameters.height, 14);

const halos = [];
city.group.traverse((node) => { if (node.name === 'streetlights:halo') halos.push(node); });
assert.equal(halos.length, 200, `halo count=${halos.length}`);
assert(halos.every((halo) => NEAR(halo.scale.x, 5.2) && NEAR(halo.scale.y, 5.2)),
  'every lamp halo is 5.2 by 5.2');

const lampColliders = city.colliders.filter((collider) => collider.roadInfrastructure === true
  && NEAR(collider.maxX - collider.minX, 0.4) && NEAR(collider.maxZ - collider.minZ, 0.4)
  && NEAR(collider.height, 6.65));
assert.equal(lampColliders.length, 200, `lamp road-infrastructure colliders=${lampColliders.length}`);
// Road-infrastructure boxes use the road-deck margin (roads.js): a lamp passes
// roadConflict when its footprint clears the deck, i.e. no conflict. The 10.4 m
// curb offset clears the 18 m road deck (9 m half-width) on every lamp.
assert(lampColliders.every((collider) => !roadConflict(collider)),
  'every lamp collider clears the road deck (lolos roadConflict)');

const edgeDistances = positions.map(({ x, z }) => city.graph.nearestEdge(x, z).distance);
const minCenterline = Math.min(...edgeDistances);
const maxCenterline = Math.max(...edgeDistances);
assert(minCenterline >= 10.35 && minCenterline <= 11.5, `minimum road centerline distance=${minCenterline}`);
assert(maxCenterline >= minCenterline && maxCenterline <= 11.55,
  `maximum road centerline distance=${maxCenterline}`);
assert(edgeDistances.every((distance) => distance <= 15), 'no lamp is more than 15 m from a road centerline');
const supplementDistances = supplement.map(({ x, z }) => city.graph.nearestEdge(x, z).distance);
assert(supplementDistances.every((distance) => distance >= 10.35 && distance <= 11.55),
  `supplement centerline distances=${JSON.stringify(supplementDistances)}`);

const clockHemi = hemiAt(22 * 60);
assert(clockHemi >= 0.84 && clockHemi <= 0.88, `hemi at 22:00=${clockHemi}`);
city.setNightFactor(0);
const facade = readTowerMaterials(city);
const nonDowntownDay = [...facade.ordinaryTowerMaterials].map((material) => material.emissiveIntensity);
assert(nonDowntownDay.length > 0, 'non-downtown tower facade material exists');
assert(nonDowntownDay.every((intensity) => intensity >= 0 && intensity <= 0.08),
  `daytime non-downtown tower intensity=${JSON.stringify(nonDowntownDay)}`);
city.setNightFactor(1);
const nonDowntownNight = [...facade.ordinaryTowerMaterials].map((material) => material.emissiveIntensity);
assert(nonDowntownNight.every((intensity) => intensity >= 1.24 && intensity <= 1.95),
  `nighttime non-downtown tower intensity=${JSON.stringify(nonDowntownNight)}`);

// The R03 override must actually land on the PT3 ROI tower (-95.96, 106.73):
// its variant is 0, so a variant-gated override would silently never fire.
let roiTowerMaterial = null;
city.group.traverse((node) => {
  if (node.name !== 'glass-tower') return;
  if (Math.abs(node.position.x + 95.96) < 0.1 && Math.abs(node.position.z - 106.73) < 0.1) {
    roiTowerMaterial = [node.material].flat()[0];
  }
});
assert(roiTowerMaterial, 'PT3 ROI tower mesh exists at (-95.96, 106.73)');
assert.equal(roiTowerMaterial.userData.targetFacade, true, 'ROI tower uses the override material');
assert.equal(roiTowerMaterial.userData.towerLitRatio, 0.55, `ROI tower litRatio=${roiTowerMaterial.userData.towerLitRatio}`);
assert.equal(roiTowerMaterial.userData.towerWarmPaneRatio, 0.65, `ROI tower warmPaneRatio=${roiTowerMaterial.userData.towerWarmPaneRatio}`);

// The source expression is the nominal per-tower emissive lit-ratio range; the canvas stub does
// not rasterize, so this checks its formula instead of pretending to measure rendered pixels.
const worldSource = readFileSync(new URL('../game/src/world.js', import.meta.url), 'utf8');
const ratioExpression = worldSource.match(/const emissiveLitRatio\s*=\s*([^;]+);/)?.[1];
assert(ratioExpression, 'tower nominal emissive lit-ratio expression exists');
assert(/0\.35\s*\+\s*stableHash\([^;]+\)\s*\*\s*0\.2/.test(ratioExpression),
  `tower nominal lit-ratio remains 0.35–0.55: ${ratioExpression}`);

// Confirm source-level light pools without importing the browser renderer or starting game systems.
const renderSource = readFileSync(new URL('../game/src/render.js', import.meta.url), 'utf8');
const combatSource = readFileSync(new URL('../game/src/combat.js', import.meta.url), 'utf8');
assert(/Array\.from\(\{\s*length:\s*2\s*\}[\s\S]*?new THREE\.SpotLight/.test(renderSource),
  'renderer retains a two-element pooled SpotLight array');
assert.equal((combatSource.match(/new THREE\.PointLight\(/g) ?? []).length, 1,
  'combat retains one PointLight declaration');
assert(!/new THREE\.(?:PointLight|SpotLight)\(/.test(worldSource),
  'streetlight generation adds no PointLight or SpotLight constructors');

const repeated = build(1);
assert.equal(sceneSignature(city), sceneSignature(repeated), 'seed 1 layout and lamp instance matrices repeat');

console.log(`PASS seed=1: ${poles.count} lamps; supplement=${JSON.stringify(supplement)}; centerline distance ${minCenterline.toFixed(2)}–${maxCenterline.toFixed(2)} m`);
console.log(`PASS lamp coverage: ${halos.length}/200 halos at 5.2 m; ${pavement.count}/200 pavement glows at 14×14; ${lampColliders.length}/200 marked colliders`);
console.log(`PASS night setup: hemi 22:00=${clockHemi.toFixed(4)}; non-downtown tower emissive ${nonDowntownDay[0].toFixed(2)} day / ${nonDowntownNight[0].toFixed(2)} night; nominal tower lit ratio 0.35–0.55; ROI tower litRatio=${roiTowerMaterial.userData.towerLitRatio} warmPaneRatio=${roiTowerMaterial.userData.towerWarmPaneRatio}`);
console.log(`PASS light constraints: one combat PointLight, two pooled renderer SpotLights, no new world light constructors`);
console.log(`PASS deterministic seed-1 layout; tower facade metadata: ${facade.ordinaryEmissiveBuildingCount}/${facade.ordinaryBuildingCount} ordinary facades, ${facade.towerCount} tower meshes (${facade.ordinaryTowerMaterials.size} non-downtown material variants, ${facade.downtownTowerMaterials.size} downtown variants)`);
console.log('ESTIMATE: no pixel luminance simulated; final road-band luminance and the ≥25 target require in-game PT3 measurement.');

for (const root of [city.group, baseline.group, repeated.group]) {
  const geometries = new Set();
  const materials = new Set();
  root.traverse((node) => {
    if (node.geometry) geometries.add(node.geometry);
    for (const material of [node.material].flat()) if (material) materials.add(material);
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
}
