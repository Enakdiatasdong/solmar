// Ambient traffic follows the road graph. Pedestrians walk between curbs and cross near corners.
import * as THREE from '../vendor/three.module.min.js';
import { CITY, PALETTE, TRAFFIC, VEHICLE } from './config.js';
import { roadConflict } from './roads.js';
import { resolveCollisions } from './world.js';
import { buildNightCityCar, NIGHTCITY_MODELS, NIGHTCITY_PAINTS } from './nightcity-cars.js';

const PED_LIMIT = 72;
const SPAWN_DENSITY = { cars: 2, pedestrians: 2 };
const LANE_SHIFT = 2.5;
const CAR_GAP = 5;
const CAR_BRAKE = 17;
const SIDEWALK_OFFSET = CITY.road / 2 + 3;
const CROSSING_OFFSET = CITY.road / 2 + 6;
const trafficGeometry = {
  torso: new THREE.BoxGeometry(0.46, 0.62, 0.28),
  head: new THREE.BoxGeometry(0.3, 0.32, 0.28),
  leg: new THREE.BoxGeometry(0.16, 0.72, 0.18),
  arm: new THREE.BoxGeometry(0.12, 0.55, 0.14),
};
const ambientMaterials = new Map();
const pantsColors = [0x2f3a4a, 0x4a3d2f, 0x2c3230, 0x5a5040];
const pedStride = (phase) => Math.sin(phase) * 0.55;
const TRAFFIC_MODEL_WEIGHTS = [
  ['standard', 21], ['thunder', 13], ['compact', 21], ['suv', 21],
  ['obsidian', 6], ['grandtourer', 6], ['gullwing', 6], ['teardrop', 6],
];
const TRAFFIC_MODEL_WEIGHT = TRAFFIC_MODEL_WEIGHTS.reduce((sum, [, weight]) => sum + weight, 0);

function ambientMaterial(color) {
  if (!ambientMaterials.has(color)) ambientMaterials.set(color, new THREE.MeshLambertMaterial({ color }));
  return ambientMaterials.get(color);
}

function pedMesh(random) {
  const group = new THREE.Group();
  const shirt = ambientMaterial(random.pick(PALETTE.npc.shirt));
  const skin = ambientMaterial(random.pick(PALETTE.npc.skin));
  const pants = ambientMaterial(random.pick(pantsColors));
  const torso = new THREE.Mesh(trafficGeometry.torso, shirt);
  torso.position.y = 1.18;
  group.add(torso);
  const head = new THREE.Mesh(trafficGeometry.head, skin);
  head.position.y = 1.68;
  group.add(head);
  const legs = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(trafficGeometry.leg, pants);
    leg.position.set(side * 0.11, 0.4, 0);
    group.add(leg);
    legs.push(leg);
    const arm = new THREE.Mesh(trafficGeometry.arm, shirt);
    arm.position.set(side * 0.3, 1.2, 0);
    group.add(arm);
  }
  return { group, legs };
}

