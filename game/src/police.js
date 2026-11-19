// Wanted levels 0-5 drive a pursuit with SMPD cruisers and officers on foot.
import * as THREE from '../vendor/three.module.min.js';
import { CITY, POLICE, VEHICLE } from './config.js';
import { clampToWorld, resolveCollisions } from './world.js';

const CALLSIGNS = ['IBIS-43', 'TARPON-10', 'HERON-17', 'KESTREL-31', 'MARLIN-24', 'OSPREY-08', 'PELICAN-62'];

function heliMesh() {
  const group = new THREE.Group();
  const body = new THREE.MeshLambertMaterial({ color: 0x172235 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x0d1421 });
  const stripe = new THREE.MeshLambertMaterial({ color: 0xf2f1e8 });
  const red = new THREE.MeshLambertMaterial({ color: 0xff5a4d, emissive: 0xff2f2f, emissiveIntensity: 1.2 });
  const blue = new THREE.MeshLambertMaterial({ color: 0x3fa7ff, emissive: 0x247bff, emissiveIntensity: 1.2 });
  const hull = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.15, 4.4), body);
  hull.position.y = 0.1;
  group.add(hull);
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.7, 1.55), dark);
  canopy.position.set(0, 0.72, 0.65);
  group.add(canopy);
  const band = new THREE.Mesh(new THREE.BoxGeometry(2.86, 0.22, 1.05), stripe);
  band.position.set(0, 0.06, -0.1);
  group.add(band);
  const boom = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.48, 4.8), body);
  boom.position.set(0, 0.2, -3.8);
  group.add(boom);
  const rotor = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.08, 8.2), stripe);
  rotor.position.y = 1.02;
  group.add(rotor);
  const rotorCross = new THREE.Mesh(new THREE.BoxGeometry(8.2, 0.08, 0.24), stripe);
  rotorCross.position.y = 1.02;
  group.add(rotorCross);
  const tailRotor = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.0, 0.08), stripe);
  tailRotor.position.set(0, 0.28, -6.18);
  group.add(tailRotor);
  const tailRotorCross = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.12, 0.08), stripe);
  tailRotorCross.position.set(0, 0.28, -6.18);
  group.add(tailRotorCross);
  const redLight = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.16, 0.18), red);
  const blueLight = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.16, 0.18), blue);
  redLight.position.set(-0.65, 0.78, -0.9);
  blueLight.position.set(0.65, 0.78, -0.9);
  group.add(redLight, blueLight);
  return { group, rotor, rotorCross, tailRotor, tailRotorCross, redLight, blueLight };
}

function copMesh() {
  const group = new THREE.Group();
  const uniform = new THREE.MeshLambertMaterial({ color: 0x24344d });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.66, 0.32), uniform);
  torso.position.y = 1.2;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.32, 0.28), new THREE.MeshLambertMaterial({ color: 0xc58d68 }));
  head.position.y = 1.7;
  group.add(head);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.32), new THREE.MeshLambertMaterial({ color: 0x172236 }));
  cap.position.y = 1.89;
  group.add(cap);
  const legs = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.76, 0.19), new THREE.MeshLambertMaterial({ color: 0x1c2a3e }));
    leg.position.set(side * 0.12, 0.42, 0);
    group.add(leg);
    legs.push(leg);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.55, 0.14), uniform);
    arm.position.set(side * 0.32, 1.22, 0);
    group.add(arm);
  }
  return { group, legs };
}

