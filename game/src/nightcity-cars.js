// Procedural bodies adapted from Night City Rush. The nose faces +Z.
// Provenance: clean-room rewrite (not copied) of the 7 procedural car models from ~/workspace/makefun-best-game-01-v2/entry/game/src/car-models.js + cars.js; team-authored source, no third-party assets.
import * as THREE from '../vendor/three.module.min.js';
import { VEHICLE, VEHICLE_TYPES } from './config.js';

const paintCache = new Map();
const wheelGeometryCache = new Map();
const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
const sphereGeometry = new THREE.SphereGeometry(0.5, 14, 10);
const exhaustGeometry = new THREE.CylinderGeometry(1, 1, 1, 10).rotateX(Math.PI / 2);
const materials = {
  glass: new THREE.MeshLambertMaterial({ color: 0x142832 }),
  darkGlass: new THREE.MeshLambertMaterial({ color: 0x09141c }),
  dark: new THREE.MeshLambertMaterial({ color: 0x11171d }),
  carbon: new THREE.MeshLambertMaterial({ color: 0x20272d }),
  tire: new THREE.MeshLambertMaterial({ color: 0x17191c }),
  alloy: new THREE.MeshLambertMaterial({ color: 0x9aa6aa }),
  chrome: new THREE.MeshLambertMaterial({ color: 0xc2c8c8 }),
  orange: new THREE.MeshLambertMaterial({ color: 0xff7900, emissive: 0x9b3700, emissiveIntensity: 0.2 }),
  headlight: new THREE.MeshLambertMaterial({ color: 0xe8ffff, emissive: 0x99dce4, emissiveIntensity: 0.8 }),
  tail: new THREE.MeshLambertMaterial({ color: 0xff4254, emissive: 0xa51524, emissiveIntensity: 0.65 }),
  taxiSign: new THREE.MeshLambertMaterial({ color: 0xffe398, emissive: 0xc58c31, emissiveIntensity: 0.6 }),
};

export const NIGHTCITY_PAINTS = [
  0xb73f3c, 0x2f7f75, 0xd2b24c, 0x4c6f9e, 0xe0e0d8, 0x7a4f8e,
  0x3c6b44, 0xc46a35, 0xf2f2f2, 0x111820, 0xd65b46, 0x3b82b8,
  0x77a65b, 0xe3b64f, 0x9ca7b2, 0x6e4a92,
];

function paintMaterial(color, full) {
  if (!paintCache.has(color)) paintCache.set(color, new THREE.MeshLambertMaterial({ color }));
  const paint = paintCache.get(color);
  // The garage respray mutates a driveable car's paint in place.
  return full ? paint.clone() : paint;
}

function wheelGeometries(radius) {
  if (!wheelGeometryCache.has(radius)) {
    const cylinder = (r, width, segments) => new THREE.CylinderGeometry(r, r, width, segments).rotateZ(Math.PI / 2);
    wheelGeometryCache.set(radius, {
      tire: cylinder(radius, 0.3, 16),
      rim: cylinder(radius * 0.64, 0.31, 12),
      hub: cylinder(radius * 0.24, 0.325, 10),
    });
  }
  return wheelGeometryCache.get(radius);
}

