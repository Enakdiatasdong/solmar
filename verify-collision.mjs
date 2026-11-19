// Run with node verify-collision.mjs. The canvas stub only supports texture drawing;
// the city, meshes, camera and actor physics use the real game modules.
import assert from 'node:assert/strict';
import * as THREE from './game/vendor/three.module.min.js';
import { ASSETS } from './game/src/assets.js';
import { cameraPositionAtDistance, cameraPositionClear, safeCameraDistance } from './game/src/camera.js';
import { CITY, PLAYER, SPAWN, STARTER_CAR, STEP, TRAFFIC } from './game/src/config.js';
import { createPlayer } from './game/src/player.js';
import { createRandom } from './game/src/random.js';
import { RESTAURANTS } from './game/src/restaurants.js';
import { roadConflict } from './game/src/roads.js';
import { SAFEHOUSES } from './game/src/safehouses.js';
import { createTraffic } from './game/src/traffic.js';
import { createVehicles, exitSpot } from './game/src/vehicles.js';
import { createCity, groundHeightAt, resolveCollisions } from './game/src/world.js';

const gradient = { addColorStop() {} };
globalThis.document = {
  createElement: () => ({
    width: 0, height: 0,
    getContext: () => new Proxy({}, {
      get: (_, key) => key === 'createLinearGradient' || key === 'createRadialGradient'
        ? () => gradient : () => {},
    }),
  }),
};

const seed = Number(process.argv[2] ?? 1);
const places = [...ASSETS, ...RESTAURANTS, ...SAFEHOUSES];
const city = createCity(createRandom(seed), places);
const canalCrossings = [-504, -432];
const causewayZ = 84;
const accelerate = { accelerate: true };
const EPS = 1e-7;
const metres = (n) => n.toFixed(3);

function check(name, run) {
  try {
    console.log('PASS ' + name + ' — ' + run());
  } catch (error) {
    console.error('FAIL ' + name + '\n' + error.stack);
    process.exitCode = 1;
  }
}

function starter(testCity = city) {
  const vehicles = createVehicles(testCity, new THREE.Scene());
  const car = vehicles.spawnStarter();
  // Measure the starter's actual chassis, independently of the collision solver.
  const body = car.group.children[0];
  assert(body.geometry?.isBufferGeometry);
  body.geometry.computeBoundingBox();
  const half = body.geometry.boundingBox.getSize(new THREE.Vector3())
    .multiply(body.scale).multiplyScalar(0.5);
  return { vehicles, car, half };
}

// Separating-axis test over both local chassis axes and both world axes.
// Return the smallest positive penetration, or zero for separated/touching boxes.
function penetration({ car, half }, box) {
  const { x, z, heading } = car.state;
  const side = [Math.cos(heading), -Math.sin(heading)];
  const front = [Math.sin(heading), Math.cos(heading)];
  const dx = (box.minX + box.maxX) / 2 - x;
  const dz = (box.minZ + box.maxZ) / 2 - z;
  const boxX = (box.maxX - box.minX) / 2;
  const boxZ = (box.maxZ - box.minZ) / 2;
  const axes = [[1, 0], [0, 1], side, front];
  return Math.max(0, Math.min(...axes.map(([ax, az]) => (
    half.x * Math.abs(ax * side[0] + az * side[1])
    + half.z * Math.abs(ax * front[0] + az * front[1])
    + boxX * Math.abs(ax) + boxZ * Math.abs(az)
    - Math.abs(dx * ax + dz * az)
  ))));
}

function carApproach(box, controls, { x = 0, z = 0, heading = 0, speed = 0, dt = STEP, steps = 180 } = {}) {
  const run = starter({ colliders: [box] });
  const { vehicles, car } = run;
  vehicles.setCarPosition(car, x, z, heading);
  car.state.speed = speed;
  let overlap = 0;
  for (let step = 0; step < steps; step += 1) {
    vehicles.stepCar(car, dt, controls);
    overlap = Math.max(overlap, penetration(run, box));
  }
  assert(overlap <= EPS, 'max chassis OBB overlap ' + overlap);
  return { ...run, overlap };
}

check('2. starter into building, forward and reverse', () => {
  const wall = { minX: -10, maxX: 10, minZ: 30, maxZ: 46, height: 9 };
  const forward = carApproach(wall, accelerate);
  const reverse = carApproach(wall, { brake: true }, { z: 17, heading: Math.PI });
  assert(forward.car.state.z > 27 && forward.car.state.z < 28);
  assert(forward.car.state.health < forward.car.state.maxHealth, 'hard crash must cause damage');
  assert(reverse.car.state.z > 27 && reverse.car.state.z < 28);
  return 'max OBB overlap ' + metres(Math.max(forward.overlap, reverse.overlap)) + ' m; stopped z='
    + metres(forward.car.state.z) + '/' + metres(reverse.car.state.z)
    + '; hard-hit health=' + metres(forward.car.state.health);
});

