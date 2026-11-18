// Every tuning number and colour for SOLMAR, the original open-world game set in a fictional
// coastal city. Nothing here touches the DOM; the renderer, simulation and HUD all read from it.

export const STEP = 1 / 60;
export const MAX_FRAME = 0.25;

export const OUTFITS = [
  { id: 'crimson', name: 'Crimson', color: 0xb84c3d },
  { id: 'teal', name: 'Teal', color: 0x2f7f75 },
  { id: 'gold', name: 'Gold', color: 0xd2b24c },
  { id: 'violet', name: 'Violet', color: 0x7a4f8e },
];
export const DEFAULT_OUTFIT = 'crimson';

/** Procedural city: a square grid of blocks separated by roads, with a beach on the south edge. */
export const CITY = {
  grid: 10,
  block: 54,
  road: 18,
  pitch: 72,
  nodeMin: -360,
  nodeMax: 360,
  half: 360,
  edge: 369,
  beachStart: 372,
  beachEnd: 540,
  oceanStart: 540,
  oceanWidth: 4000,
  parkBlocks: [
    [3, 3],
    [7, 4],
    [2, 7],
    [6, 6],
    [2, 8],
  ],
};

export const RURAL = { minX: -700, maxX: 700, minZ: -950, maxZ: -380 };

/** Jax Moreno on foot. Distances are metres, speeds metres per second. */
export const PLAYER = {
  walkSpeed: 4.9,
  runSpeed: 8.7,
  jumpSpeed: 6.2,
  gravity: 20,
  radius: 0.45,
  height: 1.8,
  health: 100,
  respawnInvuln: 1.4,
  punchRange: 2.6,
  punchDamage: 34,
  punchCooldown: 0.42,
};

export const CAMERA = {
  distance: 7,
  carDistance: 10,
  height: 2.9,
  carHeight: 4.2,
  pitch: 0.3,
  minPitch: -0.08,
  maxPitch: 1.0,
  sensitivity: 0.0045,
  minDistance: 4.5,
  maxDistance: 15,
  follow: 12,
};

/** Arcade driving. The handbrake cuts grip and lets the tail slide. */
export const VEHICLE = {
  accel: 15,
  brake: 26,
  reverseAccel: 9,
  maxSpeed: 33,
  maxReverse: 9,
  drag: 0.75,
  roll: 2.2,
  steer: 2.1,
  handbrakeSteer: 3.6,
  handbrakeDrag: 3.4,
  dirt: { accel: 0.62, maxSpeed: 0.62, grip: 0.7 },
  radius: 1.15,
  health: 100,
  ramDamage: 16,
  crashDamage: 22,
  crashSpeed: 9,
  smokeBelow: 34,
  step: 1 / 60,
};

/** Expansion rides share the arcade model with their own power, grip and dimensions. */
export const VEHICLE_TYPES = {
  bike: { ...VEHICLE, maxSpeed: 27, accel: 20, brake: 29, reverseAccel: 4, maxReverse: 4, steer: 2.9, radius: 0.56 },
  truck: { ...VEHICLE, maxSpeed: 24, accel: 9, brake: 18, reverseAccel: 5, maxReverse: 6, steer: 1.5, radius: 1.4 },
  buggy: { ...VEHICLE, maxSpeed: 30, accel: 14, brake: 24, reverseAccel: 8, maxReverse: 8, steer: 2.6, radius: 1.24 },
  sport: { ...VEHICLE, maxSpeed: 40, accel: 19, brake: 32, reverseAccel: 10, maxReverse: 10, steer: 2.3, radius: 1.24 },
  van: { ...VEHICLE, maxSpeed: 26.5, accel: 11, brake: 22, reverseAccel: 7, maxReverse: 7, steer: 1.9, radius: 1.25 },
};

export const TRAFFIC = {
  cars: 12,
  pedestrians: 18,
  spawnRadius: 190,
  despawnRadius: 260,
  carSpeedMin: 9,
  carSpeedMax: 14,
  pedSpeedMin: 1.15,
  pedSpeedMax: 1.65,
  laneOffset: 4.4,
};

