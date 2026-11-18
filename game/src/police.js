import * as THREE from '../vendor/three.module.min.js';
import { POLICE, DIFFICULTY } from './config.js';
import { resolveCollisions, clampToWorld } from './world.js';

const angleDelta = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// Segment versus a solid footprint. A building really breaks visual contact.
function crossesFootprint(a, b, box) {
  let enter = 0;
  let leave = 1;
  for (const [axis, low, high] of [['x', 'minX', 'maxX'], ['z', 'minZ', 'maxZ']]) {
    const delta = b[axis] - a[axis];
    if (Math.abs(delta) < 0.00001) {
      if (a[axis] < box[low] || a[axis] > box[high]) return false;
    } else {
      let p = (box[low] - a[axis]) / delta;
      let q = (box[high] - a[axis]) / delta;
      if (p > q) [p, q] = [q, p];
      enter = Math.max(enter, p);
      leave = Math.min(leave, q);
      if (leave < enter) return false;
    }
  }
  return leave > 0.02 && enter < 0.98;
}

function createOfficer() {
  const group = new THREE.Group();
  const uniform = new THREE.MeshStandardMaterial({ color: 0x203c57, roughness: 0.92 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xb78060, roughness: 0.95 });
  const black = new THREE.MeshStandardMaterial({ color: 0x14202b, roughness: 0.75 });
  function part(w, h, d, x, y, z, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
  }
  part(0.62, 0.78, 0.34, 0, 1.12, 0, uniform);
  part(0.39, 0.4, 0.36, 0, 1.72, 0, skin);
  part(0.48, 0.12, 0.43, 0, 1.96, 0.03, uniform);
  part(0.52, 0.1, 0.42, 0, 0.84, 0, black);
  const legs = [part(0.23, 0.75, 0.25, -0.18, 0.41, 0, uniform), part(0.23, 0.75, 0.25, 0.18, 0.41, 0, uniform)];
  part(0.2, 0.63, 0.22, -0.43, 1.07, 0.05, uniform);
  part(0.2, 0.52, 0.23, 0.4, 1.2, 0.17, uniform).rotation.x = -0.8;
  part(0.12, 0.14, 0.43, 0.4, 1.3, 0.47, black);
  part(0.12, 0.15, 0.02, 0.16, 1.3, 0.18, new THREE.MeshStandardMaterial({ color: 0xffd079, metalness: 0.6, roughness: 0.3 }));
  group.userData.legs = legs;
  return group;
}