check('2. turning corner beside wall', () => {
  const wall = { minX: 1.4, maxX: 6, minZ: -10, maxZ: 30, height: 8 };
  const turn = carApproach(wall, { accelerate: true, left: true }, { speed: 14, steps: 40 });
  assert(turn.car.state.x < wall.minX);
  assert(turn.car.state.z > 5, 'turn into the wall should preserve tangential motion');
  return 'max OBB overlap ' + metres(turn.overlap) + ' m; slid to x='
    + metres(turn.car.state.x) + ', z=' + metres(turn.car.state.z);
});

check('2. thin prop and other static footprints during a lagged frame', () => {
  const props = [
    ['lamp', 0.4, 0.4, 6.65],
    ['palm', 0.5, 0.5, 11],
    ['billboard support', 0.6, 0.6, 4.2],
    ['kiosk', 3.0, 2.4, 3.5],
    ['container', 8.7, 3.2, 2.65],
  ];
  const results = props.map(([name, width, depth, height]) => {
    const box = { minX: -width / 2, maxX: width / 2, minZ: 3.5, maxZ: 3.5 + depth, height };
    const run = carApproach(box, accelerate, { speed: 26, dt: 0.25, steps: 1 });
    const { z, speed } = run.car.state;
    assert(z > 0.1 && z + run.half.z <= box.minZ + EPS && Math.abs(speed) <= EPS,
      name + ' missed its stop: z=' + z + ', speed=' + speed);
    return { name, z, overlap: run.overlap };
  });
  return 'dt=250 ms, max OBB overlap ' + metres(Math.max(...results.map((result) => result.overlap)))
    + ' m; ' + results.map(({ name, z }) => name + ' z=' + metres(z)).join(', ');
});

check('2. straight freeway for ten seconds', () => {
  const run = starter();
  const { vehicles, car } = run;
  // The freeway has a physical median at maxX. Offset to a northbound lane.
  const laneX = CITY.freeway.maxX + 4.2;
  vehicles.setCarPosition(car, laneX, -200, 0);
  let overlap = 0;
  for (let frame = 0; frame < 10 / STEP; frame += 1) {
    vehicles.stepCar(car, STEP, accelerate);
    for (const box of city.colliders) overlap = Math.max(overlap, penetration(run, box));
    assert(Math.abs(car.state.x - laneX) <= EPS);
  }
  assert(overlap <= EPS);
  assert.equal(car.state.speed, car.tuning.maxSpeed);
  assert.equal(car.state.health, car.state.maxHealth);
  assert(car.state.z > 90);
  return 'x=' + metres(car.state.x) + ', z=' + metres(car.state.z) + ', speed=' + metres(car.state.speed) + ' m/s, max OBB overlap '
    + metres(overlap) + ' m, health=' + car.state.health;
});

const walker = (x, z, y = 0) => {
  const player = createPlayer(city);
  Object.assign(player.state, { x, y, z });
  return player;
};

check('11. both canal crossings on foot and in a car', () => {
  return canalCrossings.map((x) => {
    const player = walker(x, 15);
    const run = starter();
    run.vehicles.setCarPosition(run.car, x, 15, Math.PI);
    let footPeak = 0;
    let carPeak = 0;
    let overlap = 0;
    for (let frame = 0; frame < 500 && (player.state.z > -15 || run.car.state.z > -15); frame += 1) {
      if (player.state.z > -15) player.step(STEP, { x: 0, z: -1 });
      if (run.car.state.z > -15) run.vehicles.stepCar(run.car, STEP, accelerate);
      footPeak = Math.max(footPeak, player.state.y);
      carPeak = Math.max(carPeak, run.car.group.position.y);
      for (const box of city.colliders) overlap = Math.max(overlap, penetration(run, box));
    }
    assert(player.state.z <= -15 && run.car.state.z <= -15,
      'bridge blocked at x=' + x + ', foot z=' + player.state.z + ', car z=' + run.car.state.z);
    assert(Math.abs(footPeak - 0.29) <= EPS && Math.abs(carPeak - 0.29) <= EPS);
    assert.equal(player.state.y, 0);
    assert.equal(run.car.group.position.y, 0);
    assert(overlap <= EPS, 'car overlapped a real city collider by ' + overlap + ' m');
    return 'x=' + x + ': foot z=' + metres(player.state.z) + ', car z=' + metres(run.car.state.z)
      + ', deck y=' + metres(footPeak) + '/' + metres(carPeak) + ', overlap=' + metres(overlap);
  }).join('; ');
});

