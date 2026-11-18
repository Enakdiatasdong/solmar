import * as THREE from '../vendor/three.module.min.js';
import { CAMERA, PALETTE } from './config.js';

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(PALETTE.sky); scene.fog = new THREE.Fog(0xa6d4d4, 210, 1100);
  const camera = new THREE.PerspectiveCamera(56, 16 / 9, 0.1, 4200);
  const state = { yaw: 0, pitch: 0.36, zoom: 8 };
  scene.add(new THREE.HemisphereLight(0xffedcd, 0x55858c, 2.2));
  const sun = new THREE.DirectionalLight(0xffe1a2, 2.9); sun.position.set(-180, 320, 180);
  sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); sun.shadow.camera.left = -95; sun.shadow.camera.right = 95;
  sun.shadow.camera.top = 95; sun.shadow.camera.bottom = -95; sun.shadow.camera.near = 1; sun.shadow.camera.far = 700;
  sun.shadow.normalBias = 0.06; sun.shadow.bias = -0.0002; scene.add(sun); scene.add(sun.target);
  // Three supplies colour and tone-mapping pars to ShaderMaterial itself.
  const sky = new THREE.Mesh(new THREE.SphereGeometry(2700, 24, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { upper: { value: new THREE.Color(0x65badb) }, horizon: { value: new THREE.Color(0xffe1b0) } },
    vertexShader: 'varying vec3 skyPosition; void main(){skyPosition=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: 'uniform vec3 upper;uniform vec3 horizon;varying vec3 skyPosition;void main(){float t=clamp(normalize(skyPosition).y*2.1,0.0,1.0);gl_FragColor=vec4(mix(horizon,upper,pow(t,0.58)),1.0);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}'
  }));
  sky.frustumCulled = false; scene.add(sky);
  const disc = new THREE.Mesh(new THREE.SphereGeometry(50, 24, 16), new THREE.MeshBasicMaterial({ color: 0xffe3a1, fog: false }));
  disc.position.set(-930, 620, 1700); scene.add(disc);
  const desired = new THREE.Vector3(), look = new THREE.Vector3();
  let following = false;
  function resize() {
    const width = canvas.clientWidth || globalThis.innerWidth || 1280, height = canvas.clientHeight || globalThis.innerHeight || 720;
    renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix();
  }
  globalThis.addEventListener?.('resize', resize); resize();
  function frameTitle(time = 0) {
    const drift = Math.sin(time * 0.055) * 15;
    camera.position.set(CAMERA.title.x + drift, CAMERA.title.y, CAMERA.title.z);
    camera.lookAt(-5, CAMERA.title.lookY, 115); following = false;
  }
  function follow(target, dt = 1 / 60, pointer = {}) {
    state.yaw -= (pointer.dx || 0) * 0.005;
    state.pitch = THREE.MathUtils.clamp(state.pitch + (pointer.dy || 0) * 0.0035, 0.14, 1.12);
    state.zoom = THREE.MathUtils.clamp(state.zoom + (pointer.wheel || 0) * 0.008, CAMERA.minZoom, CAMERA.maxZoom);
    const car = target.inCar;
    if (car && !pointer.dx) {
      const difference = Math.atan2(Math.sin(car.heading - state.yaw), Math.cos(car.heading - state.yaw));
      state.yaw += difference * (1 - Math.exp(-dt * 1.4));
    }
    const distance = state.zoom + (car ? 4.3 + Math.min(2.2, Math.abs(car.speed || 0) * 0.055) : 0);
    const height = car ? 1.2 : 1.65;
    look.set(target.x, (target.y || 0) + height, target.z);
    desired.set(look.x - Math.sin(state.yaw) * Math.cos(state.pitch) * distance, look.y + Math.sin(state.pitch) * distance + (car ? 1.3 : 0), look.z - Math.cos(state.yaw) * Math.cos(state.pitch) * distance);
    if (!following || dt >= 1) camera.position.copy(desired); else camera.position.lerp(desired, 1 - Math.exp(-dt * 9));
    camera.lookAt(look); following = true;
    sun.target.position.set(target.x, 0, target.z); sun.position.set(target.x - 180, 320, target.z + 180);
  }
  function render() { renderer.render(scene, camera); }
  frameTitle();
  return { scene, camera, renderer, state, frameTitle, follow, render, resize };
}
