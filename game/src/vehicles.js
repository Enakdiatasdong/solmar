// Arcade cars: box bodies with cabins, bumpers, lights and spinning wheels. Jax has a starter car,
// a handful of other cars are parked and stealable, and damaged cars smoke when wrecked. The
// driving model is deliberately simple: accelerate, brake/reverse, steer with speed-scaled grip,
// handbrake for a loose tail. Collision with buildings uses the city AABBs and the car's radius.
import * as THREE from '../vendor/three.module.min.js';
import { PALETTE, STARTER_CAR, VEHICLE, VEHICLE_TYPES } from './config.js';
import { clampToWorld, resolveCollisions } from './world.js';

const wheelGeometry = new THREE.CylinderGeometry(0.42, 0.42, 0.28, 10);
wheelGeometry.rotateZ(Math.PI / 2);
const wheelMaterial = new THREE.MeshLambertMaterial({ color: 0x1d1e21 });
const glassMaterial = new THREE.MeshLambertMaterial({ color: 0x24323c });
const lightMaterial = new THREE.MeshLambertMaterial({ color: 0xfff1c0, emissive: 0xffcf7a, emissiveIntensity: 0.6 });
const brakeMaterial = new THREE.MeshLambertMaterial({ color: 0xa32f2a, emissive: 0x8c1f1c, emissiveIntensity: 0.5 });

const trimMaterial = new THREE.MeshLambertMaterial({ color: 0x98a5a7 });
const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
const tubeGeometry = new THREE.CylinderGeometry(1, 1, 1, 8);
const up = new THREE.Vector3(0, 1, 0);

const EXPANSION_SPAWNS = [
  {
    id: 'bike-alley', landmark: 'downtown', clearance: 1.35,
    spec: { body: 0x37a997, cabin: 0x273237, name: 'Alley Scooter', variant: 'bike', tuning: VEHICLE_TYPES.bike },
    spots: [[0, -13, 0], [-13, 0, Math.PI / 2], [-28.8, 1, 0], [28.8, 1, 0], [1, -28.8, Math.PI / 2], [1, 28.8, Math.PI / 2]],
  },
  {
    id: 'truck-harbor', landmark: 'harbor', clearance: 3.55,
    spec: { body: 0xd08139, cabin: 0x354751, name: 'Harbor Hauler', variant: 'truck', tuning: VEHICLE_TYPES.truck },
    spots: [[2, -13, 0], [3, -16, 0], [16, -13, 0], [-10, -13, 0]],
  },
  {
    id: 'buggy-beach', landmark: 'beach', clearance: 2.45,
    spec: { body: 0xe3b33b, cabin: 0x333b42, name: 'Dune Buggy', variant: 'buggy', tuning: VEHICLE_TYPES.buggy },
    spots: [[8, 8, 0], [12, 12, 0], [-10, 8, 0]],
  },
  {
    id: 'sport-showroom', landmark: 'coupe', clearance: 2.55,
    spec: { body: 0xea5845, cabin: 0x262731, name: 'Solara Sport', variant: 'sport', tuning: VEHICLE_TYPES.sport },
    spots: [[1.6, 13, Math.PI], [-9.6, -12, Math.PI], [1.6, -15, 0], [-9.6, 12, 0]],
  },
  {
    id: 'vespera-gt', landmark: 'coupe', clearance: 2.7,
    spec: { body: 0xff5fa2, cabin: 0x8b315d, name: 'Vespera GT', variant: 'vespera', tuning: VEHICLE_TYPES.vespera },
    spots: [[15, 14, Math.PI], [18, -12, 0], [-18, 14, Math.PI], [20, 8, 0]],
  },
  {
    id: 'van-garage', landmark: 'garage', clearance: 2.7,
    spec: { body: 0x70a8c4, cabin: 0x2e3c48, name: 'Marina Mover', variant: 'cargovan', tuning: VEHICLE_TYPES.van },
    spots: [[5.8, 15, 0], [-5.8, 15, 0], [5.8, -15, Math.PI], [-5.8, -15, Math.PI]],
  },
];

