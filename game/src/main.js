import { MathUtils, Group, Mesh, MeshStandardMaterial, MeshBasicMaterial, CylinderGeometry, TorusGeometry } from '../vendor/three.module.min.js';
import { STEP, MAX_FRAME, CAMERA, PLAYER, POLICE, MISSIONS, DIFFICULTY, CLOCK, COLLECTIBLE_TOTAL } from './config.js';
import { createRandom, parseSeed } from './random.js';
import { createCity, resolveCollisions, clampToWorld } from './world.js';
import { createPlayer } from './player.js';
import { createVehicles, exitSpot } from './vehicles.js';
import { createInput, ACTION_ENTER, ACTION_PUNCH, ACTION_FIRE, ACTION_CONFIRM, ACTION_PAUSE, ACTION_RESTART, ACTION_MENU, ACTION_MUTE, ACTION_JUMP, ACTION_CAMERA, ACTION_RADIO, ACTION_WORKSHOP } from './input.js';
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
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const medallionSites = [
  [-7, 124], [59, 200], [216, 307], [118, 402], [225, 455], [252, 625], [-92, 509], [-302, 463],
  [-229, 367], [-317, 219], [-252, 179], [-109, 107], [32, 109], [235, 19], [324, 252],
  [108, -108], [-180, -180], [-320, -81], [302, -295], [16, -342],
];

function createMedallions(city, scene) {
  const coinGeometry = new CylinderGeometry(0.62, 0.62, 0.14, 16);
  const rimGeometry = new TorusGeometry(0.52, 0.055, 6, 20);
  const coinMaterial = new MeshStandardMaterial({ color: 0xffc34e, roughness: 0.42, metalness: 0.32, emissive: 0xf99b26, emissiveIntensity: 0.36 });
  const rimMaterial = new MeshBasicMaterial({ color: 0xffecad });
  return medallionSites.map(([x, z], id) => {
    const position = resolveCollisions(city.colliders, x, z, 1.35);
    const group = new Group();
    const coin = new Mesh(coinGeometry, coinMaterial);
    coin.rotation.x = Math.PI / 2;
    group.add(coin);
    for (const side of [-1, 1]) {
      const rim = new Mesh(rimGeometry, rimMaterial);
      rim.position.z = side * 0.08;
      group.add(rim);
    }
    group.position.set(position.x, 1.35, position.z);
    scene.add(group);
    return { ...position, id, group };
  });
}

// Route between points projected onto the road grid. Include the access legs in the distance.
function navigate(city, from, target, hasLineOfSight) {
  if (!target) return {};
  const graph = city.roadNetwork;
  let route = [from, target];
  if (from.z > 360 && target.z > 360 && Math.max(from.z, target.z) > 532) {
    route = [from, { x: 252, z: 510 }, target];
    if ((from.z > 510 && target.z > 510) || distance(from, target) < 24) route = [from, target];
  } else if (!(distance(from, target) < 44 && hasLineOfSight(from, target)) && !(from.z > 360 && target.z > 360 && hasLineOfSight(from, target))) {
    const shoreAccess = point => point.z > 532 ? { x: 252, z: 510 } : point;
    const startAccess = shoreAccess(from), goalAccess = shoreAccess(target);
    const start = graph.nearestEdge(startAccess), goal = graph.nearestEdge(goalAccess);
    if (start && goal) {
      const sameEdge = start.a === goal.a && start.b === goal.b;
      const costs = new Map([[goal.a, distance(goal.a, goal)], [goal.b, distance(goal.b, goal)]]);
      const next = new Map();
      const open = new Set(graph.nodes);
      while (open.size) {
        let node = null;
        for (const candidate of open) if (costs.has(candidate) && (!node || costs.get(candidate) < costs.get(node))) node = candidate;
        if (!node) break;
        open.delete(node);
        for (const neighbour of node.neighbours) {
          const cost = costs.get(node) + distance(node, neighbour);
          if (cost < (costs.get(neighbour) ?? Infinity)) { costs.set(neighbour, cost); next.set(neighbour, node); }
        }
      }
      const lane = [start];
      if (!sameEdge) {
        let node = distance(start, start.a) + costs.get(start.a) <= distance(start, start.b) + costs.get(start.b) ? start.a : start.b;
        for (; node; node = next.get(node)) lane.push(node);
      }
      route = [from, ...(startAccess === from ? [] : [startAccess]), ...lane, goal, ...(goalAccess === target ? [] : [goalAccess]), target];
    }
  }
  return { route, target, distance: route.slice(1).reduce((total, point, i) => total + distance(route[i], point), 0) };
}

