import * as THREE from '../vendor/three.module.min.js';
import { clampToWorld, resolveCollisions, isOnSand } from './world.js';

let nextCarId = 1;
const wrapAngle = angle => Math.atan2(Math.sin(angle), Math.cos(angle));
const paintColors = [0xe6a23c, 0x119d9a, 0xf46d55, 0xf4e9cd, 0x5d6b9c, 0xbf6389];

// Static pieces sharing paint become one draw call; wheels and flashing lamps stay editable.
function batchBody(group, excluded) {
  const batches = new Map();
  for (const mesh of [...group.children]) {
    if (!mesh.isMesh || excluded.has(mesh)) continue;
    mesh.updateMatrix();
    const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    geometry.applyMatrix4(mesh.matrix);
    const key = mesh.material.uuid;
    if (!batches.has(key)) batches.set(key, { material: mesh.material, positions: [], normals: [], uvs: [] });
    const batch = batches.get(key);
    for (const [name, destination] of [['position', batch.positions], ['normal', batch.normals], ['uv', batch.uvs]]) {
      const attribute = geometry.getAttribute(name);
      if (attribute) for (const value of attribute.array) destination.push(value);
    }
    geometry.dispose();
    mesh.geometry.dispose();
    group.remove(mesh);
  }
  for (const batch of batches.values()) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(batch.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(batch.normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(batch.uvs, 2));
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, batch.material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
}

export function createCar(options = {}) {
  const group = new THREE.Group();
  const body = new THREE.MeshLambertMaterial({ color: options.color ?? 0x17a8a2 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x17272f });
  const glass = new THREE.MeshLambertMaterial({ color: 0x315765 });
  const chrome = new THREE.MeshLambertMaterial({ color: 0xb9c5bb });
  const tire = new THREE.MeshLambertMaterial({ color: 0x172024 });
  const frontLight = new THREE.MeshBasicMaterial({ color: 0xffefb4 });
  const rearLight = new THREE.MeshBasicMaterial({ color: 0xfd493b });
  const box = (w, h, d, material, x, y, z) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };
  box(2.1, .62, 4.65, body, 0, .76, 0);
  box(1.88, .24, 1.35, body, 0, 1.12, 1.37);
  box(1.76, .69, 2.12, glass, 0, 1.3, -.2);
  box(1.81, .12, 1.55, body, 0, 1.69, -.3);
  box(.12, .69, 2.1, body, -.89, 1.3, -.2);
  box(.12, .69, 2.1, body, .89, 1.3, -.2);
  box(2.15, .18, .18, chrome, 0, .58, 2.31);
  box(2.15, .18, .18, chrome, 0, .58, -2.31);
  box(.75, .2, .05, dark, 0, .82, 2.34);
  for (const side of [-1, 1]) {
    box(.48, .22, .08, frontLight, side * .73, .9, 2.35);
    box(.54, .2, .08, rearLight, side * .7, .9, -2.35);
    box(.24, .14, .32, body, side * 1.12, 1.25, .55);
  }
  const wheels = [];
  for (const x of [-1.05, 1.05]) {
    for (const z of [-1.48, 1.5]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(.46, .46, .29, 12), tire);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, .47, z);
      group.add(wheel);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(.22, .22, .31, 8), chrome);
      hub.rotation.z = Math.PI / 2;
      hub.position.copy(wheel.position);
      group.add(hub);
      wheels.push(wheel);
    }
  }
  const smoke = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(.4, 0), new THREE.MeshBasicMaterial({ color: 0x3a4146, transparent: true, opacity: .48, depthWrite: false }));
    smoke.add(puff);
  }
  group.add(smoke);
  smoke.visible = false;
  let beacon = null;
  if (options.isPolice) {
    body.color.setHex(0xf3edda);
    box(2.12, .38, 1.2, dark, 0, .88, 0);
    box(1.3, .12, .5, dark, 0, 1.82, -.3);
    const red = box(.57, .19, .42, new THREE.MeshBasicMaterial({ color: 0xff453c }), -.34, 1.97, -.3);
    const blue = box(.57, .19, .42, new THREE.MeshBasicMaterial({ color: 0x3a9bfd }), .34, 1.97, -.3);
    beacon = { red, blue };
  }
  batchBody(group, new Set([...wheels, ...(beacon ? [beacon.red, beacon.blue] : [])]));
  const car = {
    id: nextCarId++, x: options.x ?? 0, z: options.z ?? 96,
    heading: options.heading ?? 0, speed: options.speed ?? 0,
    health: options.health ?? 100, group, isPolice: !!options.isPolice,
    parked: options.parked ?? true, stolen: !!options.stolen, wrecked: false,
    driver: null, vx: 0, vz: 0, radius: 1.85, impactCooldown: 0,
    contactCooldown: 0, drift: 0, smokeTime: 0, wheels, smoke, beacon,
    starter: !!options.starter, mission: options.mission ?? null, paintMaterial: body,
  };
  syncCar(car);
  return car;
}