function makeCar(id, name, color, detail) {
  const full = detail !== 'light';
  const group = new THREE.Group();
  group.name = name;
  group.userData.modelId = id;
  group.userData.color = color;
  const paint = paintMaterial(color, full);
  const wheels = [];

  function box(partName, width, height, depth, x, y, z, material = paint, rotation = null) {
    const mesh = new THREE.Mesh(boxGeometry, material);
    mesh.name = partName;
    mesh.scale.set(width, height, depth);
    mesh.position.set(x, y, z);
    if (rotation) mesh.rotation.set(rotation[0] || 0, rotation[1] || 0, rotation[2] || 0);
    mesh.castShadow = full;
    group.add(mesh);
    return mesh;
  }

  function oval(partName, width, height, depth, x, y, z, material = paint) {
    const mesh = new THREE.Mesh(sphereGeometry, material);
    mesh.name = partName;
    mesh.scale.set(width, height, depth);
    mesh.position.set(x, y, z);
    mesh.castShadow = full;
    group.add(mesh);
    return mesh;
  }

  function wheel(side, z, radius, x, front) {
    const geometry = wheelGeometries(radius);
    const tire = new THREE.Mesh(geometry.tire, materials.tire);
    tire.name = 'wheel-tire';
    // Steering turns the axle; spin remains around its local X axis.
    tire.rotation.order = 'YXZ';
    tire.position.set(side * x, radius, z);
    tire.castShadow = full;
    group.add(tire);
    const rim = new THREE.Mesh(geometry.rim, materials.alloy);
    rim.name = 'wheel-rim';
    tire.add(rim);
    if (full) {
      const hub = new THREE.Mesh(geometry.hub, id === 'obsidian' ? materials.orange : materials.dark);
      hub.name = 'wheel-hub';
      tire.add(hub);
    }
    wheels.push({ mesh: tire, front });
  }

  function axlePair(wheelbase, radius, halfWidth) {
    for (const side of [-1, 1]) {
      wheel(side, wheelbase / 2, radius, halfWidth, true);
      wheel(side, -wheelbase / 2, radius, halfWidth, false);
    }
  }

  function lights(width, frontZ, rearZ, y = 0.78) {
    box('headlight-bar', width * 0.57, 0.13, 0.07, 0, y, frontZ, materials.headlight);
    box('tail-light-bar', width * 0.64, 0.12, 0.07, 0, y, rearZ, materials.tail);
  }

  function exhaust(x, y, z, radius = 0.1) {
    const pipe = new THREE.Mesh(exhaustGeometry, materials.chrome);
    pipe.name = 'exhaust-pipe';
    pipe.scale.set(radius, radius, 0.14);
    pipe.position.set(x, y, z);
    group.add(pipe);
    const opening = new THREE.Mesh(exhaustGeometry, materials.dark);
    opening.name = 'exhaust-opening';
    opening.scale.set(0.73, 0.73, 1.04);
    pipe.add(opening);
  }

  return { group, wheels, box, oval, axlePair, lights, exhaust };
}

function buildStandard(color, { detail = 'full' } = {}) {
  const c = makeCar('standard', 'APEX RS', color, detail);
  const { box, oval, axlePair } = c;
  box('classic-underbody', 2.04, 0.32, 4.32, 0, 0.45, 0, materials.dark);
  box('classic-coupe-body', 2.18, 0.56, 4.5, 0, 0.64, 0);
  box('long-hood', 1.82, 0.2, 1.72, 0, 0.95, 1.22);
  box('coupe-cabin', 1.64, 0.54, 2.2, 0, 1.2, -0.25, materials.glass);
  box('roof-panel', 1.7, 0.1, 1.54, 0, 1.49, -0.4);
  for (const side of [-1, 1]) {
    box('headlamp', 0.7, 0.15, 0.06, side * 0.68, 0.79, 2.27, materials.headlight);
    box('tail-lamp', 0.78, 0.13, 0.06, side * 0.66, 0.8, -2.27, materials.tail);
  }
  box('rear-spoiler', 2.1, 0.1, 0.34, 0, 1.15, -1.96, materials.carbon);
  axlePair(2.76, 0.44, 1.08);
  if (detail === 'full') {
    box('windshield', 1.48, 0.42, 0.08, 0, 1.24, 0.63, materials.darkGlass, [-0.47, 0, 0]);
    box('rear-glass', 1.37, 0.34, 0.08, 0, 1.23, -1.12, materials.darkGlass, [0.47, 0, 0]);
    box('front-bumper', 2.21, 0.14, 0.2, 0, 0.43, 2.21, materials.carbon);
    box('rear-bumper', 2.18, 0.14, 0.2, 0, 0.43, -2.21, materials.carbon);
    for (const side of [-1, 1]) {
      box('classic-door-line', 0.035, 0.35, 1.0, side * 1.095, 0.75, -0.12, materials.dark);
      box('side-trim', 0.06, 0.09, 2.05, side * 1.09, 0.48, -0.04, materials.chrome);
      oval('round-headlamp', 0.16, 0.13, 0.07, side * 0.69, 0.82, 2.3, materials.headlight);
      oval('rear-marker', 0.12, 0.11, 0.07, side * 0.7, 0.82, -2.31, materials.tail);
    }
    box('front-grille', 0.56, 0.24, 0.08, 0, 0.65, 2.29, materials.dark);
    box('rear-deck', 1.74, 0.13, 0.7, 0, 0.92, -1.77);
    box('spoiler-support-left', 0.08, 0.2, 0.08, -0.64, 1.14, -1.85, materials.carbon);
    box('spoiler-support-right', 0.08, 0.2, 0.08, 0.64, 1.14, -1.85, materials.carbon);
  }
  return { group: c.group, wheels: c.wheels };
}

