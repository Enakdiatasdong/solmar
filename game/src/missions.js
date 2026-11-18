import * as THREE from '../vendor/three.module.min.js';
import { MISSIONS } from './config.js';

const JOBS = [
  { id: 'first-fare', title: 'First Fare', tag: '01 / A FRESH START', start: { x: -8, z: 84 }, reward: 500, description: 'Mara has a passenger who pays in cash. Be a driver again.' },
  { id: 'hot-wheels', title: 'Hot Wheels', tag: '02 / BORROWED HORSEPOWER', start: { x: -210, z: 208 }, reward: 750, description: 'Recover a custom coupe for Inez. Its current owner disagrees.' },
  { id: 'beach-run', title: 'Beach Run', tag: '03 / COASTAL CIRCUIT', start: { x: 300, z: 336 }, reward: 1200, description: 'Six gates. Seventy-five seconds. One coast to call your own.' },
  { id: 'heat', title: 'Heat', tag: '04 / OUT OF SIGHT', start: { x: 108, z: 108 }, reward: 1500, description: 'Draw the patrol away from Mara, then disappear into the city.' },
  { id: 'harbor-job', title: 'The Big One', tag: '05 / THE HARBOR JOB', start: { x: -296, z: 424 }, reward: 3000, description: 'Take the dock ledger, breach Meridian Bank, and buy your way out.' },
];
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const gateRoute = [{ x: 300, z: 330 }, { x: 180, z: 360 }, { x: 60, z: 360 }, { x: -60, z: 360 }, { x: -180, z: 360 }, { x: -300, z: 300 }];

