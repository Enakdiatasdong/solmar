// The jobs of Solmar: objectives, story beats, and one outward event stream.
import * as THREE from '../vendor/three.module.min.js';

const JOBS = [
  { id: 'first-fare', title: 'First Fare', reward: 500, x: -8, z: 84, contact: 'MARA', story: 'A quiet fare. A clean shirt. One more chance to get your name back.' },
  { id: 'hot-wheels', title: 'Hot Wheels', reward: 750, x: -210, z: 208, contact: 'MARA', story: 'An old friend left a teal coupe in the wrong hands. Bring it home.' },
  { id: 'beach-run', title: 'Beach Run', reward: 1200, x: 300, z: 336, contact: 'NICO', story: 'Seventy-five seconds of salt air. Six gates between you and easy money.' },
  { id: 'heat', title: 'Heat', reward: 1500, x: 108, z: 108, contact: 'MARA', story: 'Someone sold your name to the city. Shake the tail before it sticks.' },
  { id: 'harbor-job', title: 'The Big One', reward: 3000, x: -296, z: 424, contact: 'MARA', story: 'A harbor crate, a bank ledger, and enough cash to buy your own horizon.' },
];
const GATES = [[300, 330], [180, 354], [60, 354], [-60, 354], [-180, 354], [-300, 330]];
const DIST = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export function createMissions(ctx) {
  const { player, vehicles, police, combat, hud, audio, city } = ctx;
  const list = JOBS.map((job, index) => ({ ...job, completed: false, locked: index > 0, best: null }));
  const state = { active: null, stage: '', elapsed: 0, events: [], dialogueQueue: [], dialogueCurrent: null, dialogueTime: 0, checkpoint: 0, coupe: null, guards: [], bestTimes: {}, clock: 0 };
  const group = new THREE.Group();
  group.name = 'Job beacons';
  city.group.add(group);
  const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xffcc66, transparent: true, opacity: .85, depthWrite: false });
  const markers = list.map(job => {
    const marker = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.3, .16, 6, 40), markerMaterial);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = .16;
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(.9), markerMaterial);
    core.position.y = 3.5;
    marker.add(ring, core);
    marker.position.set(job.x, 0, job.z);
    group.add(marker);
    return { job, marker, core };
  });
  const targetGroup = new THREE.Group();
  group.add(targetGroup);
  let beaconList = [];

  function dialogue(speaker, text, duration = 5.5) {
    state.dialogueQueue.push({ speaker, text, duration });
  }
  function clearDialogue() {
    state.dialogueQueue.length = 0;
    state.dialogueCurrent = null;
    state.dialogueTime = 0;
    hud.setDialogue('', '');
  }
  function setTarget(x, z, color = '#ffd271') {
    while (targetGroup.children.length) {
      const item = targetGroup.children[0];
      targetGroup.remove(item);
      item.geometry?.dispose();
      item.material?.dispose();
    }
    beaconList = x == null ? [] : [{ x, z, color }];
    if (x == null) return;
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .72, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(5.5, .23, 6, 48), material);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(x, .22, z);
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(1.25, 2.2, 4), material);
    arrow.rotation.z = Math.PI;
    arrow.position.set(x, 5.5, z);
    targetGroup.add(ring, arrow);
  }
  function objective(text) { hud.setObjective(text); }
  function progress() {
    list.forEach((job, index) => { job.locked = index > 0 && !list[index - 1].completed; });
  }
  function spawnGuards(points, required = false) {
    const guards = points.map(([x, z]) => combat.spawnEnemy(x, z, { kind: 'dockworker', color: 0xe7924e }));
    if (required) state.guards = guards;
  }
  function complete() {
    const job = state.active;
    if (!job) return;
    const time = Math.round(state.elapsed * 10) / 10;
    job.completed = true;
    const prior = state.bestTimes[job.id];
    state.bestTimes[job.id] = prior == null ? time : Math.min(prior, time);
    job.best = state.bestTimes[job.id];
    progress();
    state.events.push({ type: 'complete', id: job.id, title: job.title, reward: job.reward, time });
    state.active = null;
    state.stage = '';
    police.state.forcedDecay = false;
    clearDialogue();
    setTarget(null);
    objective('The coast is opening up. Find your next job on the map.');
  }
  function fail(reason = 'The job fell through.') {
    if (!state.active) return false;
    const id = state.active.id;
    state.active = null;
    state.stage = '';
    police.state.forcedDecay = false;
    clearDialogue();
    setTarget(null);
    objective('A new start is one street away. Return to a job beacon.');
    state.events.push({ type: 'fail', id, reason });
    return true;
  }
  function start(id) {
    if (state.active) { hud.toast('Finish your current job first.'); return false; }
    const job = list.find(item => item.id === id);
    if (!job || job.locked) { hud.toast('Your next contact is not ready yet.'); return false; }
    clearDialogue();
    state.active = job;
    state.elapsed = 0;
    state.checkpoint = 0;
    state.guards = [];
    hud.toast(`${job.title} — ${job.story}`);
    dialogue(job.contact, job.story);
    if (id === 'first-fare') {
      state.stage = 'pickup';
      objective('FIRST FARE · Get a car. Pick up the client at Hotel Azure.');
      setTarget(80, 152);
      dialogue('MARA', 'Hotel Azure. Pier 9. Keep the ride smooth, Jax. Nobody is paying for a headline.');
      dialogue('JAX', 'Last run of jobs, Mara. After that, the coast is mine.');
    } else if (id === 'hot-wheels') {
      state.stage = 'steal';
      state.coupe = vehicles.spawnCar({ x: 148, z: -18, heading: 0, color: 0x22b6ad, parked: true, stolen: false });
      state.coupe.missionCar = true;
      objective('HOT WHEELS · Find the teal coupe. E to take the wheel.');
      setTarget(148, -18, '#68e0cc');
      dialogue('MARA', 'Teal paint. Fast engine. Try not to bring me a teal accordion.');
    } else if (id === 'beach-run') {
      state.stage = 'race';
      setTarget(...GATES[0], '#68e0cc');
      objective('BEACH RUN · 6 coastal gates. 75 seconds. Get moving.');
      dialogue('NICO', 'Follow the gold. The clock does not care how pretty the view is.');
    } else if (id === 'heat') {
      state.stage = 'evade';
      police.setWanted(3);
      police.state.forcedDecay = true;
      setTarget(null);
      objective('HEAT · Lose all three stars. Get clear of every patrol.');
      dialogue('MARA', 'Break their sightline. Keep your distance. Let the city forget your face.');
    } else {
      state.stage = 'collect';
      setTarget(-302, 438, '#68e0cc');
      objective('THE BIG ONE · On foot, collect the crate by the harbor containers.');
      dialogue('MARA', 'The crate has the keys to a very private bank vault. Watch the dock crew.');
    }
    return true;
  }
  function update(dt) {
    state.clock += dt;
    for (const { job, marker, core } of markers) {
      marker.visible = !state.active && !job.locked;
      core.rotation.y = state.clock * .65;
      core.position.y = 3.5 + Math.sin(state.clock * 2) * .35;
    }
    if (!state.active) return;
    state.elapsed += dt;
    state.dialogueTime -= dt;
    if (state.dialogueTime <= 0) {
      state.dialogueCurrent = state.dialogueQueue.shift() || null;
      state.dialogueTime = state.dialogueCurrent?.duration || 0;
      hud.setDialogue(state.dialogueCurrent?.speaker || '', state.dialogueCurrent?.text || '');
    }
    const p = player.state;
    const car = p.inCar;
    const slow = car && Math.abs(car.speed) < 5;
    const near = (x, z, radius = 13) => DIST(p, { x, z }) < radius;
    switch (state.active.id) {
      case 'first-fare':
        if (state.stage === 'pickup' && car && near(80, 152) && slow) {
          state.stage = 'dropoff';
          setTarget(300, 268);
          objective('FIRST FARE · Deliver the client to Pier 9. Slow down at the marker.');
          dialogue('CLIENT', 'Pier 9. I used to come here before this town got expensive.');
          hud.toast('Client aboard. Destination: Pier 9.');
          audio.chime();
        } else if (state.stage === 'dropoff') {
          if (!car) fail('You left the client waiting. Stay in the car during the fare.');
          else if (car.wrecked || car.health <= 0) fail('The client needs a ride, not a wreck.');
          else if (near(300, 268) && slow) complete();
        }
        break;
      case 'hot-wheels':
        if (!state.coupe || state.coupe.health <= 0 || state.coupe.wrecked) { fail('The teal coupe was wrecked.'); break; }
        if (state.stage === 'steal' && car === state.coupe) {
          if (!state.coupe.heatApplied) { police.addWanted(2, 'A very conspicuous coupe'); state.coupe.heatApplied = true; }
          state.stage = 'deliver';
          setTarget(-216, 216);
          objective('HOT WHEELS · Deliver the teal coupe to the west garage. Keep it intact.');
          dialogue('MARA', 'They noticed. Of course they noticed. Just get it to my garage.');
        }
        if (state.stage === 'deliver' && car === state.coupe && near(-216, 216) && slow) complete();
        break;
      case 'beach-run': {
        const remaining = Math.max(0, 75 - state.elapsed);
        objective(`BEACH RUN · Gate ${Math.min(6, state.checkpoint + 1)} / 6 · ${remaining.toFixed(1)} seconds`);
        if (remaining <= 0) { fail('Out of time. The beach keeps its money this run.'); break; }
        const [x, z] = GATES[state.checkpoint];
        if (near(x, z, 16)) {
          state.checkpoint++;
          hud.toast(`Coastal gate ${state.checkpoint} / 6`);
          audio.chime();
          if (state.checkpoint === GATES.length) complete();
          else setTarget(...GATES[state.checkpoint], '#68e0cc');
        }
        break;
      }
      case 'heat':
        if (police.state.wanted === 0) complete();
        break;
      case 'harbor-job':
        if (state.stage === 'collect' && !car && near(-302, 438, 8)) {
          state.stage = 'dockworkers';
          spawnGuards([[-308, 451], [-289, 449], [-314, 426]], true);
          objective('THE BIG ONE · Defeat the three dockworkers. F punch · Click pistol.');
          setTarget(-301, 442, '#ff9676');
          dialogue('DOCK FOREMAN', 'That crate belongs to people who do not forgive debts, Moreno.');
          hud.toast('Crate collected. The dock crew wants it back.');
        } else if (state.stage === 'dockworkers') {
          const alive = state.guards.filter(guard => guard.alive !== false && guard.health > 0).length;
          objective(`THE BIG ONE · Clear the dock crew · ${3 - alive} / 3`);
          if (!alive) {
            state.stage = 'bank';
            setTarget(288, -288);
            objective('THE BIG ONE · Get a car. Take the crate to the bank.');
            dialogue('MARA', 'Good. Now the bank on the southeast corner. Then come straight home.');
            spawnGuards([[274, -274], [302, -273]]);
          }
        } else if (state.stage === 'bank' && car && near(288, -288, 16) && slow) {
          state.stage = 'bank-getaway';
          police.setWanted(Math.max(3, police.state.wanted));
          police.state.forcedDecay = true;
          spawnGuards([[-203, 226], [-229, 226]]);
          setTarget(-216, 216);
          objective('THE BIG ONE · The money is aboard. Escape to the west garage.');
          dialogue('JAX', 'The coast is looking a little closer, Mara. Opening the throttle.');
          hud.toast('Bank cleared. Reach the garage, then lose the heat.');
        } else if (state.stage === 'bank-getaway' && car && near(-216, 216, 17)) {
          state.stage = 'bank-evade';
          objective('THE BIG ONE · Garage reached. Lose every wanted star to finish.');
          dialogue('MARA', 'The garage is safe. Make sure nobody followed you here.');
        }
        if (state.active && state.stage === 'bank-evade' && police.state.wanted === 0) complete();
        break;
    }
  }
  function reset() {
    state.active = null;
    state.stage = '';
    state.elapsed = 0;
    state.events.length = 0;
    state.coupe = null;
    state.guards = [];
    state.bestTimes = {};
    list.forEach((job, i) => { job.completed = false; job.locked = i > 0; job.best = null; });
    clearDialogue();
    setTarget(null);
    police.state.forcedDecay = false;
  }
  function setProgress(completed = [], bestTimes = {}) {
    state.bestTimes = { ...bestTimes };
    list.forEach(job => { job.completed = completed.includes(job.id); job.best = bestTimes[job.id] ?? null; });
    progress();
  }
  function nearestStart() { return list.find(job => !job.locked && DIST(player.state, job) < 7); }
  function interact() {
    if (state.active) return false;
    const job = nearestStart();
    return job ? start(job.id) : false;
  }
  function getHint() {
    if (state.active) return '';
    const job = nearestStart();
    return job ? `E — start ${job.title}` : '';
  }
  return {
    list, state, group, start, update, fail, reset, setProgress, interact, getHint,
    takeEvents() { return state.events.splice(0); },
    get active() { return state.active; }, get current() { return state.active; },
    get beacons() { return state.active ? beaconList : list.filter(job => !job.locked && !job.completed).map(job => ({ x: job.x, z: job.z, color: '#ffd271' })); },
    get bestTimes() { return { ...state.bestTimes }; },
  };
}
