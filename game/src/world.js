// Procedural Solmar: a 10x10 block street grid with a road graph, varied buildings whose window
// textures are drawn on canvases (no image files), a west beach, south airfield, palms,
// streetlights and props. Exports building/container collision AABBs and the road graph the AI and
// missions navigate by. Everything is generated from the seeded RNG, so a seed rebuilds the city.
import * as THREE from '../vendor/three.module.min.js';
import { CITY, PALETTE, RURAL, SPAWN, STARTER_CAR, SUNSET_MINUTE, SUNSET_NIGHT_FACTOR } from './config.js';
import { createRandom } from './random.js';

const WINDOW_BAY = 2.65;
const FLOOR_HEIGHT = 2.85;
const DECO_PASTELS = [0xe9b6ae, 0xb0d0c1, 0xeed0a7, 0xa9c8d7, 0xd5bbd7];
const CANAL = { startX: -540, endX: -372, z: 0, width: 16 };

function facadeGrid(variant) {
  return {
    columns: variant.tower ? 12 : variant.glass ? 7 : variant.office ? 6 : variant.deco ? 3 : 4,
    rows: variant.tower ? 22 : variant.office ? 10 : variant.glass ? 9 : 7,
  };
}

function stableHash(x, z, salt = 0) {
  const value = Math.sin(x * 127.1 + z * 311.7 + salt * 74.7) * 43758.5453;
  return value - Math.floor(value);
}

/** Each tower gets a coordinate-seeded glass pattern without advancing the shared city RNG. */
function makeTowerFacadeTextures(seed) {
  const canvas = document.createElement('canvas');
  const emissiveCanvas = document.createElement('canvas');
  canvas.width = emissiveCanvas.width = 256;
  canvas.height = emissiveCanvas.height = 512;
  const context = canvas.getContext('2d');
  const emissiveContext = emissiveCanvas.getContext('2d');
  if (!context || !emissiveContext) return { map: null, emissiveMap: null };

  const columns = 12;
  const rows = 22;
  const cellW = canvas.width / columns;
  const cellH = canvas.height / rows;
  const litRatio = 0.07 + stableHash(seed, 17, 1) * 0.23;
  const tintShift = Math.floor(stableHash(seed, 29, 2) * 24);
  context.fillStyle = '#142a40';
  context.fillRect(0, 0, canvas.width, canvas.height);
  emissiveContext.fillStyle = '#000000';
  emissiveContext.fillRect(0, 0, canvas.width, canvas.height);

  // Ground-floor storefront band with broad display glass and pale stone piers.
  const shopTop = Math.floor(canvas.height * 0.89);
  context.fillStyle = '#d4c8b4';
  context.fillRect(0, shopTop - 7, canvas.width, 7);
  context.fillStyle = '#233c4c';
  context.fillRect(4, shopTop + 4, canvas.width - 8, canvas.height - shopTop - 4);
  for (let pane = 0; pane < 4; pane += 1) {
    const x = 8 + pane * (canvas.width / 4);
    context.fillStyle = pane % 2 ? '#36728c' : '#4285a0';
    context.fillRect(x, shopTop + 13, canvas.width / 4 - 12, canvas.height - shopTop - 20);
    emissiveContext.fillStyle = '#3186ad';
    emissiveContext.fillRect(x + 3, shopTop + 16, canvas.width / 4 - 18, canvas.height - shopTop - 27);
    context.fillStyle = '#cfbea5';
    context.fillRect(x - 5, shopTop + 4, 5, canvas.height - shopTop - 4);
  }

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x = column * cellW + 3;
      const y = row * cellH + 3;
      const paneHash = stableHash(seed + column * 0.37, seed * 0.71 + row * 0.23, 3);
      const lit = y < shopTop && paneHash < litRatio;
      if (y >= shopTop) continue;
      if (lit) {
        context.fillStyle = paneHash > litRatio * 0.58 ? '#58acd0' : '#3e8bb6';
        emissiveContext.fillStyle = '#7edbff';
        emissiveContext.fillRect(x + 1, y + 1, cellW - 8, cellH - 8);
      } else {
        const blue = 52 + Math.floor(paneHash * 21) + tintShift;
        context.fillStyle = `rgb(${Math.max(18, blue - 26)},${Math.min(118, blue + 9)},${Math.min(154, blue + 35)})`;
      }
      context.fillRect(x + 1, y + 1, cellW - 8, cellH - 8);
    }
  }
  // Dense, fine mullions make the facade read as a continuous office curtain wall.
  context.fillStyle = '#8cb4c5';
  for (let column = 0; column <= columns; column += 1) context.fillRect(column * cellW, 0, 2, shopTop);
  context.fillStyle = '#547a91';
  for (let row = 0; row <= rows; row += 1) context.fillRect(0, row * cellH, canvas.width, 2);

  const makeTexture = (source) => {
    const texture = new THREE.CanvasTexture(source);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 2;
    return texture;
  };
  return { map: makeTexture(canvas), emissiveMap: makeTexture(emissiveCanvas) };
}

/** Flat walls and window bays; keep warm panes in neighboring groups on each lit floor. */
function makeFacadeTexture(random, variant) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.fillStyle = variant.glass ? '#e9eef1' : '#f1ece2';
  context.fillRect(0, 0, 128, 256);

  const { columns, rows } = facadeGrid(variant);
  const cellW = 128 / columns;
  const cellH = 256 / rows;

  if (variant.deco) {
    context.fillStyle = '#d9d2c5';
    for (let column = 0; column <= columns; column += 1) context.fillRect(column * cellW - 6, 0, 12, 256);
  }
  if (variant.shop) {
    context.fillStyle = '#cfc6b6';
    context.fillRect(0, 208, 128, 48);
    context.fillStyle = '#3c3a36';
    context.fillRect(6, 218, 116, 32);
    context.fillStyle = '#69635a';
    for (let column = 1; column < 4; column += 1) context.fillRect(column * 32, 218, 3, 32);
  }

  const bottomRow = variant.shop ? Math.floor(200 / cellH) : rows;
  const offset = random.int(0, 3);
  // Keep the same number of seeded draws as the old per-window pattern, so city lots and
  // vehicle spawn points stay in place when only the facade artwork changes.
  for (let draw = 1; draw < columns * bottomRow; draw += 1) random();
  for (let row = 0; row < bottomRow; row += 1) {
    const litStart = (offset + Math.floor(row / 4)) % (columns - 1);
    for (let column = 0; column < columns; column += 1) {
      const lit = (row + offset) % 4 === 1 && column >= litStart && column < litStart + 2;
      if (variant.glass) {
        const x = column * cellW + 3;
        const y = row * cellH + 5;
        context.fillStyle = lit ? '#d9bd97' : '#71828c';
        context.fillRect(x, y, cellW - 6, cellH - 8);
      } else {
        const marginX = variant.office ? 5 : 7;
        const x = column * cellW + marginX;
        const y = row * cellH + 8;
        const w = cellW - marginX * 2;
        const h = cellH - 14;
        context.fillStyle = '#687078';
        context.fillRect(x - 1, y - 1, w + 2, h + 2);
        context.fillStyle = lit ? '#ddbe94' : '#54616d';
        context.fillRect(x, y, w, h);
      }
    }
  }
  if (variant.residential) {
    context.fillStyle = 'rgba(60,55,48,0.28)';
    for (let row = 1; row < rows; row += 2) context.fillRect(0, row * cellH, 128, 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 2;
  return texture;
}

/** Shared soft falloff for neon spill and lamp halos; generated once per city, never an image. */
function makeGlowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (!context) return null;
  const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255,255,255,0.9)');
  gradient.addColorStop(0.18, 'rgba(255,255,255,0.48)');
  gradient.addColorStop(0.46, 'rgba(255,255,255,0.14)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeNeonTexture(label, color, caption) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  if (!context) return null;
  const ink = `#${new THREE.Color(color).getHexString()}`;
  context.fillStyle = '#28152f';
  context.fillRect(0, 0, 1024, 256);
  context.strokeStyle = ink;
  context.lineWidth = 7;
  context.shadowColor = ink;
  context.shadowBlur = 22;
  context.strokeRect(18, 18, 988, 220);
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = 'bold 24px sans-serif';
  context.fillStyle = ink;
  context.fillText(caption, 512, 53, 900);
  context.font = '900 112px sans-serif';
  context.fillText(label, 512, 139, 912);
  context.shadowBlur = 4;
  context.fillStyle = '#ffe7f2';
  context.strokeStyle = '#ffe7f2';
  context.lineWidth = 1.2;
  context.strokeText(label, 512, 139, 912);
  context.font = 'bold 21px sans-serif';
  context.fillText('SOLMAR  /  SOUTH SHORE', 512, 213, 900);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 2;
  return texture;
}

function scaleFacadeUVs(geometry, width, height, depth, variant) {
  const uv = geometry.attributes.uv;
  if (!uv) return;
  const { columns, rows } = facadeGrid(variant);
  const sv = Math.max(2, Math.round(height / FLOOR_HEIGHT)) / rows;
  for (const face of [0, 1, 4, 5]) {
    const length = face < 2 ? depth : width;
    const su = Math.max(2, Math.round(length / WINDOW_BAY)) / columns;
    for (let vertex = face * 4; vertex < face * 4 + 4; vertex += 1) {
      uv.setXY(vertex, uv.getX(vertex) * su, uv.getY(vertex) * sv);
    }
  }
  uv.needsUpdate = true;
}

function shade(hex, amount) {
  const color = new THREE.Color(hex);
  color.offsetHSL(0, 0, amount);
  return color;
}