export function createPolice(city, scene, vehicles, getDifficulty = () => DIFFICULTY.normal) {
  const state = {
    wanted: 0, heat: 0, decayTimer: 0, outOfSight: true,
    arrestTimer: 0, busted: false, forcedDecay: false,
    lastSeen: { x: 0, z: 0 }, reason: '', clock: 0, spawnClock: 0, deployment: 0,
  };
  const copCars = [];
  const footCops = [];
  let serial = 0;

  function hasLineOfSight(a, b) {
    return !(city.colliders || []).some(box => crossesFootprint(a, b, box));
  }
  function clearActors() {
    for (const car of copCars.splice(0)) vehicles.removeCar(car);
    for (const cop of footCops.splice(0)) scene.remove(cop.group);
    state.arrestTimer = 0;
  }
  function clear() {
    clearActors();
    state.wanted = 0;
    state.heat = 0;
    state.decayTimer = 0;
    state.outOfSight = true;
    state.forcedDecay = false;
    state.busted = false;
    state.deployment = 0;
  }
  function setWanted(value) {
    const level = THREE.MathUtils.clamp(Math.ceil(Number(value) || 0), 0, 5);
    const raised = level > state.wanted;
    state.heat = level;
    state.wanted = level;
    if (raised) {
      state.decayTimer = 0;
      state.spawnClock = 0;
      state.deployment = Math.max(0, patrolCount(level, getDifficulty().aggression) - copCars.length);
    }
    if (!level) { clearActors(); state.deployment = 0; }
  }
  function addWanted(amount = 1, reason = 'Crime reported') {
    state.reason = reason;
    setWanted(state.wanted + amount);
  }
  function patrolCount(level, aggression) {
    return Math.min(POLICE.maxCars, Math.max(1, Math.round((level + 1) * aggression)));
  }
  function nearestNode(point) {
    return city.roadNetwork?.nearestNode?.(point.x, point.z) || null;
  }
  function roadPath(from, to) {
    if (!from || !to) return [];
    const queue = [from];
    const came = new Map([[from, null]]);
    for (let i = 0; i < queue.length; i++) {
      const node = queue[i];
      if (node === to) break;
      for (const next of node.neighbours || node.neighbors || []) {
        const other = next.other || next.node || next;
        if (!came.has(other)) {
          came.set(other, node);
          queue.push(other);
        }
      }
    }
    if (!came.has(to)) return [];
    const path = [];
    for (let node = to; node && node !== from; node = came.get(node)) path.unshift(node);
    return path;
  }
  function spawnCar(player) {
    const angle = (serial++ * 2.39996) + Math.PI;
    const desired = clampToWorld(player.x + Math.sin(angle) * 88, player.z + Math.cos(angle) * 88, 5);
    const node = nearestNode(desired) || desired;
    const heading = Math.atan2(player.x - node.x, player.z - node.z);
    const car = vehicles.spawnPoliceCar(node.x + 4.2, node.z, heading);
    car.driver = 'police';
    car.policeRoute = [];
    car.routeClock = 0;
    car.stuck = 0;
    copCars.push(car);
    return car;
  }
  function spawnFoot(player) {
    const car = copCars[footCops.length % Math.max(1, copCars.length)];
    const angle = serial++ * 2.4;
    const desired = car ? { x: car.x + 3.2, z: car.z } : { x: player.x + Math.sin(angle) * 36, z: player.z + Math.cos(angle) * 36 };
    const spot = resolveCollisions(city.colliders, desired.x, desired.z, 0.6);
    const group = createOfficer();
    group.position.set(spot.x, 0.1, spot.z);
    scene.add(group);
    const cop = { x: spot.x, z: spot.z, heading: 0, health: 80, alive: true, isCop: true, group, phase: serial, lastShot: -100 };
    footCops.push(cop);
    return cop;
  }
  function updateCar(car, dt, target, aggression) {
    if (car.wrecked) return;
    car.routeClock -= dt;
    if (car.routeClock <= 0) {
      car.routeClock = 1.6;
      car.policeRoute = roadPath(nearestNode(car), nearestNode(target));
    }
    let aim = target;
    if (!hasLineOfSight(car, target) || distance(car, target) > 45) {
      while (car.policeRoute.length && distance(car, car.policeRoute[0]) < 10) car.policeRoute.shift();
      aim = car.policeRoute[0] || nearestNode(target) || target;
    }
    const desired = Math.atan2(aim.x - car.x, aim.z - car.z);
    const turn = angleDelta(desired, car.heading);
    const oldX = car.x;
    const oldZ = car.z;
    const cruise = (15 + state.wanted * 2.4) * Math.sqrt(aggression);
    vehicles.stepCar(car, dt, {
      forward: Math.abs(turn) > 1.1 && car.speed > 9 ? -0.3 : car.speed < cruise ? 1 : 0,
      right: THREE.MathUtils.clamp(-turn * 1.5, -1, 1),
      handbrake: Math.abs(turn) > 1.3 && car.speed > 10,
    });
    car.stuck = Math.hypot(car.x - oldX, car.z - oldZ) < dt * 0.35 ? car.stuck + dt : 0;
    if (car.stuck > 6) {
      const node = nearestNode(car);
      if (node && distance(node, target) > 30) {
        car.x = node.x + 4.2;
        car.z = node.z;
        car.heading = desired;
        car.speed = 4;
      } else car.heading += 0.7;
      car.stuck = 0;
    }
  }
  function update(dt, playerState, combat) {
    const player = playerState?.state || playerState;
    if (!player) return;
    state.clock += dt;
    if (!state.wanted) {
      if (copCars.length || footCops.length) clearActors();
      state.outOfSight = true;
      return;
    }
    const aggression = getDifficulty().aggression;
    const sight = POLICE.sight * Math.sqrt(aggression);
    const seenByCars = copCars.some(car => !car.wrecked && distance(car, player) < sight && hasLineOfSight(car, player));
    const seenByFoot = footCops.some(cop => cop.alive && distance(cop, player) < sight * 0.8 && hasLineOfSight(cop, player));
    const seen = seenByCars || seenByFoot;
    state.outOfSight = !seen;
    if (seen || !copCars.length && state.decayTimer === 0) {
      state.lastSeen.x = player.x;
      state.lastSeen.z = player.z;
    }
    state.spawnClock -= dt;
    const desiredCars = patrolCount(state.wanted, aggression);
    if (copCars.length < desiredCars && state.spawnClock <= 0 && (state.deployment > 0 || seen)) {
      spawnCar(player);
      state.deployment = Math.max(0, state.deployment - 1);
      state.spawnClock = 2 / aggression;
    }
    for (const car of copCars) updateCar(car, dt, state.lastSeen, aggression);
    if (!player.car && footCops.length < Math.min(POLICE.maxFoot, state.wanted) && state.clock > 1 && (seen || state.decayTimer < 3)) spawnFoot(player);
    let arresting = false;
    for (const cop of footCops) {
      if (!cop.alive || cop.health <= 0) {
        cop.alive = false;
        cop.group.rotation.z = Math.min(Math.PI / 2, cop.group.rotation.z + dt * 4);
        continue;
      }
      const target = seen ? player : state.lastSeen;
      const range = distance(cop, target);
      const heading = Math.atan2(target.x - cop.x, target.z - cop.z);
      cop.heading = heading;
      if (range > 2.1) {
        const moved = resolveCollisions(city.colliders, cop.x + Math.sin(heading) * dt * 4.3 * aggression, cop.z + Math.cos(heading) * dt * 4.3 * aggression, 0.55);
        cop.x = moved.x;
        cop.z = moved.z;
        cop.group.userData.legs?.forEach((leg, i) => { leg.rotation.x = Math.sin(state.clock * 11 + i * Math.PI) * 0.6; });
      }
      cop.group.position.set(cop.x, 0.05, cop.z);
      cop.group.rotation.y = heading;
      const close = distance(cop, player);
      const visible = hasLineOfSight(cop, player);
      if (!player.car && close < POLICE.arrestRange && visible) arresting = true;
      if (state.wanted >= 3 && close > 5 && close < 30 && visible) combat?.shootAtPlayer(cop);
    }
    state.arrestTimer = arresting ? state.arrestTimer + dt : Math.max(0, state.arrestTimer - dt * 2);
    if (state.arrestTimer >= POLICE.arrestTime / aggression) state.busted = true;
    if (seen) state.decayTimer = 0;
    else state.decayTimer += dt;
    if (state.decayTimer > POLICE.decayDelay * aggression) {
      state.heat = Math.max(0, state.heat - dt * POLICE.decayRate / (state.wanted >= 3 && !state.forcedDecay ? 1.5 : 1));
      state.wanted = Math.ceil(state.heat);
      if (!state.wanted) clear();
    }
    for (let i = copCars.length - 1; i >= desiredCars; i--) vehicles.removeCar(copCars.splice(i, 1)[0]);
    for (const car of copCars) {
      const bulbs = car.group.userData.policeLights;
      if (bulbs) bulbs.forEach((bulb, i) => { if (bulb.material) bulb.material.emissiveIntensity = Math.sin(state.clock * 12 + i * Math.PI) > 0 ? 2 : 0.1; });
    }
  }
  return { state, copCars, footCops, update, setWanted, addWanted, clear, reset: clear, hasLineOfSight };
}