function buildObsidian(color, { detail = 'full' } = {}) {
  const c = makeCar('obsidian', 'OBSIDIAN GT', color, detail);
  const { box, oval, axlePair, lights } = c;
  box('low-wide-undertray', 2.2, 0.21, 4.5, 0, 0.39, 0, materials.carbon);
  box('low-hypercar-body', 2.3, 0.42, 4.55, 0, 0.57, 0);
  box('low-front-hood', 1.7, 0.16, 1.5, 0, 0.79, 1.28);
  oval('narrow-canopy', 1.48, 0.41, 1.72, 0, 0.96, -0.2, materials.darkGlass);
  box('low-roof-cap', 1.22, 0.08, 0.72, 0, 1.16, -0.36);
  lights(2.3, 2.28, -2.28, 0.72);
  box('high-orange-wing', 2.7, 0.11, 0.42, 0, 1.72, -1.94, materials.orange);
  for (const side of [-1, 1]) box('wing-strut', 0.1, 0.93, 0.12, side * 0.7, 1.24, -1.86, materials.carbon);
  axlePair(2.9, 0.43, 1.15);
  if (detail === 'full') {
    box('orange-front-splitter', 2.35, 0.08, 0.45, 0, 0.3, 2.08, materials.orange);
    box('orange-roof-scoop', 0.4, 0.15, 0.54, 0, 1.34, -0.27, materials.orange);
    for (const side of [-1, 1]) {
      box('orange-side-aero', 0.12, 0.13, 2.45, side * 1.15, 0.36, -0.02, materials.orange);
      box('orange-hood-slash', 0.07, 0.025, 0.92, side * 0.56, 0.89, 1.34, materials.orange);
      box('side-intake', 0.09, 0.32, 0.72, side * 1.14, 0.68, -0.54, materials.dark);
      oval('headlamp', 0.45, 0.08, 0.09, side * 0.72, 0.77, 2.29, materials.headlight);
    }
    box('orange-rear-frame', 2.0, 0.08, 0.1, 0, 0.49, -2.3, materials.orange);
    box('rear-diffuser', 1.9, 0.1, 0.5, 0, 0.27, -2.12, materials.carbon);
    box('center-exhaust', 0.42, 0.18, 0.12, 0, 0.62, -2.25, materials.chrome);
  }
  return { group: c.group, wheels: c.wheels };
}

