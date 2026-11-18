// Seeded randomness: mulberry32, plus the small helpers the world generators need. The same seed
// (from ?seed=N) always rebuilds the same city, traffic, missions and screenshot scenes.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A mulberry32 function decorated with range/int/pick/chance helpers. */
export function createRandom(seed) {
  const random = mulberry32(seed);
  random.range = (min, max) => min + (max - min) * random();
  random.int = (min, max) => {
    const first = Math.ceil(min);
    const last = Math.floor(max);
    const count = last - first + 1;
    if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last) || !Number.isSafeInteger(count) || count <= 0) {
      throw new RangeError('Integer range must contain a finite, safely representable integer.');
    }
    return first + Math.floor(random() * count);
  };
  random.pick = (items) => items[Math.floor(random() * items.length)];
  random.chance = (probability) => random() < probability;
  random.sign = () => (random() < 0.5 ? -1 : 1);
  random.shuffle = (items) => {
    for (let index = items.length - 1; index > 0; index -= 1) {
      const other = Math.floor(random() * (index + 1));
      const value = items[index];
      items[index] = items[other];
      items[other] = value;
    }
    return items;
  };
  return random;
}

function integerSeed(value) {
  if (typeof value === 'string') {
    const text = value.trim();
    if (!/^[+-]?\d+$/.test(text)) return null;
    value = Number(text);
  }
  return Number.isSafeInteger(value) ? value >>> 0 : null;
}

/** Parse a whole decimal integer; valid seeds and fallbacks both wrap to uint32. */
export function parseSeed(value, fallback = 1) {
  return integerSeed(value) ?? integerSeed(fallback) ?? 1;
}
