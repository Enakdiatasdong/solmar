import * as THREE from '../vendor/three.module.min.js';
import { CITY, RURAL, PALETTE } from './config.js';
import { isOnSand } from './world.js';

// Supplemental northern terrain and downtown details use the caller's seeded RNG.
export function createDistricts({ scene, city, random }) {
  const group = new THREE.Group();
  group.name = 'Solmar districts';
  const ruralGroup = new THREE.Group();
  ruralGroup.name = 'Northern village';
  const cityGroup = new THREE.Group();
  cityGroup.name = 'Dense downtown';
  group.add(ruralGroup, cityGroup);
  scene.add(group);
  const dirtRoads = [
    { minX: -650, maxX: 650, minZ: -565, maxZ: -555 },
    { minX: -305, maxX: -295, minZ: -900, maxZ: -360 },
    { minX: 295, maxX: 305, minZ: -900, maxZ: -360 },
    // Footpaths keep the preserved lake, orchard and viewpoint anchors accessible.
    { minX: -420, maxX: -300, minZ: -722, maxZ: -718 },
    { minX: -450, maxX: -300, minZ: -622, maxZ: -618 },
    { minX: 60, maxX: 300, minZ: -862, maxZ: -858 },
  ];
  const state = { dirtRoads, rural: { ...RURAL }, landmarks: [], animatables: [] };
  const dirtTexture = new THREE.MeshLambertMaterial({ color: 0x986b43 });
  const ruralGrass = new THREE.MeshLambertMaterial({ color: 0x497447 });
  const fieldMaterials = [
    new THREE.MeshLambertMaterial({ color: 0xd0ae48 }),
    new THREE.MeshLambertMaterial({ color: 0x5e934c }),
    new THREE.MeshLambertMaterial({ color: 0x855c3a }),
    new THREE.MeshLambertMaterial({ color: 0xc19d3a }),
    new THREE.MeshLambertMaterial({ color: 0x568c49 }),
    new THREE.MeshLambertMaterial({ color: 0x765039 }),
  ];
  const collider = (x, z, w, d, height = 2) => {
    city.colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, height });
  };
  const box = (parent, x, y, z, w, h, d, material, solid = false) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y + h / 2, z);
    parent.add(mesh);
    if (solid) collider(x, z, w, d, y + h);
    return mesh;
  };
  const cylinder = (parent, x, y, z, r, h, material, solid = false, sides = 10) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, sides), material);
    mesh.position.set(x, y + h / 2, z);
    parent.add(mesh);
    if (solid) collider(x, z, r * 2, r * 2, y + h);
    return mesh;
  };
  const ruralPlane = new THREE.Mesh(new THREE.PlaneGeometry(RURAL.maxX - RURAL.minX, RURAL.maxZ - RURAL.minZ), ruralGrass);
  ruralPlane.rotation.x = -Math.PI / 2;
  ruralPlane.position.set((RURAL.minX + RURAL.maxX) / 2, 0.021, (RURAL.minZ + RURAL.maxZ) / 2);
  ruralGroup.add(ruralPlane);
  for (const road of dirtRoads) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(road.maxX - road.minX, road.maxZ - road.minZ), dirtTexture);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set((road.minX + road.maxX) / 2, 0.052, (road.minZ + road.maxZ) / 2);
    ruralGroup.add(mesh);
  }

  // Six cultivated parcels are kept clear of both north-south roads and the farm.
  const fields = [
    [-520, -640, 120, 72], [-120, -680, 130, 78], [120, -640, 112, 76],
    [480, -700, 120, 82], [-450, -800, 130, 80], [520, -820, 130, 80],
  ];
  fields.forEach(([x, z, w, d], fieldIndex) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), fieldMaterials[fieldIndex]);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.065, z);
    ruralGroup.add(mesh);
    const rows = Math.max(3, Math.floor(w / 19));
    const cropMaterial = fieldIndex % 3 === 0 ? new THREE.MeshLambertMaterial({ color: 0xe0bd4c }) : new THREE.MeshLambertMaterial({ color: 0x4c8d48 });
    const plantsPerRow = Math.floor(d / 13);
    const crops = new THREE.InstancedMesh(new THREE.ConeGeometry(0.75, 1.8 + (fieldIndex % 2) * 0.4, 5), cropMaterial, rows * plantsPerRow);
    const cropTransform = new THREE.Object3D();
    let cropIndex = 0;
    for (let row = 0; row < rows; row += 1) {
      const rowX = x - w / 2 + 10 + row * ((w - 20) / Math.max(1, rows - 1));
      for (let plant = 0; plant < plantsPerRow; plant += 1) {
        const pz = z - d / 2 + 7 + plant * 13;
        cropTransform.position.set(rowX, 0.9, pz);
        cropTransform.updateMatrix();
        crops.setMatrixAt(cropIndex, cropTransform.matrix);
        cropIndex += 1;
      }
    }
    crops.instanceMatrix.needsUpdate = true;
    ruralGroup.add(crops);
  });

  // The outer hills are backdrop terrain. Two inner slopes carry short AABBs so
  // vehicles cannot pass directly through their visible bases.
  const hillMaterial = new THREE.MeshLambertMaterial({ color: 0x385d3d });
  [-600, -300, 0, 300, 600].forEach((x, index) => {
    const radius = 58 + (index % 3) * 9;
    const height = 17 + (index % 2) * 5;
    const hill = new THREE.Mesh(new THREE.ConeGeometry(radius, height, 12), hillMaterial);
    hill.scale.y = 0.85;
    hill.position.set(x, height * 0.42, -900 - (index % 2) * 15);
    ruralGroup.add(hill);
    if (index === 1 || index === 3) collider(x, hill.position.z, radius * 1.15, radius * 0.8, height * 0.75);
  });

  // Avoid all roads, parcels and named clearings when scattering oak trees.
  const clearings = [
    [-420, -720, 66], [330, -780, 80], [-450, -620, 60], [60, -860, 68],
  ];
  const oakTrunk = new THREE.MeshLambertMaterial({ color: 0x6c492f });
  const oakLeaf = new THREE.MeshLambertMaterial({ color: 0x3f783f });
  const blocked = (x, z) => dirtRoads.some((r) => x >= r.minX - 8 && x <= r.maxX + 8 && z >= r.minZ - 8 && z <= r.maxZ + 8)
    || fields.some(([fx, fz, fw, fd]) => Math.abs(x - fx) < fw / 2 + 5 && Math.abs(z - fz) < fd / 2 + 5)
    || clearings.some(([cx, cz, radius]) => (x - cx) ** 2 + (z - cz) ** 2 < radius * radius);
  const treeSpots = [];
  let attempts = 0;
  while (treeSpots.length < 120 && attempts < 1000) {
    attempts += 1;
    const x = random.range(RURAL.minX + 15, RURAL.maxX - 15);
    const z = random.range(RURAL.minZ + 15, RURAL.maxZ - 15);
    if (blocked(x, z)) continue;
    const scale = random.range(0.8, 1.25);
    treeSpots.push({ x, z, scale });
    collider(x, z, 1.5 * scale, 1.5 * scale, 3.6 * scale);
  }
  const treeMatrices = (baseY) => {
    const mesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.65, 0.65, 3.6, 7), oakTrunk, treeSpots.length);
    const transform = new THREE.Object3D();
    treeSpots.forEach(({ x, z, scale }, index) => {
      transform.position.set(x, baseY * scale, z);
      transform.scale.set(scale, scale, scale);
      transform.updateMatrix();
      mesh.setMatrixAt(index, transform.matrix);
    });
    return mesh;
  };
  const trunks = treeMatrices(1.8);
  trunks.instanceMatrix.needsUpdate = true;
  ruralGroup.add(trunks);
  const canopies = new THREE.InstancedMesh(new THREE.SphereGeometry(3.4, 8, 6), oakLeaf, treeSpots.length);
  const canopyTransform = new THREE.Object3D();
  treeSpots.forEach(({ x, z, scale }, index) => {
    canopyTransform.position.set(x, 5.1 * scale, z);
    canopyTransform.scale.set(scale, scale, scale);
    canopyTransform.updateMatrix();
    canopies.setMatrixAt(index, canopyTransform.matrix);
  });
  canopies.instanceMatrix.needsUpdate = true;
  ruralGroup.add(canopies);

  // Peternakan Bukit Hijau, placed east of the x=300 track.
  const barnRed = new THREE.MeshLambertMaterial({ color: 0xb4483c });
  const roofRed = new THREE.MeshLambertMaterial({ color: 0x61352f });
  box(ruralGroup, 360, 0, -780, 34, 10, 24, barnRed, true);
  const barnRoof = new THREE.Mesh(new THREE.ConeGeometry(18, 7, 4), roofRed);
  barnRoof.rotation.y = Math.PI / 4;
  barnRoof.position.set(360, 13.5, -780);
  ruralGroup.add(barnRoof);
  cylinder(ruralGroup, 395, 0, -780, 6, 17, new THREE.MeshLambertMaterial({ color: 0xb6bdad }), true, 14);
  const fenceMaterial = new THREE.MeshLambertMaterial({ color: 0x9b7043 });
  // Leave the x=300 track open past the farm for the northern race route.
  [[340, -820, 50, 0.8], [395, -820, 70, 0.8], [325, -780, 0.8, 70], [400, -780, 0.8, 70]].forEach(([x, z, w, d]) => box(ruralGroup, x, 0, z, w, 1.4, d, fenceMaterial, true));
  const hayMaterial = new THREE.MeshLambertMaterial({ color: 0xd4aa4d });
  [[335, -748], [348, -748], [410, -750]].forEach(([x, z]) => {
    const hay = cylinder(ruralGroup, x, 0.4, z, 2.2, 2.1, hayMaterial, true, 10);
    hay.rotation.z = Math.PI / 2;
  });

  // Plaza, fountain, stalls and benches in park block [6,6].
  const plazaX = CITY.nodeMin + (6 + 0.5) * CITY.pitch;
  const plazaZ = CITY.nodeMin + (6 + 0.5) * CITY.pitch;
  const plaza = new THREE.Mesh(new THREE.CylinderGeometry(23, 23, 0.18, 32), new THREE.MeshLambertMaterial({ color: 0xc7c0ac }));
  plaza.position.set(plazaX, 0.11, plazaZ);
  cityGroup.add(plaza);
  const fountainBase = cylinder(cityGroup, plazaX, 0.15, plazaZ, 4.6, 0.9, new THREE.MeshLambertMaterial({ color: 0xd4d1c4 }), true, 18);
  const water = new THREE.Mesh(new THREE.CylinderGeometry(3.9, 3.9, 0.08, 24), new THREE.MeshPhongMaterial({ color: 0x4fabc0, transparent: true, opacity: 0.8 }));
  water.position.set(plazaX, 1.06, plazaZ);
  cityGroup.add(water);
  const fountainJet = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 2.2, 8), new THREE.MeshBasicMaterial({ color: 0xb4f1f1, transparent: true, opacity: 0.65 }));
  fountainJet.position.set(plazaX, 2.15, plazaZ);
  cityGroup.add(fountainJet);
  state.animatables.push({ type: 'fountain', mesh: fountainJet, water });
  [[plazaX - 16, plazaZ - 14], [plazaX + 16, plazaZ - 14], [plazaX - 16, plazaZ + 14], [plazaX + 16, plazaZ + 14]].forEach(([x, z]) => {
    box(cityGroup, x, 0, z, 5.4, 2.4, 4.4, new THREE.MeshLambertMaterial({ color: 0xdb9b57 }), true);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(3.8, 1.6, 4), new THREE.MeshLambertMaterial({ color: 0x6d4436 }));
    roof.rotation.y = Math.PI / 4;
    roof.position.set(x, 3.2, z);
    cityGroup.add(roof);
  });
  [[plazaX - 10, plazaZ], [plazaX + 10, plazaZ], [plazaX, plazaZ - 10], [plazaX, plazaZ + 10]].forEach(([x, z]) => box(cityGroup, x, 0.55, z, 3.2, 0.45, 1, new THREE.MeshLambertMaterial({ color: 0x865d3b }), true));

  const tower = (x, z, height, color) => {
    box(cityGroup, x, 0, z, 15, height, 15, new THREE.MeshLambertMaterial({ color }), true);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(11, 6, 4), new THREE.MeshLambertMaterial({ color: 0x343b52 }));
    roof.rotation.y = Math.PI / 4;
    roof.position.set(x, height + 3, z);
    cityGroup.add(roof);
    cylinder(cityGroup, x, height + 5.5, z, 0.36, 8, new THREE.MeshLambertMaterial({ color: 0xe9b953, emissive: 0x7f5421 }), false, 6);
  };
  tower(CITY.nodeMin + (7 + 0.5) * CITY.pitch, CITY.nodeMin + (4 + 0.5) * CITY.pitch, 52, 0x907167);

  const clothMaterial = new THREE.MeshLambertMaterial({ color: 0xe0a34a, side: THREE.DoubleSide });
  [[0, 0], [0, 72], [72, 0], [-36, 36]].forEach(([x, z]) => {
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(12, 2.8), clothMaterial);
    cloth.position.set(x, 6.4, z);
    cloth.rotation.y = Math.PI / 2;
    cityGroup.add(cloth);
    state.animatables.push({ type: 'banner', mesh: cloth, phase: random.range(0, Math.PI * 2) });
  });

  const ruralBounds = RURAL;
  function districtAt(x, z) {
    if (x >= ruralBounds.minX && x <= ruralBounds.maxX && z >= ruralBounds.minZ && z <= ruralBounds.maxZ) return 'rural';
    if (isOnSand(x, z) || (x <= CITY.beachWestStart && Math.abs(z) <= CITY.half + 20)) return 'beach';
    if (x >= CITY.airfield.minX && x <= CITY.airfield.maxX && z >= CITY.airfield.minZ && z <= CITY.airfield.maxZ) return 'airfield';
    const { minX, maxX, minZ, maxZ } = CITY.downtown;
    if (x >= minX && x <= maxX && z >= minZ && z <= maxZ) return 'downtown';
    return 'city';
  }
  function surfaceAt(x, z) {
    if (dirtRoads.some((road) => x >= road.minX - 1 && x <= road.maxX + 1 && z >= road.minZ - 1 && z <= road.maxZ + 1)) return 'dirt';
    if (isOnSand(x, z)) return 'sand';
    if (x >= ruralBounds.minX && x <= ruralBounds.maxX && z >= ruralBounds.minZ && z <= ruralBounds.maxZ) return 'rural';
    return 'asphalt';
  }
  function update(dt) {
    state.animatables.forEach((item) => {
      if (item.type === 'fountain') {
        const pulse = 0.8 + 0.25 * Math.sin(performance.now() * 0.003);
        item.mesh.scale.y = pulse;
        item.water.material.opacity = 0.7 + pulse * 0.12;
      } else if (item.type === 'banner') {
        item.mesh.rotation.z = Math.sin(performance.now() * 0.0018 + item.phase) * 0.08;
      }
    });
    void dt;
  }
  return { group, state, bounds: ruralBounds, districtAt, surfaceAt, update };
}