function buildThunder(color, { detail = 'full', suv = false, taxi = false } = {}) {
  const id = suv ? 'suv' : 'thunder';
  const name = suv ? 'SOLMAR SUV' : 'THUNDER SEDAN';
  const width = suv ? 2.35 : 2.48;
  const length = suv ? 4.95 : 5.4;
  const cabinY = suv ? 1.35 : 1.19;
  const roofY = suv ? 1.79 : 1.56;
  const c = makeCar(id, name, color, detail);
  const { box, axlePair, lights } = c;
  box('widebody-undertray', width - 0.2, 0.24, length - 0.28, 0, 0.4, 0, materials.dark);
  box('four-door-body', width, suv ? 0.57 : 0.48, length - 0.18, 0, suv ? 0.73 : 0.71, -0.01);
  box('long-hood', width * 0.78, 0.2, 1.72, 0, 0.86, 1.48);
  box('four-door-greenhouse', width * 0.75, suv ? 0.76 : 0.65, suv ? 2.98 : 2.34, 0, cabinY, -0.52, materials.glass);
  box('roof', width * 0.79, 0.13, suv ? 2.55 : 1.95, 0, roofY, -0.53);
  lights(width, length / 2 - 0.085, -length / 2 + 0.07, suv ? 0.87 : 0.82);
  if (!suv) {
    box('hood-scoop', 0.78, 0.14, 0.55, 0, 1.02, 1.5, materials.dark);
    box('high-rear-wing', 2.86, 0.12, 0.45, 0, 1.82, -2.12, materials.carbon);
    for (const side of [-1, 1]) box('wing-strut', 0.13, 0.83, 0.14, side * 0.72, 1.36, -2.05, materials.carbon);
    if (taxi) {
      box('taxi-sign', 0.55, 0.17, 0.28, 0, 1.71, -0.15, materials.taxiSign);
      c.group.userData.taxi = true;
    }
  }
  axlePair(suv ? 3.1 : 3.35, suv ? 0.52 : 0.46, suv ? 1.08 : 1.22);
  if (suv) {
    box('roof-rail-left', 0.08, 0.09, 2.42, -0.84, roofY + 0.103, -0.52, materials.chrome);
    box('roof-rail-right', 0.08, 0.09, 2.42, 0.84, roofY + 0.103, -0.52, materials.chrome);
  }
  if (detail === 'full') {
    box('front-bumper', width, 0.24, 0.25, 0, 0.54, length / 2 - 0.08, materials.carbon);
    box('rear-bumper', width, 0.2, 0.22, 0, 0.49, -length / 2 + 0.08, materials.carbon);
    if (!suv) box('scoop-highlight', 0.6, 0.04, 0.42, 0, 1.09, 1.5, materials.chrome);
    for (const side of [-1, 1]) {
      box('side-door-front', 0.06, 0.36, 0.92, side * (width / 2 - 0.02), 0.77, 0.53);
      box('side-door-rear', 0.06, 0.36, 0.92, side * (width / 2 - 0.02), 0.77, -0.65);
      box('door-seam', 0.025, 0.36, 0.04, side * (width / 2 + 0.004), 0.77, -0.05, materials.dark);
      box('window-pillar', 0.055, suv ? 0.75 : 0.63, 0.08, side * (width * 0.375), cabinY, -0.41);
      box('front-door-handle', 0.045, 0.045, 0.17, side * (width / 2 + 0.018), 0.91, 0.26, materials.alloy);
      box('rear-door-handle', 0.045, 0.045, 0.17, side * (width / 2 + 0.018), 0.91, -0.87, materials.alloy);
      box('side-skirt', 0.14, 0.11, 3.72, side * (width / 2 - 0.04), 0.34, -0.04, materials.carbon);
      box('front-fender', 0.3, 0.32, 1.16, side * 0.95, 0.74, 1.36);
      box('rear-fender', 0.34, 0.34, 1.16, side * 0.96, 0.73, -1.42);
      box('headlamp', 0.62, 0.12, 0.08, side * 0.73, 0.84, length / 2 - 0.08, materials.headlight);
      if (!suv) {
        box('wing-endplate', 0.08, 0.38, 0.42, side * 1.38, 1.63, -2.12, materials.carbon);
      } else {
        box('raised-wheel-arch', 0.11, 0.3, 0.95, side * 1.13, 0.79, 0.0, materials.carbon);
      }
    }
    box('wide-grille', 1.46, 0.3, 0.08, 0, 0.65, length / 2 + 0.02, materials.dark);
    box('rear-diffuser', 2.0, 0.11, 0.48, 0, 0.28, -length / 2 + 0.03, materials.carbon);
  }
  return { group: c.group, wheels: c.wheels };
}

