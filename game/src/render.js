import * as THREE from '../vendor/three.module.min.js';
import { CAMERA, PALETTE } from './config.js';

// Find the first solid along the camera's path, including its near plane.
export function cameraClearance(from, to, obstacles) {
  const padding = 0.3;
  let clearance = 1;
  for (const bounds of obstacles) {
    let enter = 0, exit = clearance, startingInside = true;
    for (const [axis, min, max] of [
      ['x', bounds.minX, bounds.maxX], ['y', bounds.minY ?? -1, bounds.maxY ?? 100], ['z', bounds.minZ, bounds.maxZ]
    ]) {
      const start = from[axis], delta = to[axis] - start;
      const low = min - padding, high = max + padding;
      if (start < low || start > high) startingInside = false;
      if (Math.abs(delta) < 1e-6) {
        if (start < low || start > high) { enter = 1; exit = 0; break; }
      } else {
        const a = (low - start) / delta, b = (high - start) / delta;
        enter = Math.max(enter, Math.min(a, b));
        exit = Math.min(exit, Math.max(a, b));
        if (enter > exit) break;
      }
    }
    if (enter <= exit) {
      if (startingInside && exit < 1) continue;
      clearance = Math.min(clearance, Math.max(0, enter - 0.005));
    }
  }
  return clearance;
}

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.96;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(PALETTE.fog, 230, 1450);
  const camera = new THREE.PerspectiveCamera(58, 16 / 9, 0.15, 2400);
  const ambient = new THREE.HemisphereLight(0xcbeeff, 0xa19373, 1.65);
  scene.add(ambient);
  const sunlight = new THREE.DirectionalLight(0xffe0a7, 2.65);
  sunlight.position.set(-160, 240, 120);
  sunlight.castShadow = true;
  sunlight.shadow.mapSize.set(2048, 2048);
  Object.assign(sunlight.shadow.camera, { left: -125, right: 125, top: 125, bottom: -125, near: 1, far: 650 });
  sunlight.shadow.bias = -0.0003;
  sunlight.shadow.normalBias = 0.08;
  scene.add(sunlight, sunlight.target);
  const sky = new THREE.Group();
  const domeGeometry = new THREE.SphereGeometry(2150, 40, 32);
  const domePositions = domeGeometry.attributes.position;
  const domeColors = new THREE.BufferAttribute(new Float32Array(domePositions.count * 3), 3).setUsage(THREE.DynamicDrawUsage);
  domeGeometry.setAttribute('color', domeColors);
  const dome = new THREE.Mesh(domeGeometry, new THREE.MeshBasicMaterial({ side: THREE.BackSide, vertexColors: true, fog: false, toneMapped: false, depthWrite: false }));
  dome.renderOrder = -2;
  sky.add(dome);
  function celestialBody(radius, color) {
    const body = new THREE.Mesh(new THREE.SphereGeometry(radius, 24, 16), new THREE.MeshBasicMaterial({ color, fog: false, toneMapped: false }));
    sky.add(body);
    return body;
  }
  const sun = celestialBody(31, 0xffe1a6), moon = celestialBody(26, 0xd4dff1);
  scene.add(sky);
  const target = new THREE.Vector3(), desired = new THREE.Vector3(), gaze = new THREE.Vector3(), candidate = new THREE.Vector3();
  const lightDirection = new THREE.Vector3(), sunDirection = new THREE.Vector3();
  const skyTop = new THREE.Color(), skyHorizon = new THREE.Color(), tint = new THREE.Color(), gradient = new THREE.Color();
  const sCurve = THREE.MathUtils.smoothstep;
  let initialized = false, obstacles = [], previousHour = -1, night = 0;

  function setTimeOfDay(hour) {
    if (Math.abs(hour - previousHour) < 0.016) return night;
    previousHour = hour;
    const orbit = (hour - 6) * Math.PI / 12;
    const altitude = Math.sin(orbit), east = Math.cos(orbit);
    const day = sCurve(altitude, -0.13, 0.38);
    const twilight = 1 - sCurve(Math.abs(altitude), 0.02, 0.45);
    night = 1 - sCurve(altitude, -0.42, -0.02);
    skyTop.setHex(0x141d40).lerp(tint.setHex(0x6bb8db), day);
    skyHorizon.setHex(0x41416a).lerp(tint.setHex(0xcbe4db), day).lerp(tint.setHex(0xf39a74), twilight * 0.76);
    for (let i = 0; i < domePositions.count; i++) {
      const height = domePositions.getY(i) / 2150;
      gradient.copy(skyHorizon).lerp(skyTop, sCurve(height, -0.08, 0.54));
      domeColors.setXYZ(i, gradient.r, gradient.g, gradient.b);
    }
    domeColors.needsUpdate = true;
    scene.fog.color.copy(skyHorizon).lerp(tint.setHex(0x192a53), night * 0.48);
    scene.fog.near = 135 + day * 95;
    scene.fog.far = 925 + day * 525;
    ambient.color.setHex(0x9caee9).lerp(tint.setHex(0xd5eeff), day);
    ambient.groundColor.setHex(0x8f82a2).lerp(tint.setHex(0xa19373), day);
    ambient.intensity = 0.78 + day * 0.76;
    sunlight.color.setHex(altitude < -0.04 ? 0xa7c5ff : 0xffb272).lerp(tint.setHex(0xffe6ba), day);
    sunlight.intensity = 0.27 + day * 2.1;
    sunlight.castShadow = day > 0.12;
    sunDirection.set(-east * 0.42, altitude * 0.72, east * 0.91).normalize();
    sun.position.copy(sunDirection).multiplyScalar(1750);
    moon.position.copy(sunDirection).multiplyScalar(-1770);
    sun.visible = altitude > -0.06;
    moon.visible = altitude < 0.04;
    const side = altitude < -0.04 ? -1 : 1;
    lightDirection.set(sunDirection.x * side, Math.max(0.2, sunDirection.y * side), sunDirection.z * side).normalize();
    return night;
  }

  function aimLight(x, z) {
    sunlight.target.position.set(x, 0, z);
    sunlight.position.copy(sunlight.target.position).addScaledVector(lightDirection, 290);
    sunlight.target.updateMatrixWorld();
  }
  function setObstacles(bounds) { obstacles = bounds; }
  function resize() {
    const width = canvas.clientWidth || window.innerWidth, height = canvas.clientHeight || window.innerHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(1, height); camera.updateProjectionMatrix();
  }
  function frame(player, dt = 1 / 60, options = {}) {
    const state = player.state || player;
    const car = state.car;
    const subject = car || state;
    const yaw = options.yaw ?? subject.heading ?? 0;
    const classic = options.mode === 'classic';
    const distance = Math.max(CAMERA.minDistance, Math.min(CAMERA.maxDistance, options.distance ?? (car ? CAMERA.carDistance : CAMERA.distance)));
    const followDistance = distance * (classic ? 0.82 : 1);
    const pitch = options.pitch ?? 0.34;
    const elevation = car ? 1.25 : 1.45;
    target.set(subject.x, (state.y || 0) + elevation, subject.z);
    const lift = classic ? 7.5 + distance * (0.6 + Math.sin(pitch) * 0.6) : 2.3 + Math.sin(pitch) * distance * 0.65;
    desired.set(target.x - Math.sin(yaw) * followDistance, target.y + lift, target.z - Math.cos(yaw) * followDistance);
    const ease = options.snap || !initialized ? 1 : 1 - Math.exp(-dt * 7.5);
    candidate.copy(camera.position).lerp(desired, ease);
    const clear = cameraClearance(target, candidate, obstacles);
    const followAhead = (car ? (classic ? 2.5 : 4) : 1.1) * (0.35 + 0.65 * clear);
    camera.position.copy(target).lerp(candidate, clear);
    if (camera.position.distanceToSquared(target) < 0.8) {
      // Near a wall, look down from the subject's side instead of crossing it.
      candidate.copy(target); candidate.y += Math.min(lift, 4.8);
      camera.position.copy(target).lerp(candidate, cameraClearance(target, candidate, obstacles));
    }
    gaze.set(target.x + Math.sin(yaw) * followAhead, target.y + 0.12, target.z + Math.cos(yaw) * followAhead);
    camera.lookAt(gaze);
    aimLight(subject.x, subject.z);
    initialized = true;
  }
  function frameTitle(time = 0) {
    const view = CAMERA.title;
    const drift = Math.sin(time * 0.05) * 12;
    camera.position.set(view.x + drift, view.y, view.z);
    camera.lookAt(view.lookX, view.lookY, view.lookZ);
    aimLight(0, 40);
    initialized = false;
  }
  function render() { sky.position.copy(camera.position); renderer.render(scene, camera); }
  function dispose() {
    window.removeEventListener('resize', resize);
    const geometries = new Set(), materials = new Set(), textures = new Set();
    scene.traverse(object => {
      if (object.geometry) geometries.add(object.geometry);
      if (object.material) for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        materials.add(material);
        for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
      }
    });
    for (const texture of textures) texture.dispose();
    for (const material of materials) material.dispose();
    for (const geometry of geometries) geometry.dispose();
    renderer.dispose();
  }
  window.addEventListener('resize', resize); resize(); setTimeOfDay(16.8); frameTitle();
  return { scene, camera, renderer, resize, frame, frameTitle, render, dispose, setTimeOfDay, setObstacles };
}
