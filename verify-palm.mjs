// The game generators run in Node. Only canvas drawing for textures is stubbed.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as THREE from './game/vendor/three.module.min.js';
import { createCity } from './game/src/world.js';
import { createDistricts } from './game/src/districts.js';
import { createLandmarks } from './game/src/landmarks.js';
import { createRandom } from './game/src/random.js';
import { createVehicles } from './game/src/vehicles.js';
import { createTraffic } from './game/src/traffic.js';
import { createMissions } from './game/src/missions.js';
import { ASSETS, createAssets } from './game/src/assets.js';
import { RESTAURANTS, createRestaurants } from './game/src/restaurants.js';
import { SAFEHOUSES, createSafehouses } from './game/src/safehouses.js';
import { CITY } from './game/src/config.js';
import { auditRoadClearance } from './game/src/static-props.js';
import * as roads from './game/src/roads.js';

const gradient = { addColorStop() {} };
globalThis.document = { createElement: () => ({ getContext: () => new Proxy({}, {
  get: (_, key) => /^create.*Gradient$/.test(key) ? () => gradient : () => {},
}) }) };

const worldUrl = new URL('./game/src/world.js', import.meta.url);
const baselineSource = execFileSync('git', ['show', '7f01d3f:game/src/world.js'], { encoding: 'utf8' })
  .replace(/from '([.][^']+)'/g, (_, specifier) => "from '" + new URL(specifier, worldUrl) + "'");
const { createCity: createBaselineCity } = await import('data:text/javascript;base64,' + Buffer.from(baselineSource).toString('base64'));

const parts = ['trunks', 'fronds', 'ribs', 'coconuts'];
const perPalm = [1, 9, 9, 3];
const areas = ['beach', 'boulevard', 'downtown', 'park'];
const avenues = [216, 288];
const samePosition = (a, b) => Math.abs(a.x - b.x) < 1e-4 && Math.abs(a.z - b.z) < 1e-4;
const isPalmCollider = (box, spots) => spots.some(({ x, z, scale }) => {
  const radius = 0.36 * scale;
  return Math.abs((box.minX + box.maxX) / 2 - x) < 1e-4
    && Math.abs((box.minZ + box.maxZ) / 2 - z) < 1e-4
    && Math.abs(box.maxX - box.minX - radius * 2) < 1e-4
    && Math.abs(box.maxZ - box.minZ - radius * 2) < 1e-4;
});
const places = [...ASSETS, ...RESTAURANTS, ...SAFEHOUSES];
const matrix = new THREE.Matrix4();
const world = new THREE.Matrix4();
const triangle = new THREE.Triangle();
const trunkTip = new THREE.Vector3(0.48, 1, 0.12);
const crown = new THREE.Vector3();
const center = new THREE.Vector3();
const color = new THREE.Color();
const baselineColor = new THREE.Color();
const digest = (value) => {
  const seen = new WeakSet();
  return createHash('sha256').update(JSON.stringify(value, (_, item) => {
    if (item && typeof item === 'object') {
      if (seen.has(item)) return '[circular]';
      seen.add(item);
    }
    return item;
  })).digest('hex');
};

function avenueOf(z) {
  return avenues.find((avenue) => Math.abs(Math.abs(z - avenue) - (CITY.road / 2 + 2.5)) < 0.001);
}

function baselineArea({ x, z }) {
  if (x < CITY.beachWestStart) return 'beach';
  if (avenueOf(z)) return 'boulevard';
  if (CITY.parkBlocks.some(([col, row]) => !(col === 6 && row === 6)
    && Math.abs(CITY.nodeMin + (col + 0.5) * CITY.pitch - x) <= 20.001
    && Math.abs(CITY.nodeMin + (row + 0.5) * CITY.pitch - z) <= 20.001)) return 'park';
  return 'downtown';
}