function box(parent, material, width, height, depth, x, y, z) {
  const mesh = new THREE.Mesh(boxGeometry, material);
  mesh.scale.set(width, height, depth);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

function tube(parent, material, radius, start, end) {
  const from = new THREE.Vector3(...start);
  const axis = new THREE.Vector3(...end).sub(from);
  const mesh = new THREE.Mesh(tubeGeometry, material);
  mesh.position.copy(from).addScaledVector(axis, 0.5);
  mesh.scale.set(radius, axis.length(), radius);
  mesh.quaternion.setFromUnitVectors(up, axis.normalize());
  mesh.castShadow = true;
  parent.add(mesh);
}

function buildExpansionMesh(spec) {
  const group = new THREE.Group();
  const body = new THREE.MeshLambertMaterial({ color: spec.body });
  const trim = new THREE.MeshLambertMaterial({ color: spec.cabin });
  const wheels = [];
  function wheel(x, z, radius, width, steering = null) {
    const mesh = new THREE.Mesh(wheelGeometry, wheelMaterial);
    mesh.scale.set(width / 0.28, radius / 0.42, radius / 0.42);
    if (z > 0) {
      steering ??= new THREE.Group();
      steering.position.set(x, radius, z);
      group.add(steering);
      steering.add(mesh);
    } else {
      mesh.position.set(x, radius, z);
      group.add(mesh);
    }
    mesh.castShadow = true;
    for (const side of [-1, 1]) {
      const hub = new THREE.Mesh(tubeGeometry, trimMaterial);
      hub.rotation.z = Math.PI / 2;
      hub.position.x = side * 0.14;
      hub.scale.set(0.24, 0.045, 0.24);
      mesh.add(hub);
    }
    wheels.push({ mesh, front: z > 0, steering });
  }

  function axle(z, x, radius, width) {
    for (const side of [-1, 1]) wheel(side * x, z, radius, width);
  }

  function lamps(x, frontY, frontZ, rearY, rearZ) {
    for (const side of [-1, 1]) {
      box(group, lightMaterial, 0.35, 0.15, 0.08, side * x, frontY, frontZ);
      box(group, brakeMaterial, 0.3, 0.16, 0.08, side * x, rearY, rearZ);
    }
  }

  switch (spec.variant) {
    case 'bike': {
      const fork = new THREE.Group();
      wheel(0, 0.83, 0.35, 0.17, fork);
      wheel(0, -0.83, 0.35, 0.19);
      box(group, body, 0.51, 0.2, 1.3, 0, 0.44, -0.14);
      box(group, body, 0.5, 0.37, 0.68, 0, 0.68, -0.53);
      box(group, trim, 0.4, 0.14, 0.64, 0, 0.92, -0.49);
      box(group, brakeMaterial, 0.26, 0.1, 0.08, 0, 0.77, -0.88);
      for (const x of [-0.14, 0.14]) tube(fork, trimMaterial, 0.045, [x, 0, 0], [x, 0.88, -0.12]);
      box(fork, body, 0.49, 0.58, 0.22, 0, 0.48, -0.04).rotation.x = -0.14;
      box(fork, lightMaterial, 0.31, 0.18, 0.11, 0, 0.71, 0.12);
      tube(fork, trim, 0.044, [-0.38, 0.88, -0.12], [0.38, 0.88, -0.12]);
      break;
    }
    case 'truck':
      box(group, trim, 2.44, 0.35, 6.5, 0, 0.55, 0);
      box(group, body, 2.45, 1.76, 2.17, 0, 1.4, 2.07);
      box(group, glassMaterial, 2.05, 0.59, 0.08, 0, 1.88, 3.16);
      box(group, trim, 1.22, 0.3, 0.1, 0, 1, 3.18);
      box(group, trim, 2.73, 2.35, 4.03, 0, 1.96, -1.12);
      box(group, trimMaterial, 2.65, 0.14, 3.96, 0, 3.15, -1.12);
      for (const side of [-1, 1]) {
        box(group, glassMaterial, 0.08, 0.52, 1.27, side * 1.23, 1.86, 2.18);
        box(group, trim, 0.17, 0.23, 0.35, side * 1.31, 1.74, 2.87);
        for (const z of [-2.74, -1.99, -1.24, -0.49, 0.26]) {
          box(group, trimMaterial, 0.07, 2.22, 0.105, side * 1.37, 1.96, z);
        }
        box(group, trimMaterial, 0.08, 1.82, 0.06, side * 0.49, 1.96, -3.16);
      }
      lamps(0.94, 0.99, 3.18, 0.69, -3.24);
      axle(2.08, 1.11, 0.48, 0.38);
      axle(-1.28, 1.11, 0.48, 0.38);
      axle(-2.27, 1.11, 0.48, 0.38);
      break;
    case 'buggy':
      box(group, trim, 1.83, 0.25, 3.45, 0, 0.68, 0);
      box(group, body, 1.55, 0.35, 1.07, 0, 0.9, 1);
      box(group, body, 1.75, 0.24, 0.83, 0, 0.92, -1.24);
      for (const side of [-1, 1]) {
        const x = side * 0.81;
        box(group, trim, 0.49, 0.16, 0.53, side * 0.38, 0.9, -0.12);
        box(group, trim, 0.49, 0.65, 0.16, side * 0.38, 1.16, -0.46).rotation.x = 0.18;
        tube(group, body, 0.062, [x, 0.8, 1.25], [x, 1.91, 0.35]);
        tube(group, body, 0.062, [x, 1.91, 0.35], [x, 1.91, -0.63]);
        tube(group, body, 0.062, [x, 1.91, -0.63], [x, 0.8, -1.55]);
        tube(group, trimMaterial, 0.045, [x, 0.95, 0.89], [x, 0.95, -1.23]);
      }
      for (const z of [0.35, -0.63]) tube(group, body, 0.062, [-0.81, 1.91, z], [0.81, 1.91, z]);
      lamps(0.64, 0.96, 1.55, 0.92, -1.68);
      axle(1.24, 1.1, 0.55, 0.43);
      axle(-1.21, 1.1, 0.55, 0.43);
      break;
    case 'sport':
      box(group, trim, 2.29, 0.28, 4.38, 0, 0.36, 0);
      box(group, body, 2.37, 0.49, 4.45, 0, 0.63, 0);
      box(group, body, 2.2, 0.16, 1.18, 0, 0.79, 1.4).rotation.x = 0.085;
      box(group, glassMaterial, 1.7, 0.36, 1.74, 0, 0.99, -0.26);
      box(group, glassMaterial, 1.68, 0.08, 0.6, 0, 1.01, 0.75).rotation.x = 0.46;
      box(group, body, 1.61, 0.11, 1.5, 0, 1.22, -0.38);
      box(group, trim, 1.18, 0.1, 0.07, 0, 0.51, 2.24);
      box(group, trim, 2.16, 0.12, 0.38, 0, 1.13, -1.98);
      for (const x of [-0.68, 0.68]) box(group, trim, 0.12, 0.38, 0.16, x, 0.95, -1.98);
      lamps(0.83, 0.7, 2.24, 0.73, -2.24);
      axle(1.39, 1.08, 0.4, 0.33);
      axle(-1.41, 1.08, 0.42, 0.39);
      break;
    case 'vespera': {
      const underglow = new THREE.MeshLambertMaterial({ color: 0xff5fa2, emissive: 0xff2583, emissiveIntensity: 1.2 });
      const darkTrim = new THREE.MeshLambertMaterial({ color: 0x5e2949 });
      box(group, trim, 2.55, 0.28, 4.62, 0, 0.34, 0);
      box(group, body, 2.68, 0.46, 4.58, 0, 0.66, 0);
      box(group, body, 2.3, 0.14, 1.15, 0, 0.79, 1.47).rotation.x = 0.07;
      box(group, glassMaterial, 1.82, 0.38, 1.96, 0, 1.01, -0.22);
      box(group, glassMaterial, 1.75, 0.1, 0.68, 0, 1.07, 0.9).rotation.x = 0.4;
      box(group, body, 1.7, 0.13, 1.6, 0, 1.25, -0.45);
      box(group, darkTrim, 1.42, 0.11, 0.09, 0, 0.52, 2.31);
      box(group, darkTrim, 2.43, 0.14, 0.46, 0, 1.12, -2.08);
      for (const x of [-0.78, 0.78]) {
        box(group, darkTrim, 0.14, 0.42, 0.18, x, 0.99, -2.04);
        box(group, darkTrim, 0.14, 0.12, 4.08, x, 0.42, -0.05);
        tube(group, darkTrim, 0.055, [x * 0.72, 0.82, -1.42], [x * 0.72, 1.28, -1.9]);
      }
      box(group, body, 2.55, 0.1, 0.14, 0, 1.54, -2.11);
      box(group, underglow, 2.05, 0.045, 3.42, 0, 0.205, -0.04);
      lamps(0.96, 0.72, 2.27, 0.73, -2.31);
      axle(1.43, 1.2, 0.4, 0.35);
      axle(-1.49, 1.2, 0.44, 0.48);
      break;
    }
    case 'cargovan':
      box(group, trim, 2.16, 0.31, 4.95, 0, 0.47, 0);
      box(group, body, 2.29, 1.89, 3.26, 0, 1.46, -0.82);
      box(group, body, 2.18, 1.47, 1.6, 0, 1.22, 1.56);
      box(group, glassMaterial, 1.87, 0.64, 0.09, 0, 1.56, 2.37).rotation.x = 0.14;
      box(group, trim, 2.26, 0.17, 0.15, 0, 0.61, 2.42);
      box(group, trim, 0.035, 1.52, 0.05, 0, 1.45, -2.47);
      for (const side of [-1, 1]) {
        box(group, glassMaterial, 0.07, 0.53, 0.93, side * 1.11, 1.58, 1.66);
        box(group, trim, 0.05, 0.11, 3.09, side * 1.15, 0.84, -0.82);
        box(group, trim, 0.065, 0.07, 0.24, side * 1.15, 1.25, 0.41);
        box(group, trim, 0.19, 0.06, 0.055, side * 0.17, 1.36, -2.47);
      }
      lamps(0.83, 0.85, 2.37, 1.12, -2.48);
      axle(1.52, 1.02, 0.43, 0.28);
      axle(-1.49, 1.02, 0.43, 0.28);
      break;
  }
  return { group, wheels };
}

const serviceBoxGeometry = new THREE.BoxGeometry(1, 1, 1);
const serviceWhiteMaterial = new THREE.MeshLambertMaterial({ color: 0xf4f0de });
const serviceRedMaterial = new THREE.MeshLambertMaterial({ color: 0xd34340, emissive: 0x9f2927, emissiveIntensity: 0.45 });
const taxiSignMaterial = new THREE.MeshLambertMaterial({ color: 0xffe398, emissive: 0xc58c31, emissiveIntensity: 0.45 });
const deliveryMarkMaterial = new THREE.MeshLambertMaterial({ color: 0x3b9d9a });

const SERVICE_SPECS = [
  { body: 0xe9b743, cabin: 0x3a3020, name: 'Sun taxi', variant: 'sedan', job: 'taxi' },
  { body: 0xf2f2e9, cabin: 0xd8d9d4, name: 'Coast ambulance', variant: 'van', job: 'ambulance' },
  { body: 0xe0e0d8, cabin: 0x30343a, name: 'Pier van', variant: 'van', job: 'delivery' },
];

function serviceBox(group, material, x, y, z, width, height, depth) {
  const mesh = new THREE.Mesh(serviceBoxGeometry, material);
  mesh.position.set(x, y, z);
  mesh.scale.set(width, height, depth);
  group.add(mesh);
  return mesh;
}


function buildCarMesh(spec) {
  if (spec.tuning) return buildExpansionMesh(spec);
  const group = new THREE.Group();
  const bodyMaterial = new THREE.MeshLambertMaterial({ color: spec.body });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.62, 4.4), bodyMaterial);
  body.position.y = 0.66;
  body.castShadow = true;
  group.add(body);

  const lower = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.3, 4.1), new THREE.MeshLambertMaterial({ color: spec.cabin }));
  lower.position.y = 0.36;
  group.add(lower);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.56, 2.15), glassMaterial);
  cabin.position.set(0, 1.2, -0.15);
  cabin.castShadow = true;
  group.add(cabin);

  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.12, 2.2), bodyMaterial);
  roof.position.set(0, 1.51, -0.15);
  group.add(roof);

  if (spec.variant === 'van') {
    cabin.scale.set(0.96, 1.5, 1.3);
    cabin.position.set(0, 1.42, -0.1);
    roof.position.set(0, 1.9, -0.1);
  } else if (spec.variant === 'pickup') {
    cabin.scale.set(1, 0.9, 0.8);
    cabin.position.set(0, 1.13, -0.7);
    roof.position.set(0, 1.44, -0.7);
    const bed = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.4, 1.5), new THREE.MeshLambertMaterial({ color: spec.cabin }));
    bed.position.set(0, 1.06, 1.2);
    group.add(bed);
  } else if (spec.variant === 'coupe') {
    cabin.scale.set(0.94, 0.8, 0.86);
    cabin.position.set(0, 1.12, -0.35);
    roof.position.set(0, 1.38, -0.35);
    body.scale.set(1, 0.9, 1);
  }

  if (spec.job === 'taxi') {
    serviceBox(group, taxiSignMaterial, 0, 1.78, -0.1, 0.85, 0.34, 0.38);
    serviceBox(group, glassMaterial, 0, 1.78, 0.1, 0.44, 0.12, 0.02);
  } else if (spec.job === 'ambulance') {
    serviceBox(group, serviceWhiteMaterial, 0, 1.32, -0.65, 1.9, 1.05, 1.35);
    serviceBox(group, serviceRedMaterial, 0, 2.05, 0.45, 1.22, 0.22, 0.32);
    for (const side of [-1, 1]) {
      serviceBox(group, serviceRedMaterial, side * 0.96, 1.35, -0.65, 0.05, 0.62, 0.19);
      serviceBox(group, serviceRedMaterial, side * 0.97, 1.35, -0.65, 0.05, 0.19, 0.62);
    }
  } else if (spec.job === 'delivery') {
    serviceBox(group, serviceWhiteMaterial, 0, 1.3, -0.65, 1.9, 1.05, 1.4);
    for (const side of [-1, 1]) serviceBox(group, deliveryMarkMaterial, side * 0.96, 1.3, -0.65, 0.05, 0.42, 0.85);
  }

  for (const side of [-1, 1]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.08), lightMaterial);
    head.position.set(side * 0.68, 0.76, 2.2);
    group.add(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, 0.08), brakeMaterial);
    tail.position.set(side * 0.68, 0.78, -2.2);
    group.add(tail);
  }

  const wheels = [];
  for (const [x, z] of [[-1.04, 1.38], [1.04, 1.38], [-1.04, -1.38], [1.04, -1.38]]) {
    const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
    wheel.position.set(x, 0.42, z);
    wheel.castShadow = true;
    group.add(wheel);
    wheels.push({ mesh: wheel, front: z > 0 });
  }

  if (spec.police) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.18, 3.4), new THREE.MeshLambertMaterial({ color: spec.stripe }));
    stripe.position.y = 0.82;
    group.add(stripe);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.16, 0.3), new THREE.MeshLambertMaterial({ color: 0x1a1a1a }));
    bar.position.set(0, 1.64, -0.2);
    group.add(bar);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.32), new THREE.MeshLambertMaterial({ color: spec.lightAlt, emissive: spec.lightAlt, emissiveIntensity: 1.4 }));
    red.position.set(-0.3, 1.76, -0.2);
    group.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.32), new THREE.MeshLambertMaterial({ color: spec.light, emissive: spec.light, emissiveIntensity: 1.4 }));
    blue.position.set(0.3, 1.76, -0.2);
    group.add(blue);
    group.userData.lightbar = { red, blue };
  }

  return { group, wheels };
}