export function createMissions(ctx) {
  const { scene, player, vehicles, police, combat, hud, audio } = ctx;
  const list = JOBS.map(job => ({ ...job, completed: false, locked: true, best: null }));
  const state = { active: null, current: null, stage: '', elapsed: 0, checkpoint: 0, events: [], completed: [], bestTimes: {}, dialogueQueue: [], dialogueCurrent: null, dialogueTimer: 0, abandoned: 0, targetCar: null, enemies: [] };
  const beacons = new THREE.Group();
  scene.add(beacons);
  const startMarkers = list.map((job, index) => {
    const marker = makeBeacon(index === 4 ? 0xffae78 : 0xffcd75);
    marker.position.set(job.start.x, 0.2, job.start.z);
    beacons.add(marker);
    return marker;
  });
  const objectiveMarker = makeBeacon(0x35ebcd);
  objectiveMarker.visible = false;
  scene.add(objectiveMarker);
  let target = null;
  let objective = '';
  let clock = 0;

  function makeBeacon(color) {
    const group = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.8, 0.12, 6, 32), new THREE.MeshBasicMaterial({ color }));
    ring.rotation.x = -Math.PI / 2;
    group.add(ring);
    const column = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 2.8, 12, 16, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }));
    column.position.y = 6;
    group.add(column);
    const diamond = new THREE.Mesh(new THREE.OctahedronGeometry(0.85), new THREE.MeshBasicMaterial({ color }));
    diamond.position.y = 5;
    group.add(diamond);
    return group;
  }
  function refresh() {
    list.forEach((job, i) => {
      job.completed = state.completed.includes(job.id);
      job.locked = i > 0 && !state.completed.includes(list[i - 1].id);
      job.best = state.bestTimes[job.id] ?? null;
      startMarkers[i].visible = !state.active && !job.locked;
    });
  }
  function say(speaker, text, seconds = 5) {
    state.dialogueQueue.push({ speaker, text, seconds });
  }
  function clearDialogue() {
    state.dialogueQueue.length = 0;
    state.dialogueCurrent = null;
    state.dialogueTimer = 0;
    hud.setDialogue('', '');
  }
  function setObjective(text, point = null) {
    objective = text;
    target = point ? { x: point.x, z: point.z } : null;
    objectiveMarker.visible = !!target;
    if (target) objectiveMarker.position.set(target.x, 0.2, target.z);
    hud.setObjective(text);
  }
  function transition(stage, text, point) {
    state.stage = stage;
    setObjective(text, point);
    audio.chime();
  }
  function start(id) {
    refresh();
    const job = list.find(item => item.id === id);
    if (!job || job.locked || state.active) return false;
    clearDialogue();
    combat.clearEnemies();
    state.active = job;
    state.current = job;
    state.elapsed = 0;
    state.checkpoint = 0;
    state.abandoned = 0;
    state.enemies = [];
    hud.toast(`${job.title} — ${job.description}`, 'job');
    if (id === 'first-fare') {
      transition('pickup', 'Get a car. Pick up Mara’s passenger at Hotel Azure.', { x: 80, z: 152 });
      say('MARA', 'Jax Moreno. Back from the dead, and still late. Hotel Azure. One passenger. No questions.');
      say('JAX', 'I used to drive getaways. A fare sounds like a holiday.');
    } else if (id === 'hot-wheels') {
      state.targetCar = vehicles.spawnCar({ x: 148, z: -18, heading: 0, color: 0x28cdb7, kind: 'coupe', owned: false });
      transition('steal', 'Find and steal Inez’s teal coupe in the Arts District.', state.targetCar);
      say('INEZ', 'That teal coupe? Mine. The man who took it left it north of the canal. Bring it home.');
    } else if (id === 'beach-run') {
      transition('race', 'Coastal circuit — drive through all six gates. 75 seconds.', gateRoute[0]);
      say('MARA', 'The coast has a long memory. Give it a new record.');
    } else if (id === 'heat') {
      police.setWanted(3);
      police.state.forcedDecay = true;
      transition('evade', 'Lose the patrol. Break line of sight, then stay hidden.');
      say('MARA', 'They are following my van. Make them follow you. Then disappear.');
    } else {
      player.state.ammo = Math.max(24, player.state.ammo);
      transition('ledger', 'On foot: collect the dock ledger beside the harbor office.', { x: -302, z: 438 });
      say('INEZ', 'Meridian Bank launders the port’s money. The ledger gets us inside. Their guards want it too.');
      say('JAX', 'One last getaway. This time, we keep what we take.');
      state.enemies = [[-292, 450], [-312, 449], [-284, 432]].map(([x, z]) => combat.spawnEnemy(x, z, { name: 'Dock guard' }));
    }
    refresh();
    return true;
  }
  function complete() {
    const job = state.active;
    if (!job) return false;
    const time = Math.round(state.elapsed * 10) / 10;
    state.bestTimes[job.id] = Math.min(state.bestTimes[job.id] ?? Infinity, time);
    if (!state.completed.includes(job.id)) state.completed.push(job.id);
    state.events.push({ type: 'complete', id: job.id, title: job.title, reward: MISSIONS.rewards[job.id], time, count: state.completed.length });
    finish();
    audio.chime();
    return true;
  }
  function finish() {
    clearDialogue();
    state.active = null;
    state.current = null;
    state.stage = '';
    state.targetCar = null;
    state.enemies = [];
    target = null;
    objectiveMarker.visible = false;
    police.state.forcedDecay = false;
    combat.clearEnemies();
    setObjective('The coast is yours. Find a gold beacon or open Jobs [M].');
    refresh();
  }
  function fail(reason = 'The job slipped away. Try again at its beacon.') {
    if (!state.active) return false;
    state.events.push({ type: 'fail', id: state.active.id, reason });
    finish();
    return true;
  }
  function update(dt) {
    clock += dt;
    for (const marker of [...startMarkers, objectiveMarker]) {
      marker.children[2].rotation.y = clock;
      marker.children[2].position.y = 5 + Math.sin(clock * 2) * 0.35;
    }
    if (state.dialogueTimer > 0) state.dialogueTimer -= dt;
    if (state.active && state.dialogueTimer <= 0) {
      state.dialogueCurrent = state.dialogueQueue.shift() || null;
      if (state.dialogueCurrent) {
        const line = state.dialogueCurrent;
        hud.setDialogue(line.speaker, line.text);
        state.dialogueTimer = line.seconds;
      } else hud.setDialogue('', '');
    }
    const job = state.active;
    if (!job) return;
    state.elapsed += dt;
    const p = player.state;
    const car = p.car;
    const near = (point, radius = 11) => distance(p, point) < radius;
    if (p.health <= 0) return fail('You did not make it out.');
    if (state.targetCar?.wrecked && job.id === 'first-fare') return fail('The passenger’s ride is wrecked.');
    if (car?.wrecked && ['first-fare', 'hot-wheels', 'beach-run'].includes(job.id)) return fail('The ride is wrecked.');
    if (job.id === 'first-fare') {
      if (state.stage === 'pickup' && car && near({ x: 80, z: 152 })) {
        state.targetCar = car;
        transition('dropoff', 'Passenger aboard. Drive to Pier 9 and slow to a stop.', { x: 300, z: 268 });
        say('PASSENGER', 'Pier 9. And Jax? Some people at the port remember your old work.');
      } else if (state.stage === 'dropoff') {
        state.abandoned = car ? 0 : state.abandoned + dt;
        if (state.abandoned > 15) fail('Your passenger found another driver.');
        else if (car && near({ x: 300, z: 268 }, 14) && Math.abs(car.speed) < 5) complete();
      }
    } else if (job.id === 'hot-wheels') {
      if (state.targetCar?.wrecked) return fail('Inez needed a car, not scrap.');
      if (state.stage === 'steal' && car === state.targetCar) {
        if (police.state.wanted < 2) police.setWanted(2);
        transition('deliver', 'Deliver the teal coupe to Inez’s garage. Slow down inside the marker.', { x: -216, z: 216 });
        say('INEZ', 'There she is. Keep the paint on, Moreno.');
      } else if (state.stage === 'deliver' && car === state.targetCar && near({ x: -216, z: 216 }, 13) && Math.abs(car.speed) < 4) complete();
    } else if (job.id === 'beach-run') {
      const remaining = Math.max(0, 75 - state.elapsed);
      hud.setObjective(`BEACH RUN • ${remaining.toFixed(1)}s • Gate ${state.checkpoint + 1} / 6`);
      if (remaining <= 0) return fail('The sun went down on this run. Try a faster line.');
      if (car && near(gateRoute[state.checkpoint], 17)) {
        state.checkpoint++;
        if (state.checkpoint >= gateRoute.length) complete();
        else {
          setObjective(`Gate ${state.checkpoint + 1} of 6 — keep the ocean beside you.`, gateRoute[state.checkpoint]);
          hud.toast(`Gate ${state.checkpoint} / 6`, 'success');
          audio.chime();
        }
      }
    } else if (job.id === 'heat') {
      if (police.state.wanted === 0) complete();
    } else if (state.stage === 'ledger') {
      if (!car && near({ x: -302, z: 438 }, 8)) transition('guards', 'Clear the three dock guards. F to punch; click to fire.');
    } else if (state.stage === 'guards') {
      const alive = state.enemies.filter(enemy => enemy.alive && enemy.health > 0).length;
      hud.setObjective(`The ledger is yours. Clear the dock guards: ${alive} remaining.`);
      if (!alive) {
        transition('bank', 'Take the ledger to Meridian Bank in the northern financial district.', { x: 288, z: -288 });
        say('INEZ', 'Those account numbers open the vault. Meridian Bank. North end of the city.');
      }
    } else if (state.stage === 'bank' && near({ x: 288, z: -288 }, 14)) {
      police.setWanted(3);
      police.state.forcedDecay = true;
      transition('bank-getaway', 'Vault cleared. Get a car and deliver the take to Inez’s garage.', { x: -216, z: 216 });
      audio.siren();
      say('JAX', 'I have the money. I also have company.');
    } else if (state.stage === 'bank-getaway' && car && near({ x: -216, z: 216 }, 14) && Math.abs(car.speed) < 5) {
      transition('bank-evade', 'The money is safe. Lose the patrol to finish the job.');
      say('MARA', 'The take is safe. Now make sure you are.');
    } else if (state.stage === 'bank-evade' && police.state.wanted === 0) complete();
  }
  function setProgress(completed = [], best = {}) {
    state.completed = completed.filter(id => MISSIONS.order.includes(id));
    state.bestTimes = { ...best };
    refresh();
  }
  function reset() {
    finish();
    state.completed = [];
    state.bestTimes = {};
    state.events.length = 0;
    refresh();
  }
  function nearestStart(x, z, radius = 5.5) {
    if (state.active) return null;
    return list.find(job => !job.locked && distance({ x, z }, job.start) < radius) || null;
  }
  refresh();
  return { state, list, start, update, complete, fail, reset, setProgress, nearestStart, takeEvents: () => state.events.splice(0), get current() { return state.active; }, get target() { return target; }, get objective() { return objective; }, get bestTimes() { return state.bestTimes; }, get completed() { return [...state.completed]; } };
}
