// SOLMAR simulation constants: metres, seconds, and a fixed simulation step.
export const STEP = 1 / 60;
export const MAX_FRAME = 0.25;
export const SAVE_VERSION = 2;
export const CITY = { half: 360, pitch: 72, nodeMin: -360, roadWidth: 22, beachStart: 372, beachEnd: 534, pierX: 252, pierEnd: 650 };
export const PLAYER = { spawn: { x: 2, z: 96 }, walkSpeed: 5.2, runSpeed: 8.7, radius: 0.52, jumpSpeed: 7, gravity: 19, punchCooldown: 0.42, maxHealth: 100 };
export const CAMERA = { distance: 8, carDistance: 11.5, height: 5.6, minDistance: 4.5, maxDistance: 18, title: { x: -250, y: 205, z: 565, lookX: 60, lookY: 10, lookZ: 25 } };
export const VEHICLE = { maxSpeed: 33, reverseSpeed: 11, acceleration: 15, brake: 27, drag: 0.6, steer: 1.75, radius: 2, enterRange: 4.8 };
export const TRAFFIC = { cars: 22, pedestrians: 44, speed: 12, laneOffset: 4.2, stuckSeconds: 6 };
export const POLICE = { steal: 2, pedHit: 1, hear: 65, gunNearCop: 1, sight: 90, arrestRange: 2.5, arrestTime: 1.15, fine: 350, shotDamage: 7, decayDelay: 9, decayRate: 0.32, maxCars: 4, maxFoot: 3 };
export const MISSIONS = { order: ['first-fare', 'hot-wheels', 'beach-run', 'heat', 'harbor-job'], rewards: { 'first-fare': 500, 'hot-wheels': 750, 'beach-run': 1200, heat: 1500, 'harbor-job': 3000 } };
export const COMBAT = { pistolRange: 55, pistolDamage: 45, punchDamage: 34, punchRange: 2.6, punchCooldown: 0.42, shotCooldown: 0.26, enemyHealth: 60, enemyRange: 30, enemyDamage: 7 };
export const AUDIO = { master: 0.38, music: 0.13, engine: 0.13, siren: 0.085, effects: 0.22, bpm: 104 };
export const PALETTE = { sky: 0x9dd8e6, fog: 0xc7e1dc, ocean: 0x237e91, sand: 0xedd4a0, road: 0x303c49, sidewalk: 0xd8d2bd, grass: 0x6f9b68, teal: 0x30d5c2, gold: 0xffcd75, coral: 0xe98275, navy: 0x142736, white: 0xf9edcf, buildings: [0xdba88d, 0xf1c6a0, 0x89ada7, 0xc7c4ad, 0xe8aa9e, 0x87a5b7] };
