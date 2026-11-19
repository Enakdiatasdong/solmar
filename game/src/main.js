import { auditRoadClearance } from './static-props.js';
// SOLMAR boot, system adapters and fixed-step simulation. All assets and imports are local.
// ?seed=N selects the city; ?shot=hotel-azure (or another shot name) stages a frozen scene.
import * as THREE from '../vendor/three.module.min.js';
import {
  CAMERA, COMBAT, DIFFICULTY, MAX_FRAME, MISSIONS, PLAYER, POLICE, RADIO, REP, SAVE_VERSION, SPAWN, STARTER_CAR, STEP, VEHICLE,
} from './config.js';
import { currentDifficulty, setDifficulty } from './difficulty.js';
import { createRandom, parseSeed } from './random.js';
import { clampToWorld, createCity, resolveCollisions } from './world.js';
import { createBeachActivity } from './beach-activity.js';
import { createCityInfill } from './city-infill.js';
import { createDistricts } from './districts.js';
import { createHotelAzure } from './hotel-azure.js';
import { createLandmarks } from './landmarks.js';
import { createPlayer } from './player.js';
import { createJetpack, JETPACK_PRICE } from './jetpack.js';
import { createVehicles, exitSpot } from './vehicles.js';
import { createTraffic } from './traffic.js';
import { createPolice } from './police.js';
import { createRespray } from './respray.js';
import { createCombat } from './combat.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import { createRadio } from './radio.js';
import { createMissions } from './missions.js';
import { createCollectibles } from './collectibles.js';



import { createRegions } from './regions.js';
import { createRep } from './rep.js';

import { ASSETS, createAssets } from './assets.js';
import { RESTAURANTS, createRestaurants } from './restaurants.js';
import { SAFEHOUSES, createSafehouses } from './safehouses.js';


import { createGangs } from './gangs.js';
import { createStats } from './stats.js';

import { createVehicleJobs } from './vehicle-jobs.js';
import { createRaces } from './races.js';
import { createRenderer } from './render.js';
import { readSave, writeSave } from './save.js';
import {
  ACTION_BUY_AMMO, ACTION_CONFIRM, ACTION_ENTER, ACTION_FIRE, ACTION_HORN, ACTION_JETPACK, ACTION_MENU, ACTION_MUTE,
  ACTION_PAUSE, ACTION_PUNCH, ACTION_RADIO, ACTION_RESTART, createInput,
} from './input.js';
import { normalizeShotName, stageShot } from './shots.js';
import { cameraPositionAtDistance, cameraPositionClear, findRoadRoute, safeCameraDistance } from './camera.js';

const DOM_IDS = [
  'game', 'status', 'title-screen', 'btn-start', 'btn-walk', 'btn-jobs', 'btn-continue',
  'btn-continue-story', 'pause-screen', 'busted-screen', 'busted-fine', 'game-over-screen',
  'btn-restart', 'complete-screen', 'complete-title', 'complete-cash', 'complete-extra',
  'complete-time', 'btn-resume', 'btn-restart-pause',
  // Keep this inventory aligned with hud.js; every element is optional.



  'hud', 'health-fill', 'health-text', 'cash-value', 'income-value', 'clock-value', 'wanted-stars', 'speed-value',
  'speed-box', 'vehicle-name', 'jetpack-box', 'jetpack-bar', 'jetpack-fill', 'jetpack-text',
  'objective-text', 'objective-box', 'toasts', 'minimap', 'zone-label', 'mission-list',
  'dialogue', 'dialogue-text', 'subtitle', 'hint', 'region-panel', 'region-current', 'region-list', 'rep-panel', 'rep-rank', 'rep-points', 'rep-progress', 'rep-next', 'mission-stats', 'place-menu', 'place-menu-title',
  'place-menu-subtitle', 'place-menu-rows', 'place-menu-close',

  'gangs-panel', 'btn-gangs', 'btn-gangs-hud', 'btn-gangs-close',
  'stats-panel', 'btn-stats', 'btn-stats-title', 'btn-stats-close',

  'weapon-box', 'weapon-text', 'weapon-slots', 'vehicle-condition-bar', 'vehicle-condition', 'vehicle-condition-text', 'police-list', 'mission-card', 'mission-chapter', 'mission-card-title', 'mission-briefing', 'mission-awareness', 'mission-stage', 'mission-timer', 'mission-pips', 'mission-next', 'search-zone-chip', 'radio-box', 'radio-station', 'radio-track', 'radio-artist', 'rep-level', 'day-night-icon',

];
const SCREEN_ALIASES = { title: 'menu', 'game-over': 'gameover' };
const OVERLAYS = {
  menu: 'title-screen', paused: 'pause-screen', busted: 'busted-screen',
  gameover: 'game-over-screen', 'mission-complete': 'complete-screen',
};
const MAX_STEPS = 8;
const JETPACK_SERVICE_RADIUS = 12;
const JETPACK_REWARD_JOB = 'harbor-job';
const clamp = THREE.MathUtils.clamp;

