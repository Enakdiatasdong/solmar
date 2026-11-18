// Seeded district control, hostile patrols, capture rewards and passive turf income.
import { COMBAT, GANGS, REGIONS, SPAWN, STARTER_CAR } from './config.js';
import { createRandom } from './random.js';
import { resolveCollisions } from './world.js';

export function createGangs({ city, combat, hud, seed = 1, awardCash }) {
  const gangs = [
    ...GANGS.factions.map((gang) => ({ ...gang })),
    { id: 'player', name: GANGS.playerName, color: GANGS.playerColor },
    { id: 'neutral', name: GANGS.neutralName, color: GANGS.neutralColor },
  ];
  const owners = new Map(gangs.map((gang) => [gang.id, gang]));
  const factions = new Set(GANGS.factions.map((gang) => gang.id));
  const state = { districts: [], gangs };
  const counted = new Set();
  const lastKillAt = new Map();
  const lastSpawnAt = new Map();
  const spawnGuards = [SPAWN, STARTER_CAR, REGIONS.firstPickup, ...Object.values(city.landmarks ?? {})];
  let random;
  let elapsed = 0;
  let incomeElapsed = 0;

  function getOwner(ownerId) {
    return owners.get(ownerId) ?? owners.get('neutral');
  }

  function contains(rect, x, z, margin = 0) {
    return x >= rect.minX + margin && x <= rect.maxX - margin
      && z >= rect.minZ + margin && z <= rect.maxZ - margin;
  }

  function liveMembers(district) {
    const present = new Set(combat.state.enemies);
    district.members = district.members.filter((enemy) => enemy.alive && present.has(enemy));
    return district.members;
  }

  function clearMembers(district) {
    if (typeof combat.removeEnemy === 'function') {
      for (const enemy of [...combat.state.enemies]) {
        if (enemy.gangId && (!district || enemy.districtId === district.id)) combat.removeEnemy(enemy);
      }
    } else {
      combat.clearEnemies((enemy) => !enemy.gangId || (district && enemy.districtId !== district.id));
    }
    if (district) district.members = [];
  }

  function spawnPoint(district) {
    const radius = COMBAT.enemyRadius;
    const colliders = city.colliders ?? [];
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const point = resolveCollisions(colliders,
        random.range(district.rect.minX + 2, district.rect.maxX - 2),
        random.range(district.rect.minZ + 2, district.rect.maxZ - 2), radius);
      if (!contains(district.rect, point.x, point.z, radius)) continue;
      // Keep patrols on the new playable footprint and away from arrival/service anchors,
      // including when a continued save restores hostile ownership near the fresh spawn.
      if (!REGIONS.list.some((region) => region.rectangles.some((rect) => contains(rect, point.x, point.z, radius)))) continue;
      if (spawnGuards.some((guard) => Math.hypot(point.x - guard.x, point.z - guard.z) < 24)) continue;
      const blocked = colliders.some((box) => {
        const dx = point.x - Math.max(box.minX, Math.min(box.maxX, point.x));
        const dz = point.z - Math.max(box.minZ, Math.min(box.maxZ, point.z));
        return dx * dx + dz * dz < radius * radius - 1e-8;
      });
      if (!blocked && !district.members.some((enemy) => Math.hypot(enemy.x - point.x, enemy.z - point.z) < 2)) return point;
    }
    // Retry later rather than place a patrol inside geometry or outside its turf.
    return null;
  }

  function spawnMembers(district, limit = GANGS.membersPerDistrict) {
    if (!factions.has(district.owner)) return;
    liveMembers(district);
    const gang = getOwner(district.owner);
    const count = Math.min(limit, GANGS.membersPerDistrict - district.members.length);
    for (let index = 0; index < count; index += 1) {
      const point = spawnPoint(district);
      if (!point) break;
      const enemy = combat.spawnEnemy(point.x, point.z, { name: `${gang.name} member`, mission: null });
      enemy.gangId = gang.id;
      enemy.districtId = district.id;
      enemy.group.traverse((part) => {
        if (!part.isMesh) return;
        const materials = Array.isArray(part.material) ? part.material : [part.material];
        for (const material of materials) {
          if (material.color?.getHex() === 0x3a3f46) material.color.setHex(gang.hex);
        }
      });
      district.members.push(enemy);
    }
    lastSpawnAt.set(district.id, elapsed);
  }

  function captureDistrict(district) {
    if (!factions.has(district.owner)) return;
    district.owner = 'player';
    district.progress = 0;
    clearMembers(district);
    awardCash(GANGS.captureReward);
    hud?.toast(`${district.name} is yours! +$${GANGS.captureReward}`, 'mission', 4);
  }

  function addProgress(district) {
    if (!district || !factions.has(district.owner)) return;
    lastKillAt.set(district.id, elapsed);
    district.progress = Math.min(100, district.progress + GANGS.progressPerKill);
    if (district.progress >= 100) {
      captureDistrict(district);
    } else {
      const remaining = Math.ceil((100 - district.progress) / GANGS.progressPerKill);
      hud?.toast(`${district.name} ${Math.round(district.progress)}% — ${remaining} more to claim it`, 'info', 3);
    }
  }

  function reset(savedDistricts) {
    clearMembers();
    random = createRandom(seed ^ 0x6a6e);
    counted.clear();
    lastKillAt.clear();
    lastSpawnAt.clear();
    elapsed = 0;
    incomeElapsed = 0;
    // Shuffling a cycle keeps all three factions represented for every city seed.
    const initialOwners = random.shuffle([...factions, 'neutral']);
    let ownerIndex = 0;
    const saved = savedDistricts && typeof savedDistricts === 'object' && !Array.isArray(savedDistricts)
      ? savedDistricts : {};
    state.districts = GANGS.districts.map(({ id, name, rect }) => {
      const initialOwner = contains(rect, SPAWN.x, SPAWN.z) ? 'neutral'
        : initialOwners[ownerIndex++ % initialOwners.length];
      const entry = Object.hasOwn(saved, id) ? saved[id] : null;
      const validSavedOwner = owners.has(entry?.owner);
      const owner = validSavedOwner ? entry.owner : initialOwner;
      const progress = validSavedOwner && factions.has(owner) && Number.isFinite(entry?.progress)
        ? Math.max(0, Math.min(100, entry.progress)) : 0;
      lastKillAt.set(id, 0);
      lastSpawnAt.set(id, 0);
      return {
        id, name, rect: { ...rect },
        center: { x: (rect.minX + rect.maxX) / 2, z: (rect.minZ + rect.maxZ) / 2 },
        owner, progress, members: [],
      };
    });
    for (const district of state.districts) spawnMembers(district);
  }

  function update(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    const previousElapsed = elapsed;
    elapsed += dt;
    for (const enemy of [...combat.state.enemies]) {
      if (!enemy.gangId || enemy.alive !== false || counted.has(enemy)) continue;
      counted.add(enemy);
      const district = state.districts.find(({ id }) => id === enemy.districtId);
      if (district?.owner === enemy.gangId) addProgress(district);
    }
    for (const district of state.districts) {
      liveMembers(district);
      if (!factions.has(district.owner)) continue;
      const decayStarts = (lastKillAt.get(district.id) ?? 0) + GANGS.progressDecayDelaySeconds;
      if (district.progress > 0 && elapsed > decayStarts) {
        const decayTime = elapsed - Math.max(previousElapsed, decayStarts);
        district.progress = Math.max(0, district.progress - GANGS.progressDecayPerSecond * decayTime);
      }
      if (district.members.length < GANGS.membersPerDistrict
        && elapsed - (lastSpawnAt.get(district.id) ?? 0) >= GANGS.respawnSeconds) spawnMembers(district, 1);
    }
    incomeElapsed += dt;
    while (incomeElapsed >= GANGS.incomeEverySeconds) {
      incomeElapsed -= GANGS.incomeEverySeconds;
      let total = 0;
      for (const district of state.districts) {
        if (district.owner !== 'player') continue;
        awardCash(GANGS.incomePerDistrict);
        total += GANGS.incomePerDistrict;
      }
      if (total) hud?.toast(`Turf income +$${total}`, 'mission', 3);
    }
  }

  function getBlips() {
    return state.districts.flatMap((district) => liveMembers(district).map((enemy) => ({
      x: enemy.x, z: enemy.z, color: getOwner(enemy.gangId).color, size: 20,
    })));
  }

  function getMinimapZones() {
    return state.districts.map(({ rect, owner }) => ({
      x: rect.minX, z: rect.minZ, w: rect.maxX - rect.minX, h: rect.maxZ - rect.minZ,
      color: getOwner(owner).color, alpha: 0.22,
    }));
  }

  function serialize() {
    return Object.fromEntries(state.districts.map(({ id, owner, progress }) => [id, { owner, progress: Math.round(progress) }]));
  }

  // Test hook: exercise the same progress and capture path as observed combat kills.
  function debugCapture(districtId) {
    const district = state.districts.find(({ id }) => id === districtId);
    while (district && factions.has(district.owner)) addProgress(district);
    return district;
  }

  reset();
  return { state, getOwner, reset, update, getBlips, getMinimapZones, serialize, debugCapture };
}
