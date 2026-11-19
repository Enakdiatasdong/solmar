// Dress open pockets of the existing blocks and keep the paved frontages walkable.
import * as THREE from '../vendor/three.module.min.js';
import { CITY, PALETTE } from './config.js';
import { footprint, roadConflict } from './roads.js';
import { visitFootprints } from './static-props.js';

const GROUND = 0.26;
const HALF_PITCH = CITY.pitch / 2;
const AWNING_COLORS = [0xcaf0ef, 0xf4ddab, 0xf7cabf, 0xd0cbf0];
const WALL_COLORS = [0xd7a677, 0x79aaa1, 0xda947d, 0xa89aad, 0xe0c7a2, 0x839fb7];
const TRIM_COLORS = [0x52636b, 0x6e6b72, 0x46696b, 0x75574e];
const BUILDING_OFFSETS = [
  [0, 0], [-9, 6], [9, -6], [-9, -9], [9, 9], [-9, 9], [9, -9], [0, 10], [0, -10],
];
const within = (a, b, gap = 0) => a.minX < b.maxX + gap && a.maxX > b.minX - gap
  && a.minZ < b.maxZ + gap && a.maxZ > b.minZ - gap;
const boundsAt = (x, z, width, depth) => footprint({ x, z }, { width, depth });

export function createCityInfill({ city, scene, random, reserved = [] }) {
  const group = new THREE.Group();
  group.name = 'City infill';
  const counts = { buildings: 0, trees: 0, shrubs: 0, benches: 0, streetlights: 0, parkedVehicles: 0 };
  const pedestrianRoutes = [];
  const parks = new Set(CITY.parkBlocks.map(([column, row]) => `${column}:${row}`));
  const occupied = [...city.colliders];
  for (const item of reserved) {
    if (Number.isFinite(item?.minX) && Number.isFinite(item?.maxX)
      && Number.isFinite(item?.minZ) && Number.isFinite(item?.maxZ)) occupied.push(item);
    else if (Number.isFinite(item?.x) && Number.isFinite(item?.z)) {
      const diameter = 2 * (item.radius ?? 8);
      occupied.push(boundsAt(item.x, item.z, diameter, diameter));
    }
  }
  // Use the same actual-mesh footprints as the road audit, including non-solid decorations.
  const propRoots = scene.children.filter((node) => node.name === 'Solmar districts'
    || node.name === 'solmar-landmarks' || ['asset', 'restaurant', 'safehouse'].includes(node.userData.kind));
  for (const root of [city.group, ...propRoots]) {
    visitFootprints(root, (_node, _index, bounds) => occupied.push(bounds));
  }

  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  const cylinderGeometry = new THREE.CylinderGeometry(0.38, 0.5, 1, 6);
  const crownGeometry = new THREE.IcosahedronGeometry(0.5, 1);
  const wheelGeometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 8).rotateZ(Math.PI / 2);
  const paint = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const leaves = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
  const lens = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x986021, emissiveIntensity: 0.42 });
  const templates = {
    solid: [boxGeometry, paint, true], detail: [boxGeometry, paint, false], trunk: [cylinderGeometry, paint, false],
    greenery: [crownGeometry, leaves, true], lamp: [boxGeometry, lens, false], wheel: [wheelGeometry, paint, false],
  };
  const batches = new Map();
  const transform = new THREE.Object3D();
  const tint = new THREE.Color();

  function addPart(kind, x, y, z, width, height, depth, color) {
    // Local batches keep whole neighborhoods outside the camera out of the draw list.
    const sector = `${Math.floor((x - CITY.nodeMin) / (CITY.pitch * 4))}:${Math.floor((z - CITY.nodeMin) / (CITY.pitch * 4))}`;
    const key = `${kind}:${sector}`;
    let batch = batches.get(key);
    if (!batch) {
      batch = { kind, parts: [] };
      batches.set(key, batch);
    }
    batch.parts.push({ x, y: y + GROUND, z, width, height, depth, color });
  }

  function addBuilding(lot, x, z, width, depth) {
    const height = random.range(width > 16 ? 8.4 : 4.2, width > 16 ? 17.5 : 10.8);
    const facade = random.pick(WALL_COLORS);
    const trim = random.pick(TRIM_COLORS);
    const front = z >= lot.z ? 1 : -1;
    const edge = depth * front / 2;
    const awning = random.pick(AWNING_COLORS);
    addPart('solid', x, height / 2, z, width, height, depth, facade);
    addPart('solid', x, height + 0.22, z, width + 0.8, 0.44, depth + 0.8, trim);
    addPart('detail', x, height + 0.75, z, width * 0.38, 0.7, depth * 0.32, facade);
    addPart('detail', x, 2.8, z + edge + front * 0.55, width * 0.86, 0.24, 1.4, awning);
    addPart('detail', x, 1.05, z + edge + front * 0.07, 1.25, 2.1, 0.15, trim);
    for (const side of [-1, 1]) {
      addPart('detail', x + side * width * 0.26, 1.57, z + edge + front * 0.09, width * 0.32, 1.85, 0.17, 0x3b5868);
    }
    for (let y = 4.15; y < height - 0.65; y += 2.75) {
      for (const side of [-1, 1]) {
        addPart('detail', x, y, z + side * (depth / 2 + 0.08), width * 0.88, 0.37, 0.15, trim);
        for (const along of [-0.27, 0, 0.27]) {
          const glass = random.chance(0.24) ? 0xc4ab7c : 0x587686;
          addPart('detail', x + width * along, y + 0.65, z + side * (depth / 2 + 0.09), width * 0.17, 1.05, 0.16, glass);
        }
        addPart('detail', x + side * (width / 2 + 0.09), y + 0.57, z, 0.16, 1.15, depth * 0.61, 0x52717e);
      }
    }
    const body = { ...boundsAt(x, z, width, depth), height: height + GROUND };
    city.buildings.push(body);
    city.colliders.push(body);
    counts.buildings++;
  }

  function addTree(x, z) {
    const height = random.range(2.35, 3.45);
    addPart('trunk', x, height / 2, z, 0.42, height, 0.42, PALETTE.trunk);
    addPart('greenery', x, height + 1.15, z, 3.7, 3.6, 3.7, PALETTE.leaf);
    addPart('greenery', x + 0.64, height + 1.92, z - 0.22, 2.4, 2.9, 2.55, PALETTE.leafLight);
    counts.trees++;
  }

  function addShrub(x, z) {
    addPart('detail', x, 0.21, z, 1.75, 0.42, 1.16, 0xaf9e89);
    addPart('greenery', x - 0.34, 0.73, z, 1.1, 0.96, 1.12, PALETTE.leaf);
    addPart('greenery', x + 0.34, 0.76, z, 1.05, 1, 1.05, PALETTE.leafLight);
    counts.shrubs++;
  }

  function addBench(x, z) {
    for (const side of [-1, 1]) addPart('detail', x + side * 0.92, 0.26, z, 0.18, 0.52, 0.6, 0x56595a);
    addPart('detail', x, 0.55, z, 2.45, 0.13, 0.71, 0x9b6846);
    addPart('detail', x, 0.83, z - 0.31, 2.45, 0.36, 0.12, 0x9b6846);
    counts.benches++;
  }

  function addStreetlight(x, z) {
    addPart('trunk', x, 0.22, z, 0.51, 0.44, 0.51, 0x657578);
    addPart('trunk', x, 2.18, z, 0.16, 4.36, 0.16, 0x59666d);
    addPart('detail', x, 4.27, z, 0.97, 0.15, 0.43, 0x59666d);
    addPart('lamp', x, 4.16, z, 0.74, 0.12, 0.38, PALETTE.lamp);
    counts.streetlights++;
  }

  function addParkedVehicle(x, z) {
    const { body, cabin } = random.pick(PALETTE.cars);
    const front = random.sign();
    addPart('detail', x, 0.012, z, 3.12, 0.022, 5.55, 0x859093);
    for (const side of [-1, 1]) {
      addPart('detail', x + side * 1.5, 0.028, z, 0.07, 0.012, 5.45, 0xe0d7bf);
      for (const offset of [-1.22, 1.22]) addPart('wheel', x + side * 0.95, 0.32, z + offset, 0.28, 0.65, 0.65, 0x22252b);
      addPart('detail', x + side * 0.66, 0.67, z + front * 2.1, 0.43, 0.18, 0.10, 0xeee3bc);
      addPart('detail', x + side * 0.67, 0.67, z - front * 2.1, 0.43, 0.16, 0.10, 0xad4b46);
    }
    addPart('solid', x, 0.61, z, 2.03, 0.54, 4.18, body);
    addPart('detail', x, 1.07, z - front * 0.14, 1.67, 0.49, 2.1, cabin);
    addPart('detail', x, 1.33, z - front * 0.16, 1.56, 0.12, 1.66, body);
    counts.parkedVehicles++;
  }

  // Try the largest useful footprint first, then fit remaining gaps between buildings.
  const lots = [];
  for (let row = 0; row < CITY.grid; row++) {
    for (let column = 0; column < CITY.grid; column++) {
      if (parks.has(`${column}:${row}`)) continue;
      const x = CITY.nodeMin + (column + 0.5) * CITY.pitch;
      const z = CITY.nodeMin + (row + 0.5) * CITY.pitch;
      const bounds = boundsAt(x, z, CITY.pitch, CITY.pitch);
      lots.push({ x, z, row, column, occupied: occupied.filter((other) => within(bounds, other)) });
    }
  }

  function claim(lot, box, gap = 0.5) {
    if (roadConflict(box) || lot.occupied.some((other) => within(box, other, gap))) return false;
    lot.occupied.push(box);
    return true;
  }

  for (const lot of lots) {
    const { x, z, row, column } = lot;
    const offsetX = column < CITY.grid / 2 ? -1 : 1;
    const offsetZ = row < CITY.grid / 2 ? -1 : 1;
    for (let pass = 0; pass < 2; pass++) {
      let placed = false;
      // Favor medium blocks on the first pass and modest corner shops on the second.
      for (const [width, depth] of (pass === 0 ? [[20, 16], [14, 11], [9.5, 8.5]] : [[13, 11], [9.5, 8.5]])) {
        for (const [dx, dz] of BUILDING_OFFSETS) {
          const bx = x + dx * offsetX;
          const bz = z + dz * offsetZ;
          // Leave a deeper setback for existing traffic and pedestrians around the new solid walls.
          if (roadConflict(boundsAt(bx, bz, width + 12, depth + 12))) continue;
          if (!claim(lot, boundsAt(bx, bz, width + 0.9, depth + 2.6), 2.4)) continue;
          addBuilding(lot, bx, bz, width, depth);
          placed = true;
          break;
        }
        if (placed) break;
      }
      if (!placed) break;
    }

    // The existing pavement covers the setbacks. Check the full length with turning room.
    if ((column + row) % 2 === 0 || column === 0 || column === CITY.grid - 1) {
      const frontage = HALF_PITCH - 18.5;
      const sides = [[0, -frontage, 'x'], [-frontage, 0, 'z'], [0, frontage, 'x'], [frontage, 0, 'z']];
      for (const [dx, dz, axis] of random.shuffle(sides)) {
        const length = 16;
        const routeBounds = boundsAt(x + dx, z + dz, axis === 'x' ? length + 1.4 : 1.4, axis === 'z' ? length + 1.4 : 1.4);
        if (!claim(lot, routeBounds, 1.0)) continue;
        pedestrianRoutes.push({ x: x + dx, z: z + dz, axis, length });
        break;
      }
    }

    const propSpots = random.shuffle([
      [-16, -16], [-16, 16], [16, -16], [16, 16], [17, 9], [17, -9], [-17, 9], [-17, -9],
      [9, 17], [9, -17], [-9, 17], [-9, -17], [0, 17], [0, -17], [17, 0], [-17, 0],
    ]);
    function placeProp(width, depth, build) {
      for (const [dx, dz] of propSpots) {
        if (!claim(lot, boundsAt(x + dx, z + dz, width, depth), 0.6)) continue;
        build(x + dx, z + dz);
        return;
      }
    }
    if (random.chance(0.72)) placeProp(3.18, 5.64, addParkedVehicle);
    placeProp(3.8, 3.8, addTree);
    if (random.chance(0.55)) placeProp(3.8, 3.8, addTree);
    placeProp(1.85, 1.25, addShrub);
    if (random.chance(0.68)) placeProp(1.85, 1.25, addShrub);
    if (random.chance(0.58)) placeProp(2.55, 0.86, addBench);
    if (random.chance(0.58)) placeProp(1.05, 0.58, addStreetlight);
  }

  for (const [key, { kind, parts }] of batches) {
    const [geometry, material, castShadow] = templates[kind];
    const mesh = new THREE.InstancedMesh(geometry, material, parts.length);
    mesh.name = `infill:${key}`;
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    parts.forEach(({ x, y, z, width, height, depth, color }, index) => {
      transform.position.set(x, y, z);
      transform.scale.set(width, height, depth);
      transform.updateMatrix();
      mesh.setMatrixAt(index, transform.matrix);
      mesh.setColorAt(index, tint.setHex(color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    group.add(mesh);
  }
  city.group.add(group);
  return { group, counts, pedestrianRoutes };
}
