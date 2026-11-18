// SOLMAR connects a living coastal city to Jax's last five jobs.
import { STEP, MAX_FRAME } from './config.js';
import { createRandom, parseSeed } from './random.js';
import { createCity, resolveCollisions } from './world.js';
import { createRenderer } from './render.js';
import { createPlayer } from './player.js';
import { createVehicles, exitSpot } from './vehicles.js';
import { createTraffic } from './traffic.js';
import { createPolice } from './police.js';
import { createCombat } from './combat.js';
import { createMissions } from './missions.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { readSave, writeSave } from './save.js';
import { createInput, ACTION_CONFIRM, ACTION_PAUSE, ACTION_RESTART, ACTION_MUTE, ACTION_MENU, ACTION_ENTER, ACTION_PUNCH, ACTION_FIRE, ACTION_JUMP } from './input.js';
import { stageShot } from './shots.js';

const $ = id => document.getElementById(id);
const money = value => `$${Math.round(value).toLocaleString('en-US')}`;
window.__shotReady = false;
window.addEventListener('error', event => {
  window.__gameError = event.message;
  if ($('status')) $('status').textContent = `Solmar could not continue: ${event.message}`;
});
window.addEventListener('unhandledrejection', event => {
  window.__gameError = String(event.reason?.stack || event.reason);
});

