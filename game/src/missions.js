import * as THREE from '../vendor/three.module.min.js';
import { MISSIONS } from './config.js';

const JOBS = [
  { id: 'first-fare', title: 'First Fare', tag: '01 / A FRESH START', start: { x: -8, z: 84 }, reward: 500, description: 'Mara has a passenger who pays in cash. Be a driver again.' },
  { id: 'hot-wheels', title: 'Hot Wheels', tag: '02 / BORROWED HORSEPOWER', start: { x: -210, z: 208 }, reward: 750, description: 'Recover a custom coupe for Inez. Its current owner disagrees.' },
  { id: 'beach-run', title: 'Beach Run', tag: '03 / COASTAL CIRCUIT', start: { x: 300, z: 336 }, reward: 1200, description: 'Six gates. Seventy-five seconds. One coast to call your own.' },
  { id: 'heat', title: 'Heat', tag: '04 / OUT OF SIGHT', start: { x: 108, z: 108 }, reward: 1500, description: 'Draw the patrol away from Mara, then disappear into the city.' },
  { id: 'harbor-job', title: 'The Big One', tag: '05 / THE HARBOR JOB', start: { x: -296, z: 424 }, reward: 3000, description: 'Take the dock ledger, breach Meridian Bank, and buy your way out.' },
  { id: 'salt-signal', title: 'Salt Signal', tag: '06 / THE BROADCAST', start: { x: 252, z: 475 }, reward: 4200, description: 'Find the hidden recording on Pier 9 and reach the relay before it goes off air.' },
  { id: 'clear-water', title: 'Clear Water', tag: '07 / THE CROSSING', start: { x: 144, z: -264 }, reward: 5500, description: 'Get the original evidence out of Solmar aboard the last harbor launch.' },
];
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const gateRoute = [{ x: 288, z: 330 }, { x: 180, z: 360 }, { x: 60, z: 360 }, { x: -60, z: 360 }, { x: -180, z: 360 }, { x: -288, z: 300 }];
const RACES = [
  { id: 'switchback', title: 'Switchback', start: { x: -144, z: 118 }, reward: 650, seconds: 62,
    description: 'A run through tight North Quarter turns. Beat the clock in any car.',
    route: [[-144, 0], [-144, -72], [-72, -72], [-72, -216], [72, -216], [72, -288], [216, -288]] },
  { id: 'night-shift', title: 'Night Shift', start: { x: -288, z: 350 }, reward: 900, seconds: 72,
    description: 'Run the port road and its long industrial straights. Open all day.',
    route: [[-288, 216], [-288, 72], [-216, 72], [-216, -72], [-72, -72], [-72, 0], [72, 0]] },
].map(race => ({ ...race, tag: 'STREET RACE', route: race.route.map(([x, z]) => ({ x, z })) }));
const recorder = { x: 252, z: 617 };
const relay = { x: 144, z: -264 };
const courier = { x: -144, z: -250 };
const launch = { x: -282, z: 472 };
const workshop = { x: -216, z: 397, fee: 275, name: 'Tideglass Auto' };
const shopPaints = [0x2aa69a, 0xe98567, 0xdac468, 0x788cc9];