function addSmoke(car) {
  if (car.smoke) return car.smoke;
  const smoke = new THREE.Group();
  const material = new THREE.MeshLambertMaterial({ color: 0x66625e, transparent: true, opacity: 0.55 });
  const puffs = [];
  for (let puff = 0; puff < 5; puff += 1) {
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5 + puff * 0.09, 0), material.clone());
    mesh.position.y = 0.6 + puff * 0.28;
    mesh.visible = false;
    smoke.add(mesh);
    puffs.push(mesh);
  }
  smoke.visible = false;
  car.group.add(smoke);
  car.smoke = { group: smoke, puffs, material };
  return car.smoke;
}

export function createVehicles(city, scene) {
  const cityColliders = city?.colliders ?? [];
  const cars = [];
  const collisionGroups = [cars];
  const smokeMaterial = new THREE.MeshLambertMaterial({ color: 0x55524e, transparent: true, opacity: 0.5 });

  function addCar(spec, position, heading, options = {}) {
    const built = buildCarMesh(spec);
    const group = built.group;
    group.position.set(position.x, 0, position.z);
    group.rotation.y = heading;
    scene.add(group);
    const car = {
      id: options.id ?? `car-${cars.length}`,
      group,
      wheels: built.wheels,
      spec,
      tuning: spec.tuning ?? VEHICLE,
      state: {
        x: position.x,
        z: position.z,
        heading,
        speed: 0,
        steerAngle: 0,
        health: VEHICLE.health,
        maxHealth: VEHICLE.health,
        wrecked: false,
        occupied: false,
        stolen: Boolean(options.stolen),
        isPolice: Boolean(spec.police),
        wheelSpin: 0,
        bob: 0,
      },
      smoke: null,
      ai: options.ai ?? null,
      kind: options.kind ?? 'parked',
    };
    cars.push(car);
    return car;
  }

  function spawnStarter() {
    return addCar(
      { body: 0xc9a227, cabin: 0x2d2a22, name: 'Cometa GT', variant: 'coupe' },
      { x: STARTER_CAR.x, z: STARTER_CAR.z },
      STARTER_CAR.heading,
      { id: 'starter', stolen: true },
    );
  }

  function spawnParked(random) {
    const edges = city?.graph?.edges ?? [];
    const spots = [];
    for (const edge of edges) {
      for (const t of [0.22, 0.5, 0.78]) {
        const centerX = edge.a.x + edge.dx * t;
        const centerZ = edge.a.z + edge.dz * t;
        const normalX = -edge.dz / edge.length;
        const normalZ = edge.dx / edge.length;
        for (const side of [-1, 1]) {
          const x = centerX + normalX * side * 5.2;
          const z = centerZ + normalZ * side * 5.2;
          if (resolveCollisions(cityColliders, x, z, 2.25).hit) continue;
          spots.push({ x, z, heading: Math.atan2(edge.dx, edge.dz) });
        }
      }
    }
    // Add service vehicles before the boot-time parked snapshot. They remain available on
    // every restart, and their permits make an ordinary job entry free of a theft penalty.
    const start = city?.spawnPoints?.player ?? { x: 0, z: 96 };
    for (let index = 0; index < SERVICE_SPECS.length; index += 1) {
      const spec = SERVICE_SPECS[index];
      if (cars.some((car) => car.id === `job-${spec.job}`)) continue;
      const anchor = { x: start.x + (index - 1) * 30, z: start.z + 24 };
      const choices = spots.filter((spot) => !cars.some((car) => Math.hypot(car.state.x - spot.x, car.state.z - spot.z) < 12));
      choices.sort((a, b) => Math.hypot(a.x - anchor.x, a.z - anchor.z) - Math.hypot(b.x - anchor.x, b.z - anchor.z));
      const spot = choices[0];
      if (spot) addCar(spec, spot, spot.heading, { id: `job-${spec.job}`, kind: 'parked', stolen: true });
    }
    random.shuffle(spots);
    let spawned = 0;
    for (const spot of spots) {
      if (spawned >= 9) break;
      if (cars.some((car) => Math.hypot(car.state.x - spot.x, car.state.z - spot.z) < 12)) continue;
      const base = PALETTE.cars[spawned % PALETTE.cars.length];
      const variant = random.pick(['sedan', 'coupe', 'van', 'pickup']);
      const spec = {
        ...base,
        name: variant === 'coupe' ? 'Cometa GT' : variant === 'pickup' ? 'Bison Pickup' : variant === 'sedan' ? 'Vela Sedan' : 'Marina Van',
        variant,
      };
      addCar(spec, spot, spot.heading, { kind: 'parked' });
      spawned += 1;
    }
  }

  /** Expansion rides: one of each new type at its landmark, first clear spot wins. */
  function spawnExpansionVehicles() {
    const landmarks = city?.landmarks ?? {};
    for (const entry of EXPANSION_SPAWNS) {
      const landmark = landmarks[entry.landmark];
      if (!landmark) continue;
      for (const [dx, dz, heading] of entry.spots) {
        const x = landmark.x + dx;
        const z = landmark.z + dz;
        if (resolveCollisions(cityColliders, x, z, entry.clearance).hit) continue;
        if (cars.some((car) => Math.hypot(car.state.x - x, car.state.z - z) < entry.clearance + 2)) continue;
        addCar(entry.spec, { x, z }, heading, { id: entry.id, kind: 'parked' });
        break;
      }
    }
  }

  function spawnPoliceCar(x, z, heading) {    return addCar(
      { body: PALETTE.police.body, cabin: PALETTE.police.cabin, stripe: PALETTE.police.stripe, light: PALETTE.police.light, lightAlt: PALETTE.police.lightAlt, police: true, name: 'SMPD cruiser', variant: 'sedan' },
      { x, z },
      heading,
      { kind: 'police', ai: 'pursue' },
    );
  }

  function damage(car, amount) {
    if (car.state.wrecked) return;
    car.state.health = Math.max(0, car.state.health - amount);
    if (car.state.health <= 0) {
      car.state.wrecked = true;
      car.state.speed = 0;
      addSmoke(car).group.visible = true;
      car.group.rotation.z = car.state.isPolice ? 0 : 0.06;
    } else if (car.state.health < VEHICLE.smokeBelow) {
      addSmoke(car).group.visible = true;
    }
  }

  function repair(car) {
    car.state.health = car.state.maxHealth;
    car.state.wrecked = false;
    if (car.smoke) car.smoke.group.visible = false;
    car.group.rotation.z = 0;
  }

  /** The nearest car Jax may enter, looking from his current position. */
  function nearest(x, z, maxDistance = 4.5) {
    let best = null;
    let bestDistance = maxDistance;
    for (let index = 0; index < cars.length; index += 1) {
      const car = cars[index];
      if (car.state.wrecked) continue;
      const distance = Math.hypot(car.state.x - x, car.state.z - z);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = car;
      }
    }
    return best;
  }

  function resolveCarCollisions(car) {
    const state = car.state ?? car;
    const radius = car.tuning?.radius ?? VEHICLE.radius;
    for (const group of collisionGroups) {
      for (const other of group) {
        if (other === car) continue;
        const otherState = other.state ?? other;
        const dx = state.x - otherState.x;
        const dz = state.z - otherState.z;
        const distance = Math.hypot(dx, dz);
        const otherRadius = other.tuning?.radius ?? VEHICLE.radius;
        const separation = radius + otherRadius;
        if (distance >= separation) continue;
        const nx = distance > 0.001 ? dx / distance : Math.sin(state.heading);
        const nz = distance > 0.001 ? dz / distance : Math.cos(state.heading);
        const push = (separation - distance + 0.01) * 0.5;
        const position = clampToWorld(resolveCollisions(cityColliders, state.x + nx * push, state.z + nz * push, radius));
        const otherPosition = clampToWorld(resolveCollisions(cityColliders, otherState.x - nx * push, otherState.z - nz * push, otherRadius));
        state.x = position.x;
        state.z = position.z;
        otherState.x = otherPosition.x;
        otherState.z = otherPosition.z;
        const closingSpeed = (Math.sin(otherState.heading) * otherState.speed - Math.sin(state.heading) * state.speed) * nx
          + (Math.cos(otherState.heading) * otherState.speed - Math.cos(state.heading) * state.speed) * nz;
        if (closingSpeed > 0) {
          state.speed *= 0.55;
          otherState.speed *= 0.55;
          if (closingSpeed > 4) {
            const impactDamage = Math.min(4, closingSpeed * 0.15);
            if (car.state) damage(car, impactDamage);
            if (other.state) damage(other, impactDamage);
          }
        }
        car.group.position.set(state.x, 0, state.z);
        other.group.position.set(otherState.x, 0, otherState.z);
      }
    }
  }

  function stepCar(car, dt, controls, colliders = cityColliders) {
    const state = car.state;
    // Expansion rides carry their own tuning; older cars and police fall back to VEHICLE.
    const T = car.tuning ?? VEHICLE;
    const dirt = controls.surface === 'dirt' ? VEHICLE.dirt : null;
    const maxSpeed = T.maxSpeed * (dirt?.maxSpeed ?? 1);
    const accel = T.accel * (dirt?.accel ?? 1);

    if (state.wrecked) {
      state.speed *= Math.max(0, 1 - dt * 2.2);
    } else {
      const accelerating = Boolean(controls.accelerate);
      const braking = Boolean(controls.brake);
      if (accelerating && !braking) {
        if (state.speed < 0) state.speed = Math.min(0, state.speed + T.brake * dt);
        else state.speed += accel * dt;

      } else if (braking && !accelerating) {
        if (state.speed > 0) state.speed = Math.max(0, state.speed - T.brake * dt);
        else state.speed -= T.reverseAccel * dt;
      } else if (!accelerating && !braking) {
        const drag = state.speed < 0 ? T.drag : T.roll;
        state.speed -= Math.sign(state.speed) * Math.min(Math.abs(state.speed), drag * dt);
      }
      if (controls.handbrake) state.speed *= Math.max(0, 1 - T.handbrakeDrag * dt);
      state.speed = Math.max(-T.maxReverse, Math.min(maxSpeed, state.speed));
    }

    const speedRatio = Math.min(1, Math.abs(state.speed) / T.steerFadeSpeed);
    const steerInput = (controls.left ? 1 : 0) - (controls.right ? 1 : 0);
    const grip = (controls.handbrake ? 0.55 : 1) * (dirt?.grip ?? 1);
    const steeringBoost = dirt ? 1 + (1 - dirt.grip) * 2 : 1;
    const handling = (controls.handbrake ? T.handbrakeSteer : T.steer) / VEHICLE.steer;
    const maxSteer = (T.maxSteerLow + (T.maxSteerHigh - T.maxSteerLow) * speedRatio)
      * handling * grip * steeringBoost;
    const maxYawRate = T.maxYawRateLow + (T.maxYawRateHigh - T.maxYawRateLow) * speedRatio;
    // Limit the physical wheel angle as speed rises; heading and wheel visuals use
    // the same bicycle geometry. Signed speed naturally reverses the turn in reverse.
    const steerLimit = Math.min(maxSteer, Math.atan(maxYawRate * T.wheelbase / Math.max(0.001, Math.abs(state.speed))));
    state.steerAngle += (steerInput * steerLimit - state.steerAngle) * (1 - Math.exp(-dt * T.steerResponse));
    state.steerAngle = Math.max(-steerLimit, Math.min(steerLimit, state.steerAngle));
    const yawRate = state.speed / T.wheelbase * Math.tan(state.steerAngle);
    state.heading += yawRate * dt;

    const sin = Math.sin(state.heading);
    const cos = Math.cos(state.heading);
    let nextX = state.x + sin * state.speed * dt;
    let nextZ = state.z + cos * state.speed * dt;
    const resolved = resolveCollisions(colliders, nextX, nextZ, T.radius);
    if (resolved.hit) {
      const impact = Math.abs(state.speed);
      if (impact > T.crashSpeed) damage(car, impact * 0.9);
      state.speed *= 0.25;
      nextX = resolved.x;
      nextZ = resolved.z;
    }
    const bounded = clampToWorld({ x: nextX, z: nextZ });
    state.x = bounded.x;
    state.z = bounded.z;
    resolveCarCollisions(car);

    car.group.position.set(state.x, 0, state.z);
    car.group.rotation.y = state.heading;
    state.wheelSpin += state.speed * dt * 2.4;
    const spin = state.steerAngle;
    for (const wheel of car.wheels) {
      wheel.mesh.rotation.x = state.wheelSpin;
      if (wheel.front) (wheel.steering ?? wheel.mesh).rotation.y = spin;
    }
    if (car.smoke && car.smoke.group.visible) {
      for (let index = 0; index < car.smoke.puffs.length; index += 1) {
        const puff = car.smoke.puffs[index];
        const phase = (state.wheelSpin * 0.05 + index * 0.37) % 1;
        puff.position.y = 0.6 + phase * 2.2;
        puff.position.x = Math.sin(phase * 6 + index) * 0.25;
        puff.position.z = -1.6 + phase * 0.6;
        puff.scale.setScalar(0.6 + phase * 1.4);
        puff.visible = true;
        if (puff.material) puff.material.opacity = 0.5 * (1 - phase);
      }
    }
    if (car.group.userData.lightbar) {
      const flash = Math.floor(performance.now() / 260) % 2 === 0;
      car.group.userData.lightbar.red.visible = flash;
      car.group.userData.lightbar.blue.visible = !flash;
    }
  }

  function setCarPosition(car, x, z, heading) {
    car.state.x = x;
    car.state.z = z;
    car.state.heading = heading;
    // A placement/respawn starts with straight wheels, including the physical angle.
    car.state.steerAngle = 0;
    for (const wheel of car.wheels) {
      if (wheel.front) (wheel.steering ?? wheel.mesh).rotation.y = 0;
    }
    car.group.position.set(x, 0, z);
    car.group.rotation.y = heading;
  }

  return {
    cars,
    collisionGroups,
    scene,
    addCar,
    spawnStarter,
    spawnParked,
    spawnExpansionVehicles,
    spawnPoliceCar,
    damage,
    repair,
    nearest,
    resolveCarCollisions,
    stepCar,
    setCarPosition,
    smokeMaterial,
  };
}

/** Where Jax should stand when leaving a car: to the driver's left, clear of the body. */
export function exitSpot(car) {
  const heading = car.state.heading;
  const rightX = Math.cos(heading);
  const rightZ = -Math.sin(heading);
  return { x: car.state.x - rightX * 1.9, z: car.state.z - rightZ * 1.9, heading };
}
