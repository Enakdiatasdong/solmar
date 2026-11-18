// Ambient life: AI cars that drive the road graph and pedestrians that wander the sidewalks,
// spawned within a radius around Jax and recycled when they fall behind. Steering is deliberately
// loose: cars follow lane-offset waypoints, brake for the player and each other, and despawn out of
// sight. Pedestrians keep to block edges and scatter when a car or gunshot is near.
import * as THREE from '../vendor/three.module.min.js';
import { CITY, PALETTE, TRAFFIC, VEHICLE } from './config.js';
import { resolveCollisions } from './world.js';

const PED_LIMIT = 26;

function pedMesh(random) {
  const group = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: random.pick(PALETTE.npc.shirt) });
  const skin = new THREE.MeshLambertMaterial({ color: random.pick(PALETTE.npc.skin) });
  const pants = new THREE.MeshLambertMaterial({ color: random.pick([0x2f3a4a, 0x4a3d2f, 0x2c3230, 0x5a5040]) });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.62, 0.28), shirt);
  torso.position.y = 1.18;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.32, 0.28), skin);
  head.position.y = 1.68;
  group.add(head);
  const legs = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.72, 0.18), pants);
    leg.position.set(side * 0.11, 0.4, 0);
    group.add(leg);
    legs.push(leg);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.55, 0.14), shirt);
    arm.position.set(side * 0.3, 1.2, 0);
    group.add(arm);
  }
  return { group, legs };
}