function boot() {
  const params = new URLSearchParams(location.search);
  const seed = parseSeed(params.get('seed') ?? '1');
  const render = createRenderer($('game'));
  const city = createCity(createRandom(seed));
  render.scene.add(city.group);
  const player = createPlayer(city);
  render.scene.add(player.group);
  const vehicles = createVehicles(city, render.scene);
  const traffic = createTraffic(city, render.scene, createRandom(seed ^ 0x59b1e));
  const police = createPolice(city, render.scene, vehicles);
  const hud = createHud();
  const audio = createAudio();
  const input = createInput($('game'));
  const combat = createCombat(render.scene, () => player, () => city);
  const missions = createMissions({ player, vehicles, police, combat, hud, audio, city });
  const state = { screen: 'title', cash: 250, completed: [], bestTimes: {}, muted: false, time: 0, fine: 0 };
  let saved = readSave();
  let accumulator = 0, lastFrame = 0, frameCount = 0, jump = false;
  let pedestrianCooldown = 0, shotHeatCooldown = 0;
  const game = { state, city, player, vehicles, traffic, police, combat, missions, hud, audio, input, render, seed, startRun, step, setScreen, completeMission, saveNow, enterExit, shotFrozen: false };
  window.__game = game;

  function refreshContinue() {
    saved = readSave();
    $('btn-continue').hidden = !saved;
    if (saved) $('btn-continue').textContent = `Continue · ${money(saved.cash)}`;
  }
  function setScreen(screen) {
    state.screen = screen;
    document.body.dataset.screen = screen;
    const screens = { title: 'title-screen', paused: 'pause-screen', busted: 'busted-screen', gameover: 'game-over-screen', 'mission-complete': 'complete-screen' };
    for (const [name, id] of Object.entries(screens)) {
      const element = $(id);
      element.hidden = screen !== name;
      element.setAttribute('aria-hidden', String(screen !== name));
    }
    hud.setVisible(screen !== 'title');
    if (screen !== 'paused') hud.hideMissionList();
    accumulator = 0;
    $('status').textContent = screen === 'title' ? 'Solmar. Press Enter to start your story.' : `${screen === 'playing' ? 'Exploring Solmar' : screen}.`;
  }
  function saveNow() {
    state.bestTimes = missions.bestTimes;
    writeSave({ version: 2, cash: state.cash, completed: [...state.completed], bestTimes: state.bestTimes, muted: state.muted });
  }
  function startRun(continuing = false) {
    const restore = continuing ? readSave() : null;
    game.shotFrozen = false;
    forceExit();
    police.clear();
    missions.reset();
    combat.reset();
    for (const car of [...vehicles.cars]) vehicles.remove(car);
    traffic.reset();
    player.reset();
    vehicles.spawnCar({ x: 2, z: 92, heading: 0, color: 0xefae45, starter: true });
    vehicles.spawnParked();
    state.cash = restore?.cash ?? 250;
    state.completed = [...(restore?.completed ?? [])];
    state.bestTimes = { ...(restore?.bestTimes ?? {}) };
    state.muted = restore?.muted ?? state.muted;
    missions.setProgress(state.completed, state.bestTimes);
    audio.setMuted(state.muted);
    audio.unlock();
    render.state.yaw = 0;
    render.state.pitch = .36;
    render.state.zoom = 8;
    state.time = 0;
    pedestrianCooldown = 0;
    shotHeatCooldown = 0;
    hud.setObjective('JAX MORENO · Find Mara at the gold Moreno Garage beacon. M opens your jobs.');
    hud.setDialogue('', '');
    setScreen('playing');
    hud.toast('Solmar. The coast is yours, Jax.');
    render.follow(player.state, 1);
    updateHud(0);
  }
  function forceExit() {
    const car = player.state.inCar;
    if (!car) return;
    const position = exitSpot(car);
    const safe = resolveCollisions(city.colliders, position.x, position.z, .55);
    car.driver = null;
    player.state.inCar = null;
    player.teleport(safe.x, safe.z);
  }
  function enterExit() {
    const p = player.state;
    if (p.inCar) {
      forceExit();
      hud.toast('Back on the street.');
      return;
    }
    if (missions.interact()) return;
    let car = vehicles.nearest(p.x, p.z, 5.6);
    for (const other of traffic.cars) {
      if (other.driver || other.removed) continue;
      const distance = Math.hypot(other.x - p.x, other.z - p.z);
      if (distance < 5.6 && (!car || distance < Math.hypot(car.x - p.x, car.z - p.z))) car = other;
    }
    if (!car) { hud.toast('Nothing to use here. Find a car or a gold job beacon.'); return; }
    if (car.wrecked || car.health <= 0) { hud.toast('That car is wrecked. Find another ride.'); return; }
    const index = traffic.cars.indexOf(car);
    if (index !== -1) { traffic.cars.splice(index, 1); vehicles.cars.push(car); }
    p.inCar = car;
    car.driver = 'player';
    car.parked = false;
    if (!car.stolen) {
      car.stolen = true;
      if (!car.missionCar) police.addWanted(2, 'Stolen ride');
      hud.toast('Stolen ride. Keep an eye on those wanted stars.');
    }
    player.step(0, {}, render.state.yaw);
  }
  function completeMission(event) {
    state.cash += event.reward;
    if (!state.completed.includes(event.id)) state.completed.push(event.id);
    state.bestTimes = missions.bestTimes;
    $('complete-title').textContent = event.title;
    $('complete-cash').textContent = `+${money(event.reward)}`;
    $('complete-extra').textContent = `${state.completed.length} of 5 jobs complete`;
    $('complete-time').textContent = `${event.time.toFixed(1)} s`;
    audio.chime();
    saveNow();
    setScreen('mission-complete');
  }
  function consumeMissionEvents() {
    for (const event of missions.takeEvents()) {
      if (event.type === 'complete') completeMission(event);
      else if (event.type === 'fail') hud.toast(`Job failed · ${event.reason}`, 'warning');
    }
  }
  function busted(wanted) {
    missions.fail('Busted. The client cannot wait for you.');
    consumeMissionEvents();
    state.fine = Math.min(state.cash, Math.round(350 * (1 + wanted * .2)));
    state.cash -= state.fine;
    forceExit();
    police.clear();
    player.teleport(2, 88);
    player.state.health = 60;
    player.state.alive = true;
    $('busted-fine').textContent = `${money(state.fine)} fine · A second chance at the garage.`;
    saveNow();
    setScreen('busted');
  }
  function die() {
    missions.fail('You ran out of road.');
    consumeMissionEvents();
    saveNow();
    setScreen('gameover');
  }
  function showJobs() {
    hud.toggleMissionList(missions.list, id => {
      if (state.screen === 'title') startRun(false);
      if (missions.start(id)) hud.hideMissionList();
    });
  }
  function resume() {
    if (state.screen === 'title') startRun(!!saved);
    else if (state.screen === 'gameover') startRun(false);
    else {
      game.shotFrozen = false;
      setScreen('playing');
    }
  }
  function handleActions() {
    for (const action of input.consumeActions()) {
      if (action === ACTION_MUTE) {
        state.muted = !state.muted;
        audio.setMuted(state.muted);
        hud.toast(state.muted ? 'Sound muted · N to listen' : 'Sound on');
        if (state.screen === 'title' && saved) {
          writeSave({ ...saved, muted: state.muted });
          refreshContinue();
        } else saveNow();
      } else if (action === ACTION_RESTART) startRun(false);
      else if (action === ACTION_CONFIRM) {
        if (state.screen !== 'playing') resume();
      } else if (action === ACTION_PAUSE) {
        if (state.screen === 'playing') setScreen('paused');
        else if (state.screen === 'paused') resume();
      } else if (action === ACTION_MENU) showJobs();
      else if (state.screen === 'playing') {
        if (action === ACTION_ENTER) enterExit();
        else if (action === ACTION_JUMP) jump = true;
        else if (action === ACTION_PUNCH) { combat.punch(); audio.thud(); }
        else if (action === ACTION_FIRE) combat.shoot(render.state.yaw);
      }
    }
  }
  function checkPedestrianHits(dt) {
    pedestrianCooldown = Math.max(0, pedestrianCooldown - dt);
    const car = player.state.inCar;
    if (!car || Math.abs(car.speed) < 4.5) return;
    for (const person of traffic.pedestrians) {
      if (person.alive === false || person.down || Math.hypot(person.x - car.x, person.z - car.z) > 2.3) continue;
      person.down = true;
      person.alive = false;
      person.health = 0;
      person.group.rotation.z = Math.PI / 2;
      person.group.position.y = .3;
      car.speed *= .8;
      audio.thud();
      if (pedestrianCooldown === 0) { police.addWanted(1, 'Dangerous driving'); pedestrianCooldown = 1.5; }
    }
  }
  function updateHud(dt) {
    const p = player.state;
    hud.setHealth(p.health);
    hud.setMoney(state.cash);
    hud.setWanted(police.state.wanted);
    hud.setSpeed(p.inCar ? Math.abs(p.inCar.speed) : null);
    hud.setHint(p.inCar ? 'WASD drive · Space handbrake · E exit' : missions.getHint() || (vehicles.nearest(p.x, p.z, 5.6) ? 'E — take the wheel' : 'WASD move · Shift run · E interact · F punch · Click pistol'));
    const ammoLabel = document.querySelector('.hud-bottom-label');
    if (ammoLabel) ammoLabel.textContent = `JAX MORENO · ${combat.state.ammo} ROUNDS`;
    hud.drawMinimap(city, p, render.state.yaw, missions, police.state);
    hud.update(dt);
  }
  function step(dt) {
    if (state.screen !== 'playing') return;
    state.time += dt;
    shotHeatCooldown = Math.max(0, shotHeatCooldown - dt);
    const down = code => input.down(code);
    const forward = Number(down('KeyW') || down('ArrowUp')) - Number(down('KeyS') || down('ArrowDown'));
    const right = Number(down('KeyD') || down('ArrowRight')) - Number(down('KeyA') || down('ArrowLeft'));
    const p = player.state;
    if (p.inCar) vehicles.stepCar(p.inCar, dt, { throttle: forward, steer: right, handbrake: down('Space') });
    player.step(dt, { forward, right, sprint: down('ShiftLeft') || down('ShiftRight'), jump }, render.state.yaw);
    jump = false;
    traffic.update(dt, p, vehicles);
    police.update(dt, p, { damage: amount => player.damage(amount), toast: text => hud.toast(text), shootAtPlayer: cop => combat.shootAtPlayer(cop) });
    vehicles.resolveCarCollisions(traffic.cars);
    vehicles.update(dt);
    combat.setTargets({ pedestrians: traffic.pedestrians, footCops: police.state.footCops });
    combat.update(dt);
    if (p.inCar?.wrecked || p.inCar?.health <= 0) { forceExit(); hud.toast('Your ride is wrecked. Get clear!'); }
    else if (p.inCar?.removed) { forceExit(); hud.toast('The patrol recovered its car. Find another ride.'); }
    if (p.inCar) player.step(0, {}, render.state.yaw);
    checkPedestrianHits(dt);
    for (const event of police.takeEvents()) {
      if (event.type === 'busted') { busted(event.wanted || police.state.wanted); return; }
    }
    if (p.health <= 0) { die(); return; }
    missions.update(dt);
    consumeMissionEvents();
    audio.update(dt, { speed: p.inCar?.speed || 0, wanted: police.state.wanted, playing: true, inCar: !!p.inCar });
  }

  combat.setCallbacks({
    onDamage: amount => player.damage(amount),
    toast: text => hud.toast(text),
    onShot(x, z) {
      audio.gunshot();
      traffic.scatter(x, z);
      const cops = [...police.state.copCars, ...police.state.footCops];
      if (shotHeatCooldown === 0 && cops.some(cop => Math.hypot(cop.x - x, cop.z - z) < 65)) {
        police.addWanted(1, 'Shots near a patrol');
        shotHeatCooldown = 1;
      }
    },
  });
  for (const [id, callback] of Object.entries({
    'btn-start': () => startRun(false), 'btn-continue': () => startRun(true),
    'btn-walk': resume, 'btn-continue-story': resume, 'btn-resume': resume,
    'btn-restart': () => startRun(false), 'btn-restart-pause': () => startRun(false),
    'btn-jobs': showJobs, 'btn-title-jobs': showJobs,
  })) $(id)?.addEventListener('click', callback);
  document.querySelectorAll('[data-action="resume"]').forEach(button => button.addEventListener('click', resume));
  document.addEventListener('pointerdown', () => audio.unlock(), { once: true });
  document.addEventListener('keydown', () => audio.unlock(), { once: true });
  document.addEventListener('visibilitychange', () => { if (document.hidden && state.screen === 'playing') setScreen('paused'); });
  state.muted = saved?.muted ?? false;
  audio.setMuted(state.muted);
  refreshContinue();
  vehicles.spawnCar({ x: 2, z: 92, heading: 0, color: 0xefae45, starter: true });
  vehicles.spawnParked();
  setScreen('title');
  if (params.has('shot')) stageShot(params.get('shot'), game);

  function frame(timestamp) {
    const elapsed = lastFrame ? Math.min(MAX_FRAME, Math.max(0, (timestamp - lastFrame) / 1000)) : 0;
    lastFrame = timestamp;
    handleActions();
    const pointer = input.consumePointer();
    if (!game.shotFrozen && state.screen === 'playing') {
      accumulator = Math.min(accumulator + elapsed, STEP * 8);
      while (accumulator >= STEP && state.screen === 'playing') { step(STEP); accumulator -= STEP; }
      render.follow(player.state, elapsed, pointer);
    } else {
      accumulator = 0;
      if (state.screen === 'title') render.frameTitle(game.shotFrozen ? 0 : timestamp / 1000);
    }
    if (state.screen !== 'playing') audio.update(elapsed, { speed: 0, wanted: 0, playing: false, inCar: false });
    if (state.screen !== 'title') updateHud(game.shotFrozen ? 0 : elapsed);
    render.render();
    frameCount++;
    if (frameCount >= 4) window.__shotReady = true;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
try { boot(); } catch (error) {
  window.__gameError = error.stack || String(error);
  $('status').textContent = `Solmar could not start: ${error.message}`;
  console.error(error);
}
