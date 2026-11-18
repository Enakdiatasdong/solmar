import { MathUtils } from '../vendor/three.module.min.js';
import { STEP, MAX_FRAME, CAMERA, PLAYER, POLICE } from './config.js';
import { createRandom, parseSeed } from './random.js';
import { createCity, resolveCollisions, clampToWorld } from './world.js';
import { createPlayer } from './player.js';
import { createVehicles, exitSpot } from './vehicles.js';
import { createInput, ACTION_ENTER, ACTION_PUNCH, ACTION_FIRE, ACTION_CONFIRM, ACTION_PAUSE, ACTION_RESTART, ACTION_MENU, ACTION_MUTE, ACTION_JUMP } from './input.js';
import { createTraffic } from './traffic.js';
import { createPolice } from './police.js';
import { createMissions } from './missions.js';
import { createCombat } from './combat.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import { readSave, writeSave, clearSave } from './save.js';
import { stageShot } from './shots.js';
import { createRenderer } from './render.js';

window.__shotReady = false;
const element = id => document.getElementById(id);
const panels = { title: 'title-screen', paused: 'pause-screen', busted: 'busted-screen', gameover: 'game-over-screen', 'mission-complete': 'complete-screen' };
try {
  const random = createRandom(parseSeed());
  const renderer = createRenderer(element('game'));
  const { scene } = renderer;
  const city = createCity(random);
  scene.add(city.group);
  const player = createPlayer(city);
  scene.add(player.group);
  const vehicles = createVehicles(city, scene);
  city.vehicles = vehicles;
  const traffic = createTraffic(city, scene, random);
  const police = createPolice(city, scene, vehicles);
  const audio = createAudio();
  const hud = createHud();
  const input = createInput(element('game'));
  Object.assign(city, { pedestrians: traffic.pedestrians, footCops: police.footCops, knockPed: traffic.knockPed, addWanted: police.addWanted, audio });
  const combat = createCombat(scene, () => player, () => city);
  const missions = createMissions({ city, scene, player, vehicles, police, combat, hud, audio, random });
  const state = { screen: 'title', cash: 250, completed: [], time: 0, yaw: 0, pitch: 0.34, distance: CAMERA.distance, cameraOffset: 0, cameraYaw: 0, hitPedCooldown: 0, shotMode: null, jobsOpen: false, fixedSteps: 0 };
  let saved = readSave();
  if (saved) {
    audio.setMuted(saved.muted);
    element('btn-continue').hidden = false;
    element('btn-continue').textContent = `CONTINUE • $${saved.cash.toLocaleString('en-US')}`;
  }
  const game = { state, city, player, vehicles, traffic, police, combat, audio, hud, input, missions, renderer, scene, random, startRun, setScreen, enterCar, exitCar, completeMission, saveNow, step, busted, gameOver, showJobs, leaveBusted };
  window.__game = game;

  function saveNow() {
    const progress = state.screen === 'title' && saved ? saved : { cash: state.cash, missions: state.completed, best: missions.bestTimes };
    const data = { cash: progress.cash, missions: progress.missions, best: progress.best, muted: audio.muted };
    const result = writeSave(data);
    saved = { ...data };
    return result;
  }
  function setScreen(screen) {
    state.screen = screen;
    document.body.dataset.screen = screen;
    for (const [name, id] of Object.entries(panels)) element(id).hidden = name !== screen;
    hud.setVisible(screen !== 'title');
    if (screen !== 'paused') {
      hud.hideMissionList();
      state.jobsOpen = false;
    }
    input.reset();
    updateHud();
  }
  function startRun(continueSave = false) {
    const progress = continueSave ? (readSave() || saved) : null;
    state.shotMode = null;
    police.clear();
    combat.reset();
    if (player.state.car) exitCar();
    missions.reset();
    vehicles.reset();
    traffic.reset();
    player.reset();
    state.cash = progress?.cash ?? 250;
    state.completed = [...(progress?.missions || [])];
    state.time = 0;
    state.yaw = state.cameraYaw = state.cameraOffset = 0;
    state.distance = CAMERA.distance;
    state.hitPedCooldown = 0;
    missions.setProgress(state.completed, progress?.best || {});
    if (progress) audio.setMuted(progress.muted);
    else clearSave();
    setScreen('playing');
    audio.start();
    hud.setObjective('Find Mara’s gold beacon at Moreno Garage, or open Jobs [M].');
    hud.toast('Solmar. The coast is yours, Jax.', 'success');
    renderer.frame(player.state, STEP, { yaw: 0, snap: true });
  }
  function enterCar(car) {
    if (!car || car.wrecked || car.removed) return false;
    const stolen = !car.owned && !car.stolen;
    car.driver = 'player';
    car.stolen = car.stolen || stolen;
    player.state.car = car;
    player.state.x = car.x;
    player.state.z = car.z;
    player.state.heading = car.heading;
    player.group.visible = false;
    state.cameraOffset = 0;
    state.cameraYaw = car.heading;
    state.distance = CAMERA.carDistance;
    if (stolen) {
      police.addWanted(POLICE.steal, 'Car theft');
      hud.toast('Stolen ride. The patrol has your description.');
    } else hud.toast('Your ride. W / S to drive • Space to handbrake.');
    audio.start();
    return true;
  }
  function exitCar() {
    const car = player.state.car;
    if (!car) return;
    const candidates = [exitSpot(car), { x: car.x - Math.cos(car.heading) * 3.2, z: car.z + Math.sin(car.heading) * 3.2 }, { x: car.x - Math.sin(car.heading) * 4, z: car.z - Math.cos(car.heading) * 4 }];
    let point = candidates[0];
    for (const candidate of candidates) {
      const resolved = resolveCollisions(city.colliders, candidate.x, candidate.z, PLAYER.radius);
      if (!resolved.hit) { point = resolved; break; }
    }
    point = clampToWorld(point.x, point.z, PLAYER.radius);
    car.driver = null;
    car.speed *= 0.2;
    player.state.car = null;
    player.setPosition(point.x, point.z, car.heading);
    player.group.visible = true;
    state.yaw = car.heading;
    state.distance = CAMERA.distance;
    hud.toast('Back on foot. Click to fire • F to punch.');
  }
  function interact() {
    if (player.state.car) return exitCar();
    const p = player.state;
    const job = missions.nearestStart(p.x, p.z);
    if (job) return missions.start(job.id);
    const car = vehicles.nearest(p.x, p.z);
    if (car?.wrecked) return hud.toast('That car is wrecked.');
    if (car) return enterCar(car);
    hud.toast('Nothing to use here. Look for a ride or a gold job beacon.');
  }
  function completeMission(event) {
    state.cash += event.reward;
    if (!state.completed.includes(event.id)) state.completed.push(event.id);
    element('complete-title').textContent = event.title;
    element('complete-cash').textContent = `+$${event.reward.toLocaleString('en-US')}`;
    element('complete-time').textContent = `${event.time.toFixed(1)}s`;
    element('complete-extra').textContent = `${state.completed.length} OF 5 JOBS COMPLETE${state.completed.length === 5 ? ' • A NEW LIFE BEGINS' : ' • NEXT CONTACT UNLOCKED'}`;
    saveNow();
    setScreen('mission-complete');
  }
  function busted() {
    if (state.screen !== 'playing') return;
    const fine = Math.min(state.cash, Math.round(POLICE.fine * (1 + police.state.wanted * 0.2)));
    state.cash -= fine;
    missions.fail('Busted. The job is off.');
    missions.takeEvents();
    if (player.state.car) exitCar();
    police.clear();
    police.state.busted = false;
    player.setPosition(2, 88, 0);
    player.state.health = 60;
    element('busted-fine').textContent = `$${fine}`;
    saveNow();
    setScreen('busted');
  }
  function leaveBusted() {
    player.state.health = 75;
    const car = vehicles.starter;
    car.health = 100; car.wrecked = false; car.speed = 0; car.x = 4.6; car.z = 100;
    setScreen('playing');
  }
  function gameOver() {
    missions.fail('You did not make it out.');
    missions.takeEvents();
    saveNow();
    setScreen('gameover');
  }
  function showJobs() {
    if (['busted','gameover','mission-complete'].includes(state.screen)) return;
    state.jobsOpen = hud.toggleMissionList(missions.list);
  }
  function handleActions(actions) {
    for (const action of actions) {
      if (action === ACTION_MUTE) {
        audio.toggleMute(); audio.start(); saveNow(); hud.toast(audio.muted ? 'Audio muted.' : 'Synth radio on.');
        continue;
      }
      if (action === ACTION_MENU) { showJobs(); continue; }
      if (action === ACTION_PAUSE) {
        if (hud.missionListOpen) { hud.hideMissionList(); state.jobsOpen = false; }
        else if (state.screen === 'playing') setScreen('paused');
        else if (state.screen === 'paused') setScreen('playing');
        continue;
      }
      if (action === ACTION_RESTART && state.screen !== 'title') { startRun(false); continue; }
      if (action === ACTION_CONFIRM) {
        if (state.screen === 'title') startRun(false);
        else if (state.screen === 'paused' || state.screen === 'mission-complete') setScreen('playing');
        else if (state.screen === 'busted') leaveBusted();
        else if (state.screen === 'gameover') startRun(false);
        continue;
      }
      if (state.screen !== 'playing' || hud.missionListOpen) continue;
      if (action === ACTION_ENTER) interact();
      if (action === ACTION_PUNCH && !player.state.car) { combat.punch(); hud.toast(`PISTOL • ${player.state.ammo} rounds`, 'combat'); }
      if (action === ACTION_FIRE && !player.state.car) { player.state.heading = state.cameraYaw; audio.start(); combat.shoot(); }
      if (action === ACTION_JUMP && !player.state.car) jumpQueued = true;
    }
  }
  let jumpQueued = false;
  function step(dt) {
    if (state.screen !== 'playing' || hud.missionListOpen) return;
    state.time += dt;
    state.fixedSteps++;
    state.hitPedCooldown = Math.max(0, state.hitPedCooldown - dt);
    const p = player.state;
    if (p.car?.removed) exitCar();
    const forward = Number(input.down('KeyW')) - Number(input.down('KeyS'));
    const right = Number(input.down('KeyD')) - Number(input.down('KeyA'));
    if (p.car) {
      vehicles.stepCar(p.car, dt, { forward, right, handbrake: input.down('Space') });
      p.x = p.car.x; p.z = p.car.z; p.heading = p.car.heading;
      if (p.car.wrecked) {
        if (['first-fare','hot-wheels','beach-run'].includes(missions.current?.id)) missions.fail('The ride is wrecked.');
        exitCar(); p.health = Math.max(0,p.health-15); hud.toast('The ride is done. Get clear!');
      }
    } else {
      player.step(dt, { x: Math.sin(state.yaw)*forward-Math.cos(state.yaw)*right, z: Math.cos(state.yaw)*forward+Math.sin(state.yaw)*right, sprint: input.down('ShiftLeft'), jump: jumpQueued });
      jumpQueued = false;
    }
    traffic.update(dt, p);
    police.update(dt, p, combat);
    combat.update(dt);
    if (p.car && Math.abs(p.car.speed) > 3.5 && !state.hitPedCooldown) {
      for (const pedestrian of traffic.pedestrians) if (pedestrian.alive && Math.hypot(pedestrian.x-p.x,pedestrian.z-p.z) < 2.25) {
        traffic.knockPed(pedestrian);
        police.addWanted(POLICE.pedHit,'Reckless driving');
        state.hitPedCooldown=1.4;
        audio.thud();
        break;
      }
    }
    if (p.health <= 0) { gameOver(); return; }
    if (police.state.busted) { busted(); return; }
    missions.update(dt);
    for (const event of missions.takeEvents()) {
      if (event.type === 'complete') completeMission(event);
      if (event.type === 'fail') hud.toast(event.reason,'warning');
    }
    player.animate(dt,state.time);
    vehicles.update(dt,state.time);
    audio.update(dt,p,police.state.wanted);
  }
  function updateHud() {
    const p=player.state;
    hud.setMoney(state.cash);hud.setHealth(p.health);hud.setWanted(police.state.wanted,police.state.outOfSight);hud.setSpeed(p.car?.speed || 0,!!p.car);
    element('district-name').textContent = p.z > 372 ? 'HARBOR & BEACH' : p.z > 270 ? 'OCEAN DRIVE' : p.z < -160 ? 'NORTH QUARTER' : 'SOLMAR';
    if (state.screen==='playing') {
      const job=missions.nearestStart(p.x,p.z),car=vehicles.nearest(p.x,p.z);
      hud.setHint(p.car ? 'W / S — DRIVE  •  A / D — STEER  •  SPACE — HANDBRAKE  •  E — EXIT' : job ? `E — START ${job.title.toUpperCase()}  •  M — JOBS` : car ? `E — ${car.wrecked?'WRECKED RIDE':car.owned?'ENTER YOUR CAR':'STEAL THIS CAR'}  •  M — JOBS` : `WASD — MOVE  •  SHIFT — RUN  •  CLICK — FIRE (${p.ammo})  •  F — PUNCH  •  M — JOBS`);
    }
    hud.drawMinimap(city,p,state.cameraYaw,missions,police);
  }
  const bind=(id,action)=>element(id).addEventListener('click',action);
  bind('btn-start',()=>startRun(false));
  bind('btn-continue',()=>startRun(true));
  bind('btn-jobs-title',showJobs);bind('btn-jobs',showJobs);
  bind('btn-resume',()=>setScreen('playing'));
  bind('btn-restart-pause',()=>startRun(false));bind('btn-restart',()=>startRun(false));
  bind('btn-walk',leaveBusted);bind('btn-continue-story',()=>setScreen('playing'));
  element('mission-list').addEventListener('click',event=>{
    if(event.target.closest('[data-close-jobs]')) { hud.hideMissionList();state.jobsOpen=false;return; }
    const row=event.target.closest('[data-mission]');
    if(!row||row.disabled)return;
    if(state.screen==='title')startRun(false);
    if(state.screen==='paused')setScreen('playing');
    if(missions.start(row.dataset.mission)) {hud.hideMissionList();state.jobsOpen=false;audio.start();}
    else hud.toast('Finish the current job before taking another.');
  });
  window.addEventListener('beforeunload',()=>{if(state.screen!=='title'&&!state.shotMode)saveNow();});
  let last=performance.now(),accumulator=0,hudClock=0;
  function frame(now) {
    const dt=Math.min(MAX_FRAME,Math.max(0,(now-last)/1000));last=now;
    handleActions(input.takeActions());
    const look=input.takeLook();
    if(state.screen==='playing'&&!state.shotMode) {
      state.pitch=MathUtils.clamp(state.pitch+look.dy*0.003,0.05,0.95);
      state.distance=MathUtils.clamp(state.distance+look.zoom*0.9,CAMERA.minDistance,CAMERA.maxDistance);
      if(player.state.car) {
        state.cameraOffset-=look.dx*0.005;
        if(!look.dx)state.cameraOffset*=Math.exp(-dt*0.7);
        state.cameraYaw=player.state.car.heading+state.cameraOffset;
      } else {state.yaw-=look.dx*0.005;state.cameraYaw=state.yaw;}
      accumulator+=dt;
      let steps=0;
      while(accumulator>=STEP&&steps++<10) {step(STEP);accumulator-=STEP;}
      if(steps>=10)accumulator=0;
    } else accumulator=0;
    if(state.screen==='title') renderer.frameTitle(state.shotMode?0:now/1000);
    else renderer.frame(player.state,dt,{yaw:state.cameraYaw,pitch:state.pitch,distance:state.distance,snap:!!state.shotMode,time:state.time});
    hudClock+=dt;
    if(hudClock>0.08||state.shotMode){updateHud();hudClock=0;}
    renderer.render();
    // A staged shot is static after its verified paint cycle; let the GPU settle.
    if (!state.shotMode || !window.__shotReady) requestAnimationFrame(frame);
  }
  setScreen('title');
  element('status').textContent='SOLMAR  /  ORIGINAL COASTAL CRIME STORY';
  const shot=new URLSearchParams(location.search).get('shot');
  if(shot)stageShot(shot,game);
  requestAnimationFrame(frame);
} catch(error) {
  window.__gameError=String(error.stack||error);
  element('status').textContent=`SOLMAR could not start: ${error.message}`;
  console.error(error);
}
