import * as THREE from '../vendor/three.module.min.js';
import { CITY, PALETTE, TRAFFIC } from './config.js';
import { roadConflict } from './roads.js';

const SAND_Y = 0.04;
const WATER_Y = -0.12;
const SHORE_X = CITY.oceanWestStart;
const WHITE = 0xffefd8;
const BEACH_COLORS = [0xd95846, 0x2ca2a5, 0xe5ae46, 0x658bbf, 0xbf5e83, 0x68a37d];

// Place the whole set or actor, including the full swept footprint of a patrol.
function clear(x, minZ, maxZ, halfWidth, halfDepth) {
  return !roadConflict({ minX: x - halfWidth, maxX: x + halfWidth,
    minZ: minZ - halfDepth, maxZ: maxZ + halfDepth });
}

function moveAlongShore(root, elapsed, start, end, speed, offset) {
  const length = end - start;
  const distance = (elapsed * speed + offset) % (2 * length);
  const forward = distance < length;
  root.position.z = start + (forward ? distance : 2 * length - distance);
  root.rotation.y = forward ? 0 : Math.PI;
}

export function createBeachActivity(parent) {
  const group = new THREE.Group();
  group.name = 'Solmar beach activity';
  parent.add(group);
  const counts = { npcs: 0, walkers: 0, swimmers: 0, sunbathers: 0, vendors: 0,
    volleyballPlayers: 0, umbrellas: 0, chairs: 0, kiosks: 0, boats: 0, movingBoats: 0, courts: 0 };
  const props = [], canopies = [], lamps = [];
  const people = [], hulls = [], boatLamps = [], volleyballs = [];
  const staticRoots = [], actors = [];
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const matte = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const lit = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const tint = new THREE.Color();
  const motionBounds = new THREE.Box3(new THREE.Vector3(SHORE_X - 53, -1.5, -367),
    new THREE.Vector3(CITY.beachWestStart, 6, 367));

  function rootAt(x, y, z, yaw = 0) {
    const root = new THREE.Object3D();
    root.position.set(x, y, z);
    root.rotation.y = yaw;
    return root;
  }

  function part(batch, root, color, x, y, z, width, height, depth, tilt = 0) {
    const node = new THREE.Object3D();
    node.position.set(x, y, z);
    node.scale.set(width, height, depth);
    node.rotation.x = tilt;
    root.add(node);
    batch.push({ node, color });
    return node;
  }

  // Use the same proportions and colors as the road pedestrians, with beachwear.
  function person(batch, root, index) {
    const skin = PALETTE.npc.skin[index % PALETTE.npc.skin.length];
    const shirt = BEACH_COLORS[index % BEACH_COLORS.length];
    const shorts = BEACH_COLORS[(index + 2) % BEACH_COLORS.length];
    part(batch, root, shirt, 0, 1.18, 0, 0.46, 0.62, 0.28);
    part(batch, root, skin, 0, 1.68, 0, 0.30, 0.32, 0.28);
    part(batch, root, 0x352720, 0, 1.85, -0.025, 0.32, 0.12, 0.28);
    const legs = [], arms = [];
    for (const side of [-1, 1]) {
      const leg = new THREE.Object3D();
      leg.position.set(side * 0.12, 0.81, 0);
      root.add(leg);
      legs.push(leg);
      part(batch, leg, shorts, 0, -0.16, 0, 0.19, 0.37, 0.21);
      part(batch, leg, skin, 0, -0.52, 0, 0.14, 0.41, 0.15);
      const arm = new THREE.Object3D();
      arm.position.set(side * 0.30, 1.40, 0);
      root.add(arm);
      arms.push(arm);
      part(batch, arm, skin, 0, -0.23, 0, 0.13, 0.55, 0.14);
    }
    counts.npcs += 1;
    return { legs, arms };
  }

  // Leave gaps for the inlet, marina fingers, pier and causeway. The walking
  // lanes sit west of the existing towels and umbrellas but still on the sand.
  const walks = [[-343, -265], [-241, -190], [-111, -77], [-48, -18], [24, 51],
    [108, 160], [171, 221], [232, 275], [301, 354]];
  walks.forEach(([start, end], index) => {
    const x = SHORE_X + 6 + (index % 3) * 0.8;
    if (!clear(x, start, end, 1, 1)) return;
    const root = rootAt(x, SAND_Y, start);
    const { legs, arms } = person(people, root, index);
    const speed = TRAFFIC.pedSpeedMin + (TRAFFIC.pedSpeedMax - TRAFFIC.pedSpeedMin) * (index % 4) / 3;
    const offset = (end - start) * (0.36 + (index % 3) * 0.55);
    actors.push({ root, pose(time) {
      moveAlongShore(root, time, start, end, speed, offset);
      const stride = Math.sin(time * speed * 5.8 + index) * 0.59;
      root.position.y = SAND_Y + Math.abs(stride) * 0.07;
      legs[0].rotation.x = arms[1].rotation.x = stride;
      legs[1].rotation.x = arms[0].rotation.x = -stride;
    } });
    counts.walkers += 1;
  });

  [-309, -216, -34, 129, 235, 335].forEach((z, index) => {
    const x = SHORE_X - 8 - (index % 3) * 2;
    if (!clear(x, z - 4, z + 4, 1.8, 2.2)) return;
    const root = rootAt(x, WATER_Y, z);
    const { arms } = person(people, root, index + 2);
    actors.push({ root, pose(time) {
      // Tilt the body into the water, leaving the head and each raised arm visible.
      const glide = time * (0.28 + (index % 3) * 0.04) + index * 2;
      root.rotation.y = Math.cos(glide) > 0 ? 0 : Math.PI;
      root.rotation.x = 1.07;
      root.position.z = z + Math.sin(glide) * 4;
      root.position.y = WATER_Y - 0.69 + Math.sin(time * 2.2 + index) * 0.10;
      const stroke = Math.sin(time * 2.7 + index) * 1.18;
      arms[0].rotation.x = -0.92 + stroke;
      arms[1].rotation.x = -0.92 - stroke;
    } });
    counts.swimmers += 1;
  });

  const loungeSpots = [[SHORE_X + 14, -286], [-442, -212], [SHORE_X + 14, 38],
    [SHORE_X + 14, 143], [-444, 211], [SHORE_X + 14, 319]];
  loungeSpots.forEach(([x, z], index) => {
    if (!clear(x, z, z, 3.7, 4.2)) return;
    const color = BEACH_COLORS[index];
    const root = rootAt(x, SAND_Y, z, index % 2 ? Math.PI / 14 : -Math.PI / 14);
    staticRoots.push(root);
    part(canopies, root, color, 0, 2.53, 0, 2.25, 0.88, 2.25);
    part(props, root, WHITE, 0, 1.20, 0, 0.095, 2.40, 0.095);
    part(props, root, color, -1.02, 0.047, 0.35, 0.96, 0.07, 2.25);
    part(props, root, WHITE, -1.02, 0.088, -0.58, 0.95, 0.014, 0.13);
    part(props, root, WHITE, -1.02, 0.088, 1.28, 0.95, 0.014, 0.13);
    const lounger = rootAt(-1.02, 0.25, 1.26);
    root.add(lounger);
    lounger.rotation.x = -Math.PI / 2;
    person(props, lounger, index + 1);
    part(props, root, WHITE, 1.05, 0.36, 0.43, 0.81, 0.11, 1.72);
    part(props, root, color, 1.05, 0.62, -0.35, 0.82, 0.10, 0.82, 0.71);
    for (const side of [-1, 1]) {
      part(props, root, WHITE, 1.05 + side * 0.31, 0.19, 0.43, 0.10, 0.38, 1.42);
    }
    counts.sunbathers += 1;
    counts.umbrellas += 1;
    counts.chairs += 1;
  });

  [[-425, -275], [-427, -79], [-431, 51], [-422, 136], [-432, 315]].forEach(([x, z], index) => {
    if (!clear(x, z, z, 3.6, 4)) return;
    const color = BEACH_COLORS[index];
    // Face the serving counter towards the promenade and the beachfront road.
    const root = rootAt(x, SAND_Y, z, Math.PI / 2);
    staticRoots.push(root);
    part(props, root, 0x9d714c, 0, 0.60, 0.98, 4.84, 1.2, 0.70);
    part(props, root, WHITE, 0, 1.26, 0.98, 5.04, 0.16, 0.88);
    part(props, root, 0xcdac80, 0, 1.09, -1.54, 5.04, 2.18, 0.22);
    part(props, root, color, 0, 2.83, -0.1, 5.60, 0.21, 3.73, 0.075);
    part(props, root, color, 0, 2.57, 1.72, 5.60, 0.42, 0.19);
    part(lamps, root, 0xffd995, 0, 2.58, 1.83, 4.8, 0.15, 0.06);
    for (const side of [-1, 1]) {
      part(props, root, 0x8f6546, side * 2.45, 1.33, 1.47, 0.16, 2.66, 0.16);
      part(lamps, root, 0xffd995, side * 1.45, 2.4, 1.49, 0.22, 0.32, 0.22);
      part(props, root, side > 0 ? 0x88b28c : 0x3f8b9c, side * 1.6, 1.47, 0.95, 0.55, 0.27, 0.34);
    }
    if (index === 0 || index === 2 || index === 3) {
      const vendor = rootAt(0.45, 0, -0.25);
      root.add(vendor);
      person(props, vendor, index + 4);
      counts.vendors += 1;
    }
    counts.kiosks += 1;
  });

  const courtX = -440, courtZ = 121;
  if (clear(courtX, courtZ, courtZ, 5, 9)) {
    const root = rootAt(courtX, SAND_Y, courtZ);
    staticRoots.push(root);
    for (const side of [-1, 1]) {
      part(props, root, 0xe0b44f, side * 4.28, 1.27, 0, 0.19, 2.54, 0.19);
      part(props, root, WHITE, side * 4, 0.025, 0, 0.12, 0.035, 16.12);
      part(props, root, WHITE, 0, 0.025, side * 8, 8, 0.035, 0.12);
    }
    part(props, root, WHITE, 0, 2.43, 0, 8.55, 0.12, 0.07);
    // Batch the small ribs as boxes so the net stays visible from either side.
    for (let i = -14; i <= 14; i += 1) part(props, root, 0x44616a, i * 0.288, 1.92, 0, 0.026, 1.02, 0.026);
    for (let i = 0; i < 5; i += 1) part(props, root, 0x44616a, 0, 1.42 + i * 0.214, 0, 8.55, 0.026, 0.026);
    [[-2, -4], [2, -5.9], [-2, 5.9], [2, 4]].forEach(([dx, dz], index) => {
      const player = rootAt(courtX + dx, SAND_Y, courtZ + dz, dz > 0 ? Math.PI : 0);
      const { arms } = person(people, player, index + 3);
      actors.push({ root: player, pose(time) {
        player.position.x = courtX + dx + Math.sin(time * 0.9 + index) * 0.65;
        const reach = -0.65 - Math.max(0, Math.sin(time * 1.75 + index * 1.6)) * 1.42;
        arms[0].rotation.x = reach;
        arms[1].rotation.x = reach - 0.15;
      } });
      counts.volleyballPlayers += 1;
    });
    const ball = rootAt(courtX, SAND_Y, courtZ);
    part(volleyballs, ball, WHITE, 0, 0, 0, 0.25, 0.25, 0.25);
    actors.push({ root: ball, pose(time) {
      const arc = time * 1.75;
      ball.position.set(courtX + Math.sin(arc * 0.5) * 1.7,
        2.1 + Math.abs(Math.sin(arc)) * 1.65, courtZ + Math.cos(arc) * 4.5);
    } });
    counts.courts += 1;
  }

  const outline = new THREE.Shape();
  outline.moveTo(-0.41, 0.5);
  outline.lineTo(-0.5, 0.17);
  outline.lineTo(-0.36, -0.27);
  outline.lineTo(0, -0.5);
  outline.lineTo(0.36, -0.27);
  outline.lineTo(0.5, 0.17);
  outline.lineTo(0.41, 0.5);
  outline.closePath();
  const hullGeometry = new THREE.ExtrudeGeometry(outline, { depth: 1, bevelEnabled: false })
    .rotateX(-Math.PI / 2).translate(0, -0.5, 0);
  const boats = [[SHORE_X - 19, -260], [SHORE_X - 21, 42], [SHORE_X - 22, 224],
    [SHORE_X - 34, -342, -195], [SHORE_X - 38, 118, 248]];
  boats.forEach(([x, start, end = start], index) => {
    if (!clear(x, start, end, 4.2, 4.2)) return;
    const moving = end > start;
    const yaw = (index - 1) * 0.66;
    const root = rootAt(x, WATER_Y + 0.18, start, yaw);
    const color = BEACH_COLORS[(index + 1) % BEACH_COLORS.length];
    part(hulls, root, color, 0, 0, 0, 2.4, 0.67, 6.56);
    part(hulls, root, WHITE, 0, 0.32, 0.02, 2.43, 0.28, 6.64);
    part(people, root, 0xcfa97b, 0, 0.48, -0.32, 1.48, 0.10, 1.78);
    part(people, root, WHITE, 0, 0.76, -1.23, 1.12, 0.40, 0.37);
    part(people, root, 0x446373, 0, 1.03, 0.43, 1.35, 0.45, 0.13, -0.26);
    part(boatLamps, root, 0xff6758, -0.84, 0.49, 0.82, 0.12, 0.12, 0.14);
    part(boatLamps, root, 0x61f2af, 0.84, 0.49, 0.82, 0.12, 0.12, 0.14);
    actors.push({ root, pose(time) {
      if (moving) moveAlongShore(root, time, start, end, 2.3 - index * 0.11, (end - start) * 0.42);
      root.position.y = WATER_Y + 0.18 + Math.sin(time * 1.55 + index) * 0.086;
      root.rotation.z = Math.sin(time * 0.95 + index) * 0.055;
    } });
    counts.boats += 1;
    if (moving) counts.movingBoats += 1;
  });

  function batch(name, geometry, material, parts, dynamic = false) {
    const mesh = new THREE.InstancedMesh(geometry, material, parts.length);
    mesh.name = name;
    if (dynamic) {
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.boundingSphere = motionBounds.getBoundingSphere(new THREE.Sphere());
    }
    for (let i = 0; i < parts.length; i += 1) mesh.setColorAt(i, tint.setHex(parts[i].color));
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    group.add(mesh);
    return { mesh, parts };
  }

  function sync({ mesh, parts }) {
    for (let i = 0; i < parts.length; i += 1) mesh.setMatrixAt(i, parts[i].node.matrixWorld);
    mesh.instanceMatrix.needsUpdate = true;
  }

  for (const root of staticRoots) root.updateMatrixWorld(true);
  sync(batch('Beach furniture, kiosks and sunbathers', cube, matte, props));
  sync(batch('Beach umbrella canopies', new THREE.CylinderGeometry(0.13, 1, 1, 8), matte, canopies));
  sync(batch('Kiosk lanterns', cube, lit, lamps));
  const animated = [batch('Beach pedestrians and skiff fittings', cube, matte, people, true),
    batch('Skiff hulls', hullGeometry, matte, hulls, true), batch('Skiff lanterns', cube, lit, boatLamps, true),
    batch('Volleyball', new THREE.OctahedronGeometry(1), matte, volleyballs, true)];

  let elapsed = 0;
  function update(dt) {
    elapsed += dt;
    for (const actor of actors) {
      actor.pose(elapsed);
      actor.root.updateMatrixWorld(true);
    }
    for (const item of animated) sync(item);
  }
  update(0);

  return { group, counts, update };
}