function baselinePalms(trunks, colliders) {
  return Array.from({ length: trunks.count }, (_, index) => {
    trunks.getMatrixAt(index, matrix);
    assert(matrix.determinant() > 0, 'Fixer H palm should be visible');
    const [, , , , , height, , , , , , , x, , z] = matrix.elements;
    const scale = Math.hypot(...matrix.elements.slice(0, 3));
    const radius = 0.36 * scale;
    const matches = colliders.filter((box) => ['minX', 'maxX', 'minZ', 'maxZ', 'height']
      .every((key, i) => Math.abs(box[key] - [x - radius, x + radius, z - radius, z + radius, height][i]) < 1e-4));
    assert.equal(matches.length, 1, 'Find one Fixer H trunk collider per visible palm');
    return { x, z, scale, area: baselineArea({ x, z }), collider: matches[0] };
  });
}

function build(seed, cityBuilder, finalize) {
  const scene = new THREE.Scene();
  const random = createRandom(seed);
  const city = cityBuilder(random, places);
  scene.add(city.group);
  const districts = createDistricts({ scene, city, random: createRandom(seed ^ 0xd157) });

  // These systems consume RNG or snapshot colliders before landmarks in main.js.
  const vehicles = createVehicles(city, scene);
  vehicles.spawnStarter();
  vehicles.spawnParked(random);
  vehicles.spawnExpansionVehicles(random);
  const traffic = createTraffic(city, scene, createRandom(seed ^ 0x51a7));
  const landmarks = createLandmarks({ scene, city, districts });
  const palmLayout = finalize ? city.finalizePalms() : null;
  const meshes = parts.map((part) => city.group.getObjectByName('palms:' + part));
  assert(meshes.every((mesh) => mesh?.isInstancedMesh), 'All four instanced palm meshes');
  const visible = palmLayout
    ? palmLayout.visible.map(({ spot, trunkCollider, ...record }) => ({
      ...spot, ...record, collider: trunkCollider,
    }))
    : baselinePalms(meshes[0], city.colliders);
  const palmSpots = palmLayout?.candidates ?? visible;
  const placeLists = [createAssets, createRestaurants, createSafehouses].map((createPlaces) => createPlaces({ scene }).list);
  const missionList = createMissions({ scene, city, vehicles }).list;
  const shopGroups = scene.children.filter((node) => ['asset', 'restaurant', 'safehouse'].includes(node.userData.kind));
  if (finalize) {
    const roadAudit = auditRoadClearance([city.group, districts.group, landmarks.group, ...shopGroups]);
    assert.equal(roadAudit.violations.length, 0, JSON.stringify(roadAudit.violations.slice(0, 6)));
  }
  traffic.spawnAll(city.spawnPoints.player.x, city.spawnPoints.player.z);
  const layout = {
    rng: random(),
    spawnPoints: digest(city.spawnPoints),
    buildings: city.buildings,
    containers: city.containers,
    nonPalmColliders: city.colliders.filter((collider) => !isPalmCollider(collider, palmSpots)),
    landmarks: landmarks.list,
    shops: placeLists.map((list) => list.map(({ id, x, z }) => [id, x, z])),
    missions: missionList.map(({ id, start, target }) => ({ id, start, target })),
    parked: vehicles.cars.map(({ id, spec, state: { x, z, heading } }) => [id, spec.variant, x, z, heading]),
    startingTraffic: [...traffic.cars, ...traffic.peds].map(({ x, z, heading }) => [x, z, heading]),
  };
  scene.updateMatrixWorld(true);
  return { city, meshes, visible, palmLayout, layout };
}

