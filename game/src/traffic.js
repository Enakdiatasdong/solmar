import * as THREE from '../vendor/three.module.min.js';
import { createCar, syncCar } from './vehicles.js';
import { createPerson } from './player.js';
import { clampToWorld, resolveCollisions } from './world.js';

const colors = [0xe6bd56, 0x178d98, 0xd84c44, 0xe9dfc3, 0x7180a3, 0xd97d9c, 0x58796d];
const wrapped = a => Math.atan2(Math.sin(a), Math.cos(a));

export function createTraffic(city, scene, random) {
  const cars = [], pedestrians = [];
  const state = { arrivals: 0, illegalUTurns: 0, respawns: 0, distance: 0, transitions: [] };
  const graph = city.roadNetwork ?? city.graph;
  const nodeMap = new Map(graph.nodes.map(node => [node.id, node]));
  const getNode = ref => typeof ref === 'object' ? ref : nodeMap.get(ref);
  const neighbors = node => (node.neighbors ?? []).map(getNode).filter(Boolean);
  let elapsed = 0;

  function chooseNext(node, previous) {
    const choices = neighbors(node);
    const forward = choices.filter(other => other.id !== previous?.id);
    return random.pick(forward.length ? forward : choices);
  }
  function setRoute(car, from, to) {
    car.fromNode = from.id;
    car.toNode = to.id;
    car.route = { from, to };
    const dx = to.x - from.x, dz = to.z - from.z;
    const length = Math.hypot(dx, dz) || 1;
    car.targetX = to.x - dz / length * 3.6;
    car.targetZ = to.z + dx / length * 3.6;
  }
  function respawn(car, player = { x: 2, z: 88 }, initial = false) {
    let choices = graph.edges.filter(edge => {
      const a = getNode(edge.a), b = getNode(edge.b);
      if (!a || !b) return false;
      const distance = Math.hypot((a.x + b.x) / 2 - player.x, (a.z + b.z) / 2 - player.z);
      return distance > (initial ? 20 : 105) && distance < 240;
    });
    if (!choices.length) choices = graph.edges;
    const edge = random.pick(choices);
    if (!edge) return;
    let from = getNode(edge.a), to = getNode(edge.b);
    if (random.chance(.5)) [from, to] = [to, from];
    setRoute(car, from, to);
    const t = random.range(.12, .82);
    const dx = to.x - from.x, dz = to.z - from.z;
    const length = Math.hypot(dx, dz) || 1;
    car.x = from.x + dx * t - dz / length * 3.6;
    car.z = from.z + dz * t + dx / length * 3.6;
    car.heading = Math.atan2(dx, dz);
    car.speed = random.range(8, 13);
    car.cruise = random.range(11, 16);
    car.health = 100;
    car.wrecked = false;
    car.stuck = 0;
    car.parked = false;
    car.vx = Math.sin(car.heading) * car.speed;
    car.vz = Math.cos(car.heading) * car.speed;
    syncCar(car);
    if (!initial) state.respawns++;
  }
  function makePedestrian(index) {
    const col = random.int(0, 9), row = random.int(0, 9);
    const x0 = -360 + col * 72 + 11.5, z0 = -360 + row * 72 + 11.5;
    const path = [{ x: x0, z: z0 }, { x: x0 + 49, z: z0 }, { x: x0 + 49, z: z0 + 49 }, { x: x0, z: z0 + 49 }];
    const corner = random.int(0, 3), next = (corner + 1) % 4;
    const t = random.range(0, 1);
    const x = path[corner].x + (path[next].x - path[corner].x) * t;
    const z = path[corner].z + (path[next].z - path[corner].z) * t;
    const group = createPerson({ shirt: colors[index % colors.length], trousers: index % 2 ? 0xddd0a8 : 0x263345 });
    group.scale.setScalar(random.range(.85, 1.04));
    scene.add(group);
    const ped = { x, z, group, health: 60, alive: true, down: false, path, corner: next, speed: random.range(.95, 1.65), scatterTimer: 0, fleeX: 0, fleeZ: 0, heading: 0, phase: random.range(0, 6), downTime: 0 };
    group.position.set(x, 0, z);
    return ped;
  }
  function scatter(x, z) {
    for (const ped of pedestrians) {
      const dx = ped.x - x, dz = ped.z - z, d = Math.hypot(dx, dz);
      if (ped.down || d > 45) continue;
      ped.scatterTimer = 4;
      ped.fleeX = dx / (d || 1);
      ped.fleeZ = dz / (d || 1);
    }
  }
  function updateCars(dt, player, vehicles) {
    const all = [...cars, ...(vehicles?.cars ?? [])];
    for (const car of cars) {
      const oldX = car.x, oldZ = car.z;
      if (Math.hypot(car.x - player.x, car.z - player.z) > 285) { respawn(car, player); continue; }
      if (car.wrecked) {
        car.stuck += dt;
        if (car.stuck > 6) respawn(car, player);
        continue;
      }
      const dx = car.targetX - car.x, dz = car.targetZ - car.z;
      const distance = Math.hypot(dx, dz);
      if (distance < 2.8) {
        const previous = car.route.from, at = car.route.to;
        const next = chooseNext(at, previous);
        if (!next) { respawn(car, player); continue; }
        state.arrivals++;
        if (next.id === previous.id && neighbors(at).length > 1) state.illegalUTurns++;
        state.transitions.push({ previous: previous.id, at: at.id, next: next.id, degree: neighbors(at).length });
        if (state.transitions.length > 128) state.transitions.shift();
        setRoute(car, at, next);
      }
      const tx = car.targetX - car.x, tz = car.targetZ - car.z;
      const distanceToTarget = Math.hypot(tx, tz) || 1;
      const ux = tx / distanceToTarget, uz = tz / distanceToTarget;
      let desired = distanceToTarget < 13 ? Math.min(10, car.cruise) : car.cruise;
      const blockers = all.filter(other => other !== car);
      blockers.push({ x: player.x, z: player.z });
      for (const other of blockers) {
        const bx = other.x - car.x, bz = other.z - car.z;
        const forward = bx * ux + bz * uz;
        const lateral = Math.abs(bx * uz - bz * ux);
        if (forward > 0 && forward < 15 && lateral < 3.3) desired = Math.min(desired, Math.max(0, (forward - 5.1) * 1.5));
      }
      const change = (desired - car.speed) * Math.min(1, dt * (desired < car.speed ? 5 : 1.8));
      car.speed = Math.max(0, car.speed + change);
      const move = Math.min(distanceToTarget, car.speed * dt);
      const position = resolveCollisions(city.colliders, car.x + ux * move, car.z + uz * move, car.radius);
      const bounded = clampToWorld(position.x, position.z, car.radius);
      car.x = bounded.x;
      car.z = bounded.z;
      car.vx = ux * car.speed;
      car.vz = uz * car.speed;
      const heading = Math.atan2(ux, uz);
      car.heading += wrapped(heading - car.heading) * Math.min(1, dt * 7);
      car.contactCooldown = Math.max(0, (car.contactCooldown ?? 0) - dt);
      const moved = Math.hypot(car.x - oldX, car.z - oldZ);
      state.distance += moved;
      car.stuck = moved < dt * .28 ? car.stuck + dt : Math.max(0, car.stuck - dt * 2);
      if (car.stuck > 6) respawn(car, player);
      syncCar(car);
    }
  }
  function updatePedestrians(dt, player, vehicles) {
    const movingCars = [...cars, ...(vehicles?.cars ?? [])];
    for (const ped of pedestrians) {
      if (!ped.alive || ped.down || ped.health <= 0) {
        ped.down = true;
        ped.alive = false;
        ped.group.rotation.z += (Math.PI / 2 - ped.group.rotation.z) * Math.min(1, dt * 8);
        ped.group.position.y = .25;
        ped.downTime += dt;
        continue;
      }
      for (const car of movingCars) {
        const dx = ped.x - car.x, dz = ped.z - car.z, distance = Math.hypot(dx, dz);
        if (Math.abs(car.speed) > 3 && distance < 9) {
          ped.scatterTimer = 1.8;
          ped.fleeX = dx / (distance || 1);
          ped.fleeZ = dz / (distance || 1);
          break;
        }
      }
      let ux, uz, speed;
      if (ped.scatterTimer > 0) {
        ped.scatterTimer -= dt;
        ux = ped.fleeX;
        uz = ped.fleeZ;
        speed = 4.7;
      } else {
        const target = ped.path[ped.corner];
        const dx = target.x - ped.x, dz = target.z - ped.z, distance = Math.hypot(dx, dz);
        if (distance < .7) ped.corner = (ped.corner + 1) % ped.path.length;
        ux = dx / (distance || 1);
        uz = dz / (distance || 1);
        speed = ped.speed;
      }
      const hit = resolveCollisions(city.colliders, ped.x + ux * speed * dt, ped.z + uz * speed * dt, .4);
      const bounded = clampToWorld(hit.x, hit.z, .4);
      ped.x = bounded.x;
      ped.z = bounded.z;
      ped.heading = Math.atan2(ux, uz);
      ped.group.position.set(ped.x, 0, ped.z);
      ped.group.rotation.y = ped.heading;
      ped.phase += dt * speed * 2.8;
      const limbs = ped.group.userData.limbs;
      if (limbs) {
        const swing = Math.sin(ped.phase) * .5;
        limbs.legs[0].rotation.x = swing;
        limbs.legs[1].rotation.x = -swing;
        limbs.arms[0].rotation.x = -swing;
        limbs.arms[1].rotation.x = swing;
      }
    }
  }
  function update(dt, player, vehicles) {
    elapsed += dt;
    updateCars(dt, player, vehicles);
    updatePedestrians(dt, player, vehicles);
  }
  function reset() {
    for (const car of cars) scene.remove(car.group);
    for (const ped of pedestrians) scene.remove(ped.group);
    cars.length = 0;
    pedestrians.length = 0;
    state.arrivals = state.illegalUTurns = state.respawns = state.distance = 0;
    state.transitions.length = 0;
    elapsed = 0;
    for (let i = 0; i < 18; i++) {
      const car = createCar({ color: colors[i % colors.length], parked: false });
      car.traffic = true;
      cars.push(car);
      scene.add(car.group);
      respawn(car, { x: 2, z: 88 }, true);
    }
    for (let i = 0; i < 55; i++) pedestrians.push(makePedestrian(i));
  }
  reset();
  return { cars, pedestrians, state, update, scatter, reset, chooseNext };
}