try {
  const random = createRandom(parseSeed());
  const renderer = createRenderer(element('game'));
  const { scene } = renderer;
  const city = createCity(random);
  scene.add(city.group);
  renderer.setObstacles(city.cameraObstacles);
  const medallions = createMedallions(city, scene);
  const player = createPlayer(city);
  scene.add(player.group);
  const vehicles = createVehicles(city, scene);
  city.vehicles = vehicles;
  const traffic = createTraffic(city, scene, random);
  const state = { screen: 'title', cash: 250, completed: [], medallions: new Set(), difficulty: 'normal', clock: CLOCK.start, cameraMode: 'chase', time: 0, yaw: 0, pitch: 0.34, distance: CAMERA.distance, cameraOffset: 0, cameraYaw: 0, hitPedCooldown: 0, shotMode: null, jobsOpen: false, fixedSteps: 0 };
  const difficulty = () => DIFFICULTY[state.difficulty];
  const police = createPolice(city, scene, vehicles, difficulty);
  const audio = createAudio();
  const hud = createHud();
  const input = createInput(element('game'));
  Object.assign(city, { pedestrians: traffic.pedestrians, footCops: police.footCops, knockPed: traffic.knockPed, addWanted: police.addWanted, audio });
  const combat = createCombat(scene, () => player, () => city, difficulty);
  const missions = createMissions({ city, scene, player, vehicles, police, combat, hud, audio, random });
  let jumpQueued = false;
  let saved = readSave();
  if (saved) {
    audio.setMuted(saved.muted);
    hud.setDifficulty(saved.difficulty);
    element('btn-continue').hidden = false;
    element('btn-continue').textContent = `CONTINUE • $${saved.cash.toLocaleString('en-US')}`;
  }
  const game = { state, city, player, vehicles, traffic, police, combat, audio, hud, input, missions, renderer, scene, random, medallions, startRun, setScreen, enterCar, exitCar, completeMission, saveNow, step, busted, gameOver, showJobs, leaveBusted };
  window.__game = game;

  function saveNow() {
    if (state.shotMode) return false;
    const progress = state.screen === 'title' && saved ? saved : {
      cash: state.cash, missions: [...state.completed], best: { ...missions.bestTimes }, difficulty: state.difficulty,
      clock: state.clock, medallions: [...state.medallions], armed: player.state.armed, ammo: player.state.ammo,
    };
    const data = { ...progress, muted: audio.muted };
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
    police.clear();
    combat.reset();
    if (player.state.car) exitCar();
    missions.reset();
    vehicles.reset();
    traffic.reset();
    player.reset();
    state.cash = progress?.cash ?? 250;
    state.completed = [...(progress?.missions || [])];
    state.difficulty = hud.getDifficulty();
    state.clock = progress?.clock ?? CLOCK.start;
    state.medallions = new Set(progress?.medallions || []);
    for (const item of medallions) item.group.visible = !state.medallions.has(item.id);
    player.state.armed = progress?.armed ?? true;
    player.state.ammo = progress?.ammo ?? 24;
    state.cameraMode = 'chase';
    state.time = 0;
    state.yaw = state.cameraYaw = state.cameraOffset = 0;
    state.pitch = 0.34;
    state.distance = CAMERA.distance;
    state.hitPedCooldown = 0;
    jumpQueued = false;
    missions.setProgress(state.completed, progress?.best || {});
    if (progress) audio.setMuted(progress.muted);
    else if (!state.shotMode) { clearSave(); saved = null; }
    setScreen('playing');
    audio.start();
    hud.setObjective('Find Mara’s gold beacon at Moreno Garage, or open Jobs [M].');
    hud.toast('Solmar. The coast is yours, Jax.', 'success');
    renderer.frame(player.state, STEP, { yaw: 0, mode: state.cameraMode, snap: true });
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
    const p = player.state;
    if (p.car) return exitCar();
    const car = vehicles.nearest(p.x, p.z);
    if (car && !car.wrecked) return enterCar(car);
    const job = missions.nearestStart(p.x, p.z);
    if (job) return missions.start(job.id);
    const race = missions.nearestRace(p.x, p.z);
    if (race) return missions.start(race.id);
    if (car?.wrecked) return hud.toast('That car is wrecked.');
    hud.toast('Nothing to use here. Look for a ride or a gold job beacon.');
  }
  function respray() {
    const result = missions.tryRespray(state.cash);
    if (!result) return hud.toast('Bring a car to Tideglass Auto to respray.', 'warning');
    state.cash -= result.cost;
    hud.toast(result.message, result.cost ? 'success' : 'warning');
    if (result.cost) saveNow();
  }
  function completeMission(event) {
    state.cash += event.reward;
    if (!state.completed.includes(event.id)) state.completed.push(event.id);
    element('complete-title').textContent = event.title;
    element('complete-cash').textContent = `+$${event.reward.toLocaleString('en-US')}`;
    element('complete-time').textContent = `${event.time.toFixed(1)}s`;
    const total = MISSIONS.order.length;
    element('complete-extra').textContent = `${state.completed.length} OF ${total} JOBS COMPLETE${state.completed.length === total ? ' • THE HARBOR IS OURS AGAIN' : ' • NEXT CONTACT UNLOCKED'}`;
    saveNow();
    setScreen('mission-complete');
  }
  function applyConsequence(kind) {
    if (state.screen !== 'playing') return;
    const arrested = kind === 'busted';
    const cashLost = Math.floor(state.cash * (arrested ? 0.18 : 0.12));
    const fee = Math.min(state.cash - cashLost, arrested ? POLICE.fine + police.state.wanted * 45 : 220);
    state.cash -= cashLost + fee;
    const p = player.state;
    const weaponLost = p.armed;
    p.armed = false;
    p.ammo = 0;
    missions.fail(arrested ? 'The patrol took you in. The job is off.' : 'The crew called off the job.');
    missions.takeEvents();
    if (p.car) exitCar();
    audio.update(0, {}, 0);
    hud.setConsequence(kind, { fee, cashLost, weaponLost });
    saveNow();
    setScreen(kind);
  }
  function busted() { applyConsequence('busted'); }
  function gameOver() { applyConsequence('gameover'); }
  function leaveBusted() {
    const arrested = state.screen === 'busted';
    if (!arrested && state.screen !== 'gameover') return;
    police.clear();
    combat.reset();
    Object.assign(player.state, { y: 0, verticalSpeed: 0, moving: 0, punchTimer: 0, health: arrested ? 75 : 100 });
    player.setPosition(PLAYER.spawn.x, PLAYER.spawn.z, 0);
    const car = vehicles.starter;
    car.health = 100; car.wrecked = false; car.speed = 0; car.x = 4.6; car.z = 100;
    car.heading = 0; car.driver = null;
    vehicles.update(0, state.time);
    state.yaw = state.cameraYaw = state.cameraOffset = 0;
    state.distance = CAMERA.distance;
    hud.setObjective('Find a gold job beacon or open Jobs [M].');
    setScreen('playing');
    renderer.frame(player.state, STEP, { yaw: 0, mode: state.cameraMode, snap: true });
  }
  function showJobs() {
    if (['busted','gameover','mission-complete'].includes(state.screen)) return;
    state.jobsOpen = hud.toggleMissionList([...missions.list, ...missions.races]);
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
        else if (state.screen === 'busted' || state.screen === 'gameover') leaveBusted();
        continue;
      }
      if (state.screen !== 'playing' || hud.missionListOpen) continue;
      if (action === ACTION_ENTER) interact();
      if (action === ACTION_CAMERA) {
        state.cameraMode = state.cameraMode === 'chase' ? 'classic' : 'chase';
        hud.toast(state.cameraMode === 'chase' ? 'Chase camera' : 'Classic camera');
      }
      if (action === ACTION_RADIO) {
        audio.start();
        audio.cycleStation();
        hud.setRadio(audio.station, audio.track);
      }
      if (action === ACTION_WORKSHOP) respray();
      if (action === ACTION_PUNCH && !player.state.car) combat.punch();
      if (action === ACTION_FIRE && !player.state.car) { player.state.heading = state.cameraYaw; audio.start(); combat.shoot(); }
      if (action === ACTION_JUMP && !player.state.car) jumpQueued = true;
    }
  }
  function step(dt) {
    if (state.screen !== 'playing' || hud.missionListOpen) return;
    state.time += dt;
    state.clock += dt * CLOCK.minutesPerSecond;
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
        if (missions.current?.route || ['first-fare','hot-wheels','beach-run'].includes(missions.current?.id)) missions.fail('The ride is wrecked.');
        exitCar(); p.health = Math.max(0, p.health - Math.round(15 * difficulty().damage)); hud.toast('The ride is done. Get clear!');
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
    for (const item of medallions) if (item.group.visible) {
      item.group.rotation.y = state.time * 1.7 + item.id;
      item.group.position.y = 1.15 + Math.sin(state.time * 2 + item.id) * 0.24;
      if (!p.car && distance(p, item) < 1.85) {
        state.medallions.add(item.id);
        item.group.visible = false;
        const all = state.medallions.size === COLLECTIBLE_TOTAL;
        const reward = all ? 1250 : 50;
        state.cash += reward;
        hud.toast(all ? 'Tide Medallion set complete • +$1,250' : `Tide Medallion ${state.medallions.size}/${COLLECTIBLE_TOTAL} • +$50`, 'success');
        audio.chime();
        saveNow();
      }
    }
    missions.update(dt, difficulty().timers);
    for (const event of missions.takeEvents()) {
      if (event.type === 'complete') completeMission(event);
      if (event.type === 'race-complete') {
        state.cash += event.reward;
        hud.toast(`${event.title} • ${event.time.toFixed(1)}s • +$${event.reward.toLocaleString('en-US')}`, 'success', 6);
        saveNow();
      }
      if (event.type === 'fail') hud.toast(event.reason,'warning');
    }
    player.animate(dt,state.time);
    vehicles.update(dt,state.time);
    audio.update(dt,p,police.state.wanted);
  }
  function updateHud() {
    const p=player.state;
    hud.setClock(1 + Math.floor(state.clock / CLOCK.day), Math.floor(state.clock % CLOCK.day));
    hud.setCollectibles(state.medallions.size, COLLECTIBLE_TOTAL);
    hud.setRadio(audio.station, audio.muted ? 'Muted' : audio.track);
    hud.setMoney(state.cash);hud.setHealth(p.health);hud.setWanted(police.state.wanted,police.state.outOfSight);hud.setSpeed(p.car?.speed || 0,!!p.car);
    element('district-name').textContent = p.z > 372 ? 'HARBOR & BEACH' : p.z > 270 ? 'OCEAN DRIVE' : p.z < -160 ? 'NORTH QUARTER' : 'SOLMAR';
    if (state.screen==='playing') {
      const start = missions.nearestStart(p.x,p.z) || missions.nearestRace(p.x,p.z);
      const car = !p.car && vehicles.nearest(p.x,p.z);
      const workshop = p.car && missions.nearWorkshop(p.x, p.z);
      hud.setHint(p.car ? (workshop ? `G — RESPRAY $${missions.workshop.fee}  •  E — EXIT CAR` : 'E — EXIT CAR  •  C — CAMERA  •  Q — RADIO') : car && !car.wrecked ? `${car.owned ? 'YOUR RIDE' : 'THEFT DRAWS PATROLS'}  •  M — JOBS` : start ? `E — START ${start.title.toUpperCase()}  •  M — JOBS` : `WASD — MOVE  •  SHIFT — RUN  •  ${p.armed ? `CLICK — FIRE (${p.ammo})  •  ` : ''}F — PUNCH  •  M — JOBS`, !!car && !car.wrecked);
    }
    const nextJob = !missions.current && missions.list.find(job => !job.locked && !job.completed);
    const target = missions.target || (state.screen === 'playing' && nextJob?.start) || null;
    hud.drawMinimap(city,p,state.cameraYaw,missions,police,navigate(city,p,target,police.hasLineOfSight));
  }
  const bind=(id,action)=>element(id).addEventListener('click',action);
  bind('btn-start',()=>startRun(false));
  bind('btn-continue',()=>startRun(true));
  bind('btn-jobs-title',showJobs);bind('btn-jobs',showJobs);
  bind('btn-resume',()=>setScreen('playing'));
  bind('btn-restart-pause',()=>startRun(false));bind('btn-restart',leaveBusted);
  bind('btn-walk',leaveBusted);bind('btn-continue-story',()=>setScreen('playing'));
  element('mission-list').addEventListener('click',event=>{
    if(event.target.closest('[data-close-jobs]')) { hud.hideMissionList();state.jobsOpen=false;return; }
    const row=event.target.closest('[data-mission]');
    if(!row||row.disabled)return;
    if(state.screen==='title')startRun(!!saved);
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
    const hour = state.screen === 'title' ? 17.35 : state.clock % CLOCK.day / 60;
    const night = renderer.setTimeOfDay(hour);
    city.updateNight(night);
    vehicles.updateNight(night, player.state.car);
    if(state.screen==='title') renderer.frameTitle(state.shotMode?0:now/1000);
    else renderer.frame(player.state,dt,{yaw:state.cameraYaw,pitch:state.pitch,distance:state.distance,mode:state.cameraMode,snap:!!state.shotMode,time:state.time});
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
