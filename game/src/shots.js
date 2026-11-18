import { MathUtils } from '../vendor/three.module.min.js';

// Stages only real game objects; every capture uses the same renderer as play.
export function stageShot(name, game) {
  const { state, player, vehicles, police, missions, traffic, hud }=game;
  if(!['start','play','end'].includes(name))return false;
  if(name==='start') {
    state.shotMode='start';
    game.setScreen('title');
  } else {
    game.startRun(false);
    const car=vehicles.starter;
    car.x=name==='play'?0:288;
    car.z=name==='play'?250:268;
    car.heading=0;
    car.speed=name==='play'?28.8:0;
    game.enterCar(car);
    // Keep the camera car and its immediate road clear of initial traffic.
    for(const other of vehicles.cars) if(other!==car&&Math.hypot(other.x-car.x,other.z-car.z)<22) {
      other.x=-144;other.z=-100-vehicles.cars.indexOf(other)*7;
    }
    player.state.x=car.x;player.state.z=car.z;
    missions.start('first-fare');
    missions.state.stage='dropoff';
    missions.state.elapsed=name==='end'?46.8:29.4;
    if(name==='play') {
      police.setWanted(2);
      police.update(1/60,player.state,game.combat);
      police.copCars.forEach((cop,i)=>{cop.x=i?5:-6;cop.z=car.z+(i?22:6);cop.heading=i?Math.PI:0;cop.speed=23;});
      hud.setObjective('FIRST FARE • Passenger aboard. Reach Pier 9. Keep your cool.');
      hud.setDialogue('MARA','A simple fare, Jax. The patrol didn’t get the message.');
      state.cameraYaw=MathUtils.degToRad(-9);
    } else {
      // Complete through the same event path that awards gameplay rewards.
      missions.complete();
      for(const event of missions.takeEvents())if(event.type==='complete')game.completeMission(event);
      game.exitCar();
      player.setPosition(291,268,0);
      state.cameraYaw=MathUtils.degToRad(17);
    }
    state.shotMode=name;
    state.time=18;
    state.distance=15;
    state.pitch=0.42;
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