// Passersby on short paved paths behind the curb use traffic's pedestrian models.
function createSidewalkWalkers(parent, routes, random) {
  const group = new THREE.Group();
  group.name = 'Sidewalk passersby';
  parent.add(group);
  const walkers = [];
  for (const { x, z, axis, length } of routes) {
    const acrossX = axis === 'x';
    if (roadConflict({ x, z, width: (acrossX ? length : 0) + 1.2,
      depth: (acrossX ? 0 : length) + 1.2 })) continue;
    walkers.push({ x, z, acrossX, length,
      distance: random.range(0, length * 2),
      speed: random.range(TRAFFIC.pedSpeedMin, TRAFFIC.pedSpeedMax),
      walk: random.range(0, Math.PI * 2),
    });
  }
  if (!walkers.length) return { count: 0, update() {} };

  const batch = (part, copies = 1) => {
    const mesh = new THREE.InstancedMesh(trafficGeometry[part], ambientMaterial(0xffffff), walkers.length * copies);
    mesh.name = `sidewalk-pedestrian:${part}`;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // This citywide batch moves within its reserved paths.
    mesh.frustumCulled = false;
    group.add(mesh);
    return mesh;
  };
  const torsos = batch('torso'), heads = batch('head'), legs = batch('leg', 2), arms = batch('arm', 2);
  const color = new THREE.Color();
  for (let index = 0; index < walkers.length; index += 1) {
    torsos.setColorAt(index, color.setHex(random.pick(PALETTE.npc.shirt)));
    arms.setColorAt(index * 2, color);
    arms.setColorAt(index * 2 + 1, color);
    heads.setColorAt(index, color.setHex(random.pick(PALETTE.npc.skin)));
    color.setHex(random.pick(pantsColors));
    legs.setColorAt(index * 2, color);
    legs.setColorAt(index * 2 + 1, color);
  }
  const pose = new THREE.Object3D();
  pose.rotation.order = 'YXZ';
  function place(mesh, index, x, y, z, yaw, pitch = 0) {
    pose.position.set(x, y + 0.28, z);
    pose.rotation.set(pitch, yaw, 0);
    pose.updateMatrix();
    mesh.setMatrixAt(index, pose.matrix);
  }
  function update(dt) {
    for (let index = 0; index < walkers.length; index += 1) {
      const ped = walkers[index];
      ped.distance = (ped.distance + dt * ped.speed) % (ped.length * 2);
      ped.walk = (ped.walk + dt * ped.speed * 4.2) % (Math.PI * 2);
      const outward = ped.distance < ped.length;
      const along = (outward ? ped.distance : 2 * ped.length - ped.distance) - ped.length / 2;
      const x = ped.x + (ped.acrossX ? along : 0);
      const z = ped.z + (ped.acrossX ? 0 : along);
      const yaw = (ped.acrossX ? Math.PI / 2 : 0) + (outward ? 0 : Math.PI);
      const swing = pedStride(ped.walk);
      place(torsos, index, x, 1.18, z, yaw);
      place(heads, index, x, 1.68, z, yaw);
      for (let side = -1; side <= 1; side += 2) {
        const slot = index * 2 + (side + 1) / 2;
        const dx = ped.acrossX ? 0 : side;
        const dz = ped.acrossX ? side : 0;
        place(legs, slot, x + dx * 0.11, 0.4, z + dz * 0.11, yaw, swing * side);
        place(arms, slot, x + dx * 0.3, 1.2, z + dz * 0.3, yaw, -swing * side);
      }
    }
    torsos.instanceMatrix.needsUpdate = heads.instanceMatrix.needsUpdate =
      legs.instanceMatrix.needsUpdate = arms.instanceMatrix.needsUpdate = true;
  }
  update(0);
  return { count: walkers.length, update };
}

