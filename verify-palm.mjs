import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as THREE from './game/vendor/three.module.min.js';
import { createCity } from './game/src/world.js';
import { createRandom } from './game/src/random.js';
import { ASSETS } from './game/src/assets.js';
import { RESTAURANTS } from './game/src/restaurants.js';
import { SAFEHOUSES } from './game/src/safehouses.js';

const gradient = { addColorStop() {} };
globalThis.document = { createElement: () => ({ getContext: () => new Proxy({}, {
  get: (_, key) => /^create.*Gradient$/.test(key) ? () => gradient : () => {},
}) }) };
const source = execFileSync('git', ['show', 'c28d8e7:game/src/world.js'], { encoding: 'utf8' })
  .replace(/from '([.][^']+)'/g, (_, specifier) => `from '${new URL(specifier, new URL('./game/src/world.js', import.meta.url))}'`);
const { createCity: createBaseCity } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const places = [...ASSETS, ...RESTAURANTS, ...SAFEHOUSES];
const triangleCount = ({ geometry }) => (geometry.index?.count ?? geometry.attributes.position.count) / 3;
const matrix = new THREE.Matrix4();
const baseMatrix = new THREE.Matrix4();
const point = new THREE.Vector3();
const center = new THREE.Vector3();
const root = new THREE.Vector3();
const crownVertices = [];
const bounds = new THREE.Box3();
const box3 = new THREE.Box3();
const triangle = new THREE.Triangle();
const distanceXZ = (p, b) => Math.hypot(Math.max(0, b.minX - p.x, p.x - b.maxX), Math.max(0, b.minZ - p.z, p.z - b.maxZ));
const digest = (value) => {
  const seen = new WeakSet();
  const text = JSON.stringify(value, (_, item) => {
    if (item && typeof item === 'object') {
      if (seen.has(item)) return '[circular]';
      seen.add(item);
    }
    return item;
  });
  return createHash('sha256').update(text).digest('hex');
};

