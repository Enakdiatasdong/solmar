// Deterministic screenshot staging using the game's seeded world and its live systems.
import { CAMERA, MISSIONS, SPAWN, STARTER_CAR, STEP } from './config.js';

const FIXED_STEP_COUNT = 120;
const STARTER_POSITION = STARTER_CAR;

function setReady(value) {
  if (typeof window !== 'undefined') window.__shotReady = value;
}

function prepareFreshRun(game) {
  const { player, vehicles, police, combat, missions, state, orbit } = game;
  player.reset();
  missions.reset();
  missions.setProgress([]);
  game.regions?.reset();
  game.rep?.reset(0);
  police.clear();
  combat.reset();
  game.assets.reset();
  game.restaurants.reset();
  game.safehouses.reset();
  state.respawn = { x: SPAWN.x, z: SPAWN.z };

  for (let index = vehicles.cars.length - 1; index >= 0; index -= 1) {
    const car = vehicles.cars[index];
    car.state.occupied = false;
    if (car.kind === 'mission' || car.kind === 'police') {
      game.renderer.scene.remove(car.group);
      vehicles.cars.splice(index, 1);
    }
  }
  const starter = vehicles.cars.find((car) => car.id === 'starter');
  if (starter) {
    vehicles.repair(starter);
    starter.state.speed = 0;
    vehicles.setCarPosition(starter, STARTER_POSITION.x, STARTER_POSITION.z, STARTER_POSITION.heading);
  }

  state.cash = MISSIONS.startCash;
  state.missionBest = {};
  state.completed = [];
  state.finalMission = null;
  state.bustedFine = 0;
  state.elapsed = 0;
  state.started = true;
  orbit.yaw = 0;
  orbit.pitch = CAMERA.pitch;
  orbit.distance = CAMERA.distance;
  player.state.x = 7.4;
  player.state.z = STARTER_CAR.z;
  player.state.heading = 0;
  player.syncMesh();
  missions.takeEvents();
}

function freezeMissionVisuals(scene) {
  scene.traverse((node) => {
    const { ring, gem, beam } = node.userData || {};
    if (ring) {
      ring.rotation.z = 0;
      ring.scale.setScalar(1);
    }
    if (gem) {
      gem.rotation.y = 0;
      gem.position.y = 3.2;
    }
    if (beam?.material) beam.material.opacity = 0.16;
  });
}

function fixedAdvance(game, count, controls = null) {
  const { player, vehicles, traffic, missions, police, combat, city } = game;
  for (let index = 0; index < count; index += 1) {
    const car = player.state.inCar;
    if (car) {
      vehicles.stepCar(car, STEP, controls || {
        accelerate: false,
        brake: false,
        left: false,
        right: false,
        handbrake: false,
      }, city.colliders);
      player.state.x = car.state.x;
      player.state.z = car.state.z;
      player.state.heading = car.state.heading;
    } else {
      player.syncMesh();
    }
    traffic.update(STEP, player, vehicles);
    combat.update(STEP, player);
    police.update(STEP, player, combat);
    missions.update(STEP);
    game.state.elapsed += STEP;
  }
}

export function stageShot(name, game) {
  const shot = name === 'play' || name === 'end' ? name : 'start';
  const { player, vehicles, missions, hud, renderer, orbit, state, setScreen } = game;
  setReady(false);
  prepareFreshRun(game);

  if (shot === 'start') {
    setScreen('title');
    hud.setVisible(false);
    renderer.frameTitle();
    fixedAdvance(game, FIXED_STEP_COUNT);
    freezeMissionVisuals(renderer.scene);
    setReady(true);
    return {
      screen: 'title',
      update() {},
    };
  }

  if (shot === 'play') {
    player.state.x = 0;
    player.state.z = 236;
    player.syncMesh();
    missions.start('first-fare');
    const starter = vehicles.cars.find((car) => car.id === 'starter');
    if (starter) {
      vehicles.setCarPosition(starter, 0, 250, 0);
      player.enterCar(starter);
    }
    orbit.yaw = 0.35;
    orbit.pitch = 0.24;
    orbit.distance = 9.4;
    state.cash = 1200;
    setScreen('playing');
    hud.setHint('E — exit car');
    fixedAdvance(game, FIXED_STEP_COUNT, {
      accelerate: true,
      brake: false,
      left: false,
      right: false,
      handbrake: false,
    });
    freezeMissionVisuals(renderer.scene);
    setReady(true);
    return {
      screen: 'playing',
      update() {},
    };
  }

  // Put the actual first-fare state machine at its drop-off, then let it issue the completion.
  const starter = vehicles.cars.find((car) => car.id === 'starter');
  missions.start('first-fare');
  if (starter) {
    vehicles.setCarPosition(starter, 288, 268, Math.PI / 2);
    player.enterCar(starter);
    player.state.x = starter.state.x;
    player.state.z = starter.state.z;
    player.state.heading = starter.state.heading;
  }
  missions.state.stage = 'dropoff';
  missions.state.elapsed = 46.8;
  if (starter) starter.state.speed = 0;
  const event = missions.complete();
  missions.takeEvents();
  freezeMissionVisuals(renderer.scene);
  if (event) game.completeMission(event);
  else setScreen('mission-complete');
  setReady(true);
  return {
    screen: 'mission-complete',
    update() {},
  };
}
