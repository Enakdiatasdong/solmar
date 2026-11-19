// Named places and lightweight navigation beacons for the Solmar map.
import * as THREE from '../vendor/three.module.min.js';
import { relocateFootprint, roadConflict, footprint } from './roads.js';

const LANDMARKS = [
  ['menara-solmar', 'Menara Solmar', 'menara', 0, -36],
  ['alun-alun-kota', 'Alun-alun Kota', 'plaza', 72, 72],
  ['pasar-solmar', 'Pasar Solmar', 'pasar', 36, 144],
  ['stasiun-solmar', 'Stasiun Solmar', 'stasiun', 288, 144],
  ['stadion-teluk', 'Stadion Teluk', 'stadion', 288, -144],
  ['danau-cermin', 'Danau Cermin', 'danau', -420, -720],
  ['mercusuar-pantai', 'Mercusuar Pantai', 'mercusuar', -504, 288],
  ['pelabuhan-solmar', 'Pelabuhan Solmar', 'pelabuhan', -468, -144],
  ['pantai-solmar', 'Pantai Solmar', 'pantai', -468, 72],
  ['peternakan-bukit-hijau', 'Peternakan Bukit Hijau', 'peternakan', 312, -780],
  ['kebun-utara', 'Kebun Utara', 'kebun', -450, -620],
  ['bukit-senja', 'Bukit Senja', 'bukit', 60, -860],
];

const COLORS = { beam: 0xffc857, water: 0x4fb8c6, green: 0x5ca56c, red: 0xd65e55 };

function material(color, options = {}) {
  return new THREE.MeshLambertMaterial({ color, ...options });
}

function addBox(parent, colliders, x, z, width, depth, height, color, y = height / 2, collider = true, worldX = 0, worldZ = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material(color));
  mesh.position.set(x, y, z);
  parent.add(mesh);
  if (collider) colliders.push({ minX: worldX + x - width / 2, maxX: worldX + x + width / 2, minZ: worldZ + z - depth / 2, maxZ: worldZ + z + depth / 2, height: y + height / 2 });
  return mesh;
}

function addLabel(parent, text) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 96;
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = 'rgba(11, 20, 25, 0.82)';
  context.roundRect?.(8, 10, 496, 76, 14);
  if (!context.roundRect) context.fillRect(8, 10, 496, 76);
  context.fill();
  context.font = 'bold 31px sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = '#fff2d6';
  context.fillText(text, canvas.width / 2, canvas.height / 2 + 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(13, 2.45, 1);
  sprite.position.y = 11;
  parent.add(sprite);
}

function addBeacon(parent, landmark) {
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.35, 2.0, 18, 14, 1, true),
    new THREE.MeshBasicMaterial({ color: COLORS.beam, transparent: true, opacity: 0.2, depthWrite: false }),
  );
  beam.position.y = 9;
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(2.45, 0.14, 6, 28),
    new THREE.MeshBasicMaterial({ color: COLORS.beam, transparent: true, opacity: 0.9 }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.35;
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.62, 0), new THREE.MeshBasicMaterial({ color: COLORS.beam }));
  gem.position.y = 2.8;
  parent.add(beam, ring, gem);
  parent.userData.beam = beam;
  parent.userData.ring = ring;
  addLabel(parent, landmark.name);
}

function addStadium(parent, colliders, worldX, worldZ) {
  addBox(parent, colliders, -16, -11, 4, 28, 5, 0x8c9aa5, 2.5, true, worldX, worldZ);
  addBox(parent, colliders, 16, -11, 4, 28, 5, 0x8c9aa5, 2.5, true, worldX, worldZ);
  addBox(parent, colliders, 0, 13, 36, 4, 5, 0x8c9aa5, 2.5, true, worldX, worldZ);
  const field = new THREE.Mesh(new THREE.BoxGeometry(25, 0.12, 19), material(0x4d9a58));
  field.position.set(0, 0.08, 0);
  parent.add(field);
}

function addLake(parent, x, z) {
  const water = new THREE.Mesh(new THREE.CylinderGeometry(26, 26, 0.14, 40), material(COLORS.water, { transparent: true, opacity: 0.88 }));
  water.position.set(x, 0.08, z);
  parent.add(water);
  for (let index = 0; index < 12; index += 1) {
    const angle = (index / 12) * Math.PI * 2;
    const reed = new THREE.Mesh(new THREE.ConeGeometry(0.14, 1.5, 5), material(0x678849));
    reed.position.set(x + Math.cos(angle) * 27, 0.78, z + Math.sin(angle) * 27);
    parent.add(reed);
  }
}