check('11. canal coping blocks walking and jumping between crossings', () => {
  const player = walker(-468, 15);
  for (let frame = 0; frame < 180; frame += 1) player.step(STEP, { x: 0, z: -1 });
  const bank = player.state.z;
  let minZ = bank;
  let peak = 0;
  for (let frame = 0; frame < 75; frame += 1) {
    player.step(STEP, { x: 0, z: -1, jump: frame === 0 });
    minZ = Math.min(minZ, player.state.z);
    peak = Math.max(peak, player.state.y);
  }
  assert(Math.abs(bank - (8.22 + PLAYER.radius)) <= 0.16, 'bank stopped at z=' + bank);
  assert(Math.abs(minZ - bank) <= EPS && peak > 0.5);
  return 'walk/jump stayed at z=' + metres(minZ) + ' with jump y=' + metres(peak);
});

check('11. jump lands on the canal deck and stepping off its end drops to ground', () => {
  const x = canalCrossings[0];
  const deck = city.groundHeightAt(x, 0);
  const player = walker(x, 0, deck);
  let peak = deck;
  for (let frame = 0; frame < 60; frame += 1) {
    player.step(STEP, { x: 0, z: 0, jump: frame === 0 });
    peak = Math.max(peak, player.state.y);
    assert(player.state.y >= deck - EPS);
  }
  assert(player.state.grounded && Math.abs(player.state.y - deck) <= EPS && peak - deck > 0.5);
  for (let frame = 0; frame < 150 && player.state.z <= 10; frame += 1) {
    player.step(STEP, { x: 0, z: 1 });
  }
  assert(player.state.z > 10);
  const falling = !player.state.grounded && player.state.y > 0 && player.state.y <= deck;
  for (let frame = 0; frame < 60; frame += 1) player.step(STEP, { x: 0, z: 0 });
  assert(falling && player.state.grounded && player.state.y === 0);
  return 'deck y=' + metres(deck) + ', jump y=' + metres(peak) + ', ground y=' + metres(player.state.y);
});

check('11. ambient traffic can use both canal crossings and pass the east causeway ramp', () => {
  const scene = new THREE.Scene();
  const traffic = createTraffic(city, scene, createRandom(seed ^ 0x51a7));
  const routes = [
    ...canalCrossings.map((x) => ({ x, startZ: 15, endZ: -15 })),
    { x: CITY.nodeMin, startZ: 102, endZ: 66 },
    { x: CITY.nodeMin, startZ: 66, endZ: 102 },
  ];
  return routes.map(({ x, startZ, endZ }) => {
    // Supply the bridge route to the real ambient step and its collider buckets.
    const direction = Math.sign(endZ - startZ);
    const node = { x, z: startZ };
    const to = { x, z: endZ + direction * 7 };
    const lane = TRAFFIC.laneOffset;
    const car = {
      x: x + direction * lane, z: startZ, heading: direction < 0 ? Math.PI : 0,
      speed: 9, targetSpeed: 9,
      node, next: { other: to, edge: { width: CITY.road } },
      laneOffset: lane, laneTarget: lane, laneBias: 0, laneCooldown: 1,
      hornTimer: 0, spin: 0, group: new THREE.Group(), wheels: [],
    };
    let peak = 0;
    for (let frame = 0; frame < 280 && (endZ - car.z) * direction > 0; frame += 1) {
      traffic.stepCar(car, STEP);
      peak = Math.max(peak, car.group.position.y);
    }
    assert((endZ - car.z) * direction <= 0 && Math.abs(car.x - (x + direction * lane)) <= EPS,
      'traffic stalled or diverted: x=' + car.x + ', z=' + car.z);
    assert.equal(car.speed, 9);
    const expectedPeak = canalCrossings.includes(x) ? 0.29 : 0;
    assert(Math.abs(peak - expectedPeak) <= EPS);
    return 'x=' + metres(car.x) + ' lane to z=' + metres(car.z) + ' at ' + car.speed + ' m/s, y=' + metres(peak);
  }).join('; ');
});

