// Jax Moreno on foot: a simple articulated figure built from boxes, walked around with WASD,
// sprinting with Shift and jumping with Space. It owns its mesh, the walk cycle and health, and
// exposes enterCar/exitCar so the vehicle system can take over. Physics uses the shared city
// collider list; the camera orbit lives here because it follows the player's aim.
import * as THREE from '../vendor/three.module.min.js';
import { CAMERA, DEFAULT_OUTFIT, OUTFITS, PALETTE, PLAYER, SPAWN } from './config.js';
import { clampToWorld, resolveCollisions } from './world.js';

const SKIN = PALETTE.player;

function limb(width, height, depth, color) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshLambertMaterial({ color }),
  );
  mesh.castShadow = true;
  return mesh;
}

export function createPlayer(city) {
  const cityColliders = city?.colliders ?? [];
  const root = new THREE.Group();
  root.name = 'Jax';
  const body = new THREE.Group();
  body.name = 'Jax body';
  root.add(body);

  const hips = new THREE.Group();
  hips.position.y = 0.92;
  body.add(hips);

  const torso = limb(0.56, 0.66, 0.34, SKIN.jacket);
  torso.name = 'jacket-torso';
  torso.position.y = 0.3;
  hips.add(torso);
  const jacketMaterials = [torso.material];

  const stripe = limb(0.1, 0.3, 0.36, SKIN.accent);
  stripe.position.set(0.16, 0.4, 0.005);
  hips.add(stripe);

  const neck = limb(0.16, 0.1, 0.16, SKIN.skin);
  neck.position.y = 0.68;
  hips.add(neck);

  const head = new THREE.Group();
  head.position.y = 0.82;
  hips.add(head);
  const skull = limb(0.34, 0.36, 0.32, SKIN.skin);
  head.add(skull);
  const hair = limb(0.36, 0.13, 0.34, SKIN.hair);
  hair.position.y = 0.15;
  head.add(hair);
  const hairBack = limb(0.3, 0.16, 0.06, SKIN.hair);
  hairBack.position.set(0, 0.06, -0.15);
  head.add(hairBack);
  for (const side of [-1, 1]) {
    const eye = limb(0.05, 0.05, 0.02, 0x241c18);
    eye.position.set(side * 0.08, 0.02, 0.165);
    head.add(eye);
  }

  const arms = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.35, 0.58, 0);
    hips.add(pivot);
    const upper = limb(0.15, 0.42, 0.17, SKIN.jacket);
    upper.name = 'jacket-sleeve';
    upper.position.y = -0.19;
    pivot.add(upper);
    jacketMaterials.push(upper.material);
    const forearm = limb(0.13, 0.36, 0.15, SKIN.skin);
    forearm.position.y = -0.56;
    pivot.add(forearm);
    const fist = limb(0.15, 0.13, 0.16, SKIN.skin);
    fist.position.y = -0.77;
    pivot.add(fist);
    arms.push(pivot);
  }

  const legs = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.15, -0.02, 0);
    hips.add(pivot);
    const thigh = limb(0.19, 0.44, 0.22, SKIN.jeans);
    thigh.position.y = -0.2;
    pivot.add(thigh);
    const knee = new THREE.Group();
    knee.position.y = -0.4;
    pivot.add(knee);
    const shin = limb(0.17, 0.42, 0.19, SKIN.jeans);
    shin.position.y = -0.21;
    knee.add(shin);
    const shoe = limb(0.19, 0.12, 0.3, 0x26221f);
    shoe.position.set(0, -0.47, 0.05);
    knee.add(shoe);
    legs.push({ pivot, knee });
  }

  const state = {
    x: SPAWN.x,
    y: 0,
    z: SPAWN.z,
    heading: SPAWN.heading,
    vy: 0,
    grounded: true,
    jetpackFlying: false,
    health: PLAYER.health,
    maxHealth: PLAYER.health,
    outfit: DEFAULT_OUTFIT,
    speed: 0,
    moving: false,
    running: false,
    inCar: null,
    alive: true,
    invuln: 0,
    walkPhase: 0,
    punchTimer: 0,
    aimPitch: 0,
    aimYaw: 0,
    radius: PLAYER.radius,
  };
  const orbit = { yaw: 0, pitch: CAMERA.pitch, distance: CAMERA.distance };

  function reset() {
    if (state.inCar) {
      state.inCar.state.occupied = false;
    }
    state.x = SPAWN.x;
    state.y = 0;
    state.z = SPAWN.z;
    state.heading = SPAWN.heading;
    state.vy = 0;
    state.grounded = true;
    state.jetpackFlying = false;
    state.health = PLAYER.health;
    state.speed = 0;
    state.moving = false;
    state.running = false;
    state.inCar = null;
    state.alive = true;
    state.invuln = 0;
    state.punchTimer = 0;
    orbit.yaw = 0;
    orbit.pitch = CAMERA.pitch;
    root.visible = true;
    syncMesh();
  }

  function forwardVector() {
    const current = state.inCar ? state.inCar.state.heading : state.heading;
    return { x: Math.sin(current), z: Math.cos(current) };
  }

  function syncMesh() {
    root.position.set(state.x, state.y, state.z);
    body.rotation.y = state.inCar ? state.inCar.state.heading : state.heading;
    body.visible = !state.inCar;
  }

  function animate(dt) {
    if (state.inCar) return;
    const moving = state.moving && state.grounded;
    if (moving) state.walkPhase += dt * (state.running ? 13 : 8);
    const swing = moving ? Math.sin(state.walkPhase) * (state.running ? 0.95 : 0.6) : 0;
    legs[0].pivot.rotation.x = swing;
    legs[1].pivot.rotation.x = -swing;
    legs[0].knee.rotation.x = 0;
    legs[1].knee.rotation.x = 0;
    arms[0].rotation.x = -swing * 0.8;
    arms[1].rotation.x = swing * 0.8;
    if (!state.grounded) {
      if (state.jetpackFlying) {
        legs[0].pivot.rotation.x = -0.55;
        legs[1].pivot.rotation.x = -0.38;
        legs[0].knee.rotation.x = 1.2;
        legs[1].knee.rotation.x = 1.03;
        arms[0].rotation.x = -0.3;
        arms[1].rotation.x = -0.3;
      } else {
        legs[0].pivot.rotation.x = -0.4;
        legs[1].pivot.rotation.x = 0.25;
        arms[0].rotation.x = -0.9;
        arms[1].rotation.x = -0.9;
      }
    }
    if (state.punchTimer > 0) {
      const progress = 1 - state.punchTimer / PLAYER.punchCooldown;
      const punch = Math.sin(Math.min(1, progress * 1.6) * Math.PI) * 1.9;
      arms[1].rotation.x = -punch;
      arms[1].rotation.z = -0.12;
    } else {
      arms[1].rotation.z = 0;
    }
    if (state.aiming) {
      arms[0].rotation.x = -1.35;
      arms[1].rotation.x = -1.35;
    }
    hips.position.y = 0.92 + (moving ? Math.abs(Math.sin(state.walkPhase)) * 0.035 : 0);
    torso.rotation.x = state.running ? 0.11 : 0;
  }

  /** Move on foot. Returns { moved, jumped }. Cars are handled by vehicles.js, not here. */
  function step(dt, intent, colliders = cityColliders) {
    if (state.inCar || !state.alive) return { moved: false, jumped: false };
    state.invuln = Math.max(0, state.invuln - dt);
    state.punchTimer = Math.max(0, state.punchTimer - dt);

    let moveX = intent.x;
    let moveZ = intent.z;
    const magnitude = Math.hypot(moveX, moveZ);
    if (magnitude > 1) {
      moveX /= magnitude;
      moveZ /= magnitude;
    }
    const wantsRun = intent.run;
    const maxSpeed = wantsRun ? PLAYER.runSpeed : PLAYER.walkSpeed;
    const moving = magnitude > 0.08;
    state.moving = moving;
    state.running = moving && wantsRun;
    if (moving) {
      const target = Math.atan2(moveX, moveZ);
      let delta = target - state.heading;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      state.heading += delta * Math.min(1, dt * 14);
    }
    const actualSpeed = moving ? (state.grounded ? maxSpeed : maxSpeed * 0.82) : 0;
    state.speed = actualSpeed;

    // The jetpack integrates height after this step. Horizontal movement still uses
    // the same intent and world colliders as walking.
    if (!intent.jetpack) {
      if (intent.jump && state.grounded) {
        state.vy = PLAYER.jumpSpeed;
        state.grounded = false;
      }
      state.vy -= PLAYER.gravity * dt;
      state.y += state.vy * dt;
      if (state.y <= 0) {
        state.y = 0;
        state.vy = 0;
        state.grounded = true;
      }
    }

    let nextX = state.x + moveX * actualSpeed * dt;
    let nextZ = state.z + moveZ * actualSpeed * dt;
    const resolved = resolveCollisions(colliders, nextX, nextZ, PLAYER.radius);
    const bounded = clampToWorld({ x: resolved.x, z: resolved.z });
    state.x = bounded.x;
    state.z = bounded.z;
    if (!intent.jetpack) {
      syncMesh();
      animate(dt);
    }
    return { moved: moving, jumped: state.vy > 0 };
  }

  function hurt(amount, source) {
    if (!state.alive || state.invuln > 0) return false;
    state.health = Math.max(0, state.health - amount);
    state.invuln = 0.35;
    if (state.health <= 0) state.alive = false;
    return { health: state.health, alive: state.alive, source };
  }

  function heal(amount) {
    state.health = Math.min(state.maxHealth, state.health + amount);
  }

  function setOutfit(id) {
    const outfit = OUTFITS.find((choice) => choice.id === id);
    if (!outfit) return false;
    for (const material of jacketMaterials) material.color.setHex(outfit.color);
    state.outfit = outfit.id;
    return true;
  }

  function enterCar(car) {
    state.inCar = car;
    state.x = car.state.x;
    state.y = 0;
    state.z = car.state.z;
    state.heading = car.state.heading;
    state.speed = car.state.speed;
    state.moving = false;
    state.jetpackFlying = false;
    root.visible = false;
    car.state.occupied = true;
  }

  function exitCar(position, heading) {
    const car = state.inCar;
    if (!car) return null;
    state.inCar = null;
    state.x = position.x;
    state.z = position.z;
    state.y = 0;
    state.heading = heading;
    root.visible = true;
    car.state.occupied = false;
    orbit.yaw = heading + Math.PI;
    syncMesh();
    return car;
  }

  function forward() {
    return { x: Math.sin(state.heading), z: Math.cos(state.heading) };
  }

  return {
    group: root,
    body,
    state,
    orbit,
    reset,
    step,
    hurt,
    heal,
    setOutfit,
    enterCar,
    exitCar,
    syncMesh,
    animate,
    forward,
    forwardVector,
  };
}
