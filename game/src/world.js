import * as THREE from '../vendor/three.module.min.js';
import { CITY, PALETTE } from './config.js';

// The city is constructed from repeated geometry, not downloaded models or images.
export function createCity(random) {
  const group = new THREE.Group();
  group.name = 'Solmar — city, waterfront and harbor';
  const colliders = [], buildings = [], parks = [];
  const buckets = new Map();
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 7);
  const cone = new THREE.ConeGeometry(1, 1, 5);
  const dummy = new THREE.Object3D();
  const colorKey = value => typeof value === 'number' ? value : new THREE.Color(value).getHex();
  function instance(geometry, color, x, y, z, sx, sy, sz, rotation = 0, shadow = true) {
    const key = `${geometry.id}:${colorKey(color)}:${shadow}`;
    if (!buckets.has(key)) buckets.set(key, { geometry, color, shadow, transforms: [] });
    dummy.position.set(x, y, z);
    if (Array.isArray(rotation)) dummy.rotation.set(...rotation); else dummy.rotation.set(0, rotation, 0);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    buckets.get(key).transforms.push(dummy.matrix.clone());
  }
  const box = (color, x, y, z, w, h, d, rotation = 0, shadow = true) => instance(cube, color, x, y, z, w, h, d, rotation, shadow);
  function solid(color, x, y, z, w, h, d, collision = true) {
    box(color, x, y, z, w, h, d);
    if (collision) colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
  }
  function sign(text, x, y, z, width, rotation = 0, background = '#183e45', foreground = '#ffe7bb') {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 128;
    const ink = canvas.getContext('2d');
    ink.fillStyle = background; ink.fillRect(0, 0, 512, 128);
    ink.strokeStyle = foreground; ink.lineWidth = 4; ink.strokeRect(8, 8, 496, 112);
    ink.fillStyle = foreground; ink.font = 'bold 48px sans-serif'; ink.textAlign = 'center'; ink.textBaseline = 'middle';
    ink.fillText(text, 256, 68, 475);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(width, width / 4), new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }));
    panel.position.set(x, y, z); panel.rotation.y = rotation; group.add(panel);
    return panel;
  }
  function palm(x, z, height = 10, rotation = 0) {
    instance(cylinder, 0x8f7760, x, height / 2, z, 0.42, height, 0.42, 0);
    for (let leaf = 0; leaf < 7; leaf++) {
      const angle = rotation + leaf * Math.PI * 2 / 7;
      for (let part = 0; part < 3; part++) {
        const reach = 0.7 + part * 1.45;
        instance(cone, 0x326b56, x + Math.sin(angle) * reach, height + 0.5 - part * 0.43,
          z + Math.cos(angle) * reach, 0.62 - part * 0.13, 2.8, 0.62 - part * 0.13,
          [Math.PI / 2 + part * 0.16, angle, 0]);
      }
    }
    instance(cylinder, 0xdecba9, x, 0.1, z, 1.05, 0.16, 1.05, 0, false);
  }
  function tree(x, z, size = 1) {
    instance(cylinder, 0x8e7457, x, 1.7 * size, z, 0.4 * size, 3.4 * size, 0.4 * size);
    instance(cone, 0x5d8860, x, 4.5 * size, z, 3.2 * size, 6 * size, 3.2 * size, random() * 6);
  }
  function lamp(x, z) {
    instance(cylinder, 0x637178, x, 3.6, z, 0.1, 7.2, 0.1);
    box(0x637178, x, 7.1, z, 0.25, 0.2, 2.3);
    box(0xffefd0, x, 7, z + 0.9, 0.8, 0.15, 1.3, 0, false);
  }
  // A continuous land mass, the beach, and a broad ocean establish a readable coastline.
  box(PALETTE.ocean, 0, -1.3, 0, 4200, 1, 4200, 0, false);
  box(PALETTE.sand, 0, -0.45, 84, 752, 1, 900, 0, false);
  box(PALETTE.sidewalk, 0, -0.025, 0, 744, 0.14, 744, 0, false);
  box(PALETTE.sand, 0, -0.14, 450, 744, 0.2, 168, 0, false);
  box(0x54a7ae, 0, -0.72, 538, 2200, 0.09, 11, 0, false);
  box(0x8ec5c2, 0, -0.66, 533, 750, 0.06, 2, 0, false);
  for (let stripe = 0; stripe < 18; stripe++) {
    box(0x7bb9bb, -650 + stripe * 79, -0.64, 566 + (stripe % 3) * 63, 40 + random() * 45, 0.025, 0.5, 0, false);
  }
  const nodes = [], nodeMap = new Map();
  for (let row = 0; row <= 10; row++) for (let col = 0; col <= 10; col++) {
    const node = { x: -360 + col * 72, z: -360 + row * 72, row, col, neighbours: [] };
    nodes.push(node); nodeMap.set(`${col},${row}`, node);
  }
  for (const node of nodes) for (const [dc, dr] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    const other = nodeMap.get(`${node.col + dc},${node.row + dr}`);
    if (other) node.neighbours.push(other);
  }
  const edges = [];
  for (const a of nodes) for (const b of a.neighbours) if (nodes.indexOf(a) < nodes.indexOf(b)) edges.push({ a, b });
  const graph = {
    nodes, edges,
    nearestNode(x, z) {
      if (typeof x === 'object') { z = x.z; x = x.x; }
      let nearest = nodes[0], best = Infinity;
      for (const node of nodes) { const d = (node.x - x) ** 2 + (node.z - z) ** 2; if (d < best) { best = d; nearest = node; } }
      return nearest;
    },
    nearestEdge(x, z) {
      if (typeof x === 'object') { z = x.z; x = x.x; }
      let found = null, best = Infinity;
      for (const { a, b } of edges) {
        const dx = b.x - a.x, dz = b.z - a.z;
        const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
        const px = a.x + dx * t, pz = a.z + dz * t, distance = Math.hypot(px - x, pz - z);
        if (distance < best) { best = distance; found = { a, b, from: a, to: b, x: px, z: pz, t, distance }; }
      }
      return found;
    }
  };
  for (let i = -360; i <= 360; i += 72) {
    box(PALETTE.road, i, 0.065, 0, 22, 0.06, 744, 0, false);
    box(PALETTE.road, 0, 0.07, i, 744, 0.06, 22, 0, false);
    for (let p = -350; p < 360; p += 9) {
      if (Math.abs(((p + 360) % 72) - 36) < 22) {
        box(0xf3cf77, i - 0.35, 0.108, p, 0.12, 0.015, 4.2, 0, false);
        box(0xf3cf77, i + 0.35, 0.108, p, 0.12, 0.015, 4.2, 0, false);
        box(0xf3cf77, p, 0.112, i - 0.35, 4.2, 0.015, 0.12, 0, false);
        box(0xf3cf77, p, 0.112, i + 0.35, 4.2, 0.015, 0.12, 0, false);
      }
    }
    for (let j = -360; j <= 360; j += 72) {
      if ((i + j) % 144 === 0) for (let s = -8; s <= 8; s += 2.3) {
        box(0xe5e1d3, i + s, 0.117, j + 13.7, 1.1, 0.02, 4.4, 0, false);
        box(0xe5e1d3, i + 13.7, 0.117, j + s, 4.4, 0.02, 1.1, 0, false);
      }
    }
  }
  const parkCells = [[1, 7], [4, 6], [6, 3], [6, 6], [8, 8], [2, 2], [7, 5]];
  function building(x, z, width, depth, height, color, style = 0) {
    solid(color, x, height / 2 + 0.2, z, width, height, depth);
    buildings.push({ x, z, width, depth, height, color });
    box(0xe9dfc5, x, 1.05, z, width + 0.5, 1.6, depth + 0.5);
    box(0xf8e6c8, x, height + 0.45, z, width + 0.7, 0.8, depth + 0.7);
    box(0x647b7c, x + width * 0.16, height + 1.45, z, width * 0.28, 1.5, depth * 0.3);
    const floors = Math.max(2, Math.floor((height - 4) / 3.4));
    const columnsX = Math.max(2, Math.floor((width - 3) / 3.4));
    const columnsZ = Math.max(2, Math.floor((depth - 3) / 3.4));
    for (let row = 0; row < floors; row++) {
      const y = 4.2 + row * 3.4;
      for (let col = 0; col < columnsX; col++) {
        const wx = x - width * 0.5 + (col + 1) * width / (columnsX + 1);
        for (const side of [-1, 1]) box(row % 4 === 0 && style === 2 ? 0xbac9c2 : 0x496a76, wx, y, z + side * (depth * 0.5 + 0.03), 1.45, 1.9, 0.08, 0, false);
      }
      for (let col = 0; col < columnsZ; col++) {
        const wz = z - depth * 0.5 + (col + 1) * depth / (columnsZ + 1);
        for (const side of [-1, 1]) box(0x496a76, x + side * (width * 0.5 + 0.03), y, wz, 0.08, 1.9, 1.45, 0, false);
      }
      if (style === 1 && row % 2 === 0) box(0xf0d5b1, x, y - 1.35, z + depth / 2 + 0.35, width + 0.3, 0.28, 0.75);
    }
    for (let side = -1; side <= 1; side += 2) {
      box(0x285563, x + side * width * 0.24, 1.7, z + depth * 0.5 + 0.06, width * 0.25, 2.4, 0.1, 0, false);
      box(style === 1 ? 0xbd786b : 0x4b8e89, x + side * width * 0.24, 3.1, z + depth * 0.5 + 0.7, width * 0.34, 0.28, 1.5);
    }
  }
  for (let row = 0; row < 10; row++) for (let col = 0; col < 10; col++) {
    const x = -324 + col * 72, z = -324 + row * 72;
    box(0xbebfae, x, 0.15, z, 48, 0.18, 48, 0, false);
    if (parkCells.some(cell => cell[0] === col && cell[1] === row)) {
      parks.push({ x, z, width: 44, depth: 44, col, row });
      box(PALETTE.grass, x, 0.26, z, 45, 0.16, 45, 0, false);
      box(0xe0cfad, x, 0.36, z, 4, 0.06, 45, 0, false);
      box(0xe0cfad, x, 0.36, z, 45, 0.06, 4, 0, false);
      if (!(col === 6 && row === 6)) {
        instance(cylinder, 0xd7d6c2, x, 0.72, z, 4.5, 1, 4.5);
        instance(cylinder, 0x5da6a7, x, 1.25, z, 3.8, 0.08, 3.8, 0, false);
      }
      for (const dx of [-14, 14]) for (const dz of [-14, 14]) tree(x + dx, z + dz, 0.8 + random() * 0.35);
      continue;
    }
    const downtown = Math.max(0, 1 - Math.hypot(x - 90, z + 90) / 330);
    const height = 10 + random() * 14 + downtown * downtown * (28 + random() * 54);
    const color = PALETTE.buildings[Math.floor(random() * PALETTE.buildings.length)];
    if ((row + col) % 3 === 0) {
      building(x - 11.4, z, 19, 37, height, color, 1);
      building(x + 11.4, z, 19, 34, height * (0.7 + random() * 0.4), PALETTE.buildings[(row + col + 2) % 6], 2);
    } else {
      building(x, z, 30 + random() * 8, 30 + random() * 8, height, color, (row + col) % 3);
    }
    if ((col + row) % 2 === 0) for (const dx of [-24.5, 24.5]) tree(x + dx, z + 21, 0.6);
  }
  // Promenade paving, long shadows, and a continuous palm rhythm frame the beach.
  box(0xc6b79a, 0, 0.15, 382, 744, 0.3, 17, 0, false);
  box(0xf0e2c5, 0, 0.33, 390, 744, 0.35, 1.2);
  box(0x89998d, 0, 0.11, 370.8, 744, 0.07, 1.2, 0, false);
  for (let x = -348; x <= 348; x += 24) {
    palm(x, 380, 11 + random() * 2, random() * 3);
    if (x % 48 === 12) lamp(x + 8, 375);
    box(0x8b6c52, x + 6, 0.75, 386, 3.4, 0.35, 0.8);
    box(0x566568, x + 6, 0.36, 386, 0.22, 0.7, 0.7);
  }
  for (let z = -324; z < 360; z += 72) {
    for (const x of [-14, 14]) palm(x, z, 10.5 + random() * 2, random() * 6);
    for (const x of [-158, 158]) lamp(x, z + 19);
  }
  for (let i = 0; i < 30; i++) {
    const x = -340 + i * 23 + random() * 5, z = 424 + (i % 3) * 29;
    if (x < -250 || Math.abs(x - 252) < 18) continue;
    const umbrellaColor = [0xd48170, 0xe8c36d, 0x439a9a, 0xe6dfbe][i % 4];
    instance(cylinder, 0xe9dcc1, x, 1.2, z, 0.065, 2.4, 0.065);
    instance(cone, umbrellaColor, x, 2.5, z, 2.8, 0.75, 2.8, i);
    box(umbrellaColor, x + 3.3, 0.05, z + 1, 1.4, 0.07, 3, i * 0.2, false);
  }
  // Pier 9 is physical walkable land, including its end above the ocean.
  box(0x9c886b, 252, 0.05, 568, 20, 0.4, 164);
  box(0xc6ad86, 252, 0.27, 568, 18, 0.08, 164, 0, false);
  for (let z = 492; z <= 646; z += 7) {
    box(0x756651, 252, 0.33, z, 18, 0.06, 0.12, 0, false);
    for (const x of [242, 262]) {
      box(0xe0c59a, x, 0.85, z, 0.18, 1.6, 0.18);
      box(0xe0c59a, x, 1.45, z + 3.4, 0.13, 0.15, 7);
    }
  }
  building(276, 482, 13, 13, 5.2, 0xcfa18b, 1);
  // The small tower is decorative and never blocks the pier entrance.
  box(0x70a6a2, 220, 2.2, 440, 7, 4, 5);
  box(0xe5cda9, 220, 4.4, 440, 9.5, 0.35, 7);
  for (const x of [217, 223]) for (const z of [438, 442]) box(0x8c7b68, x, 0.8, z, 0.3, 1.6, 0.3);
  sign('PIER 9', 252, 7.2, 471, 14, Math.PI);
  sign('AZURE COAST', 95, 5.5, 376, 19, Math.PI);
  // Harbor's concrete apron and road link stay entirely inside the positive-Z clamp.
  box(0xa9afa7, -305, 0.04, 441, 118, 0.15, 100, 0, false);
  box(PALETTE.road, -288, 0.12, 415, 18, 0.05, 108, 0, false);
  for (let i = 0; i < 10; i++) {
    const x = -348 + (i % 3) * 20, z = 404 + Math.floor(i / 3) * 24;
    const harborClearings = [[-302, 438], [-292, 450], [-312, 449], [-284, 432]];
    if (harborClearings.some(([px, pz]) => Math.hypot(x - px, z - pz) < 15)) continue;
    const h = i % 4 === 0 ? 6 : 3.1;
    solid([0x49888c, 0xa66552, 0xcaad6d][i % 3], x, h / 2 + 0.2, z, 14, h, 6);
    for (let rib = -6; rib <= 6; rib += 2) box(0x335863, x + rib, h / 2 + 0.2, z + 3.05, 0.12, h - 0.1, 0.12, 0, false);
  }
  box(0xd9b465, -347, 17, 472, 1.1, 34, 1.1);
  box(0xd9b465, -325, 33.5, 472, 47, 1.1, 1.1);
  box(0x4c6669, -304, 25, 472, 0.15, 16, 0.15, 0, false);
  box(0x4c6669, -304, 16.5, 472, 2, 1.4, 2);
  sign('SOLMAR PORT', -320, 7.2, 393, 27, Math.PI);
  sign('MORENO / AUTO', -26, 7.4, 84, 18, Math.PI / 2);
  sign('HOTEL AZURE', 107, 10, 169, 22, Math.PI);
  // Distant headlands and sailboats give the horizon depth with very few draw calls.
  for (let i = 0; i < 15; i++) {
    const x = -1300 + i * 180;
    instance(cone, 0x81a5a3, x, 24 + (i % 4) * 8, -710 - (i % 3) * 120, 230, 110 + random() * 100, 130, i, false);
  }
  for (let i = 0; i < 7; i++) {
    const x = -480 + i * 163, z = 660 + (i % 3) * 130;
    box(0xf0e8d5, x, -0.2, z, 8, 1.2, 3, i * 0.6, false);
    instance(cylinder, 0xd8d1c0, x, 6, z, 0.055, 12, 0.055, 0, false);
    const sail = new THREE.Mesh(new THREE.ConeGeometry(4, 9, 3), new THREE.MeshStandardMaterial({ color: 0xf8ead0, side: THREE.DoubleSide }));
    sail.position.set(x + 1.4, 6, z); sail.scale.z = 0.05; group.add(sail);
  }
  for (const { geometry, color, shadow, transforms } of buckets.values()) {
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.86, metalness: 0.04 });
    const mesh = new THREE.InstancedMesh(geometry, material, transforms.length);
    for (let i = 0; i < transforms.length; i++) mesh.setMatrixAt(i, transforms[i]);
    mesh.castShadow = shadow; mesh.receiveShadow = true;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  const trafficCars = [], sidewalkPedestrians = [];
  for (const { a, b } of edges) for (const [from, to] of [[a, b], [b, a]]) {
    const dx = (to.x - from.x) / 72, dz = (to.z - from.z) / 72;
    const x = (from.x + to.x) / 2 - dz * 4.2, z = (from.z + to.z) / 2 + dx * 4.2;
    trafficCars.push({ x, z, heading: Math.atan2(dx, dz), node: from, next: to, from, to });
    sidewalkPedestrians.push({ x: (from.x + to.x) / 2 - dz * 14, z: (from.z + to.z) / 2 + dx * 14, heading: Math.atan2(dx, dz), node: from, next: to });
  }
  const landmarks = {
    safehouse: { x: -8, z: 84 }, garage: { x: -216, z: 216 }, hotel: { x: 80, z: 152 },
    pier: { x: 300, z: 268 }, beach: { x: 300, z: 336 }, harbor: { x: -296, z: 424 },
    bank: { x: 288, z: -288 }, heat: { x: 108, z: 108 }
  };
  return {
    group, colliders, buildings, parks, graph, roadNetwork: graph, landmarks,
    blockPitch: CITY.pitch, nodeMin: CITY.nodeMin, beach: { start: CITY.beachStart, end: CITY.beachEnd },
    spawnPoints: { trafficCars, roadVehicles: trafficCars, vehicles: trafficCars, sidewalkPedestrians, pedestrians: sidewalkPedestrians, player: { x: 2, z: 96 }, starter: { x: 4.6, z: 100, heading: 0 } },
    groundHeight: () => 0
  };
}

