// Validate actual rendered geometry as well as declared building/place footprints.
import * as THREE from '../vendor/three.module.min.js';
import { roadConflict, relocateFootprint } from './roads.js';

export const relocateProp = relocateFootprint;

function visitFootprints(root, visit) {
  root.updateMatrixWorld(true);
  const instance = new THREE.Matrix4(), world = new THREE.Matrix4();
  const vertex = new THREE.Vector3();
  function walk(node, infrastructure = false) {
    infrastructure ||= node.userData.roadInfrastructure === true;
    if (!node.visible || infrastructure) return;
    if (node.material?.blending === THREE.AdditiveBlending) return; // light spill has no physical footprint
    if (node.geometry && (node.isMesh || node.isInstancedMesh)) {
      if (!node.geometry.boundingBox) node.geometry.computeBoundingBox();
      const count = node.isInstancedMesh ? node.count : 1;
      for (let index = 0; index < count; index++) {
        if (node.isInstancedMesh) {
          node.getMatrixAt(index, instance);
          world.multiplyMatrices(node.matrixWorld, instance);
        } else world.copy(node.matrixWorld);
        let box = node.geometry.boundingBox.clone().applyMatrix4(world);
        // A rotated bounding box overstates gabled/conical roofs. Use transformed
        // vertices for rotated geometry, so valid market roofs are not culled.
        const e = world.elements;
        if (Math.abs(e[1]) + Math.abs(e[2]) + Math.abs(e[4]) + Math.abs(e[6]) + Math.abs(e[8]) + Math.abs(e[9]) > 1e-6) {
          box = new THREE.Box3();
          const positions = node.geometry.getAttribute('position');
          for (let v = 0; v < positions.count; v++) box.expandByPoint(vertex.fromBufferAttribute(positions, v).applyMatrix4(world));
        }
        // Flat ground, paving and road paint are surfaces, not roadside obstacles.
        if (box.isEmpty() || box.max.y <= 0.4 || (box.max.x - box.min.x < 1e-7 && box.max.z - box.min.z < 1e-7)) continue;
        visit(node, index, { minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z });
      }
    }
    for (const child of [...node.children]) walk(child, infrastructure);
  }
  walk(root);
}

/** Decoration may be omitted, gameplay places are relocated before this pass.
 * Check every individual instance (a whole InstancedMesh AABB spans many roads).
 * Road decks, guardrails, medians and overhead traffic signals are explicitly
 * designated infrastructure at their construction sites. */
export function enforceRoadClearance(root, colliders = []) {
  const removed = [];
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  visitFootprints(root, (node, index, bounds) => {
    if (!roadConflict(bounds)) return;
    removed.push({ name: node.name || node.geometry.type, index, ...bounds });
    if (node.isInstancedMesh) {
      node.setMatrixAt(index, zero);
      node.instanceMatrix.needsUpdate = true;
      // Recompute cached bounding volumes after changing instance transforms.
      node.boundingBox = node.boundingSphere = null;
    } else node.removeFromParent();
  });
  for (let index = colliders.length - 1; index >= 0; index--) {
    if (!colliders[index].roadInfrastructure && roadConflict(colliders[index])) colliders.splice(index, 1);
  }
  root.userData.roadClearance = { removed };
  return removed;
}

export function auditRoadClearance(roots) {
  let checked = 0;
  const violations = [], categories = {};
  for (const root of roots) {
    let count = 0;
    visitFootprints(root, (node, index, bounds) => {
      checked++; count++;
      if (roadConflict(bounds)) violations.push({ root: root.name, name: node.name || node.geometry.type, index, ...bounds });
    });
    categories[root.name] = (categories[root.name] ?? 0) + count;
  }
  return { ok: violations.length === 0, checked, categories, violations };
}
