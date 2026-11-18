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
  cars: 24,
  pedestrians: 36,
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

const PISTOL = {
  id: 'pistol', name: 'Pistol', ammo: 24, maxAmmo: 60,
  damage: 45, range: 70, fireCooldown: 0.24, shopAmount: 12, shopCost: 20,

};

export const COMBAT = {
  pistolAmmo: PISTOL.ammo,
  maxAmmo: PISTOL.maxAmmo,
  pistolDamage: PISTOL.damage,
  pistolRange: PISTOL.range,
  fireCooldown: PISTOL.fireCooldown,
  weapons: [
    PISTOL,
    {
      id: 'scattergun', name: 'Scattergun', ammo: 6, maxAmmo: 24,
      damage: 80, range: 23, fireCooldown: 0.78, spread: 0.12,
      shopAmount: 6, shopCost: 45,
    },
    {
      id: 'street-smg', name: 'Street SMG', ammo: 32, maxAmmo: 96,
      damage: 20, range: 55, fireCooldown: 0.095, shopAmount: 24, shopCost: 55,
    },
    {
      id: 'longshot', name: 'Longshot rifle', ammo: 5, maxAmmo: 20,
      damage: 105, range: 115, fireCooldown: 1.05, shopAmount: 5, shopCost: 70,
    },
    {
      id: 'fire-bottle', name: 'Fire bottle', ammo: 2, maxAmmo: 6,
      damage: 60, range: 24, fireCooldown: 1.2, blastRadius: 4.5,
      shopAmount: 2, shopCost: 60,
    },
  ],
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
  sky: 0xf6ac7d,
  skyRose: 0xd68a9f,
  skyTop: 0x655475,
  fog: 0xdba08d,
  sun: 0xffce91,
  hemiSky: 0xbda0be,
  hemiGround: 0x906553,
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

/** Clock-driven atmosphere. At 18:52 the original sunset offset and light levels are exact. */
export const SUNSET_MINUTE = 18 * 60 + 52;
export const SUNSET_OFFSET = [-72, 56, 210];
export const SUNSET_NIGHT_FACTOR = 0.6;
export const DAYNIGHT = [
  {
    minute: 0, azimuth: 20, elevation: -52,
    sun: 0xffb38a, sunIntensity: 0, sunDisc: 0,
    sky: 0x101b38, skyRose: 0x242b50, skyTop: 0x080f28, fog: 0x151d34, fogDensity: 1 / 860,
    hemiSky: 0x98a9ce, hemiGround: 0x6b627d, hemiIntensity: 0.44, nightFactor: 1, headlights: 1,
  },
  {
    minute: 300, azimuth: 65, elevation: -11,
    sun: 0xffb38a, sunIntensity: 0, sunDisc: 0,
    sky: 0x323659, skyRose: 0x77546e, skyTop: 0x232d50, fog: 0x393957, fogDensity: 1 / 900,
    hemiSky: 0x98a3c1, hemiGround: 0x6b627d, hemiIntensity: 0.46, nightFactor: 0.94, headlights: 1,
  },
  {
    minute: 330, azimuth: 76, elevation: 0,
    sun: 0xffb18c, sunIntensity: 0.22, sunDisc: 0.52,
    sky: 0xeca477, skyRose: 0xd78ba0, skyTop: 0x625573, fog: 0xd59a88, fogDensity: 1 / 980,
    hemiSky: 0xa77c93, hemiGround: 0x745b55, hemiIntensity: 0.5, nightFactor: 0.5, headlights: 0.25,
  },
  {
    minute: 420, azimuth: 92, elevation: 15,
    sun: 0xffe0bd, sunIntensity: 1.1, sunDisc: 0.85,
    sky: 0x9dc6dd, skyRose: 0xe3b5a5, skyTop: 0x537b9d, fog: 0xa8c6cf, fogDensity: 1 / 1250,
    hemiSky: 0x94bad6, hemiGround: 0x6d665d, hemiIntensity: 0.65, nightFactor: 0, headlights: 0,
  },
  {
    minute: 600, azimuth: 112, elevation: 43,
    sun: 0xfff3d9, sunIntensity: 1.85, sunDisc: 0.9,
    sky: 0x91c7e8, skyRose: 0xd4d6dd, skyTop: 0x367cae, fog: 0xaccbd7, fogDensity: 1 / 1550,
    hemiSky: 0x98c7e9, hemiGround: 0x7e7868, hemiIntensity: 0.76, nightFactor: 0, headlights: 0,
  },
  {
    minute: 780, azimuth: 170, elevation: 65,
    sun: 0xfff9e9, sunIntensity: 2, sunDisc: 0.9,
    sky: 0x87c6ee, skyRose: 0xc9dced, skyTop: 0x2671aa, fog: 0xb8d5dc, fogDensity: 1 / 1650,
    hemiSky: 0xa4d0ee, hemiGround: 0x89806a, hemiIntensity: 0.8, nightFactor: 0, headlights: 0,
  },
  {
    minute: 960, azimuth: 248, elevation: 36,
    sun: 0xffedc8, sunIntensity: 1.75, sunDisc: 0.85,
    sky: 0x9dc5df, skyRose: 0xe6c0ad, skyTop: 0x527699, fog: 0xc1c6c2, fogDensity: 1 / 1450,
    hemiSky: 0x96b9d4, hemiGround: 0x827161, hemiIntensity: 0.7, nightFactor: 0, headlights: 0,
  },
  {
    minute: 1080, azimuth: 328, elevation: 22,
    sun: 0xffd49d, sunIntensity: 2.15, sunDisc: 0.95,
    sky: 0xedaf84, skyRose: 0xd58d9f, skyTop: 0x6b587c, fog: 0xdeb19a, fogDensity: 1 / 1110,
    hemiSky: 0xbda4bc, hemiGround: 0x906553, hemiIntensity: 0.64, nightFactor: 0.36, headlights: 0,
  },
  {
    minute: SUNSET_MINUTE,
    azimuth: 360 + Math.atan2(SUNSET_OFFSET[0], SUNSET_OFFSET[2]) * 180 / Math.PI,
    elevation: Math.atan2(SUNSET_OFFSET[1], Math.hypot(SUNSET_OFFSET[0], SUNSET_OFFSET[2])) * 180 / Math.PI,
    sun: PALETTE.sun, sunIntensity: 2.25, sunDisc: 1,
    sky: PALETTE.sky, skyRose: PALETTE.skyRose, skyTop: PALETTE.skyTop, fog: PALETTE.fog, fogDensity: 1 / 1050,
    hemiSky: PALETTE.hemiSky, hemiGround: PALETTE.hemiGround, hemiIntensity: 0.64, nightFactor: SUNSET_NIGHT_FACTOR, headlights: 0,
  },
  {
    minute: 1155, azimuth: 347, elevation: 5,
    sun: 0xffa385, sunIntensity: 0.7, sunDisc: 0.55,
    sky: 0xbb7491, skyRose: 0x9b648c, skyTop: 0x483b66, fog: 0x965f7e, fogDensity: 1 / 960,
    hemiSky: 0x9581a6, hemiGround: 0x695162, hemiIntensity: 0.5, nightFactor: 0.82, headlights: 0.5,
  },
  {
    minute: 1230, azimuth: 354, elevation: -11,
    sun: 0xffb38a, sunIntensity: 0, sunDisc: 0,
    sky: 0x382c50, skyRose: 0x695072, skyTop: 0x24244a, fog: 0x3b3354, fogDensity: 1 / 900,
    hemiSky: 0x98a5c6, hemiGround: 0x715d74, hemiIntensity: 0.45, nightFactor: 1, headlights: 1,
  },
  {
    minute: 1260, azimuth: 359, elevation: -20,
    sun: 0xffb38a, sunIntensity: 0, sunDisc: 0,
    sky: 0x101b38, skyRose: 0x242b50, skyTop: 0x080f28, fog: 0x151d34, fogDensity: 1 / 860,
    hemiSky: 0x98a9ce, hemiGround: 0x6b627d, hemiIntensity: 0.44, nightFactor: 1, headlights: 1,
  },
];

/** Tuning multipliers by difficulty selection. */
export const DIFFICULTY = {
  relaxed: { police: 0.7, wanted: 0.7, enemyDamage: 0.65 },
  normal: { police: 1, wanted: 1, enemyDamage: 1 },
  hardcore: { police: 1.35, wanted: 1.3, enemyDamage: 1.5 },
};

export const SAVE_KEY = 'solmar.save.v3';
export const SAVE_VERSION = 3;
export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** The title vista and the spawn point. */
export const TITLE_CAMERA = { x: 160, y: 42, z: 500, lookX: -150, lookY: 12, lookZ: 820 };
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
