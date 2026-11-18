import * as THREE from '../vendor/three.module.min.js';
import { CITY, PALETTE } from './config.js';

// Collision remains independent of rendering so every moving actor uses the same boundary.
export function clampToWorld(x, z, radius = 0) {
  return { x: Math.max(-378 + radius, Math.min(378 - radius, x)), z: Math.max(-366 + radius, Math.min(CITY.beachEnd - 6 - radius, z)) };
}
export function isOnSand(x, z) { return z >= CITY.beachStart && Math.abs(x) < 405; }
export function resolveCollisions(colliders, x, z, radius = 0.55) {
  let hit = false;
  for (let pass = 0; pass < 3; pass++) {
    let changed = false;
    for (const box of colliders) {
      const nearX = Math.max(box.minX, Math.min(box.maxX, x));
      const nearZ = Math.max(box.minZ, Math.min(box.maxZ, z));
      const dx = x - nearX, dz = z - nearZ, square = dx * dx + dz * dz;
      if (square >= radius * radius) continue;
      if (square > 0.000001) {
        const distance = Math.sqrt(square), push = (radius - distance + 0.002) / distance;
        x += dx * push; z += dz * push;
      } else {
        const distances = [Math.abs(x - box.minX), Math.abs(box.maxX - x), Math.abs(z - box.minZ), Math.abs(box.maxZ - z)];
        const side = distances.indexOf(Math.min(...distances));
        if (side === 0) x = box.minX - radius - 0.002;
        if (side === 1) x = box.maxX + radius + 0.002;
        if (side === 2) z = box.minZ - radius - 0.002;
        if (side === 3) z = box.maxZ + radius + 0.002;
      }
      hit = true; changed = true;
    }
    if (!changed) break;
  }
  return { x, z, hit };
}

function makeRoadGraph() {
  const nodes = [], edges = [];
  for (let row = 0; row <= CITY.blocks; row++) for (let col = 0; col <= CITY.blocks; col++) {
    nodes.push({ id: nodes.length, x: -CITY.half + col * CITY.pitch, z: -CITY.half + row * CITY.pitch, neighbors: [] });
  }
  for (let row = 0; row <= CITY.blocks; row++) for (let col = 0; col <= CITY.blocks; col++) {
    const a = nodes[row * 11 + col];
    for (const id of [col < 10 ? a.id + 1 : -1, row < 10 ? a.id + 11 : -1]) if (id >= 0) {
      const b = nodes[id]; a.neighbors.push(b.id); b.neighbors.push(a.id); edges.push({ a, b });
    }
  }
  return {
    nodes, edges,
    nearestNode(x, z) {
      if (typeof x === 'object') { z = x.z; x = x.x; }
      let nearest = nodes[0], distance = Infinity;
      for (const node of nodes) { const d = (node.x - x) ** 2 + (node.z - z) ** 2; if (d < distance) { distance = d; nearest = node; } }
      return nearest;
    },
    nearestEdge(x, z) {
      if (typeof x === 'object') { z = x.z; x = x.x; }
      let nearest = null, distance = Infinity;
      for (const edge of edges) {
        const dx = edge.b.x - edge.a.x, dz = edge.b.z - edge.a.z;
        const t = Math.max(0, Math.min(1, ((x - edge.a.x) * dx + (z - edge.a.z) * dz) / (dx * dx + dz * dz)));
        const point = { x: edge.a.x + dx * t, z: edge.a.z + dz * t };
        const d = (point.x - x) ** 2 + (point.z - z) ** 2;
        if (d < distance) { distance = d; nearest = { ...edge, x: point.x, z: point.z, t, distance: Math.sqrt(d) }; }
      }
      return nearest;
    }
  };
}

function windowTexture() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 256;
  const pen = canvas.getContext('2d'); pen.fillStyle = '#fff7e8'; pen.fillRect(0, 0, 128, 256);
  for (let row = 0; row < 8; row++) for (let col = 0; col < 4; col++) {
    pen.fillStyle = (row + col * 3) % 5 === 0 ? '#ffdc8a' : '#274d60';
    pen.fillRect(9 + col * 31, 9 + row * 31, 13, 19);
    pen.fillStyle = '#7799a0'; pen.fillRect(10 + col * 31, 10 + row * 31, 3, 16);
    pen.fillStyle = '#f4eee0'; pen.fillRect(6 + col * 31, 28 + row * 31, 19, 3);
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter; texture.anisotropy = 2;
  return texture;
}
function signTexture(text, background, foreground = '#fff1d2') {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 128;
  const pen = canvas.getContext('2d'); pen.fillStyle = background; pen.fillRect(0, 0, 512, 128);
  pen.strokeStyle = foreground; pen.lineWidth = 4; pen.strokeRect(8, 8, 496, 112);
  pen.fillStyle = foreground; pen.font = 'bold 58px sans-serif'; pen.textAlign = 'center'; pen.textBaseline = 'middle';
  pen.fillText(text, 256, 66, 475);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture;
}

