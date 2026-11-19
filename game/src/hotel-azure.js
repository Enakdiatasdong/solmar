// Hotel Azure occupies a clear serviced lot near the first-fare pickup.
import * as THREE from '../vendor/three.module.min.js';
import { CITY, HOTEL_LOCATION, PALETTE } from './config.js';
import { ASSETS } from './assets.js';
import { RESTAURANTS } from './restaurants.js';
import { SAFEHOUSES } from './safehouses.js';
import { footprint, placeShape, roadConflict } from './roads.js';

const LOT = { width: 39.8, depth: 41 };
const GROUND = 0.31;
const PREFERRED = { x: HOTEL_LOCATION.x - CITY.pitch / 2, z: HOTEL_LOCATION.z + CITY.pitch / 2 };
const RESERVED = [[ASSETS, 'asset'], [RESTAURANTS, 'restaurant'], [SAFEHOUSES, 'safehouse']]
  .flatMap(([places, kind]) => places.map((place) => ({
    ...footprint(place, placeShape(place, kind)), id: place.id,
  })));

function overlaps(a, b) {
  return a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
}

function findLot(city) {
  const candidates = [];
  // Casa Marea shares the preferred plaza. The south wing and U-shaped drive
  // leave its full marker footprint intact; all hotel solids are checked below.
  const clear = (point, sharedRestaurant = false) => {
    const bounds = footprint(point, LOT);
    return !roadConflict(bounds) && !city.colliders.some((box) => overlaps(bounds, box))
      && !RESERVED.some((box) => !(sharedRestaurant && box.id === 'casa-marea') && overlaps(bounds, box));
  };
  if (clear(PREFERRED, true)) return PREFERRED;

  for (let row = 5; row < CITY.grid; row++) {
    for (let column = 0; column <= 4; column++) {
      if (CITY.parkBlocks.some(([x, z]) => x === column && z === row)) continue;
      candidates.push({
        x: CITY.nodeMin + (column + 0.5) * CITY.pitch,
        z: CITY.nodeMin + (row + 0.5) * CITY.pitch,
      });
    }
  }
  // The strip west of the boardwalk is a fallback when the city lots are occupied.
  for (let x = CITY.beachWestStart - 35; x >= CITY.beachWestEnd + 22; x -= 12) {
    for (let z = 122; z <= 258; z += 8) candidates.push({ x, z });
  }
  const distance = ({ x, z }) => Math.hypot(x - HOTEL_LOCATION.x, z - HOTEL_LOCATION.z);
  candidates.sort((a, b) => distance(a) - distance(b));
  const lot = candidates.find((candidate) => clear(candidate));
  if (!lot) throw new Error('No clear lot for Hotel Azure');
  return lot;
}

function signMaterial(label, foreground, background) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, 512, 96);
  ctx.strokeStyle = foreground;
  ctx.lineWidth = 2;
  ctx.strokeRect(9, 9, 494, 78);
  ctx.fillStyle = foreground;
  ctx.font = 'bold 59px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 256, 51, 462);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({ map, toneMapped: false });
}

function lampGlow() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(32, 32, 1, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255, 196, 110, 0.45)');
  gradient.addColorStop(1, 'rgba(255, 196, 110, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({
    map, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  });
}

