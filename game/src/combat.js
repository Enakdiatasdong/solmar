import * as THREE from '../vendor/three.module.min.js';
import { createPerson } from './player.js';
import { resolveCollisions, clampToWorld } from './world.js';

// Return the first point of a two-dimensional shot entering a solid building.
function rayBoxDistance(x, z, dx, dz, box, range) {
  let low = .05, high = range;
  for (const [start, direction, minimum, maximum] of [
    [x, dx, box.minX, box.maxX], [z, dz, box.minZ, box.maxZ],
  ]) {
    if (!Number.isFinite(minimum) || !Number.isFinite(maximum)) continue;
    if (Math.abs(direction) < 1e-8) {
      if (start < minimum || start > maximum) return Infinity;
    } else {
      let first = (minimum - start) / direction, last = (maximum - start) / direction;
      if (first > last) [first, last] = [last, first];
      low = Math.max(low, first);
      high = Math.min(high, last);
      if (low > high) return Infinity;
    }
  }
  return low;
}

export function createCombat(scene, getPlayer, getCity) {
  const state = { ammo: 24, punchCooldown: 0, fireCooldown: 0, shots: 0 };
  const enemies = [], effects = [];
  let targets = { pedestrians: [], footCops: [] };
  let callbacks = {};
  const readPlayer = () => { const player = getPlayer(); return player?.state ?? player; };
  const live = entity => entity && entity.alive !== false && !entity.down && entity.health > 0;
  const allTargets = () => [...enemies, ...targets.footCops, ...targets.pedestrians].filter(live);
  function wallDistance(x, z, dx, dz, range) {
    const colliders = getCity()?.colliders ?? [];
    let first = range;
    for (const collider of colliders) first = Math.min(first, rayBoxDistance(x, z, dx, dz, collider, range));
    return first;
  }
  function visible(from, to) {
    const dx = to.x - from.x, dz = to.z - from.z, distance = Math.hypot(dx, dz);
    return wallDistance(from.x, from.z, dx / (distance || 1), dz / (distance || 1), distance) >= distance - .3;
  }
  function tracer(from, to, hostile = false) {
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(from.x, from.y ?? 1.45, from.z),
      new THREE.Vector3(to.x, to.y ?? 1.35, to.z),
    ]);
    const material = new THREE.LineBasicMaterial({ color: hostile ? 0xff7464 : 0xffe08b, transparent: true, opacity: .9 });
    const line = new THREE.Line(geometry, material);
    scene.add(line);
    effects.push({ group: line, time: .095, geometry, material });
    const flash = new THREE.Mesh(new THREE.IcosahedronGeometry(.22, 0), new THREE.MeshBasicMaterial({ color: hostile ? 0xffae61 : 0xfff3b4 }));
    flash.position.set(from.x, from.y ?? 1.45, from.z);
    scene.add(flash);
    effects.push({ group: flash, time: .065, geometry: flash.geometry, material: flash.material });
  }
  function damageTarget(target, damage) {
    if (!live(target)) return false;
    target.health = Math.max(0, target.health - damage);
    const pedestrian = targets.pedestrians.includes(target);
    if (pedestrian || target.health === 0) {
      target.health = 0;
      target.alive = false;
      target.down = true;
      target.deadTime = 0;
    }
    return true;
  }
  function punch() {
    const player = readPlayer();
    if (!player || player.inCar || player.health <= 0 || state.punchCooldown > 0) return false;
    state.punchCooldown = .42;
    player.punchTimer = .42;
    const dx = Math.sin(player.heading), dz = Math.cos(player.heading);
    let target = null, nearest = 2.6;
    for (const candidate of allTargets()) {
      const x = candidate.x - player.x, z = candidate.z - player.z;
      const distance = Math.hypot(x, z);
      const front = (x * dx + z * dz) / (distance || 1);
      if (distance < nearest && front > -.15 && visible(player, candidate)) { target = candidate; nearest = distance; }
    }
    if (target) {
      damageTarget(target, 34);
      callbacks.onPunch?.(target);
      callbacks.toast?.(target.alive ? 'Solid hit.' : (target.isCop ? 'Officer down.' : 'Down for the count.'));
    }
    return target ?? true;
  }
  function shoot(heading) {
    const player = readPlayer();
    if (!player || player.inCar || player.health <= 0 || state.fireCooldown > 0) return false;
    if (state.ammo <= 0) { callbacks.toast?.('The pistol is empty.'); state.fireCooldown = .3; return false; }
    state.ammo--;
    state.shots++;
    state.fireCooldown = .24;
    const angle = Number.isFinite(heading) ? heading : player.heading;
    player.heading = angle;
    const dx = Math.sin(angle), dz = Math.cos(angle);
    const range = wallDistance(player.x, player.z, dx, dz, 58);
    let target = null, hitDistance = range;
    for (const candidate of allTargets()) {
      const x = candidate.x - player.x, z = candidate.z - player.z;
      const forward = x * dx + z * dz;
      const lateral = Math.abs(x * dz - z * dx);
      if (forward > .15 && forward < hitDistance && lateral < .85) { target = candidate; hitDistance = forward; }
    }
    tracer({ x: player.x + dx * .65, z: player.z + dz * .65, y: 1.43 + (player.y ?? 0) }, { x: player.x + dx * hitDistance, z: player.z + dz * hitDistance, y: 1.35 });
    if (target) damageTarget(target, 45);
    callbacks.onShot?.(player.x, player.z);
    return target ?? true;
  }
  function spawnEnemy(x, z, options = {}) {
    if (typeof x === 'object') { options = x; z = x.z; x = x.x; }
    const group = createPerson({ shirt: options.color ?? 0xd2683b, trousers: 0x353a4b, skin: options.skin ?? 0xad724e });
    const hardhat = new THREE.Mesh(new THREE.BoxGeometry(.49, .19, .48), new THREE.MeshLambertMaterial({ color: 0xf5be42 }));
    hardhat.position.y = 2.1;
    group.add(hardhat);
    const pistol = new THREE.Mesh(new THREE.BoxGeometry(.12, .12, .42), new THREE.MeshLambertMaterial({ color: 0x293034 }));
    pistol.position.set(-.47, .98, .25);
    group.add(pistol);
    group.position.set(x, 0, z);
    scene.add(group);
    const enemy = { x, z, group, health: options.health ?? 60, alive: true, down: false, heading: 0, shootTimer: 1 + enemies.length * .27, deadTime: 0, phase: 0, role: options.role ?? 'dockworker', id: options.id ?? `dock-${enemies.length + 1}`, ...options };
    // Geometry and coordinates always belong to this spawn, even for reused option bags.
    enemy.group = group;
    enemy.x = x;
    enemy.z = z;
    enemies.push(enemy);
    return enemy;
  }
  function shootAtPlayer(shooter) {
    const player = readPlayer();
    if (!player || player.health <= 0 || !shooter || shooter.alive === false) return false;
    const distance = Math.hypot(shooter.x - player.x, shooter.z - player.z);
    if (distance < 3 || distance > 30 || !visible(shooter, player)) return false;
    tracer({ x: shooter.x, z: shooter.z, y: 1.42 }, { x: player.x, z: player.z, y: 1.25 + (player.y ?? 0) }, true);
    callbacks.onDamage?.(7);
    return true;
  }
  function update(dt) {
    state.punchCooldown = Math.max(0, state.punchCooldown - dt);
    state.fireCooldown = Math.max(0, state.fireCooldown - dt);
    const player = readPlayer();
    const city = getCity();
    for (const enemy of enemies) {
      if (!live(enemy)) {
        enemy.alive = false;
        enemy.down = true;
        enemy.deadTime += dt;
        enemy.group.rotation.z += (Math.PI / 2 - enemy.group.rotation.z) * Math.min(1, dt * 9);
        enemy.group.position.y = .25;
        continue;
      }
      if (!player || !city || player.health <= 0) continue;
      const dx = player.x - enemy.x, dz = player.z - enemy.z;
      const distance = Math.hypot(dx, dz);
      enemy.heading = Math.atan2(dx, dz);
      if (distance > 9 && distance < 40) {
        const hit = resolveCollisions(city.colliders, enemy.x + dx / distance * 2.6 * dt, enemy.z + dz / distance * 2.6 * dt, .48);
        const safe = clampToWorld(hit.x, hit.z, .48);
        enemy.x = safe.x;
        enemy.z = safe.z;
        enemy.phase += dt * 9;
      }
      enemy.group.position.set(enemy.x, 0, enemy.z);
      enemy.group.rotation.y = enemy.heading;
      const limbs = enemy.group.userData.limbs;
      if (limbs) {
        const moving = distance > 9 && distance < 40;
        limbs.legs[0].rotation.x = moving ? Math.sin(enemy.phase) * .6 : 0;
        limbs.legs[1].rotation.x = moving ? -Math.sin(enemy.phase) * .6 : 0;
        limbs.arms[0].rotation.x = distance < 30 ? -1.2 : 0;
      }
      enemy.shootTimer -= dt;
      if (distance >= 3 && distance <= 30 && enemy.shootTimer <= 0) {
        if (shootAtPlayer(enemy)) enemy.shootTimer = 1.9;
        else enemy.shootTimer = .5;
      }
    }
    for (let i = effects.length - 1; i >= 0; i--) {
      const effect = effects[i];
      effect.time -= dt;
      if (effect.time > 0) continue;
      scene.remove(effect.group);
      effect.geometry.dispose();
      effect.material.dispose();
      effects.splice(i, 1);
    }
  }
  function reset() {
    for (const enemy of enemies) scene.remove(enemy.group);
    for (const effect of effects) { scene.remove(effect.group); effect.geometry.dispose(); effect.material.dispose(); }
    enemies.length = effects.length = 0;
    state.ammo = 24;
    state.punchCooldown = state.fireCooldown = state.shots = 0;
  }
  function setTargets(next) { targets = { pedestrians: next.pedestrians ?? [], footCops: next.footCops ?? [] }; }
  function setCallbacks(next) { callbacks = next ?? {}; }
  return { state, enemies, spawnEnemy, punch, shoot, update, reset, shootAtPlayer, setTargets, setCallbacks };
}
