// Repeatable service work. Routes use the city's checked road spawn points and one reusable
// beacon; only main.js handles the cash award. Leaving a service vehicle ends its current run.
import * as THREE from '../vendor/three.module.min.js';
import { resolveCollisions } from './world.js';

const JOBS = [
  { id: 'taxi', title: 'Taxi fare', vehicle: 'Sun taxi', reward: 320, seconds: 150, color: '#ffd16a' },
  { id: 'ambulance', title: 'Ambulance run', vehicle: 'Coast ambulance', reward: 460, seconds: 125, color: '#ff7d78' },
  { id: 'delivery', title: 'Delivery route', vehicle: 'Pier van', reward: 380, seconds: 165, color: '#66d5c9' },
];
const ringGeometry = new THREE.TorusGeometry(3.1, 0.13, 5, 24);
const beamGeometry = new THREE.CylinderGeometry(0.8, 1.1, 15, 8, 1, true);
const gemGeometry = new THREE.OctahedronGeometry(0.6, 0);
const stopRadius = 6.5;
const stoppedSpeed = 1.25;
const stopSeconds = 0.7;

export function createVehicleJobs(ctx) {
  const { scene, city, player, vehicles, hud, onComplete } = ctx;
  const material = new THREE.MeshBasicMaterial({ color: 0xffd16a });
  const beamMaterial = new THREE.MeshBasicMaterial({ color: 0xffd16a, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide });
  const marker = new THREE.Group();
  marker.name = 'Vehicle job target';
  const ring = new THREE.Mesh(ringGeometry, material);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.22;
  const beam = new THREE.Mesh(beamGeometry, beamMaterial);
  beam.position.y = 7.5;
  const gem = new THREE.Mesh(gemGeometry, material);
  gem.position.y = 3;
  marker.add(ring, beam, gem);
  marker.visible = false;
  scene.add(marker);

  const state = {
    active: false, type: null, stage: 'idle', timeLeft: 0, reward: 0,
    target: null, car: null, route: [], checkpoint: 0, elapsed: 0, stopTime: 0,
    completed: 0, failed: 0, lastResult: null,
  };
  let blockedCar = null;
  let objective = '';

  function setObjective(text) {
    if (text === objective) return;
    objective = text;
    hud?.setObjective?.(text);
  }

  function definition(type = state.type) {
    return JOBS.find((job) => job.id === type) ?? null;
  }

  function identify(car) {
    if (!car?.spec) return null;
    return JOBS.find((job) => job.id === car.spec.job || job.vehicle === car.spec.name) ?? null;
  }

  function roadPoint(position, label, used = []) {
    const points = city?.spawnPoints?.roadVehicles ?? city?.spawnPoints?.vehicles ?? [];
    let best = null;
    let distance = Infinity;
    for (const point of points) {
      if (used.some((other) => Math.hypot(other.x - point.x, other.z - point.z) < 25)) continue;
      if (vehicles.cars.some((car) => Math.hypot(car.state.x - point.x, car.state.z - point.z) < 5)) continue;
      if (resolveCollisions(city.colliders ?? [], point.x, point.z, 2).hit) continue;
      const nextDistance = Math.hypot(point.x - position.x, point.z - position.z);
      if (nextDistance < distance) { best = point; distance = nextDistance; }
    }
    // A procedural city always has checked road spawns. Keep malformed custom worlds safe.
    if (!best) return null;
    return { x: best.x, z: best.z, label };
  }

  function makeRoute(job) {
    const landmarks = city.landmarks ?? {};
    const hotel = landmarks.client ?? { x: 80, z: 152 };
    const downtown = landmarks.downtown ?? { x: 108, z: 108 };
    const garage = landmarks.garage ?? { x: -216, z: 216 };
    const coast = landmarks.raceStart ?? { x: 300, z: 360 };
    const showroom = landmarks.coupe ?? { x: 148, z: -18 };
    // Reverse the taxi's stops on alternating fares to keep repeat work from being identical.
    const alternate = state.completed % 2 === 1;
    const stops = job.id === 'taxi'
      ? (alternate ? [[coast, 'Coast road passenger'], [hotel, 'Hotel Azure dropoff']] : [[hotel, 'Hotel Azure passenger'], [coast, 'Coast road dropoff']])
      : job.id === 'ambulance'
        ? [[alternate ? showroom : hotel, 'Patient pickup'], [downtown, 'Downtown clinic']]
        : [[hotel, 'Hotel Azure package'], [showroom, 'Showroom Row package'], [garage, 'Moreno Garage package']];
    const route = [];
    for (const [position, label] of stops) {
      const point = roadPoint(position, label, route);
      if (!point) return [];
      route.push(point);
    }
    return route;
  }

  function setTarget() {
    state.target = state.route[state.checkpoint] ?? null;
    state.stopTime = 0;
    state.stage = state.type === 'delivery' ? `checkpoint-${state.checkpoint + 1}` : state.checkpoint === 0 ? 'pickup' : 'dropoff';
    marker.visible = Boolean(state.target);
    if (state.target) marker.position.set(state.target.x, 0, state.target.z);
  }

  function objectiveText() {
    const job = definition();
    if (!job || !state.target) return '';
    const action = state.type === 'delivery'
      ? `Deliver ${state.checkpoint + 1}/${state.route.length}: ${state.target.label}`
      : `${state.checkpoint === 0 ? 'Pick up' : 'Drop off'}: ${state.target.label}`;
    return `${job.title} · ${action} · stop at marker · ${Math.ceil(state.timeLeft)}s · $${state.reward}`;
  }

  function start(job, car) {
    const route = makeRoute(job);
    blockedCar = car;
    if (!route.length) {
      hud?.toast?.('No clear route is available. Try another service vehicle.', 'info', 3);
      return false;
    }
    Object.assign(state, {
      active: true, type: job.id, stage: 'pickup', timeLeft: job.seconds, reward: job.reward,
      car, route, checkpoint: 0, elapsed: 0, stopTime: 0, lastResult: null,
    });
    material.color.set(job.color);
    beamMaterial.color.set(job.color);
    setTarget();
    setObjective(objectiveText());
    hud?.toast?.(`${job.title} started. Follow the marked road stop.`, 'mission', 3.5);
    return true;
  }

  function finish() {
    const job = definition();
    const event = { type: state.type, title: job.title, reward: state.reward, elapsed: state.elapsed };
    state.active = false;
    state.stage = 'complete';
    state.target = null;
    state.car = null;
    state.completed += 1;
    state.lastResult = event;
    marker.visible = false;
    setObjective('');
    onComplete?.(event);
    hud?.toast?.(`${job.title} complete · +$${event.reward}. Exit and re-enter for another run.`, 'mission', 4.5);
  }

  function fail(reason = 'Run cancelled.') {
    // Even an idle leave notifies the entry latch, allowing an immediate exit/re-entry.
    if (!player.state.inCar) blockedCar = null;
    if (!state.active) return false;
    const job = definition();
    blockedCar = player.state.inCar === state.car ? state.car : null;
    state.active = false;
    state.stage = 'failed';
    state.target = null;
    state.car = null;
    state.failed += 1;
    state.lastResult = { type: state.type, reason, reward: 0 };
    marker.visible = false;
    setObjective('');
    hud?.toast?.(`${job.title} failed: ${reason}`, 'danger', 3.5);
    return true;
  }

  function update(dt) {
    if (!Number.isFinite(dt) || dt < 0) return;
    const car = player.state.inCar;
    if (!car) blockedCar = null;
    if (state.active && (car !== state.car || !vehicles.cars.includes(state.car))) {
      fail('You left the service vehicle.');
      return;
    }
    if (state.active && (car.state.wrecked || !player.state.alive)) {
      fail(car.state.wrecked ? 'The service vehicle is wrecked.' : 'Jax went down.');
      return;
    }
    if (!state.active) {
      const job = identify(car);
      if (job && car !== blockedCar && !car.state.wrecked && player.state.alive) start(job, car);
      return;
    }
    state.timeLeft = Math.max(0, state.timeLeft - dt);
    state.elapsed += dt;
    if (state.timeLeft <= 0) { fail('Time ran out. Exit and re-enter to retry.'); return; }
    const target = state.target;
    const atStop = Math.hypot(car.state.x - target.x, car.state.z - target.z) <= stopRadius
      && Math.abs(car.state.speed) <= stoppedSpeed;
    state.stopTime = atStop ? state.stopTime + dt : 0;
    ring.scale.setScalar(1 + Math.sin(state.elapsed * 4) * 0.06);
    gem.rotation.y = state.elapsed * 1.7;
    if (state.stopTime >= stopSeconds) {
      state.checkpoint += 1;
      if (state.checkpoint >= state.route.length) { finish(); return; }
      setTarget();
      hud?.toast?.(state.type === 'taxi' ? 'Passenger aboard. Drive to the dropoff.' : state.type === 'ambulance' ? 'Patient aboard. Head for the clinic.' : 'Package delivered. Next stop marked.', 'info', 3);
    }
    setObjective(objectiveText());
  }

  function reset() {
    Object.assign(state, {
      active: false, type: null, stage: 'idle', timeLeft: 0, reward: 0, target: null,
      car: null, route: [], checkpoint: 0, elapsed: 0, stopTime: 0,
      completed: 0, failed: 0, lastResult: null,
    });
    blockedCar = null;
    marker.visible = false;
    setObjective('');
  }

  function getStatus() {
    return {
      active: state.active, type: state.type, stage: state.stage, timeLeft: state.timeLeft,
      reward: state.reward, target: state.target ? { ...state.target } : null,
    };
  }

  function getBlips() {
    if (state.active && state.target) return [{ ...state.target, color: definition().color, size: 30 }];
    return vehicles.cars.filter((car) => identify(car) && !car.state.wrecked)
      .map((car) => ({ x: car.state.x, z: car.state.z, color: definition(identify(car).id).color, size: 19 }));
  }

  function getEntries() {
    return JOBS.map((job) => {
      const active = state.active && state.type === job.id;
      const hint = active ? objectiveText() : `Enter the ${job.vehicle}. ${job.seconds}s limit; stop at each marked road point.`;
      return {
        id: `vehicle-${job.id}`, title: active ? `${job.title} · ${state.target?.label ?? state.stage} · ${Math.ceil(state.timeLeft)}s` : `${job.title} · ${job.seconds}s · ${job.id === 'delivery' ? '3 drops' : 'pickup + dropoff'}`,
        reward: job.reward, active, hint, locked: false, completed: false,
      };
    });
  }

  return { state, update, reset, fail, getStatus, getBlips, getEntries };
}
