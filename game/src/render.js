import * as THREE from '../vendor/three.module.min.js';
import { CAMERA, PALETTE } from './config.js';

// A warm daylight rig and a camera that remains consistent with minimap axes.
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
  scene.add(new THREE.HemisphereLight(0xcbeeff, 0xa19373, 1.65));
  const sunlight = new THREE.DirectionalLight(0xffe0a7, 2.65);
  sunlight.position.set(-160, 240, 120);
  sunlight.castShadow = true;
  sunlight.shadow.mapSize.set(2048, 2048);
  Object.assign(sunlight.shadow.camera, { left: -125, right: 125, top: 125, bottom: -125, near: 1, far: 650 });
  sunlight.shadow.bias = -0.0003;
  sunlight.shadow.normalBias = 0.08;
  scene.add(sunlight, sunlight.target);
  const sun = new THREE.Mesh(new THREE.SphereGeometry(30, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffe9b2, fog: false }));
  sun.position.set(-1000, 620, 380); scene.add(sun);
  const target = new THREE.Vector3(), desired = new THREE.Vector3(), gaze = new THREE.Vector3();
  let initialized = false;
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
    const distance = Math.max(CAMERA.minDistance, Math.min(CAMERA.maxDistance, options.distance ?? (car ? CAMERA.carDistance : CAMERA.distance)));
    const pitch = options.pitch ?? 0.34;
    const elevation = car ? 1.25 : 1.45;
    target.set(subject.x, (state.y || 0) + elevation, subject.z);
    desired.set(target.x - Math.sin(yaw) * distance, target.y + 2.3 + Math.sin(pitch) * distance * 0.65, target.z - Math.cos(yaw) * distance);
    const ease = options.snap || !initialized ? 1 : 1 - Math.exp(-dt * 7.5);
    camera.position.lerp(desired, ease);
    gaze.copy(target).add(new THREE.Vector3(Math.sin(yaw) * (car ? 4 : 1.1), 0.15, Math.cos(yaw) * (car ? 4 : 1.1)));
    camera.lookAt(gaze);
    sunlight.position.set(subject.x - 160, 240, subject.z + 120);
    sunlight.target.position.set(subject.x, 0, subject.z);
    sunlight.target.updateMatrixWorld();
    initialized = true;
  }
  function frameTitle(time = 0) {
    const view = CAMERA.title;
    const drift = Math.sin(time * 0.05) * 12;
    camera.position.set(view.x + drift, view.y, view.z);
    camera.lookAt(view.lookX, view.lookY, view.lookZ);
    sunlight.position.set(-160, 300, 120); sunlight.target.position.set(0, 0, 40);
    initialized = false;
  }
  function render() { renderer.render(scene, camera); }
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
  window.addEventListener('resize', resize); resize(); frameTitle();
  return { scene, camera, renderer, resize, frame, frameTitle, render, dispose };
}
