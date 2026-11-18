import * as THREE from '../vendor/three.module.min.js';
import { createPerson } from './player.js';
import { resolveCollisions, clampToWorld } from './world.js';

const angularDifference = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

// Segment/AABB intersection also works when either coordinate has zero delta.
function segmentBlocked(a, b, box) {
  let low = .025, high = .975;
  for (const axis of ['X', 'Z']) {
    const key = axis.toLowerCase();
    const start = a[key], delta = b[key] - start;
    const minimum = box[`min${axis}`], maximum = box[`max${axis}`];
    if (!Number.isFinite(minimum) || !Number.isFinite(maximum)) continue;
    if (Math.abs(delta) < 1e-8) {
      if (start < minimum || start > maximum) return false;
    } else {
      let first = (minimum - start) / delta, last = (maximum - start) / delta;
      if (first > last) [first, last] = [last, first];
      low = Math.max(low, first);
      high = Math.min(high, last);
      if (low > high) return false;
    }
  }
  return low <= high;
}

export function createPolice(city, scene, vehicles) {
  const state = { wanted: 0, copCars: [], footCops: [], forcedDecay: false, decayTimer: 0, dropTimer: 0, arrestTimer: 0, outOfSight: true, events: [], spawnClock: 0, time: 0 };
  const graph = city.roadNetwork ?? city.graph;
  const nodes = new Map(graph.nodes.map(node => [node.id, node]));
  const nodeFor = node => typeof node === 'object' ? node : nodes.get(node);
  function hasLineOfSight(a, b) {
    return !city.colliders.some(box => segmentBlocked(a, b, box));
  }
  function clearActors() {
    for (const car of [...state.copCars]) vehicles.remove(car);
    for (const cop of state.footCops) scene.remove(cop.group);
    state.copCars.length = 0;
    state.footCops.length = 0;
    state.arrestTimer = 0;
  }
  function clear() {
    clearActors();
    state.wanted = 0;
    state.decayTimer = state.dropTimer = 0;
    state.forcedDecay = false;
    state.events.length = 0;
    state.outOfSight = true;
    state.spawnClock = 0;
  }
  function setWanted(level) {
    const next = Math.max(0, Math.min(5, Math.ceil(Number(level) || 0)));
    if (next > state.wanted) {
      state.decayTimer = state.dropTimer = 0;
      state.arrestTimer = 0;
    }
    state.wanted = next;
    if (next === 0) {
      clearActors();
      state.decayTimer = state.dropTimer = 0;
    }
  }
  function addWanted(amount, reason = '') {
    setWanted(state.wanted + amount);
    state.lastCrime = reason;
  }
  function nearestNode(x, z) {
    return graph.nearestNode(x, z);
  }
  function routeBetween(from, goal) {
    if (!from || !goal) return [];
    const queue = [from], previous = new Map([[from.id, null]]);
    for (let i = 0; i < queue.length; i++) {
      const at = queue[i];
      if (at.id === goal.id) break;
      for (const neighborId of at.neighbors) {
        const neighbor = nodeFor(neighborId);
        if (!neighbor || previous.has(neighbor.id)) continue;
        previous.set(neighbor.id, at.id);
        queue.push(neighbor);
      }
    }
    if (!previous.has(goal.id)) return [goal];
    const route = [];
    let id = goal.id;
    while (id !== null) { route.push(nodes.get(id)); id = previous.get(id); }
    return route.reverse();
  }
  function spawnCar(player, index) {
    const desiredAngle = index * 2.399 + .8;
    const target = { x: player.x + Math.sin(desiredAngle) * 115, z: player.z + Math.cos(desiredAngle) * 115 };
    const node = nearestNode(target.x, target.z);
    const car = vehicles.spawnPoliceCar(node.x - 3.6, node.z);
    car.heading = Math.atan2(player.x - car.x, player.z - car.z);
    car.speed = 0;
    car.route = [];
    car.repath = 0;
    car.ramTimer = 0;
    car.shootTimer = 1.2 + index * .35;
    car.stuck = 0;
    state.copCars.push(car);
  }
  function spawnFootCop(player, index) {
    const angle = index * 2.4 + 1.3;
    const raw = { x: player.x + Math.sin(angle) * 36, z: player.z + Math.cos(angle) * 36 };
    const safe = resolveCollisions(city.colliders, raw.x, raw.z, .5);
    const bounded = clampToWorld(safe.x, safe.z, .5);
    const group = createPerson({ shirt: 0x243b58, trousers: 0x1a2639, skin: 0xb67a53 });
    const badge = new THREE.Mesh(new THREE.BoxGeometry(.09, .12, .035), new THREE.MeshBasicMaterial({ color: 0xfbd35c }));
    badge.position.set(.19, 1.37, .195);
    group.add(badge);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(.48, .14, .48), new THREE.MeshLambertMaterial({ color: 0x1c2b44 }));
    cap.position.y = 2.09;
    group.add(cap);
    group.position.set(bounded.x, 0, bounded.z);
    scene.add(group);
    state.footCops.push({ ...bounded, group, health: 60, alive: true, down: false, isCop: true, heading: 0, shootTimer: 1.2 + index * .3, phase: 0, deadTime: 0 });
  }
  function updateCars(dt, player, callbacks) {
    for (const car of state.copCars) {
      car.ramTimer = Math.max(0, car.ramTimer - dt);
      car.shootTimer -= dt;
      if (car.wrecked) continue;
      const distance = Math.hypot(car.x - player.x, car.z - player.z);
      car.repath -= dt;
      if (car.repath <= 0) {
        car.route = routeBetween(nearestNode(car.x, car.z), nearestNode(player.x, player.z));
        if (car.route.length > 1) car.route.shift();
        car.repath = 2.2;
      }
      let target = player;
      if (distance > 28 && car.route.length) {
        target = car.route[0];
        if (Math.hypot(car.x - target.x, car.z - target.z) < 8) car.route.shift();
      }
      const desiredHeading = Math.atan2(target.x - car.x, target.z - car.z);
      const difference = angularDifference(desiredHeading, car.heading);
      const steering = Math.max(-1, Math.min(1, -difference * 1.7));
      const targetSpeed = Math.abs(difference) > .8 ? 10 : Math.min(27, 16 + state.wanted * 2);
      const throttle = car.speed > targetSpeed + 1 ? -.3 : 1;
      const beforeX = car.x, beforeZ = car.z;
      vehicles.stepCar(car, dt, { throttle, steer: steering, handbrake: Math.abs(difference) > 1.5 && car.speed > 11 });
      car.stuck = Math.hypot(car.x - beforeX, car.z - beforeZ) < dt * .3 ? car.stuck + dt : 0;
      if (car.stuck > 3.5 && distance < 85) {
        // A short reverse frees a cruiser that caught a corner, without teleporting it.
        car.speed = -5;
        car.heading += .7;
        car.stuck = 0;
      }
      if (state.wanted >= 3 && distance >= 5 && distance <= 30 && car.shootTimer <= 0 && hasLineOfSight(car, player)) {
        car.shootTimer = 2.1;
        if (callbacks.shootAtPlayer) callbacks.shootAtPlayer(car);
        else callbacks.damage?.(7);
      }
      if (player.inCar && distance < 4.4 && car.ramTimer <= 0) {
        vehicles.damage(player.inCar, 4 + state.wanted * .8);
        player.inCar.speed *= .88;
        car.ramTimer = .75;
      }
    }
  }
  function updateFoot(dt, player, callbacks) {
    let arresting = false;
    for (const cop of state.footCops) {
      if (!cop.alive || cop.health <= 0 || cop.down) {
        cop.alive = false;
        cop.down = true;
        cop.group.rotation.z += (Math.PI / 2 - cop.group.rotation.z) * Math.min(1, dt * 9);
        cop.group.position.y = .25;
        cop.deadTime += dt;
        continue;
      }
      const dx = player.x - cop.x, dz = player.z - cop.z;
      const distance = Math.hypot(dx, dz);
      cop.heading = Math.atan2(dx, dz);
      if (!player.inCar && distance > 2.1) {
        const speed = distance < 8 ? 3.7 : 4.3;
        const next = resolveCollisions(city.colliders, cop.x + dx / (distance || 1) * speed * dt, cop.z + dz / (distance || 1) * speed * dt, .46);
        const bounded = clampToWorld(next.x, next.z, .46);
        cop.x = bounded.x;
        cop.z = bounded.z;
      }
      cop.group.position.set(cop.x, 0, cop.z);
      cop.group.rotation.y = cop.heading;
      cop.phase += dt * 9;
      const limbs = cop.group.userData.limbs;
      if (limbs && distance > 2.1) {
        limbs.legs[0].rotation.x = Math.sin(cop.phase) * .65;
        limbs.legs[1].rotation.x = -Math.sin(cop.phase) * .65;
      }
      const visible = distance < 85 && hasLineOfSight(cop, player);
      if (!player.inCar && distance < 2.5 && visible) arresting = true;
      cop.shootTimer -= dt;
      if (state.wanted >= 3 && distance >= 5 && distance <= 30 && visible && cop.shootTimer <= 0) {
        cop.shootTimer = 1.6;
        if (callbacks.shootAtPlayer) callbacks.shootAtPlayer(cop);
        else callbacks.damage?.(7);
      }
    }
    // A stationary suspect beside a cruiser can also be detained at lower heat.
    if (!player.inCar && state.copCars.some(car => !car.wrecked && Math.hypot(car.x - player.x, car.z - player.z) < 2.5 && hasLineOfSight(car, player))) arresting = true;
    state.arrestTimer = arresting ? state.arrestTimer + dt : Math.max(0, state.arrestTimer - dt * 2);
    if (state.arrestTimer > 1.15) {
      state.events.push({ type: 'busted', wanted: state.wanted });
      state.arrestTimer = 0;
      setWanted(0);
    }
  }
  function update(dt, player, callbacks = {}) {
    state.time += dt;
    if (!state.wanted) { if (state.copCars.length || state.footCops.length) clearActors(); return; }
    state.spawnClock -= dt;
    const desiredCars = Math.min(4, 2 + Math.floor(state.wanted / 2));
    if (state.spawnClock <= 0) {
      while (state.copCars.length < desiredCars) spawnCar(player, state.copCars.length);
      const desiredFoot = player.inCar ? 0 : Math.min(3, Math.max(0, state.wanted - 1));
      while (state.footCops.length < desiredFoot) spawnFootCop(player, state.footCops.length);
      state.spawnClock = 4;
    }
    while (state.copCars.length > desiredCars) vehicles.remove(state.copCars.pop());
    updateCars(dt, player, callbacks);
    updateFoot(dt, player, callbacks);
    if (!state.wanted) return;
    const actors = [...state.copCars.filter(car => !car.wrecked), ...state.footCops.filter(cop => cop.alive && cop.health > 0)];
    const farFromEveryCop = actors.every(cop => Math.hypot(cop.x - player.x, cop.z - player.z) > 85);
    state.outOfSight = actors.every(cop => Math.hypot(cop.x - player.x, cop.z - player.z) > 85 || !hasLineOfSight(cop, player));
    if (farFromEveryCop) {
      state.decayTimer += dt;
      const grace = state.forcedDecay ? 6 : 9;
      if (state.decayTimer > grace) {
        state.dropTimer += dt;
        const interval = state.forcedDecay ? 2.3 : 3.1 * (state.wanted >= 3 ? 1.8 : 1);
        if (state.dropTimer >= interval) {
          state.dropTimer -= interval;
          setWanted(state.wanted - 1);
        }
      }
    } else {
      state.decayTimer = 0;
      state.dropTimer = 0;
    }
  }
  function takeEvents() { return state.events.splice(0); }
  return { state, setWanted, addWanted, clear, update, hasLineOfSight, takeEvents };
}