export function createCity(random) {
  const group = new THREE.Group(); group.name = 'Solmar coast';
  const colliders = [], buildings = [], containers = [], parks = [];
  const graph = makeRoadGraph();
  const landmarks = { garage: { x: -8, z: 84 }, hotel: { x: 80, z: 152 }, pier: { x: 300, z: 268 }, harbour: { x: -296, z: 424 }, harbor: { x: -296, z: 424 }, bank: { x: 288, z: -288 }, safehouse: { x: 2, z: 88 }, deliveryGarage: { x: -216, z: 216 } };
  const reserved = [...Object.values(landmarks), { x: -210, z: 208 }, { x: 148, z: -18 }, { x: 108, z: 108 }, { x: 300, z: 336 }, { x: -302, z: 438 }, { x: 300, z: 330 }, { x: 180, z: 360 }, { x: 60, z: 360 }, { x: -60, z: 360 }, { x: -180, z: 360 }, { x: -300, z: 330 }, { x: 108, z: 178 }, { x: -31, z: 104 }, { x: 318, z: -315 }];
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  const batches = new Map();
  const matte = color => new THREE.MeshLambertMaterial({ color });
  const materials = { road: matte(PALETTE.asphalt), curb: matte(PALETTE.sidewalk), gold: matte(0xffd17b), white: matte(0xfaf0cf), roof: matte(0xe8dfcc), dark: matte(0x244755), grass: matte(PALETTE.grass), wood: matte(0x9d6a43), trunk: matte(0x8f6946), leaf: matte(0x32836a), sand: matte(PALETTE.sand), quay: matte(0xafb9ae), red: matte(0xe96151), teal: matte(0x1baaa2), navy: matte(0x2a5770) };
  function instance(geometry, material, x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) {
    const key = `${geometry.uuid}:${Array.isArray(material) ? material.map(m => m.uuid).join(':') : material.uuid}`;
    if (!batches.has(key)) batches.set(key, { geometry, material, transforms: [] });
    const transform = new THREE.Object3D(); transform.position.set(x, y, z); transform.scale.set(sx, sy, sz); transform.rotation.set(rx, ry, rz); transform.updateMatrix();
    batches.get(key).transforms.push(transform.matrix.clone());
  }
  function box(x, y, z, width, height, depth, material, solid = false) {
    instance(boxGeometry, material, x, y, z, width, height, depth);
    if (solid) colliders.push({ minX: x - width / 2, maxX: x + width / 2, minZ: z - depth / 2, maxZ: z + depth / 2 });
  }
  function sign(text, x, y, z, width = 15, background = '#144a57') {
    const map = signTexture(text, background);
    if (!map) return;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(width, width / 4), new THREE.MeshBasicMaterial({ map, side: THREE.DoubleSide }));
    plane.position.set(x, y, z); group.add(plane);
  }
  const trunkGeometry = new THREE.CylinderGeometry(0.3, 0.45, 1, 6);
  const leafGeometry = new THREE.ConeGeometry(1, 1, 4);
  function palm(x, z, height = 9) {
    instance(trunkGeometry, materials.trunk, x, height / 2, z, 1, height, 1, 0, 0, 0.045);
    for (let blade = 0; blade < 6; blade++) {
      const angle = blade * Math.PI / 3;
      instance(leafGeometry, materials.leaf, x + Math.sin(angle) * 2, height - 0.1, z + Math.cos(angle) * 2, 1.1, 5, 0.35, Math.PI / 2 - 0.16, angle, 0);
    }
  }
  const treeGeometry = new THREE.IcosahedronGeometry(1, 0);
  function tree(x, z) {
    instance(trunkGeometry, materials.trunk, x, 1.5, z, 0.6, 3, 0.6);
    instance(treeGeometry, materials.leaf, x, 4.7, z, 3.4, 4.1, 3.4);
  }
  // The sea is one solid colour plane, with lighter strips at the waterline.
  box(0, -0.32, 70, 830, 0.4, 950, materials.sand);
  box(0, -0.26, 5, 752, 0.4, 742, materials.road);
  box(0, -0.5, 1950, 7000, 0.5, 2820, matte(PALETTE.sea));
  box(0, -0.12, 548, 850, 0.1, 12, matte(0x4ab7aa));
  box(0, -0.1, 539, 850, 0.12, 2, matte(0xd6e9ca));
  box(0, 0.07, 384, 752, 0.25, 15, materials.curb);
  for (let i = -5; i <= 5; i++) {
    const axis = i * CITY.pitch;
    box(axis, 0.012, 0, 0.34, 0.025, 725, materials.gold);
    box(0, 0.013, axis, 725, 0.025, 0.34, materials.gold);
    for (let t = -350; t < 360; t += 18) {
      if (Math.abs((t + 360) % 72) < 13) continue;
      box(axis + 7.8, 0.023, t, 0.18, 0.03, 7, materials.white);
      box(t, 0.024, axis - 7.8, 7, 0.03, 0.18, materials.white);
    }
  }
  // Box footprints never occupy a reserved objective approach.
  const facade = windowTexture();
  const facadeMaterials = PALETTE.buildings.map(color => {
    const wall = new THREE.MeshLambertMaterial({ color, map: facade });
    return [wall, wall, materials.roof, materials.roof, wall, wall];
  });
  function obstructs(x, z, width, depth) {
    return reserved.some(point => Math.abs(point.x - x) < width / 2 + 11 && Math.abs(point.z - z) < depth / 2 + 11);
  }
  for (let row = 0; row < 10; row++) for (let col = 0; col < 10; col++) {
    const x = -324 + col * 72, z = -324 + row * 72;
    box(x, 0.16, z, 52, 0.35, 52, materials.curb);
    const park = random.chance(0.13) || (col === 6 && row === 6);
    if (park) {
      parks.push({ x, z, width: 46, depth: 46, col, row });
      box(x, 0.4, z, 46, 0.16, 46, materials.grass);
      box(x, 0.5, z, 4, 0.08, 46, materials.curb); box(x, 0.5, z, 46, 0.08, 4, materials.curb);
      for (const [dx, dz] of [[-14, -14], [14, -14], [-14, 14], [14, 14]]) if (!obstructs(x + dx, z + dz, 3, 3)) tree(x + dx, z + dz);
      continue;
    }
    const tall = random.chance(0.27), divisions = random.chance(0.62) ? 2 : 1;
    for (let ix = 0; ix < divisions; ix++) for (let iz = 0; iz < divisions; iz++) {
      const width = divisions === 1 ? random.range(31, 43) : random.range(17, 21);
      const depth = divisions === 1 ? random.range(29, 43) : random.range(17, 21);
      const bx = x + (divisions === 2 ? (ix - 0.5) * 25 : 0), bz = z + (divisions === 2 ? (iz - 0.5) * 25 : 0);
      if (obstructs(bx, bz, width, depth)) continue;
      const height = random.range(tall ? 28 : 9, tall ? 64 : 27) * (row > 7 ? 0.7 : 1);
      const index = random.int(0, facadeMaterials.length - 1);
      box(bx, height / 2 + 0.35, bz, width, height, depth, facadeMaterials[index], true);
      box(bx, height + 0.62, bz, width + 0.8, 0.7, depth + 0.8, materials.roof);
      if (height > 22) box(bx + width * 0.17, height + 2, bz - depth * 0.16, width * 0.38, 2.4, depth * 0.38, materials.curb);
      if (height < 23 && random.chance(0.6)) box(bx, 3.4, bz + depth / 2 + 0.8, width, 0.5, 2.2, random.chance(0.5) ? materials.teal : materials.red);
      buildings.push({ x: bx, z: bz, width, depth, height, color: PALETTE.buildings[index] });
    }
  }
  // A few readable landmarks give the procedural neighbourhoods an identity.
  box(108, 16, 178, 30, 32, 25, facadeMaterials[2], true); box(108, 33, 178, 33, 2, 27, materials.white);
  sign('HOTEL AZURE', 108, 28, 191, 27, '#1b737e');
  box(-31, 4.8, 104, 25, 9.5, 24, materials.teal, true); box(-31, 9.9, 104, 27, 0.6, 26, materials.gold);
  box(-31, 3.1, 116.2, 17, 5.7, 0.2, materials.dark); sign('MORENO', -31, 8, 116.5, 20, '#174650');
  box(318, 8, -315, 27, 16, 27, materials.white, true); box(318, 17, -315, 30, 2, 30, materials.navy); sign('SOLMAR BANK', 318, 13, -301.2, 25, '#224a5b');
  // Broad coastal promenade and sand route connect every harbour objective.
  for (let x = -350; x <= 350; x += 35) { palm(x, 400, 8 + random.range(0, 3)); if (x % 70 === 0) palm(x + 8, 464, 8.5); }
  for (let x = -330; x <= 330; x += 58) {
    const z = 456 + random.range(-8, 18); if (x < -230) continue;
    const umbrella = new THREE.ConeGeometry(3.9, 1.2, 8);
    instance(umbrella, x % 3 ? materials.red : materials.teal, x, 3.7, z, 1, 1, 1);
    instance(trunkGeometry, materials.white, x, 1.8, z, 0.25, 3.6, 0.25);
    box(x + 4.5, 0.3, z + 1, 1.6, 0.4, 4, materials.white);
  }
  // Lifeguard tower, timber pier, and maritime containers are intentionally sparse colliders.
  for (const dx of [-2.2, 2.2]) for (const dz of [-2.2, 2.2]) box(172 + dx, 2.5, 442 + dz, 0.4, 5, 0.4, materials.wood);
  box(172, 5.6, 442, 6, 2.2, 6, materials.white, true); box(172, 7.3, 442, 8, 1.2, 8, materials.red);
  sign('RESCUE', 172, 6, 445.1, 5.5, '#c94f42');
  box(300, 0.18, 582, 17, 0.65, 140, materials.wood);
  for (let z = 518; z < 651; z += 8) { box(291.7, 1, z, 0.35, 1.7, 0.35, materials.white); box(308.3, 1, z, 0.35, 1.7, 0.35, materials.white); box(300, 0.56, z, 16, 0.05, 0.2, materials.sand); }
  box(291.7, 1.65, 582, 0.3, 0.2, 139, materials.white); box(308.3, 1.65, 582, 0.3, 0.2, 139, materials.white);
  box(-302, -0.01, 457, 120, 0.2, 92, materials.quay);
  for (let i = 0; i < 8; i++) {
    const x = -348 + (i % 4) * 23, z = 466 + Math.floor(i / 4) * 15;
    const material = [materials.teal, materials.red, materials.navy][i % 3];
    box(x, 2.9, z, 18, 5.8, 8, material, true); containers.push({ x, z, width: 18, depth: 8 });
    for (let rib = -7; rib < 9; rib += 2) box(x + rib, 3, z + 4.08, 0.18, 5.4, 0.16, materials.curb);
  }
  sign('PUERTO SOLMAR', -301, 10, 495, 47, '#214c5c');
  sign('PIER 9', 300, 7.2, 526, 13, '#d08c4a');
  // Street furniture is instanced too; the road stays clear for cars.
  for (let row = 0; row <= 10; row += 2) for (let col = 0; col <= 10; col += 2) {
    const x = -348 + col * 72, z = -347 + row * 72;
    if (x > 365 || z > 370) continue;
    box(x, 4.1, z, 0.28, 8.2, 0.28, materials.dark);
    box(x, 8.1, z - 1.4, 0.3, 0.3, 3, materials.dark); box(x, 7.9, z - 2.7, 1.3, 0.15, 1.2, materials.gold);
  }
  for (const batch of batches.values()) {
    const mesh = new THREE.InstancedMesh(batch.geometry, batch.material, batch.transforms.length);
    batch.transforms.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
    mesh.instanceMatrix.needsUpdate = true; mesh.receiveShadow = true; mesh.castShadow = false; group.add(mesh);
  }
  const spawnPoints = { trafficCars: [], sidewalkPedestrians: [], parkedCars: [] };
  for (const edge of graph.edges) {
    const dx = (edge.b.x - edge.a.x) / 72, dz = (edge.b.z - edge.a.z) / 72;
    const x = (edge.a.x + edge.b.x) / 2, z = (edge.a.z + edge.b.z) / 2;
    spawnPoints.trafficCars.push({ x: x - dz * 4.1, z: z + dx * 4.1, heading: Math.atan2(dx, dz), edge });
    for (const sign of [-1, 1]) {
      const parked = { x: x - dz * 7.2 * sign, z: z + dx * 7.2 * sign, heading: Math.atan2(dx * sign, dz * sign) };
      if (!resolveCollisions(colliders, parked.x, parked.z, 2).hit) spawnPoints.parkedCars.push(parked);
      const pedestrian = { x: x - dz * 13 * sign, z: z + dx * 13 * sign, edge, side: sign };
      if (!resolveCollisions(colliders, pedestrian.x, pedestrian.z, 0.7).hit) spawnPoints.sidewalkPedestrians.push(pedestrian);
    }
  }
  return { group, graph, roadNetwork: graph, buildings, containers, colliders, landmarks, blockPitch: CITY.pitch, beach: { start: CITY.beachStart, end: CITY.beachEnd }, groundHeight: 0, spawnPoints, parks };
}