export function createTraffic(city, scene, random) {
  const trafficCars = [];
  const peds = [];
  let sidewalkWalkers = null;
  const carTarget = Math.min(TRAFFIC.cars * SPAWN_DENSITY.cars, 96);
  const pedTarget = Math.min(TRAFFIC.pedestrians * SPAWN_DENSITY.pedestrians, PED_LIMIT);
  const roadNetwork = city.roadNetwork ?? city.graph;
  const colliders = city.colliders ?? [];
  const groundHeightAt = city.groundHeightAt ?? (() => 0);
  const colliderBuckets = new Map();
  const carSpawnPoints = city.spawnPoints?.trafficCars ?? [];
  const pedSpawnPoints = city.spawnPoints?.sidewalkPedestrians ?? [];
  const bucketSize = CITY.pitch / 2;
  const graphBounds = roadNetwork.nodes.reduce((bounds, node) => ({
    minX: Math.min(bounds.minX, node.x), maxX: Math.max(bounds.maxX, node.x),
    minZ: Math.min(bounds.minZ, node.z), maxZ: Math.max(bounds.maxZ, node.z),
  }), { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });

  function bucketKey(x, z) { return x + z * 4096; }

  // Building footprints are static. Limit the collision scans for each ambient actor.
  for (const box of colliders) {
    const margin = VEHICLE.radius + 4;
    const minX = Math.floor((box.minX - margin) / bucketSize);
    const maxX = Math.floor((box.maxX + margin) / bucketSize);
    const minZ = Math.floor((box.minZ - margin) / bucketSize);
    const maxZ = Math.floor((box.maxZ + margin) / bucketSize);
    for (let z = minZ; z <= maxZ; z += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const key = bucketKey(x, z);
        if (!colliderBuckets.has(key)) colliderBuckets.set(key, []);
        colliderBuckets.get(key).push(box);
      }
    }
  }

  function resolveAmbientPosition(x, z, radius) {
    const key = bucketKey(Math.floor(x / bucketSize), Math.floor(z / bucketSize));
    const nearby = colliderBuckets.get(key);
    return nearby ? resolveCollisions(nearby, x, z, radius) : { x, z, hit: false };
  }

  function playerPosition(player) {
    return player.state.inCar?.state ?? player.state;
  }

  function randomPointNear(x, z, minRadius, maxRadius) {
    const angle = random() * Math.PI * 2;
    const radius = minRadius + random() * (maxRadius - minRadius);
    return { x: x + Math.cos(angle) * radius, z: z + Math.sin(angle) * radius };
  }

  function pickDirection(node, previousNode) {
    const options = node?.neighbors ?? [];
    const onward = options.filter((neighbor) => neighbor.other !== previousNode);
    return random.pick(onward.length ? onward : options) ?? null;
  }

  function isWalkablePosition(position) {
    const nearest = roadNetwork.nearestEdge(position.x, position.z);
    const margin = (nearest?.edge.width ?? CITY.road) / 2 + 9;
    return position.x >= Math.min(graphBounds.minX - SIDEWALK_OFFSET, CITY.beachWestStart - 8)
      && position.x <= graphBounds.maxX + SIDEWALK_OFFSET
      && position.z >= graphBounds.minZ - SIDEWALK_OFFSET
      && position.z <= graphBounds.maxZ + SIDEWALK_OFFSET
      && nearest?.distance <= margin;
  }

  function lanePoint(from, to, laneOffset) {
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const length = Math.hypot(dx, dz) || 1;
    return { x: to.x + dz / length * laneOffset, z: to.z - dx / length * laneOffset };
  }

  function setRouteOnEdge(car, edge, t, towardB) {
    const from = towardB ? edge.a : edge.b;
    const to = towardB ? edge.b : edge.a;
    const dx = towardB ? edge.dx : -edge.dx;
    const dz = towardB ? edge.dz : -edge.dz;
    const length = edge.length || 1;
    car.laneOffset = car.laneTarget = Math.min(TRAFFIC.laneOffset + car.laneBias, (edge.width ?? CITY.road) / 2 - VEHICLE.radius - 0.3);
    car.x = edge.a.x + edge.dx * t + (dz / length) * car.laneOffset;
    car.z = edge.a.z + edge.dz * t - (dx / length) * car.laneOffset;
    car.heading = Math.atan2(dx, dz);
    car.node = from;
    car.next = { edge, other: to };
  }

  function spawnPointNear(points, x, z, minRadius, maxRadius, occupied, minSpacing, preferCenter = false) {
    if (points.length === 0) return null;
    const candidates = points.filter((point) => {
      const distance = Math.hypot(point.x - x, point.z - z);
      return distance >= minRadius
        && distance <= maxRadius
        && !occupied.some((other) => Math.hypot(other.x - point.x, other.z - point.z) < minSpacing);
    });
    if (candidates.length === 0) return null;
    if (!preferCenter) return random.pick(candidates);
    // Weighted sampling keeps traffic near the main grid while still allowing broad coverage.
    let totalWeight = 0;
    const weighted = candidates.map((point) => {
      const centerDistance = Math.hypot(point.x, point.z);
      const weight = 1 / (1 + (centerDistance / 210) ** 2);
      totalWeight += weight;
      return { point, weight };
    });
    let choice = random() * totalWeight;
    for (const entry of weighted) {
      choice -= entry.weight;
      if (choice <= 0) return entry.point;
    }
    return weighted.at(-1).point;
  }

  function routeCarAt(car, point) {
    const nearest = point.edge ? { edge: point.edge, x: point.x, z: point.z } : roadNetwork.nearestEdge(point.x, point.z);
    if (!nearest) return;
    const edge = nearest.edge;
    const dx = edge.b.x - edge.a.x;
    const dz = edge.b.z - edge.a.z;
    const t = Math.max(0, Math.min(1, point.t ?? (Math.abs(dx) >= Math.abs(dz)
      ? (nearest.x - edge.a.x) / (dx || 1)
      : (nearest.z - edge.a.z) / (dz || 1))));
    const towardB = Math.sin(point.heading) * dx + Math.cos(point.heading) * dz >= 0;
    setRouteOnEdge(car, edge, t, towardB);
  }

  function randomRoadSpawn(x, z, minRadius = 45, preferCenter = false) {
    const occupied = trafficCars.map((car) => ({ x: car.x, z: car.z }));
    const point = spawnPointNear(carSpawnPoints, x, z, minRadius, TRAFFIC.spawnRadius, occupied, 12, preferCenter);
    if (point) return point;
    const nearby = randomPointNear(x, z, minRadius, TRAFFIC.spawnRadius);
    const edgePoint = roadNetwork.nearestEdge(nearby.x, nearby.z);
    if (!edgePoint || edgePoint.distance > TRAFFIC.spawnRadius) return null;
    const heading = Math.atan2(edgePoint.edge.dx, edgePoint.edge.dz);
    return { x: edgePoint.x, z: edgePoint.z, heading };
  }

  function pickTrafficModel() {
    let choice = random() * TRAFFIC_MODEL_WEIGHT;
    for (const [id, weight] of TRAFFIC_MODEL_WEIGHTS) {
      choice -= weight;
      if (choice <= 0) return id;
    }
    return TRAFFIC_MODEL_WEIGHTS.at(-1)[0];
  }

  function makeTrafficCar(position, heading) {
    const taxi = random.chance(1 / 12);
    const modelId = taxi ? 'thunder' : pickTrafficModel();
    const color = taxi ? 0xd2b24c : random.pick(NIGHTCITY_PAINTS);
    const { group, wheels } = buildNightCityCar(modelId, color, { detail: 'light', taxi });
    const { tuning } = NIGHTCITY_MODELS.find((model) => model.id === modelId);
    group.position.set(position.x, groundHeightAt(position.x, position.z), position.z);
    group.rotation.y = heading;
    scene.add(group);
    const car = {
      group,
      wheels: wheels.map(({ mesh }) => mesh),
      modelId,
      color,
      taxi,
      tuning,
      x: position.x,
      z: position.z,
      heading,
      speed: 0,
      laneOffset: TRAFFIC.laneOffset,
      laneTarget: TRAFFIC.laneOffset,
      laneBias: random.range(-0.12, 0.12),
      laneCooldown: random.range(2, 5),
      hornTimer: 0,
      braking: false,
      targetSpeed: random.range(TRAFFIC.carSpeedMin, TRAFFIC.carSpeedMax),
      node: roadNetwork.nearestNode(position.x, position.z),
      next: null,
      stuck: 0,
      spin: 0,
    };
    car.laneOffset = car.laneTarget = TRAFFIC.laneOffset + car.laneBias;
    car.next = pickDirection(car.node);
    trafficCars.push(car);
    return car;
  }

  function respawnCar(car, playerX, playerZ) {
    const point = randomRoadSpawn(playerX, playerZ, 45, true);
    if (!point) return false;
    car.laneOffset = car.laneTarget = TRAFFIC.laneOffset + car.laneBias;
    car.laneCooldown = random.range(2, 5);
    car.hornTimer = 0;
    car.braking = false;
    routeCarAt(car, point);
    car.speed = TRAFFIC.carSpeedMin;
    car.stuck = 0;
    car.targetSpeed = random.range(TRAFFIC.carSpeedMin, TRAFFIC.carSpeedMax);
    car.group.position.set(car.x, groundHeightAt(car.x, car.z), car.z);
    car.group.rotation.y = car.heading;
    return true;
  }

  function spawnAll(playerX, playerZ) {
    let attempts = 0;
    while (trafficCars.length < carTarget && attempts < carTarget * 16) {
      attempts += 1;
      const point = randomRoadSpawn(playerX, playerZ, 45, true);
      if (!point) continue;
      const car = makeTrafficCar(point, point.heading);
      routeCarAt(car, point);
      car.group.position.set(car.x, groundHeightAt(car.x, car.z), car.z);
      car.group.rotation.y = car.heading;
    }
    let pedAttempts = 0;
    let pedFailures = 0;
    while (peds.length < pedTarget && pedAttempts < pedTarget * 5 && pedFailures < 3) {
      const previousCount = peds.length;
      spawnPed(playerX, playerZ, true);
      pedAttempts += 1;
      pedFailures = peds.length === previousCount ? pedFailures + 1 : 0;
    }
  }

  function spawnPed(playerX, playerZ, preferCenter = false) {
    if (peds.length >= PED_LIMIT) return;
    let position = null;
    const point = spawnPointNear(pedSpawnPoints, playerX, playerZ, 30, TRAFFIC.spawnRadius, peds, 5, preferCenter);
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
      const sidewalkOffset = (edge.width ?? CITY.road) / 2 + 3;
      const x = nearest.x + (dx / length) * along + side * (dz / length) * sidewalkOffset;
      const z = nearest.z + (dz / length) * along - side * (dx / length) * sidewalkOffset;
      const resolved = resolveAmbientPosition(x, z, 0.28);
      const inWalkableBounds = isWalkablePosition(resolved);
      if (!resolved.hit && inWalkableBounds) position = { x, z };
    }
    if (!position) return;
    const { x, z } = position;
    const built = pedMesh(random);
    built.group.position.set(x, groundHeightAt(x, z) + 0.28, z);
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
      crossing: false,
      crossingCooldown: random.range(0, 7),
      routeTarget: null,
      reaction: 'walking',
      down: false,
    });
  }

  function laneIsClear(car, offset, vehicles, player) {
    const shift = offset - car.laneOffset;
    const sin = Math.sin(car.heading);
    const cos = Math.cos(car.heading);
    const x = car.x + cos * shift;
    const z = car.z - sin * shift;
    const blocks = (other) => {
      const dx = other.x - x;
      const dz = other.z - z;
      const forward = dx * sin + dz * cos;
      return forward > -7 && forward < 14 && Math.abs(dx * cos - dz * sin) < 2.5;
    };
    if (trafficCars.some((other) => other !== car && blocks(other))) return false;
    if ((vehicles?.cars ?? []).some((other) => blocks(other.state))) return false;
    return !player || !blocks(playerPosition(player));
  }

  function stepCar(car, dt, player, vehicles) {
    car.hornTimer = Math.max(0, car.hornTimer - dt);
    car.laneCooldown = Math.max(0, car.laneCooldown - dt);
    const sin = Math.sin(car.heading);
    const cos = Math.cos(car.heading);
    let desiredSpeed = car.hornTimer > 0 ? car.targetSpeed * 0.2 : car.targetSpeed;
    let nearestAhead = Infinity;
    let blocked = false;
    const laneLimit = (car.next?.edge?.width ?? CITY.road) / 2 - VEHICLE.radius - 0.3;
    const consider = (other, width = 2.6) => {
      const dx = other.x - car.x;
      const dz = other.z - car.z;
      const ahead = dx * sin + dz * cos;
      const lateral = Math.abs(dx * cos - dz * sin);
      if (ahead <= 0 || ahead > 19 || lateral >= width) return;
      nearestAhead = Math.min(nearestAhead, ahead);
      const otherForwardSpeed = Math.max(0, (other.speed || 0)
        * (Math.sin(other.heading || 0) * sin + Math.cos(other.heading || 0) * cos));
      let safeSpeed = Math.max(0, (ahead - CAR_GAP) * 1.35);
      if (ahead < 8) safeSpeed = otherForwardSpeed < 2 ? 0 : Math.min(safeSpeed, otherForwardSpeed);
      desiredSpeed = Math.min(desiredSpeed, safeSpeed);
      if (ahead < 15 && otherForwardSpeed < car.targetSpeed * 0.6) blocked = true;
    };
    for (const other of trafficCars) if (other !== car) consider(other);
    for (const other of vehicles?.cars ?? []) consider(other.state);
    if (player) consider(playerPosition(player), player.state.inCar ? 2.7 : 3.1);

    if (blocked && car.laneCooldown === 0) {
      const base = Math.min(TRAFFIC.laneOffset + car.laneBias, laneLimit);
      const firstSide = random.chance(0.5) ? -1 : 1;
      for (const side of [firstSide, -firstSide]) {
        const alternate = base + side * LANE_SHIFT;
        if (Math.abs(alternate) > laneLimit) continue;
        if (Math.abs(alternate - car.laneTarget) < 0.5 || !laneIsClear(car, alternate, vehicles, player)) continue;
        car.laneTarget = alternate;
        break;
      }
      car.laneCooldown = random.range(3, 6);
    } else if (!blocked && car.laneCooldown === 0) {
      const base = Math.min(TRAFFIC.laneOffset + car.laneBias, laneLimit);
      if (laneIsClear(car, base, vehicles, player)) car.laneTarget = base;
      car.laneCooldown = 2;
    }
    const laneStep = (car.laneTarget - car.laneOffset) * Math.min(1, dt * 1.7);
    if (Math.abs(laneStep) > 0.0001) {
      const shiftedX = car.x + cos * laneStep;
      const shiftedZ = car.z - sin * laneStep;
      const sideBlocked = (other, radius = VEHICLE.radius * 2 + 0.15) => (
        Math.hypot(other.x - shiftedX, other.z - shiftedZ) < radius
      );
      const obstacle = resolveAmbientPosition(shiftedX, shiftedZ, VEHICLE.radius);
      const occupied = trafficCars.some((other) => other !== car && sideBlocked(other))
        || (vehicles?.cars ?? []).some((other) => sideBlocked(other.state))
        || (player && sideBlocked(playerPosition(player), player.state.inCar ? VEHICLE.radius * 2 + 0.15 : 1.8));
      if (!obstacle.hit && !occupied) {
        car.x = shiftedX;
        car.z = shiftedZ;
        car.laneOffset += laneStep;
      }
    }
    car.braking = desiredSpeed < car.speed - 0.1 || desiredSpeed < 0.1;
    if (car.speed > desiredSpeed) car.speed = Math.max(desiredSpeed, car.speed - dt * CAR_BRAKE);
    else car.speed = Math.min(desiredSpeed, car.speed + dt * 3.5);
    // A final gap cap prevents an overspeed car from penetrating a stopped queue in one step.
    if (nearestAhead < CAR_GAP + car.speed * dt) car.speed = Math.min(car.speed, Math.max(0, (nearestAhead - CAR_GAP) / dt));

    let turnTarget = car.heading;
    if (car.next) {
      const waypoint = lanePoint(car.node, car.next.other, car.laneOffset);
      const dx = waypoint.x - car.x;
      const dz = waypoint.z - car.z;
      if (Math.hypot(dx, dz) < 4) {
        const previous = car.node;
        car.node = car.next.other;
        car.next = pickDirection(car.node, previous);
      } else turnTarget = Math.atan2(dx, dz);
    } else car.next = pickDirection(car.node);
    let delta = Math.atan2(Math.sin(turnTarget - car.heading), Math.cos(turnTarget - car.heading));
    car.heading += delta * Math.min(1, dt * 2.5);
    const nextX = car.x + Math.sin(car.heading) * car.speed * dt;
    const nextZ = car.z + Math.cos(car.heading) * car.speed * dt;
    const resolved = resolveAmbientPosition(nextX, nextZ, VEHICLE.radius);
    car.x = resolved.x;
    car.z = resolved.z;
    if (resolved.hit) car.speed = Math.min(car.speed, TRAFFIC.carSpeedMin * 0.65);
    car.group.position.set(car.x, groundHeightAt(car.x, car.z), car.z);
    car.group.rotation.y = car.heading;
    car.spin += car.speed * dt * 2.2;
    for (const wheel of car.wheels) wheel.rotation.x = car.spin;
    if (player) {
      const target = playerPosition(player);
      if (Math.hypot(car.x - target.x, car.z - target.z) > TRAFFIC.despawnRadius) respawnCar(car, target.x, target.z);
    }
  }

  function setPedRoute(ped) {
    const nearest = roadNetwork.nearestEdge(ped.x, ped.z);
    if (!nearest) return;
    const edge = nearest.edge;
    const ux = edge.dx / edge.length;
    const uz = edge.dz / edge.length;
    const sidewalkOffset = (edge.width ?? CITY.road) / 2 + 3;
    const crossingOffset = Math.min(CROSSING_OFFSET, edge.length / 3);
    const side = (ped.x - nearest.x) * uz - (ped.z - nearest.z) * ux >= 0 ? 1 : -1;
    const along = (ped.x - edge.a.x) * ux + (ped.z - edge.a.z) * uz;
    const endAlong = along < edge.length / 2 ? crossingOffset : edge.length - crossingOffset;
    // Cross just beyond the intersection, from one curb to the opposite curb.
    if (ped.crossingCooldown <= 0 && random.chance(0.45)) {
      ped.crossingStart = { x: edge.a.x + ux * endAlong + uz * side * sidewalkOffset,
        z: edge.a.z + uz * endAlong - ux * side * sidewalkOffset };
      ped.crossingEnd = { x: edge.a.x + ux * endAlong - uz * side * sidewalkOffset,
        z: edge.a.z + uz * endAlong + ux * side * sidewalkOffset };
      ped.routeTarget = ped.crossingStart;
      ped.routeStage = 'approach';
    } else {
      const destination = along < edge.length / 2 ? edge.length - crossingOffset : crossingOffset;
      ped.routeTarget = { x: edge.a.x + ux * destination + uz * side * sidewalkOffset,
        z: edge.a.z + uz * destination - ux * side * sidewalkOffset };
      ped.routeStage = 'sidewalk';
    }
  }

  function reactPeds(x, z, radius, seconds, reason) {
    let count = 0;
    for (const ped of peds) {
      if (ped.down || Math.hypot(ped.x - x, ped.z - z) > radius) continue;
      ped.panicked = Math.max(ped.panicked, seconds);
      ped.panicTarget = { x, z };
      ped.targetHeading = Math.atan2(ped.x - x, ped.z - z);
      ped.speed = TRAFFIC.pedSpeedMax * (reason === 'horn' ? 1.6 : 2.1);
      ped.reaction = reason;
      ped.routeTarget = null;
      ped.crossing = false;
      count += 1;
    }
    return count;
  }

  function onGunshot(x, z) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return 0;
    return reactPeds(x, z, 65, 4.5, 'gunshot');
  }

  function horn(x, z) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return { pedestrians: 0, cars: 0 };
    const pedestrians = reactPeds(x, z, 26, 1.4, 'horn');
    let cars = 0;
    for (const car of trafficCars) {
      if (Math.hypot(car.x - x, car.z - z) > 32) continue;
      car.hornTimer = Math.max(car.hornTimer, 1.3);
      cars += 1;
    }
    return { pedestrians, cars };
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
    ped.crossingCooldown = Math.max(0, ped.crossingCooldown - dt);
    if (ped.panicked <= 0) {
      ped.reaction = 'walking';
      if (!ped.routeTarget) setPedRoute(ped);
      const target = ped.routeTarget;
      if (target && Math.hypot(target.x - ped.x, target.z - ped.z) < 0.9) {
        if (ped.routeStage === 'approach') {
          ped.routeTarget = ped.crossingEnd;
          ped.routeStage = 'crossing';
          ped.crossing = true;
        } else {
          if (ped.crossing) ped.crossingCooldown = random.range(8, 18);
          ped.crossing = false;
          ped.routeTarget = null;
        }
      }
      if (ped.routeTarget) ped.targetHeading = Math.atan2(ped.routeTarget.x - ped.x, ped.routeTarget.z - ped.z);
      ped.speed = TRAFFIC.pedSpeedMin + (TRAFFIC.pedSpeedMax - TRAFFIC.pedSpeedMin) * (0.5 + 0.5 * Math.sin(ped.walk * 0.1));
    }
    let threat = player.state.inCar && Math.abs(player.state.inCar.state.speed) > 2 ? player.state.inCar.state : null;
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
    if (threat && threatDistance < 14 && Math.abs(threat.speed) > 2
      && (ped.x - threat.x) * Math.sin(threat.heading) * Math.sign(threat.speed)
        + (ped.z - threat.z) * Math.cos(threat.heading) * Math.sign(threat.speed) > -2) {
      ped.panicked = Math.max(ped.panicked, 0.6);
      ped.panicTarget = { x: threat.x, z: threat.z };
      ped.reaction = 'dodge';
      ped.routeTarget = null;
      ped.crossing = false;
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
    const resolved = resolveAmbientPosition(nx, nz, 0.28);
    const inWalkableBounds = isWalkablePosition(resolved);
    if (inWalkableBounds) {
      ped.x = resolved.x;
      ped.z = resolved.z;
    }
    if (resolved.hit || !inWalkableBounds) {
      ped.heading += random.chance(0.5) ? Math.PI * 0.5 : -Math.PI * 0.5;
      ped.routeTarget = null;
    }
    ped.walk += dt * ped.speed * 4.2;
    ped.group.position.set(ped.x, groundHeightAt(ped.x, ped.z) + 0.28, ped.z);
    ped.group.rotation.y = ped.heading;
    const swing = pedStride(ped.walk);
    ped.legs[0].rotation.x = swing;
    ped.legs[1].rotation.x = -swing;
    return true;
  }

  function update(dt, player, vehicles) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    sidewalkWalkers?.update(dt);
    for (let index = 0; index < trafficCars.length; index += 1) {
      const car = trafficCars[index];
      const previousX = car.x;
      const previousZ = car.z;
      stepCar(car, dt, player, vehicles);
      vehicles?.resolveCarCollisions?.(car);
      car.stuck += Math.hypot(car.x - previousX, car.z - previousZ) < dt * 0.5 ? dt : -dt;
      car.stuck = Math.max(0, car.stuck);
      if (car.stuck > (car.braking ? 25 : 8)) {
        const target = playerPosition(player);
        respawnCar(car, target.x, target.z);
      }
    }
    for (let index = peds.length - 1; index >= 0; index -= 1) {
      if (!stepPed(peds[index], dt, player, vehicles)) peds.splice(index, 1);
    }
    const target = playerPosition(player);
    if (peds.length < pedTarget && random() < 0.2) spawnPed(target.x, target.z, true);
    if (trafficCars.length < carTarget) {
      const point = randomRoadSpawn(target.x, target.z, 45, true);
      if (point) {
        const car = makeTrafficCar(point, point.heading);
        routeCarAt(car, point);
        car.group.position.set(car.x, groundHeightAt(car.x, car.z), car.z);
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

  function nearest(x, z, maxDistance = 4.6) {
    let closest = null;
    let closestDistance = maxDistance;
    for (const car of trafficCars) {
      if (!car?.group) continue;
      const distance = Math.hypot(car.x - x, car.z - z);
      if (distance <= closestDistance) {
        closest = car;
        closestDistance = distance;
      }
    }
    return closest;
  }

  function removeCar(car) {
    const index = trafficCars.indexOf(car);
    if (index < 0) return false;
    trafficCars.splice(index, 1);
    scene.remove(car.group);
    return true;
  }

  function spawnFleeingPed(x, z, heading, panicTarget = { x: x + Math.cos(heading), z: z - Math.sin(heading) }) {
    if (peds.length >= PED_LIMIT) return null;
    const built = pedMesh(random);
    const fleeHeading = Math.atan2(x - panicTarget.x, z - panicTarget.z);
    built.group.position.set(x, 0.28, z);
    built.group.rotation.y = fleeHeading;
    scene.add(built.group);
    const ped = {
      group: built.group,
      legs: built.legs,
      x,
      z,
      heading: fleeHeading,
      speed: TRAFFIC.pedSpeedMax * 2.1,
      walk: random.range(0, 10),
      wander: 0,
      panicked: 3,
      panicTarget,
      targetHeading: fleeHeading,
      crossing: false,
      crossingCooldown: random.range(0, 7),
      routeTarget: null,
      reaction: 'dodge',
      down: false,
    };
    peds.push(ped);
    return ped;
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
    horn,
    onGunshot,
    update,
    addSidewalkWalkers(parent, routes, walkerRandom) {
      sidewalkWalkers = createSidewalkWalkers(parent, routes, walkerRandom);
      return sidewalkWalkers.count;
    },
    knockPed,
    nearestPed,
    nearest,
    removeCar,
    spawnFleeingPed,
    reset,
    stepCar,
  };
}
