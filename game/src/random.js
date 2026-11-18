// A string seed is hashed once; all procedural decisions then use this small generator.
export function parseSeed(value = 1) {
  if (typeof value === 'number' && Number.isFinite(value)) return value >>> 0;
  const source = String(value ?? '1');
  if (/^[-+]?\d+$/.test(source)) return Number(source) >>> 0;
  let hash = 2166136261;
  for (let i = 0; i < source.length; i++) hash = Math.imul(hash ^ source.charCodeAt(i), 16777619);
  return hash >>> 0;
}
export function mulberry32(seed) {
  let counter = parseSeed(seed);
  return function random() {
    counter = (counter + 0x6d2b79f5) | 0;
    let bits = Math.imul(counter ^ counter >>> 15, 1 | counter);
    bits ^= bits + Math.imul(bits ^ bits >>> 7, 61 | bits);
    return ((bits ^ bits >>> 14) >>> 0) / 4294967296;
  };
}
export function createRandom(seed = 1) {
  const random = mulberry32(seed);
  random.range = (low, high) => low + (high - low) * random();
  random.int = (low, high) => Math.floor(random.range(low, high + 1));
  random.pick = items => items.length ? items[Math.floor(random() * items.length)] : undefined;
  random.chance = probability => random() < probability;
  random.sign = () => random() < 0.5 ? -1 : 1;
  random.shuffle = source => {
    const items = source.slice();
    for (let i = items.length - 1; i > 0; i--) {
      const j = random.int(0, i);
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  };
  return random;
}