export function advanceClockAndRadio(state, dt) {
  if (!state || !Number.isFinite(dt) || dt <= 0) return;
  state.clockMinutes += dt;
  while (state.clockMinutes >= 1440) {
    state.clockMinutes -= 1440;
    state.day += 1;
  }
}

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
  city.hotel = createHotelAzure(city);
  city.group.add(city.hotel.group);
  city.colliders.push(...city.hotel.colliders);
  renderer.scene.add(city.group);
  const districts = createDistricts({ scene: renderer.scene, city, random: createRandom(seedValue ^ 0xd157) });
  const player = createPlayer(city);
  renderer.scene.add(player.group);
  const jetpack = createJetpack(renderer.scene, player, city.groundHeightAt);
  const vehicles = createVehicles(city, renderer.scene);
  vehicles.spawnStarter();
  vehicles.spawnParked(random);
  vehicles.spawnExpansionVehicles(random);
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

  const combat = createCombat(renderer.scene, () => player, () => combatCity, seedValue ^ 0xc05);
  const audio = createAudio();
  const hud = createHud();
  const landmarks = createLandmarks({ scene: renderer.scene, city, districts, hud });
  const cameraColliders = [...city.colliders, ...city.cameraBlockers];
  let storyObjective = '';
  let vehicleObjective = '';
  let raceObjective = '';
  function setStoryObjective(text) {
    storyObjective = text;
    hud.setObjective(raceObjective || vehicleObjective || storyObjective);
  }
  function setVehicleObjective(text) {
    vehicleObjective = text;
    hud.setObjective(raceObjective || vehicleObjective || storyObjective);
  }
  function setRaceObjective(text) {
    raceObjective = text;
    hud.setObjective(raceObjective || vehicleObjective || storyObjective);
  }

  const missions = createMissions({
    scene: renderer.scene, city, player, vehicles, police, combat,
    hud: { ...hud, setObjective: setStoryObjective },
    // missions.js asks for a one-shot siren cue; audio.js exposes a wanted-level updater.
    audio: { ...audio, siren: () => audio.updateSiren(police.state.wanted) },
  });



  const regions = createRegions({ scene: renderer.scene, missions });
  const rep = createRep();

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


  const gangs = createGangs({ scene: renderer.scene, city, player, combat, hud, seed: seedValue, awardCash });
  const stats = createStats(() => gangs.state.districts);


  const vehicleJobs = createVehicleJobs({
    scene: renderer.scene, city, player, vehicles,
    hud: { ...hud, setObjective: setVehicleObjective },
    onComplete: completeVehicleJob,
  });

  const orbit = player.orbit;
  const input = createInput(canvas, () => state.screen === 'playing' && !player.state.inCar);
  const clock = { accumulator: 0, last: null };
  const state = {
    screen: 'menu', cash: MISSIONS.startCash, completed: [], missionBest: {}, difficulty: 'normal',
    muted: Boolean(readSave()?.muted), started: false, elapsed: 0, lastSave: 0,
    pauseReason: '', bustedFine: 0, finalMission: null, pedHitCooldown: 0,
    shotsFired: 0, shot: shotName, respawn: { x: SPAWN.x, z: SPAWN.z },
    day: 1, clockMinutes: 18 * 60 + 52,
  };
  const radio = createRadio({ audio, hud, stations: RADIO.stations });
  const collectibles = createCollectibles({ scene: renderer.scene, city, hud, audio, onPickup: () => saveNow() });
  const races = createRaces({
    scene: renderer.scene, city, player, vehicles,
    hud: { ...hud, setObjective: setRaceObjective },
    isUnlocked: (race) => missions.completedCount() >= (race.regionRequired ?? 0),
    onComplete(event) {
      event.prize = Math.round(event.prize * currentDifficulty().payout);
      awardReward(event.prize);
      refreshHud();
      saveNow();
    },
  });
  const respray = createRespray({
    scene: renderer.scene, city, hud, audio, police, player, stats,
    getCash: () => state.cash,
    setCash(amount) { state.cash = amount; hud.setCash(amount); },
    onPaid() {
      rep.noteWanted(0, { awardEscape: false });
      refreshHud();
      saveNow();
    },
  });
  const cityInfill = createCityInfill({
    city, scene: renderer.scene, random: createRandom(seedValue ^ 0xc171),
    reserved: [
      ...parked.map(({ x, z }) => ({ x, z, radius: 4 })),
      ...landmarks.list.map(({ x, z }) => ({ x, z, radius: 8 })),
      ...collectibles.list.map(({ x, z }) => ({ x, z, radius: 3 })),
      ...missions.list.map(({ start }) => ({ ...start, radius: 8 })),
      ...[...assets.list, ...restaurants.list, ...safehouses.list].map(({ x, z }) => ({ x, z, radius: 6 })),
      { ...city.landmarks.garage, radius: 21 },
    ],
  });
  cityInfill.counts.pedestrians = traffic.addSidewalkWalkers(cityInfill.group,
    cityInfill.pedestrianRoutes, createRandom(seedValue ^ 0x51de));
  const beachActivity = createBeachActivity(city.group);
  let shotMode = Boolean(shotName);
  let frameId = null;
  let shotFrameId = null;
  let booted = false;
  let shotGeneration = 0;
  let openPanel = '';
  let panelTrigger = null;
  let gangsPanelUpdatedAt = 0;

  function announce(message) {
    if (nodes.status) nodes.status.textContent = message;
  }

  function selectDifficulty(id) {
    const selected = setDifficulty(id);
    state.difficulty = selected.id;
    for (const button of nodes['title-screen']?.querySelectorAll('[data-difficulty]') ?? []) {
      const active = button.dataset.difficulty === selected.id;
      button.classList.toggle('selected', active);
      button.setAttribute('aria-pressed', String(active));
    }
    return selected;
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
    input.takeWeapon();
    input.takeWeaponWheel();
  }

  function syncRider() {
    const car = player.state.inCar;
    if (!car) return;
    player.state.x = car.state.x;
    player.state.z = car.state.z;
    player.state.y = car.group.position.y;
    player.state.heading = car.state.heading;
    player.state.speed = Math.abs(car.state.speed);
    player.syncMesh();
  }

  function nearLandmark(name) {
    const spot = city.landmarks[name];
    return spot && Math.hypot(player.state.x - spot.x, player.state.z - spot.z) <= JETPACK_SERVICE_RADIUS;
  }

  // player.step deliberately does nothing in a car. Keep its position current for every
  // consumer, including missions/police and shots.js, which call vehicle methods directly.
  const enterCar = player.enterCar;
  player.enterCar = (car) => {
    if (!car || car.state.wrecked) return false;
    if (player.state.inCar && player.state.inCar !== car) leaveCar();
    jetpack.deactivate();
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
    closePanel(false);
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
      audio.updateJetpack(0);
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
    const currentCar = player.state.inCar;
    hud.setVehicleName(currentCar?.spec?.name);
    hud.setVehicleCondition(currentCar ? (currentCar.state.health / currentCar.state.maxHealth) * 100 : null, currentCar?.spec?.name);
    const dayNight = getDayNightState();
    hud.setClock(dayNight.day, Math.floor(dayNight.minutes / 60) % 24, Math.floor(dayNight.minutes % 60));
    hud.setNight(dayNight.isNight);
    const { fuel, maxFuel, owned, active } = jetpack.state;
    hud.setJetpack(fuel, maxFuel, owned, active);
    const regionSnapshot = regions.snapshot(player.state.x, player.state.z);
    hud.setRegions(regionSnapshot);
    hud.setRep(rep.rankInfo());
    hud.setWeaponSlots(combat.state.weapons, combat.state.weaponIndex);
    radio.refreshHud();
    hud.setPoliceUnits(police.getChaseStatus(player, Boolean(missions.active?.id === 'paper-moon')), police.state.wanted);
    const paperMoon = missions.active?.id === 'paper-moon';
    hud.setMissionCard(paperMoon ? {
      chapter: 'CH 5 · PAPER MOON', title: 'PAPER MOON', briefing: "Lose the cops before Juno's scanner window closes.",
      stageIndex: missions.state.paperStageIndex, stageTotal: 4, secondsLeft: missions.state.timer,
      next: 'Bring the money home', searchZone: true, lineOfSight: police.state.lineOfSight,
    } : null);

    const { x, z } = player.state;
    const district = districts.districtAt(x, z);
    const surface = districts.surfaceAt(x, z);
    const zone = district === 'rural' ? `Desa Utara — ${surface === 'dirt' ? 'Jalan Tanah' : 'Padang Rumput'}`
      : district === 'beach' ? 'Pantai Solmar'
        : district === 'airfield' ? 'Solmar Airfield'
        : district === 'downtown' ? 'Downtown — Kota' : 'Kota Solmar';
    hud.setZone(`${zone} · Tempat ${landmarks.state.count}/${landmarks.state.total}`);

    const blips = missions.getBlips();
    const landmarkBlips = landmarks.getBlips();
    blips.push(...landmarkBlips);
    blips.push(...assets.getBlips(), ...restaurants.getBlips(), ...safehouses.getBlips());
    blips.push(...collectibles.getBlips(), ...races.getBlips());

    hud.setWeapon(combat.state.weapon);
    hud.setCrosshair(state.screen === 'playing' && !player.state.inCar && player.state.alive, player.state.aiming);
    blips.push(...vehicleJobs.getBlips());

    for (const car of police.state.copCars) blips.push({ ...car.state, color: '#ff6b57', size: 22 });
    for (const cop of police.state.cops) blips.push({ x: cop.x, z: cop.z, color: '#ff9a72', size: 18 });
    const heliPosition = police.heliPosition();
    if (heliPosition) blips.push({ x: heliPosition.x, z: heliPosition.z, color: '#ffc857', size: 26 });
    blips.push(...gangs.getBlips());
    // Mission markers are already included by getBlips(), so do not draw a second copy.
    const storyMarker = missions.active ? missions.state.marker ?? missions.active.start : null;
    const actor = player.state.inCar?.state ?? player.state;
    const roadNodes = storyMarker ? findRoadRoute(city.roadNetwork ?? city.graph, actor, storyMarker) : null;
    const route = storyMarker ? roadNodes
      ? [{ x: actor.x, z: actor.z }, ...roadNodes.map((node) => ({ x: node.x, z: node.z })), { x: storyMarker.x, z: storyMarker.z }]
      : [{ x: actor.x, z: actor.z }, { x: storyMarker.x, z: storyMarker.z }]
      : null;
    hud.drawMinimap(player, police.state.wanted, null, blips, orbit.yaw, regionSnapshot, {
      rural: districts.bounds, dirtRoads: districts.state.dirtRoads, landmarks: landmarkBlips,
      downtownTowers: city.downtownTowers,
      searchZone: paperMoon ? { x: player.state.x, z: player.state.z, radius: 120 } : null,
      route: races.getRoute() ?? route,
      storyMarker,
    }, gangs.getMinimapZones());
    if (openPanel === 'gangs' && state.elapsed - gangsPanelUpdatedAt >= 0.25) renderGangsPanel();

  }

  // Seam for Coder A's real cycle: a host can provide {day, minutes, isNight} on window.
  function getDayNightState() {
    const external = typeof window !== 'undefined' ? window.__solmarDayNight : null;
    if (external && Number.isFinite(external.day) && Number.isFinite(external.minutes)) {
      return { day: external.day, minutes: external.minutes, isNight: Boolean(external.isNight) };
    }
    const minutes = Number.isFinite(state.clockMinutes) ? state.clockMinutes : 0;
    return { day: state.day, minutes, isNight: minutes >= 19 * 60 || minutes < 6 * 60 };
  }

  // Crosshair ray: from the (single, damped) follow camera through screen centre.
  // The direction is the orbit yaw/pitch expressed by the camera itself, so aim can
  // never drift away from what the player sees (AN1 K-04: no third camera mode).
  function computeAim() {
    const direction = new THREE.Vector3();
    renderer.camera.getWorldDirection(direction);
    return { origin: renderer.camera.position.clone(), direction, aiming: player.state.aiming };
  }

  function updateCameraSafely(dt) {
    const inCar = player.state.inCar;
    const chase = police.state.wanted >= 3;
    const focus = player.state.inCar?.state ?? player.state;
    const height = (inCar ? CAMERA.carHeight : CAMERA.height) + (chase ? CAMERA.chaseLift : 0);
    renderer.updateCamera(dt, player, { ...orbit, chase, aiming: player.state.aiming, distance: requestedDistance, safeDistance }, 0);
    // The renderer applies minimum zoom and smoothing. Neither may place the camera inside a deck.
    const focusY = (inCar ? 1.4 : 1.5) + (inCar ? 0 : Number.isFinite(player.state.y) ? player.state.y : 0);
    const safeDistanceValue = safeDistance(orbit.yaw, orbit.pitch, focusY);
    const rendererDistance = Math.max(CAMERA.minDistance, Math.min(CAMERA.maxDistance, requestedDistance));
    if (safeDistanceValue < rendererDistance || !cameraPositionClear(renderer.camera.position, city.cameraBlockers)) {
      const safePosition = cameraPositionAtDistance(focus, orbit.yaw, orbit.pitch, safeDistanceValue, { focusY, height });
      renderer.cameraState.pos.set(safePosition.x, safePosition.y, safePosition.z);
      renderer.cameraState.distance = safeDistanceValue;
      renderer.camera.position.copy(renderer.cameraState.pos);
      renderer.camera.lookAt(renderer.cameraState.target);
    }
  }

  function leaveCar() {
    const car = player.state.inCar;
    if (!car) return;
    player.exitCar(exitSpot(car), car.state.heading);
    car.state.speed = 0;
    player.state.speed = 0;
    races.fail('You left the car.');
    vehicleJobs.fail('You left the vehicle.');
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
      cash: state.cash, rep: rep.state.points, missions: missions.completedIds, best: { ...state.missionBest },
      muted: state.muted, seed: seedValue, version: SAVE_VERSION,

      assets: assets.serialize(),
      mealsEaten: restaurants.state.mealsEaten,
      safehouses: safehouses.serialize(),

      difficulty: currentDifficulty().id, station: radio.serialize(), collectedReels: collectibles.state.collected,
      districts: gangs.serialize(), stats: stats.serialize(),

    });
  }

  function startRun(continueSave = false) {
    const save = continueSave ? readSave() : null;
    setDifficulty(shotMode ? 'normal' : save?.difficulty ?? state.difficulty ?? 'normal');
    state.difficulty = currentDifficulty().id;
    rep.reset(save?.rep ?? 0);
    leaveCar();
    missions.reset();

    regions.reset();

    vehicleJobs.reset();
    races.reset();
    radio.reset();
    if (save) radio.restore(save.station);
    collectibles.restore(save?.collectedReels);
    respray.reset();

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
    jetpack.reset();
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

    if (missions.state.completed.has(JETPACK_REWARD_JOB)) jetpack.unlock();

    assets.restore(save?.assets);
    restaurants.state.mealsEaten = save?.mealsEaten || 0;
    state.respawn = { x: SPAWN.x, z: SPAWN.z };
    safehouses.restore(save?.safehouses);

    if (save) state.muted = Boolean(save.muted);
    Object.assign(state, {
      started: true, elapsed: 0, lastSave: 0, finalMission: null, bustedFine: 0,
      pedHitCooldown: 0, shotsFired: 0, pauseReason: '',
      day: 1, clockMinutes: 18 * 60 + 52,
    });
    stats.reset();
    if (save) stats.restore(save.stats);
    gangs.reset(save?.districts);
    Object.assign(orbit, { yaw: SPAWN.heading, pitch: CAMERA.pitch, distance: CAMERA.distance });
    audio.setMuted(state.muted);
    if (!shotMode) audio.unlock();
    setScreen('playing');
    hud.setDialogue('', '');
    hud.setHint(jetpack.state.owned ? 'J — jetpack' : '');
    setStoryObjective('Explore Solmar. Find a gold beacon for a job, or press M.');

    hud.toast(save ? 'Welcome back to Solmar.' : 'Solmar. The coast is yours, Jax.', 'mission', 4);
    updateCameraSafely(1);
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


  function awardCash(amount) {
    state.cash += amount;
    stats.recordMoneyEarned(amount);
  }

  function awardReward(reward) {
    state.cash += reward;
    audio.chime();
  }

  function completeVehicleJob(event) {
    event.reward = Math.round(event.reward * currentDifficulty().payout);
    awardReward(event.reward);
    refreshHud();
    saveNow();

  }

  function completeMission(event) {
    const mission = missions.list.find((item) => item.id === event?.mission?.id);
    if (!mission || state.completed.includes(mission.id)) return false;
    state.completed.push(mission.id);

    const reward = Math.round(mission.reward * currentDifficulty().payout);
    awardCash(reward);
    rep.addPoints(REP.mission, 'Mission complete');
    if (mission.id === JETPACK_REWARD_JOB && !jetpack.state.owned) {
      jetpack.unlock();
      hud.toast('Jetpack unlocked. Press J to use it.', 'mission', 4);
    }
    stats.recordMissionComplete();


    const elapsed = Number.isFinite(event.elapsed) && event.elapsed >= 0 ? event.elapsed : null;
    if (elapsed !== null) {
      state.missionBest[mission.id] = Math.min(state.missionBest[mission.id] ?? Infinity, elapsed);
      missions.state.bestTimes[mission.id] = state.missionBest[mission.id];
    }
    state.finalMission = { ...event, mission, elapsed };
    const values = {
      'complete-title': mission.title,
      'complete-cash': `+$${reward.toLocaleString('en-US')}`,
      'complete-time': elapsed === null ? '—' : `${elapsed.toFixed(1)}s`,
      'complete-extra': `${missions.completedCount()} of ${missions.list.length} jobs complete.`,
    };
    for (const [id, value] of Object.entries(values)) if (nodes[id]) nodes[id].textContent = value;
    // A delivered mission car may have been removed by the mission module.
    if (player.state.inCar && !vehicles.cars.includes(player.state.inCar)) leaveCar();
    cleanPoliceCars();
    setScreen('mission-complete');
    refreshHud();
    saveNow();
    announce(`Mission complete: ${mission.title}. Earned $${reward}.`);
    announceRankUps();
    return true;
  }

  function announceRankUps() {
    for (const rank of rep.takeRankUps()) {
      hud.toast(`Rank up: ${rank.name}`, 'mission', 4.2);
      announce(`Rank up: ${rank.name}`);
    }
  }

  function busted() {
    if (state.screen !== 'playing') return;
    state.bustedFine = Math.min(state.cash, Math.round(POLICE.fine * (1 + police.state.wanted * 0.2)));
    state.cash -= state.bustedFine;

    stats.recordMoneySpent(state.bustedFine);
    stats.recordBusted();

    vehicleJobs.fail('Busted.');
    races.fail('Busted.');

    leaveCar();
    jetpack.deactivate();
    missions.fail('Busted.');
    police.clear();
    cleanPoliceCars();
    state.finalMission = null;
    rep.noteWanted(0, { awardEscape: false });
    if (nodes['busted-fine']) nodes['busted-fine'].textContent = `$${state.bustedFine.toLocaleString('en-US')}`;
    setScreen('busted');
    refreshHud();
    saveNow();
    announce('Busted. Press Enter to return to your respawn point.');
  }

  function gameOver() {
    if (state.screen !== 'playing') return;


    jetpack.deactivate();

    stats.recordDeath();


    vehicleJobs.fail('Jax went down.');
    races.fail(player.state.inCar?.state.wrecked ? 'Car wrecked.' : 'Racer went down.');

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
    setStoryObjective('Back in Solmar. Follow a gold beacon or press M for jobs.');
    refreshHud();
    announce('Released. Back to work.');
  }

  function continueAfterMission() {
    if (state.screen !== 'mission-complete') return;
    state.finalMission = null;
    setScreen('playing');
    const allDone = missions.completedCount() === missions.list.length;
    setStoryObjective(allDone ? 'All story jobs complete. The coast is yours to explore.' : 'Next job marked on the map. Press M to pick one.');
    announce(allDone ? 'Story complete. Explore Solmar.' : 'Playing SOLMAR. A new job is available.');
  }

  const missionList = hud.hud?.missionList || nodes['mission-list'];
  let vehicleJobRows = [];
  function repeatableEntries() {
    return [...vehicleJobs.getEntries(), ...races.getEntries()];
  }
  function syncVehicleJobRows(entries = repeatableEntries()) {
    vehicleJobRows.forEach(({ row, label }, index) => {
      const entry = entries[index];
      if (!entry) return;
      if (label && label.textContent !== entry.title) label.textContent = entry.title;
      row.classList.toggle('active', entry.active);
    });
  }

  function showJobs(toggle = false) {
    if (state.screen !== 'playing' && state.screen !== 'paused') return;

    hud.hidePlaceMenu();

    closePanel();

    if (toggle && missionList?.classList.contains('open')) {
      hud.hideMissionList();
      return;
    }

    const rank = rep.rankInfo();
    const progress = `${regions.unlockedCount()} / ${regions.state.regions.length} districts open`;
    const needed = rank.nextAt === null ? 'Max rank' : `${(rank.nextAt - rank.points).toLocaleString('en-US')} points to ${rank.nextName}`;
    const entries = repeatableEntries();
    const jobs = [...missions.list, ...entries];
    hud.showMissionList(jobs, jobs.findIndex((mission) => mission.active), {
      rank: rank.name, points: rep.state.points, next: needed, districts: progress,
      difficulty: currentDifficulty().label,
    });

    // hud.js creates rows at show time without data attributes. Bind through their container.
    const rows = missionList?.querySelectorAll('.mission-row') ?? [];
    vehicleJobRows = [];
    rows.forEach((row, index) => {
      const mission = jobs[index];
      if (!mission) return;
      row.setAttribute('data-mission', mission.id);
      row.setAttribute('role', 'button');
      row.setAttribute('tabindex', state.screen === 'paused' ? '-1' : '0');
      row.setAttribute('aria-disabled', String(state.screen === 'paused' || mission.locked || mission.completed));
      row.classList.toggle('locked', mission.locked);
      if (index >= missions.list.length) vehicleJobRows.push({ row, label: row.querySelector('.mission-name') });
    });
    syncVehicleJobRows(entries);
    if (!missionList) hud.toast('Find the gold job beacon and press E.', 'info', 3);
  }

  function closePanel(restoreFocus = true) {
    if (openPanel === 'gangs') hud.hideGangs();
    if (openPanel === 'stats') hud.hideStats();
    openPanel = '';
    if (restoreFocus) panelTrigger?.focus();
    panelTrigger = null;
  }

  function renderGangsPanel() {
    hud.showGangs(gangs.state.districts, gangs.state.gangs, gangs.getOwner);
    gangsPanelUpdatedAt = state.elapsed;
  }

  function showPanel(kind, trigger) {
    if (openPanel === kind) { closePanel(); return; }
    closePanel(false);
    clearInput();
    hud.hideMissionList();
    openPanel = kind;
    panelTrigger = trigger;
    if (kind === 'gangs') {
      renderGangsPanel();
    } else {
      const save = state.screen === 'menu' && !state.started ? readSave() : null;
      const snapshot = stats.snapshot();
      if (save) {
        Object.assign(snapshot, save.stats);
        snapshot.districtsOwned = Object.values(save.districts).filter((district) => district.owner === 'player').length;
      }
      hud.showStats(snapshot, gangs.state.districts.length);
    }
    nodes[`btn-${kind}-close`]?.focus();
  }

  function chooseJob(id) {
    if (state.screen !== 'playing') return false;
    const repeatableJob = repeatableEntries().find((item) => item.id === id);
    if (repeatableJob) {
      if (!repeatableJob.active && repeatableJob.hint) hud.toast(repeatableJob.hint, 'info', 4);
      hud.hideMissionList();
      return false;
    }
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
    if (races.startAt(player.state)) return;
    if (player.state.inCar) {
      leaveCar();
      announce('On foot.');
      return;
    }
    if (!player.state.grounded) {
      hud.toast('Land first', 'info', 2);
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
    let car = vehicles.nearest(player.state.x, player.state.z, 4.6);
    if (!car || car.state.occupied) {
      const trafficCar = traffic.nearest(player.state.x, player.state.z, 4.6);
      if (!trafficCar) {
        hud.toast('Nothing to use here.', 'info', 1.6);
        return;
      }
      const exit = exitSpot({ state: trafficCar });
      car = vehicles.adoptTrafficCar(trafficCar);
      if (!car) {
        hud.toast('Nothing to use here.', 'info', 1.6);
        return;
      }
      traffic.removeCar(trafficCar);
      traffic.spawnFleeingPed(exit.x, exit.z, exit.heading, { x: trafficCar.x, z: trafficCar.z });
      state.pedHitCooldown = Math.max(state.pedHitCooldown, 1.4);
    }
    const stealing = !car.state.stolen;
    if (!player.enterCar(car)) return;
    if (stealing) {
      car.state.stolen = true;

      rep.addPoints(REP.theft, 'Stole a car');

      stats.recordCarStolen();

      // The coupe job raises its own wanted level when it observes the entry.
      if (car !== missions.state.car) police.addWanted(POLICE.steal, 'Vehicle theft');
      hud.toast('Stolen ride. The SMPD noticed.', 'danger', 3);
    }
    orbit.yaw = car.state.heading;
    announce('Driving. Space is the handbrake; E exits.');
  }


  function useJetpack() {
    if (player.state.inCar) {
      hud.toast('Exit the car first', 'info', 2);
    } else if (jetpack.state.owned) {
      if (!jetpack.toggle()) hud.toast('Jetpack fuel empty. Land to refuel.', 'info', 2.6);
    } else if (!player.state.grounded) {
      hud.toast('Land first', 'info', 2);
    } else if (!nearLandmark('safehouse') && !nearLandmark('garage')) {
      hud.toast('Jetpack: finish The Big One or buy one ($1500) at the Moreno Garage', 'info', 4.5);
    } else if (jetpack.buy(state.cash)) {
      state.cash -= JETPACK_PRICE;
      hud.toast('Jetpack purchased for $1500. Press J to use it.', 'mission', 4);
      saveNow();
    } else {
      hud.toast('You need $1500 to buy a jetpack.', 'info', 2.6);
    }
    refreshHud();
  }

  function selectWeapon(index) {
    if (state.screen !== 'playing' || player.state.inCar) return false;
    const candidate = combat.state.weapons[index];
    if (candidate?.unlocked === false) {
      hud.toast(`${candidate.name} is LOCKED — buy ammo at the gun shop`, 'info', 2.8);
      return false;
    }
    if (!combat.selectWeapon(index)) return false;
    hud.setWeapon(combat.state.weapon);
    hud.toast(combat.state.weapon.name, 'info', 1.2);
    return true;
  }

  function buyAmmo() {
    if (state.screen !== 'playing' || player.state.inCar) return false;
    const weapon = combat.state.weapon;
    const result = combat.buyAmmo(weapon.id, weapon.shopAmount, weapon.shopCost, (cost) => {
      if (state.cash < cost) return false;
      state.cash -= cost;
      return true;
    });
    if (!result.ok) {
      hud.toast(result.reason === 'cash' ? 'Not enough cash' : 'Ammo is full', 'info', 2);
      return false;
    }
    hud.toast(`${weapon.name}: ${weapon.ammo} ammo · $${state.cash} remaining`, 'info', 2.4);
    refreshHud();
    saveNow();
    return true;

  }

  function handleActions(actions) {
    if (actions & ACTION_MUTE) {
      state.muted = audio.toggleMute();
      hud.toast(state.muted ? 'Sound muted' : 'Sound on', 'info', 1.5);
      saveNow();
    }
    if (state.screen === 'menu') {
      if (openPanel && actions & ACTION_PAUSE) { closePanel(); return; }
      if (openPanel && actions & ACTION_CONFIRM) return;
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
    if (state.screen === 'playing' && (actions & ACTION_RADIO)) {
      radio.cycle();
      saveNow();
    }
    const weaponIndex = input.takeWeapon();
    const weaponWheel = input.takeWeaponWheel();
    if (weaponIndex !== null) selectWeapon(weaponIndex);
    if (weaponWheel && !player.state.inCar && !input.isDragging()) {
      selectWeapon((combat.state.weaponIndex + Math.sign(weaponWheel) + combat.state.weapons.length) % combat.state.weapons.length);
    }
    if (actions & ACTION_MENU) showJobs(true);
    if (actions & ACTION_ENTER) enterOrExit();
    if (hud.isPlaceMenuOpen()) return;
    if (actions & ACTION_JETPACK) useJetpack();
    if (actions & ACTION_BUY_AMMO) buyAmmo();
    if (actions & ACTION_HORN) {
      const position = player.state.inCar?.state ?? player.state;
      traffic.horn(position.x, position.z);
    }

    if (actions & ACTION_PUNCH) {
      const hit = combat.punch();
      if (hit) audio.thud();
      if (hit && police.distanceToNearest(player.state.x, player.state.z) < 12) {
        rep.addPoints(REP.punchNearCop, 'Punch near a cop');
        police.addWanted(1, 'Assault');
      }
    }
    if (actions & ACTION_FIRE) {
      const hits = combat.state.hits;
      if (combat.shoot()) {
        state.shotsFired += 1;
        stats.recordShot(combat.state.hits - hits);
        traffic.onGunshot(player.state.x, player.state.z);
        audio.gunshot();
        if (police.distanceToNearest(player.state.x, player.state.z) < POLICE.hear) {
          rep.addPoints(REP.fireNearCop, 'Shots fired near a cop');
          police.addWanted(POLICE.gunNearCop, 'Shots fired');
        }
        hud.setWeapon(combat.state.weapon);
        hud.toast(`Pistol ammo: ${combat.state.ammo}`, 'info', 1.2);
      }

    }
  }

  function step(dt = STEP) {
    if (state.screen !== 'playing' || !Number.isFinite(dt) || dt <= 0) return;
    dt = Math.min(dt, MAX_FRAME);

    assets.update(dt);
    safehouses.update();
    const controls = hud.isPlaceMenuOpen() ? {} : input.state();
    // Aim state: held right mouse / Alt / touch AIM, on foot only. This drives the
    // arms-raised pose (player.js), the FOV zoom, the tighter spread and the slower
    // on-foot movement below.
    const aiming = !player.state.inCar && player.state.alive && input.isAiming();
    player.state.aiming = aiming;
    const { x, z } = player.state;

    state.elapsed += dt;
    advanceClockAndRadio(state, dt);
    radio.update(dt);
    districts.update(dt);
    beachActivity.update(dt);
    state.pedHitCooldown = Math.max(0, state.pedHitCooldown - dt);
    if (player.state.inCar) {
      const car = player.state.inCar;
      if (car.state.wrecked) {
        races.fail('Car wrecked.');
        leaveCar();
        hud.toast('The car is wrecked.', 'danger', 2.4);
      } else {
        player.state.invuln = Math.max(0, player.state.invuln - dt);
        vehicles.stepCar(car, dt, {
          accelerate: controls.up, brake: controls.down, left: controls.left,
          right: controls.right, handbrake: controls.jump,
          surface: districts.surfaceAt(car.state.x, car.state.z),
        }, city.colliders);
        const angle = Math.atan2(Math.sin(car.state.heading - orbit.yaw), Math.cos(car.state.heading - orbit.yaw));
        if (!input.isDragging()) orbit.yaw += angle * (1 - Math.exp(-dt * CAMERA.headingFollow));
        if (state.pedHitCooldown === 0 && Math.abs(car.state.speed) > 3.5) {
          const ped = traffic.nearestPed(car.state.x, car.state.z, 2.8);
          if (ped) {
            traffic.knockPed(ped, car.state.heading);
            state.pedHitCooldown = 1.4;
            police.addWanted(POLICE.pedHit, 'Hit and run');
            rep.addPoints(REP.pedHit, 'Hit and run');
            audio.thud();
            hud.toast('Hit and run. Wanted level up.', 'danger', 2.6);
          }
        }
      }
    } else {
      const forward = Number(Boolean(controls.up)) - Number(Boolean(controls.down));
      const right = Number(Boolean(controls.right)) - Number(Boolean(controls.left));
      const moveMult = aiming ? COMBAT.aimMoveMult : 1;
      player.step(dt, {
        x: (Math.sin(orbit.yaw) * forward - Math.cos(orbit.yaw) * right) * moveMult,
        z: (Math.cos(orbit.yaw) * forward + Math.sin(orbit.yaw) * right) * moveMult,
        run: controls.run, jump: controls.jump && player.state.grounded, jetpack: jetpack.state.active,
      }, city.colliders);
    }
    jetpack.update(dt, controls, nearLandmark('safehouse'));
    traffic.update(dt, player, vehicles);
    combat.update(dt, player);
    police.update(dt, player, combat);
    const resprayResult = respray.update(dt, player);
    rep.update(dt, police.state.wanted, { awardEscape: !police.state.busted && !resprayResult?.ok });
    regions.update(dt, player, vehicles, police, hud);
    rep.noteWanted(police.state.wanted, { awardEscape: false });
    syncRider();
    landmarks.update(dt, player);
    collectibles.update(dt, player);
    const position = player.state;
    stats.addDistance(Math.hypot(position.x - x, position.z - z), Boolean(position.inCar));
    for (const place of landmarks.list) {
      if (Math.hypot(position.x - place.x, position.z - place.z) <= 25) stats.visitPlace(place.name);
    }
    for (const { name, center } of gangs.state.districts) {
      if (Math.hypot(position.x - center.x, position.z - center.z) <= 25) stats.visitPlace(name);
    }
    stats.update(dt, combat.state.enemies);

    // Handle arrest before missions.fail() can clear the police's busted flag.
    if (!player.state.alive || player.state.health <= 0) { gameOver(); return; }
    if (police.state.busted) { busted(); return; }
    gangs.update(dt);
    const active = missions.active;
    missions.update(dt);

    rep.noteWanted(police.state.wanted, { awardEscape: false });

    vehicleJobs.update(dt);
    races.update(dt);
    if (missionList?.classList.contains('open')) syncVehicleJobRows();

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

    const onGround = !car && player.state.grounded;
    const job = onGround && missions.nearestStart(player.state.x, player.state.z);
    const nearestCar = onGround && (vehicles.nearest(player.state.x, player.state.z, 4.6)
      || traffic.nearest(player.state.x, player.state.z, 4.6));
    const interactHint = job ? `E — start ${job.title}` : nearestCar ? (nearestCar.state?.stolen ? 'E — drive' : 'E — use this car') : '';
    const jetpackHint = jetpack.state.owned ? 'J — jetpack' : '';
    const asset = onGround && assets.nearest(player.state.x, player.state.z, 5);
    const restaurant = onGround && restaurants.nearest(player.state.x, player.state.z, 5);
    const safehouse = onGround && safehouses.nearest(player.state.x, player.state.z, 5);
    const placeHint = safehouse ? `E — ${safehouse.name}` : restaurant ? `E — Eat at ${restaurant.name}` : asset ? (assets.state.owned.has(asset.id) ? `E — ${asset.name} ($${asset.income}/min)` : `E — Buy ${asset.name} ($${asset.price.toLocaleString('en-US')})`) : '';
    announceRankUps();
    hud.setHint(regions.state.hint || placeHint || (car ? 'E — exit car' : [interactHint, jetpackHint].filter(Boolean).join(' · ')));


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
      const orbitSensitivity = CAMERA.sensitivity
        * (player.state.aiming && !player.state.inCar ? CAMERA.aimSensitivityMult : 1);
      orbit.yaw -= drag.x * orbitSensitivity;
      orbit.pitch = clamp(orbit.pitch + drag.y * orbitSensitivity, CAMERA.minPitch, CAMERA.maxPitch);
      orbit.distance = clamp(orbit.distance + input.takeWheel() * 0.9, CAMERA.minDistance, CAMERA.maxDistance);
      clock.accumulator += delta;
      let steps = 0;
      while (state.screen === 'playing' && clock.accumulator >= STEP && steps < MAX_STEPS) {
        clock.accumulator -= STEP;
        step(STEP);
        steps += 1;
      }
      if (steps === MAX_STEPS) clock.accumulator %= STEP;
      renderer.applyTimeOfDay(state.clockMinutes, city.setNightFactor);
      city.setSignalClock(state.clockMinutes);
      updateCameraSafely(delta);
      // Refresh the crosshair ray from this frame's camera, so the next shot (which
      // is handled before the next camera update) uses fresh aim.
      combat.setAim(computeAim());
      const car = player.state.inCar;
      const speed = Math.abs(car?.state.speed ?? 0) / (car?.tuning?.maxSpeed ?? VEHICLE.maxSpeed);
      const playing = state.screen === 'playing';
      audio.updateEngine(speed, Boolean(playing && car && input.state().jump && speed > 0.2), Boolean(playing && car));
      audio.updateSiren(playing ? police.state.wanted : 0);
      audio.updateJetpack(playing && jetpack.state.active ? (jetpack.state.thrusting ? 1 : 0.15) : 0);
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
    bind('btn-start', () => {
      state.difficulty = nodes['title-screen']?.querySelector('[data-difficulty][aria-pressed="true"]')?.dataset.difficulty ?? 'normal';
      startRun(false);
    });
    bind('btn-continue', () => state.screen === 'paused' ? resume() : startRun(true));
    bind('btn-walk', () => state.screen === 'busted' ? leaveBusted() : startRun(false));
    bind('btn-jobs', () => { if (state.screen === 'menu') startRun(false); showJobs(); });
    bind('btn-resume', resume);
    bind('btn-restart-pause', restart);
    bind('btn-restart', restart);
    bind('btn-continue-story', continueAfterMission);
    bind('btn-gangs', (event) => showPanel('gangs', event.currentTarget));
    bind('btn-gangs-hud', (event) => showPanel('gangs', event.currentTarget));
    bind('btn-gangs-close', () => closePanel());
    bind('btn-stats', (event) => showPanel('stats', event.currentTarget));
    bind('btn-stats-title', (event) => showPanel('stats', event.currentTarget));
    bind('btn-stats-close', () => closePanel());
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
    state.shot = normalizeShotName(name);
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
    else updateCameraSafely(1);
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

  window.__roadClear = auditRoadClearance([city.group, districts.group, landmarks.group,
    ...renderer.scene.children.filter((node) => ['asset', 'restaurant', 'safehouse'].includes(node.userData.kind))]);
  if (!window.__roadClear.ok) throw new Error('Static props intersect road corridors');

  const game = {

    seed: seedValue, city, cityInfill, beachActivity, districts, landmarks, collectibles, renderer, player, jetpack, vehicles, traffic, police, combat, audio, respray,
    hud, missions, regions, rep, assets, restaurants, safehouses, gangs, stats, vehicleJobs, races, radio, input, state, orbit, setScreen, startRun, restart, pause, resume,

    boot, beginShot, refreshHud, saveNow, completeMission, busted, gameOver,
    leaveBusted, continueAfterMission, showJobs, chooseJob, enterOrExit, selectWeapon, buyAmmo, step,
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
