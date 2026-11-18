// Five story jobs for Jax Moreno in Solmar. Missions use the city's seeded world, the shared HUD,
// vehicle, police and combat systems, and emit completion events for main.js to award and save.
import * as THREE from '../vendor/three.module.min.js';
import { MISSIONS, PALETTE, POLICE, REGIONS } from './config.js';

const BEACON_COLORS = { available: 0xffc857, active: 0xffc857 };
const FIRST_PICKUP = { x: 80, z: 152, name: 'Hotel Azure' };
const FIRST_DROPOFF = { x: 300, z: 268, name: 'Pier 9' };
const GARAGE = { x: -216, z: 216, name: 'Moreno Garage' };
const BANK = { x: 288, z: -288, name: 'Solmar Bank' };
const COURIER_SECONDS = MISSIONS.beachRunTime;
const PURSUIT_SECONDS = MISSIONS.failTime;

function makeBeacon(color) {
  const group = new THREE.Group();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.4, 2.1, 42, 14, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }),
  );
  beam.position.y = 21;
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(2.6, 0.14, 6, 26),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.4;
  const gem = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.7, 0),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 }),
  );
  gem.position.y = 3.2;
  group.add(beam, ring, gem);
  group.userData = { beam, ring, gem };
  group.visible = false;
  return group;
}

// Keep these IDs stable: main.js saves them and shots.js starts `first-fare` directly.
const STORY = [
  {
    id: 'first-fare',
    title: 'First Wheels',
    briefing: 'Get in a car and drive to Hotel Azure.',
    start: { x: 0, z: REGIONS.firstPickup.z, name: 'South Shore' },
    reward: MISSIONS.rewards['first-fare'],
    lines: [
      { who: 'Mara', text: 'First lesson, Jax: get behind the wheel, pick up our client at Hotel Azure, then take them to Pier 9.' },
      { who: 'Jax', text: 'Easy ride. I’ll bring the Sunset back in one piece.' },
    ],
  },
  {
    id: 'hot-wheels',
    title: 'Courier Run',
    briefing: `Deliver Mara’s package to Hotel Azure within ${COURIER_SECONDS} seconds.`,
    start: { x: -216, z: 216, name: 'Moreno Garage' },
    reward: MISSIONS.rewards['hot-wheels'],
    lines: [
      { who: 'Mara', text: 'A client is waiting at Hotel Azure. This package has to reach them before the next ferry leaves.' },
      { who: 'Jax', text: 'Then I’m taking the fast way down the coast.' },
    ],
  },
  {
    id: 'beach-run',
    title: 'The Pickup',
    briefing: 'Steal the teal coupe from Showroom Row and bring it to Moreno Garage.',
    start: { x: 148, z: -18, name: 'Showroom Row' },
    reward: MISSIONS.rewards['beach-run'],
    lines: [
      { who: 'Mara', text: 'There’s a teal coupe on Showroom Row with its keys still inside. Take it to the garage.' },
      { who: 'Jax', text: 'A clean lift and a clean getaway. Got it.' },
    ],
  },
  {
    id: 'heat',
    title: 'Heat',
    briefing: `Lose the SMPD’s three-star pursuit within ${PURSUIT_SECONDS} seconds.`,
    start: { x: 144, z: 72, name: 'Downtown' },
    reward: MISSIONS.rewards.heat,
    lines: [
      { who: 'Mara', text: 'The showroom job put three stars on you. Break their line of sight and lose the tail.' },
      { who: 'Jax', text: 'I know every back street between here and the water.' },
    ],
  },
  {
    id: 'harbor-job',
    title: 'The Big One',
    briefing: 'Reach Solmar Bank, take the score to Moreno Garage, then lose the three-star tail.',
    start: { x: -216, z: 216, name: 'Moreno Garage' },
    reward: MISSIONS.rewards['harbor-job'],
    lines: [
      { who: 'Mara', text: 'The Solmar Bank vault opens at noon. We take the cash, get back to the garage, and disappear.' },
      { who: 'Jax', text: 'One last run. No loose ends.' },
      { who: 'Mara', text: 'Bring the money home and shake the three-star tail. Then we’re done.' },
    ],
  },
];

