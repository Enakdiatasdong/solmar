import * as THREE from '../vendor/three.module.min.js';
import { VEHICLE, PLAYER, PALETTE } from './config.js';
import { resolveCollisions, clampToWorld, isOnSand } from './world.js';

export function exitSpot(car) {
  return { x: car.x + Math.cos(car.heading) * 3, z: car.z - Math.sin(car.heading) * 3, heading: car.heading };
}

export function createVehicles(city, scene) {
  const cars = [];
  let sequence = 0;
  const paintColors = [0xe5735e, 0x339b9d, 0xf0c66b, 0x7886a0, 0xe2ded0, 0x565872];
  const rubber = new THREE.MeshStandardMaterial({ color: 0x171f29, roughness: 0.9 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xaac3c6, metalness: 0.75, roughness: 0.3 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x1a4b60, metalness: 0.25, roughness: 0.16 });
  const lamp = new THREE.MeshStandardMaterial({ color: 0xffedb3, emissive: 0xffdfaa, emissiveIntensity: 0.08 });
  const tail = new THREE.MeshStandardMaterial({ color: 0xdf4d40, emissive: 0xd92924, emissiveIntensity: 0.08 });
  const unlitLamp = new THREE.MeshStandardMaterial({ color: 0xd6bb86, roughness: 0.45 });
  const unlitTail = new THREE.MeshStandardMaterial({ color: 0x934338, roughness: 0.45 });
  const beamCanvas = document.createElement('canvas');
  beamCanvas.width = 64; beamCanvas.height = 128;
  const beamInk = beamCanvas.getContext('2d');
  beamInk.scale(1, 2);
  for (const x of [25, 39]) {
    const beam = beamInk.createRadialGradient(x, 34, 0, x, 34, 23);
    beam.addColorStop(0, 'rgba(255,255,255,0.66)');
    beam.addColorStop(0.45, 'rgba(255,255,255,0.32)');
    beam.addColorStop(1, 'rgba(255,255,255,0)');
    beamInk.fillStyle = beam;
    beamInk.fillRect(0, 0, 64, 64);
  }
  const beamMaterial = new THREE.MeshBasicMaterial({ color: 0xffdb9a, map: new THREE.CanvasTexture(beamCanvas), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const beamGeometry = new THREE.PlaneGeometry(8, 22).rotateX(-Math.PI / 2).translate(0, 0.16, 12.5);
  const playerLights = new THREE.Group();
  for (const side of [-1, 1]) {
    const spot = new THREE.SpotLight(0xffe2ad, 0, 37, 0.32, 0.75, 1.55);
    spot.position.set(side * 0.72, 0.99, 2.38);
    spot.target.position.set(side * 1.32, 0.16, 19);
    playerLights.add(spot, spot.target);
  }
  playerLights.visible = false;
  scene.add(playerLights);
  function spawnCar(options = {}) {
    const kind = options.kind || 'parked';
    const group = new THREE.Group();
    const paint = new THREE.MeshStandardMaterial({ color: options.color ?? paintColors[sequence % paintColors.length], roughness: 0.33, metalness: 0.4 });
    const bodyMat = kind === 'police' ? new THREE.MeshStandardMaterial({ color: 0xe8e8da, roughness: 0.42, metalness: 0.25 }) : paint;
    function box(w, h, d, mat, x, y, z) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh); return mesh;
    }
    box(2.12, 0.5, 4.55, bodyMat, 0, 0.73, 0);
    box(2.01, 0.18, 4.3, paint, 0, 1.02, 0);
    box(1.7, 0.67, 2.13, glass, 0, 1.41, -0.16);
    box(1.82, 0.15, 1.75, paint, 0, 1.79, -0.26);
    box(2.07, 0.08, 1.0, paint, 0, 1.11, 1.55);
    box(2.1, 0.12, 0.16, chrome, 0, 0.62, 2.3);
    box(2.1, 0.12, 0.16, chrome, 0, 0.62, -2.3);
    box(0.82, 0.18, 0.03, rubber, 0, 0.85, 2.3);
    const headlights = [], taillights = [];
    for (const side of [-1, 1]) {
      headlights.push(box(0.46, 0.2, 0.06, unlitLamp, side * 0.73, 0.96, 2.29));
      taillights.push(box(0.48, 0.18, 0.06, unlitTail, side * 0.73, 0.95, -2.29));
      box(0.19, 0.13, 0.35, paint, side * 1.15, 1.29, 0.5);
      box(0.03, 0.045, 0.31, chrome, side * 1.08, 1.1, -0.15);
    }
    const wheels = [];
    for (const side of [-1, 1]) for (const end of [-1, 1]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.28, 12), rubber);
      wheel.rotation.z = Math.PI / 2; wheel.position.set(side * 1.04, 0.45, end * 1.44); wheel.castShadow = true; group.add(wheel); wheels.push(wheel);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.295, 8), chrome);
      hub.rotation.z = Math.PI / 2; hub.position.copy(wheel.position); group.add(hub);
    }
    const sirens = [];
    if (kind === 'police') {
      box(2.14, 0.33, 1.95, rubber, 0, 0.94, -0.2);
      box(1.4, 0.12, 0.37, rubber, 0, 1.92, -0.22);
      for (const side of [-1, 1]) {
        const lightMat = new THREE.MeshStandardMaterial({ color: side < 0 ? 0xf04d52 : 0x4a9ffc, emissive: side < 0 ? 0xf51630 : 0x125bff, emissiveIntensity: 1.7 });
        sirens.push(box(0.55, 0.18, 0.33, lightMat, side * 0.39, 2.06, -0.22));
      }
    }
    const smoke = new THREE.Group(); group.add(smoke);
    for (let i = 0; i < 4; i++) {
      const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(0.31, 0), new THREE.MeshBasicMaterial({ color: 0x737a7b, transparent: true, opacity: 0.35 }));
      smoke.add(puff);
    }
    smoke.visible = false;
    const beam = new THREE.Mesh(beamGeometry, beamMaterial);
    beam.visible = false;
    group.add(beam);
    const car = { id: `ride-${++sequence}`, x: options.x ?? 0, z: options.z ?? 0, heading: options.heading ?? 0, speed: options.speed ?? 0, health: options.health ?? 100, group, paint, bodyMat, wheels, smoke, sirens, headlights, taillights, beam, lightsOn: false, kind, owned: !!options.owned, stolen: false, driver: null, wrecked: false, removed: false, distance: 0, bumpCooldown: 0 };
    group.position.set(car.x, 0, car.z); group.rotation.y = car.heading;
    scene.add(group); cars.push(car); return car;
  }
  function spawnPoliceCar(x, z, heading = 0) { return spawnCar({ x, z, heading, kind: 'police', color: 0x1d3443 }); }
  function removeCar(car) {
    const index = cars.indexOf(car);
    if (index !== -1) cars.splice(index, 1);
    car.removed = true; car.driver = null; scene.remove(car.group);
  }
  function damage(car, amount) {
    if (!car || car.removed || car.wrecked) return;
    car.health = Math.max(0, car.health - Math.max(0, amount));
    if (car.health <= 0) { car.wrecked = true; car.speed = 0; }
  }
  function nearest(x, z, range = VEHICLE.enterRange) {
    let selected = null, best = range;
    for (const car of cars) {
      if (car.removed || !car.group.parent || car.driver === 'player') continue;
      const distance = Math.hypot(car.x - x, car.z - z);
      if (distance < best) { selected = car; best = distance; }
    }
    return selected;
  }
  function stepCar(car, dt, controls = {}) {
    if (!car || car.removed || car.wrecked) return;
    car.bumpCooldown = Math.max(0, car.bumpCooldown - dt);
    const forward = THREE.MathUtils.clamp(controls.forward || 0, -1, 1);
    const right = THREE.MathUtils.clamp(controls.right || 0, -1, 1);
    const opposing = forward !== 0 && Math.sign(forward) !== Math.sign(car.speed) && Math.abs(car.speed) > 0.3;
    car.speed += forward * (opposing ? VEHICLE.brake : VEHICLE.acceleration) * dt;
    car.speed *= Math.exp(-(forward ? 0.15 : VEHICLE.drag) * dt);
    if (controls.handbrake) car.speed *= Math.exp(-3.3 * dt);
    const max = isOnSand(car.x, car.z) ? VEHICLE.maxSpeed * 0.63 : VEHICLE.maxSpeed;
    car.speed = THREE.MathUtils.clamp(car.speed, -VEHICLE.reverseSpeed, max);
    if (Math.abs(car.speed) < 0.03) car.speed = 0;
    car.heading -= right * VEHICLE.steer * Math.min(1, Math.abs(car.speed) / 7) * Math.sign(car.speed || 1) * dt * (controls.handbrake ? 1.5 : 1);
    let x = car.x + Math.sin(car.heading) * car.speed * dt;
    let z = car.z + Math.cos(car.heading) * car.speed * dt;
    const impact = Math.abs(car.speed);
    const resolved = resolveCollisions(city.colliders, x, z, VEHICLE.radius);
    x = resolved.x; z = resolved.z;
    if (resolved.hit) {
      if (!car.bumpCooldown && impact > 3) { damage(car, Math.min(24, impact * 0.9)); car.bumpCooldown = 0.35; }
      car.speed *= 0.23;
    }
    const bounded = clampToWorld(x, z, VEHICLE.radius);
    x = bounded.x; z = bounded.z;
    if (x !== resolved.x || z !== resolved.z) car.speed *= 0.4;
    for (const other of cars) {
      if (other === car || other.removed) continue;
      const dx = x - other.x, dz = z - other.z, gap = Math.hypot(dx, dz), minimum = VEHICLE.radius * 1.9;
      if (gap >= minimum) continue;
      const nx = gap > 0.001 ? dx / gap : Math.sin(car.heading + 1.2);
      const nz = gap > 0.001 ? dz / gap : Math.cos(car.heading + 1.2);
      const overlap = minimum - gap;
      x += nx * overlap; z += nz * overlap;
      const relative = Math.hypot(
        Math.sin(car.heading) * car.speed - Math.sin(other.heading) * other.speed,
        Math.cos(car.heading) * car.speed - Math.cos(other.heading) * other.speed
      );
      if (!car.bumpCooldown && relative > 2) {
        damage(car, Math.min(17, relative * 0.7)); damage(other, Math.min(17, relative * 0.7));
        car.bumpCooldown = 0.45; other.bumpCooldown = 0.45;
      }
      car.speed *= 0.48;
    }
    const safe = resolveCollisions(city.colliders, x, z, VEHICLE.radius);
    const finalPoint = clampToWorld(safe.x, safe.z, VEHICLE.radius);
    car.x = finalPoint.x; car.z = finalPoint.z;
    car.distance += Math.abs(car.speed) * dt;
    car.group.position.set(car.x, 0, car.z); car.group.rotation.y = car.heading;
  }
  function update(dt, time = 0) {
    for (const car of cars) {
      car.group.position.set(car.x, 0, car.z); car.group.rotation.y = car.heading;
      car.group.rotation.z = Math.sin(time * 18 + car.x) * Math.min(0.008, Math.abs(car.speed) * 0.0003);
      car.smoke.visible = car.health < 34;
      if (car.smoke.visible) car.smoke.children.forEach((puff, index) => {
        const phase = (time * 0.5 + index / 4) % 1;
        puff.position.set(Math.sin(index * 3 + time) * phase * 0.4, 1.25 + phase * 2.5, 1.5);
        puff.scale.setScalar(0.4 + phase * 1.9); puff.material.opacity = (1 - phase) * 0.35;
      });
      car.sirens.forEach((light, index) => { light.material.emissiveIntensity = Math.sin(time * 13 + index * Math.PI) > 0 ? 3 : 0.15; });
      for (const wheel of car.wheels) wheel.rotation.x = car.distance / 0.44;
    }
  }
  function updateNight(level, playerCar) {
    const isNight = level > 0.01;
    lamp.emissiveIntensity = level * 3.8;
    tail.emissiveIntensity = level * 1.65;
    beamMaterial.opacity = level * 0.39;
    playerLights.visible = !!playerCar && isNight && !playerCar.wrecked && !playerCar.removed;
    if (playerLights.visible) {
      playerLights.position.set(playerCar.x, 0, playerCar.z);
      playerLights.rotation.y = playerCar.heading;
      for (const object of playerLights.children) if (object.isSpotLight) object.intensity = level * 140;
    }
    for (const car of cars) {
      const active = isNight && !car.wrecked && !!car.driver;
      if (active !== car.lightsOn) {
        car.lightsOn = active;
        for (const mesh of car.headlights) mesh.material = active ? lamp : unlitLamp;
        for (const mesh of car.taillights) mesh.material = active ? tail : unlitTail;
      }
      car.beam.visible = active;
    }
  }
  let starter;
  function reset() {
    for (const car of [...cars]) removeCar(car);
    starter = spawnCar({ x: 4.6, z: 100, heading: 0, color: PALETTE.teal, kind: 'starter', owned: true });
    const spots = [[-7, 180], [7, 250], [-79, 90], [151, -30], [223, 245], [-209, 245], [65, -180], [-295, -170], [295, 180], [-151, -250], [223, -125], [-295, 325]];
    spots.forEach(([x, z], index) => {
      const point = resolveCollisions(city.colliders, x, z, VEHICLE.radius);
      if (!point.hit && !cars.some(car => Math.hypot(car.x - x, car.z - z) < 7)) spawnCar({ x, z, heading: index % 2 ? 0 : Math.PI, kind: 'parked' });
    });
  }
  reset();
  return { cars, get starter() { return starter; }, spawnCar, spawnPoliceCar, removeCar, nearest, stepCar, update, updateNight, reset, damage };
}
