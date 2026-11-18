import * as THREE from '../vendor/three.module.min.js';
import { CITY, TRAFFIC } from './config.js';
import { resolveCollisions, clampToWorld } from './world.js';

// A route remembers where it came from: junction decisions cannot oscillate.
export function createTraffic(city, scene, random) {
  const vehicles = city.vehicles;
  if (!vehicles) throw new Error('Traffic needs the city vehicle registry.');
  const cars = [], pedestrians = [];
  const graph = city.roadNetwork || city.graph;
  const rng = typeof random === 'function' ? random : () => random.next();
  const pick = values => values[Math.floor(rng() * values.length)];
  let clock = 0;
  function neighbours(node) { return node.neighbours || node.neighbors || []; }
  function pickDirection(node, fromNode) {
    const all = neighbours(node);
    const alternatives = all.filter(candidate => candidate !== fromNode && (candidate.x !== fromNode?.x || candidate.z !== fromNode?.z));
    return pick(alternatives.length ? alternatives : all) || fromNode || node;
  }
  function routeSpawn(car) {
    for (let attempt = 0; attempt < 160; attempt++) {
      const from = pick(graph.nodes), next = pickDirection(from, null);
      if (!next || from === next) continue;
      const length = Math.hypot(next.x - from.x, next.z - from.z);
      const dx = (next.x - from.x) / length, dz = (next.z - from.z) / length;
      const t = 0.18 + rng() * 0.64;
      const x = from.x + (next.x - from.x) * t - dz * TRAFFIC.laneOffset;
      const z = from.z + (next.z - from.z) * t + dx * TRAFFIC.laneOffset;
      if (vehicles.cars.some(other => other !== car && Math.hypot(other.x - x, other.z - z) < 10)) continue;
      if (resolveCollisions(city.colliders, x, z, 2).hit) continue;
      Object.assign(car, { x, z, heading: Math.atan2(dx, dz), speed: 7 + rng() * 5, routeFrom: from, routeNext: next, stuck: 0, previousX: x, previousZ: z, health: 100, wrecked: false, removed: false });
      car.group.position.set(x, 0, z); car.group.rotation.y = car.heading;
      return true;
    }
    return false;
  }
  function createPedestrian(index) {
    const group = new THREE.Group();
    const clothes = [0xc76f69, 0x698c9c, 0xead6aa, 0x4c786f, 0x977eaa, 0xc7a154];
    const shirt = new THREE.MeshStandardMaterial({ color: clothes[index % clothes.length], roughness: 0.92 });
    const skin = new THREE.MeshStandardMaterial({ color: [0xbe8a68, 0x9c654c, 0xd5a37e][index % 3], roughness: 0.9 });
    const pants = new THREE.MeshStandardMaterial({ color: 0x394357, roughness: 0.9 });
    function part(w, h, d, mat, x, y, z, parent = group) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.set(x, y, z); mesh.castShadow = true; parent.add(mesh); return mesh;
    }
    part(0.47, 0.6, 0.3, shirt, 0, 1.1, 0);
    part(0.34, 0.4, 0.33, skin, 0, 1.62, 0);
    part(0.36, 0.13, 0.36, pants, 0, 1.85, 0);
    const legs = [];
    for (const side of [-1, 1]) {
      const leg = new THREE.Group(); leg.position.set(side * 0.13, 0.8, 0); group.add(leg);
      part(0.19, 0.75, 0.22, pants, 0, -0.35, 0, leg); legs.push(leg);
      part(0.16, 0.6, 0.18, skin, side * 0.34, 1.08, 0);
    }
    const col = Math.floor(rng() * 10), row = Math.floor(rng() * 10);
    const left = CITY.nodeMin + col * CITY.pitch + 14.8, top = CITY.nodeMin + row * CITY.pitch + 14.8;
    const width = CITY.pitch - 29.6;
    const path = [{ x: left, z: top }, { x: left + width, z: top }, { x: left + width, z: top + width }, { x: left, z: top + width }];
    const target = index % 4, point = path[target];
    const ped = { id: `resident-${index}`, x: point.x, z: point.z, heading: 0, health: 40, alive: true, isPed: true, group, legs, path, target: (target + 1) % 4, speed: 0.8 + rng() * 0.8, knockTimer: 0, phase: rng() * 7 };
    group.position.set(ped.x, 0, ped.z); scene.add(group); return ped;
  }
  function knockPed(ped) {
    if (!ped || !ped.alive) return false;
    ped.alive = false; ped.health = 0; ped.knockTimer = 0;
    return true;
  }
  function update(dt, playerState) {
    clock += dt;
    for (const car of cars) {
      if (car.removed || car.driver !== 'traffic' || car.wrecked) continue;
      const from = car.routeFrom, node = car.routeNext;
      if (!node || !from) { routeSpawn(car); continue; }
      let dx = node.x - from.x, dz = node.z - from.z, length = Math.hypot(dx, dz) || 1;
      dx /= length; dz /= length;
      let tx = node.x - dz * TRAFFIC.laneOffset, tz = node.z + dx * TRAFFIC.laneOffset;
      if (Math.hypot(tx - car.x, tz - car.z) < 8) {
        car.routeFrom = node; car.routeNext = pickDirection(node, from);
        const next = car.routeNext;
        dx = next.x - node.x; dz = next.z - node.z; length = Math.hypot(dx, dz) || 1; dx /= length; dz /= length;
        tx = next.x - dz * TRAFFIC.laneOffset; tz = next.z + dx * TRAFFIC.laneOffset;
      }
      const desired = Math.atan2(tx - car.x, tz - car.z);
      const delta = Math.atan2(Math.sin(desired - car.heading), Math.cos(desired - car.heading));
      let targetSpeed = TRAFFIC.speed * (1 - Math.min(0.6, Math.abs(delta) * 0.45));
      const hx = Math.sin(car.heading), hz = Math.cos(car.heading);
      for (const other of vehicles.cars) {
        if (other === car || other.removed) continue;
        const ox = other.x - car.x, oz = other.z - car.z, ahead = ox * hx + oz * hz;
        if (ahead > 0 && ahead < 10 && Math.abs(ox * hz - oz * hx) < 2.7) targetSpeed = Math.min(targetSpeed, Math.max(0, ahead - 4) * 1.1);
      }
      const throttle = THREE.MathUtils.clamp((targetSpeed - car.speed) * 0.4, -1, 1);
      vehicles.stepCar(car, dt, { forward: throttle, right: -THREE.MathUtils.clamp(delta * 2.3, -1, 1) });
      const travelled = Math.hypot(car.x - car.previousX, car.z - car.previousZ);
      car.stuck = travelled < dt * 0.6 ? car.stuck + dt : 0;
      car.previousX = car.x; car.previousZ = car.z;
      if (car.stuck > TRAFFIC.stuckSeconds) routeSpawn(car);
    }
    for (const ped of pedestrians) {
      if (ped.alive && ped.health <= 0) knockPed(ped);
      if (!ped.alive) {
        ped.knockTimer += dt;
        ped.group.rotation.z = Math.min(Math.PI / 2, ped.knockTimer * 5);
        ped.group.position.y = -0.12;
        if (ped.knockTimer > 20 && Math.hypot(ped.x - (playerState?.x || 0), ped.z - (playerState?.z || 0)) > 35) {
          ped.alive = true; ped.health = 40; ped.group.rotation.z = 0; ped.group.position.y = 0;
        }
        continue;
      }
      const goal = ped.path[ped.target], dx = goal.x - ped.x, dz = goal.z - ped.z, distance = Math.hypot(dx, dz);
      if (distance < 0.6) { ped.target = (ped.target + 1) % ped.path.length; continue; }
      let mx = dx / distance, mz = dz / distance;
      for (const car of vehicles.cars) {
        const ox = ped.x - car.x, oz = ped.z - car.z, gap = Math.hypot(ox, oz);
        if (gap > 0 && gap < 4.4) { mx += ox / gap * 2.1; mz += oz / gap * 2.1; }
      }
      const norm = Math.max(1, Math.hypot(mx, mz)); mx /= norm; mz /= norm;
      const resolved = resolveCollisions(city.colliders, ped.x + mx * dt * ped.speed, ped.z + mz * dt * ped.speed, 0.45);
      const point = clampToWorld(resolved.x, resolved.z, 0.5);
      ped.x = point.x; ped.z = point.z; ped.heading = Math.atan2(mx, mz);
      ped.group.position.set(ped.x, 0, ped.z); ped.group.rotation.y = ped.heading;
      ped.legs[0].rotation.x = Math.sin(clock * ped.speed * 7 + ped.phase) * 0.43;
      ped.legs[1].rotation.x = -ped.legs[0].rotation.x;
    }
  }
  function reset() {
    for (const car of cars) if (!car.removed) vehicles.removeCar(car);
    for (const ped of pedestrians) scene.remove(ped.group);
    cars.length = 0; pedestrians.length = 0; clock = 0;
    for (let i = 0; i < TRAFFIC.cars; i++) {
      const car = vehicles.spawnCar({ kind: 'traffic', x: 2000, z: 2000 });
      if (routeSpawn(car)) { car.driver = 'traffic'; cars.push(car); }
      else vehicles.removeCar(car);
    }
    for (let i = 0; i < TRAFFIC.pedestrians; i++) pedestrians.push(createPedestrian(i));
  }
  reset();
  return { cars, pedestrians, update, reset, knockPed, pickDirection };
}