export function createMissions(ctx) {
  const { scene, city, player, vehicles, police, combat, hud, audio } = ctx;
  const list = JOBS.map(job => ({ ...job, completed: false, locked: true, best: null }));
  const races = RACES.map(race => ({ ...race, completed: false, locked: false, best: null }));
  const state = { active: null, current: null, stage: '', elapsed: 0, timedElapsed: 0, checkpoint: 0, events: [], completed: [], bestTimes: {}, dialogueQueue: [], dialogueCurrent: null, dialogueTimer: 0, abandoned: 0, targetCar: null, enemies: [] };
  const beacons = new THREE.Group();
  scene.add(beacons);
  function placeBeacon(point, color) {
    const marker = makeBeacon(color);
    marker.position.set(point.x, 0.2, point.z);
    beacons.add(marker);
    return marker;
  }
  const startMarkers = list.map((job, index) => {
    return placeBeacon(job.start, index >= 4 ? 0xffae78 : 0xffcd75);
  });
  const raceMarkers = races.map(race => placeBeacon(race.start, 0xee9afe));
  const repairMarker = placeBeacon(workshop, 0x84c5fe);
  const objectiveMarker = makeBeacon(0x35ebcd);
  objectiveMarker.visible = false;
  scene.add(objectiveMarker);
  const gate = makeGate();
  gate.visible = false;
  scene.add(gate);
  makeWorkshop();
  const rotatingMarkers = [...startMarkers, ...raceMarkers, repairMarker, objectiveMarker];
  let target = null;
  let objective = '';
  let clock = 0;
  let paintIndex = 0;
  const jobCars = new Map();

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
  function makeGate() {
    const arch = new THREE.Group();
    const light = new THREE.MeshBasicMaterial({ color: 0xeea6ff });
    const stripe = new THREE.MeshBasicMaterial({ color: 0x6b4a8c });
    const panel = (w, h, d, x, y, material) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
      mesh.position.set(x, y, 0);
      arch.add(mesh);
    };
    for (const x of [-8, 8]) {
      panel(0.55, 5.4, 0.55, x, 2.7, light);
      panel(1.2, 0.28, 1.2, x, 0.15, stripe);
    }
    for (let i = 0; i < 12; i++) panel(1.4, 0.65, 0.35, (i - 5.5) * 1.4, 5.15, i % 2 ? light : stripe);
    return arch;
  }
  function makeWorkshop() {
    // The drive-up bay faces the beach access road.
    const shop = new THREE.Group();
    shop.position.set(workshop.x - 15, 0.15, workshop.z);
    scene.add(shop);
    function box(color, x, y, z, w, h, d, basic = false) {
      const material = basic ? new THREE.MeshBasicMaterial({ color }) : new THREE.MeshStandardMaterial({ color });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
      mesh.position.set(x, y, z);
      mesh.receiveShadow = true;
      mesh.castShadow = !basic;
      shop.add(mesh);
    }
    box(0x658499, 0, 2.8, 0, 13.5, 5.6, 14);
    box(0x223f54, 0, 5.75, 0, 14.3, 0.32, 14.6);
    box(0x4c6479, 6.81, 1.95, 0, 0.16, 3.9, 7.8);
    for (let y = 0.44; y < 3.9; y += 0.46) box(0xb0ccd2, 6.92, y, 0, 0.11, 0.07, 7.65);
    box(0x90d3fe, 6.95, 4.07, 0, 0.12, 0.12, 9.2, true);
    const canvas = document.createElement('canvas');
    canvas.width = 384;
    canvas.height = 76;
    const ink = canvas.getContext('2d');
    ink.fillStyle = '#223f54';
    ink.fillRect(0, 0, canvas.width, canvas.height);
    ink.fillStyle = '#8bd8ff';
    ink.font = 'bold 42px sans-serif';
    ink.textAlign = 'center';
    ink.fillText(workshop.name.toUpperCase(), 192, 53, 368);
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(10, 1.35), new THREE.MeshBasicMaterial({ map }));
    sign.position.set(6.94, 4.89, 0);
    sign.rotation.y = Math.PI / 2;
    shop.add(sign);
    const bounds = { minX: workshop.x - 21.8, maxX: workshop.x - 8.03, minZ: workshop.z - 7, maxZ: workshop.z + 7, minY: 0, maxY: 6.05 };
    city.colliders.push(bounds);
    city.cameraObstacles?.push(bounds);
  }
  function refresh() {
    list.forEach((job, i) => {
      job.completed = state.completed.includes(job.id);
      job.locked = i > 0 && !state.completed.includes(list[i - 1].id);
      job.best = state.bestTimes[job.id] ?? null;
      startMarkers[i].visible = !state.active && !job.locked;
    });
    races.forEach((race, i) => {
      race.best = state.bestTimes[race.id] ?? null;
      race.completed = race.best !== null;
      raceMarkers[i].visible = !state.active;
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
  function describe(text) {
    if (objective === text) return;
    objective = text;
    hud.setObjective(text);
  }
  function setObjective(text, point = null, previousGate = null) {
    describe(text);
    target = point ? { x: point.x, z: point.z } : null;
    gate.visible = !!(target && previousGate);
    objectiveMarker.visible = !!target && !gate.visible;
    if (gate.visible) {
      gate.position.set(target.x, 0.2, target.z);
      gate.rotation.y = Math.atan2(target.x - previousGate.x, target.z - previousGate.z);
    } else if (target) objectiveMarker.position.set(target.x, 0.2, target.z);
  }
  function transition(stage, text, point, previousGate) {
    state.stage = stage;
    setObjective(text, point, previousGate);
    audio.chime();
  }
  function prepareCar(id, options) {
    const oldCar = jobCars.get(id);
    if (oldCar && !oldCar.removed) {
      if (player.state.car === oldCar && !oldCar.wrecked) return oldCar;
      vehicles.removeCar(oldCar);
    }
    const car = vehicles.spawnCar(options);
    jobCars.set(id, car);
    return car;
  }
  function start(id) {
    refresh();
    const job = [...list, ...races].find(item => item.id === id);
    if (!job || job.locked || state.active) return false;
    clearDialogue();
    combat.clearEnemies();
    state.active = job;
    state.current = job;
    state.elapsed = 0;
    state.timedElapsed = 0;
    state.checkpoint = 0;
    state.abandoned = 0;
    state.enemies = [];
    hud.toast(`${job.title} — ${job.description}`, 'job');
    if (job.route) {
      transition('race-line', 'Get in a car and cross the starting gate to start the clock.', job.start, job.route[0]);
    } else if (id === 'first-fare') {
      transition('pickup', 'Get a car. Pick up Mara’s passenger at Hotel Azure.', { x: 80, z: 152 });
      say('MARA', 'Jax Moreno. Back from the dead, and still late. Hotel Azure. One passenger. No questions.');
      say('JAX', 'I used to drive getaways. A fare sounds like a holiday.');
    } else if (id === 'hot-wheels') {
      state.targetCar = prepareCar(id, { x: 148, z: -18, heading: 0, color: 0x28cdb7, kind: 'coupe', owned: false });
      transition('steal', 'Find and steal Inez’s teal coupe in the Arts District.', state.targetCar);
      say('INEZ', 'That teal coupe? Mine. The man who took it left it north of the canal. Bring it home.');
    } else if (id === 'beach-run') {
      transition('race', 'Coastal circuit — drive through all six gates.', gateRoute[0], { x: 288, z: 318 });
      say('MARA', 'The coast has a long memory. Give it a new record.');
    } else if (id === 'heat') {
      police.setWanted(3);
      police.state.forcedDecay = true;
      transition('evade', 'Lose the patrol. Break line of sight, then stay hidden.');
      say('MARA', 'They are following my van. Make them follow you. Then disappear.');
    } else if (id === 'harbor-job') {
      player.state.armed = true;
      player.state.ammo = Math.max(24, player.state.ammo);
      transition('ledger', 'On foot: collect the dock ledger beside the harbor office.', { x: -302, z: 438 });
      say('INEZ', 'Meridian Bank launders the port’s money. The ledger gets us inside. Their guards want it too.');
      say('JAX', 'One last getaway. This time, we keep what we take.');
      state.enemies = [[-292, 450], [-312, 449], [-284, 432]].map(([x, z]) => combat.spawnEnemy(x, z, { name: 'Dock guard' }));
    } else if (id === 'salt-signal') {
      transition('recording', 'On foot: find the recording at the end of Pier 9.', recorder);
      say('MARA', 'The ledger names names. The recording proves they knew. I left it at the end of Pier 9.');
      say('INEZ', 'Once you have it, get to the relay in the North Quarter. We only get one broadcast window.');
    } else if (id === 'clear-water') {
      state.targetCar = prepareCar(id, { ...courier, heading: Math.PI, color: 0xd39b4f, kind: 'courier', owned: true });
      transition('courier', 'Find Mara’s amber courier car. The original evidence is inside.', state.targetCar);
      say('MARA', 'The broadcast went out. The last launch can take the witnesses and the originals.');
      say('JAX', 'Get them on board. I’ll bring the evidence and take the patrol away from the berth.');
    }
    refresh();
    return true;
  }
  function complete() {
    const job = state.active;
    if (!job) return false;
    const time = Math.round((job.route ? state.timedElapsed : state.elapsed) * 10) / 10;
    state.bestTimes[job.id] = Math.min(state.bestTimes[job.id] ?? Infinity, time);
    if (job.route) {
      state.events.push({ type: 'race-complete', id: job.id, title: job.title, reward: job.reward, time });
    } else {
      if (!state.completed.includes(job.id)) state.completed.push(job.id);
      state.events.push({ type: 'complete', id: job.id, title: job.title, reward: MISSIONS.rewards[job.id] ?? job.reward, time, count: state.completed.length });
    }
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
    police.state.forcedDecay = false;
    combat.clearEnemies();
    setObjective('Find a gold job beacon, a purple street race, or open Jobs [M].');
    refresh();
  }
  function fail(reason = 'The job slipped away. Try again at its beacon.') {
    if (!state.active) return false;
    state.events.push({ type: 'fail', id: state.active.id, reason });
    finish();
    return true;
  }
  function update(dt, timerMultiplier = 1) {
    clock += dt;
    for (const marker of rotatingMarkers) {
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
    if (car?.wrecked && (job.route || ['first-fare', 'hot-wheels', 'beach-run', 'clear-water'].includes(job.id))) return fail('The ride is wrecked.');
    if (job.route) {
      if (state.stage === 'race-line' && car && near(job.start, 12)) {
        transition('street-race', 'Go! Follow the checkpoint gates.', job.route[0], job.start);
      } else if (state.stage === 'street-race') {
        state.timedElapsed += dt;
        runGates(job, job.route, job.seconds * timerMultiplier - state.timedElapsed);
      }
    } else if (job.id === 'first-fare') {
      if (state.stage === 'pickup' && car && near({ x: 80, z: 152 })) {
        state.targetCar = car;
        transition('dropoff', 'Passenger aboard. Drive to Pier 9 and slow to a stop.', { x: 300, z: 268 });
        say('PASSENGER', 'Pier 9. And Jax? Some people at the port remember your old work.');
      } else if (state.stage === 'dropoff') {
        state.abandoned = car === state.targetCar ? 0 : state.abandoned + dt;
        if (state.abandoned > 15 * timerMultiplier) fail('Your passenger found another driver.');
        else if (car && car === state.targetCar && near({ x: 300, z: 268 }, 14) && Math.abs(car.speed) < 5) complete();
      }
    } else if (job.id === 'hot-wheels') {
      if (state.targetCar?.wrecked) return fail('Inez needed a car, not scrap.');
      if (state.stage === 'steal' && car === state.targetCar) {
        if (police.state.wanted < 2) police.setWanted(2);
        transition('deliver', 'Deliver the teal coupe to Inez’s garage. Slow down inside the marker.', { x: -216, z: 216 });
        say('INEZ', 'There she is. Keep the paint on, Moreno.');
      } else if (state.stage === 'deliver' && car === state.targetCar && near({ x: -216, z: 216 }, 13) && Math.abs(car.speed) < 4) complete();
    } else if (job.id === 'beach-run') {
      runGates(job, gateRoute, 75 * timerMultiplier - state.elapsed);
    } else if (job.id === 'heat') {
      if (police.state.wanted === 0) complete();
    } else if (job.id === 'salt-signal') {
      if (state.stage === 'recording' && !car && near(recorder, 6)) {
        transition('broadcast', 'Recording secured. Reach the North Quarter relay.', relay);
        say('MARA', 'The relay is warming up. Get back to your car and head north.');
      } else if (state.stage === 'broadcast') {
        state.timedElapsed += dt;
        const remaining = 88 * timerMultiplier - state.timedElapsed;
        describe(`SALT SIGNAL • ${Math.max(0, remaining).toFixed(1)}s • Reach the North Quarter relay.`);
        if (remaining <= 0) fail('The relay went off air. Pick up the recording and try the run again.');
        else if (near(relay, 12) && (!car || Math.abs(car.speed) < 5)) complete();
      }
    } else if (job.id === 'clear-water') {
      if (state.targetCar?.wrecked) return fail('The original evidence was lost with the car.');
      if (state.stage === 'courier' && car === state.targetCar) {
        if (police.state.wanted < 3) police.setWanted(3);
        police.state.forcedDecay = true;
        transition('last-launch', 'Drive the amber car to the harbor berth and slow to a stop.', launch);
      } else if (state.stage === 'last-launch' && car === state.targetCar && near(launch, 13) && Math.abs(car.speed) < 5) {
        transition('cover', 'The evidence is aboard. Lose the patrol so the launch can leave.');
        say('MARA', 'The originals are on board. Get the patrol away from the water.');
      } else if (state.stage === 'cover' && police.state.wanted === 0) complete();
    } else if (state.stage === 'ledger') {
      if (!car && near({ x: -302, z: 438 }, 8)) transition('guards', 'Clear the three dock guards. F to punch; click to fire.');
    } else if (state.stage === 'guards') {
      const alive = state.enemies.filter(enemy => enemy.alive && enemy.health > 0).length;
      describe(`The ledger is yours. Clear the dock guards: ${alive} remaining.`);
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
  function runGates(job, route, remaining) {
    if (remaining <= 0) return fail('Time’s up. Return to the start and try a quicker line.');
    const p = player.state;
    if (p.car && distance(p, route[state.checkpoint]) < (job.route ? 12 : 17)) {
      const previous = route[state.checkpoint++];
      if (state.checkpoint === route.length) return complete();
      setObjective(objective, route[state.checkpoint], previous);
      audio.chime();
    }
    describe(`${job.title.toUpperCase()} • ${remaining.toFixed(1)}s • Gate ${state.checkpoint + 1} / ${route.length}`);
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
    jobCars.clear();
    refresh();
  }
  function nearestStart(x, z, radius = 5.5) {
    if (state.active) return null;
    return list.find(job => !job.locked && distance({ x, z }, job.start) < radius) || null;
  }
  function nearestRace(x, z, radius = 8) {
    if (state.active) return null;
    return races.find(race => distance({ x, z }, race.start) < radius) || null;
  }
  function nearWorkshop(x, z) {
    return distance({ x, z }, workshop) < 7;
  }
  function tryRespray(cash) {
    const { car, x, z } = player.state;
    if (!car || !nearWorkshop(x, z)) return null;
    if (Math.abs(car.speed) > 2.5) return { cost: 0, message: 'Stop inside the blue workshop marker.' };
    if (car.kind === 'police' || car.wrecked) return { cost: 0, message: 'Tideglass Auto needs a drivable civilian car.' };
    if (cash < workshop.fee) return { cost: 0, message: `Tideglass Auto charges $${workshop.fee} for a respray.` };
    const paint = shopPaints[paintIndex++ % shopPaints.length];
    car.paint.color.setHex(paint);
    car.health = 100;
    police.clear();
    audio.chime();
    return { cost: workshop.fee, message: `Tideglass Auto • fresh paint and no heat • −$${workshop.fee}` };
  }
  refresh();
  return {
    state, list, races, workshop, start, update, complete, fail, reset, setProgress,
    nearestStart, nearestRace, nearWorkshop, tryRespray, setObjective,
    takeEvents: () => state.events.splice(0),
    get current() { return state.active; },
    get target() { return target; },
    get objective() { return objective; },
    get bestTimes() { return state.bestTimes; },
    get completed() { return [...state.completed]; },
  };
}