// Repeated waterfront details share geometry and materials, with optional per-instance colors.
function addWaterfrontInstances(parent, name, geometry, color, items) {
  const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshLambertMaterial({ color }), items.length);
  mesh.name = name;
  const transform = new THREE.Object3D();
  items.forEach(({ x, y, z, width, height, depth, yaw = 0, tint }, index) => {
    transform.position.set(x, y, z);
    transform.scale.set(width, height, depth);
    transform.rotation.set(0, yaw, 0);
    transform.updateMatrix();
    mesh.setMatrixAt(index, transform.matrix);
    if (tint) mesh.setColorAt(index, tint);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  parent.add(mesh);
  return mesh;
}

function addBoats(parent, name, boats) {
  const group = new THREE.Group();
  group.name = name;
  parent.add(group);
  const hull = new THREE.Shape();
  hull.moveTo(-0.39, 0.5);
  hull.lineTo(0.39, 0.5);
  hull.lineTo(0.5, 0.19);
  hull.lineTo(0.41, -0.24);
  hull.lineTo(0, -0.5);
  hull.lineTo(-0.41, -0.24);
  hull.lineTo(-0.5, 0.19);
  hull.closePath();
  const hullGeometry = new THREE.ExtrudeGeometry(hull, { depth: 1, bevelEnabled: false });
  hullGeometry.rotateX(-Math.PI / 2).translate(0, -0.5, 0);
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const part = ({ x, y = 0, z, width, length, yaw }, offset, rise, w, h, d) => ({
    x: x + Math.sin(yaw) * offset * length,
    y: y + rise * width,
    z: z + Math.cos(yaw) * offset * length,
    width: w * width, height: h * width, depth: d * length, yaw,
  });
  addWaterfrontInstances(group, 'hulls', hullGeometry, 0xf1e8d9,
    boats.map((boat) => part(boat, 0, 0.09, 1, 0.32, 1)));
  addWaterfrontInstances(group, 'waterline', hullGeometry, 0x245d72,
    boats.map((boat) => part(boat, 0, 0.025, 1.005, 0.055, 1.005)));
  addWaterfrontInstances(group, 'cabins', cube, 0xfbf3e7,
    boats.map((boat) => part(boat, -0.03, 0.37, 0.66, 0.27, 0.49)));
  addWaterfrontInstances(group, 'cabin glazing', cube, 0x3b5964,
    boats.map((boat) => part(boat, -0.03, 0.4, 0.668, 0.13, 0.494)));
  addWaterfrontInstances(group, 'masts', cube, 0xe0d7c9,
    boats.map((boat) => part(boat, 0.06, 0.78, 0.035, 1.05, 0.013)));
  addWaterfrontInstances(group, 'burgees', cube, 0xd96668,
    boats.map((boat) => part(boat, 0.035, 1.26, 0.028, 0.095, 0.052)));
}

function addCauseway(parent, colliders) {
  const causeway = new THREE.Group();
  causeway.name = 'West Shore Causeway';
  parent.add(causeway);
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const z = 84;
  const width = 18;
  const breaks = [-648, -600, -552, -504, -456, -408, -360];
  const height = [0.4, 1.1, 1.6, 1.8, 1.6, 1.1, 0.4];
  const pillars = [];
  const railPosts = [];
  const deckMaterial = new THREE.MeshLambertMaterial({ color: 0x8c8586 });
  const railMaterial = new THREE.MeshLambertMaterial({ color: 0xd8c3b3 });
  for (let span = 0; span < breaks.length - 1; span += 1) {
    const run = breaks[span + 1] - breaks[span];
    const rise = height[span + 1] - height[span];
    const length = Math.hypot(run, rise);
    const pitch = Math.atan2(rise, run);
    const center = breaks[span] + run / 2;
    const y = height[span] + rise / 2;
    const deck = new THREE.Mesh(cube, deckMaterial);
      deck.position.set(center, y, z);
      deck.scale.set(length + 0.3, 1.05, width);
    deck.rotation.z = pitch;
    causeway.add(deck);
    for (const side of [-1, 1]) {
      const railZ = z + side * (width / 2 - 0.55);
      const rail = new THREE.Mesh(cube, railMaterial);
      rail.position.set(center, y + 1.85, railZ);
      rail.scale.set(length + 0.2, 0.27, 0.3);
      rail.rotation.z = pitch;
      causeway.add(rail);
      for (let step = 0; step < 8; step += 1) {
        const fraction = step / 8;
        railPosts.push({ x: breaks[span] + run * fraction, y: height[span] + rise * fraction + 1.05,
          z: railZ, width: 0.33, height: 1.28, depth: 0.39 });
      }
    }
  }
  breaks.forEach((x, index) => {
    const h = height[index];
    for (const side of [-1, 1]) {
      const supportZ = z + side * 4.6;
      pillars.push({ x, y: (h - 4) / 2, z: supportZ, width: 3.6, height: h + 4, depth: 3.25 });
      colliders.push({ minX: x - 1.8, maxX: x + 1.8, minZ: supportZ - 1.625,
        maxZ: supportZ + 1.625, height: h });
    }
  });
  addWaterfrontInstances(causeway, 'piers', cube, 0x9c8a82, pillars);
  addWaterfrontInstances(causeway, 'guardrail posts', cube, 0xd8c3b3, railPosts);
  const island = new THREE.CylinderGeometry(0.78, 1, 1, 9);
  addWaterfrontInstances(causeway, 'approach islets', island, 0xb79b7e, [
    { x: breaks[0] - 5, y: 0.45, z, width: 15, height: 1.2, depth: 22, yaw: 0.13 },
    { x: breaks.at(-1) + 5, y: 0.45, z, width: 15, height: 1.2, depth: 22, yaw: -0.24 },
  ]);
}

function addMarina(parent, random) {
  const group = new THREE.Group();
  group.name = 'Brisa Marina';
  parent.add(group);
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const fingers = [];
  const pilings = [];
  const cleats = [];
  const cleatStems = [];
  const ropes = [];
  const boats = [];
  for (const z of [-120, -60, 60]) {
    fingers.push({ x: -556, y: 0.88, z, width: 54, height: 0.44, depth: 4.4 });
    for (const x of [-580, -567, -554, -541]) {
      for (const side of [-1, 1]) {
        pilings.push({ x, y: 0.25, z: z + side * 1.66, width: 0.46, height: 3.7, depth: 0.46 });
      }
    }
    for (const side of [-1, 1]) {
      const boatX = -556 + random.range(-2, 2);
      const boatZ = z + side * 5.7;
      const length = random.range(10, 15);
      boats.push({ x: boatX, z: boatZ, length, width: random.range(3.3, 4.6), yaw: Math.PI / 2 });
      for (const end of [-1, 1]) {
        const cleatX = boatX + end * length * 0.39;
        const cleatZ = z + side * 1.9;
        cleatStems.push({ x: cleatX, y: 1.17, z: cleatZ, width: 0.12, height: 0.17, depth: 0.16 });
        cleats.push({ x: cleatX, y: 1.26, z: cleatZ, width: 0.44, height: 0.11, depth: 0.19 });
        ropes.push(cleatX, 1.25, cleatZ, boatX + end * length * 0.46, 0.67, boatZ);
      }
    }
  }
  addWaterfrontInstances(group, 'finger docks', cube, 0xa18460, fingers);
  addWaterfrontInstances(group, 'dock piles', new THREE.CylinderGeometry(0.49, 0.5, 1, 6), 0x6a513b, pilings);
  addWaterfrontInstances(group, 'cleats', cube, 0xbac2be, [...cleats, ...cleatStems]);
  const moorings = new THREE.BufferGeometry();
  moorings.setAttribute('position', new THREE.Float32BufferAttribute(ropes, 3));
  group.add(new THREE.LineSegments(moorings, new THREE.LineBasicMaterial({ color: 0xe2cfaf })));
  addBoats(group, 'Moored boats', boats);
}

function addCanal(parent, waterMaterial, colliders) {
  const group = new THREE.Group();
  group.name = 'Lucero Inlet';
  parent.add(group);
  const length = CANAL.endX - CANAL.startX;
  const centerX = (CANAL.startX + CANAL.endX) / 2;
  const water = new THREE.Mesh(new THREE.PlaneGeometry(length, CANAL.width), waterMaterial);
  water.rotation.x = -Math.PI / 2;
  water.position.set(centerX, -0.12, CANAL.z);
  group.add(water);

  const cube = new THREE.BoxGeometry(1, 1, 1);
  const banks = [];
  for (const side of [-1, 1]) {
    const edgeZ = CANAL.z + side * CANAL.width / 2;
    banks.push({ x: centerX, y: -0.04, z: edgeZ, width: length, height: 0.17, depth: 0.72 });
    colliders.push({ minX: CANAL.startX + 5, maxX: CANAL.endX - 5,
      minZ: edgeZ - 0.22, maxZ: edgeZ + 0.22, height: 0.23 });
  }
  addWaterfrontInstances(group, 'limestone coping', cube, 0xd2baa0, banks);
  const bridges = [-504, -432].map((x) => ({
    x, y: 0.14, z: CANAL.z,
    width: CITY.road + 2, height: 0.3, depth: CANAL.width + 4,
  }));
  addWaterfrontInstances(group, 'footbridge deck', cube, 0x9f7960, bridges);
  addCauseway(group, colliders);
}

function addAirport(parent, colliders) {
  const airport = new THREE.Group();
  airport.name = 'Solmar Airfield';
  parent.add(airport);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(720, 168), new THREE.MeshLambertMaterial({ color: 0x858b79 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0.025, 456);
  airport.add(ground);
  const asphalt = new THREE.MeshLambertMaterial({ color: 0x30343a });
  const runway = new THREE.Mesh(new THREE.PlaneGeometry(560, 34), asphalt);
  runway.rotation.x = -Math.PI / 2;
  runway.position.set(0, 0.045, 472);
  airport.add(runway);
  const taxiway = new THREE.Mesh(new THREE.PlaneGeometry(520, 10), asphalt);
  taxiway.rotation.x = -Math.PI / 2;
  taxiway.position.set(0, 0.05, 502);
  airport.add(taxiway);
  const paint = new THREE.MeshBasicMaterial({ color: 0xf2eee3 });
  for (let x = -250; x <= 250; x += 28) {
    const stripe = new THREE.Mesh(new THREE.PlaneGeometry(12, 0.7), paint);
    stripe.rotation.x = -Math.PI / 2;
    stripe.position.set(x, 0.065, 472);
    airport.add(stripe);
  }
  const terminal = new THREE.Mesh(new THREE.BoxGeometry(112, 8, 24), new THREE.MeshLambertMaterial({ color: 0xdacdb3 }));
  terminal.position.set(38, 4.05, 519);
  terminal.castShadow = true;
  airport.add(terminal);
  colliders.push({ minX: -18, maxX: 94, minZ: 507, maxZ: 531, height: 8.1 });
}

function addFreeway(parent) {
  const freeway = new THREE.Group();
  freeway.name = 'Solmar Freeway Loop';
  parent.add(freeway);
  const road = new THREE.MeshLambertMaterial({ color: 0x30363d });
  const paint = new THREE.MeshBasicMaterial({ color: 0xe7dbb9 });
  for (const z of [CITY.freeway.minZ, CITY.freeway.maxZ]) {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(CITY.freeway.maxX - CITY.freeway.minX + CITY.freeway.width, CITY.freeway.width), road);
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(0, 0.045, z);
    freeway.add(strip);
  }
  for (const x of [CITY.freeway.minX, CITY.freeway.maxX]) {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(CITY.freeway.width, CITY.freeway.maxZ - CITY.freeway.minZ + CITY.freeway.width), road);
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(x, 0.046, 0);
    freeway.add(strip);
  }
  const dashes = [];
  for (let coordinate = CITY.freeway.minX + 20; coordinate < CITY.freeway.maxX - 10; coordinate += 24) {
    dashes.push([coordinate, CITY.freeway.minZ], [coordinate, CITY.freeway.maxZ]);
    dashes.push([CITY.freeway.minX, coordinate], [CITY.freeway.maxX, coordinate]);
  }
  const marks = new THREE.InstancedMesh(new THREE.BoxGeometry(7, 0.02, 0.3), paint, dashes.length);
  const matrix = new THREE.Matrix4();
  dashes.forEach(([x, z], index) => {
    const vertical = (x === CITY.freeway.minX || x === CITY.freeway.maxX) && Math.abs(z) !== Math.abs(CITY.freeway.minZ);
    matrix.makeRotationY(vertical ? Math.PI / 2 : 0).setPosition(x, 0.095, z);
    marks.setMatrixAt(index, matrix);
  });
  marks.name = 'freeway:lane-dashes';
  marks.instanceMatrix.needsUpdate = true;
  freeway.add(marks);
}

