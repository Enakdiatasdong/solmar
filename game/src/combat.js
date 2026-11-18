// Arcade melee and weapon combat for Jax, with simple mission enemies and pooled effects.
import * as THREE from '../vendor/three.module.min.js';
import { COMBAT, PLAYER } from './config.js';
import { createRandom } from './random.js';
import { resolveCollisions } from './world.js';

const TRACER_LIFE = 0.08;
const TRACER_LIMIT = 24;
const BOTTLE_LIMIT = 3;
const FIRE_LIMIT = 3;
const FIRE_LIFE = 1.4;
const LOB_TIME = 1.6;
const LOB_GRAVITY = 18;
const NPC_GROUND = 0.28;
const POS_Z = new THREE.Vector3(0, 0, 1);
const TRACER_GEOMETRY = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), POS_Z]);
const SPHERE_GEOMETRY = new THREE.SphereGeometry(1, 8, 6);
const BOTTLE_MATERIAL = new THREE.MeshBasicMaterial({ color: 0xffbd65 });
const FIRE_MATERIAL = new THREE.MeshBasicMaterial({ color: 0xff782b });

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


export function createCombat(scene, getPlayer, getCity, seed = 1) {
  let random = createRandom(seed);

  const state = {
    weapons: COMBAT.weapons.map((weapon) => ({ ...weapon })),
    weaponIndex: 0,
    get weapon() { return this.weapons[this.weaponIndex] ?? this.weapons[0]; },
    get ammo() { return this.weapon.ammo; },
    set ammo(amount) {
      if (Number.isFinite(amount)) this.weapon.ammo = THREE.MathUtils.clamp(Math.floor(amount), 0, this.weapon.maxAmmo);
    },
    get maxAmmo() { return this.weapon.maxAmmo; },
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

  const freeTracers = Array.from({ length: TRACER_LIMIT }, () => {
    const line = new THREE.Line(TRACER_GEOMETRY, new THREE.LineBasicMaterial({ color: 0xffdf9a, transparent: true, opacity: 0.8 }));
    line.visible = false;
    scene.add(line);
    return { line, life: 0 };
  });
  function pooledSphere(material, scale) {
    const mesh = new THREE.Mesh(SPHERE_GEOMETRY, material);
    mesh.scale.setScalar(scale);
    mesh.visible = false;
    scene.add(mesh);
    return mesh;
  }
  const bottles = Array.from({ length: BOTTLE_LIMIT }, () => ({
    mesh: pooledSphere(BOTTLE_MATERIAL, 0.13), life: 0, vx: 0, vy: 0, vz: 0, ground: 0, weapon: null,
  }));
  const fires = Array.from({ length: FIRE_LIMIT }, () => ({ mesh: pooledSphere(FIRE_MATERIAL, 0.48), life: 0 }));
  const fireLight = new THREE.PointLight(0xff8034, 12, 8);
  fireLight.visible = false;
  scene.add(fireLight);

  const coverBox = new THREE.Box3();
  const coverPoint = new THREE.Vector3();
  const tracerDirection = new THREE.Vector3();
  const lobRay = new THREE.Ray();
  const lobStep = new THREE.Vector3();
  const shotRay = new THREE.Ray();
  const shotMuzzle = new THREE.Vector3();
  const shotEnd = new THREE.Vector3();

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
      shootTimer: 1.2 + random(),
      walk: 0,
      mission: options.mission ?? null,
      name: options.name ?? 'thug',
    };
    state.enemies.push(enemy);
    return enemy;
  }

  function removeEnemy(enemy) {
    const index = state.enemies.indexOf(enemy);
    if (index === -1) return false;
    state.enemies.splice(index, 1);
    scene.remove(enemy.group);
    enemy.group.traverse((part) => {
      if (!part.isMesh) return;
      part.geometry.dispose();
      part.material.dispose();
    });
    return true;
  }

  function clearEnemies(keep) {
    for (const enemy of [...state.enemies]) {
      if (!keep?.(enemy)) removeEnemy(enemy);
    }
  }

  function muzzleAt(position) {
    muzzleMesh.position.copy(position);
    muzzleMesh.scale.setScalar(1);
    muzzleMesh.visible = true;
    state.muzzle = COMBAT.muzzleTime;
  }

  function tracer(from, to) {
    const length = tracerDirection.subVectors(to, from).length();
    if (length < 0.01) return;
    const item = freeTracers.pop() ?? state.tracers.shift();
    const { line } = item;
    line.position.copy(from);
    line.quaternion.setFromUnitVectors(POS_Z, tracerDirection.divideScalar(length));
    line.scale.z = length;
    line.material.opacity = 0.8;
    line.visible = true;
    item.life = TRACER_LIFE;
    state.tracers.push(item);
  }

  function removeTracer(index) {
    const [item] = state.tracers.splice(index, 1);
    item.line.visible = false;
    freeTracers.push(item);
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
    for (const cop of city?.cops ?? []) {
      if (cop.alive) visit(cop, false);
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

  function fireRay(origin, heading, weapon, damage, city) {
    shotRay.origin.copy(origin);
    shotRay.direction.set(Math.sin(heading), 0, Math.cos(heading));
    const cover = coverDistance(shotRay, weapon.range, city);
    let nearest = Math.min(weapon.range, cover);
    let hit = null;
    let hitPed = false;
    visitTargets(city, (target, isPed) => {
      const dx = target.x - origin.x;
      const dz = target.z - origin.z;
      const depth = dx * shotRay.direction.x + dz * shotRay.direction.z;
      if (depth <= 0 || depth > nearest || depth >= cover || (hit && depth === nearest)) return;
      const offset = Math.abs(dx * shotRay.direction.z - dz * shotRay.direction.x);
      if (offset > (isPed ? 0.65 : 0.85)) return;
      nearest = depth;
      hit = target;
      hitPed = isPed;
    });
    if (hit) hitTarget(hit, hitPed, damage, city, heading);
    shotRay.at(Math.min(0.75, nearest), shotMuzzle);
    muzzleAt(shotMuzzle);
    tracer(shotMuzzle, shotRay.at(nearest, shotEnd));
  }

  function explode(bottle, city) {
    const impact = bottle.mesh.position;
    const weapon = bottle.weapon;
    visitTargets(city, (target, isPed) => {
      const distance = Math.hypot(target.x - impact.x, target.z - impact.z);
      if (distance > weapon.blastRadius) return;
      hitTarget(target, isPed, weapon.damage * (1 - 0.45 * distance / weapon.blastRadius), city,
        Math.atan2(target.x - impact.x, target.z - impact.z));
    });
    const fire = fires.find((item) => item.life <= 0) ?? fires[0];
    fire.mesh.position.copy(impact);
    fire.mesh.position.y = Math.max(bottle.ground + 0.4, impact.y);
    fire.mesh.visible = true;
    fire.life = FIRE_LIFE;
    bottle.life = 0;
    bottle.mesh.visible = false;
  }

  function updateProjectiles(dt, city) {
    for (const bottle of bottles) {
      if (bottle.life <= 0) continue;
      const position = bottle.mesh.position;
      lobRay.origin.copy(position);
      bottle.vy -= LOB_GRAVITY * dt;
      lobStep.set(bottle.vx * dt, bottle.vy * dt, bottle.vz * dt);
      const distance = lobStep.length();
      lobRay.direction.copy(lobStep).normalize();
      const cover = coverDistance(lobRay, distance, city);
      position.add(lobStep);
      bottle.life -= dt;
      if (cover <= distance) {
        lobRay.at(Math.max(0, cover - 0.15), position);
        explode(bottle, city);
        continue;
      }
      let contact = false;
      visitTargets(city, (target) => {
        if (position.y < 2.2 && Math.hypot(position.x - target.x, position.z - target.z) < 0.9) contact = true;
      });
      // Resolve the final ground footprint against the same city collision map as actors.
      if (position.y <= bottle.ground || bottle.life <= 0 || contact) {
        if (position.y <= bottle.ground) {
          const resolved = resolveCollisions(city?.colliders ?? [], position.x, position.z, 0.15);
          position.set(resolved.x, bottle.ground, resolved.z);
        }
        explode(bottle, city);
      }
    }
    fireLight.visible = false;
    for (const fire of fires) {
      if (fire.life <= 0) continue;
      fire.life = Math.max(0, fire.life - dt);
      fire.mesh.visible = fire.life > 0;
      const pulse = 0.7 + fire.life / FIRE_LIFE * 1.3;
      fire.mesh.scale.set(pulse, pulse * 0.6, pulse);
      fireLight.position.copy(fire.mesh.position);
      fireLight.intensity = fire.life / FIRE_LIFE * 12;
      fireLight.visible = fire.life > 0;
    }
  }

  function shoot() {
    const player = getPlayer().state;
    const weapon = state.weapon;
    if (state.fireTimer > 0 || state.ammo <= 0 || player.inCar || !player.alive) return false;
    const bottle = weapon.id === 'fire-bottle' ? bottles.find((item) => item.life <= 0) : null;
    if (weapon.id === 'fire-bottle' && !bottle) return false;
    state.ammo -= 1;
    state.fireTimer = weapon.fireCooldown;
    const city = getCity();
    const origin = new THREE.Vector3(player.x, 1.55 + player.y, player.z);
    if (bottle) {
      bottle.mesh.position.copy(origin);
      bottle.mesh.visible = true;
      bottle.ground = city?.groundHeight ?? NPC_GROUND;
      bottle.weapon = { ...weapon };
      bottle.vx = Math.sin(player.heading) * weapon.range / LOB_TIME;
      bottle.vz = Math.cos(player.heading) * weapon.range / LOB_TIME;
      bottle.vy = LOB_GRAVITY * LOB_TIME / 2 - (origin.y - bottle.ground) / LOB_TIME;
      bottle.life = LOB_TIME + 0.3;
      muzzleAt(origin);
      shotEnd.copy(origin).addScaledVector(new THREE.Vector3(Math.sin(player.heading), 0.2, Math.cos(player.heading)), 1);
      tracer(origin, shotEnd);
    } else if (weapon.spread) {
      for (const offset of [-weapon.spread, 0, weapon.spread]) {
        fireRay(origin, player.heading + offset, weapon, weapon.damage / 3, city);
      }
    } else {
      fireRay(origin, player.heading, weapon, weapon.damage, city);
    }
    return true;
  }

  function killEnemy(enemy) {
    enemy.health = 0;
    enemy.alive = false;
    if (enemy.isCop) enemy.down = 8;
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
    if (random() < chance) player.hurt?.(damage, source);
  }

  function shootAtPlayer(cop, player) {
    if (random() < 0.55) fireAtPlayer(cop, 1.5, player, 7, 'cop', 1, getCity());
  }

  function update(dt, player) {
    state.fireTimer = Math.max(0, state.fireTimer - dt);
    state.punchTimer = Math.max(0, state.punchTimer - dt);
    state.muzzle = Math.max(0, state.muzzle - dt);
    muzzleMesh.visible = state.muzzle > 0;
    updateProjectiles(dt, getCity());
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
        enemy.shootTimer = COMBAT.enemyFireRate + random() * 0.6;
        fireAtPlayer(enemy, 1.45, player, COMBAT.enemyDamage, enemy.mission, 0.4, city);
      }
      enemy.group.position.set(enemy.x, NPC_GROUND, enemy.z);
      enemy.group.rotation.y = enemy.heading;
    }
  }

  function reset() {

    random = createRandom(seed);
    state.ammo = COMBAT.pistolAmmo;

    for (let index = 0; index < state.weapons.length; index += 1) {
      Object.assign(state.weapons[index], COMBAT.weapons[index]);
    }
    state.weaponIndex = 0;

    state.fireTimer = 0;
    state.punchTimer = 0;
    state.muzzle = 0;
    state.hits = 0;
    getPlayer().state.punchTimer = 0;
    clearEnemies();
    while (state.tracers.length > 0) removeTracer(state.tracers.length - 1);
    muzzleMesh.visible = false;
    for (const item of [...bottles, ...fires]) { item.life = 0; item.mesh.visible = false; }
    fireLight.visible = false;
  }

  function addAmmo(amount) {
    if (!Number.isFinite(amount) || amount <= 0) return;
    state.ammo = Math.min(state.maxAmmo, state.ammo + Math.floor(amount));
  }

  function selectWeapon(index) {
    if (!Number.isInteger(index) || !state.weapons[index]) return false;
    state.weaponIndex = index;
    return true;
  }

  function cycleWeapon(delta) {
    if (!Number.isFinite(delta) || delta === 0) return false;
    const count = state.weapons.length;
    return selectWeapon((state.weaponIndex + Math.trunc(delta) % count + count) % count);
  }

  function buyAmmo(weaponId, amount, cost, spendCash) {
    const weapon = state.weapons.find((item) => item.id === weaponId);
    if (!weapon || !Number.isFinite(amount) || amount <= 0 || !Number.isFinite(cost) || cost < 0) return { ok: false, reason: 'invalid' };
    const added = Math.min(Math.floor(amount), weapon.maxAmmo - weapon.ammo);
    if (added <= 0) return { ok: false, reason: 'full' };
    if (typeof spendCash !== 'function' || !spendCash(cost)) return { ok: false, reason: 'cash' };
    weapon.ammo += added;
    return { ok: true, added, ammo: weapon.ammo, cost };
  }

  return {
    state,
    punch,
    shoot,
    update,
    spawnEnemy,
    removeEnemy,
    clearEnemies,
    killEnemy,
    shootAtPlayer,
    addAmmo,
    selectWeapon,
    switchWeapon: selectWeapon,
    cycleWeapon,
    buyAmmo,
    reset,
    muzzleMesh,
  };
}
