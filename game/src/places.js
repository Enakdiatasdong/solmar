import * as THREE from '../vendor/three.module.min.js';

// The place coordinate is the front apron, leaving room to approach or respawn.
export function createPlaceMarker(scene, place, {
  color = 0xc6ac88, roof = 0x645964, width = 8, depth = 6,
  ring = '#ffc857', kind = 'asset',
} = {}) {
  width = Number.isFinite(width) && width > 0 ? width : 8;
  depth = Number.isFinite(depth) && depth > 0 ? depth : 6;
  const group = new THREE.Group();
  group.name = `${kind}:${place.id ?? 'place'}`;
  group.position.set(place.x, 0, place.z);
  group.userData.placeId = place.id;
  group.userData.kind = kind;
  const wallMaterial = new THREE.MeshLambertMaterial({ color });
  const roofMaterial = new THREE.MeshLambertMaterial({ color: roof });
  const trimMaterial = new THREE.MeshLambertMaterial({ color: 0xf2dfb7 });
  const glassMaterial = new THREE.MeshLambertMaterial({ color: 0x254550 });
  const bodyZ = -depth / 2 - 1.8;
  const frontZ = bodyZ - depth / 2;
  const height = kind === 'safehouse' ? 4.2 : 3.5;

  function box(w, h, d, x, y, z, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }

  box(width, height, depth, 0, height / 2 + 0.28, bodyZ, wallMaterial);
  if (kind === 'asset') {
    box(width + 0.6, 0.5, depth + 0.6, 0, height + 0.5, bodyZ, roofMaterial);
    box(width * 0.6, 0.7, 0.16, 0, height - 0.3, -1.67, trimMaterial);
  } else {
    const rise = kind === 'safehouse' ? 1.9 : 1.1;
    const triangle = new THREE.Shape();
    triangle.moveTo(-width / 2 - 0.4, 0);
    triangle.lineTo(width / 2 + 0.4, 0);
    triangle.lineTo(0, rise);
    triangle.closePath();
    const geometry = new THREE.ExtrudeGeometry(triangle, { depth: depth + 0.6, bevelEnabled: false });
    const top = new THREE.Mesh(geometry, roofMaterial);
    top.position.set(0, height + 0.28, bodyZ - depth / 2 - 0.3);
    top.castShadow = true;
    group.add(top);
    if (kind === 'safehouse') {
      box(0.7, 1.8, 0.7, width * 0.28, height + 1.3, bodyZ - depth * 0.2, trimMaterial);
    } else {
      box(width + 0.5, 0.25, 1.8, 0, 2.7, frontZ - 0.9, trimMaterial);
      box(0.14, 2.65, 0.14, -width / 2, 1.6, frontZ - 0.08, roofMaterial);
      box(0.14, 2.65, 0.14, width / 2, 1.6, frontZ - 0.08, roofMaterial);
    }
  }
  box(1.1, 2.1, 0.12, 0, 1.33, frontZ - 0.08, glassMaterial);
  for (const side of [-1, 1]) {
    box(width * 0.2, 1.1, 0.14, side * width * 0.3, 1.8, frontZ - 0.09, glassMaterial);
  }
  const marker = new THREE.Mesh(
    new THREE.TorusGeometry(2.2, 0.12, 8, 40),
    new THREE.MeshBasicMaterial({ color: ring }),
  );
  marker.rotation.x = -Math.PI / 2;
  marker.position.y = 0.34;
  group.add(marker);
  scene.add(group);
  return group;
}

export function nearestPlace(list, x, z, radius = 5) {
  if (!Array.isArray(list) || !Number.isFinite(x) || !Number.isFinite(z)
    || !Number.isFinite(radius) || radius < 0) return null;
  let nearest = null;
  let distance = radius * radius;
  for (const place of list) {
    if (!Number.isFinite(place?.x) || !Number.isFinite(place?.z)) continue;
    const candidate = (place.x - x) ** 2 + (place.z - z) ** 2;
    if (candidate <= distance && (nearest === null || candidate < distance)) {
      nearest = place;
      distance = candidate;
    }
  }
  return nearest;
}
