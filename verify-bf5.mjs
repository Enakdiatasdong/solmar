import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRandom, mulberry32 } from './game/src/random.js';

const trafficUrl = new URL('./game/src/traffic.js', import.meta.url);
const trafficSource = readFileSync(trafficUrl, 'utf8');
const weightLiteral = trafficSource.match(/const TRAFFIC_MODEL_WEIGHTS\s*=\s*(\[[\s\S]*?\]);/);
assert.ok(weightLiteral, 'TRAFFIC_MODEL_WEIGHTS array must exist in traffic.js');
const weights = JSON.parse(weightLiteral[1].replaceAll("'", '"').replace(/,\s*]/g, ']'));
const commons = new Set(['standard', 'thunder', 'compact', 'suv']);
const rares = new Set(['obsidian', 'grandtourer', 'gullwing', 'teardrop']);
const models = weights.map(([id]) => id);
assert.deepEqual(new Set(models), new Set([...commons, ...rares]));
assert.equal(weights.length, 8, 'Exactly eight distinct models are required');
assert.ok(weights.every(([, weight]) => Number.isFinite(weight) && weight > 0));
const totalWeight = weights.reduce((sum, [, weight]) => sum + weight, 0);
const carsPerSeed = 48;
const taxiChance = 1 / 12;
let failed = false;

function check(label, passed) {
  console.log(`${passed ? 'PASS' : 'FAIL'} ${label}`);
  failed ||= !passed;
}

function sourceFunction(name) {
  const match = trafficSource.match(new RegExp(`^  function ${name}\\([^]*?^  }`, 'm'));
  assert.ok(match, `${name} must exist in traffic.js`);
  return match[0].slice(match[0].indexOf(') {') + 3, -1);
}

// Keep this cumulative-subtraction loop identical to traffic.js:pickTrafficModel.
function pickTrafficModel(random) {
  let choice = random() * totalWeight;
  for (const [id, weight] of weights) {
    choice -= weight;
    if (choice <= 0) return id;
  }
  return weights.at(-1)[0];
}

function simulate(seed) {
  const random = createRandom(seed);
  const counts = Object.fromEntries(models.map((id) => [id, 0]));
  for (let car = 0; car < carsPerSeed; car += 1) {
    // Exactly one taxi draw; only non-taxis consume a weighted model draw.
    const taxi = random.chance(taxiChance);
    const modelId = taxi ? 'thunder' : pickTrafficModel(random);
    counts[modelId] += 1;
  }
  return counts;
}

function passes(id, count) {
  const share = count / carsPerSeed;
  return commons.has(id) ? share >= 0.15 : share <= 0.08;
}

function allPass(counts) {
  return models.every((id) => passes(id, counts[id]));
}

// Fail closed if the source selection rule drifts from the replicated rule.
const compact = (source) => source.replace(/\s+/g, '');
const expectedPicker = `let choice = random() * TRAFFIC_MODEL_WEIGHT;
  for (const [id, weight] of TRAFFIC_MODEL_WEIGHTS) {
    choice -= weight;
    if (choice <= 0) return id;
  }
  return TRAFFIC_MODEL_WEIGHTS.at(-1)[0];`;
check('B7 source picker matches cumulative-subtraction replica',
  compact(sourceFunction('pickTrafficModel')) === compact(expectedPicker));
check('B7 taxi source remains 1/12 with thunder override',
  /const taxi = random\.chance\(1\s*\/\s*12\);\s*const modelId = taxi \? 'thunder' : pickTrafficModel\(\);/.test(sourceFunction('makeTrafficCar')));

console.log(`\nExpected shares: 100 * ((11/12) * weight/${totalWeight} + (thunder ? 1/12 : 0))`);
for (const [id, weight] of weights) {
  const expected = (1 - taxiChance) * weight / totalWeight + (id === 'thunder' ? taxiChance : 0);
  const [minimum, maximum] = commons.has(id) ? [0.18, 0.21] : [0.05, 0.065];
  check(`${id.padEnd(11)} weight=${String(weight).padStart(2)} expected=${(100 * expected).toFixed(4)}% (target ${100 * minimum}..${100 * maximum}%)`,
    expected >= minimum && expected <= maximum);
}