check('11. causeway full crossing on foot and in car', () => {
  const player = walker(-354, causewayZ);
  const run = starter();
  run.vehicles.setCarPosition(run.car, -354, causewayZ, -Math.PI / 2);
  let footPeak = 0;
  let carPeak = 0;
  let heightError = 0;
  let overlap = 0;
  const finishX = -660;
  assert.equal(groundHeightAt(-504, causewayZ), 2.325);
  for (let frame = 0; frame < 2700 && (player.state.x > finishX || run.car.state.x > finishX); frame += 1) {
    if (player.state.x > finishX) player.step(STEP, { x: -1, z: 0, run: true });
    if (run.car.state.x > finishX) run.vehicles.stepCar(run.car, STEP, accelerate);
    footPeak = Math.max(footPeak, player.state.y);
    carPeak = Math.max(carPeak, run.car.group.position.y);
    for (const { x, y, z } of [player.state, run.car.group.position]) {
      if (x >= -648 && x <= -360) heightError = Math.max(heightError, Math.abs(y - city.groundHeightAt(x, z)));
    }
    for (const box of city.colliders) overlap = Math.max(overlap, penetration(run, box));
  }
  assert(player.state.x <= finishX && run.car.state.x <= finishX,
    'causeway blocked, foot x=' + player.state.x + ', car x=' + run.car.state.x);
  assert(heightError <= EPS, 'maximum difference from deck ' + heightError);
  assert(overlap <= EPS, 'car overlapped a real city collider by ' + overlap + ' m');
  assert(Math.abs(player.state.z - causewayZ) <= EPS && Math.abs(run.car.state.z - causewayZ) <= EPS);
  assert(footPeak > 2.30 && carPeak > 2.30);
  assert(player.state.y === 0 && run.car.group.position.y === 0 && player.state.grounded);
  return 'foot x=' + metres(player.state.x) + ', car x=' + metres(run.car.state.x)
    + '; peak y=' + metres(footPeak) + '/' + metres(carPeak)
    + '; west approach y=' + metres(player.state.y) + '/' + metres(run.car.group.position.y)
    + '; deck height error=' + metres(heightError) + ', overlap=' + metres(overlap) + ' m';
});

check('11. both causeway lanes stay clear above the piers', () => {
  return [-1, 1].map((side) => {
    const z = causewayZ + side * TRAFFIC.laneOffset;
    const run = starter();
    run.vehicles.setCarPosition(run.car, -354, z, -Math.PI / 2);
    for (let frame = 0; frame < 700 && run.car.state.x > -660; frame += 1) {
      run.vehicles.stepCar(run.car, STEP, accelerate);
    }
    assert(run.car.state.x <= -660 && Math.abs(run.car.state.z - z) <= EPS);
    assert.equal(run.car.state.health, run.car.state.maxHealth);
    return 'z=' + metres(z) + ' reached x=' + metres(run.car.state.x);
  }).join(' / ');
});

check('10. causeway rails block approaches from both sides at ground level', () => {
  return [70, 98].map((z) => {
    const direction = Math.sign(causewayZ - z);
    const player = walker(-504, z);
    const run = starter();
    run.vehicles.setCarPosition(run.car, -504, z, direction > 0 ? 0 : Math.PI);
    let peak = 0;
    let overlap = 0;
    for (let frame = 0; frame < 240; frame += 1) {
      player.step(STEP, { x: 0, z: direction });
      run.vehicles.stepCar(run.car, STEP, accelerate);
      peak = Math.max(peak, player.state.y, run.car.group.position.y);
      for (const box of city.colliders) overlap = Math.max(overlap, penetration(run, box));
    }
    assert.equal(peak, 0);
    assert((player.state.z - causewayZ) * direction < -9);
    assert((run.car.state.z - causewayZ) * direction < -9);
    assert(overlap <= EPS);
    return 'from z=' + z + ': foot z=' + metres(player.state.z) + ', car z=' + metres(run.car.state.z)
      + ', peak y=' + metres(peak);
  }).join('; ');
});

check('10. exiting a car by a causeway rail stays on the deck', () => {
  const { car, vehicles } = starter();
  vehicles.setCarPosition(car, -504, causewayZ + 7, Math.PI / 2);
  const player = walker(-504, causewayZ);
  player.enterCar(car);
  const exit = exitSpot(car);
  assert(exit.z > car.state.z);
  assert.equal(player.exitCar(exit, car.state.heading), car);
  assert(player.state.z < car.state.z && player.state.z > causewayZ);
  assert(player.state.grounded && player.state.y === groundHeightAt(player.state.x, player.state.z));
  assert(Math.abs(player.state.z - car.state.z) >= 1.5);
  return 'car z=' + metres(car.state.z) + ', landed inward at z=' + metres(player.state.z)
    + ', y=' + metres(player.state.y);
});