function addLighthouse(parent, colliders, worldX, worldZ) {
  // Offset the mini tower east of its clear beacon/approach point.
  const towerOffset = 9.5;
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 4.4, 14, 18), material(0xf3eee0));
  tower.position.set(towerOffset, 7, 0);
  parent.add(tower);
  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(3.58, 4.48, 2.2, 18), material(COLORS.red));
  stripe.position.set(towerOffset, 7.8, 0);
  parent.add(stripe);
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 1.2, 16), new THREE.MeshBasicMaterial({ color: 0xfff2a7 }));
  lamp.position.set(towerOffset, 14.5, 0);
  parent.add(lamp);
  colliders.push({ minX: worldX + towerOffset - 4.5, maxX: worldX + towerOffset + 4.5, minZ: worldZ - 4.5, maxZ: worldZ + 4.5, height: 15 });
}

function clearPoint(colliders, x, z, shape) {
  const point = relocateFootprint({ x, z }, shape);
  const clear = (candidate) => {
    const bounds = footprint(candidate, shape);
    return !roadConflict(bounds) && !colliders.some((box) => bounds.maxX > box.minX
      && bounds.minX < box.maxX && bounds.maxZ > box.minZ && bounds.minZ < box.maxZ);
  };
  if (clear(point)) return point;
  // Find a nearby clear lot, keeping beacon, geometry and discovery blip together.
  const candidates = [];
  for (let dx = -432; dx <= 432; dx += 72) for (let dz = -432; dz <= 432; dz += 72) {
    const candidate = relocateFootprint({ x: point.x + dx, z: point.z + dz }, shape);
    if (clear(candidate)) candidates.push(candidate);
  }
  candidates.sort((a, b) => (a.x - x) ** 2 + (a.z - z) ** 2 - ((b.x - x) ** 2 + (b.z - z) ** 2));
  if (!candidates.length) throw new Error('No clear lot for landmark');
  return candidates[0];
}

export function createLandmarks({ scene, city, districts, hud }) {
  const group = new THREE.Group();
  group.name = 'solmar-landmarks';
  scene.add(group);
  const markerGroup = new THREE.Group();
  markerGroup.name = 'landmark-markers';
  group.add(markerGroup);
  const state = { visited: [], count: 0, total: LANDMARKS.length };
  const list = [];
  const animatables = [];
  let elapsed = 0;
  const colliders = city.colliders;
  for (const [id, name, type, rawX, rawZ] of LANDMARKS) {
    const shape = type === 'stadion' ? { width: 36, depth: 40, offsetZ: -5 }
      : type === 'danau' ? { width: 56, depth: 56 }
      : type === 'mercusuar' ? { width: 16.5, depth: 9, offsetX: 5.75 }
      : { width: 5.2, depth: 5.2 };
    const point = clearPoint(colliders, rawX, rawZ, shape);
    const landmark = { id, name, type, x: point.x, z: point.z, requestedX: rawX, requestedZ: rawZ };
    const holder = new THREE.Group();
    holder.position.set(point.x, 0, point.z);
    holder.userData.landmark = landmark;
    markerGroup.add(holder);
    addBeacon(holder, landmark);
    if (type === 'stadion') addStadium(holder, colliders, point.x, point.z);
    if (type === 'danau') addLake(holder, 0, 0);
    if (type === 'mercusuar') addLighthouse(holder, colliders, point.x, point.z);
    animatables.push(holder);
    list.push(landmark);
  }

  function nearest(x, z) {
    let best = null;
    for (const landmark of list) {
      const distance = Math.hypot(x - landmark.x, z - landmark.z);
      if (!best || distance < best.distance) best = { landmark, distance };
    }
    return best && best.distance <= 26 ? best : null;
  }

  function getBlips() {
    return list.map((landmark) => ({ x: landmark.x, z: landmark.z, color: state.visited.includes(landmark.id) ? '#49c6b8' : '#ffc857', size: 17 }));
  }

  function update(dt, player) {
    const actor = player?.state?.inCar?.state ?? player?.state;
    if (!actor) return;
    elapsed += dt;
    const pulse = 0.17 + (Math.sin(elapsed * 3) + 1) * 0.07;
    for (const holder of animatables) {
      const beam = holder.userData.beam;
      if (beam) beam.material.opacity = pulse;
      if (holder.userData.ring) holder.userData.ring.rotation.z += dt * 0.45;
    }
    const nearby = nearest(actor.x, actor.z);
    if (!nearby) {
      hud?.setLandmark?.('');
      return;
    }
    hud?.setLandmark?.(nearby.landmark.name);
    if (!state.visited.includes(nearby.landmark.id)) {
      state.visited.push(nearby.landmark.id);
      state.count = state.visited.length;
      hud?.toast?.(`Tempat dikunjungi ${state.count}/${state.total} — ${nearby.landmark.name}`, 'mission', 4);
    }
  }

  return { group, state, list, nearest, getBlips, update };
}