// Circle versus axis-aligned city bounds; repeat to resolve tight corners safely.
export function resolveCollisions(colliders, x, z, radius = 0.6) {
  let hit = false;
  for (let pass = 0; pass < 3; pass++) for (const bound of colliders) {
    const nearX = Math.max(bound.minX, Math.min(bound.maxX, x));
    const nearZ = Math.max(bound.minZ, Math.min(bound.maxZ, z));
    const dx = x - nearX, dz = z - nearZ, squared = dx * dx + dz * dz;
    if (squared >= radius * radius) continue;
    hit = true;
    if (squared > 0.000001) {
      const distance = Math.sqrt(squared), push = (radius - distance + 0.001) / distance;
      x += dx * push; z += dz * push;
    } else {
      const choices = [[Math.abs(x - bound.minX), 'x', bound.minX - radius], [Math.abs(bound.maxX - x), 'x', bound.maxX + radius], [Math.abs(z - bound.minZ), 'z', bound.minZ - radius], [Math.abs(bound.maxZ - z), 'z', bound.maxZ + radius]];
      choices.sort((a, b) => a[0] - b[0]);
      if (choices[0][1] === 'x') x = choices[0][2]; else z = choices[0][2];
    }
  }
  return { x, z, hit };
}
export function isOnSand(x, z) {
  return z >= CITY.beachStart && z <= CITY.beachEnd && !(x < -246 && z < 491) && !(Math.abs(x - CITY.pierX) < 11 && z > 485);
}
export function clampToWorld(x, z, margin = 1) {
  x = Math.max(-366 + margin, Math.min(366 - margin, x));
  const onPier = Math.abs(x - CITY.pierX) <= 9 - Math.min(margin, 2) && z >= 495;
  z = Math.max(-366 + margin, Math.min((onPier ? CITY.pierEnd : CITY.beachEnd) - margin, z));
  if (z > CITY.beachEnd - margin) x = Math.max(CITY.pierX - 8, Math.min(CITY.pierX + 8, x));
  return { x, z };
}