check('10. canal rails block entering and leaving the side of the deck', () => {
  const x = canalCrossings[0];
  const edgeX = x + (CITY.road + 2) / 2;
  const outside = walker(edgeX + 4, 0);
  const deck = city.groundHeightAt(x, 0);
  const inside = walker(x, 0, deck);
  for (let frame = 0; frame < 240; frame += 1) {
    outside.step(STEP, { x: -1, z: 0 });
    inside.step(STEP, { x: 1, z: 0 });
    assert(outside.state.x > edgeX && outside.state.y === 0);
    assert(inside.state.x < edgeX && Math.abs(inside.state.y - deck) <= EPS);
  }
  return 'outside x=' + metres(outside.state.x) + ' at y=0, inside x=' + metres(inside.state.x)
    + ' at y=' + metres(deck);
});

check('10. no walkable gap between canal railing and coping', () => {
  const offset = (CITY.road + 2) / 2 + 0.35;
  let closest = Infinity;
  for (const deckX of canalCrossings) {
    for (const side of [-1, 1]) {
      const player = walker(deckX + side * offset, 15);
      for (let frame = 0; frame < 210; frame += 1) {
        player.step(STEP, { x: 0, z: -1 });
        closest = Math.min(closest, player.state.z);
      }
    }
  }
  assert(closest > 8, 'player reached the water at z=' + closest);
  return 'closest point to water stopped at z=' + metres(closest);
});

check('10. bridge slabs reject camera points and shorten the camera ray', () => {
  const boxes = [...city.colliders, ...city.cameraBlockers];
  const options = { cameraRadius: 0, margin: 0, minHeight: -Infinity };
  const causeway = { x: -504, y: 1.8, z: causewayZ };
  const canal = { x: canalCrossings[0], y: 0.14, z: 0 };
  for (const point of [causeway, canal]) {
    assert(cameraPositionClear(point, city.colliders, options), 'expect a point isolated from normal colliders');
    assert(!cameraPositionClear(point, boxes, options), 'camera accepted a point inside the slab');
  }
  assert(cameraPositionClear({ x: -288, y: 4.5, z: 108 }, boxes), 'ordinary freeway camera point declined');
  const focus = { x: -504, z: 70 };
  const rayOptions = { ...options, focusY: 1.8, height: 0 };
  const distance = safeCameraDistance(focus, Math.PI, 0, 20, city.cameraBlockers, rayOptions);
  assert(distance > 0 && distance < 5.25, 'camera ray hit distance ' + distance);
  assert(cameraPositionClear(cameraPositionAtDistance(focus, Math.PI, 0, distance, rayOptions), boxes, options));
  return 'canal and causeway interior blocked, freeway point clear, ray ' + metres(distance) + ' / 20.000 m';
});

check('regression. clear player and starter spawn, road corridors and bridge lanes', () => {
  const run = starter();
  const player = createPlayer(city);
  assert.deepEqual([player.state.x, player.state.z], [SPAWN.x, SPAWN.z]);
  assert.deepEqual([run.car.state.x, run.car.state.z], [STARTER_CAR.x, STARTER_CAR.z]);
  assert(!resolveCollisions(city.colliders, player.state.x, player.state.z, PLAYER.radius).hit);
  assert.equal(Math.max(...city.colliders.map((box) => penetration(run, box))), 0);
  const roadObstacles = city.colliders.filter((box) => !box.roadInfrastructure && roadConflict(box));
  assert.equal(roadObstacles.length, 0, 'unexpected static colliders in road buffers');
  assert.deepEqual(city.colliders.filter((box) => box.placeId).map((box) => box.placeId).sort(),
    places.map((place) => place.id).sort());
  const bridgeParts = city.colliders.filter((box) => box.bridgePart);
  assert(bridgeParts.length > 0 && bridgeParts.every((box) => box.roadInfrastructure));
  assert(city.cameraBlockers.every((box) => !city.colliders.includes(box)));
  for (const x of canalCrossings) {
    for (let z = -15; z <= 15; z += 0.25) {
      assert(!resolveCollisions(bridgeParts, x, z, run.half.x).hit, 'canal centreline blocked');
    }
  }
  for (let x = -648; x <= -360; x += 0.25) {
    assert(!resolveCollisions(bridgeParts, x, causewayZ, run.half.x).hit, 'causeway centreline blocked');
  }
  return 'seed=' + seed + ', both spawns clear, zero non-infrastructure roadConflict hits, bridge centrelines clear';
});
