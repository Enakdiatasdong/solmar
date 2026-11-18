// Reproducible editorial views use the same game objects as normal play.
import * as THREE from '../vendor/three.module.min.js';
import { syncCar } from './vehicles.js';

export function stageShot(name, game) {
  if (!['start', 'play', 'end'].includes(name)) return false;
  const { player, vehicles, traffic, missions, police, hud, render } = game;
  if (name === 'start') {
    game.setScreen('title');
    document.getElementById('btn-continue').hidden = true;
    render.frameTitle(0);
    game.shotFrozen = true;
    return true;
  }
  game.startRun(false);
  const car = vehicles.cars.find(item => item.starter);
  Object.assign(car, { x: 0, z: 252, heading: 0, speed: 29, vx: 0, vz: 29, stolen: true, driver: 'player' });
  syncCar(car);
  player.state.inCar = car;
  player.step(0, {}, 0);
  missions.start('first-fare');
  if (name === 'play') {
    missions.state.stage = 'dropoff';
    missions.state.elapsed = 24.6;
    // Advance the actual pickup transition to put the active marker at Pier 9.
    car.x = 80; car.z = 152; car.speed = 0;
    player.step(0, {}, 0);
    missions.state.stage = 'pickup';
    missions.update(.01);
    Object.assign(car, { x: 0, z: 252, speed: 29, vx: 0, vz: 29 });
    syncCar(car); player.step(0, {}, 0);
    hud.setDialogue('MARA', 'Pier 9, Jax. A smooth ride, a quiet handoff. Then we talk about your future.');
    hud.setObjective('FIRST FARE · Client aboard. Deliver to Pier 9. Keep it smooth.');
    police.setWanted(2);
    police.update(.01, player.state, {});
    police.state.copCars.forEach((cop, index) => {
      cop.x = index ? 4 : -4;
      cop.z = 264 + index * 13;
      cop.heading = 0;
      syncCar(cop);
    });
    // Keep a clean lane for the staged drive while retaining ambient street life.
    traffic.cars.forEach((ambient, index) => {
      if (Math.hypot(ambient.x, ambient.z - 252) < 18) {
        ambient.x = index % 2 ? 72 : -72;
        ambient.z = 215 + index * 3;
        syncCar(ambient);
      }
    });
    traffic.cars.slice(0, 2).forEach((ambient, index) => {
      Object.assign(ambient, { x: index ? -4 : 4, z: 307 + index * 24, heading: index ? 0 : Math.PI });
      syncCar(ambient);
    });
    traffic.pedestrians.slice(0, 2).forEach((person, index) => {
      person.x = index ? -12 : 12;
      person.z = 280 + index * 12;
      person.group.position.set(person.x, 0, person.z);
    });
    render.state.yaw = -.10;
    render.state.pitch = .39;
    render.state.zoom = 12;
    render.follow(player.state, 1, {});
    render.camera.lookAt(new THREE.Vector3(player.state.x, 1.3, player.state.z + 7));
  } else {
    Object.assign(car, { x: 80, z: 152, speed: 0, vx: 0, vz: 0 });
    player.step(0, {}, 0);
    missions.update(.1);
    Object.assign(car, { x: 288, z: 268, speed: 0 });
    syncCar(car); player.step(0, {}, 0);
    missions.state.elapsed = 46.7;
    missions.update(.1);
    for (const event of missions.takeEvents()) if (event.type === 'complete') game.completeMission(event);
    render.state.yaw = -.45;
    render.state.zoom = 13;
    render.follow(player.state, 1, {});
  }
  game.shotFrozen = true;
  return true;
}