export function syncCar(car) {
  car.group.position.set(car.x, 0, car.z);
  car.group.rotation.y = car.heading;
}

export function exitSpot(car) {
  return { x: car.x + Math.cos(car.heading) * 2.8, z: car.z - Math.sin(car.heading) * 2.8 };
}

export function createVehicles(city, scene) {
  const cars = [];
  function spawnCar(options = {}) {
    const car = createCar(options);
    cars.push(car);
    scene.add(car.group);
    return car;
  }
  function remove(car) {
    const index = cars.indexOf(car);
    if (index >= 0) cars.splice(index, 1);
    scene.remove(car.group);
    car.removed = true;
  }
  function damage(car, amount) {
    if (!car || car.wrecked) return;
    car.health = Math.max(0, car.health - Math.max(0, amount));
    if (car.health === 0) {
      car.wrecked = true;
      car.speed = 0;
      car.vx = 0;
      car.vz = 0;
      car.paintMaterial.color.multiplyScalar(.48);
    }
  }
  function spawnParked() {
    if (!cars.some(car => car.starter && !car.removed)) {
      spawnCar({ x: 3.7, z: 91.5, heading: 0, color: 0xeb9a39, starter: true });
    }
    const points = city.spawnPoints?.parkedCars ?? [];
    let count = 0;
    for (const point of points) {
      if (count >= 25) break;
      const p = { x: point.x, z: point.z };
      const test = resolveCollisions(city.colliders, p.x, p.z, 2.3);
      if (test.hit || cars.some(other => Math.hypot(other.x - p.x, other.z - p.z) < 13)) continue;
      spawnCar({ ...p, heading: point.heading ?? 0, color: paintColors[count % paintColors.length] });
      count++;
    }
    return cars;
  }
  function spawnPoliceCar(x, z) {
    const car = spawnCar({ x, z, isPolice: true, parked: false });
    car.driver = 'police';
    return car;
  }
  function nearest(x, z, radius = 5) {
    let result = null, distance = radius;
    for (const car of cars) {
      if (car.removed || !car.group.visible || car.driver) continue;
      const d = Math.hypot(car.x - x, car.z - z);
      if (d < distance) { distance = d; result = car; }
    }
    return result;
  }
  function stepCar(car, dt, controls = {}) {
    if (!car || car.removed) return;
    car.impactCooldown = Math.max(0, car.impactCooldown - dt);
    const throttle = Math.max(-1, Math.min(1, Number(controls.throttle) || 0));
    const steer = Math.max(-1, Math.min(1, Number(controls.steer) || 0));
    if (car.wrecked) { car.speed = 0; syncCar(car); return; }
    if (throttle !== 0) {
      const braking = car.speed * throttle < -1;
      car.speed += throttle * (braking ? 23 : 11.5) * dt;
    } else {
      car.speed *= Math.exp(-.58 * dt);
      if (Math.abs(car.speed) < .08) car.speed = 0;
    }
    if (controls.handbrake) car.speed *= Math.exp(-1.35 * dt);
    const onSand = isOnSand(car.x, car.z);
    if (onSand) car.speed *= Math.exp(-.27 * dt);
    car.speed = Math.max(-10, Math.min(onSand ? 23 : 33, car.speed));
    const steeringStrength = Math.min(1, Math.abs(car.speed) / 7);
    const steerRate = controls.handbrake ? 1.9 : 1.17;
    car.heading = wrapAngle(car.heading - steer * steerRate * steeringStrength * Math.sign(car.speed) * dt);
    const grip = controls.handbrake ? 1.7 : (onSand ? 4.2 : 8.5);
    const blend = 1 - Math.exp(-grip * dt);
    car.vx += (Math.sin(car.heading) * car.speed - car.vx) * blend;
    car.vz += (Math.cos(car.heading) * car.speed - car.vz) * blend;
    const nextX = car.x + car.vx * dt;
    const nextZ = car.z + car.vz * dt;
    const resolved = resolveCollisions(city.colliders, nextX, nextZ, car.radius);
    const clamped = clampToWorld(resolved.x, resolved.z, car.radius);
    const hit = resolved.hit || Math.abs(clamped.x - resolved.x) > .01 || Math.abs(clamped.z - resolved.z) > .01;
    car.x = clamped.x;
    car.z = clamped.z;
    if (hit) {
      const impact = Math.abs(car.speed);
      if (impact > 2.2 && car.impactCooldown <= 0) {
        damage(car, 3 + impact * 1.25);
        car.impactCooldown = .35;
      }
      car.speed *= .2;
      car.vx *= .13;
      car.vz *= .13;
    }
    for (const wheel of car.wheels) wheel.rotation.x += car.speed * dt * 1.4;
    syncCar(car);
  }
  function resolveCarCollisions(extraCars = []) {
    const all = [...new Set([...cars, ...extraCars])].filter(car => !car.removed && car.group.visible);
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i], b = all[j];
        const dx = b.x - a.x, dz = b.z - a.z;
        const min = (a.radius ?? 1.85) + (b.radius ?? 1.85);
        const distance = Math.hypot(dx, dz);
        if (distance >= min) continue;
        const nx = distance > .001 ? dx / distance : 1;
        const nz = distance > .001 ? dz / distance : 0;
        const overlap = min - distance + .025;
        const aFixed = a.parked && !a.driver, bFixed = b.parked && !b.driver;
        const aShare = aFixed && !bFixed ? 0 : (bFixed && !aFixed ? 1 : .5);
        a.x -= nx * overlap * aShare;
        a.z -= nz * overlap * aShare;
        b.x += nx * overlap * (1 - aShare);
        b.z += nz * overlap * (1 - aShare);
        const relative = Math.abs((b.vx ?? 0) - (a.vx ?? 0)) + Math.abs((b.vz ?? 0) - (a.vz ?? 0));
        if (relative > 3 && (a.contactCooldown ?? 0) <= 0 && (b.contactCooldown ?? 0) <= 0) {
          damage(a, Math.min(12, 1 + relative * .25));
          damage(b, Math.min(12, 1 + relative * .25));
          a.contactCooldown = b.contactCooldown = .4;
          a.speed *= .75;
          b.speed *= .75;
        }
        syncCar(a);
        syncCar(b);
      }
    }
  }
  function update(dt) {
    for (const car of cars) {
      car.contactCooldown = Math.max(0, (car.contactCooldown ?? 0) - dt);
      car.smokeTime += dt;
      car.smoke.visible = car.health < 34;
      if (car.smoke.visible) {
        for (let i = 0; i < car.smoke.children.length; i++) {
          const phase = (car.smokeTime * .7 + i / 5) % 1;
          const puff = car.smoke.children[i];
          puff.position.set(Math.sin(i * 5 + phase) * phase * .8, 1.2 + phase * 3.4, 1.1 - phase * .5);
          puff.scale.setScalar(.45 + phase * 1.6);
          puff.material.opacity = (1 - phase) * .52;
        }
      }
      if (car.beacon) {
        const flash = Math.sin(car.smokeTime * 14) > 0;
        car.beacon.red.visible = flash;
        car.beacon.blue.visible = !flash;
      }
    }
  }
  function reset() {
    for (const car of [...cars]) remove(car);
    spawnParked();
  }
  return { cars, spawnCar, spawnParked, spawnPoliceCar, stepCar, nearest, damage, remove, resolveCarCollisions, update, reset };
}