for (const seed of process.argv.slice(2).map(Number)) {
  const rng = createRandom(seed);
  const baseRng = createRandom(seed);
  const city = createCity(rng, places);
  console.error('built new', seed);
  const base = createBaseCity(baseRng, places);
  console.error('built base', seed);
  assert.equal(rng(), baseRng(), 'RNG stream');
  for (const key of ['spawnPoints', 'buildings']) {
    assert.equal(digest(city[key]), digest(base[key]), key);
  }
  const names = ['trunks', 'fronds', 'ribs', 'coconuts'];
  const palmMeshes = names.map((name) => city.group.getObjectByName('palms:' + name));
  const [trunks, fronds] = palmMeshes;
  const oldTrunks = base.group.getObjectByName('palms:trunks');
  const oldVisiblePositions = [];
  for (let i = 0; i < oldTrunks.count; i++) {
    oldTrunks.getMatrixAt(i, baseMatrix);
    if (baseMatrix.determinant() <= 0) continue;
    oldVisiblePositions.push([baseMatrix.elements[12], baseMatrix.elements[14]]);
  }
  const newPositions = [];
  for (let i = 0; i < trunks.count; i++) {
    trunks.getMatrixAt(i, matrix);
    newPositions.push([matrix.elements[12], matrix.elements[14]]);
  }
  // Colliders: identical to baseline except the trunk colliders of palms the
  // new build hides for clearance (their trunk sat inside a solid, whose own
  // collider still blocks the spot). Any other difference is a layout change.
  const hiddenTrunks = oldVisiblePositions
    .filter(([ox, oz]) => !newPositions.some(([nx, nz]) => nx === ox && nz === oz));
  const countBy = (arr) => {
    const counts = new Map();
    for (const box of arr) {
      const key = JSON.stringify(box);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  };
  const baseColliderCounts = countBy(base.colliders);
  for (const box of city.colliders) {
    const key = JSON.stringify(box);
    assert(baseColliderCounts.get(key) > 0, `new collider not in baseline: ${key}`);
    baseColliderCounts.set(key, baseColliderCounts.get(key) - 1);
  }
  for (const [key, left] of baseColliderCounts) {
    if (left <= 0) continue;
    const box = JSON.parse(key);
    const cx = (box.minX + box.maxX) / 2;
    const cz = (box.minZ + box.maxZ) / 2;
    const width = box.maxX - box.minX;
    const depth = box.maxZ - box.minZ;
    const isHiddenTrunk = hiddenTrunks.some(([hx, hz]) => Math.abs(hx - cx) < 1e-4 && Math.abs(hz - cz) < 1e-4);
    assert(isHiddenTrunk && Math.abs(width - depth) < 1e-9
      && width > 0.4 && width < 1.4 && box.height > 5.9 && box.height < 13.6,
    `baseline collider removed without a hidden palm trunk: ${key} x${left}`);
  }
  const counts = [1, 9, 9, 3];
  assert(palmMeshes.every((mesh, i) => mesh.isInstancedMesh && mesh.count === counts[i] * trunks.count));
  const removed = city.group.userData.roadClearance.removed.filter(({ name }) => name.startsWith('palms:'));
  assert.deepEqual(removed, [], 'road audit removed a palm part');
  const obstacles = [...new Set([...city.buildings, ...city.colliders])].filter((box) =>
    !box.roadInfrastructure && (box.maxX - box.minX > 1.4 || box.maxZ - box.minZ > 1.4));
  // New trunks must be the old visible trunks in order, minus palms the new
  // build hides because their trunk sits inside (or hard against) a solid.
  // Any palm dropped this way must be within pointIsClear range of a collider
  // in the baseline city, otherwise the drop is an unexplained layout change.
  let nextNew = 0;
  for (const [oldX, oldZ] of oldVisiblePositions) {
    if (nextNew < newPositions.length && newPositions[nextNew][0] === oldX && newPositions[nextNew][1] === oldZ) {
      nextNew += 1;
      continue;
    }
    const nearCollider = base.colliders.some((box) => {
      const closestX = Math.max(box.minX, Math.min(box.maxX, oldX));
      const closestZ = Math.max(box.minZ, Math.min(box.maxZ, oldZ));
      return (oldX - closestX) ** 2 + (oldZ - closestZ) ** 2 < 0.75 ** 2;
    });
    assert(nearCollider, `palm at ${oldX},${oldZ} hidden without a nearby collider`);
  }
  assert.equal(nextNew, newPositions.length, 'visible trunks');
  console.error('matched layout', seed);
  let maxRadius = 0, minClearance = Infinity, nearestFacade = Infinity, radialMargin = Infinity;
  let minFrondScale = Infinity;
  for (let palm = 0; palm < trunks.count; palm++) {
    trunks.getMatrixAt(palm, matrix);
    root.setFromMatrixPosition(matrix);
    point.set(0.48, 1, 0.12).applyMatrix4(matrix);
    bounds.makeEmpty();
    let radius = 0;
    for (let part = 1; part < palmMeshes.length; part++) {
      const mesh = palmMeshes[part];
      const vertices = mesh.geometry.attributes.position;
      const indices = mesh.geometry.index;
      for (let offset = 0; offset < counts[part]; offset++) {
        mesh.getMatrixAt(palm * counts[part] + offset, matrix);
        assert(matrix.determinant() > 0, 'zero scale or reversed instance');
        if (mesh === fronds) {
          center.setFromMatrixPosition(matrix);
          assert(point.distanceTo(center) < 0.0001, 'crown separated from trunk');
          minFrondScale = Math.min(minFrondScale, Math.hypot(...matrix.elements.slice(0, 3)));
        }
        const partBounds = new THREE.Box3();
        crownVertices.length = 0;
        for (let v = 0; v < vertices.count; v++) {
          const vertex = new THREE.Vector3().fromBufferAttribute(vertices, v).applyMatrix4(matrix);
          radius = Math.max(radius, Math.hypot(vertex.x - root.x, vertex.z - root.z));
          bounds.expandByPoint(vertex);
          partBounds.expandByPoint(vertex);
          crownVertices.push(vertex);
        }
        for (const box of obstacles) {
          if (box.height < partBounds.min.y) continue;
          const dx = Math.max(0, partBounds.min.x - box.maxX, box.minX - partBounds.max.x);
          const dz = Math.max(0, partBounds.min.z - box.maxZ, box.minZ - partBounds.max.z);
          minClearance = Math.min(minClearance, Math.hypot(dx, dz));
          if (dx || dz) continue;
          box3.min.set(box.minX, 0, box.minZ);
          box3.max.set(box.maxX, box.height, box.maxZ);
          for (let i = 0; i < indices.count; i += 3) {
            triangle.set(...[0, 1, 2].map((offset) => crownVertices[indices.getX(i + offset)]));
            assert(!box3.intersectsTriangle(triangle), `seed ${seed} palm ${palm}: ${mesh.name} triangle inside a collider`);
          }
        }
      }
    }
    const facade = Math.min(...city.buildings.filter((box) => box.height >= bounds.min.y).map((box) => distanceXZ(root, box)));
    nearestFacade = Math.min(nearestFacade, facade);
    radialMargin = Math.min(radialMargin, facade - radius);
    maxRadius = Math.max(maxRadius, radius);
  }
  assert.equal(triangleCount(fronds), 52);
  for (const mesh of [trunks, fronds]) {
    const { index, attributes: { position } } = mesh.geometry;
    let volume = 0;
    for (let i = 0; i < index.count; i += 3) {
      triangle.set(...[0, 1, 2].map((offset) => new THREE.Vector3().fromBufferAttribute(position, index.getX(i + offset))));
      volume += triangle.a.dot(triangle.b.clone().cross(triangle.c)) / 6;
    }
    assert(volume > 0, 'closed surface should have positive signed volume');
  }
  console.log(JSON.stringify({ seed, candidates: oldTrunks.count, visible: trunks.count,
    hiddenForClearance: oldVisiblePositions.length - trunks.count,
    instances: palmMeshes.map((mesh) => mesh.count),
    triangles: palmMeshes.map(triangleCount), maxRadius, minClearance, nearestFacade, radialMargin, minFrondScale,
    colliderIntersections: 0, removed: removed.length, baselineLayoutAndRng: 'match' }));
}