function auditTriangles({ city, meshes, visible }) {
  const colliders = [...new Set([...city.colliders, ...city.buildings])];
  const boxes = colliders.map((collider) => ({
    collider,
    bounds: new THREE.Box3(
      new THREE.Vector3(collider.minX, 0, collider.minZ),
      new THREE.Vector3(collider.maxX, Number.isFinite(collider.height) ? collider.height : Number.MAX_SAFE_INTEGER, collider.maxZ),
    ),
  }));
  const partBounds = new THREE.Box3();
  const examples = [];
  return {
    colliders: colliders.length,
    examples,
    triangles: Object.fromEntries(meshes.map((mesh, partIndex) => {
      const part = parts[partIndex];
      const counts = { tested: 0, inCollider: 0 };
      const { index, attributes: { position } } = mesh.geometry;
      const indexCount = index?.count ?? position.count;
      const vertices = Array.from({ length: position.count }, () => new THREE.Vector3());
      assert.equal(mesh.count, visible.length * perPalm[partIndex], 'Instance count of ' + part);
      for (let i = 0; i < mesh.count; i++) {
        const palm = visible[Math.floor(i / perPalm[partIndex])];
        mesh.getMatrixAt(i, matrix);
        assert(matrix.determinant() > 0, part + ' instance must be visible');
        world.multiplyMatrices(mesh.matrixWorld, matrix);
        partBounds.makeEmpty();
        for (let v = 0; v < position.count; v++) {
          partBounds.expandByPoint(vertices[v].fromBufferAttribute(position, v).applyMatrix4(world));
        }
        // Every external collider participates, including poles, infrastructure
        // and other palms. AABB broadphase precedes the triangle/box SAT.
        const nearby = boxes.filter(({ collider, bounds }) => collider !== palm.collider && partBounds.intersectsBox(bounds));
        counts.tested += indexCount / 3;
        for (let t = 0; t < indexCount && nearby.length; t += 3) {
          triangle.set(vertices[index?.getX(t) ?? t], vertices[index?.getX(t + 1) ?? t + 1], vertices[index?.getX(t + 2) ?? t + 2]);
          const hit = nearby.find(({ bounds }) => bounds.intersectsTriangle(triangle));
          if (!hit) continue;
          counts.inCollider++;
          if (examples.length < 8) examples.push({ part, x: palm.x, z: palm.z, triangle: t / 3, collider: hit.collider });
        }
      }
      return [part, counts];
    })),
  };
}

function checkModel(current, baseline) {
  for (let i = 0; i < parts.length; i++) {
    const { material, geometry } = current.meshes[i];
    const { material: oldMaterial, geometry: oldGeometry } = baseline.meshes[i];
    const { uuid: materialId, ...materialJson } = material.toJSON();
    const { uuid: oldMaterialId, ...oldMaterialJson } = oldMaterial.toJSON();
    const { uuid: geometryId, ...geometryJson } = geometry.toJSON();
    const { uuid: oldGeometryId, ...oldGeometryJson } = oldGeometry.toJSON();
    assert.deepEqual(materialJson, oldMaterialJson, parts[i] + ' material matches Fixer H');
    assert.deepEqual(geometryJson, oldGeometryJson, parts[i] + ' geometry matches Fixer H');
  }

  const [trunks, fronds] = current.meshes;
  const oldFronds = baseline.meshes[1];
  let shortenedFronds = 0;
  for (const [i, palm] of current.visible.entries()) {
    trunks.getMatrixAt(i, matrix);
    assert(samePosition(palm, center.setFromMatrixPosition(matrix)), 'Trunk position matches candidate');
    assert(current.city.colliders.includes(palm.collider), 'Visible trunk retains its collider');
    crown.copy(trunkTip).applyMatrix4(matrix);
    const oldIndex = baseline.visible.findIndex((oldPalm) => samePosition(oldPalm, palm));
    for (let leaf = 0; leaf < 9; leaf++) {
      const frondIndex = i * 9 + leaf;
      fronds.getMatrixAt(frondIndex, matrix);
      assert(crown.distanceTo(center.setFromMatrixPosition(matrix)) < 1e-4, 'Crown is attached to the trunk');
      if (Math.hypot(...matrix.elements.slice(0, 3)) < palm.scale - 1e-4) shortenedFronds++;
      if (oldIndex < 0) continue;
      fronds.getColorAt(frondIndex, color);
      oldFronds.getColorAt(oldIndex * 9 + leaf, baselineColor);
      assert(color.equals(baselineColor), 'Existing frond tint matches Fixer H');
    }
  }
  return shortenedFronds;
}

