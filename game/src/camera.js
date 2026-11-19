const DEFAULT_CAMERA_RADIUS = 0.55;
const DEFAULT_MARGIN = 1;
const DEFAULT_STEP = 0.25;
const MIN_CAMERA_HEIGHT = 1.2;

/** Return the greatest tested distance whose camera sphere clears every tall collider. */
export function safeCameraDistance(focus, yaw, pitch, desiredDistance, colliders, options = {}) {
  if (!focus || ![focus.x, focus.z, yaw, pitch, desiredDistance].every(Number.isFinite)) return 0;
  const radius = Number.isFinite(options.cameraRadius) ? Math.max(0, options.cameraRadius) : DEFAULT_CAMERA_RADIUS;
  const margin = Number.isFinite(options.margin) ? Math.max(0, options.margin) : DEFAULT_MARGIN;
  const step = Number.isFinite(options.step) ? Math.max(0.05, options.step) : DEFAULT_STEP;
  const focusY = Number.isFinite(options.focusY) ? options.focusY : 1.5;
  const height = Number.isFinite(options.height) ? options.height : 2.9;
  const desired = Math.max(0, desiredDistance);
  const horizontal = Math.cos(pitch);
  const sinPitch = Math.sin(pitch);
  const boxes = Array.isArray(colliders) ? colliders : [];
  const clearance = { cameraRadius: radius, margin, minHeight: options.minHeight };
  let safe = 0;

  for (let distance = 0; distance <= desired + 1e-9;) {
    const x = focus.x - Math.sin(yaw) * horizontal * distance;
    const z = focus.z - Math.cos(yaw) * horizontal * distance;
    const y = focusY + height + sinPitch * distance * 0.55;
    if (!cameraPositionClear({ x, y, z }, boxes, clearance)) break;
    safe = distance;
    if (distance === desired) break;
    distance = Math.min(desired, distance + step);
  }
  return safe;
}

/** Match the follow camera's position formula for direct collision checks. */
export function cameraPositionAtDistance(focus, yaw, pitch, distance, options = {}) {
  const focusY = Number.isFinite(options.focusY) ? options.focusY : 1.5;
  const height = Number.isFinite(options.height) ? options.height : 2.9;
  return {
    x: focus.x - Math.sin(yaw) * Math.cos(pitch) * distance,
    y: focusY + height + Math.sin(pitch) * distance * 0.55,
    z: focus.z - Math.cos(yaw) * Math.cos(pitch) * distance,
  };
}

export function cameraPositionClear(position, colliders, options = {}) {
  if (!position || ![position.x, position.y, position.z].every(Number.isFinite)) return false;
  const radius = Number.isFinite(options.cameraRadius) ? Math.max(0, options.cameraRadius) : DEFAULT_CAMERA_RADIUS;
  const margin = Number.isFinite(options.margin) ? Math.max(0, options.margin) : DEFAULT_MARGIN;
  const minHeight = options.minHeight ?? MIN_CAMERA_HEIGHT;
  if (position.y - radius < minHeight) return false;
  return !(Array.isArray(colliders) ? colliders : []).some((box) => {
    if (!box || ![box.minX, box.maxX, box.minZ, box.maxZ].every(Number.isFinite)) return false;
    // Thin poles (streetlight/signal poles: ~0.4 m footprint, ~7 m tall) cannot
    // occlude the camera: the probe sphere (radius + margin ≈ 1.55 m) would
    // otherwise collapse the follow distance to 0 whenever the ray passes near
    // a pole, snapping the camera onto the player's head and flipping yaw
    // (degenerate lookAt at distance 0). Walls are thin in one axis only, so
    // require BOTH horizontal extents to be thin; palm trunks (0.72 m) and
    // piers still block.
    if ((box.maxX - box.minX) <= 0.5 && (box.maxZ - box.minZ) <= 0.5) return false;
    const top = Number.isFinite(box.height) ? box.height : Infinity;
    const bottom = Number.isFinite(box.minY) ? box.minY : 0;
    if (position.y + radius < bottom - margin || position.y - radius > top + margin) return false;
    const extent = radius + margin;
    return position.x >= box.minX - extent && position.x <= box.maxX + extent
      && position.z >= box.minZ - extent && position.z <= box.maxZ + extent;
  });
}

/** Find a shortest road-graph node route between two positions, returning null if unavailable. */
export function findRoadRoute(graph, start, goal) {
  if (!graph?.nearestNode || !start || !goal) return null;
  const first = graph.nearestNode(start.x, start.z);
  const last = graph.nearestNode(goal.x, goal.z);
  if (!first || !last) return null;
  if (first === last) return [first];
  const previous = new Map([[first, null]]);
  const queue = [first];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const node = queue[cursor];
    if (node === last) break;
    for (const edge of node.neighbors ?? []) {
      const next = edge.other ?? edge.node ?? edge;
      if (!next || previous.has(next)) continue;
      previous.set(next, node);
      queue.push(next);
    }
  }
  if (!previous.has(last)) return null;
  const route = [];
  for (let node = last; node; node = previous.get(node)) route.push(node);
  route.reverse();
  return route;
}
