// Shared road geometry: rendering, placement and verification use the same graph.
import { CITY, RURAL } from './config.js';

export const DIRT_ROADS = [
  { minX: -650, maxX: 650, minZ: -565, maxZ: -555 },
  { minX: -305, maxX: -295, minZ: -900, maxZ: -360 },
  { minX: 295, maxX: 305, minZ: -900, maxZ: -360 },
  { minX: -420, maxX: -300, minZ: -722, maxZ: -718 },
  { minX: -450, maxX: -300, minZ: -622, maxZ: -618 },
  { minX: 60, maxX: 300, minZ: -862, maxZ: -858 },
];

export function buildRoadGraph() {
  const size = CITY.grid + 1;
  const nodes = [];
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      nodes.push({
        id: row * size + column,
        column,
        row,
        x: CITY.nodeMin + column * CITY.pitch,
        z: CITY.nodeMin + row * CITY.pitch,
        neighbors: [],
      });
    }
  }
  const edges = [];
  function connect(a, b, width = CITY.road) {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const freeway = (a.x === b.x && Math.abs(a.x) === Math.abs(CITY.freeway.minX)
      && Math.min(a.z, b.z) >= CITY.freeway.minZ && Math.max(a.z, b.z) <= CITY.freeway.maxZ)
      || (a.z === b.z && Math.abs(a.z) === Math.abs(CITY.freeway.minZ)
        && Math.min(a.x, b.x) >= CITY.freeway.minX && Math.max(a.x, b.x) <= CITY.freeway.maxX);
    const edge = { a, b, dx, dz, length: Math.hypot(dx, dz), freeway, width: freeway ? CITY.freeway.width : width, zone: a.zone ?? b.zone ?? (freeway ? 'freeway' : 'city') };
    edges.push(edge);
    a.neighbors.push({ edge, other: b, direction: { x: Math.sign(dx), z: Math.sign(dz) } });
    b.neighbors.push({ edge, other: a, direction: { x: -Math.sign(dx), z: -Math.sign(dz) } });
  }
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      const node = nodes[row * size + column];
      if (column + 1 < size) connect(node, nodes[row * size + column + 1]);
      if (row + 1 < size) connect(node, nodes[(row + 1) * size + column]);
    }
  }
  const airportRoad = [];
  // End at the taxiway; the terminal occupies x=0 beyond z=507.
  for (const z of [432, 504]) {
    const node = { id: nodes.length, column: null, row: null, x: 0, z, zone: 'airport', neighbors: [] };
    nodes.push(node);
    airportRoad.push(node);
  }
  connect(nodes[10 * size + 5], airportRoad[0]);
  connect(airportRoad[0], airportRoad[1]);
  const addRuralNode = (x, z) => {
    const node = { id: nodes.length, column: null, row: null, x, z, zone: 'hills', neighbors: [] };
    nodes.push(node);
    return node;
  };
  // Follow the existing z=-560 cross-country road and x=±300 tracks. Keeping
  // these in the shared graph gives northern traffic and race checkpoints real roads.
  const crossroad = new Map();
  let previous = null;
  for (const x of [-648, -576, -504, -432, -360, -300, -288, -216, -144, -72, 0, 72, 144, 216, 288, 300, 360, 432, 504, 576, 648]) {
    const node = addRuralNode(x, -560);
    crossroad.set(x, node);
    if (previous) connect(previous, node, 10);
    previous = node;
  }
  for (const x of [-300, 300]) {
    previous = nodes[x < 0 ? 1 : 9];
    // The slopes start just north of -888; leave room to turn at the track end.
    for (const z of [-360, -380, -452, -524, -560, -632, -704, -776, -840, -880]) {
      const node = z === -560 ? crossroad.get(x) : addRuralNode(x, z);
      connect(previous, node, 10);
      previous = node;
    }
  }
  const graph = {
    nodes,
    edges,
    size,
    nodeAt(column, row) {
      if (!Number.isInteger(column) || !Number.isInteger(row) || column < 0 || row < 0 || column >= size || row >= size) return null;
      return nodes[row * size + column];
    },
    nearestNode(x, z) {
      if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
      let best = null;
      let bestDistance = Infinity;
      for (const node of nodes) {
        const distance = (node.x - x) ** 2 + (node.z - z) ** 2;
        if (distance < bestDistance) { best = node; bestDistance = distance; }
      }
      return best;
    },
    nearestEdge(x, z) {
      if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
      let best = null;
      let bestDistance = Infinity;
      for (let index = 0; index < edges.length; index += 1) {
        const edge = edges[index];
        const minX = Math.min(edge.a.x, edge.b.x);
        const maxX = Math.max(edge.a.x, edge.b.x);
        const minZ = Math.min(edge.a.z, edge.b.z);
        const maxZ = Math.max(edge.a.z, edge.b.z);
        const px = Math.max(minX, Math.min(maxX, x));
        const pz = Math.max(minZ, Math.min(maxZ, z));
        const distance = Math.hypot(px - x, pz - z);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = { edge, x: px, z: pz, distance };
        }
      }
      return best;
    },
  };
  return graph;
}

