// SOLMAR boot, system adapters and fixed-step simulation. All assets and imports are local.
// ?seed=N selects the city; ?shot=start|play|end stages a frozen, reproducible scene.
import * as THREE from '../vendor/three.module.min.js';
import {
  CAMERA, MAX_FRAME, MISSIONS, PLAYER, POLICE, SAVE_VERSION, SPAWN, STARTER_CAR, STEP, VEHICLE,
} from './config.js';
import { createRandom, parseSeed } from './random.js';
import { clampToWorld, createCity, resolveCollisions } from './world.js';
import { createPlayer } from './player.js';
import { createVehicles, exitSpot } from './vehicles.js';
import { createTraffic } from './traffic.js';
import { createPolice } from './police.js';
import { createCombat } from './combat.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import { createMissions } from './missions.js';
import { ASSETS, createAssets } from './assets.js';
import { RESTAURANTS, createRestaurants } from './restaurants.js';
import { SAFEHOUSES, createSafehouses } from './safehouses.js';
import { createRenderer } from './render.js';
import { readSave, writeSave } from './save.js';
import {
  ACTION_CONFIRM, ACTION_ENTER, ACTION_FIRE, ACTION_MENU, ACTION_MUTE,
  ACTION_PAUSE, ACTION_PUNCH, ACTION_RESTART, createInput,
} from './input.js';
import { stageShot } from './shots.js';

const DOM_IDS = [
  'game', 'status', 'title-screen', 'btn-start', 'btn-walk', 'btn-jobs', 'btn-continue',
  'btn-continue-story', 'pause-screen', 'busted-screen', 'busted-fine', 'game-over-screen',
  'btn-restart', 'complete-screen', 'complete-title', 'complete-cash', 'complete-extra',
  'complete-time', 'btn-resume', 'btn-restart-pause',
  // Keep this inventory aligned with hud.js; every element is optional.
  'hud', 'health-fill', 'health-text', 'cash-value', 'income-value', 'wanted-stars', 'speed-value',
  'speed-box', 'objective-text', 'objective-box', 'toasts', 'minimap', 'mission-list',
  'dialogue', 'dialogue-text', 'subtitle', 'hint', 'place-menu', 'place-menu-title',
  'place-menu-subtitle', 'place-menu-rows', 'place-menu-close',
];
const SCREEN_ALIASES = { title: 'menu', 'game-over': 'gameover' };
const OVERLAYS = {
  menu: 'title-screen', paused: 'pause-screen', busted: 'busted-screen',
  gameover: 'game-over-screen', 'mission-complete': 'complete-screen',
};
const MAX_STEPS = 8;
const clamp = THREE.MathUtils.clamp;

function element(id) {
  return typeof document === 'undefined' ? null : document.getElementById(id);
}

