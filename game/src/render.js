// three.js rendering: the scene, warm coastal light, sky and fog, a follow camera for foot and
// car, plus resize handling. Shadows are one directional light with a tight box that moves with
// the player instead of covering the whole city, which keeps the polygon and draw cost modest.
import * as THREE from '../vendor/three.module.js';
import { CAMERA, PALETTE, TITLE_CAMERA } from './config.js';

export function createRenderer(canvas) {
  const viewport = () => ({
    width: Number.isFinite(window.innerWidth) && window.innerWidth > 0 ? window.innerWidth : 1280,
    height: Number.isFinite(window.innerHeight) && window.innerHeight > 0 ? window.innerHeight : 720,
  });
  const initialSize = viewport();
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  } catch {
    renderer = null;
  }
  if (renderer) {
    renderer.setPixelRatio(Math.min(Number.isFinite(window.devicePixelRatio) ? window.devicePixelRatio : 1, 1.75));
    renderer.setSize(initialSize.width, initialSize.height, false);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
  }

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(PALETTE.fog, 140, 620);

  const camera = new THREE.PerspectiveCamera(58, initialSize.width / initialSize.height, 0.1, 1800);
  camera.position.set(0, 8, 14);

  const hemi = new THREE.HemisphereLight(PALETTE.hemiSky, PALETTE.hemiGround, 0.72);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(PALETTE.sun, 2.1);
  sun.position.set(-140, 170, 90);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 20;
  sun.shadow.camera.far = 420;
  sun.shadow.camera.left = -95;
  sun.shadow.camera.right = 95;
  sun.shadow.camera.top = 95;
  sun.shadow.camera.bottom = -95;
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);
  scene.add(sun.target);

  const skyGeometry = new THREE.SphereGeometry(1500, 20, 12);
  const skyMaterial = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(PALETTE.skyTop) },
      bottom: { value: new THREE.Color(PALETTE.sky) },
      sunColor: { value: new THREE.Color(0xffd9a0) },
    },
    vertexShader: 'varying vec3 vWorld; void main(){ vWorld = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform vec3 top;
      uniform vec3 bottom;
      uniform vec3 sunColor;
      varying vec3 vWorld;
      #include <tonemapping_pars_fragment>
      #include <colorspace_pars_fragment>
      void main() {
        float h = clamp(vWorld.y * 1.15 + 0.18, 0.0, 1.0);
        vec3 color = mix(bottom, top, pow(h, 0.8));
        float glow = pow(max(dot(normalize(vWorld), normalize(vec3(-0.55, 0.25, 0.8))), 0.0), 6.0);
        color += sunColor * glow * 0.4;
        gl_FragColor = vec4(color, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const skyDome = new THREE.Mesh(skyGeometry, skyMaterial);
  scene.add(skyDome);

  const cameraState = {
    yaw: 0,
    pitch: CAMERA.pitch,
    distance: CAMERA.distance,
    target: new THREE.Vector3(),
    pos: new THREE.Vector3(0, 6, 12),
    mode: 'foot',
  };
  let snapCamera = true;
  let hasPreviousFocus = false;
  const previousFocus = new THREE.Vector3();

  function resize() {
    const { width, height } = viewport();
    if (renderer) {
      renderer.setPixelRatio(Math.min(Number.isFinite(window.devicePixelRatio) ? window.devicePixelRatio : 1, 1.75));
      renderer.setSize(width, height, false);
    }
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);

  /**
   * Follow the player or their car. `orbit` is the player's mouse-orbit state ({yaw, pitch});
   * `cameraYaw` is the direction the minimap uses. The camera's own state is smoothed.
   */
  function updateCamera(dt, player, orbit, shake) {
    const state = player?.state ?? {};
    const inCar = state.inCar;
    const focus = inCar ? inCar.state : player.state;
    const height = inCar ? CAMERA.carHeight : CAMERA.height;
    const requestedDistance = inCar ? CAMERA.carDistance : orbit?.distance ?? CAMERA.distance;
    const distance = THREE.MathUtils.clamp(
      Number.isFinite(requestedDistance) ? requestedDistance : CAMERA.distance,
      CAMERA.minDistance,
      CAMERA.maxDistance,
    );
    const requestedYaw = Number.isFinite(orbit?.yaw) ? orbit.yaw : 0;
    const requestedPitch = Number.isFinite(orbit?.pitch) ? orbit.pitch : CAMERA.pitch;
    const yaw = requestedYaw;
    const pitch = THREE.MathUtils.clamp(requestedPitch, CAMERA.minPitch, CAMERA.maxPitch);
    const focusY = (inCar ? 1.4 : 1.5) + (inCar ? 0 : Number.isFinite(state.y) ? state.y : 0);
    cameraState.target.set(focus.x, focusY + 0.9, focus.z);
    const horizontal = Math.cos(pitch) * distance;
    const desiredX = focus.x - Math.sin(yaw) * horizontal;
    const desiredZ = focus.z - Math.cos(yaw) * horizontal;
    const desiredY = focusY + height + Math.sin(pitch) * distance * 0.55;
    const elapsed = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    const lerp = 1 - Math.exp(-elapsed * CAMERA.follow);
    const teleported = hasPreviousFocus && Math.hypot(focus.x - previousFocus.x, focus.z - previousFocus.z) > 80;
    if (snapCamera || teleported) {
      cameraState.pos.set(desiredX, desiredY, desiredZ);
      snapCamera = false;
    } else {
      cameraState.pos.x += (desiredX - cameraState.pos.x) * lerp;
      cameraState.pos.y += (desiredY - cameraState.pos.y) * lerp;
      cameraState.pos.z += (desiredZ - cameraState.pos.z) * lerp;
    }
    previousFocus.set(focus.x, focusY, focus.z);
    hasPreviousFocus = true;
    if (shake > 0) {
      camera.position.copy(cameraState.pos);
      camera.position.x += (Math.random() - 0.5) * shake * 0.18;
      camera.position.y += (Math.random() - 0.5) * shake * 0.18;
    } else {
      camera.position.copy(cameraState.pos);
    }
    camera.lookAt(cameraState.target);
    cameraState.yaw = yaw;
    cameraState.pitch = pitch;
    cameraState.distance = distance;
    cameraState.mode = inCar ? 'car' : 'foot';
    skyDome.position.copy(camera.position);
    const shadowX = Math.round(focus.x / 90) * 90;
    const shadowZ = Math.round(focus.z / 90) * 90;
    sun.position.set(shadowX - 110, 160, shadowZ + 95);
    sun.target.position.set(shadowX, 0, shadowZ);
    sun.target.updateMatrixWorld();
  }

  function frameTitle() {
    camera.position.set(TITLE_CAMERA.x, TITLE_CAMERA.y, TITLE_CAMERA.z);
    camera.lookAt(TITLE_CAMERA.lookX, TITLE_CAMERA.lookY, TITLE_CAMERA.lookZ);
    cameraState.pos.copy(camera.position);
    cameraState.target.set(TITLE_CAMERA.lookX, TITLE_CAMERA.lookY, TITLE_CAMERA.lookZ);
    const dx = TITLE_CAMERA.lookX - TITLE_CAMERA.x;
    const dy = TITLE_CAMERA.lookY - TITLE_CAMERA.y;
    const dz = TITLE_CAMERA.lookZ - TITLE_CAMERA.z;
    cameraState.distance = Math.hypot(dx, dy, dz);
    cameraState.yaw = Math.atan2(-dx, -dz);
    cameraState.pitch = Math.asin(dy / cameraState.distance);
    skyDome.position.copy(camera.position);
    snapCamera = true;
    hasPreviousFocus = false;
  }

  function render() {
    if (renderer) renderer.render(scene, camera);
  }

  function dispose() {
    window.removeEventListener('resize', resize);
    scene.remove(skyDome, sun, sun.target, hemi);
    skyGeometry.dispose();
    skyMaterial.dispose();
    if (renderer) renderer.dispose();
  }

  return {
    scene,
    camera,
    cameraState,
    sun,
    hemi,
    resize,
    updateCamera,
    frameTitle,
    render,
    dispose,
    get renderer() {
      return renderer;
    },
  };
}