function validateCityConfig() {
  const dimensions = ['grid', 'block', 'road', 'pitch', 'nodeMin', 'nodeMax', 'half', 'edge', 'beachWestStart', 'beachWestEnd', 'oceanWestStart', 'oceanWidth'];
  if (!dimensions.every((key) => Number.isFinite(CITY[key]))) throw new TypeError('City dimensions must be finite numbers.');
  if (!Number.isInteger(CITY.grid) || CITY.grid < 1 || CITY.pitch <= 0 || CITY.road <= 0 || CITY.road >= CITY.pitch) {
    throw new RangeError('City grid and road dimensions are invalid.');
  }
  if (Math.abs(CITY.block + CITY.road - CITY.pitch) > 1e-6 || Math.abs(CITY.nodeMin + CITY.grid * CITY.pitch - CITY.nodeMax) > 1e-6) {
    throw new RangeError('City block and road grid dimensions do not align.');
  }
  if (CITY.edge < Math.max(Math.abs(CITY.nodeMin), Math.abs(CITY.nodeMax)) + CITY.road / 2
    || CITY.beachWestStart >= -CITY.edge || CITY.beachWestEnd >= CITY.beachWestStart
    || CITY.oceanWestStart > CITY.beachWestEnd || CITY.oceanWidth <= CITY.edge * 2
    || CITY.airfield.minZ <= CITY.edge || CITY.airfield.maxZ <= CITY.airfield.minZ
    || CITY.freeway.minX !== -CITY.freeway.maxX || CITY.freeway.minZ !== -CITY.freeway.maxZ) {
    throw new RangeError('City boundaries, coast, airfield, and freeway dimensions do not align.');
  }
  if (!Array.isArray(CITY.parkBlocks) || CITY.parkBlocks.some(([column, row]) => !Number.isInteger(column) || !Number.isInteger(row) || column < 0 || row < 0 || column >= CITY.grid || row >= CITY.grid)) {
    throw new RangeError('Park blocks must be within the city grid.');
  }
}

function normalizeRandom(random) {
  if (typeof random !== 'function') throw new TypeError('createCity requires a callable seeded random generator.');
  const next = () => {
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError('Random values must be in the range [0, 1).');
    return value;
  };
  return Object.assign(next, {
    range(min, max) {
      if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) throw new RangeError('Random range bounds must be finite and ordered.');
      return min + (max - min) * next();
    },
    int(min, max) {
      const first = Math.ceil(min);
      const last = Math.floor(max);
      const count = last - first + 1;
      if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last) || !Number.isSafeInteger(count) || count <= 0) {
        throw new RangeError('Random integer bounds must contain at least one safe integer.');
      }
      return first + Math.floor(next() * count);
    },
    pick(items) {
      if (!Array.isArray(items) || items.length === 0) throw new RangeError('Cannot choose from an empty list.');
      return items[Math.floor(next() * items.length)];
    },
    chance(probability) {
      if (!Number.isFinite(probability) || probability < 0 || probability > 1) throw new RangeError('Random probability must be between zero and one.');
      return next() < probability;
    },
  });
}

function pointIsClear(colliders, x, z, radius) {
  return !colliders.some((box) => {
    const closestX = Math.max(box.minX, Math.min(box.maxX, x));
    const closestZ = Math.max(box.minZ, Math.min(box.maxZ, z));
    return (x - closestX) ** 2 + (z - closestZ) ** 2 < radius ** 2;
  });
}

function buildRoadGraph() {
  const size = CITY.grid + 1;
  const nodes = [];
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      nodes.push({
        id: row * size + column,
        column,
        row,
        x: CITY.nodeMin + column * CITY.pitch,
        z: CITY.nodeMin + row * CITY.pitch,
        neighbors: [],
      });
    }
  }
  const edges = [];
  function connect(a, b, width = CITY.road) {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const freeway = (a.x === b.x && Math.abs(a.x) === Math.abs(CITY.freeway.minX)
      && Math.min(a.z, b.z) >= CITY.freeway.minZ && Math.max(a.z, b.z) <= CITY.freeway.maxZ)
      || (a.z === b.z && Math.abs(a.z) === Math.abs(CITY.freeway.minZ)
        && Math.min(a.x, b.x) >= CITY.freeway.minX && Math.max(a.x, b.x) <= CITY.freeway.maxX);
    const edge = { a, b, dx, dz, length: Math.hypot(dx, dz), freeway, width, zone: a.zone ?? b.zone ?? (freeway ? 'freeway' : 'city') };
    edges.push(edge);
    a.neighbors.push({ edge, other: b, direction: { x: Math.sign(dx), z: Math.sign(dz) } });
    b.neighbors.push({ edge, other: a, direction: { x: -Math.sign(dx), z: -Math.sign(dz) } });
  }
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      const node = nodes[row * size + column];
      if (column + 1 < size) connect(node, nodes[row * size + column + 1]);
      if (row + 1 < size) connect(node, nodes[(row + 1) * size + column]);
    }
  }
  const airportRoad = [];
  // End at the taxiway; the terminal occupies x=0 beyond z=507.
  for (const z of [432, 504]) {
    const node = { id: nodes.length, column: null, row: null, x: 0, z, zone: 'airport', neighbors: [] };
    nodes.push(node);
    airportRoad.push(node);
  }
  connect(nodes[10 * size + 5], airportRoad[0]);
  connect(airportRoad[0], airportRoad[1]);
  const addRuralNode = (x, z) => {
    const node = { id: nodes.length, column: null, row: null, x, z, zone: 'hills', neighbors: [] };
    nodes.push(node);
    return node;
  };
  // Follow the existing z=-560 cross-country road and x=±300 tracks. Keeping
  // these in the shared graph gives northern traffic and race checkpoints real roads.
  const crossroad = new Map();
  let previous = null;
  for (const x of [-648, -576, -504, -432, -360, -300, -288, -216, -144, -72, 0, 72, 144, 216, 288, 300, 360, 432, 504, 576, 648]) {
    const node = addRuralNode(x, -560);
    crossroad.set(x, node);
    if (previous) connect(previous, node, 10);
    previous = node;
  }
  for (const x of [-300, 300]) {
    previous = nodes[x < 0 ? 1 : 9];
    // The slopes start just north of -888; leave room to turn at the track end.
    for (const z of [-360, -380, -452, -524, -560, -632, -704, -776, -840, -880]) {
      const node = z === -560 ? crossroad.get(x) : addRuralNode(x, z);
      connect(previous, node, 10);
      previous = node;
    }
  }
  const graph = {
    nodes,
    edges,
    size,
    nodeAt(column, row) {
      if (!Number.isInteger(column) || !Number.isInteger(row) || column < 0 || row < 0 || column >= size || row >= size) return null;
      return nodes[row * size + column];
    },
    nearestNode(x, z) {
      if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
      let best = null;
      let bestDistance = Infinity;
      for (const node of nodes) {
        const distance = (node.x - x) ** 2 + (node.z - z) ** 2;
        if (distance < bestDistance) { best = node; bestDistance = distance; }
      }
      return best;
    },
    nearestEdge(x, z) {
      if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
      let best = null;
      let bestDistance = Infinity;
      for (let index = 0; index < edges.length; index += 1) {
        const edge = edges[index];
        const minX = Math.min(edge.a.x, edge.b.x);
        const maxX = Math.max(edge.a.x, edge.b.x);
        const minZ = Math.min(edge.a.z, edge.b.z);
        const maxZ = Math.max(edge.a.z, edge.b.z);
        const px = Math.max(minX, Math.min(maxX, x));
        const pz = Math.max(minZ, Math.min(maxZ, z));
        const distance = Math.hypot(px - x, pz - z);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = { edge, x: px, z: pz, distance };
        }
      }
      return best;
    },
  };
  return graph;
}

