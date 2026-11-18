import * as THREE from '../vendor/three.module.min.js';
import { PLAYER } from './config.js';
import { resolveCollisions, clampToWorld } from './world.js';

// Jax is a rig of pivoted limbs, so every action remains visible at street scale.
export function createPlayer(city) {
  const group = new THREE.Group();
  const material = color => new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
  const jacket = material(0xdee3ce), shirt = material(0x177f7c), denim = material(0x26374a);
  const skin = material(0xb97a56), hair = material(0x24232a), shoes = material(0xede0c1);
  function box(w, h, d, mat, x, y, z, parent = group) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z); mesh.castShadow = true; parent.add(mesh); return mesh;
  }
  box(0.65, 0.68, 0.34, jacket, 0, 1.15, 0);
  box(0.18, 0.59, 0.355, shirt, 0, 1.16, 0.015);
  box(0.43, 0.43, 0.4, skin, 0, 1.72, 0);
  box(0.45, 0.17, 0.42, hair, 0, 1.94, -0.02);
  box(0.46, 0.25, 0.12, hair, 0, 1.78, -0.19);
  box(0.38, 0.065, 0.07, hair, 0, 1.77, 0.22);
  const arms = [], legs = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Group(); arm.position.set(side * 0.43, 1.43, 0); group.add(arm);
    box(0.22, 0.48, 0.25, jacket, 0, -0.22, 0, arm);
    box(0.18, 0.24, 0.19, skin, 0, -0.56, 0, arm); arms.push(arm);
    const leg = new THREE.Group(); leg.position.set(side * 0.17, 0.84, 0); group.add(leg);
    box(0.25, 0.67, 0.28, denim, 0, -0.33, 0, leg);
    box(0.27, 0.15, 0.43, shoes, 0, -0.72, 0.065, leg); legs.push(leg);
  }
  const state = { x: PLAYER.spawn.x, z: PLAYER.spawn.z, heading: 0, health: 100, ammo: 24, car: null, punchTimer: 0, y: 0, verticalSpeed: 0, moving: 0, run: false };
  let stride = 0;
  function setPosition(x, z, heading = state.heading) {
    const point = clampToWorld(x, z, PLAYER.radius);
    state.x = point.x; state.z = point.z; state.heading = heading;
    group.position.set(state.x, state.y, state.z); group.rotation.y = state.heading;
  }
  function reset() {
    Object.assign(state, { x: PLAYER.spawn.x, z: PLAYER.spawn.z, heading: 0, health: 100, ammo: 24, car: null, punchTimer: 0, y: 0, verticalSpeed: 0, moving: 0, run: false });
    stride = 0; setPosition(state.x, state.z, 0); group.visible = true;
  }
  function step(dt, intent = {}) {
    state.punchTimer = Math.max(0, state.punchTimer - dt);
    if (state.car) {
      state.x = state.car.x; state.z = state.car.z; state.heading = state.car.heading;
      state.moving = 0; group.visible = false; return;
    }
    group.visible = true;
    let x = intent.x || 0, z = intent.z || 0;
    const length = Math.hypot(x, z);
    if (length > 1) { x /= length; z /= length; }
    state.moving = Math.min(1, length); state.run = !!intent.sprint;
    const speed = state.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
    const resolved = resolveCollisions(city.colliders, state.x + x * speed * dt, state.z + z * speed * dt, PLAYER.radius);
    const bound = clampToWorld(resolved.x, resolved.z, PLAYER.radius);
    state.x = bound.x; state.z = bound.z;
    if (length > 0.05) {
      const goal = Math.atan2(x, z);
      state.heading += Math.atan2(Math.sin(goal - state.heading), Math.cos(goal - state.heading)) * Math.min(1, dt * 16);
    }
    if (intent.jump && state.y <= 0.001) state.verticalSpeed = PLAYER.jumpSpeed;
    state.verticalSpeed -= PLAYER.gravity * dt;
    state.y = Math.max(0, state.y + state.verticalSpeed * dt);
    if (state.y === 0) state.verticalSpeed = 0;
  }
  function animate(dt, time = 0) {
    stride += dt * (state.run ? 14 : 9) * state.moving;
    const swing = Math.sin(stride) * 0.62 * state.moving;
    legs[0].rotation.x = swing; legs[1].rotation.x = -swing;
    arms[0].rotation.x = -swing * 0.8; arms[1].rotation.x = swing * 0.8;
    if (state.punchTimer > 0) arms[1].rotation.x = -Math.sin((1 - state.punchTimer / PLAYER.punchCooldown) * Math.PI) * 1.9;
    if (state.y > 0) { legs[0].rotation.x = -0.55; legs[1].rotation.x = 0.35; }
    group.position.set(state.x, state.y + (state.y === 0 ? Math.abs(Math.sin(stride)) * 0.035 * state.moving : 0), state.z);
    group.rotation.y = state.heading;
    group.visible = !state.car;
  }
  reset();
  return { state, group, step, animate, reset, setPosition };
}
