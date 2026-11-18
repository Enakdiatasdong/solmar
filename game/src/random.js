// An isolated generator makes scenery and staged camera frames reproducible.
export function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let bits = Math.imul(state ^ (state >>> 15), state | 1);
    bits ^= bits + Math.imul(bits ^ (bits >>> 7), bits | 61);
    return ((bits ^ (bits >>> 14)) >>> 0) / 4294967296;
  };
}
export function parseSeed(value = new URLSearchParams(globalThis.location?.search || '').get('seed')) {
  if (value == null || value === '') return 1;
  if (/^-?\d+$/.test(String(value))) return Number(value) >>> 0;
  let hash = 2166136261;
  for (const letter of String(value)) hash = Math.imul(hash ^ letter.charCodeAt(0), 16777619);
  return hash >>> 0;
}
export function createRandom(seed = 1) {
  const next = mulberry32(seed);
  next.range = (min, max) => min + next() * (max - min);
  next.int = (min, max) => Math.floor(next.range(min, max + 1));
  next.pick = values => values[Math.floor(next() * values.length)];
  return next;
}