// Include the rendered ends of rural tracks, footpaths and the west causeway,
// which extend beyond the traffic graph. These are finite segments, not infinite lines.
export const ROAD_CORRIDORS = [
  ...buildRoadGraph().edges,
  ...DIRT_ROADS.map(({ minX, maxX, minZ, maxZ }) => maxX - minX > maxZ - minZ
    ? { a: { x: minX, z: (minZ + maxZ) / 2 }, b: { x: maxX, z: (minZ + maxZ) / 2 }, width: maxZ - minZ }
    : { a: { x: (minX + maxX) / 2, z: minZ }, b: { x: (minX + maxX) / 2, z: maxZ }, width: maxX - minX }),
  { a: { x: -648, z: 84 }, b: { x: -360, z: 84 }, width: 18 },
];

export function footprint({ x, z }, { width, depth, offsetX = 0, offsetZ = 0 }) {
  return { minX: x + offsetX - width / 2, maxX: x + offsetX + width / 2,
    minZ: z + offsetZ - depth / 2, maxZ: z + offsetZ + depth / 2 };
}

// Fit procedural lots to the widest adjoining corridor instead of erasing whole
// city blocks for a small roof/setback overrun. 40 m leaves 16 m on both sides.
export function fitGridFootprint(x, z, width, depth) {
  if (!roadConflict({ x, z, width, depth })) return { x, z, width, depth };
  const center = (value) => CITY.nodeMin + (Math.floor((value - CITY.nodeMin) / CITY.pitch) + 0.5) * CITY.pitch;
  const cx = center(x), cz = center(z), half = CITY.pitch / 2 - Math.max(15, CITY.freeway.width / 2 + 4);
  width = Math.min(width, half * 2); depth = Math.min(depth, half * 2);
  x = Math.max(cx - half + width / 2, Math.min(cx + half - width / 2, x));
  z = Math.max(cz - half + depth / 2, Math.min(cz + half - depth / 2, z));
  return { x, z, width, depth };
}

/** AABB vs segment corridor, including end caps. Full half-extents are added by
 * the AABB, never just a point/centre check. 15 m reserves the 11 m road half-width
 * plus sidewalk/buffer; the 24 m freeway gets 16 m. Both exceed the 2 m minimum. */
export function roadConflict(box, corridors = ROAD_CORRIDORS) {
  if ('width' in box) box = footprint(box, box);
  if (![box.minX, box.maxX, box.minZ, box.maxZ].every(Number.isFinite)
    || box.minX > box.maxX || box.minZ > box.maxZ) throw new TypeError('Invalid prop footprint');
  return corridors.find(({ a, b, width }) => {
    const margin = Math.max(15, width / 2 + 4);
    return box.maxX > Math.min(a.x, b.x) - margin + 1e-6
      && box.minX < Math.max(a.x, b.x) + margin - 1e-6
      && box.maxZ > Math.min(a.z, b.z) - margin + 1e-6
      && box.minZ < Math.max(a.z, b.z) + margin - 1e-6;
  }) ?? null;
}

/** Deterministic nearest valid block interior. Check the entire model, including
 * offsets from the gameplay apron. Never drop a place or depend on city RNG. */
export function relocateFootprint(point, shape) {
  if (!roadConflict(footprint(point, shape))) return { x: point.x, z: point.z };
  const candidates = [];
  for (let row = -9; row <= CITY.grid; row++) for (let col = -3; col <= CITY.grid + 4; col++) {
    const x = CITY.nodeMin + (col + 0.5) * CITY.pitch;
    const z = CITY.nodeMin + (row + 0.5) * CITY.pitch;
    const bounds = footprint({ x, z }, shape);
    const rural = bounds.maxZ < CITY.nodeMin;
    if (bounds.minX < (rural ? RURAL.minX : CITY.beachWestEnd) + 2
      || bounds.maxX > (rural ? RURAL.maxX : CITY.edge) - 2
      || bounds.minZ < RURAL.minZ + 2 || bounds.maxZ > CITY.airfield.maxZ - 2) continue;
    if (!roadConflict(bounds)) candidates.push({ x, z });
    const aligned = { x: x - (shape.offsetX ?? 0), z: z - (shape.offsetZ ?? 0) };
    if (!roadConflict(footprint(aligned, shape))) candidates.push(aligned);
  }
  candidates.sort((a, b) => (a.x - point.x) ** 2 + (a.z - point.z) ** 2
    - ((b.x - point.x) ** 2 + (b.z - point.z) ** 2) || a.x - b.x || a.z - b.z);
  if (!candidates.length) throw new RangeError('No road-clear lot fits the prop footprint');
  return candidates[0];
}

export function placeShape(place, kind = 'asset') {
  const width = place.width ?? 8, depth = place.depth ?? 6;
  const minZ = -depth - (kind === 'restaurant' ? 3.6 : 2.1), maxZ = 2.32;
  return { width: width + 0.8, depth: maxZ - minZ, offsetZ: (minZ + maxZ) / 2 };
}

export function placeOffRoad(place, kind) {
  return { ...place, ...relocateFootprint(place, placeShape(place, kind)) };
}