export function createCity(random, reservedPlaces = []) {
  validateCityConfig();
  random = normalizeRandom(random);
  const group = new THREE.Group();
  group.name = 'Solmar';
  const buildings = [];
  const containers = [];
  const colliders = [];
  const decoCaps = [];
  const labels = [];
  const reserved = Array.isArray(reservedPlaces)
    ? reservedPlaces.filter((place) => Number.isFinite(place?.x) && Number.isFinite(place?.z))
    : [];
  const isReserved = (x, z) => reserved.some((place) =>
    Math.abs(x - place.x) <= CITY.block / 2 && Math.abs(z - place.z) <= CITY.block / 2);

  const facadePatterns = [
    { office: true },
    { residential: true },
    { glass: true },
    { deco: true },
    { shop: true },
    {},
  ];
  const facadeVariants = facadePatterns.map((variant) => makeFacadeTexture(random, variant));
  const towerPattern = { tower: true };
  const towerFacadeVariants = Array.from({ length: 8 }, (_, variant) => makeTowerFacadeTextures(variant * 137 + 29));
  const towerFacadeMaterials = new Map();

  function towerFacadeMaterial(cx, cz, seed = 0) {
    const variant = Math.floor(stableHash(cx + (Number.isFinite(seed) ? seed : 0) * 0.001, cz, 6) * towerFacadeVariants.length);
    if (towerFacadeMaterials.has(variant)) return towerFacadeMaterials.get(variant);
    const textures = towerFacadeVariants[variant];
    const material = new THREE.MeshLambertMaterial({
      color: shade(0x739bb0, (variant - 3.5) * 0.012),
      map: textures.map,
      emissive: 0x1d6283,
      emissiveMap: textures.emissiveMap,
      emissiveIntensity: 0.38 + (variant % 4) * 0.1,
    });
    towerFacadeMaterials.set(variant, material);
    return material;
  }

  const materialCache = new Map();
  function facadeMaterial(variant, color) {
    const key = `${variant}:${color}`;
    if (materialCache.has(key)) return materialCache.get(key);
    const map = facadeVariants[variant];
    const material = new THREE.MeshLambertMaterial({ color: shade(color, 0.06), map });
    materialCache.set(key, material);
    return material;
  }
  const roofMaterials = new Map();
  function roofMaterial(color) {
    if (roofMaterials.has(color)) return roofMaterials.get(color);
    const material = new THREE.MeshLambertMaterial({ color: shade(color, -0.12) });
    roofMaterials.set(color, material);
    return material;
  }

  const asphalt = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY.edge * 2, CITY.edge * 2),
    new THREE.MeshLambertMaterial({ color: PALETTE.asphalt }),
  );
  asphalt.rotation.x = -Math.PI / 2;
  asphalt.position.set(0, 0, (CITY.nodeMin + CITY.nodeMax) / 2);
  asphalt.receiveShadow = true;
  group.add(asphalt);
  const outerGround = new THREE.Mesh(new THREE.PlaneGeometry(1500, 1760), new THREE.MeshLambertMaterial({ color: 0x536249 }));
  outerGround.rotation.x = -Math.PI / 2;
  outerGround.position.set(0, -0.22, -170);
  outerGround.receiveShadow = true;
  group.add(outerGround);

  const blockPitch = CITY.pitch;
  const sidewalkGeometry = new THREE.BoxGeometry(blockPitch - CITY.road + 2, 0.26, blockPitch - CITY.road + 2);
  const sidewalkMaterial = new THREE.MeshLambertMaterial({ color: PALETTE.sidewalk });
  const sidewalkMesh = new THREE.InstancedMesh(sidewalkGeometry, sidewalkMaterial, CITY.grid * CITY.grid);
  const grassMaterial = new THREE.MeshLambertMaterial({ color: PALETTE.grass });
  const grassMesh = new THREE.InstancedMesh(sidewalkGeometry, grassMaterial, CITY.parkBlocks.length);
  sidewalkMesh.receiveShadow = true;
  grassMesh.receiveShadow = true;
  const matrix = new THREE.Matrix4();
  const parks = new Set(CITY.parkBlocks.map(([column, row]) => `${column}:${row}`));
  let sidewalkIndex = 0;
  let grassIndex = 0;
  const lotCenters = [];

  for (let row = 0; row < CITY.grid; row += 1) {
    for (let column = 0; column < CITY.grid; column += 1) {
      const x = CITY.nodeMin + (column + 0.5) * blockPitch;
      const z = CITY.nodeMin + (row + 0.5) * blockPitch;
      const isPark = parks.has(`${column}:${row}`);
      matrix.makeTranslation(x, 0.13, z);
      if (isPark) {
        if (grassIndex < grassMesh.count) grassMesh.setMatrixAt(grassIndex, matrix);
        grassIndex += 1;
      } else {
        sidewalkMesh.setMatrixAt(sidewalkIndex, matrix);
        sidewalkIndex += 1;
      }
      lotCenters.push({ x, z, column, row, isPark, beachfront: row === CITY.grid - 1 });
    }
  }
  sidewalkMesh.count = sidewalkIndex;
  grassMesh.count = Math.min(grassIndex, grassMesh.count);
  sidewalkMesh.instanceMatrix.needsUpdate = true;
  grassMesh.instanceMatrix.needsUpdate = true;
  group.add(sidewalkMesh, grassMesh);

  // Lane dashes: two instanced meshes, one per orientation, broken at every intersection.
  const dashGeometry = new THREE.BoxGeometry(0.32, 0.02, 3.2);
  const dashMaterial = new THREE.MeshBasicMaterial({ color: 0xd7d2c2 });
  const dashCount = CITY.grid * (CITY.grid + 1) * 5;
  const dashesNS = new THREE.InstancedMesh(dashGeometry, dashMaterial, dashCount);
  const dashesEW = new THREE.InstancedMesh(dashGeometry, dashMaterial, dashCount);
  const dashRotation = new THREE.Matrix4();
  const dashPosition = new THREE.Matrix4();
  const dashQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0));
  let dashNS = 0;
  let dashEW = 0;
  for (let line = 0; line <= CITY.grid; line += 1) {
    const lineX = CITY.nodeMin + line * blockPitch;
    const lineZ = CITY.nodeMin + line * blockPitch;
    for (let cell = 0; cell < CITY.grid; cell += 1) {
      const baseZ = CITY.nodeMin + cell * blockPitch;
      const baseX = CITY.nodeMin + cell * blockPitch;
      for (let dash = 0; dash < 4; dash += 1) {
        const offset = 15 + dash * 11;
        dashPosition.makeTranslation(lineX, 0.035, baseZ + offset);
        if (dashNS < dashesNS.count) dashesNS.setMatrixAt(dashNS, dashPosition);
        dashNS += 1;
        dashRotation.makeRotationY(Math.PI / 2);
        dashPosition.makeTranslation(baseX + offset, 0.035, lineZ);
        dashPosition.multiply(dashRotation);
        if (dashEW < dashesEW.count) dashesEW.setMatrixAt(dashEW, dashPosition);
        dashEW += 1;
      }
    }
  }
  dashesNS.count = Math.min(dashNS, dashesNS.count);
  dashesEW.count = Math.min(dashEW, dashesEW.count);
  dashesNS.instanceMatrix.needsUpdate = true;
  dashesEW.instanceMatrix.needsUpdate = true;
  group.add(dashesNS, dashesEW);

  // Main avenues get a double yellow center and every road gets crisp white edge lines.
  const yellowMaterial = new THREE.MeshBasicMaterial({ color: 0xf1c64b, toneMapped: false });
  const whiteMaterial = new THREE.MeshBasicMaterial({ color: 0xf5f1df, toneMapped: false });
  const yellowGeometry = new THREE.BoxGeometry(52, 0.026, 0.16);
  const edgeNSGeometry = new THREE.BoxGeometry(0.16, 0.026, 52);
  const edgeEWGeometry = new THREE.BoxGeometry(52, 0.026, 0.16);
  const yellowLines = new THREE.InstancedMesh(yellowGeometry, yellowMaterial, CITY.grid * 2 * 2);
  const edgeNSLines = new THREE.InstancedMesh(edgeNSGeometry, whiteMaterial, (CITY.grid + 1) * CITY.grid * 2);
  const edgeEWLines = new THREE.InstancedMesh(edgeEWGeometry, whiteMaterial, (CITY.grid + 1) * CITY.grid * 2);
  const markingMatrix = new THREE.Matrix4();
  let yellowIndex = 0;
  for (const avenueZ of [216, 288]) {
    for (let cell = 0; cell < CITY.grid; cell += 1) {
      const centerX = CITY.nodeMin + cell * blockPitch + blockPitch / 2;
      for (const offset of [-0.22, 0.22]) {
        markingMatrix.makeTranslation(centerX, 0.055, avenueZ + offset);
        yellowLines.setMatrixAt(yellowIndex, markingMatrix);
        yellowIndex += 1;
      }
    }
  }
  let edgeNSIndex = 0;
  let edgeEWIndex = 0;
  for (let line = 0; line <= CITY.grid; line += 1) {
    const lineCoord = CITY.nodeMin + line * blockPitch;
    for (let cell = 0; cell < CITY.grid; cell += 1) {
      const center = CITY.nodeMin + cell * blockPitch + blockPitch / 2;
      for (const offset of [-8.35, 8.35]) {
        markingMatrix.makeTranslation(lineCoord + offset, 0.055, center);
        edgeNSLines.setMatrixAt(edgeNSIndex, markingMatrix);
        edgeNSIndex += 1;
        markingMatrix.makeTranslation(center, 0.055, lineCoord + offset);
        edgeEWLines.setMatrixAt(edgeEWIndex, markingMatrix);
        edgeEWIndex += 1;
      }
    }
  }
  yellowLines.count = yellowIndex;
  edgeNSLines.count = edgeNSIndex;
  edgeEWLines.count = edgeEWIndex;
  yellowLines.instanceMatrix.needsUpdate = true;
  edgeNSLines.instanceMatrix.needsUpdate = true;
  edgeEWLines.instanceMatrix.needsUpdate = true;
  yellowLines.name = 'roads:double-yellow';
  edgeNSLines.name = 'roads:white-edge-ns';
  edgeEWLines.name = 'roads:white-edge-ew';
  group.add(yellowLines, edgeNSLines, edgeEWLines);

  // Seven white bars on each approach make a readable zebra crossing at every node.
  const crossNS = new THREE.InstancedMesh(new THREE.BoxGeometry(2.05, 0.028, 0.9), whiteMaterial, (CITY.grid + 1) ** 2 * 2 * 7);
  const crossEW = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 0.028, 2.05), whiteMaterial, (CITY.grid + 1) ** 2 * 2 * 7);
  let crossNSIndex = 0;
  let crossEWIndex = 0;
  for (let row = 0; row <= CITY.grid; row += 1) {
    const nodeZ = CITY.nodeMin + row * blockPitch;
    for (let column = 0; column <= CITY.grid; column += 1) {
      const nodeX = CITY.nodeMin + column * blockPitch;
      for (const side of [-1, 1]) {
        for (let stripe = 0; stripe < 7; stripe += 1) {
          markingMatrix.makeTranslation(nodeX - 7.2 + stripe * 2.4, 0.06, nodeZ + side * 10);
          crossNS.setMatrixAt(crossNSIndex, markingMatrix);
          crossNSIndex += 1;
          markingMatrix.makeTranslation(nodeX + side * 10, 0.06, nodeZ - 7.2 + stripe * 2.4);
          crossEW.setMatrixAt(crossEWIndex, markingMatrix);
          crossEWIndex += 1;
        }
      }
    }
  }
  crossNS.count = crossNSIndex;
  crossEW.count = crossEWIndex;
  crossNS.instanceMatrix.needsUpdate = true;
  crossEW.instanceMatrix.needsUpdate = true;
  crossNS.name = 'roads:zebra-crossings-x';
  crossEW.name = 'roads:zebra-crossings-z';
  group.add(crossNS, crossEW);

  // One shared groove material keeps each light-grey sidewalk pad legible without per-block textures.
  const jointMaterial = new THREE.MeshBasicMaterial({ color: 0x858987, transparent: true, opacity: 0.34, toneMapped: false });
  const jointNS = new THREE.InstancedMesh(new THREE.BoxGeometry(0.055, 0.012, 50), jointMaterial, CITY.grid * CITY.grid * 7);
  const jointEW = new THREE.InstancedMesh(new THREE.BoxGeometry(50, 0.012, 0.055), jointMaterial, CITY.grid * CITY.grid * 7);
  let jointNSIndex = 0;
  let jointEWIndex = 0;
  for (const center of lotCenters) {
    if (center.isPark) continue;
    for (let joint = 1; joint <= 7; joint += 1) {
      markingMatrix.makeTranslation(center.x - 25 + joint * 6.25, 0.269, center.z);
      jointNS.setMatrixAt(jointNSIndex, markingMatrix);
      jointNSIndex += 1;
      markingMatrix.makeTranslation(center.x, 0.269, center.z - 25 + joint * 6.25);
      jointEW.setMatrixAt(jointEWIndex, markingMatrix);
      jointEWIndex += 1;
    }
  }
  jointNS.count = jointNSIndex;
  jointEW.count = jointEWIndex;
  jointNS.instanceMatrix.needsUpdate = true;
  jointEW.instanceMatrix.needsUpdate = true;
  jointNS.name = 'sidewalk:joints-ns';
  jointEW.name = 'sidewalk:joints-ew';
  group.add(jointNS, jointEW);

  function addBuilding(cx, cz, width, depth, height, options = {}) {
    const tower = Boolean(options.tower);
    const variant = options.variant ?? random.int(0, facadeVariants.length - 1);
    const color = options.color ?? random.pick(PALETTE.buildings);
    // Consume the usual random choices before leaving room for a place marker.
    if (isReserved(cx, cz)
      || (cz - depth / 2 < CANAL.width / 2 + 1.5 && cz + depth / 2 > -CANAL.width / 2 - 1.5)) return null;
    const geometry = new THREE.BoxGeometry(width, height, depth);
    const facadeVariant = tower ? towerPattern : facadePatterns[variant];
    scaleFacadeUVs(geometry, width, height, depth, facadeVariant);
    let solid;
    if (tower) {
      solid = towerFacadeMaterial(cx, cz, options.towerSeed);
    } else {
      solid = facadeMaterial(variant, color);
    }
    const roof = roofMaterial(tower ? 0x49677a : color);
    const mesh = new THREE.Mesh(geometry, [solid, solid, roof, roof, solid, solid]);
    mesh.position.set(cx, 0.28 + height / 2, cz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = tower ? 'glass-tower' : 'building';
    group.add(mesh);
    const box = {
      minX: cx - width / 2,
      maxX: cx + width / 2,
      minZ: cz - depth / 2,
      maxZ: cz + depth / 2,
      height: height + 0.3,
    };
    buildings.push(box);
    colliders.push(box);
    if (height > 24) {
      const cap = new THREE.Mesh(new THREE.BoxGeometry(width * (tower ? 0.64 : 0.45), tower ? 2.1 : 1.6, depth * (tower ? 0.64 : 0.45)), roof);
      cap.position.set(cx, 0.28 + height + 0.8, cz);
      cap.castShadow = true;
      group.add(cap);
      if (tower) {
        const setback = new THREE.Mesh(
          new THREE.BoxGeometry(width * 0.38, 1.25, depth * 0.38),
          new THREE.MeshLambertMaterial({ color: 0x71858f, emissive: 0x173d54, emissiveIntensity: 0.25 }),
        );
        setback.position.set(cx, 0.28 + height + 2.45, cz);
        setback.castShadow = true;
        group.add(setback);
        const box = new THREE.Mesh(new THREE.BoxGeometry(width * 0.18, 1.1, depth * 0.2), roof);
        box.position.set(cx + width * 0.18, 0.28 + height + 3.65, cz - depth * 0.12);
        box.castShadow = true;
        group.add(box);
        const mast = new THREE.Mesh(
          new THREE.CylinderGeometry(0.09, 0.13, Math.min(9, 2.8 + height * 0.08), 6),
          new THREE.MeshLambertMaterial({ color: 0x4b5963, emissive: 0x102b3d, emissiveIntensity: 0.2 }),
        );
        mast.position.set(cx - width * 0.18, 0.28 + height + 5.5, cz + depth * 0.12);
        mast.castShadow = true;
        group.add(mast);
        const beacon = new THREE.Mesh(
          new THREE.BoxGeometry(0.22, 0.22, 1.7),
          new THREE.MeshBasicMaterial({ color: stableHash(cx, cz, 5) > 0.5 ? 0xff5edb : 0x53e5ff }),
        );
        beacon.position.set(mast.position.x, mast.position.y + Math.min(4.5, height * 0.04), mast.position.z);
        group.add(beacon);
      }
    }
    if (options.deco) {
      // Step the crown toward the center while keeping the lot and entry frontage clear.
      const crown = shade(color, 0.09);
      const trim = new THREE.Color(0xf2e0cc);
      for (const [spread, level, stepHeight, tint] of [
        [1, 0.16, 0.32, trim], [0.73, 0.77, 0.9, crown], [0.43, 1.55, 0.66, trim],
      ]) {
        decoCaps.push({ x: cx, y: 0.28 + height + level, z: cz,
          width: width * spread, height: stepHeight, depth: depth * spread, tint });
      }
    }
    return box;
  }

  function blockLayout(center) {
    const lot = blockPitch - CITY.road - 8;
    const half = lot / 2;
    const layout = random();
    if (center.isPark) return [];
    if (layout < 0.26) return [{ x: 0, z: 0, w: lot, d: lot }];
    if (layout < 0.56) {
      const gap = random.range(1.5, 4);
      const left = (lot - gap) * random.range(0.4, 0.6);
      return [
        { x: -half + left / 2, z: 0, w: left, d: lot },
        { x: half - (lot - gap - left) / 2, z: 0, w: lot - gap - left, d: lot },
      ];
    }
    if (layout < 0.74) {
      const gap = random.range(2, 4);
      const front = lot * random.range(0.4, 0.6);
      return [
        { x: 0, z: -half + front / 2, w: lot, d: front },
        { x: 0, z: half - (lot - gap - front) / 2, w: lot, d: lot - front - gap },
      ];
    }
    if (layout < 0.9) {
      const gap = random.range(2, 4);
      const w = (lot - gap) / 2;
      const d = (lot - gap) / 2;
      const cells = [
        { x: -w / 2 - gap / 2, z: -d / 2 - gap / 2, w, d },
        { x: w / 2 + gap / 2, z: -d / 2 - gap / 2, w, d },
        { x: -w / 2 - gap / 2, z: d / 2 + gap / 2, w, d },
      ];
      if (random.chance(0.65)) cells.push({ x: w / 2 + gap / 2, z: d / 2 + gap / 2, w, d });
      return cells;
    }
    return [
      { x: 0, z: -half + lot / 4, w: lot, d: lot / 2 - 2 },
      { x: 0, z: half - lot / 4, w: lot, d: lot / 2 - 2 },
    ];
  }

  for (let index = 0; index < lotCenters.length; index += 1) {
    const center = lotCenters[index];
    if (center.isPark) continue;
    const beachfront = center.row === CITY.grid - 1;
    const downtown = center.column >= 3 && center.column <= 6 && center.row >= 3 && center.row <= 6;
    const avenueFrontage = center.column >= 3 && center.column <= 6 && center.row === 8;
    const coastalTower = beachfront && center.column >= 3 && center.column <= 6;
    const cells = blockLayout(center);
    for (let cellIndex = 0; cellIndex < cells.length; cellIndex += 1) {
      const cell = cells[cellIndex];
      if (random.chance(0.12) && cells.length > 1) continue;
      const inset = random.range(1.4, 3.2);
      const width = Math.max(6, cell.w - inset * 2);
      const depth = Math.max(6, cell.d - inset * 2);
      let height;
      if (downtown) {
        const edge = THREE.MathUtils.clamp((Math.abs(center.x) + Math.abs(center.z) - 72) / 144, 0, 1);
        height = random.range(44 - edge * 18, 85 - edge * 40);
      } else if (avenueFrontage) height = random.range(40, 58);
      else if (coastalTower) height = random.range(30, 46);
      else if (beachfront) height = random.range(7, 16);
      else height = random.range(10, 34);
      // Keep the previous one seeded facade-choice draw per lot cell, even for the new tower set.
      const variant = beachfront ? random.pick([4, 4, 1, 5]) : downtown ? random.pick([0, 2, 3, 0]) : random.int(0, 5);
      const color = random.pick(PALETTE.buildings);
      const tower = downtown || avenueFrontage || coastalTower;
      addBuilding(center.x + cell.x, center.z + cell.z, width, depth, height, tower ? {
        tower: true,
        variant,
        towerSeed: color,
        color: 0x527b91,
      } : beachfront ? {
        variant: 3, color: DECO_PASTELS[(center.column + cellIndex) % DECO_PASTELS.length], deco: true,
      } : { variant, color });
    }
  }
  if (decoCaps.length) {
    addWaterfrontInstances(group, 'Beachfront Deco crowns', new THREE.BoxGeometry(1, 1, 1), 0xffffff, decoCaps);
  }

  // Fictional rooftop neon. Two outward faces keep the lettering readable on BOTH approaches;
  // a single DoubleSide texture would show mirrored text from the back.
  const glowTexture = makeGlowTexture();
  const neonTextures = new Map();
  const neonLights = [];
  const signFrameMaterial = new THREE.MeshLambertMaterial({ color: 0x302c40 });
  function addNeonSign({ id, label, caption, color, x, z, y, width, height,
    baseY = 0.28, supportHalfWidth = width * 0.34 }) {
    const textureKey = `${label}:${color}:${caption}`;
    let texture = neonTextures.get(textureKey);
    if (!texture) {
      texture = makeNeonTexture(label, color, caption);
      if (texture) neonTextures.set(textureKey, texture);
    }
    if (!texture) return null;
    const sign = new THREE.Group();
    sign.name = `neon:${id}`;
    sign.userData.kind = 'neon-sign';
    sign.userData.label = label;
    sign.userData.doubleSided = true;
    sign.position.set(x, y, z);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(width + 0.7, height + 0.7, 0.6), signFrameMaterial);
    frame.castShadow = true;
    sign.add(frame);
    const faceGeometry = new THREE.PlaneGeometry(width, height);
    const faceMaterial = new THREE.MeshLambertMaterial({
      color: 0x483046, map: texture, emissive: 0xffffff, emissiveMap: texture,
      emissiveIntensity: 1.3, toneMapped: false,
    });
    const haloMaterial = new THREE.MeshBasicMaterial({
      map: glowTexture, color, transparent: true, opacity: 0.52,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    });
    neonLights.push({ faceMaterial, haloMaterial });
    for (const side of [-1, 1]) {
      const face = new THREE.Mesh(faceGeometry, faceMaterial);
      face.name = `neon:${id}:${side < 0 ? 'north' : 'south'}`;
      face.position.z = side * 0.32;
      face.rotation.y = side < 0 ? Math.PI : 0;
      sign.add(face);
      if (glowTexture) {
        const halo = new THREE.Mesh(new THREE.PlaneGeometry(width * 1.5, height * 2.8), haloMaterial);
        halo.position.z = side * 0.26;
        halo.rotation.y = face.rotation.y;
        sign.add(halo);
      }
    }
    const supportHeight = y - height / 2 - 0.35 - baseY;
    if (supportHeight > 0) {
      const supportGeometry = new THREE.CylinderGeometry(0.22, 0.3, supportHeight, 6);
      for (const side of [-1, 1]) {
        const support = new THREE.Mesh(supportGeometry, signFrameMaterial);
        support.position.set(side * supportHalfWidth, baseY + supportHeight / 2 - y, 0);
        support.castShadow = true;
        sign.add(support);
        if (baseY <= 0.3) {
          const supportX = x + side * supportHalfWidth;
          colliders.push({ minX: supportX - 0.3, maxX: supportX + 0.3,
            minZ: z - 0.3, maxZ: z + 0.3, height: baseY + supportHeight });
        }
      }
    }
    group.add(sign);
    return sign;
  }

  function addRooftopNeon({ targetX, targetZ, ...options }) {
    const roof = buildings.reduce((nearest, candidate) => {
      const distance = (box) => ((box.minX + box.maxX) / 2 - targetX) ** 2
        + ((box.minZ + box.maxZ) / 2 - targetZ) ** 2;
      return !nearest || distance(candidate) < distance(nearest) ? candidate : nearest;
    }, null);
    if (!roof) return null;
    return addNeonSign({
      ...options, x: (roof.minX + roof.maxX) / 2, z: (roof.minZ + roof.maxZ) / 2,
      y: roof.height + 2.8 + options.height / 2, baseY: roof.height,
    });
  }

  addRooftopNeon({ id: 'flamingo-fm', label: 'FLAMINGO FM', caption: 'THE SOUND OF THE COAST',
    color: 0xff2b99, targetX: 36, targetZ: 324, width: 46, height: 11.5 });
  addRooftopNeon({ id: 'wave-88', label: 'WAVE 88.1', caption: 'AFTER HOURS / ON AIR',
    color: 0x46e5dc, targetX: -108, targetZ: 252, width: 22, height: 5.5 });
  addRooftopNeon({ id: 'coral-motel', label: 'CORAL MOTEL', caption: 'VACANCY / OCEAN BREEZE',
    color: 0xffa776, targetX: 108, targetZ: 324, width: 26, height: 6.5 });
  addRooftopNeon({ id: 'neon-drive', label: 'NEON DRIVE', caption: 'LATE NIGHTS / OPEN ROAD',
    color: 0xd16bff, targetX: 180, targetZ: 180, width: 24, height: 6 });

  // The fixed play camera looks down: this low station marquee fits below its horizon and HUD.
  // Its two pylons sit on the sidewalks, with 4.2 m clearance over the north/south road.
  addNeonSign({ id: 'flamingo-fm-approach', label: 'FLAMINGO FM', caption: 'THE SOUND OF THE COAST',
    color: 0xff2b99, x: 0, z: 338, y: 6.2, width: 24, height: 3.3, supportHalfWidth: 11.9 });
  // The central rooftop hero is behind the existing title card. A matching station relay on
  // the east roofline exposes the same identity beside the card without changing either camera.
  addRooftopNeon({ id: 'flamingo-fm-relay', label: 'FLAMINGO FM', caption: 'THE SOUND OF THE COAST',
    color: 0xff2b99, targetX: 216, targetZ: 324, width: 46, height: 11.5 });
  addRooftopNeon({ id: 'brisa-marina', label: 'BRISA MARINA', caption: 'BERTHS / BAIT / FUEL',
    color: 0x50e3d5, targetX: -290, targetZ: 334, width: 21, height: 5.2 });
  addRooftopNeon({ id: 'peach-lantern', label: 'PEACH LANTERN', caption: 'DINER / SUNSET TO LATE',
    color: 0xff83aa, targetX: 298, targetZ: 334, width: 22, height: 5.5 });

  // West beach and ocean: the canal mouth interrupts the shore and joins the city grid.
  const sand = new THREE.MeshLambertMaterial({ color: PALETTE.sand });
  for (const [minZ, maxZ] of [[-380, CANAL.z - CANAL.width / 2], [CANAL.z + CANAL.width / 2, 380]]) {
    const minX = CITY.beachWestEnd;
    const maxX = CITY.beachWestStart;
    const beach = new THREE.Mesh(new THREE.PlaneGeometry(maxX - minX, maxZ - minZ), sand);
    beach.rotation.x = -Math.PI / 2;
    beach.position.set((minX + maxX) / 2, 0.04, (minZ + maxZ) / 2);
    beach.receiveShadow = true;
    group.add(beach);
  }

  const boardwalk = new THREE.Mesh(
    new THREE.BoxGeometry(12, 0.34, CITY.edge * 2 + 6),
    new THREE.MeshLambertMaterial({ color: PALETTE.boardwalk }),
  );
  boardwalk.position.set(CITY.beachWestStart - 8, 0.17, 0);
  boardwalk.receiveShadow = true;
  group.add(boardwalk);

  const water = new THREE.MeshPhongMaterial({ color: PALETTE.ocean, shininess: 70, specular: 0x88a9b0 });
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(2400, CITY.oceanWidth), water);
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(CITY.oceanWestStart - 1200, -0.12, 0);
  group.add(ocean);
  addCanal(group, water, colliders);
  addAirport(group, colliders);
  addFreeway(group);

  // Seed the fleet separately so the original lot, prop and spawn sequences stay intact.
  const fleetRandom = createRandom(0x50a1a2);
  addBoats(group, 'Offshore yachts', [
    { x: -660, z: -230, width: 8, length: 27, yaw: -0.68 },
    { x: -760, z: 80, width: 8.5, length: 30, yaw: 0.8 },
    { x: -680, z: 260, width: 7, length: 24, yaw: -0.32 },
  ].map((boat) => ({
    ...boat, x: boat.x + fleetRandom.range(-4, 4), z: boat.z + fleetRandom.range(-6, 6),
    yaw: boat.yaw + fleetRandom.range(-0.18, 0.18),
  })));
  addMarina(group, fleetRandom);

  const foamMaterial = new THREE.MeshBasicMaterial({ color: PALETTE.foam, transparent: true, opacity: 0.8 });
  for (let wave = 0; wave < 5; wave += 1) {
    for (const [minZ, maxZ] of [[-380, CANAL.z - CANAL.width / 2], [CANAL.z + CANAL.width / 2, 380]]) {
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(1.6 + wave * 0.9, maxZ - minZ), foamMaterial);
      strip.rotation.x = -Math.PI / 2;
      strip.position.set(CITY.oceanWestStart + wave * 7, 0.02, (minZ + maxZ) / 2);
      group.add(strip);
    }
  }
  const inCanal = (x, z, margin = 0) => x >= CANAL.startX - margin && x <= CANAL.endX + margin
    && Math.abs(z - CANAL.z) <= CANAL.width / 2 + margin;

  // Palms: instanced trunks and fronds, along the beach, the parks and a few sidewalks.
  const palmSpots = [];
  for (let z = -330; z <= 330; z += random.range(17, 27)) {
    palmSpots.push({ x: random.range(-410, -392), z: z + random.range(-3, 3), scale: random.range(0.9, 1.3) });
    if (random.chance(0.45)) palmSpots.push({ x: random.range(-490, -464), z: z + random.range(-8, 8), scale: random.range(0.85, 1.15) });
  }
  for (const center of lotCenters) {
    if (!center.isPark || (center.column === 6 && center.row === 6)) continue;
    for (let tree = 0; tree < 4; tree += 1) {
      palmSpots.push({
        x: center.x + random.range(-20, 20),
        z: center.z + random.range(-20, 20),
        scale: random.range(0.8, 1.15),
      });
    }
  }
  // Coral Strand and the spawn avenue: paired sidewalk rows, broken at each cross street.
  // Block-local jitter keeps the rhythm planted while retaining a seeded, natural variation.
  const boulevardAvenues = [288, 216];
  const boulevardOffset = CITY.road / 2 + 2.5;
  for (const avenueZ of boulevardAvenues) {
    for (let block = 0; block < CITY.grid; block += 1) {
      const blockX = CITY.nodeMin + block * blockPitch;
      for (const side of [-1, 1]) {
        for (const station of [17, 36, 55]) {
          const x = blockX + station + random.range(-0.9, 0.9);
          const z = avenueZ + side * boulevardOffset;
          const matureScale = random.range(1.5, 1.85);
          // Six younger approach palms keep their crowns in the fixed, downward play view.
          const approachPalm = avenueZ === 288 && side > 0 && Math.abs(x) < 58;
          const scale = matureScale * (approachPalm ? 0.5 : 1);
          if (pointIsClear(colliders, x, z, 0.75)) palmSpots.push({ x, z, scale });
        }
      }
    }
  }
  const frondsPerPalm = 7;
  const trunkMesh = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.2, 0.36, 1, 6).translate(0, 0.5, 0),
    new THREE.MeshLambertMaterial({ color: PALETTE.trunk }),
    palmSpots.length,
  );
  const frondMesh = new THREE.InstancedMesh(
    new THREE.ConeGeometry(0.62, 3.3, 4).translate(0, 1.65, 0),
    new THREE.MeshLambertMaterial({ color: PALETTE.leaf, flatShading: true }),
    palmSpots.length * frondsPerPalm,
  );
  trunkMesh.name = 'palms:trunks';
  frondMesh.name = 'palms:fronds';
  trunkMesh.castShadow = true;
  frondMesh.castShadow = true;
  const palmMatrix = new THREE.Matrix4();
  const palmQuat = new THREE.Quaternion();
  const palmScale = new THREE.Vector3();
  const palmPosition = new THREE.Vector3();
  const leafTint = new THREE.Color();
  let frondIndex = 0;
  for (let palm = 0; palm < palmSpots.length; palm += 1) {
    const spot = palmSpots[palm];
    const hidden = isReserved(spot.x, spot.z) || inCanal(spot.x, spot.z, 2.4);
    const height = 7.2 * spot.scale;
    palmPosition.set(spot.x, 0.2, spot.z);
    palmScale.set(spot.scale, height, spot.scale);
    palmQuat.setFromEuler(new THREE.Euler(spot.x * 0.0006, random.range(0, Math.PI * 2), spot.z * 0.0005));
    if (hidden) palmScale.set(0, 0, 0);
    palmMatrix.compose(palmPosition, palmQuat, palmScale);
    trunkMesh.setMatrixAt(palm, palmMatrix);
    const trunkRadius = 0.36 * spot.scale;
    if (!hidden) colliders.push({ minX: spot.x - trunkRadius, maxX: spot.x + trunkRadius, minZ: spot.z - trunkRadius, maxZ: spot.z + trunkRadius, height: 0.2 + height });
    for (let frond = 0; frond < frondsPerPalm; frond += 1) {
      const angle = (frond / frondsPerPalm) * Math.PI * 2 + random.range(-0.2, 0.2);
      const tilt = random.range(0.9, 1.35);
      palmQuat.setFromEuler(new THREE.Euler(tilt, angle, 0, 'YXZ'));
      palmPosition.set(spot.x, 0.2 + height, spot.z);
      palmScale.set(1.15 * spot.scale, 1.15 * spot.scale, 0.32 * spot.scale);
      if (hidden) palmScale.set(0, 0, 0);
      palmMatrix.compose(palmPosition, palmQuat, palmScale);
      if (frondIndex < frondMesh.count) frondMesh.setMatrixAt(frondIndex, palmMatrix);
      leafTint.setHex(random.chance(0.5) ? PALETTE.leaf : PALETTE.leafLight).offsetHSL(0, 0, random.range(-0.04, 0.04));
      frondMesh.setColorAt(frondIndex, leafTint);
      frondIndex += 1;
    }
  }
  trunkMesh.instanceMatrix.needsUpdate = true;
  frondMesh.instanceMatrix.needsUpdate = true;
  if (frondMesh.instanceColor) frondMesh.instanceColor.needsUpdate = true;
  group.add(trunkMesh, frondMesh);

  // Streetlights at every other intersection corner.
  const lampSpots = [];
  for (let line = 0; line <= CITY.grid; line += 2) {
    for (let cross = 0; cross <= CITY.grid; cross += 2) {
      const x = CITY.nodeMin + line * blockPitch + 11;
      const z = CITY.nodeMin + cross * blockPitch + 11;
      lampSpots.push({ x, z });
      lampSpots.push({ x: x - 22, z: z + 11 });
    }
  }
  for (const avenueZ of boulevardAvenues) {
    for (let block = 0; block < CITY.grid; block += 1) {
      for (const side of [-1, 1]) {
        const x = CITY.nodeMin + block * blockPitch + (side < 0 ? 26 : 46) + random.range(-0.6, 0.6);
        const z = avenueZ + side * boulevardOffset;
        if (!isReserved(x, z) && pointIsClear(colliders, x, z, 0.65)) lampSpots.push({ x, z, glow: true });
      }
    }
  }
  const poleMesh = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.11, 0.16, 6.4, 5).translate(0, 3.2, 0),
    new THREE.MeshLambertMaterial({ color: PALETTE.metal }),
    lampSpots.length,
  );
  const headMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1.35, 0.3, 0.62),
    new THREE.MeshLambertMaterial({ color: PALETTE.lamp, emissive: 0xffc46b, emissiveIntensity: 1.2, toneMapped: false }),
    lampSpots.length,
  );
  poleMesh.name = 'streetlights:poles';
  headMesh.name = 'streetlights:heads';
  const lampGlowMaterial = new THREE.SpriteMaterial({
    map: glowTexture, color: PALETTE.lamp, opacity: 0.65, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  });
  const ordinaryLampGlowMaterial = lampGlowMaterial.clone();
  const lampHalos = [];
  for (let lamp = 0; lamp < lampSpots.length; lamp += 1) {
    const spot = lampSpots[lamp];
    palmMatrix.makeTranslation(spot.x, 0.25, spot.z);
    poleMesh.setMatrixAt(lamp, palmMatrix);
    palmMatrix.makeTranslation(spot.x + 0.5, 6.5, spot.z);
    headMesh.setMatrixAt(lamp, palmMatrix);
    if (glowTexture) {
      const halo = new THREE.Sprite(spot.glow ? lampGlowMaterial : ordinaryLampGlowMaterial);
      halo.name = 'streetlights:halo';
      halo.position.set(spot.x + 0.5, 6.5, spot.z);
      halo.scale.set(3.1, 3.1, 1);
      lampHalos.push({ halo, avenue: spot.glow });
      group.add(halo);
    }
    colliders.push({ minX: spot.x - 0.2, maxX: spot.x + 0.2, minZ: spot.z - 0.2, maxZ: spot.z + 0.2, height: 6.65 });
  }
  poleMesh.instanceMatrix.needsUpdate = true;
  headMesh.instanceMatrix.needsUpdate = true;
  group.add(poleMesh, headMesh);

  // Clock-phased signals are visual-only and use the same state for equal shot times and seeds.
  const signalLamps = [];
  const signalPoleMaterial = new THREE.MeshLambertMaterial({ color: 0x5d6870, emissive: 0x17212a, emissiveIntensity: 0.15 });
  const signalHousingMaterial = new THREE.MeshLambertMaterial({ color: 0x202b32 });
  const signalLensMaterials = [
    new THREE.MeshLambertMaterial({ color: 0xff342d, emissive: 0xc81813, emissiveIntensity: 2.2, toneMapped: false }),
    new THREE.MeshLambertMaterial({ color: 0xffcb45, emissive: 0xb77a10, emissiveIntensity: 2.0, toneMapped: false }),
    new THREE.MeshLambertMaterial({ color: 0x46ed91, emissive: 0x118c53, emissiveIntensity: 2.0, toneMapped: false }),
  ];
  const signalPoleGeometry = new THREE.CylinderGeometry(0.13, 0.19, 7.1, 6).translate(0, 3.55, 0);
  const signalArmGeometry = new THREE.BoxGeometry(11, 0.18, 0.18);
  const signalHousingGeometry = new THREE.BoxGeometry(0.82, 2.1, 0.62);
  const signalLensGeometry = new THREE.SphereGeometry(0.2, 8, 6);
  for (const avenueZ of boulevardAvenues) {
    const row = Math.round((avenueZ - CITY.nodeMin) / blockPitch);
    for (let column = 3; column <= 7; column += 1) {
      const nodeX = CITY.nodeMin + column * blockPitch;
      const nodeZ = CITY.nodeMin + row * blockPitch;
      const poleX = nodeX + 12;
      const poleZ = nodeZ - 12;
      const pole = new THREE.Mesh(signalPoleGeometry, signalPoleMaterial);
      pole.position.set(poleX, 0, poleZ);
      pole.castShadow = true;
      const arm = new THREE.Mesh(signalArmGeometry, signalPoleMaterial);
      arm.position.set(nodeX + 6.5, 7.05, poleZ);
      arm.castShadow = true;
      const housing = new THREE.Mesh(signalHousingGeometry, signalHousingMaterial);
      housing.position.set(nodeX + 1.5, 6.0, poleZ);
      const lenses = signalLensMaterials.map((material, lens) => {
        const sphere = new THREE.Mesh(signalLensGeometry, material);
        sphere.position.set(nodeX + 1.5, 6.65 - lens * 0.64, poleZ - 0.34);
        return sphere;
      });
      const signal = new THREE.Group();
      signal.name = `traffic-signal:${column}:${row}`;
      signal.add(pole, arm, housing, ...lenses);
      group.add(signal);
      signalLamps.push({ lenses, index: column + row * (CITY.grid + 1) });
    }
  }
  function setSignalClock(clockMinutes) {
    if (!Number.isFinite(clockMinutes)) return;
    for (const { lenses, index } of signalLamps) {
      const phase = ((clockMinutes + index * 11) % 90 + 90) % 90;
      const active = phase < 42 ? 0 : phase < 80 ? 2 : 1;
      lenses.forEach((lens, color) => { lens.visible = color === active; });
    }
  }
  setSignalClock(SUNSET_MINUTE);

  let nightFactor;
  function setNightFactor(factor) {
    const night = THREE.MathUtils.clamp(factor, 0, 1);
    if (night === nightFactor) return;
    nightFactor = night;
    const evening = Math.min(night / SUNSET_NIGHT_FACTOR, 1);
    const afterSunset = Math.max((night - SUNSET_NIGHT_FACTOR) / (1 - SUNSET_NIGHT_FACTOR), 0);
    const lateGlow = afterSunset * afterSunset * (3 - 2 * afterSunset);
    headMesh.material.emissiveIntensity = 1.2 * evening + 0.6 * lateGlow;
    lampGlowMaterial.opacity = 0.65 * evening + 0.26 * lateGlow;
    ordinaryLampGlowMaterial.opacity = 0.74 * lateGlow;
    for (const { halo, avenue } of lampHalos) {
      halo.visible = avenue ? lampGlowMaterial.opacity > 0 : ordinaryLampGlowMaterial.opacity > 0;
    }
    for (const { faceMaterial, haloMaterial } of neonLights) {
      faceMaterial.emissiveIntensity = 1.3 * evening + 0.65 * lateGlow;
      haloMaterial.opacity = 0.52 * evening + 0.25 * lateGlow;
    }
  }

  // Beach props: umbrellas, towels, benches, lifeguard tower.
  const umbrellaCount = 16;
  const poleMaterial = new THREE.MeshLambertMaterial({ color: 0xd8d2c4 });
  const umbrellaPole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 5).translate(0, 1.3, 0), poleMaterial, umbrellaCount);
  const umbrellaTop = new THREE.InstancedMesh(
    new THREE.ConeGeometry(1.9, 0.8, 8).translate(0, 2.7, 0),
    new THREE.MeshLambertMaterial({ color: 0xe2644f, flatShading: true }),
    umbrellaCount,
  );
  for (let umbrella = 0; umbrella < umbrellaCount; umbrella += 1) {
    const x = random.range(-520, -450);
    const z = -320 + umbrella * 41 + random.range(-6, 6);
    palmMatrix.makeTranslation(x, 0.1, z);
    umbrellaPole.setMatrixAt(umbrella, palmMatrix);
    umbrellaTop.setMatrixAt(umbrella, palmMatrix);
    const color = new THREE.Color(random.pick([0xe2644f, 0x49c6b8, 0xf2c14e, 0xe8e2d4]));
    umbrellaTop.setColorAt(umbrella, color);
  }
  umbrellaPole.instanceMatrix.needsUpdate = true;
  umbrellaTop.instanceMatrix.needsUpdate = true;
  if (umbrellaTop.instanceColor) umbrellaTop.instanceColor.needsUpdate = true;
  group.add(umbrellaPole, umbrellaTop);

  const benchGeometry = new THREE.BoxGeometry(0.7, 0.16, 2.6);
  const benchMesh = new THREE.InstancedMesh(benchGeometry, new THREE.MeshLambertMaterial({ color: 0x8a5f3d }), 18);
  for (let bench = 0; bench < 18; bench += 1) {
    const x = CITY.beachWestStart - 5 - (bench % 2) * 4;
    const z = -306 + bench * 35;
    palmMatrix.makeTranslation(x, 0.72, z);
    benchMesh.setMatrixAt(bench, palmMatrix);
    colliders.push({ minX: x - 0.35, maxX: x + 0.35, minZ: z - 1.3, maxZ: z + 1.3, height: 0.8 });
  }
  benchMesh.instanceMatrix.needsUpdate = true;
  group.add(benchMesh);

  const towelMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1.2, 0.03, 2.2),
    new THREE.MeshLambertMaterial({ color: 0xffffff }),
    14,
  );
  for (let towel = 0; towel < 14; towel += 1) {
    const x = random.range(-520, -450);
    const z = -280 + towel * 43 + random.range(-8, 8);
    palmMatrix.makeTranslation(x, 0.08, z);
    towelMesh.setMatrixAt(towel, palmMatrix);
    towelMesh.setColorAt(towel, new THREE.Color(random.pick([0x4f8fb0, 0xd0604c, 0xe9c75a, 0xffffff, 0x5aa88c])));
  }
  towelMesh.instanceMatrix.needsUpdate = true;
  if (towelMesh.instanceColor) towelMesh.instanceColor.needsUpdate = true;
  group.add(towelMesh);

  const towerMaterial = new THREE.MeshLambertMaterial({ color: 0xf0e6d2 });
  const tower = new THREE.Group();
  const towerBase = new THREE.Mesh(new THREE.BoxGeometry(5, 0.5, 5), towerMaterial);
  towerBase.position.y = 2.2;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(3.8, 2.5, 3.8), towerMaterial);
  cabin.position.y = 3.7;
  const towerRoof = new THREE.Mesh(new THREE.ConeGeometry(3.4, 1.6, 4), new THREE.MeshLambertMaterial({ color: 0xd0604c }));
  towerRoof.position.y = 5.8;
  towerRoof.rotation.y = Math.PI / 4;
  tower.add(towerBase, cabin, towerRoof);
  tower.position.set(-430, 0, 168);
  group.add(tower);
  for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.35, 2.2, 0.35), towerMaterial);
    post.position.set(-430 + dx, 1.1, 168 + dz);
    group.add(post);
  }
  colliders.push({ minX: -432.8, maxX: -427.2, minZ: 165.2, maxZ: 170.8, height: 6 });

  // Harbor: a pier on the west beach and shipping containers on the sand.
  const pier = new THREE.Group();
  const deck = new THREE.Mesh(new THREE.BoxGeometry(110, 0.5, 12), new THREE.MeshLambertMaterial({ color: 0x8d7350 }));
  deck.position.set(-500, 0.9, -160);
  pier.add(deck);
  for (let post = 0; post < 12; post += 1) {
    for (const side of [-5, 5]) {
      const piling = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 4.2, 5), new THREE.MeshLambertMaterial({ color: 0x5f4830 }));
      piling.position.set(-550 + post * 9, 0.3, -160 + side);
      pier.add(piling);
    }
  }
  group.add(pier);

  const containerColors = [0xb8503e, 0x3f7286, 0xd0a246, 0x5f7d4f, 0x9a5b48];
  for (let container = 0; container < 9; container += 1) {
    const width = random.range(2.5, 3.2);
    const depth = random.range(5.4, 7.4);
    const height = random.range(2.4, 2.9);
    const x = -482 - Math.floor(container / 3) * 12;
    const z = -180 + (container % 3) * 12 + random.range(-1.5, 1.5);
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, depth),
      new THREE.MeshLambertMaterial({ color: random.pick(containerColors) }),
    );
    mesh.position.set(x, height / 2 + 0.05, z);
    group.add(mesh);
    const box = { minX: x - width / 2, maxX: x + width / 2, minZ: z - depth / 2, maxZ: z + depth / 2, height };
    containers.push(box);
    colliders.push(box);
  }

  // A few curbside crates and planters for street-scale detail.
  const propBlocks = lotCenters.filter((center) => !center.isPark);
  for (let prop = 0; prop < 16; prop += 1) {
    const center = propBlocks[random.int(0, propBlocks.length - 1)];
    const side = random.chance(0.5) ? -1 : 1;
    const onX = random.chance(0.5);
    const x = center.x + (onX ? side * (CITY.block / 2 - 2) : random.range(-17, 17));
    const z = center.z + (onX ? random.range(-17, 17) : side * (CITY.block / 2 - 2));
    const size = random.range(0.8, 1.4);
    const crate = new THREE.Mesh(
      new THREE.BoxGeometry(size, size, size),
      new THREE.MeshLambertMaterial({ color: random.pick([0x7d6446, 0x8a7a5c, 0x6a7258]) }),
    );
    crate.position.set(x, 0.3 + size / 2, z);
    crate.rotation.y = random.range(0, Math.PI);
    if (isReserved(x, z)) continue;
    group.add(crate);
    const extent = (size * (Math.abs(Math.cos(crate.rotation.y)) + Math.abs(Math.sin(crate.rotation.y)))) / 2;
    colliders.push({ minX: x - extent, maxX: x + extent, minZ: z - extent, maxZ: z + extent, height: size + 0.3 });
  }

  const graph = buildRoadGraph();
  const spawnPlayer = { x: SPAWN.x, z: SPAWN.z, heading: SPAWN.heading ?? 0 };
  const spawnStarterCar = { x: STARTER_CAR.x, z: STARTER_CAR.z, heading: STARTER_CAR.heading ?? 0 };
  for (const [name, point, radius] of [['player', spawnPlayer, 0.45], ['starterCar', spawnStarterCar, 1.15]]) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.z) || !Number.isFinite(point.heading) || !pointIsClear(colliders, point.x, point.z, radius)) {
      throw new RangeError(`Configured ${name} spawn must be finite and clear of city colliders.`);
    }
  }

  const vehicleSpawnPoints = [];
  const pedestrianSpawnPoints = [];
  for (const edge of graph.edges) {
    // Short northern segments need endpoint approaches so successive race
    // checkpoints can stay separated without snapping back down the track.
    const stations = edge.zone === 'hills' ? [0.1, 0.25, 0.5, 0.75, 0.9] : [0.25, 0.5, 0.75];
    const heading = Math.atan2(edge.dx, edge.dz);
    const normalX = -edge.dz / edge.length;
    const normalZ = edge.dx / edge.length;
    for (let stationIndex = 0; stationIndex < stations.length; stationIndex += 1) {
      const t = stations[stationIndex];
      const centerX = edge.a.x + edge.dx * t;
      const centerZ = edge.a.z + edge.dz * t;
      for (const side of [-1, 1]) {
        const laneOffset = Math.min(4.2, edge.width / 2 - 1.6);
        const x = centerX + normalX * side * laneOffset;
        const z = centerZ + normalZ * side * laneOffset;
        if (pointIsClear(colliders, x, z, 1.3)) {
          vehicleSpawnPoints.push({ x, z, heading: side < 0 ? heading : heading + Math.PI, laneSide: side, edge, t: stations[stationIndex], edgeId: edge.a.id * graph.nodes.length + edge.b.id });
        }
        const pedestrianX = centerX + normalX * side * (edge.width / 2 + 3);
        const pedestrianZ = centerZ + normalZ * side * (edge.width / 2 + 3);
        if (pointIsClear(colliders, pedestrianX, pedestrianZ, 0.5)) {
          pedestrianSpawnPoints.push({
            x: pedestrianX,
            z: pedestrianZ,
            heading: side < 0 ? heading : heading + Math.PI,
            edgeId: edge.a.id * graph.nodes.length + edge.b.id,
          });
        }
      }
    }
  }

  const landmarks = {
    safehouse: { x: -216, z: 144, name: 'Moreno Garage' },
    client: { x: -288, z: 144, name: 'Hotel Azure' },
    garage: { x: -216, z: 144, name: 'Moreno Garage' },
    coupe: { x: 144, z: -72, name: 'Showroom Row' },
    raceStart: { x: -360, z: 288, name: 'Coast road' },
    heat: { x: -216, z: 144, name: 'Moreno Garage' },
    harbor: { x: -468, z: -144, name: 'Solmar Harbor' },
    police: { x: 0, z: 0, name: 'SMPD' },
    beach: { x: -468, z: 72, name: 'Solmar Beach' },
    downtown: { x: 72, z: 72, name: 'Downtown' },
    airfield: { x: 0, z: 432, name: 'Solmar Airfield' },
    hills: { x: 300, z: -560, name: 'North Hills' },
  };
  for (const key of Object.keys(landmarks)) labels.push(landmarks[key]);

  setNightFactor(SUNSET_NIGHT_FACTOR);
  return {
    group,
    graph,
    roadNetwork: graph,
    buildings,
    containers,
    colliders,
    setNightFactor,
    setSignalClock,
    spawnPoints: {
      player: spawnPlayer,
      starterCar: spawnStarterCar,
      vehicles: vehicleSpawnPoints,
      roadVehicles: vehicleSpawnPoints,
      trafficCars: vehicleSpawnPoints,
      pedestrians: pedestrianSpawnPoints,
      sidewalkPedestrians: pedestrianSpawnPoints,
    },
    landmarks,
    blockPitch,
    beach: { start: CITY.beachWestStart, end: CITY.beachWestEnd, axis: 'x' },
    // Walkable pads and beach are all at or below this height; used for spawn fall checks.
    groundHeight: 0.3,
  };
}

