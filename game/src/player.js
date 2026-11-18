import * as THREE from '../vendor/three.module.min.js';
import { clampToWorld, resolveCollisions } from './world.js';

// Jax is built from simple solids, keeping his silhouette readable at city scale.
export function createPerson(options = {}) {
  const group = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: options.shirt ?? 0x116c70 });
  const skin = new THREE.MeshLambertMaterial({ color: options.skin ?? 0xba7953 });
  const trousers = new THREE.MeshLambertMaterial({ color: options.trousers ?? 0x22344b });
  const shoes = new THREE.MeshLambertMaterial({ color: 0xf7efda });
  const dark = new THREE.MeshLambertMaterial({ color: 0x20212a });
  const box = (w, h, d, material, x, y, z, parent = group) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const torso = box(.68, .72, .36, shirt, 0, 1.18, 0);
  const head = box(.4, .43, .4, skin, 0, 1.8, .015);
  box(.43, .13, .43, dark, 0, 2.02, -.025);
  box(.27, .065, .035, dark, 0, 1.83, .225);
  const arms = [], legs = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(side * .46, 1.47, 0);
    box(.2, .38, .24, shirt, 0, -.17, 0, arm);
    box(.18, .3, .2, skin, 0, -.48, 0, arm);
    group.add(arm);
    arms.push(arm);
    const leg = new THREE.Group();
    leg.position.set(side * .19, .85, 0);
    box(.26, .7, .28, trousers, 0, -.32, 0, leg);
    box(.28, .15, .43, shoes, 0, -.74, .07, leg);
    group.add(leg);
    legs.push(leg);
  }
  group.userData.limbs = { arms, legs, torso, head };
  return group;
}

export function createPlayer(city) {
  const group = createPerson();
  const state = { x: 2, z: 88, y: 0, heading: 0, health: 100, inCar: null, punchTimer: 0, grounded: true, velocityY: 0, speed: 0, alive: true };
  let stride = 0;
  const sync = () => {
    group.visible = !state.inCar;
    group.position.set(state.x, state.y, state.z);
    group.rotation.y = state.heading;
  };
  function animate(dt) {
    stride += dt * state.speed * 1.7;
    const { arms, legs, torso } = group.userData.limbs;
    const swing = Math.sin(stride) * Math.min(.75, state.speed * .1);
    legs[0].rotation.x = swing;
    legs[1].rotation.x = -swing;
    arms[0].rotation.x = -swing;
    arms[1].rotation.x = state.punchTimer > 0 ? -1.8 * Math.sin(Math.min(1, state.punchTimer / .42) * Math.PI) : swing;
    torso.position.y = 1.18 + (state.grounded ? Math.abs(Math.sin(stride)) * .045 : .04);
    if (!state.grounded) {
      legs[0].rotation.x -= .5;
      legs[1].rotation.x += .3;
      arms[0].rotation.z = -.18;
      arms[1].rotation.z = .18;
    } else {
      arms[0].rotation.z = 0;
      arms[1].rotation.z = 0;
    }
    state.punchTimer = Math.max(0, state.punchTimer - dt);
    sync();
  }
  function step(dt, intent = {}, yaw = 0) {
    state.alive = state.health > 0;
    if (state.inCar) {
      state.x = state.inCar.x;
      state.z = state.inCar.z;
      state.y = 0;
      state.heading = state.inCar.heading;
      state.speed = 0;
      animate(dt);
      return;
    }
    const forward = Number(intent.forward) || 0;
    const right = Number(intent.right) || 0;
    const length = Math.max(1, Math.hypot(forward, right));
    const speed = state.alive ? (intent.sprint ? 8.7 : 4.8) : 0;
    const dx = (Math.sin(yaw) * forward - Math.cos(yaw) * right) / length;
    const dz = (Math.cos(yaw) * forward + Math.sin(yaw) * right) / length;
    state.speed = Math.hypot(dx, dz) * speed;
    if (state.speed > .01) state.heading = Math.atan2(dx, dz);
    const resolved = resolveCollisions(city.colliders, state.x + dx * speed * dt, state.z + dz * speed * dt, .48);
    const bounded = clampToWorld(resolved.x, resolved.z, .48);
    state.x = bounded.x;
    state.z = bounded.z;
    if (intent.jump && state.grounded && state.alive) {
      state.velocityY = 7.1;
      state.grounded = false;
    }
    if (!state.grounded) {
      state.velocityY -= 20 * dt;
      state.y += state.velocityY * dt;
      if (state.y <= 0) {
        state.y = 0;
        state.velocityY = 0;
        state.grounded = true;
      }
    }
    animate(dt);
  }
  function teleport(x, z) {
    const safe = clampToWorld(x, z, .48);
    state.x = safe.x;
    state.z = safe.z;
    state.y = 0;
    state.velocityY = 0;
    state.grounded = true;
    sync();
  }
  function damage(amount) {
    state.health = Math.max(0, state.health - Math.max(0, amount));
    state.alive = state.health > 0;
  }
  function reset() {
    Object.assign(state, { x: 2, z: 88, y: 0, heading: 0, health: 100, inCar: null, punchTimer: 0, grounded: true, velocityY: 0, speed: 0, alive: true });
    stride = 0;
    sync();
  }
  sync();
  return { group, state, step, teleport, damage, reset, animate };
}
