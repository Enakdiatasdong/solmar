// SOLMAR's units are metres and seconds; the simulation runs at a fixed cadence.
export const STEP = 1 / 60;
export const MAX_FRAME = 0.25;
export const SAVE_VERSION = 2;
export const CITY = Object.freeze({ blocks: 10, pitch: 72, half: 360, roadWidth: 20, beachStart: 372, beachEnd: 540 });
export const PLAYER = Object.freeze({ walkSpeed: 4.6, runSpeed: 8.7, radius: 0.55, jumpSpeed: 7.1, gravity: 20, punchCooldown: 0.42, spawn: { x: 2, z: 88 } });
export const CAMERA = Object.freeze({ minZoom: 4.5, maxZoom: 15, carDistance: 12.6, title: { x: -310, y: 210, z: 720, lookY: 26 } });
export const VEHICLE = Object.freeze({ maxSpeed: 33, reverseSpeed: 11, acceleration: 10.8, brake: 22, steering: 1.7, radius: 1.45, health: 100 });
export const TRAFFIC = Object.freeze({ cars: 18, pedestrians: 42, laneOffset: 4.1, cruiseSpeed: 11.5, stuckTime: 6, spawnRadius: 240 });
export const POLICE = Object.freeze({ maxWanted: 5, steal: 2, pedHit: 1, gunNearCop: 1, sight: 85, escapeDelay: 9, decayTime: 3.1, arrestRange: 2.5, arrestTime: 1.15, fine: 350, shotDamage: 7 });
export const MISSIONS = Object.freeze({ order: ['first-fare', 'hot-wheels', 'beach-run', 'heat', 'harbor-job'], rewards: { 'first-fare': 500, 'hot-wheels': 750, 'beach-run': 1200, heat: 1500, 'harbor-job': 3000 } });
export const COMBAT = Object.freeze({ punchRange: 2.6, punchDamage: 34, punchCooldown: 0.42, pistolRange: 75, pistolDamage: 45, ammo: 24, enemyHealth: 60, shotDamage: 7 });
export const AUDIO = Object.freeze({ master: 0.42, music: 0.13, engine: 0.05, siren: 0.045, effects: 0.18 });
export const PALETTE = Object.freeze({ sky: 0x86d5e3, sea: 0x087e87, sand: 0xf1ca83, asphalt: 0x334957, sidewalk: 0xe4d6bb, grass: 0x63a779, ink: 0x132b37, gold: 0xffce68, teal: 0x29d7be, buildings: [0xef7b65, 0xf2c371, 0x67b7b2, 0xc7d2aa, 0xe4a1ae, 0xf5e2bb, 0x6b9cb6, 0xdf8e59] });
