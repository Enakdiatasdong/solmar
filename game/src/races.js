// Timed street races. Routes snap their configured landmarks to nearby road spawn points,
// while the two rivals are visual ghosts that never participate in vehicle physics.
import * as THREE from '../vendor/three.module.min.js';
import { RACES, VEHICLE_TYPES } from './config.js';
import { currentDifficulty } from './difficulty.js';
import { resolveCollisions } from './world.js';

const ringGeometry = new THREE.TorusGeometry(3.2, 0.14, 6, 24);
const beamGeometry = new THREE.CylinderGeometry(0.75, 1.05, 15, 8, 1, true);
const gemGeometry = new THREE.OctahedronGeometry(0.58, 0);
const checkpointRadius = 9;
const rivalSpeeds = [24, 21];
const rivalSpec = {
  body: 0x5b83d7, cabin: 0x202c45, name: 'Solmar Racer', variant: 'sport',
  tuning: VEHICLE_TYPES.sport,
};

export function createRaces(ctx) {
  const { scene, city, player, vehicles, hud, onComplete, isUnlocked } = ctx;
  const material = new THREE.MeshBasicMaterial({ color: 0x7cc9ff });
  const beamMaterial = new THREE.MeshBasicMaterial({ color: 0x7cc9ff, transparent: true, opacity: 0.13, depthWrite: false, side: THREE.DoubleSide });
  const marker = new THREE.Group();
  marker.name = 'Street race beacon';
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
    active: false, id: null, race: null, car: null, route: [], checkpoint: 0,
    elapsed: 0, timeLeft: 0, rivals: [], rivalProgress: [], lastResult: null,
    completed: 0, failed: 0,
  };
  let objective = '';

  function setObjective(text) {
    if (text === objective) return;
    objective = text;
    hud?.setObjective?.(text);
  }

  function definition(id = state.id) {
    return (RACES ?? []).find((race) => race.id === id) ?? null;
  }

  function unlocked(race) {
    return isUnlocked ? isUnlocked(race) : !(race.regionRequired > 0);
  }

  function roadPoint(position, used = []) {
    const points = city?.spawnPoints?.roadVehicles ?? city?.spawnPoints?.vehicles ?? [];
    let best = null;
    let distance = Infinity;
    for (const point of points) {
      if (!Number.isFinite(point.x) || !Number.isFinite(point.z)) continue;
      if (used.some((other) => Math.hypot(other.x - point.x, other.z - point.z) < 23)) continue;
      if (vehicles.cars?.some((car) => car.kind !== 'race' && Math.hypot(car.state.x - point.x, car.state.z - point.z) < 5)) continue;
      if (resolveCollisions(city?.colliders ?? [], point.x, point.z, 2).hit) continue;
      const nextDistance = Math.hypot(point.x - position.x, point.z - position.z);
      if (nextDistance < distance) { best = point; distance = nextDistance; }
    }
    return best ? { x: best.x, z: best.z } : null;
  }

  function positionFor(entry) {
    const landmarks = city?.landmarks ?? {};
    const landmark = entry?.landmark && landmarks[entry.landmark];
    const x = Number.isFinite(entry?.x) ? entry.x : landmark?.x;
    const z = Number.isFinite(entry?.z) ? entry.z : landmark?.z;
    return { x: Number.isFinite(x) ? x : 0, z: Number.isFinite(z) ? z : 0 };
  }

  function makeRoute(race) {
    // The start line stays on its landmark; the five in-race points snap to road spawns.
    const start = positionFor(race.start);
    const route = [start];
    for (const checkpoint of race.checkpoints ?? []) {
      route.push(roadPoint(positionFor(checkpoint), route) ?? positionFor(checkpoint));
    }
    return route.length === 6 && route.every((point) => Number.isFinite(point.x) && Number.isFinite(point.z)) ? route : [];
  }

  function pathLengths(route) {
    const lengths = [0];
    for (let index = 1; index < route.length; index += 1) {
      lengths[index] = lengths[index - 1] + Math.hypot(route[index].x - route[index - 1].x, route[index].z - route[index - 1].z);
    }
    return lengths;
  }

  function removeRivals() {
    for (const rival of state.rivals) {
      const index = vehicles.cars?.indexOf(rival);
      if (index >= 0) vehicles.cars.splice(index, 1);
      for (const group of vehicles.collisionGroups ?? []) {
        const groupIndex = group.indexOf(rival);
        if (groupIndex >= 0) group.splice(groupIndex, 1);
      }
      rival.group?.parent?.remove(rival.group);
    }
    state.rivals = [];
    state.rivalProgress = [];
  }

  function interpolate(route, lengths, distance) {
    const total = lengths[lengths.length - 1] ?? 0;
    const target = Math.max(0, Math.min(total, distance));
    let segment = 1;
    while (segment < lengths.length - 1 && lengths[segment] < target) segment += 1;
    const length = lengths[segment] - lengths[segment - 1] || 1;
    const fraction = (target - lengths[segment - 1]) / length;
    const from = route[segment - 1];
    const to = route[segment];
    return {
      x: from.x + (to.x - from.x) * fraction,
      z: from.z + (to.z - from.z) * fraction,
      heading: Math.atan2(to.x - from.x, to.z - from.z),
    };
  }

  function playerDistance(lengths) {
    const car = state.car;
    if (!car || state.route.length < 2) return 0;
    const segment = Math.min(state.checkpoint + 1, state.route.length - 1);
    const from = state.route[segment - 1];
    const to = state.route[segment];
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const denominator = dx * dx + dz * dz || 1;
    const projection = Math.max(0, Math.min(1, ((car.state.x - from.x) * dx + (car.state.z - from.z) * dz) / denominator));
    return lengths[segment - 1] + Math.hypot(dx, dz) * projection;
  }

  function place(lengths) {
    const progress = playerDistance(lengths);
    return 1 + state.rivalProgress.filter((rival) => rival > progress + 0.01).length;
  }

  function objectiveText(lengths) {
    if (!state.active || !state.race) return '';
    return `Race: ${state.race.title} · Checkpoint ${Math.min(state.checkpoint + 1, 5)}/5 · ${Math.ceil(state.timeLeft)}s · P${place(lengths)}`;
  }

  function start(id) {
    const race = definition(id);
    if (!race || state.active || !unlocked(race)) return false;
    const route = makeRoute(race);
    if (route.length !== 6) {
      hud?.toast?.('No clear route is available. Try again later.', 'info', 3);
      return false;
    }
    const car = player.state.inCar;
    if (!car) return false;
    Object.assign(state, { active: true, id: race.id, race, car, route, checkpoint: 0, elapsed: 0, timeLeft: race.timeLimit, lastResult: null });
    const lengths = pathLengths(route);
    removeRivals();
    const startHeading = Math.atan2(route[1].x - route[0].x, route[1].z - route[0].z);
    state.rivals = [0, 1].map((index) => vehicles.addCar(rivalSpec, { x: route[0].x + (index ? 3 : -3), z: route[0].z - 4 }, startHeading, { id: `race-rival-${index + 1}`, kind: 'race' }));
    // Keep ghosts out of traffic and collision iteration; they are positioned explicitly below.
    for (const rival of state.rivals) {
      const carIndex = vehicles.cars?.indexOf(rival);
      if (carIndex >= 0) vehicles.cars.splice(carIndex, 1);
      for (const group of vehicles.collisionGroups ?? []) {
        const groupIndex = group.indexOf(rival);
        if (groupIndex >= 0) group.splice(groupIndex, 1);
      }
    }
    state.rivalProgress = [0, 0];
    material.color.set(race.color ?? 0x7cc9ff);
    beamMaterial.color.set(race.color ?? 0x7cc9ff);
    marker.visible = true;
    marker.position.set(route[1].x, 0, route[1].z);
    setObjective(objectiveText(lengths));
    hud?.toast?.(`${race.title} started. Hit every checkpoint.`, 'mission', 3.5);
    return true;
  }

  function startAt(position) {
    if (!position || state.active) return false;
    const actor = position.inCar?.state ?? position;
    const race = (RACES ?? []).find((entry) => {
      const point = positionFor(entry.start);
      return Math.hypot(actor.x - point.x, actor.z - point.z) <= 6;
    });
    if (!race) return false;
    if (!unlocked(race)) {
      hud?.toast?.(`${race.title} is locked. Complete more story jobs first.`, 'info', 3);
      return true;
    }
    if (!player.state.inCar) {
      hud?.toast?.('Get in a car, then press E at the start line.', 'info', 3);
      return true;
    }
    return start(race.id);
  }

  function finish(lengths) {
    const race = state.race;
    const ranking = place(lengths);
    const prize = ranking === 1 ? race.prizes.first : ranking === 2 ? race.prizes.second : ranking === 3 ? race.prizes.third : 0;
    const event = { type: state.id, title: race.title, place: ranking, prize, elapsed: state.elapsed };
    removeRivals();
    Object.assign(state, { active: false, id: null, race: null, car: null, route: [], checkpoint: 0, timeLeft: 0, lastResult: event, completed: state.completed + 1 });
    marker.visible = false;
    setObjective('');
    onComplete?.(event);
    hud?.toast?.(`${event.title} complete · P${event.place} · +$${event.prize}.`, 'mission', 4.5);
  }

  function fail(reason = 'Race cancelled.') {
    if (!state.active) return false;
    const race = state.race;
    removeRivals();
    Object.assign(state, { active: false, id: null, race: null, car: null, route: [], checkpoint: 0, timeLeft: 0, lastResult: { type: race.id, title: race.title, reason, prize: 0 }, failed: state.failed + 1 });
    marker.visible = false;
    setObjective('');
    hud?.toast?.(`${race.title} failed: ${reason}`, 'danger', 3.5);
    return true;
  }

  function update(dt) {
    if (!Number.isFinite(dt) || dt < 0) return;
    if (!state.active) {
      const actor = player.state.inCar?.state ?? player.state;
      let visible = null;
      let visibleDistance = Infinity;
      for (const race of RACES ?? []) {
        if (!unlocked(race)) continue;
        const point = positionFor(race.start);
        const distance = Math.hypot(actor.x - point.x, actor.z - point.z);
        if (distance < visibleDistance) { visible = race; visibleDistance = distance; }
      }
      if (visible) {
        const point = positionFor(visible.start);
        marker.visible = true;
        marker.position.set(point.x, 0, point.z);
      } else marker.visible = false;
      return;
    }
    const car = player.state.inCar;
    if (car !== state.car) { fail('You left the car.'); return; }
    if (car.state.wrecked) { fail('Car wrecked.'); return; }
    if (!player.state.alive) { fail('Racer went down.'); return; }
    state.timeLeft = Math.max(0, state.timeLeft - dt);
    state.elapsed += dt;
    const lengths = pathLengths(state.route);
    const difficulty = currentDifficulty();
    const scale = difficulty.id === 'relaxed' ? 0.95 : difficulty.id === 'hardcore' ? 1.1 : 1;
    state.rivalProgress = state.rivals.map((rival, index) => {
      const progress = Math.min(lengths[lengths.length - 1], state.elapsed * rivalSpeeds[index] * scale);
      const position = interpolate(state.route, lengths, progress);
      vehicles.setCarPosition(rival, position.x, position.z, position.heading);
      return progress;
    });
    const target = state.route[state.checkpoint + 1];
    if (target && Math.hypot(car.state.x - target.x, car.state.z - target.z) <= checkpointRadius) {
      state.checkpoint += 1;
      if (state.checkpoint >= 5) { finish(lengths); return; }
      marker.position.set(state.route[state.checkpoint + 1].x, 0, state.route[state.checkpoint + 1].z);
      hud?.toast?.(`Checkpoint ${state.checkpoint}/5`, 'info', 1.8);
    }
    if (state.timeLeft <= 0) { fail('Time ran out.'); return; }
    ring.scale.setScalar(1 + Math.sin(state.elapsed * 4) * 0.06);
    gem.rotation.y = state.elapsed * 1.7;
    setObjective(objectiveText(lengths));
  }

  function reset() {
    removeRivals();
    Object.assign(state, { active: false, id: null, race: null, car: null, route: [], checkpoint: 0, elapsed: 0, timeLeft: 0, lastResult: null, completed: 0, failed: 0 });
    marker.visible = false;
    setObjective('');
  }

  function getBlips() {
    if (state.active) {
      const next = state.route[state.checkpoint + 1];
      return next ? [{ ...next, color: state.race.color ?? '#7cc9ff', size: 30 }] : [];
    }
    return (RACES ?? []).filter(unlocked).map((race) => ({ ...positionFor(race.start), color: race.color ?? '#7cc9ff', size: 24, id: `race-${race.id}` }));
  }

  function getRoute() { return state.active ? state.route.map((point) => ({ ...point })) : null; }

  function getEntries() {
    return (RACES ?? []).map((race) => {
      const active = state.active && state.id === race.id;
      const locked = !unlocked(race);
      return {
        id: `race-${race.id}`, title: active ? `${race.title} · ${Math.min(state.checkpoint + 1, 5)}/5 · ${Math.ceil(state.timeLeft)}s` : `${race.title} · ${race.timeLimit}s`,
        reward: race.prizes.first, active, locked,
        hint: locked ? 'Complete more story jobs to unlock this race.' : (race.hint ?? 'Drive to the start line to race.'), completed: false,
      };
    });
  }

  return { state, start, startAt, update, finish: () => state.active && finish(pathLengths(state.route)), fail, reset, getBlips, getRoute, getEntries };
}