export const POLICE = {
  maxWanted: 5,
  steal: 2,
  pedHit: 1,
  gunNearCop: 1,
  copHit: 2,
  sight: 95,
  hear: 40,
  decayDelay: 9,
  decayEvery: 3.1,
  arrestRange: 2.5,
  arrestTime: 1.15,
  footCopSpeed: 6.2,
  copCarSpeed: 27,
  copCarAccel: 17,
  shots: 0,
  fine: 350,
};

/** Cash and mission rewards. Jax starts almost broke, which is the point of the story. */
export const MISSIONS = {
  startCash: 250,
  rewards: {
    'first-fare': 500,
    'hot-wheels': 750,
    'beach-run': 1200,
    heat: 1500,
    'harbor-job': 3000,
  },
  order: ['first-fare', 'hot-wheels', 'beach-run', 'heat', 'harbor-job'],
  failTime: 180,
  beachRunTime: 75,
  pickupRadius: 7.5,
  checkpointRadius: 9,
  markerRadius: 3.4,
};

/** Fictional turf owners and non-overlapping districts across the city grid. */
export const GANGS = {
  factions: [
    { id: 'vipers', name: 'Crimson Vipers', color: '#e5484d', hex: 0xe5484d },
    { id: 'kings', name: 'Harbor Kings', color: '#3f8cff', hex: 0x3f8cff },
    { id: 'jackals', name: 'Neon Jackals', color: '#ffb020', hex: 0xffb020 },
  ],
  districts: [
    { id: 'alta-vieja', name: 'Alta Vieja', rect: { minX: -360, maxX: 360, minZ: -360, maxZ: -120 } },
    { id: 'cobre', name: 'Cobre Ward', rect: { minX: -360, maxX: -120, minZ: -120, maxZ: 120 } },
    { id: 'luma', name: 'Luma Centro', rect: { minX: -120, maxX: 120, minZ: -120, maxZ: 240 } },
    { id: 'prisma', name: 'Prisma Heights', rect: { minX: 120, maxX: 360, minZ: -120, maxZ: 120 } },
    { id: 'brisa', name: 'Brisa Harbor', rect: { minX: -360, maxX: -120, minZ: 120, maxZ: 360 } },
    { id: 'coral', name: 'Coral Strand', rect: { minX: -120, maxX: 120, minZ: 240, maxZ: 360 } },
    { id: 'luz-marina', name: 'Luz Marina', rect: { minX: 120, maxX: 360, minZ: 120, maxZ: 360 } },
  ],
  progressPerKill: 34,
  captureReward: 400,
  incomePerDistrict: 25,
  incomeEverySeconds: 60,
  membersPerDistrict: 2,
  respawnSeconds: 25,
  progressDecayDelaySeconds: 20,
  progressDecayPerSecond: 2,
  playerColor: '#49c6b8',
  playerName: 'You',
  neutralColor: '#8a94a0',
  neutralName: 'Neutral',
};

export const COMBAT = {
  pistolAmmo: 24,
  maxAmmo: 60,
  pistolDamage: 45,
  pistolRange: 70,
  fireCooldown: 0.24,
  enemyHealth: 60,
  enemySpeed: 3.4,
  enemyFireRate: 1.5,
  enemyDamage: 7,
  muzzleTime: 0.07,
  enemyRadius: 0.55,
};

export const AUDIO = {
  master: 0.5,
  music: 0.13,
  engine: 0.1,
  siren: 0.08,
};

