// The pack is mounted to Jax's body; both the pack and its exhaust turn with him.
import * as THREE from '../vendor/three.module.min.js';

export const JETPACK_PRICE = 1500;

const MAX_FUEL = 100;
const FUEL_PER_SECOND = 14;
const FIELD_REFUEL_RATE = 10;
const SAFEHOUSE_REFUEL_RATE = 30;
const LIFT = 15;
const MAX_CLIMB = 9;
const GLIDE_SPEED = 1.2;
const DESCENT_SPEED = 2.4;

function buildPack() {
  const group = new THREE.Group();
  group.name = 'Jetpack';
  group.visible = false;
  group.position.set(0, 1.23, -0.25);
  const exhaust = new THREE.Group();
  exhaust.name = 'Jetpack exhaust';
  exhaust.visible = false;
  group.add(exhaust);

  const frame = new THREE.MeshLambertMaterial({ color: 0x303a43 });
  const tank = new THREE.MeshLambertMaterial({ color: 0x879fa4 });
  const band = new THREE.MeshLambertMaterial({ color: 0xc18a42 });
  const flame = new THREE.MeshBasicMaterial({ color: 0xff8b36 });
  const flameCore = new THREE.MeshBasicMaterial({ color: 0xffce6a });
  const smokeGeometry = new THREE.IcosahedronGeometry(1, 0);
  const flames = [];
  const particles = [];

  function mount(geometry, material, x, y, z) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    group.add(mesh);
  }

  mount(new THREE.BoxGeometry(0.5, 0.48, 0.12), frame, 0, 0, 0);
  mount(new THREE.BoxGeometry(0.48, 0.105, 0.17), frame, 0, -0.19, -0.035);
  mount(new THREE.BoxGeometry(0.09, 0.12, 0.04), band, 0, 0.08, -0.072);
  for (const side of [-1, 1]) {
    const x = side * 0.18;
    const z = -0.095;
    mount(new THREE.CylinderGeometry(0.093, 0.105, 0.53, 10), tank, x, 0.035, z);
    mount(new THREE.CylinderGeometry(0.098, 0.102, 0.075, 10), band, x, 0.195, z);
    mount(new THREE.CylinderGeometry(0.074, 0.12, 0.16, 10), frame, x, -0.28, z);

    const jet = new THREE.Group();
    jet.position.set(x, -0.36, z);
    exhaust.add(jet);
    for (const [radius, length, material] of [[0.1, 0.58, flame], [0.058, 0.41, flameCore]]) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(radius, length, 9), material);
      cone.position.y = -length / 2;
      cone.rotation.x = Math.PI;
      jet.add(cone);
    }
    flames.push(jet);

    for (let index = 0; index < 3; index += 1) {
      const material = new THREE.MeshBasicMaterial({
        color: 0xb4a49a, transparent: true, depthWrite: false,
      });
      const mesh = new THREE.Mesh(smokeGeometry, material);
      exhaust.add(mesh);
      particles.push({ mesh, x, z, side, offset: index / 3 });
    }
  }

  return { group, exhaust, flames, particles };
}

export function createJetpack(_scene, player) {
  const { group, exhaust, flames, particles } = buildPack();
  player.body.add(group);
  const state = {
    owned: false, fuel: MAX_FUEL, maxFuel: MAX_FUEL,
    active: false, thrusting: false, refuelRate: FIELD_REFUEL_RATE,
  };
  const rider = player.state;
  let exhaustPhase = 0;

  function isFlying() {
    return state.active && !rider.inCar && !rider.grounded;
  }

  function deactivate() {
    state.active = false;
    state.thrusting = false;
    exhaust.visible = false;
    exhaustPhase = 0;
    if (rider.jetpackFlying) {
      rider.jetpackFlying = false;
      player.animate(0);
    }
  }

  function reset() {
    deactivate();
    state.owned = false;
    state.fuel = state.maxFuel;
    state.refuelRate = FIELD_REFUEL_RATE;
    group.visible = false;
  }

  function unlock() {
    if (state.owned) return false;
    state.owned = true;
    state.fuel = state.maxFuel;
    group.visible = true;
    return true;
  }

  function buy(cash) {
    return Number.isFinite(cash) && cash >= JETPACK_PRICE && !rider.inCar && rider.grounded && unlock();
  }

  function setFuel(value) {
    if (Number.isFinite(value)) state.fuel = THREE.MathUtils.clamp(value, 0, state.maxFuel);
    if (state.fuel === 0) deactivate();
    return state.fuel;
  }

  function refuel(amount = state.maxFuel) {
    if (!Number.isFinite(amount) || amount <= 0) return state.fuel;
    return setFuel(state.fuel + amount);
  }

  function toggle() {
    if (state.active) {
      deactivate();
      return true;
    }
    if (!state.owned || state.fuel <= 0 || rider.inCar || !rider.alive) return false;
    state.active = true;
    return true;
  }

  function animateExhaust(dt) {
    exhaust.visible = state.thrusting;
    if (!state.thrusting) return;
    exhaustPhase += dt;
    flames.forEach((jet, index) => {
      jet.scale.y = 0.93 + 0.13 * Math.sin(exhaustPhase * 49 + index * 2);
    });
    for (const { mesh, x, z, side, offset } of particles) {
      const age = (exhaustPhase * 2.5 + offset) % 1;
      mesh.position.set(x + side * age * 0.14, -0.7 - age * 0.84, z - age * 0.14);
      mesh.scale.setScalar(0.035 + age * 0.14);
      mesh.material.opacity = (1 - age) * 0.46;
    }
  }

  function update(dt, controls = {}, nearSafehouse = false) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    state.refuelRate = nearSafehouse ? SAFEHOUSE_REFUEL_RATE : FIELD_REFUEL_RATE;
    group.visible = state.owned;
    if (rider.inCar || !rider.alive || !state.owned) deactivate();
    if (state.active) {
      // The player step handles heading, horizontal movement and collisions.
      // Integrate the pack's vertical movement before syncing the mesh and pose.
      state.thrusting = Boolean(controls.jump && !controls.descend && state.fuel > 0);
      if (state.thrusting) {
        const burnTime = Math.min(dt, state.fuel / FUEL_PER_SECOND);
        rider.vy = Math.min(MAX_CLIMB, rider.vy + LIFT * burnTime);
        rider.y += rider.vy * burnTime;
        setFuel(state.fuel - FUEL_PER_SECOND * burnTime);
      } else {
        rider.vy = controls.descend ? -DESCENT_SPEED : -GLIDE_SPEED;
        rider.y += rider.vy * dt;
      }
      rider.grounded = rider.y <= 0;
      if (rider.grounded) {
        rider.y = 0;
        rider.vy = 0;
      }
      rider.jetpackFlying = isFlying();
      player.syncMesh();
      player.animate(dt);
    }
    if (state.owned && rider.alive && rider.grounded) refuel(state.refuelRate * dt);
    animateExhaust(dt);
  }

  return {
    state, mesh: group, group, update, unlock, refuel, setFuel,
    buy, isFlying, toggle, deactivate, reset,
  };
}
