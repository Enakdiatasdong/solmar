// Plain Node regression: real mission updates and THREE objects, no renderer or DOM stubs.
import assert from 'node:assert/strict';
import { createMissions } from '../game/src/missions.js';
import { GARAGE_LOCATION, HOTEL_LOCATION, MISSIONS, STEP, TRAFFIC, VEHICLE } from '../game/src/config.js';
import { buildRoadGraph } from '../game/src/roads.js';

const DROPOFF = { x: -360, z: 216 };
const BANK = { x: 72, z: -72 };
const BEFORE_BANK = ['first-fare', 'hot-wheels', 'beach-run', 'heat'];
const roads = buildRoadGraph();
const noop = () => {};

function setup(completed = []) {
  const car = { state: { x: 0, z: 0, heading: 0, speed: 0, wrecked: false } };
  const player = { state: { x: 0, z: 0, inCar: car, alive: true } };
  const vehicles = {
    cars: [car],
    addCar(spec, point, heading, options) {
      const added = { ...options, group: {}, state: { ...point, heading, speed: 0, wrecked: false } };
      this.cars.push(added);
      return added;
    },
  };
  const police = {
    state: { wanted: 0, forcedDecay: false },
    setWanted(value) { this.state.wanted = value; },
    addWanted(value) { this.state.wanted += value; },
    clear() { this.state.wanted = 0; },
  };
  const missions = createMissions({
    scene: { add: noop, remove: noop }, city: {}, player, vehicles, police,
    hud: { setObjective: noop, setDialogue: noop, toast: noop },
    audio: { startMusic: noop, chime: noop, siren: noop },
    combat: { clearEnemies: noop, spawnEnemy: noop },
  });
  missions.setProgress(completed);
  return {
    missions, player, police,
    stop(point, speed = 0) { Object.assign(player.state.inCar.state, point, { speed }); },
  };
}

function firstWheels(pickupOffset = 0) {
  const fixture = setup();
  const { missions } = fixture;
  assert.equal(missions.start('first-fare'), true);
  assert.equal(missions.state.stage, 'client-pickup');
  fixture.stop({ x: HOTEL_LOCATION.x + pickupOffset, z: HOTEL_LOCATION.z });
  missions.update(STEP);
  assert.equal(missions.state.stage, 'client-dropoff', 'real pickup must advance to dropoff');
  assert.deepEqual([missions.state.marker.x, missions.state.marker.z], [DROPOFF.x, DROPOFF.z]);
  assert.deepEqual(missions.takeEvents(), []);
  return fixture;
}

function completed(missions, id) {
  assert.equal(missions.active, null);
  assert.equal(missions.state.marker, null);
  assert(missions.completedIds.includes(id));
  assert(missions.state.completed.has(id));
  const events = missions.takeEvents();
  assert.deepEqual(events.map((event) => [event.type, event.mission.id]), [['complete', id]]);
  assert.equal(events[0].cash, MISSIONS.rewards[id]);
}

function pending(missions, id, stage) {
  assert.equal(missions.active?.id, id);
  assert.equal(missions.state.stage, stage);
  assert(!missions.completedIds.includes(id));
  assert.deepEqual(missions.takeEvents(), []);
}