function buildGullwing(color, { detail = 'full' } = {}) {
  const c = makeCar('gullwing', 'GULLWING GT', color, detail);
  const { box, oval, axlePair } = c;
  box('flowing-floor', 2.02, 0.2, 4.62, 0, 0.34, 0, materials.carbon);
  oval('flowing-body', 2.16, 0.61, 4.8, 0, 0.6, 0);
  oval('long-front-bonnet', 1.78, 0.32, 1.65, 0, 0.7, 1.34);
  oval('closed-canopy', 1.62, 0.84, 2.68, 0, 0.98, -0.2, materials.darkGlass);
  oval('curved-roof-cap', 1.39, 0.19, 1.43, 0, 1.32, -0.29);
  box('rear-lamp-fascia', 1.86, 0.39, 0.23, 0, 0.66, -2.19);
  for (const side of [-1, 1]) {
    oval('slim-headlamp', 0.49, 0.09, 0.16, side * 0.7, 0.79, 2.08, materials.headlight);
    for (const offset of [0.44, 0.77]) {
      oval('round-tail-lamp', 0.18, 0.18, 0.08, side * offset, 0.79, -2.31, materials.tail);
    }
  }
  axlePair(2.94, 0.43, 1.06);
  if (detail === 'full') {
    for (const side of [-1, 1]) {
      oval('front-haunch', 0.48, 0.5, 1.58, side * 0.87, 0.69, 1.31);
      oval('rear-haunch', 0.51, 0.54, 1.55, side * 0.87, 0.69, -1.36);
      box('gullwing-door-panel', 0.07, 0.35, 1.14, side * 1.01, 0.65, 0.18);
      box('door-outline-upper', 0.035, 0.035, 1.4, side * 0.76, 1.27, -0.22, materials.chrome);
      box('door-outline-side', 0.035, 0.76, 0.035, side * 1.06, 0.94, -0.2, materials.chrome);
      oval('side-intake', 0.13, 0.34, 0.62, side * 1.08, 0.7, -0.6, materials.dark);
      oval('mirror', 0.22, 0.1, 0.26, side * 1.09, 1.02, 0.64);
    }
    box('front-mouth', 1.22, 0.18, 0.08, 0, 0.48, 2.27, materials.dark);
    box('small-tail-lip', 1.72, 0.1, 0.25, 0, 0.95, -2.12);
    box('rear-mesh-cavity', 1.76, 0.23, 0.06, 0, 0.49, -2.33, materials.dark);
    box('rear-diffuser', 1.88, 0.08, 0.55, 0, 0.27, -2.12, materials.carbon);
  }
  return { group: c.group, wheels: c.wheels };
}

function buildTeardrop(color, { detail = 'full' } = {}) {
  const c = makeCar('teardrop', 'TEARDROP GT', color, detail);
  const { box, oval, axlePair } = c;
  box('undertray', 2.05, 0.15, 4.52, 0, 0.31, 0, materials.carbon);
  oval('rounded-body', 2.3, 0.64, 4.7, 0, 0.59, 0.02);
  oval('broad-curved-hood', 2.06, 0.35, 2.1, 0, 0.77, 1.24);
  oval('central-canopy-bubble', 1.68, 1.02, 2.28, 0, 0.95, -0.17, materials.darkGlass);
  oval('rounded-roof-shell', 1.29, 0.19, 1.1, 0, 1.39, -0.34);
  oval('raised-roof-scoop', 0.4, 0.18, 0.56, 0, 1.51, -0.28);
  oval('ducktail', 1.77, 0.16, 0.37, 0, 0.84, -1.95);
  oval('rounded-rear-deck', 2.05, 0.34, 1.68, 0, 0.73, -1.47);
  for (const side of [-1, 1]) {
    oval('curved-tail-lamp', 0.6, 0.1, 0.08, side * 0.62, 0.79, -2.13, materials.tail);
    if (detail === 'light') oval('jewel-lamp-strip', 0.15, 0.11, 0.49, side * 0.84, 0.85, 1.9, materials.headlight).rotation.x = 0.35;
  }
  axlePair(2.8, 0.43, 1.12);
  if (detail === 'full') {
    for (const side of [-1, 1]) {
      oval('flowing-front-fender', 0.5, 0.51, 1.62, side * 0.9, 0.72, 1.16);
      oval('flowing-rear-fender', 0.57, 0.57, 1.56, side * 0.9, 0.72, -1.3);
      oval('sculpted-door', 0.22, 0.32, 1.25, side * 1.03, 0.63, 0.08);
      oval('side-intake', 0.13, 0.34, 0.59, side * 1.13, 0.72, -0.52, materials.dark);
      const housing = oval('jewel-lamp-housing', 0.34, 0.13, 0.72, side * 0.86, 0.88, 1.91, materials.carbon);
      housing.rotation.x = 0.38;
      for (let i = 0; i < 4; i += 1) {
        oval('headlight-jewel', 0.115, 0.095, 0.12, side * (0.88 - i * 0.018), 0.99 - i * 0.06, 1.68 + i * 0.17, materials.headlight);
      }
    }
    box('rear-valance', 1.84, 0.23, 0.14, 0, 0.57, -2.2);
    box('rear-diffuser', 1.68, 0.07, 0.54, 0, 0.27, -2.11, materials.carbon);
  }
  return { group: c.group, wheels: c.wheels };
}

