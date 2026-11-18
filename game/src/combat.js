import * as THREE from '../vendor/three.module.min.js';
import { COMBAT, POLICE, DIFFICULTY } from './config.js';
import { resolveCollisions } from './world.js';

const planarDistance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

function rayFootprint(origin, direction, box, limit) {
  let near = 0;
  let far = limit;
  for (const [axis, min, max] of [['x', 'minX', 'maxX'], ['z', 'minZ', 'maxZ']]) {
    if (Math.abs(direction[axis]) < 0.000001) {
      if (origin[axis] < box[min] || origin[axis] > box[max]) return limit;
    } else {
      let a = (box[min] - origin[axis]) / direction[axis];
      let b = (box[max] - origin[axis]) / direction[axis];
      if (a > b) [a, b] = [b, a];
      near = Math.max(near, a);
      far = Math.min(far, b);
      if (far < near) return limit;
    }
  }
  return far > 0.03 ? Math.max(0, near) : limit;
}

function buildDockworker(options) {
  const group = new THREE.Group();
  const clothes = new THREE.MeshStandardMaterial({ color: options.color || 0xdca148, roughness: 0.9 });
  const denim = new THREE.MeshStandardMaterial({ color: 0x354453, roughness: 0.95 });
  const skin = new THREE.MeshStandardMaterial({ color: options.skin || 0x9b674e, roughness: 0.95 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1f242b, roughness: 0.8 });
  function box(w, h, d, x, y, z, material) {
    const part = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    part.position.set(x, y, z);
    part.castShadow = true;
    group.add(part);
    return part;
  }
  box(0.72, 0.77, 0.4, 0, 1.18, 0, clothes);
  box(0.42, 0.43, 0.4, 0, 1.81, 0, skin);
  box(0.49, 0.13, 0.48, 0, 2.03, 0.02, clothes);
  const legs = [box(0.25, 0.8, 0.28, -0.2, 0.43, 0, denim), box(0.25, 0.8, 0.28, 0.2, 0.43, 0, denim)];
  box(0.23, 0.65, 0.25, -0.49, 1.1, 0, clothes);
  box(0.23, 0.56, 0.25, 0.45, 1.2, 0.2, clothes).rotation.x = -0.8;
  box(0.13, 0.16, 0.46, 0.45, 1.4, 0.5, dark);
  group.userData.legs = legs;
  return group;
}

