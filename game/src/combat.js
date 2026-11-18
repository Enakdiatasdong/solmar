// Arcade melee and pistol combat for Jax, with simple mission enemies and brief shot effects.
import * as THREE from '../vendor/three.module.js';
import { COMBAT, PLAYER } from './config.js';
import { resolveCollisions } from './world.js';

const TRACER_LIFE = 0.08;
const NPC_GROUND = 0.28;

function enemyMesh() {
  const group = new THREE.Group();
  const coat = new THREE.MeshLambertMaterial({ color: 0x3a3f46 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.64, 0.32), coat);
  torso.position.y = 1.18;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.32, 0.28), new THREE.MeshLambertMaterial({ color: 0xa87655 }));
  head.position.y = 1.68;
  group.add(head);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.33, 0.1, 0.3), new THREE.MeshLambertMaterial({ color: 0x21262c }));
  cap.position.y = 1.86;
  group.add(cap);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.42), new THREE.MeshLambertMaterial({ color: 0x1c1d1f }));
  gun.position.set(0.22, 1.24, 0.24);
  group.add(gun);
  const legs = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.72, 0.19), new THREE.MeshLambertMaterial({ color: 0x2b2f33 }));
    leg.position.set(side * 0.12, 0.4, 0);
    group.add(leg);
    legs.push(leg);
  }
  return { group, legs };
}

