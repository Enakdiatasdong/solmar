import { MathUtils } from '../vendor/three.module.min.js';

// Stages only real game objects; every capture uses the same renderer as play.
export function stageShot(name, game) {
  const { state, player, vehicles, police, missions, traffic, hud }=game;
  if(!['start','play','end'].includes(name))return false;
  state.shotMode=name;
  if(name==='start') {
    state.shotMode='start';
    game.setScreen('title');
  } else {
    game.startRun(false);
    const car=vehicles.starter;
    car.x=name==='play'?0:288;
    car.z=name==='play'?246:266;
    car.heading=0;
    car.speed=name==='play'?28.8:0;
    game.enterCar(car);
    // Keep the camera car and its immediate road clear of initial traffic.
    for(const other of vehicles.cars) if(other!==car&&Math.hypot(other.x-car.x,other.z-car.z)<22) {
      other.x=-144;other.z=-100-vehicles.cars.indexOf(other)*7;
    }
    player.state.x=car.x;player.state.z=car.z;
    const shotPosition = { x: car.x, z: car.z };
    missions.start('first-fare');
    Object.assign(player.state, { x: 80, z: 152 });
    missions.update(1/60);
    Object.assign(player.state, shotPosition);
    missions.state.elapsed=name==='end'?46.8:29.4;
    if(name==='play') {
      const streetTraffic = vehicles.cars.filter(other => other.driver === 'traffic').slice(0, 3);
      const flow = [[-4.2, 299, 0], [4.2, 326, Math.PI], [27, 292.2, -Math.PI / 2]];
      streetTraffic.forEach((driver, i) => {
        [driver.x, driver.z, driver.heading] = flow[i];
      });
      police.setWanted(2);
      police.update(1/60,player.state,game.combat);
      police.copCars.forEach((cop,i)=>{cop.x=i?5:-6;cop.z=car.z+(i?22:6);cop.heading=i?Math.PI:0;cop.speed=23;});
      police.state.outOfSight = false;
      missions.setObjective('FIRST FARE • Passenger aboard. Reach Pier 9.', missions.target);
      hud.setDialogue('MARA','A simple fare, Jax. The patrol didn’t get the message.');
      state.cameraYaw=MathUtils.degToRad(-9);
      state.clock=20 * 60 + 6;
    } else {
      // Complete through the same event path that awards gameplay rewards.
      missions.complete();
      for(const event of missions.takeEvents())if(event.type==='complete')game.completeMission(event);
      game.exitCar();
      player.setPosition(291,266,0);
      state.cameraYaw=MathUtils.degToRad(17);
      state.clock=9 * 60 + 18;
    }
    state.shotMode=name;
    state.time=18;
    state.distance=name==='play'?16:15;
    state.pitch=name==='play'?0.30:0.42;
    vehicles.update(0,state.time);
    player.animate(0,state.time);
    traffic.update(0,player.state);
    document.getElementById('toasts').replaceChildren();
  }
  let painted=0;
  function ready() {
    if(++painted<4)requestAnimationFrame(ready);
    else window.__shotReady=true;
  }
  requestAnimationFrame(ready);
  return true;
}