export function createHotelAzure(city) {
  const lot = findLot(city);
  const group = new THREE.Group();
  group.name = 'hotel-azure';
  group.position.set(lot.x, 0, lot.z);
  const colliders = [];
  const point = (x, z) => ({ x: lot.x + x, z: lot.z + z });

  function addCollider(kind, x, z, width, depth, height) {
    const bounds = footprint(point(x, z), { width, depth });
    if (roadConflict(bounds) || city.colliders.concat(RESERVED).some((box) => overlaps(bounds, box))
      || colliders.some((box) => overlaps(bounds, box))) {
      throw new Error('Invalid Hotel Azure footprint: ' + kind);
    }
    colliders.push({ ...bounds, height, kind });
  }

  const cube = new THREE.BoxGeometry(1, 1, 1);
  const lambert = (color, options = {}) => new THREE.MeshLambertMaterial({ color, ...options });
  const luminous = (color, intensity) => lambert(color, { emissive: color, emissiveIntensity: intensity });
  const cream = lambert(0xffedcc);
  const azure = lambert(0x378c9c);
  const teal = lambert(0x245c65);
  const gold = luminous(0xffc782, 0.48);
  const glass = lambert(0x294b59);
  const paint = lambert(0xf8dfad);
  const iron = lambert(0x41505a);
  const seat = lambert(0xaf6b46);
  const foliage = lambert(0xffffff, { flatShading: true });
  const pavement = lambert(0xb8a99a);
  const asphalt = lambert(PALETTE.asphalt);

  const transform = new THREE.Object3D();
  const tint = new THREE.Color();
  const batches = [];
  function batch(name, material, { geometry = cube, shadow = true, infrastructure = false } = {}) {
    const instances = [];
    batches.push({ name, material, geometry, shadow, infrastructure, instances });
    return (x, y, z, width, height, depth, yaw = 0, color, pitch = 0) => {
      transform.position.set(x, y, z);
      transform.rotation.set(pitch, yaw, 0, 'YXZ');
      transform.scale.set(width, height, depth);
      transform.updateMatrix();
      instances.push({ matrix: transform.matrix.clone(), color });
    };
  }

  function model(name, geometry, material, x, y, z, shadow = true) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'hotel-azure:' + name;
    mesh.position.set(x, y, z);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }

  function sign(name, label, x, y, z, width, height, color, background) {
    const face = model(name, new THREE.PlaneGeometry(width, height),
      signMaterial(label, color, background), x, y, z, false);
    face.rotation.y = Math.PI;
    face.userData.label = label;
  }

  // Ground-level paving. The arms of the drive meet the north road at its curb.
  const pavers = batch('paving', pavement, { shadow: false });
  pavers(0, GROUND - 0.035, 0, LOT.width, 0.07, LOT.depth);
  const drive = new THREE.Shape();
  const front = 27, left = -19, right = 19;
  drive.moveTo(left, front);
  drive.lineTo(left, -6);
  drive.quadraticCurveTo(left, -11.4, -13.6, -11.4);
  drive.lineTo(13.6, -11.4);
  drive.quadraticCurveTo(right, -11.4, right, -6);
  drive.lineTo(right, front);
  drive.lineTo(13.6, front);
  drive.lineTo(13.6, -4.6);
  drive.quadraticCurveTo(13.6, -6.6, 11.6, -6.6);
  drive.lineTo(-11.6, -6.6);
  drive.quadraticCurveTo(-13.6, -6.6, -13.6, -4.6);
  drive.lineTo(-13.6, front);
  drive.closePath();
  model('driveway-loop', new THREE.ShapeGeometry(drive).rotateX(-Math.PI / 2),
    asphalt, 0, 0.322, 0, false);
  const roadSurface = batch('parking-asphalt', asphalt, { shadow: false });
  roadSurface(0, 0.313, -9.4, 27.2, 0.014, 6.45);
  const stripes = batch('markings', paint, { shadow: false });
  for (let i = 0; i <= 8; i++) stripes((i - 4) * 3.35, 0.329, -9.4, 0.11, 0.011, 6.0);
  stripes(0, 0.329, -12.4, 26.8, 0.011, 0.11);
  stripes(-4.5, 0.33, 10.91, 9.1, 0.012, 0.1);
  for (const x of [-16.3, 16.3]) {
    const direction = x < 0 ? 1 : -1;
    stripes(x, 0.33, -19.1, 0.12, 0.012, 1.8);
    for (const side of [-1, 1]) {
      stripes(x + side * 0.26, 0.33, -19.1 + direction * 0.62, 0.12, 0.012, 0.78, -side * direction * 0.7);
    }
  }
  const joints = batch('paving-joints', lambert(0x9c8b80), { shadow: false });
  for (const z of [-17.5, -14.8]) joints(0, 0.312, z, 27.2, 0.004, 0.045);
  for (let x = -11.5; x <= 12; x += 2.3) joints(x, 0.312, -16.15, 0.045, 0.004, 2.7);

  // Seven storeys, with deep teal trim, warm windows, and a covered lobby.
  const towerX = -4.5, towerZ = 16, facade = 12.5, towerHeight = 21.6;
  addCollider('tower', towerX, towerZ, 22.4, 8.2, 22.55);
  model('tower', new THREE.BoxGeometry(21, towerHeight, 7), azure,
    towerX, GROUND + towerHeight / 2, towerZ);
  const trim = batch('cream-trim', cream);
  const bands = batch('teal-trim', teal);
  const windows = batch('window-glass', glass, { shadow: false });
  const lit = batch('window-glow', luminous(0xffdfac, 0.58), { shadow: false });
  for (let level = 0; level < 6; level++) {
    const y = 6.05 + level * 2.72;
    trim(towerX, y - 1.37, towerZ, 21.68, 0.25, 7.58);
    for (let column = 0; column < 7; column++) {
      const x = towerX + (column - 3) * 2.63;
      for (const side of [-1, 1]) {
        const z = towerZ + side * 3.53;
        windows(x, y, z, 1.77, 1.5, 0.13);
        if ((column * 7 + level * 3 + side + 2) % 5 < 3) {
          const color = (column + level) % 3 ? 0xffc88e : 0xffe1ad;
          lit(x, y, z + side * 0.08, 1.52, 1.27, 0.04, 0, color);
        }
      }
    }
    for (const side of [-1, 1]) {
      for (let column = 0; column < 4; column++) {
        const x = towerX + side * 10.54;
        const z = towerZ + (column - 1.5) * 1.62;
        windows(x, y, z, 1.15, 1.5, 0.13, Math.PI / 2);
        if ((column + level + side + 1) % 3 !== 0) {
          lit(x + side * 0.08, y, z, 0.97, 1.27, 0.04, Math.PI / 2, 0xffca8b);
        }
      }
    }
  }
  for (const x of [towerX - 10.03, towerX + 10.03]) trim(x, 11.08, facade - 0.11, 0.56, 21.54, 0.42);
  trim(towerX, 22.14, towerZ, 22.4, 0.82, 8.2);
  bands(towerX, 21.66, towerZ, 22, 0.36, 7.8);
  bands(towerX, 4.34, facade - 0.11, 17, 0.71, 0.22);
  windows(towerX, 2.32, facade - 0.19, 16.8, 3.48, 0.34);
  const lobby = batch('lobby-and-lamp-glow', gold, { shadow: false });
  for (let column = -3; column <= 3; column++) {
    const x = towerX + column * 2.36;
    lobby(x, 2.26, facade - 0.39, 2.18, 3.13, 0.08);
  }
  trim(towerX, 3.88, 10.81, 14.2, 0.29, 4.55);
  bands(towerX, 3.76, 8.60, 14.36, 0.48, 0.26);
  lobby(towerX, 3.71, 10.79, 10.6, 0.12, 0.24);
  for (const x of [-10.9, 1.9]) {
    trim(x, 2.02, 11.65, 0.43, 3.42, 0.43);
    addCollider('entrance-column', x, 11.65, 0.43, 0.43, 3.74);
  }
  bands(towerX, 9.02, facade - 0.31, 12.65, 2.12, 0.26);
  sign('hotel-sign', 'HOTEL AZURE', towerX, 9.02, facade - 0.449, 12.4, 1.96, '#fff0cc', '#194951');

  const cafeX = 13.75, cafeZ = 17.3;
  addCollider('annex', cafeX, cafeZ, 9.6, 5.2, 4.37);
  model('annex', new THREE.BoxGeometry(8.8, 3.7, 4), cream, cafeX, 2.16, cafeZ);
  const coral = batch('coral-trim', lambert(0xcf6652));
  coral(cafeX, 4.17, cafeZ, 9.6, 0.40, 5.2);
  coral(cafeX, 2.8, 15.25, 8.4, 0.35, 0.56);
  windows(cafeX, 1.75, 15.24, 7.7, 2.45, 0.16);
  for (const x of [11.45, 13.75, 16.05]) lobby(x, 1.79, 15.14, 2.16, 1.83, 0.07);
  sign('cafe-sign', 'BEACH CAFÉ', cafeX, 3.51, 15.28, 6.25, 1.06, '#fff3d4', '#953e37');

  addCollider('valet', 7.65, 2.68, 1.18, 0.64, 2.65);
  bands(7.65, 0.78, 2.68, 1.18, 0.94, 0.64);
  trim(7.65, 1.26, 2.68, 1.18, 0.12, 0.64);
  bands(7.65, 1.87, 2.74, 0.15, 1.3, 0.15);
  sign('taxi-sign', 'TAXI', 7.65, 2.42, 2.46, 1.15, 0.44, '#231d16', '#ffd476');

  // Parked display cars have only static meshes and world collision boxes.
  const body = batch('parked-car-bodies', lambert(0xffffff));
  const cabin = batch('parked-car-cabins', lambert(0xffffff));
  const wheels = batch('parked-car-wheels', lambert(0x22252a), {
    geometry: new THREE.CylinderGeometry(0.34, 0.34, 0.27, 10).rotateZ(Math.PI / 2),
  });
  const carDetails = batch('parked-car-bumpers', iron);
  const brake = batch('parked-car-tail-lenses', lambert(0xae453a), { shadow: false });
  for (let i = 0; i < 8; i++) {
    const x = (i - 3.5) * 3.35, z = -9.4;
    const length = 4.22 + (i % 3) * 0.15;
    const roofHeight = 0.47 + (i % 3) * 0.08;
    const colors = PALETTE.cars[i];
    addCollider('car', x, z, 2.02, length + 0.08, 1.16 + roofHeight);
    body(x, 0.88, z, 1.88, 0.55, length, 0, colors.body);
    cabin(x, 1.16 + roofHeight / 2, z + 0.16, 1.58, roofHeight, length * 0.52, 0, colors.cabin);
    for (const side of [-1, 1]) {
      carDetails(x, 0.69, z + side * length / 2, 1.75, 0.13, 0.08);
      for (const axle of [-1, 1]) wheels(x + side * 0.87, GROUND + 0.34, z + axle * length * 0.32, 1, 1, 1);
      brake(x + side * 0.63, 0.92, z - length / 2, 0.26, 0.16, 0.05);
    }
  }

  const lampSpots = [[-19.35, -18.05, 1], [19.35, -18.05, -1], [-11.5, 4.2, 1], [11.5, 4.2, -1]];
  const poles = batch('lamp-poles', iron, { geometry: new THREE.CylinderGeometry(0.09, 0.18, 1, 7) });
  const arms = batch('lamp-arms', iron);
  const spill = batch('lamp-pavement-glow', lampGlow(), {
    geometry: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), shadow: false,
  });
  for (const [x, z, toward] of lampSpots) {
    addCollider('lamp', x, z, 0.36, 0.36, 6.31);
    poles(x, GROUND + 2.9, z, 1, 5.8, 1);
    arms(x + toward * 0.46, 6.04, z, 1.08, 0.16, 0.14);
    lobby(x + toward * 0.87, 5.97, z, 0.68, 0.19, 0.41);
    spill(x + toward * 1.02, 0.338, z, 7.4, 1, 7.4);
  }

  const palms = [[-19.35, -10, 0.95], [19.35, -10, 1.1], [-19.35, 3.5, 1.14],
    [19.35, 3.5, 0.98], [-19.35, -3.3, 1.2]];
  const trunks = batch('palm-trunks', lambert(PALETTE.trunk), {
    geometry: new THREE.CylinderGeometry(0.2, 0.36, 1, 6).translate(0, 0.5, 0),
  });
  // Only the raised fronds are exempt from the audit, like an overhanging traffic-signal arm.
  // The trunks use their physical diameter and are checked as ordinary solid props.
  const fronds = batch('palm-fronds', foliage, {
    geometry: new THREE.ConeGeometry(0.63, 3.6, 4).translate(0, 1.8, 0),
    infrastructure: true,
  });
  const nearbyLamps = city.lampSpots.concat(lampSpots.map(([x, z]) => point(x, z)));
  for (const [index, [x, z, scale]] of palms.entries()) {
    const trunk = point(x, z);
    if (nearbyLamps.some((lamp) => Math.hypot(lamp.x - trunk.x, lamp.z - trunk.z) < 1.5)) {
      throw new Error('Hotel Azure palm is too close to a lamp pole');
    }
    const height = 7.15 * scale;
    addCollider('palm', x, z, scale * 0.72, scale * 0.72, GROUND + height);
    trunks(x, GROUND, z, scale, height, scale);
    for (let leaf = 0; leaf < 7; leaf++) {
      const yaw = leaf * Math.PI * 2 / 7 + index * 0.78;
      fronds(x, GROUND + height - 0.08, z, scale, 1.14 * scale, 0.36 * scale, yaw,
        leaf % 2 ? PALETTE.leaf : PALETTE.leafLight, 1.03 + (leaf % 3) * 0.24);
    }
  }

  const planter = batch('planter-bases', cream);
  const shrubs = batch('planter-shrubs', foliage, { geometry: new THREE.IcosahedronGeometry(0.54, 0) });
  for (const [x, z] of [[-10.6, -15.5], [10.6, -15.5], [-10.7, -0.5], [10.7, 0]]) {
    addCollider('planter', x, z, 2.4, 1.34, 1.46);
    planter(x, 0.57, z, 2.4, 0.52, 1.34);
    planter(x, 0.82, z, 2.29, 0.12, 1.22);
    for (let i = -1; i <= 1; i++) shrubs(x + i * 0.62, 0.95, z, 0.88, i ? 0.65 : 0.95, 0.95,
      i, i ? PALETTE.leafLight : PALETTE.leaf);
  }
  const benches = batch('bench-seats', seat);
  const legs = batch('bench-legs', iron);
  for (const [x, z, turn] of [[-6.6, -15.8, false], [6.6, -15.8, false], [-10.7, 3.5, false], [8.9, 4, false]]) {
    const yaw = turn ? Math.PI / 2 : 0;
    addCollider('bench', x, z, turn ? 0.92 : 2.38, turn ? 2.38 : 0.92, 1.15);
    benches(x, 0.75, z, 2.36, 0.13, 0.68, yaw);
    benches(x + (turn ? 0.32 : 0), 1.01, z + (turn ? 0 : 0.32), 2.36, 0.28, 0.13, yaw);
    for (const side of [-1, 1]) legs(x + (turn ? 0 : side * 0.82), 0.57,
      z + (turn ? side * 0.82 : 0), 0.16, 0.48, 0.57, yaw);
  }
  const bollards = batch('bollards', iron, { geometry: new THREE.CylinderGeometry(0.12, 0.16, 1, 8) });
  const reflector = batch('bollard-reflectors', paint, {
    geometry: new THREE.CylinderGeometry(0.124, 0.127, 1, 8), shadow: false,
  });
  for (const x of [-13.2, -8.45, -7.4, -1.6, -0.55, 3.8, 6.05]) {
    addCollider('bollard', x, 11.6, 0.32, 0.32, 1.26);
    bollards(x, 0.78, 11.6, 1, 0.94, 1);
    reflector(x, 1.13, 11.6, 1, 0.11, 1);
  }

  for (const { name, material, geometry, shadow, infrastructure, instances } of batches) {
    const mesh = new THREE.InstancedMesh(geometry, material, instances.length);
    mesh.name = 'hotel-azure:' + name;
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    if (infrastructure) mesh.userData.roadInfrastructure = true;
    instances.forEach(({ matrix, color }, i) => {
      mesh.setMatrixAt(i, matrix);
      if (color !== undefined) mesh.setColorAt(i, tint.setHex(color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    group.add(mesh);
  }

  const pedestrianRoutes = [
    [[-8.7, -4.2], [-6.2, -4.2], [-6.2, 3.8], [-8.7, 3.8]],
    [[6.2, -4.8], [8.6, -4.8], [8.6, 0.7], [6.2, 0.7]],
    [[10, 12.7], [17, 12.7], [17, 13.6], [10, 13.6]],
    [[-12.4, -18.9], [-1.8, -18.9], [-1.8, -17.35], [-12.4, -17.35]],
    [[0.4, -17.4], [12.2, -17.4], [12.2, -19.2], [0.4, -19.2]],
  ].map((route) => route.map(([x, z]) => point(x, z)));
  const shot = { ...point(-16.3, -26), yaw: 0.35, pitch: -0.08, distance: 15 };
  return { group, colliders, pedestrianRoutes, shot };
}