/** CSS colours for the DOM HUD and minimap, and three.js colours for the world. */
export const PALETTE = {
  css: {
    ink: '#f7efe3',
    muted: '#b6aa9a',
    gold: '#ffc857',
    coral: '#ff6b57',
    teal: '#49c6b8',
    deep: '#131a24',
    panel: 'rgba(16, 22, 30, 0.86)',
    sand: '#e9d3a7',
  },
  sky: 0xf0bd8c,
  skyTop: 0x8fa9bd,
  fog: 0xe3bea0,
  sun: 0xffe6bd,
  hemiSky: 0xbfd4e6,
  hemiGround: 0x8a6f56,
  ocean: 0x2d7f95,
  oceanDeep: 0x1e5d76,
  foam: 0xf7f1e2,
  sand: 0xe4cf9f,
  boardwalk: 0xa9865e,
  asphalt: 0x373b42,
  sidewalk: 0x9c978d,
  curb: 0xbab5aa,
  grass: 0x6d8a57,
  trunk: 0x7a5a3b,
  leaf: 0x3f7a4e,
  leafLight: 0x5b9663,
  lamp: 0xffe3a8,
  metal: 0x8e949b,
  roof: 0x6f6a63,
  buildings: [0xc9634a, 0x5eaaa5, 0xe3b759, 0x557aaf, 0xd87972, 0xe7d49e, 0x76a879, 0xe28a53, 0x9c83ae, 0x73a4c7],
  accents: [0x24696d, 0x8c3f39, 0x354d78, 0x80602d],
  player: { jacket: 0xb84c3d, jeans: 0x34425a, skin: 0xc58d68, hair: 0x2a211c, accent: 0xffc857 },
  cars: [
    { body: 0xb73f3c, cabin: 0x2b2f36, name: 'Solara GT' },
    { body: 0x2f7f75, cabin: 0x223037, name: 'Tide coupe' },
    { body: 0xd2b24c, cabin: 0x2c2a24, name: 'Sun taxi' },
    { body: 0x4c6f9e, cabin: 0x222833, name: 'Marina sedan' },
    { body: 0xe0e0d8, cabin: 0x30343a, name: 'Pier van' },
    { body: 0x7a4f8e, cabin: 0x27222c, name: 'Neon hatch' },
    { body: 0x3c6b44, cabin: 0x232a23, name: 'Reef pickup' },
    { body: 0xc46a35, cabin: 0x2c2520, name: 'Dune muscle' },
  ],
  police: { body: 0x1d2a43, cabin: 0x161d2a, stripe: 0xf2f1e8, light: 0x3fa7ff, lightAlt: 0xff5a4d },
  npc: { shirt: [0x4f7fa8, 0x9e5a52, 0x5f8a63, 0xb59a55, 0x7a6a9e], skin: [0xc58d68, 0x9a6242, 0xe0b08a, 0x74503a] },
};

export const SAVE_KEY = 'solmar.save.v3';
export const SAVE_VERSION = 3;
export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** The title vista and the spawn point. */
export const TITLE_CAMERA = { x: -310, y: 210, z: 720, lookX: 0, lookY: 26, lookZ: 0 };
export const SPAWN = { x: -1.2, z: 216, heading: 0 };
export const STARTER_CAR = { x: 4.6, z: 220, heading: 0 };


/** Story-gated city bands, ordered from the coast northward. */
export const REGIONS = {
  list: [
    { id: 'south-shore', name: 'South Shore', minZ: 180, maxZ: Infinity, required: 0 },
    { id: 'downtown', name: 'Downtown', minZ: -60, maxZ: 180, required: 1 },
    { id: 'northside', name: 'Northside', minZ: -240, maxZ: -60, required: 2 },
    { id: 'north-hills', name: 'North Hills', minZ: -Infinity, maxZ: -240, required: 3 },
  ],
  pushMargin: 4,
  repeatWindow: 6,
  wantedCooldown: 12,
  warningCooldown: 3,
  warningDuration: 4,
  barrierHeight: 12,
  barrierColor: 0xff6b57,
  barrierOpacity: 0.22,
  mapLocked: 'rgba(255, 107, 87, 0.25)',
  mapOpen: 'rgba(73, 198, 184, 0.32)',
  mapLineWidth: 8,
  // The original introduction was north of the first gate. Use the hotel's south approach.
  firstPickup: { x: 80, z: 216, name: 'Hotel Azure south approach' },
};


/** Street reputation: thresholds, point awards and persistence cap. */
export const REP = {
  maxPoints: 100000,
  mission: 120,
  theft: 25,
  pedHit: 15,
  punchNearCop: 10,
  fireNearCop: 10,
  wantedStar: 10,
  lostTail: 40,
  tailWanted: 3,
  ranks: [
    { name: 'Small Fry', points: 0 },
    { name: 'Corner Runner', points: 150 },
    { name: 'Street Hustler', points: 400 },
    { name: 'Wheelman', points: 800 },
    { name: 'Harbor Boss', points: 1500 },
    { name: 'Solmar Legend', points: 2500 },
  ],
};