function makeGame(seedValue, shotName = null) {
  const nodes = Object.fromEntries(DOM_IDS.map((id) => [id, element(id)]));
  let canvas = nodes.game;
  if (!canvas || typeof canvas.getContext !== 'function') {
    canvas = document.createElement('canvas');
    canvas.id = nodes.game ? 'solmar-canvas' : 'game';
    document.body?.prepend(canvas);
  }
  const random = createRandom(seedValue);
  const renderer = createRenderer(canvas);
  const city = createCity(random, [...ASSETS, ...RESTAURANTS, ...SAFEHOUSES]);
  renderer.scene.add(city.group);
  const player = createPlayer(city);
  renderer.scene.add(player.group);
  const vehicles = createVehicles(city, renderer.scene);
  vehicles.spawnStarter();
  vehicles.spawnParked(random);
  const parked = vehicles.cars.map((car) => ({ car, ...car.state }));
  const traffic = createTraffic(city, renderer.scene, createRandom(seedValue ^ 0x51a7));
  const police = createPolice(city, renderer.scene, vehicles);
  vehicles.collisionGroups.push(traffic.cars, police.state.copCars);
  const combatCity = {
    ...city,
    peds: traffic.peds,
    cops: police.state.cops,
    knockPed: traffic.knockPed,
    resolvePlayerCollision: (x, z, radius) => resolveCollisions(city.colliders, x, z, radius),
  };
  const combat = createCombat(renderer.scene, () => player, () => combatCity);
  const audio = createAudio();
  const hud = createHud();
  const missions = createMissions({
    scene: renderer.scene, city, player, vehicles, police, combat, hud,
    // missions.js asks for a one-shot siren cue; audio.js exposes a wanted-level updater.
    audio: { ...audio, siren: () => audio.updateSiren(police.state.wanted) },
  });
  const assets = createAssets({
    scene: renderer.scene, hud, onToast: hud.toast,
    onIncome(amount) {
      state.cash += amount;
      hud.setCash(state.cash);
      hud.setIncome(assets.ownedIncomePerMin(), assets.state.owned.size);
    },
  });
  const restaurants = createRestaurants({ scene: renderer.scene, player, hud });
  const safehouses = createSafehouses({
    scene: renderer.scene, player, hud,
    isMissionComplete: (id) => state.completed.includes(id),
    onSave: () => saveNow(),
    onSetRespawn: (place) => { state.respawn = { x: place.x, z: place.z }; },
  });
  const orbit = player.orbit;
  const input = createInput(canvas);
  const clock = { accumulator: 0, last: null };
  const state = {
    screen: 'menu', cash: MISSIONS.startCash, completed: [], missionBest: {},
    muted: Boolean(readSave()?.muted), started: false, elapsed: 0, lastSave: 0,
    pauseReason: '', bustedFine: 0, finalMission: null, pedHitCooldown: 0,
    shotsFired: 0, shot: shotName, respawn: { x: SPAWN.x, z: SPAWN.z },
  };
  let shotMode = Boolean(shotName);
  let frameId = null;
  let shotFrameId = null;
  let booted = false;
  let shotGeneration = 0;

  function announce(message) {
    if (nodes.status) nodes.status.textContent = message;
  }

  function resetClock() {
    clock.last = null;
    clock.accumulator = 0;
  }

  function clearInput() {
    input.clearHeld();
    input.takeActions();
    input.takeOrbit();
    input.takeWheel();
  }

  function syncRider() {
    const car = player.state.inCar;
    if (!car) return;
    player.state.x = car.state.x;
    player.state.z = car.state.z;
    player.state.y = 0;
    player.state.heading = car.state.heading;
    player.state.speed = Math.abs(car.state.speed);
    player.syncMesh();
  }

  // player.step deliberately does nothing in a car. Keep its position current for every
  // consumer, including missions/police and shots.js, which call vehicle methods directly.
  const enterCar = player.enterCar;
  player.enterCar = (car) => {
    if (!car || car.state.wrecked) return false;
    if (player.state.inCar && player.state.inCar !== car) leaveCar();
    enterCar(car);
    syncRider();
    return true;
  };
  const stepCar = vehicles.stepCar;
  vehicles.stepCar = (car, dt, controls, colliders) => {
    stepCar(car, dt, controls, colliders);
    if (player.state.inCar === car) syncRider();
  };
  const setCarPosition = vehicles.setCarPosition;
  vehicles.setCarPosition = (car, x, z, heading) => {
    setCarPosition(car, x, z, heading);
    if (player.state.inCar === car) syncRider();
  };

  function setScreen(name) {
    const screen = SCREEN_ALIASES[name] || name;
    if (screen !== 'playing' && !Object.hasOwn(OVERLAYS, screen)) return false;
    state.screen = screen;
    clearInput();
    resetClock();
    for (const [key, id] of Object.entries(OVERLAYS)) {
      const node = nodes[id];
      if (!node) continue;
      node.classList.toggle('visible', key === screen);
      node.hidden = key !== screen;
      node.setAttribute('aria-hidden', String(key !== screen));
    }
    if (document.body) {
      document.body.dataset.screen = screen;
      document.body.classList.toggle('in-menu', screen !== 'playing');
    }
    hud.setVisible(screen !== 'menu');
    hud.hideMissionList();
    hud.hidePlaceMenu();
    if (screen === 'playing') audio.startMusic();
    else {
      audio.stopMusic();
      audio.updateEngine(0, false, false);
      audio.updateSiren(0);
    }
    return true;
  }

  function refreshHud() {
    syncRider();
    hud.setHealth(player.state.health, player.state.maxHealth);
    hud.setCash(state.cash);
    hud.setIncome(assets.ownedIncomePerMin(), assets.state.owned.size);
    hud.setWanted(police.state.wanted);
    hud.setSpeed(player.state.inCar?.state.speed ?? 0, Boolean(player.state.inCar));
    const blips = [...missions.getBlips(), ...assets.getBlips(), ...restaurants.getBlips(), ...safehouses.getBlips()];
    for (const car of police.state.copCars) blips.push({ ...car.state, color: '#ff6b57', size: 22 });
    for (const cop of police.state.cops) blips.push({ x: cop.x, z: cop.z, color: '#ff9a72', size: 18 });
    // Mission markers are already included by getBlips(), so do not draw a second copy.
    hud.drawMinimap(player, police.state.wanted, null, blips, orbit.yaw);
  }

  function leaveCar() {
    const car = player.state.inCar;
    if (!car) return;
    const spot = exitSpot(car);
    const resolved = resolveCollisions(city.colliders, spot.x, spot.z, PLAYER.radius);
    player.exitCar(clampToWorld(resolved), car.state.heading);
    car.state.speed = 0;
    player.state.speed = 0;
    player.state.vy = 0;
    player.state.grounded = true;
  }

  function cleanPoliceCars() {
    const active = new Set(police.state.copCars);
    for (let index = vehicles.cars.length - 1; index >= 0; index -= 1) {
      const car = vehicles.cars[index];
      if (car.kind !== 'police' || active.has(car) || player.state.inCar === car) continue;
      renderer.scene.remove(car.group);
      vehicles.cars.splice(index, 1);
    }
  }

  function saveNow() {
    if (!state.started || shotMode) return false;
    return writeSave({
      cash: state.cash, missions: missions.completedIds, best: { ...state.missionBest },
      muted: state.muted, seed: seedValue, version: SAVE_VERSION,
      assets: assets.serialize(),
      mealsEaten: restaurants.state.mealsEaten,
      safehouses: safehouses.serialize(),
    });
  }

  function startRun(continueSave = false) {
    const save = continueSave ? readSave() : null;
    leaveCar();
    missions.reset();
    police.clear();
    combat.reset();
    // Restore the original fleet instead of retaining mission/cruiser objects from an old run.
    for (const car of [...vehicles.cars]) {
      if (parked.some((entry) => entry.car === car)) continue;
      renderer.scene.remove(car.group);
      vehicles.cars.splice(vehicles.cars.indexOf(car), 1);
    }
    for (const entry of parked) {
      const { car, x, z, heading, stolen } = entry;
      if (!vehicles.cars.includes(car)) vehicles.cars.push(car);
      renderer.scene.add(car.group);
      vehicles.repair(car);
      Object.assign(car.state, { speed: 0, steerAngle: 0, wheelSpin: 0, occupied: false, stolen });
      vehicles.setCarPosition(car, x, z, heading);
    }
    player.reset();
    Object.assign(player.state, { ...SPAWN, invuln: PLAYER.respawnInvuln });
    player.syncMesh();
    traffic.reset();
    traffic.spawnAll(player.state.x, player.state.z);
    state.cash = save && Number.isFinite(save.cash) ? clamp(save.cash, 0, 1e9) : MISSIONS.startCash;
    state.completed = missions.list.filter((mission) => save?.missions?.includes(mission.id)).map((mission) => mission.id);
    state.missionBest = {};
    for (const mission of missions.list) {
      const best = save?.best?.[mission.id];
      if (Number.isFinite(best) && best >= 0) state.missionBest[mission.id] = best;
      mission.best = state.missionBest[mission.id] ?? null;
    }
    // Restore progress containers explicitly, including best times from a continued save.
    missions.takeEvents();
    missions.state.completed = new Set(state.completed);
    missions.state.bestTimes = { ...state.missionBest };
    missions.setProgress(state.completed);
    assets.restore(save?.assets);
    restaurants.state.mealsEaten = save?.mealsEaten || 0;
    state.respawn = { x: SPAWN.x, z: SPAWN.z };
    safehouses.restore(save?.safehouses);
    if (save) state.muted = Boolean(save.muted);
    Object.assign(state, {
      started: true, elapsed: 0, lastSave: 0, finalMission: null, bustedFine: 0,
      pedHitCooldown: 0, shotsFired: 0, pauseReason: '',
    });
    Object.assign(orbit, { yaw: SPAWN.heading, pitch: CAMERA.pitch, distance: CAMERA.distance });
    audio.setMuted(state.muted);
    if (!shotMode) audio.unlock();
    setScreen('playing');
    hud.setDialogue('', '');
    hud.setHint('');
    hud.setObjective('Explore Solmar. Find a gold beacon for a job, or press M.');
    hud.toast(save ? 'Welcome back to Solmar.' : 'Solmar. The coast is yours, Jax.', 'mission', 4);
    renderer.updateCamera(1, player, orbit, 0);
    refreshHud();
    announce('Playing SOLMAR. WASD to move, E to use a car or job, M for jobs, P to pause.');
  }

  function restart() {
    if (state.screen === 'gameover') {
      leaveCar();
      police.clear();
      cleanPoliceCars();
      player.reset();
      Object.assign(player.state, { ...state.respawn, invuln: PLAYER.respawnInvuln });
      player.syncMesh();
      missions.takeEvents();
      setScreen('playing');
      hud.setObjective('Back in Solmar. Follow a gold beacon or press M for jobs.');
      refreshHud();
      announce('Recovered. Back in Solmar.');
      return;
    }
    startRun(false);
  }

  function pause(reason = 'Paused') {
    if (state.screen !== 'playing') return;
    state.pauseReason = reason;
    saveNow();
    setScreen('paused');
    announce(`${reason}. Press P or Enter to resume.`);
  }

  function resume() {
    if (state.screen !== 'paused') return;
    setScreen('playing');
    announce('Playing SOLMAR.');
  }

  function completeMission(event) {
    const mission = missions.list.find((item) => item.id === event?.mission?.id);
    if (!mission || state.completed.includes(mission.id)) return false;
    state.completed.push(mission.id);
    state.cash += mission.reward;
    const elapsed = Number.isFinite(event.elapsed) && event.elapsed >= 0 ? event.elapsed : null;
    if (elapsed !== null) {
      state.missionBest[mission.id] = Math.min(state.missionBest[mission.id] ?? Infinity, elapsed);
      missions.state.bestTimes[mission.id] = state.missionBest[mission.id];
    }
    state.finalMission = { ...event, mission, elapsed };
    const values = {
      'complete-title': mission.title,
      'complete-cash': `+$${mission.reward.toLocaleString('en-US')}`,
      'complete-time': elapsed === null ? '—' : `${elapsed.toFixed(1)}s`,
      'complete-extra': `${missions.completedCount()} of ${missions.list.length} jobs complete.`,
    };
    for (const [id, value] of Object.entries(values)) if (nodes[id]) nodes[id].textContent = value;
    // A delivered mission car may have been removed by the mission module.
    if (player.state.inCar && !vehicles.cars.includes(player.state.inCar)) leaveCar();
    cleanPoliceCars();
    setScreen('mission-complete');
    audio.chime();
    refreshHud();
    saveNow();
    announce(`Mission complete: ${mission.title}. Earned $${mission.reward}.`);
    return true;
  }

  function busted() {
    if (state.screen !== 'playing') return;
    state.bustedFine = Math.min(state.cash, Math.round(POLICE.fine * (1 + police.state.wanted * 0.2)));
    state.cash -= state.bustedFine;
    leaveCar();
    missions.fail('Busted.');
    police.clear();
    cleanPoliceCars();
    state.finalMission = null;
    if (nodes['busted-fine']) nodes['busted-fine'].textContent = `$${state.bustedFine.toLocaleString('en-US')}`;
    setScreen('busted');
    refreshHud();
    saveNow();
    announce('Busted. Press Enter to return to your respawn point.');
  }

  function gameOver() {
    if (state.screen !== 'playing') return;
    missions.fail('Jax went down.');
    state.finalMission = null;
    setScreen('gameover');
    refreshHud();
    saveNow();
    announce('Jax went down. Press R or Enter to return to your respawn point.');
  }

  function leaveBusted() {
    if (state.screen !== 'busted') return;
    player.reset();
    Object.assign(player.state, { ...state.respawn, health: 75, invuln: PLAYER.respawnInvuln });
    player.syncMesh();
    const starter = vehicles.cars.find((car) => car.id === 'starter');
    if (starter) {
      vehicles.repair(starter);
      starter.state.speed = 0;
      starter.state.occupied = false;
      vehicles.setCarPosition(starter, STARTER_CAR.x, STARTER_CAR.z, STARTER_CAR.heading);
    }
    missions.takeEvents();
    setScreen('playing');
    hud.setObjective('Back in Solmar. Follow a gold beacon or press M for jobs.');
    refreshHud();
    announce('Released. Back to work.');
  }

  function continueAfterMission() {
    if (state.screen !== 'mission-complete') return;
    state.finalMission = null;
    setScreen('playing');
    const allDone = missions.completedCount() === missions.list.length;
    hud.setObjective(allDone ? 'All jobs complete. The coast is yours to explore.' : 'Next job marked on the map. Press M to pick one.');
    announce(allDone ? 'Story complete. Explore Solmar.' : 'Playing SOLMAR. A new job is available.');
  }

  const missionList = hud.hud?.missionList || nodes['mission-list'];
  function showJobs(toggle = false) {
    if (state.screen !== 'playing' && state.screen !== 'paused') return;
    hud.hidePlaceMenu();
    if (toggle && missionList?.classList.contains('open')) {
      hud.hideMissionList();
      return;
    }
    hud.showMissionList(missions.list, missions.list.findIndex((mission) => mission.active));
    // hud.js creates rows at show time without data attributes. Bind through their container.
    const rows = missionList?.querySelectorAll('.mission-row') ?? [];
    rows.forEach((row, index) => {
      const mission = missions.list[index];
      if (!mission) return;
      row.setAttribute('data-mission', mission.id);
      row.setAttribute('role', 'button');
      row.setAttribute('tabindex', state.screen === 'paused' ? '-1' : '0');
      row.setAttribute('aria-disabled', String(state.screen === 'paused' || mission.locked || mission.completed));
      row.classList.toggle('locked', mission.locked);
    });
    if (!missionList) hud.toast('Find the gold job beacon and press E.', 'info', 3);
  }

  function chooseJob(id) {
    if (state.screen !== 'playing') return false;
    const mission = missions.list.find((item) => item.id === id);
    if (!mission || !missions.start(id)) {
      hud.toast('That job is not available yet.', 'info', 2);
      return false;
    }
    hud.hideMissionList();
    announce(`Job started: ${mission.title}.`);
    return true;
  }

  function showSafehouse(place) {
    clearInput();
    hud.hideMissionList();
    const owned = safehouses.owned(place.id);
    const locked = safehouses.isLocked(place.id);
    const rows = [];
    if (locked) {
      rows.push({ label: 'Locked', sub: 'Complete The Pickup to unlock this safehouse.' });
    } else if (!owned && place.price) {
      rows.push({
        label: `Buy ${place.name}`, sub: `$${place.price.toLocaleString('en-US')}`,
        onClick() {
          const result = safehouses.buy(place.id, state.cash);
          if (!result.ok) { hud.toast(result.reason, 'info', 3); return; }
          state.cash -= result.price;
          hud.toast(`Bought ${place.name}.`, 'mission', 3);
          saveNow();
          refreshHud();
          showSafehouse(place);
        },
      });
    }
    const actions = [
      ['Save game', 'Keep your current progress', () => safehouses.saveGame(place.id)],
      ['Set respawn here', 'Return here after an arrest or knockout', () => safehouses.setActiveRespawn(place.id)],
      ['Rest / heal full', 'Restore your health', () => safehouses.heal(place.id)],
      ['Change outfit', 'Cycle through four jacket colours', () => safehouses.changeOutfit(place.id)],
    ];
    for (const [label, sub, action] of actions) {
      rows.push({
        label, sub: owned ? sub : 'Own this safehouse to use this service',
        onClick: owned ? () => {
          if (state.screen !== 'playing') return;
          const result = action();
          if (!result.ok) hud.toast(result.reason, 'info', 3);
          else { saveNow(); refreshHud(); }
        } : undefined,
      });
    }
    hud.showPlaceMenu({ title: place.name, subtitle: owned ? 'Your safehouse' : locked ? 'Story safehouse' : 'Safehouse for sale', rows });
  }

  function enterOrExit() {
    if (hud.isPlaceMenuOpen()) {
      hud.hidePlaceMenu();
      clearInput();
      return;
    }
    if (player.state.inCar) {
      leaveCar();
      announce('On foot.');
      return;
    }
    const safehouse = safehouses.nearest(player.state.x, player.state.z, 5);
    if (safehouse) {
      showSafehouse(safehouse);
      return;
    }
    const restaurant = restaurants.nearest(player.state.x, player.state.z, 5);
    if (restaurant) {
      clearInput();
      hud.hideMissionList();
      hud.showPlaceMenu({
        title: restaurant.name, subtitle: 'Fresh food · choose a meal',
        rows: restaurants.getMenu(restaurant.id).map((item, index) => ({
          label: item.name, sub: `$${item.price} · +${item.heal} HP`,
          onClick() {
            if (state.screen !== 'playing') return;
            const result = restaurants.eat(restaurant.id, index, state.cash);
            if (result.ok) {
              state.cash -= result.price;
              hud.setCash(state.cash);
              hud.setHealth(player.state.health, player.state.maxHealth);
              saveNow();
            } else hud.toast(result.reason, 'info', 3);
          },
        })),
      });
      return;
    }
    const asset = assets.nearest(player.state.x, player.state.z, 5);
    if (asset) {
      if (assets.state.owned.has(asset.id)) {
        hud.toast(`${asset.name} earns $${asset.income}/min.`, 'info', 3);
      } else {
        const result = assets.buy(asset.id, state.cash);
        if (result.ok) {
          state.cash -= result.price;
          hud.toast(`Bought ${asset.name}. Income $${asset.income}/min.`, 'mission', 3);
          saveNow();
          refreshHud();
        } else hud.toast(result.reason, 'info', 3);
      }
      return;
    }
    const mission = missions.nearestStart(player.state.x, player.state.z);
    if (mission) {
      chooseJob(mission.id);
      return;
    }
    const car = vehicles.nearest(player.state.x, player.state.z, 4.6);
    if (!car || car.state.occupied) {
      hud.toast('Nothing to use here.', 'info', 1.6);
      return;
    }
    const stealing = !car.state.stolen;
    if (!player.enterCar(car)) return;
    if (stealing) {
      car.state.stolen = true;
      // The coupe job raises its own wanted level when it observes the entry.
      if (car !== missions.state.car) police.addWanted(POLICE.steal, 'Vehicle theft');
      hud.toast('Stolen ride. The SMPD noticed.', 'danger', 3);
    }
    orbit.yaw = car.state.heading;
    announce('Driving. Space is the handbrake; E exits.');
  }

  function handleActions(actions) {
    if (actions & ACTION_MUTE) {
      state.muted = audio.toggleMute();
      hud.toast(state.muted ? 'Sound muted' : 'Sound on', 'info', 1.5);
      saveNow();
    }
    if (state.screen === 'menu') {
      if (actions & (ACTION_CONFIRM | ACTION_RESTART)) startRun(false);
      else if (actions & ACTION_MENU) { startRun(false); showJobs(); }
      return;
    }
    if (actions & ACTION_RESTART) { restart(); return; }
    if (state.screen === 'paused') {
      if (actions & (ACTION_CONFIRM | ACTION_PAUSE)) resume();
      else if (actions & ACTION_MENU) showJobs(true);
      return;
    }
    if (state.screen === 'busted') {
      if (actions & (ACTION_CONFIRM | ACTION_ENTER)) leaveBusted();
      return;
    }
    if (state.screen === 'gameover') {
      if (actions & ACTION_CONFIRM) restart();
      return;
    }
    if (state.screen === 'mission-complete') {
      if (actions & (ACTION_CONFIRM | ACTION_ENTER)) continueAfterMission();
      return;
    }
    if (actions & ACTION_PAUSE) { pause(); return; }
    if (actions & ACTION_MENU) showJobs(true);
    if (actions & ACTION_ENTER) enterOrExit();
    if (hud.isPlaceMenuOpen()) return;
    if (actions & ACTION_PUNCH) {
      const hit = combat.punch();
      if (hit) audio.thud();
      if (hit && police.distanceToNearest(player.state.x, player.state.z) < 12) police.addWanted(1, 'Assault');
    }
    if (actions & ACTION_FIRE && combat.shoot()) {
      state.shotsFired += 1;
      audio.gunshot();
      if (police.distanceToNearest(player.state.x, player.state.z) < POLICE.hear) police.addWanted(POLICE.gunNearCop, 'Shots fired');
      hud.toast(`Pistol ammo: ${combat.state.ammo}`, 'info', 1.2);
    }
  }

  function step(dt = STEP) {
    if (state.screen !== 'playing' || !Number.isFinite(dt) || dt <= 0) return;
    dt = Math.min(dt, MAX_FRAME);
    assets.update(dt);
    safehouses.update();
    const controls = hud.isPlaceMenuOpen() ? {} : input.state();
    state.elapsed += dt;
    state.pedHitCooldown = Math.max(0, state.pedHitCooldown - dt);
    if (player.state.inCar) {
      const car = player.state.inCar;
      if (car.state.wrecked) {
        leaveCar();
        hud.toast('The car is wrecked.', 'danger', 2.4);
      } else {
        player.state.invuln = Math.max(0, player.state.invuln - dt);
        vehicles.stepCar(car, dt, {
          accelerate: controls.up, brake: controls.down, left: controls.left,
          right: controls.right, handbrake: controls.jump,
        }, city.colliders);
        const angle = Math.atan2(Math.sin(car.state.heading - orbit.yaw), Math.cos(car.state.heading - orbit.yaw));
        if (!input.isDragging()) orbit.yaw += angle * Math.min(1, dt * 2.4);
        if (state.pedHitCooldown === 0 && Math.abs(car.state.speed) > 3.5) {
          const ped = traffic.nearestPed(car.state.x, car.state.z, 2.8);
          if (ped) {
            traffic.knockPed(ped, car.state.heading);
            state.pedHitCooldown = 1.4;
            police.addWanted(POLICE.pedHit, 'Hit and run');
            audio.thud();
            hud.toast('Hit and run. Wanted level up.', 'danger', 2.6);
          }
        }
      }
    } else {
      const forward = Number(Boolean(controls.up)) - Number(Boolean(controls.down));
      const right = Number(Boolean(controls.right)) - Number(Boolean(controls.left));
      player.step(dt, {
        x: Math.sin(orbit.yaw) * forward - Math.cos(orbit.yaw) * right,
        z: Math.cos(orbit.yaw) * forward + Math.sin(orbit.yaw) * right,
        run: controls.run, jump: controls.jump && player.state.grounded,
      }, city.colliders);
    }
    traffic.update(dt, player, vehicles);
    combat.update(dt, player);
    police.update(dt, player, combat);
    syncRider();
    // Handle arrest before missions.fail() can clear the police's busted flag.
    if (!player.state.alive || player.state.health <= 0) { gameOver(); return; }
    if (police.state.busted) { busted(); return; }
    const active = missions.active;
    missions.update(dt);
    cleanPoliceCars();
    for (const event of missions.takeEvents()) {
      if (event.type === 'complete' && completeMission(event)) return;
      if (event.type === 'fail') {
        hud.toast(`Mission failed: ${event.reason}`, 'danger', 4.5);
        announce(`Mission failed: ${event.reason}`);
      }
    }
    // If a removed mission car was being driven when a mission failed, disembark it safely.
    if (active && !missions.active && player.state.inCar && !vehicles.cars.includes(player.state.inCar)) leaveCar();
    const car = player.state.inCar;
    const job = !car && missions.nearestStart(player.state.x, player.state.z);
    const nearestCar = !car && vehicles.nearest(player.state.x, player.state.z, 4.6);
    const asset = !car && assets.nearest(player.state.x, player.state.z, 5);
    const restaurant = !car && restaurants.nearest(player.state.x, player.state.z, 5);
    const safehouse = !car && safehouses.nearest(player.state.x, player.state.z, 5);
    const placeHint = safehouse ? `E — ${safehouse.name}` : restaurant ? `E — Eat at ${restaurant.name}` : asset ? (assets.state.owned.has(asset.id) ? `E — ${asset.name} ($${asset.income}/min)` : `E — Buy ${asset.name} ($${asset.price.toLocaleString('en-US')})`) : '';
    hud.setHint(placeHint || (car ? 'E — exit car' : job ? `E — start ${job.title}` : nearestCar ? (nearestCar.state.stolen ? 'E — drive' : 'E — use this car') : ''));
    refreshHud();
    if (state.elapsed - state.lastSave >= 15) { saveNow(); state.lastSave = state.elapsed; }
  }

  function frame(now) {
    frameId = requestAnimationFrame(frame);
    handleActions(input.takeActions());
    const delta = clock.last === null ? 0 : clamp((now - clock.last) / 1000, 0, MAX_FRAME);
    clock.last = now;
    if (state.screen === 'playing') {
      const drag = input.takeOrbit();
      orbit.yaw -= drag.x * CAMERA.sensitivity;
      orbit.pitch = clamp(orbit.pitch + drag.y * CAMERA.sensitivity, CAMERA.minPitch, CAMERA.maxPitch);
      orbit.distance = clamp(orbit.distance + input.takeWheel() * 0.9, CAMERA.minDistance, CAMERA.maxDistance);
      clock.accumulator += delta;
      let steps = 0;
      while (state.screen === 'playing' && clock.accumulator >= STEP && steps < MAX_STEPS) {
        clock.accumulator -= STEP;
        step(STEP);
        steps += 1;
      }
      if (steps === MAX_STEPS) clock.accumulator %= STEP;
      renderer.updateCamera(delta, player, orbit, 0);
      const car = player.state.inCar;
      const speed = Math.abs(car?.state.speed ?? 0) / VEHICLE.maxSpeed;
      const playing = state.screen === 'playing';
      audio.updateEngine(speed, Boolean(playing && car && input.state().jump && speed > 0.2), Boolean(playing && car));
      audio.updateSiren(playing ? police.state.wanted : 0);
      if (playing) audio.update(delta);
    } else if (state.screen === 'menu') renderer.frameTitle();
    renderer.render();
  }

  function boot() {
    if (booted) return;
    booted = true;
    audio.setMuted(state.muted);
    setScreen('menu');
    renderer.frameTitle();
    const saved = readSave();
    if (nodes['btn-continue']) {
      nodes['btn-continue'].hidden = !saved;
      nodes['btn-continue'].style.display = saved ? 'inline-flex' : 'none';
      const label = nodes['btn-continue'].querySelector('span');
      if (label && saved) label.textContent = `Continue — $${Math.round(saved.cash).toLocaleString('en-US')}`;
    }
    function bind(id, listener) { nodes[id]?.addEventListener('click', listener); }
    bind('btn-start', () => startRun(false));
    bind('btn-continue', () => state.screen === 'paused' ? resume() : startRun(true));
    bind('btn-walk', () => state.screen === 'busted' ? leaveBusted() : startRun(false));
    bind('btn-jobs', () => { if (state.screen === 'menu') startRun(false); showJobs(); });
    bind('btn-resume', resume);
    bind('btn-restart-pause', restart);
    bind('btn-restart', restart);
    bind('btn-continue-story', continueAfterMission);
    function selectMission(event) {
      const row = event.target?.closest?.('[data-mission]');
      if (!row || !missionList?.contains(row)) return;
      if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      event.stopPropagation();
      clearInput();
      chooseJob(row.getAttribute('data-mission'));
    }
    missionList?.addEventListener('click', selectMission);
    missionList?.addEventListener('keydown', selectMission);
    window.addEventListener('keydown', (event) => {
      if (state.screen !== 'playing' || !hud.isPlaceMenuOpen()) return;
      if (event.code !== 'Escape' && !/^Digit[1-3]$/.test(event.code)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.repeat) return;
      if (event.code === 'Escape') hud.hidePlaceMenu();
      else hud.selectPlaceMenuRow(Number(event.code.slice(-1)) - 1);
      clearInput();
    }, true);
    const unlockAudio = () => { if (!shotMode) { audio.unlock(); audio.setMuted(state.muted); } };
    window.addEventListener('pointerdown', unlockAudio, { once: true });
    window.addEventListener('keydown', unlockAudio, { once: true });
    window.addEventListener('blur', () => { if (!shotMode) pause('Window inactive'); });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && !shotMode) { pause('Window inactive'); saveNow(); }
    });
    window.addEventListener('pagehide', saveNow);
    announce(renderer.renderer ? 'SOLMAR. Press Enter to start, or Continue.' : 'SOLMAR requires WebGL. Enable hardware acceleration and reload.');
    if (!shotMode) frameId = requestAnimationFrame(frame);
  }

  function beginShot(name) {
    shotMode = true;
    state.shot = ['play', 'end'].includes(name) ? name : 'start';
    const generation = ++shotGeneration;
    window.__shotReady = false;
    window.__gameError = null;
    if (frameId !== null) cancelAnimationFrame(frameId);
    if (shotFrameId !== null) cancelAnimationFrame(shotFrameId);
    frameId = null;
    startRun(false);
    const staged = stageShot(state.shot, game);
    setScreen(staged.screen);
    staged.update?.();
    // Some shot-module revisions mark readiness during staging; rendering owns this flag.
    window.__shotReady = false;
    syncRider();
    refreshHud();
    if (state.screen === 'menu') renderer.frameTitle();
    else renderer.updateCamera(1, player, orbit, 0);
    let painted = 0;
    function paint() {
      if (generation !== shotGeneration) return;
      renderer.render();
      painted += 1;
      if (painted < 3) shotFrameId = requestAnimationFrame(paint);
      else {
        shotFrameId = null;
        window.__shotReady = Boolean(renderer.renderer);
        if (!renderer.renderer) window.__gameError = 'WebGL is unavailable; screenshot could not be rendered.';
      }
    }
    shotFrameId = requestAnimationFrame(paint);
    return staged;
  }

  const game = {
    seed: seedValue, city, renderer, player, vehicles, traffic, police, combat, audio,
    hud, missions, assets, restaurants, safehouses, input, state, orbit, setScreen, startRun, restart, pause, resume,
    boot, beginShot, refreshHud, saveNow, completeMission, busted, gameOver,
    leaveBusted, continueAfterMission, showJobs, chooseJob, enterOrExit, step,
    missingElements: DOM_IDS.filter((id) => !nodes[id]),
  };
  return game;
}

function initialize() {
  window.__shotReady = false;
  window.__gameError = null;
  try {
    const params = new URLSearchParams(window.location.search);
    const saved = readSave();
    const shot = params.has('shot') ? params.get('shot') || 'start' : null;
    const seed = parseSeed(params.get('seed'), shot === null ? saved?.seed ?? 1 : 1);
    const game = makeGame(seed, shot);
    window.__game = game;
    window.__solmar = game;
    game.boot();
    if (shot !== null) game.beginShot(shot);
  } catch (error) {
    window.__gameError = error instanceof Error ? error.message : String(error);
    const status = element('status');
    if (status) status.textContent = `SOLMAR could not start: ${window.__gameError}`;
    console.error('SOLMAR startup failed:', error);
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
else initialize();