function buildCompact(color, { detail = 'full' } = {}) {
  const c = makeCar('compact', 'COMPACT COUPE', color, detail);
  const { box, oval, axlePair, exhaust } = c;
  box('short-undertray', 1.72, 0.16, 3.82, 0, 0.32, 0, materials.carbon);
  oval('short-rounded-body', 1.88, 0.53, 4.14, 0, 0.57, -0.02);
  box('front-bumper', 1.72, 0.28, 0.26, 0, 0.61, 1.95);
  oval('long-compact-hood', 1.7, 0.23, 1.6, 0, 0.78, 1.11);
  oval('compact-canopy', 1.38, 0.5, 1.52, 0, 1.05, -0.28, materials.darkGlass);
  box('compact-roof-panel', 1.3, 0.09, 1.16, 0, 1.27, -0.28);
  box('rear-deck', 1.61, 0.32, 0.43, 0, 0.7, -1.81);
  box('integrated-ducktail', 1.64, 0.13, 0.3, 0, 0.89, -1.86);
  for (const side of [-1, 1]) {
    oval('headlamp', 0.22, 0.12, 0.08, side * 0.63, 0.75, 2.07, materials.headlight);
    oval('round-tail-lamp', 0.18, 0.18, 0.08, side * 0.61, 0.76, -2.04, materials.tail);
  }
  axlePair(2.62, 0.43, 0.99);
  if (detail === 'full') {
    box('windscreen', 1.25, 0.34, 0.07, 0, 1.08, 0.44, materials.glass, [-0.54, 0, 0]);
    box('rear-glass', 1.18, 0.29, 0.07, 0, 1.05, -1.04, materials.glass, [0.5, 0, 0]);
    for (const side of [-1, 1]) {
      oval('round-headlight-pod', 0.28, 0.13, 0.32, side * 0.57, 0.88, 1.52);
      box('door-skin', 0.06, 0.3, 1.08, side * 0.94, 0.67, -0.18);
      box('side-intake', 0.08, 0.24, 0.44, side * 0.96, 0.66, -0.7, materials.dark);
      oval('low-mirror', 0.17, 0.09, 0.22, side * 1.0, 1.02, 0.44);
    }
    box('single-front-intake', 0.98, 0.14, 0.07, 0, 0.53, 2.03, materials.dark);
    box('short-splitter', 1.78, 0.06, 0.3, 0, 0.34, 1.93, materials.carbon);
    box('rear-valance', 1.62, 0.19, 0.16, 0, 0.56, -1.96);
    exhaust(0, 0.49, -2.08, 0.095);
  }
  return { group: c.group, wheels: c.wheels };
}

function buildGrandtourer(color, { detail = 'full' } = {}) {
  const c = makeCar('grandtourer', 'GRAND TOURER', color, detail);
  const { box, oval, axlePair, lights, exhaust } = c;
  box('grand-tourer-underbody', 2.08, 0.2, 4.98, 0, 0.4, 0, materials.carbon);
  box('long-fastback-body', 2.16, 0.38, 4.7, 0, 0.62, -0.02);
  box('extra-long-hood', 1.88, 0.2, 2.55, 0, 0.81, 1.23);
  box('nose', 1.98, 0.27, 0.54, 0, 0.61, 2.32);
  oval('rear-set-fastback-canopy', 1.75, 0.67, 1.95, 0, 1.11, -0.72, materials.darkGlass);
  oval('fastback-roof-cap', 1.58, 0.16, 1.25, 0, 1.43, -0.77);
  lights(2.25, 2.56, -2.35, 0.83);
  box('integrated-ducktail', 1.8, 0.14, 0.44, 0, 0.85, -2.13);
  axlePair(3.18, 0.44, 1.03);
  if (detail === 'full') {
    box('sloped-windshield', 1.62, 0.43, 0.07, 0, 1.2, 0.08, materials.glass, [-0.62, 0, 0]);
    box('fastback-rear-glass', 1.52, 0.4, 0.07, 0, 1.16, -1.63, materials.glass, [0.62, 0, 0]);
    for (const side of [-1, 1]) {
      box('long-front-fender', 0.37, 0.31, 1.26, side * 0.91, 0.69, 1.33);
      box('rear-fender', 0.4, 0.34, 1.06, side * 0.93, 0.69, -1.41);
      box('grand-tourer-door', 0.07, 0.34, 1.25, side * 1.08, 0.75, -0.3);
      box('side-intake', 0.07, 0.29, 0.62, side * 1.1, 0.69, -0.94, materials.dark);
      oval('pointed-headlamp', 0.42, 0.1, 0.17, side * 0.72, 0.84, 2.48, materials.headlight);
      oval('low-mirror', 0.19, 0.1, 0.24, side * 1.08, 1.06, 0.1);
    }
    box('front-intake', 1.34, 0.21, 0.07, 0, 0.55, 2.58, materials.dark);
    box('rear-panel', 1.92, 0.22, 0.09, 0, 0.61, -2.36, materials.dark);
    box('quad-exhaust-panel', 1.62, 0.15, 0.11, 0, 0.55, -2.43, materials.carbon);
    for (const x of [-0.68, -0.23, 0.23, 0.68]) exhaust(x, 0.57, -2.49);
    box('rear-diffuser', 1.9, 0.09, 0.5, 0, 0.28, -2.2, materials.carbon);
  }
  return { group: c.group, wheels: c.wheels };
}