export function createTraffic(city, scene, random) {
  const trafficCars = [];
  const peds = [];
  const carSpecs = PALETTE.cars;
  const roadNetwork = city.roadNetwork ?? city.graph;
  const colliders = city.colliders ?? [];
  const carSpawnPoints = city.spawnPoints?.trafficCars ?? [];
  const pedSpawnPoints = city.spawnPoints?.sidewalkPedestrians ?? [];

  function playerPosition(player) {
    return player.state.inCar?.state ?? player.state;
  }

  function randomPointNear(x, z, minRadius, maxRadius) {
    const angle = random() * Math.PI * 2;
    const radius = minRadius + random() * (maxRadius - minRadius);
    return { x: x + Math.cos(angle) * radius, z: z + Math.sin(angle) * radius };
  }

  function pickDirection(node) {
    const options = node?.neighbors?.filter((neighbor) => (
      neighbor.other.x >= CITY.nodeMin
      && neighbor.other.x <= CITY.nodeMax
      && neighbor.other.z >= CITY.nodeMin
      && neighbor.other.z <= CITY.nodeMax
    )) ?? [];
    if (options.length === 0) return null;
    return random.pick(options);
  }

  function lanePoint(from, to) {
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const length = Math.hypot(dx, dz) || 1;
    return {
      x: to.x + (dz / length) * TRAFFIC.laneOffset,
      z: to.z - (dx / length) * TRAFFIC.laneOffset,
    };
  }

  function setRouteOnEdge(car, edge, t, towardB) {
    const from = towardB ? edge.a : edge.b;
    const to = towardB ? edge.b : edge.a;
    const dx = towardB ? edge.dx : -edge.dx;
    const dz = towardB ? edge.dz : -edge.dz;
    const length = edge.length || 1;
    car.x = edge.a.x + edge.dx * t + (dz / length) * TRAFFIC.laneOffset;
    car.z = edge.a.z + edge.dz * t - (dx / length) * TRAFFIC.laneOffset;
    car.heading = Math.atan2(dx, dz);
    car.node = from;
    car.next = { other: to };
  }

  function spawnPointNear(points, x, z, minRadius, maxRadius, occupied, minSpacing) {
    if (points.length === 0) return null;
    const candidates = points.filter((point) => {
      const distance = Math.hypot(point.x - x, point.z - z);
      return distance >= minRadius
        && distance <= maxRadius
        && !occupied.some((other) => Math.hypot(other.x - point.x, other.z - point.z) < minSpacing);
    });
    return candidates.length > 0 ? random.pick(candidates) : null;
  }

  function routeCarAt(car, point) {
    const nearest = roadNetwork.nearestEdge(point.x, point.z);
    if (!nearest) return;
    const edge = nearest.edge;
    const dx = edge.b.x - edge.a.x;
    const dz = edge.b.z - edge.a.z;
    const t = Math.max(0, Math.min(1, Math.abs(dx) >= Math.abs(dz)
      ? (nearest.x - edge.a.x) / (dx || 1)
      : (nearest.z - edge.a.z) / (dz || 1)));
    const towardB = Math.sin(point.heading) * dx + Math.cos(point.heading) * dz >= 0;
    setRouteOnEdge(car, edge, t, towardB);
  }

  function randomRoadSpawn(x, z, minRadius = 45) {
    const occupied = trafficCars.map((car) => ({ x: car.x, z: car.z }));
    const point = spawnPointNear(carSpawnPoints, x, z, minRadius, TRAFFIC.spawnRadius, occupied, 12);
    if (point) return point;
    const nearby = randomPointNear(x, z, minRadius, TRAFFIC.spawnRadius);
    const edgePoint = roadNetwork.nearestEdge(nearby.x, nearby.z);
    if (!edgePoint || edgePoint.distance > TRAFFIC.spawnRadius) return null;
    const heading = Math.atan2(edgePoint.edge.dx, edgePoint.edge.dz);
    return { x: edgePoint.x, z: edgePoint.z, heading };
  }

  function makeTrafficCar(position, heading) {
    const spec = random.pick(carSpecs);
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(2, 0.58, 4.1), new THREE.MeshLambertMaterial({ color: spec.body }));
    body.position.y = 0.62;
    group.add(body);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.48, 1.9), new THREE.MeshLambertMaterial({ color: 0x25313a }));
    cabin.position.set(0, 1.14, -0.1);
    group.add(cabin);
    const wheels = [];
    for (const [wx, wz] of [[-0.98, 1.3], [0.98, 1.3], [-0.98, -1.3], [0.98, -1.3]]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.24, 8).rotateZ(Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x1a1a1c }));
      wheel.position.set(wx, 0.36, wz);
      group.add(wheel);
      wheels.push(wheel);
    }
    group.position.set(position.x, 0, position.z);
    group.rotation.y = heading;
    scene.add(group);
    const car = {
      group,
      wheels,
      x: position.x,
      z: position.z,
      heading,
      speed: 0,
      targetSpeed: random.range(TRAFFIC.carSpeedMin, TRAFFIC.carSpeedMax),
      node: roadNetwork.nearestNode(position.x, position.z),
      next: null,
      stuck: 0,
      spin: 0,
    };
    car.next = pickDirection(car.node);
    trafficCars.push(car);
    return car;
  }

  function respawnCar(car, playerX, playerZ) {
    const point = randomRoadSpawn(playerX, playerZ, 45);
    if (!point) return false;
    routeCarAt(car, point);
    car.speed = TRAFFIC.carSpeedMin;
    car.stuck = 0;
    car.targetSpeed = random.range(TRAFFIC.carSpeedMin, TRAFFIC.carSpeedMax);
    car.group.position.set(car.x, 0, car.z);
    car.group.rotation.y = car.heading;
    return true;
  }

  function spawnAll(playerX, playerZ) {
    let attempts = 0;
    while (trafficCars.length < TRAFFIC.cars && attempts < TRAFFIC.cars * 20) {
      attempts += 1;
      const point = randomRoadSpawn(playerX, playerZ);
      if (!point) continue;
      const car = makeTrafficCar(point, point.heading);
      routeCarAt(car, point);
      car.group.position.set(car.x, 0, car.z);
      car.group.rotation.y = car.heading;
    }
    let pedAttempts = 0;
    let pedFailures = 0;
    while (peds.length < TRAFFIC.pedestrians && pedAttempts < TRAFFIC.pedestrians * 4 && pedFailures < 3) {
      const previousCount = peds.length;
      spawnPed(playerX, playerZ);
      pedAttempts += 1;
      pedFailures = peds.length === previousCount ? pedFailures + 1 : 0;
    }
  }

  function spawnPed(playerX, playerZ) {
    if (peds.length >= PED_LIMIT) return;
    let position = null;
    const point = spawnPointNear(pedSpawnPoints, playerX, playerZ, 30, TRAFFIC.spawnRadius, peds, 5);
    if (point) position = { x: point.x, z: point.z };
    for (let attempt = 0; attempt < 12 && !position; attempt += 1) {
      const point = randomPointNear(playerX, playerZ, 30, TRAFFIC.spawnRadius);
      const nearest = roadNetwork.nearestEdge(point.x, point.z);
      if (!nearest || nearest.distance > TRAFFIC.spawnRadius) continue;
      const edge = nearest.edge;
      const dx = edge.b.x - edge.a.x;
      const dz = edge.b.z - edge.a.z;
      const length = edge.length || 1;
      const along = random.range(-8, 8);
      const side = random.chance(0.5) ? -1 : 1;
      const x = nearest.x + (dx / length) * along + side * (dz / length) * (CITY.road / 2 + 3);
      const z = nearest.z + (dz / length) * along - side * (dx / length) * (CITY.road / 2 + 3);
      const resolved = resolveCollisions(colliders, x, z, 0.28);
      const inWalkableBounds = Math.abs(resolved.x) <= CITY.half + 8
        && resolved.z >= -CITY.half - 8
        && resolved.z <= CITY.beachStart + 8;
      if (!resolved.hit && inWalkableBounds) position = { x, z };
    }
    if (!position) return;
    const { x, z } = position;
    const built = pedMesh(random);
    built.group.position.set(x, 0.28, z);
    scene.add(built.group);
    peds.push({
      group: built.group,
      legs: built.legs,
      x,
      z,
      heading: random.range(0, Math.PI * 2),
      speed: random.range(TRAFFIC.pedSpeedMin, TRAFFIC.pedSpeedMax),
      walk: random.range(0, 10),
      wander: 0,
      panicked: 0,
      down: false,
    });
  }

  function stepCar(car, dt, player) {
    car.speed += (car.targetSpeed - car.speed) * Math.min(1, dt * 1.2);
    let turnTarget = car.heading;
    if (car.next) {
      const waypoint = lanePoint(car.node, car.next.other);
      const dx = waypoint.x - car.x;
      const dz = waypoint.z - car.z;
      const distance = Math.hypot(dx, dz);
      if (distance < 4 || Math.abs(dx) < 2.2 && Math.abs(dz) < 2.2) {
        car.node = car.next.other;
        car.next = pickDirection(car.node);
      } else {
        turnTarget = Math.atan2(dx, dz);
      }
    }
    if (!car.next) {
      car.next = pickDirection(car.node);
      if (!car.next) car.heading += Math.PI;
    }
    let delta = turnTarget - car.heading;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    car.heading += delta * Math.min(1, dt * 2.5);

    const aheadX = car.x + Math.sin(car.heading) * 7;
    const aheadZ = car.z + Math.cos(car.heading) * 7;
    let wantsBrake = false;
    if (player) {
      const target = playerPosition(player);
      const distance = Math.hypot(target.x - aheadX, target.z - aheadZ);
      if (distance < (player.state.inCar ? 6.5 : 5.5)) wantsBrake = true;
    }
    for (let index = 0; index < trafficCars.length; index += 1) {
      const other = trafficCars[index];
      if (other === car) continue;
      if (Math.hypot(other.x - aheadX, other.z - aheadZ) < 5) {
        wantsBrake = true;
        break;
      }
    }
    const speed = wantsBrake ? Math.max(0, car.speed - dt * 16) : car.speed;
    if (wantsBrake) car.speed = speed;
    const nextX = car.x + Math.sin(car.heading) * car.speed * dt;
    const nextZ = car.z + Math.cos(car.heading) * car.speed * dt;
    const resolved = resolveCollisions(colliders, nextX, nextZ, VEHICLE.radius);
    car.x = resolved.x;
    car.z = resolved.z;
    if (resolved.hit) car.speed = Math.min(car.speed, TRAFFIC.carSpeedMin * 0.65);

    car.group.position.set(car.x, 0, car.z);
    car.group.rotation.y = car.heading;
    car.spin += car.speed * dt * 2.2;
    for (const wheel of car.wheels) wheel.rotation.x = car.spin;

    if (player) {
      const target = playerPosition(player);
      if (Math.hypot(car.x - target.x, car.z - target.z) > TRAFFIC.despawnRadius) {
        respawnCar(car, target.x, target.z);
      }
    }
  }

  function stepPed(ped, dt, player, vehicles) {
    const playerTarget = playerPosition(player);
    const distance = Math.hypot(ped.x - playerTarget.x, ped.z - playerTarget.z);
    if (distance > TRAFFIC.despawnRadius) {
      scene.remove(ped.group);
      return false;
    }
    if (ped.down) {
      ped.group.rotation.x = Math.min(Math.PI / 2, ped.group.rotation.x + dt * 5);
      return true;
    }
    ped.wander -= dt;
    if (ped.wander <= 0) {
      ped.wander = random.range(1.5, 4);
      ped.targetHeading = random.range(0, Math.PI * 2);
      ped.speed = random.range(TRAFFIC.pedSpeedMin, TRAFFIC.pedSpeedMax);
    }
    let threat = player.state.inCar ? player.state.inCar.state : null;
    let threatDistance = threat ? Math.hypot(ped.x - threat.x, ped.z - threat.z) : Infinity;
    for (const car of trafficCars) {
      if (car.speed < 2) continue;
      const carDistance = Math.hypot(ped.x - car.x, ped.z - car.z);
      if (carDistance < threatDistance) {
        threat = car;
        threatDistance = carDistance;
      }
    }
    for (const car of vehicles?.cars ?? []) {
      if (Math.abs(car.state.speed) < 2) continue;
      const carDistance = Math.hypot(ped.x - car.state.x, ped.z - car.state.z);
      if (carDistance < threatDistance) {
        threat = car.state;
        threatDistance = carDistance;
      }
    }
    if (threat && threatDistance < 16) {
      ped.panicked = Math.max(ped.panicked, 0.6);
      ped.panicTarget = { x: threat.x, z: threat.z };
    }
    if (ped.panicked > 0) {
      ped.panicked -= dt * 0.7;
      if (ped.panicTarget) {
        ped.targetHeading = Math.atan2(ped.x - ped.panicTarget.x, ped.z - ped.panicTarget.z);
      }
      ped.speed = TRAFFIC.pedSpeedMax * 2.1;
    }
    if (ped.targetHeading !== undefined) {
      let delta = ped.targetHeading - ped.heading;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      ped.heading += delta * Math.min(1, dt * 4.5);
    }
    const nx = ped.x + Math.sin(ped.heading) * ped.speed * dt;
    const nz = ped.z + Math.cos(ped.heading) * ped.speed * dt;
    const resolved = resolveCollisions(colliders, nx, nz, 0.28);
    const inWalkableBounds = Math.abs(resolved.x) <= CITY.half + 8
      && resolved.z >= -CITY.half - 8
      && resolved.z <= CITY.beachStart + 8;
    if (inWalkableBounds) {
      ped.x = resolved.x;
      ped.z = resolved.z;
    }
    if (resolved.hit || !inWalkableBounds) {
      ped.heading += random.chance(0.5) ? Math.PI * 0.5 : -Math.PI * 0.5;
      ped.wander = 0;
    }
    ped.walk += dt * ped.speed * 4.2;
    ped.group.position.set(ped.x, 0.28, ped.z);
    ped.group.rotation.y = ped.heading;
    const swing = Math.sin(ped.walk) * 0.55;
    ped.legs[0].rotation.x = swing;
    ped.legs[1].rotation.x = -swing;
    return true;
  }

  function update(dt, player, vehicles) {
    for (let index = 0; index < trafficCars.length; index += 1) {
      const car = trafficCars[index];
      const previousX = car.x;
      const previousZ = car.z;
      stepCar(car, dt, player);
      vehicles?.resolveCarCollisions?.(car);
      car.stuck += Math.hypot(car.x - previousX, car.z - previousZ) < dt * 0.5 ? dt : -dt;
      car.stuck = Math.max(0, car.stuck);
      if (car.stuck > 6) {
        const target = playerPosition(player);
        respawnCar(car, target.x, target.z);
      }
    }
    for (let index = peds.length - 1; index >= 0; index -= 1) {
      if (!stepPed(peds[index], dt, player, vehicles)) peds.splice(index, 1);
    }
    const target = playerPosition(player);
    if (peds.length < TRAFFIC.pedestrians && random() < 0.2) spawnPed(target.x, target.z);
    if (trafficCars.length < TRAFFIC.cars) {
      const point = randomRoadSpawn(target.x, target.z);
      if (point) {
        const car = makeTrafficCar(point, point.heading);
        routeCarAt(car, point);
        car.group.position.set(car.x, 0, car.z);
        car.group.rotation.y = car.heading;
      }
    }
  }

  function knockPed(ped, direction) {
    ped.down = true;
    ped.panicked = 3;
    ped.heading = direction;
  }

  function nearestPed(x, z, radius) {
    for (let index = 0; index < peds.length; index += 1) {
      const ped = peds[index];
      if (!ped.down && Math.hypot(ped.x - x, ped.z - z) < radius) return ped;
    }
    return null;
  }

  function reset() {
    for (const car of trafficCars) scene.remove(car.group);
    trafficCars.length = 0;
    for (const ped of peds) scene.remove(ped.group);
    peds.length = 0;
  }

  return {
    cars: trafficCars,
    peds,
    spawnAll,
    spawnPed,
    update,
    knockPed,
    nearestPed,
    reset,
    stepCar,
  };
}