let passed = 0;
let failed = 0;
function test(name, run) {
  try {
    run();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${name}: ${error.message}`);
  }
}

for (const distance of [12, 14, 14.001, 15]) {
  test(`First Wheels dropoff at exactly ${distance} m ${distance <= 14 ? 'completes' : 'stays active'}`, () => {
    const fixture = firstWheels();
    fixture.stop({ x: DROPOFF.x, z: DROPOFF.z + distance });
    fixture.missions.update(STEP);
    if (distance <= 14) completed(fixture.missions, 'first-fare');
    else pending(fixture.missions, 'first-fare', 'client-dropoff');
  });
}

test('First Wheels plausible west-road lane stop (-355.6, 228) completes', () => {
  const fixture = firstWheels();
  const point = { x: DROPOFF.x + TRAFFIC.laneOffset, z: DROPOFF.z + 12 };
  const road = roads.nearestEdge(point.x, point.z);
  assert.equal(road.edge.a.x, DROPOFF.x, 'stop must be on the real west-edge road');
  assert.equal(road.edge.b.x, DROPOFF.x);
  assert(road.distance + VEHICLE.radius < road.edge.width / 2, 'car must fit inside the road');
  const distance = Math.hypot(point.x - DROPOFF.x, point.z - DROPOFF.z);
  assert(distance > 12 && distance < 14, 'lane stop must exercise the added tolerance');
  fixture.stop(point);
  fixture.missions.update(STEP);
  completed(fixture.missions, 'first-fare');
});

for (const speed of [5, -5]) {
  test(`First Wheels dropoff at speed ${speed} m/s stays active`, () => {
    const fixture = firstWheels();
    fixture.stop(DROPOFF, speed);
    fixture.missions.update(STEP);
    pending(fixture.missions, 'first-fare', 'client-dropoff');
  });
}

test('First Wheels pickup at exactly 11 m advances through the real pickup step', () => {
  firstWheels(11);
});

for (const distance of [10, 10.001]) {
  test(`Courier hotel stop at ${distance} m ${distance === 10 ? 'completes' : 'stays active'}`, () => {
    const fixture = setup(['first-fare']);
    assert.equal(fixture.missions.start('hot-wheels'), true);
    fixture.stop({ x: HOTEL_LOCATION.x + distance, z: HOTEL_LOCATION.z });
    fixture.missions.update(STEP);
    if (distance === 10) completed(fixture.missions, 'hot-wheels');
    else pending(fixture.missions, 'hot-wheels', 'delivery');
  });
}

for (const distance of [9, 11, 11.001]) {
  test(`The Pickup garage apron stop at ${distance} m ${distance <= 11 ? 'completes' : 'stays active'}`, () => {
    const fixture = setup(['first-fare', 'hot-wheels']);
    const { missions, player } = fixture;
    assert.equal(missions.start('beach-run'), true);
    player.state.inCar = missions.state.car;
    missions.update(STEP);
    assert.equal(missions.state.stage, 'deliver-car');
    fixture.stop({ x: GARAGE_LOCATION.x, z: GARAGE_LOCATION.z + distance });
    missions.update(STEP);
    if (distance <= 11) completed(missions, 'beach-run');
    else pending(missions, 'beach-run', 'deliver-car');
  });
}

for (const distance of [10, 10.001]) {
  test(`Bank stop at ${distance} m ${distance === 10 ? 'starts getaway' : 'stays at bank stage'}`, () => {
    const fixture = setup(BEFORE_BANK);
    assert.equal(fixture.missions.start('harbor-job'), true);
    fixture.stop({ x: BANK.x + distance, z: BANK.z });
    fixture.missions.update(STEP);
    pending(fixture.missions, 'harbor-job', distance === 10 ? 'bank-getaway' : 'bank');
    assert.equal(fixture.police.state.wanted, distance === 10 ? 3 : 0);
  });
}

for (const distance of [9, 12, 12.001]) {
  test(`Bank getaway garage stop at ${distance} m ${distance <= 12 ? 'advances, then completes after evasion' : 'stays active'}`, () => {
    const fixture = setup(BEFORE_BANK);
    const { missions, police } = fixture;
    assert.equal(missions.start('harbor-job'), true);
    fixture.stop(BANK);
    missions.update(STEP);
    assert.equal(missions.state.stage, 'bank-getaway');
    fixture.stop({ x: GARAGE_LOCATION.x, z: GARAGE_LOCATION.z + distance });
    missions.update(STEP);
    pending(missions, 'harbor-job', distance <= 12 ? 'bank-evade' : 'bank-getaway');
    if (distance <= 12) {
      police.clear();
      missions.update(STEP);
      completed(missions, 'harbor-job');
    }
  });
}

console.log(`${failed ? 'FAIL' : 'PASS'} SA-01 BF1: ${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