function buildSuv(color, options) {
  return buildThunder(color, { ...options, suv: true });
}

export const NIGHTCITY_MODELS = [
  { id: 'standard', name: 'APEX RS', blurb: 'Classic street coupe with a short rear spoiler.', build: buildStandard, tuning: { ...VEHICLE, wheelbase: 2.76, radius: 1.15 }, radius: 1.15, length: 4.5, width: 2.18 },
  { id: 'obsidian', name: 'OBSIDIAN GT', blurb: 'Low hypercar with orange aero and a tall wing.', build: buildObsidian, tuning: { ...VEHICLE_TYPES.vespera, wheelbase: 2.9, radius: 1.2 }, radius: 1.2, length: 4.7, width: 2.3 },
  { id: 'thunder', name: 'THUNDER SEDAN', blurb: 'Four-door sedan with a long hood and raised wing.', build: buildThunder, tuning: { ...VEHICLE, accel: 13, maxSpeed: 30, steer: 1.95, radius: 1.35, wheelbase: 3.35 }, radius: 1.35, length: 5.4, width: 2.48 },
  { id: 'gullwing', name: 'GULLWING GT', blurb: 'Curved closed canopy with four round rear lamps.', build: buildGullwing, tuning: { ...VEHICLE_TYPES.sport, wheelbase: 2.94, radius: 1.2 }, radius: 1.2, length: 4.85, width: 2.18 },
  { id: 'teardrop', name: 'TEARDROP GT', blurb: 'Rounded bubble body, jewel lamps and a roof scoop.', build: buildTeardrop, tuning: { ...VEHICLE_TYPES.sport, wheelbase: 2.8, radius: 1.2 }, radius: 1.2, length: 4.8, width: 2.38 },
  { id: 'compact', name: 'COMPACT COUPE', blurb: 'Short coupe with a ducktail and single exhaust.', build: buildCompact, tuning: { ...VEHICLE_TYPES.sport, maxSpeed: 34, accel: 17, wheelbase: 2.62, radius: 1.15 }, radius: 1.15, length: 4.2, width: 1.92 },
  { id: 'grandtourer', name: 'GRAND TOURER', blurb: 'Long-hood fastback with four exhaust pipes.', build: buildGrandtourer, tuning: { ...VEHICLE_TYPES.vespera, wheelbase: 3.18, radius: 1.25 }, radius: 1.25, length: 5.2, width: 2.32 },
  { id: 'suv', name: 'SOLMAR SUV', blurb: 'Raised four-door utility vehicle with roof rails.', build: buildSuv, tuning: { ...VEHICLE_TYPES.van, wheelbase: 3.1, radius: 1.25, maxSpeed: 28 }, radius: 1.25, length: 4.95, width: 2.35 },
];

export function buildNightCityCar(id, color, options = {}) {
  const model = NIGHTCITY_MODELS.find((entry) => entry.id === id) ?? NIGHTCITY_MODELS[0];
  return model.build(color, options);
}