export function createCombat(scene, getPlayer, getCity, getDifficulty = () => DIFFICULTY.normal) {
  const enemies = [];
  const effects = [];
  const state = { clock: 0, punchCooldown: 0, shotCooldown: 0, shots: 0, kills: 0 };
  const flashGeometry = new THREE.SphereGeometry(0.16, 6, 4);
  const flashMaterial = new THREE.MeshBasicMaterial({ color: 0xffd693, transparent: true });

  function playerState() {
    const value = getPlayer();
    return value?.state || value;
  }
  function clearEnemies() {
    for (const enemy of enemies.splice(0)) scene.remove(enemy.group);
  }
  function spawnEnemy(x, z, options = {}) {
    const spot = resolveCollisions(getCity().colliders, x, z, 0.6);
    const group = buildDockworker(options);
    group.position.set(spot.x, 0.05, spot.z);
    scene.add(group);
    const enemy = { x: spot.x, z: spot.z, heading: options.heading || 0, health: options.health || COMBAT.enemyHealth, alive: true, group, isEnemy: true, lastShot: -10, shotCount: 0, age: 0 };
    enemies.push(enemy);
    return enemy;
  }
  function targets() {
    const city = getCity();
    return [...enemies, ...(city.footCops || []), ...(city.pedestrians || [])].filter(target => target.alive !== false && !target.dead && !target.knocked && (target.health == null || target.health > 0));
  }
  function coverDistance(origin, direction, limit) {
    let range = limit;
    for (const box of getCity().colliders || []) range = Math.min(range, rayFootprint(origin, direction, box, range));
    return range;
  }
  function addTrace(origin, target, color = 0xffd68a) {
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(origin.x, 1.4, origin.z),
      new THREE.Vector3(target.x, 1.3, target.z),
    ]);
    const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85 });
    const line = new THREE.Line(geometry, material);
    const flash = new THREE.Mesh(flashGeometry, flashMaterial);
    flash.position.set(origin.x, 1.4, origin.z);
    scene.add(line, flash);
    effects.push({ line, flash, geometry, material, life: 0.1 });
  }
  function hitTarget(target, amount) {
    const city = getCity();
    if (!target.isCop && !target.isEnemy) {
      city.knockPed?.(target);
      city.addWanted?.(1, 'Assault reported');
      return;
    }
    target.health = Math.max(0, target.health - amount);
    if (target.isCop) city.addWanted?.(1, 'Officer under fire');
    if (target.health === 0) {
      target.alive = false;
      state.kills++;
    }
  }
  function punch() {
    const player = playerState();
    if (!player || player.car || player.health <= 0 || state.punchCooldown > 0) return false;
    state.punchCooldown = COMBAT.punchCooldown;
    player.punchTimer = COMBAT.punchCooldown;
    const direction = { x: Math.sin(player.heading), z: Math.cos(player.heading) };
    let victim = null;
    let best = COMBAT.punchRange;
    for (const target of targets()) {
      const range = planarDistance(target, player);
      const forward = ((target.x - player.x) * direction.x + (target.z - player.z) * direction.z) / Math.max(range, 0.001);
      if (range < best && forward > 0.05 && coverDistance(player, direction, range) >= range - 0.2) {
        victim = target;
        best = range;
      }
    }
    if (victim) hitTarget(victim, COMBAT.punchDamage);
    getCity().audio?.thud();
    return true;
  }
  function shoot() {
    const player = playerState();
    if (!player || player.car || !player.armed || player.health <= 0 || player.ammo <= 0 || state.shotCooldown > 0) return false;
    player.ammo--;
    state.shots++;
    state.shotCooldown = COMBAT.shotCooldown;
    const direction = { x: Math.sin(player.heading), z: Math.cos(player.heading) };
    let range = coverDistance(player, direction, COMBAT.pistolRange);
    let victim = null;
    for (const target of targets()) {
      const dx = target.x - player.x;
      const dz = target.z - player.z;
      const forward = dx * direction.x + dz * direction.z;
      const lateral = Math.abs(dx * direction.z - dz * direction.x);
      // Every target, civilians included, obeys the same finite range and cover.
      if (forward > 0 && forward < range && lateral < 0.85) {
        victim = target;
        range = forward;
      }
    }
    if (victim) hitTarget(victim, COMBAT.pistolDamage);
    addTrace({ x: player.x + direction.x * 0.7, z: player.z + direction.z * 0.7 }, { x: player.x + direction.x * range, z: player.z + direction.z * range });
    const city = getCity();
    city.audio?.gunshot();
    city.addWanted?.(1, 'Shots reported');
    return true;
  }
  function shootAtPlayer(source) {
    const player = playerState();
    const difficulty = getDifficulty();
    if (!source?.alive || !player || player.health <= 0 || state.clock - (source.lastShot ?? -100) < (source.isCop ? 1.65 / difficulty.aggression : 1.85)) return false;
    const range = planarDistance(source, player);
    if (range < 3 || range > COMBAT.enemyRange) return false;
    const direction = { x: (player.x - source.x) / range, z: (player.z - source.z) / range };
    if (coverDistance(source, direction, range) < range - 0.2) return false;
    source.lastShot = state.clock;
    source.shotCount = (source.shotCount || 0) + 1;
    const miss = source.shotCount % 4 === 0;
    addTrace(source, { x: player.x + (miss ? 1.7 : 0), z: player.z }, 0xff8f79);
    if (!miss) player.health = Math.max(0, player.health - Math.round((source.isCop ? POLICE.shotDamage : COMBAT.enemyDamage) * difficulty.damage));
    getCity().audio?.gunshot();
    return true;
  }
  function update(dt) {
    state.clock += dt;
    state.punchCooldown = Math.max(0, state.punchCooldown - dt);
    state.shotCooldown = Math.max(0, state.shotCooldown - dt);
    const player = playerState();
    const city = getCity();
    for (const enemy of enemies) {
      enemy.age += dt;
      if (!enemy.alive || enemy.health <= 0) {
        enemy.alive = false;
        enemy.group.rotation.z = Math.min(Math.PI / 2, enemy.group.rotation.z + dt * 4);
        enemy.group.position.y = Math.max(0.15, enemy.group.position.y - dt * 0.5);
        continue;
      }
      if (!player) continue;
      const range = planarDistance(enemy, player);
      enemy.heading = Math.atan2(player.x - enemy.x, player.z - enemy.z);
      if (range > 9 && range < 55) {
        const next = resolveCollisions(city.colliders, enemy.x + Math.sin(enemy.heading) * dt * 3.3, enemy.z + Math.cos(enemy.heading) * dt * 3.3, 0.6);
        enemy.x = next.x;
        enemy.z = next.z;
        enemy.group.userData.legs.forEach((leg, i) => { leg.rotation.x = Math.sin(enemy.age * 9 + i * Math.PI) * 0.5; });
      }
      enemy.group.position.set(enemy.x, 0.05, enemy.z);
      enemy.group.rotation.y = enemy.heading;
      if (range < COMBAT.enemyRange) shootAtPlayer(enemy);
    }
    for (let i = effects.length - 1; i >= 0; i--) {
      const effect = effects[i];
      effect.life -= dt;
      effect.material.opacity = Math.max(0, effect.life * 8);
      if (effect.life <= 0) {
        scene.remove(effect.line, effect.flash);
        effect.geometry.dispose();
        effect.material.dispose();
        effects.splice(i, 1);
      }
    }
  }
  function reset() {
    clearEnemies();
    state.clock = 0;
    state.punchCooldown = 0;
    state.shotCooldown = 0;
    state.shots = 0;
    state.kills = 0;
    for (const effect of effects.splice(0)) {
      scene.remove(effect.line, effect.flash);
      effect.geometry.dispose();
      effect.material.dispose();
    }
  }
  return { enemies, state, spawnEnemy, clearEnemies, punch, shoot, shootAtPlayer, update, reset };
}