export function createMissions(ctx) {
  const { scene, city, player, vehicles, police, hud, audio, combat } = ctx;
  const list = STORY.map((definition, index) => ({
    ...definition,
    index,
    completed: false,
    active: false,
    marker: null,
    best: null,
    locked: index > 0,
  }));
  const availableBeacons = new Map();
  for (const mission of list) {
    const beacon = makeBeacon(BEACON_COLORS.available);
    beacon.position.set(mission.start.x, 0.1, mission.start.z);
    scene.add(beacon);
    availableBeacons.set(mission.id, beacon);
  }
  const objectiveBeacon = makeBeacon(BEACON_COLORS.active);
  scene.add(objectiveBeacon);

  const state = {
    active: null,
    completed: new Set(),
    marker: null,
    timer: 0,
    elapsed: 0,
    stage: '',
    dialogueQueue: [],
    dialogueTimer: 0,
    dialogueCurrent: null,
    events: [],
    car: null,
    hudTimer: 0,
    bestTimes: {},
    failReason: '',
  };

  function completedCount() {
    return list.filter((mission) => mission.completed).length;
  }

  function refreshUnlocks() {
    const count = completedCount();
    for (let index = 0; index < list.length; index += 1) list[index].locked = index > count;
  }

  function emit(event) {
    state.events.push(event);
    return event;
  }

  function takeEvents() {
    const taken = state.events;
    state.events = [];
    return taken;
  }

  function setObjective(text) {
    hud?.setObjective(text);
  }

  function say(who, text, seconds = 4.2) {
    state.dialogueQueue.push({ who, text, seconds });
    if (!state.dialogueCurrent) advanceDialogue();
  }

  function advanceDialogue() {
    state.dialogueCurrent = state.dialogueQueue.shift() ?? null;
    if (!state.dialogueCurrent) {
      hud?.setDialogue('', '');
      return;
    }
    hud?.setDialogue(state.dialogueCurrent.who, state.dialogueCurrent.text);
    state.dialogueTimer = state.dialogueCurrent.seconds;
  }

  function setMarker(position, label) {
    state.marker = position ? { x: position.x, z: position.z, label } : null;
    objectiveBeacon.visible = Boolean(position);
    if (position) objectiveBeacon.position.set(position.x, 0.1, position.z);
  }

  function setAvailableMarkers() {
    refreshUnlocks();
    for (const mission of list) {
      const available = !mission.completed && !mission.locked && state.active === null;
      mission.marker = available ? mission.start : null;
      const beacon = availableBeacons.get(mission.id);
      if (beacon) {
        beacon.visible = available;
        beacon.userData.beam.visible = beacon.visible;
      }
    }
  }

  function removeMissionCar() {
    if (!state.car) return;
    const missionCar = state.car;
    if (player.state.inCar === missionCar) {
      const heading = missionCar.state.heading;
      const offsetX = Math.cos(heading) * 1.9;
      const offsetZ = -Math.sin(heading) * 1.9;
      player.exitCar({ x: missionCar.state.x - offsetX, z: missionCar.state.z - offsetZ }, heading);
    }
    const index = vehicles.cars.indexOf(missionCar);
    if (index >= 0) vehicles.cars.splice(index, 1);
    scene.remove(missionCar.group);
    state.car = null;
  }

  function resetMissionActors() {
    combat?.clearEnemies?.();
    removeMissionCar();
  }

  function start(id) {
    if (state.active) return false;
    const mission = list.find((item) => item.id === id);
    if (!mission || mission.completed || mission.locked) return false;
    resetMissionActors();
    state.active = mission;
    mission.active = true;
    state.completed = new Set(list.filter((item) => item.completed).map((item) => item.id));
    state.stage = '';
    state.timer = 0;
    state.elapsed = 0;
    state.hudTimer = 0;
    state.failReason = '';
    state.dialogueQueue.length = 0;
    state.dialogueCurrent = null;
    setAvailableMarkers();
    for (const line of mission.lines) say(line.who, line.text);
    audio?.startMusic?.();
    hud?.toast(`Mission: ${mission.title}`, 'mission', 3);
    if (mission.id === 'first-fare') beginFirstWheels();
    else if (mission.id === 'hot-wheels') beginCourierRun();
    else if (mission.id === 'beach-run') beginPickup();
    else if (mission.id === 'heat') beginHeat();
    else if (mission.id === 'harbor-job') beginBigOne();
    return true;
  }

  function beginFirstWheels() {
    state.stage = 'client-pickup';
    setMarker(REGIONS.firstPickup, REGIONS.firstPickup.name);
    setObjective('Get in a car and collect the client at Hotel Azure’s south approach.');
  }

  function beginCourierRun() {
    state.stage = 'delivery';
    state.timer = COURIER_SECONDS;
    setMarker(FIRST_PICKUP, FIRST_PICKUP.name);
    setObjective(`Deliver Mara’s package to Hotel Azure — ${Math.ceil(state.timer)}s.`);
  }

  function beginPickup() {
    state.stage = 'steal-car';
    const target = city.landmarks?.coupe ?? { x: 148, z: -18 };
    const spec = { body: 0x2f7f75, cabin: 0x203037, name: 'Teal coupe', variant: 'coupe' };
    state.car = vehicles.addCar(spec, { x: target.x, z: target.z }, Math.PI / 2, { id: 'mission-coupe', kind: 'mission' });
    // main.js applies the normal theft response only to cars not already marked stolen.
    // Apply that response once the player takes this car in updatePickup instead.
    state.car.state.stolen = true;
    setMarker(target, 'Teal coupe');
    setObjective('Steal the teal coupe from Showroom Row.');
  }

  function beginHeat() {
    state.stage = 'evade';
    state.timer = PURSUIT_SECONDS;
    police.setWanted(3);
    police.state.forcedDecay = true;
    setMarker(null, '');
    setObjective(`Lose the three-star tail — ${Math.ceil(state.timer)}s.`);
  }

  function beginBigOne() {
    state.stage = 'bank';
    spawnDockworkers(BANK);
    setMarker(BANK, BANK.name);
    setObjective('Reach Solmar Bank to take the score.');
  }

  function spawnDockworkers(point) {
    for (const side of [-1, 1]) {
      combat?.spawnEnemy?.(point.x + side * 5, point.z + side * 14, {
        mission: 'harbor-job', name: 'dockworker',
      });
    }
  }

  function complete() {
    const mission = state.active;
    if (!mission) return null;
    mission.completed = true;
    mission.active = false;
    mission.best = state.elapsed;
    state.bestTimes[mission.id] = state.elapsed;
    state.completed.add(mission.id);
    state.active = null;
    state.marker = null;
    objectiveBeacon.visible = false;
    police.state.forcedDecay = false;
    if (police.state.wanted > 0) police.clear();
    setObjective('');
    state.dialogueQueue.length = 0;
    state.dialogueCurrent = null;
    state.dialogueTimer = 0;
    hud?.setDialogue('', '');
    const event = emit({
      type: 'complete',
      mission: { id: mission.id, title: mission.title, reward: mission.reward, index: mission.index },
      elapsed: state.elapsed,
      cash: mission.reward,
    });
    state.stage = '';
    if (state.car && state.car === inCar()) {
      state.car.id = 'owned-coupe';
      state.car.kind = 'parked';
      state.car = null;
    } else {
      removeMissionCar();
    }
    combat?.clearEnemies?.();
    setAvailableMarkers();
    return event;
  }

  function fail(reason) {
    if (!state.active) return null;
    const mission = state.active;
    mission.active = false;
    state.failReason = reason;
    state.active = null;
    state.marker = null;
    objectiveBeacon.visible = false;
    police.state.forcedDecay = false;
    if (police.state.wanted > 0) police.clear();
    setObjective('');
    state.dialogueQueue.length = 0;
    state.dialogueCurrent = null;
    state.dialogueTimer = 0;
    hud?.setDialogue('', '');
    resetMissionActors();
    state.stage = '';
    const event = emit({ type: 'fail', mission: { id: mission.id, title: mission.title }, reason });
    setAvailableMarkers();
    return event;
  }

  function inCar() {
    return player.state.inCar ?? null;
  }

  function distanceTo(x, z) {
    const car = inCar();
    const position = car ? car.state : player.state;
    return Math.hypot(position.x - x, position.z - z);
  }

  function carNear(point, radius) {
    const car = inCar();
    return Boolean(car && Math.hypot(car.state.x - point.x, car.state.z - point.z) < radius);
  }

  function updateFirstWheels() {
    const car = inCar();
    if (car?.state.wrecked) return fail('Your car was wrecked before the client reached Pier 9.');
    if (state.stage === 'client-pickup' && carNear(REGIONS.firstPickup, 11) && Math.abs(car.state.speed) < 6) {
      state.stage = 'client-dropoff';
      say('Client', 'Pier 9, please. The sea air will do me good.');
      setMarker(FIRST_DROPOFF, FIRST_DROPOFF.name);
      setObjective('Drive the client to Pier 9 and stop.');
      audio?.chime?.();
    } else if (state.stage === 'client-dropoff') {
      const car = inCar();
      if (!car) fail('You left the client before reaching Pier 9.');
      else if (car.state.wrecked) fail('The client’s car was wrecked.');
      else if (carNear(FIRST_DROPOFF, 12) && Math.abs(car.state.speed) < 5) complete();
    } else if (state.stage === 'client-pickup' && distanceTo(REGIONS.firstPickup.x, REGIONS.firstPickup.z) < 6 && !inCar()) {
      setObjective('Get in a car, then drive to Hotel Azure.');
    }
  }

  function updateCourierRun(dt) {
    state.timer -= dt;
    if (state.timer <= 0) return fail('The delivery window closed.');
    if (carNear(FIRST_PICKUP, 10) && Math.abs(inCar().state.speed) < 6) {
      complete();
      return;
    }
    state.hudTimer += dt;
    if (state.hudTimer >= 0.5) {
      state.hudTimer = 0;
      setObjective(`Deliver Mara’s package to Hotel Azure — ${Math.ceil(state.timer)}s.`);
    }
  }

  function updatePickup() {
    if (state.stage === 'steal-car') {
      if (!state.car || state.car.state.wrecked) return fail('The teal coupe was wrecked before you could take it.');
      if (state.car === inCar()) {
        state.stage = 'deliver-car';
        police.addWanted(POLICE.steal, 'Car theft');
        say('Mara', 'You have the coupe. Bring it to the garage in one piece.');
        setMarker(GARAGE, GARAGE.name);
        setObjective('Drive the stolen teal coupe to Moreno Garage.');
        audio?.chime?.();
      }
    } else if (state.stage === 'deliver-car') {
      if (!state.car || state.car.state.wrecked) return fail('The stolen coupe was wrecked.');
      if (state.car === inCar() && carNear(GARAGE, 11) && Math.abs(state.car.state.speed) < 5) complete();
    }
  }

  function updateHeat(dt) {
    state.timer -= dt;
    if (police.state.wanted === 0) {
      police.state.forcedDecay = false;
      complete();
      return;
    }
    if (state.timer <= 0) return fail('The SMPD kept the three-star lock on you.');
    state.hudTimer += dt;
    if (state.hudTimer >= 0.5) {
      state.hudTimer = 0;
      setObjective(`Lose the three-star tail — ${Math.ceil(state.timer)}s.`);
    }
  }

  function updateBigOne(dt) {
    if (state.stage === 'bank' && distanceTo(BANK.x, BANK.z) < 10) {
      state.stage = 'bank-getaway';
      state.timer = PURSUIT_SECONDS;
      spawnDockworkers(GARAGE);
      police.setWanted(3);
      police.state.forcedDecay = true;
      say('Mara', 'The score is ours. Get it to the garage, then lose the tail.');
      setMarker(GARAGE, GARAGE.name);
      setObjective('Get the score to Moreno Garage. Lose the three-star tail after.');
      audio?.siren?.();
    } else if (state.stage === 'bank-getaway' || state.stage === 'bank-evade') {
      state.timer -= dt;
      if (state.timer <= 0) return fail('The bank getaway ran out of time.');
      if (state.stage === 'bank-getaway') {
        const car = inCar();
        if (car && carNear(GARAGE, 12) && Math.abs(car.state.speed) < 5) {
          state.stage = 'bank-evade';
          setMarker(null, '');
          setObjective('Lose the three-star tail to finish the job.');
          return;
        }
        state.hudTimer += dt;
        if (state.hudTimer >= 0.5) {
          state.hudTimer = 0;
          setObjective(`Get the score to Moreno Garage — ${Math.ceil(state.timer)}s.`);
        }
      } else {
        state.hudTimer += dt;
        if (state.hudTimer >= 0.5) {
          state.hudTimer = 0;
          setObjective(`Lose the three-star tail — ${Math.ceil(state.timer)}s.`);
        }
      }
      if (state.stage === 'bank-evade' && police.state.wanted === 0) {
        police.state.forcedDecay = false;
        complete();
      }
    }
  }

  function update(dt) {
    if (state.active) {
      state.elapsed += dt;
      const mission = state.active;
      if (mission.id === 'first-fare') updateFirstWheels(dt);
      else if (mission.id === 'hot-wheels') updateCourierRun(dt);
      else if (mission.id === 'beach-run') updatePickup(dt);
      else if (mission.id === 'heat') updateHeat(dt);
      else if (mission.id === 'harbor-job') updateBigOne(dt);
      if (state.active && !player.state.alive) fail('Jax went down.');
    }

    if (state.dialogueCurrent) {
      state.dialogueTimer -= dt;
      if (state.dialogueTimer <= 0) advanceDialogue();
    }

    const time = performance.now() * 0.001;
    for (const mission of list) {
      const beacon = availableBeacons.get(mission.id);
      if (!beacon?.visible) continue;
      beacon.userData.ring.rotation.z = time * 0.6;
      beacon.userData.gem.rotation.y = time * 1.4;
      beacon.userData.gem.position.y = 3.2 + Math.sin(time * 2 + mission.index) * 0.3;
      beacon.userData.beam.material.opacity = 0.1 + Math.sin(time * 1.7 + mission.index) * 0.05;
    }
    if (objectiveBeacon.visible) {
      const pulse = 1 + Math.sin(time * 3) * 0.08;
      objectiveBeacon.userData.ring.scale.setScalar(pulse);
      objectiveBeacon.userData.gem.rotation.y = time * 1.8;
      objectiveBeacon.userData.gem.position.y = 3.2 + Math.sin(time * 2.4) * 0.25;
      objectiveBeacon.userData.ring.rotation.z = time * 0.8;
    }
    for (let index = state.events.length - 1; index >= 0; index -= 1) {
      const event = state.events[index];
      if (event.type !== 'fail') continue;
      state.events.splice(index, 1);
      hud?.toast(`Mission failed: ${event.reason}`, 'danger', 4.5);
    }
  }

  function nearestStart(x, z) {
    if (state.active) return null;
    let best = null;
    let bestDistance = 4.2;
    for (const mission of list) {
      if (mission.completed || mission.locked) continue;
      const distance = Math.hypot(mission.start.x - x, mission.start.z - z);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = mission;
      }
    }
    return best;
  }

  function reset() {
    if (state.active) state.active.active = false;
    resetMissionActors();
    state.active = null;
    state.marker = null;
    state.stage = '';
    state.timer = 0;
    state.elapsed = 0;
    state.hudTimer = 0;
    for (const id of Object.keys(state.bestTimes)) delete state.bestTimes[id];
    state.dialogueQueue.length = 0;
    state.dialogueCurrent = null;
    state.events.length = 0;
    police.state.forcedDecay = false;
    objectiveBeacon.visible = false;
    setObjective('');
    hud?.setDialogue('', '');
    setAvailableMarkers();
  }

  function setProgress(completedIds) {
    const completed = new Set(Array.isArray(completedIds) ? completedIds : []);
    for (const mission of list) {
      mission.completed = completed.has(mission.id);
      mission.active = false;
    }
    refreshUnlocks();
    setAvailableMarkers();
  }

  function getBlips() {
    const blips = [];
    if (state.active) {
      if (state.marker) blips.push({ x: state.marker.x, z: state.marker.z, color: PALETTE.css.gold, size: 30 });
      const car = inCar();
      if (state.stage === 'steal-car' && state.car) blips.push({ x: state.car.state.x, z: state.car.state.z, color: PALETTE.css.teal, size: 24 });
      if (car) blips.push({ x: car.state.x, z: car.state.z, color: PALETTE.css.teal, size: 18 });
    } else {
      for (const mission of list) {
        if (mission.completed || mission.locked) continue;
        blips.push({ x: mission.start.x, z: mission.start.z, color: PALETTE.css.teal, size: 24 });
      }
    }
    return blips;
  }

  setAvailableMarkers();
  return {
    list,
    state,
    start,
    complete,
    fail,
    update,
    reset,
    setProgress,
    nearestStart,
    takeEvents,
    getBlips,
    completedCount,
    get active() {
      return state.active;
    },
    get current() {
      return state.active;
    },
    get completedIds() {
      return list.filter((mission) => mission.completed).map((mission) => mission.id);
    },
    get bestTimes() {
      return state.bestTimes;
    },
  };
}