export function createCombat(scene, getPlayer, getCity) {
  const state = {
    ammo: COMBAT.pistolAmmo,
    maxAmmo: COMBAT.maxAmmo,
    fireTimer: 0,
    punchTimer: 0,
    muzzle: 0,
    hits: 0,
    enemies: [],
    tracers: [],
  };

  const muzzleMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 6, 5),
    new THREE.MeshBasicMaterial({ color: 0xffe7a6, transparent: true, opacity: 0.95 }),
  );
  muzzleMesh.visible = false;
  scene.add(muzzleMesh);

  const coverBox = new THREE.Box3();
  const coverPoint = new THREE.Vector3();

  function spawnEnemy(x, z, options = {}) {
    const start = resolveCollisions(getCity()?.colliders ?? [], x, z, COMBAT.enemyRadius);
    const built = enemyMesh();
    built.group.position.set(start.x, NPC_GROUND, start.z);
    scene.add(built.group);
    const enemy = {
      group: built.group,
      legs: built.legs,
      x: start.x,
      z: start.z,
      heading: 0,
      health: options.health ?? COMBAT.enemyHealth,
      alive: true,
      shootTimer: 1.2 + Math.random(),
      walk: 0,
      mission: options.mission ?? null,
      name: options.name ?? 'thug',
    };
    state.enemies.push(enemy);
    return enemy;
  }

  function clearEnemies() {
    for (const enemy of state.enemies) {
      scene.remove(enemy.group);
      enemy.group.traverse((part) => {
        if (!part.isMesh) return;
        part.geometry.dispose();
        part.material.dispose();
      });
    }
    state.enemies.length = 0;
  }

  function muzzleAt(position) {
    muzzleMesh.position.copy(position);
    muzzleMesh.scale.setScalar(1);
    muzzleMesh.visible = true;
    state.muzzle = COMBAT.muzzleTime;
  }

  function tracer(from, to) {
    if (from.distanceToSquared(to) < 0.0001) return;
    const material = new THREE.LineBasicMaterial({ color: 0xffdf9a, transparent: true, opacity: 0.8 });
    const geometry = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(geometry, material);
    scene.add(line);
    state.tracers.push({ line, life: TRACER_LIFE });
  }

  function removeTracer(index) {
    const { line } = state.tracers[index];
    scene.remove(line);
    line.geometry.dispose();
    line.material.dispose();
    state.tracers.splice(index, 1);
  }

  function coverDistance(ray, range, city) {
    let nearest = Infinity;
    for (const box of city?.colliders ?? []) {
      coverBox.min.set(box.minX, 0, box.minZ);
      coverBox.max.set(box.maxX, box.height ?? Infinity, box.maxZ);
      if (coverBox.containsPoint(ray.origin)) return 0;
      if (!ray.intersectBox(coverBox, coverPoint)) continue;
      const distance = ray.origin.distanceTo(coverPoint);
      if (distance <= range) nearest = Math.min(nearest, distance);
    }
    return nearest;
  }

  function visitTargets(city, visit) {
    for (const enemy of state.enemies) {
      if (enemy.alive) visit(enemy, false);
    }
    if (city?.knockPed) {
      for (const ped of city.peds ?? []) {
        if (!ped.down) visit(ped, true);
      }
    }
  }

  function hitTarget(target, isPed, damage, city, heading) {
    if (isPed) {
      city.knockPed(target, heading);
    } else {
      target.health = Math.max(0, target.health - damage);
      if (target.health === 0) killEnemy(target);
    }
    state.hits += 1;
  }

  function punch() {
    const player = getPlayer().state;
    if (state.punchTimer > 0 || player.inCar || !player.alive) return false;
    state.punchTimer = PLAYER.punchCooldown;
    player.punchTimer = PLAYER.punchCooldown;

    const city = getCity();
    const forwardX = Math.sin(player.heading);
    const forwardZ = Math.cos(player.heading);
    const origin = new THREE.Vector3(player.x, 1.2 + player.y, player.z);
    const ray = new THREE.Ray(origin);
    let nearest = PLAYER.punchRange;
    let hit = null;
    let hitPed = false;
    visitTargets(city, (target, isPed) => {
      const dx = target.x - player.x;
      const dz = target.z - player.z;
      const distance = Math.hypot(dx, dz);
      if (distance > nearest || (hit && distance === nearest)) return;
      if (dx * forwardX + dz * forwardZ < distance * 0.5) return;
      if (distance > 0) {
        ray.direction.set(dx / distance, 0, dz / distance);
        if (coverDistance(ray, distance, city) <= distance) return;
      }
      nearest = distance;
      hit = target;
      hitPed = isPed;
    });
    if (!hit) return false;
    hitTarget(hit, hitPed, PLAYER.punchDamage, city, player.heading);
    return true;
  }

  function shoot() {
    const player = getPlayer().state;
    if (state.fireTimer > 0 || state.ammo <= 0 || player.inCar || !player.alive) return false;
    state.ammo -= 1;
    state.fireTimer = COMBAT.fireCooldown;

    const origin = new THREE.Vector3(player.x, 1.55 + player.y, player.z);
    const direction = new THREE.Vector3(Math.sin(player.heading), 0, Math.cos(player.heading));
    const ray = new THREE.Ray(origin, direction);
    const city = getCity();
    const cover = coverDistance(ray, COMBAT.pistolRange, city);
    let nearest = Math.min(COMBAT.pistolRange, cover);
    let hit = null;
    let hitPed = false;
    visitTargets(city, (target, isPed) => {
      const dx = target.x - origin.x;
      const dz = target.z - origin.z;
      const depth = dx * direction.x + dz * direction.z;
      if (depth <= 0 || depth > nearest || depth >= cover || (hit && depth === nearest)) return;
      const offset = Math.abs(dx * direction.z - dz * direction.x);
      if (offset > (isPed ? 0.65 : 0.85)) return;
      nearest = depth;
      hit = target;
      hitPed = isPed;
    });
    if (hit) hitTarget(hit, hitPed, COMBAT.pistolDamage, city, player.heading);

    const muzzle = ray.at(Math.min(0.75, nearest), new THREE.Vector3());
    muzzleAt(muzzle);
    tracer(muzzle, ray.at(nearest, new THREE.Vector3()));
    return true;
  }

  function killEnemy(enemy) {
    enemy.health = 0;
    enemy.alive = false;
    enemy.group.rotation.z = Math.PI / 2;
    enemy.group.position.y = 0.4;
  }

  function fireAtPlayer(shooter, originY, player, damage, source, chance, city) {
    if (!player.state.alive) return;
    const car = player.state.inCar?.state;
    const target = car ?? player.state;
    const origin = new THREE.Vector3(shooter.x, originY, shooter.z);
    const to = new THREE.Vector3(target.x, 1.2 + (car ? 0 : target.y), target.z);
    const direction = new THREE.Vector3().subVectors(to, origin);
    const range = direction.length();
    if (range === 0 || range > 30) return;
    const ray = new THREE.Ray(origin, direction.divideScalar(range));
    if (coverDistance(ray, range, city) <= range) return;
    muzzleAt(origin);
    tracer(origin, to);
    if (Math.random() < chance) player.hurt?.(damage, source);
  }

  function shootAtPlayer(cop, player) {
    if (Math.random() < 0.55) fireAtPlayer(cop, 1.5, player, 7, 'cop', 1, getCity());
  }

  function update(dt, player) {
    state.fireTimer = Math.max(0, state.fireTimer - dt);
    state.punchTimer = Math.max(0, state.punchTimer - dt);
    state.muzzle = Math.max(0, state.muzzle - dt);
    muzzleMesh.visible = state.muzzle > 0;
    for (let index = state.tracers.length - 1; index >= 0; index -= 1) {
      const item = state.tracers[index];
      item.life -= dt;
      if (item.life <= 0) {
        removeTracer(index);
      } else {
        item.line.material.opacity = (item.life / TRACER_LIFE) * 0.8;
      }
    }
    if (!player.state.alive || state.enemies.length === 0) return;
    const city = getCity();
    const targetPosition = player.state.inCar?.state ?? player.state;
    for (const enemy of state.enemies) {
      if (!enemy.alive) continue;
      const dx = targetPosition.x - enemy.x;
      const dz = targetPosition.z - enemy.z;
      const distance = Math.hypot(dx, dz);
      const target = Math.atan2(dx, dz);
      let delta = target - enemy.heading;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      enemy.heading += delta * Math.min(1, dt * 4);
      let moving = false;
      if (distance > 9 && distance < 40) {
        const nx = enemy.x + Math.sin(enemy.heading) * COMBAT.enemySpeed * dt;
        const nz = enemy.z + Math.cos(enemy.heading) * COMBAT.enemySpeed * dt;
        const resolved = resolveCollisions(city?.colliders ?? [], nx, nz, COMBAT.enemyRadius);
        moving = Math.hypot(resolved.x - enemy.x, resolved.z - enemy.z) > 0.001;
        enemy.x = resolved.x;
        enemy.z = resolved.z;
      }
      if (moving) enemy.walk += dt * 5;
      enemy.legs[0].rotation.x = moving ? Math.sin(enemy.walk) * 0.5 : 0;
      enemy.legs[1].rotation.x = -enemy.legs[0].rotation.x;
      enemy.shootTimer = Math.max(0, enemy.shootTimer - dt);
      if (enemy.shootTimer <= 0 && distance < 30 && distance > 3) {
        enemy.shootTimer = COMBAT.enemyFireRate + Math.random() * 0.6;
        fireAtPlayer(enemy, 1.45, player, COMBAT.enemyDamage, enemy.mission, 0.4, city);
      }
      enemy.group.position.set(enemy.x, NPC_GROUND, enemy.z);
      enemy.group.rotation.y = enemy.heading;
    }
  }

  function reset() {
    state.ammo = COMBAT.pistolAmmo;
    state.fireTimer = 0;
    state.punchTimer = 0;
    state.muzzle = 0;
    state.hits = 0;
    getPlayer().state.punchTimer = 0;
    clearEnemies();
    while (state.tracers.length > 0) removeTracer(state.tracers.length - 1);
    muzzleMesh.visible = false;
  }

  function addAmmo(amount) {
    if (!Number.isFinite(amount) || amount <= 0) return;
    state.ammo = Math.min(state.maxAmmo, state.ammo + Math.floor(amount));
  }

  return {
    state,
    punch,
    shoot,
    update,
    spawnEnemy,
    clearEnemies,
    killEnemy,
    shootAtPlayer,
    addAmmo,
    reset,
    muzzleMesh,
  };
}