export function createPolice(city, scene, vehicles) {
  const roadNetwork = city.roadNetwork ?? city.graph;
  const colliders = city.colliders ?? [];
  const groundHeightAt = city.groundHeightAt ?? (() => 0);
  const laneOffset = Math.min(4.4, CITY.road / 2 - VEHICLE.radius);
  const state = {
    wanted: 0,
    heat: 0,
    decayTimer: 0,
    arrestTimer: 0,
    busted: false,
    stars: 0,
    cops: [],
    copCars: [],
    lineOfSight: false,
    lastCrime: '',
    lastCrimeAt: -999,
    pulse: 0,
    forcedDecay: false,
    heli: null,
  };
  let worldTime = 0;
  let spawnIndex = 0;

  function targetFor(player) {
    return player.state.inCar?.state ?? player.state;
  }

  function chaseDecayScale() {
    return !state.forcedDecay && state.wanted >= 3 ? 1.8 : 1;
  }

  function hasLineOfSight(observer, target) {
    const dx = target.x - observer.x;
    const dz = target.z - observer.z;
    if (Math.hypot(dx, dz) > POLICE.sight * 0.9) return false;
    for (const box of colliders) {
      if ((box.height ?? Infinity) < 1.3) continue;
      if (Math.max(observer.x, target.x) < box.minX || Math.min(observer.x, target.x) > box.maxX
        || Math.max(observer.z, target.z) < box.minZ || Math.min(observer.z, target.z) > box.maxZ) continue;
      let near = 0;
      let far = 1;
      if (Math.abs(dx) < 0.000001) {
        if (observer.x < box.minX || observer.x > box.maxX) continue;
      } else {
        const a = (box.minX - observer.x) / dx;
        const b = (box.maxX - observer.x) / dx;
        near = Math.max(near, Math.min(a, b));
        far = Math.min(far, Math.max(a, b));
      }
      if (Math.abs(dz) < 0.000001) {
        if (observer.z < box.minZ || observer.z > box.maxZ) continue;
      } else {
        const a = (box.minZ - observer.z) / dz;
        const b = (box.maxZ - observer.z) / dz;
        near = Math.max(near, Math.min(a, b));
        far = Math.min(far, Math.max(a, b));
      }
      if (near <= far && far > 0 && near < 1) return false;
    }
    return true;
  }

  function setWanted(level) {
    const value = Number.isFinite(level) ? Math.round(level) : 0;
    state.wanted = Math.max(0, Math.min(POLICE.maxWanted, value));
    state.stars = state.wanted;
    state.heat = state.wanted;
    state.decayTimer = 0;
    if (state.wanted === 0) state.arrestTimer = 0;
    if (state.wanted === 0) removeHelicopter();
  }

  function addWanted(amount, reason) {
    if (!Number.isFinite(amount) || amount <= 0) return;
    const previous = state.wanted;
    setWanted(Math.min(POLICE.maxWanted, state.wanted + amount));
    state.lastCrime = reason ?? '';
    state.lastCrimeAt = worldTime;
    if (state.wanted > previous) state.pulse = 1;
  }

  function removeCopCar(car) {
    scene.remove(car.group);
    const index = vehicles.cars.indexOf(car);
    if (index >= 0) vehicles.cars.splice(index, 1);
  }

  function removeFootCop(cop) {
    scene.remove(cop.group);
  }

  function removeHelicopter() {
    const heli = state.heli;
    if (!heli) return;
    scene.remove(heli.group);
    scene.remove(heli.spotlight);
    scene.remove(heli.spotlight.target);
    scene.remove(heli.ground);
    state.heli = null;
  }

  function helicopterHeight(x, z, baseHeight, margin = 7) {
    for (const tower of city.downtownTowers ?? []) {
      const dx = Math.max(tower.minX - x, 0, x - tower.maxX);
      const dz = Math.max(tower.minZ - z, 0, z - tower.maxZ);
      // Allow room for the tail and the tallest rooftop mast.
      if (Math.hypot(dx, dz) < margin) baseHeight = Math.max(baseHeight, tower.height + 10);
    }
    return baseHeight;
  }

  function spawnHelicopter(player) {
    if (state.heli) return state.heli;
    const built = heliMesh();
    const spotlight = new THREE.SpotLight(0xfff3c2, 3.2, 90, Math.PI / 8, 0.5, 1.2);
    const target = new THREE.Object3D();
    const ground = new THREE.Mesh(
      new THREE.TorusGeometry(8, 0.16, 6, 48),
      new THREE.MeshBasicMaterial({ color: 0xff5a4d, transparent: true, opacity: 0.68 }),
    );
    ground.rotation.x = -Math.PI / 2;
    scene.add(built.group, spotlight, target, ground);
    const position = targetFor(player);
    const { x, z } = helicopterLead(position, 0);
    built.group.name = 'police:helicopter';
    built.group.position.set(x, helicopterHeight(x, z, 18), z);
    spotlight.position.copy(built.group.position);
    spotlight.target = target;
    target.position.set(position.x, 0, position.z);
    ground.position.set(position.x, 0.08, position.z);
    state.heli = { ...built, spotlight, ground, orbit: 0 };
    return state.heli;
  }

  function helicopterLead(target, phase) {
    // Stay ahead of the pursuit, in a street corridor rather than orbiting behind the camera
    // or over a tower. The small lateral sweep still gives the search aircraft some motion.
    const heading = target.heading ?? 0;
    const lead = 34 + Math.min(12, Math.abs(target.speed ?? 0) * 0.25);
    const x = target.x + Math.sin(heading) * lead;
    const z = target.z + Math.cos(heading) * lead;
    const corridor = roadNetwork?.nearestEdge(x, z);
    const sweep = Math.sin(phase) * 1.5;
    return {
      x: (corridor?.x ?? x) + Math.cos(heading) * sweep,
      z: (corridor?.z ?? z) - Math.sin(heading) * sweep,
    };
  }

  function updateHelicopter(dt, player) {
    const heli = state.heli;
    if (!heli) return;
    const target = targetFor(player);
    heli.orbit += dt * 0.24;
    const lead = helicopterLead(target, heli.orbit);
    const desired = new THREE.Vector3(lead.x, 18 + Math.sin(worldTime * 0.7) * 1.2, lead.z);
    const position = heli.group.position;
    const approach = 1 - Math.exp(-dt * 5);
    const nextX = THREE.MathUtils.lerp(position.x, desired.x, approach);
    const nextZ = THREE.MathUtils.lerp(position.z, desired.z, approach);
    const climb = helicopterHeight(nextX, nextZ, desired.y);
    position.set(nextX, helicopterHeight(nextX, nextZ, THREE.MathUtils.lerp(position.y, climb, approach)), nextZ);
    heli.group.lookAt(target.x, heli.group.position.y, target.z);
    heli.rotor.rotation.y += dt * 18;
    heli.rotorCross.rotation.y += dt * 18;
    heli.tailRotor.rotation.z += dt * 24;
    heli.tailRotorCross.rotation.z += dt * 24;
    const flash = Math.floor(worldTime * 4) % 2 === 0;
    heli.redLight.visible = flash;
    heli.blueLight.visible = !flash;
    heli.spotlight.position.copy(heli.group.position);
    heli.spotlight.target.position.set(target.x, 0, target.z);
    heli.spotlight.distance = Math.max(90, position.distanceTo(heli.spotlight.target.position) + 8);
    heli.ground.position.set(target.x, 0.08, target.z);
  }

  function clear() {
    setWanted(0);
    state.busted = false;
    state.arrestTimer = 0;
    state.forcedDecay = false;
    state.lineOfSight = false;
    for (const car of state.copCars) removeCopCar(car);
    state.copCars.length = 0;
    for (const cop of state.cops) removeFootCop(cop);
    state.cops.length = 0;
    removeHelicopter();
  }

  function spawnCopCar(player) {
    const target = targetFor(player);
    const angle = (spawnIndex * 2.399963229728653 + state.wanted * 0.61803398875) % (Math.PI * 2);
    spawnIndex += 1;
    const distance = POLICE.sight + 40;
    const edge = roadNetwork?.nearestEdge(
      target.x + Math.cos(angle) * distance,
      target.z + Math.sin(angle) * distance,
    );
    if (!edge) return false;
    const x = edge.x;
    const z = edge.z;
    const heading = Math.atan2(target.x - x, target.z - z);
    const car = vehicles.spawnPoliceCar(x, z, heading);
    const listIndex = vehicles.cars.indexOf(car);
    if (listIndex >= 0) vehicles.cars.splice(listIndex, 1);
    car.ai = 'pursue';
    car.callsign = CALLSIGNS[(spawnIndex - 1) % CALLSIGNS.length];
    car.state.speed = 6;
    car.pursuit = {
      node: roadNetwork.nearestNode(x, z),
      next: null,
      laneSide: spawnIndex % 2 === 0 ? 1 : -1,
    };
    state.copCars.push(car);
    return true;
  }

  function spawnFootCop(player) {
    const target = targetFor(player);
    const angle = (spawnIndex * 2.399963229728653 + 1.1) % (Math.PI * 2);
    const distance = 22 + (spawnIndex % 7) * 1.7;
    spawnIndex += 1;
    const around = {
      x: target.x + Math.cos(angle) * distance,
      z: target.z + Math.sin(angle) * distance,
    };
    const edge = roadNetwork?.nearestEdge(around.x, around.z);
    if (!edge) return false;
    const dx = edge.edge.dx;
    const dz = edge.edge.dz;
    const length = edge.edge.length || 1;
    const side = spawnIndex % 2 === 0 ? 1 : -1;
    const candidateX = edge.x + (dz / length) * side * (CITY.road / 2 + 3);
    const candidateZ = edge.z - (dx / length) * side * (CITY.road / 2 + 3);
    const position = clampToWorld(resolveCollisions(colliders, candidateX, candidateZ, 0.4));
    const built = copMesh();
    built.group.position.set(position.x, groundHeightAt(position.x, position.z) + 0.28, position.z);
    scene.add(built.group);
    state.cops.push({
      group: built.group,
      legs: built.legs,
      x: position.x,
      z: position.z,
      heading: Math.atan2(target.x - position.x, target.z - position.z),
      shootTimer: 0,
      walk: 0,
      isCop: true,
      health: 60,
      alive: true,
      down: 0,
      callsign: CALLSIGNS[(spawnIndex - 1) % CALLSIGNS.length],
    });
    return true;
  }

  function removeExcessCars(wantedCount) {
    while (state.copCars.length > wantedCount) {
      removeCopCar(state.copCars.pop());
    }
  }

  function removeExcessCops(wantedCount) {
    while (state.cops.length > wantedCount) {
      removeFootCop(state.cops.pop());
    }
  }

  function roadWaypoint(car, target) {
    if (!roadNetwork) return target;
    const edgePoint = roadNetwork.nearestEdge(target.x, target.z);
    if (!edgePoint) return target;
    const goal = roadNetwork.nearestNode(edgePoint.x, edgePoint.z);
    const pursuit = car.pursuit;
    if (!pursuit.node) pursuit.node = roadNetwork.nearestNode(car.state.x, car.state.z);

    if (pursuit.next && Math.hypot(car.state.x - pursuit.next.other.x, car.state.z - pursuit.next.other.z) < 5) {
      pursuit.node = pursuit.next.other;
      pursuit.next = null;
    }
    const distanceToGoal = (node) => Math.hypot(node.x - goal.x, node.z - goal.z);
    if (pursuit.next && distanceToGoal(pursuit.next.other) >= distanceToGoal(pursuit.node)) {
      pursuit.next = null;
    }
    if (!pursuit.next && distanceToGoal(pursuit.node) > 0.5) {
      let best = Infinity;
      for (const neighbor of pursuit.node.neighbors) {
        const score = distanceToGoal(neighbor.other);
        if (score < best) {
          best = score;
          pursuit.next = neighbor;
        }
      }
    }

    if (pursuit.next) {
      const from = pursuit.node;
      const to = pursuit.next.other;
      const dx = to.x - from.x;
      const dz = to.z - from.z;
      const length = Math.hypot(dx, dz) || 1;
      return {
        x: to.x + (dz / length) * pursuit.laneSide * laneOffset,
        z: to.z - (dx / length) * pursuit.laneSide * laneOffset,
      };
    }

    const dx = edgePoint.edge.dx;
    const dz = edgePoint.edge.dz;
    const length = edgePoint.edge.length || 1;
    const side = pursuit.laneSide;
    return {
      x: edgePoint.x + (dz / length) * side * laneOffset,
      z: edgePoint.z - (dx / length) * side * laneOffset,
    };
  }

  function updateCopCar(car, dt, player) {
    if (car.state.wrecked) {
      removeCopCar(car);
      state.copCars.splice(state.copCars.indexOf(car), 1);
      return;
    }
    const target = targetFor(player);
    const distance = Math.hypot(car.state.x - target.x, car.state.z - target.z);
    const waypoint = roadWaypoint(car, target);
    const desiredHeading = Math.atan2(waypoint.x - car.state.x, waypoint.z - car.state.z);
    let delta = desiredHeading - car.state.heading;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    const steer = delta > 0.04 ? 'left' : delta < -0.04 ? 'right' : null;
    const targetSpeed = POLICE.copCarSpeed * (0.55 + 0.09 * state.wanted);
    const nextSpeed = Math.min(targetSpeed, car.state.speed + POLICE.copCarAccel * dt);
    const coast = Math.max(0.01, 1 - VEHICLE.roll * dt);
    car.state.speed = Math.min(VEHICLE.maxSpeed, nextSpeed / coast);
    vehicles.stepCar(car, dt, {
      accelerate: false,
      brake: false,
      left: steer === 'left',
      right: steer === 'right',
      handbrake: false,
    }, colliders);
    if (distance < 3.6 && player.state.inCar) {
      vehicles.damage(player.state.inCar, POLICE.copHit * dt * 9);
      vehicles.damage(car, 10 * dt);
    }
  }

  function updateCop(cop, dt, player, combat) {
    if (!cop.alive) {
      cop.down = Math.max(0, cop.down - dt);
      if (cop.down === 0) {
        cop.alive = true;
        cop.health = 60;
        cop.group.rotation.z = 0;
        cop.group.position.y = groundHeightAt(cop.x, cop.z) + 0.28;
      }
      return false;
    }
    const dx = player.state.x - cop.x;
    const dz = player.state.z - cop.z;
    const distance = Math.hypot(dx, dz);
    const targetHeading = Math.atan2(dx, dz);
    let delta = targetHeading - cop.heading;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    cop.heading += delta * Math.min(1, dt * 6);
    if (distance > POLICE.arrestRange) {
      const speed = distance > 12 ? POLICE.footCopSpeed * 1.35 : POLICE.footCopSpeed;
      const nx = cop.x + Math.sin(cop.heading) * speed * dt;
      const nz = cop.z + Math.cos(cop.heading) * speed * dt;
      const resolved = clampToWorld(resolveCollisions(colliders, nx, nz, 0.4));
      cop.x = resolved.x;
      cop.z = resolved.z;
      cop.walk += dt * speed * 4;
      cop.legs[0].rotation.x = Math.sin(cop.walk) * 0.6;
      cop.legs[1].rotation.x = -cop.legs[0].rotation.x;
    }
    cop.group.position.set(cop.x, groundHeightAt(cop.x, cop.z) + 0.28, cop.z);
    cop.group.rotation.y = cop.heading;
    cop.shootTimer -= dt;
    const visible = hasLineOfSight(cop, targetFor(player));
    if (cop.shootTimer <= 0 && distance < 30 && distance > 5 && state.wanted >= 3 && visible) {
      cop.shootTimer = 2.2;
      combat?.shootAtPlayer?.(cop, player);
    }
    return !player.state.inCar && distance <= POLICE.arrestRange && visible;
  }

  function update(dt, player, combat) {
    worldTime += dt;
    state.pulse = Math.max(0, state.pulse - dt * 2);
    if (state.wanted === 0) {
      removeExcessCars(0);
      removeExcessCops(0);
      state.lineOfSight = false;
      return;
    }

    if (state.wanted >= 3 && !state.heli) spawnHelicopter(player);
    updateHelicopter(dt, player);

    const target = targetFor(player);
    const outOfSight = state.copCars.every((car) => car.state.wrecked || !hasLineOfSight(car.state, target))
      && state.cops.every((cop) => !cop.alive || !hasLineOfSight(cop, target));
    state.lineOfSight = !outOfSight;
    const decayScale = chaseDecayScale();
    if (outOfSight) {
      state.decayTimer += dt;
      if (state.decayTimer > POLICE.decayDelay * decayScale) {
        state.heat = Math.max(0, state.heat - dt / (POLICE.decayEvery * decayScale));
        state.wanted = Math.ceil(state.heat);
        state.stars = state.wanted;
        if (state.wanted === 0) {
          state.heat = 0;
          state.decayTimer = 0;
          state.forcedDecay = false;
          return;
        }
      }
    } else {
      state.decayTimer = 0;
    }

    const wantedCount = Math.min(POLICE.maxWanted, state.wanted);
    while (state.copCars.length < wantedCount) {
      if (!spawnCopCar(player)) break;
    }
    removeExcessCars(wantedCount);
    const copCount = player.state.inCar ? 0 : wantedCount;
    while (state.cops.length < copCount) {
      if (!spawnFootCop(player)) break;
    }
    removeExcessCops(copCount);

    let nearbyOfficer = false;
    for (let index = state.copCars.length - 1; index >= 0; index -= 1) {
      const car = state.copCars[index];
      if (Math.hypot(car.state.x - target.x, car.state.z - target.z) > POLICE.sight * 2.4 && state.wanted < 4) {
        removeCopCar(car);
        state.copCars.splice(index, 1);
        continue;
      }
      updateCopCar(car, dt, player);
    }
    for (const cop of state.cops) {
      if (updateCop(cop, dt, player, combat)) nearbyOfficer = true;
    }

    if (nearbyOfficer) state.arrestTimer += dt;
    else if (state.arrestTimer > 0) state.arrestTimer = Math.max(0, state.arrestTimer - dt * 2);
    if (state.arrestTimer >= POLICE.arrestTime && !player.state.inCar) state.busted = true;
  }

  function distanceToNearest(x, z) {
    let best = Infinity;
    for (const car of state.copCars) best = Math.min(best, Math.hypot(car.state.x - x, car.state.z - z));
    for (const cop of state.cops) {
      if (cop.alive) best = Math.min(best, Math.hypot(cop.x - x, cop.z - z));
    }
    return best;
  }

  function getChaseUnits(player) {
    const target = targetFor(player);
    const units = [];
    for (const car of state.copCars) {
      const distance = Math.hypot(car.state.x - target.x, car.state.z - target.z);
      // Deterministic briefing rule: nearby cruisers ram a player car, distant cars and foot units roadblock.
      const tactic = player.state.inCar && distance <= 18 ? 'RAMMING' : distance > 60 ? 'ROADBLOCK' : 'PURSUIT';
      units.push({ callsign: car.callsign ?? 'SMPD-UNIT', tactic, distance: Math.round(distance) });
    }
    for (const cop of state.cops) {
      const distance = Math.hypot(cop.x - target.x, cop.z - target.z);
      units.push({ callsign: cop.callsign ?? 'SMPD-UNIT', tactic: 'ROADBLOCK', distance: Math.round(distance) });
    }
    return units;
  }

  function getChaseStatus(player, paperMoonActive = false) {
    // Panel status is IN SIGHT when visible, otherwise SEARCHING; Paper Moon calls hidden time EVADING.
    const status = state.lineOfSight ? 'IN SIGHT' : paperMoonActive ? 'EVADING' : 'SEARCHING';
    const denominator = POLICE.decayDelay * chaseDecayScale();
    const losePercent = state.lineOfSight ? 0
      : Math.max(0, Math.min(100, Math.round((state.decayTimer / denominator) * 100)));
    return { units: getChaseUnits(player), status, losePercent };
  }

  return {
    state,
    addWanted,
    setWanted,
    clear,
    update,
    spawnCopCar,
    distanceToNearest,
    getChaseUnits,
    getChaseStatus,
    heliPosition: () => state.heli ? { x: state.heli.group.position.x, y: state.heli.group.position.y, z: state.heli.group.position.z } : null,
    resolveCircle: (colliderList, x, z, radius) => resolveCollisions(colliderList, x, z, radius),
    reset: clear,
  };
}