/** Push a circle (x, z, radius) out of every AABB it overlaps; returns the corrected position. */
export function resolveCollisions(colliders, x, z, radius) {
  let px = x;
  let pz = z;
  let hit = false;
  if (!Number.isFinite(px) || !Number.isFinite(pz) || !Number.isFinite(radius) || radius < 0 || !Array.isArray(colliders)) {
    return { x: px, z: pz, hit };
  }
  const boxes = colliders.filter((box) => box && Number.isFinite(box.minX) && Number.isFinite(box.maxX) && Number.isFinite(box.minZ) && Number.isFinite(box.maxZ) && box.maxX >= box.minX && box.maxZ >= box.minZ);
  const maxPasses = Math.min(6, boxes.length + 1);
  for (let pass = 0; pass < maxPasses; pass += 1) {
    let moved = false;
    for (const box of boxes) {
      const closestX = Math.max(box.minX, Math.min(box.maxX, px));
      const closestZ = Math.max(box.minZ, Math.min(box.maxZ, pz));
      const dx = px - closestX;
      const dz = pz - closestZ;
      const distanceSquared = dx * dx + dz * dz;
      const radiusSquared = radius * radius;
      if (distanceSquared > radiusSquared || (distanceSquared === radiusSquared && distanceSquared > 0)) continue;

      if (distanceSquared > 0) {
        const distance = Math.sqrt(distanceSquared);
        const push = radius - distance;
        px += (dx / distance) * push;
        pz += (dz / distance) * push;
      } else {
        const sides = [
          { distance: px - box.minX, x: box.minX - radius, z: pz },
          { distance: box.maxX - px, x: box.maxX + radius, z: pz },
          { distance: pz - box.minZ, x: px, z: box.minZ - radius },
          { distance: box.maxZ - pz, x: px, z: box.maxZ + radius },
        ];
        sides.sort((a, b) => a.distance - b.distance);
        px = sides[0].x;
        pz = sides[0].z;
      }
      hit = true;
      moved = true;
    }
    if (!moved) break;
  }
  return { x: px, z: pz, hit };
}

/** True on the west sand strip; ocean and the southern airfield are excluded. */
export function isOnSand(x, z) {
  return Number.isFinite(x) && Number.isFinite(z) && x <= CITY.beachWestStart && x >= CITY.beachWestEnd && Math.abs(z) <= CITY.half + 20;
}

export function clampToWorld(position) {
  if (!position || typeof position !== 'object') throw new TypeError('World position must be an object.');
  if (!Number.isFinite(position.x)) position.x = 0;
  if (!Number.isFinite(position.z)) position.z = 0;
  position.z = Math.max(RURAL.minZ, Math.min(CITY.airfield.maxZ - 6, position.z));
  // The hills connector reaches the city at z=-360. Choose the west bound from
  // the terrain band so crossing the grid edge can enter the sand or airport apron.
  const rural = position.z < CITY.nodeMin;
  const minX = rural ? RURAL.minX : CITY.beachWestEnd + 6;
  const maxX = rural ? RURAL.maxX : CITY.edge;
  position.x = Math.max(minX, Math.min(maxX, position.x));
  return position;
}
