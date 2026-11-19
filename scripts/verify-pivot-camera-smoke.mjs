// Node-only regression checks for the handbrake-pivot + thin-pole camera fixes.
// Runs the production vehicle/camera code with a canvas stub; never creates a renderer.
// Pivot expectation: base c28d8e7 turned 0.693 rad over 60 frames (Space+KeyA from
// standstill: handbrakeSteer 3.6 * 0.35 * grip 0.55). The merge lost it (0.0000 rad).
import assert from 'node:assert/strict';
import * as THREE from '../game/vendor/three.module.min.js';
import { createCity } from '../game/src/world.js';
import { createRandom } from '../game/src/random.js';
import { createVehicles } from '../game/src/vehicles.js';
import { safeCameraDistance, cameraPositionClear } from '../game/src/camera.js';
import { RESTAURANTS } from '../game/src/restaurants.js';
import { SAFEHOUSES } from '../game/src/safehouses.js';
import { ASSETS } from '../game/src/assets.js';

const gradient = { addColorStop() {} };
globalThis.document = {
  createElement: () => ({ width: 0, height: 0,
    getContext: () => new Proxy({}, { get: (_, key) => key === 'createLinearGradient' || key === 'createRadialGradient'
      ? () => gradient : () => {} }),
  }),
};

const city = createCity(createRandom(1), [...RESTAURANTS, ...SAFEHOUSES, ...ASSETS]);
city.group.updateMatrixWorld(true);
const scene = new THREE.Scene();
const vehicles = createVehicles(city, scene);
const car = vehicles.spawnStarter();
const DT = 1 / 60;
const idle = { accelerate: false, brake: false, left: false, right: false, handbrake: false };
function run(controls, frames) {
  const h0 = car.state.heading;
  for (let i = 0; i < frames; i += 1) vehicles.stepCar(car, DT, controls, city.colliders);
  return car.state.heading - h0;
}

// 1. Handbrake pivot from standstill (BUG 1): Space+KeyA 60 frames.
vehicles.setCarPosition(car, -360, 144, 0);
car.state.speed = 0;
const pivot = run({ ...idle, handbrake: true, left: true }, 60);
console.log('pivot Space+KeyA 60f heading Δ =', pivot.toFixed(4), 'rad (base c28d8e7: 0.6930, merge pre-fix: 0.0000)');
assert(pivot > 0.6 && pivot < 0.75, 'pivot must approach base 0.693 rad');

// 2. Driving-speed steering untouched (BUG 1 regression guard): W+KeyA, no handbrake.
vehicles.setCarPosition(car, -360, 144, 0);
car.state.speed = 0;
const drive = run({ ...idle, accelerate: true, left: true }, 120);
console.log('drive W+KeyA 120f heading Δ =', drive.toFixed(4), 'rad (merge pre-fix 60f: 1.1444)');
assert(drive > 1.8 && drive < 4.0, 'W+KeyA steering must be unaffected by the pivot term');

// 3. Thin lamp pole must not occlude the camera (BUG 2).
const lamp = { minX: -349.8, maxX: -349.4, minZ: -61.8, maxZ: -61.4, height: 6.65, roadInfrastructure: true };
const atLamp = cameraPositionClear({ x: -349.6, y: 4.4, z: -61.6 }, [lamp], {});
console.log('cameraPositionClear at lamp pole =', atLamp, '(expect true: thin pole ignored)');
assert.strictEqual(atLamp, true);
// ...while a real wall still blocks.
const wall = { minX: -350, maxX: -340, minZ: -62, maxZ: -61, height: 8 };
const atWall = cameraPositionClear({ x: -345, y: 4.4, z: -61.5 }, [wall], {});
console.log('cameraPositionClear inside wall box =', atWall, '(expect false: wall still blocks)');
assert.strictEqual(atWall, false);
// ...and the follow distance no longer collapses when the ray passes a lamp.
const d = safeCameraDistance({ x: -349, y: 1.5, z: -54 }, 0, 0.35, 7, [lamp], {});
console.log('safeCameraDistance past lamp =', d.toFixed(2), 'm (expect 7.00, no collapse)');
assert(d > 6.9, 'camera distance must not collapse at a lamp pole');

console.log('SMOKE OK');