console.log('\nSeeds 1..20, 48 cars each. Cells: count/percent + P(ASS) or F(AIL).');
console.log('Thresholds: commons >=15% (>=8 cars); rares <=8% (<=3 cars).');
console.log(['seed'.padStart(4), ...models.map((id) => id.padStart(12)), 'all 8'].join(' '));
const seededResults = [];
for (let seed = 1; seed <= 20; seed += 1) {
  const counts = simulate(seed);
  const passed = allPass(counts);
  seededResults.push(counts);
  failed ||= !passed;
  const cells = models.map((id) => `${counts[id]}/${(100 * counts[id] / carsPerSeed).toFixed(1)}${passes(id, counts[id]) ? 'P' : 'F'}`.padStart(12));
  console.log([String(seed).padStart(4), ...cells, passed ? 'PASS' : 'FAIL'].join(' '));
}
const seededPasses = seededResults.filter(allPass).length;
console.log(`Seeds passing all 8 models: ${seededPasses}/20 (${(100 * seededPasses / 20).toFixed(1)}%).`);
console.log('Worst share per model across seeds 1..20 (minimum common / maximum rare):');
for (const id of models) {
  const counts = seededResults.map((result) => result[id]);
  const worst = commons.has(id) ? Math.min(...counts) : Math.max(...counts);
  console.log(`  ${id.padEnd(11)} ${String(worst).padStart(2)}/48 = ${(100 * worst / carsPerSeed).toFixed(4)}% ${passes(id, worst) ? 'PASS' : 'FAIL'}`);
}

// Reproducible Monte Carlo: 500 distinct random uint32 seeds from mulberry32(0xbf5).
const monteCarloSize = 500;
const seedRandom = mulberry32(0xbf5);
const randomSeeds = new Set();
while (randomSeeds.size < monteCarloSize) randomSeeds.add(Math.floor(seedRandom() * 4294967296));
const modelFailures = Object.fromEntries(models.map((id) => [id, 0]));
let monteCarloPasses = 0;
for (const seed of randomSeeds) {
  const counts = simulate(seed);
  if (allPass(counts)) monteCarloPasses += 1;
  for (const id of models) if (!passes(id, counts[id])) modelFailures[id] += 1;
}
console.log('\nMonte Carlo: 500 distinct random seeds x 48 cars (seed generator: mulberry32(0xbf5)).');
for (const id of models) {
  console.log(`  ${id.padEnd(11)} failures ${String(modelFailures[id]).padStart(3)}/500 = ${(100 * modelFailures[id] / monteCarloSize).toFixed(2)}%`);
}
console.log(`Seeds passing all 8 models: ${monteCarloPasses}/500 = ${(100 * monteCarloPasses / monteCarloSize).toFixed(2)}%.`);

const fleeingBody = sourceFunction('spawnFleeingPed');
const guard = fleeingBody.match(/^\s*if\s*\(\s*peds\.length\s*>=\s*PED_LIMIT\s*\)\s*return\s+null\s*;/);
const firstEffect = fleeingBody.search(/\bpedMesh\s*\(|\bnew\s+THREE\.|\bpeds\.push\s*\(|\bscene\.add\s*\(/);
check('B8 spawnFleeingPed starts with PED_LIMIT return null before mesh/scene/push',
  /const PED_LIMIT\s*=\s*72\s*;/.test(trafficSource)
    && guard !== null && firstEffect >= guard[0].length);

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
    return entry.isDirectory() ? sourceFiles(url) : entry.name.endsWith('.js') ? [url] : [];
  });
}

const callers = [];
for (const url of sourceFiles(new URL('./game/src/', import.meta.url))) {
  const lines = readFileSync(url, 'utf8').split('\n');
  lines.forEach((line, index) => {
    if (!/\bspawnFleeingPed\s*\(/.test(line) || /^\s*function spawnFleeingPed\s*\(/.test(line)) return;
    callers.push({ file: url.pathname.split('/').at(-1), line: index + 1,
      ignored: /^\s*traffic\.spawnFleeingPed\(.*\);\s*(?:\/\/.*)?$/.test(line) });
  });
}
check(`B8 main.js call ignores return value (${callers.map(({ file, line }) => `${file}:${line}`).join(', ')})`,
  callers.some(({ file, ignored }) => file === 'main.js' && ignored));
check('B8 all game/src spawnFleeingPed callers ignore return value',
  callers.length > 0 && callers.every(({ ignored }) => ignored));

if (seededPasses < 20) {
  console.log('\nFAIL: finite-sample thresholds are not met by every seed; expected shares stay in target bands.');
  console.log('Sampling failures remain visible; Monte Carlo reports their frequency, not an assertion of zero risk.');
}
console.log(`\nOverall: ${failed ? 'FAIL' : 'PASS'}`);
process.exitCode = failed ? 1 : 0;