function areaCounts(visible, candidates = visible) {
  return Object.fromEntries(areas.map((area) => [area, {
    visible: visible.filter((palm) => palm.area === area).length,
    candidates: candidates.filter((palm) => palm.area === area).length,
  }]));
}

function causewayCandidates(seed, { visible, palmLayout: { candidates } }) {
  const z84 = candidates.filter((palm) => palm.area === 'beach' && Math.abs(palm.z - 84) < 24);
  const witnesses = [{ x: -408.30411, z: 75.34605 }, { x: -486.76492, z: 71.17408 }];
  const selected = seed === 1 ? witnesses.map((position) => {
    const palm = z84.find((entry) => samePosition(entry, position));
    assert(palm, 'Retain the PT3 causeway candidates');
    return palm;
  }) : z84;
  return selected.map(({ x, z, scale }) => {
    const width = 0.72 * scale;
    return {
      x: +x.toFixed(5), z: +z.toFixed(5),
      visible: visible.some((palm) => samePosition(palm, { x, z })),
      trunkOnRoad: Boolean(roads.roadSurfaceConflict({ x, z, width, depth: width })),
    };
  });
}

const args = process.argv.slice(2);
const baselineOnly = args[0] === '--baseline';
if (baselineOnly) args.shift();
for (const seed of args.length ? args.map(Number) : [1, 2, 7, 42]) {
  assert(Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff, 'Seed must be an unsigned 32-bit integer');
  const baseline = build(seed, createBaselineCity, false);
  const baselineAudit = auditTriangles(baseline);
  const baselineHits = Object.fromEntries(parts.map((part) => [part, baselineAudit.triangles[part].inCollider]));
  if (seed === 1) {
    assert.equal(baseline.visible.length, 42);
    assert.deepEqual(baselineHits, { trunks: 52, fronds: 143, ribs: 72, coconuts: 0 }, 'Reproduce PT3 in the original full scene');
  }
  if (baselineOnly) {
    console.log(JSON.stringify({ seed, baselineVisible: baseline.visible.length, areas: areaCounts(baseline.visible), ...baselineAudit }));
    continue;
  }

  const fixed = build(seed, createCity, true);
  const { visible, palmLayout: { candidates, hiddenForClearance } } = fixed;
  const audit = auditTriangles(fixed);
  const areasByType = areaCounts(visible, candidates);
  const z84 = causewayCandidates(seed, fixed);
  console.log(JSON.stringify({
    seed, candidates: candidates.length, visible: visible.length, hiddenForClearance,
    areas: areasByType, boulevardByAvenue: Object.fromEntries(avenues.map((avenue) => [avenue,
      visible.filter((palm) => palm.area === 'boulevard' && avenueOf(palm.z) === avenue).length])),
    z84, baselineVisible: baseline.visible.length, baselineHits, ...audit,
  }));
  assert(parts.every((part) => !audit.triangles[part].inCollider), 'Visible palm triangles intersect final colliders');
  for (const [key, value] of Object.entries(baseline.layout)) {
    assert.equal(digest(fixed.layout[key]), digest(value), key + ' matches Fixer H');
  }
  const shortenedFronds = checkModel(fixed, baseline);
  for (const palm of visible) {
    assert(!roads.roadSurfaceConflict(palm.collider), 'Visible palm trunk intersects the road surface');
  }
  if (seed === 1) {
    assert(visible.length >= 42);
    assert(areasByType.boulevard.visible > 0 && areasByType.downtown.visible > 0);
    assert(!visible.some((palm) => samePosition(palm, { x: -481.63626, z: -155.06979 })), 'Hide the container-embedded trunk');
    assert(z84.every(({ trunkOnRoad, visible }) => visible === !trunkOnRoad), 'Restore the causeway palms with clear trunk footprints');
  }
  console.log(JSON.stringify({ seed, shortenedFronds, baselineLayoutRngAndModel: 'match', roadClearance: 'pass' }));
}
